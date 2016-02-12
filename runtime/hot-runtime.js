import socketIoClient from 'socket.io-client';
import {isFunction, isObject, isUndefined} from 'lodash/lang';
import {forEach, filter, includes, every} from 'lodash/collection';
import {keys} from 'lodash/object';
import {pull} from 'lodash/array';
import {startsWith, endsWith} from 'lodash/string';

if (!isFunction(Object.setPrototypeOf)) {
  throw new Error('Object.setPrototypeOf has not been defined, hot swap cannot occur');
}

if (!isFunction(Object.getPrototypeOf)) {
  throw new Error('Object.getPrototypeOf has not been defined, hot swap cannot occur');
}

__modules.hotSwapExportReferences = Object.create(null);

// Before we start monkey-patching the runtime, we need to preserve some references
const extendModule = __modules.extendModule;
const defineModule = __modules.defineModule;

// Monkey-patch `extendModule` so that we can add the `hot` API
__modules.extendModule = function extendModuleHotWrapper(mod) {
  mod = extendModule(mod);

  // The previous state of the module
  if (mod.prev === undefined) {
    mod.prev = null;
  }

  // State associated with swapping the module
  if (mod.hot === undefined) {
    mod.hot = {
      accepted: false,
      onExit: null,
      exportsProxy: {}
    };
  }

  // The `module.hot` API
  if (mod.commonjs.hot === undefined) {
    mod.commonjs.hot = {
      accept(cb) {
        mod.hot.accepted = true;

        if (isFunction(cb)) {
          mod.hot.onExit = cb;
        }
      }
    };
  }

  return mod;
};

// Add the hot API to each module
forEach(__modules.modules, __modules.extendModule);

// There's a bit of complexity in the handling of changed assets.
// In particular, js modules that may depend on new dependencies
// introduce the potential for race conditions as we may or may
// not have a module available when we execute it's dependent
// modules. To get around this, we buffer all the modules and only
// start to apply them once every pending module has been buffered
__modules.pending = {};
__modules.buffered = [];

