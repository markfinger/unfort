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

  // Our registry of modules: 'name' => Object
  __modules.modules = Object.create(null);

  // This the entry point that enables our bootstrap process
  __modules.defineModule = function defineModule(mod) {
    __modules.modules[mod.name] = mod;

    return __modules.extendModule(mod);
  };

  // Adds some data and flags that we use during the
  // initialization process
  __modules.extendModule = function extendModuleObject(mod) {
    // A flag that we use to prevent multiple executions of a module
    // when cyclic dependencies are encountered
    if (mod.executed === undefined) {
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
    // should run in production mode or not, so we pass this in as a shim
    // when the factory is called
    if (mod.process === undefined) {
      mod.process = {
        env: {}
      };
    }

    return mod;
  };

  // After the bootstrap has completed, calling this kicks off the process
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
    mod.factory.call(
      // We invoke the factory with the global object as its `this`
      // value. This is mostly to shim around some old and crappy
      // libraries that assume this behaviour and use it to bind
      // global variables. Note: implicit `this` conflicts with
      // strict mode
      mod.global,
      // `module`
      mod.commonjs,
      // `exports`
      mod.commonjs.exports,
      // `require`
      mod.require,
      // `process`
      mod.process,
      // `global`
      mod.global
    );

    return mod.commonjs.exports;
  };

  // Given a module with a predefined set of dependencies, this produces
  // the `require` function that modules use to call other modules
  __modules.buildRequire = function buildRequire(mod) {
    return function require(id) {
      var depName = mod.deps[id];

      if (!depName) {
        throw new Error(
          'Module "' + mod.name + '" required an unknown identifier "' + id + '".\n' +
          'Available dependencies: ' + JSON.stringify(mod.deps, null, 2)
        );
      }

      var depMod = __modules.modules[depName];

      if (!depMod) {
        throw new Error(
          'Module "' + mod.name + '" required module "' + depName + '" but the module has not been defined'
        );
      }

      // If a module has already been evaluated, we return the values that it
      // exported. Note: we need to respect the `executed` flag to prevent
      // cyclic dependencies from triggering multiple executions of a module
      if (depMod.executed) {
        return depMod.commonjs.exports;
      }

      // Call the module's factory and return its exports
      return __modules.executeModule(depName);
    };
  };

}));