/* Tracker behaviour, against generated frames. No camera needed.

   The case that matters is the one the first version got wrong: a subject
   moves, then stops. A motion detector loses them and snaps to centre. This
   asserts the position is held instead. */

import { createEngine, W, H } from '../components/humanoid/tracker.js';

function frame(blobX, blobY, r = 9, noise = 0) {
  const f = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0.30 + (noise ? (Math.sin(x * 12.9 + y * 78.2) * 0.5 + 0.5) * noise : 0);
      const d = Math.hypot(x - blobX, y - blobY);
      if (d < r) v += 0.5 * (1 - d / r);
      f[y * W + x] = Math.min(1, v);
    }
  }
  return f;
}

function feed(engine, x, y, n = 1, noise = 0) {
  let s;
  for (let i = 0; i < n; i++) s = engine.push(frame(x, y, 9, noise));
  return { x: s.x, y: s.y, c: s.confidence };
}

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* --- follows a subject across the frame --------------------------- */
{
  const e = createEngine();
  feed(e, 32, 24, 30);                       // settle the background
  const right = feed(e, 50, 24, 25);          // subject moves to their left
  const left = feed(e, 14, 24, 25);           // and back across

  // Output is mirrored, so a blob at high x reads as negative.
  check('sleduje doprava', right.x < -0.25, `x=${right.x.toFixed(2)}`);
  check('sleduje doleva', left.x > 0.25, `x=${left.x.toFixed(2)}`);
}

/* --- the regression: stops moving, must not snap back -------------- */
{
  const e = createEngine();
  feed(e, 32, 24, 30);
  const moved = feed(e, 52, 24, 25);
  // Same position for two seconds. Frame differencing would see nothing.
  const held = feed(e, 52, 24, 48);
  const drift = Math.abs(held.x - moved.x);

  check('drzi pozici po zastaveni', drift < 0.18,
    `posun ${drift.toFixed(3)} (bylo ${moved.x.toFixed(2)}, drzi ${held.x.toFixed(2)})`);
  check('nevraci se do stredu', Math.abs(held.x) > 0.25, `x=${held.x.toFixed(2)}`);
}

/* --- vertical --------------------------------------------------- */
{
  const e = createEngine();
  feed(e, 32, 24, 30);
  const down = feed(e, 32, 40, 25);
  const up = feed(e, 32, 8, 25);
  check('sleduje dolu', down.y > 0.2, `y=${down.y.toFixed(2)}`);
  check('sleduje nahoru', up.y < -0.2, `y=${up.y.toFixed(2)}`);
}

/* --- an empty, noisy room must not steer the head ----------------- */
{
  const e = createEngine();
  feed(e, -99, -99, 40, 0.02);
  const idle = feed(e, -99, -99, 40, 0.02);
  check('sum nehybe hlavou', Math.abs(idle.x) < 0.15 && Math.abs(idle.y) < 0.15,
    `x=${idle.x.toFixed(2)} y=${idle.y.toFixed(2)}`);
}

/* --- output stays in range --------------------------------------- */
{
  const e = createEngine();
  feed(e, 32, 24, 20);
  const edge = feed(e, 1, 1, 40);
  check('drzi se v rozsahu', Math.abs(edge.x) <= 1 && Math.abs(edge.y) <= 1,
    `x=${edge.x.toFixed(2)} y=${edge.y.toFixed(2)}`);
}

console.log(failures === 0 ? '\nvsechny testy prosly' : `\n${failures} testu selhalo`);
process.exit(failures === 0 ? 0 : 1);
