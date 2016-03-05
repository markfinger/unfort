# unfort

An opinionated build tool that replicates a subset of webpack's features and
focuses primarily on improving performance in development environments.


## Installation

```
npm install --save unfort
```


### Quick start


```js
const unfort = require('unfort');

const build = unfort.createBuild({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./path/to/your/file')
  ],
  envHash: {
    // The files and directories that we introspect when
    // determining if we can still use cached data
    files: [__filename, 'package.json'],
    directories: ['node_modules']
  }
});

build.start();

const server = build.getState().server;

server.app.get('/', (req, res) => {
  res.end(`
    <html>
    <head></head>
    <body>
      <script src="/inject.js"></script>
    </body>
    </html>
  `);
});

const recordInjector = server.createRecordInjector(build);
server.app.get('/inject.js', (req, res) => recordInjector(res));
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
- **Prioritize clarity, but enable optimizations.**
  Avoid significant structural changes to source files. Provide source
  maps. Link to <script> and <link> elements for improved source map support
  in smaller code-bases. Enable network optimizations for larger code-bases.
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
- **Builtin support for tool _X_ or file format _Y_.**
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
  boilerplate into user-space. Leave the one-liners to be developed by those
  who are willing to deal with lazy internet people.


## Status

[![npm version](https://badge.fury.io/js/unfort.svg)](https://badge.fury.io/js/unfort)
[![Build Status](https://travis-ci.org/markfinger/unfort.svg?branch=master)](https://travis-ci.org/markfinger/unfort)
[![codecov.io](https://codecov.io/github/markfinger/unfort/coverage.svg?branch=master)](https://codecov.io/github/markfinger/unfort?branch=master)
[![Dependency Status](https://david-dm.org/markfinger/unfort.svg)](https://david-dm.org/markfinger/unfort)
[![devDependency Status](https://david-dm.org/markfinger/unfort/dev-status.svg)](https://david-dm.org/markfinger/unfort#info=devDependencies)


## Development Notes

The following commands are available to interact with unfort's code-base:

- `npm run build` builds the project into a form that node can interpret
- `npm test` runs the test suite
- `npm run _test` runs the test suite without source maps. Sometimes the stack
  traces get a bit messed up with the source maps, so this can help to debug.
- `npm run lint` runs `eslint` over the project
- `npm run coverage` runs the test suite and generates a coverage report in the "coverage" directory

