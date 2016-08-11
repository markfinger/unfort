"use strict";

const test = require('ava');
const {scanHtmlText} = require('../compile_html');

test('should describe the dependency identifiers in HTML text', (t) => {
  const outcome = scanHtmlText(`
    <html>
        <body>
            <img src="./foo.png">
            <script src="./bar.js"></script>
            <div>
                <img src="./woz.jpg">
            </div>
        </body>
    </html>
  `);

  t.deepEqual(
    new Set(outcome.get('identifiers')),
    new Set([
      './foo.png',
      './bar.js',
      './woz.jpg'
    ])
  );
});
