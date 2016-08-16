import test from 'ava';
import {environmentHash} from '../environment_hash';
import { createVirtualFileSystemCache } from '../../file_system/test_utils';

test('should handle no specified targets', (t) => {
  const files = {};
  const cache = createVirtualFileSystemCache(files);
  return environmentHash(cache)
    .then(hash => {
      t.is(hash, '___');
    });
});

test('should produce hashes that include a murmur hash of the textual content', (t) => {
  const files = {
    '/foo.js': 'test',
  };
  const cache = createVirtualFileSystemCache(files);
  cache.files.get('/foo.js').setModifiedTime('test');
  return environmentHash(cache, {files: ['/foo.js']})
    .then(hash => {
      t.is(hash, '3127628307_3127628307__');
    });
});

test('should compute hashes of the textual content and modified times of the specified files ', (t) => {
  const files = {
    '/foo.js': 'foo',
    '/bar.json': 'bar'
  };
  const cache = createVirtualFileSystemCache(files);
  return environmentHash(cache, {files: ['/foo.js', '/bar.json']})
    .then(hash => {
      t.is(hash, '2764362941_1706884430__');
      const files = {
        '/foo.js': 'foo',
        '/bar.json': 'bar++'
      };
      const cache = createVirtualFileSystemCache(files);
      return environmentHash(cache, {files: ['/foo.js', '/bar.json']})
        .then(hash => {
          t.is(hash, '962598314_1706884430__');
          const cache = createVirtualFileSystemCache(files);
          cache.files.get('/bar.json').setModifiedTime('test');
          return environmentHash(cache, {files: ['/foo.js', '/bar.json']})
            .then(hash => {
              t.is(hash, '962598314_3854409749__');
            });
        });
    });
});

test('should compute hashes from the modified times of each item within the specified directories', (t) => {
  const files = {
    '/foo/bar.js': 'bar',
    '/foo/woz.js': 'woz'
  };
  const directories = {
    '/foo': [
      'bar.js',
      'woz.js'
    ]
  };
  const cache = createVirtualFileSystemCache(files, directories);
  return environmentHash(cache, {directories: ['/foo']})
    .then(hash => {
      t.is(hash, '__1706884430');
      const files = {
        '/foo/bar.js': 'bar',
        '/foo/woz.js': 'woz++'
      };
      const cache = createVirtualFileSystemCache(files, directories);
      return environmentHash(cache, {directories: ['/foo']})
        .then(hash => {
          t.is(hash, '__1706884430');
          const cache = createVirtualFileSystemCache(files, directories);
          cache.files.get('/foo/bar.js').setModifiedTime('test');
          return environmentHash(cache, {directories: ['/foo']})
            .then(hash => {
              t.is(hash, '__68303964');
            });
        });
    });
});

test('should allow relative paths for files and directories', (t) => {
  const files = {
    '/foo/bar.js': 'foo bar',
    '/foo/woz/woz.js': 'foo woz woz',
    '/bar/woz.js': 'bar woz',
    '/woz/woz.js': 'woz woz'
  };
  const directories = {
    '/foo': ['bar.js', 'woz'],
    '/foo/woz': ['woz.js'],
    '/woz': ['woz.js'],
  };
  const cache = createVirtualFileSystemCache(files, directories);
  return environmentHash(cache, {
    root: '/foo',
    directories: [
      'woz',
      '/woz'
    ],
    files: [
      'bar.js',
      '/bar/woz.js',
      'bar.js'
    ]
  })
    .then(hash => {
      t.is(hash, '3641327672_1774342414_3127134693_3127134693');
    });
});
