// SHIFROM "The Phone": one lit 3D Android phone, one pinned scroll film (from the round-2 Phone prototype).
// Contract: mount(canvas, opt) -> start() / stop() / setProgress(p, enter) / dispose().
//   p      film progress 0..1 while the stage is pinned
//   enter  0..1 while the section scrolls into view (the phone turns in from edge-on)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LW, LH, MESSAGES, layout, paint, drawBubble } from './phone-screen.js?v=0c78277a';
import { yieldTask, warm } from './yield.js?v=c5724892';

/* ---------- helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/* ---------- the film's timing (beat lines live in ../timing.js, shared with the page) ---------- */
const MSG_AT = [0, 0.365, 0.41, 0.505];     // replies land while beat 2 is on screen
const TYPE_AT = [0.44, 0.495];
const RIBBON_AT = [0.665, 0.94];

/* ---------- poses: x, y, z, s(cale), ry, rx, rz ---------- */
const POSES = {
  desk: [
    { p: 0.0, x: 1.45, y: 0.06, z: 0, s: 1.3, ry: -0.16, rx: 0.02, rz: 0 },
    { p: 0.26, x: 1.45, y: 0.06, z: 0, s: 1.3, ry: -0.22, rx: 0.02, rz: 0 },
    { p: 0.36, x: -1.45, y: 0.06, z: 0, s: 1.3, ry: 0.18, rx: 0.02, rz: 0 },
    { p: 0.6, x: -1.45, y: 0.06, z: 0, s: 1.3, ry: 0.14, rx: 0.02, rz: 0 },
    { p: 0.685, x: -1.5, y: -0.62, z: 0, s: 1.24, ry: 0.42, rx: -0.02, rz: 0.0 },
    { p: 1.0, x: -1.5, y: -0.62, z: 0, s: 1.24, ry: 0.34, rx: -0.02, rz: 0.0 },
  ],
  phone: [
    { p: 0.0, x: 0, y: -0.86, z: 0, s: 1.06, ry: -0.12, rx: 0.02, rz: 0 },
    { p: 0.26, x: 0, y: -0.86, z: 0, s: 1.06, ry: -0.16, rx: 0.02, rz: 0 },
    { p: 0.36, x: 0, y: -0.86, z: 0, s: 1.06, ry: 0.12, rx: 0.02, rz: 0 },
    { p: 0.6, x: 0, y: -0.86, z: 0, s: 1.06, ry: 0.08, rx: 0.02, rz: 0 },
    { p: 0.685, x: -0.42, y: -0.92, z: 0, s: 0.96, ry: 0.36, rx: -0.02, rz: 0 },
    { p: 1.0, x: -0.42, y: -0.92, z: 0, s: 0.96, ry: 0.3, rx: -0.02, rz: 0 },
  ],
};
const KEYS = ['x', 'y', 'z', 's', 'ry', 'rx', 'rz'];
function poseAt(keys, p) {
  if (p <= keys[0].p) return { ...keys[0] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (p <= b.p) {
      const t = smoother((p - a.p) / (b.p - a.p));
      const o = {};
      for (const k of KEYS) o[k] = mix(a[k], b[k], t);
      return o;
    }
  }
  return { ...keys[keys.length - 1] };
}

function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

