import path from 'path';
import imm from 'immutable';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {includes} from 'lodash/collection';
import {startsWith, repeat} from 'lodash/string';
import {values} from 'lodash/object';
import sourceMapSupport from 'source-map-support';
import envHash from '../env-hash';
import {createFileCache} from '../kv-cache';
import {createGraph} from '../cyclic-dependency-graph';
import {createRecordStore} from '../record-store';
import {createServer} from './server';
import {createJobs} from './jobs';
import {createWatchers} from './watchers';
import {createRecordDescription, describeError} from './utils';
import packageJson from '../../package.json';

const cwd = process.cwd();

export const hotRuntime = require.resolve('../../runtimes/hot');

/**
 * The `state` object passed around, most commonly via `getState`.
 *
 * An immutable record that contains a mixture of configuration, generated
 * data, and references to stateful sub-modules
 *
 * @type {Record}
 */
export const State = imm.Record({
  // ===================
  // Build configuration
  // ===================

  // The dependency graph's entry points
  entryPoints: [],
  // The root of your project
  sourceRoot: cwd,
  // The root `node_modules` directory that your modules are pulled from
  rootNodeModules: path.join(cwd, 'node_modules'),
  // The root directory that cached data will be dumped into
  cacheDirectory: path.join(cwd, '.unfort'),
  // The record store's jobs
  jobs: null,


  // ================
  // Environment hash
  // ================

  // Options passed to `envHash`
  envHash: null,
  // The hash generated by `envHash`
  environmentHash: null,


  // =================================
  // The module system's runtime files
  // =================================

  bootstrapRuntime: require.resolve('../../runtimes/bootstrap'),
  hotRuntime: hotRuntime,


  // ====================
  // Server configuration
  // ====================

  hostname: '127.0.0.1',
  port: 3000,
  fileEndpoint: '/__file__/',


  // ====================
  // Stateful sub-modules
  // ====================

  server: null,
  recordStore: null,
  jobCache: null,
  graph: null,
  watchers: null,


  // =============================
  // Data generated from the build
  // =============================

  // Any errors that have blocked a build
  errors: null,
  // The latest snapshot of the dependency graph
  nodes: null,
  // The latest snapshot of the record store
  records: null,
  // Used by the file endpoint for resolving content
  recordsByUrl: null,
  // Used by the file endpoint for resolving source maps
  recordsBySourceMapUrl: null
});

