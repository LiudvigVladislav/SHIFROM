// About page entrance: one GPU point cloud that drifts, then gathers into the SHIFROM mark.
// Adapted from js/scenes/particles.js (the homepage hero): only two morph targets are kept
// (0 the chaotic cloud, 1 the mark sampled from the brand favicon), the stage runs on the clock
// instead of the scroll, and the mark sits where the About composition wants it.
// Contract: mount(canvas, opt) -> start() / stop() / setProgress(flood 0..1) / dispose().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FOV = 35, CAM_Z = 10;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
// the gather: the cloud drifts for a moment, then collapses onto the mark (seconds)
const GATHER_AT = 0.9, GATHER_FOR = 3.8;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261024);
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
const lin = (c) => Math.pow(c / 255, 2.2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- targets ---------- */

// the mark, sampled from the brand favicon (drawn up to 380 px so the alpha threshold cuts clean edges)
async function sampleLogo(url, count) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const S = 380;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0, S, S);
  const d = cx.getImageData(0, 0, S, S).data;
  const ok = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const a = d[i * 4 + 3], l = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    ok[i] = a > 210 && l > 72 ? 1 : 0;
  }
  const cand = [];
  for (let y = 2; y < S - 2; y++) for (let x = 2; x < S - 2; x++) {
    const i = y * S + x;
    if (ok[i] && ok[i - 1] && ok[i + 1] && ok[i - S] && ok[i + S] && ok[i - 2] && ok[i + 2] && ok[i - 2 * S] && ok[i + 2 * S]) cand.push(i);
  }
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const i = cand[(rnd() * cand.length) | 0];
    const x = i % S, y = (i / S) | 0;
    pos[k * 3] = (x + rnd()) / S - 0.5;
    pos[k * 3 + 1] = 0.5 - (y + rnd()) / S;
    pos[k * 3 + 2] = (rnd() - 0.5) * 0.03;
    col[k * 3] = lin(d[i * 4]); col[k * 3 + 1] = lin(d[i * 4 + 1]); col[k * 3 + 2] = lin(d[i * 4 + 2]);
  }
  return { pos, col };
}

