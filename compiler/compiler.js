"use strict";

const {EOL} = require('os');
const imm = require('immutable');
const {transform} = require('lodash');
const {
  addNode, addEdge, removeEdge, removeNode, findNodesDisconnectedFromEntryNodes
} = require('../cyclic_dependency_graph/node');

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
      unitsWithErrors: imm.List(),
      graph: null
    });
    this.Unit = imm.Record({
      id: null,
      path: null,
      buildReference: null,
      data: imm.Map(),
      dataByPhases: imm.Map(),
      pathDependencies: imm.OrderedSet(),
      pathDependenciesByPhase: imm.Map(),
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
    this.graph = imm.Map();

    // Internal state
    this._nextAvailableId = 0;
    this._pendingUnitIds = new Set();
    this._latestBuildOutput = null;
    this._onceCompleted = [];
  }
  addEntryPoint(path) {
    this.entryPoints = this.entryPoints.add(path);
    this._createUnitFromPath(path);
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

    this._removeUnit(currentUnit, true);

    let phase;
    if (phaseId) {
      phase = this.phasesById[phaseId];
      if (!phase) {
        throw new Error(`Unknown phase "${phaseId}", available phases: ${Object.keys(this.phasesById)}`);
      }
    } else if (this.entryPoints.has(currentUnit.path)) {
      // To preserve the dependency graph, we immediately start
      // rebuilds for entry points
      phase = this.phases[0];
    } else {
      return;
    }

    const phasesToPreserve = this.phases.slice(0, phase.index);
    const patches = transform(phasesToPreserve, (acc, phase) => {
      const phaseData = currentUnit.dataByPhases.get(phase.id);
      const phasePathDependencies = currentUnit.pathDependenciesByPhase.get(phase.id);
      if (phaseData) {
        acc.data = acc.data.merge(phaseData);
        acc.dataByPhases = acc.dataByPhases.set(phase.id, phaseData);
      }
      if (phasePathDependencies) {
        acc.pathDependencies = acc.pathDependencies.concat(phasePathDependencies);
        acc.pathDependenciesByPhase = acc.pathDependenciesByPhase.set(phase.id, phasePathDependencies);
      }
    }, {
      data: imm.Map(),
      dataByPhases: imm.Map(),
      pathDependencies: imm.OrderedSet(),
      pathDependenciesByPhase: imm.Map()
    });
    const newUnit = this._createUnitFromPath(path).merge(patches);
    this._compileUnitFromPhase(newUnit, phase);
  }
  _removeUnit(unit, invalidateDependents=false) {
    const {id, path} = unit;
    this._latestBuildOutput = null;
    this._pendingUnitIds.delete(id);
    this.unitsById = this.unitsById.remove(id);
    this.unitsByPath = this.unitsByPath.remove(path);
    this.unitsWithErrors = this.unitsWithErrors.filter(_unit => _unit.id !== id);

    const node = this.graph.get(path);
    for (const dependentPath of node.dependents) {
      this.graph = removeEdge(this.graph, dependentPath, path);
      if (invalidateDependents) {
        // Force dependents to re-evaluate the phases where they added dependencies
        const dependentUnit = this.unitsByPath.get(dependentPath);
        for (const phase of this.phases) {
          const phaseId = phase.id;
          const pathDependencies = dependentUnit.pathDependenciesByPhase.get(phaseId);
          if (pathDependencies.has(path)) {
            this.invalidateUnit(dependentUnit, phaseId);
          }
        }
      }
    }
    for (const dependencyPath of node.dependencies) {
      this.graph = removeEdge(this.graph, path, dependencyPath);
    }
    this.graph = removeNode(this.graph, path);
  }
  _signalCompleted() {
    const disconnectedNodes = findNodesDisconnectedFromEntryNodes(this.graph, this.entryPoints);
    for (const path of disconnectedNodes) {
      const disconnectedUnit = this.unitsByPath.get(path);
      this._removeUnit(disconnectedUnit);
    }

    this._latestBuildOutput = new this.BuildOutput({
      status: this.unitsWithErrors.size > 0 ?
        this.HAS_ERRORS : this.COMPLETED,
      entryPoints: this.entryPoints,
      unitsById: this.unitsById,
      unitsByPath: this.unitsByPath,
      unitsWithErrors: this.unitsWithErrors,
      graph: this.graph
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
    this.graph = addNode(this.graph, path);
    this._storeUnitState(unit);
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
    const context = new PhaseContext(unit);
    const pipeline = this.createPipeline(unit, phase);
    Promise.resolve()
      .then(() => {
        if (!this._isUnitValid(unit)) {
          return;
        }
        return phase.processor(context, pipeline);
      })
      .then(data => {
        if (!this._isUnitValid(unit)) {
          return;
        }

        const patches = {};

        const dataToMerge = imm.Map(data);
        patches.data = unit.data.merge(dataToMerge);
        patches.dataByPhases = unit.dataByPhases.set(phase.id, dataToMerge);

        const pathDependencies = imm.OrderedSet(context.pathDependencies);
        patches.pathDependencies = unit.pathDependencies.concat(pathDependencies);
        patches.pathDependenciesByPhase = unit.pathDependenciesByPhase.set(phase.id, pathDependencies);

        const updatedUnit = unit.merge(patches);
        this._storeUnitState(updatedUnit);

        const nextPhase = this.phases[phase.index + 1];
        if (nextPhase) {
          this._compileUnitFromPhase(updatedUnit, nextPhase);
        } else {
          this._unitCompleted(updatedUnit);
        }
      })
      .catch(err => {
        if (!this._isUnitValid(unit)) {
          return;
        }

        const buildError = this.UnitError({
          error: err,
          phase,
          unit
        });
        const updatedUnit = unit.set('errors', unit.errors.push(buildError));
        this._unitFailed(updatedUnit);
      });
  }
  _isUnitValid(unit) {
    const currentUnit = this.unitsByPath.get(unit.path);
    return currentUnit && currentUnit.buildReference === unit.buildReference;
  }
  _unitCompleted(unit) {
    for (const path of unit.pathDependencies) {
      let depUnit = this.unitsByPath.get(path);
      if (!depUnit) {
        depUnit = this._createUnitFromPath(path);
        this._compileUnitFromInitialPhase(depUnit);
      }
      this.graph = addEdge(this.graph, unit.path, depUnit.path);
    }
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

class PhaseContext {
  constructor(unit) {
    this.unit = unit;
    this.unitPath = unit.path;
    this.pathDependencies = new Set();
  }
  addDependencyByPath(path) {
    if (path === this.unitPath) {
      throw new Error(`Unit "${this.unitPath}" declared a dependency on itself`);
    }
    this.pathDependencies.add(path);
  }
}

module.exports = {
  Compiler
};