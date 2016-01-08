import {install} from 'source-map-support';
import {traceFile, createMockCaches} from '../tests/tracer_perf';

install();

const tree = Object.create(null);

traceFile(require.resolve('./entry'), tree, createMockCaches(), (err) => {
  if (err) throw err;
  console.log(tree);
});