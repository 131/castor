# Content addressable storage - castor

An ES7 [CAS designed](https://en.wikipedia.org/wiki/Content-addressable_storage) file storage for nodejs with a simple API and robust implementation.

<img align="right" alt="castor drawing" src="https://raw.githubusercontent.com/131/castor/master/doc/castor.png"/>


[![Build Status](https://github.com/ivsgroup/castor/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/ivsgroup/castor/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/ivsgroup/castor/badge.svg?branch=master)](https://coveralls.io/github/ivsgroup/castor?branch=master)
[![NPM version](https://img.shields.io/npm/v/castor.svg)](https://www.npmjs.com/package/castor)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)
[![Code style](https://img.shields.io/badge/code%2fstyle-ivs-green.svg)](https://www.npmjs.com/package/eslint-plugin-ivs)



# API

```
const Storage = require('castor');
  // castor internal index file path
var store = new Storage('./some/path/index.json');

  // return an *index* to write and fetch file into
var index = store.getIndex('medias');
```


## async Index.checkEntry(file_name, file_url, file_md5)
```
  // download, if needed, the requested file, store it in CAS and reference it into current index
  // file_url can be an url.parse'd object
await index.checkEntry("some/storage/path/file.mp4", "http://remoteurl.com/20320930293", "[CURRENT_MD5]");
```


## Index.get(file_name)
```
// retrieve a file information from current index
index.get("some/storage/path/file.mp4") 
/* retrieve {
  file_size : (an integer),
  file_path : './some/path/00/1/[FULL_MD5]',
  file_md5 : '[FULL_MD5]',
 }
*/
```

## Index.send(req, res, next)
```
// expose an http/express middleware to delivers content from an existing path
server.use(index.send.bind(index)) // (req, res, next)
```


# Advanced usage

## Storage.warmup
```
// move all existing (and non indexed files) files to CAS design
await store.warmup();
```


## Index.reset()
```
//reset a local index file_path => hash mapping (no files are deleted at this time)
index.reset();
```


## async Storage.purge()
```
//remove all unlinked file (files not referenced in any index) from storage folder
await storage.purge();
```




# References
* [Content-addressable storage](https://en.wikipedia.org/wiki/Content-addressable_storage)

# Credits 
* [idjem](https://github.com/idjem)
* [131](https://github.com/131)
* [beaver](https://fr.wikipedia.org/wiki/Castor_(genre)) drawing by [Lincung Studio](https://www.youtube.com/channel/UCeGDCpWeOQnP8S9l7jrWgWw)

