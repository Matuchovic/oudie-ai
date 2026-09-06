/* ------------------------------------------------------------------
   Motion tracker

   Follows where movement is happening in front of the camera, so the
   humanoid can turn its head toward a waving hand or a shifting body.

   No machine-learning model. Frames are downscaled to 64x48 and the
   tracker takes the brightness difference against the previous frame,
   then the intensity-weighted centroid of whatever moved. Three thousand
   pixels a frame is nothing, it needs no download, and it works on any
   device with a camera.

   The trade: it finds motion, not a hand specifically. For "the head
   follows you" that is the right target anyway — a hand wave and a lean
   both move it, which is what you want.

   Privacy is structural rather than promised. Frames are drawn to an
   offscreen canvas, reduced to one number pair, and overwritten. Nothing
   is stored, nothing is uploaded, and there is no code path here that
   could send a frame anywhere.
   ------------------------------------------------------------------ */

const W = 64;
const H = 48;

export function createTracker(opts = {}) {
  // Deadband keeps sensor noise from making the head twitch when the room
  // is still; without it the figure never settles.
  const deadband = opts.deadband ?? 0.06;
  const smoothing = opts.smoothing ?? 0.12;
  const decay = opts.decay ?? 0.86;

  let video = null;
  let stream = null;
  let canvas = null;
  let ctx = null;
  let prev = null;
  let accum = null;
  let raf = 0;
  let running = false;

  const out = { x: 0, y: 0, energy: 0, active: false };

  function setup() {
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    prev = new Float32Array(W * H);
    accum = new Float32Array(W * H);
  }

  function step() {
    if (!running) return;
    raf = requestAnimationFrame(step);
    if (!video || video.readyState < 2) return;

    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;

    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      // Rec. 601 luma is close enough and avoids three multiplies per pixel
      // turning into a bottleneck on a phone.
      const lum = (px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) / 255;
      const d = Math.abs(lum - prev[i]);
      prev[i] = lum;

      // Accumulate with decay: a slow wave still registers, and a single
      // noisy frame does not yank the head sideways.
      accum[i] = Math.max(d, accum[i] * decay);
      const m = accum[i] > 0.045 ? accum[i] : 0;
      if (m > 0) {
        sx += (i % W) * m;
        sy += ((i / W) | 0) * m;
        sw += m;
      }
    }

    if (sw > 1.2) {
      // Mirrored: the camera sees you reversed, and a head that turns away
      // from your hand reads as broken.
      const nx = 1 - (sx / sw) / (W - 1);
      const ny = (sy / sw) / (H - 1);
      const tx = (nx - 0.5) * 2;
      const ty = (ny - 0.5) * 2;
      out.x += (tx - out.x) * smoothing;
      out.y += (ty - out.y) * smoothing;
      out.energy += (Math.min(1, sw / 90) - out.energy) * smoothing;
    } else {
      // Nothing moving: drift back to centre rather than freezing mid-turn.
      out.x *= 0.94;
      out.y *= 0.94;
      out.energy *= 0.9;
    }

    if (Math.abs(out.x) < deadband) out.x *= 0.85;
    if (Math.abs(out.y) < deadband) out.y *= 0.85;
  }

  return {
    /* Returns true once the camera is live. Rejection is normal — the
       humanoid must stay fully usable without it. */
    async start() {
      if (running) return true;
      if (!navigator.mediaDevices?.getUserMedia) return false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
      } catch {
        return false;
      }
      setup();
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
      prev = null;
      accum = null;
      out.x = 0;
      out.y = 0;
      out.energy = 0;
    },

    get value() { return out; },
    get isRunning() { return running; },
  };
}
