const fs = require('fs');
const stream = require('stream');
const http = require('http');
const unfort = require('unfort');
const express = require('express');
const socketIo = require('socket.io');
const stripAnsi = require('strip-ansi');
const endsWith = require('lodash/endsWith');
const pull = require('lodash/pull');

unfort.installDebugHelpers();

const hostname = '127.0.0.1';
const port = 3000;
const host = `http://${hostname}:${port}`;
const fileEndpoint = '/__file__/';
const sockets = [];

const build = unfort.createBuild({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./src/main')
  ],
  envHash: {
    files: [__filename, 'package.json', '.babelrc']
  },
  rootUrl: host + fileEndpoint,
  getSockets() {
    return sockets;
  }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

io.on('connection', socket => {
  sockets.push(socket);
  socket.on('disconnect', () => {
    pull(sockets, socket);
  });
});

app.get('/', (req, res) => {
  res.end(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body>
      <script src="/bundle.js"></script>
    </body>
    </html>
  `);
});

app.get('/bundle.js', (req, res) => {
  build.onCompleted(() => {
    if (build.hasErrors()) {
      const message = build.describeErrors();
      return res.status(500).end(stripAnsi(message));
    }

    res.contentType('application/javascript');

    const stream = unfort.createRecordEvalStream(build);
    stream.pipe(res);
  });
});

app.get(fileEndpoint + '*', (req, res) => {
  build.onCompleted(() => {
    if (build.hasErrors()) {
      const message = build.describeErrors();
      return res.status(500).end(stripAnsi(message));
    }

    const url = host + req.path;
    const record = build.getState().recordsByUrl.get(url);

    if (!record) {
      return res.status(404).end('Not Found');
    }

    const mimeType = record.data.mimeType;
    if (mimeType) {
      res.contentType(mimeType);
    }

    if (!record.data.isTextFile) {
      return fs.createReadStream(record.name).pipe(res);
    }

    res.write(record.data.content);
    if (record.data.sourceMapAnnotation) {
      res.write(record.data.sourceMapAnnotation);
    }

    res.end();
  });
});

server.listen(port, hostname);

build.start();
