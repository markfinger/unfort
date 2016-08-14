"use strict";
const ava_1 = require('ava');
const postcss = require('postcss');
const postcss_ast_dependencies_1 = require('../postcss_ast_dependencies');
ava_1.default('postcssAstDependencies should find multiple import identifiers', (t) => {
    // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples
    const ast = postcss.parse(`
    @import url("fineprint.css") print;
    @import url("bluish.css") projection, tv;
    @import 'custom.css';
    @import url("chrome://communicator/skin/");
    @import "common.css" screen, projection;
    @import url('landscape.css') screen and (orientation:landscape);
  `);
    t.deepEqual(postcss_ast_dependencies_1.postcssAstDependencies(ast).identifiers, [
        'fineprint.css',
        'bluish.css',
        'custom.css',
        'chrome://communicator/skin/',
        'common.css',
        'landscape.css'
    ]);
});
ava_1.default('postcssAstDependencies should not find commented out import identifiers', (t) => {
    // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples
    const ast = postcss.parse(`
    /* @import url("foo.css"); */
    @import url("bar.css");
    /*@import url("foo.css");*/
  `);
    t.deepEqual(postcss_ast_dependencies_1.postcssAstDependencies(ast).identifiers, ['bar.css']);
});
ava_1.default('postcssAstDependencies should extract multiple url identifiers', (t) => {
    const ast = postcss.parse(`
    .foo {
      background-image: url('./foo.png');
    }
    .bar {
      background-image: url('./bar.png');
    }
  `);
    t.deepEqual(postcss_ast_dependencies_1.postcssAstDependencies(ast).identifiers, [
        './foo.png',
        './bar.png'
    ]);
});
ava_1.default('postcssAstDependencies should not find commented out url identifiers', (t) => {
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
    t.deepEqual(postcss_ast_dependencies_1.postcssAstDependencies(ast).identifiers, []);
});
ava_1.default('postcssAstDependencies should pick up @font-face declarations', (t) => {
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
    t.deepEqual(postcss_ast_dependencies_1.postcssAstDependencies(ast).identifiers, [
        'webfont.eot',
        'webfont.eot?#iefix',
        'webfont.woff2',
        'webfont.woff',
        'webfont.ttf',
        'webfont.svg#svgFontName'
    ]);
});
ava_1.default('getDependencyIdentifiersFromDeclarationValue should find `url(...)` identifiers from strings', (t) => {
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue(''), []);
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue(`
      color: red;
    `), []);
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue(`
      background-image: url('./foo.png');
    `), ['./foo.png']);
    // Not sure if there are any rules that allow multiple
    // urls, but better safe than sorry
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue(`
      background-image:
        url('./foo.png') url('./bar.png');
    `), ['./foo.png', './bar.png']);
});
ava_1.default('getDependencyIdentifiersFromDeclarationValue should not find commented out urls', (t) => {
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue('/*background-image: url("./woz.jpg");*/'), []);
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue('/* background-image: url("./bar.jpg"); */'), []);
    t.deepEqual(postcss_ast_dependencies_1.getDependencyIdentifiersFromDeclarationValue('  /*background-image: url("./foo.jpg");*/'), []);
});
ava_1.default('getDependencyIdentifierFromImportRule should correctly extract identifiers', (t) => {
    // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples
    let rule = postcss.parse('@import url("fineprint.css") print;').first;
    let identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'fineprint.css');
    rule = postcss.parse('@import url("bluish.css") projection, tv;').first;
    identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'bluish.css');
    rule = postcss.parse('@import "custom.css";').first;
    identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'custom.css');
    rule = postcss.parse('@import url("chrome://communicator/skin/");').first;
    identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'chrome://communicator/skin/');
    rule = postcss.parse('@import "common.css" screen, projection;').first;
    identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'common.css');
    rule = postcss.parse('@import url(\'landscape.css\') screen and (orientation:landscape);').first;
    identifier = postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule);
    t.is(identifier, 'landscape.css');
});
ava_1.default('getDependencyIdentifierFromImportRule should throw if the import is missing quotation marks', (t) => {
    let rule = postcss.parse('@import url(test.css);').first;
    const err1 = t.throws(() => postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule));
    t.truthy(err1.message.includes('Malformed @import cannot resolve identifier'));
    rule = postcss.parse('@import test.css;').first;
    const err2 = t.throws(() => postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule));
    t.truthy(err2.message.includes('Malformed @import cannot resolve identifier'));
});
ava_1.default('getDependencyIdentifierFromImportRule should throw if the import is empty', (t) => {
    let rule = postcss.parse('@import url();').first;
    const err1 = t.throws(() => postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule));
    t.truthy(err1.message.includes('Malformed @import cannot resolve identifier'));
    rule = postcss.parse('@import "";').first;
    const err2 = t.throws(() => postcss_ast_dependencies_1.getDependencyIdentifierFromImportRule(rule));
    t.truthy(err2.message.includes('Malformed @import cannot resolve identifier'));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9wb3N0Y3NzX2FzdF9kZXBlbmRlbmNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0ZXN0X3Bvc3Rjc3NfYXN0X2RlcGVuZGVuY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsc0JBQWlCLEtBQUssQ0FBQyxDQUFBO0FBQ3ZCLE1BQVksT0FBTyxXQUFNLFNBQVMsQ0FBQyxDQUFBO0FBQ25DLDJDQUVPLDZCQUE2QixDQUFDLENBQUE7QUFFckMsYUFBSSxDQUFDLGdFQUFnRSxFQUFFLENBQUMsQ0FBQztJQUN2RSx3RkFBd0Y7SUFFeEYsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzs7Ozs7OztHQU96QixDQUFDLENBQUM7SUFFSCxDQUFDLENBQUMsU0FBUyxDQUNULGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFDdkM7UUFDRSxlQUFlO1FBQ2YsWUFBWTtRQUNaLFlBQVk7UUFDWiw2QkFBNkI7UUFDN0IsWUFBWTtRQUNaLGVBQWU7S0FDaEIsQ0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMseUVBQXlFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLHdGQUF3RjtJQUV4RixNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDOzs7O0dBSXpCLENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxTQUFTLENBQ1QsaURBQXNCLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUN2QyxDQUFDLFNBQVMsQ0FBQyxDQUNaLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyxnRUFBZ0UsRUFBRSxDQUFDLENBQUM7SUFDdkUsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzs7Ozs7OztHQU96QixDQUFDLENBQUM7SUFFSCxDQUFDLENBQUMsU0FBUyxDQUNULGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFDdkM7UUFDRSxXQUFX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