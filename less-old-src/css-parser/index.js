import postcss from 'postcss';
import defaults from 'lodash/object/defaults';

const store = createStore();
const workers = spawnWorkers({count: 2});
const fs = createFSCache({});
const cache = createCache({});

const records = createRecords({
  store,
  plugins: [
    // Core utils
    workers,
    cache,
    fs,

    // Record handlers
    browserResolve(),
    exclude(
      /jquery/,
      babelParser()
    )
  ]
});

records.add('./foo.js');
records.add('./bar.css');

records.start();

records.on('error', err => {
  console.error(err);
});

records.on('recordDone', record => {
  console.log(`Record done: ${record}`);
});

records.on('done', (records) => {
  const jsRecords = records.getRecords().filter(
    record => record.get('ext').matches(/.js$/)
  );

  const mergedRecords = mergeRecords(jsRecords);

  const backend = alas.createFileSystem().write('foo.js', mergedRecords);
});

export function matchRecordFilenameOrNext(match, fn) {
  return function() {
    const {record, next} = arguments[0];
    if (record.filename.match(match)) {
      return fn.apply(this, arguments);
    } else {
      return next();
    }
  };
}

export function parseCSS(content, filename) {
  return postcss.parse(content, {from: filename});
}

export function cssParseSignalHandler({record}) => {

}

export function cssParserOptions(options) {
  return defaults({}, options, {
    match: /.css$/
  });
}

export default function cssParserPlugin(options) {
  const {match} = cssParserOptions(options);

  return ({store}) => {
    store.dispatch(addSignal('CSS:PARSE'));
    store.dispatch(addSignalHandler('CSS:PARSE', matchRecordFilenameOrNext(match, cssParseSignalHandler)));
  };
}
