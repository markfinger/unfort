import test from 'ava';
import {generateStringHash} from '../hash';

test('generateStringHash should return the expected murmur hash as a string', (t) => {
  t.is(generateStringHash('test'), '3127628307');
});