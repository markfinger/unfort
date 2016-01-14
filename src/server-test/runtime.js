(function (root, factory) {
  if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
    // CommonJS
    factory(exports);
  } else {
    // Browser globals
    factory((root.__modules = {}));
  }
}((typeof window == 'object' ? window : global), function (exports) {

  const __modules = exports;

  __modules.modules = Object.create(null);
  __modules.exportsCache = Object.create(null);
  __modules.process = {env: {}};

  __modules.addModule = (name, dependencies, factory) => {
    __modules.modules[name] = {dependencies, factory};
  };

  __modules.buildModuleObject = (name) => {
    return {
      exports: {}
    };
  };

  __modules.executeModule = (name) => {
    if (!__modules.modules[name]) {
      throw new Error(`Unknown module "${name}"`);
    }

    const {dependencies, factory} = __modules.modules[name];

    const _module = __modules.buildModuleObject(name);

    const require = __modules.buildRequire(name, dependencies);

    // Bind the initial exports object to handle circular dependencies
    __modules.exportsCache[name] = _module.exports;

    factory.call(window, _module, _module.exports, require, __modules.process, window);

    // Re-bind the exports object to handle redefinitions of `module.exports`
    __modules.exportsCache[name] = _module.exports;

    return _module.exports;
  };

  __modules.buildRequire = (name, dependencies) => {
    const resolved = Object.create(null);

    dependencies.forEach(function(deps) {
      resolved[deps[0]] = deps[1];
    });

    return function require(identifier) {
      const depName = resolved[identifier];
      if (depName) {
        if (!__modules.exportsCache[depName]) {
          __modules.exportsCache[depName] = __modules.executeModule(depName);
        }
        return __modules.exportsCache[depName];
      } else {
        throw new Error(
          `'Module "${name}" required an unknown identifier "${identifier}". Available dependencies ${JSON.stringify(dependencies, null, 2)}`
        );
      }
    };
  };

}));