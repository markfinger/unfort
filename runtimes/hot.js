const socketIoClient = require('../vendor/socket.io-client');
const _ = require('../vendor/lodash');
// We reduce page load times by using pre-built and compressed
// libraries. This shaves around 500kb from the payload

if (typeof Proxy !== 'function') {
  throw new Error(
    '[hot] Proxy objects are not supported in this environment. The hot runtime should be removed'
  );
}

const defaultOptions = {
  SILENT_HOT_RUNTIME: false,
  SOCKET_IO_URL: undefined,
  SOCKET_IO_OPTIONS: undefined,
  LIVE_BINDINGS_ES_MODULES_ONLY: true
};

const options = _.assign({}, defaultOptions, global.__UNFORT__);

function log() {
  if (!options.SILENT_HOT_RUNTIME) {
    console.log.apply(console, arguments);
  }
}

// Before we start monkey-patching the runtime, we need to preserve some references
const extendModule = __modules.extendModule;
const defineModule = __modules.defineModule;
const getModuleExports = __modules.getModuleExports;

/**
 * Creates a proxy that allows module exports to be swapped during
 * runtime. This enables the new version of module to be immediately
 * exposed to its dependencies without much complexity.
 *
 * Note: there is a small overhead to using a proxy. You may notice
 * some degradation in performance if hot loops are frequently
 * introspecting a module's exports.
 *
 * @returns {Object}
 */
function createModuleExportsProxy() {
  let exports = null;

  // As these functions are likely to be extremely hot during normal
  // code execution, they need to be kept small and simple so that
  // JIT compilers can inline them
  const proxy = new Proxy({}, {
    has(_, prop) {
      return prop in exports;
    },
    get(_, property) {
      return exports[property];
    },
    set(_, property, value) {
      return exports[property] = value;
    },
    ownKeys(_) {
      return Object.getOwnPropertyNames(exports);
    }
  });

  return {
    proxy,
    setModule(mod) {
      // Given that the proxy is going to be heavily used during
      // normal code execution, we unpack the module's commonjs
      // shim, so that we drop the amount of property look-ups
      // necessary to resolve a value
      exports = mod.commonjs.exports;
    }
  };
}

// Monkey-patch `getModuleExports` so that we can inject export
// proxies for modules that indicate they are ES2015 modules.
//
// By relying os how babel implements its ES -> commonjs shim,
// we can make some assumptions:
//
// 1) a dependency with the flag `__esModule` is unlikely to ever
//    bind to `module.exports` directly.
// 2) a dependent that imports ES modules via babel will *always*
//    access exports via lazily-evaluated property look-ups.
//
// The combination of these two assumptions enable us to perform
// hot swaps that immediately and transparently cascade through
// the entire module system.
//
// Caveat: this relies heavily on the implementation details of
// babel's ES -> commonjs plugin. If the implementation ever
// changes in a way that breaks our assumptions, we'll probably
// need to fork the plugin. Additionally, these hacks may or may
// not be required when the loader spec is implemented in browsers
__modules.getModuleExports = function getModuleExportsHotWrapper(dependency) {
  const dependencyExports = dependency.commonjs.exports;
  if (
    dependencyExports &&
    (dependencyExports.__esModule || !options.LIVE_BINDINGS_ES_MODULES_ONLY)
  ) {
    return dependency.hot.exportsProxy.proxy;
  }

  // Fallback to the default
  return getModuleExports(dependency);
};


