Changelog
=========

### 1.3.0 (2016-06-20)

- Added a `LIVE_BINDINGS_ES_MODULES_ONLY` option to the hot client.
  This ensures exports proxies are slipped between commonjs modules as
  well as ES modules - [1677693](https://github.com/markfinger/unfort/commit/167769388d65b9c6dc0302d9bd9b0f5abe514220)

### 1.2.0 (2016-05-10)

- Fixed an issue where Node v6 could break during the path resolution phase.
  The underlying issue is that Node now throws on undefined, where it previously
  would silently fail - [265906a](https://github.com/markfinger/unfort/commit/265906a2faf3a42c0067f8395abe43774a77f37b)
