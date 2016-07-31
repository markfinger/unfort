const {FileSystemCache} = require('./cache');
const {readFile, stat} = require('./utils');

module.exports = {
  FileSystemCache,
  readFile,
  stat
};
