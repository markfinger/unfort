Changelog
=========

### 1.2.0 (2016-05-10)

- Fixed an issue where Node v6 could break during the path resolution phase.
  The underlying issue is that Node now throws on undefined, where it previously
  would silently fail.