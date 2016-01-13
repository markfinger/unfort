import socketIoClient from 'socket.io-client';

const {
  addModule, hmrAcceptedModules, executeModule, modules
} = __modules;
__modules.addModule = hmrAddModuleWrapper;

let start;

function hmrAddModuleWrapper(name, dependencies, factory) {
  addModule(name, dependencies, factory);

  if (modules[name] && hmrAcceptedModules.indexOf(name) !== -1) {
    executeModule(name);
    console.log((new Date()).getTime() - start);
  }
}

console.log('hmr booting');

const io = socketIoClient();
io.on('hmr', (msg) => {
  start = (new Date()).getTime();
  const {url, file} = msg;
  console.log('hmr', url, file);

  const script = document.createElement('script');
  script.src = url;
  document.body.appendChild(script);
});