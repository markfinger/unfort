import path from 'path';
import {parse, types as t} from 'babel-core';
import im from 'immutable';
import {resolveDependency, resolveDependencies} from '../alas/resolve';
import {assert} from './assert';

describe('alas/resolve', () => {
  describe('#resolveDependency', () => {
    it('should return a promise resolving to a path from a file', (done) => {
      const pending = resolveDependency({
        filename: __filename,
        dependency: './index.js'
      });

      pending
        .catch(err => assert.isTrue(false, `Error encountered: ${err.stack}`))
        .then(resolved => {
          const expected = im.Map({'./index.js': path.join(__dirname, 'index.js')});
          assert.isTrue(im.is(resolved, expected), 'should resolve `./index.js` to an absolute path');
          done();
        })
    });
  });
  describe('#resolveDependencies', () => {
    it('should resolve paths from a file', (done) => {
      const pending = resolveDependencies({
        filename: __filename,
        dependencies: im.List(['./index.js', './assert.js'])
      });

      pending
        .catch(err => assert.isTrue(false, `Error encountered: ${err.stack}`))
        .then(resolved => {
          const expected = im.Map({
            './index.js': path.join(__dirname, 'index.js'),
            './assert.js': path.join(__dirname, 'assert.js')
          });
          assert.isTrue(im.is(resolved, expected), 'should resolve `./index.js` to an absolute path');
          done();
        })
    });
  });
});