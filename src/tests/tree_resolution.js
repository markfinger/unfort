import path from 'path';
import fs from 'fs';
import async from 'async';
import imm from 'immutable';
import * as babylon from 'babylon';
import {assert} from '../utils/assert';
import {browserResolver} from '../dependencies/browser_resolve';
import {analyzeBabelAstDependencies} from '../dependencies/babel_ast_dependency_analyzer';
import {createStore} from '../store/store';
import {createRecord, patchRecord} from '../store/utils';
import {addRecord, updateRecord} from '../store/records/actions';

describe('tests/tree_resolution', () => {
  it('should build a tree from a simple set of files', function(done) {
    const store = createStore();

    const entryRecord = createRecord(store, {
      file: require.resolve('./tree_resolution/entry')
    });

    store.dispatch(addRecord(entryRecord));

    function processRecord(record, cb) {
      fs.readFile(record.get('file'), 'utf8', (err, content) => {
        if (err) return cb(err);

        const ast = babylon.parse(content, {sourceType: 'module'});
        const dependencies = analyzeBabelAstDependencies(ast);

        async.map(
          dependencies,
          (dependency, cb) => {
            browserResolver(
              {
                dependency,
                basedir: path.dirname(record.get('file'))
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

            record = patchRecord(store, record, {resolvedDependencies});

            cb(null, record);
          }
        );
      });
    }

    processRecord(entryRecord, (err, record) => {
      assert.isNull(err);

      const deps = record.get('resolvedDependencies').toArray();

      async.parallel(
        deps.map(file => (cb) => {
          const record = createRecord(store, {
            file: file
          });

          store.dispatch(addRecord(record));

          processRecord(record, cb);
        }),
        (err, records) => {
          assert.isNull(err);

          const files = store.getState().getIn(['records', 'records']).map(record => record.get('file')).toArray();
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