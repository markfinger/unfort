### Unfort example


## Installation

```
npm install --save \
  unfort \
  babel-plugin-hot-swap-declarative-modules \
  babel-plugin-transform-es2015-modules-commonjs \
  express \
  lodash \
  socket.io \
  strip-ansi
```


### Run

```
node unfort.js
```

Visit: http://127.0.0.1:3000/

Check the console, and make some changes to the files in `src`.


### Notes

If you want to test the persistent cache: run the build once, kill the process,
then restart it. It should complete in a fraction of a second. Note: the entire
cache is cleared when any changes are made to `unfort.js`, `.babelrc`,
`package.json`, or the directories in `node_modules`.

If you want to test incremental build perf, you might want to try installing a
bunch of large libraries (jquery, react, etc), importing them in `src/main.js`,
and then making changes to the files.