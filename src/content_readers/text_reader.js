import {isString} from 'lodash/lang';

export function createTextReader() {
  return function textReader(options, pipeline, cb) {
    const {file} = options;
    const {fs} = pipeline;

    if (!isString(file)) {
      return cb(new Error(`A \`file\` option must be provided: ${JSON.stringify(options)}`))
    }

    fs.isFile(file, (err, isFile) => {
      if (!isFile) {
        return cb(new Error(`Text file "${file}" is not a file`));
      }

      fs.readFile(file, 'utf8', (err, content) => {
        if (err) return cb(err);

        return cb(null, content);
      })
    });
  };
}