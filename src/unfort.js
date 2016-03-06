import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {includes} from 'lodash/collection';
import {repeat} from 'lodash/string';
import {values} from 'lodash/object';
import sourceMapSupport from 'source-map-support';
import envHash from 'env-hash';
import rimraf from 'rimraf';
import {createFileCache} from 'kv-cache';
import {createGraph} from 'cyclic-dependency-graph';
import {createRecordStore} from 'record-store';
import {createJobs} from './jobs';
import {createWatchers} from './watchers';
import {createRecordDescription, describeError, describeErrorList} from './utils';
import {createState} from './state';
import packageJson from '../package.json';

// Convenience hook for referencing the hot runtime in entry points
export {hotRuntime} from './state';

// Convenience hooks to expose web server boilerplate
export {createRecordStream, getRecordMimeType, createRecordInjectionStream} from './boilerplate';

/**
 * Binds some helpers to the process which provide more clarity
 * for debugging
 */
export function installDebugHelpers() {
  // Add source map support for our babel build
  sourceMapSupport.install();

  // Occasionally we'll break the promise chain somewhere,
  // this picks up those inexplicable silent failures
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

  if (!state.graph) {
    const graph = createGraph({
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
    });
    setState(state.set('graph', graph));
  }

  let traceStart;
  state.graph.events.on('started', () => {
    traceStart = (new Date()).getTime();

    signalBuildStarted();
    state.getSockets()
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

    // Clean up any associated cache files, so that we can cut
    // down on the size of the cache directories
    const record = state.recordStore.get(file);
    if (record && record.data.cacheKey) {
      state.jobCache.invalidate(record.data.cacheKey);
    }

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

  function start() {
    state.logInfo(`${chalk.bold('Unfort:')} v${packageJson.version}`);

    ensureJobsAreBoundToState();

    if (!state.recordStore) {
      const recordStore = createRecordStore(state.jobs);
      setState(state.set('recordStore', recordStore));
    }

    if (!state.watchers) {
      const watchers = createWatchers({getState, restartTraceOfFile});
      setState(state.set('watchers', watchers));
    }

    if (!state.environmentHash) {
      // Generate a hash that reflects the state of the environment and
      // enables the persistent cache to avoid expensive cache-invalidation
      const environmentHash = envHash(state.envHash)
        .then(hash => {
          state.logInfo(chalk.bold('EnvHash: ') + hash);
          return hash;
        });
      setState(state.set('environmentHash', environmentHash));
    }

    if (!state.jobCache) {
      const jobCache = Promise.resolve(state.environmentHash)
        .then(hash => {
          // Create a persistent file cache that namespaces all data
          // with the environment hash. This enables us to trivially
          // invalidate any data that is likely to have been generated
          // with a different set of libraries of dependencies
          const cacheDir = path.join(state.cacheDirectory, hash);
          cleanCacheDirectory(state.cacheDirectory, hash);

          const fileCache = createFileCache(cacheDir);
          fileCache.events.on('error', err => emitError(getState, err));

          return fileCache;
        });
      setState(state.set('jobCache', jobCache));
    }

    return Promise.resolve(state.jobCache)
      .then(jobCache => {
        if (jobCache !== state.jobCache) {
          setState(state.set('jobCache', jobCache));
        }

        state.logInfo(chalk.bold('Root URL: ') + state.rootUrl);
        state.logInfo(repeat('-', 80));

        // Start tracing from each entry point
        [state.bootstrapRuntime, ...state.entryPoints].forEach(file => {
          state.graph.setNodeAsEntry(file);
          state.graph.traceFromNode(file);
        });
      });
  }

  function ensureJobsAreBoundToState() {
    if (!state.jobs) {
      const jobs = createJobs({getState});
      state = state.set('jobs', jobs);
    }
  }

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
    ensureJobsAreBoundToState();
    extendJobState(getState, setState, fn);
  }

  return {
    getState,
    setState,
    start,
    extendJobs,
    restartTraceOfFile,
    onCompleted: onBuildCompleted,
    hasErrors: () => stateContainsErrors(state),
    describeErrors: () => describeBuildStateErrors(state)
  };
}

function emitError(getState, err, file) {
  const state = getState();

  const message = describeError(err, file);

  // Output the error on a new line to get around any
  // formatting issues with progress indicators
  state.logError('\n' + message);

  const cleanedMessage = stripAnsi(message);
  state.getSockets()
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
  state.getSockets()
    .forEach(socket => socket.emit('unfort:build-complete', payload));
}

function extendJobState(getState, setState, fn) {
  const state = getState();
  const jobs = state.jobs;

  const overrides = fn(jobs);
  const newJobs = Object.assign({}, jobs, overrides);

  setState(state.set('jobs', newJobs));
}

/**
 * Removes all directories from `cacheDirectory` that do not match `currentDirectory`
 *
 * @param {String} cacheDirectory
 * @param {String} currentDirectory
 */
function cleanCacheDirectory(cacheDirectory, currentDirectory) {
  fs.readdir(cacheDirectory, (err, contents) => {
    function logCacheCleanupFailure(err) {
      console.error('Failed to clean cache directory...');
      console.error(err);
    }

    if (err) return logCacheCleanupFailure(err);

    contents
      .filter(dirname => dirname !== currentDirectory)
      .forEach(dirname => rimraf(
        path.join(cacheDirectory, dirname),
        err => {
          if (err) logCacheCleanupFailure(err);
        }
      ));
  });
}

function stateContainsErrors(state) {
  return Boolean(state.errors);
}

function describeBuildStateErrors(state) {
  return describeErrorList(state.errors);
}