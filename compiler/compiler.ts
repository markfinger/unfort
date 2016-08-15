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
import babelGenerator from 'babel-generator';
import * as babelCodeFrame from 'babel-code-frame';
import {ErrorObject} from '../common';
import {FileSystemCache, FileSystemTrap} from '../file_system';
import {CyclicDependencyGraph, Graph} from '../cyclic_dependency_graph';
import {babylonAstDependencies} from './babylon_ast_dependencies';
import {postcssAstDependencies} from './postcss_ast_dependencies';
import {parse5AstDependencies, rewriteParse5AstDependencies} from './parse5_ast_dependencies';
import {GraphOutput} from "../cyclic_dependency_graph/graph";

class File {
  fileName: string;
  baseDirectory: string;
  ext: string;
  baseName: string;
  trap: FileSystemTrap;
  content: string | Buffer;
  hash: string;
  constructor(fileName: string) {
    this.fileName = fileName;
    this.baseDirectory = path.dirname(fileName);
    this.ext = path.extname(fileName);
    this.baseName = path.basename(fileName, this.ext);
  }
}

class FileScan {
  file: File;
  identifiers: string[];
  ast: any;
  constructor(file) {
    this.file = file;
  }
}

class FileDependencies {
  scan: FileScan;
  resolved: string[];
  resolvedByIdentifier: any;
  constructor(scan) {
    this.scan = scan;
  }
}

class FileBuild {
  file: File;
  scan: FileScan;
  content: string | Buffer;
  url: string;
  sourceMap?: any;
  constructor(file, scan) {
    this.file = file;
    this.scan = scan;
  }
}

interface buildOutput {
  graph: Graph,
  files: ImmutableMap<string, File>
  scans: ImmutableMap<string, FileScan>
  built: ImmutableMap<string, FileBuild>
}

const NODE_MODULES = /node_modules/;

