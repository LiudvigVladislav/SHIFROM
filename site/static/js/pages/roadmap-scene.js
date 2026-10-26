// SHIFROM roadmap: the track graph. Four lanes by area on one plane; the x axis is stage, not time:
// Shipped | Now · Alpha 2 | In progress | Planned | Beta | v1.0. One column per item, in ledger order.
//   shipped  = solid node on a lit, continuous line
//   progress = node with a slowly turning segmented arc, on a signal-blue line from the Now plane
//   planned  = hollow outline node on a dashed, dimmed line
// Labels are DOM, projected from the scene each frame (written only when they change).
// Contract: mount(canvas, opt) -> { start, stop, setProgress({ t, ov, end }), setHot(i), resize, dispose }
//   t   = the ledger row at the reading line (continuous index)
//   ov  = 1 while the opening is up (whole graph in perspective), 0 once the ledger is being read
//   end = 0 .. 1 as "Why iOS comes next" arrives (the camera settles on the focus node)
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

// the graph lies on the ground plane (x = stage, z = lane); the Now plane and the gates stand up through it
const LANES = [
  { key: 'crypto', name: 'Cryptography', z: -2.1 },
  { key: 'transport', name: 'Transport', z: -0.7 },
  { key: 'messaging', name: 'Messaging', z: 0.7 },
  { key: 'platform', name: 'Platform', z: 2.1 },
];
const BACK = -2.9, FRONT = 2.9, AXIS = 3.3, H = 2.5;   // ground extent, the stage axis, plane height (world units)
const SW = 1.3;                                          // one column per item
const C = { ink: 0xf4f2ff, ink2: 0xc4c0e2, ink3: 0x9a96bd, sig: 0x7c88ff, sig2: 0xb9a6ff, night: 0x05050a };

// camera poses
const POSE = {
  read: { back: 13.5, up: 7.4, lead: 1.4, swing: 2.4, lookZ: 0.3 },     // beside the reading line
  open: { cam: [-9.8, 18.2, 24.6], look: [13.7, 0, 1.0] },                 // the whole road, Shipped to v1.0, in perspective
  openPhone: { cam: [-6.5, 21, 25], look: [12.6, 0, 0.6] },
  end: { back: 11, up: 6.2, lead: 1.0, swing: 2.2, lookZ: 1.0 },         // why iOS: on the focus node
  // phones: the band is short and wide, so the camera stands higher (the lanes spread down the band) and closer
  readPhone: { back: 8.4, up: 9.6, lead: 0.9, swing: -0.25, lookZ: 1.25 },
  endPhone: { back: 7.8, up: 8.8, lead: 0.7, swing: -0.2, lookZ: 1.5 },
};
const REVEAL = 1.9;   // seconds for the draw-on sweep

// UI strings drawn in the scene; the page passes its own language as opt.t (EN is the default)
const T_EN = {
  lanes: { crypto: 'Cryptography', transport: 'Transport', messaging: 'Messaging', platform: 'Platform' },
  zones: { shipped: 'Shipped', progress: 'In progress', planned: 'Planned' },
  now: 'Now · Alpha 2', beta: 'Beta', betaSub: 'Public builds land here', v1: 'v1.0', v1Sub: 'Independent security audit first',
};

