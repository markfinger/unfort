import React from 'react';
import ReactDOM from 'react-dom';
import {Counter} from './counter';

const main = document.createElement('div');
document.body.appendChild(main);
console.log("hel")
ReactDOM.render(
  <Counter initialCount={0} />,
  main
);