let S = null;

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const isFlow = () => (typeof opt.flow === 'function' ? opt.flow() : !!opt.flow);
  const phoneMQ = matchMedia('(max-width: 720px) and (orientation: portrait)');   // landscape phones use the wide film
  let isPhone = phoneMQ.matches;

  // Onest for the chat UI; JetBrains Mono only for the ciphertext glyphs, loaded here and nowhere else
  try {
    const mono = new FontFace('JetBrains Mono', `url(${opt.monoUrl})`, { weight: '500' });
    document.fonts.add(await mono.load());
  } catch (e) { /* the atlas falls back to the system monospace */ }
  await Promise.all([
    // a sample string pulls in the Cyrillic subset too (it loads by unicode-range)
    document.fonts.load('400 44px "Onest"', 'Aa Майя'),
    document.fonts.load('600 50px "Onest"', 'Aa Майя'),
  ]).catch(() => {});
  // the page's own <img> of the mark when there is one, so the file is fetched once
  const logo = opt.logoImg ? await opt.logoImg.decode().then(() => opt.logoImg, () => loadImg(opt.logoUrl)) : await loadImg(opt.logoUrl);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  // production: no synchronous shader-log queries on a program's first use (they stall the main thread)
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  await yieldTask();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
  await yieldTask();

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0.9, 12);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-4, 6, 7);
  scene.add(key);
  const rimV = new THREE.DirectionalLight(0xa070ff, 6);
  rimV.position.set(6, 3, -5);
  scene.add(rimV);
  const rimB = new THREE.DirectionalLight(0x3f7bff, 5);
  rimB.position.set(-6, -1, -4);
  scene.add(rimB);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(3, -2, 6);
  scene.add(fill);

  /* ----- phone ----- */
  const PW = 1.46, PH = 3.0, PR = 0.25, DEPTH = 0.1, BT = 0.036, BS = 0.036;
  const FRONT = DEPTH / 2 + BT;
  const SW = 1.33, SH = SW * LH / LW, SR = 0.17;

  function rrShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  function planeFromShape(w, h, r) {
    const g = new THREE.ShapeGeometry(rrShape(w, h, r), 20);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    return g;
  }

  const phone = new THREE.Group();
  scene.add(phone);

  const metal = new THREE.MeshPhysicalMaterial({ color: 0x77737f, metalness: 1, roughness: 0.27, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const glassBack = new THREE.MeshPhysicalMaterial({ color: 0x07070a, metalness: 0, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 });
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(PW - 2 * BS, PH - 2 * BS, PR - BS), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelSegments: isPhone ? 6 : 10, curveSegments: isPhone ? 24 : 40,
  });
  bodyGeo.translate(0, 0, -DEPTH / 2);
  const body = new THREE.Mesh(bodyGeo, [glassBack, metal]);
  phone.add(body);
  await yieldTask();

  // Android layout: power key and volume rocker both on the right edge
  const btnGeo = (len) => new RoundedBoxGeometry(0.034, len, 0.05, 2, 0.014);
  const addBtn = (len, x, y) => { const m = new THREE.Mesh(btnGeo(len), metal); m.position.set(x, y, 0); phone.add(m); };
  addBtn(0.2, PW / 2 + 0.004, 0.9);
  addBtn(0.46, PW / 2 + 0.004, 0.38);

  // screen (the punch-hole camera is painted into it)
  const scr = document.createElement('canvas');
  const K = isPhone ? 0.62 : 0.94;
  scr.width = Math.round(LW * K);
  scr.height = Math.round(LH * K);
  const sctx = scr.getContext('2d');
  const boxes = layout(sctx);
  await yieldTask();
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;   // three clamps to the device maximum at upload (a synchronous query we avoid here)
  const screen = new THREE.Mesh(planeFromShape(SW, SH, SR), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = FRONT + 0.0015;
  phone.add(screen);

  // glass: environment reflection only, added on top of the screen
  const glass = new THREE.Mesh(
    planeFromShape(PW - 2 * BS, PH - 2 * BS, PR - BS),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.6 }),
  );
  glass.position.z = FRONT + 0.004;
  phone.add(glass);

  /* ----- contact shadow on an implied floor ----- */
  const FLOOR = -2.2;
  function radialTex(size, inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size * outer);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.42)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  const shadowMat = new THREE.MeshBasicMaterial({ map: radialTex(256, 0, 0.5), color: 0x1b1a26, transparent: true, depthWrite: false, opacity: 0 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = FLOOR;
  scene.add(shadow);

  /* ----- colour spill behind the phone, dithered so the soft falloff never bands ----- */
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(isPhone ? 4.6 : 7.5, isPhone ? 5.4 : 6.2),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Vector3(0.56, 0.42, 1.0) }, uOpacity: { value: 0.26 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){
          float d = length(vUv * 2.0 - 1.0);
          float a = 1.0 - smoothstep(0.0, 1.0, d);
          a = a * a * uOpacity;
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          gl_FragColor = vec4(uColor, clamp(a + (n - 0.5) / 160.0, 0.0, 1.0));
        }`,
      transparent: true, depthWrite: false,
    }));
  halo.renderOrder = -1;
  scene.add(halo);

  /* ----- a soft light streak across the glass, sliding as the phone turns ----- */
  const sheenC = document.createElement('canvas');
  sheenC.width = 512; sheenC.height = 512;
  {
    const g = sheenC.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 380);
    gr.addColorStop(0.0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.38, 'rgba(255,255,255,0)');
    gr.addColorStop(0.47, 'rgba(255,255,255,0.11)');
    gr.addColorStop(0.53, 'rgba(255,255,255,0.03)');
    gr.addColorStop(0.62, 'rgba(255,255,255,0)');
    gr.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
  }
  const glassSheenTex = new THREE.CanvasTexture(sheenC);
  const sheen = new THREE.Mesh(planeFromShape(PW - 2 * BS, PH - 2 * BS, PR - BS),
    new THREE.MeshBasicMaterial({ map: glassSheenTex, transparent: true, depthWrite: false, toneMapped: false }));
  sheen.position.z = FRONT + 0.005;
  sheen.renderOrder = 5;
  phone.add(sheen);
  await yieldTask();

  /* ----- the outgoing bubble (lifts off the screen) ----- */
  const b4 = boxes[3];
  const PAD = 6;
  const bc = document.createElement('canvas');
  const BK = isPhone ? 0.9 : 1.4;
  bc.width = Math.round((b4.w + PAD * 2) * BK);
  bc.height = Math.round((b4.h + PAD * 2) * BK);
  const bctx = bc.getContext('2d');
  bctx.scale(BK, BK);
  drawBubble(bctx, MESSAGES[3], b4, -b4.x + PAD, -b4.y + PAD, 'clock');
  const bubbleTex = new THREE.CanvasTexture(bc);
  bubbleTex.colorSpace = THREE.SRGBColorSpace;
  const bw = (b4.w + PAD * 2) / LW * SW, bh = (b4.h + PAD * 2) / LH * SH;
  const bubbleMat = new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, toneMapped: false, depthWrite: false, opacity: 0 });
  const bubble = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bubbleMat);
  const bubbleHome = new THREE.Vector3((b4.x + b4.w / 2) / LW * SW - SW / 2, SH / 2 - (b4.y + b4.h / 2) / LH * SH, FRONT + 0.006);
  bubble.position.copy(bubbleHome);
  bubble.renderOrder = 3;
  phone.add(bubble);

  // soft shadow the lifted bubble casts on the screen
  const bsc = document.createElement('canvas');
  bsc.width = 256; bsc.height = 128;
  {
    const g = bsc.getContext('2d');
    // feature-detect on the prototype: assigning g.filter in WebKit just creates a plain property that reads back
    if ('filter' in CanvasRenderingContext2D.prototype) {
      g.filter = 'blur(14px)';
      g.fillStyle = '#000';
      g.beginPath();
      g.roundRect(40, 34, 176, 60, 26);
      g.fill();
    } else {
      // Safari/WebKit has no canvas filter: cast the blur as a shadow from a shape drawn off-canvas.
      // A canvas shadowBlur of 2*sigma matches a CSS blur of sigma.
      const off = 1000;
      g.shadowColor = '#000';
      g.shadowBlur = 28;
      g.shadowOffsetX = off;
      g.fillStyle = '#000';
      g.beginPath();
      g.roundRect(40 - off, 34, 176, 60, 26);
      g.fill();
    }
  }
  const bshadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bsc), transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const bshadow = new THREE.Mesh(new THREE.PlaneGeometry(bw * 1.45, bh * 2.1), bshadowMat);
  bshadow.position.set(bubbleHome.x, bubbleHome.y, FRONT + 0.0035);
  bshadow.renderOrder = 2;
  phone.add(bshadow);
  await yieldTask();

  /* ----- ciphertext ribbon ----- */
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const atlasC = document.createElement('canvas');
  atlasC.width = atlasC.height = 512;
  {
    const g = atlasC.getContext('2d');
    g.fillStyle = '#fff';
    g.font = '500 46px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 64; i++) g.fillText(ALPH[i], (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  }
  const atlas = new THREE.CanvasTexture(atlasC);
  atlas.anisotropy = 4;

  const R = isPhone ? 3 : 4;
  const COLS = isPhone ? 84 : 132;
  const N = R * COLS;
  const GR = isPhone ? 5 : 7;
  const GC = Math.ceil(N / GR);
  const LR = isPhone ? 0.95 : 1.05; // ribbon length in curve units

  const gGeo = new THREE.PlaneGeometry(1, 1);
  const aGlyph = new Float32Array(N), aAlpha = new Float32Array(N), aTint = new Float32Array(N);
  let seed = 20261023;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { aGlyph[i] = Math.floor(rand() * 64); aTint[i] = Math.floor(i / R) / COLS; }
  const glyphAttr = new THREE.InstancedBufferAttribute(aGlyph, 1);
  const alphaAttr = new THREE.InstancedBufferAttribute(aAlpha, 1);
  gGeo.setAttribute('aGlyph', glyphAttr);
  gGeo.setAttribute('aAlpha', alphaAttr);
  gGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 1));
  const gMat = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas },
      c0: { value: new THREE.Color(0xc12fe0) },
      c1: { value: new THREE.Color(0x6a35f0) },
      c2: { value: new THREE.Color(0x2f62f2) },
    },
    vertexShader: /* glsl */`
      attribute float aGlyph; attribute float aAlpha; attribute float aTint;
      varying vec2 vUv; varying float vA; varying float vT;
      void main() {
        float col = mod(aGlyph, 8.0);
        float row = floor(aGlyph / 8.0);
        vUv = (uv + vec2(col, 7.0 - row)) / 8.0;
        vA = aAlpha; vT = aTint;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; uniform vec3 c0; uniform vec3 c1; uniform vec3 c2;
      varying vec2 vUv; varying float vA; varying float vT;
      void main() {
        float a = texture2D(uAtlas, vUv).a * vA;
        if (a < 0.02) discard;
        vec3 col = vT < 0.5 ? mix(c0, c1, vT * 2.0) : mix(c1, c2, vT * 2.0 - 1.0);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // colours are authored in sRGB; write them straight through
  for (const k of ['c0', 'c1', 'c2']) gMat.uniforms[k].value.convertLinearToSRGB();
  const glyphs = new THREE.InstancedMesh(gGeo, gMat, N);
  glyphs.frustumCulled = false;
  glyphs.renderOrder = 4;
  glyphs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(glyphs);
  await yieldTask();

  // per-glyph grid position inside the lifted bubble (bubble-local)
  const gridLocal = [];
  {
    const padX = 0.07 * bw, padY = 0.16 * bh;
    const cw = (bw - padX * 2) / GC, ch = (bh - padY * 2) / GR;
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / GC), c = i % GC;
      gridLocal.push(new THREE.Vector3(-bw / 2 + padX + (c + 0.5) * cw, bh / 2 - padY - (r + 0.5) * ch, 0.002));
    }
    gridLocal.cell = Math.min(cw * 1.5, ch * 1.05);
  }
  const across = (r) => (r - (R - 1) / 2) * (isPhone ? 0.12 : 0.14);

  const LUTN = 220;
  const lutP = Array.from({ length: LUTN + 1 }, () => new THREE.Vector3());
  const lutT = Array.from({ length: LUTN + 1 }, () => new THREE.Vector3());
  const curvePts = Array.from({ length: 6 }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal');
  const OFFS = {
    desk: [[0, 0, 0], [0.8, 0.2, 1.1], [2.0, 0.7, 2.3], [3.3, 0.35, 1.7], [5.0, 1.15, 0.1], [8.6, 2.4, -3.0]],
    // portrait: the ribbon leaves to the right and climbs beside the phone, below the copy at the top
    phone: [[0, 0, 0], [0.42, 0.08, 0.8], [0.85, 0.45, 1.2], [0.98, 1.15, 0.9], [1.3, 1.75, 0.0], [2.4, 2.3, -1.6]],
  };
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const B = new THREE.Vector3(), Nn = new THREE.Vector3(), L = new THREE.Vector3(), Z = new THREE.Vector3();
  const qGrid = new THREE.Quaternion(), qRib = new THREE.Quaternion(), qOut = new THREE.Quaternion();
  const mBasis = new THREE.Matrix4(), mOut = new THREE.Matrix4();
  const sVec = new THREE.Vector3(), anchor = new THREE.Vector3(), gridW = new THREE.Vector3();

  function buildCurve() {
    const offs = isPhone ? OFFS.phone : OFFS.desk;
    anchor.set(bw * 0.42, 0, 0.02);    // the bubble's trailing edge, in world space
    bubble.localToWorld(anchor);
    offs.forEach((o, i) => curvePts[i].set(anchor.x + o[0], anchor.y + o[1], anchor.z + o[2]));
    curve.updateArcLengths();
    for (let i = 0; i <= LUTN; i++) curve.getPointAt(i / LUTN, lutP[i]);
    for (let i = 0; i <= LUTN; i++) {
      const a = lutP[Math.max(0, i - 1)], b = lutP[Math.min(LUTN, i + 1)];
      lutT[i].subVectors(b, a).normalize();
    }
  }
  function sample(u, outP, outT) {
    const f = clamp(u) * LUTN;
    const i = Math.min(LUTN - 1, Math.floor(f));
    const t = f - i;
    outP.lerpVectors(lutP[i], lutP[i + 1], t);
    outT.lerpVectors(lutT[i], lutT[i + 1], t).normalize();
  }

  let lastScramble = 0;
  function updateRibbon(q, time) {
    const show = q > 0.001 && q < 0.999;
    glyphs.visible = show;
    // bubble: lift, then hand over to glyphs
    const lift = ss(0.0, 0.24, q);
    const handover = ss(0.17, 0.34, q);
    bubble.visible = q > 0.001 && handover < 0.999;
    bubbleMat.opacity = q > 0.001 ? 1 - handover : 0;
    bubble.position.set(bubbleHome.x + lift * 0.06, bubbleHome.y + lift * 0.05, bubbleHome.z + lift * 0.42);
    bubble.rotation.set(-0.12 * lift, 0.2 * lift, 0.03 * lift);
    bubble.scale.setScalar(1 + 0.1 * lift);
    bshadowMat.opacity = q > 0.001 ? 0.55 * lift * (1 - ss(0.3, 0.7, q)) : 0;
    bshadow.position.x = bubbleHome.x + lift * 0.12;
    bshadow.position.y = bubbleHome.y - lift * 0.1;
    bshadow.scale.setScalar(1 + lift * 0.25);
    if (!show) return;

    phone.updateMatrixWorld(true);
    buildCurve();
    bubble.getWorldQuaternion(qGrid);
    const th0 = clamp((q - 0.3) / 0.7);
    const head = (1 + LR) * (th0 * th0 * 0.35 + th0 * 0.65);
    const gridScale = gridLocal.cell * (1 + 0.1 * lift);
    const ribScale = isPhone ? 0.12 : 0.14;

    if (time - lastScramble > 0.07) {
      lastScramble = time;
      for (let k = 0; k < N / 6; k++) aGlyph[(rand() * N) | 0] = (rand() * 64) | 0;
      glyphAttr.needsUpdate = true;
    }

    for (let i = 0; i < N; i++) {
      const c = Math.floor(i / R), r = i % R;
      const s = head - (c / COLS) * LR;
      gridW.copy(gridLocal[i]);
      bubble.localToWorld(gridW);
      const w = ss(-0.07, 0.03, s);
      const u = clamp(s);
      sample(u, tmpV, Z); // Z temporarily holds the tangent
      B.crossVectors(Z, up).normalize();
      Nn.crossVectors(B, Z).normalize();
      const th = u * (isPhone ? 5.2 : 6.4) + 0.4 + Math.sin(time * 0.8 + u * 5) * 0.12;
      L.copy(B).multiplyScalar(Math.cos(th)).addScaledVector(Nn, Math.sin(th));
      const spread = ss(0, 0.12, u);
      tmpV.addScaledVector(L, across(r) * (0.3 + 0.7 * spread));
      tmpV.addScaledVector(Nn, Math.sin(time * 1.1 + u * 9 + r) * 0.03 * spread);
      tmpV2.crossVectors(Z, L).normalize();
      mBasis.makeBasis(Z, L, tmpV2);
      qRib.setFromRotationMatrix(mBasis);

      const e = w * w * (3 - 2 * w);
      sVec.lerpVectors(gridW, tmpV, e);
      qOut.slerpQuaternions(qGrid, qRib, e);
      const sc = mix(gridScale, ribScale * (1 + 0.35 * ss(0.05, 0.5, u)), e);
      const alpha = s > 1.0 ? 0 : (s < 0 ? handover : 1 - ss(0.82, 1.0, s));
      tmpV2.set(sc, sc, sc);
      mOut.compose(sVec, qOut, tmpV2);
      glyphs.setMatrixAt(i, mOut);
      aAlpha[i] = alpha;
    }
    glyphs.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  /* ----- screen state ----- */
  const shown = [1, 0, 0, 0];
  let typed = 0;
  let status4 = 'clock';
  let lastKey = '';
  function repaintScreen() {
    const qs = shown.map((v) => Math.round(v * 30) / 30);
    const tk = Math.round(typed * MESSAGES[3].text.length);
    const keyS = qs.join(',') + '|' + tk + '|' + status4;
    if (keyS === lastKey) return;
    lastKey = keyS;
    paint(sctx, K, boxes, { shown: qs, typed, status4 }, logo);
    screenTex.needsUpdate = true;
  }

  /* ----- sizing ----- */
  let aspect = 1, sizeKey = '';
  function resize() {
    isPhone = phoneMQ.matches;
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2);
    // reallocating the drawing buffer is a synchronous GPU call: only do it when the size really changed
    const key = w + 'x' + h + '@' + dpr;
    if (key !== sizeKey) { sizeKey = key; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  /* ----- applying a pose ----- */
  function applyPose(o) {
    const xf = isPhone ? 1 : clamp(aspect / 1.6, 0.5, 1);
    phone.position.set(o.x * xf, o.y, o.z);
    phone.rotation.set(o.rx, o.ry, o.rz, 'YXZ');
    phone.scale.setScalar(o.s);
    const bottom = o.y - (PH / 2) * o.s;
    const gap = bottom - FLOOR;
    const k = gap < -0.05 ? 0 : clamp(1 - gap / 1.8);
    const wide = (PW * Math.abs(Math.cos(o.ry)) + DEPTH * 4 * Math.abs(Math.sin(o.ry))) * o.s;
    shadow.position.set(o.x * xf, FLOOR, o.z);
    shadow.scale.set(wide * 1.25 + 0.35, 0.6 * o.s, 1);
    shadowMat.opacity = 0.55 * k;
    halo.position.set(o.x * xf + 0.2, o.y * 0.6 + 0.4, -2.2);
    glassSheenTex.offset.set(o.ry * 0.55 - 0.1, 0);
  }

  /* ----- the film ----- */
  let pTarget = 0, enterTarget = 0, pShown = 0, enterShown = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onMove = (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  if (fine) addEventListener('pointermove', onMove, { passive: true });
  let lastX = null, bank = 0, time = 0;

  function draw(dt, still) {
    if (still) { pShown = pTarget; enterShown = enterTarget; }
    else {
      pShown = damp(pShown, pTarget, 7, dt);
      if (Math.abs(pShown - pTarget) < 0.0004) pShown = pTarget;
      enterShown = damp(enterShown, enterTarget, 9, dt);
      time += dt;
    }

    const o = poseAt(isPhone ? POSES.phone : POSES.desk, pShown);
    // flow (touch): the copy sits below the stage, so the phone is centred in it instead of sitting low
    if (isFlow() && isPhone) { o.y += 0.78; o.s *= 1.04; }
    // turn in from edge-on while the section scrolls into view
    const ie = easeOutCubic(enterShown);
    o.ry += (-Math.PI / 2 + 0.25 - o.ry) * (1 - ie);
    o.y += -0.5 * (1 - ie);
    if (!still) {
      pointer.x = damp(pointer.x, pointer.tx, 3.5, dt);
      pointer.y = damp(pointer.y, pointer.ty, 3.5, dt);
      o.y += Math.sin(time * 0.9) * 0.025;
      o.rz += Math.sin(time * 0.7) * 0.008;
      o.ry += pointer.x * 0.07;
      o.rx += pointer.y * 0.045;
      // bank into lateral moves
      const vx = dt > 0 && lastX !== null ? (o.x - lastX) / dt : 0;
      lastX = o.x;
      bank = damp(bank, clamp(vx * 0.05, -0.18, 0.18), 6, dt);
      o.ry += bank;
      o.rz -= bank * 0.35;
    }
    applyPose(o);

    // messages
    const target = MSG_AT.map((t, i) => (i === 0 || pShown > t ? 1 : 0));
    for (let i = 1; i < 4; i++) shown[i] = still || Math.abs(target[i] - shown[i]) < 0.004 ? target[i] : damp(shown[i], target[i], 9, dt);
    typed = clamp((pShown - TYPE_AT[0]) / (TYPE_AT[1] - TYPE_AT[0]));
    const q = clamp((pShown - RIBBON_AT[0]) / (RIBBON_AT[1] - RIBBON_AT[0]));
    status4 = q >= 0.95 ? 'double' : 'clock';
    repaintScreen();
    updateRibbon(q, time);

    // the coloured rims drift slowly around the frame
    const la = time * 0.3;
    rimV.position.set(Math.cos(la) * 6, 2.5 + Math.sin(la * 0.7) * 1.8, -4.5);
    rimB.position.set(-Math.cos(la * 0.8) * 6, -1 + Math.sin(la * 0.9) * 1.6, -4);

    renderer.render(scene, camera);
    if (opt.onFrame) opt.onFrame(pShown);
  }

  let raf = 0, last = 0, lost = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    draw(dt, false);
  }
  function start() { if (!raf && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function setProgress(p, enter = 1) { pTarget = clamp(p); enterTarget = clamp(enter); }

  const onLost = (e) => { e.preventDefault(); lost = true; stop(); opt.onLost && opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function dispose() {
    stop();
    removeEventListener('pointermove', onMove);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); });
    });
    envTex.dispose(); atlas.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    S = null;
  }

  await yieldTask();
  resize();
  await yieldTask();
  repaintScreen();
  await yieldTask();
  applyPose(poseAt(isPhone ? POSES.phone : POSES.desk, 0));
  await warm(renderer, scene, camera);
  const api = {
    start, stop, setProgress, dispose, resize,
  };
  S = { api };
  return api;
}

export function start() { S && S.api.start(); }
export function stop() { S && S.api.stop(); }
export function setProgress(p, e) { S && S.api.setProgress(p, e); }
export function dispose() { S && S.api.dispose(); }
