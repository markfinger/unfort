"use strict";
const buffer_1 = require('buffer');
const ava_1 = require('ava');
const rxjs_1 = require('rxjs');
const imm = require('immutable');
const file_system_1 = require('../../file_system');
const cyclic_dependency_graph_1 = require('../../cyclic_dependency_graph');
const compiler_1 = require('../compiler');
function createPrepopulatedFileSystemCache(files) {
    const cache = new file_system_1.FileSystemCache();
    for (const path of Object.keys(files)) {
        const file = cache._createFile(path);
        file.setIsFile(true);
        file.setModifiedTime(-Infinity);
        file.setText(files[path]);
        file.setBuffer(new buffer_1.Buffer(files[path]));
    }
    return cache;
}
ava_1.default('Should produce a dependency graph of multiple file types that link to one another', (t) => {
    const files = {
        '/foo/index.html': '<script src="./script1.js">',
        '/foo/script1.js': `
      import "./data1.json";
      import "./styles1.css";
      import "./script2.js";
    `,
        '/foo/script2.js': `
      import "./data2.json";
      import "./styles2.css";
    `,
        '/foo/styles1.css': `
      @import url('./styles2.css');
      body { background-image: url(./image.png); }
    `,
        '/foo/styles2.css': 'div { background-image: url(./image.png); }',
        '/foo/data1.json': '{}',
        '/foo/data2.json': '{}',
        '/foo/image.png': ''
    };
    const compiler = new compiler_1.Compiler();
    compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
    compiler.addEntryPoint('/foo/index.html');
    compiler.compile();
    const obs = new rxjs_1.Subject();
    compiler.error.subscribe(obj => {
        console.error(obj.description);
        obs.error(obj.error);
    });
    compiler.complete.subscribe(data => {
        const expected = cyclic_dependency_graph_1.createNodesFromNotation(`
      /foo/index.html -> /foo/script1.js
      /foo/script1.js -> /foo/data1.json
      /foo/script1.js -> /foo/styles1.css
      /foo/script1.js -> /foo/script2.js
      /foo/script2.js -> /foo/data2.json
      /foo/script2.js -> /foo/styles2.css
      /foo/styles1.css -> /foo/styles2.css
      /foo/styles1.css -> /foo/image.png
      /foo/styles2.css -> /foo/image.png
    `);
        t.truthy(imm.is(expected, data.graph));
        obs.complete();
    });
    return obs;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9jb21waWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlc3RfY29tcGlsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHlCQUFxQixRQUFRLENBQUMsQ0FBQTtBQUM5QixzQkFBaUIsS0FBSyxDQUFDLENBQUE7QUFDdkIsdUJBQXNCLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLE1BQVksR0FBRyxXQUFNLFdBQVcsQ0FBQyxDQUFBO0FBQ2pDLDhCQUE4QixtQkFBbUIsQ0FBQyxDQUFBO0FBQ2xELDBDQUFzQywrQkFBK0IsQ0FBQyxDQUFBO0FBQ3RFLDJCQUF1QixhQUFhLENBQUMsQ0FBQTtBQUVyQywyQ0FBMkMsS0FBSztJQUM5QyxNQUFNLEtBQUssR0FBRyxJQUFJLDZCQUFlLEVBQUUsQ0FBQztJQUNwQyxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDMUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQUVELGFBQUksQ0FBQyxtRkFBbUYsRUFBRSxDQUFDLENBQUM7SUFDMUYsTUFBTSxLQUFLLEdBQUc7UUFDWixpQkFBaUIsRUFBRSw2QkFBNkI7UUFDaEQsaUJBQWlCLEVBQUU7Ozs7S0FJbEI7UUFDRCxpQkFBaUIsRUFBRTs7O0tBR2xCO1FBQ0Qsa0JBQWtCLEVBQUU7OztLQUduQjtRQUNELGtCQUFrQixFQUFFLDZDQUE2QztRQUNqRSxpQkFBaUIsRUFBRSxJQUFJO1FBQ3ZCLGlCQUFpQixFQUFFLElBQUk7UUFDdkIsZ0JBQWdCLEVBQUUsRUFBRTtLQUNyQixDQUFDO0lBQ0YsTUFBTSxRQUFRLEdBQUcsSUFBSSxtQkFBUSxFQUFFLENBQUM7SUFDaEMsUUFBUSxDQUFDLGVBQWUsR0FBRyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNwRSxRQUFRLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDMUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLE1BQU0sR0FBRyxHQUFHLElBQUksY0FBTyxFQUFPLENBQUM7SUFDL0IsUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRztRQUMxQixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMvQixHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztJQUNILFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUk7UUFDOUIsTUFBTSxRQUFRLEdBQUcsaURBQXVCLENBQUM7Ozs7Ozs7Ozs7S0FVeEMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN2QyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDO0FBQ2IsQ0FBQyxDQUFDLENBQUMifQ==