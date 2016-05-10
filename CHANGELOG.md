Changelog
=========

### 1.2.0 (2016-05-10)

- Fixed an issue where Node v6 could break during the path resolution phase.
  The underlying issue is that Node now throws on undefined, where it previously
  would silently fail - [265906a](https://github.com/markfinger/unfort/commit/265906a2faf3a42c0067f8395abe43774a77f37b)
