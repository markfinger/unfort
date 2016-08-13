"use strict";
const bluebird_1 = require('bluebird');
const fs = require('fs');
// We used hand-rolled promise versions of the fs methods as they
// are much, much faster than bluebird's `promisify` function
function readFile(path, encoding) {
    return new bluebird_1.Promise((res, rej) => {
        fs.readFile(path, encoding, (err, data) => {
            if (err)
                return rej(err);
            res(data);
        });
    });
}
exports.readFile = readFile;
function stat(path) {
    return new bluebird_1.Promise((res, rej) => {
        fs.stat(path, (err, data) => {
            if (err)
                return rej(err);
            res(data);
        });
    });
}
exports.stat = stat;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsMkJBQXNCLFVBQVUsQ0FBQyxDQUFBO0FBQ2pDLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBRXpCLGlFQUFpRTtBQUNqRSw2REFBNkQ7QUFFN0Qsa0JBQXlCLElBQUksRUFBRSxRQUFRO0lBQ3JDLE1BQU0sQ0FBQyxJQUFJLGtCQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRztRQUMxQixFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsSUFBSTtZQUNwQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUM7Z0JBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN6QixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQVBlLGdCQUFRLFdBT3ZCLENBQUE7QUFFRCxjQUFxQixJQUFJO0lBQ3ZCLE1BQU0sQ0FBQyxJQUFJLGtCQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRztRQUMxQixFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQztnQkFBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3pCLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBUGUsWUFBSSxPQU9uQixDQUFBIn0=