"use strict";

const imm = require('immutable');
const {assert} = require('../../utils/assert');
const {Compiler} = require('../compiler');

describe('compiler/compiler', () => {
  describe('#Compiler', () => {
    it('should allow a unit to be transformed through multiple phases', () => {
      function phase1({unit}) {
        return Promise.resolve({content: unit.path + ' phase 1'});
      }

      function phase2({unit}) {
        return Promise.resolve({content: unit.data.get('content') + ' phase 2'});
      }

      const compiler = new Compiler({
        phases: [
          {id: '1', processor: phase1},
          {id: '2', processor: phase2}
        ]
      });
      compiler.addEntryPoint('/some/file');
      compiler.start();

      return compiler.completed()
        .then(build => {
          const unit = build.unitsByPath.get('/some/file');
          assert.deepEqual(
            unit.data,
            imm.Map({
              content: '/some/file phase 1 phase 2'
            })
          );
        });
    });
    it('should indicate if units fail during compilation', () => {
      function phase1({unit}) {
        if (unit.path === 'unit 1') {
          throw new Error('test error 1');
        }
        return {};
      }
      function phase2({unit}) {
        if (unit.path === 'unit 2') {
          throw new Error('test error 2');
        }
      }

      const compiler = new Compiler({
        phases: [
          {id: '1', processor: phase1},
          {id: '2', processor: phase2}
        ]
      });
      compiler.addEntryPoint('unit 1');
      compiler.addEntryPoint('unit 2');
      compiler.start();

      return compiler.completed()
        .then(build => {
          assert.isTrue(compiler.buildHasErrors(build));
          assert.equal(build.unitsWithErrors.size, 2);
          const unit1 = build.unitsWithErrors.filter(unit => unit.path === 'unit 1').first();
          const unit2 = build.unitsWithErrors.filter(unit => unit.path === 'unit 2').first();
          assert.equal(unit1.errors.size, 1);
          const error1 = unit1.errors.first();
          assert.instanceOf(error1, compiler.UnitError);
          assert.equal(error1.error.message, 'test error 1');
          assert.equal(error1.phase.id, '1');
          assert.equal(unit2.errors.size, 1);
          const error2 = unit2.errors.first();
          assert.instanceOf(error2, compiler.UnitError);
          assert.equal(error2.error.message, 'test error 2');
          assert.equal(error2.phase.id, '2');
        });
    });
    it('should produce a unit error if a falsey value is returned from a phase', () => {
      const compiler = new Compiler({
        phases: [
          {id: '1', processor: () => null}
        ]
      });
      compiler.addEntryPoint('test');
      compiler.start();

      return compiler.completed()
        .then(build => {
          assert.isTrue(compiler.buildHasErrors(build));
          assert.equal(build.unitsWithErrors.size, 1);
          const unit = build.unitsWithErrors.first();
          assert.equal(unit.errors.first().error.message, 'Phase 1 returned null');
        });
    });
    it('should allow files to be removed and rebuilt', () => {
      let count = 0;
      const compiler = new Compiler({
        phases: [
          {id: '1', processor: () => ({content: ++count})}
        ]
      });
      compiler.addEntryPoint('test');
      compiler.start();

      return compiler.completed()
        .then(build => {
          assert.isFalse(compiler.buildHasErrors(build));
          const unit = build.unitsByPath.get('test');
          assert.equal(unit.data.get('content'), 1);
          compiler.invalidateUnit(unit);
          return compiler.completed()
            .then(build => {
              assert.isFalse(compiler.buildHasErrors(build));
              const rebuiltUnit = build.unitsByPath.get('test');
              assert.equal(rebuiltUnit.data.get('content'), 2);
              assert.notEqual(unit.id, rebuiltUnit.id);
              assert.notEqual(unit.buildReference, rebuiltUnit.buildReference);
            });
        });
    });
    it('should provide a textual description of build errors', () => {
      let err;
      const compiler = new Compiler({
        phases: [
          {id: '1', processor() {
            err = new Error('test error');
            throw err;
          }}
        ]
      });
      compiler.addEntryPoint('test');
      compiler.start();
      return compiler.completed()
        .then(build => {
          assert.isTrue(compiler.buildHasErrors(build));
          const description = compiler.describeBuildErrors(build);
          assert.include(description, 'Unit: ' + build.unitsWithErrors.get(0).path);
          assert.include(description, 'Phase: 1');
          assert.include(description, err.stack);
        });
    });
    describe('phase invalidation', () => {
      it('should allow phases to be invalidated, such that the file is partially rebuilt', () => {
        let count = 0;
        const compiler = new Compiler({
          phases: [
            {id: '1', processor({unit}) {
              return {content: unit.path + ' phase1 ' + ++count};
            }},
            {id: '2', processor({unit}) {
              return {content: unit.data.get('content') + ' phase2 ' + ++count};
            }},
            {id: '3', processor({unit}) {
              return {content: unit.data.get('content') + ' phase3 ' + ++count};
            }}
          ]
        });
        compiler.addEntryPoint('test');
        compiler.start();

        return compiler.completed()
          .then(build => {
            assert.isFalse(compiler.buildHasErrors(build));
            const unit = build.unitsByPath.get('test');
            assert.equal(unit.data.get('content'), 'test phase1 1 phase2 2 phase3 3');
            compiler.invalidateUnit(unit, '2');
            return compiler.completed()
              .then(build => {
                assert.isFalse(compiler.buildHasErrors(build));
                const rebuiltUnit = build.unitsByPath.get('test');
                assert.equal(rebuiltUnit.data.get('content'), 'test phase1 1 phase2 4 phase3 5');
                assert.notEqual(unit.id, rebuiltUnit.id);
                assert.notEqual(unit.buildReference, rebuiltUnit.buildReference);
              });
          });
      });
      it('should allow failed phases to be invalidated', () => {
        let count = 0;
        const compiler = new Compiler({
          phases: [
            {id: '1', processor({unit}) {
              return {content: unit.path + ' phase1 ' + ++count};
            }},
            {id: '2', processor({unit}) {
              if (count === 1) {
                count++;
                throw new Error('test error');
              }
              return {content: unit.data.get('content') + ' phase2 ' + ++count};
            }},
            {id: '3', processor({unit}) {
              return {content: unit.data.get('content') + ' phase3 ' + ++count};
            }}
          ]
        });
        compiler.addEntryPoint('test');
        compiler.start();

        return compiler.completed()
          .then(build => {
            assert.isTrue(compiler.buildHasErrors(build));
            const unit = build.unitsByPath.get('test');
            compiler.invalidateUnit(unit, '2');
            return compiler.completed()
              .then(build => {
                assert.isFalse(compiler.buildHasErrors(build));
                const rebuiltUnit = build.unitsByPath.get('test');
                assert.equal(rebuiltUnit.data.get('content'), 'test phase1 1 phase2 3 phase3 4');
                assert.notEqual(unit.id, rebuiltUnit.id);
                assert.notEqual(unit.buildReference, rebuiltUnit.buildReference);
              });
          });
      });
      it('should handle the initial phase being invalidated', () => {
        let count = 0;
        const compiler = new Compiler({
          phases: [
            {id: '1', processor({unit}) {
              return {content: unit.path + ' phase1 ' + ++count};
            }},
            {id: '2', processor({unit}) {
              return {content: unit.data.get('content') + ' phase2 ' + ++count};
            }},
            {id: '3', processor({unit}) {
              return {content: unit.data.get('content') + ' phase3 ' + ++count};
            }}
          ]
        });
        compiler.addEntryPoint('test');
        compiler.start();

        return compiler.completed()
          .then(build => {
            assert.isFalse(compiler.buildHasErrors(build));
            const unit = build.unitsByPath.get('test');
            assert.equal(unit.data.get('content'), 'test phase1 1 phase2 2 phase3 3');
            compiler.invalidateUnit(unit, '1');
            return compiler.completed()
              .then(build => {
                assert.isFalse(compiler.buildHasErrors(build));
                const rebuiltUnit = build.unitsByPath.get('test');
                assert.equal(rebuiltUnit.data.get('content'), 'test phase1 4 phase2 5 phase3 6');
              });
          });
      });
    });
  });
});