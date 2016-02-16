import chokidar from 'chokidar';
import {startsWith} from 'lodash/string';
import {uniq} from 'lodash/array';

export function createWatchers({getState, restartTraceOfFile}) {
  // The directories that our watcher has been instructed to observe.
  // We use an object as a map as it's far more performant than
  // chokidar's `getWatched` method
  const watchedDirectories = {};

  const watcher = chokidar.watch([], {
    persistent: true,
    depth: 0
  });

  watcher.on('addDir', dirname => {
    watchDirectory(dirname);

    restartBuildForFailedNodes();
  });
  watcher.on('add', restartBuildForFailedNodes);
  watcher.on('unlinkDir', restartBuildForFailedNodes);
  watcher.on('change', onChangeToFile);
  watcher.on('unlink', onChangeToFile);
  watcher.on('error', error => console.error(`Watcher error: ${error}`));

  // We use another watcher that does a shallow watch on node_modules.
  // We generally treat node_modules as a fairly static lump of data,
  // but there are plenty of real world situations where we need to
  // detect changes so that we can rebuild a failed or invalid graph
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
    nodeModulesWatcher.on('addDir', restartBuildForFailedNodes);

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

  /**
   * Ensures that the watcher is observing a particular directory
   *
   * @param {String} dirname
   */
  function watchDirectory(dirname) {
    if (startsWith(dirname, getState().rootNodeModules)) {
      // We leave everything in node_modules to be handled by
      // its specific watcher
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
   * @param {String} file
   */
  function onChangeToFile(file) {
    if (getState().graph.getState().has(file)) {
      restartTraceOfFile(file);
    } else {
      restartBuildForFailedNodes();
    }
  }

  /**
   * If a previous build failed, we start a retrace of nodes that
   * were known to have failed
   */
  function restartBuildForFailedNodes() {
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

  return {
    watcher,
    nodeModulesWatcher,
    watchDirectory
  };
}