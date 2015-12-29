import path from 'path';
import imm from 'immutable';
import {parse as babylonParse} from 'babylon';
import {assert} from '../../utils/assert';
import {createMockWorkers} from '../../workers/mock_workers';
import {createPipeline} from '../../pipeline/pipeline';
import {buildBabylonAST, buildBabylonASTWithWorkers, createBabylonParser} from '../babylon';

describe('parsers/babylon', () => {
  describe('#buildBabylonAST', () => {
    it('should return a babylon AST', (done) => {
      const testText = `
        var foo = 'bar';
        let blah = () => {};
      `;

      buildBabylonAST(testText, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(ast, babylonParse(testText));
        done();
      });
    });
  });
  describe('#buildBabylonASTWithWorkers', () => {
    it('should return a babylon AST', (done) => {
      const workers = createMockWorkers();

      const testText = `
        var foo = 'bar';
        let blah = () => {};
      `;

      buildBabylonASTWithWorkers(testText, workers, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(ast, babylonParse(testText));
        done();
      });
    });
  });
  describe('#createBabylonParser', () => {
    it('should return a function', () => {
      const ret = createBabylonParser();
      assert.isFunction(ret);
    });
    it('should accept a record pipeline and return an AST', (done) => {
      const parser = createBabylonParser();
      const pipeline = createPipeline();

      const testText = `
        var foo = 'bar';
        let blah = () => {};
      `;

      const recordPipeline = {
        ...pipeline,
        record: imm.Map({
          content: testText
        })
      };

      parser(recordPipeline, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(ast, babylonParse(testText));
        done();
      });
    });
  });
});