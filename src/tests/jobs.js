import {assert} from './assert';
import {createState} from '../state';
import {createJobs} from '../jobs';

describe('unfort/jobs', () => {
  describe('#createJobs', () => {
    it('should produce an object of named jobs', () => {
      const jobs = createJobs({});
      assert.isObject(jobs);
      assert.isFunction(jobs.ready);
    });
  });
  describe('##ready', () => {
    it('should ', () => {
      
    });
  });
  describe('##isTextFile', () => {
    it('should ', () => {
      
    });
  });
  describe('##mimeType', () => {
    it('should ', () => {
      
    });
  });
  describe('##readText', () => {
    it('should ', () => {
      
    });
  });
  describe('##stat', () => {
    it('should ', () => {
      
    });
  });
  describe('##mtime', () => {
    it('should ', () => {
      
    });
  });
  describe('##hashText', () => {
    it('should ', () => {
      
    });
  });
  describe('##hash', () => {
    it('should ', () => {
      
    });
  });
  describe('##cache', () => {
    it('should ', () => {
      
    });
  });
  describe('##cacheKey', () => {
    it('should ', () => {
      
    });
  });
  describe('##readCache', () => {
    it('should ', () => {
      
    });
  });
  describe('##writeCache', () => {
    it('should ', () => {
      
    });
  });
  describe('##hashedFilename', () => {
    it('should ', () => {
      
    });
  });
  describe('##hashedPath', () => {
    it('should ', () => {
      
    });
  });
  describe('##url', () => {
    it('should ', () => {
      
    });
  });
  describe('##sourceUrl', () => {
    it('should ', () => {
      
    });
  });
  describe('##sourceMapUrl', () => {
    it('should ', () => {
      
    });
  });
  describe('##sourceMapAnnotation', () => {
    it('should ', () => {
      
    });
  });
  describe('##postcssPlugins', () => {
    it('should ', () => {
      
    });
  });
  describe('##postcssProcessOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##postcssTransform', () => {
    it('should ', () => {
      
    });
  });
  describe('##shouldBabelTransfrom', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelTransformOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelTransform', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelGeneratorOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelGenerator', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelFile', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelAst', () => {
    it('should ', () => {
      
    });
  });
  describe('##babylonAst', () => {
    it('should ', () => {
      
    });
  });
  describe('##ast', () => {
    it('should ', () => {
      
    });
  });
  describe('##analyzeDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##dependencyIdentifiers', () => {
    it('should ', () => {
      
    });
  });
  describe('##packageDependencyIdentifiers', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolver', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolverOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvePathDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvePackageDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvedDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##code', () => {
    it('should ', () => {
      
    });
  });
  describe('##sourceMap', () => {
    it('should ', () => {

    });
  });
});