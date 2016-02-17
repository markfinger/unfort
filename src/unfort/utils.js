import fs from 'fs';
import {Readable} from 'stream';
import babelCodeFrame from 'babel-code-frame';
import chalk from 'chalk';
import {includes} from 'lodash/collection';

// We need to rebuild source maps for js files such that it
// reflects the call to our module runtime. Unfortunately, source
// maps are slow to both consume and generate. However, given
// that we know our call to the runtime only consumes one line,
// we can take advantage of the line offset character in source
// maps to simply offset everything.
//
// For context, source maps are encoded such that that semicolons
// are used to indicate line offset. Hence, we can just prepend
// a semi-colon to achieve the desired effect
export const JS_MODULE_SOURCE_MAP_LINE_OFFSET = ';';

export function createJSModuleDefinition({name, deps, hash, code}) {
  const lines = [
    `__modules.defineModule({name: ${JSON.stringify(name)}, deps: ${JSON.stringify(deps)}, hash: ${JSON.stringify(hash)}, factory: function(module, exports, require, process, global) {`,
    code,
    '}});'
  ];

  return lines.join('\n');
}

export function createRecordDescription(record) {
  // Produce a description of a record that the hot runtime
  // can consume
  return {
    name: record.name,
    hash: record.data.hash,
    url: record.data.url,
    isTextFile: record.data.isTextFile
  };
}

export function createRecordContentStream(record) {
  if (!record.data.isTextFile) {
    return fs.createReadStream(record.name);
  }

  const stream = new Readable();
  stream.push(record.data.code);

  if (record.data.sourceMapAnnotation) {
    stream.push(record.data.sourceMapAnnotation);
  }

  stream.push(null);

  return stream;
}

export function createRecordSourceMapStream(record) {
  const stream = new Readable();
  stream.push(record.data.sourceMap);
  stream.push(null);
  return stream;
}

export function describeError(err, file) {
  const lines = [];

  if (file) {
    lines.push(chalk.red(file) + '\n');
  }

  lines.push(err.message);

  if (err.loc && !err.codeFrame) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      // Ignore the error
    }
    if (text) {
      err.codeFrame = babelCodeFrame(text, err.loc.line, err.loc.column);
    }
  }

  if (
    err.codeFrame &&
    // We should try to avoid duplicating the code frame, if it's
    // already been added by another tool
    !includes(err.message, err.codeFrame) &&
    !includes(err.stack, err.codeFrame)
  ) {
    lines.push(err.codeFrame);
  }

  lines.push(err.stack);

  return lines.join('\n');
}

export function describeErrorList(errors) {
  return errors
    .map(obj => {
      if (obj instanceof Error) {
        return describeError(obj);
      } else {
        return describeError(obj.error, obj.node);
      }
    })
    .join('\n');
}