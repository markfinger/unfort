"use strict";

const imm = require('immutable');

class HtmlCompiler {
  constructor(unit, pipeline) {
    this.unit = unit;
  }
  metaData() {
    return imm.Map({
      path: this.unit.path,
      url: '...',
      sourceUrl: '...',
      hash: 'mtime__textHash'
    });
  }
  resolvedDependenciesByPath() {
    return imm.List([
      {
        id: './foo.js',
        type: 'script'
      },
      {
        id: './bar.css',
        type: 'stylesheet'
      },
      {
        id: './woz.png',
        type: 'image'
      }
    ]);
  }
  generate(buildState) {
    const node = buildState.graph.get(this.unit.path)
    const deps = [];
    for (const path of node.dependencies) {
      deps.push(path);
    }

  }
}

function htmlProcessor({pipeline, graph, asset}) {
  /*
  given text
  parse it
  walk ast, look for <link href>, <script src>, <img src>
  block until dep identifier has been resolved and
  replace dep identifier with url
   */
  return null;
}