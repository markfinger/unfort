(function (root, factory) {
  if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
    // CommonJS
    factory(exports);
  } else {
    // Browser globals
    if (root.__modules !== undefined) {
      throw new Error('`__modules` has already been bound on the root', root.__modules);
    }
    factory((root.__modules = {}));
  }
}((typeof window == 'object' ? window : global), function (exports) {

  var __modules = exports;

  __modules.modules = Object.create(null);
  __modules.exportsCache = Object.create(null);
  __modules.process = {env: {}};

  __modules.addModule = function(data, factory) {
    __modules.modules[data.name] = {
      dependencies: data.dependencies,
      factory: factory
    };
  };

  __modules.buildModuleObject = function(name) {
    return {
      exports: {}
    };
  };

  __modules.executeModule = function(name) {
    if (!__modules.modules[name]) {
      throw new Error('Unknown module "' + name + '"');
    }

    var data = __modules.modules[name];

    var _module = __modules.buildModuleObject(name);

    var require = __modules.buildRequire(name, data.dependencies);

    // Bind the initial exports object to handle circular dependencies
    __modules.exportsCache[name] = _module.exports;

    data.factory.call(window, _module, _module.exports, require, __modules.process, window);

    // Re-bind the exports object to handle redefinitions of `module.exports`
    __modules.exportsCache[name] = _module.exports;

    return _module.exports;
  };

  __modules.buildRequire = function(name, dependencies) {
    return function require(identifier) {
      var moduleName = dependencies[identifier];

      if (!moduleName) {
        throw new Error(
          'Module "' + name + '" required an unknown identifier "' + identifier + '".' +
          'Available dependencies: ' + JSON.stringify(dependencies, null, 2)
        );
      }

      if (__modules.exportsCache[moduleName] === undefined) {
        __modules.exportsCache[moduleName] = __modules.executeModule(moduleName);
      }

      return __modules.exportsCache[moduleName];
    };
  };

}));