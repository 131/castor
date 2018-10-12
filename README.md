# Content addressable storage download - castore


# API

```js

"use strict";
const castore = require('castore');

//recommended storage hash
var store_path = (file_md5) => {
  return sprintf("somedirectory/%s/%s/%s", file_md5.substr(0, 2), file_md5.substr(2, 1), file_md5);
}


await castore("http://example.com/some/path?stuffs", "aa00c22a1a11a54a54a54a5a4", store_path);
//now, if needed, file has been downloaded


```

[![Build Status](https://travis-ci.org/ivsgroup/castore.svg?branch=master)](https://travis-ci.org/ivsgroup/castore)
[![Coverage Status](https://coveralls.io/ivsgroup/github/ivsgroup/castore/badge.svg?branch=master)](https://coveralls.io/github/ivsgroup/castore?branch=master)
[![Version](https://img.shields.io/npm/v/castore.svg)](https://www.npmjs.com/package/castore)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)
[![Code style](https://img.shields.io/badge/code%2fstyle-ivs-green.svg)](https://www.npmjs.com/package/eslint-plugin-ivs)




# References
* [Content-addressable storage](https://en.wikipedia.org/wiki/Content-addressable_storage)

# Credits 
* [idjem](https://github.com/idjem)
* [131](https://github.com/131)
