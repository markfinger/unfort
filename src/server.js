import http from 'http';
import path from 'path';
import express from 'express';
import socketIo from 'socket.io';
import {startsWith} from 'lodash/string';
import stripAnsi from 'strip-ansi';
import imm from 'immutable';
import {resolveExecutionOrder} from 'cyclic-dependency-graph';
import {
  describeErrorList, createRecordContentStream, createRecordSourceMapStream,
  createJSModuleDefinition
} from './utils';

/**
 * The API returned by `createServer`
 *
 * @type {Record}
 * @property {Object} httpServer - a `http` server instance
 * @property {Object} app - an `express` application bound to `httpServer`
 * @property {Object} io - a `socket.io` instance bound to `httpServer`
 * @property {Function} getSockets - returns an array of socket instances connected to `io`
 */
const Server = imm.Record({
  httpServer: null,
  app: null,
  io: null,
  getSockets: null,
  createRecordInjector,
  bindFileEndpoint: null
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

  let hasBoundFileEndpoint = false;
  function bindFileEndpoint() {
    if (hasBoundFileEndpoint) {
      return;
    }
    hasBoundFileEndpoint = true;

    const serveRecordFromState = createServeRecordFromState({getState, onBuildCompleted});
    app.get(getState().fileEndpoint + '*', (req, res) => {
      const url = req.path;

      return serveRecordFromState(url, res);
    });
  }

  return Server({
    httpServer,
    io,
    app,
    getSockets,
    bindFileEndpoint
  });
}

export function createServeRecordFromState({getState, onBuildCompleted}) {
  /**
   * Feeds a record from a build's state to an (express-compatible) server response
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
  };
}

export function createRecordInjector({getState, onBuildCompleted}, entryPoints) {
  return function recordInjector(res) {
    onBuildCompleted(() => {
      const state = getState();

      if (state.errors) {
        let message = describeErrorList(state.errors);
        message = stripAnsi(message);
        return res.status(500).end(message);
      }

      res.contentType('application/javascript');

      const {
        records, nodes, bootstrapRuntime, rootNodeModules
      } = state;

      if (!entryPoints) {
        entryPoints = state.entryPoints;
      }

      const bootstrap = records.get(bootstrapRuntime).data.code;
      const styles = [];
      const scripts = [];
      const inlineScripts = [];

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

        inlineScripts.push(
          createJSModuleDefinition({
            name: record.name,
            deps: {},
            hash: record.data.hash,
            code
          })
        );
      }

      executionOrder.forEach(name => {
        if (name === bootstrapRuntime) {
          return;
        }

        const record = records.get(name);
        const hashedFilename = record.data.hashedFilename;
        const url = record.data.url;
        const ext = path.extname(hashedFilename);

        if (ext === '.css') {
          styles.push({
            url,
            name: record.name
          });
          addShimModule(record);
        }

        if (ext === '.js' || ext === '.json') {
          scripts.push({
            url,
            name: record.name
          });
        }

        if (!record.data.isTextFile) {
          addShimModule(record);
        }
      });

      entryPoints.forEach(file => {
        inlineScripts.push(
          `__modules.executeModule(${JSON.stringify(file)});`
        );
      });

      res.end(`
        if (!window.__modules) {
          ${bootstrap}
        }
        (function() {
          var styles = ${JSON.stringify(styles)};
          var scripts = ${JSON.stringify(scripts)};
          var inlineScripts = ${JSON.stringify(inlineScripts)};

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
    });
  };
}