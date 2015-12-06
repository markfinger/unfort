import debug from 'debug';
import packageJson from '../../../package';

export function logger(name) {
  return debug(`${packageJson.name}:${name}`);
}