// Monkey-patch `extendModule` so that we can add the `hot` API and
// data that we use to track the state of hot swaps
__modules.extendModule = function extendModuleHotWrapper(mod) {
  mod = extendModule(mod);

  if (mod.hot === undefined) {
    // For ES modules, we expose a proxy to their exports that
    // enables their bindings to be dynamically swapped after
    // each execution
    const exportsProxy = createModuleExportsProxy();
    exportsProxy.setModule(mod);

    // State associated with swapping the module
    mod.hot = {
      // The previous state of the module
      previous: null,
      exportsProxy,
      accepted: false,
      acceptedCallback: null,
      onExit: null,
      exitData: undefined,
      onChanges: null
    };
  }

  if (mod.commonjs.hot === undefined) {
    // The `module.hot` API
    mod.commonjs.hot = {
      /**
       * `module.hot.accept`
       *
       * Indicate that a module will accept hot swaps. Accepts on optional
       * callback that will be triggered when a module has been removed.
       *
       * Note: this has some cross-over with the functionality of
       * `module.hot.exit`. This is provided mostly for compatibility with
       * webpack's HMR API.
       *
       * @param {Function} [cb]
       */
      accept(cb) {
        mod.hot.accepted = true;

        if (_.isFunction(cb)) {
          mod.hot.acceptedCallback = cb;
        }
      },
      /**
       * `module.hot.enter`
       *
       * If a module was swapped and the new version is being executed, a
       * callback passed to `module.hot.enter` will be called immediately
       * with one argument, the value returned from the previous version's
       * `module.hot.exit` callback.
       *
       * @param {Function} cb
       * @returns {*} returns the return value from `cb`
       */
      enter(cb) {
        if (!_.isFunction(cb)) {
          throw new Error(`module.hot.enter must be provided with a function. Received: ${cb}`);
        }

        const prevMod = mod.hot.previous;
        if (prevMod) {
          return cb(prevMod.hot.exitData);
        }
      },
      /**
       * `module.hot.exit`
       *
       * Indicates that a module will accept hot swaps and allows you to pass
       * data from one module version to another.
       *
       * Before a module is swapped, a callback passed to `module.hot.exit`
       * will be called and its return value will be stored for the next
       * version of the module.
       *
       * @param {Function} cb
       */
      exit(cb) {
        mod.hot.accepted = true;

        if (!_.isFunction(cb)) {
          throw new Error(`module.hot.exit must be provided with a function. Received: ${cb}`);
        }

        mod.hot.onExit = cb;
      },
      /**
       * `module.hot.changes`
       *
       * Allows you to execute a callback that will occur after all buffered
       * modules have been hot swapped.
       *
       * Note: if the module that specified the callback is one of the swapped
       * modules, the callback will *not* be called
       *
       * @param {Function} cb
       */
      changes(cb) {
        if (!_.isFunction(cb)) {
          throw new Error(`module.hot.changes must be provided with a function. Received: ${cb}`);
        }

        mod.hot.onChanges = cb;
      }
    };
  }

  return mod;
};

// Add the hot API to each module
_.forEach(__modules.modules, __modules.extendModule);

// There's a bit of complexity in the handling of changed assets.
// In particular, js modules that may depend on new dependencies
// introduce the potential for race conditions as we may or may
// not have a module available when we execute its dependent modules.
// To get around this, we buffer all the modules and only start to
// apply them once _.every pending module has been buffered
__modules.pending = null;
__modules.buffered = [];

// Monkey-patch `defineModule` so that we can intercept incoming modules
__modules.defineModule = function defineModuleHotWrapper(mod) {
  if (!__modules.pending) {
    return defineModule(mod);
  }

  mod = __modules.extendModule(mod);
  const {name, hash} = mod;

  // Prevent unexpected modules from being applied
  if (__modules.pending[name] === undefined) {
    return log(
      `[hot] Attempted to add module "${name}", but it is not registered as pending and will be ignored`
    );
  }

  // Prevent an unexpected version from being applied
  if (__modules.pending[name] !== hash) {
    return log(
      `[hot] Unexpected update for module ${name}. Hash ${hash} does not reflect the expected hash ${__modules.pending[name]} and will be ignored`
    );
  }

  __modules.buffered.push(mod);
  __modules.pending[mod.name] = undefined;
  const readyToApply = _.every(__modules.pending, _.isUndefined);

  if (readyToApply) {
    __modules.pending = null;

    const _buffered = __modules.buffered;
    __modules.buffered = [];

    const modulesSwapped = Object.create(null);
    const toSwap = [];

    _buffered.forEach(mod => {
      modulesSwapped[mod.name] = true;
      toSwap.push([
        // The incoming version
        mod,
        // The previous version or `undefined`
        __modules.modules[mod.name]
      ]);
    });

    toSwap.forEach(([mod, prevMod]) => {
      const {name, hash} = mod;

      if (prevMod) {
        log(`[hot] Hot swapping ${name} from hash ${prevMod.hash} to hash ${hash}`);
      } else {
        log(`[hot] Initializing ${name} at hash ${hash}`);
      }

      if (prevMod) {
        // Trigger any callbacks passed to `module.hot.exit` and
        // store its return value for the next version
        if (prevMod.hot.onExit) {
          prevMod.hot.exitData = prevMod.hot.onExit();
        }

        // Store the previous version of the module so that the next version
        // can introspect it to resolve the `module.hot.enter` data
        mod.hot.previous = prevMod;

        // Prevent memory leaks by removing any references to past
        // versions of the module that is about to be swapped
        prevMod.hot.previous = null;

        // We pass the exports proxy between module states so that dependent
        // modules have their references updated when we swap
        mod.hot.exportsProxy = prevMod.hot.exportsProxy;

        // Point the exports proxy at the new module
        mod.hot.exportsProxy.setModule(mod);
      }

      // Update the runtime's module registry
      defineModule(mod);
    });

    // Execute each module
    toSwap.forEach(([mod]) => {
      // If we're applying multiple modules, it's possible that new
      // modules may trigger execution of other new modules, so we
      // need to iterate through and selectively execute modules.
      //
      // Note: if a module throws an error during execution, the entire
      // hot swap will fail with it. This is by design, as it prevents
      // unexpected behaviour
      if (!mod.executed) {
        __modules.executeModule(mod.name);
      }
    });

    // Trigger any callbacks passed to `module.hot.accept`
    toSwap.forEach(([_, prevMod]) => {
      if (prevMod && prevMod.hot.acceptedCallback) {
        prevMod.hot.acceptedCallback();
      }
    });

    // If a module specified a `module.hot.changes` callback and it
    // was not swapped, then we call it now
    _.forOwn(__modules.modules, mod => {
      // Ignore modules that were removed
      if (mod === undefined) {
        return;
      }

      if (mod.hot.onChanges && !modulesSwapped[mod.name]) {
        mod.hot.onChanges();
      }
    });
  }
};