export class Compiler {
  fileSystemCache = new FileSystemCache();
  graph: CyclicDependencyGraph;
  files = ImmutableMap<string, File>();
  scans = ImmutableMap<string, FileScan>();
  built = ImmutableMap<string, FileBuild>();
  dependencies = ImmutableMap<string, FileDependencies>();
  start: Subject<string>;
  error = new Subject<ErrorObject>();
  complete = new Subject<buildOutput>();
  graphState: Graph;
  rootDirectory: string;
  constructor() {
    this.graph = new CyclicDependencyGraph((fileName: string) => this.handleGraphRequest(fileName));
    this.start = this.graph.start;
    this.graph.error.subscribe((errorObject: ErrorObject) => this.handleErrorObject(errorObject));
    this.graph.complete.subscribe((graphOutput: GraphOutput) => this.handleGraphOutput(graphOutput));
    this.rootDirectory = process.cwd();
  }
  startCompilation() {
    this.graph.traceFromEntryPoints();
  }
  addEntryPoint(file: string) {
    this.graph.addEntryPoint(file);
  }
  getFileSourceUrl(file: File): string {
    if (file.fileName.startsWith(this.rootDirectory)) {
      return file.fileName.slice(this.rootDirectory.length);
    } else {
      return file.fileName;
    }
  }
  getFileOutputUrl(file: File): string {
    const baseDirectory = file.baseDirectory;
    let fileSystemPath;
    if (baseDirectory.startsWith(this.rootDirectory)) {
      fileSystemPath = baseDirectory.slice(this.rootDirectory.length);
    } else {
      fileSystemPath = baseDirectory;
    }
    const rootUrl = fileSystemPath.split(path.sep).join('/');
    const url = rootUrl + '/' + file.baseName + '-' + file.hash + file.ext;
    if (url[0] !== '/') {
      return '/' + url;
    }
    return url;
  }
  scanFile(file: File): Promise<FileScan> {
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
  scanHtmlFile(file: File): Promise<FileScan> {
    const {fileName, trap} = file;
    return Promise.all([
      trap.readText(fileName),
      trap.readTextHash(fileName)
    ])
      .then(([text, textHash]) => {
        file.content = text;
        file.hash = textHash;
        const ast = parse5.parse(text);
        const outcome = parse5AstDependencies(ast);
        const scan = new FileScan(file);
        scan.ast = ast;
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanJsFile(file: File): Promise<FileScan> {
    const {fileName, trap} = file;
    return Promise.all([
      trap.readText(fileName),
      trap.readTextHash(fileName)
    ])
      .then(([text, textHash]) => {
        file.content = text;
        file.hash = textHash;
        const sourceType = NODE_MODULES.test(fileName) ? 'script' : 'module';
        const ast = babylon.parse(text, {
          sourceType
        });
        const outcome = babylonAstDependencies(ast);
        const scan = new FileScan(file);
        scan.ast = ast;
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanCssFile(file): Promise<FileScan> {
    const {fileName, trap} = file;
    return Promise.all([
      trap.readText(fileName),
      trap.readTextHash(fileName)
    ])
      .then(([text, textHash]) => {
        file.content = text;
        file.hash = textHash;
        const ast = postcss.parse(text);
        const outcome = postcssAstDependencies(ast);
        // As we serve the files with different names, we need to remove
        // the `@import ...` rules
        ast.walkAtRules('import', rule => rule.remove());
        const scan = new FileScan(file);
        scan.ast = ast;
        scan.identifiers = outcome.identifiers;
        return scan;
      });
  }
  scanUnknownFile(file): Promise<FileScan> {
    const {fileName, trap} = file;
    return Promise.all([
      trap.readText(fileName),
      trap.readModifiedTime(fileName)
    ])
      .then(([buffer, modifiedTime]) => {
        file.content = buffer;
        file.hash = modifiedTime;
        const scan = new FileScan(file);
        scan.identifiers = [];
        return scan;
      });
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
  build(file: File): Promise<FileBuild> {
    switch(file.ext) {
      case '.js':
        return this.buildJsFile(file);
      case '.css':
        return this.buildCssFile(file);
      case '.html':
        return this.buildHtmlFile(file);
    }
    return this.buildUnknownFile(file);
  }
  buildJsFile(file: File): Promise<FileBuild> {
    const sourceUrl = this.getFileSourceUrl(file);
    const outputUrl = this.getFileOutputUrl(file);
    const scan = this.scans.get(file.fileName);
    const babelFile = babelGenerator(
      scan.ast,
      {
        sourceMaps: true,
        sourceFileName: sourceUrl,
        sourceMapTarget: outputUrl
      },
      file.content
    );
    const build = new FileBuild(file, scan);
    build.url = outputUrl;
    build.content = babelFile.code;
    build.sourceMap = babelFile.map;
    return Promise.resolve(build);
  }
  buildCssFile(file: File): Promise<FileBuild>  {
    const sourceUrl = this.getFileSourceUrl(file);
    const outputUrl = this.getFileOutputUrl(file);
    const scan = this.scans.get(file.fileName);

    return Promise.resolve(
      postcss().process(
        scan.ast,
        {
          from: sourceUrl,
          to: outputUrl,
          // Generate a source map, but keep it separate from the code
          map: {
            inline: false,
            annotation: false
          }
        }
      )
    )
      .then(output => {
        const build = new FileBuild(file, scan);
        build.url = outputUrl;
        build.content = output.css;
        build.sourceMap = output.map;
        return Promise.resolve(build);
      });
  }
  buildHtmlFile(file: File): Promise<FileBuild>  {
    // Rewrite each dependency to target the output file
    const scan = this.scans.get(file.fileName);
    const dependencies = this.dependencies.get(file.fileName);
    const identifiers = {};
    for (const identifier of Object.keys(dependencies.resolvedByIdentifier)) {
      const depFileName = dependencies.resolvedByIdentifier[identifier];
      const depFile = this.files.get(depFileName);
      identifiers[identifier] = this.getFileOutputUrl(depFile);
    }
    rewriteParse5AstDependencies(scan.ast, identifiers);
    // Convert the AST to text
    const build = new FileBuild(file, scan);
    build.url = this.getFileOutputUrl(file);
    build.content = parse5.serialize(scan.ast);
    return Promise.resolve(build);
  }
  buildUnknownFile(file: File): Promise<FileBuild>  {
    const scan = this.scans.get(file.fileName);
    const build = new FileBuild(file, scan);
    build.url = this.getFileOutputUrl(file);
    build.content = file.content;
    return Promise.resolve(build);
  }
  handleGraphRequest(fileName: string): Promise<string[]> {
    let file = this.files.get(fileName);
    if (!file) {
      file = this.createFile(fileName);
      this.files = this.files.set(fileName, file);
    }
    return this.scanFile(file)
      .then(scan => {
        this.scans = this.scans.set(fileName, scan);
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
            dependencies.resolvedByIdentifier = {};
            for (let i=0; i<resolvedDependencies.length; i++) {
              const identifier = scan.identifiers[i];
              dependencies.resolvedByIdentifier[identifier] = resolvedDependencies[i];
            }
            this.dependencies = this.dependencies.set(fileName, dependencies);
            return resolvedDependencies;
          });
      });
  }
  isFileValid(file) {
    return this.files.get(file.fileName) === file;
  }
  handleErrorObject(errorObject: ErrorObject) {
    const {error, fileName} = errorObject;
    let text = Promise.resolve(null);
    if (error.loc && !error.codeFrame) {
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
        if (text) {
          error.codeFrame = babelCodeFrame(text, error.loc.line, error.loc.column);
        }
        if (
          error.codeFrame &&
          // If another tool has already added the code frame to the error, we should avoid duplicating it
          !(error.message.includes(error.codeFrame) || error.stack.includes(error.codeFrame))
        ) {
          lines.push(error.codeFrame);
        }
        lines.push(error.stack);
        errorObject.description = lines.join('\n');
        this.error.next(errorObject);
      })
      // Sanity check to ensure that errors are not swallowed
      .catch(err => console.error(err));
  }
  handleGraphOutput(graphOutput: GraphOutput) {
    this.graphState = graphOutput.graph;
    for (const fileName of graphOutput.pruned) {
      this.purgeDataForFile(fileName);
    }
    this.buildFiles();
  }
  buildFiles() {
    const fileBuilds = [];
    this.graphState.keySeq().forEach(fileName => {
      const file = this.files.get(fileName);
      fileBuilds.push(this.build(file));
    });
    Promise.all(fileBuilds)
      .then((builtFiles: FileBuild[]) => {
        this.built = ImmutableMap<string, FileBuild>().withMutations(map => {
          for (const builtFile of builtFiles) {
            map.set(builtFile.file.fileName, builtFile);
          }
        });
        this.complete.next({
          graph: this.graphState,
          files: this.files,
          scans: this.scans,
          built: this.built
        });
      });
  }
  purgeDataForFile(fileName: string) {
    this.files.delete(fileName);
    this.scans.delete(fileName);
    this.dependencies.delete(fileName);
  }
  createFile(fileName: string) {
    const file = new File(fileName);
    file.trap = this.fileSystemCache.createTrap();
    return file;
  }
}