// Monkey-patch `defineModule` so that we can intercept incoming modules
__modules.defineModule = function defineModuleHotWrapper(mod) {
  mod = __modules.extendModule(mod);

  const {name, hash} = mod;

  // Prevent unexpected modules from being applied
  if (__modules.pending[name] === undefined) {
    return console.log(
      `[hot] Attempted to add module "${name}", but it is not registered as pending and will be ignored`
    );
  }

  // Prevent an unexpected version from being applied
  if (__modules.pending[name] !== hash) {
    return console.log(
      `[hot] Unexpected update for module ${name}. Hash ${hash} does not reflect the expected hash ${__modules.pending[name]} and will be ignored`
    );
  }

  __modules.buffered.push(mod);
  __modules.pending[mod.name] = undefined;
  const readyToApply = every(__modules.pending, isUndefined);

  if (readyToApply) {
    __modules.pending = {};
    const _buffered = __modules.buffered;
    __modules.buffered = [];

    const toSwap = _buffered.map(mod => {
      return [mod, __modules.modules[mod.name]];
    });

    toSwap.forEach(([mod, prevMod]) => {
      const {name, hash} = mod;

      if (prevMod) {
        console.log(`[hot] Hot swapping ${name} from hash ${prevMod.hash} to hash ${hash}`);
      } else {
        console.log(`[hot] Initializing ${name} at hash ${hash}`);
      }

      if (prevMod) {
        // Trigger any callbacks associated with removing a module
        if (prevMod.hot.onExit) {
          prevMod.hot.onExit();
        }

        // We pass the exports proxy between module states so that dependent modules
        // have their references updated when we swap
        mod.hot.exportsProxy = prevMod.hot.exportsProxy;

        // We store the previous version of the module mostly as an escape hatch in
        // case we ever want to do some extra crazy things during the swapping process
        mod.prev = prevMod;
      }

      // Update the runtime's module registry
      defineModule(mod);
    });

    toSwap.forEach(([mod]) => {
      // If we're applying multiple modules, it's possible that new
      // modules may execute other new modules, so we need to iterate
      // through and selectively execute modules that have not been
      // called yet
      if (!mod.executed) {
        __modules.executeModule(mod.name);
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
    isObject(exports) &&
    !isFunction(exports) &&
    exports.__esModule
  ) {
    const exportsProxy = mod.hot.exportsProxy;

    if (Object.getPrototypeOf(exportsProxy) !== exports) {
      Object.setPrototypeOf(exportsProxy, exports);
      mod.commonjs.exports = exportsProxy;
    }
  }

  return mod.commonjs.exports;
};

const io = socketIoClient();

io.on('connect', () => {
  console.log('[hot] Connected');
});

io.on('build:started', () => {
  console.log('[hot] Build started');
});

io.on('build:error', err => {
  console.error(`[hot] Build error: ${err}`);
});

io.on('build:complete', ({files, removed}) => {
  // With the complete signal, we can start updating our assets
  // and begin the process of hot swapping code.

  const accepted = [];
  const unaccepted = [];

  forEach(files, (file, name) => {
    const mod = __modules.modules[name];

    // If it's a new module, we accept it
    if (!mod) {
      accepted.push(name);
      return;
    }

    // If the module is outdated, we check if we can update it
    if (mod.hash !== file.hash) {
      if (endsWith(name, '.css')) {
        // As css is stateless, we can blindly accept it
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
      message += `\n\nUpdates to the following modules have been blocked:\n${accepted.join('\n')}`
    }
    return console.warn(message);
  }

  // We try to avoid issues from concurrent-ish updates by resetting
  // the pending state so that any calls to `defineModule` will be ignored
  __modules.pending = {};

  // If a module has already been buffered for execution, we can ignore
  // updates for it
  __modules.buffered = __modules.buffered.filter(({name, hash}) => {
    if (includes(accepted, name) && files[name].hash === hash) {
      pull(accepted, name);
      return true;
    }
    return false;
  });

  if (removed.length) {
    removed.forEach(name => {
      // We need to clear the state for any modules that have been removed
      // so that if they are re-added, they are executed again. This could
      // cause some issues for crazily stateful js, but it's needed to ensure
      // that css changes are always applied
      __modules.modules[name] = undefined;

      // Ensure that the asset is removed from the document
      removeResource(name);
    });
    console.log(`[hot] Removed modules:\n${removed.join('\n')}`);
  }

  if (!accepted.length) {
    return console.log('[hot] No updates to apply');
  }

  accepted.forEach(name => {
    const file = files[name];

    updateResource(file.name, file.url);

    // Ensure that the runtime knows that we are waiting for this specific
    // versions of the module. We need to keep this synced so that we can
    // clear the buffered modules only when it's appropriate to
    __modules.pending[file.name] = file.hash;
  });

  // As css assets wont trigger a call to `defineModule`, we need to manually
  // call it to ensure that our module buffer is inevitably cleared and
  // the runtime's module registry is updated. This prevents an issue where
  // reverting a css asset to a hash that's in the registry will have no
  // effect as the registry and the document are out of sync
  accepted.forEach(name => {
    const file = files[name];

    if (endsWith(file.url, '.css')) {
      __modules.defineModule({
        name: file.name,
        hash: file.hash,
        factory: function(module) {
          module.exports = '';
        }
      });
    }
  });
});

function removeResource(name) {
  if (endsWith(name, '.css')) {
    return removeStylesheet(name);
  }

  if (endsWith(name, '.js')) {
    return removeScript(name);
  }

  // TODO: support .json
  console.warn(`[hot] Unknown file type ${name}, cannot remove`);
}

function updateResource(name, url) {
  if (endsWith(url, '.css')) {
    return replaceStylesheet(name, url);
  }

  if (endsWith(url, '.js')) {
    return replaceScript(name, url);
  }

  // TODO: support .json
  console.warn(`[hot] Unknown file type ${name}, cannot update`);
}

function replaceStylesheet(name, url) {
  const links = document.getElementsByTagName('link');

  // Update any matching <link> element
  let replaced = false;
  forEach(links, link => {
    const attributeName = link.getAttribute('data-unfort-name');
    if (attributeName === name) {
      link.href = url;
      replaced = true;
      return false;
    }
  });

  // Add a new <link>, if needed
  if (!replaced) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-unfort-name', name);
    document.head.appendChild(link);
  }
}

function removeStylesheet(name) {
  const links = document.getElementsByTagName('link');

  forEach(links, link => {
    const attributeName = link.getAttribute('data-unfort-name');
    if (attributeName === name) {
      link.parentNode.removeChild(link);
      return false;
    }
  });
}

function replaceScript(name, url) {
  // Clean up any pre-existing scripts
  removeScript(name);

  // Add a new <script> element
  const script = document.createElement('script');
  script.src = url;
  script.setAttribute('data-unfort-name', name);
  document.body.appendChild(script);
}

function removeScript(name) {
  const scripts = document.getElementsByTagName('script');

  forEach(scripts, script => {
    const attributeName = script.getAttribute('data-unfort-name');
    if (attributeName === name) {
      script.parentNode.removeChild(script);
      return false;
    }
  });
}