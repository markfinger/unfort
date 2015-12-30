import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {createPipeline} from '../../pipeline/pipeline';
import {createMockWorkers} from '../../workers/mock_workers';
import {buildBabylonAst} from '../../parsers/babylon';
import {transformBabylonAst, transformBabylonAstWithWorkers, createBabelTransformer} from '../babel';

describe('transformers/babel', () => {
  describe('#transformBabylonAst', () => {
    it('should accept an ast and an options object, then provide a babel file', (done) => {
      buildBabylonAst('const foo = true', null, (err, ast) => {
        assert.isNull(err);

        transformBabylonAst(ast, {presets: 'es2015'}, (err, file) => {
          assert.isNull(err);
          assert.isObject(file);
          assert.equal(file.code, '"use strict";\n\nvar foo = true;');
          done();
        });
      });
    });
  });
  describe('#transformBabylonAstWithWorkers', () => {
    it('should accept an ast, an options object, and workers, then provide a transformed babel file', (done) => {
      const workers = createMockWorkers();

      buildBabylonAst('const foo = true', null, (err, ast) => {
        assert.isNull(err);

        transformBabylonAstWithWorkers(ast, {presets: 'es2015'}, workers, (err, workerFile) => {
          assert.isNull(err);
          assert.equal(workerFile.code, '"use strict";\n\nvar foo = true;');
          done();
        });
      });
    });
  });
  describe('#createBabelTransformer', () => {
    it('should return a function', () => {
      const ret = createBabelTransformer();
      assert.isFunction(ret);
    });
    it('should accept a record pipeline and return an AST', (done) => {
      const transformer = createBabelTransformer({
        presets: ['es2015']
      });
      const pipeline = createPipeline();

      const testText = `
        const foo = 'bar';
        let blah = () => {};
      `;

      buildBabylonAst(testText, null, (err, ast) => {
        assert.isNull(err);

        const recordPipeline = {
          ...pipeline,
          record: imm.fromJS({
            babylonAst: ast
          })
        };

        transformer(recordPipeline, (err, file) => {
          assert.isNull(err);
          assert.equal(file.code, '"use strict";\n\nvar foo = \'bar\';\nvar blah = function blah() {};');
          done();
        });
      });
    });
  })
});