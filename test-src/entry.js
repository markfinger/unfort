import React from 'react';
import ReactDOM from 'react-dom';
import {Counter} from './counter';
import './styles.css';
import {test} from './test';

const __test = require('./test');
setInterval(() => console.log(test, __test.test, require('./test').test), 250);

const main = document.createElement('div');
document.body.appendChild(main);

ReactDOM.render(
  <Counter initialCount={0} />,
  main
);

module.hot.accept(() => {
  main.parentNode.removeChild(main);
});