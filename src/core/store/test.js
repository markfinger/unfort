//import {assert} from '../test_utils';
//import {controller} from '../controller';
//
//describe('core/controller', () => {
//  it('should do something', () => {
//    const cont = controller([
//      {
//        name: 'foo',
//        validate: (obj) => {
//          return new Error('Missing')
//        }
//      }
//    ]);
//
//    controller.handle({
//      PARSE_JAVASCRIPT_RECORD: (record, {signals, workers, records}) => Promise.resolve([
//        workers.callWorker({
//          filename: __filename,
//          export: 'generateAST',
//          data: record.fileString
//        }),
//        ({ast}) => records.updateRecord(record, {ast})
//      ]),
//      READ_FILE: (record, {updateRecord}) => {
//        if (record.fileBuffer) {
//          return Promise.resolve(record);
//        }
//
//        return new Promise((resolve, reject) => {
//          fs.readFile(record.filename, (err, buffer) => {
//            if (err) {
//              return reject(err);
//            }
//
//            resolve(updateRecord(record, {fileBuffer: buffer}));
//          });
//        });
//      },
//      READ_TEXT: (record, {updateRecord}) => {
//        if (record.fileString) {
//          return Promise.resolve(record);
//        }
//
//        return new Promise((resolve, reject) => {
//          fs.readFile(record.filename, 'utf8', (err, buffer) => {
//            if (err) {
//              return reject(err);
//            }
//
//            resolve(updateRecord(record, {fileBuffer: buffer}));
//          });
//        });
//      },
//      WRITE_FILE: (record) => new Promise((resolve, reject) => {
//        fs.writeFile(filename, data, (err) => {
//          if (err) {
//            return reject(err);
//          }
//
//          resolve(record);
//        });
//      }),
//      PROCESS_RECORD: ({record}, {fs, next}) => {
//        if (!record.filename.match(/.js$/)) {
//          return next();
//        }
//
//        return fs.readText(record);
//      },
//      INVALIDATE_RECORD: (record, {updateRecord}) => {
//        // fs
//        updateRecord(record, {
//          fileBuffer: null,
//          fileString: null
//        });
//
//        // js
//        updateRecord(record, {
//          ast: null
//        });
//
//        // deps
//        updateRecord(record, {
//          dependencies: null
//        });
//      },
//      UPDATE_RECORD: ({record, updates}) => {
//        Object.keys(data).forEach(key => {
//          record[key] = data[key];
//        });
//        return Promise.resolve(record);
//      },
//      CREATE_RECORD: ({filename, originRecord}) => Promise.resolve({
//        id: 'foo',
//        filename,
//        originRecordId: originRecord.id
//      })
//    })
//  });
//});
//
///*
//potential for race conditions and weird bugs with mutable data and async stuff
//might need to use immutable.js, or some such
// */
//
///*
//
//output should be a function of the inputs
//but becomes problematic with:
//  - data that is resolved async
//  - data that requires a heavy amount of processing (cpu load)
//  - controlling the flow, eg: how to indicate that all records are done?
//
//parts of the scope are functions of their input
//approaching it with a purely functional mentality limits the control flow
//
//seems like we need to mix a bunch of different things together, and add
//escape hatches for the inevitable difficulties and edge cases
//
//
// */