import path from 'path';
import fs from 'fs';
import async from 'async';
import {values} from 'lodash/object';
import * as babylon from 'babylon';
import {assert} from '../utils/assert';
import {browserResolver} from '../dependencies/browser-resolver';
import {analyzeBabelAstDependencies} from '../dependencies/analyze-babel-ast-dependencies';

describe('tests/tree-resolution', () => {
  it('should build a tree from a simple set of files', function(done) {
    const store = Object.create(null);

    const entryRecord = {
      file: require.resolve('./tree-resolution/entry')
    };

    store[entryRecord.file] = entryRecord;

    function processRecord(record, cb) {
      fs.readFile(record.file, 'utf8', (err, content) => {
        if (err) return cb(err);

        const ast = babylon.parse(content, {sourceType: 'module'});
        const dependencies = analyzeBabelAstDependencies(ast);

        const identifiers = dependencies.map(dep => dep.source);

        async.map(
          identifiers,
          (dependency, cb) => {
            browserResolver(
              dependency,
              path.dirname(record.file),
              cb
            );
          },
          (err, resolved) => {
            if (err) return cb(err);

            const resolvedDependencies = {};
            resolved.forEach((dep, i) => {
              resolvedDependencies[identifiers[i]] = dep;
            });

            record.resolvedDependencies = resolvedDependencies;

            cb(null, record);
          }
        );
      });
    }

    processRecord(entryRecord, (err, record) => {
      assert.isNull(err);

      const deps = values(record.resolvedDependencies);

      async.parallel(
        deps.map(file => (cb) => {
          const record = {
            file: file
          };

          store[record.file] = record;

          processRecord(record, cb);
        }),
        (err) => {
          assert.isNull(err);

          const files = Object.keys(store).map(file => store[file].file);
          assert.equal(files.length, 4);

          const expected = [
            require.resolve('./tree-resolution/entry'),
            require.resolve('./tree-resolution/commonjs_dependency'),
            require.resolve('./tree-resolution/es6_dependency'),
            require.resolve('./tree-resolution/node_modules/package_dependency/index')
          ];
          files.forEach(file => assert.include(expected, file));

          done();
        }
      );
    });
  });
});