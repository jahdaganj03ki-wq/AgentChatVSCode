const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: isDev,
  minify: !isDev,
};

const webviewConfig = {
  entryPoints: {
    'webview/index': 'src/views/webview/app/index.tsx',
    'webview/settings': 'src/views/webview/app/settings.tsx',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: isDev,
  minify: !isDev,
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
};

async function build() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const wvCtx = await esbuild.context(webviewConfig);
    await extCtx.watch();
    await wvCtx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    console.log('[esbuild] Build complete.');
  }
}

build().catch(() => process.exit(1));
