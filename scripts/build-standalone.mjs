/* Inlines geometry.js + shaders.js + runtime.js into one self-contained
   HTML file. The preview must never drift from the app, so it is built
   from the same sources rather than maintained separately. */

import { execFileSync } from 'node:child_process';
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

// GLSL lives in template literals, so node --check cannot see it. Lint first
// or a renamed uniform ships as a blank screen.
execFileSync(process.execPath, [resolve(root, 'scripts/lint-shaders.mjs')], {
  stdio: 'inherit',
});

const bundle = [
  '/* --- rng.js --- */',
  strip('components/rng.js'),
  '/* --- style.js --- */',
  strip('components/style.js'),
  '/* --- geometry.js --- */',
  strip('components/humanoid/geometry.js'),
  '/* --- shaders.js --- */',
  strip('components/humanoid/shaders.js'),
  '/* --- tracker.js --- */',
  strip('components/humanoid/tracker.js'),
  '/* --- bloom.js --- */',
  strip('components/humanoid/bloom.js'),
  '/* --- runtime.js --- */',
  strip('components/humanoid/runtime.js'),
  '/* --- i18n.js --- */',
  strip('components/i18n.js'),
  '/* --- roster.js --- */',
  strip('components/constellation/roster.js'),
  '/* --- boot.js --- */',
  strip('components/boot/boot.js'),
  '/* --- login.js --- */',
  strip('components/auth/login.js'),
  '/* --- constellation.js --- */',
  strip('components/constellation/constellation.js'),
].join('\n\n');

const html = readFileSync(resolve(root, 'standalone/template.html'), 'utf8').replace(
  '/*__BUNDLE__*/',
  bundle
);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/oudie-humanoid.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`dist/oudie-humanoid.html  ${kb} kB`);

/* Test build: same bundle, but three comes from a local ES module instead
   of the CDN. This is what the headless Chromium harness loads, and it
   matches how the Next.js app imports three. */
const tpl = readFileSync(resolve(root, 'standalone/template.html'), 'utf8');
const initJs = tpl.split('/*__BUNDLE__*/')[1].split('</script>')[0];
const head = tpl.split('<script src="https://cdnjs.cloudflare.com')[0];
writeFileSync(
  resolve(root, 'dist/test.html'),
  head +
    '<script type="module">\n' +
    "import * as THREE from './three.module.js';\nwindow.THREE = THREE;\n" +
    bundle + '\n' + initJs +
    '\n</script>\n</body>\n</html>\n'
);
console.log('dist/test.html (headless harness target)');

/* The inlined bundle shares one scope, so two modules declaring the same
   top-level name is a SyntaxError that kills the whole page. That exact
   bug shipped once (mulberry32 in two files). Catch it here instead. */
{
  const declared = new Map();
  const DECL = /^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  const chunks = bundle.split(/\/\* --- (.+?) --- \*\//);
  let fail = false;
  for (let i = 1; i < chunks.length; i += 2) {
    const file = chunks[i];
    const src = (chunks[i + 1] || '').replace(/`[\s\S]*?`/g, '``');
    for (const m of src.matchAll(DECL)) {
      const name = m[1];
      if (declared.has(name)) {
        console.error(`FAIL: "${name}" declared in both ${declared.get(name)} and ${file}`);
        fail = true;
      } else {
        declared.set(name, file);
      }
    }
  }
  if (fail) process.exit(1);
  console.log(`no name collisions across ${declared.size} top-level declarations`);
}

for (const bad of ['import ', 'export ']) {
  if (bundle.includes(bad)) {
    console.error(`FAIL: bundle still contains "${bad.trim()}"`);
    process.exit(1);
  }
}
console.log('bundle clean — no module syntax left');

/* An unbalanced <style> block silently drops every rule after the damage —
   that is how the buttons lost their styling once. Count braces. */
{
  const css = tpl.split('<style>')[1]?.split('</style>')[0] ?? '';
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  if (open !== close) {
    console.error(`FAIL: template CSS braces unbalanced (${open} open, ${close} close)`);
    process.exit(1);
  }
  console.log(`template CSS balanced (${open} rules)`);
}
