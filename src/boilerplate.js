import {Readable} from 'stream';
import {resolveExecutionOrder} from 'cyclic-dependency-graph';

/**
 * Creates a readable stream that injects urls to all the necessary files
 * for the entry points
 *
 * @param {object} build - an object representing a build
 * @param {object} [options]
 * @param {array} [options.entryPoints] - an array of entry points to inject.
 *   If not provided, all entry points will be injected.
 */
export function createRecordInjectionStream(build, options={}) {
  const state = build.getState();

  const {
    records, bootstrapRuntime, nodes
  } = state;

  const {
    entryPoints = state.entryPoints,
  } = options;

  const stream = new Readable();
  const bootstrap = records.get(bootstrapRuntime);
  const styles = [];
  const scripts = [];
  const inlineScripts = [];

  // Traverse the graph from the entry points and resolve an
  // execution order that will preserve the CSS cascade
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
      // Increase the readability of the stream by indenting each
      // line of the bootstrap
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

  // Signal the end of the stream
  stream.push(null);

  return stream;
}
