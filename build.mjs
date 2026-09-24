// Production build for GitHub Pages: writes dist/app.js, dist/index.html and
// dist/favicon.ico.
// The source index.html references a plain app.js; the copy under dist/ gets
// a ?v=<commit> cache-buster so a deploy invalidates the old bundle. Local
// serving (`make run`) uses esbuild's dev server instead and never writes here.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const hash = execSync('git rev-parse --short HEAD').toString().trim();
const gaId = process.env.GA_MEASUREMENT_ID ?? '';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  define: {
    __COMMIT_HASH__: JSON.stringify(hash),
    __GA_MEASUREMENT_ID__: JSON.stringify(gaId),
  },
  logLevel: 'info',
});

const html = readFileSync('index.html', 'utf8');
const tag = '<script src="app.js"></script>';
if (!html.includes(tag)) throw new Error(`index.html: expected ${tag}`);
writeFileSync('dist/index.html', html.replace(tag, `<script src="app.js?v=${hash}"></script>`));

copyFileSync('favicon.ico', 'dist/favicon.ico');
