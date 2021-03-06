import * as Babel from '@babel/core';
import CleanCSS from 'clean-css';
import {promises as fs} from 'fs';
import Handlebars from 'handlebars';
import * as Hyperbuild from 'hyperbuild';
import mkdirp from 'mkdirp';
import ncp from 'ncp';
import Path, {join} from 'path';
import Terser from 'terser';
import {promisify} from 'util';

const DEBUG = process.env.MSC_DEBUG === '1';
const GOOGLE_ANALYTICS = process.env.MSC_GA;

if (DEBUG) {
  console.log(`Debug mode`);
}

const CLIENT_SRC_DIR = join(__dirname, 'src');
const CLIENT_SRC_HTML_TEMPLATE = join(CLIENT_SRC_DIR, 'page.hbs');
const CLIENT_DIST_DIR = join(__dirname, 'dist');
const CLIENT_DIST_HTML = join(CLIENT_DIST_DIR, 'index.html');

const analyticsJs = (trackingId: string) => `
  <script async src="https://www.googletagmanager.com/gtag/js?id=${trackingId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];

    function gtag () {
      dataLayer.push(arguments);
    }

    gtag("js", new Date());

    gtag("config", "${trackingId}");
  </script>
`;

const concatSrcFiles = async (ext: string): Promise<string> => {
  const files = await fs.readdir(CLIENT_SRC_DIR);
  const targetFiles = files.filter(f => f.toLowerCase().endsWith('.' + ext));
  const contents = await Promise.all(targetFiles.map(f => fs.readFile(Path.join(CLIENT_SRC_DIR, f), 'utf8')));
  return contents.join('');
};

const transpileJS = (js: string): Promise<string> => Babel.transformAsync(js, {
  plugins: [
    ['@babel/plugin-transform-arrow-functions'],
    ['@babel/plugin-transform-block-scoping'],
    ['@babel/plugin-transform-shorthand-properties'],
    ['@babel/plugin-transform-template-literals', {loose: true}],
    ['@babel/plugin-transform-parameters', {loose: true}],
    ['@babel/plugin-transform-destructuring', {loose: true, useBuiltIns: true}],
    ['@babel/plugin-proposal-object-rest-spread', {loose: true, useBuiltIns: true}],
    ['@babel/plugin-transform-spread', {loose: true}],
    ['@babel/plugin-transform-for-of', {assumeArray: true}],
  ],
}).then(res => res!.code!);

const minifyJS = (js: string) => {
  if (DEBUG) {
    return js;
  }
  const {error, warnings, code} = Terser.minify(js, {
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
    warnings: true,
  });
  if (error) {
    throw error;
  }
  if (warnings) {
    warnings.forEach(console.log);
  }
  return code;
};

const minifyHTML = (html: string): string => DEBUG ? html : Hyperbuild.minify(html);

const minifyCSS = (css: string) => DEBUG ? css : new CleanCSS({
  returnPromise: true,
}).minify(css).then(({styles}) => styles);

const copyDir = promisify(ncp);

(async () => {
  await mkdirp(Path.join(CLIENT_DIST_DIR, 'assets'));
  await copyDir(Path.join(CLIENT_SRC_DIR, 'assets'), Path.join(CLIENT_DIST_DIR, 'assets'));

  await Promise.all([
    concatSrcFiles('js').then(transpileJS).then(minifyJS),
    concatSrcFiles('css').then(minifyCSS),
    fs.readFile(CLIENT_SRC_HTML_TEMPLATE, 'utf8'),
  ])
    .then(([js, css, html]) => Handlebars.compile(html)({
      analytics: GOOGLE_ANALYTICS && analyticsJs(GOOGLE_ANALYTICS),
      fields: ['title', 'location', 'description'],
      script: js,
      style: css,
    }))
    .then(minifyHTML)
    .then(html => fs.writeFile(CLIENT_DIST_HTML, html));
})()
  .catch(console.error);
