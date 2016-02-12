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

  __modules.addModule = function addModule(mod) {
    __modules.modules[mod.name] = mod;

    return __modules.extendModule(mod);
  };

  __modules.extendModule = function extendModuleObject(mod) {
    if (mod.executed = undefined) {
      mod.executed = false;
    }

    if (mod.commonjs === undefined) {
      mod.commonjs = {
        exports: {}
      };
    }

    if (mod.require === undefined) {
      __modules.buildRequire(mod);
    }

    if (mod.global === undefined) {
      mod.global = global;
    }

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

    mod.factory.call(mod.global, mod.commonjs, mod.commonjs.exports, mod.require, mod.process, mod.global);

    return mod.commonjs.exports;
  };

  __modules.buildRequire = function buildRequire(mod) {
    mod.require = function require(id) {
      var depName = mod.deps[id];

      if (!depName) {
        throw new Error(
          'Module "' + name + '" required an unknown identifier "' + id + '".' +
          'Available dependencies: ' + JSON.stringify(mod.deps, null, 2)
        );
      }

      var depMod = __modules.modules[depName];

      if (depMod.executed) {
        return depMod.commonjs.exports;
      }

      return __modules.executeModule(depName);
    };
  };

}));