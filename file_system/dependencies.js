"use strict";
const bluebird_1 = require('bluebird');
function validateFileSystemDependencies(cache, dependencies) {
    const files = Object.keys(dependencies)
        .map(path => {
        const dependency = dependencies[path];
        const jobs = [];
        if ('isFile' in dependency) {
            jobs.push(cache.isFile(path)
                .then(isFile => isFile === dependency.isFile));
        }
        if ('modifiedTime' in dependency) {
            jobs.push(cache.readModifiedTime(path)
                .then(modifiedTime => modifiedTime === dependency.modifiedTime));
        }
        if ('textHash' in dependency) {
            jobs.push(cache.readTextHash(path)
                .then(textHash => textHash === dependency.textHash));
        }
        return bluebird_1.Promise.all(jobs)
            .then(validateChecks);
    });
    return bluebird_1.Promise.all(files)
        .then(validateChecks);
}
exports.validateFileSystemDependencies = validateFileSystemDependencies;
function validateChecks(arr) {
    return arr.every(validateCheck);
}
function validateCheck(value) {
    return value === true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwZW5kZW5jaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwyQkFBc0IsVUFBVSxDQUFDLENBQUE7QUFHakMsd0NBQStDLEtBQXNCLEVBQUUsWUFBaUI7SUFDdEYsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7U0FDcEMsR0FBRyxDQUFDLElBQUk7UUFDUCxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxJQUFJLENBQ1AsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7aUJBQ2YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLEtBQUssVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLGNBQWMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxJQUFJLENBQ1AsS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztpQkFDekIsSUFBSSxDQUFDLFlBQVksSUFBSSxZQUFZLEtBQUssVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUNsRSxDQUFDO1FBQ0osQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLFVBQVUsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzdCLElBQUksQ0FBQyxJQUFJLENBQ1AsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUM7aUJBQ3JCLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxLQUFLLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FDdEQsQ0FBQztRQUNKLENBQUM7UUFDRCxNQUFNLENBQUMsa0JBQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO2FBQ3JCLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMxQixDQUFDLENBQUMsQ0FBQztJQUNMLE1BQU0sQ0FBQyxrQkFBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7U0FDdEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQzFCLENBQUM7QUE1QmUsc0NBQThCLGlDQTRCN0MsQ0FBQTtBQUVELHdCQUF3QixHQUFHO0lBQ3pCLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ2xDLENBQUM7QUFFRCx1QkFBdUIsS0FBSztJQUMxQixNQUFNLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQztBQUN4QixDQUFDIn0=