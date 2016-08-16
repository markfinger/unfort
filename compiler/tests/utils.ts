import { Subject } from 'rxjs';
import { Compiler } from '../compiler';

export function handleCompilerErrors(compiler: Compiler, subject: Subject<any>) {
  compiler.error.subscribe(obj => {
    if (obj.description) {
      console.error(obj.description);
    }
    subject.error(obj.error);
  });
}