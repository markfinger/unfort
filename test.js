const unfort = require('./lib/unfort/unfort');

unfort.installHelpers();

const build = unfort.createUnfort({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./test-src/entry')
  ],
  envHash: {
    files: [__filename, 'package.json']
  }
});

const defaultJobs = build.getState().jobs;

const jobs = Object.assign({}, defaultJobs, {
  hash(ref, store) {
    //console.log('in hash for ' + ref.name);
    return defaultJobs.hash(ref, store);
  }
});

build.setJobs(jobs);

build.start();

build.onBuildCompleted(() => {
  console.log('done')
});