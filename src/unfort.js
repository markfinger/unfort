import path from 'path';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {includes} from 'lodash/collection';
import {repeat} from 'lodash/string';
import {values} from 'lodash/object';
import sourceMapSupport from 'source-map-support';
import envHash from 'env-hash';
import {createFileCache} from 'kv-cache';
import {createGraph} from 'cyclic-dependency-graph';
import {createRecordStore} from 'record-store';
import {createServer} from './server';
import {createJobs} from './jobs';
import {createWatchers} from './watchers';
import {createRecordDescription, describeError} from './utils';
import {createState} from './state';
import packageJson from '../package.json';

/**
 * Convenience hook for referencing the hot runtime in entry points
 */
export {hotRuntime} from './state';

/**
 * Binds some helpers to the process which provide more clarity
 * for debugging
 */
export function installDebugHelpers() {
  sourceMapSupport.install();

  process.on('unhandledRejection', err => {
    throw err;
  });
}

export function createBuild(options={}) {
  let state = createState(options);

  function setState(newState) {
    state = newState;
  }

  function getState() {
    return state;
  }

  setState(state.set('graph', createGraph({
    getDependencies: file => {
      // Ensure that the record store is synchronised with the graph
      if (!state.recordStore.has(file)) {
        state.recordStore.create(file);
      }

      state.watchers.watchFile(file);

      // Start the `resolvedDependencies` job
      return state.recordStore.resolvedDependencies(file)
        .then(resolved => {
          // We assume that `resolvedDependencies` returns a map of identifiers to
          // resolved paths, for example: `{jquery: '/path/to/jquery.js'}`
          return values(resolved);
        });
    }
  })));

  let traceStart;
  state.graph.events.on('started', () => {
    traceStart = (new Date()).getTime();

    signalBuildStarted();
    state.server.getSockets()
      .forEach(socket => socket.emit('unfort:build-started'));
  });

  // Handle any errors that occur during dependency resolution
  state.graph.events.on('error', ({node, error}) => {
    emitError(getState, error, node);
  });

  // Provide progress indicators while we build the graph
  state.graph.events.on('traced', () => {
    const known = state.graph.getState().size;
    const done = known - state.graph.pendingJobs.length;
    const message = `\r${chalk.bold('Trace:')} ${done} / ${known}`;
    process.stdout.write(message);
  });

  state.graph.events.on('completed', ({errors}) => {
    // Clear the progress indicator
    process.stdout.write('\n');

    const elapsed = (new Date()).getTime() - traceStart;
    state.logInfo(`${chalk.bold('Trace elapsed:')} ${elapsed}ms`);

    if (errors.length) {
      // The `error` handler on the graph has already emitted these errors,
      // so we just report a total and flush any pending callbacks
      state.logInfo(`${chalk.bold('Errors:')} ${errors.length}`);
      setState(state.set('errors', errors));
      state.logInfo(repeat('-', 80));
      return signalBuildCompleted();
    }

    // Traverse the graph and prune all nodes which are disconnected from
    // the entry points. This ensures that the graph never carries along
    // any unwanted dependencies. Note: We'll clean the record store up
    // during the emit phase
    state.graph.pruneDisconnectedNodes();

    // Snapshot the graph so that we can detect if any changes occurred
    // during the code generation phase
    const graphState = state.graph.getState();

    state.logInfo(chalk.bold('Code generation...'));

    const codeGenerationState = (new Date()).getTime();
    const errorsDuringCodeGeneration = [];

    // To complete the build, we call the `ready` job on every record so that
    // we can snapshot the record store with the knowledge that it contains
    // all the data that we need.
    //
    // Note: the `ready` job also triggers any remaining code generation tasks
    // that were not necessary for the trace to complete. As a lot of code
    // generation is synchronous, CPU-intensive work that blocks the event-loop,
    // it's generally more efficient to defer as much code generation as possible,
    // so that we don't block the IO-intensive work that's required to trace out
    // the graph
    Promise.all(
      graphState.keySeq().toArray().map(name => {
        return state.recordStore.ready(name)
          // We catch individual failures as this enables us to stream out errors as
          // they occur. Additionally, this also provides more clarity when multiple
          // records fail
          .catch(err => {
            emitError(getState, err, name);

            const errObject = {
              error: err,
              node: name
            };
            errorsDuringCodeGeneration.push(errObject);

            return Promise.reject(errObject);
          });
      })
    )
      .then(() => {
        // If the graph is still the same as when we started the code generation,
        // then we start pushing the code towards the user
        if (state.graph.getState() === graphState) {
          const elapsed = (new Date()).getTime() - codeGenerationState;
          state.logInfo(`${chalk.bold('Code generation elapsed:')} ${elapsed}ms`);

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
              // Clear out any errors from previous builds
              errors: null,
              // Maps of records so that the file endpoint can perform record look ups
              // trivially. This saves us from having to iterate over every record
              recordsByUrl: recordsState
                .filter(record => Boolean(record.data.url))
                .mapKeys((_, record) => record.data.url),
              recordsBySourceMapUrl: recordsState
                .filter(record => Boolean(record.data.sourceMapAnnotation))
                .mapKeys((_, record) => record.data.sourceMapUrl)
            })
          );

          // Signal any connected clients that the build is completed
          emitBuild(getState, {prunedNodes, prevRecordsState});

          // We write all the computationally expensive data to disk, so that
          // we can reduce the startup cost of repeated builds
          state.logInfo(`${chalk.bold('Cache write:')} ${recordsState.size} records...`);
          const cacheWriteStart = (new Date()).getTime();
          Promise.all(
            recordsState.keySeq().toArray()
              .map(name => state.recordStore.writeCache(name))
          )
            .then(() => {
              const elapsed = (new Date()).getTime() - cacheWriteStart;
              state.logInfo(`${chalk.bold('Cache write elapsed:')} ${elapsed}ms`);
            })
            .catch(err => {
              if (state.recordStore.isIntercept(err)) {
                // If the record store emitted an intercept, it means that a record
                // was removed or invalidated during the cache write. In this case,
                // we can just ignore it, as the tracing would have already restarted
                return;
              }

              err.message = 'Cache write error: ' + err.message;
              emitError(getState, err);
            })
            .then(() => {
              const elapsed = (new Date()).getTime() - traceStart;
              state.logInfo(`${chalk.bold('Total elapsed:')} ${elapsed}ms`);

              // We should provide some form of visual indication that the build
              // has finished
              state.logInfo(repeat('-', 80));

              signalBuildCompleted();
            });
        }
      })
      .catch(err => {
        // Handle any errors that occurred during the emit
        if (!includes(errorsDuringCodeGeneration, err)) {
          emitError(getState, err);
          errorsDuringCodeGeneration.push(err);
        }

        setState(state.set('errors', errorsDuringCodeGeneration));

        // Visually indicate that the build completed
        state.logInfo(repeat('-', 80));

        // Flush any pending callbacks and let them handle the errors
        signalBuildCompleted();
      });
  });

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
    state.logInfo(`${chalk.bold('Retracing:')} ${file}`);

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

  setState(
    state.set('server', createServer({
      getState,
      onBuildCompleted
    }))
  );

  function start() {
    state.logInfo(`${chalk.bold('Unfort:')} v${packageJson.version}`);

    setState(state.set('recordStore', createRecordStore(state.jobs)));

    setState(state.set('watchers', createWatchers({getState, restartTraceOfFile})));

    state.server.bindFileEndpoint();

    state.server.httpServer.listen(state.port, state.hostname, () => {
      state.logInfo(`${chalk.bold('Server:')} http://${state.hostname}:${state.port}`);
    });

    // We generate a hash of the environment's state, so that we can
    // namespace all the cached date. This enables us to ignore any
    // data that may have been generated with other versions
    envHash(state.envHash)
      .then(hash => {
        setState(state.set('environmentHash', hash));

        state.logInfo(chalk.bold('EnvHash: ') + hash);
        state.logInfo(repeat('-', 80));

        const cacheDir = path.join(state.cacheDirectory, hash);
        setState(state.set('jobCache', createFileCache(cacheDir)));
        state.jobCache.events.on('error', err => emitError(getState, err));

        // Start tracing from each entry point
        [state.bootstrapRuntime, ...state.entryPoints].forEach(file => {
          state.graph.setNodeAsEntry(file);
          state.graph.traceFromNode(file);
        });
      });
  }

  state = state.set('jobs', createJobs({getState}));

  /**
   * Allow jobs to be overridden - this is pretty essential for all manner
   * of project-specific quirks.
   *
   * Calls the provided function with the currently bound jobs and merges
   * the returned object into the state object.
   *
   * @param {Function} fn
   * @example An example override of a `foo` job
   * extendJobs(jobs => {
   *   return {
   *     foo(ref, store) {
   *       if (bar) {
   *         return woz;
   *       } else {
   *         return jobs.foo(ref, store);
   *       }
   *     }
   *   };
   * });
   * ```
   */
  function extendJobs(fn) {
    extendJobState(getState, setState, fn);
  }

  return {
    getState,
    start,
    extendJobs,
    onBuildCompleted
  };
}

