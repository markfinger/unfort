(function (root, factory) {
  if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
    // CommonJS
    factory(exports);
  } else {
    // Browser globals
    if (root.__modules !== undefined) {
      throw new Error('`__modules` has already been bound on the root', root.__modules);
    }
    factory((root.__modules = {}), root);
  }
}((typeof window == 'object' ? window : global), function (exports, global) {

  var __modules = exports;

  __modules.modules = Object.create(null);
  __modules.cache = Object.create(null);
  __modules.process = {env: {}};

  __modules.addModule = function(data, factory) {
    __modules.modules[data.name] = {
      data: data,
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

    var data = __modules.modules[name].data;
    var factory = __modules.modules[name].factory;

    var _module = __modules.buildModuleObject(name);

    var require = __modules.buildRequire(name, data.dependencies);

    // The exports cache uses a wrapper object so that we can perform
    // `undefined` checks when evaluating if a module has been executed.
    // We could call `Object.hasOwnProperty`, but that introduces
    // edge-cases for removed entries
    __modules.cache[name] = {
      name: name,
      // Bind the initial exports object to handle circular dependencies
      exports: _module.exports
    };

    factory.call(global, _module, _module.exports, require, __modules.process, global);

    // Re-bind the exports object to handle redefinitions of `module.exports`
    __modules.cache[name].exports = _module.exports;

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

      if (__modules.cache[moduleName] !== undefined) {
        return __modules.cache[moduleName].exports;
      }

      return __modules.executeModule(moduleName);
    };
  };

}));