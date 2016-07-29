"use strict";

const test = require('ava');
const {generateStringHash} = require('../hash');

test('generateStringHash should return the expected murmur hash as a string', (t) => {
  t.is(generateStringHash('test'), '3127628307');
});