let S = null;

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const items = opt.items || [];
  const T = Object.assign({}, T_EN, opt.t || {});
  const n = items.length;
  const focus = opt.focus != null ? opt.focus : -1;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const phoneMQ = matchMedia('(max-width: 700px)');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(C.night, 1);
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(C.night, 14, 40);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

  // ---------- layout along the stage axis ----------
  const lane = Object.fromEntries(LANES.map((l) => [l.key, l]));
  const xs = new Array(n);
  const by = (s) => items.map((it, i) => (it.status === s ? i : -1)).filter((i) => i >= 0);
  const shipped = by('shipped'), progress = by('progress'), planned = by('planned');
  shipped.forEach((i, k) => { xs[i] = k * SW; });
  const nowX = (shipped.length ? (shipped.length - 1) * SW : 0) + 1.0;
  progress.forEach((i, k) => { xs[i] = nowX + 0.95 + k * SW; });
  const plannedStart = (progress.length ? xs[progress[progress.length - 1]] : nowX) + 1.75;
  planned.forEach((i, k) => { xs[i] = plannedStart + k * SW; });
  const lastX = Math.max(...xs, nowX);
  const betaX = lastX + 1.75, v1X = betaX + 2.0;
  const X0 = -1.5, X1 = v1X + 1.3;
  const nodeZ = (i) => lane[items[i].area] ? lane[items[i].area].z : 0;
  const zones = [
    [T.zones.shipped, shipped], [T.zones.progress, progress], [T.zones.planned, planned],
  ].filter(([, a]) => a.length).map(([name, a]) => ({ name, a: xs[a[0]] - 0.35, b: xs[a[a.length - 1]] + 0.35 }));

  // ---------- materials ----------
  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), X0 - 1);
  const lineMats = [];
  const lineMat = (color, width, opacity, extra = {}) => {
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false, worldUnits: false, ...extra });
    m.fog = true;
    m.clippingPlanes = [clip];
    lineMats.push(m);
    return m;
  };
  const segs = (pairs, mat, dashed = false) => {
    const g = new LineSegmentsGeometry();
    g.setPositions(pairs.flat(2));
    const l = new LineSegments2(g, mat);
    if (dashed) l.computeLineDistances();
    l.frustumCulled = false;
    scene.add(l);
    return l;
  };
  const P = (x, z, h = 0) => [x, h, z];   // ground point

  // ---------- engineering ground: a faint dot grid on the plane ----------
  {
    const pts = [];
    for (let x = X0; x <= X1 + 1e-6; x += SW / 2) for (let z = BACK; z <= FRONT + 1e-6; z += 0.7) pts.push(x, -0.01, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.PointsMaterial({ color: C.ink, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.13, depthWrite: false });
    m.clippingPlanes = [clip];
    scene.add(new THREE.Points(g, m));
  }

  // ---------- lanes ----------
  segs(LANES.map((l) => [P(X0, l.z), P(X1, l.z)]), lineMat(C.ink, 1, 0.12));
  const lit = [], prog = [], dash = [];
  for (const l of LANES) {
    const nodes = items.map((it, i) => i).filter((i) => items[i].area === l.key).sort((a, b) => xs[a] - xs[b]);
    nodes.forEach((b, k) => {
      const a = k ? nodes[k - 1] : -1;
      const st = items[b].status;
      if (st === 'shipped') { if (a >= 0) lit.push([P(xs[a], l.z), P(xs[b], l.z)]); }
      else if (st === 'progress') {
        if (a >= 0 && items[a].status === 'shipped') { lit.push([P(xs[a], l.z), P(nowX, l.z)]); prog.push([P(nowX, l.z), P(xs[b], l.z)]); }
        else if (a >= 0) prog.push([P(xs[a], l.z), P(xs[b], l.z)]);
        else prog.push([P(nowX, l.z), P(xs[b], l.z)]);
      } else if (a >= 0) dash.push([P(xs[a], l.z), P(xs[b], l.z)]);
    });
  }
  if (lit.length) segs(lit, lineMat(C.ink, 2, 0.92));
  const flowMat = lineMat(0xffffff, 2, 0.75, { dashed: true, dashSize: 0.07, gapSize: 0.55 });
  if (prog.length) { segs(prog, lineMat(C.sig, 2, 0.9)); segs(prog, flowMat, true); }
  if (dash.length) segs(dash, lineMat(C.ink3, 1.5, 0.7, { dashed: true, dashSize: 0.09, gapSize: 0.08 }), true);
  // the stretch of its lane that leads into the focus node lights up at the end ("Why iOS comes next")
  let focusMat = null;
  if (focus >= 0 && items[focus]) {
    const fl = lane[items[focus].area];
    const prev = items.map((it, i) => i).filter((i) => items[i].area === items[focus].area && xs[i] < xs[focus]).sort((a, b) => xs[b] - xs[a])[0];
    if (fl && prev != null) {
      focusMat = lineMat(C.sig2, 2, 0, { dashed: true, dashSize: 0.09, gapSize: 0.08 });
      const l = segs([[P(xs[prev], fl.z, 0.002), P(xs[focus], fl.z, 0.002)]], focusMat, true);
      l.renderOrder = 2;
    }
  }

  // ---------- the stage axis: a baseline with a tick per item and a bracket per stage ----------
  {
    const ax = [];
    for (const z of zones) {
      ax.push([P(z.a, AXIS), P(z.b, AXIS)], [P(z.a, AXIS), P(z.a, AXIS - 0.14)], [P(z.b, AXIS), P(z.b, AXIS - 0.14)]);
    }
    for (let i = 0; i < n; i++) ax.push([P(xs[i], AXIS), P(xs[i], AXIS + 0.1)]);
    segs(ax, lineMat(C.ink3, 1, 0.55));
  }

  // ---------- the Now plane (sweeps in once) and the milestone gates ----------
  const nowGroup = new THREE.Group();
  const nowMats = [];
  scene.add(nowGroup);
  {
    const Z0 = BACK + 0.2, Z1 = FRONT - 0.2;   // the planes span the lanes
    const m = new LineMaterial({ color: C.sig2, linewidth: 1.5, transparent: true, opacity: 0.95, depthWrite: false });
    m.fog = true; lineMats.push(m);
    const e = new LineMaterial({ color: C.sig2, linewidth: 1, transparent: true, opacity: 0.45, depthWrite: false });
    e.fog = true; lineMats.push(e);
    const add = (pairs, mat) => { const g = new LineSegmentsGeometry(); g.setPositions(pairs.flat(2)); const l = new LineSegments2(g, mat); l.frustumCulled = false; nowGroup.add(l); };
    nowMats.push(m, e);
    add([[P(0, Z0), P(0, Z1)]], m);                                    // where the plane meets the ground
    add([[P(0, Z0, H), P(0, Z1, H)], [P(0, Z0), P(0, Z0, H)], [P(0, Z1), P(0, Z1, H)]], e);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, H), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(C.sig2) }, uK: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
        uniform float uK;
        void main(){ float a = uK * 0.085 * (1.0 - vUv.y * 0.75) * (0.55 + 0.45 * pow(1.0 - abs(vUv.x * 2.0 - 1.0), 0.6)); gl_FragColor = vec4(uColor, a); }`,
    }));
    sheet.rotation.y = Math.PI / 2;
    nowMats.push(sheet.material);
    sheet.position.set(0, H / 2, (Z0 + Z1) / 2);
    nowGroup.add(sheet);
    nowGroup.position.x = nowX;

    const gm = lineMat(C.ink3, 1, 0.5), gd = lineMat(C.ink3, 1, 0.75, { dashed: true, dashSize: 0.06, gapSize: 0.06 });
    for (const gx of [betaX, v1X]) {
      segs([[P(gx, Z0, H * 0.86), P(gx, Z1, H * 0.86)], [P(gx, Z0), P(gx, Z0, H * 0.86)], [P(gx, Z1), P(gx, Z1, H * 0.86)]], gm);
      segs([[P(gx, Z0), P(gx, Z1)]], gd, true);
    }
  }

  // ---------- nodes ----------
  const circle = (r) => new THREE.CircleGeometry(r, 48);
  const ring = (a, b) => new THREE.RingGeometry(a, b, 64);
  const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const nodes = items.map((it, i) => {
    const g = new THREE.Group();
    g.position.set(xs[i], 0.02, nodeZ(i));
    const mats = [];
    const mk = (geo, mat, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.z = z; mats.push(mat); g.add(m); return m; };
    let arc = null, ringMat = null;
    if (it.status === 'shipped') {
      mk(circle(0.17), basic(C.night));
      mk(circle(0.09), basic(C.ink), 0.002);
    } else if (it.status === 'progress') {
      mk(circle(0.2), basic(C.night));
      arc = new THREE.Group();
      const SEG = 12;
      for (let k = 0; k < SEG; k++) {
        const th = (k / SEG) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.RingGeometry(0.115, 0.145, 6, 1, th, (Math.PI * 2 / SEG) * 0.68), basic(C.sig, 0.12 + 0.88 * Math.pow(k / (SEG - 1), 1.6)));
        mats.push(m.material); m.material.userData.base = m.material.opacity;
        m.position.z = 0.002; arc.add(m);
      }
      g.add(arc);
      mk(circle(0.042), basic(C.sig), 0.003);
    } else {
      mk(circle(0.15), basic(C.night));
      ringMat = mk(ring(0.074, 0.094), basic(C.ink3), 0.002).material;
    }
    mats.forEach((m) => { if (m.userData.base == null) m.userData.base = m.opacity; });
    g.scale.setScalar(0.7);
    mats.forEach((m) => { m.opacity = 0; });
    g.renderOrder = 3;
    g.traverse((o) => { o.renderOrder = 3; });
    scene.add(g);
    return { i, g, mats, arc, ringMat, x: xs[i], z: nodeZ(i), settle: 0, sx: -9999, sy: -9999, r: 10, depth: 1 };
  });

  // the reticle that marks the row at the reading line, and the ring that marks a hovered (or the focus) node
  const reticle = new THREE.Group();
  {
    const h = 0.26, c = 0.085, pairs = [];
    const Q = (x, y) => [x, y, 0];   // reticle space (it faces the camera)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) pairs.push([Q(sx * h, sy * h), Q(sx * (h - c), sy * h)], [Q(sx * h, sy * h), Q(sx * h, sy * (h - c))]);
    const g = new LineSegmentsGeometry(); g.setPositions(pairs.flat(2));
    const m = new LineMaterial({ color: C.ink, linewidth: 1.25, transparent: true, opacity: 0, depthWrite: false });
    lineMats.push(m);
    const l = new LineSegments2(g, m); l.frustumCulled = false;
    reticle.add(l); reticle.userData.mat = m;
    reticle.renderOrder = 4; l.renderOrder = 4;
    scene.add(reticle);
  }
  const hotRing = new THREE.Mesh(ring(0.205, 0.222), basic(C.sig, 0));
  hotRing.renderOrder = 4;
  scene.add(hotRing);

  // ---------- labels (DOM) ----------
  const host = opt.labelsEl;
  const labels = [];
  const label = (html, cls, anchor, ax, ay, kind) => {
    if (!host) return null;
    const el = document.createElement('span');
    el.className = 'gl-lab ' + cls;
    el.innerHTML = html;
    host.appendChild(el);
    const L = { el, anchor: new THREE.Vector3(...anchor), ax, ay, kind, key: '', o: -1 };
    labels.push(L);
    return L;
  };
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // node labels alternate above and below their line, lane by lane, so neighbours never collide
  const laneCount = {};
  const nodeLabels = items.map((it, i) => {
    const k = laneCount[it.area] = (laneCount[it.area] || 0) + 1;
    const above = k % 2 === 1;
    const L = label(esc(it.name), 'is-node st-' + it.status, [xs[i], 0, nodeZ(i)], 0, above ? -100 : 0, 'node');
    if (L) { L.i = i; L.dy = above ? -22 : 22; L.dx = -10; }
    return L;
  });
  LANES.forEach((l) => { const L = label(esc(T.lanes[l.key] || l.name), 'is-lane', [X0, 0, l.z], 0, -100, 'lane'); if (L) { L.lane = l; L.dy = -9; } });
  zones.forEach((z) => { const L = label(esc(z.name), 'is-zone', [(z.a + z.b) / 2, 0, AXIS + 0.32], -50, 0, 'zone'); });
  // plane and gate labels hang from the top of each plane's far edge, set flush right against it
  const gateTop = (x, h) => [x, h, BACK + 0.2];
  // (flush left, except Beta, which sits flush right so it never meets the v1.0 label beside it)
  const gl = (html, cls, at, right) => { const L = label(html, cls + (right ? ' is-right' : ''), at, right ? -100 : 0, -100, 'gate'); if (L) { L.dx = right ? -8 : 8; L.dy = -6; } return L; };
  gl(esc(T.now), 'is-gate is-now', gateTop(nowX, H));
  gl(esc(T.beta) + '<small>' + esc(T.betaSub) + '</small>', 'is-gate', gateTop(betaX, H * 0.86), true);
  gl(esc(T.v1) + '<small>' + esc(T.v1Sub) + '</small>', 'is-gate', gateTop(v1X, H * 0.86));

  // ---------- layout ----------
  const L = { w: 1, h: 1, shift: 0.66, phone: false, zoom: 1, edge: 0 };
  const res = new THREE.Vector2();
  function layout() {
    L.w = canvas.clientWidth || innerWidth; L.h = canvas.clientHeight || innerHeight;
    L.phone = phoneMQ.matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.phone ? 1.5 : 2));
    renderer.setSize(L.w, L.h, false);
    L.edge = opt.edge ? opt.edge() : 0;            // where the graph area starts (the reading column ends)
    L.shift = clamp((L.edge + L.w) / 2 / L.w + (L.phone ? 0 : 0.02), 0.5, 0.78);
    const fullW = L.w * 2 * L.shift;
    camera.aspect = fullW / L.h;
    camera.setViewOffset(fullW, L.h, 0, 0, L.w, L.h);
    camera.updateProjectionMatrix();
    res.set(L.w, L.h);
    lineMats.forEach((m) => m.resolution.copy(res));
    // keep about seven columns in view beside the ledger; the phone band stands further back
    const graphW = L.w - L.edge;
    L.zoom = L.phone ? clamp(300 / Math.max(200, L.w - L.edge), 0.9, 1.25) : clamp(860 / Math.max(420, graphW), 0.85, 1.6) * (opt.touch ? 1 : clamp(900 / L.h, 0.9, 1.2));
  }

  // ---------- pointer ----------
  const ptr = { x: -9999, y: -9999, inside: false, down: null };
  const toStage = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, r }; };
  const blocked = (t) => t && t.closest && t.closest('a, button, summary, details, .nav, .menu-sheet, .lg-row, .rm-intro > *, .rm-why > *, .lg-h');
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || opt.touch) { ptr.inside = false; return; }
    const p = toStage(e);
    ptr.x = p.x; ptr.y = p.y;
    ptr.inside = !blocked(e.target) && p.y >= 0 && p.y <= p.r.height && p.x > L.edge;
  };
  const onLeave = () => { ptr.inside = false; };
  const onDown = (e) => { const p = toStage(e); ptr.down = blocked(e.target) ? null : { x: p.x, y: p.y, t: performance.now() }; };
  const onUp = (e) => {
    const d = ptr.down; ptr.down = null;
    if (!d || !raf) return;
    const p = toStage(e);
    if (Math.hypot(p.x - d.x, p.y - d.y) > 8 || performance.now() - d.t > 600) return;
    const nd = pick(p.x, p.y);
    if (nd && opt.onPick) opt.onPick(nd.i);
  };
  addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  function pick(px, py) {
    let best = null, bd = 1e9;
    for (const nd of nodes) {
      if (nd.settle < 0.5 || nd.depth <= 0) continue;
      const d = Math.hypot(px - nd.sx, py - nd.sy);
      if (d < Math.max(14, nd.r * 2.2) && d < bd) { bd = d; best = nd; }
    }
    return best;
  }

  // ---------- progress ----------
  const tgt = { t: 0, ov: 1, end: 0 }, cur = { t: 0, ov: 1, end: 0 };
  let hotExt = -1, hotPtr = -1, hotShown = -1;
  function setProgress(p) {
    if (p.t != null) tgt.t = clamp(p.t, 0, Math.max(0, n - 1));
    if (p.ov != null) tgt.ov = clamp(p.ov);
    if (p.end != null) tgt.end = clamp(p.end);
  }
  function setHot(i) { hotExt = i; }
  const xAt = (t) => { const a = Math.floor(clamp(t, 0, n - 1)), b = Math.min(n - 1, a + 1); return lerp(xs[a], xs[b], t - a); };

  // ---------- frame ----------
  let time = 0, revealT = 0;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), c2 = new THREE.Vector3(), l2 = new THREE.Vector3(), v = new THREE.Vector3();
  const reticleAt = new THREE.Vector3(), par = { x: 0, y: 0 };
  const cInk3 = new THREE.Color(C.ink3), cSig2 = new THREE.Color(C.sig2);

  function pose(dst, dstLook, kind, tx) {
    const p = (L.phone && POSE[kind + 'Phone']) || POSE[kind], z = L.zoom;
    dstLook.set(tx + p.lead, 0, p.lookZ);
    dst.set(dstLook.x - (p.swing + p.lead) * z, p.up * z, p.lookZ + p.back * z);
  }

  function frame(dt) {
    time += dt; revealT += dt;
    cur.t = damp(cur.t, tgt.t, 7, dt);
    cur.ov = damp(cur.ov, tgt.ov, 6, dt);
    cur.end = damp(cur.end, tgt.end, 5, dt);
    const ko = cur.ov * cur.ov * (3 - 2 * cur.ov), ke = cur.end * cur.end * (3 - 2 * cur.end);

    // camera: read pose at the row, blended with the opening and the ending
    pose(camPos, look, 'read', xAt(cur.t));
    if (ke > 0.001 && focus >= 0) { pose(c2, l2, 'end', xs[focus]); camPos.lerp(c2, ke); look.lerp(l2, ke); }
    if (ko > 0.001) {
      const o = L.phone ? POSE.openPhone : POSE.open, z = 1;
      l2.set(o.look[0], o.look[1], o.look[2]);
      c2.set(o.cam[0], o.cam[1], o.cam[2]).sub(l2).multiplyScalar(z).add(l2);
      camPos.lerp(c2, ko); look.lerp(l2, ko);
    }
    if (fine) { par.x = damp(par.x, ptr.inside ? (ptr.x / L.w - 0.5) : 0, 2, dt); par.y = damp(par.y, ptr.inside ? (ptr.y / L.h - 0.5) : 0, 2, dt); }
    camera.position.copy(camPos);
    camera.position.x += par.x * 0.35; camera.position.y -= par.y * 0.25;
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const dist = camPos.distanceTo(look);
    fog.near = dist + 3; fog.far = dist + 24 + 16 * ko;

    // draw-on: the sweep reveals left to right; the Now plane rides it until it reaches its place
    const sw = lerp(X0 - 0.6, X1 + 0.6, easeOut(revealT / REVEAL));
    clip.constant = sw;
    nowGroup.position.x = Math.min(sw, nowX);
    nowGroup.visible = sw > X0 - 0.4;
    for (const m of lineMats) if (m.dashed && m === flowMat) m.dashOffset -= dt * 0.22;

    // nodes settle in sequence as the sweep passes them
    for (const nd of nodes) {
      const passed = sw - nd.x;
      if (passed > 0) nd.settle = Math.min(1, nd.settle + dt / 0.28);
      const s = easeOut(nd.settle);
      nd.g.scale.setScalar(0.7 + 0.3 * s);
      for (const m of nd.mats) m.opacity = m.userData.base * s;
      nd.g.quaternion.copy(camera.quaternion);          // nodes face the lens: true circles at any angle
      if (nd.arc) nd.arc.rotation.z -= dt * (Math.PI * 2 / 7);
      v.copy(nd.g.position).applyMatrix4(camera.matrixWorldInverse);
      nd.depth = -v.z;
      v.copy(nd.g.position).project(camera);
      nd.sx = (v.x * 0.5 + 0.5) * L.w; nd.sy = (-v.y * 0.5 + 0.5) * L.h;
      nd.r = 0.15 * L.h / (2 * Math.max(0.1, nd.depth) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }

    // the reticle glides to the row at the reading line
    const reading = (1 - ko) * (1 - ke);
    const ai = Math.round(clamp(cur.t, 0, n - 1));
    const target = ke > 0.5 && focus >= 0 ? focus : ai;
    reticleAt.set(xs[target], 0.02, nodeZ(target));
    reticle.position.x = damp(reticle.position.x, reticleAt.x, 12, dt);
    reticle.position.y = reticleAt.y;
    reticle.position.z = damp(reticle.position.z, reticleAt.z, 12, dt);
    reticle.quaternion.copy(camera.quaternion);
    reticle.userData.mat.opacity = damp(reticle.userData.mat.opacity, Math.max(reading, ke) * (nodes[target] ? nodes[target].settle : 0) * 0.9, 8, dt);
    if (ke > 0.5) reticle.userData.mat.color.setHex(C.sig2); else reticle.userData.mat.color.setHex(C.ink);

    // hover: from the ledger (hotExt) or the pointer (hotPtr); at the end, the focus node
    hotPtr = -1;
    if (ptr.inside && raf) { const nd = pick(ptr.x, ptr.y); if (nd) hotPtr = nd.i; }
    const hot = hotPtr >= 0 ? hotPtr : hotExt >= 0 ? hotExt : -1;
    const lit = hot >= 0 ? hot : (ke > 0.5 ? focus : -1);
    if (hot !== hotShown) {
      hotShown = hot;
      nodeLabels.forEach((Lb) => Lb && Lb.el.classList.toggle('is-hot', Lb.i === hot));
      if (opt.onHover) opt.onHover(hotPtr);
      document.body.style.cursor = hotPtr >= 0 && fine ? 'pointer' : '';
    }
    if (hot >= 0) { hotRing.position.set(xs[hot], 0.02, nodeZ(hot)); hotRing.material.color.setHex(ke > 0.5 && hot === focus ? C.sig2 : C.sig); }
    hotRing.quaternion.copy(camera.quaternion);
    hotRing.material.opacity = damp(hotRing.material.opacity, hot >= 0 ? 0.95 : 0, 14, dt);

    nodeLabels.forEach((Lb) => { if (Lb) { const f = Lb.i === lit && hot < 0; if (f !== Lb.f) { Lb.f = f; Lb.el.classList.toggle('is-focus', f); } } });

    // the focus node (iOS port) takes the signal colour as "Why iOS comes next" arrives
    if (focus >= 0 && nodes[focus] && nodes[focus].ringMat) nodes[focus].ringMat.color.lerpColors(cInk3, cSig2, ke);
    if (focusMat) focusMat.opacity = 0.95 * ke;

    // the Now plane steps back once it slides behind the reading column
    const nx = project(v.set(nowGroup.position.x, 0, 0)).x;
    const nk = smooth(L.edge - 20, L.edge + (L.phone ? 120 : 180), nx);
    for (const m of nowMats) {
      if (m.uniforms.uK) { m.uniforms.uK.value = nk; continue; }      // the sheet
      if (m.userData.base == null) m.userData.base = m.opacity;
      m.opacity = m.userData.base * nk;                                  // its edges
    }

    renderer.render(scene, camera);
    placeLabels(sw, ko, ke);
  }

  // ---------- label placement ----------
  const pv = new THREE.Vector3();
  const project = (p) => { pv.copy(p).project(camera); return { x: (pv.x * 0.5 + 0.5) * L.w, y: (-pv.y * 0.5 + 0.5) * L.h, ok: pv.z < 1 }; };
  // the screen x of a point on a lane is monotonic in world x: find the world x that sits at the graph's left edge
  const laneXAtScreen = (z, sx) => {
    let lo = X0, hi = X1;
    for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; pv.set(mid, 0, z).project(camera); const x = (pv.x * 0.5 + 0.5) * L.w; if (x < sx) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  function placeLabels(sw, ko, ke) {
    const edge = L.edge + (L.phone ? 6 : 18);
    const ai = Math.round(clamp(cur.t, 0, n - 1));
    const colPx = (() => { const a = project(new THREE.Vector3(look.x, 0, 0)), b = project(new THREE.Vector3(look.x + SW, 0, 0)); return Math.abs(b.x - a.x); })();
    const nodeVis = smooth(L.phone ? 44 : 64, L.phone ? 60 : 92, colPx);
    for (const Lb of labels) {
      let p, o;
      if (Lb.kind === 'lane') {
        if (L.phone) {          // the frozen gutter: the label sits level with its lane where the lane enters the graph
          const wx = Math.max(X0, laneXAtScreen(Lb.lane.z, L.edge + 4));
          p = project(v.set(wx, 0, Lb.lane.z));
          p.x = 16; Lb.dy = 0; Lb.ay = -50;
        } else {
          const wx = Math.max(X0, laneXAtScreen(Lb.lane.z, edge));
          p = project(v.set(wx, 0, Lb.lane.z));
        }
        o = smooth(X0 - 0.5, X0 + 0.5, sw);
      } else {
        p = project(Lb.anchor);
        o = smooth(Lb.anchor.x - 0.2, Lb.anchor.x + 0.6, sw);
        if (Lb.kind === 'node') {
          const nd = nodes[Lb.i];
          o = nd.settle * (L.phone || opt.touch ? (Lb.i === ai || Lb.i === hotShown || (ke > 0.5 && Lb.i === focus) ? 1 : 0) * (1 - ko) : nodeVis);
          if (ke > 0.5 && focus >= 0) o *= Lb.i === focus ? 1 : 0.55;
          const rk = nd.r * (0.26 / 0.15);             // clear of the reticle at any distance
          if (Lb.ay0 == null) Lb.ay0 = Lb.ay;
          // above by default (alternating below on desktop); on the phone band always above unless it would leave the band
          const above = Lb.ay0 < 0 || (L.phone && p.y - rk - 7 - 18 > 6);   // phones: above whenever it fits
          Lb.ay = above ? -100 : 0;
          Lb.dx = -rk; Lb.dy = (above ? -1 : 1) * (rk + 7);
        }
        if (Lb.kind === 'zone') o *= 1 - 0.4 * ke;
        if (Lb.w == null) Lb.w = Lb.el.offsetWidth;
        const left = p.x + (Lb.dx || 0) + (Lb.ax / 100) * Lb.w;
        o *= smooth(edge + 4, edge + 44, left);        // nothing over the reading column (or the lane names)
        if (Lb.kind === 'node' && !L.phone) o *= smooth(edge + 90, edge + 140, nodes[Lb.i].sx);   // nor beside the lane names
      }
      if (!p.ok || p.x > L.w + 200 || p.y < -60 || p.y > L.h + 60) o = 0;
      o = Math.round(o * 50) / 50;
      const px = Math.round(p.x + (Lb.dx || 0)), py = Math.round(p.y + (Lb.dy || 0));
      const key = px + ':' + py;
      if (key !== Lb.key) { Lb.key = key; Lb.el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(${Lb.ax}%, ${Lb.ay}%)`; }
      if (o !== Lb.o) { Lb.o = o; Lb.el.style.opacity = o; Lb.el.style.visibility = o < 0.02 ? 'hidden' : 'visible'; }
    }
  }

  // ---------- loop ----------
  let raf = 0, last = 0, lost = false;
  function loop(now) { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); }
  function start() { if (raf || lost) return; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (hotPtr >= 0) document.body.style.cursor = ''; }
  function resize() { layout(); if (!raf) frame(0); }
  const onLost = (e) => { e.preventDefault(); lost = true; stop(); if (opt.onLost) opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);
  function dispose() {
    stop();
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    labels.forEach((Lb) => Lb.el.remove());
    renderer.dispose(); renderer.forceContextLoss();
    S = null;
  }

  layout();
  if (opt.initial) { setProgress(opt.initial); Object.assign(cur, tgt); }
  frame(0);
  const api = {
    start, stop, setProgress, setHot, resize, dispose,
  };
  S = { api };
  return api;
}

export function start() { S && S.api.start(); }
export function stop() { S && S.api.stop(); }
export function setProgress(p) { S && S.api.setProgress(p); }
export function dispose() { S && S.api.dispose(); }
