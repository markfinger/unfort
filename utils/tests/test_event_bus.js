"use strict";

const {assert} = require('../assert');
const {EventBus} = require('../event_bus');

describe('utils/event_bus', () => {
  describe('#EventBus', () => {
    it('should accept data and pass it to the subscribers', () => {
      const bus = new EventBus();

      let _a1 = 0;
      let _a2 = 2;
      let _a3 = 4;
      bus.subscribe((a1, a2, a3) => {
        _a1 += a1;
        _a2 += a2;
        _a3 += a3;
      });

      let _b1 = 0;
      let _b2 = 2;
      let _b3 = 4;
      bus.subscribe((b1, b2, b3) => {
        _b1 += b1;
        _b2 += b2;
        _b3 += b3;
      });

      bus.push(1, 1, 1);
      assert.equal(_a1, 1);
      assert.equal(_a2, 3);
      assert.equal(_a3, 5);
      assert.equal(_b1, 1);
      assert.equal(_b2, 3);
      assert.equal(_b3, 5);

      bus.push(1, 1, 1);
      assert.equal(_a1, 2);
      assert.equal(_a2, 4);
      assert.equal(_a3, 6);
      assert.equal(_b1, 2);
      assert.equal(_b2, 4);
      assert.equal(_b3, 6);
    });
    it('should allow subscribers to be removed', () => {
      const bus = new EventBus();

      let one = 0;
      const func1 = val => {
        one += val;
      };

      let two = 0;
      const func2 = val => {
        two += val;
      };

      bus.subscribe(func1);
      bus.subscribe(func2);

      assert.equal(one, 0);
      assert.equal(two, 0);

      bus.push(1);
      assert.equal(one, 1);
      assert.equal(two, 1);

      bus.unsubscribe(func1);
      bus.push(1);
      assert.equal(one, 1);
      assert.equal(two, 2);

      bus.unsubscribe(func2);
      bus.push(1);
      assert.equal(one, 1);
      assert.equal(two, 2);
    });
  });
});