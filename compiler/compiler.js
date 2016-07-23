"use strict";

const {EOL} = require('os');
const imm = require('immutable');
const {isObject, transform} = require('lodash');

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
    this.phasesById = transform(
      this.phases,
      (acc, phase) => {
        if (acc[phase.id]) {
          throw new Error(`Phase id collision on "${phase.id}"`);
        }
        acc[phase.id] = phase;
      },
      Object.create(null)
    );

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
      buildReference: null,
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
  describeBuildErrors(buildOutput) {
    const descriptions = [];
    for (const unit of buildOutput.unitsWithErrors) {
      for (const buildError of unit.errors) {
        descriptions.push([
          'Unit: ' + unit.path,
          'Phase: ' + buildError.phase.id,
          buildError.error.stack
        ].join(EOL));
      }
    }
    return descriptions.join(EOL);
  }
  completed() {
    return new Promise(res => {
      this.onceCompleted(res);
    });
  }
  onceCompleted(func) {
    if (this._latestBuildOutput) {
      if (this._pendingUnitIds.size) { // Sanity check
        throw new Error('Build output stored, but pending units exist. This indicates that invalidation code is missing from within the compiler');
      }
      return func(this._latestBuildOutput);
    }
    this._onceCompleted.push(func);
  }
  invalidateUnit(unitToInvalidate, phaseId) {
    // Sanity check
    if (!(unitToInvalidate instanceof this.Unit)) {
      throw new TypeError(`Unit not provided: ${unitToInvalidate}`);
    }

    const {path, buildReference} = unitToInvalidate;
    const currentUnit = this.unitsByPath.get(path);

    // These are mostly sanity checks as it's quite likely that stale references
    // are going to pop up with any reasonably complicated async system. We could
    // fail silently, but this approach will hopefully indicate any holes in our
    // invalidation logic
    if (!currentUnit) {
      throw new Error(`Unknown unit provided.\nUnit to invalidate: ${unitToInvalidate}.`);
    }
    if (currentUnit.buildReference !== buildReference) {
      throw new Error(
        `Stale build reference to unit provided.\nUnit to invalidate: ${unitToInvalidate}.\nCurrent unit: ${currentUnit}`
      );
    }

    this._removeUnit(currentUnit);

    let phase;
    if (phaseId) {
      phase = this.phasesById[phaseId];
      if (!phase) {
        throw new Error(`Unknown phase "${phaseId}", available phases: ${Object.keys(this.phasesById)}`);
      }
    } else if (this.entryPoints.has(currentUnit.path)) {
      phase = this.phases[0];
    } else {
      return;
    }

    const phasesToPreserve = this.phases.slice(0, phase.index);
    const patches = transform(phasesToPreserve, (acc, phase) => {
      const phaseData = currentUnit.dataByPhases.get(phase.id);
      if (phaseData) {
        acc.data = acc.data.merge(phaseData);
        acc.dataByPhases = acc.dataByPhases.set(phase.id, phaseData);
      }
    }, {data: imm.Map(), dataByPhases: imm.Map()});
    const newUnit = this._createUnitFromPath(path).merge(patches);

    this._pendingUnitIds.add(newUnit.id);
    this._storeUnitState(newUnit);
    this._compileUnitFromPhase(newUnit, phase);
  }
  _removeUnit(unit) {
    this._latestBuildOutput = null;
    this.unitsById = this.unitsById.remove(unit.id);
    this.unitsByPath = this.unitsByPath.remove(unit.path);
    this.unitsWithErrors = this.unitsWithErrors.filter(_unit => _unit.id !== unit.id);
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
      path,
      buildReference: {}
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
    this._compileUnitFromPhase(unit, initialPhase);
  }
  _compileUnitFromPhase(unit, phase) {
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
          this._compileUnitFromPhase(updatedUnit, nextPhase);
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