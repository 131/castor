'use strict';

const fs   = require('fs');
const path = require('path');
const send = require('send');
const url  = require('url');

const md5  = require('nyks/crypto/md5');


class Index {

  constructor(store, index) {
    this.store  = store;
    this._index = index;
  }

  static suid(file_name) {
    let file_path = file_name.replace(/\/*\?.*$/, "");// cleanup trailing slash & query string
    file_path = file_path.replace(/^\/?\.?\//, ""); // cleanup leading '/', './', '/./'
    file_path = file_path.replace(/\/\.\/|\/\//g, "/"); // replace '/./' by '/'
    return md5(file_path);
  }

  get(file_name) {
    if(!file_name)
      throw `Invalid file name`;

    let file_hash = Index.suid(file_name);
    let file_md5  = this._index[file_hash];

    if(!file_md5)
      return {};
    try {
      let file_path = this.store.getFilePathFromMd5(file_md5);
      let stat = fs.statSync(file_path);
      return {file_md5, file_size : stat.size, file_ino : stat.ino, file_path};
    } catch(err) {
      return {};
    }
  }

  checkEntry(file_name, challenge_md5) {
    var {file_md5} = this.get(file_name);
    if(!file_md5 && challenge_md5) {
      let file_path = this.store.getFilePathFromMd5(challenge_md5);
      if(fs.existsSync(file_path))
        return this._update(file_name, challenge_md5);
    }

    if(!file_md5 || challenge_md5 && challenge_md5 != file_md5)
      return false;
    return true;
  }

  //remove all entries
  reset(md5List = []) {
    for(var file_hash in this._index) {
      if(md5List.indexOf(this._index[file_hash]) != -1)
        continue;
      delete this._index[file_hash];
    }
    return this.store.write();
  }

  remove(file_name) {
    delete this._index[Index.suid(file_name)];
    return this.store.write();
  }

  async checkFile(file_name, file_url, file_md5) {
    if(!file_name || !file_md5 || !file_url)
      throw `Bad arguments`;

    var touched = await this.store.download(file_url, file_md5);
    touched |= this._update(file_name, file_md5);
    return touched;
  }

  _update(file_name, file_md5) {
    var file_hash = Index.suid(file_name);
    this._index[file_hash] = file_md5;
    return this.store.write();
  }

  send(req, remote, next) {

    var req_uri = decodeURIComponent(url.parse(req.url).pathname);

    var {file_md5, file_size, file_path}  = this.get(req_uri);

    if(!file_md5) {
      console.log('%s missing file in index', req_uri);
      return next();
    }

    var content_type = send.mime.lookup(req_uri);
    remote.setHeader("content-length", file_size);
    remote.setHeader("content-type", content_type);
    remote.setHeader("content-md5", file_md5);
    send(req, path.resolve(file_path)).pipe(remote);
  }
}


module.exports = Index;
