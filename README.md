# unfort

An opinionated build tool for development environments.


- [Installation](#installation)
- [Design Goals](#design-goals)
- [Bootstrap Runtime](#bootstrap-runtime)
- [Hot Runtime](#hot-runtime)
  - [Proxy bindings](#proxy-bindings)
  - [module.hot API](#modulehot-api)
  - [module.hot.accept](#modulehotaccept)
  - [module.hot.changes](#modulehotchanges)
  - [module.hot.exit](#modulehotexit)
  - [module.hot.enter](#modulehotenter)
- [The Build Process at a High-Level](#the-build-process-at-a-high-level)
- [Development Notes](#development-notes)
  - [Status](#status)
  - [Scripts](#scripts)
  - [Related Packages](#related-packages)


## Installation

```
npm install --save unfort
```

## Design Goals

Aim for:

- **Rapid feedback loops during development.**
  Changes should be applied in milliseconds, regardless of the codebase size.
  Enable a REPL-like experience from the comfort of a text editor.
- **Improve build times with persistent caching.**
  Write the expensive data to disk. Repeated builds should reuse the data.
  Cache invalidation should be smart, but when it fails, allow all the data
  to be nuked.
- **Code over configuration.**
  Provide a minimal set of options for hard-coded wiring. Expose the entire
  pipeline and allow any part to be overridden. Enable experimentation.
- **Support for modern tooling out of the box.**
  Ship with support for `babel` and `postcss`.
- **Support for the most common file formats.**
  Support JS, JSON and CSS. By default, treat all other formats as plain-text
  or binary.
- **A focused codebase.**
  Reduce bloat and complexity by only providing support for the simple and
  common use-case.

Things to _explicitly avoid_:

- **Support for production environments.**
  Production environments require an entirely different set of features from
  a development environment. Supporting both is a terrible idea. Just use
  webpack or browserify.
- **Config files.**
  If a configuration file requires more than 20 lines, the build tool is
  probably trying to do too many things.
- **Support for tool _X_ or file format _Y_.**
  Integrating other tooling or file formats should be left entirely up to the
  user.
- **Support older versions of _X_.**
  Support evergreen browsers from vendors who keep pace with standards.
  Support the latest version of Node.
- **Abstractions: CLIs, plugins, loaders, etc.**
  Make the minimal amount of abstractions necessary. Whenever possible, push
  boilerplate into user-space. Avoid one-liners.


## Bootstrap Runtime

The bootstrap runtime provides a module system that mimics the commonjs system
used by Node. The bootstrap exposes a global variable `__modules` that allows
modules to be injected and executed.

> The bootstrap is designed to be monkey-patched. The hooks exposed are intended
> to enable experimental features during runtime.

The bootstrap's API:

```js
// An object used as the runtime's registry of modules
__modules.modules

// Injects a module into the runtime
__modules.defineModule(mod)

// Extends the module object with properties used
// for bookkeeping
__modules.extendModule(mod)

// Invokes the specified module
__modules.executeModule('name')

// Returns the values that a module exported
__modules.getModuleExports(mod)

// Builds the `require` function for a specific module
__modules.buildRequire(mod)
```


## Hot Runtime

The hot runtime monkey-patches the bootstrap runtime to add support for hot
swapping of assets.

### Proxy bindings

To provide an improved development workflow, the hot runtime provides proxy
bindings between modules. These bindings are updated when a dependency is
swapped so that updates to one part of a system automatically cascade and
change the entire system's behaviour.

Mindful of the more dynamic system that proxy bindings enable, additional
methods are available on the `module.hot` object which provide more control
when dealing with the module life-cycle.


### module.hot API

To hook into the hot swap system, JS assets are provided with a `module.hot`
API that loosely resembles Webpack's HMR.

> Note: as stylesheets and JSON are inherently stateless, they are automatically
> hot swapped when changes occur.


#### module.hot.accept()

Allows you to denote that a file can be hot swapped.

```js
module.hot.accept();
```

Accepts an optional callback that will be executed after the module has been
removed.

```js
module.hot.accept(() => {
  // ...
});
```

#### module.hot.changes

Allows you to specify a callback that will be repeatedly triggered when a hot
swap phase completes. This enables you to re-render a tree or regenerate data
from bindings that now use updated code paths.

> If the module that specified the callback is one of the swapped modules, the
> callback will *not* be called.

```js
function render() {
  // ...
}

module.hot.changes(render);
```

#### module.hot.exit

Allows you to pass data from one module version to another.

When a module is about to be swapped, the callback passed to `module.hot.exit` will
be called and the return value will be stored for the next version.

> `module.hot.exit` automatically accepts hot swaps, so you don't need to call
> `module.hot.accept` as well.

```js
module.hot.exit(() => {
  return state
});
```


#### module.hot.enter

Allows you to read in data from previous versions of the module. When a new version
of a module is being executed, callbacks passed to `module.hot.enter` will be
synchronously called with one argument: the value returned from the previous
version's `module.hot.exit` callback.

> Callbacks passed to `module.hot.enter` will only be called when a **new**
> version is entering. They will not be called when a module first initializes.

```js
module.hot.enter(prevState => {
  state = prevState;
  // ...
});
```

### The Build Process at a High-Level

Given a set of files that represent entry points to a codebase, the dependency
graph will start tracing out each node by recursively asking the pipeline for
the resolved dependencies of the file.

For the pipeline to produce a list of resolved dependencies, the following
steps will typically occur:
 - read the file into memory
 - produce an AST by parsing the file
 - traverse the AST and look for dependency identifiers
 - inspect the file-system to resolve each identifier to another file

As dependencies are resolved, the graph creates nodes and edges that represent
the connections between files. Once all nodes have been identified, the graph
emits a signal that indicates the end of the tracing process, and we enter the
code generation phase.

Code generation involves a number of processes that include:
 - transforming ASTs via babel or postcss
 - rendering ASTs to code
 - generating source maps
 - generating a module shims that enable the code to function in a browser

The completion of the code generation signals the end of the build, at which
point we can start sending signals to the front-end to update its assets.


## Development Notes

### Status

[![npm version](https://badge.fury.io/js/unfort.svg)](https://badge.fury.io/js/unfort)
[![Build Status](https://travis-ci.org/markfinger/unfort.svg?branch=master)](https://travis-ci.org/markfinger/unfort)
[![codecov.io](https://codecov.io/github/markfinger/unfort/coverage.svg?branch=master)](https://codecov.io/github/markfinger/unfort?branch=master)
[![Dependency Status](https://david-dm.org/markfinger/unfort.svg)](https://david-dm.org/markfinger/unfort)
[![devDependency Status](https://david-dm.org/markfinger/unfort/dev-status.svg)](https://david-dm.org/markfinger/unfort#info=devDependencies)


### Scripts

The following commands are available to interact with unfort's code-base:

- `npm run build` builds the project into a form that node can interpret.
  > Once Node reaches parity with the ES2015 spec, the build process will be
  > removed.
- `npm test` runs the test suite with source maps.
- `npm run _test` runs the test suite without source maps. Sometimes the stack
  traces get a bit messed up with the source maps, so this can help to debug.
- `npm run lint` runs `eslint` over the project.
- `npm run coverage` runs the test suite and generates a coverage report in the
  "coverage" directory.


### Related Packages

These packages used to live in unfort, but have been externalized, you may find
it useful to read or improve their codebases:

- [cyclic-dependency-graph](https://github.com/markfinger/cyclic-dependency-graph)
  Provides the wiring to recursively build a graph of the codebase.
- [record-store](https://github.com/markfinger/record-store)
  Wires up our pipeline and provides memoization and asynchronous resolution of jobs.
- [kv-cache](https://github.com/markfinger/kv-cache)
  A persistent cache used to reduce the time spent on repeated builds.
- [env-hash](https://github.com/markfinger/env-hash)
  Enables cache-busting when packages or specific files are changed.
- [babylon-ast-dependencies](https://github.com/markfinger/babylon-ast-dependencies)
  Extracts dependency identifiers from `babylon` ASTs.
- [postcss-ast-dependencies](https://github.com/markfinger/postcss-ast-dependencies)
  Extracts dependency identifiers from `postcss` ASTs.