// SHIFROM Support page: the allocation graph. One source ("Your support") feeds a trunk that splits,
// at 45 degrees like a circuit trace, into three branches: iOS development, Infrastructure, Security audit.
// It is a schematic, not proportions: the branches are drawn alike because the page states no split.
// The language is the Roadmap page's (js/pages/roadmap-scene.js, primitives copied, not imported), set on the
// light ground: thin ink lines on a faint dot grid, flat camera-facing nodes, signal-blue packets, DOM labels
// projected from the scene each frame (written only when they change).
// Contract: mount(canvas, opt) -> { start, stop, resize, dispose, setHot(i), pulse(), settle(secs) }
//   opt.labelsEl  the layer the labels are written into
//   opt.labels    { src: { name, tag }, dst: [{ name, tag }, x3], note }
//   opt.onHover   (i) the pointer is over branch i of the graph (-1: none)
//   opt.phone, opt.onLost
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

const C = { ink: 0x16142b, ink3: 0x66627e, ground: 0xf4f3f8, blue: 0x3549f2 };

// the graph lies on the ground plane (y = 0) and flows towards the viewer along +z
const ZS = -3.5, ZJ = -1.8, ZD = 3.0;     // source, junction, destinations
const XB = 2.45;                          // branch spacing
const BX = [-XB, 0, XB];                  // iOS development, Infrastructure, Security audit
const FILLET = 0.5;
const REVEAL = 1.6;                       // seconds for the draw-on sweep
const SPEED = 1.05;                       // packet speed, world units per second
const EVERY = 1.35;                       // seconds between packets in the calm stream
const VIEW = { el: THREE.MathUtils.degToRad(48), yaw: THREE.MathUtils.degToRad(0), target: new THREE.Vector3(0, 0, -0.25) };

// a polyline through the corners, each corner rounded with a quadratic fillet
function fillet(corners, r) {
  const V = (p) => new THREE.Vector2(p[0], p[1]);
  const out = [V(corners[0])];
  for (let k = 1; k < corners.length - 1; k++) {
    const P = V(corners[k]), A = V(corners[k - 1]), B = V(corners[k + 1]);
    const u = A.clone().sub(P).normalize(), v = B.clone().sub(P).normalize();
    const turn = Math.PI - Math.acos(clamp(u.dot(v), -1, 1));
    const t = r * Math.tan(turn / 2);
    const p0 = P.clone().addScaledVector(u, t), p1 = P.clone().addScaledVector(v, t);
    for (let q = 0; q <= 12; q++) {
      const s = q / 12;
      out.push(new THREE.Vector2(
        (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * P.x + s * s * p1.x,
        (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * P.y + s * s * p1.y));
    }
  }
  out.push(V(corners[corners.length - 1]));
  return out.map((p) => new THREE.Vector3(p.x, 0, p.y));
}
const routeOf = (b) => fillet(BX[b] === 0 ? [[0, ZS], [0, ZD]] : [[0, ZS], [0, ZJ], [BX[b], ZJ + Math.abs(BX[b])], [BX[b], ZD]], FILLET);
function measure(pts) { const acc = [0]; for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + pts[k].distanceTo(pts[k - 1])); return acc; }
function sampleAt(pts, acc, s, out) {
  if (s <= 0) return out.copy(pts[0]);
  const L = acc[acc.length - 1];
  if (s >= L) return out.copy(pts[pts.length - 1]);
  let lo = 0, hi = acc.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] < s) lo = m; else hi = m; }
  return out.copy(pts[lo]).lerp(pts[hi], (s - acc[lo]) / (acc[hi] - acc[lo]));
}
const pairsOf = (pts) => { const a = []; for (let k = 1; k < pts.length; k++) a.push(pts[k - 1].x, pts[k - 1].y, pts[k - 1].z, pts[k].x, pts[k].y, pts[k].z); return a; };

// round, antialiased screen-space points (the ground grid and the packets)
const pointsMaterial = (color, extraVert = '', extraFrag = '') => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false,
  uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uSize: { value: 2 }, uPR: { value: 1 } },
  vertexShader: `
    attribute float aA; attribute float aS;
    uniform float uSize; uniform float uPR;
    varying float vA;
    void main() {
      vA = aA;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * aS * uPR;
      ${extraVert}
    }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uOpacity;
    varying float vA;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float a = 1.0 - smoothstep(0.62, 1.0, r);
      gl_FragColor = vec4(uColor, a * vA * uOpacity);
      ${extraFrag}
      #include <colorspace_fragment>
    }`,
});

