"use strict";
const ava_1 = require('ava');
const tmp_1 = require('tmp');
const persistent_cache_1 = require('../persistent_cache');
// Be aware that persistence slows down the test suite, due to the IO
// overhead of sqlite's initialization. Whenever possible, consolidate
// persistence tests to keep the test suite performant
const TEST_DB = tmp_1.fileSync().name;
ava_1.default('should accept a path and create a sqlite db that can read/write data that persists across connections', (t) => {
    const cache1 = new persistent_cache_1.PersistentCache(TEST_DB);
    cache1.set('test 1', 'some data');
    cache1.set('test 2', 'some other data');
    const testRead = cache1.persistChanges()
        .then(() => cache1.closeDatabaseConnection)
        .then(() => {
        const cache2 = new persistent_cache_1.PersistentCache(TEST_DB);
        return Promise.all([
            cache2.get('test 1'),
            cache2.get('test 2')
        ])
            .then(([data1, data2]) => {
            t.is(data1, 'some data');
            t.is(data2, 'some other data');
            cache2.remove('test 1');
            return cache2.persistChanges()
                .then(() => cache2.closeDatabaseConnection)
                .then(() => {
                const cache3 = new persistent_cache_1.PersistentCache(TEST_DB);
                return Promise.all([
                    cache3.get('test 1'),
                    cache3.get('test 2')
                ])
                    .then(([data1, data2]) => {
                    t.is(data1, null);
                    t.is(data2, 'some other data');
                })
                    .then(() => cache3.closeDatabaseConnection)
                    .then(() => 'test complete');
            });
        });
    });
    return testRead
        .then(output => t.is(output, 'test complete'));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9wZXJzaXN0ZW50X2NhY2hlX3BlcnNpc3RlbmNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdF9wZXJzaXN0ZW50X2NhY2hlX3BlcnNpc3RlbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxzQkFBaUIsS0FBSyxDQUFDLENBQUE7QUFDdkIsc0JBQXNDLEtBQUssQ0FBQyxDQUFBO0FBQzVDLG1DQUE4QixxQkFBcUIsQ0FBQyxDQUFBO0FBRXBELHFFQUFxRTtBQUNyRSxzRUFBc0U7QUFDdEUsc0RBQXNEO0FBRXRELE1BQU0sT0FBTyxHQUFHLGNBQVcsRUFBRSxDQUFDLElBQUksQ0FBQztBQUVuQyxhQUFJLENBQUMsdUdBQXVHLEVBQUUsQ0FBQyxDQUFDO0lBQzlHLE1BQU0sTUFBTSxHQUFHLElBQUksa0NBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUU1QyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxjQUFjLEVBQUU7U0FDckMsSUFBSSxDQUFDLE1BQU0sTUFBTSxDQUFDLHVCQUF1QixDQUFDO1NBQzFDLElBQUksQ0FBQztRQUNKLE1BQU0sTUFBTSxHQUFHLElBQUksa0NBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU1QyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztZQUNqQixNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztZQUNwQixNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQztTQUNyQixDQUFDO2FBQ0MsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDO1lBQ25CLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ3pCLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFFL0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4QixNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRTtpQkFDM0IsSUFBSSxDQUFDLE1BQU0sTUFBTSxDQUFDLHVCQUF1QixDQUFDO2lCQUMxQyxJQUFJLENBQUM7Z0JBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUU1QyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztvQkFDakIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUM7b0JBQ3BCLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO2lCQUNyQixDQUFDO3FCQUNDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQztvQkFDbkIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ2xCLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7Z0JBQ2pDLENBQUMsQ0FBQztxQkFDRCxJQUFJLENBQUMsTUFBTSxNQUFNLENBQUMsdUJBQXVCLENBQUM7cUJBQzFDLElBQUksQ0FBQyxNQUFNLGVBQWUsQ0FBQyxDQUFDO1lBQ2pDLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVMLE1BQU0sQ0FBQyxRQUFRO1NBQ1osSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQ25ELENBQUMsQ0FBQyxDQUFDIn0=