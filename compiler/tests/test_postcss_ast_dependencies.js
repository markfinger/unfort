"use strict";

const test = require('ava');
const postcss = require('postcss');
const {
  postcssAstDependencies, getDependencyIdentifierFromImportRule, getDependencyIdentifiersFromDeclarationValue
} = require('../postcss_ast_dependencies');

test('postcssAstDependencies should find multiple import identifiers', (t) => {
  // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

  const ast = postcss.parse(`
    @import url("fineprint.css") print;
    @import url("bluish.css") projection, tv;
    @import 'custom.css';
    @import url("chrome://communicator/skin/");
    @import "common.css" screen, projection;
    @import url('landscape.css') screen and (orientation:landscape);
  `);

  t.deepEqual(
    postcssAstDependencies(ast),
    [
      {source: 'fineprint.css'},
      {source: 'bluish.css'},
      {source: 'custom.css'},
      {source: 'chrome://communicator/skin/'},
      {source: 'common.css'},
      {source: 'landscape.css'}
    ]
  );
});

test('postcssAstDependencies should not find commented out import identifiers', (t) => {
  // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

  const ast = postcss.parse(`
    /* @import url("foo.css"); */
    @import url("bar.css");
    /*@import url("foo.css");*/
  `);

  t.deepEqual(
    postcssAstDependencies(ast),
    [{source: 'bar.css'}]
  );
});

test('postcssAstDependencies should extract multiple url identifiers', (t) => {
  const ast = postcss.parse(`
    .foo {
      background-image: url('./foo.png');
    }
    .bar {
      background-image: url('./bar.png');
    }
  `);

  t.deepEqual(
    postcssAstDependencies(ast),
    [
      {source: './foo.png'},
      {source: './bar.png'}
    ]
  );
});

test('postcssAstDependencies should not find commented out url identifiers', (t) => {
  const ast = postcss.parse(`
    .foo {
      /*background-image: url('./foo.png');*/
    }
    /*
    .bar {
      background-image: url('./foo.png');
    }
    */
  `);

  t.deepEqual(postcssAstDependencies(ast), []);
});

test('postcssAstDependencies should pick up @font-face declarations', (t) => {
  // test data sourced from https://css-tricks.com/snippets/css/using-font-face/
  const ast = postcss.parse(`
    @font-face {
      font-family: 'MyWebFont';
      src: url('webfont.eot'); /* IE9 Compat Modes */
      src: url('webfont.eot?#iefix') format('embedded-opentype'), /* IE6-IE8 */
         url('webfont.woff2') format('woff2'), /* Super Modern Browsers */
         url('webfont.woff') format('woff'), /* Pretty Modern Browsers */
         url('webfont.ttf')  format('truetype'), /* Safari, Android, iOS */
         url('webfont.svg#svgFontName') format('svg'); /* Legacy iOS */
    }
  `);

  t.deepEqual(postcssAstDependencies(ast), [
    {source: 'webfont.eot'},
    {source: 'webfont.eot?#iefix'},
    {source: 'webfont.woff2'},
    {source: 'webfont.woff'},
    {source: 'webfont.ttf'},
    {source: 'webfont.svg#svgFontName'}
  ]);
});

test('getDependencyIdentifiersFromDeclarationValue should find `url(...)` identifiers from strings', (t) => {
  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(''),
    []
  );

  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(`
      color: red;
    `),
    []
  );

  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(`
      background-image: url('./foo.png');
    `),
    ['./foo.png']
  );

  // Not sure if there are any rules that allow multiple
  // urls, but better safe than sorry
  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(`
      background-image:
        url('./foo.png') url('./bar.png');
    `),
    ['./foo.png', './bar.png']
  );
});

test('getDependencyIdentifiersFromDeclarationValue should not find commented out urls', (t) => {
  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(
      '/*background-image: url("./woz.jpg");*/'
    ),
    []
  );
  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(
      '/* background-image: url("./bar.jpg"); */'
    ),
    []
  );
  t.deepEqual(
    getDependencyIdentifiersFromDeclarationValue(
      '  /*background-image: url("./foo.jpg");*/'
    ),
    []
  );
});

test('getDependencyIdentifierFromImportRule should correctly extract identifiers', (t) => {
  // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

  let rule = postcss.parse('@import url("fineprint.css") print;').first;
  let identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'fineprint.css');

  rule = postcss.parse('@import url("bluish.css") projection, tv;').first;
  identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'bluish.css');

  rule = postcss.parse('@import "custom.css";').first;
  identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'custom.css');

  rule = postcss.parse('@import url("chrome://communicator/skin/");').first;
  identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'chrome://communicator/skin/');

  rule = postcss.parse('@import "common.css" screen, projection;').first;
  identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'common.css');

  rule = postcss.parse('@import url(\'landscape.css\') screen and (orientation:landscape);').first;
  identifier = getDependencyIdentifierFromImportRule(rule);
  t.is(identifier, 'landscape.css');
});

test('getDependencyIdentifierFromImportRule should throw if the import is missing quotation marks', (t) => {
  let rule = postcss.parse('@import url(test.css);').first;
  const err1 = t.throws(() => getDependencyIdentifierFromImportRule(rule));
  t.truthy(err1.message.includes('Malformed @import cannot resolve identifier'));

  rule = postcss.parse('@import test.css;').first;
  const err2 = t.throws(() => getDependencyIdentifierFromImportRule(rule));
  t.truthy(err2.message.includes('Malformed @import cannot resolve identifier'));
});

test('getDependencyIdentifierFromImportRule should throw if the import is empty', (t) => {
  let rule = postcss.parse('@import url();').first;
  const err1 = t.throws(() => getDependencyIdentifierFromImportRule(rule));
  t.truthy(err1.message.includes('Malformed @import cannot resolve identifier'));

  rule = postcss.parse('@import "";').first;
  const err2 = t.throws(() => getDependencyIdentifierFromImportRule(rule));
  t.truthy(err2.message.includes('Malformed @import cannot resolve identifier'));
});