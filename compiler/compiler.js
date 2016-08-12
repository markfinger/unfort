"use strict";

const path = require('path');
const rx = require('rxjs');
const Promise = require('bluebird');
const imm = require('immutable');
const browserResolve = require('browser-resolve');
const browserifyBuiltins = require('browserify/lib/builtins');
const babylon = require('babylon');
const postcss = require('postcss');
const chalk = require('chalk');
const babelCodeFrame = require('babel-code-frame');
const {FileSystemCache} = require('../file_system');
const {CyclicDependencyGraph} = require('../cyclic_dependency_graph');
const {babylonAstDependencies} = require('./babylon_ast_dependencies');
const {postcssAstDependencies} = require('./postcss_ast_dependencies');
const {scanHtmlText} = require('./compile_html');

const File = imm.Record({
  fileName: null,
  baseDirectory: null,
  ext: null,
  reference: null,
  trap: null,
  scan: null,
  resolvedDependencies: null
});

const NODE_MODULES = /node_modules/;

class Compiler {
  constructor({fileSystemCache}={}) {
    this.fileSystemCache = fileSystemCache || new FileSystemCache();
    this.graph = new CyclicDependencyGraph((fileName) => this.handleGraphRequest(fileName));

    this.files = new imm.Map();

    this.start = this.graph.start;
    this.error = new rx.Subject();
    this.complete = new rx.Subject();

    this.graph.error.subscribe((obj) => this._handleErrorObject(obj));
    this.graph.complete.subscribe((obj) => {
      // TODO
      const {
        nodes,
        // pruned
      } = obj;
      this.build(nodes);
    });
  }
  compile() {
    this.graph.traceFromEntryPoints();
  }
  scan(file) {
    const {ext} = file;
    switch(ext) {
    case '.js':
      return this.scanJsFile(file);
    case '.css':
      return this.scanCssFile(file);
    case '.html':
      return this.scanHtmlFile(file);
    }
    return this.scanUnknownFile(file);
  }
  scanHtmlFile(file) {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        return scanHtmlText(text);
      });
  }
  scanJsFile(file) {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        const sourceType = NODE_MODULES.test(fileName) ? 'script' : 'module';
        const ast = babylon.parse(text, {
          sourceType
        });
        const outcome = babylonAstDependencies(ast);
        return imm.Map({
          ast,
          outcome,
          identifiers: outcome.dependencies.map(obj => obj.identifier)
        });
      });
  }
  scanCssFile(file) {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        const ast = postcss.parse(text);
        const dependencies = postcssAstDependencies(ast);
        return imm.Map({
          ast,
          identifiers: dependencies.map(obj => obj.source)
        });
      });
  }
  scanUnknownFile(file) {
    const {fileName, trap} = file;
    return trap.readBuffer(fileName)
      .then(buffer => {
        return imm.Map({
          buffer,
          identifiers: []
        });
      });
  }
  addEntryPoint(file) {
    this.graph.addEntryPoint(file);
  }
  resolveIdentifier(identifier, file) {
    const {fileName, baseDirectory, trap} = file;
    return new Promise((res, rej) => {
      browserResolve(
        identifier,
        {
          filename: fileName,
          basedir: baseDirectory,
          modules: browserifyBuiltins,
          readFile: (path, cb) => trap.readTextCallBack(path, cb),
          isFile: (path, cb) => trap.isFileCallBack(path, cb)
        },
        (err, fileName) => {
          if (err) return rej(err);
          res(fileName);
        }
      );
    });
  }
  handleGraphRequest(fileName) {
    let file = this.files.get(fileName);
    if (!file) {
      file = this._createFile(fileName);
      this.files = this.files.set(fileName, file);
    }
    return this.scan(file)
      .then(scan => {
        if (!this._isFileValid(file)) {
          return [];
        }
        const identifiers = scan.get('identifiers');
        return Promise.all(
          identifiers.map(identifier => {
            return this.resolveIdentifier(identifier, file);
          })
        )
          .then(resolvedDependencies => {
            if (!this._isFileValid(file)) {
              return [];
            }
            const updatedFile = file.merge({
              scan,
              resolvedDependencies
            });
            this.files = this.files.set(fileName, updatedFile);
            return resolvedDependencies;
          });
      });
  }
  build(nodes) {
    // TODO
    this.complete.next({
      graph: nodes
    });
  }
  _isFileValid(file) {
    const _file = this.files.get(file.fileName);
    return file && _file.reference === file.reference;
  }
  _handleErrorObject(obj) {
    const {error, fileName} = obj;
    let text = Promise.resolve(null);
    if (error.loc) {
      text = this.fileSystemCache.readText(fileName)
        .catch(_ => null); // Ignore any errors
    }
    text
      .then((text) => {
        const lines = [];
        // If the error occurred in a particular file's processing, we contextualize the error
        if (fileName) {
          lines.push(chalk.red(fileName) + '\n');
        }
        // If the stack trace already contains the message, we improve the readability by omitting the message
        if (!error.stack.includes(error.message)) {
          lines.push(error.message);
        }
        // Improve the reporting on parse errors by generating a code frame
        if (error.loc && !error.codeFrame) {
          if (text) {
            error.codeFrame = babelCodeFrame(text, error.loc.line, error.loc.column);
          }
        }
        if (
          error.codeFrame &&
          // In case another tool has already added the code frame to the error, we should avoid duplicating it
          !error.message.includes(error.codeFrame) &&
          !error.stack.includes(error.codeFrame)
        ) {
          lines.push(error.codeFrame);
        }
        lines.push(error.stack);
        obj.description = lines.join('\n');
        this.error.next(obj);
      })
      .catch(err => console.error(err));
  }
  _createFile(fileName) {
    const trap = this.fileSystemCache.createTrap();
    const ext = path.extname(fileName);
    return File({
      fileName,
      baseDirectory: path.dirname(fileName),
      ext,
      trap,
      reference: {}
    });
  }
}

module.exports = {
  Compiler
};