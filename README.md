# unfort

An opinionated build tool that replicates a subset of webpack's features and
focuses primarily on improving performance in development environments.


## Installation

```
npm install --save unfort
```

## Design goals

Aim for:

- **Rapid feedback loops during development.**
  In most cases, changes should be applied in ~100-200ms. Provide a REPL-like
  experience from the comfort of a text editor.
- **Improve build times with persistent caching.**
  Write the expensive data to disk. Repeated builds should reuse the data.
  Cache invalidation should be smart, but when it fails, allow all the data
  to be easily nuked.
- **Code over configuration.**
  Only provide the most minimal set of options. The higher-level processes
  should be hard-coded wiring. For the inevitable edge-cases, expose the
  entire pipeline and allow any part to be overridden.
- **Support for modern tooling out of the box.**
  Ship with support for `babel` and allow configuration via `.babelrc` files.
  Ship with support for `postcss` and allow configuration via the pipeline.
- **Support for the most common file formats.**
  Support JS, JSON and CSS; treat all other formats as plain-text or binary.
- **A focused and succinct codebase.**
  Reduce bloat by only providing support for the simple and common use-case.

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
- **Support for older browsers.**
  Support evergreen browsers from vendors who keep pace with standards.
- **Support for anything but the latest version of Node.**
  Maintaining compatibility across language features is a pain. It requires
  a byzantine codebase, and often requires a build process to generate code
  that is both difficult to read and unpleasant to hack on.
- **Abstractions: CLIs, plugins, loaders, transforms, etc.**
  Make the minimal amount of abstractions necessary. Whenever possible, push
  boilerplate into user-space.


## Status

[![npm version](https://badge.fury.io/js/unfort.svg)](https://badge.fury.io/js/unfort)
[![Build Status](https://travis-ci.org/markfinger/unfort.svg?branch=master)](https://travis-ci.org/markfinger/unfort)
[![codecov.io](https://codecov.io/github/markfinger/unfort/coverage.svg?branch=master)](https://codecov.io/github/markfinger/unfort?branch=master)
[![Dependency Status](https://david-dm.org/markfinger/unfort.svg)](https://david-dm.org/markfinger/unfort)
[![devDependency Status](https://david-dm.org/markfinger/unfort/dev-status.svg)](https://david-dm.org/markfinger/unfort#info=devDependencies)


## Development Notes


### Scripts

The following commands are available to interact with unfort's code-base:

- `npm run build` builds the project into a form that node can interpret
- `npm test` runs the test suite
- `npm run _test` runs the test suite without source maps. Sometimes the stack
  traces get a bit messed up with the source maps, so this can help to debug.
- `npm run lint` runs `eslint` over the project
- `npm run coverage` runs the test suite and generates a coverage report in the "coverage" directory


### Related packages

The following related packages used to be part of unfort's codebase:

- [cyclic-dependency-graph](https://github.com/markfinger/cyclic-dependency-graph)
- [record-store](https://github.com/markfinger/record-store)
- [kv-cache](https://github.com/markfinger/kv-cache)
- [env-hash](https://github.com/markfinger/env-hash)
- [babylon-ast-dependencies](https://github.com/markfinger/babylon-ast-dependencies)
- [postcss-ast-dependencies](https://github.com/markfinger/postcss-ast-dependencies)

If you're digging through and things seem a bit opaque, their codebases might shed
some light.