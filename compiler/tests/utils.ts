import { FileSystemCache } from '../../file_system';
import { Subject } from 'rxjs';
import { Compiler } from '../compiler';

export function createPrepopulatedFileSystemCache(files) {
  const cache = new FileSystemCache();
  for (const path of Object.keys(files)) {
    const file = cache._createFile(path);
    file.setIsFile(true);
    file.setModifiedTime(-Infinity);
    file.setText(files[path]);
    file.setBuffer(new Buffer(files[path]));
  }
  return cache;
}

export function handleCompilerErrors(compiler: Compiler, subject: Subject<any>) {
  compiler.error.subscribe(obj => {
    if (obj.description) {
      console.error(obj.description);
    }
    subject.error(obj.error);
  });
}