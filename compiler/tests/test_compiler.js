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
    it('should allow files to be invalidated and rebuilt', () => {
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
          assert.equal(build.unitsByPath.get('test').data.get('content'), 1);
          compiler.invalidateUnitByPath('test');
          return compiler.completed()
            .then(build => {
              assert.equal(build.unitsByPath.get('test').data.get('content'), 2);
            });
        });
    });
  });
});