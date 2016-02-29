import fs from 'fs';
import path from 'path';
import {Readable} from 'stream';
import babelCodeFrame from 'babel-code-frame';
import chalk from 'chalk';
import {includes} from 'lodash/collection';
import {startsWith} from 'lodash/string';

/**
 * We need to rebuild source maps for js files such that it
 * reflects the call to our module runtime. Unfortunately, source
 * maps are slow to both consume and generate. However, given
 * that we know our call to the runtime only consumes one line,
 * we can take advantage of the line offset character in source
 * maps to simply offset everything.
 *
 * For context, source maps are encoded such that that semicolons
 * are used to indicate line offset. Hence, we can just prepend
 * a semi-colon to achieve the desired effect
 *
 * @type {String}
 */
export const JS_MODULE_SOURCE_MAP_LINE_OFFSET = ';';

/**
 * Produces a string that can be used to inject a module definition
 * into the bootstrap runtime
 *
 * @param name
 * @param deps
 * @param hash
 * @param code
 * @returns {String}
 */
export function createJSModuleDefinition({name, deps, hash, code}) {
  const lines = [
    `__modules.defineModule({name: ${JSON.stringify(name)}, deps: ${JSON.stringify(deps)}, hash: ${JSON.stringify(hash)}, factory: function(module, exports, require, process, global) {`,
    code,
    '}});'
  ];

  return lines.join('\n');
}

/**
 * Produces a description of a record that the hot runtime can consume
 *
 * @param {Record} record
 * @returns {Object}
 */
export function createRecordDescription(record) {
  return {
    name: record.name,
    hash: record.data.hash,
    url: record.data.url,
    isTextFile: record.data.isTextFile
  };
}

/**
 * Returns a stream that can pipe a record's content.
 *
 * If the record represents a text file, it emits the Record's
 * `code` and, if available, the `sourceMapAnnotation`.
 *
 * If the record is not a text file, it simply pipes directly
 * from the filesystem.
 *
 * @param {Record} record
 * @returns {stream.Readable}
 */
export function createRecordContentStream(record) {
  if (!record.data.isTextFile) {
    return fs.createReadStream(record.name);
  }

  const stream = new Readable();
  stream.push(record.data.moduleDefinition);

  if (record.data.sourceMapAnnotation) {
    stream.push(record.data.sourceMapAnnotation);
  }

  stream.push(null);

  return stream;
}

/**
 * Returns a stream that can pipe a record's source map
 *
 * @param {Record} record
 * @returns {stream.Readable}
 */
export function createRecordSourceMapStream(record) {
  const stream = new Readable();
  stream.push(record.data.sourceMap);
  stream.push(null);
  return stream;
}

/**
 * Given an Error object, produces a textual description.
 *
 * Accepts an optional path to a file, which will be used to
 * provide extra context for the error.
 *
 * @param {Error} err
 * @param {String} [file]
 * @returns {string}
 */
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

/**
 * Given an Array of errors (or error objects from the graph), produce a
 * a textual description appropriate for logging
 *
 * @param {Array} errors
 * @returns {String}
 */
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

/**
 * If a location is contained by a directory, returns a relative path,
 * otherwise returns the location.
 * @param {String} dirname
 * @param {String} location
 * @returns {String}
 */
export function relativePathIfContained(dirname, location) {
  if (startsWith(location, dirname)) {
    return path.relative(dirname, location);
  } else {
    return location;
  }
}