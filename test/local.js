"use strict";


const expect  = require('expect.js');
const path    = require('path');
const fs      = require('fs');

const guid         = require('mout/random/randString');
const deleteFolder = require('nyks/fs/deleteFolderRecursive');


const Store  = require('../');

const index_path    =   "test/media/index.json";


describe("Local content tests", function() {

  var file  = new Store(index_path);
  var index = file.getIndex("default");

  after('cleanup', () => {
    deleteFolder(path.dirname(index_path));
  });

  it("Write file from buffer", async () => {
    let file_name = "dummy";
    let file_body            = guid(40);
    let touched, file_path;


    touched = index.writeBuffer(file_name, file_body);
    expect(touched).to.eql(true);

    ({file_path}  = index.get(file_name));
    expect(fs.readFileSync(file_path, 'utf-8')).to.eql(file_body);

    touched = index.writeBuffer(file_name, file_body);
    expect(touched).to.eql(false);
  });

  it("should write then update a file", async () => {
    let file_name = "another";
    let file_body            = guid(40);
    let touched, file_path;

    touched = index.writeBuffer(file_name, file_body);
    expect(touched).to.eql(true);
    ({file_path}  = index.get(file_name));
    expect(fs.readFileSync(file_path, 'utf-8')).to.eql(file_body);

    //now alter it
    file_body            = guid(40);
    touched = index.writeBuffer(file_name, file_body);
    expect(touched).to.eql(true);
    ({file_path}  = index.get(file_name));
    expect(fs.readFileSync(file_path, 'utf-8')).to.eql(file_body);

  });


});

