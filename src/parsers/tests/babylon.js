import * as path from 'path';
import * as imm from 'immutable';
import * as babylon from 'babylon';
import {assert} from '../../utils/assert';
import {cloneDeepOmitPrivateProps} from '../../utils/clone';
import {createMockWorkers} from '../../workers/mock_workers';
import {createPipeline} from '../../pipeline/pipeline';
import {buildBabylonAst, buildBabylonAstWithWorkers, createBabylonParser, createBabylonOptions} from '../babylon';

describe('parsers/babylon', () => {
  describe('#createBabylonOptions', () => {
    it('should define the sourceType', () => {
      assert.equal(
        createBabylonOptions().sourceType,
        'module'
      );
    })
  });
  describe('#buildBabylonAst', () => {
    it('should return a babylon AST', (done) => {
      const text = `
        var foo = 'bar';
        let blah = () => {};
      `;

      buildBabylonAst(text, null, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(
          ast,
          cloneDeepOmitPrivateProps(babylon.parse(text, createBabylonOptions()))
        );
        done();
      });
    });
    it('should be able to parse an es6 module', (done) => {
      const text = `
        import foo from 'bar';
        import {woz} from 'qux';
      `;

      buildBabylonAst(text, null, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(
          ast,
          cloneDeepOmitPrivateProps(babylon.parse(text, createBabylonOptions()))
        );
        done();
      });
    });
  });
  describe('#buildBabylonAstWithWorkers', () => {
    it('should return a babylon AST', (done) => {
      const workers = createMockWorkers();

      const text = `
        var foo = 'bar';
        let blah = () => {};
      `;

      buildBabylonAstWithWorkers(text, null, workers, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(
          ast,
          cloneDeepOmitPrivateProps(babylon.parse(text, createBabylonOptions()))
        );
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

      const text = `
        var foo = 'bar';
        let blah = () => {};
      `;

      parser({text}, pipeline, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(
          ast,
          cloneDeepOmitPrivateProps(babylon.parse(text, createBabylonOptions()))
        );
        done();
      });
    });
  });
});