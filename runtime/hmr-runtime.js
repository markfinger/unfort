import socketIoClient from 'socket.io-client';
import {isFunction} from 'lodash/lang';
import {forEach} from 'lodash/collection';
import {keys} from 'lodash/object';
import {startsWith, endsWith} from 'lodash/string';

__modules.hmrAcceptedModules = Object.create(null);

const buildModuleObject = __modules.buildModuleObject;
__modules.buildModuleObject = function hmrBuildModuleObjectWrapper(name) {
  const _module = buildModuleObject(name);

  _module.hot = {
    accept: (cb=true) => {
      __modules.hmrAcceptedModules[name] = cb;
    }
  };

  return _module;
};

let pending = {};
let buffered = [];
const addModule = __modules.addModule;
__modules.addModule = function hmrAddModuleWrapper(moduleData, factory) {
  const {name, hash} = moduleData;

  console.log('add module', name, hash)
  console.log('pending', pending)
  console.log('buffered', buffered)

  if (pending[name] === undefined) {
    return console.log(`Module ${name} is not pending and will be ignored`);
  }

  if (pending[name] !== hash) {
    return console.log(
      `Hash ${hash} is out of date. Update for ${name} will be ignored in favour of ${pending[name.hash]}`
    );
  }

  buffered.push([moduleData, factory]);

  console.log(buffered.length, keys(pending).length, buffered.length === keys(pending).length)
  if (buffered.length === keys(pending).length) {
    const _buffered = buffered;

    pending = {};
    buffered = [];

    console.log('_buffered', _buffered)

    _buffered.forEach(([moduleData, factory]) => {
      if (isFunction(__modules.hmrAcceptedModules[moduleData.name])) {
        __modules.hmrAcceptedModules[moduleData.name]();
      }

      __modules.cache[moduleData.name] = undefined;

      addModule(moduleData, factory);

      // Reset the accepted state, so that the swapped module is
      // forced to re-accept
      __modules.hmrAcceptedModules[moduleData.name] = false;
    });

    _buffered.forEach(([moduleData]) => {
      if (__modules.cache[moduleData.name] === undefined) {
        __modules.executeModule(moduleData.name);

        console.log(`Hot swapped ${moduleData.name}`);
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

/*
on signal:
  nodes = {}

  updated = []
  unaccepted = []

  for node in nodes:
    if node not in nodes:
      updated.push(node)
    else if nodes[node].version !== node.version:
      if nodes[node].acceptedHMR:
        updated.push(node)
      else:
        unaccepted.push(node)

  if unaccepted.length:
    console.log('Cannot update as ${unaccepted} have not accepted hmr');
    return

  for node in updated:
    update_node(node)

on all updated:
  for node in updated:
    __modules.modules[node] = module
    __modules.cache[node] = undefined

  for node in updated:
    if __modules.cache[node] === undefined:
      __modules.executeModule(node)

on signal while pending update:

 */

io.on('build:complete', ({files, removed}) => {
  //console.log('Build complete', files);

  const updated = [];
  const unaccepted = [];

  forEach(files, (file, name) => {
    const _module = __modules.modules[name];

    // TODO: handle new deps for JS files

    if (!_module) {
      updated.push(name);
      return;
    }

    if (_module.data.hash !== file.hash) {
      if (endsWith(name, '.css')) {
        updated.push(name);
      } else if (__modules.hmrAcceptedModules[name]) {
        updated.push(name);
      } else {
        unaccepted.push(name);
      }
    }
  });

  if (unaccepted.length) {
    return console.log('Cannot accept HMR. The following modules have not accepted: ', unaccepted);
  }

  if (removed.length) {
    removed.forEach(name => {
      __modules.modules[name] = undefined;
      __modules.cache[name] = undefined;
      removeResource(name);
    });
  }

  if (!updated.length) {
    return console.log('No changes to apply');
  }

  updated.forEach(name => {
    const file = files[name];
    updateResource(name, file.url);
  });

  pending = {};
  buffered = [];
  updated.forEach(file => {
    pending[file] = files[file].hash;
    if (endsWith(file, '.css')) {
      buffered.push([
        {
          name: file,
          hash: files[file].hash
        },
        function(module) {
          module.exports = '';
        }
      ]);
    }
  })
});

function removeResource(name) {
  console.log(`Removing resource ${name}`);

  if (endsWith(name, '.css')) {
    return removeStylesheet(name);
  }

  if (endsWith(name, '.js')) {
    return removeScript(name);
  }

  // TODO: support .json
  console.warn(`Unknown file type ${name}, cannot remove`);
}

function updateResource(name, toUrl) {
  console.log(`Updating resource ${name}`);

  if (endsWith(toUrl, '.css')) {
    return replaceStylesheet(name, toUrl);
  }

  if (endsWith(toUrl, '.js')) {
    return replaceScript(name, toUrl);
  }

  // TODO: support .json
  console.warn(`Unknown file type ${name}, cannot update`);
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

function replaceStylesheet(name, toUrl) {
  const links = document.getElementsByTagName('link');

  let replaced = false;
  forEach(links, link => {
    const attributeName = link.getAttribute('data-unfort-name');
    if (attributeName === name) {
      link.href = toUrl;
      replaced = true;
      return false;
    }
  });

  // Add a new <link>, if needed
  if (!replaced) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = toUrl;
    link.setAttribute('data-unfort-name', name);
    document.head.appendChild(link);
  }
}

function removeScript(name) {
  // Remove any current <script> element
  const scripts = document.getElementsByTagName('script');
  forEach(scripts, script => {
    const attributeName = script.getAttribute('data-unfort-name');
    if (attributeName === name) {
      script.parentNode.removeChild(script);
      return false;
    }
  });
}

function replaceScript(name, toUrl) {
  // Add a new <script> element
  const script = document.createElement('script');
  script.src = toUrl;
  script.setAttribute('data-unfort-name', name);
  document.body.appendChild(script);

  removeScript(name);
}