"use strict";

const expect  = require('expect.js');
const path    = require('path');
const http    = require('http');
const fs      = require('fs');
const util    = require('util');

const forIn        = require('mout/object/forIn');
const md5          = require('nyks/crypto/md5');
const guid         = require('mout/random/randString');
const defer        = require('nyks/promise/defer');
const mkdirpSync   = require('nyks/fs/mkdirpSync');
const fetch        = require('nyks/http/fetch');
const drain        = require('nyks/stream/drain');
const promisify    = require('nyks/function/promisify');
const request      = promisify(require('nyks/http/request'));
const deleteFolder = require('nyks/fs/deleteFolderRecursive');
//const sleep        = require('nyks/async/sleep');

var data     = null;
var server   = http.createServer((req, res) => {
  if(req.url == "/nope")
    res.statusCode  = 404;
  res.end(data);
});

const Store  = require('../');
const Index = require('../index');


const index_path    =   "test/media/index.json";

var server_port = null;


var version  = require('../package.json').version;

describe("Test Index Class", function() {

  before("start server & clear media dir", (done) => {
    deleteFolder(path.dirname(index_path));
    server.listen(0, function() {
      server_port = this.address().port;
      done();
    });
  });

  after('delete download folder', () => {
    deleteFolder(path.dirname(index_path));
    server.close();
  });


  describe('Test suid static method', function() {
    it("should test path simplification", function() {
      var challenges = {
        "foo"                  : "foo",
        "this is it0"          : "this is it0",
        "this //is i//t1"      : "this /is i/t1",
        "/this //is it2"       : "this /is it2",
        "/./this //is it3"     : "this /is it3",
        "/./th/./is //is it5"  : "th/is /is it5",
        "/start/?melon"        : "start",
        "/start/sd?melon"      : "start/sd",
        "/start/sd//?"         : "start/sd",
        "this/is/it/?/a?//?ao" : "this/is/it",
      };
      forIn(challenges, function(c, v) {
        expect(Index.suid(v)).to.be(md5(c));
      });
    });
  });

  describe('Test moveToFileObjectStorage static', function() {
    this.timeout(5000);


    before("start server & clear media dir", () => {
      deleteFolder(path.dirname(index_path));
    });

    after("start server & clear media dir", () => {
      deleteFolder(path.dirname(index_path));
    });


    it("should test moving to storage object", async () => {
      var dir_path = path.join(path.dirname(index_path), 'testStorageDir');
      var  defaulthash = (file_md5) => util.format("%s/%s/%s/%s", dir_path, file_md5.substr(0, 2), file_md5.substr(2, 1), file_md5);
      mkdirpSync(dir_path);
      var filesList = [];
      var filesMd5 = [];

      for(let index = 0; index < 100; index++) {
        var file_path = path.join(dir_path, guid(8));
        var file_data = guid(80);
        fs.writeFileSync(file_path, file_data);
        filesList.push(file_path);
        filesMd5.push(md5(file_data));
      }

      var correct_file_data = guid(80);
      var correct_file_path = defaulthash(md5(correct_file_data));
      mkdirpSync(path.dirname(correct_file_path));
      fs.writeFileSync(correct_file_path, correct_file_data);

      var tmpIndex = path.join(dir_path, "index.json");
      fs.writeFileSync(tmpIndex, "{}"); //invalid file
      var file  = new Store(tmpIndex);
      await file.warmup(); //trigger movetocas

      filesList.forEach(file_path => {
        expect(fs.existsSync(path.join(dir_path, file_path))).to.be(false);
      });
      filesMd5.forEach(file_md5 => {
        expect(fs.existsSync(defaulthash(file_md5))).to.be(true);
      });

      //correct file should not be deleted;
      expect(fs.existsSync(correct_file_path)).to.be(true);
    });
  });

  describe('Test checkEntry method', function() {
    this.timeout(5000);
    it("should throw error if no file path given", async () => {
      var file  = new Store(index_path);
      var index = file.getIndex("default");
      file.warmup(); //do nothing
      try {
        index.checkEntry();
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.match(/Invalid file name/);
      }
    });

    it("should return false if no file", async () => {
      var file  = new Store(index_path);
      var index = file.getIndex("default");
      const file_path = guid(4);
      const fileExist = index.checkEntry(file_path);
      expect(fileExist).to.be(false);
    });

    it("should return false if in index but not downloaded", async () => {
      var file  = new Store(index_path);
      const ns = guid(4);
      const file_path = guid(10);
      const md5 = guid(12);
      file._index = {[ns] : {[Index.suid(file_path)] : md5}};
      var index = file.getIndex(ns);
      const fileExist = index.checkEntry(file_path);
      expect(fileExist).to.be(false);
    });

    it("should return false if fileMd5 different from file md5 in index", async () => {
      var file  = new Store(index_path);
      const ns = guid(4);
      const file_path = guid(10);
      const md5 = guid(12);
      file._index = {[ns] : {[Index.suid(file_path)] : md5}};
      var index = file.getIndex(ns);
      const fileExist = index.checkEntry(file_path, guid(12));
      expect(fileExist).to.be(false);
    });

  });

  describe('Test checkFile', function() {
    this.timeout(5000);
    before("start server & clear media dir", () => {
      deleteFolder(path.dirname(index_path));
    });


    it("It should download , update index", async () => {

      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(400);
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var file_md5  = md5(data);
      var touched = await index.checkFile(file_path, file_url, file_md5);

      expect(touched).to.be(1);



      expect(file._index).to.be.eql({
        version,
        [ns] : {
          [Index.suid(file_path)] : file_md5
        }
      });

      index.setProp("complete", 42);

      expect(file._index).to.be.eql({
        version,
        [ns] : {
          [Index.suid(file_path)] : file_md5
        },
        "_props" : {
          [ns] : {
            "complete" : 42,
          }
        }
      });

      expect(index.getProp("complete")).to.eql(42);

    });


    //this is relevant only under win32 host
    it("should support multi download at the same time", async () => {

      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(400);
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var file_md5  = md5(data);
      var touched = await Promise.all([index.checkFile(file_path, file_url, file_md5), index.checkFile(file_path, file_url, file_md5)]);

      expect(touched).to.eql([1, 1]);

    });



    it("should unlink file if size 0 but not in right place", async () => {
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(400);
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var file_md5  = md5(data);
      var touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);
      touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(0);
      const file_download_path = file.getFilePathFromMd5(file_md5);
      fs.writeFileSync(file_download_path, '');
      touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);
    });






    it("should test purge & reset", async () => {

      //write a nope file
      var nope_file = path.join(path.dirname(index_path), "nope");
      fs.writeFileSync(nope_file, "nope");

      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(400);
      var store = new Store(index_path);
      const ns = guid(4);
      var index = store.getIndex(ns);
      var file_md5  = md5(data);
      var touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);

      var valid_file = index.get(file_path).file_path;
      expect(fs.existsSync(valid_file)).to.be(true);

      await store.purge();
      expect(fs.existsSync(nope_file)).to.be(false);
      expect(fs.existsSync(valid_file)).to.be(true);

      index.reset([file_md5]);
      await store.purge();
      expect(fs.existsSync(valid_file)).to.be(true);


      index.reset();
      await store.purge();
      expect(fs.existsSync(valid_file)).to.be(false);

    });


    it("It should not download, already downloaded", async () => {
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(350); //change data (global !!!)

      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var file_md5  = md5(data);

      var touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);
      touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(0);
    });

    it("should download if md5 change", async () => {
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(350);

      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var file_md5  = md5(data);
      var touched = await index.checkFile(file_path, file_url, file_md5);

      expect(touched).to.be(1);
      touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(0);
      data = guid(350); //change data (global !!!)
      file_md5  = md5(data);
      touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);

      expect(index.checkEntry(file_path, file_md5)).to.be(true);

      //now reset index
      index.reset();
      //entry should still be available
      expect(index.checkEntry(file_path, file_md5)).to.be(true);

    });


    it("should throw error if md5 different form given md5", async () => {
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      data = guid(350);  //change data (global !!!)
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var falseMd5 = guid(10);
      try {
        await index.checkFile(file_path, file_url, falseMd5);
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.match(/Corrupted file/);
      }


      try {
        await index.checkFile(file_path, `http://127.0.0.1:${server_port}/nope`, falseMd5);
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.match(/Invalid status code/);
      }



    });

    it("test different input", async () => {
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);

      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      try {
        await index.checkFile({});
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.be('Bad arguments');
      }
      try {
        await index.checkFile({file_path});
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.be('Bad arguments');
      }
      try {
        await index.checkFile({file_path, file_url});
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err).to.be('Bad arguments');
      }
    });
  });

  describe('Test serve file', function() {
    before("start server & clear media dir", () => {
      deleteFolder(path.dirname(index_path));
    });

    it("Should download and serve file ", async () => {
      data            = guid(40);//global
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10);
      const file_md5  = md5(data);
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);

      var touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);
      var defered = defer();

      var server = http.createServer(index.send.bind(index)).listen(0, function() {
        defered.resolve(this.address().port);
      });

      var port = await defered;
      var stream = await fetch(`http://127.0.0.1:${port}/${file_path}`);
      var receved_data = await drain(stream);
      expect(receved_data.toString()).to.be.eql(data);
      server.close();
    });

    it("test headers should be send", async () => {
      data            = guid(40);
      const file_url  = `http://127.0.0.1:${server_port}/${guid(5)}`;
      const file_path = guid(10) + '.mp4?aze=azeqsd';
      const file_md5  = md5(data);
      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);

      var touched = await index.checkFile(file_path, file_url, file_md5);
      expect(touched).to.be(1);
      var defered = defer();

      var server = http.createServer(index.send.bind(index)).listen(0, function() {
        defered.resolve(this.address().port);
      });

      var port = await defered;
      const res = await request(`http://127.0.0.1:${port}/${file_path}`);
      expect(res.headers['content-length']).to.be('' + data.length);
      expect(res.headers['content-md5']).to.be(file_md5);
      expect(res.headers['content-type']).to.be('video/mp4');
      server.close();
    });

    it("try to get non existing file ", async () => {

      var file  = new Store(index_path);
      const ns = guid(4);
      var index = file.getIndex(ns);
      var defered = defer();

      var server = http.createServer((req, res) => {
        index.send(req, res, () => {
          res.statusCode = 404;
          res.end(data);
        });
      }).listen(0, function() {
        defered.resolve(this.address().port);
      });

      var port = await defered;
      var urlpath = guid();

      try {
        await request(`http://127.0.0.1:${port}/${urlpath}`);
        expect().to.fail("Should not reach here");
      } catch(err) {
        expect(err.err).to.match(/'404'/);
        server.close();
      }
    });
  });

});
