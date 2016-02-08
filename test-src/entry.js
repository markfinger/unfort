import React from 'react';
import ReactDOM from 'react-dom';
import {Counter} from './counter';
import './styles.css';

const main = document.createElement('div');
document.body.appendChild(main);

ReactDOM.render(
  <Counter initialCount={0} />,
  main
);

if (module.hot) {
  module.hot.accept(() => {
    main.parentNode.removeChild(main);
  });
}
