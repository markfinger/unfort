var fs = require('fs');
var profiler = require('v8-profiler');
const tracerPerf = require('./lib/tests/tracer_perf');

profiler.startProfiling('1', true);

tracerPerf(false, function() {
  var profile1 = profiler.stopProfiling();

  profile1.export(function(error, result) {
    fs.writeFileSync(+new Date() + '.cpuprofile', result);
    profile1.delete();
  });
});

