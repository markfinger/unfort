"use strict";
const path = require('path');
const rxjs_1 = require('rxjs');
const bluebird_1 = require('bluebird');
const immutable_1 = require('immutable');
const browserResolve = require('browser-resolve');
const browserifyBuiltins = require('browserify/lib/builtins');
const babylon = require('babylon');
const postcss = require('postcss');
const parse5 = require('parse5');
const chalk = require('chalk');
const babelCodeFrame = require('babel-code-frame');
const file_system_1 = require('../file_system');
const cyclic_dependency_graph_1 = require('../cyclic_dependency_graph');
const babylon_ast_dependencies_1 = require('./babylon_ast_dependencies');
const postcss_ast_dependencies_1 = require('./postcss_ast_dependencies');
const parse5_ast_dependencies_1 = require('./parse5_ast_dependencies');
class File {
    constructor(fileName) {
        this.fileName = fileName;
        this.baseDirectory = path.dirname(fileName);
        this.ext = path.extname(fileName);
    }
}
class FileScan {
    constructor(file) {
        this.file = file;
    }
}
class FileDependencies {
    constructor(scan) {
        this.scan = scan;
    }
}
const NODE_MODULES = /node_modules/;
class Compiler {
    constructor() {
        this.fileSystemCache = new file_system_1.FileSystemCache();
        this.graph = new cyclic_dependency_graph_1.CyclicDependencyGraph((fileName) => this.handleGraphRequest(fileName));
        this.files = immutable_1.Map();
        this.scans = immutable_1.Map();
        this.dependencies = immutable_1.Map();
        this.error = new rxjs_1.Subject();
        this.complete = new rxjs_1.Subject();
        this.start = this.graph.start;
        this.graph.error.subscribe((obj) => this._handleErrorObject(obj));
        this.graph.complete.subscribe((obj) => {
            const { nodes, } = obj;
            this.build(nodes);
        });
    }
    compile() {
        this.graph.traceFromEntryPoints();
    }
    scan(file) {
        switch (file.ext) {
            case '.js':
                return this.scanJsFile(file);
            case '.css':
                return this.scanCssFile(file);
            case '.html':
                return this.scanHtmlFile(file);
        }
        return this.scanUnknownFile(file);
    }
    getFileScan(file) {
        const scan = this.scans.get(file.fileName);
        if (scan) {
            return bluebird_1.Promise.resolve(scan);
        }
        return this.scan(file)
            .then(scan => {
            if (this.isFileValid(file)) {
                this.scans = this.scans.set(file.fileName, scan);
            }
            return scan;
        });
    }
    scanHtmlFile(file) {
        const { fileName, trap } = file;
        return trap.readText(fileName)
            .then(text => {
            const ast = parse5.parse(text);
            const outcome = parse5_ast_dependencies_1.parse5AstDependencies(ast);
            const scan = new FileScan(file);
            scan.identifiers = outcome.identifiers;
            return scan;
        });
    }
    scanJsFile(file) {
        const { fileName, trap } = file;
        return trap.readText(fileName)
            .then(text => {
            const sourceType = NODE_MODULES.test(fileName) ? 'script' : 'module';
            const ast = babylon.parse(text, {
                sourceType
            });
            const outcome = babylon_ast_dependencies_1.babylonAstDependencies(ast);
            const scan = new FileScan(file);
            scan.identifiers = outcome.identifiers;
            return scan;
        });
    }
    scanCssFile(file) {
        const { fileName, trap } = file;
        return trap.readText(fileName)
            .then(text => {
            const ast = postcss.parse(text);
            const outcome = postcss_ast_dependencies_1.postcssAstDependencies(ast);
            const scan = new FileScan(file);
            scan.identifiers = outcome.identifiers;
            return scan;
        });
    }
    scanUnknownFile(file) {
        const { fileName, trap } = file;
        return trap.readBuffer(fileName)
            .then(buffer => {
            const scan = new FileScan(file);
            scan.identifiers = [];
            return scan;
        });
    }
    addEntryPoint(file) {
        this.graph.addEntryPoint(file);
    }
    resolveIdentifier(identifier, file) {
        const { fileName, baseDirectory, trap } = file;
        return new bluebird_1.Promise((res, rej) => {
            browserResolve(identifier, {
                filename: fileName,
                basedir: baseDirectory,
                modules: browserifyBuiltins,
                readFile: (path, cb) => trap.readTextCallBack(path, cb),
                isFile: (path, cb) => trap.isFileCallBack(path, cb)
            }, (err, fileName) => {
                if (err)
                    return rej(err);
                res(fileName);
            });
        });
    }
    handleGraphRequest(fileName) {
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
            return bluebird_1.Promise.all(scan.identifiers.map(identifier => {
                return this.resolveIdentifier(identifier, file);
            }))
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
    _handleErrorObject(obj) {
        const { error, fileName } = obj;
        let text = bluebird_1.Promise.resolve(null);
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
            if (error.codeFrame &&
                // In case another tool has already added the code frame to the error, we should avoid duplicating it
                !error.message.includes(error.codeFrame) &&
                !error.stack.includes(error.codeFrame)) {
                lines.push(error.codeFrame);
            }
            lines.push(error.stack);
            obj.description = lines.join('\n');
            this.error.next(obj);
        })
            .catch(err => console.error(err));
    }
    createFile(fileName) {
        const file = new File(fileName);
        file.trap = this.fileSystemCache.createTrap();
        return file;
    }
}
exports.Compiler = Compiler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21waWxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsdUJBQXNCLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLDJCQUFzQixVQUFVLENBQUMsQ0FBQTtBQUNqQyw0QkFBa0MsV0FBVyxDQUFDLENBQUE7QUFDOUMsTUFBWSxjQUFjLFdBQU0saUJBQWlCLENBQUMsQ0FBQTtBQUNsRCxNQUFZLGtCQUFrQixXQUFNLHlCQUF5QixDQUFDLENBQUE7QUFDOUQsTUFBWSxPQUFPLFdBQU0sU0FBUyxDQUFDLENBQUE7QUFDbkMsTUFBWSxPQUFPLFdBQU0sU0FBUyxDQUFDLENBQUE7QUFDbkMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsTUFBWSxLQUFLLFdBQU0sT0FBTyxDQUFDLENBQUE7QUFDL0IsTUFBWSxjQUFjLFdBQU0sa0JBQWtCLENBQUMsQ0FBQTtBQUVuRCw4QkFBOEMsZ0JBQWdCLENBQUMsQ0FBQTtBQUMvRCwwQ0FBMkMsNEJBQTRCLENBQUMsQ0FBQTtBQUN4RSwyQ0FBcUMsNEJBQTRCLENBQUMsQ0FBQTtBQUNsRSwyQ0FBcUMsNEJBQTRCLENBQUMsQ0FBQTtBQUNsRSwwQ0FBb0MsMkJBQTJCLENBQUMsQ0FBQTtBQUVoRTtJQUtFLFlBQVksUUFBZ0I7UUFDMUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwQyxDQUFDO0FBQ0gsQ0FBQztBQUVEO0lBR0UsWUFBWSxJQUFJO1FBQ2QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbkIsQ0FBQztBQUNI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