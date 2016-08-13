"use strict";
const ava_1 = require('ava');
const hash_1 = require('../hash');
ava_1.default('generateStringHash should return the expected murmur hash as a string', (t) => {
    t.is(hash_1.generateStringHash('test'), '3127628307');
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9oYXNoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdF9oYXNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxzQkFBaUIsS0FBSyxDQUFDLENBQUE7QUFDdkIsdUJBQWlDLFNBQVMsQ0FBQyxDQUFBO0FBRTNDLGFBQUksQ0FBQyx1RUFBdUUsRUFBRSxDQUFDLENBQUM7SUFDOUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBa0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUNqRCxDQUFDLENBQUMsQ0FBQyJ9