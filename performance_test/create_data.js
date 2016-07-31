"use strict";

const os = require('os');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const bluebird = require('bluebird');
const {range, sample, sampleSize, random} = require('lodash');

process.on('unhandledRejection', err => { throw err; });

const ROOT = __dirname;
const CHARACTERS = 'abcdefghijklmnopqrstuvwxyz';
const SOURCE_DIR = 'src';
const NODE_MODULES_DIR = 'node_modules';
const DIRECTORY_WIDTH = 5;
const DIRECTORY_DEPTH = 5;
const FILE_COUNT = 5;
const DEPENDENCIES_PER_FILE = 5;
const MAX_PARALLEL_WRITES = 30;

const data = {
  files: [],
  dependenciesByFile: {},
  contentByFile: {},
  fileStructure: {}
};

const sourceFiles = createFiles().map(file => SOURCE_DIR + path.sep + file);
const nodeModulesFiles = createFiles().map(file => NODE_MODULES_DIR + path.sep + file);

data.files = sourceFiles.concat(nodeModulesFiles);

function createFiles() {
  const files = [];
  function populateFiles(directory) {
    range(FILE_COUNT).forEach(i => {
      const name = directory + path.sep + CHARACTERS[i] + '.js';
      files.push(name);
    });
  }
  range(DIRECTORY_WIDTH).forEach(outerWidth => {
    const directories = [CHARACTERS[outerWidth]];
    range(DIRECTORY_DEPTH).forEach(depth => {
      const directory = directories.join(path.sep);
      populateFiles(directory);
      range(DIRECTORY_WIDTH).forEach(innerWidth => {
        let subdirectory = CHARACTERS[innerWidth];
        if (directory) {
          subdirectory = directory + path.sep + subdirectory;
        }
        populateFiles(subdirectory);
      });
      directories.push(CHARACTERS[depth]);
    });
  });
  files.sort();
  return files;
}

// Source files should link to source files and module files
for (const file of sourceFiles) {
  data.dependenciesByFile[file] = [];
  range(DEPENDENCIES_PER_FILE).forEach((i) => {
    let dep;
    do {
      if (i % 2 === 0) {
        dep = sample(sourceFiles);
      } else {
        dep = sample(nodeModulesFiles);
      }
    } while(dep === file);
    data.dependenciesByFile[file].push(dep);
  });
}
// Module files should only link to other module files
for (const file of nodeModulesFiles) {
  data.dependenciesByFile[file] = [];
  range(DEPENDENCIES_PER_FILE).forEach(() => {
    let dep;
    do {
      dep = sample(nodeModulesFiles);
    } while(dep === file);
    data.dependenciesByFile[file].push(dep);
  });
}

const RANDOM_CONTENT_POOL = [
`
const foo = "bar";
for (const char of foo) {
  console.log(char);
}
`,
`
const bar = [1, 2, 3];
bar.forEach(i => console.log(i));
`,
`
const woz = {foo: 'foo', bar: 'bar'};
for (var key in woz) {
  if (woz.hasOwnProperty(key)) {
    console.log(woz[key]);
  }
}
`
];

function createRandomContent() {
  const count = random(0, RANDOM_CONTENT_POOL.length);
  const content = sampleSize(RANDOM_CONTENT_POOL, count);
  return content.join(os.EOL);
}

let nodeModulesDepTick = 0;
for (const file of data.files) {
  let content = '';
  data.dependenciesByFile[file].forEach((dep, i) => {
    if (dep.startsWith(NODE_MODULES_DIR)) {
      nodeModulesDepTick += 1;
      // Some modules should instead be linked via a root package
      if (nodeModulesDepTick % 2 === 0) {
        const start = NODE_MODULES_DIR.length + path.sep.length;
        dep = dep.slice(start, start + 1);
      } else {
        dep = dep.slice(NODE_MODULES_DIR.length + path.sep.length);
      }
    } else {
      dep = path.relative(path.dirname(file), dep);
      if (!dep.startsWith('.')) {
        dep = './' + dep;
      }
    }
    if (file.startsWith(NODE_MODULES_DIR)) {
      content += `const ${CHARACTERS[i]} = require("${dep}");${os.EOL}`;
    } else {
      content += `import ${CHARACTERS[i]} from "${dep}";${os.EOL}`;
    }
  });
  content += createRandomContent();
  data.contentByFile[file] = content;
}

range(DIRECTORY_WIDTH).forEach(i => {
  const packageJson = path.join(NODE_MODULES_DIR, CHARACTERS[i], 'package.json');
  data.files.push(packageJson);
  // Inject a package.json that points to a random file in the root
  data.contentByFile[packageJson] = JSON.stringify({
    name: CHARACTERS[i],
    main: `./${CHARACTERS[FILE_COUNT]}.js`
  });
  const main = path.join(NODE_MODULES_DIR, CHARACTERS[i], `${CHARACTERS[FILE_COUNT]}.js`);
  data.files.push(main);
  data.contentByFile[main] = `module.exports = require("./${CHARACTERS[random(0, FILE_COUNT-1)]}");`
});

const phases = [[]];
let currentPhase = phases[0];
for (const file of data.files) {
  currentPhase.push(file);
  if (currentPhase.length === MAX_PARALLEL_WRITES) {
    currentPhase = [];
    phases.push(currentPhase);
  }
}

// const writeFile = bluebird.promisify(fs.writeFile);

let block = Promise.resolve();
for (const phase of phases) {
  block = block.then(() => {
    const writes = phase.map(file => {
      const absPath = path.join(ROOT, file);
      // console.log(`Writing: ${absPath}`);
      return new Promise((res, rej) => {
        mkdirp(path.dirname(absPath), err => {
          if (err) return rej(err);
          fs.writeFile(absPath, data.contentByFile[file], err => {
            if (err) return rej(err);
            res();
          });
        });
      });
    });
    return Promise.all(writes)
      .then(() => process.stdout.write('.'));
  });
}

block.then(() => {
  console.log(`\nWrote ${data.files.length} files`);
});
