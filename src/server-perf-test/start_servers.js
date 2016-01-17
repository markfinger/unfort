import http from 'http';
import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import {sample} from 'lodash/collection';
import {range} from 'lodash/utility';
import {DIRECTORY, ADDRESS, PORTS, FILE_COUNT} from './settings';

const mod = require.resolve('./server');
PORTS.forEach(port => {
  const child = childProcess.fork(mod, ['--port', String(port)]);
});