// Engineering index: a slow particle ribbon in the header band, in the homepage's brand gradient
// (magenta -> violet -> blue), with a few blue packets travelling along it.
// One point cloud, one draw call, no post-processing. three.js loads only when WebGL exists, after the
// page has loaded. Paused off screen and in background tabs; a single still frame under
// prefers-reduced-motion; without WebGL the band keeps its CSS light and the type carries the page.
const canvas = document.querySelector('.eng-gl');
const band = document.querySelector('.eng-head');

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

if (canvas && band && hasWebGL()) {
  const go = () => import('three').then(mount).catch(() => {});
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vert = /* glsl */`
uniform float uTime, uHW, uHH, uPR, uSize;
uniform vec4 uPath;   // y at the left, y at the right (in half-heights), wave amplitude, band half-width
uniform vec2 uDrop;   // where along the ribbon it starts to descend: from, to
attribute vec4 aSeed;
attribute float aKind;
varying vec3 vCol;
varying float vA;

vec3 brand(float t) {
  t = clamp(t, 0., 1.);
  vec3 m = vec3(0.80, 0.33, 0.95), v = vec3(0.43, 0.30, 1.0), b = vec3(0.21, 0.29, 0.95);
  return t < .5 ? mix(m, v, t * 2.) : mix(v, b, t * 2. - 1.);
}
vec3 centre(float u, float t) {
  float x = mix(-1.1, 1.1, u) * uHW;
  float y = mix(uPath.x, uPath.y, smoothstep(uDrop.x, uDrop.y, u));
  y += uPath.z * (sin(u * 5.2 + t * 0.11) + 0.4 * sin(u * 11.0 - t * 0.07));
  return vec3(x, y * uHH, 0.7 * sin(u * 3.1 + t * 0.09));
}

void main() {
  float t = uTime;
  vec3 p, col; float a, size;
  if (aKind < 0.5) {
    // the ribbon: a twisting band; particles drift along it, left to right
    float u = fract(aSeed.x + t * (0.0042 + aSeed.w * 0.003));
    float hw = uPath.w * uHH * (0.6 + 0.4 * sin(u * 3.0 + 0.6));
    float tw = u * 6.4 + t * 0.15;
    vec3 n1 = vec3(0., cos(tw), sin(tw)), n2 = vec3(0., -sin(tw), cos(tw));
    p = centre(u, t) + n1 * aSeed.y * hw + n2 * aSeed.z * hw * 0.1;
    col = brand(u * 1.08 - 0.04);
    a = 0.82 * smoothstep(0., 0.08, u) * smoothstep(1., 0.9, u) * (0.5 + 0.5 * abs(aSeed.y));
    size = uSize * (0.65 + fract(aSeed.w * 7.31) * 0.8);
  } else if (aKind < 1.5) {
    // packets: sealed envelopes riding the ribbon a little faster
    float u = fract(aSeed.x + t * (0.014 + aSeed.w * 0.006));
    float tw = u * 6.4 + t * 0.15;
    p = centre(u, t) + vec3(0., cos(tw), sin(tw)) * aSeed.y * uPath.w * uHH * 0.55;
    col = vec3(0.16, 0.2, 0.84);
    a = 0.95 * smoothstep(0., 0.06, u) * smoothstep(1., 0.93, u);
    size = uSize * 2.5;
  } else {
    // a little dust in the light
    p = vec3(aSeed.x * uHW * 1.05 + 0.05 * sin(t * 0.13 + aSeed.w * 20.),
             aSeed.y * uHH * 1.05 + 0.05 * cos(t * 0.11 + aSeed.w * 17.),
             (aSeed.z - 0.5) * 2.);
    col = vec3(0.36, 0.3, 0.7);
    a = 0.16 + 0.08 * sin(t * 0.5 + aSeed.w * 30.);
    size = uSize * 0.85;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1., size * uPR * 10. / -mv.z);
  vCol = col;
  vA = a;
}
`;

const frag = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2. - 1.;
  float a = vA * smoothstep(1., 0.45, length(q));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, a);   // premultiplied
}
`;

function mount(THREE) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 700px), (pointer: coarse)');
  const phone = matchMedia('(max-width: 700px)').matches;
  const NR = phone ? 3600 : 7000, NP = phone ? 9 : 15, ND = phone ? 160 : 320;
  const total = NR + NP + ND;
  const rnd = mulberry32(20260801);

  const seed = new Float32Array(total * 4), kind = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (i < NR) {
      // across the band: mostly even, some piled at the edges so the ribbon has a crisp outline
      const r = rnd();
      const across = r < 0.62 ? rnd() * 2 - 1 : (rnd() < 0.5 ? -1 : 1) * (0.88 + rnd() * 0.12);
      seed[o] = rnd(); seed[o + 1] = across; seed[o + 2] = (rnd() - 0.5) * 2; seed[o + 3] = rnd();
      kind[i] = 0;
    } else if (i < NR + NP) {
      seed[o] = (i - NR) / NP + rnd() * 0.04; seed[o + 1] = (rnd() - 0.5) * 1.4; seed[o + 2] = 0; seed[o + 3] = rnd();
      kind[i] = 1;
    } else {
      seed[o] = rnd() * 2 - 1; seed[o + 1] = rnd() * 2 - 1; seed[o + 2] = rnd(); seed[o + 3] = rnd();
      kind[i] = 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));

  const U = {
    uTime: { value: 0 }, uHW: { value: 1 }, uHH: { value: 1 }, uPR: { value: 1 }, uSize: { value: 2.1 },
    uPath: { value: new THREE.Vector4() }, uDrop: { value: new THREE.Vector2() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.z = 10;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);

  function fit() {
    const w = Math.max(1, band.clientWidth), h = Math.max(1, band.clientHeight);
    const pr = Math.min(devicePixelRatio || 1, small.matches ? 1.5 : 1.75);   // phones: <= 1.5
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const hh = Math.tan((35 / 2) * Math.PI / 180) * 10;
    U.uHH.value = hh; U.uHW.value = hh * camera.aspect; U.uPR.value = pr;
    if (camera.aspect >= 1.25) {
      // wide: high on the left, above the title; it descends on the right, beside the type
      U.uPath.value.set(0.5, -0.32, 0.1, 0.17); U.uDrop.value.set(0.48, 1.0);
    } else {
      // narrow: it stays in the open top of the band, over the type
      U.uPath.value.set(0.32, 0.12, 0.07, 0.14); U.uDrop.value.set(0.2, 1.0);
    }
    U.uSize.value = camera.aspect >= 1.25 ? 2.1 : 1.9;
  }

  const T0 = 46;   // start mid-flow, so the ribbon is whole on its first frame
  const start = performance.now();
  let raf = 0, running = false, inView = true, shown = false;

  function draw(now) {
    U.uTime.value = T0 + ((now ?? performance.now()) - start) / 1000;
    renderer.render(scene, camera);
    if (!shown) { shown = true; requestAnimationFrame(() => canvas.classList.add('is-live')); }
  }
  function loop(now) { raf = 0; draw(now); if (running) raf = requestAnimationFrame(loop); }
  function play() {
    if (running || reduce.matches || !inView || document.hidden) return;
    running = true; raf = requestAnimationFrame(loop);
  }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function still() { U.uTime.value = T0; renderer.render(scene, camera); if (!shown) { shown = true; canvas.classList.add('is-live'); } }

  fit();
  if (reduce.matches) still(); else { draw(); play(); }

  new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; inView ? play() : pause(); }).observe(band);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  const onPref = () => { if (reduce.matches) { pause(); still(); } else play(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onPref);
  new ResizeObserver(() => { fit(); if (!running) (reduce.matches ? still() : draw()); }).observe(band);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pause(); canvas.classList.remove('is-live'); });
}
