/* ------------------------------------------------------------------
   Subject tracker

   Follows WHERE SOMEONE IS, not where movement happened. That distinction
   is the whole point: a motion detector loses the subject the instant they
   stop, so the head snaps back to centre every time you hold still. This
   holds position instead.

   Three pieces, no ML model and no download:

   1. Background model. A slowly adapting running average. Subtracting it
      gives the foreground — a person who is merely still is still there,
      whereas frame differencing sees nothing.

   2. Mean-shift. Starting from the last known position, the centroid is
      taken inside a window and the window recentres on it, twice. This
      locks onto one subject instead of averaging a hand and a passing
      shadow into the empty space between them.

   3. Hold. With no confident observation the target does not move at all.
      It never drifts to centre, because "I cannot see you" is not the same
      as "you are in the middle".

   Privacy is structural. Frames go to an offscreen canvas, become two
   numbers, and are overwritten. Nothing is stored and there is no path
   here that could send a frame anywhere.
   ------------------------------------------------------------------ */

export const W = 64;
export const H = 48;

/* Pure so it can be tested against synthetic frames without a camera. */
export function createEngine(opts = {}) {
  const bgRate = opts.bgRate ?? 0.012;     // ~4s to absorb a static subject
  const fgThresh = opts.fgThresh ?? 0.055;
  const minMass = opts.minMass ?? 12;
  const radius = opts.radius ?? 20;        // mean-shift window, in cells
  const iterations = opts.iterations ?? 3;

  const bg = new Float32Array(W * H);
  let seeded = false;

  // Normalised target, -1..1. Starts centred and only moves on evidence.
  const state = { x: 0, y: 0, confidence: 0, mass: 0 };

  return {
    state,

    /* lum: Float32Array(W*H) in 0..1. Returns the state after this frame. */
    push(lum) {
      if (!seeded) {
        bg.set(lum);
        seeded = true;
        return state;
      }

      // Foreground against the background model.
      const fg = new Float32Array(W * H);
      let total = 0;
      for (let i = 0; i < W * H; i++) {
        const d = Math.abs(lum[i] - bg[i]);
        bg[i] += (lum[i] - bg[i]) * bgRate;
        if (d > fgThresh) {
          // Squared: a solid subject outweighs scattered noise rather than
          // being averaged with it.
          const v = (d - fgThresh) * (d - fgThresh);
          fg[i] = v;
          total += v;
        }
      }

      state.mass = total;
      if (total < minMass * 0.0008) {
        // Nothing credible. Hold — do not recentre.
        state.confidence *= 0.94;
        return state;
      }

      // Mean-shift from the last known position.
      // state.x is mirrored on the way out, so it has to be un-mirrored on
      // the way back in. Getting this wrong makes the window start on the
      // wrong side every frame and the estimate never travels.
      let cx = (0.5 - state.x * 0.5) * (W - 1);
      let cy = (state.y * 0.5 + 0.5) * (H - 1);
      let mass = 0;

      for (let it = 0; it < iterations; it++) {
        let sx = 0;
        let sy = 0;
        let sw = 0;
        const x0 = Math.max(0, Math.floor(cx - radius));
        const x1 = Math.min(W - 1, Math.ceil(cx + radius));
        const y0 = Math.max(0, Math.floor(cy - radius));
        const y1 = Math.min(H - 1, Math.ceil(cy + radius));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const v = fg[y * W + x];
            if (v === 0) continue;
            const dx = (x - cx) / radius;
            const dy = (y - cy) / radius;
            const r2 = dx * dx + dy * dy;
            if (r2 > 1) continue;
            // Epanechnikov kernel: weights the centre of the window and
            // falls to zero at its edge, so the estimate cannot be dragged
            // by something that merely clipped the corner.
            const k = 1 - r2;
            sx += x * v * k;
            sy += y * v * k;
            sw += v * k;
          }
        }
        if (sw <= 0) break;
        cx = sx / sw;
        cy = sy / sw;
        mass = sw;
      }

      if (mass <= 0) {
        // The window emptied — the subject left it. Fall back to the global
        // centroid once, so the tracker can re-acquire instead of sulking.
        let sx = 0;
        let sy = 0;
        let sw = 0;
        for (let i = 0; i < W * H; i++) {
          const v = fg[i];
          if (v === 0) continue;
          sx += (i % W) * v;
          sy += ((i / W) | 0) * v;
          sw += v;
        }
        if (sw <= 0) { state.confidence *= 0.94; return state; }
        cx = sx / sw;
        cy = sy / sw;
        mass = sw;
      }

      // Mirrored: the camera sees you reversed, and a head turning away
      // from your hand reads as broken.
      const nx = 1 - cx / (W - 1);
      const ny = cy / (H - 1);
      const conf = Math.min(1, mass / (minMass * 0.02));

      // Blend by confidence: a weak observation nudges, a strong one leads.
      const k = 0.10 + 0.22 * conf;
      state.x += ((nx - 0.5) * 2 - state.x) * k;
      state.y += ((ny - 0.5) * 2 - state.y) * k;
      state.confidence += (conf - state.confidence) * 0.2;
      return state;
    },

    reset() {
      seeded = false;
      state.x = 0;
      state.y = 0;
      state.confidence = 0;
      state.mass = 0;
    },
  };
}

export function createTracker(opts = {}) {
  const engine = createEngine(opts);
  // 24Hz is plenty for a head that glides, and on a phone it leaves the
  // GPU alone for the frames that actually draw something.
  const interval = 1000 / (opts.hz ?? 24);

  let video = null;
  let stream = null;
  let ctx = null;
  let lum = null;
  let raf = 0;
  let last = 0;
  let running = false;

  const out = { x: 0, y: 0, confidence: 0, active: false };

  function step(now) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    if (now - last < interval) return;
    last = now;
    if (!video || video.readyState < 2) return;

    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      lum[i] = (px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) / 255;
    }
    const s = engine.push(lum);
    out.x = s.x;
    out.y = s.y;
    out.confidence = s.confidence;
  }

  return {
    async start() {
      if (running) return true;
      if (!navigator.mediaDevices?.getUserMedia) return false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // A small capture is all this needs and it costs far less power
          // than asking a phone for 720p and throwing it away.
          video: { facingMode: 'user', width: { ideal: 240 }, height: { ideal: 180 } },
          audio: false,
        });
      } catch {
        return false;
      }
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      lum = new Float32Array(W * H);
      engine.reset();

      video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play().catch(() => {});
      running = true;
      out.active = true;
      raf = requestAnimationFrame(step);
      return true;
    },

    stop() {
      running = false;
      out.active = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      stream = null;
      video = null;
      ctx = null;
      lum = null;
      engine.reset();
      out.x = 0;
      out.y = 0;
      out.confidence = 0;
    },

    get value() { return out; },
    get isRunning() { return running; },
  };
}
