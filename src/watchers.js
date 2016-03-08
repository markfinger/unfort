import path from 'path';
import chokidar from 'chokidar';
import imm from 'immutable';
import {startsWith} from 'lodash/string';
import {uniq} from 'lodash/array';

/**
 * The API returned by `createWatchers`
 *
 * @type {Record}
 * @property {FSWatcher} watcher
 * @property {FSWatcher} nodeModulesWatcher
 * @property {Function} watchFile
 */
const Watchers = imm.Record({
  watcher: null,
  nodeModulesWatcher: null,
  watchFile: null
});

/**
 * Produces file watchers that detect file-system changes and
 * either invalidate files or re-start failed builds
 *
 * @param {function} getState
 * @param {function} restartTraceOfFile
 * @returns {Watchers}
 */
export function createWatchers({getState, restartTraceOfFile}) {
  const watcher = chokidar.watch([], {
    persistent: true,
    depth: 0
  });

  // When a new directory is added, we allow the file watcher to walk
  // up the structure. We also use this hook to re-start builds that
  // failed due to missing directories.
  // Note: `addDir` is triggered both when chokidar does its initial
  // scan of a directory and when a directory is added to a watched
  // directory
  watcher.on('addDir', dirname => {
    watchDirectory(dirname);

    restartFailedBuild();
  });

  // When a new file is found, we restart any failed builds.
  // Note: chokidar will also trigger this when it does its initial scan
  watcher.on('add', restartFailedBuild);

  // When a directory is removed, we restart any failed builds
  watcher.on('unlinkDir', restartFailedBuild);

  // When a file is changed, we need to either invalidate it or restart
  // a failed build
  watcher.on('change', onChangeToFile);

  // When a file is changed, we need to either remove it from our data
  // structures or restart a failed build
  watcher.on('unlink', onChangeToFile);

  watcher.on('error', error => console.error(`Watcher error: ${error}`));

  // We use another watcher to keep a shallow watch on node_modules.
  // This enables us to detect package changes, which may enable a
  // a failed graph to be rebuilt, or may invalidate the current one
  const nodeModulesWatcher = chokidar.watch([getState().rootNodeModules], {
    persistent: true,
    depth: 0
  });

  nodeModulesWatcher.on('error', error => console.error(`\`node_modules\` watcher error: ${error}`));

  // We wait until the node_modules directory has been scanned, as we
  // only care about directories that are added or removed
  nodeModulesWatcher.on('ready', () => {

    // If npm has installed a package, it's quite likely that a failed
    // build might complete successfully now
    nodeModulesWatcher.on('addDir', restartFailedBuild);

    // If a directory has been removed, we need to find every node that
    // used to live in it and potentially rebuild the graph
    nodeModulesWatcher.on('unlinkDir', dirname => {
      const nodesImpactingOthers = [];

      getState().graph.getState().forEach((node, name) => {
        if (startsWith(name, dirname)) {
          node.dependents.forEach(dependentName => {
            // If the file was a dependency of a file in either another
            // package or a file outside of node_modules, then we need
            // to remove it from the graph
            if (
              !startsWith(dependentName, getState().rootNodeModules) ||
              !startsWith(dependentName, dirname)
            ) {
              nodesImpactingOthers.push(name);
            }
          });
        }
      });

      uniq(nodesImpactingOthers).forEach(restartTraceOfFile);
    });
  });

  function watchFile(file) {
    const state = getState();

    // Start watching any new directories
    let dirname = path.dirname(file);
    if (!startsWith(dirname, state.sourceRoot)) {
      return watchDirectory(dirname);
    }

    // We walk up the directory structure to the source root and
    // start watching every directory that we encounter. This
    // enables us to detect more cases where a broken build can
    // be restarted
    const sourceRootLength = state.sourceRoot.length;
    do {
      watchDirectory(dirname);
      dirname = path.dirname(dirname);
    } while (dirname.length > sourceRootLength);
  }

  // The directories that our watcher has been instructed to observe.
  // We use an object as a map as it's far more performant than
  // chokidar's `getWatched` method
  const watchedDirectories = {};

  /**
   * Ensures that the watcher is observing a particular directory
   *
   * @param {string} dirname
   */
  function watchDirectory(dirname) {
    if (dirname === getState().rootNodeModules) {
      // nodeModulesWatcher handles this particular directory
      return;
    }

    if (!watchedDirectories[dirname]) {
      watchedDirectories[dirname] = true;
      watcher.add(dirname);
    }
  }

  /**
   * Given a particular file that has changed, invalidate any data
   * and restart the build if necessary
   *
   * @param {string} file
   */
  function onChangeToFile(file) {
    const {
      graph, recordsByFileDependencies
    } = getState();

    if (graph.getState().has(file)) {
      return restartTraceOfFile(file);
    } else if (recordsByFileDependencies && recordsByFileDependencies.has(file)) {
      recordsByFileDependencies.get(file)
        .forEach(record => {
          restartTraceOfFile(record.name);
        });
    } else {
      restartFailedBuild();
    }
  }

  /**
   * If a previous build failed, we start a retrace of nodes that
   * were known to have failed
   */
  function restartFailedBuild() {
    const errors = getState().errors;
    if (errors) {
      const nodesToRetrace = errors
        .map(error => error.node)
        .filter(node => node);

      uniq(nodesToRetrace).forEach(node => {
        restartTraceOfFile(node);
      });
    }
  }

  return Watchers({
    watcher,
    nodeModulesWatcher,
    watchFile
  });
}