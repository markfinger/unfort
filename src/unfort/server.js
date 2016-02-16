import http from 'http';
import path from 'path';
import express from 'express';
import socketIo from 'socket.io';
import chalk from 'chalk';
import {startsWith} from 'lodash/string';
import {pull} from 'lodash/array';
import stripAnsi from 'strip-ansi';
import {resolveExecutionOrder} from '../cyclic-dependency-graph/utils';
import {
  describeBuildErrors, writeRecordToStream, writeSourceMapToStream, createJSModule
} from './utils';

export function createServer({getState, onBuildCompleted}) {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server);

  const sockets = [];
  io.on('connection', socket => {
    sockets.push(socket);
    socket.on('disconnect', () => {
      pull(sockets, socket);
    });
  });

  app.get('/', (req, res) => {
    onBuildCompleted(() => {
      const state = getState();

      if (state.errors) {
        let message = describeBuildErrors(state.errors);
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
          code = (
            `exports.default = ${JSON.stringify(url)};
          exports.__esModule = true;
          if (module.hot) {
            module.hot.accept();
          }`
          );
        }

        shimModules.push(
          createJSModule({
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
  });

  app.get(getState().fileEndpoint + '*', (req, res) => {
    onBuildCompleted(() => {
      const state = getState();

      if (state.errors) {
        let message = describeBuildErrors(state.errors);
        message = stripAnsi(message);
        return res.status(500).end(message);
      }

      const url = req.path;

      const record = state.recordsByUrl.get(url);
      if (record) {
        return writeRecordToStream(record, res);
      }

      const sourceMapRecord = state.recordsBySourceMapUrl.get(url);
      if (sourceMapRecord) {
        return writeSourceMapToStream(sourceMapRecord, res);
      }

      return res.status(404).send('Not found');
    });
  });

  return {
    server,
    io,
    app,
    sockets,
    start() {
      server.listen(3000, '127.0.0.1', () => {
        console.log(`${chalk.bold('Server:')} http://127.0.0.1:3000`);
      });
    }
  };
}
