/* ------------------------------------------------------------------
   Oudie humanoid — geometry generator
   ------------------------------------------------------------------
   The bust is NOT a point cloud. It is a stack of horizontal contour
   bands sliced out of a surface of revolution with per-height elliptic
   radii. That is what produces the "scanline" look in the reference:
   the silhouette is wherever the bands end, and the rim glow falls out
   of a fresnel term on the surface normal.

   Everything here is pure math -> typed arrays. No three.js import, so
   the same file feeds both the standalone preview and the R3F app.
   ------------------------------------------------------------------ */

/* Profile control points: [y, radiusX, radiusZ].
   y = 0 at the base of the shoulders, y = 2.52 at the crown.
   A head is deeper than it is wide, hence rz > rx through the skull. */
const PROFILE = [
  // Below the temple: measured off the reference silhouette (chroma mask,
  // eroded to undo the bloom, sampled at 200 heights).
  // Above it: an elliptical cranial cap. The measurement cannot be trusted
  // up there because the mask swallowed the particle plume rising off the
  // head and turned the dome into a spike.
  [0.000, 1.009, 0.303],
  [0.166, 0.967, 0.472],
  [0.333, 0.804, 0.543],
  [0.499, 0.462, 0.399],
  [0.656, 0.330, 0.317],
  [0.803, 0.317, 0.340],
  [0.940, 0.367, 0.426],
  [1.067, 0.407, 0.472],
  [1.184, 0.423, 0.491],
  [1.292, 0.417, 0.484],
  [1.390, 0.419, 0.486],
  [1.478, 0.423, 0.491],
  [1.520, 0.420, 0.488],
  [1.560, 0.413, 0.479],
  [1.600, 0.401, 0.465],
  [1.645, 0.380, 0.441],
  [1.690, 0.352, 0.408],
  [1.730, 0.318, 0.369],
  [1.768, 0.275, 0.319],
  [1.800, 0.228, 0.264],
  [1.826, 0.174, 0.202],
  [1.845, 0.117, 0.136],
  [1.856, 0.061, 0.071],
  [1.860, 0.018, 0.021],
];

const Y_MIN = 0.00;
const Y_MAX = 1.858;
const Y_CENTER = 0.980; // shifts the model so the head sits at eye level

/* Face heat centre, in model space before centring. Sits on the front
   of the skull, slightly below the vertical middle — brow to chin. */
const FACE = { y: 1.128, rx: 0.298, ry: 0.246 };

const TAU = Math.PI * 2;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/* Radii at an arbitrary height, smoothstep-interpolated between the
   control points. Smoothstep rather than a cubic spline on purpose —
   no overshoot, so the silhouette can never bulge past a control point. */
