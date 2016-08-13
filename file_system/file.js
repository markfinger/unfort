"use strict";
const bluebird_1 = require('bluebird');
const hash_1 = require('../utils/hash');
class File {
    constructor(path, fileSystem) {
        this.path = path;
        this.fileSystem = fileSystem;
    }
    getStat() {
        if (!this.stat) {
            this.stat = this.fileSystem.stat(this.path);
        }
        return this.stat;
    }
    setStat(stat) {
        this.stat = bluebird_1.Promise.resolve(stat);
    }
    getModifiedTime() {
        if (!this.modifiedTime) {
            this.modifiedTime = this.getStat()
                .then(stat => stat.mtime.getTime());
        }
        return this.modifiedTime;
    }
    setModifiedTime(modifiedTime) {
        this.modifiedTime = bluebird_1.Promise.resolve(modifiedTime);
    }
    getIsFile() {
        if (!this.isFile) {
            this.isFile = this.getStat()
                .then(stat => stat.isFile())
                .catch(err => {
                if (err.code === 'ENOENT') {
                    return false;
                }
                return bluebird_1.Promise.reject(err);
            });
        }
        return this.isFile;
    }
    setIsFile(isFile) {
        this.isFile = bluebird_1.Promise.resolve(isFile);
    }
    getBuffer() {
        if (!this.buffer) {
            this.buffer = this.fileSystem.readFile(this.path);
        }
        return this.buffer;
    }
    setBuffer(buffer) {
        this.buffer = bluebird_1.Promise.resolve(buffer);
    }
    getText() {
        if (!this.text) {
            // Rather than read this file's buffer, we invoke the file system
            // directly. This does suggest that in certain edge-cases a file
            // may be read twice, but in most cases this will help to reduce
            // memory as we only store one copy of the file's contents
            this.text = this.fileSystem.readFile(this.path, 'utf8');
        }
        return this.text;
    }
    setText(text) {
        this.text = bluebird_1.Promise.resolve(text);
    }
    getTextHash() {
        if (!this.textHash) {
            this.textHash = this.getText()
                .then(hash_1.generateStringHash);
        }
        return this.textHash;
    }
    setTextHash(textHash) {
        this.textHash = bluebird_1.Promise.resolve(textHash);
    }
}
exports.File = File;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLDJCQUF3QixVQUFVLENBQUMsQ0FBQTtBQUNuQyx1QkFBbUMsZUFBZSxDQUFDLENBQUE7QUFJbkQ7SUFTRSxZQUFZLElBQUksRUFBRSxVQUFVO1FBQzFCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQy9CLENBQUM7SUFDRCxPQUFPO1FBQ0wsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNuQixDQUFDO0lBQ0QsT0FBTyxDQUFDLElBQUk7UUFDVixJQUFJLENBQUMsSUFBSSxHQUFHLGtCQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFDRCxlQUFlO1FBQ2IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUN2QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUU7aUJBQy9CLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztJQUMzQixDQUFDO0lBQ0QsZUFBZSxDQUFDLFlBQVk7UUFDMUIsSUFBSSxDQUFDLFlBQVksR0FBRyxrQkFBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBQ0QsU0FBUztRQUNQLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDakIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFO2lCQUN6QixJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztpQkFDM0IsS0FBSyxDQUFDLEdBQUc7Z0JBQ1IsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUMxQixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNmLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3JCLENBQUM7SUFDRCxTQUFTLENBQUMsTUFBTTtRQUNkLElBQUksQ0FBQyxNQUFNLEdBQUcsa0JBQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUNELFNBQVM7UUFDUCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBQ0QsU0FBUyxDQUFDLE1BQU07UUFDZCxJQUFJLENBQUMsTUFBTSxHQUFHLGtCQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFDRCxPQUFPO1FBQ0wsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNmLGlFQUFpRTtZQUNqRSxnRUFBZ0U7WUFDaEUsZ0VBQWdFO1lBQ2hFLDBEQUEwRDtZQUMxRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDMUQsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQ25CLENBQUM7SUFDRCxPQUFPLENBQUMsSUFBSTtRQUNWLElBQUksQ0FBQyxJQUFJLEdBQUcsa0JBQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUNELFdBQVc7UUFDVCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRTtpQkFDM0IsSUFBSSxDQUFDLHlCQUFrQixDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3ZCLENBQUM7SUFDRCxXQUFXLENBQUMsUUFBUTtRQUNsQixJQUFJLENBQUMsUUFBUSxHQUFHLGtCQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzVDLENBQUM7QUFDSCxDQUFDO0FBaEZZLFlBQUksT0FnRmhCLENBQUEifQ==