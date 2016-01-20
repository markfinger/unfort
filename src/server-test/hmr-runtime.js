import socketIoClient from 'socket.io-client';
import {isFunction} from 'lodash/lang';
import {forEach} from 'lodash/collection';
import {startsWith, endsWith} from 'lodash/string';

__modules.hmrAcceptedModules = Object.create(null);

const buildModuleObject = __modules.buildModuleObject;
__modules.buildModuleObject = function hmrBuildModuleObjectWrapper(name) {
  const _module = buildModuleObject(name);

  _module.hot = {
    accept: (cb) => {
      __modules.hmrAcceptedModules[name] = cb || true;
    }
  };

  return _module
};

const addModule = __modules.addModule;
__modules.addModule = function hmrAddModuleWrapper(moduleData, factory) {
  const {name} = moduleData;

  addModule(moduleData, factory);

  if (__modules.hmrAcceptedModules[name]) {
    console.log(`[hmr] ${name}`);

    // If the module has specified a function to be called
    // when it is swapped, execute before the swap
    if (isFunction(__modules.hmrAcceptedModules[name])) {
      __modules.hmrAcceptedModules[name]();
    }

    // Reset the accepted state, so that the swapped module is
    // forced to re-accept
    __modules.hmrAcceptedModules[name] = false;

    __modules.executeModule(name);
  }
};

const io = socketIoClient();
io.on('hmr', (msg) => {
  const {url} = msg;

  console.log(`Change detected for ${url}`);

  if (endsWith(url, '.css')) {
    const links = document.getElementsByTagName('link');
    forEach(links, (node) => {
      const href = node.getAttribute('href');
      if (startsWith(href, url)) {
        node.href = url + '?hash=' + (new Date()).getTime();
        return false;
      }
    });
  } else {
    const script = document.createElement('script');
    script.src = url;
    document.body.appendChild(script);
  }
});