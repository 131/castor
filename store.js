'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const http   = require('http');
const os     = require('os');
const path   = require('path');
const url    = require('url');

const get               = require('mout/object/get');
const set               = require('mout/object/set');
const mkdirpSync        = require('nyks/fs/mkdirpSync');
const writeLazySafe = require('nyks/fs/writeLazySafe');
const eachIteratorLimit = require('nyks/async/eachIteratorLimit');
const retryUntil = require('nyks/async/retryUntil');
const sleep      = require('nyks/async/sleep');
const promisify  = require('nyks/function/promisify');
const md5File    = promisify(require('nyks/fs/md5File'));

const createWriteStream  = require('nyks/fs/createWriteStream');
const rename       = require('nyks/fs/rename');
const pipe         = require('nyks/stream/pipe');
const request      = require('nyks/http/request');

const readdir    = require('nyks/fs/readdir');

const debug      = require('debug');
const Index = require('./index');

const packages          = require('./package.json');

const log = {
  debug : debug('splocalstorage:debug'),
  info  : debug('splocalstorage:info'),
  error : debug('splocalstorage:error'),
};

const MD5_EMPTY_FILE = 'd41d8cd98f00b204e9800998ecf8427e';

class Store {

  constructor(index_path) {
    this._index_path   = index_path;
    this._storage_path = path.dirname(this._index_path);
    mkdirpSync(this._storage_path);
    this._init();
  }

  _init() {
    var body = {};
    const version = packages.version;
    if(!fs.existsSync(this._index_path)) {
      this._index = body = {version};
      this.write();
    }

    try {
      body = JSON.parse(fs.readFileSync(this._index_path, 'utf-8'));
    } catch(err) { } //invalid body is not an issue

    this._index = {...body};
  }

  getIndex(ns) {
    this._index[ns] = this._index[ns] || {};
    var index = new Index(this, this._index[ns], ns);
    index.getProp = this.getProp.bind(this, ns);
    index.setProp = this.setProp.bind(this, ns);
    return index;
  }

  getProp(ns, name) {
    return get(this._index, `_props.${ns}.${name}`);
  }

  setProp(ns, name, value) {
    set(this._index, `_props.${ns}.${name}`, value);
    this.write();
  }


  async checkIntegrity(progress = null) {
    let files_size = 0;

    if(progress) {
      // compute file_size for progress only
      for await(const file_path of readdir(this._storage_path)) {
        let {size} = fs.statSync(file_path);
        files_size += size;
      }
    }

    let stats = {
      total_size : 0,
      total_nb : 0,
      valid_nb : 0,
      valid_size : 0,
      corrupted_size : 0,
      corrupted_nb : 0,
      corrupted_list : [],
    };

    await eachIteratorLimit(readdir(this._storage_path), 2, async (file_path) => {
      let {size : file_size} = fs.statSync(file_path);

      if(file_path == this._index_path)
        return;

      stats.total_nb++;
      stats.total_size += file_size;

      if(progress)
        progress.update(stats.total_size / files_size, {file_name : path.basename(file_path).substr(0, 20)});

      let target_hash = path.basename(file_path);

      var file_md5 = await md5File(file_path);
      if(file_md5 != target_hash) {
        stats.corrupted_size += file_size;
        stats.corrupted_nb++;
        stats.corrupted_list.push(file_path);
      } else {
        stats.valid_size += file_size;
        stats.valid_nb++;
      }
    });


    if(progress)
      await progress.terminate();

    return stats;
  }

  async warmup() {
    if(this._index.version)
      return;

    await eachIteratorLimit(readdir(this._storage_path), 2, async (file_path) => {
      var file_md5 = await md5File(file_path);
      var storage_path = this.getFilePathFromMd5(file_md5);
      mkdirpSync(path.dirname(storage_path));
      if(storage_path !== file_path) {
        fs.renameSync(file_path, storage_path);
        log.info(`move ${file_path} to ${storage_path}`);
      }
    });
    //current index has been moved
    this._init();
  }

