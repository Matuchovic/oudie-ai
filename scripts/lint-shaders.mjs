/* Catches the class of bug that shipped a blank screen: a shader body
   referencing a uniform whose declaration was renamed. GLSL lives inside
   JS template literals, so `node --check` sees a valid string and the
   build passes. The compile error only appears in the browser console.

   Two checks:
     1. every uXxx / aXxx / vXxx identifier used in a body is declared in it
     2. every uniform a shader declares is supplied by runtime.js         */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['components/humanoid/shaders.js', 'components/humanoid/bloom.js'];
const runtime = readFileSync(resolve(root, 'components/humanoid/runtime.js'), 'utf8');

const BUILTIN = new Set([
  'uv', 'up', 'used', 'v', 'a', 'abs', 'atan', 'all', 'any', 'acos', 'asin',
  'attribute', 'uniform', 'varying', 'void', 'vec2', 'vec3', 'vec4', 'view',
]);

let failures = 0;

for (const file of files) {
  const src = readFileSync(resolve(root, file), 'utf8');
  // Each /* glsl */ `...` block is one shader.
  const blocks = [...src.matchAll(/\/\* glsl \*\/ `([\s\S]*?)`/g)];
  if (!blocks.length) {
    console.error(`FAIL ${file}: no glsl blocks found — did the tag change?`);
    failures++;
    continue;
  }

  for (const [i, m] of blocks.entries()) {
    const glsl = m[1];
    const declared = new Set();
    for (const d of glsl.matchAll(
      /^\s*(?:uniform|attribute|varying)\s+\w+\s+(\w+)\s*;/gm
    )) {
      declared.add(d[1]);
    }
    for (const d of glsl.matchAll(/\b(?:float|vec[234]|mat[234]|int|bool)\s+(\w+)\s*[=;)]/g)) {
      declared.add(d[1]);
    }
    // three.js injects these into every shader.
    for (const b of [
      'position', 'normal', 'uv', 'modelViewMatrix', 'projectionMatrix',
      'normalMatrix', 'modelMatrix', 'viewMatrix', 'cameraPosition',
      'gl_Position', 'gl_PointSize', 'gl_PointCoord', 'gl_FragColor',
    ]) {
      declared.add(b);
    }

    const body = glsl.replace(
      /^\s*(?:uniform|attribute|varying)\s+\w+\s+\w+\s*;\s*$/gm,
      ''
    );
    const used = new Set(
      [...body.matchAll(/\b([uav][A-Z]\w*)\b/g)].map((x) => x[1])
    );

    for (const name of used) {
      if (!declared.has(name) && !BUILTIN.has(name)) {
        console.error(`FAIL ${file} block ${i}: "${name}" used but never declared`);
        failures++;
      }
    }

    // Every uniform a shader declares must actually be supplied, either by
    // its own module (bloom builds its own materials) or by runtime.js.
    const jsOutsideGlsl = src.replace(/\/\* glsl \*\/ `[\s\S]*?`/g, '');
    for (const d of glsl.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)) {
      const name = d[1];
      const supplied = new RegExp(`\\b${name}\\s*:\\s*\\{`);
      if (!supplied.test(jsOutsideGlsl) && !supplied.test(runtime)) {
        console.error(`FAIL ${file} block ${i}: uniform "${name}" is never set in JS`);
        failures++;
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} shader problem(s) — build stopped.`);
  process.exit(1);
}
console.log('shaders lint clean');
