"use strict";

const {pull} = require('lodash');

class EventBus {
  constructor() {
    this.subscribers = [];
  }
  subscribe(func) {
    this.subscribers.push(func);
  }
  unsubscribe(func) {
    pull(this.subscribers, func);
  }
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
