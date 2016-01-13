import React from 'react';

export class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = {count: props.initialCount};
  }
  tick() {
    this.setState({count: this.state.count + 1});
  }
  render() {
    console.log(1)
    return (
      <div onClick={this.tick.bind(this)}>
        Click: {this.state.count + 11}
      </div>
    );
  }
}