// the cloud: tangled streamlines of a chaotic (ABC) flow plus diffuse dust (as on the homepage)
function buildCloud(count, pos, col) {
  const strands = [], M = 190, L = 84, h = 0.05;
  for (let s = 0; s < M; s++) {
    let x = (rnd() * 2 - 1) * Math.PI, y = (rnd() * 2 - 1) * Math.PI, z = (rnd() * 2 - 1) * Math.PI;
    const pts = new Float32Array(L * 3);
    for (let i = 0; i < L; i++) {
      const u = Math.sin(z) + 0.7 * Math.cos(y), v = 0.85 * Math.sin(x) + Math.cos(z), w = 0.7 * Math.sin(y) + 0.85 * Math.cos(x);
      x += u * h; y += v * h; z += w * h;
      const wx = ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const wy = ((y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const wz = ((z + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      pts[i * 3] = wx / Math.PI; pts[i * 3 + 1] = wy / Math.PI; pts[i * 3 + 2] = wz / Math.PI;
    }
    strands.push({ pts, sig: 0.0025 + Math.pow(rnd(), 4) * 0.045 });
  }
  const slate = [0.05, 0.055, 0.16];
  for (let k = 0; k < count; k++) {
    let x, y, z;
    for (;;) {
      if (rnd() < 0.8) {
        const st = strands[(rnd() * M) | 0];
        const i = (rnd() * (L - 1)) | 0;
        const pr = st.pts;
        if (Math.abs(pr[i * 3] - pr[i * 3 + 3]) > 0.5 || Math.abs(pr[i * 3 + 1] - pr[i * 3 + 4]) > 0.5 || Math.abs(pr[i * 3 + 2] - pr[i * 3 + 5]) > 0.5) continue;
        const f = rnd();
        x = pr[i * 3] + (pr[i * 3 + 3] - pr[i * 3]) * f + gauss() * st.sig;
        y = pr[i * 3 + 1] + (pr[i * 3 + 4] - pr[i * 3 + 1]) * f + gauss() * st.sig;
        z = pr[i * 3 + 2] + (pr[i * 3 + 5] - pr[i * 3 + 2]) * f + gauss() * st.sig;
      } else {
        x = gauss() * 0.5; y = gauss() * 0.42; z = gauss() * 0.5;
      }
      const r2 = x * x * 0.9 + y * y * 1.25 + z * z * 0.6;
      if (rnd() < Math.exp(-r2 * 2.1) + 0.035) break;
    }
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const t = Math.min(1, Math.max(0, x * 0.5 + 0.5 + (rnd() - 0.5) * 0.35));
    const m = [0.86, 0.06, 0.94], v = [0.2, 0.08, 1.0], b = [0.03, 0.2, 1.0];
    const g = t < 0.5 ? m.map((c, j) => c + (v[j] - c) * t * 2) : v.map((c, j) => c + (b[j] - c) * (t * 2 - 1));
    const sat = 0.35 + rnd() * 0.65;
    const lum = 0.35 + rnd() * 0.75;
    for (let j = 0; j < 3; j++) col[k * 3 + j] = (slate[j] + (g[j] - slate[j]) * sat) * lum;
    if (rnd() < 0.008) { col[k * 3] = 0.9; col[k * 3 + 1] = 0.7; col[k * 3 + 2] = 1.3; }
    if (rnd() < 0.012) {
      pos[k * 3] = (rnd() * 2 - 1) * 0.9; pos[k * 3 + 1] = (rnd() * 2 - 1) * 0.9; pos[k * 3 + 2] = 1.15 + rnd() * 0.75;
      for (let j = 0; j < 3; j++) col[k * 3 + j] *= 3.2;
    }
  }
}

/* ---------- shaders ---------- */

const vert = /* glsl */`
uniform float uTime, uStage, uPR, uBase, uAspect, uHW, uHH, uIntro, uFocus, uAper, uSweep, uDust;
uniform vec4 uShape;   // mark centre x, y, scale
uniform vec4 uField;   // cloud centre x, y, half-width, half-height
uniform vec2 uInt;     // intensity: cloud, mark
uniform vec3 uPtr;     // pointer ndc + push strength
uniform vec3 uPtr2;    // lagged pointer ndc + swirl
attribute vec3 aP1;
attribute vec4 aP4;    // dust position xyz, role (0 mark, 2 dust)
attribute vec3 aC0;
attribute vec3 aC1;
attribute vec4 aRnd;
varying vec3 vCol;
varying float vA;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  float ph = aRnd.z * 6.2831;

  // stage 0: the drifting cloud
  vec3 q = position;
  q.xz = rot(uTime * 0.02) * q.xz;
  float t = uTime * 0.16;
  q += vec3(sin(q.y * 2.6 + t), sin(q.z * 2.9 + t * 1.2), sin(q.x * 2.3 - t * 0.9)) * 0.045;
  q += vec3(sin(t * 2.1 + ph * 3.), cos(t * 1.7 + ph * 5.), sin(t * 1.3 + ph * 7.)) * 0.0035;
  q *= mix(0.22, 1., uIntro);
  vec3 pA = vec3(q.x * uField.z + uField.x, q.y * uField.w + uField.y, q.z * 3.6);
  vec3 cA = aC0; float aA = uInt.x; float zA = 1.2;

  // stage 1: the mark (most points) or the ambient dust around it
  vec3 pB, cB; float aB, zB;
  if (aP4.w > 1.5) {
    vec3 d = aP4.xyz;
    d.x += 0.02 * sin(uTime * 0.2 + ph);
    d.y += 0.02 * cos(uTime * 0.17 + ph);
    pB = vec3(d.x * uHW * 1.15, d.y * uHH * 1.15, d.z);
    cB = vec3(0.16, 0.12, 0.42); aB = uDust; zB = 1.0;
  } else {
    vec3 m = aP1 + 0.0035 * vec3(sin(uTime * 1.1 + ph * 7.), cos(uTime * 0.9 + ph * 5.), sin(uTime * 0.7 + ph * 3.));
    // the mark turns a little in depth so its thickness catches the light
    m.xz = rot(0.16 * sin(uTime * 0.23)) * m.xz;
    m.yz = rot(0.08 * sin(uTime * 0.17 + 1.3)) * m.yz;
    pB = vec3(m.xy * uShape.z + uShape.xy, m.z * uShape.z);
    cB = aC1 * 1.15; aB = uInt.y; zB = 0.95;
  }

  // who arrives first: the cloud collapses onto the outline of the mark, then fills it
  float s = clamp(uStage, 0., 1.);
  float sweep = 1. - clamp(length(aP1.xy) * 2.15, 0., 1.);
  float dl = 0.3 * aRnd.y + 0.7 * sweep;
  float spread = 0.55;
  float lt = clamp((s - dl * spread) / (1. - spread), 0., 1.);
  float e = lt * lt * lt * (lt * (lt * 6. - 15.) + 10.);
  vec3 p = mix(pA, pB, e);

  // in flight: one coherent turn around the mark and a fine shimmer, zero at both ends
  float sw = e * (1. - e) * 4.;
  p.xy = uShape.xy + rot(sw * 0.9) * (p.xy - uShape.xy);
  p += sw * 0.1 * vec3(sin(p.y * 4.3 + uTime * 0.9 + aRnd.z * 9.), sin(p.x * 3.7 - uTime * 0.8 + aRnd.z * 7.), sin(p.x * 2.3 + p.y * 2.9 + uTime * 0.6));

  vec3 col = mix(cA, cB, e);
  float al = mix(aA, aB, e) * (1. + sw * 0.35);
  float szm = mix(zA, zB, e);

  // a slow light sweep across the formed mark
  float band = (p.x - uShape.x) * 0.55 + (p.y - uShape.y) * 0.3 - uSweep;
  al *= 1. + exp(-band * band * 14.) * 1.1 * smoothstep(0.7, 1., s);

  al *= 0.8 + 0.2 * sin(uTime * (1.3 + aRnd.x * 2.) + aRnd.z * 50.);

  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float depth = -mv.z;
  vec4 cp = projectionMatrix * mv;
  vec2 ndc = cp.xy / cp.w;

  // pointer: a soft push, plus a swirl in the wake of a lagging second point
  vec2 dd = ndc - uPtr.xy; dd.x *= uAspect;
  float r2 = dot(dd, dd);
  float fall = exp(-r2 / 0.032) * uPtr.z;
  vec2 dd2 = ndc - uPtr2.xy; dd2.x *= uAspect;
  float r22 = dot(dd2, dd2);
  float f2 = exp(-r22 / 0.09) * uPtr2.z;
  vec2 disp = dd * inversesqrt(r2 + 1e-4) * fall * 0.13 + vec2(-dd2.y, dd2.x) * inversesqrt(r22 + 1e-4) * f2 * 0.08;
  mv.xy += disp * depth * ${TAN.toFixed(5)};
  mv.z += fall * 0.9;
  al *= 1. + fall * 0.7 + f2 * 0.3;
  depth = -mv.z;

  float coc = min(abs(depth - uFocus) * uAper * (depth < uFocus ? 1.6 : 1.0), 5.);
  float size = uBase * szm * (0.55 + aRnd.x * 0.9) * (1. + coc);
  float px = size * uPR * ${CAM_Z.toFixed(1)} / max(depth, 0.5);
  gl_PointSize = clamp(px, 1.0, 64.0 * uPR);
  al /= (1. + coc * coc * 1.1);
  al *= clamp(px, 0.35, 1.0);

  vCol = col;
  vA = al;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2. - 1.;
  float r2 = dot(q, q);
  if (r2 > 1.) discard;
  float g = max(exp(-r2 * 3.4) - 0.033, 0.);
  float a = g * vA;
  gl_FragColor = vec4(vCol * a, a);
}
`;

/* ---------- scene ---------- */

let S = null;

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const phone = !!opt.phone;
  const N = phone ? 22000 : 80000;   // phones: a lighter field, no bloom, DPR 1.5
  const DPR = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  // ---- data
  const logo = await sampleLogo(opt.logoUrl, N);
  const P0 = new Float32Array(N * 3), C0 = new Float32Array(N * 3);
  buildCloud(N, P0, C0);
  const P4 = new Float32Array(N * 4), R = new Float32Array(N * 4);
  for (let k = 0; k < N; k++) {
    if (rnd() < 0.08) {   // ambient dust: it stays scattered when the mark forms
      P4[k * 4] = rnd() * 2 - 1; P4[k * 4 + 1] = rnd() * 2 - 1; P4[k * 4 + 2] = -5 + rnd() * 6.5; P4[k * 4 + 3] = 2;
    }
    R[k * 4] = rnd(); R[k * 4 + 1] = rnd(); R[k * 4 + 2] = rnd(); R[k * 4 + 3] = rnd();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P0, 3));
  geo.setAttribute('aC0', new THREE.BufferAttribute(C0, 3));
  geo.setAttribute('aP1', new THREE.BufferAttribute(logo.pos, 3));
  geo.setAttribute('aC1', new THREE.BufferAttribute(logo.col, 3));
  geo.setAttribute('aP4', new THREE.BufferAttribute(P4, 4));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(R, 4));

  const U = {
    uTime: { value: 0 }, uStage: { value: 0 }, uPR: { value: DPR },
    uBase: { value: phone ? 2.1 : 1.8 }, uAspect: { value: 1 },
    uHW: { value: 1 }, uHH: { value: 1 }, uIntro: { value: 0 },
    uFocus: { value: CAM_Z }, uAper: { value: 0.26 }, uSweep: { value: -9 },
    uShape: { value: new THREE.Vector4() }, uField: { value: new THREE.Vector4() },
    uInt: { value: new THREE.Vector2(1.75, 0.95) }, uDust: { value: 0.5 },
    uPtr: { value: new THREE.Vector3(0, 0, 0) }, uPtr2: { value: new THREE.Vector3(0, 0, 0) },
  };
  if (phone) { U.uInt.value.set(2.2, 1.3); U.uDust.value = 0.75; }

  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // ---- post: bloom on desktop only; phones get tone mapping alone
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!phone) {
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.62, 0.12);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());

  // ---- layout: the mark stands above the horizon of light, to the right of the title (centred on phones)
  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    composer.setPixelRatio(DPR);
    composer.setSize(W, H);
    const aspect = W / H;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const hh = CAM_Z * TAN, hw = hh * aspect;
    U.uAspect.value = aspect; U.uHW.value = hw; U.uHH.value = hh;
    if (aspect >= 1) {
      // centre at 64% across and 41% down the stage; the mark is 56% of the stage tall
      const sc = Math.min(2 * hh * 0.56, hw * 0.78);
      U.uShape.value.set(hw * 0.28, hh * 0.18, sc, 0);
      U.uField.value.set(hw * 0.2, hh * 0.14, hw * 1.0, hh * 0.92);
    } else {
      // phones: centred, in the upper half, clear of the title
      // the mark sits in the upper third (centre at 31% down, 31% of the screen tall), clear of the two-line title
      const sc = Math.min(2 * hw * 0.78, 2 * hh * 0.31);
      U.uShape.value.set(0, hh * 0.38, sc, 0);
      U.uField.value.set(0, hh * 0.3, hw * 1.25, hh * 0.62);
    }
  }
  resize();

  // ---- motion state
  const ptr = { tx: 0, ty: 0, active: 0 };
  const sp1 = { x: 0, y: 0, vx: 0, vy: 0 }, sp2 = { x: 0, y: 0, vx: 0, vy: 0 };
  const str = { x: 0, v: 0 };
  const cam = { x: 0, y: 0, vx: 0, vy: 0 };
  let lastPX = 0, lastPY = 0, speed = 0, t0 = -1, flood = 0;

  function setPointer(nx, ny, active) { ptr.tx = nx; ptr.ty = ny; ptr.active = active ? 1 : 0; }
  function spring(o, tx, ty, k, c, dt) {
    o.vx += (k * (tx - o.x) - c * o.vx) * dt; o.vy += (k * (ty - o.y) - c * o.vy) * dt;
    o.x += o.vx * dt; o.y += o.vy * dt;
  }

  function draw(dt, still) {
    let s;
    if (!still) {
      // the entrance runs on the wall clock, so a slow first second cannot stretch it
      const now = performance.now();
      if (t0 < 0) t0 = now;
      const clock = (now - t0) / 1000;
      U.uTime.value += dt;
      U.uIntro.value = 1 - Math.pow(1 - Math.min(1, clock / 2.6), 4);
      s = easeInOut(Math.min(1, Math.max(0, (clock - GATHER_AT) / GATHER_FOR)));
      spring(sp1, ptr.tx, ptr.ty, 120, 12.5, dt);
      spring(sp2, sp1.x, sp1.y, 26, 7.5, dt);
      const mvx = ptr.tx - lastPX, mvy = ptr.ty - lastPY; lastPX = ptr.tx; lastPY = ptr.ty;
      speed = speed * 0.9 + Math.hypot(mvx, mvy) / Math.max(dt, 1e-3) * 0.1;
      const tgt = ptr.active ? 0.55 + Math.min(speed * 0.35, 0.6) : 0;
      str.v += (40 * (tgt - str.x) - 12.6 * str.v) * dt; str.x += str.v * dt;
      U.uPtr.value.set(sp1.x, sp1.y, Math.max(0, str.x));
      U.uPtr2.value.set(sp2.x, sp2.y, Math.min(0.9, Math.hypot(sp1.vx, sp1.vy) * 0.25) * (ptr.active ? 1 : 0.3));
      spring(cam, ptr.active ? ptr.tx : 0, ptr.active ? ptr.ty : 0, 8, 5.6, dt);
      const t = U.uTime.value;
      // a slow drift, a little pointer parallax, and a gentle push in as the light rises
      camera.position.set(0.16 * Math.sin(t * 0.07) + cam.x * 0.28, 0.1 * Math.cos(t * 0.05) + cam.y * 0.18, CAM_Z - 0.9 * flood);
      camera.lookAt(0, 0, 0);
      U.uSweep.value = ((t * 0.55) % 9) - 4.5;
    } else {
      s = U.uStage.value;
      U.uIntro.value = 1;
      camera.position.set(0, 0, CAM_Z); camera.lookAt(0, 0, 0);
      U.uSweep.value = -9;
    }
    U.uStage.value = s;
    U.uAper.value = 0.26 - 0.1 * smooth(0.3, 1, s);
    if (bloom) bloom.strength = 0.85 - 0.12 * smooth(0, 1, s);
    composer.render();
  }

  // ---- loop: runs only between start() and stop()
  let raf = 0, last = 0, lost = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 24);
    last = now;
    draw(dt, false);
  }
  function start() { if (!raf && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const onLost = (e) => { e.preventDefault(); lost = true; stop(); opt.onLost && opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);

  // flood: 0 while the entrance is dark, 1 once the light has covered it
  function setProgress(f) { flood = Math.min(1, Math.max(0, f)); }

  function dispose() {
    stop();
    canvas.removeEventListener('webglcontextlost', onLost);
    geo.dispose(); mat.dispose();
    composer.passes.forEach((p) => p.dispose && p.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    S = null;
  }

  const api = {
    start, stop, setProgress, dispose, resize, setPointer,
  };
  S = { api };
  return api;
}

export function start() { S && S.api.start(); }
export function stop() { S && S.api.stop(); }
export function setProgress(f) { S && S.api.setProgress(f); }
export function dispose() { S && S.api.dispose(); }
