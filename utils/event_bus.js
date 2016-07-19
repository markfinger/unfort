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
  push(...args) {
    const subscribers = this.subscribers;
    let index = subscribers.length;
    while(--index !== -1) {
      subscribers[index](...args);
    }
  }
}

module.exports = {
  EventBus
};
