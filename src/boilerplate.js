import {Readable} from 'stream';
import {resolveExecutionOrder} from 'cyclic-dependency-graph';
import {createRecordContentStream, createRecordSourceMapStream} from './utils';

/**
 * Produces a readable stream for any matching records, or returns null.
 *
 * @param {Object} build - an object representing a build
 * @param {String} recordUrl - the url that will be compared to the state's record look-up maps
 * @return {null|stream.Readable}
 */
export function createRecordStream(build, recordUrl) {
  const {
    recordsByUrl, recordsBySourceMapUrl
  } = build.getState();

  const record = recordsByUrl.get(recordUrl);
  if (record) {
    return createRecordContentStream(record);
  }

  const sourceMapRecord = recordsBySourceMapUrl.get(recordUrl);
  if (sourceMapRecord) {
    return createRecordSourceMapStream(sourceMapRecord);
  }

  return null;
}

export function getRecordMimeType(build, recordUrl) {
  const {recordsByUrl} = build.getState();

  const record = recordsByUrl.get(recordUrl);
  if (record) {
    return record.data.mimeType;
  }
}

/**
 * Creates a readable stream that injects all the necessary files for the entry points
 *
 * @param {Object} build - an object representing a build
 * @param {Array} [entryPoints] - an optional override that filters the records by specific entry points
 */
export function createRecordInjectionStream(build, entryPoints) {
  const state = build.getState();

  const {
    records, bootstrapRuntime, nodes
  } = state;

  // Allow overrides
  entryPoints = entryPoints || state.entryPoints;

  const stream = new Readable();
  const bootstrap = records.get(bootstrapRuntime);
  const styles = [];
  const scripts = [];
  const inlineScripts = [];

  const executionOrder = resolveExecutionOrder(nodes, entryPoints);
  executionOrder.forEach(name => {
    const record = records.get(name);

    const {url, ext, moduleDefinition} = record.data;

    if (ext === '.css') {
      styles.push({url, name});
    }

    if (ext === '.js' || ext === '.json') {
      scripts.push({url, name});
    } else {
      inlineScripts.push(moduleDefinition);
    }
  });

  entryPoints.forEach(file => {
    inlineScripts.push(
      `__modules.executeModule(${JSON.stringify(file)});`
    );
  });

  stream.push(`if (!window.__modules) {\n`);
  bootstrap.data.content.split('\n')
    .forEach(line => {
      stream.push('  ');
      stream.push(line);
      stream.push('\n');
    });
  stream.push('}\n');

  stream.push('(function() {\n');

  stream.push('  var styles = [\n');
  styles.forEach(obj => {
    stream.push('    ');
    stream.push(JSON.stringify(obj));
    stream.push(',\n');
  });
  stream.push('  ];\n');

  stream.push('  var scripts = [\n');
  scripts.forEach(obj => {
    stream.push('    ');
    stream.push(JSON.stringify(obj));
    stream.push(',\n');
  });
  stream.push('  ];\n');

  stream.push('  var inlineScripts = [\n');
  inlineScripts.forEach(script => {
    stream.push('    ');
    stream.push(JSON.stringify(script));
    stream.push(',\n');
  });
  stream.push('  ];\n');

  stream.push(`\
  styles.forEach(function(obj) {
    addStylesheet(obj.url, obj.name);
  });

  scripts.forEach(function(obj) {
    addScript(obj.url, obj.name);
  });

  inlineScripts.forEach(addInlineScript);

  function addScript(url, name) {
    document.write('<script src="' + url + '" data-unfort-name="' + name + '"></script>');
  }

  function addStylesheet(url, name) {
    var element = document.createElement('link');
    element.rel = 'stylesheet';
    element.href = url;
    element.setAttribute('data-unfort-name', name);
    document.head.appendChild(element);
  }

  function addInlineScript(text) {
    document.write('<script>' + text + '</script>');
  }
})();
`);

  stream.push(null);

  return stream;
}
