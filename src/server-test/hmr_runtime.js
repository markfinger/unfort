import socketIoClient from 'socket.io-client';
import {isFunction} from 'lodash/lang';

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
__modules.addModule = function hmrAddModuleWrapper(name, dependencies, factory) {
  addModule(name, dependencies, factory);

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
  console.log(`Change detected in ${url}`);

  const script = document.createElement('script');
  script.src = url;
  document.body.appendChild(script);
});