function radiiAt(y) {
  if (y <= PROFILE[0][0]) return { rx: PROFILE[0][1], rz: PROFILE[0][2] };
  const last = PROFILE[PROFILE.length - 1];
  if (y >= last[0]) return { rx: last[1], rz: last[2] };
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i];
    const b = PROFILE[i + 1];
    if (y >= a[0] && y <= b[0]) {
      const t = smoothstep((y - a[0]) / (b[0] - a[0]));
      return { rx: a[1] + (b[1] - a[1]) * t, rz: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { rx: last[1], rz: last[2] };
}

/* d(radius)/dy — feeds the y component of the surface normal so the rim
   term knows about the slope of the shoulders and the top of the skull. */
function slopeAt(y) {
  const h = 0.02;
  const a = radiiAt(Math.max(Y_MIN, y - h));
  const b = radiiAt(Math.min(Y_MAX, y + h));
  return ((b.rx + b.rz) - (a.rx + a.rz)) / (4 * h);
}

/* Radial falloff around the face centre. Only the front hemisphere
   heats up, so the back of the skull stays cyan. */
/* The bust has no bottom. It dissolves. Without this the shoulders end
   on a hard elliptical rim that instantly reads as a 3D primitive. */
function fadeAt(y) {
  const t = Math.max(0, Math.min(1, (y - 0.02) / 0.36));
  return t * t * (3 - 2 * t);
}

function faceMask(x, y, z, rz) {
  const d = Math.hypot(x / FACE.rx, (y - FACE.y) / FACE.ry);
  const front = Math.max(0, Math.min(1, (z / Math.max(rz, 1e-4) + 0.15) / 0.65));
  const radial = Math.max(0, 1 - d / 1.22);
  return Math.pow(radial, 1.75) * front;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* KIND: 0 band · 1 neck strand · 2 throat filament · 3 loose spark */
export function buildHumanoid(opts = {}) {
  const bands = opts.bands ?? 112;
  const density = opts.density ?? 168; // points per unit of circumference
  const strandCount = opts.strands ?? 44;
  const looseCount = opts.loose ?? 2100;
  const rand = mulberry32(opts.seed ?? 20260906);

  const P = []; // target position
  const N = []; // surface normal
  const F = []; // face mask
  const K = []; // kind
  const R = []; // per-point random
  const D = []; // edge dissolve

  /* --- horizontal contour bands ---------------------------------- */
  for (let b = 0; b < bands; b++) {
    // Slight bias toward the head: bands crowd where detail matters.
    const u = b / (bands - 1);
    const y = Y_MIN + (Y_MAX - Y_MIN) * (u * 0.82 + smoothstep(u) * 0.18);
    const { rx, rz } = radiiAt(y);
    const circ = Math.PI * (rx + rz);
    const count = Math.max(26, Math.min(560, Math.round(circ * density)));
    const dr = slopeAt(y);

    for (let i = 0; i < count; i++) {
      // Jitter the angle so bands read as strings of dots, not solid rings.
      const th = ((i + rand() * 0.35) / count) * TAU;
      const wob = 1 + (rand() - 0.5) * 0.006;
      const x = Math.cos(th) * rx * wob;
      const z = Math.sin(th) * rz * wob;

      P.push(x, y - Y_CENTER, z);
      // Ellipse gradient: n ∝ (x/rx², z/rz²), with slope on y.
      N.push(Math.cos(th) / rx, -dr, Math.sin(th) / rz);
      F.push(faceMask(x, y, z, rz));
      K.push(0);
      D.push(fadeAt(y));
      R.push(rand());
    }
  }

  /* --- vertical neck strands -------------------------------------
     The reference shows the neck running vertically while everything
     else runs horizontally. Different generator, same shader. */
  for (let s = 0; s < strandCount; s++) {
    const th = (s / strandCount) * TAU + rand() * 0.05;
    const y0 = 0.44;
    const y1 = 0.90;
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const y = y0 + ((y1 - y0) * i) / (steps - 1);
      const { rx, rz } = radiiAt(y);
      const x = Math.cos(th) * rx * 1.005;
      const z = Math.sin(th) * rz * 1.005;
      P.push(x, y - Y_CENTER, z);
      N.push(Math.cos(th) / rx, -slopeAt(y), Math.sin(th) / rz);
      F.push(faceMask(x, y, z, rz) * 0.25);
      K.push(1);
      D.push(fadeAt(y));
      R.push(rand());
    }
  }

  /* --- amber throat filaments -------------------------------------
     Two lightning-like strands down the front of the throat. */
  for (let f = 0; f < 2; f++) {
    const side = f === 0 ? -1 : 1;
    const steps = 150;
    let wob = 0;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const y = 0.90 - t * 0.44;
      const { rx, rz } = radiiAt(y);
      wob += (rand() - 0.5) * 0.02;
      wob *= 0.86; // damped random walk = lightning, not noise
      const x = side * (0.048 + t * 0.105) + wob;
      const z = rz * (0.86 + t * 0.1);
      for (let j = 0; j < 3; j++) {
        P.push(
          x + (rand() - 0.5) * 0.012,
          y - Y_CENTER + (rand() - 0.5) * 0.006,
          z + (rand() - 0.5) * 0.012
        );
        N.push(x / Math.max(rx, 1e-4), 0, 1);
        F.push(0);
        K.push(2);
        D.push(fadeAt(y));
        R.push(rand());
      }
    }
  }

  /* --- cranial plume ----------------------------------------------
     Particles streaming up off the crown. In the reference these read as
     part of the figure, which is exactly why they must NOT be part of the
     silhouette — they are their own thing. */
  for (let i = 0; i < 520; i++) {
    const t = Math.pow(rand(), 0.65);
    const y = 1.80 + t * 0.21;
    const spread = 0.075 + t * 0.26;
    const th = rand() * TAU;
    const rr = Math.pow(rand(), 0.5) * spread;
    const x = Math.cos(th) * rr;
    const z = Math.sin(th) * rr * 0.85;
    P.push(x, y - Y_CENTER, z);
    N.push(x, 0.6, z);
    F.push(0);
    K.push(3);
    R.push(rand());
    D.push(1 - t * 0.72);
  }

  /* --- loose sparks ----------------------------------------------
     Drift around the silhouette. Densest near the edges, which is
     where the reference sheds particles. */
  for (let i = 0; i < looseCount; i++) {
    const y = Y_MIN + rand() * (Y_MAX - Y_MIN);
    const { rx, rz } = radiiAt(y);
    const th = rand() * TAU;
    const push = 1.04 + Math.pow(rand(), 2.2) * 0.42;
    const x = Math.cos(th) * rx * push;
    const z = Math.sin(th) * rz * push;
    P.push(x, y - Y_CENTER + (rand() - 0.5) * 0.06, z);
    N.push(Math.cos(th) / rx, 0, Math.sin(th) / rz);
    F.push(faceMask(x, y, z, rz) * 0.5);
    K.push(3);
      D.push(fadeAt(y));
    R.push(rand());
  }

  const n = P.length / 3;
  const position = new Float32Array(P);
  const normal = new Float32Array(N);
  const face = new Float32Array(F);
  const kind = new Float32Array(K);
  const seedArr = new Float32Array(R);
  const fade = new Float32Array(D);
  const delay = new Float32Array(n);
  const ctrl = new Float32Array(n * 3);

  const emitter = [0, Y_MIN - Y_CENTER - 0.42, 0];

  /* --- assembly ordering ------------------------------------------
     Delay is driven by azimuth so the arrival wavefront sweeps around
     the figure in step with the camera orbit. That is what makes it
     read as "drawn in profile, then turned to face you" rather than
     "faded in". Height and a little noise break up the seam. */
  for (let i = 0; i < n; i++) {
    const x = position[i * 3];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];

    const az = Math.atan2(z, x); // -PI..PI
    const sweep = (az + Math.PI * 1.15) / TAU;
    const h = (y + Y_CENTER - Y_MIN) / (Y_MAX - Y_MIN);
    let d = ((sweep % 1) + 1) % 1;
    d = d * 0.66 + h * 0.14 + seedArr[i] * 0.2;
    delay[i] = Math.max(0, Math.min(1, d));

    // Quadratic bezier control point: out and up, so particles arc
    // away from the emitter instead of shooting straight at the target.
    const len = Math.hypot(x, z) || 1e-4;
    ctrl[i * 3] = x + (x / len) * 1.15 + (seedArr[i] - 0.5) * 0.5;
    ctrl[i * 3 + 1] = emitter[1] + (y - emitter[1]) * 0.38 + 0.35;
    ctrl[i * 3 + 2] = z + (z / len) * 1.15 + (seedArr[i] - 0.5) * 0.5;
  }

  return { count: n, position, normal, face, kind, seed: seedArr, fade, delay, ctrl, emitter };
}

/* Concentric halo rings around the head — the audio-input ripple that
   only appears while listening. */
export function buildHalo(rings = 7, perRing = 260, seed = 7) {
  const rand = mulberry32(seed);
  const n = rings * perRing;
  const position = new Float32Array(n * 3);
  const ring = new Float32Array(n);
  const seedArr = new Float32Array(n);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < perRing; i++) {
      const th = (i / perRing) * TAU + rand() * 0.02;
      position[k * 3] = Math.cos(th);
      position[k * 3 + 1] = Math.sin(th) * 0.92 + (FACE.y - Y_CENTER);
      position[k * 3 + 2] = -0.35;
      ring[k] = r / Math.max(1, rings - 1);
      seedArr[k] = rand();
      k++;
    }
  }
  return { count: n, position, ring, seed: seedArr };
}

export const HUMANOID_META = { Y_MIN, Y_MAX, Y_CENTER, FACE, PROFILE };
