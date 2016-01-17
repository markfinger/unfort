import http from 'http';
import fs from 'fs';
import path from 'path';
import {sample} from 'lodash/collection';
import {range} from 'lodash/utility';
import yargs from 'yargs';
import {
  DIRECTORY, ADDRESS, PORTS, FILE_COUNT, TEST_ITERATION_COUNT, INCLUDE_ORIGIN_AS_FILE_SERVER
} from './settings';

const port = yargs.argv.port;

if (!port) throw new Error('no port number provided');

let availablePorts;
if (INCLUDE_ORIGIN_AS_FILE_SERVER) {
  availablePorts = PORTS;
} else {
  availablePorts = PORTS.slice(1);
}

const files = fs.readdirSync(DIRECTORY).slice(0, FILE_COUNT);

const scripts = files.map(file => {
  const port = sample(availablePorts);
  const url = `http://${ADDRESS}:${port}/${file}`;
  return `<script src="${url}"></script>`
});

const testRun = (new Date()).getTime();

let fileServerCount = availablePorts.length;
if (INCLUDE_ORIGIN_AS_FILE_SERVER) {
  fileServerCount -= 1;
}

const document = `
  <html>
  <head>
    <script>var startTime = (new Date()).getTime();</script>
  </head>
  <body>
    ${scripts.join('\n')}
    <script>
      var timeToExec = +new Date() - performance.timing.connectStart;
      window.addEventListener('load', function() {
        var timeToLoad = +new Date() - performance.timing.connectStart;

        // hacked devtools detection from https://github.com/sindresorhus/devtools-detect/blob/6bb8da71c6be78bb1daae7b8bea02db442337120/index.js
        var devtools = {
          open: false,
          orientation: null
        };
        (function() {
          var threshold = 160;
          var emitEvent = function (state, orientation) {
            window.dispatchEvent(new CustomEvent('devtoolschange', {
              detail: {
                open: state,
                orientation: orientation
              }
            }));
          };

          var widthThreshold = window.outerWidth - window.innerWidth > threshold;
          var heightThreshold = window.outerHeight - window.innerHeight > threshold;
          var orientation = widthThreshold ? 'vertical' : 'horizontal';

          if ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
            widthThreshold || heightThreshold) {
            if (!devtools.open || devtools.orientation !== orientation) {
              emitEvent(true, orientation);
            }

            devtools.open = true;
            devtools.orientation = orientation;
          } else {
            if (devtools.open) {
              emitEvent(false, null);
            }

            devtools.open = false;
            devtools.orientation = null;
          }
        })();

        var perf = window.localStorage.getItem('perf-test-run-${testRun}');
        if (perf) {
          perf = JSON.parse(perf);
        } else {
          perf = {
            fileCount: ${FILE_COUNT},
            fileServerCount: ${fileServerCount},
            originServesFiles: ${INCLUDE_ORIGIN_AS_FILE_SERVER},
            userAgent: navigator.userAgent,
            iterations: []
          };
        }

        var endTime = (new Date()).getTime();

        perf.iterations.push({
          timeToExec: timeToExec,
          timeToLoad: timeToLoad,
          devToolsOpen: devtools.open,
          startTime: startTime,
          endTime: endTime,
          duration: endTime - startTime
        });

        if (perf.iterations.length < ${TEST_ITERATION_COUNT}) {
          window.localStorage.setItem('perf-test-run-${testRun}', JSON.stringify(perf));
          window.location.reload();
        } else {
          console.log(JSON.stringify(perf));
          alert('done');
        }
      });
    </script>
  </body>
  </html>
`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    return res.end(document);
  }

  const file = req.url.slice(1);
  if (files.indexOf(file) === -1) {
    res.statusCode = 404;
    res.statusMessage = 'Not found';
    return res.end('Not found');
  }

  const filename = path.join(DIRECTORY, file);
  const stream = fs.createReadStream(filename);
  stream.pipe(res);
});

server.listen(port, ADDRESS, () => {
  console.log(`listening at http://${ADDRESS}:${port}`);
});