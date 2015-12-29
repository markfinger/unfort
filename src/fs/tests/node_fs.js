import path from 'path';
import fs from 'fs';
import imm from 'immutable';
import {assert} from '../../utils/assert';
import {createNodeFS} from '../node_fs';

describe('fs/node_fs', () => {
  describe('#createNodeFS', () => {
    it('should enable a check for a file\'s existence', (done) => {
      const nodeFS = createNodeFS();

      nodeFS.isFile(__filename, (err, isFile) => {
        assert.isNull(err);
        assert.isTrue(isFile);
        done();
      });
    });
    it('should indicate missing files', (done) => {
      const nodeFS = createNodeFS();

      nodeFS.isFile(path.join(__dirname, '__file_that_does_not_exist__'), (err, isFile) => {
        assert.isNull(err);
        assert.isFalse(isFile);
        done();
      });
    });
    it('should expose fs.readFile', () => {
      const nodeFS = createNodeFS();

      assert.strictEqual(nodeFS.readFile, fs.readFile);
    });
    it('should expose fs.writeFile', () => {
      const nodeFS = createNodeFS();

      assert.strictEqual(nodeFS.writeFile, fs.writeFile);
    });
    it('should expose fs.stat', () => {
      const nodeFS = createNodeFS();

      assert.strictEqual(nodeFS.stat, fs.stat);
    });
  });
});