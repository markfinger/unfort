import React from 'react';
import ReactDOM from 'react-dom';
import {Counter} from './counter';
import styles from './styles.css';
import {test} from './test';
import json_test from './json_test.json';
import testpng from './test.png';

const interval = setInterval(() => {
  console.log('test', test, 'styles', styles, 'json_test.foo', json_test.foo, 'testpng', testpng)
}, 250);

const main = document.createElement('div');
document.body.appendChild(main);

ReactDOM.render(
  <Counter initialCount={0} />,
  main
);

module.hot.accept(() => {
  clearInterval(interval);
  main.parentNode.removeChild(main);
});