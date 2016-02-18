import http from 'http';
import path from 'path';
import express from 'express';
import socketIo from 'socket.io';
import {startsWith} from 'lodash/string';
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
 * @property {Function} serveFileFromState - feeds file content from the record state to a response
 */
const Server = imm.Record({
  httpServer: null,
  app: null,
  io: null,
  getSockets: null,
  serveFileFromState: null
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

  // TODO: remove
  app.get('/', (req, res) => {
    injectFilesFromState(res);
  });

  app.get(getState().fileEndpoint + '*', (req, res) => {
    const url = req.path;

    return serveRecordFromState(url, res);
  });

  // TODO: convert to producing a lump of JS that can inject everything needed
  function injectFilesFromState(res) {
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

      const scripts = [];
      const styles = [];
      const shimModules = [];

      const runtimeUrl = records.get(bootstrapRuntime).data.url;

      const executionOrder = resolveExecutionOrder(nodes, entryPoints);

      // For non-js assets, we inject shims that expose the asset's
      // url, enabling JS assets to consume them. These module shims
      // also play an important role in enabling the hot runtime to
      // reconcile state changes between builds
      function addShimModule(record) {
        const url = record.data.url;

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

        shimModules.push(
          createJSModuleDefinition({
            name: record.name,
            deps: {},
            hash: record.data.hash,
            code
          })
        );
      }

      executionOrder.forEach(name => {
        const record = records.get(name);
        const hashedFilename = record.data.hashedFilename;
        const url = record.data.url;
        const ext = path.extname(hashedFilename);

        if (ext === '.css') {
          styles.push(`<link rel="stylesheet" href="${url}" data-unfort-name="${record.name}">`);
          addShimModule(record);
        }

        if (
          (ext === '.js' && record.name !== bootstrapRuntime) ||
          ext === '.json'
        ) {
          scripts.push(`<script src="${url}" data-unfort-name="${record.name}"></script>`);
        }

        if (!record.data.isTextFile) {
          addShimModule(record);
        }
      });

      const entryPointsInit = entryPoints.map(file => {
        return `__modules.executeModule(${JSON.stringify(file)});`;
      });

      res.end(`
        <html>
        <head>
          ${styles.join('\n')}
        </head>
        <body>
          <script src="${runtimeUrl}"></script>
          ${scripts.join('\n')}
          <script>
            ${shimModules.join('\n')}
            ${entryPointsInit.join('\n')}
          </script>
        </body>
        </html>
      `);
    });
  }

  /**
   * Feeds a record from state to an (express-compatible) server response
   *
   * @param {String} recordUrl - the url that will be compared to the state's record look-up maps
   * @param res - a server's response object
   */
  function serveRecordFromState(recordUrl, res) {
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
        return createRecordContentStream(record)
          .pipe(res);
      }

      const sourceMapRecord = state.recordsBySourceMapUrl.get(recordUrl);
      if (sourceMapRecord) {
        return createRecordSourceMapStream(sourceMapRecord)
          .pipe(res);
      }

      return res.status(404).send('Not found');
    });
  }

  return Server({
    httpServer,
    io,
    app,
    getSockets,
    serveRecordFromState
  });
}
