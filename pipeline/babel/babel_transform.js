const Promise = require('bluebird');
const {uniq} = require('lodash/array');
const babel = require('babel-core');
const babelGenerator = require('babel-generator').default;
const {babylonAstDependencies} = require('./babylon_ast_dependencies');

module.exports = {
  babelTransform
};

function babelTransform({pipeline, graph, asset}) {
  return pipeline.readFileAsText(asset.file)
    .then(text => {
      const transformedBabelFile = babel.transform(text, {
        filename: asset.file,
        sourceType: 'module',
        sourceMaps: false,
        code: false,
        ast: true
      });

      let count = 0;
      let knownIdentifiers = Object.create(null);
      function resolveModuleSource(identifier) {
        if (!knownIdentifiers[identifier]) {
          knownIdentifiers[identifier] = count.toString();
          count += 1;
        }
        return knownIdentifiers[identifier];
      }

      const {
        dependencies
      } = babylonAstDependencies(transformedBabelFile.ast, {resolveModuleSource});

      const identifiers = uniq(dependencies.map(dep => dep.identifier));

      const dependencyResolution = identifiers.map(identifier => {
        return pipeline.resolveDependencyIdentifier({
          identifier,
          asset
        })
          .then(resolvedPath => {
            const dep = graph.getOrCreateAssetByFile(resolvedPath);
            graph.addDependency({
              from: asset,
              to: dep
            });
          });
      });

      return Promise.all([
        dependencyResolution,
        pipeline.generateAssetUrl(asset),
        pipeline.generateAssetSourceUrl(asset)
      ]).then(([_, url, sourceUrl]) => {
        asset.url = url;
        asset.sourceUrl = sourceUrl;
        
        const generatedBabelFile = babelGenerator(
          transformedBabelFile.ast, 
          {
            sourceMaps: true,
            sourceMapTarget: url,
            sourceFileName: sourceUrl
          },
          text
        );
        
        asset.code = generatedBabelFile.code;
        asset.sourceMap = generatedBabelFile.map;

        graph.assetCompleted(asset);
      });

    });
}