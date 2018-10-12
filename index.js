'use strict';


const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const guid         = require('mout/random/randString');
const pipe         = require('nyks/stream/pipe');
const mkdirpSync   = require('nyks/fs/mkdirpSync');
const fetch        = require('nyks/http/fetch');


const castore = async (file_url, file_md5, storage_hash) => {
  if(!file_url || !file_md5 || !storage_hash)
    throw `bad arguments`;

  var file_path = storage_hash(file_md5);
  if(fs.existsSync(file_path))
    return false;

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
};


module.exports = castore;
