import {sortBy} from 'lodash';
import test from 'ava';
import * as parse5 from 'parse5';
import {parse5AstDependencies} from '../parse5_ast_dependencies';

test('should describe the dependency identifiers in HTML text', (t) => {
  const ast = parse5.parse(`
    <html>
        <head>
            <link rel="apple-touch-icon" href="./apple-touch-icon.png">
            <link rel="icon" href="./favicon.png">
            <link rel="stylesheet" href="./test.css">
        </head>
        <body>
            <img src="./foo.png">
            <script src="./bar.js"></script>
            <div>
                <img src="./woz.jpg">
            </div>
        </body>
    </html>
  `);
  const outcome = parse5AstDependencies(ast);
  const expected = [
    './apple-touch-icon.png',
    './favicon.png',
    './test.css',
    './foo.png',
    './bar.js',
    './woz.jpg'
  ];
  t.deepEqual(sortBy(expected), sortBy(outcome.identifiers));
});
