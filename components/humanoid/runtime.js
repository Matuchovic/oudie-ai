/* ------------------------------------------------------------------
   Oudie humanoid — runtime

   Framework-agnostic on purpose. It takes a THREE namespace and a
   canvas and returns a handle. The standalone preview and the Next.js
   component both mount this exact code, so the preview cannot drift
   away from the app.
   ------------------------------------------------------------------ */

import { buildHumanoid, buildHalo } from './geometry.js';
import { createBloom } from './bloom.js';
import {
  HUMANOID_VERT,
  HUMANOID_FRAG,
  HALO_VERT,
  HALO_FRAG,
  makeSprite,
} from './shaders.js';

export const ASSEMBLY_DURATION = 6.9; // measured off the reference footage

const DEG = Math.PI / 180;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function createHumanoid(THREE, canvas, opts = {}) {
  const onStatus = opts.onStatus ?? (() => {});
  const quality = opts.quality ?? 'high';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const bloom = createBloom(THREE, renderer);
  bloom.setStrength(0.78, 0.52);

  const maxDpr = quality === 'high' ? 2 : 1.5;
  // Budget the framebuffer, not just the pixel ratio. A 5K display at 2x
  // would otherwise ask the bloom pass to chew through 14M pixels a frame.
  const PIXEL_BUDGET = quality === 'high' ? 2_600_000 : 1_300_000;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

  function fitDpr(w, h) {
    const want = Math.min(window.devicePixelRatio || 1, maxDpr);
    const over = (w * h * want * want) / PIXEL_BUDGET;
    return over > 1 ? Math.max(1, want / Math.sqrt(over)) : want;
  }

  const sprite = makeSprite(THREE);

  /* ---- humanoid ------------------------------------------------- */
  const H = buildHumanoid(
    quality === 'high'
      ? {}
      : { bands: 62, density: 100, strands: 30, loose: 1800 }
  );

  const geo = new THREE.BufferGeometry();
  // `position` is required by three even though the vertex shader reads
  // aTarget; keeping them identical means frustum culling stays sane.
  geo.setAttribute('position', new THREE.BufferAttribute(H.position, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(H.position, 3));
  geo.setAttribute('aCtrl', new THREE.BufferAttribute(H.ctrl, 3));
  geo.setAttribute('aNrm', new THREE.BufferAttribute(H.normal, 3));
  geo.setAttribute('aDelay', new THREE.BufferAttribute(H.delay, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(H.seed, 1));
  geo.setAttribute('aFace', new THREE.BufferAttribute(H.face, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(H.kind, 1));
  geo.setAttribute('aFade', new THREE.BufferAttribute(H.fade, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uLevel: { value: 0 },
    uSpeaking: { value: 0 },
    uOpacity: { value: 1 },
    uScale: { value: 1000 },
    uEmitter: { value: new THREE.Vector3().fromArray(H.emitter) },
    uSprite: { value: sprite },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HUMANOID_VERT,
    fragmentShader: HUMANOID_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false, // the far side must show through, as in the reference
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  /* ---- halo rings ----------------------------------------------- */
  const HL = buildHalo();
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(HL.position, 3));
  haloGeo.setAttribute('aRing', new THREE.BufferAttribute(HL.ring, 1));
  haloGeo.setAttribute('aSeed', new THREE.BufferAttribute(HL.seed, 1));
  haloGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 6);

  const haloUniforms = {
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uOpacity: { value: 0 },
    uScale: { value: 1000 },
    uSprite: { value: sprite },
  };

  const halo = new THREE.Points(
    haloGeo,
    new THREE.ShaderMaterial({
      uniforms: haloUniforms,
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(halo);

  /* ---- emitter --------------------------------------------------- */
  const emitterMat = new THREE.SpriteMaterial({
    map: sprite,
    color: 0x66ccff,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const emitter = new THREE.Sprite(emitterMat);
  emitter.position.fromArray(H.emitter);
  emitter.scale.setScalar(1.5);
  scene.add(emitter);

  /* ---- camera ---------------------------------------------------- */
  const cam = {
    az: -72 * DEG,
    el: 4 * DEG,
    radius: 5.9,
    dragAz: 0,
    dragEl: 0,
  };

  function placeCamera() {
    const az = cam.az + cam.dragAz;
    const el = cam.el + cam.dragEl;
    camera.position.set(
      Math.sin(az) * Math.cos(el) * cam.radius,
      Math.sin(el) * cam.radius + 0.12,
      Math.cos(az) * Math.cos(el) * cam.radius
    );
    camera.lookAt(0, 0.1, 0);
  }

  /* ---- drag to orbit --------------------------------------------- */
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function down(e) {
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    lastX = p.clientX;
    lastY = p.clientY;
  }
  function move(e) {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    cam.dragAz += (p.clientX - lastX) * 0.005;
    cam.dragEl = Math.max(
      -0.5,
      Math.min(0.5, cam.dragEl - (p.clientY - lastY) * 0.003)
    );
    lastX = p.clientX;
    lastY = p.clientY;
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    dragging = false;
  }

  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  canvas.addEventListener('touchstart', down, { passive: true });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);

  /* ---- audio ------------------------------------------------------
     Real mic when it is granted, a synthetic speech envelope otherwise
     so the preview is never dead. */
  let analyser = null;
  let audioData = null;
  let simLevel = 0;

  async function enableMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      audioData = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch (err) {
      return false;
    }
  }

  function readLevel(t, state) {
    if (analyser) {
      analyser.getByteFrequencyData(audioData);
      let sum = 0;
      // Voice sits in the low bins; ignore the hiss at the top.
      const bins = Math.floor(audioData.length * 0.35);
      for (let i = 0; i < bins; i++) sum += audioData[i];
      const v = sum / bins / 255;
      return Math.min(1, v * 2.4);
    }
    // Synthetic envelope: syllable-rate bursts, not a smooth sine.
    const syll =
      Math.sin(t * 9.1) * 0.5 + Math.sin(t * 14.7 + 1.3) * 0.3 + Math.sin(t * 5.2) * 0.2;
    const gate = Math.max(0, Math.sin(t * 1.35) * 0.5 + 0.5);
    if (state === 'speaking') return clamp01((syll * 0.5 + 0.5) * gate * 1.25);
    if (state === 'listening') return clamp01((syll * 0.5 + 0.5) * 0.22 + 0.04);
    return 0.03;
  }

  /* ---- state ------------------------------------------------------ */
  let state = 'assembling'; // assembling | listening | speaking | idle
  let start = performance.now();
  let raf = 0;
  let running = true;
  let lastPct = -1;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight || 1;
    dpr = fitDpr(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    bloom.setSize(Math.round(w * dpr), Math.round(h * dpr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Pixels per world unit at unit depth, straight off the framebuffer.
    // Resolution-independent: no separate devicePixelRatio term needed.
    const px = renderer.domElement.height;
    const scale = (px * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    uniforms.uScale.value = scale;
    haloUniforms.uScale.value = scale;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const now = performance.now();
    const t = (now - start) / 1000;

    const assembling = state === 'assembling';
    const progress = assembling ? clamp01(t / ASSEMBLY_DURATION) : 1;

    uniforms.uTime.value = t;
    uniforms.uProgress.value = progress;
    haloUniforms.uTime.value = t;

    const level = readLevel(t, assembling ? 'idle' : state);
    simLevel += (level - simLevel) * 0.22;
    uniforms.uLevel.value = simLevel;
    haloUniforms.uLevel.value = simLevel;

    const wantSpeaking = state === 'speaking' ? 1 : 0;
    uniforms.uSpeaking.value +=
      (wantSpeaking - uniforms.uSpeaking.value) * 0.08;

    // Halo rings are the listening ripple. They retract while speaking.
    const wantHalo = state === 'listening' ? 1 : 0;
    haloUniforms.uOpacity.value += (wantHalo - haloUniforms.uOpacity.value) * 0.05;

    // Emitter burns through the assembly and dies at the end.
    const eOp = assembling ? 1 - clamp01((progress - 0.8) / 0.16) : 0;
    emitterMat.opacity = eOp;
    emitter.scale.setScalar(1.35 + Math.sin(t * 7) * 0.12);

    if (assembling) {
      const k = easeInOutCubic(clamp01(progress / 0.88));
      cam.az = (-72 + 72 * k) * DEG;
      cam.radius = 5.9 - 1.3 * k;

      const pct = Math.min(100, Math.round(progress * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onStatus({ state, progress, label: `ASSEMBLING… ${pct}%` });
      }
      if (progress >= 1) {
        state = 'listening';
        onStatus({ state, progress: 1, label: 'STATUS: LISTENING' });
      }
    } else {
      // Slow breathing drift once it is alive.
      cam.az += Math.sin(t * 0.16) * 0.00022;
    }

    if (!dragging) cam.dragAz *= 0.995;

    placeCamera();
    bloom.render(scene, camera);
  }

  placeCamera();
  onStatus({ state, progress: 0, label: 'ASSEMBLING… 0%' });
  raf = requestAnimationFrame(frame);

  return {
    replay() {
      state = 'assembling';
      lastPct = -1;
      cam.dragAz = 0;
      cam.dragEl = 0;
      start = performance.now();
    },
    setState(next) {
      if (next === 'assembling') return this.replay();
      state = next;
      onStatus({
        state,
        progress: 1,
        label: next === 'speaking' ? 'STATUS: SPEAKING' : 'STATUS: LISTENING',
      });
    },
    getState: () => state,
    setBloom: (tight, wide) => bloom.setStrength(tight, wide),
    enableMic,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      bloom.dispose();
      geo.dispose();
      haloGeo.dispose();
      mat.dispose();
      sprite.dispose();
      renderer.dispose();
    },
  };
}
