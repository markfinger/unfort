"use strict";

const imm = require('immutable');
const {isObject} = require('lodash');

class Compiler {
  constructor({phases, createPipeline}={}) {
    // Configuration
    this.createPipeline = createPipeline || (() => {});
    this.phases = phases.map((data, i) => {
      const {id, processor} = data;
      return {
        id,
        processor,
        index: i
      };
    });

    // Build states
    this.COMPLETED = 'completed';
    this.HAS_ERRORS = 'has errors';

    // Data types
    this.BuildOutput = imm.Record({
      status: null,
      entryPoints: null,
      unitsById: null,
      unitsByPath: null,
      unitsWithErrors: imm.List()
    });
    this.Unit = imm.Record({
      id: null,
      path: null,
      data: imm.Map(),
      dataByPhases: imm.Map(),
      errors: imm.List()
    });
    this.UnitError = imm.Record({
      error: null,
      phase: null,
      unit: null
    });

    // Build output
    this.entryPoints = imm.OrderedSet();
    this.unitsById = imm.Map();
    this.unitsByPath = imm.Map();
    this.unitsWithErrors = imm.List();

    // Internal state
    this._nextAvailableId = 0;
    this._pendingUnitIds = new Set();
    this._latestBuildOutput = null;
    this._onceCompleted = [];
  }
  addEntryPoint(path) {
    this.entryPoints = this.entryPoints.add(path);
    const unit = this._createUnitFromPath(path);
    this._storeUnitState(unit);
  }
  start() {
    this.entryPoints.forEach(path => {
      const unit = this.unitsByPath.get(path);
      this._compileUnitFromInitialPhase(unit);
    });
  }
  buildHasErrors(buildOutput) {
    return buildOutput.status === this.HAS_ERRORS;
  }
  completed() {
    return new Promise(res => {
      this.onceCompleted(res);
    });
  }
  onceCompleted(func) {
    if (this._latestBuildOutput) {
      return func(this._latestBuildOutput);
    }
    this._onceCompleted.push(func);
  }
  invalidateUnitByPath(path) {
    const unit = this.unitsByPath.get(path);
    if (unit) {
      this._latestBuildOutput = null;
      this._removeUnit(unit);
      if (this.entryPoints.has(path)) {
        const unit = this._createUnitFromPath(path);
        this._storeUnitState(unit);
        this._compileUnitFromInitialPhase(unit);
      }
    }
  }
  _removeUnit(unit) {
    this.unitsById = this.unitsById.remove(unit.id);
    this.unitsByPath = this.unitsByPath.remove(unit.path);
    this.unitsWithErrors = this.unitsWithErrors.remove(unit);
  }
  _signalCompleted() {
    this._latestBuildOutput = new this.BuildOutput({
      status: this.unitsWithErrors.size > 0 ?
        this.HAS_ERRORS :
        this.COMPLETED,
      entryPoints: this.entryPoints,
      unitsById: this.unitsById,
      unitsByPath: this.unitsByPath,
      unitsWithErrors: this.unitsWithErrors
    });

    const onceCompleted = this._onceCompleted;
    this._onceCompleted = [];
    onceCompleted.forEach(func => {
      func(this._latestBuildOutput);
    });
  }
  _createUnitFromPath(path) {
    const id = this._createUniqueUnitId();
    const unit = new this.Unit({
      id,
      path
    });
    this._pendingUnitIds.add(id);
    return unit;
  }
  _createUniqueUnitId() {
    const id = this._nextAvailableId;
    this._nextAvailableId++;
    return id;
  }
  _storeUnitState(unit) {
    this.unitsById = this.unitsById.set(unit.id, unit);
    this.unitsByPath = this.unitsByPath.set(unit.path, unit);
  }
  _compileUnitFromInitialPhase(unit) {
    const initialPhase = this.phases[0];
    this._compileUnitInPhase(unit, initialPhase);
  }
  _compileUnitInPhase(unit, phase) {
    const compilation = {
      unit,
    };
    const pipeline = this.createPipeline(unit, phase);
    Promise.resolve()
      .then(() => phase.processor(compilation, pipeline))
      .then(data => {
        if (!isObject(data)) {
          throw new Error(`Phase ${phase.id} returned ${data}`);
        }
        data = imm.Map(data);
        const updatedUnit = unit.merge({
          data: unit.data.merge(data),
          dataByPhases: unit.dataByPhases.set(phase.id, data)
        });
        this._storeUnitState(updatedUnit);
        const nextPhase = this.phases[phase.index + 1];
        if (nextPhase) {
          this._compileUnitInPhase(updatedUnit, nextPhase);
        } else {
          this._unitCompleted(updatedUnit);
        }
      })
      .catch(err => {
        const buildError = this.UnitError({
          error: err,
          phase,
          unit
        });
        const updatedUnit = unit.set('errors', unit.errors.push(buildError));
        this._unitFailed(updatedUnit);
      });
  }
  _unitCompleted(unit) {
    this._pendingUnitIds.delete(unit.id);
    if (!this._pendingUnitIds.size) {
      this._signalCompleted();
    }
  }
  _unitFailed(unit) {
    this.unitsWithErrors = this.unitsWithErrors.push(unit);
    this._unitCompleted(unit);
  }
}

module.exports = {
  Compiler
};