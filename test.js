const unfort = require('./lib/unfort/unfort');

const build = unfort.createUnfort({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./test-src/entry')
  ]
});

build.installHelpers();
build.start();