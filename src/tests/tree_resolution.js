import path from 'path';
import fs from 'fs';
import async from 'async';
import {values} from 'lodash/object';
import * as babylon from 'babylon';
import {assert} from '../utils/assert';
import {browserResolver} from '../dependencies/browser_resolve';
import {analyzeBabelAstDependencies} from '../dependencies/babel_ast_dependency_analyzer';

describe('tests/tree_resolution', () => {
  it('should build a tree from a simple set of files', function(done) {
    const store = Object.create(null);

    const entryRecord = {
      file: require.resolve('./tree_resolution/entry')
    };

    store[entryRecord.file] = entryRecord;

    function processRecord(record, cb) {
      fs.readFile(record.file, 'utf8', (err, content) => {
        if (err) return cb(err);

        const ast = babylon.parse(content, {sourceType: 'module'});
        const dependencies = analyzeBabelAstDependencies(ast);

        async.map(
          dependencies,
          (dependency, cb) => {
            browserResolver(
              {
                dependency,
                basedir: path.dirname(record.file)
              },
              cb
            );
          },
          (err, resolved) => {
            if (err) return cb(err);

            const resolvedDependencies = {};
            resolved.forEach((dep, i) => {
              resolvedDependencies[dependencies[i]] = dep;
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
            require.resolve('./tree_resolution/entry'),
            require.resolve('./tree_resolution/commonjs_dependency'),
            require.resolve('./tree_resolution/es6_dependency'),
            require.resolve('./tree_resolution/node_modules/package_dependency/index')
          ];
          files.forEach(file => assert.include(expected, file));

          done();
        }
      );
    });
  });
});