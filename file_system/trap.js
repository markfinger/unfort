"use strict";
class FileSystemTrap {
    constructor(cache) {
        this.cache = cache;
        this.bindings = new Map();
        this.boundFiles = new Map();
        this.triggerOnChange = new Map();
    }
    isFile(path) {
        return this.cache.isFile(path)
            .then(isFile => {
            const bindings = this._getFileBindings(path);
            if (bindings.isFile === undefined) {
                bindings.isFile = isFile;
            }
            return isFile;
        });
    }
    isFileCallBack(path, cb) {
        return this.isFile(path)
            .then(isFile => cb(null, isFile), err => cb(err));
    }
    stat(path) {
        this._ensureBindingToFile(path);
        this.triggerOnChange[path] = true;
        return this.cache.stat(path)
            .then(stat => {
            const bindings = this._getFileBindings(path);
            bindings.isFile = true;
            if (bindings.modifiedTime === undefined) {
                bindings.modifiedTime = stat.mtime.getTime();
            }
            return stat;
        });
    }
    readModifiedTime(path) {
        this._ensureBindingToFile(path);
        this.triggerOnChange[path] = true;
        return this.cache.readModifiedTime(path)
            .then(modifiedTime => {
            const bindings = this._getFileBindings(path);
            bindings.isFile = true;
            bindings.modifiedTime = modifiedTime;
            return modifiedTime;
        });
    }
    readBuffer(path) {
        this._ensureBindingToFile(path);
        this.triggerOnChange[path] = true;
        return this.cache.readBuffer(path)
            .then(buffer => {
            // Rely on `readModifiedTime` to bind its dependencies
            return this.readModifiedTime(path)
                .then(() => buffer);
        });
    }
    readText(path) {
        this._ensureBindingToFile(path);
        this.triggerOnChange[path] = true;
        return this.cache.readText(path)
            .then(text => {
            // Rely on `readTextHash` to bind its dependencies
            return this.readTextHash(path)
                .then(() => text);
        });
    }
    readTextCallBack(path, cb) {
        return this.readText(path)
            .then(text => cb(null, text), err => cb(err));
    }
    readTextHash(path) {
        this._ensureBindingToFile(path);
        this.triggerOnChange[path] = true;
        return this.cache.readTextHash(path)
            .then(textHash => {
            // Rely on `readModifiedTime` to bind its dependencies
            return this.readModifiedTime(path)
                .then(() => {
                const bindings = this._getFileBindings(path);
                if (bindings.textHash === undefined) {
                    bindings.textHash = textHash;
                }
                return textHash;
            });
        });
    }
    describeDependencies() {
        const description = {};
        for (const [key, value] of this.bindings) {
            description[key] = value;
        }
        return description;
    }
    _ensureBindingToFile(path) {
        if (!this.boundFiles.has(path)) {
            this.boundFiles.set(path, true);
            this.cache._bindTrapToFile(this, path);
        }
    }
    _getFileBindings(path) {
        let bindings = this.bindings.get(path);
        if (!bindings) {
            bindings = {};
            this.bindings.set(path, bindings);
            this._ensureBindingToFile(path);
        }
        return bindings;
    }
}
exports.FileSystemTrap = FileSystemTrap;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUdBO0lBS0UsWUFBWSxLQUFLO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFJO1FBQ1QsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQzthQUMzQixJQUFJLENBQUMsTUFBTTtZQUNWLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3QyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQzNCLENBQUM7WUFDRCxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUNELGNBQWMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7YUFDckIsSUFBSSxDQUNILE1BQU0sSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUMxQixHQUFHLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUNmLENBQUM7SUFDTixDQUFDO0lBQ0QsSUFBSSxDQUFDLElBQUk7UUFDUCxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMs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