/* ------------------------------------------------------------------
   Bloom + composite

   The reference has a heavy postprocessing glow. Faking it inside the
   point sprite gets you 70% of the way and no further: a sprite halo
   cannot bleed between neighbouring particles, so dense areas never
   blow out the way they do in the reference.

   This is a hand-rolled separable-gaussian bloom at two scales. It is
   written against the bare three.js core so the standalone build still
   needs zero dependencies, and so the app and the preview run byte-for
   byte the same pipeline.
   ------------------------------------------------------------------ */

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* 9-tap gaussian, separable. uDir is (1/w, 0) or (0, 1/h). */
const BLUR_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uTex, vUv) * 0.2270270270;
  s += texture2D(uTex, vUv + uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(uTex, vUv - uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(uTex, vUv + uDir * 3.2307692308) * 0.0702702703;
  s += texture2D(uTex, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = s;
}
`;

/* Background, scene and both bloom scales land here. The vignette and
   the vertical lift match the reference frame, which is a photograph of
   a monitor in a lit room rather than a pure black render. */
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uStrengthA;
uniform float uStrengthB;
varying vec2 vUv;

void main() {
  vec3 top = vec3(0.078, 0.102, 0.149);
  vec3 bot = vec3(0.020, 0.027, 0.047);
  vec3 bg = mix(bot, top, pow(vUv.y, 1.35));

  vec2 d = vUv - 0.5;
  bg *= 1.0 - dot(d, d) * 0.85;

  vec4 scene = texture2D(uScene, vUv);
  vec3 bloom = texture2D(uBloomA, vUv).rgb * uStrengthA
             + texture2D(uBloomB, vUv).rgb * uStrengthB;

  vec3 c = bg + scene.rgb + bloom;
  c = c / (c + vec3(0.85));            // filmic rolloff, keeps the core from clipping flat

  // The rolloff desaturates as it compresses. Push chroma back or the
  // whole figure reads grey rather than electric blue.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.42);

  gl_FragColor = vec4(pow(max(c, 0.0), vec3(0.4545)), 1.0);
}
`;

export function createBloom(THREE, renderer) {
  // Half-float keeps the additive core from clipping before the tonemap.
  // Falls back on hardware that will not filter it.
  const caps = renderer.capabilities;
  const HDR =
    caps.isWebGL2 || renderer.extensions.get('OES_texture_half_float_linear')
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;

  const rt = (w, h) =>
    new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: HDR,
      depthBuffer: false,
      stencilBuffer: false,
    });

  let scene = rt(2, 2);
  let a1 = rt(2, 2), a2 = rt(2, 2); // half resolution — tight glow
  let b1 = rt(2, 2), b2 = rt(2, 2); // quarter resolution — wide halo

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadScene = new THREE.Scene();

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      uScene: { value: null },
      uBloomA: { value: null },
      uBloomB: { value: null },
      uStrengthA: { value: 1.15 },
      uStrengthB: { value: 0.85 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(quadGeo, blurMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  function pass(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target || null);
    renderer.render(quadScene, quadCam);
  }

  function blur(src, tmp, dst, w, h) {
    blurMat.uniforms.uTex.value = src.texture;
    blurMat.uniforms.uDir.value.set(1 / w, 0);
    pass(blurMat, tmp);
    blurMat.uniforms.uTex.value = tmp.texture;
    blurMat.uniforms.uDir.value.set(0, 1 / h);
    pass(blurMat, dst);
  }

  return {
    setSize(w, h) {
      scene.setSize(w, h);
      a1.setSize(w >> 1, h >> 1);
      a2.setSize(w >> 1, h >> 1);
      b1.setSize(w >> 2, h >> 2);
      b2.setSize(w >> 2, h >> 2);
      this._w = w;
      this._h = h;
    },

    render(sceneObj, camera) {
      const w = this._w, h = this._h;

      renderer.setRenderTarget(scene);
      renderer.clear();
      renderer.render(sceneObj, camera);

      // Tight glow at half res, then a second, wider pass at quarter res.
      // Two scales is what separates "glowing" from "blurry".
      blur(scene, a2, a1, w >> 1, h >> 1);
      blur(a1, b2, b1, w >> 2, h >> 2);
      blur(b1, b2, b1, w >> 2, h >> 2);

      compMat.uniforms.uScene.value = scene.texture;
      compMat.uniforms.uBloomA.value = a1.texture;
      compMat.uniforms.uBloomB.value = b1.texture;
      pass(compMat, null);
    },

    setStrength(tight, wide) {
      compMat.uniforms.uStrengthA.value = tight;
      compMat.uniforms.uStrengthB.value = wide;
    },

    dispose() {
      [scene, a1, a2, b1, b2].forEach((t) => t.dispose());
      quadGeo.dispose();
      blurMat.dispose();
      compMat.dispose();
    },
  };
}
