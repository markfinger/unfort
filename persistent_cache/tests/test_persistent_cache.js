"use strict";
const ava_1 = require('ava');
const persistent_cache_1 = require('../persistent_cache');
ava_1.default('should fetch from the memory store, before hitting the db', (t) => {
    const cache = new persistent_cache_1.PersistentCache('__missing_file__');
    cache.set('test', 'some data');
    return cache.get('test')
        .then(data => t.is(data, 'some data'));
});
ava_1.default('should fetch from db, if the memory store is missing data', (t) => {
    const cache = new persistent_cache_1.PersistentCache('__missing_file__');
    cache.createDatabaseConnection = () => {
        return Promise.resolve({
            get(sql, params, cb) {
                cb(null, { value: JSON.stringify('from the db') });
            }
        });
    };
    return cache.get('test')
        .then(data => t.is(data, 'from the db'));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9wZXJzaXN0ZW50X2NhY2hlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdF9wZXJzaXN0ZW50X2NhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxzQkFBaUIsS0FBSyxDQUFDLENBQUE7QUFDdkIsbUNBQWdDLHFCQUFxQixDQUFDLENBQUE7QUFFdEQsYUFBSSxDQUFDLDJEQUEyRCxFQUFFLENBQUMsQ0FBQztJQUNsRSxNQUFNLEtBQUssR0FBRyxJQUFJLGtDQUFlLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN0RCxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztJQUUvQixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7U0FDckIsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQzNDLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLDJEQUEyRCxFQUFFLENBQUMsQ0FBQztJQUNsRSxNQUFNLEtBQUssR0FBRyxJQUFJLGtDQUFlLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN0RCxLQUFLLENBQUMsd0JBQXdCLEdBQUc7UUFDL0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7WUFDckIsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDakIsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxFQUFDLENBQUMsQ0FBQztZQUNuRCxDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDO0lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1NBQ3JCLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUM3QyxDQUFDLENBQUMsQ0FBQyJ9