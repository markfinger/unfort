"use strict";

const {sortBy} = require('lodash');
const test = require('ava');
const {scanHtmlText} = require('../compile_html');

test('should describe the dependency identifiers in HTML text', (t) => {
  const outcome = scanHtmlText(`
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

  const expected = [
    './apple-touch-icon.png',
    './favicon.png',
    './test.css',
    './foo.png',
    './bar.js',
    './woz.jpg'
  ];
  t.deepEqual(sortBy(expected), sortBy(outcome.get('identifiers')));
});
