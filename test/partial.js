"use strict";


const expect  = require('expect.js');
const http    = require('http');
const fs      = require('fs');

const md5          = require('nyks/crypto/md5');
const guid         = require('mout/random/randString');
const defer        = require('nyks/promise/defer');

const Store  = require('../');

const index_path    =   "test/media/index.json";


describe("Partial tests", function() {

  it("try to get file from partial request", async () => {
    let data            = guid(40);

    const file_path = guid(10);
    const file_md5  = md5(data);

    var defered = defer();

    fs.writeFileSync(file_path, data);
    console.log('FILE CONTENT MIGHT BE : ', data, 'IN FILENAME', file_path, 'AND MD5', file_md5);

    var server = http.createServer((req, res) => {

      let {size : file_size} = fs.statSync(file_path);
      let data_bytes          = Array.from(Buffer.from(data, 'utf8'));

      res.setHeader("content-length", file_size); // keep real content-length here
      res.setHeader("content-md5", file_md5); // why not
      res.setHeader("accept-ranges", "bytes");
      //res.strictContentLength = false;

      let length = 5;
      let [, , range] = new RegExp('^([a-zA-Z]+)=([0-9]+)-').exec(req.headers.range || `bytes=0-`);

      range = parseInt(range);
      let payload = Buffer.from(data_bytes.slice(range, range + length));
      console.log("Sending %d bytes [%d-%d]", payload.length, range, length, payload);


      res.end(payload); // only send 5 bytes at a time
    });

    server.listen(0, function() {
      defered.resolve(this.address().port);
    });


    var port         = await defered;
    var target       = `http://127.0.0.1:${port}/${file_path}`;

    var file      = new Store(index_path);
    var ns        = guid(4);
    var index     = file.getIndex(ns);
    var touched   = await index.checkFile(file_path, target, file_md5, true);

    fs.unlinkSync(file_path);

    expect(touched).to.be(1);

    server.close();
  });

});

