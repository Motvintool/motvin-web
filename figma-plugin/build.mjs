import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';

/**
 * Builds the two files Figma loads (see manifest.json):
 *
 * - dist/code.js  the plugin's main code, which runs in Figma's sandbox and
 *                 places screens on the canvas
 * - dist/ui.html  the panel: one HTML file with its script and styles inlined,
 *                 because Figma loads the UI from a string, not from a server
 *
 * MOTVIN_API / MOTVIN_SITE point the panel at another backend and website
 * (`npm run build:local` uses the local ones); the default is production.
 */

const watch = process.argv.includes('--watch');
const api = (process.env.MOTVIN_API || 'https://api.motvin.com').replace(/\/+$/, '');
const site = (process.env.MOTVIN_SITE || 'https://motvin.com').replace(/\/+$/, '');

mkdirSync('dist', { recursive: true });

const shared = { bundle: true, logLevel: 'info', target: 'es2017', legalComments: 'none', minify: !watch };

const code = {
  ...shared,
  entryPoints: ['src/code.ts'],
  outfile: 'dist/code.js',
  format: 'iife',
};

/** The UI is bundled to memory, then wrapped in the HTML page with its CSS. */
const ui = {
  ...shared,
  entryPoints: ['src/ui/main.tsx'],
  // Kept in memory (write: false); the name only tells esbuild it is JavaScript.
  outfile: 'dist/ui.js',
  write: false,
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.svg': 'text', '.png': 'dataurl' },
  define: { __MOTVIN_API__: JSON.stringify(api), __MOTVIN_SITE__: JSON.stringify(site) },
  plugins: [
    {
      name: 'inline-html',
      setup(b) {
        b.onEnd((result) => {
          if (result.errors.length) return;
          const js = result.outputFiles.find((file) => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
          const css = readFileSync('src/ui/styles.css', 'utf8');
          const html = readFileSync('src/ui/index.html', 'utf8').replace('/*STYLES*/', () => css).replace('/*SCRIPT*/', () => js);
          writeFileSync('dist/ui.html', html);
        });
      },
    },
  ],
};

if (watch) {
  for (const options of [code, ui]) await (await context(options)).watch();
  console.log(`Watching — panel talks to ${api}`);
} else {
  await Promise.all([build(code), build(ui)]);
  console.log(`Built dist/ — panel talks to ${api}`);
}
