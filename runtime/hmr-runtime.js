import socketIoClient from 'socket.io-client';
import {isFunction} from 'lodash/lang';
import {forEach, includes, every} from 'lodash/collection';
import {keys} from 'lodash/object';
import {pull} from 'lodash/array';
import {startsWith, endsWith} from 'lodash/string';

// Preserve references to the runtime's core, before the
// monkey-patching begins
const buildModuleObject = __modules.buildModuleObject;
const addModule = __modules.addModule;

// A simple registry of <module_name> => {Boolean|Function}
// If a module accepts hmr, we track that so that we can know what
// we can and can't update hot. If a module specifies a function
// when it accepts hmr, we call the function just before we swap out
// the module
__modules.hmrAcceptedModules = Object.create(null);

// Monkey-patch `buildModuleObject` so that we can add the `hot` API
__modules.buildModuleObject = function hmrBuildModuleObjectWrapper(name) {
  const _module = buildModuleObject(name);

  _module.hot = {
    accept: (cb=true) => {
      __modules.hmrAcceptedModules[name] = cb;
    }
  };

  return _module;
};

// There's a bit of complexity in the handling of changed assets.
// In particular, JS modules that may depend on new dependencies
// introduce the potential for race conditions as we may or may
// not have a module available when we execute a dependent module.
//
// To get around these issues, we buffer all the JS modules
// and only start to apply them once every pending module has
// completed.
__modules.pending = {};
__modules.buffered = [];

// Monkey-patch `addModule` so that we can intercept incoming modules
__modules.addModule = function hmrAddModuleWrapper(moduleData, factory) {
  const {name, hash} = moduleData;

  // Prevent unexpected modules from being applied
  if (__modules.pending[name] === undefined) {
    return console.log(
      `Attempted to add module "${name}", but it is not registered as pending and will be ignored`
    );
  }

  // Prevent an unexpected version from being applied
  if (__modules.pending[name] !== hash) {
    return console.log(
      `Unexpected update for module ${name}. Hash ${hash} does not reflect the expected hash ${__modules.pending[name.hash]} and will be ignored`
    );
  }

  __modules.buffered.push({
    data: moduleData,
    factory
  });

  const readyToApply = every(__modules.buffered, _module => {
    const {name, hash} = _module.data;
    return __modules.pending[name] === hash;
  });

  if (readyToApply) {
    __modules.pending = {};
    const _buffered = __modules.buffered;
    __modules.buffered = [];
    
    _buffered.forEach(({data, factory}) => {
      const {name, hash} = data;

      // If `module.hot.accept` was passed a callback, call
      // it now so that we can execute the new version immediately
      if (isFunction(__modules.hmrAcceptedModules[name])) {
        __modules.hmrAcceptedModules[name]();
      }

      let previousHash = null;
      if (__modules.modules[name]) {
        previousHash = __modules.modules[name].data.hash;
      }

      // Reset the module exports cache
      __modules.cache[name] = undefined;

      // Update the runtime's module registry
      addModule(data, factory);

      // We reset this module's accepted state, so that the new version
      // is forced to re-accept
      __modules.hmrAcceptedModules[name] = undefined;

      let message;
      if (previousHash) {
        message = `Hot swapping ${name} from ${previousHash} to ${hash}`
      } else {
        message = `Initializing ${name} at hash ${hash}`
      }
      console.log(message);
    });

    _buffered.forEach(({data}) => {
      const {name} = data;
      // If we're applying multiple modules, it's possible that new
      // modules may execute other new modules, so we need to iterate
      // through and selectively execute modules that not have been
      // called yet
      if (__modules.cache[name] === undefined) {
        __modules.executeModule(name);
      }
    });
  }
};

const io = socketIoClient();

io.on('connect', () => {
  console.log('HMR connected');
});

io.on('build:started', () => {
  console.log('Build started');
});

io.on('build:error', err => {
  console.error(`Build error: ${err}`);
});

io.on('build:complete', ({files, removed}) => {
  // With the complete signal, we can start updating our assets
  // and begin the process of hot swapping code.
  //
  // *CSS*
  // new: we just add a new <link> element
  // changed: we change the `href` property of the element and the
  //   browser will automatically sync itself
  // removed: we simply remove the element
  //
  // *JS*
  // new: we append a script element, wait for it to execute and then
  //   pass the module wrapper up to the runtime
  // changed: similarly, we append and wait
  // removed: not much we can do as it's all in memory now :(

  const accepted = [];
  const unaccepted = [];

  forEach(files, (file, name) => {
    const _module = __modules.modules[name];

    // If it's a new module, we accept it
    if (!_module) {
      accepted.push(name);
      return;
    }

    // Has the build produced a new version of a module?
    if (_module.data.hash !== file.hash) {
      if (endsWith(name, '.css')) {
        // As CSS is stateless, we can blindly accept it
        accepted.push(name);
      } else if (__modules.hmrAcceptedModules[name]) {
        accepted.push(name);
      } else {
        unaccepted.push(name);
      }
    }
  });

  // If there were any unaccepted modules, we refuse to apply any changes
  if (unaccepted.length) {
    return console.warn(`Cannot accept changes. The following modules have not accepted hot swaps:\n${unaccepted.join('\n')}`);
  }

  // We try to avoid issues from concurrent-ish updates by resetting
  // the pending state so that any calls to `addModule` will be ignored
  __modules.pending = {};

  // If a JS module has already been added to the dom, and its module
  // is buffered for execution, we might end up removing it before it
  // ever gets executed. Hence, we need to filter out updates for any
  // module that we already have a matching version buffered
  __modules.buffered = __modules.buffered.filter(({data}) => {
    const {name, hash} = data;
    if (includes(accepted, name) && files[name].hash === hash) {
      pull(accepted, name);
    }
  });

  if (removed.length) {
    removed.forEach(name => {
      const file = files[name];

      // We need to clear the state for any modules that have been removed
      // so that if they are re-added, they are executed again. This could
      // cause some issues for stateful JS, but it's needed so that CSS
      // changes will always be applied (some race-conditions can prevent it)
      __modules.modules[file.name] = undefined;
      __modules.cache[file.name] = undefined;

      // Ensure that the asset is removed from the document
      removeResource(file.name, file.url);

      console.log(`Removed module ${file.name}`);
    });
  }

  if (!accepted.length) {
    return console.log('No updates to apply');
  }

  accepted.forEach(name => {
    const file = files[name];

    updateResource(file.name, file.url);
  });

  accepted.forEach(name => {
    const file = files[name];

    __modules.pending[file.name] = file.hash;

    // As CSS assets wont trigger a call to `addModule`, we need
    // to manually call it to ensure that our module buffer is
    // inevitably cleared and the runtime's module registry is
    // updated. This prevents some edge-cases where CSS assets
    // might not be updated
    if (endsWith(file.url, '.css')) {
      __modules.addModule(
        {
          name: file.name,
          hash: file.hash
        },
        function(module) {
          module.exports = '';
        }
      );
    }
  })
});

function removeResource(name, url) {
  console.log(`Removing resource ${name}`);

  if (endsWith(url, '.css')) {
    return removeStylesheet(name);
  }

  if (endsWith(url, '.js')) {
    return removeScript(name);
  }

  // TODO: support .json
  console.warn(`Unknown file type ${name}, cannot remove`);
}

function updateResource(name, url) {
  console.log(`Updating resource ${name}`);

  if (endsWith(url, '.css')) {
    return replaceStylesheet(name, url);
  }

  if (endsWith(url, '.js')) {
    return replaceScript(name, url);
  }

  // TODO: support .json
  console.warn(`Unknown file type ${name}, cannot update`);
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