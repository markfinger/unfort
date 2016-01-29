import path from 'path';
import fs from 'fs';
import async from 'async';
import {values} from 'lodash/object';
import * as babylon from 'babylon';
import promisify from 'promisify-node';
import {assert} from '../utils/assert';
import {browserResolver} from '../dependencies/browser-resolver';
import {analyzeBabelAstDependencies} from '../dependencies/analyze-babel-ast-dependencies';

const readFile = promisify(fs.readFile);

describe('tests/tree-resolution', () => {
  it('should build a tree from a simple set of files', function() {
    const store = Object.create(null);

    const entryRecord = {
      file: require.resolve('./tree-resolution/entry')
    };

    store[entryRecord.file] = entryRecord;

    function processRecord(record) {
      return readFile(record.file, 'utf8').then(content => {
        const ast = babylon.parse(content, {sourceType: 'module'});
        const dependencies = analyzeBabelAstDependencies(ast);

        const identifiers = dependencies.map(dep => dep.source);

        return Promise.all(
          identifiers.map(dependency => {
            return browserResolver(dependency, path.dirname(record.file));
          })
        ).then(resolved => {
          const resolvedDependencies = {};
          resolved.forEach((dep, i) => {
            resolvedDependencies[identifiers[i]] = dep;
          });

          record.resolvedDependencies = resolvedDependencies;

          return record;
        });
      });
    }

    return processRecord(entryRecord)
      .then(record => {
        const deps = values(record.resolvedDependencies);

        return Promise.all(
          deps.map(file => {
            const record = {
              file: file
            };

            store[record.file] = record;

            return processRecord(record);
          })
        ).then(() => {
          const files = Object.keys(store).map(file => store[file].file);
          assert.equal(files.length, 4);

          const expected = [
            require.resolve('./tree-resolution/entry'),
            require.resolve('./tree-resolution/commonjs_dependency'),
            require.resolve('./tree-resolution/es6_dependency'),
            require.resolve('./tree-resolution/node_modules/package_dependency/index')
          ];
          files.forEach(file => assert.include(expected, file));
        });
      });
  });
});