const io = socketIoClient(options.SOCKET_IO_URL, options.SOCKET_IO_OPTIONS);

io.on('connect', () => {
  log('[hot] Connected');
});

io.on('unfort:build-started', () => {
  log('[hot] Build started');
});

io.on('unfort:build-error', err => {
  console.error(`[hot] Build error: ${err}`);
});

io.on('unfort:build-complete', ({records, removed}) => {
  // With the complete signal, we can start updating our assets
  // and begin the process of hot swapping code.

  const accepted = [];
  const unaccepted = [];

  _.forEach(records, (record, name) => {
    const mod = __modules.modules[name];

    // If it's a new module, we accept it
    if (!mod) {
      accepted.push(name);
      return;
    }

    // If the module is outdated, we check if we can update it
    if (mod.hash !== record.hash) {
      if (_.endsWith(name, '.css') || !record.isTextFile) {
        // As css and binary files are stateless, we can
        // blindly accept them
        accepted.push(name);
      } else if (mod.hot.accepted) {
        accepted.push(name);
      } else {
        unaccepted.push(name);
      }
    }
  });

  // If there were any unaccepted modules, we refuse to apply any changes
  if (unaccepted.length) {
    let message = `[hot] Cannot accept any changes as the following modules have not accepted hot swaps:\n${unaccepted.join('\n')}`;
    if (accepted.length) {
      message += `\n\nUpdates to the following modules have been blocked:\n${accepted.join('\n')}`;
    }
    return console.warn(message);
  }

  // We try to avoid race conditions by resetting the pending state so
  // that any calls to `defineModule` are ignored. This enables us to
  // ignore any pending fetches for previous swaps
  __modules.pending = {};

  // Filter out updates for any modules that have already been buffered
  // for execution. This enables us to avoid any edge-cases where the
  // browser may neglect to fetch the asset twice
  __modules.buffered = __modules.buffered.filter(({name, hash}) => {
    if (_.includes(accepted, name) && records[name].hash === hash) {
      _.pull(accepted, name);
      return true;
    }
    return false;
  });

  const modulesToRemove = _.keys(removed);
  if (modulesToRemove.length) {
    _.forEach(removed, (record, name) => {
      // We need to clear the state for any modules that have been removed
      // so that if they are re-added, they are executed again. This could
      // cause some issues for crazily stateful js, but it's needed to ensure
      // that css changes are always applied
      __modules.modules[name] = undefined;

      // Ensure that the asset is removed from the document
      removeRecordAssetFromDocument(record);
    });
    log(`[hot] Removed modules:\n${modulesToRemove.join('\n')}`);
  }

  if (!accepted.length) {
    return log('[hot] No updates to apply');
  }

  accepted.forEach(name => {
    const record = records[name];

    // Asynchronously fetch the asset
    updateRecordAssetInDocument(record);

    // Ensure that the runtime knows that we are waiting for this specific
    // versions of the module. We need to keep this synced so that we can
    // clear the buffered modules only when it's appropriate to
    __modules.pending[record.name] = record.hash;
  });

  // Note: this iteration *must* occur after `__modules.pending` has been
  // configured. Otherwise, `__modules.defineModule` will give strange
  // responses if we are trying to update multiple assets that include
  // css files
  accepted.forEach(name => {
    const record = records[name];

    // As css assets wont trigger a call to `defineModule`, we need to manually
    // call it to ensure that our module buffer is inevitably cleared and
    // the runtime's module registry is updated. This prevents an issue where
    // reverting a css asset to a previous version may have no effect as the
    // registry assumes it has already been applied
    if (
      _.endsWith(record.url, '.css') ||
      !record.isTextFile
    ) {
      __modules.defineModule({
        name: record.name,
        hash: record.hash,
        deps: {},
        // Note: the factory is defined outside of this closure to prevent the
        // signal payload from sitting in memory
        factory: createRecordUrlModule(record.url)
      });
    }
  });
});

