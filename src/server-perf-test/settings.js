import path from 'path';
import {range} from 'lodash/utility';

export const DIRECTORY = path.join(__dirname, 'files');
export const FILE_COUNT = 300;
export const MIN_FILE_SIZE = 1;
export const MAX_FILE_SIZE = 30000;
export const ADDRESS = '127.0.0.1';
export const PORTS = range(16).map(num => num + 3000);
export const INCLUDE_ORIGIN_AS_FILE_SERVER = PORTS.length === 1 || false;
export const TEST_ITERATION_COUNT = 10;
