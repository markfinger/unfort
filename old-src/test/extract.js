import {parse, types as t} from 'babel-core';
import im from 'immutable';
import {
  extractDependencyFromImportDeclaration, extractDependencyFromRequireCallExpression,
  extractDependenciesFromNode
} from '../alas/extract';
import {assert} from './assert';

describe('alas/extract', () => {
  describe('#extractDependencyFromImportDeclaration', () => {
    it('should handle one argument literals', () => {
      const node = t.importDeclaration(t.importSpecifier(t.literal('foo')), t.literal('bar'));
      const [err, dep] = extractDependencyFromImportDeclaration({node});
      assert.isNull(err);
      assert.equal(dep, 'bar');
    });
    it ('should handle one argument literals indicating a relative path', () => {
      const node = t.importDeclaration(t.importSpecifier(t.literal('foo')), t.literal('./bar'));
      const [err, dep] = extractDependencyFromImportDeclaration({node});
      assert.isNull(err);
      assert.equal(dep, './bar');
    });
  });
  describe('#extractDependencyFromRequireCallExpression', () => {
    it('should handle one argument literals', () => {
      const node = t.callExpression(t.identifier('require'), [t.literal('foo')]);

      const [err, dep] = extractDependencyFromRequireCallExpression({node});

      assert.isNull(err);
      assert.equal(dep, 'foo');
    });
    it('should handle one argument literals indicating a relative path', () => {
      const node = t.callExpression(t.identifier('require'), [t.literal('./foo')]);

      const [err, dep] = extractDependencyFromRequireCallExpression({node});

      assert.isNull(err);
      assert.equal(dep, './foo');
    });
  });
  describe('#extractDependenciesFromNode', () => {
    it('should return a list of extracted dependencies', () => {
      const node = parse(`
        var foo = require('foo');
        foo();

        var fooRel = require('./fooRel');
        fooRel() + 12 ? true : false;

        import bar from 'bar';
        [bar];

        import barRel from './barRel';
        console.log({barRel: barRel()});
      `);

      const dependencies = extractDependenciesFromNode({node});
      assert.equal(dependencies.size, 4, 'returns a list of 4 dependencies');

      const withErrors = dependencies.filter(dep => dep.get('errors'));
      assert.equal(withErrors.size, 0, 'no errors were encountered');

      const extractedDependencies = dependencies.map(dep => dep.get('dependency'));
      assert.isTrue(
        im.is(extractedDependencies, im.List(['foo', './fooRel', 'bar', './barRel'])),
        'extracted dependencies match the expected'
      );
    });
    it('should return extracted dependencies in the expected form', () => {
      const node = parse('require("foo");');

      const dependencies = extractDependenciesFromNode({node});
      assert.equal(dependencies.size, 1, 'returns a list containing one dependency');

      const dependency = dependencies.get(0);
      const expected = im.Map({
        error: null,
        dependency: 'foo',
        node: im.Map({
          type: 'CallExpression',
          location: im.Map({
            start: im.Map({ line: 1, column: 0 }),
            end: im.Map({ line: 1, column: 14 })
          })
        })
      });
      assert.isTrue(im.is(dependency, expected), 'returns a dependency in the expected form');
    });
    it('should handle an empty node', () => {
      const node = parse('');

      const dependencies = extractDependenciesFromNode({node});
      assert.equal(dependencies.size, 0, 'no dependencies were found');

      const withErrors = dependencies.filter(dep => { return dep.get('errors'); });
      assert.equal(withErrors.size, 0, 'no errors were encountered');
    });
  });
});