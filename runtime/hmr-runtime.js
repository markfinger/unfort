import socketIoClient from 'socket.io-client';
import {isFunction} from 'lodash/lang';
import {forEach} from 'lodash/collection';
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

const addModule = __modules.addModule;
__modules.addModule = function hmrAddModuleWrapper(moduleData, factory) {
  const {name} = moduleData;

  addModule(moduleData, factory);

  if (__modules.hmrAcceptedModules[name]) {
    // If the module has specified a function to be called
    // when it is swapped, execute it before the swap
    if (isFunction(__modules.hmrAcceptedModules[name])) {
      __modules.hmrAcceptedModules[name]();
    }

    // Reset the accepted state, so that the swapped module is
    // forced to re-accept
    __modules.hmrAcceptedModules[name] = false;

    __modules.executeModule(name);

    console.log(`Hot swapped ${name}`);
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
    __modules.exportsCache[node] = undefined

  for node in updated:
    if __modules.exportsCache[node] === undefined:
      __modules.executeModule(node)

on signal while pending update:

 */

io.on('build:complete', ({files}) => {
  //console.log('Build complete', files);

  const updated = [];
  const unaccepted = [];

  forEach(files, (file, name) => {
    const _module = __modules.modules[name];

    if (!_module) {
      updated.push(name);
      return;
    }

    //console.log(file, _module.data.hash, file.hash);
    if (_module.data.hash !== file.hash) {
      if (__modules.hmrAcceptedModules[name]) {
        updated.push(name);
      } else {
        unaccepted.push(name);
      }
    }
  });

  if (unaccepted.length) {
    return console.log('Cannot accept HMR. The following modules have not accepted: ', unaccepted);
  }

  if (!updated.length) {
    return console.log('No changes to apply');
  }

  //console.log('updated', updated)

  updated.forEach(name => {
    const file = files[name];
    updateResource(name, file.url);
  })
});

function updateResource(name, toUrl) {
  console.log(`Updating resource ${name}`);

  if (endsWith(toUrl, '.css')) {
    return replaceStylesheet(name, toUrl);
  }

  // TODO: support .json
  if (endsWith(toUrl, '.js')) {
    return replaceScript(name, toUrl);
  }

  console.warn(`Unknown file type ${name}, cannot update`);
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
    document.head.appendChild(link);
  }
}

function replaceScript(name, toUrl) {
  // Add a new <script> element
  const script = document.createElement('script');
  script.src = toUrl;
  document.body.appendChild(script);

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