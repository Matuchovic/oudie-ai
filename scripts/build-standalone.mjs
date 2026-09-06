/* Inlines geometry.js + shaders.js + runtime.js into one self-contained
   HTML file. The preview must never drift from the app, so it is built
   from the same sources rather than maintained separately. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function strip(rel) {
  const src = readFileSync(resolve(root, rel), 'utf8');
  return src
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let|var)\s/gm, '$1 ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '');
}

const bundle = [
  '/* --- geometry.js --- */',
  strip('components/humanoid/geometry.js'),
  '/* --- shaders.js --- */',
  strip('components/humanoid/shaders.js'),
  '/* --- bloom.js --- */',
  strip('components/humanoid/bloom.js'),
  '/* --- runtime.js --- */',
  strip('components/humanoid/runtime.js'),
].join('\n\n');

const html = readFileSync(resolve(root, 'standalone/template.html'), 'utf8').replace(
  '/*__BUNDLE__*/',
  bundle
);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/oudie-humanoid.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`dist/oudie-humanoid.html  ${kb} kB`);

/* Cheap guard: nothing that would break in a plain <script> tag. */
for (const bad of ['import ', 'export ']) {
  if (bundle.includes(bad)) {
    console.error(`FAIL: bundle still contains "${bad.trim()}"`);
    process.exit(1);
  }
}
console.log('bundle clean — no module syntax left');
