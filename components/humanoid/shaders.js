/* ------------------------------------------------------------------
   Oudie humanoid — shaders

   One geometry, one draw call. The orange face is NOT a separate
   object: it is the same contour bands, recoloured by a radial mask
   and given a larger ripple amplitude. That single decision is what
   makes the whole thing cheap enough to run at 60fps.
   ------------------------------------------------------------------ */

export const HUMANOID_VERT = /* glsl */ `
uniform float uTime;
uniform float uProgress;    // 0..1 assembly
uniform float uLevel;       // audio envelope 0..1
uniform float uSpeaking;    // 0..1 blend toward the speaking look
uniform float uScale;      // px per world unit at unit depth
uniform vec3  uEmitter;

attribute vec3  aTarget;
attribute vec3  aCtrl;
attribute vec3  aNrm;
attribute float aDelay;
attribute float aSeed;
attribute float aFace;
attribute float aKind;
attribute float aFade;

varying float vFace;
varying float vRim;
varying float vTravel;
varying float vKind;
varying float vSeed;
varying float vFade;
varying float vFacing;

const float SPREAD = 0.74;  // how far the arrival wavefront is smeared
const float TRAVEL = 0.26;  // how long one particle takes to fly in

float easeOutCubic(float x) { return 1.0 - pow(1.0 - x, 3.0); }

void main() {
  float t = clamp((uProgress - aDelay * SPREAD) / TRAVEL, 0.0, 1.0);
  float e = easeOutCubic(t);

  vec3 p = aTarget;

  // Band ripple. Amplitude climbs sharply inside the face mask and with
  // the audio envelope — that is the whole voice reactivity.
  float w = sin(p.x * 6.2 + uTime * 1.7 + p.y * 2.4) * 0.6
          + sin(p.x * 12.5 - uTime * 2.4 + aSeed * 6.283) * 0.4;
  float amp = 0.0028
            + aFace * 0.040 * (0.35 + uLevel * 1.35)
            + uSpeaking * 0.003;
  if (aKind > 2.5) amp *= 2.4;
  // loose sparks read as dust, not structure              // loose sparks drift more
  p.y += w * amp * e;
  p.x += w * amp * 0.28 * e;

  // Quadratic bezier from the emitter, so particles arc out and around.
  vec3 a = mix(uEmitter, aCtrl, e);
  vec3 b = mix(aCtrl, p, e);
  vec3 pos = mix(a, b, e);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // Fresnel on the surface normal. This is the entire silhouette glow —
  // points whose normal is perpendicular to the view blow out to white.
  vec3 n = normalize(normalMatrix * aNrm);
  vec3 vd = normalize(-mv.xyz);
  float nd = dot(n, vd);
  vRim = pow(1.0 - abs(nd), 2.2);
  // Far side stays visible — the reference is translucent — but recedes,
  // so the near bands read as distinct lines instead of merging.
  vFacing = nd > 0.0 ? 1.0 : 0.34;

  vTravel = 1.0 - e;
  vFace = aFace;
  vKind = aKind;
  vSeed = aSeed;
  vFade = aFade;

  // World units, NOT pixels. uScale does the conversion. Getting this
  // wrong by two orders of magnitude turns 50k dots into one white blob.
  float base = aKind > 2.5 ? 0.0042 : 0.0069;
  float size = base
             * (1.0 + vTravel * 2.4)
             * (1.0 + vRim * 1.5)
             * (0.7 + aSeed * 0.6);
  size *= 1.0 + aFace * (0.35 + uLevel * 1.1);

  gl_PointSize = max(1.0, size * uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

export const HUMANOID_FRAG = /* glsl */ `
uniform sampler2D uSprite;
uniform float uLevel;
uniform float uSpeaking;
uniform float uOpacity;

varying float vFace;
varying float vRim;
varying float vTravel;
varying float vKind;
varying float vSeed;
varying float vFade;
varying float vFacing;

void main() {
  float a = texture2D(uSprite, gl_PointCoord).a;
  if (a < 0.004) discard;

  const vec3 CYAN   = vec3(0.055, 0.640, 1.000);
  const vec3 ICE    = vec3(0.800, 0.960, 1.000);
  const vec3 ORANGE = vec3(1.000, 0.255, 0.020);
  const vec3 AMBER  = vec3(1.000, 0.700, 0.160);
  const vec3 HOT    = vec3(1.000, 0.960, 0.800);

  float f = min(1.0, vFace * (1.02 + uLevel * 0.42 + uSpeaking * 0.26));

  vec3 c = CYAN;
  c = mix(c, ORANGE, smoothstep(0.10, 0.44, f));
  c = mix(c, AMBER,  smoothstep(0.58, 0.86, f));
  c = mix(c, HOT,    smoothstep(0.90, 1.00, f));
  c = mix(c, ICE, vRim * 0.30);

  // Throat filaments run amber regardless of the face mask.
  if (vKind > 1.5 && vKind < 2.5) c = mix(AMBER, HOT, vSeed * 0.65);

  // In flight the particles are white-blue sparks; they cool into the
  // band colour as they land.
  c = mix(c, ICE, vTravel * 0.55);

  float i = (0.40 + vRim * 2.30 + f * 2.05) * (0.55 + vTravel * 0.85);
  gl_FragColor = vec4(c * i, a * uOpacity * vFade);
}
`;

export const HALO_VERT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uScale;

attribute float aRing;
attribute float aSeed;

varying float vAlpha;

void main() {
  // Each ring expands on its own phase and fades as it goes.
  float phase = fract(uTime * 0.22 + aRing * 0.85);
  float r = 0.72 + phase * 1.85 + uLevel * 0.28;

  vec3 p = position;
  p.xy *= r;
  p.x += sin(uTime * 1.4 + aSeed * 6.283) * 0.012;

  vAlpha = (1.0 - phase) * (0.30 + uLevel * 0.75) * smoothstep(0.0, 0.16, phase);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, (0.0026 + aSeed * 0.0018) * uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

export const HALO_FRAG = /* glsl */ `
uniform sampler2D uSprite;
uniform float uOpacity;
varying float vAlpha;

void main() {
  float a = texture2D(uSprite, gl_PointCoord).a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.24, 0.78, 1.0) * 0.85, a * vAlpha * uOpacity);
}
`;

/* Sharp core plus a long soft tail. Doing the bloom inside the sprite
   costs one texture instead of a whole postprocessing pass — which is
   why the standalone build needs no extra dependencies. */
export function makeSprite(THREE, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.16, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.34, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.52, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.01)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
