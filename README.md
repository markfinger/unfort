# unfort

A build tool for the web that targets development environments.

Does some novel stuff:
 - **Hot swaps in milliseconds**, regardless of the codebase size
 - **Persistent caching** to optimize start time
 - **Live bindings** that automatically update module imports during hot swaps

Does some standard stuff:
 - Built-in support for JS, JSON, CSS, and binary (image/font/etc) files
 - Exposes a babel & postcss pipeline by default - but happily accepts overrides

Some stuff that I'm currently using it for:
 - Replacing webpack in development environments
 - Enabling a REPL-like experience for prototyping
 - Providing asset hot-swaps when hacking on non-JS systems

> Note: this is both an experimental and personal project. The docs are intentionally
  high-level as changes are frequent and (often) breaking. You probably shouldn't use
  this unless you're happy to hack on stuff.


## Documentation

 - [Installation](#installation)
 - [Background](#background)
 - [Design Goals](#design-goals)
 - [Bootstrap Runtime](#bootstrap-runtime)
 - [Hot Runtime](#hot-runtime)
   - [Live Bindings](#live-bindings)
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


## Background

For a bit of context: webpack's pretty amazing when you get started on a project, but
performance drops sharply as your codebase grows. This sucks when you just want to hack
on stuff.

Basically, this is a re-implementation of some of
[webpack's](https://github.com/webpack/webpack) features, with the big caveat that
zero-consideration is given for production environments - in that situation, webpack
(or whatever) is fine.

Probably the biggest performance win that unfort has over webpack is a lack of a
bundling phase. Unfort skips the need for a bundle by constructing simple shims that
allow the entire codebase to be streamed directly out of memory and into the browser.

On the parsing side, unfort's faster when handling files that are transformed with
babel as it re-uses the AST for dependency analysis.

Unlike webpack's slow initial builds, unfort's reuse cached data to achieve much faster
builds. After ~1s of reading in and validating data, the build will complete. As unfort
stores data on a per-file basis, initial builds with only partial data will still
complete in a fraction of the usual time.

> Note: this is all a bit hand-wavy and simplified. If you've got any questions, feel
  free to open an issue and ask.


## Design Goals

Aim for:

- **Rapid feedback loops during development.**
  Changes should be applied in milliseconds, regardless of the codebase size.
  Enable a REPL-like experience from the comfort of a text editor.
- **Improve build times with persistent caching.**
  Write the expensive data to disk. Repeated builds should reuse the data.
  Cache invalidation should be smart, but when it fails, allow all the data
  to be easily nuked.
- **Code over configuration.**
  Provide a minimal set of options for hard-coded wiring. Expose the entire
  pipeline and allow any part to be overridden. Enable experimentation.
- **Support for modern tooling out of the box.**
  Ship with support for `babel` and `postcss`.
- **Support for the most common file formats.**
  Support JS, JSON and CSS. Assume all other formats are plain-text or binary
  and can be streamed from disk.
- **A focused codebase.**
  Reduce bloat and complexity by only providing support for the simple and
  common use-case.

Things to _explicitly avoid_:

- **Abstractions: config files, CLIs, plugins, loaders, etc.**
  Make the most minimal amount of abstractions necessary for the common
  use-case. Whenever possible, push boilerplate into user-space. Avoid
  one-liners.
- **Support for production environments.**
  Production environments require an entirely different set of features from
  a development environment. Supporting the needs of both is well outside of
  scope. Just use webpack or browserify.
- **Support for tool _X_ or file format _Y_.**
  Integrating other tooling or file formats should be left entirely up to the
  user.
- **Support older versions of _X_.**
  Aim to support evergreen browsers and the latest version of Node.


## Bootstrap Runtime

The bootstrap runtime provides a module system that mimics the commonjs system
used by Node. It exposes a global variable `__modules` that allows modules to
be injected into a registry and executed.

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

> Note: The bootstrap is designed to be monkey-patched. The hooks exposed are
  intended to enable experimental features during runtime.


## Hot Runtime

The hot runtime monkey-patches the bootstrap to add support for hot swapping
of assets.


### Live Bindings

To provide an improved development workflow, the hot runtime slips proxies
between module bindings so that imports are automatically updated when hot
swaps occur. In effect, updates to one part of a codebase immediately change
the entire system's behaviour.

Mindful of the more dynamic system that live bindings enable, there are a
number of methods available on the `module.hot` object which provide more
control over module life-cycles during hot swaps.


### module.hot API

To hook into the hot swap system, JS assets are provided with a `module.hot`
API that loosely resembles Webpack's HMR.

Note: As CSS and JSON files should be considered stateless, they are automatically
swapped when changes occur.


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

Allows you to specify a callback that will be triggered each time that the hot
swap phase completes. This enables you to re-render a tree or recalculate data
using proxy bindings that use the most recent code.

```js
function render() {
  // ...
}

module.hot.changes(render);
```

> Note: If the module that specified the callback is one of the modules that is
  swapped, the `changes` callback will *not* be called.

#### module.hot.exit

Allows you to pass data from one version of a module to the next. When a module is
about to be swapped, the callback passed to `module.hot.exit` will be executed and
the return value will be stored for the next version.

```js
let state = {
  // ...
};

module.hot.exit(() => state);
```

> Note: `module.hot.exit` automatically accepts hot swaps, so you don't need to call
  `module.hot.accept` as well.


#### module.hot.enter

Allows you to read in data from previous versions of the module. When a new version
of a module is being executed, callbacks passed to `module.hot.enter` will be
synchronously called with one argument: the value returned from the previous
version's `module.hot.exit` callback.

```js
let state;

module.hot.enter(prevState => {
  state = prevState;
  // ...
});

if (!state) {
  state = createState();
}
```

> Note: callbacks passed to `module.hot.enter` will only be called when a **new**
  version is entering. They will not be called when a module first initializes.


### The Build Process at a High-Level

Given a set of files that represent entry points to a codebase, the dependency
graph will trace the graph by recursively asking the pipeline for the resolved
dependencies of each file encountered.

For the pipeline to produce a list of resolved dependencies, the following steps
will typically occur:
 - read the file into memory
 - produce an AST by parsing the file
 - apply transforms to the AST (eg: babel or postcss plugins)
 - traverse the AST and look for dependency identifiers
 - inspect the file-system and resolve each identifier to a specific file

As dependencies are resolved, the graph creates nodes and edges that represent
the connections between files. Once all nodes have been identified and traced,
the graph emits a signal that indicates the end of the tracing process, and
we enter the code generation phase.

Code generation involves a number of processes that include:
 - rendering ASTs to code
 - generating source maps
 - generating module shims that enable the code to function with unfort's bootstrap

The completion of the code generation signals the end of the build, at which
point we can start sending signals to the front-end to update its assets.

> Note: this is all a bit hand-wavy and simplified. If you've got any questions, feel
  free to open an issue and ask.


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
    removed.
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
