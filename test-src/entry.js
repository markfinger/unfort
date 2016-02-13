import React from 'react';
import ReactDOM from 'react-dom';
import {Counter} from './counter';
import './styles.css';
import {test} from './test';
import json_test from './json_test.json';

setInterval(() => console.log('test', test, 'json_test.foo', json_test.foo), 250);

const main = document.createElement('div');
document.body.appendChild(main);

ReactDOM.render(
  <Counter initialCount={0} />,
  main
);

module.hot.accept(() => {
  main.parentNode.removeChild(main);
});