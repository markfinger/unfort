import fs from 'fs';
import babelCodeFrame from 'babel-code-frame';
import chalk from 'chalk';
import {includes} from 'lodash/collection';

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

  // If the error occurred in a particular file's processing, we
  // contextualize the error
  if (file) {
    lines.push(chalk.red(file) + '\n');
  }

  // If the stack trace already contains the message, we improve the
  // readability by omitting the message
  if (!includes(err.stack, err.message)) {
    lines.push(err.message);
  }

  // Improve the reporting on parse errors by generating a code frame
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