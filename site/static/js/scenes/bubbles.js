// SHIFROM "Bubbles": clay chat bubbles that float, bump, wobble, seal, line up and reroute
// (from the round-2 Bubbles prototype). Physics runs in stage pixels (origin at the stage centre, y up).
// Contract: mount(canvas, opt) -> start() / stop() / setProgress(u) / dispose(),
//   u = how far the section has scrolled past the top of the viewport, in screens (negative while entering).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { yieldTask, warm } from './yield.js?v=c5724892';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- geometry ----------
const B = 0.62;  // body half height (geometry units)
const C = 0.44;  // body half depth (the puff)
const ASPECTS = [0.9, 1.16, 1.48]; // body half widths

function bodyGeometry(a, b, c, seg) {
  const n = 3.4, m = 2.1;
  const g = new THREE.SphereGeometry(1, Math.round(seg * 1.5), seg);
  g.deleteAttribute('uv');
  const p = g.attributes.position, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    let lo = 0, hi = 3;
    for (let k = 0; k < 30; k++) {
      const t = (lo + hi) / 2;
      const f = Math.pow(t * Math.abs(dx) / a, n) + Math.pow(t * Math.abs(dy) / b, n) + Math.pow(t * Math.abs(dz) / c, m);
      if (f > 1) hi = t; else lo = t;
    }
    const t = (lo + hi) / 2;
    const x = dx * t, y = dy * t, z = dz * t;
    p.setXYZ(i, x, y, z);
    const gx = Math.sign(x) * n * Math.pow(Math.abs(x) / a, n - 1) / a;
    const gy = Math.sign(y) * n * Math.pow(Math.abs(y) / b, n - 1) / b;
    const gz = Math.sign(z) * m * Math.pow(Math.abs(z) / c, m - 1) / c;
    const l = Math.hypot(gx, gy, gz) || 1;
    nr.setXYZ(i, gx / l, gy / l, gz / l);
  }
  return g;
}