export function createUnfort(options={}) {
  let state = State(options);

  state = state.set('graph', createGraph({
    getDependencies: (file) => {
      // Ensure that the record store is synchronised with the graph
      if (!state.recordStore.has(file)) {
        state.recordStore.create(file);
      }

      // Start watching any new directories
      if (startsWith(file, state.sourceRoot)) {
        const sourceRootLength = state.sourceRoot.length;

        let dirname = path.dirname(file);
        if (dirname === sourceRootLength) {
          state.watchers.watchDirectory(dirname);
        } else {
          // We walk up the directory structure to the source root and
          // start watching every directory that we encounter
          while (dirname.length > sourceRootLength) {
            state.watchers.watchDirectory(dirname);
            dirname = path.dirname(dirname);
          }
        }
      }

      // Start the `resolvedDependencies` job
      return state.recordStore.resolvedDependencies(file)
        .then(resolved => {
          // We assume that `resolvedDependencies` returns a map of identifiers to
          // resolved paths, for example: `{jquery: '/path/to/jquery.js'}`
          return values(resolved);
        });
    }
  }));

  let traceStart;
  state.graph.events.on('started', () => {
    signalBuildStarted();

    traceStart = (new Date()).getTime();

    state.server.sockets.forEach(socket => socket.emit('build:started'));
  });

  state.graph.events.on('error', ({node, error}) => {
    emitError(error, node);
  });

  state.graph.events.on('traced', () => {
    const known = state.graph.getState().size;
    const done = known - state.graph.pendingJobs.length;
    const message = `\r${chalk.bold('Trace:')} ${done} / ${known}`;
    process.stdout.write(message);
  });

  state.graph.events.on('completed', ({errors}) => {
    process.stdout.write('\n'); // clear the progress indicator

    const elapsed = (new Date()).getTime() - traceStart;

    if (errors.length) {
      console.log(`${chalk.bold('Errors:')} ${errors.length}`);
      setState(state.set('errors', errors));
      console.log(repeat('-', 80));
      return signalBuildCompleted();
    }

    console.log(`${chalk.bold('Trace elapsed:')} ${elapsed}ms`);

    // Traverse the graph and prune all nodes which are disconnected from
    // the entry points. This ensures that the graph never carries along
    // any unwanted dependencies. Note: We'll clean the record store up
    // during the emit phase
    state.graph.pruneDisconnectedNodes();

    const graphState = state.graph.getState();

    console.log(chalk.bold('Code generation...'));

    const buildStart = (new Date()).getTime();
    const errorsDuringReadyJob = [];

    Promise.all(
      graphState.keySeq().toArray().map(name => {
        return state.recordStore.ready(name)
          .catch(err => {
            emitError(err, name);

            const errObject = {
              error: err,
              node: name
            };
            errorsDuringReadyJob.push(errObject);

            return Promise.reject(errObject);
          });
      })
      )
      .then(() => {
        // If the graph is still the same as when we started the
        // build, then we start pushing the code towards the user
        if (state.graph.getState() === graphState) {
          const buildElapsed = (new Date()).getTime() - buildStart;
          console.log(`${chalk.bold('Code generation elapsed:')} ${buildElapsed}ms`);

          emitBuild();
        }
      })
      .catch(err => {
        if (!includes(errorsDuringReadyJob, err)) {
          // Handle an error that occurred outside of the `ready` jobs
          emitError(err);
          errorsDuringReadyJob.push(err);
        }

        setState(state.set('errors', errorsDuringReadyJob));

        console.log(repeat('-', 80));

        signalBuildCompleted();
      });
  });

  function setState(newState) {
    state = newState;
  }

  function getState() {
    return state;
  }

  let isBuildComplete = false;
  let pendingBuildCompletedCallbacks = [];
  function onBuildCompleted(cb) {
    if (isBuildComplete) {
      cb();
    } else {
      pendingBuildCompletedCallbacks.push(cb);
    }
  }

  function signalBuildStarted() {
    isBuildComplete = false;
  }

  function signalBuildCompleted() {
    isBuildComplete = true;

    const _pendingBuildCompletedCallbacks = pendingBuildCompletedCallbacks;
    pendingBuildCompletedCallbacks = [];

    _pendingBuildCompletedCallbacks.forEach(cb => cb());
  }

  /**
   * Removes all data associated with a particular file, then
   * reconstructs any missing parts of the graph and starts
   * retracing the graph from the files that used to depend on
   * it
   *
   * @param {String} file
   */
  function restartTraceOfFile(file) {
    console.log(`${chalk.bold('Retracing:')} ${file}`);

    const node = state.graph.getState().get(file);

    // Remove any data associated with the file
    state.recordStore.remove(file);

    // Remove the node and any edges associated with it
    state.graph.pruneNode(file);

    // If the file is an entry point, we need to start re-tracing
    // it directly
    if (file === state.bootstrapRuntime || includes(state.entryPoints, file)) {
      state.graph.setNodeAsEntry(file);
      state.graph.traceFromNode(file);
    }

    // Ensure that the file's dependents are updated as well
    node.dependents.forEach(dependent => {
      state.graph.traceFromNode(dependent);
    });
  }

  function emitError(err, file) {
    const message = describeError(err, file);

    // Output the error on a new line to get around any
    // formatting issues with progress indicators
    console.error('\n' + message);

    const cleanedMessage = stripAnsi(message);
    state.server.sockets.forEach(socket => socket.emit('build:error', cleanedMessage));
  }

  function emitBuild() {
    const prevState = getState();

    const nodeState = state.graph.getState();
    const prevNodeState = prevState.nodes;

    // Find all the nodes that were removed from the graph during the
    // build process
    const prunedNodes = [];
    if (prevNodeState) {
      prevNodeState.forEach((_, name) => {
        if (!nodeState.has(name)) {
          prunedNodes.push(name);
        }
      });
    }

    // Remove all records that are no longer represented in the graph.
    // While most of the graph structure would have settled quite early
    // in the build process, we leave the records in memory for as long
    // as possible. This enables us to respond more swiftly to changes
    // that occur during the build, as we've preserved the computationally
    // expensive part of the process
    prunedNodes.forEach(name => {
      state.recordStore.remove(name);
    });

    const recordsState = state.recordStore.getState();
    const prevRecordsState = prevState.records;

    setState(
      prevState.merge({
        records: recordsState,
        nodes: nodeState,
        // Maps of records so that the file endpoint can perform record look ups
        // trivially. This saves us from having to iterate over every record
        recordsByUrl: recordsState
          .filter(record => Boolean(record.data.url))
          .mapKeys((_, record) => record.data.url),
        recordsBySourceMapUrl: recordsState
          .filter(record => Boolean(record.data.sourceMapAnnotation))
          .mapKeys((_, record) => record.data.sourceMapUrl),
        errors: null
      })
    );

    // The payload that we send with the `build:complete` signal.
    // The hot runtime uses this to reconcile the front-end by
    // adding, updating or removing assets. We don't send the assets
    // down the wire, we only tell the runtime what has changed and
    // where it can fetch each asset from
    const payload = {
      records: {},
      removed: {}
    };

    const recordsToCache = [];

    recordsState.forEach(record => {
      if (record.name !== state.bootstrapRuntime) {
        recordsToCache.push(record.name);
        payload.records[record.name] = createRecordDescription(record);
      }
    });

    prunedNodes.forEach(name => {
      const prevRecord = prevRecordsState.get(name);
      payload.removed[name] = createRecordDescription(prevRecord);
    });

    // Send the payload over the wire to any connected browser
    state.server.sockets.forEach(socket => socket.emit('build:complete', payload));

    // We write all the computationally expensive data to disk, so that
    // we can reduce the startup cost of repeated builds
    console.log(`${chalk.bold('Cache write:')} ${recordsToCache.length} records...`);
    const cacheWriteStart = (new Date()).getTime();
    Promise.all(
      recordsToCache.map(name => state.recordStore.writeCache(name))
    )
      .then(() => {
        const elapsed = (new Date()).getTime() - cacheWriteStart;
        console.log(`${chalk.bold('Cache write elapsed:')} ${elapsed}ms`);
      })
      .catch(err => {
        if (state.recordStore.isIntercept(err)) {
          // If the record store emitted an intercept, it means that a record
          // was removed or invalidated during the cache write. In this case,
          // we can just ignore it, as the tracing would have already restarted
          return;
        }

        err.message = 'Cache write error: ' + err.message;
        emitError(err);
      })
      .then(() => {
        // We should provide some form of visual indication that the build
        // has finished
        console.log(repeat('-', 80));

        signalBuildCompleted();
      });
  }

  state = state.set('server', createServer({
    getState,
    onBuildCompleted
  }));

  state = state.set('jobs', createJobs({getState}));

  function start() {
    console.log(`${chalk.bold('Unfort:')} v${packageJson.version}`);

    state = state.set('recordStore', createRecordStore(state.jobs));

    state = state.set('watchers', createWatchers({getState, restartTraceOfFile}));

    state.server.httpServer.listen(state.port, state.hostname, () => {
      console.log(`${chalk.bold('Server:')} http://${state.hostname}:${state.port}`);
    });

    // We generate a hash of the environment's state, so that we can
    // namespace all the cached date. This enables us to ignore any
    // data that may have been generated with other versions
    envHash(state.envHash)
      .then(hash => {
        state = state.set('environmentHash', hash);

        console.log(chalk.bold('EnvHash: ') + hash);
        console.log(repeat('-', 80));

        const cacheDir = path.join(state.cacheDirectory, hash);
        state = state.set('jobCache', createFileCache(cacheDir));
        state.jobCache.events.on('error', err => emitError(err));

        // Start tracing from each entry point
        [state.bootstrapRuntime, ...state.entryPoints].forEach(file => {
          state.graph.setNodeAsEntry(file);
          state.graph.traceFromNode(file);
        });
      });
  }

  function setJobs(jobs) {
    state = state.set('jobs', jobs);
  }

  return {
    getState,
    installHelpers,
    start,
    setJobs,
    onBuildCompleted
  };
}

export function installHelpers() {
  sourceMapSupport.install();

  process.on('unhandledRejection', err => {
    throw err;
  });
}