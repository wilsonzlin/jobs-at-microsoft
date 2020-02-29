#!/usr/bin/env node
'use strict';

const fs = require('fs');
const babel = require('@babel/core');
const terser = require('terser');

const compiled = fs.readFileSync('dist/main.js', 'utf8');
// Babel adds global functions, so transpile before wrapping in IIFE.
const compat = babel.transformSync(compiled, {
  presets: ['@babel/preset-env'],
}).code;
const browser = `
(function () {
  const exports = window.Edgesearch = {};
  ${compat}
})();
`;
const min = terser.minify(browser, {
  mangle: true,
  compress: {
    booleans: true,
    collapse_vars: true,
    comparisons: true,
    conditionals: true,
    dead_code: true,
    drop_console: true,
    drop_debugger: true,
    evaluate: true,
    hoist_funs: true,
    hoist_vars: false,
    if_return: true,
    join_vars: true,
    keep_fargs: false,
    keep_fnames: false,
    loops: true,
    negate_iife: true,
    properties: true,
    reduce_vars: true,
    sequences: true,
    unsafe: true,
    unused: true,
  },
}).code;

fs.writeFileSync('dist/edgesearch-client.min.js', min);
