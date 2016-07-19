"use strict";

const {without} = require('lodash');

class EventBus {
  constructor() {
    this.subscribers = [];
  }
  subscribe(func) {
    this.subscribers.push(func);
  }
  unsubscribe(func) {
    // To avoid issues with mutating an array during iteration,
    // we create a new array without the subscriber
    this.subscribers = without(this.subscribers, func);
  }
  // Not sure what optimizations js engines make for arg rest/spread,
  // so we just use an arbitrary number of args.
  // TODO profile/research
  push(arg1, arg2, arg3, arg4, arg5) {
    const subscribers = this.subscribers;
    let index = subscribers.length;
    while(--index !== -1) {
      subscribers[index](arg1, arg2, arg3, arg4, arg5);
    }
  }
}

module.exports = {
  EventBus
};
