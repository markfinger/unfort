# unfort

A build tool for the web that targets development environments.

Does some novel stuff:
 - **Hot swaps in milliseconds**, regardless of the codebase size
 - **Persistent caching** to optimize build time
 - **Live bindings** that automatically update module imports during hot swaps

Does some standard stuff:
 - Built-in support for JS, JSON, CSS and binary (image/font/etc) files
 - Exposes a babel & postcss pipeline by default - but happily accepts overrides

Some stuff that I'm currently using it for:
 - Replacing webpack in development environments
 - Enabling a REPL-like experience for prototyping
 - Providing asset hot-swaps when hacking on non-JS systems

> Note: this is both an experimental and personal project. The docs are intentionally
  high-level as changes to the API are frequent and (often) breaking. You probably
  shouldn't use this unless you're happy to read code and hack on stuff. Some of the
  write-ups are a bit hand-wavy and simplified, so if you've got any questions, feel
  free to open an issue and ask.

## Documentation

 - [Installation](#installation)
 - [Background](#background)
   - [Design Goals](#design-goals)
   - [Performance Wins (Compared to Webpack)](#performance-wins-compared-to-webpack)
     - [No Bundling](#no-bundling)
     - [Parsing and Code Generation](#parsing-and-code-generation)
     - [Initial Builds](#initial-builds)
   - [Performance Losses (Compared to Webpack)](#performance-losses-compared-to-webpack)
   - [Reflections](#reflections)
     - [Worker processes](#worker-processes)
     - [Reuse of ASTs](#reuse-of-asts)
     - [Persistent caching](#persistent-caching)
 - [Bootstrap Runtime](#bootstrap-runtime)
 - [Hot Runtime](#hot-runtime)
   - [Live Bindings](#live-bindings)
   - [module.hot API](#modulehot-api)
   - [module.hot.accept](#modulehotaccept)
   - [module.hot.changes](#modulehotchanges)
   - [module.hot.exit](#modulehotexit)
   - [module.hot.enter](#modulehotenter)
 - [The Build Process at a High-Level](#the-build-process-at-a-high-level)
 - [The Pipeline](#the-pipeline)
 - [Development Notes](#development-notes)
   - [Status](#status)
   - [Scripts](#scripts)
   - [Related Packages](#related-packages)


## Installation

```
npm install --save unfort
```


## Background

Webpack and browserify are pretty amazing when you get started on a project, but
performance drops sharply as your codebase grows. This sucks when you just want to hack
on stuff. I've [previously tried exploring](https://github.com/markfinger/webpack-build)
improvements for webpack's performance, with some limited success.

Fundamentally, this project is an exploration of performance improvements for build tools
that target the web. To keep the scope simple and to enable a variety of optimisations,
the project has one major caveat: zero-consideration should be given for production
environments.


### Design Goals

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


### Performance Wins (Compared to Webpack)

#### No Bundling

Probably the biggest performance win that unfort has over webpack is a lack of a
bundling phase. Unfort skips the need for a bundle by constructing simple shims that
allow the entire codebase to be streamed directly out of memory and into the browser.


#### Parsing and Code Generation

On the parsing side, unfort's faster when handling files that are transformed with
babel as it re-uses the AST for dependency analysis. It also avoids the multiple
code-generation phases that webpack implicitly requires when using loaders.


#### Initial Builds

Unlike webpack's slow initial builds, unfort's reuse of cached data can enable much faster
builds. After a small period of reading in and validating data, the build will complete.
As unfort stores data on a per-file basis, initial builds with only a partial set of
valid data will still complete in a fraction of the usual time.


### Performance Losses (Compared to Webpack)

On larger projects, unfort's initial builds without cached data can be somewhat slower.

I suspect this would be a combination of:

- **Parsing with babylon**.
  Acorn is much faster, but would require us to expand our infrastructure to handle more
  AST formats. By standardising on babel's AST, we get a *lot* of things for free.
- **IO reads for missing data in the file cache.**
  Could probably remove these as we'd know ahead of time that there is no data.
- **babel-generator's overhead for rendering code and source maps.**
  We're not manipulating the majority of files, so we could probably just remove
  babel-generator and generate the source maps by hand.

In general, I suspect there will be a lot of low-hanging fruit in this project as it
hasn't been [profiled](https://github.com/markfinger/profiling-node) for some time.


### Reflections

Coming into the project I had assumed that reimplementing webpack with a combination of
worker processes, re-use of ASTs, and persistent caching would provide significant wins.
As is usual, some of these assumptions were correct and some proved incorrect.


#### Worker processes

I initially started this project with the intent to use worker processes to run jobs in
parallel. After trying them on a couple of smaller projects I realized that they had a
negative impact on performance and removed them from the codebase.

Nonetheless, I've kept musing over them, and here are some notes in case anyone else
wants to implement something with them:

- There's a large cost associated with transporting data in and out of workers. So you'd
  probably need to build your pipeline so that each file is handled by a specific worker
  that doesn't require much context or interactions from the master process.
- There's a large cost to spawning child processes. Node's pretty fast to boot, but it's
  not so fast to read in large amounts of modules. You'd only want workers if you had build
  times greater than 15 seconds where the spawn overhead is justified by the performance
  improvements of parallel jobs
- Spawn workers early so that you're job requests aren't blocked while the worker process
  boots and initializes.
- Spreading jobs around different processes limits the ability of v8's JIT to optimize
  code accurately. You might want to try limiting the number of workers and/or using
  particular workers for particular code paths.
- Debugging workers is a pain. If you're going to implement a worker pipeline, make sure
  that everything goes through an interface which enables you to force execution within
  the master process. This enables you to use a debugger.


### Reuse of ASTs

Webpack's loader pipeline works on a low-level primitive: strings of code. This becomes
a performance issue when each loader needs to individually parse the code, manipulate the
AST and generate more code and source maps. Once each loader has been applied, webpack
then parses the code (again) and starts all of its magic. While a lot of projects will
only use a single loader (typically `babel-loader`), the re-parsing is still a performance
issue.

To get around this, we simply re-use babel's AST that we only parse files once while preserving
the ability to introspect dependency identifiers. In cases where we're using babel's transforms,
we simply apply babel's parser (babylon) directly to generate an AST. Consolidating on babel's
pipeline ensures that we only need a single code-path to handle dependency analysis.


#### Persistent caching

Persistent caching has proven to work quite well. It adds a small overhead to initial builds,
but **massively** reduces build times for repeated builds.

For cache read/writes we use [kv-cache](https://github.com/markfinger/kv-cache) which enables
us to store each file's data in separate files. This ensures that we can handle rebuilds with
only partial data-sets and it removes any overhead associated with reading and discarding
stale data. A downside is IO overhead that increases with the number of files that are used
in the build.

Our pipeline generates cache keys that are composed of the file's path, modified time. For
textual files, we also generate a murmur hash of the content so that we can get around OS
limitations on file-system accuracy.

Cache invalidation is generally a pain, but we use [env-hash](https://github.com/markfinger/env-hash)
to trivially invalidate cached data whenever key factors in the environment change. This
enables us to discard any cached data when a new library is installed or changes are made
to a build script or environmental files (such as `package.json` or `.babelrc`).


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


### The Pipeline

Unfort's pipeline mostly revolves around a [record-store](https://github.com/markfinger/record-store)
instance that enables us to define a collection of jobs that can be applied to a file to produce
some result.

The record store is asynchronous and makes heavy use of promises. Asynchronous jobs enable
us to split up CPU-intensive tasks so that we avoid blocking Node's event-loop. Promises enable
the record store to both memoize a job's result and merge job requests together so we only
generate data once per file.

If you want to interact, override or tinker with the pipeline, you can use the `extendJobs` hook.

For example, to remove source map annotations from all files:

```
const unfort = require('unfort');

const build = unfort.createBuild({
  // ...
});

build.extendJobs(defaults => {
  return {
    sourceMapAnnotation(ref, store) {
      return null;
    }
  };
});

build.start();
```

If you wanted to override the cache key for files in a particular directory:

```
build.extendJobs(defaults => {
  return {
    cacheKey(ref, store) {
      if (ref.name.indexOf('/some/dir') === 0) {
        return 'some cache key';
      } else {
        return defaults.cacheKey(ref, store);
      }
    }
  };
});
```

If you want to add postcss plugins for specific files:

```
build.extendJobs(defaults => {
  return {
    postcssPlugins(ref, store) {
      if (ref.name.indexOf('/some/dir') === 0) {
        return [
          // an array of plugins
          // ...
        ];
      } else {
        return defaults.postcssPlugins(ref, store);
      }
    }
  };
});
```


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