function emitError(getState, err, file) {
  const state = getState();

  const message = describeError(err, file);

  // Output the error on a new line to get around any
  // formatting issues with progress indicators
  state.logError('\n' + message);

  const cleanedMessage = stripAnsi(message);
  state.server.getSockets()
    .forEach(socket => socket.emit('unfort:build-error', cleanedMessage));
}

function emitBuild(getState, {prunedNodes, prevRecordsState}) {
  const state = getState();
  const recordsState = state.recordStore.getState();

  // The payload that we send with the `unfort:build-complete` signal.
  // The hot runtime uses this to reconcile the front-end by
  // adding, updating or removing assets. We don't send the assets
  // down the wire, we only tell the runtime what has changed and
  // where it can fetch each asset from
  const payload = {
    records: {},
    removed: {}
  };

  recordsState.forEach(record => {
    if (record.name !== state.bootstrapRuntime) {
      payload.records[record.name] = createRecordDescription(record);
    }
  });

  prunedNodes.forEach(name => {
    const prevRecord = prevRecordsState.get(name);
    payload.removed[name] = createRecordDescription(prevRecord);
  });

  // Send the payload over the wire to any connected browser
  state.server.getSockets()
    .forEach(socket => socket.emit('unfort:build-complete', payload));
}

function extendJobState(getState, setState, fn) {
  const state = getState();
  const jobs = state.jobs;

  const overrides = fn(jobs);
  const newJobs = Object.assign({}, jobs, overrides);

  setState(state.set('jobs', newJobs));
}