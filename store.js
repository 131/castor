'use strict';

const path = require('path');
const fs   = require('fs');
const crypto  = require('crypto');


const get               = require('mout/object/get');
const set               = require('mout/object/set');
const mkdirpSync        = require('nyks/fs/mkdirpSync');
const writeLazySafeSync = require('nyks/fs/writeLazySafeSync');
const eachIteratorLimit = require('nyks/async/eachIteratorLimit');
const promisify  = require('nyks/function/promisify');
const md5File    = promisify(require('nyks/fs/md5File'));

const guid         = require('mout/random/randString');
const pipe         = require('nyks/stream/pipe');
const fetch        = require('nyks/http/fetch');


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
      this._index = {version};
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
    return writeLazySafeSync(this._index_path, JSON.stringify(this._index));
  }

  getFilePathFromMd5(file_md5) {
    return path.join(this._storage_path, file_md5.substr(0, 2), file_md5.substr(2, 1), file_md5);
  }


  async download(file_url, file_md5) {

    var file_path = this.getFilePathFromMd5(file_md5);

    try {
      const {size} = fs.statSync(file_path);
      if(size == 0 && file_md5 != MD5_EMPTY_FILE)
        fs.unlinkSync(file_path);
      else
        return false;
    } catch(err) {}

    mkdirpSync(path.dirname(file_path));
    var tmp_path    = `${file_path}.tmp.${guid()}`;

    try {
      var res = await fetch(file_url);

      if(!(res.statusCode >= 200 && res.statusCode < 300))
        throw `Invalid status code '${res.statusCode}'`;

      var outstream  = fs.createWriteStream(tmp_path);
      var hash = crypto.createHash('md5');
      hash.setEncoding('hex');

      await Promise.all([pipe(res, hash), pipe(res, outstream)]);
      const challenge_md5    = hash.read();
      if(challenge_md5 != file_md5)
        throw `Corrupted file ${challenge_md5} != ${file_md5}`;

      fs.renameSync(tmp_path, file_path);
      return true;
    } catch(err) {
      if(fs.existsSync(tmp_path))
        fs.unlinkSync(tmp_path);
      throw err;
    }
  }

}


module.exports = Store;
