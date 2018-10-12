"use strict";
const http   = require('http');
const util   = require('util');
const expect = require('expect.js');
const fs     = require('fs');

const randString   = require('mout/random/randString');
const md5          = require('nyks/crypto/md5');
const deleteFolder = require('nyks/fs/deleteFolderRecursive');
const mkdirpSync   = require('nyks/fs/mkdirpSync');
const md5FileSync  = require('nyks/fs/md5FileSync');

const castore     = require('../');

var data     = null;
var server   = http.createServer((req, res) => {
  if(req.url == '/badfile')
    res.statusCode = 500;
  res.end(data);

});
var test_dir = "test/trash";


var server_port = null;

var defaulthash = (file_md5) => util.format("%s/%s/%s/%s", test_dir, file_md5.substr(0, 2), file_md5.substr(2, 1), file_md5);



describe("Testing downloader", function() {

  before("Create tests folder, start server", function(done) {
    deleteFolder(test_dir);
    mkdirpSync(test_dir);
    server.listen(0, function() {
      server_port = this.address().port;
      done();
    });
  });

  after('Delete tests folder, close server', () => {
    deleteFolder(test_dir);
    server.close();
  });

  it("Simple download", async () => {
    data = randString(1000);
    var file_md5 = md5(data);
    var file_url = "http://127.0.0.1:" + server_port;
    var touched = await castore(file_url, file_md5, defaulthash);
    expect(touched).to.be(true);
    expect(fs.existsSync(defaulthash(file_md5))).to.be(true);
    expect(md5FileSync(defaulthash(file_md5))).to.be(file_md5);
  });


  it("It should download once", async () => {
    data = randString(3500);
    var file_md5 = md5(data);
    var file_url = "http://127.0.0.1:" + server_port;
    var touched = await castore(file_url, file_md5, defaulthash);
    expect(touched).to.be(true);
    var stats = fs.statSync(defaulthash(file_md5));
    touched = await castore(file_url, file_md5, defaulthash);
    expect(touched).to.be(false);
    expect(stats).to.be.eql(fs.statSync(defaulthash(file_md5)));
  });

  it("It should throw corrupted", async () => {
    data = randString(3500);
    var file_md5 = md5(data) + '1';
    var file_url = "http://127.0.0.1:" + server_port;
    try {
      await castore(file_url, file_md5, defaulthash);
      expect().to.fail("Should not reach here");
    } catch(err) {
      expect(err).to.be(`Corrupted file ${md5(data)} != ${md5(data) + '1'}`);
    }
  });

  it("It should throw if no correct argument", async () => {
    data = randString(3500);
    var file_md5 = md5(data) + '1';
    var file_url = "http://127.0.0.1:" + server_port;
    try {
      await castore();
      expect().to.fail("Should not reach here");
    } catch(err) {
      expect(err).to.be(`bad arguments`);
    }
    try {
      await castore(file_url);
      expect().to.fail("Should not reach here");
    } catch(err) {
      expect(err).to.be(`bad arguments`);
    }
    try {
      await castore(file_url, file_md5);
      expect().to.fail("Should not reach here");
    } catch(err) {
      expect(err).to.be(`bad arguments`);
    }
  });



  it("It should throw for bad url", async () => {
    data = randString(1000);
    var file_md5 = md5(data);
    var file_url = "http://127.0.0.1:" + server_port + "/badfile";
    try {
      await castore(file_url, file_md5, defaulthash);
      expect().to.fail("Should not reach here");
    } catch(err) {
      expect(err).to.be(`Invalid status code '500'`);
    }
  });

});

