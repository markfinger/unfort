import * as path from 'path';
import {Subject} from 'rxjs';
import {Promise} from 'bluebird';
import {Map as ImmutableMap} from 'immutable';
import * as browserResolve from 'browser-resolve';
import * as browserifyBuiltins from 'browserify/lib/builtins';
import * as babylon from 'babylon';
import * as postcss from 'postcss';
import * as parse5 from 'parse5';
import * as chalk from 'chalk';
import * as babelCodeFrame from 'babel-code-frame';
import {ErrorObject} from '../common';
import {FileSystemCache, FileSystemTrap} from '../file_system';
import {CyclicDependencyGraph, Graph} from '../cyclic_dependency_graph';
import {babylonAstDependencies} from './babylon_ast_dependencies';
import {postcssAstDependencies} from './postcss_ast_dependencies';
import {parse5AstDependencies} from './parse5_ast_dependencies';

class File {
  fileName: string;
  baseDirectory: string;
  ext: string;
  trap: FileSystemTrap;
  constructor(fileName: string) {
    this.fileName = fileName;
    this.baseDirectory = path.dirname(fileName);
    this.ext = path.extname(fileName);
  }
}

class FileScan {
  file: File;
  identifiers: string[];
  constructor(file) {
    this.file = file;
  }
}

class FileDependencies {
  scan: FileScan;
  resolved: string[];
  constructor(scan) {
    this.scan = scan;
  }
}

interface buildOutput {
  graph: Graph
}

const NODE_MODULES = /node_modules/;

export class Compiler {
  fileSystemCache = new FileSystemCache();
  graph = new CyclicDependencyGraph((fileName) => this.handleGraphRequest(fileName));
  files = ImmutableMap<string, File>();
  scans = ImmutableMap<string, FileScan>();
  dependencies = ImmutableMap<string, FileDependencies>();
  start: Subject<string>;
  error = new Subject<ErrorObject>();
  complete = new Subject<buildOutput>();
  constructor() {
    this.start = this.graph.start;
    this.graph.error.subscribe((obj: ErrorObject) => this._handleErrorObject(obj));
    this.graph.complete.subscribe((obj) => {
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
  scan(file: File): Promise<FileScan> {
    switch(file.ext) {
      case '.js':
        return this.scanJsFile(file);
      case '.css':
        return this.scanCssFile(file);
      case '.html':
        return this.scanHtmlFile(file);
    }
    return this.scanUnknownFile(file);
  }
  getFileScan(file: File): Promise<FileScan> {
    const scan = this.scans.get(file.fileName);
    if (scan) {
      return Promise.resolve(scan);
    }
    return this.scan(file)
      .then(scan => {
        if (this.isFileValid(file)) {
          this.scans = this.scans.set(file.fileName, scan);
        }
        return scan;
      });
  }
  scanHtmlFile(file: File): Promise<FileScan> {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        const ast = parse5.parse(text);
        const outcome = parse5AstDependencies(ast);
        const scan = new FileScan(file);
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanJsFile(file: File): Promise<FileScan> {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        const sourceType = NODE_MODULES.test(fileName) ? 'script' : 'module';
        const ast = babylon.parse(text, {
          sourceType
        });
        const outcome = babylonAstDependencies(ast);
        const scan = new FileScan(file);
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanCssFile(file): Promise<FileScan> {
    const {fileName, trap} = file;
    return trap.readText(fileName)
      .then(text => {
        const ast = postcss.parse(text);
        const outcome = postcssAstDependencies(ast);
        const scan = new FileScan(file);
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanUnknownFile(file): Promise<FileScan> {
    const {fileName, trap} = file;
    return trap.readBuffer(fileName)
      .then(buffer => {
        const scan = new FileScan(file);
        scan.identifiers = [];
        return scan;
      });
  }
  addEntryPoint(file: string) {
    this.graph.addEntryPoint(file);
  }
  resolveIdentifier(identifier: string, file: File): Promise<string> {
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
  handleGraphRequest(fileName: string): Promise<string[]> {
    let file = this.files.get(fileName);
    if (!file) {
      file = this.createFile(fileName);
      this.files = this.files.set(fileName, file);
    }
    return this.getFileScan(file)
      .then(scan => {
        if (!this.isFileValid(file)) {
          return [];
        }
        return Promise.all(
          scan.identifiers.map(identifier => {
            return this.resolveIdentifier(identifier, file);
          })
        )
          .then(resolvedDependencies => {
            if (!this.isFileValid(file)) {
              return [];
            }
            const dependencies = new FileDependencies(scan);
            dependencies.resolved = resolvedDependencies;
            this.dependencies = this.dependencies.set(fileName, dependencies);
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
  isFileValid(file) {
    return this.files.get(file.fileName) === file;
  }
  _handleErrorObject(obj: ErrorObject) {
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
      // Sanity check to ensure that errors are not swallowed
      .catch(err => console.error(err));
  }
  createFile(fileName: string) {
    const file = new File(fileName);
    file.trap = this.fileSystemCache.createTrap();
    return file;
  }
}