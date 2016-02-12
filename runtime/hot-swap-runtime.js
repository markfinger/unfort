import {isFunction, isObject} from 'lodash/lang';

if (!isFunction(Object.setPrototypeOf)) {
  throw new Error('Object.setPrototypeOf has not been defined, hot swap cannot occur');
}

if (!isFunction(Object.getPrototypeOf)) {
  throw new Error('Object.getPrototypeOf has not been defined, hot swap cannot occur');
}

const updateCache = __modules.updateCache;

__modules.hotSwapExportReferences = Object.create(null);

function swapModuleExportsPrototype(name, _module) {
  const exports = _module.exports;

  if (!__modules.hotSwapExportReferences[name]) {
    __modules.hotSwapExportReferences[name] = {};
  }

  const cachedExports = __modules.hotSwapExportReferences[name];

  if (
    isObject(exports) &&
    isObject(cachedExports) &&
    Object.getPrototypeOf(cachedExports) !== exports
  ) {
    Object.setPrototypeOf(cachedExports, exports);
    __modules.cache[name].exports = cachedExports;
    _module.exports = cachedExports;
  }
}

__modules.updateCache = function updateCacheHotSwapWrapper(name, _module, isExitCheck) {
  if (
    isExitCheck &&
    _module.exports &&
    _module.exports.__esModule
  ) {
    //console.log('swapping', name, _module.exports)
    return swapModuleExportsPrototype(name, _module);
  }

  updateCache(name, _module, isExitCheck);
};

/*
before initial call:
  define `exports` argument as an object
  define `module.exports = {__proto__: exports}`

after call:
  if `module.exports && module.exports.__esModule`
    flag the module as swappable

before hot replacement:
  if module is swappable and has accepted swapping:
    store current `module.exports`

after hot replacement:
  if module is swappable and has accepted swapping:
    assign new `module.exports.__proto__` over previous `module.exports.__proto__`
 */

/*

Hot-swap API

Otherwise, should we simply rely on `HMR` to handle the acceptance,
and swapping would only be triggered for __esModule flagged modules?
Actually, that's a good idea. We're heavily dependent on how babel
rigs up the import lookups, so it's reasonable to look for that flag

if (module.swap) {
  module.swap.accept();
}

const someState = {};
if (module.swap) {
  module.swap.accept(exports => {
    exports.someState = someState;
  });

  module.swap.exit(exports => {
    cleanUp(someState);
  });
}

if (module.swap) {
  module.swap.completed(() => {
    // Called whenever one or more modules have been swapped
    reRenderWholeApp();
  });
}
*/
