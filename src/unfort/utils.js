import fs from 'fs';
import babelCodeFrame from 'babel-code-frame';
import * as mimeTypes from 'mime-types';
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

export function createJSModule({name, deps, hash, code}) {
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

export function writeRecordToStream(record, stream) {
  // Add mime-types to http streams
  if (stream.contentType) {
    const mimeType = mimeTypes.lookup(record.data.hashedFilename);
    if (mimeType) {
      stream.contentType(mimeType);
    }
  }

  if (!record.data.isTextFile) {
    return fs.createReadStream(record.name).pipe(stream);
  }

  stream.write(record.data.code);

  const sourceMapAnnotation = record.data.sourceMapAnnotation;
  if (sourceMapAnnotation) {
    stream.write(sourceMapAnnotation);
  }

  return stream.end();
}

export function writeSourceMapToStream(record, stream) {
  const sourceMap = record.data.sourceMap;
  stream.end(sourceMap);
}

export function buildErrorMessage(err, file) {
  const lines = [];

  if (file) {
    lines.push(chalk.red(file), '');
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

  if (err.codeFrame && !includes(err.stack, err.codeFrame)) {
    lines.push(err.codeFrame);
  }

  lines.push(err.stack);

  return lines.join('\n');
}

export function describeBuildErrors(errors) {
  return errors
    .map(obj => {
      if (obj instanceof Error) {
        return buildErrorMessage(obj);
      } else {
        return buildErrorMessage(obj.error, obj.node);
      }
    })
    .join('\n');
}