  async purge() {
    var known_files = [this._index_path];
    for(var ns of Object.keys(this._index)) {
      if(ns == "version" || ns == "_props") //no hash
        continue;
      for(var hash in this._index[ns])
        known_files.push(this.getFilePathFromMd5(this._index[ns][hash]));
    }

    log.info("Build a list with %d paths to preserve", known_files.length);

    //empties directories can stay, we don't mind
    await eachIteratorLimit(readdir(this._storage_path), 2, async (file_path) => {
      if(known_files.indexOf(file_path) !== -1)
        return;
      log.info("Deleting", file_path);
      fs.unlinkSync(file_path);
    });
    log.info("All done");
  }

  write() {
    return writeLazySafe(this._index_path, JSON.stringify(this._index), function(err) {
      if(err)
        log.error("Silent failure when writing index", err);
    });
  }

  getFilePathFromMd5(file_md5) {
    return path.join(this._storage_path, file_md5.substr(0, 2), file_md5.substr(2, 1), file_md5);
  }

  async isWritable(socket_name) {
    let server = await retryUntil(() => {
      const pipeDir    = process.platform == 'win32' ? '\\\\?\\pipe' : os.tmpdir();
      const socketPath = path.join(pipeDir, socket_name);
      const server     = http.createServer();

      server.unref();

      return new Promise((resolve, reject) => {
        server.on('error', (err) => {
          if(err.code === 'EADDRINUSE')
            resolve(false);
          else
            reject(err);
        });

        server.listen(socketPath, resolve.bind(null, server));
      });
    }, 1000 * 120, 100);

    return server;
  }

  async download(file_url, file_md5, allowResume) {
    var file_path = this.getFilePathFromMd5(file_md5);
    var server    = await this.isWritable(`castor_${file_md5}`);

    if(typeof file_url == 'string')
      file_url = url.parse(file_url);

    file_url.headers        = {...file_url.headers};
    file_url.followRedirect = true;

    try {
      const {size} = fs.statSync(file_path);
      if(size == 0 && file_md5 != MD5_EMPTY_FILE) {
        fs.unlinkSync(file_path);
      } else {
        await new Promise((resolve) => server.close(resolve));
        return false;
      }
    } catch(err) {}

    mkdirpSync(path.dirname(file_path));

    var tmp_path     = `${file_path}.tmp`;
    var current_size = 0;
    var hash         = crypto.createHash('md5');

    hash.setEncoding('hex');

    try {
      if(fs.existsSync(tmp_path)) {
        if(allowResume) {
          current_size = fs.statSync(tmp_path).size;

          let src = fs.createReadStream(tmp_path);

          pipe(src, hash, {end : false}).catch(() => false);

          await new Promise((resolve) => src.once('end', resolve));

          file_url.headers['Range'] = `bytes=${current_size}-`;
        } else {
          fs.unlinkSync(tmp_path);
        }
      }

      var attempt       = 0;
      var res           = await request(file_url);
      var expected_size = parseInt(res.headers['content-length']);

      allowResume &= !!res.headers['accept-ranges'];

      do {
        if(!(res.statusCode >= 200 && res.statusCode < 300))
          throw `Invalid status code '${res.statusCode}'`;

        const fd      = fs.openSync(tmp_path, 'a+');
        var outstream = await createWriteStream(tmp_path, {fd});

        pipe(res, hash, {end : false}).catch(() => false);

        try {
          await pipe(res, outstream);
        } catch(err) {
          if(err.code != 'ECONNRESET' || !allowResume)
            throw err;
        }

        await new Promise(resolve => fs.fsync(fd, resolve));

        let {size} = fs.statSync(tmp_path);

        if(size == current_size)
          attempt++;
        else
          attempt = 0;

        allowResume  &= attempt < 10;
        current_size = size;

        if(current_size == expected_size || !allowResume)
          break;

        file_url.headers['Range'] = `bytes=${current_size}-`;

        await sleep(Math.min(attempt, 10)  * 1000);

        res         = await request(file_url);
        allowResume &= current_size < expected_size;
      } while(allowResume);

      hash.end();

      const challenge_md5 = hash.read();

      if(challenge_md5 != file_md5)
        throw `Corrupted file ${challenge_md5} != ${file_md5}`;

      await rename(tmp_path, file_path);

      return true;
    } catch(err) {
      if(fs.existsSync(tmp_path))
        fs.unlinkSync(tmp_path);
      throw err;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

}

module.exports = Store;
