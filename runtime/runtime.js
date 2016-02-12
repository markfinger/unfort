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

  // Our registry of modules: 'name' => {Object}
  __modules.modules = Object.create(null);

  __modules.defineModule = function defineModule(mod) {
    __modules.modules[mod.name] = mod;

    return __modules.extendModule(mod);
  };

  __modules.extendModule = function extendModuleObject(mod) {
    // A flag that we use to prevent multiple executions of a module
    // when cyclic dependencies are encountered
    if (mod.executed = undefined) {
      mod.executed = false;
    }

    if (mod.commonjs === undefined) {
      // The `module` object that is passed to the factory
      mod.commonjs = {
        exports: {},
        // Expose the module to its factory, this is mostly to enable some
        // runtime introspection and hacks
        __module: mod
      };
    }

    // The `require` function passed to the factory
    if (mod.require === undefined) {
      mod.require = __modules.buildRequire(mod);
    }

    // When invoking the factory, we pass this in to shim around node's
    // `global` variable, which equates to `window` in a browser
    if (mod.global === undefined) {
      mod.global = global;
    }

    // A lot of Node modules use the `process` global to resolve if they
    // should run in production mode or not, we pass this as a shim to
    // when the factory is called
    if (mod.process === undefined) {
      mod.process = {env: {}};
    }

    return mod;
  };

  __modules.executeModule = function executeModule(name) {
    if (!__modules.modules[name]) {
      throw new Error('Unknown module "' + name + '"');
    }

    var mod = __modules.modules[name];

    // We need to indicate that the module has been executed so that
    // the require can handle cyclic dependencies. Otherwise, we end
    // up with inexplicable and endless recursive loops as we
    // re-evaluate the same modules over and over
    mod.executed = true;

    // Invoke the module's factory with a barrage of shims and wiring
    mod.factory.call(mod.global, mod.commonjs, mod.commonjs.exports, mod.require, mod.process, mod.global);

    return mod.commonjs.exports;
  };

  __modules.buildRequire = function buildRequire(mod) {
    // Construct the `require` function that maps dependency identifiers
    // other modules in the system
    return function require(id) {
      var depName = mod.deps[id];

      if (!depName) {
        throw new Error(
          'Module "' + mod.name + '" required an unknown identifier "' + id + '". ' +
          'Available dependencies: ' + JSON.stringify(mod.deps, null, 2)
        );
      }

      var depMod = __modules.modules[depName];

      // We need to respect the `executed` flag to prevent cyclic dependencies
      // from triggering multiple executions of a module
      if (depMod.executed) {
        return depMod.commonjs.exports;
      }

      // Call the module's factory and return its exports
      return __modules.executeModule(depName);
    };
  };

}));