let S = null;

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const phone = !!opt.phone;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // tilt from the box: steep for a portrait phone band, flatter for a wide, short one (landscape phones)
  let EL = VIEW.el;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 400);

  // ---------- routes ----------
  const routes = [0, 1, 2].map(routeOf);
  const accs = routes.map(measure);
  const lens = accs.map((a) => a[a.length - 1]);
  // each branch drawn from where it leaves the trunk
  const branchPts = routes.map((r, b) => (BX[b] === 0 ? [new THREE.Vector3(0, 0, ZJ), new THREE.Vector3(0, 0, ZD)] : r.filter((p) => p.z >= ZJ - FILLET * 0.5 || Math.abs(p.x) > 1e-6)));

  // ---------- materials ----------
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), ZS - 1);   // keeps z <= constant: the draw-on sweep
  const lineMats = [];
  const lineMat = (color, width, opacity) => {
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false, worldUnits: false });
    m.clippingPlanes = [clip];
    lineMats.push(m);
    return m;
  };
  const segs = (pts, mat, order = 1) => {
    const g = new LineSegmentsGeometry();
    g.setPositions(pairsOf(pts));
    const l = new LineSegments2(g, mat);
    l.frustumCulled = false; l.renderOrder = order;
    scene.add(l);
    return l;
  };

  // ---------- the ground: a faint dot grid that fades out at its edges ----------
  const grid = (() => {
    const pos = [], a = [], s = [];
    for (let x = -4.5; x <= 4.5 + 1e-6; x += 0.5) for (let z = -5.0; z <= 4.5 + 1e-6; z += 0.5) {
      pos.push(x, -0.005, z);
      const d = Math.hypot(x / 4.8, (z + 0.25) / 4.8);
      a.push(1 - smooth(0.5, 1, d)); s.push(1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
    const m = pointsMaterial(C.ink);
    m.uniforms.uSize.value = phone ? 1.8 : 2.2;
    m.uniforms.uOpacity.value = 0;
    const p = new THREE.Points(g, m);
    p.frustumCulled = false; p.renderOrder = 0;
    scene.add(p);
    return m;
  })();

  // ---------- lines: the trunk, the three branches, and the highlighted route over them ----------
  segs([new THREE.Vector3(0, 0, ZS), new THREE.Vector3(0, 0, ZJ)], lineMat(C.ink, phone ? 1.6 : 2, 0.9));
  const branchMats = branchPts.map((pts) => { const m = lineMat(C.ink, phone ? 1.25 : 1.5, 0.62); segs(pts, m); return m; });
  const routeMats = routes.map((pts) => { const m = lineMat(C.blue, phone ? 1.8 : 2.2, 0); segs(pts, m, 2); return m; });

  // ---------- nodes: flat discs that face the lens (true circles at any angle) ----------
  const circle = (r) => new THREE.CircleGeometry(r, 56);
  const ring = (a, b) => new THREE.RingGeometry(a, b, 72);
  const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false });
  const nodes = [];
  const node = (x, z, parts, delay = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0.01, z);
    const mats = [];
    parts.forEach(([geo, mat], k) => { const m = new THREE.Mesh(geo, mat); m.position.z = k * 0.002; m.renderOrder = 3 + k * 0.01; mat.userData.base = mat.opacity; mats.push(mat); g.add(m); });
    mats.forEach((m) => { m.opacity = 0; });
    g.scale.setScalar(0.7);
    scene.add(g);
    const nd = { g, mats, x, z, delay, settle: 0, sx: 0, sy: 0 };
    nodes.push(nd);
    return nd;
  };
  const src = node(0, ZS, [[circle(0.27), basic(C.ground)], [ring(0.205, 0.226), basic(C.ink, 0.4)], [circle(0.125), basic(C.ink)]]);
  const jun = node(0, ZJ, [[circle(0.1), basic(C.ground)], [circle(0.056), basic(C.ink)]]);
  const dst = BX.map((x, b) => {
    const inner = basic(C.blue, 1);
    const ringMat = basic(C.ink, 0.92);
    const hotRing = basic(C.blue, 1);
    const nd = node(x, ZD, [[circle(0.21), basic(C.ground)], [ring(0.122, 0.148), ringMat], [circle(0.062), inner], [ring(0.205, 0.222), hotRing]], 0.09 * b);
    nd.inner = inner; nd.ringMat = ringMat; nd.hotRing = hotRing;
    inner.userData.base = 0; hotRing.userData.base = 0;
    return nd;
  });

  // ---------- packets ----------
  const MAXP = 48;
  const pkGeo = new THREE.BufferGeometry();
  const pkPos = new Float32Array(MAXP * 3), pkA = new Float32Array(MAXP), pkS = new Float32Array(MAXP).fill(1);
  pkGeo.setAttribute('position', new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage));
  pkGeo.setAttribute('aA', new THREE.BufferAttribute(pkA, 1).setUsage(THREE.DynamicDrawUsage));
  pkGeo.setAttribute('aS', new THREE.BufferAttribute(pkS, 1));
  const pkMat = pointsMaterial(C.blue);
  pkMat.uniforms.uSize.value = phone ? 6.5 : 7.5;
  const pkPts = new THREE.Points(pkGeo, pkMat);
  pkPts.frustumCulled = false; pkPts.renderOrder = 6;
  scene.add(pkPts);
  const packets = [];
  const arrive = [0, 0, 0];
  let spawnT = EVERY * 0.6, rr = 1;
  const spawn = (b) => { if (packets.length < MAXP) packets.push({ b, s: 0 }); };

  // ---------- labels (DOM) ----------
  const host = opt.labelsEl;
  const labels = [];
  const mkLabel = (cls, d) => {
    if (!host || !d) return null;
    const el = document.createElement('span');
    el.className = 'gl-lab ' + cls;
    const b = document.createElement('b'); b.textContent = d.name; el.append(b);
    if (d.tag) {
      const s = document.createElement('small');
      d.tag.split(/(iPhone|v\d+\.\d+)/).forEach((part, k) => { if (!part) return; if (k % 2) { const n = document.createElement('span'); n.className = 'nc'; n.textContent = part; s.append(n); } else s.append(part); });
      el.append(s);
    }
    host.append(el);
    const Lb = { el, key: '', o: -1, w: 0, h: 0 };
    labels.push(Lb);
    return Lb;
  };
  const srcLab = mkLabel('is-src', opt.labels && opt.labels.src);
  const dstLabs = [0, 1, 2].map((b) => mkLabel('is-dst', opt.labels && opt.labels.dst && opt.labels.dst[b]));
  const noteLab = mkLabel('is-note', opt.labels && opt.labels.note && { name: opt.labels.note });   // "schematic, not proportions"
  const GAP_NOTE = 30;
  const measureLabels = () => labels.forEach((Lb) => { Lb.w = Lb.el.offsetWidth; Lb.h = Lb.el.offsetHeight; });
  const GAP_SRC = 20, GAP_DST = 18;
  const srcBox = (p) => ({ x0: p.x + GAP_SRC - 4, x1: p.x + GAP_SRC + (srcLab ? srcLab.w : 0), y0: p.y - (srcLab ? srcLab.h : 0) / 2, y1: p.y + (srcLab ? srcLab.h : 0) / 2 });
  const dstBox = (p, b) => { const Lb = dstLabs[b]; const w = Lb ? Lb.w : 0, h = Lb ? Lb.h : 0; return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + GAP_DST, y1: p.y + GAP_DST + h }; };

  // ---------- layout: fit the graph and its labels to whatever box the page gives it ----------
  const L = { w: 1, h: 1, dist: 20, ox: 0, oy: 0 };
  const res = new THREE.Vector2();
  const v = new THREE.Vector3();
  const proj = (p, out = {}) => { v.copy(p).project(camera); out.x = (v.x * 0.5 + 0.5) * L.w; out.y = (-v.y * 0.5 + 0.5) * L.h; return out; };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  function placeCamera(dist) {
    const yaw = VIEW.yaw + par.x * 0.05, el = EL + par.y * 0.03;
    camera.position.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(dist).add(VIEW.target);
    camera.lookAt(VIEW.target);
    camera.updateMatrixWorld();
  }
  const keyPts = [new THREE.Vector3(0, 0, ZS), new THREE.Vector3(0, 0, ZJ), ...BX.map((x) => new THREE.Vector3(x, 0, ZJ + Math.abs(x))), ...BX.map((x) => new THREE.Vector3(x, 0, ZD))];
  function bounds() {
    const r = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    const add = (b) => { r.x0 = Math.min(r.x0, b.x0); r.x1 = Math.max(r.x1, b.x1); r.y0 = Math.min(r.y0, b.y0); r.y1 = Math.max(r.y1, b.y1); };
    for (const p of keyPts) { const q = proj(p); add({ x0: q.x - 14, x1: q.x + 14, y0: q.y - 14, y1: q.y + 14 }); }
    add(srcBox(proj(keyPts[0])));
    let foot = -1e9;
    BX.forEach((x, b) => { const bx = dstBox(proj(keyPts[5 + b]), b); add(bx); foot = Math.max(foot, bx.y1); });
    if (noteLab) { const c = proj(keyPts[6]); add({ x0: c.x - noteLab.w / 2, x1: c.x + noteLab.w / 2, y0: foot + GAP_NOTE, y1: foot + GAP_NOTE + noteLab.h }); }
    return r;
  }
  function layout() {
    L.w = canvas.clientWidth || 600; L.h = canvas.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    renderer.setSize(L.w, L.h, false);
    res.set(L.w, L.h);
    lineMats.forEach((m) => m.resolution.copy(res));
    grid.uniforms.uPR.value = pkMat.uniforms.uPR.value = renderer.getPixelRatio();
    const a = L.w / L.h;
    EL = a > 1.6 ? THREE.MathUtils.degToRad(34) : phone ? THREE.MathUtils.degToRad(62) : VIEW.el;   // VIEW.el is already in radians
    camera.aspect = a;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // room for the legend at the foot of the stage, and an upper bound so a tall box never blows the graph up
    const pad = phone ? { x: 12, t: 14, b: 14 } : { x: 32, t: 40, b: 40 };
    const maxW = phone ? 1e9 : 600;
    const ok = (r) => r.x1 - r.x0 <= Math.min(L.w - 2 * pad.x, maxW) && r.y1 - r.y0 <= L.h - pad.t - pad.b;
    const fit = () => {
      let lo = 3, hi = 160;
      for (let k = 0; k < 32; k++) { const mid = (lo + hi) / 2; placeCamera(mid); if (ok(bounds())) hi = mid; else lo = mid; }
      L.dist = hi;
      placeCamera(L.dist);
    };
    // destination labels keep their natural width while they fit between the nodes; a longer one
    // (Russian names run long) is capped to that space and wraps between words, then the graph is refitted
    dstLabs.forEach((Lb) => { if (Lb) Lb.el.style.maxWidth = ''; });
    measureLabels();
    fit();
    {
      const xs = keyPts.slice(5).map((p) => proj(p).x);
      const gap = [xs[1] - xs[0], xs[2] - xs[1]];
      const w = dstLabs.map((Lb) => (Lb ? Lb.w : 0));
      // only labels that actually run into a neighbour (natural widths plus a 12px gap) are capped
      const hit = [0, 1].map((k) => (w[k] + w[k + 1]) / 2 + 12 > gap[k]);
      const room = Math.min(...gap) * 0.94 - 16;   // a margin for the slightly smaller refit
      let capped = false;
      dstLabs.forEach((Lb, i) => {
        if (!Lb || !((i > 0 && hit[i - 1]) || (i < 2 && hit[i])) || Lb.w <= room) return;
        Lb.el.style.width = 'min-content';                       // the longest word: never narrower than that
        const word = Lb.el.offsetWidth;
        Lb.el.style.width = '';
        Lb.el.style.maxWidth = Math.ceil(Math.max(word, room)) + 'px';
        capped = true;
      });
      if (capped) { measureLabels(); fit(); }
    }
    const r = bounds();
    L.ox = (r.x0 + r.x1) / 2 - L.w / 2;
    L.oy = (r.y0 + r.y1) / 2 - (pad.t + (L.h - pad.t - pad.b) / 2);
    camera.setViewOffset(L.w, L.h, L.ox, L.oy, L.w, L.h);
    camera.updateProjectionMatrix();
  }

  // ---------- pointer: hovering a branch (or its label) highlights it ----------
  const ptr = { x: -9999, y: -9999, inside: false };
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
    ptr.inside = ptr.x >= 0 && ptr.y >= 0 && ptr.x <= r.width && ptr.y <= r.height;
    par.tx = ptr.inside ? ptr.x / L.w - 0.5 : 0; par.ty = ptr.inside ? ptr.y / L.h - 0.5 : 0;
  };
  const onLeave = () => { ptr.inside = false; par.tx = par.ty = 0; };
  let tapHot = -1, tapDown = null;
  const onDown = (e) => { if (e.pointerType === 'mouse') return; const r = canvas.getBoundingClientRect(); tapDown = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  const onUp = (e) => {
    const d = tapDown; tapDown = null;
    if (!d || e.pointerType === 'mouse') return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - d.x, y - d.y) > 10 || performance.now() - d.t > 500) return;   // a scroll, not a tap
    const b = pickAt(x, y);
    tapHot = b === tapHot ? -1 : b;
    ptr.inside = false;
    if (!raf) frame(0);
  };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown, { passive: true });
  canvas.addEventListener('pointerup', onUp, { passive: true });
  const segDist = (px, py, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l2);
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  };
  const scr = branchPts.map((pts) => pts.map(() => ({ x: 0, y: 0 })));
  function pickAt(x, y) {
    let best = -1, bd = fine ? 16 : 24;   // a finger is wider than a cursor
    for (let b = 0; b < 3; b++) {
      const P = scr[b];
      for (let k = 1; k < P.length; k++) { const d = segDist(x, y, P[k - 1], P[k]); if (d < bd) { bd = d; best = b; } }
      const Lb = dstLabs[b];
      if (Lb && Lb.box && x > Lb.box.x0 - 8 && x < Lb.box.x1 + 8 && y > Lb.box.y0 - 26 && y < Lb.box.y1 + 8) return b;
    }
    return best;
  }
  const pickBranch = () => (ptr.inside ? pickAt(ptr.x, ptr.y) : -1);

  // ---------- state ----------
  let time = 0, hotExt = -1, hotPtr = -1, hotShown = -2, ptrShown = -1;
  const hk = [0, 0, 0];
  const cInk = new THREE.Color(C.ink), cBlue = new THREE.Color(C.blue);
  const tmp = new THREE.Vector3(), q = {};

  function frame(dt) {
    time += dt;
    // parallax: a whisper, desktop pointers only
    if (fine) { par.x = damp(par.x, par.tx, 2.5, dt); par.y = damp(par.y, par.ty, 2.5, dt); }
    placeCamera(L.dist);

    // draw-on: the sweep runs from the source to the destinations; nodes settle as it passes them
    const sw = lerp(ZS - 0.5, ZD + 0.6, easeOut(time / REVEAL));
    clip.constant = sw;
    grid.uniforms.uOpacity.value = 0.3 * easeOut(time / 0.9);
    for (const nd of nodes) {
      if (sw > nd.z - 0.05) { if (nd.delay > 0) nd.delay -= dt; else nd.settle = Math.min(1, nd.settle + dt / 0.3); }
      const s = easeOut(nd.settle);
      nd.g.scale.setScalar(0.7 + 0.3 * s);
      nd.g.quaternion.copy(camera.quaternion);
      for (const m of nd.mats) m.opacity = m.userData.base * s;
      proj(nd.g.position, q); nd.sx = q.x; nd.sy = q.y;
    }

    // highlight: from the page (hotExt) or the pointer (hotPtr)
    for (let b = 0; b < 3; b++) for (let k = 0; k < branchPts[b].length; k++) proj(branchPts[b][k], scr[b][k]);
    hotPtr = pickBranch();
    if (hotPtr < 0) hotPtr = tapHot;
    const hot = hotPtr >= 0 ? hotPtr : hotExt;
    if (hot !== hotShown) { hotShown = hot; dstLabs.forEach((Lb, b) => Lb && Lb.el.classList.toggle('is-hot', b === hot)); }
    if (hotPtr !== ptrShown) { ptrShown = hotPtr; if (opt.onHover) opt.onHover(hotPtr); }
    let any = 0;
    for (let b = 0; b < 3; b++) { hk[b] = damp(hk[b], b === hot ? 1 : 0, 12, dt); any = Math.max(any, hk[b]); }
    for (let b = 0; b < 3; b++) {
      branchMats[b].opacity = 0.62 * (1 - 0.5 * any * (1 - hk[b]));
      routeMats[b].opacity = hk[b];
      const d = dst[b];
      d.ringMat.color.lerpColors(cInk, cBlue, hk[b]);
      arrive[b] = Math.max(0, arrive[b] - dt / 0.9);
      d.inner.opacity = Math.max(hk[b], easeOut(arrive[b])) * easeOut(d.settle);
      d.hotRing.opacity = 0.9 * hk[b] * easeOut(d.settle);
    }

    // packets: a calm stream once the graph has drawn, plus any pulses
    const live = time > REVEAL * 0.9;
    if (live) { spawnT += dt; if (spawnT >= EVERY) { spawnT -= EVERY; spawn(rr); rr = (rr + 1) % 3; } }
    for (let k = packets.length - 1; k >= 0; k--) {
      const p = packets[k];
      p.s += SPEED * dt;
      if (p.s >= lens[p.b]) { arrive[p.b] = 1; packets.splice(k, 1); }
    }
    for (let k = 0; k < MAXP; k++) {
      const p = packets[k];
      if (!p) { pkA[k] = 0; continue; }
      sampleAt(routes[p.b], accs[p.b], p.s, tmp);
      pkPos[k * 3] = tmp.x; pkPos[k * 3 + 1] = 0.02; pkPos[k * 3 + 2] = tmp.z;
      pkA[k] = smooth(0, 0.35, p.s) * (1 - smooth(lens[p.b] - 0.3, lens[p.b], p.s)) * (1 - 0.6 * any * (1 - hk[p.b]));
    }
    pkGeo.attributes.position.needsUpdate = true;
    pkGeo.attributes.aA.needsUpdate = true;

    renderer.render(scene, camera);
    placeLabels();
  }

  // ---------- label placement ----------
  function put(Lb, x, y, o) {
    if (!Lb) return;
    o = Math.round(o * 50) / 50;
    const px = Math.round(x), py = Math.round(y), key = px + ':' + py;
    if (key !== Lb.key) { Lb.key = key; Lb.el.style.transform = `translate3d(${px}px, ${py}px, 0)`; }
    if (o !== Lb.o) { Lb.o = o; Lb.el.style.opacity = o; Lb.el.style.visibility = o < 0.02 ? 'hidden' : 'visible'; }
  }
  function placeLabels() {
    if (srcLab) { const b = srcBox({ x: src.sx, y: src.sy }); srcLab.box = b; put(srcLab, b.x0 + 4, b.y0, easeOut(src.settle)); }
    let foot = -1e9;
    dst.forEach((d, b) => { const Lb = dstLabs[b]; if (!Lb) return; const bx = dstBox({ x: d.sx, y: d.sy }, b); Lb.box = bx; foot = Math.max(foot, bx.y1); put(Lb, bx.x0, bx.y0, easeOut(d.settle)); });
    if (noteLab) put(noteLab, dst[1].sx - noteLab.w / 2, foot + GAP_NOTE, easeOut(Math.min(...dst.map((d) => d.settle))));
  }

  // ---------- loop ----------
  let raf = 0, last = 0, lost = false;
  function loop(now) { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); }
  function start() { if (raf || lost) return; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function resize() { layout(); if (!raf) frame(0); }
  const onLost = (e) => { e.preventDefault(); lost = true; stop(); if (opt.onLost) opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);
  function dispose() {
    stop();
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    labels.forEach((Lb) => Lb.el.remove());
    renderer.dispose(); renderer.forceContextLoss();
    S = null;
  }

  layout();
  frame(0);
  const api = {
    start, stop, resize, dispose,
    setHot(i) { hotExt = i == null ? -1 : i; if (!raf) frame(0); },
    // one packet from the source down all three branches (a contribution method was pointed at)
    pulse() { if (time < REVEAL) return; for (let b = 0; b < 3; b++) spawn(b); },
    relayout: () => { layout(); frame(0); },
  };
  S = { api };
  return api;
}