/**
 * Creates a module factory that exports the provided url
 * as the default and allows hot swaps to occur
 *
 * @param {String} url
 * @returns {Function}
 */
function createRecordUrlModule(url) {
  return function recordUrlModule(module, exports) {
    exports.default = url;
    exports.__esModule = true;
    module.hot.accept();
  };
}

/**
 * Removes any <script> or <link> elements that are associated
 * with the provided record.
 *
 * @param {Object} record
 */
function removeRecordAssetFromDocument(record) {
  const {name, url} = record;

  if (!record.isTextFile) {
    // Nothing to do here
    return;
  }

  if (_.endsWith(url, '.css')) {
    return removeStylesheet(record);
  }

  if (_.endsWith(url, '.js') || _.endsWith(url, '.json')) {
    return removeScript(record);
  }

  console.warn(`[hot] Unknown file type for module ${name}, cannot remove`);
}

function updateRecordAssetInDocument(record) {
  const {name, url} = record;

  if (!record.isTextFile) {
    // Nothing to do here
    return;
  }

  if (_.endsWith(url, '.css')) {
    return replaceStylesheet(record);
  }

  if (
    _.endsWith(url, '.js') ||
    _.endsWith(url, '.json')
  ) {
    return replaceScript(record);
  }

  console.warn(`[hot] Unknown file type for module ${name}, cannot update`);
}

function replaceStylesheet(record) {
  const {name, url} = record;

  const links = document.getElementsByTagName('link');

  let replaced = false;

  // Update any matching <link> element
  _.forEach(links, link => {
    const attributeName = link.getAttribute('data-unfort-name');
    if (attributeName === name) {
      link.href = url;
      replaced = true;
      return false;
    }
  });

  if (replaced) {
    return;
  }

  // It's a new file, so we need to add a new <link> element
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute('data-unfort-name', name);
  // We insert new stylesheets at the top of the head as this
  // reflects the common case where a stylesheet import is at
  // the top of a file and its dependents rely on the cascade
  // to override the import's selectors and rules. If we were
  // to place the stylesheet elsewhere, the cascade will
  // probably produce unexpected results
  document.head.insertBefore(link, document.head.firstChild);
}

function removeStylesheet(record) {
  const {name} = record;

  const links = document.getElementsByTagName('link');

  _.forEach(links, link => {
    // Sometimes we end up with `null` here, for reasons unknown
    if (link) {
      const attributeName = link.getAttribute('data-unfort-name');
      if (attributeName === name) {
        link.parentNode.removeChild(link);
      }
    }
  });
}

function replaceScript(record) {
  const {name, url} = record;

  // Clean up any pre-existing scripts
  removeScript(record);

  // Add a new <script> element
  const script = document.createElement('script');
  script.src = url;
  script.setAttribute('data-unfort-name', name);
  document.body.appendChild(script);
}

function removeScript(record) {
  const {name} = record;

  const scripts = document.getElementsByTagName('script');

  _.forEach(scripts, script => {
    // Sometimes we end up with `null` here, for reasons unknown
    if (script) {
      const attributeName = script.getAttribute('data-unfort-name');
      if (attributeName === name) {
        script.parentNode.removeChild(script);
      }
    }
  });
}