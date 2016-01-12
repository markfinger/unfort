(function (root, factory) {
  console.log(root, factory)
  if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
    // CommonJS
    factory(exports);
  } else {
    // Browser globals
    factory((root.__modules = {}));
  }
}((typeof window == 'object' ? window : global), function (exports) {

  const modules = Object.create(null);
  const exportsCache = Object.create(null);
  const process = {env: {}};

  function addModule(name, dependencies, factory) {
    modules[name] = {dependencies, factory};
  }

  function executeModule(name) {
    const {dependencies, factory} = modules[name];

    const _module = {
      exports: {}
    };
    const require = buildRequire(name, dependencies);

    // Bind the initial exports object to handle circular dependencies
    exportsCache[name] = _module.exports;

    factory.call(window, _module, _module.exports, require, process, window);

    // Re-bind the exports object to handle redefinitions of `module.exports`
    exportsCache[name] = _module.exports;

    return _module.exports;
  }

  function buildRequire(name, dependencies) {
    const resolved = Object.create(null);

    dependencies.forEach(function(deps) {
      resolved[deps[0]] = deps[1];
    });

    return function require(identifier) {
      const depName = resolved[identifier];
      if (depName) {
        if (!exportsCache[depName]) {
          exportsCache[depName] = executeModule(depName);
        }
        return exportsCache[depName];
      } else {
        throw new Error(
          `'Module "${name}" required an unknown identifier "${identifier}". Available dependencies ${JSON.stringify(dependencies, null, 2)}`
        );
      }
    };
  }

  exports.modules = modules;
  exports.exportsCache = exportsCache;
  exports.addModule = addModule;
  exports.executeModule = executeModule;
  exports.buildRequire = buildRequire;

}));