function tailGeometry(a, b, side) {
  let g = new THREE.SphereGeometry(1, 28, 18);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const u = new THREE.Vector3(-side * 0.85, -1, 0).normalize();
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.max(0, v.dot(u));
    v.addScaledVector(u, k * k * 0.9);
    v.set(v.x * 0.27, v.y * 0.25, v.z * 0.27);
    v.x += -side * (a - 0.27);
    v.y += -(b - 0.25);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

async function makeBubbleGeos(seg) {
  const out = {};
  for (let ai = 0; ai < ASPECTS.length; ai++) {
    const body = bodyGeometry(ASPECTS[ai], B, C, seg);   // the same body serves both sides
    await yieldTask();
    for (const side of [1, -1]) {
      const tail = tailGeometry(ASPECTS[ai], B, side);
      out[ai + ':' + side] = mergeGeometries([body, tail]);
    }
    body.dispose();
    await yieldTask();
  }
  return out;
}

function shadowTexture() {
  const s = 128, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  // alphaMap reads the green channel, so paint an opaque grey falloff on black
  x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
  const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  [[0, 1], [0.2, 0.78], [0.4, 0.42], [0.6, 0.16], [0.8, 0.04], [1, 0]].forEach(([o, a]) => { const v = Math.round(a * 255); gr.addColorStop(o, `rgb(${v},${v},${v})`); });
  x.fillStyle = gr; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------- roster ----------
// [colour, aspect index, side (1 = incoming, tail left; -1 = outgoing, tail right), hero height px]
const ROSTER_DESKTOP = [
  ['pearl', 2, 1, 214], ['blue', 1, -1, 188], ['pearl', 0, 1, 150], ['lilac', 1, 1, 166],
  ['pearl', 1, 1, 128], ['blue', 0, -1, 140], ['pearl', 2, 1, 118], ['pearl', 0, 1, 100],
  ['blue', 2, -1, 112], ['pearl', 1, 1, 136], ['pearl', 0, 1, 92],
];
const ROSTER_PHONE = [
  ['pearl', 1, 1, 118], ['blue', 0, -1, 108], ['lilac', 0, 1, 92], ['pearl', 0, 1, 98],
  ['blue', 0, -1, 84], ['pearl', 0, 1, 76], ['pearl', 1, 1, 88],
];
// conversation order, bottom to top, as indices into the roster
const CONVO_DESKTOP = [4, 5, 0, 1, 2, 8, 3, 6, 9, 7, 10];
const CONVO_PHONE = [3, 4, 0, 1, 2, 5, 6];

// ---------- scroll choreography (in screens past the section top) ----------
// seal beat pinned 0 .. 1.2, route beat pinned 2.2 .. 3.2 (see the section heights in site.css)
const PHASE = {
  k1: [0.42, 0.98],        // the cluster lines up into a conversation
  seal: [0.7, 0.45],       // the conversation seals top to bottom (start, length)
  k2: [1.62, 2.24],        // the conversation becomes a stream on the direct route (once the route copy has risen)
  re: [2.3, 2.82],         // the block drops, the stream takes the REALITY bend
};
const ALT = [0.75, 1.1];   // the standby routes dip below the block (fractions of the bend height)

let S = null;

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const isPhone = !!opt.phone;
  const calm = !!opt.calm;         // reduced motion: no float, no fly-away, seals fade in place
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rand = mulberry32(isPhone ? 7 : 11);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  });
  // production: no synchronous shader-log queries on a program's first use (they stall the main thread)
  renderer.debug.checkShaderErrors = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0xF4F3F8, 1);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;
  await yieldTask();
  pmrem.dispose();

  const FOV = 30, CAMZ = 18, BACKZ = -7;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMZ);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0ff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-4, 8, 10);
  scene.add(key);
  const magenta = new THREE.PointLight(0xff38e8, 90, 0, 2);
  const blue = new THREE.PointLight(0x2f62ff, 110, 0, 2);
  const flash = new THREE.PointLight(0xc04dff, 0, 0, 2);
  scene.add(magenta, blue, flash);

  // ---------- backdrop: the page ground, with the coloured light spilling on it ----------
  const backMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uM: { value: new THREE.Vector2(0.3, 0.6) },
      uB: { value: new THREE.Vector2(0.7, 0.4) },
      uMI: { value: 0.0 }, uBI: { value: 0.0 },
      uR: { value: 0.5 },
    },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec2 uRes, uM, uB; uniform float uMI, uBI, uR;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        float asp = uRes.x / uRes.y;
        vec3 col = vec3(0.957, 0.953, 0.973);
        vec2 dm = (uv - uM) * vec2(asp, 1.0);
        vec2 db = (uv - uB) * vec2(asp, 1.0);
        float pm = exp(-dot(dm, dm) / (uR * uR));
        float pb = exp(-dot(db, db) / (uR * uR));
        col = mix(col, vec3(0.965, 0.835, 0.990), pm * uMI);
        col = mix(col, vec3(0.835, 0.870, 1.000), pb * uBI);
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backMat);
  back.position.z = BACKZ;
  back.renderOrder = -2;
  scene.add(back);

  // ---------- materials ----------
  const mats = {
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xF7F5FF, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.16, sheen: isPhone ? 0 : 0.4, sheenColor: 0xEBDDFF, sheenRoughness: 0.6 }),
    blue: new THREE.MeshPhysicalMaterial({ color: 0x3F58FF, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    lilac: new THREE.MeshPhysicalMaterial({ color: 0xDCCBFF, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.16 }),
  };
  const dotMats = {
    dark: new THREE.MeshPhysicalMaterial({ color: 0x2A2552, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    light: new THREE.MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
  const lockColor = { pearl: 0x5A3DFF, lilac: 0x4B2FE0, blue: 0xFFFFFF };
  const keyholeMat = new THREE.MeshBasicMaterial({ color: 0x1A1640 });

  const geos = await makeBubbleGeos(isPhone ? 34 : 46);
  const dotGeo = new THREE.SphereGeometry(0.105, 20, 14);
  const lockBodyGeo = new RoundedBoxGeometry(0.42, 0.34, 0.15, 3, 0.07);
  const lockShackleGeo = new THREE.TorusGeometry(0.12, 0.036, 10, 28, Math.PI);
  const keyholeGeo = new THREE.CircleGeometry(0.042, 16);
  const shadowTex = shadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);

  // ---------- bubbles ----------
  const roster = isPhone ? ROSTER_PHONE : ROSTER_DESKTOP;
  const convoOrder = isPhone ? CONVO_PHONE : CONVO_DESKTOP;
  const bubbles = roster.map(([col, ai, side, heroH], i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geos[ai + ':' + side], mats[col]);
    group.add(body);
    const face = new THREE.Group();
    group.add(face);
    const dots = [];
    for (let j = 0; j < 3; j++) {
      const d = new THREE.Mesh(dotGeo, col === 'blue' ? dotMats.light : dotMats.dark);
      d.position.set((j - 1) * 0.3, 0, C * 0.93);
      face.add(d); dots.push(d);
    }
    const lockMat = new THREE.MeshPhysicalMaterial({ color: lockColor[col], roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0 });
    const lock = new THREE.Group();
    const lb = new THREE.Mesh(lockBodyGeo, lockMat);
    const ls = new THREE.Mesh(lockShackleGeo, lockMat);
    ls.position.y = 0.17;
    const kh = new THREE.Mesh(keyholeGeo, col === 'blue' ? mats.blue : keyholeMat);
    kh.position.z = 0.077;
    lock.add(lb, ls, kh);
    lock.position.z = C + 0.03;
    lock.visible = false;
    face.add(lock);

    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x2B1E73, alphaMap: shadowTex, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
    shadow.renderOrder = -1;
    scene.add(shadow);
    scene.add(group);

    return {
      i, col, ai, side, heroH, group, body, face, dots, lock, lockMat, shadow,
      x: 0, y: 0, vx: 0, vy: 0, z: lerp(-1.6, 0.9, rand()), size: heroH,
      ph: rand() * Math.PI * 2, rot: rand() * 2 - 1,
      w: 0, wv: 0, rz: 0, rzv: 0,
      state: 'idle', st: 0, clickLock: 0, lockS: 0, lockV: 0, scrollSealed: false,
      sx: 0, sy: 0, hwS: 0, hhS: 0, convo: convoOrder.indexOf(i), u: 0, edge: 1,
    };
  });

  // ---------- route props ----------
  const blockMat = new THREE.MeshPhysicalMaterial({ color: 0x2B2843, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const block = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.16), blockMat);
  block.visible = false;
  scene.add(block);
  const blockShadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x2B1E73, alphaMap: shadowTex, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }));
  blockShadow.renderOrder = -1;
  scene.add(blockShadow);

  // dotted routes: the direct one (blocked), the REALITY bend (live), and two standby routes (Tor, REST)
  const TRAIL = isPhone ? 34 : 64;
  const trailGeo = new THREE.SphereGeometry(1, 10, 8);
  const oldTrail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xB4ABD6, toneMapped: false }), TRAIL);
  const newTrail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0x4A5BFF, toneMapped: false }), TRAIL);
  const altTrail = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xC7BFE6, toneMapped: false }), TRAIL * 2);
  oldTrail.frustumCulled = newTrail.frustumCulled = altTrail.frustumCulled = false;
  scene.add(oldTrail, newTrail, altTrail);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

  // ---------- layout (stage pixels) ----------
  const L = { vw: 1, vh: 1, wpp: 0.01 };
  function layout() {
    const vw = canvas.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    // reallocating the drawing buffer is a synchronous GPU call: skip it when the stage size did not change
    // (on touch the canvas moves between two stages of the same size)
    if (vw !== L.vw || vh !== L.vh) { L.vw = vw; L.vh = vh; renderer.setSize(L.vw, L.vh, false); }
    camera.aspect = L.vw / L.vh;
    camera.updateProjectionMatrix();
    L.visH = 2 * CAMZ * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    L.wpp = L.visH / L.vh;
    const bh = 2 * (CAMZ - BACKZ) * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    back.scale.set(bh * camera.aspect * 1.2, bh * 1.2, 1);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    backMat.uniforms.uRes.value.copy(db);
    // the seal copy, measured inside its pinned panel (the panel pins at the stage top)
    if (opt.copyEl && opt.copyPin) {
      const c = opt.copyEl.getBoundingClientRect(), p = opt.copyPin.getBoundingClientRect();
      L.copy = { x: c.left - p.left, y: c.top - p.top, w: c.width, h: c.height };
    } else L.copy = { x: -9999, y: -9999, w: 0, h: 0 };
    L.navB = opt.navH ? opt.navH() : 72;
    L.unit = isPhone ? 1 : clamp(Math.min(L.vw / 1440, L.vh / 900), 0.72, 1.25) * 0.94;
  }

  // stage (top-left, y down) -> centred (y up)
  const cx = (sx) => sx - L.vw / 2;
  const cy = (sy) => L.vh / 2 - sy;

  const S_convoSize = () => isPhone ? 60 : Math.round(clamp(L.vh * 0.1, 64, 100));
  function convoSlot(b) {
    const h = S_convoSize();
    const gap = isPhone ? 12 : 18;
    const colW = isPhone ? Math.min(L.vw - 40, 330) : clamp(L.vw * 0.34, 420, 580);
    const colX = isPhone ? 0 : clamp(L.vw * 0.17, 140, 320);
    const bottom = isPhone ? L.vh - 64 : L.vh * 0.5 + 3.4 * (h + gap);
    const k = b.convo;
    const w = h * (ASPECTS[b.ai] / B);
    const x = b.side === 1 ? colX - colW / 2 + w / 2 : colX + colW / 2 - w / 2;
    const syc = bottom - h / 2 - k * (h + gap);
    return { x, y: cy(syc), size: h };
  }

  // the route diagram (centred coords), u in 0..1 along it
  function routeParams() {
    return {
      y0: cy(L.vh * (isPhone ? 0.6 : L.vh < 520 ? 0.72 : 0.56)),   // short landscape screens: below the copy
      x0: -L.vw / 2 - (isPhone ? 90 : 170), x1: L.vw / 2 + (isPhone ? 90 : 170),
      xb: isPhone ? 0 : L.vw * 0.1,
      H: L.vh * (isPhone ? 0.18 : L.vh < 520 ? 0.15 : 0.2),
      sig: isPhone ? L.vw * 0.28 : clamp(L.vw * 0.13, 150, 260),
    };
  }
  function routePos(u, R, re) {
    const x = lerp(R.x0, R.x1, u);
    const g = Math.exp(-Math.pow((x - R.xb) / R.sig, 2));
    return { x, y: R.y0 + re * R.H * g };
  }

  // ---------- pointer (stage coordinates) ----------
  // declared before the listeners: the build yields between steps, so input can arrive mid-build
  let raf = 0, last = 0, simT = 0, lost = false;
  const ptr = { x: -9999, y: -9999, nx: 0, ny: 0, inside: false, down: null };
  let hovered = null;
  const interactive = (t) => t && t.closest && t.closest('a, button, summary, details, .nav, input, label, .menu-sheet');
  const toStage = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onMove = (e) => {
    if (!raf) return;
    const p = toStage(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = !interactive(e.target);
    ptr.nx = p.x / L.vw * 2 - 1; ptr.ny = p.y / L.vh * 2 - 1;
  };
  const onLeave = () => { ptr.x = ptr.y = -9999; };
  const onCancel = () => { ptr.down = null; ptr.x = ptr.y = -9999; };
  const onDown = (e) => {
    if (!raf && !calm) return;
    const p = toStage(e);
    ptr.down = interactive(e.target) ? null : { x: p.x, y: p.y, t: performance.now() };
    if (e.pointerType !== 'mouse') { ptr.x = p.x; ptr.y = p.y; ptr.inside = !!ptr.down; }
  };
  const onUp = (e) => {
    const d = ptr.down; ptr.down = null;
    if (!d) return;
    const p = toStage(e);
    if (Math.hypot(p.x - d.x, p.y - d.y) > 12 || performance.now() - d.t > 600) return;
    const b = pick(p.x, p.y);
    if (b) seal(b);
    if (e.pointerType !== 'mouse') { ptr.x = ptr.y = -9999; }
  };
  addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  addEventListener('pointercancel', onCancel, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });

  function pick(px, py) {
    let best = null;
    for (const b of bubbles) {
      if (b.state === 'flying') continue;
      const dx = (px - b.sx) / (b.hwS * 1.04), dy = (py - b.sy) / (b.hhS * 1.06);
      if (dx * dx + dy * dy < 1 && (!best || b.z > best.z)) best = b;
    }
    return best;
  }

  let K1 = 0; // line-up weight, exposed to seal()
  let calmUntil = 0;
  function seal(b) {
    if (b.state !== 'idle' || K1 > 0.3 || b.lockS > 0.5) return;
    if (calm) { b.clickLock = 1; calmUntil = performance.now() + 700; kickCalm(); return; }
    b.state = 'sealing'; b.st = 0; b.clickLock = 1;
    b.wv += 5.5; b.rzv += (b.side === 1 ? 1 : -1) * 2.2;
    flashAt = b; flashT = 0;
  }
  let flashAt = null, flashT = 1;

  function respawn(b, A) {
    b.state = 'idle'; b.st = 0; b.clickLock = 0; b.lockS = 0; b.lockV = 0;
    const nai = Math.floor(rand() * ASPECTS.length);
    b.ai = nai; b.body.geometry = geos[nai + ':' + b.side];
    b.x = A.x + (rand() * 2 - 1) * A.rx * 0.7;
    b.y = -L.vh / 2 - b.size * 0.8;
    b.vx = (A.x - b.x) * 0.4; b.vy = 520 + rand() * 160;
    b.w = 0; b.wv = -1.5;
  }

  // ---------- simulation ----------
  let time = 0;
  function anchor() {
    const c = L.copy;
    // flow (touch): the copy is above the stage, so the cluster owns the whole stage
    if (opt.flow) return {
      x: 0, y: 0, rx: L.vw * (isPhone ? 0.5 : 0.42), ry: L.vh * 0.4,
      copy: { x0: -1e5, x1: -1e5 + 1, y1: -1e5 + 1, y0: -1e5 },
      top: cy(10),
    };
    return isPhone ? {
      x: 0, y: cy(L.vh * 0.63), rx: L.vw * 0.52, ry: L.vh * 0.25,
      copy: { x0: cx(c.x - 10), x1: cx(c.x + c.w + 10), y1: L.vh, y0: cy(c.y + c.h + 10) },
      top: cy(L.navB),
    } : {
      x: cx(L.vw * 0.62), y: cy(L.vh * 0.53), rx: L.vw * 0.4, ry: L.vh * 0.4,
      copy: { x0: cx(c.x - 24), x1: cx(c.x + c.w + 24), y1: cy(c.y - 24), y0: cy(c.y + c.h + 24) },
      top: cy(L.navB),
    };
  }

  function boxPush(b, box, k, out) {
    // circle vs box, pushes the centre out of the box (centred coords; y0 < y1)
    const r = b.r;
    const nx = clamp(b.x, box.x0, box.x1), ny = clamp(b.y, box.y0, box.y1);
    let dx = b.x - nx, dy = b.y - ny;
    let d = Math.hypot(dx, dy);
    if (d === 0) { // centre inside the box: leave by the nearest side
      const l = b.x - box.x0, rr = box.x1 - b.x, bt = b.y - box.y0, tp = box.y1 - b.y;
      const m = Math.min(l, rr, bt, tp);
      if (m === l) { dx = -1; dy = 0; d = -l; } else if (m === rr) { dx = 1; dy = 0; d = -rr; }
      else if (m === bt) { dx = 0; dy = -1; d = -bt; } else { dx = 0; dy = 1; d = -tp; }
      out.ax += dx * k * (r - d); out.ay += dy * k * (r - d);
      return;
    }
    if (d < r) { out.ax += dx / d * k * (r - d); out.ay += dy / d * k * (r - d); }
  }

  const acc = { ax: 0, ay: 0 };
  function step(dt, St) {
    time += calm ? 0 : dt;
    const A = St.A;
    for (const b of bubbles) {
      const targetSize = lerp(lerp(b.heroH * St.unit, St.convoSize, St.k1), St.streamSize, St.k2);
      b.size = targetSize;
      const sc = b.size / (2 * B);
      b.hw = ASPECTS[b.ai] * sc; b.hh = B * sc;
      b.r = (b.hw * 0.62 + b.hh * 0.48);

      acc.ax = 0; acc.ay = 0;
      const wc = 1 - St.k1;

      if (b.state === 'flying') {
        b.st += dt;
        b.vy += (700 + b.st * 900) * dt;
        b.vx += Math.sin(time * 2 + b.ph) * 60 * dt;
        b.vx *= Math.exp(-1.2 * dt);
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y - b.size > L.vh / 2 + 40 || St.k1 > 0.05) respawn(b, A);
        continue;
      }
      if (b.state === 'sealing') {
        b.st += dt;
        if (b.st > 0.46) { b.state = 'flying'; b.st = 0; b.vy = Math.max(b.vy, 60); }
      }

      if (wc > 0) {
        const dx = b.x - A.x, dy = b.y - A.y;
        const e = Math.hypot(dx / A.rx, dy / A.ry);
        const k = 0.28 + 16 * Math.max(0, e - 0.82);
        acc.ax += -k * dx * wc; acc.ay += -k * dy * wc;
        if (!calm) {
          acc.ax += 16 * Math.sin(time * 0.37 + b.ph * 3.1) * wc;
          acc.ay += 16 * Math.cos(time * 0.29 + b.ph * 1.7) * wc;
        }
        const before = { ax: acc.ax, ay: acc.ay };
        acc.ax = 0; acc.ay = 0;
        boxPush(b, A.copy, 60, acc);
        acc.ax = before.ax + acc.ax * wc; acc.ay = before.ay + acc.ay * wc;
        const lim = A.top - b.hh * 0.85;
        if (b.y > lim) acc.ay -= 50 * (b.y - lim) * wc;
        const drag = 1.5 * wc;
        b.vx -= b.vx * drag * dt; b.vy -= b.vy * drag * dt;
      }
      if (St.k1 > 0) {
        const T = b.target;
        const Ks = 70, Cs = 15;
        acc.ax += (Ks * (T.x - b.x) + Cs * (T.vx - b.vx)) * St.k1;
        acc.ay += (Ks * (T.y - b.y) + Cs * (T.vy - b.vy)) * St.k1;
      }
      b.vx += acc.ax * dt; b.vy += acc.ay * dt;
      // speed limit keeps a fast scroll from flinging bubbles
      const sp = Math.hypot(b.vx, b.vy), maxV = 2400;
      if (sp > maxV) { b.vx *= maxV / sp; b.vy *= maxV / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.target && b.target.wrap && St.k2 > 0.5) { b.x = b.target.x; b.y = b.target.y; b.vx = b.target.vx; b.vy = b.target.vy; }
    }
    // collisions, softened as the line-up takes over
    const wc = 1 - St.k1;
    if (wc > 0.01) {
      for (let i = 0; i < bubbles.length; i++) {
        const a = bubbles[i]; if (a.state === 'flying') continue;
        for (let j = i + 1; j < bubbles.length; j++) {
          const c = bubbles[j]; if (c.state === 'flying') continue;
          const dx = c.x - a.x, dy = c.y - a.y;
          const dz = Math.abs(c.z - a.z);
          const rr = (a.r + c.r) * (dz > 1.6 ? 0.55 : 1);
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const ma = a.size * a.size, mc = c.size * c.size, mt = ma + mc;
          const ov = (rr - d) * wc;
          a.x -= nx * ov * (mc / mt); a.y -= ny * ov * (mc / mt);
          c.x += nx * ov * (ma / mt); c.y += ny * ov * (ma / mt);
          const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (vn < 0) {
            const jimp = -(1 + 0.45) * vn / mt * wc;
            a.vx -= jimp * mc * nx; a.vy -= jimp * mc * ny;
            c.vx += jimp * ma * nx; c.vy += jimp * ma * ny;
            if (!calm) { const hit = Math.min(1.2, -vn / 500); a.wv += hit * 0.9; c.wv += hit * 0.9; }
          }
        }
      }
    }
    // springs: wobble, roll, lock
    for (const b of bubbles) {
      b.wv += (-190 * b.w - 7 * b.wv) * dt; b.w += b.wv * dt;
      b.rzv += (-60 * b.rz - 6 * b.rzv) * dt; b.rz += b.rzv * dt;
      const lockT = Math.max(b.clickLock, St.seal[b.i] || 0);
      if (calm) { b.lockS += (lockT - b.lockS) * (1 - Math.exp(-14 * dt)); b.lockV = 0; continue; }
      if (lockT > 0.5 && !b.scrollSealed && b.clickLock === 0) { b.scrollSealed = true; b.wv += 3.6; }
      if (lockT < 0.5) b.scrollSealed = false;
      b.lockV += (260 * (lockT - b.lockS) - 20 * b.lockV) * dt; b.lockS += b.lockV * dt;
    }
  }

  // ---------- frame state from scroll ----------
  let U = 0;     // scroll position in screens past the section top
  function scrollState(u) {
    const still = calm;
    const k1 = still ? 0 : smooth(PHASE.k1[0], PHASE.k1[1], u);
    const k2 = still ? 0 : smooth(PHASE.k2[0], PHASE.k2[1], u);
    const re = still ? 0 : smooth(PHASE.re[0], PHASE.re[1], u);
    const n = bubbles.length;
    const seal = bubbles.map((b) => {
      if (still) return 0;
      const order = n - 1 - b.convo; // top of the conversation seals first
      const s0 = PHASE.seal[0] + (order / n) * PHASE.seal[1];
      return smooth(s0, s0 + 0.08, u);
    });
    return {
      k1, k2, re, seal, A: anchor(), unit: L.unit,
      convoSize: S_convoSize(),
      streamSize: isPhone ? 44 : Math.round(clamp(L.vh * 0.066, 46, 62)),
      R: routeParams(),
    };
  }

  const SPEED = isPhone ? 0.05 : 0.04;
  function computeTargets(St, t) {
    const n = bubbles.length;
    for (const b of bubbles) {
      const slot = convoSlot(b);
      let x = slot.x, y = slot.y, vx = 0, vy = 0, wrap = false;
      if (St.k2 > 0) {
        const u = ((b.convo / n) + t * SPEED) % 1;
        wrap = u < b.u - 0.5;
        b.u = u;
        const p = routePos(u, St.R, St.re);
        const p2 = routePos(Math.min(1, u + 0.001), St.R, St.re);
        const vel = (SPEED / 0.001);
        x = lerp(x, p.x, St.k2); y = lerp(y, p.y, St.k2);
        vx = (p2.x - p.x) * vel * St.k2; vy = (p2.y - p.y) * vel * St.k2;
        b.edge = smooth(0, 0.06, u) * smooth(1, 0.94, u);
      } else { b.edge = 1; }
      b.target = { x, y, vx, vy, wrap };
    }
  }

  // ---------- render mapping ----------
  const v3 = new THREE.Vector3();
  function place(St) {
    const wpp = L.wpp;
    let hov = null;
    for (const b of bubbles) {
      const zt = lerp(b.z, 0, Math.max(St.k1, 0));
      const persp = (CAMZ - zt) / CAMZ;
      const g = b.group;
      g.position.set(b.x * wpp * persp, b.y * wpp * persp, zt);
      const sc = (b.size / (2 * B)) * wpp * persp;
      const edge = lerp(1, b.edge, St.k2);
      const flyShrink = b.state === 'flying' ? lerp(1, 0.86, clamp(b.st * 1.5)) : 1;
      const s = sc * edge * flyShrink;
      const w = clamp(b.w, -0.35, 0.35);
      b.body.scale.set(s * (1 + w), s * (1 - w * 0.85), s * (1 + w * 0.2));
      b.face.scale.setScalar(s);
      b.face.scale.x *= 1 + w * 0.6; b.face.scale.y *= 1 - w * 0.5;
      const hero = 1 - St.k1;
      g.rotation.y = (Math.sin(time * 0.41 + b.ph) * 0.26 * hero) + 0.1 * St.k1 * (b.side === 1 ? 1 : -1) * (1 - St.k2);
      g.rotation.x = Math.cos(time * 0.33 + b.ph * 1.3) * 0.16 * hero;
      g.rotation.z = b.rz + Math.sin(time * 0.27 + b.ph) * 0.07 * hero + (b.state === 'flying' ? b.rot * b.st * 0.5 : 0);

      // typing dots, then the lock
      const L1 = clamp(b.lockS, 0, 1.3);
      for (let j = 0; j < 3; j++) {
        const d = b.dots[j];
        const pulse = calm ? 0 : Math.pow(Math.max(0, Math.sin(time * 5.2 - j * 0.8 + b.ph)), 2);
        const ds = (1 + 0.3 * pulse) * (1 - clamp(L1 * 2.2) * 0.8);
        d.scale.setScalar(ds);
        d.position.y = 0.07 * pulse;
        d.visible = L1 < 0.4;
      }
      b.lock.visible = L1 > 0.01;
      b.lockMat.opacity = clamp(L1 * 1.8);
      b.lock.scale.setScalar(calm ? 1 : 0.62 + 0.38 * L1);
      b.lock.position.y = 0.02 * (1 - clamp(L1));

      // soft shadow on the backdrop
      const bp = (CAMZ - BACKZ) / CAMZ;
      const sh = b.shadow;
      sh.position.set((b.x + b.size * 0.05) * wpp * bp, (b.y - b.size * 0.42) * wpp * bp, BACKZ + 0.05);
      sh.scale.set(b.size * (ASPECTS[b.ai] / B) * 1.7 * wpp * bp * edge, b.size * 1.15 * wpp * bp * edge, 1);
      sh.material.opacity = (b.state === 'flying' ? 0.2 * (1 - clamp(b.st * 2)) : 0.2) * lerp(1, 0.75, St.k1);

      // stage position for picking
      v3.copy(g.position).project(camera);
      b.sx = (v3.x * 0.5 + 0.5) * L.vw; b.sy = (-v3.y * 0.5 + 0.5) * L.vh;
      const ps = CAMZ / (CAMZ - zt);
      b.hwS = (b.size / (2 * B)) * ASPECTS[b.ai] * ps * edge;
      b.hhS = b.size / 2 * ps * edge;
    }
    if (ptr.inside && ptr.x > -999) hov = pick(ptr.x, ptr.y);
    if (hov !== hovered) {
      if (!calm) {
        if (hov && fine) { hov.wv += 3.4; hov.rzv += (ptr.x < hov.sx ? -1 : 1) * 1.4; }
        if (!fine && hov) { hov.wv += 2.4; }
      }
      hovered = hov;
      document.body.style.cursor = hov && fine && K1 < 0.3 ? 'pointer' : '';
    }
  }

  // ---------- the route diagram and its labels ----------
  const labels = opt.labels || {};
  const labState = {};
  function putLabel(name, x, y, a, align) {
    const el = labels[name];
    if (!el) return;
    const sx = Math.round(x + L.vw / 2), sy = Math.round(L.vh / 2 - y);
    const o = Math.round(a * 100) / 100;
    const k = sx + ':' + sy + ':' + o;
    if (labState[name] === k) return;
    labState[name] = k;
    el.style.transform = `translate3d(${sx}px, ${sy}px, 0) ${align}`;
    el.style.opacity = o;
    el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
  }

  function placeRoute(St) {
    const wpp = L.wpp, R = St.R;
    const vis = St.k2 > 0.01;
    // the blocking slab drops into the direct route
    const rb = easeOut(St.re);
    block.visible = vis && St.re > 0.001;
    const bw = isPhone ? 44 : 62, bhgt = R.H * 0.8;
    const by = R.y0 + bhgt * 0.08 + (1 - rb) * L.vh * 0.7;
    block.position.set(R.xb * wpp, by * wpp, -0.2);
    block.scale.set(bw * wpp, bhgt * wpp, 1.1);
    block.rotation.set(0.08, -0.25, 0);
    const bp = (CAMZ - BACKZ) / CAMZ;
    blockShadow.visible = block.visible;
    blockShadow.position.set(R.xb * wpp * bp, (by - bhgt * 0.42) * wpp * bp, BACKZ + 0.05);
    blockShadow.scale.set(bw * 2.4 * wpp * bp, bhgt * 0.5 * wpp * bp, 1);
    blockShadow.material.opacity = 0.2 * rb;

    const dotR = (isPhone ? 2.6 : 3.6) * wpp;
    const altA = vis ? St.k2 * smooth(0.35, 1, St.re) : 0;
    for (let i = 0; i < TRAIL; i++) {
      const u = (i + 0.5) / TRAIL;
      const x = lerp(-L.vw / 2 + 12, L.vw / 2 - 12, u);
      const g = Math.exp(-Math.pow((x - R.xb) / R.sig, 2));
      const near = Math.abs(x - R.xb) < R.sig * 0.55;
      const oldS = vis ? St.k2 * (near ? 1 - rb : 1) * lerp(1, 0.75, St.re) : 0;
      tmpS.setScalar(dotR * Math.max(oldS, 0.0001));
      tmpP.set(x * wpp, R.y0 * wpp, -0.6);
      tmpM.compose(tmpP, tmpQ, tmpS); oldTrail.setMatrixAt(i, tmpM);
      const ny = R.y0 + R.H * g;
      const reveal = clamp(St.re * 1.25 - u * 0.25);
      const newS = vis ? St.k2 * reveal * (g > 0.02 ? 1 : 0) : 0;
      tmpS.setScalar(dotR * 1.1 * Math.max(newS, 0.0001));
      tmpP.set(x * wpp, ny * wpp, -0.6);
      tmpM.compose(tmpP, tmpQ, tmpS); newTrail.setMatrixAt(i, tmpM);
      // standby routes: fainter and smaller, they part from the direct route only around the block
      for (let k = 0; k < 2; k++) {
        const ay = R.y0 - ALT[k] * R.H * g * smooth(0, 1, St.re);
        const as = altA * 0.78 * smooth(0.1, 0.32, g);   // they only part from the direct line around the block
        tmpS.setScalar(dotR * Math.max(as, 0.0001));
        tmpP.set(x * wpp, ay * wpp, -0.62);
        tmpM.compose(tmpP, tmpQ, tmpS); altTrail.setMatrixAt(i + k * TRAIL, tmpM);
      }
    }
    oldTrail.instanceMatrix.needsUpdate = true;
    newTrail.instanceMatrix.needsUpdate = true;
    altTrail.instanceMatrix.needsUpdate = true;
    oldTrail.visible = newTrail.visible = vis;
    altTrail.visible = vis && altA > 0.001;

    // labels in the scene: the blocked direct route, the live bend, the two standby routes
    const gapY = isPhone ? 8 : 10;
    putLabel('wss', R.xb - bw / 2 - (isPhone ? 18 : 22), R.y0 - gapY, vis ? smooth(0.3, 0.8, St.re) : 0, 'translate(-100%, 0)');
    putLabel('reality', R.xb, R.y0 + R.H + St.streamSize * 0.5 + (isPhone ? 8 : 12), vis ? smooth(0.55, 1, St.re) : 0, 'translate(-50%, -100%)');
    putLabel('tor', R.xb, R.y0 - ALT[0] * R.H - gapY, altA * smooth(0.6, 1, St.re), 'translate(-50%, 0)');
    putLabel('rest', R.xb, R.y0 - ALT[1] * R.H - gapY, altA * smooth(0.6, 1, St.re), 'translate(-50%, 0)');
  }

  function placeLights(St, dt) {
    const wpp = L.wpp, A = St.A;
    let fx = A.x, fy = A.y, spread = A.rx;
    if (St.k1 > 0) {
      const colX = isPhone ? 0 : clamp(L.vw * 0.17, 140, 320);
      fx = lerp(fx, colX, St.k1); fy = lerp(fy, 0, St.k1); spread = lerp(spread, isPhone ? 200 : 360, St.k1);
    }
    if (St.k2 > 0) { fx = lerp(fx, St.R.xb, St.k2); fy = lerp(fy, St.R.y0 + St.R.H * 0.4, St.k2); spread = lerp(spread, L.vw * 0.4, St.k2); }
    const o = time * 0.22;
    const mx = fx - spread * (0.85 + 0.12 * Math.sin(o)), my = fy + spread * 0.32 * (1 + 0.3 * Math.cos(o * 1.3));
    const bx = fx + spread * (0.85 + 0.12 * Math.cos(o * 0.8)), by = fy - spread * 0.22 * (1 + 0.3 * Math.sin(o));
    magenta.position.set(mx * wpp, my * wpp, 4.2);
    blue.position.set(bx * wpp, by * wpp, 4.6);
    const toUv = (x, y) => new THREE.Vector2((x + L.vw / 2) / L.vw, (y + L.vh / 2) / L.vh);
    backMat.uniforms.uM.value.copy(toUv(mx * 0.9, my * 0.9));
    backMat.uniforms.uB.value.copy(toUv(bx * 0.9, by * 0.9));
    backMat.uniforms.uMI.value = 0.55; backMat.uniforms.uBI.value = 0.6;
    backMat.uniforms.uR.value = isPhone ? 0.42 : 0.36;
    // seal flash
    if (flashAt && flashT < 1) {
      flashT += dt / 0.55;
      flash.position.set(flashAt.group.position.x, flashAt.group.position.y, flashAt.group.position.z + 2.2);
      flash.intensity = 70 * Math.pow(1 - clamp(flashT), 2);
    } else flash.intensity = 0;
    // a whisper of camera parallax on desktop
    if (fine && !calm) {
      camera.position.x += ((ptr.nx || 0) * 0.28 - camera.position.x) * Math.min(1, dt * 2.5);
      camera.position.y += (-(ptr.ny || 0) * 0.16 - camera.position.y) * Math.min(1, dt * 2.5);
      camera.lookAt(0, 0, 0);
    }
  }

  // ---------- init: start from a settled cluster so the hand-off from the still is seamless ----------
  await yieldTask();
  layout();
  await yieldTask();
  {
    const S0 = scrollState(0);
    const A = S0.A;
    bubbles.forEach((b, i) => {
      const ang = (i / bubbles.length) * Math.PI * 2 + rand() * 0.6;
      b.x = A.x + Math.cos(ang) * A.rx * (0.45 + rand() * 0.4);
      b.y = A.y + Math.sin(ang) * A.ry * (0.45 + rand() * 0.4);
    });
    computeTargets(S0, 0);
    for (let k = 0; k < 420; k++) { step(1 / 60, S0); if (k % 70 === 69) await yieldTask(); }
  }

  function advance(dt) {
    const St = scrollState(U);
    K1 = St.k1;
    let left = dt;
    while (left > 1e-4) {
      const h = Math.min(1 / 60, left);
      simT += calm ? 0 : h;
      computeTargets(St, simT);
      step(h, St);
      left -= h;
    }
    placeLights(St, dt);
    place(St);
    placeRoute(St);
    renderer.render(scene, camera);
    if (opt.onFrame) opt.onFrame(St);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    advance(dt);
    // calm mode renders only while a seal is fading in
    if (calm && now > calmUntil) { cancelAnimationFrame(raf); raf = 0; }
  }
  function start() {
    if (raf || lost) return;
    if (calm) { advance(0); return; }
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function kickCalm() { if (!raf && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (hovered) { hovered = null; document.body.style.cursor = ''; }
  }
  function setProgress(u) { U = u; }
  function resize() { layout(); if (!raf) advance(0); }

  const onLost = (e) => { e.preventDefault(); lost = true; stop(); opt.onLost && opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function dispose() {
    stop();
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener('pointercancel', onCancel);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    Object.values(geos).forEach((g) => g.dispose());
    shadowTex.dispose(); envTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    S = null;
  }

  placeLights(scrollState(0), 0); place(scrollState(0)); placeRoute(scrollState(0));
  await warm(renderer, scene, camera);
  await yieldTask();
  advance(0);
  const api = {
    start, stop, setProgress, dispose, resize,
  };
  S = { api };
  return api;
}

export function start() { S && S.api.start(); }
export function stop() { S && S.api.stop(); }
export function setProgress(u) { S && S.api.setProgress(u); }
export function dispose() { S && S.api.dispose(); }
