import path from 'path';
import {parse, types as t} from 'babel-core';
import im from 'immutable';
import {resolveDependency, resolveDependencies} from '../alas/resolve';
import {nodeCoreModules} from '../alas/node_core_modules';
import {assert} from './assert';

describe('alas/resolve', () => {
  describe('#resolveDependency', () => {
    it('should return a promise resolving to a map that indicates a path to a file', (done) => {
      const pending = resolveDependency({
        filename: __filename,
        dependency: './index.js'
      });

      pending.then(resolved => {
        const expected = im.Map({
          './index.js': path.join(__dirname, 'index.js')
        });

        assert.isTrue(
          im.is(resolved, expected),
          'should resolve `./index.js` to an absolute path'
        );

        done();
      });
    });
    it('should resolve paths to browser equivalents of node core modules if possible', (done) => {
      const pending = resolveDependency({
        filename: __filename,
        dependency: 'tty'
      });

      pending.then(resolved => {
        assert.equal(
          resolved.get('tty'),
          nodeCoreModules.tty,
          'should resolve `tty` to a browser equivalent'
        );
        done();
      });
    });
    it('should resolve paths to an empty module if a node core module does not have a browser equivalent', (done) => {
      const pending = resolveDependency({
        filename: __filename,
        dependency: 'fs'
      });

      pending.then(resolved => {
        assert.equal(
          resolved.get('fs'),
          path.resolve(path.join(__dirname, '..', 'alas', 'empty_module.js')),
          'should resolve `fs` to an empty module'
        );
        done();
      });
    });
    it('should indicate if a dependency cannot be resolved', (done) => {
      const pending = resolveDependency({
        filename: __filename,
        dependency: './__module_that_does_not_exist__'
      });

      pending.catch(err => {
        assert.instanceOf(err, Error);
        assert.equal(err.message, `Cannot find module './__module_that_does_not_exist__' from '${__dirname}'`);
        done();
      });
    });
  });
  describe('#resolveDependencies', () => {
    it('should return a promise that resolves to a map indicating paths to files', (done) => {
      const pending = resolveDependencies({
        filename: __filename,
        dependencies: im.List(['./index.js', './assert.js'])
      });

      pending.then(resolved => {
        const expected = im.Map({
          './index.js': path.join(__dirname, 'index.js'),
          './assert.js': path.join(__dirname, 'assert.js')
        });

        assert.isTrue(im.is(resolved, expected), 'should resolve `./index.js` to an absolute path');

        done();
      });
    });
    it('should indicate if a dependency cannot be resolved', (done) => {
      const pending = resolveDependencies({
        filename: __filename,
        dependencies: im.List([
          './index.js',
          './__module_that_does_not_exist__',
          './__another_module_that_does_not_exist__'
        ])
      });

      pending.catch(err => {
        assert.instanceOf(err, Error);
        assert.equal(err.message, `Cannot find module './__module_that_does_not_exist__' from '${__dirname}'`);
        done();
      });
    });
  });
});