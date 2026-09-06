/* ------------------------------------------------------------------
   Headless render harness

   Runs the ACTUAL runtime in a real WebGL context (headless-gl over
   Mesa/ANGLE) and writes PNG frames. Previously the only check was a
   Python approximation that reimplemented the shader — which is how a
   two-orders-of-magnitude point-size bug shipped twice. An approximation
   of the renderer is not a test of the renderer.

   Usage: xvfb-run -a node scripts/headless-render.mjs
   ------------------------------------------------------------------ */

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire('/home/claude/glrt/');
const createGL = require('gl');
const { PNG } = require('pngjs');

const W = 900;
const H = 1000;

/* ---- minimal DOM ------------------------------------------------ */

/* makeSprite() paints a radial gradient into a 2D canvas. Rather than
   pull in node-canvas, implement exactly the surface it touches and
   expose the pixels in the {width,height,data} shape headless-gl
   accepts for texImage2D. */
class Ctx2D {
  constructor(c) {
    this.c = c;
    this.fillStyle = null;
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return { _stops: [], addColorStop(p, col) { this._stops.push([p, col]); } };
  }
  fillRect() {
    const { width: w, height: h, data } = this.c;
    const stops = (this.fillStyle && this.fillStyle._stops) || [];
    const parse = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      const v = m[1].split(',').map(Number);
      return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
    };
    const cs = stops.map(([p, col]) => [p, parse(col)]);
    const cx = w / 2;
    const cy = h / 2;
    const R = w / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = Math.min(1, Math.hypot(x - cx, y - cy) / R);
        let a = cs[cs.length - 1][1];
        for (let i = 0; i < cs.length - 1; i++) {
          if (t >= cs[i][0] && t <= cs[i + 1][0]) {
            const k = (t - cs[i][0]) / (cs[i + 1][0] - cs[i][0] || 1);
            a = cs[i][1].map((v, j) => v + (cs[i + 1][1][j] - v) * k);
            break;
          }
        }
        const o = (y * w + x) * 4;
        data[o] = a[0];
        data[o + 1] = a[1];
        data[o + 2] = a[2];
        data[o + 3] = Math.round(a[3] * 255);
      }
    }
  }
}

class FakeCanvas {
  constructor(w = 1, h = 1) {
    this._w = w;
    this._h = h;
    this.data = new Uint8Array(w * h * 4);
    this.style = {};
    this.clientWidth = w;
    this.clientHeight = h;
  }
  get width() { return this._w; }
  set width(v) { this._w = v; this.data = new Uint8Array(this._w * this._h * 4); }
  get height() { return this._h; }
  set height(v) { this._h = v; this.data = new Uint8Array(this._w * this._h * 4); }
  getContext(kind) {
    if (kind === '2d') return new Ctx2D(this);
    return this._gl ?? null;
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { width: this._w, height: this._h, top: 0, left: 0 }; }
}

let clock = 0;
let pending = null;
global.requestAnimationFrame = (cb) => { pending = cb; return 1; };
global.cancelAnimationFrame = () => { pending = null; };
performance.now = () => clock;

const gl = createGL(W, H, { preserveDrawingBuffer: true, alpha: true });
if (!gl) throw new Error('no WebGL context — run under xvfb-run');

const canvas = new FakeCanvas(W, H);
canvas._gl = gl;
const parent = new FakeCanvas(W, H);
canvas.parentElement = parent;

global.document = {
  createElement: (t) => (t === 'canvas' ? new FakeCanvas(128, 128) : { style: {} }),
  createElementNS: () => new FakeCanvas(128, 128),
  addEventListener() {},
  removeEventListener() {},
};
global.window = {
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  innerWidth: W,
  innerHeight: H,
};
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
global.self = global.window;

/* ---- run --------------------------------------------------------- */

const THREE = (await import('/home/claude/glrt/node_modules/three/build/three.module.js')).default
  ?? (await import('/home/claude/glrt/node_modules/three/build/three.module.js'));

const { createHumanoid } = await import('/home/claude/apex/components/humanoid/runtime.js');

let lastStatus = null;
const api = createHumanoid(THREE, canvas, {
  onStatus: (s) => { lastStatus = s; },
});

function save(name) {
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const png = new PNG({ width: W, height: H });
  // readPixels is bottom-up; PNG is top-down.
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4;
    png.data.set(px.subarray(src, src + W * 4), y * W * 4);
  }
  writeFileSync(name, PNG.sync.write(png));

  let lit = 0;
  let maxv = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(px[i], px[i + 1], px[i + 2]);
    if (v > 90) lit++;
    if (v > maxv) maxv = v;
  }
  return { lit, pct: ((100 * lit) / (W * H)).toFixed(2), maxv };
}

console.log('diagnostics:', JSON.stringify(api.diagnostics()));

/* Drive the loop by hand so we can land on exact points in the timeline. */
function runTo(seconds) {
  const target = seconds * 1000;
  while (clock < target) {
    clock = Math.min(target, clock + 1000 / 60);
    const cb = pending;
    pending = null;
    if (cb) cb(clock);
  }
}

const shots = [
  ['assembling 25%', 0.25 * 6.9],
  ['assembling 60%', 0.60 * 6.9],
  ['assembled', 7.6],
  ['listening', 11.0],
];

for (const [label, t] of shots) {
  runTo(t);
  const s = save(`/tmp/hl_${label.replace(/[^a-z0-9]/gi, '_')}.png`);
  console.log(`${label.padEnd(16)} lit ${String(s.lit).padStart(7)} px (${s.pct}%)  peak ${s.maxv}  |  ${lastStatus?.label ?? ''}`);
}

console.log('final:', JSON.stringify(api.diagnostics()));
const err = gl.getError();
console.log('gl.getError:', err === 0 ? 'none' : err);
