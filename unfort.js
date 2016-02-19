const fs = require('fs');
const unfort = require('./lib/unfort/unfort');

unfort.installDebugHelpers();

const build = unfort.createBuild({
  entryPoints: [
    unfort.hotRuntime,
    require.resolve('./test-src/entry')
  ],
  envHash: {
    files: [__filename, 'package.json']
  }
});

build.start();

const server = build.getState().server;

server.app.get('/', (req, res) => {
  res.end(`
    <html>
    <head></head>
    <body>
      <script src="/inject.js"></script>
    </body>
    </html>
  `);
});

const recordInjector = server.createRecordInjector(build);
server.app.get('/inject.js', (req, res) => recordInjector(res));