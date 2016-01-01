import * as path from 'path';
import * as imm from 'immutable';
import * as async from 'async';
import {assert} from '../utils/assert';
import {createPipeline} from '../pipeline/pipeline';
import {createBrowserResolver} from '../dependencies/browser_resolve';
import {createBabelAstDependencyAnalyzer} from '../dependencies/babel_ast_dependency_analyzer';
import {createBabylonParser} from '../parsers/babylon';
import {createTextReader} from '../content_readers/text_reader';
import {createStore} from '../store/store';
import {createRecord, patchRecord} from '../store/utils';
import {addRecord, updateRecord} from '../store/records/actions';

describe('tests/tree_resolution', () => {
  it('should define properties, if they are not defined in arguments', function(done) {
    const store = createStore();

    const entryRecord = createRecord(store, {
      file: require.resolve('./tree_resolution/entry')
    });

    store.dispatch(addRecord(entryRecord));

    const pipeline = createPipeline();
    const babylonParser = createBabylonParser();
    const browserResolver = createBrowserResolver();
    const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();
    const textReader = createTextReader();

    function processRecord(record, cb) {
      textReader({file: record.get('file')}, pipeline, (err, content) => {
        if (err) return cb(err);

        record = patchRecord(store, record, {content});

        babylonParser({text: content}, pipeline, (err, babylonAst) => {
          if (err) return cb(err);

          record = patchRecord(store, record, {babylonAst});

          babelAstDependencyAnalyzer({ast: babylonAst}, pipeline, (err, dependencies) => {
            if (err) return cb(err);

            record = patchRecord(store, record, {dependencies});

            async.map(
              dependencies,
              (dependency, cb) => {
                browserResolver(
                  {
                    dependency,
                    basedir: path.dirname(record.get('file'))
                  },
                  pipeline,
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
        });
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
          console.log(store.getState().getIn(['records', 'records']).map(record => record.get('file')));
          done();
        }
      );
    });
  });
});