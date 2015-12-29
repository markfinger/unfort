import {assert} from '../../utils/assert';
import {buildBabylonAst} from '../../parsers/babylon';
import {createMockWorkers} from '../../workers/mock_workers';
import {transformBabylonAst, transformBabylonAstWithWorkers} from '../babel';

describe('transformers/babel', () => {
  describe('#transformBabylonAst', () => {
    it('should accept an ast and an options object and return a babel file', (done) => {
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
    it('should produce a similar result to transformBabylonAst', (done) => {
      const workers = createMockWorkers();

      buildBabylonAst('const foo = true', null, (err, ast1) => {
        assert.isNull(err);

        transformBabylonAstWithWorkers(ast1, {presets: 'es2015'}, workers, (err, workerFile) => {
          assert.isNull(err);
          assert.equal(workerFile.code, '"use strict";\n\nvar foo = true;');

          // Re-parse to avoid unintended behaviour from mutations
          buildBabylonAst('const foo = true', null, (err, ast2) => {
            assert.isNull(err);

            transformBabylonAst(ast2, {presets: 'es2015'}, (err, file) => {
              assert.isNull(err);
              assert.equal(file.code, '"use strict";\n\nvar foo = true;');
              done();
            });
          });
        });
      });
    });
  });
});