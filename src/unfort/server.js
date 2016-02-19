import http from 'http';
import path from 'path';
import express from 'express';
import socketIo from 'socket.io';
import {startsWith, endsWith} from 'lodash/string';
import stripAnsi from 'strip-ansi';
import imm from 'immutable';
import {resolveExecutionOrder} from '../cyclic-dependency-graph/utils';
import {
  describeErrorList, createRecordContentStream, createRecordSourceMapStream,
  createJSModuleDefinition
} from './utils';

/**
 * The API returned by `createServer`
 *
 * @type {Record}
 * @property httpServer - a `http` server instance
 * @property app - an `express` application bound to `httpServer`
 * @property io - a `socket.io` instance bound to `httpServer`
 * @property {Function} getSockets - returns an array of socket instances connected to `io`
 * @property {Function} serveRecordFromState - feeds record content to a server response
 */
const Server = imm.Record({
  httpServer: null,
  app: null,
  io: null,
  getSockets: null,
  serveRecordFromState: null,
  // TODO doc
  injectRecords: null
});

export function createServer({getState, onBuildCompleted}) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = socketIo(httpServer);

  let sockets = imm.Set();
  function getSockets() {
    return sockets;
  }

  io.on('connection', socket => {
    sockets = sockets.add(socket);
    socket.on('disconnect', () => {
      sockets = sockets.remove(socket);
    });
  });

  const injectRecords = createInjectRecordsView({getState, onBuildCompleted});
  const serveRecordFromState = createServerRecordFromStateView({getState, onBuildCompleted});

  // TODO: remove
  app.get('/', (req, res) => {
    res.end(`
      <html>
      <head></head>
      <body>
        <script src="/inject.js"></script>
      </body>
      </html>
    `);
  });

  app.get('/inject.js', (req, res) => {
    injectRecords(res);
  });

  app.get(getState().fileEndpoint + '*', (req, res) => {
    const url = req.path;

    return serveRecordFromState(url, res);
  });

  return Server({
    httpServer,
    io,
    app,
    getSockets,
    serveRecordFromState,
    injectRecords
  });
}


export function createServerRecordFromStateView({getState, onBuildCompleted}) {
  /**
   * Feeds a record from state to an (express-compatible) server response
   *
   * @param {String} recordUrl - the url that will be compared to the state's record look-up maps
   * @param res - a server's response object
   */
  return function serveRecordFromState(recordUrl, res) {
    onBuildCompleted(() => {
      const state = getState();

      if (state.errors) {
        let message = describeErrorList(state.errors);
        message = stripAnsi(message);
        return res.status(500).end(message);
      }

      const record = state.recordsByUrl.get(recordUrl);
      if (record) {
        if (record.data.mimeType) {
          res.contentType(record.data.mimeType);
        }
        return createRecordContentStream(record).pipe(res);
      }

      const sourceMapRecord = state.recordsBySourceMapUrl.get(recordUrl);
      if (sourceMapRecord) {
        return createRecordSourceMapStream(sourceMapRecord).pipe(res);
      }

      return res.status(404).send('Not found');
    });
  }
}

export function createInjectRecordsView({getState, onBuildCompleted}) {
  return function injectRecordsView(res) {
    onBuildCompleted(() => {
      const state = getState();

      if (state.errors) {
        let message = describeErrorList(state.errors);
        message = stripAnsi(message);
        return res.status(500).end(message);
      }

      const {
        records, nodes, entryPoints, bootstrapRuntime,
        rootNodeModules
      } = state;

      const bootstrap = records.get(bootstrapRuntime).data.code;

      res.write('// Define the bootstrap runtime\n');
      res.write('if (!window.__modules) {\n');
      bootstrap.split('\n').forEach(line => {
        res.write('  ');
        res.write(line);
        res.write('\n');
      });
      res.write('}\n\n');

      res.write('// The code for each JS module\n');
      res.write('[');

      const styleSheets = [];

      const executionOrder = resolveExecutionOrder(nodes, entryPoints);
      const moduleCount = executionOrder.length;

      // To preserve the CSS cascade, we iterate over the
      // nodes in order of execution
      executionOrder.forEach((name, i) => {
        if (name === bootstrapRuntime) {
          return;
        }

        const record = records.get(name);
        const url = record.data.url;

        const isTextFile = record.data.isTextFile;
        const isCssFile = endsWith(url, '.css');
        const isJsFile = endsWith(url, '.js') || endsWith(url, '.json');

        res.write('\n\n');
        res.write('  [');
        res.write(JSON.stringify(record.name));
        res.write(', ');

        if (!isTextFile || isCssFile) {
          if (isCssFile) {
            styleSheets.push([url, record.name]);
          }

          // For non-js assets, we inject shims that expose the asset's
          // url, enabling JS assets to consume them. These module shims
          // also play an important role in enabling the hot runtime to
          // reconcile state changes between builds
          let code;
          if (startsWith(record.name, rootNodeModules)) {
            code = `module.exports = ${JSON.stringify(url)}`;
          } else {
            // We fake a babel ES module so that hot swapping can occur
            code = [
              `exports.default = ${JSON.stringify(url)};`,
              'exports.__esModule = true;',
              'if (module.hot) {',
              '  module.hot.accept();',
              '}'
            ].join('\n');
          }

          const moduleDefinition = createJSModuleDefinition({
            name: record.name,
            deps: {},
            hash: record.data.hash,
            code
          });

          res.write(JSON.stringify(moduleDefinition));
        } else if (isJsFile) {
          res.write(JSON.stringify(record.data.code));
          if (record.data.sourceMapAnnotation) {
            res.write(`+ "\\n" + ${JSON.stringify(record.data.sourceMapAnnotation)}`);
          }
        }

        res.write(']');

        if (i + 1 < moduleCount) {
          res.write(',\n')
        }
      });

      const entryPointCount = entryPoints.length;
      if (entryPointCount) {
        res.write(',\n\n');
        res.write('  // Start the bootstrap runtime by executing each entry point\n');
      }
      entryPoints.forEach((file, i) => {
        if (i > 0) {
          res.write('\n');
        }

        res.write('  [');
        res.write('"__bootstrap__: ');
        res.write(file);
        res.write('", ');

        res.write(
          JSON.stringify(`__modules.executeModule(${JSON.stringify(file)});`)
        );

        res.write(']');

        if (i + 1 < entryPointCount) {
          res.write(',');
        } else {
          res.write('\n');
        }
      });


      res.write('\n].forEach(');
      res.write(injectScript.toString());
      res.write(');\n');

      if (!styleSheets.length) {
        res.end('');
      } else {
        res.write('\n');
        res.write('// Add style sheets\n');
        res.write('[\n');
        const styleSheetCount = styleSheets.length;
        styleSheets.forEach((data, i) => {
          res.write('  ');
          res.write(JSON.stringify(data));
          if (i + 1 < styleSheetCount) {
            res.write(',\n');
          } else {
            res.write('\n');
          }
        });
        res.write('].forEach(');
        res.write(injectStyleSheet.toString());
        res.end(');\n');
      }
    });
  }
}

function injectScript(data) {
  var script = '<script data-unfort-name="' + data[0] + '">' + data[1] + '</script>';
  // Inject each module into a new script element
  document.write(script);
}

function injectStyleSheet(data) {
  // Inject a new stylesheet referencing the url
  var element = document.createElement("link");
  element.rel = "stylesheet";
  element.href = data[0];
  element.setAttribute("data-unfort-name", data[1]);
  document.head.appendChild(element);
}