import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';
import {range} from 'lodash/utility';
import {random} from 'lodash/number';
import {FILE_COUNT, DIRECTORY, MIN_FILE_SIZE, MAX_FILE_SIZE} from './settings';

mkdirp.sync(DIRECTORY);

range(FILE_COUNT).forEach(num => {
  const file = path.join(DIRECTORY, `${num}.js`);
  const size = random(MIN_FILE_SIZE, MAX_FILE_SIZE);
  const data = range(size).join('');
  fs.writeFileSync(file, `/*${data}*/\nvar file${num} = ${size};\n`);
});

/* */