import postcss from 'postcss';
import defaults from 'lodash/object/defaults';

//const store = createStore();
//const workers = spawnWorkers({count: 2});
//const fs = createFSCache({});
//const cache = createCache({});

/*
required API

workers (no-op for now, just add a job that gets flushed eventually)
caching (no-op for now, ...)
fs (read file, write file, modified time, is file)
record processors

event emitter:
 - error
 - start
 - record-done
 - done
 - record-invalidated
 -

*/

function createPipelineObject(overrides) {
  return {
    fs: require('fs'),
    ...overrides
  };
}

function readTextFile({record, fs, done}) {
  if (record.has('content')) {
    return done(null, record);
  }

  fs.readFile(record.get('filename'), 'utf8', (err, data) => {
    if (err) return done(err);

    done(record.set('content', data));
  });
}

function babylonParser({record, store, fs}) {

}

const cachedState = require('./stateCache.json');

validateCachedRecords(cachedState).then(({invalidRecords}) => {
  const state = pruneRecords(cachedData, invalidRecords);

  const store = createRecordStore({
    initialState: state
  });

  store.dispatch(
    ensureEntryPoint(require.resolve('./foo.js'))
  );

  const jsPipeline = createPipeline({
    //fs: createFSWrapper(),
    fs: createCachedFS(),

    // workers: createFakeWorkerPool(),
    workers: createWorkerPool({workers: 2}),

    // cache: createFakeCache(),
    // cache: createMemoryCache(),
    cache: createPersistentCache({
      filename: path.join(__dirname, 'foo.json')
    }),

    pipeline: [
      babylonParser(),
      excludeFiles(
        /node_modules/,
        babelTransformer()
      )
    ]
  });

  const browserResolve = () => {};

  const controller = createController({
    store,
    resolver: browserResolve,
    pipeline: jsPipeline,
    validator: ({record, fs}) => {

    }
  });

  const watcher = createWatcher({});

  controller.on('recordDone', () => {
    const fileDependencies = getFileDependencies(store);
    watcher.onlyWatch(fileDependencies);
  });

  controller.once('done', watcher.start);

  watcher.on('change', filename => {
    const recordActions = purgeRecordsByFilename(filename);
    const dependencyActions = purgeRecordsByFileDependencies(filename);

    const actions = mergeRecordActions(recordActions, dependencyActions);
    actions.forEach(store.dispatch);
  });

  controller.on('done', () => {
    const fileDependencies = getFileDependencies(store);
    watcher.ensureWatching(fileDependencies);
  });

});


const entry = createEntry(require.resolve('./foo.js'));

store.dispatch(entry);

const collector = createRecordCollector({

});

collector.enter('./foo.js');
