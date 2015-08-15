import path from 'path';
import debug from 'debug';
import packageJson from '../../package';

const sourceRoot = __dirname;

export function filenameLogger(filename) {
  if (filename.indexOf(sourceRoot) === -1) {
    throw new Error(`${filename} does not contain the source root directory ${sourceRoot}`);
  }

  const relativePath = path.relative(sourceRoot, filename);
  const pathDescription = path.parse(relativePath);

  // Does the file live in the source root
  if (!pathDescription.dir) {
    return logger(pathDescription.name);
  }

  return logger(`${pathDescription.dir}${path.sep}${pathDescription.name}`);
}

export default function logger(name) {
  return debug(`${packageJson.name}:${name}`);
}