import socketIoClient from '../../../vendor/socket.io-client';
import _ from '../../../vendor/lodash';
// We reduce page load times by using pre-built and compressed
// libraries. This shaves around 500kb from the payload

// Newer browsers support explicit prototype manipulation,
// but slightly older ones need a shim that uses the
// `__proto__` binding
let getPrototypeOf;
let setPrototypeOf;

if (_.isFunction(Object.getPrototypeOf)) {
  getPrototypeOf = Object.getPrototypeOf;
} else {
  getPrototypeOf = function fallbackGetPrototypeOf(obj) {
    return obj.__proto__;
  };
}

if (_.isFunction(Object.setPrototypeOf)) {
  setPrototypeOf = Object.setPrototypeOf;
} else {
  setPrototypeOf = function fallbackSetPrototypeOf(obj, proto) {
    obj.__proto__ = proto;
  };
}

// Older browsers tend to support varying degrees of prototype
// introspection and manipulation. As the hot runtime depends
// on being able to perform both, we run through a quick
// test-case so that we can warn when things are likely to break
(() => {
  const proto1 = {};
  const obj = _.create(proto1);

  if (getPrototypeOf(obj) !== proto1) {
    console.warn('[hot] Prototype introspection is not supported. The hot runtime should be removed');
    return;
  }

  const proto2 = {};
  setPrototypeOf(obj, proto2);
  if (getPrototypeOf(obj) !== proto2) {
    console.warn('[hot] Prototype manipulation is not supported. The hot runtime should be removed');
  }
})();

__modules.hotSwapExportReferences = Object.create(null);

function log() {
  if (global.__QUIET_UNFORT__ !== true) {
    console.log.apply(console, arguments);
  }
}

// Before we start monkey-patching the runtime, we need to preserve some references
const extendModule = __modules.extendModule;
const defineModule = __modules.defineModule;

// Monkey-patch `extendModule` so that we can add the `hot` API
__modules.extendModule = function extendModuleHotWrapper(mod) {
  mod = extendModule(mod);

  // State associated with swapping the module
  if (mod.hot === undefined) {
    mod.hot = {
      // The previous state of the module
      previous: null,
      exportsProxy: {},
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
       * @returns {*} the value returned from the previous version's `exit` callback
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
__modules.pending = {};
__modules.buffered = [];

// Monkey-patch `defineModule` so that we can intercept incoming modules
__modules.defineModule = function defineModuleHotWrapper(mod) {
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
    __modules.pending = {};
    const _buffered = __modules.buffered;
    __modules.buffered = [];

    const modulesSwapped = Object.create(null);

    const toSwap = _buffered.map(mod => {
      modulesSwapped[mod.name] = true;
      return [mod, __modules.modules[mod.name]];
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

        // Prevent memory leaks by removing any references to past
        // versions of the module that is about to be swapped
        if (prevMod.hot.previous) {
          prevMod.hot.previous = null;
        }

        // We pass the exports proxy between module states so that dependent modules
        // have their references updated when we swap
        mod.hot.exportsProxy = prevMod.hot.exportsProxy;

        // Store the previous version of the module so that the next version
        // can introspect it
        mod.hot.previous = prevMod;
      }

      // Update the runtime's module registry
      defineModule(mod);
    });

    toSwap.forEach(([mod]) => {
      // If we're applying multiple modules, it's possible that new
      // modules may execute other new modules, so we need to iterate
      // through and selectively execute modules that have not been
      // called yet.
      if (!mod.executed) {
        // Note: if a module throws an error during execution, the entire
        // hot swap will fail with it. This is by design, as it prevents
        // unexpected behaviour
        __modules.executeModule(mod.name);
      }
    });

    // Trigger any callbacks passed to `module.hot.accept`
    toSwap.forEach(([_, prevMod]) => {
      if (prevMod && prevMod.hot.acceptedCallback) {
        prevMod.hot.acceptedCallback();
      }
    });

    _.forOwn(__modules.modules, mod => {
      // Handle modules which have been removed
      if (mod === undefined) {
        return;
      }

      // If a module was not swapped and it has specified a callback to
      // `module.hot.changes`, then we call it
      if (!modulesSwapped[mod.name] && mod.hot.onChanges) {
        mod.hot.onChanges();
      }
    });
  }
};

const executeModule = __modules.executeModule;
__modules.executeModule = function executeModuleHotWrapper(name) {
  executeModule(name);

  const mod = __modules.modules[name];
  const exports = mod.commonjs.exports;
  if (
    _.isObject(exports) &&
    !_.isFunction(exports) &&
    exports.__esModule
  ) {
    const exportsProxy = mod.hot.exportsProxy;

    if (getPrototypeOf(exportsProxy) !== exports) {
      setPrototypeOf(exportsProxy, exports);
      mod.commonjs.exports = exportsProxy;
    }
  }

  return mod.commonjs.exports;
};

const io = socketIoClient();

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

  // We try to avoid issues from concurrent-ish updates by resetting
  // the pending state so that any calls to `defineModule` will be ignored
  __modules.pending = {};

  // If a module has already been buffered for execution, we can ignore
  // updates for it
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
    // registry assumes it's already been applied
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

function createRecordUrlModule(url) {
  return function recordUrlModule(module, exports) {
    exports.default = url;
    exports.__esModule = true;
    if (module.hot) {
      module.hot.accept();
    }
  };
}

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
  // optimises for the common case where a stylesheet import is
  // at the top of a file and its dependents may override the
  // selectors. If we don't do this, the cascade can get messed
  // up when you add new styles
  document.head.insertBefore(link, document.head.firstChild);
}

function removeStylesheet(record) {
  const {name} = record;

  const links = document.getElementsByTagName('link');

  _.forEach(links, link => {
    const attributeName = link.getAttribute('data-unfort-name');
    if (attributeName === name) {
      link.parentNode.removeChild(link);
      return false;
    }
  });
}

function replaceScript(record) {
  const {name, url} = record;

  // Clean up any pre-existing scripts
  removeScript(name);

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
    const attributeName = script.getAttribute('data-unfort-name');
    if (attributeName === name) {
      script.parentNode.removeChild(script);
      return false;
    }
  });
}