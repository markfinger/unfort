import {isString} from 'lodash/lang';
import {mapValues} from 'lodash/object';
import * as nodeLibsBrowser from 'node-libs-browser';

export const emptyMock = require.resolve('node-libs-browser/mock/empty');

export const nodeCoreLibs = mapValues(nodeLibsBrowser, (filename, dep) => {
  if (filename) {
    return filename;
  }

  try {
    return resolve.sync(`node-libs-browser/mock/${dep}`);
  } catch(err) {
    return emptyMock;
  }
});