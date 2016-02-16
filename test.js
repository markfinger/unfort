const unfort = require('./lib/unfort/unfort');

const build = unfort.createUnfort({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./test-src/entry')
  ],
  envHash: {
    files: [__filename, 'package.json']
  }
});

build.installHelpers();
build.start();