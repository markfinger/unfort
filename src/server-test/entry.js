import React from 'react';
import ReactDOM from 'react-dom';

export class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = {count: props.initialCount};
  }
  tick() {
    this.setState({count: this.state.count + 1});
  }
  render() {
    return (
      <div onClick={this.tick.bind(this)}>
        Clicks: {this.state.count}
      </div>
    );
  }
}

const main = document.createElement('div');
document.body.appendChild(main);

ReactDOM.render(
  <Counter initialCount={0} />,
  main
);