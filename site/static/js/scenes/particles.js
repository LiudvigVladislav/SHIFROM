// SHIFROM hero: one GPU point cloud, five morph targets (from the round-2 Particles prototype).
// (0) chaotic noise cloud -> (1) the hexagon mark, sampled from the brand mark
// -> (2) chat bubble with typing dots -> (3) lock -> (4) a narrow ribbon through a barrier.
// Contract: mount(canvas, opt) -> start() / stop() / setProgress(screens) / dispose().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { yieldTask, warm } from './yield.js?v=c5724892';

const FOV = 35, CAM_Z = 10;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261023);
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
const lin = (c) => Math.pow(c / 255, 2.2);

/* ---------- targets ---------- */

// The mark is sampled from the kit's favicon.png (the same mark at 192 px, 40 KB instead of 611 KB);
// it is drawn up to 380 px with smoothing so the alpha threshold still cuts clean edges.
// src is the page's own <img> of the mark when there is one (no second request), or a URL
async function sampleLogo(src, count) {
  let img = src;
  if (typeof src === 'string') { img = new Image(); img.src = src; }
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
  // erode by one pixel so the loose specks around the mark never become targets
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

function sdRoundBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// chat bubble: outline band + tail + three typing dots (tag 1..3)
function sampleBubble(out, idx) {
  for (const k of idx) {
    for (;;) {
      const x = (rnd() - 0.5) * 1.1, y = (rnd() - 0.5) * 0.9 - 0.02;
      let tag = -1;
      const sd = sdRoundBox(x, y - 0.05, 0.47, 0.285, 0.27);
      if (Math.abs(sd) < 0.026) tag = 0;
      else if (sd > 0 && inTri(x, y, -0.3, -0.16, -0.08, -0.23, -0.4, -0.42)) tag = 0;
      else {
        for (let j = 0; j < 3; j++) if (Math.hypot(x - (j - 1) * 0.215, y - 0.05) < 0.074) tag = j + 1;
      }
      if (tag < 0) continue;
      out[k * 4] = x; out[k * 4 + 1] = y; out[k * 4 + 2] = (rnd() - 0.5) * 0.035; out[k * 4 + 3] = tag;
      break;
    }
  }
}

// padlock: filled body with a keyhole cut out (denser at the edges), shackle tagged 1
function sampleLock(out, idx) {
  const by = -0.135;
  for (const k of idx) {
    for (;;) {
      const x = (rnd() - 0.5) * 0.7, y = rnd() * 0.8 - 0.4;
      let tag = -1;
      const sdb = sdRoundBox(x, y - by, 0.3, 0.225, 0.07);
      if (sdb < 0) {
        const hc = Math.hypot(x, y - (by + 0.055)) - 0.06;
        const t = (y - (by + 0.03)) / -0.17; // 0 at top of slot, 1 at bottom
        const slot = t >= 0 && t <= 1 ? Math.abs(x) - (0.026 + 0.034 * t) : 1;
        const hole = Math.min(hc, slot);
        if (hole < 0) continue;
        const edge = Math.min(-sdb, hole);
        if (edge > 0.022 && rnd() > 0.42) continue;
        tag = 0;
      } else {
        const ay = by + 0.225 + 0.06;
        const r = Math.hypot(x, y - ay);
        if (y >= ay && Math.abs(r - 0.19) < 0.032) tag = 1;
        else if (y < ay && y > by + 0.2 && Math.abs(Math.abs(x) - 0.19) < 0.032) tag = 1;
      }
      if (tag < 0) continue;
      out[k * 4] = x; out[k * 4 + 1] = y + 0.01; out[k * 4 + 2] = (rnd() - 0.5) * 0.05; out[k * 4 + 3] = tag;
      break;
    }
  }
}

// the noise cloud: tangled streamlines of a chaotic (ABC) flow plus diffuse dust
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
    // brand gradient across the cloud, mostly dimmed into slate; rare bright specks
    const t = Math.min(1, Math.max(0, x * 0.5 + 0.5 + (rnd() - 0.5) * 0.35));
    const m = [0.86, 0.06, 0.94], v = [0.2, 0.08, 1.0], b = [0.03, 0.2, 1.0];
    const g = t < 0.5 ? m.map((c, j) => c + (v[j] - c) * t * 2) : v.map((c, j) => c + (b[j] - c) * (t * 2 - 1));
    const sat = 0.35 + rnd() * 0.65;
    const lum = 0.35 + rnd() * 0.75;
    for (let j = 0; j < 3; j++) col[k * 3 + j] = (slate[j] + (g[j] - slate[j]) * sat) * lum;
    if (rnd() < 0.008) { col[k * 3] = 0.9; col[k * 3 + 1] = 0.7; col[k * 3 + 2] = 1.3; }
    // a few motes drift close to the lens and fall out of focus
    if (rnd() < 0.012) {
      pos[k * 3] = (rnd() * 2 - 1) * 0.9; pos[k * 3 + 1] = (rnd() * 2 - 1) * 0.9; pos[k * 3 + 2] = 1.15 + rnd() * 0.75;
      for (let j = 0; j < 3; j++) col[k * 3 + j] *= 3.2;
    }
  }
}

/* ---------- shaders ---------- */

const vert = /* glsl */`
uniform float uTime, uStage, uPR, uBase, uOpen, uAspect, uHW, uHH, uIntro, uFocus, uAper, uSweep;
uniform vec4 uShape;   // offset x, y, scale
uniform vec4 uField;   // cloud offset x, y, half-width, half-height
uniform vec4 uRib;     // barrier x (norm), gap y (norm), entry slope
uniform vec4 uInt;     // intensity: cloud, mark, bubble, lock
uniform vec2 uInt2;    // intensity: ribbon stage, dust
uniform vec3 uPtr;     // pointer ndc + push strength
uniform vec3 uPtr2;    // lagged pointer ndc + swirl
attribute vec3 aP1;
attribute vec4 aP2;
attribute vec4 aP3;
attribute vec4 aP4;
attribute vec3 aC0;
attribute vec3 aC1;
attribute vec4 aRnd;
varying vec3 vCol;
varying float vA;

vec3 brand(float t) {
  t = clamp(t, 0., 1.);
  vec3 m = vec3(0.86, 0.06, 0.94), v = vec3(0.22, 0.08, 1.0), b = vec3(0.03, 0.22, 1.0);
  return t < .5 ? mix(m, v, t * 2.) : mix(v, b, t * 2. - 1.);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec3 shapeXf(vec3 q) {
  // shapes turn a little in depth so their thickness catches the light
  q.xz = rot(0.16 * sin(uTime * 0.23)) * q.xz;
  q.yz = rot(0.08 * sin(uTime * 0.17 + 1.3)) * q.yz;
  return vec3(q.xy * uShape.z + uShape.xy, q.z * uShape.z);
}

void stageAt(int i, out vec3 p, out vec3 c, out float a, out float sz) {
  float role = aP4.w;
  float ph = aRnd.z * 6.2831;
  if (i == 0) {
    vec3 q = position;
    q.xz = rot(uTime * 0.02) * q.xz;
    float t = uTime * 0.16;
    q += vec3(sin(q.y * 2.6 + t), sin(q.z * 2.9 + t * 1.2), sin(q.x * 2.3 - t * 0.9)) * 0.045;
    q += vec3(sin(t * 2.1 + ph * 3.), cos(t * 1.7 + ph * 5.), sin(t * 1.3 + ph * 7.)) * 0.0035;
    q *= mix(0.22, 1., uIntro);
    p = vec3(q.x * uField.z + uField.x, q.y * uField.w + uField.y, q.z * 3.6);
    c = aC0; a = uInt.x; sz = 1.2;
    return;
  }
  if (role > 1.5) {            // ambient dust in every later stage
    vec3 q = aP4.xyz;
    q.x += 0.02 * sin(uTime * 0.2 + ph);
    q.y += 0.02 * cos(uTime * 0.17 + ph);
    p = vec3(q.x * uHW * 1.15, q.y * uHH * 1.15, q.z);
    c = vec3(0.16, 0.12, 0.42); a = uInt2.y; sz = 1.0;
    return;
  }
  vec3 wob = 0.0035 * vec3(sin(uTime * 1.1 + ph * 7.), cos(uTime * 0.9 + ph * 5.), sin(uTime * 0.7 + ph * 3.));
  if (i == 1) {
    p = shapeXf(aP1 + wob); c = aC1 * 1.15; a = uInt.y; sz = 0.95;
  } else if (i == 2) {
    vec3 q = aP2.xyz + wob; float tag = aP2.w;
    c = brand(q.x * 1.05 + 0.5) ; a = uInt.z;
    if (tag > 0.5) {
      float bob = pow(max(0., sin(uTime * 4.4 - tag * 0.95)), 3.);
      q.y += bob * 0.045;
      c = mix(c, vec3(1.0, 0.62, 1.0), 0.3 + bob * 0.45);
      a *= 1. + bob * 0.8;
    }
    p = shapeXf(q); sz = 0.95;
  } else if (i == 3) {
    vec3 q = aP3.xyz + wob;
    if (aP3.w > 0.5) q.y += uOpen * 0.1;
    c = brand(q.x * 1.25 + 0.5 - q.y * 0.4); a = uInt.w; sz = 0.95;
    p = shapeXf(q);
  } else {
    if (role < 0.5) {
      // ribbon: a narrow twisting band; particles flow along it
      float u = fract(aRnd.w + uTime * (0.016 + aP4.z * 0.01));
      float x = mix(-1.3, 1.35, u);
      float dx = x - uRib.x;
      float pinch = smoothstep(0.0, 0.55, abs(dx));
      float y = uRib.y + pinch * (0.12 * sin(u * 6.0 + 1.0 + uTime * 0.3) + (dx < 0. ? -dx * uRib.z : dx * 0.22));
      vec3 w = vec3(x * uHW, y * uHH, dx < 0. ? -dx * 2.4 : -dx * 7.0);
      w.z += pinch * 0.4 * sin(u * 5.0 + uTime * 0.25);
      float hw = mix(0.03, 0.5, pinch * pinch);
      float tw = u * 9.0 + uTime * 0.45;
      vec3 n1 = vec3(0., cos(tw), sin(tw)), n2 = vec3(0., -sin(tw), cos(tw));
      w += n1 * aP4.x * hw + n2 * aP4.y * hw * 0.1;
      p = w;
      float glow = 1. - pinch;
      c = brand(u * 1.15 - 0.05) * (1. + glow * 2.6);
      a = uInt2.x * smoothstep(0., 0.07, u) * smoothstep(1., 0.8, u);
      sz = 0.9;
    } else {
      // barrier: a lattice of vertical bars, slightly turned, with one opening
      vec3 T = normalize(vec3(1.0, 0., 0.32));
      vec3 b = vec3(uRib.x * uHW, uRib.y * uHH, 0.);
      vec2 lp = vec2(aP4.x * uHW * 1.35, aP4.y * uHH * 1.2 - uRib.y * uHH);
      float dl = length(lp);
      const float R = 0.36;
      if (dl < R) lp *= R / max(dl, 1e-3) * (1. + abs(aP4.z) * 2.);   // the cut-out piles up on its rim
      float pz = aP4.z;
      if (aP4.z > 5.) { float an = aP4.x * 3.14159 + uTime * 0.15; lp = vec2(cos(an), sin(an)) * (R + aP4.y * 0.03); pz = 0.; }
      p = b + T * lp.x + vec3(0., lp.y, pz);
      float ring = exp(-pow((length(lp) - R) / 0.07, 2.));
      float fade = aP4.z > 5. ? 1. : smoothstep(1.0, 0.5, abs(aP4.y)) * smoothstep(1.0, 0.55, abs(aP4.x));
      c = vec3(0.16, 0.14, 0.62) + vec3(0.7, 0.4, 1.0) * ring * 1.6;
      a = uInt2.x * 1.6 * (0.2 + 0.8 * fade) * (1. + ring + 1.4 * exp(-dl * dl / 2.2));
      sz = 0.85;
    }
  }
}

void main() {
  float s = clamp(uStage, 0., 4.);
  int i0 = int(min(floor(s), 3.));
  float f = s - float(i0);
  vec3 pA, pB, cA, cB; float aA, aB, zA, zB;
  stageAt(i0, pA, cA, aA, zA);
  stageAt(i0 + 1, pB, cB, aB, zB);

  // who leaves first: the cloud collapses onto the outline of the mark;
  // later shapes write themselves from left to right
  float sweep;
  if (i0 == 0) sweep = 1. - clamp(length(aP1.xy) * 2.15, 0., 1.);
  else if (i0 == 3) sweep = clamp(pB.x / (2.6 * uHW) + 0.5, 0., 1.);
  else sweep = clamp((pB.x - uShape.x) / uShape.z + 0.5, 0., 1.);
  float d = 0.3 * aRnd.y + 0.7 * sweep;
  float spread = 0.55;
  float lt = clamp((f - d * spread) / (1. - spread), 0., 1.);
  float e = lt * lt * lt * (lt * (lt * 6. - 15.) + 10.);
  vec3 p = mix(pA, pB, e);

  // in flight: one coherent turn around the mark and a fine shimmer, zero at both ends
  float sw = e * (1. - e) * 4.;
  float dir = (i0 == 1 || i0 == 3) ? -1. : 1.;
  vec2 ctr = i0 == 3 ? vec2(uRib.x * uHW, uRib.y * uHH) : uShape.xy;
  p.xy = ctr + rot(sw * dir * (i0 == 0 ? 0.9 : 0.4)) * (p.xy - ctr);
  p += sw * 0.1 * vec3(sin(p.y * 4.3 + uTime * 0.9 + aRnd.z * 9.), sin(p.x * 3.7 - uTime * 0.8 + aRnd.z * 7.), sin(p.x * 2.3 + p.y * 2.9 + uTime * 0.6));

  vec3 col = mix(cA, cB, e);
  float al = mix(aA, aB, e) * (1. + sw * 0.35);
  float szm = mix(zA, zB, e);

  // a slow light sweep across whatever shape has formed
  float shapeness = clamp(1. - abs(s - clamp(floor(s + 0.5), 1., 3.)) * 2.5, 0., 1.) * step(0.5, s) * step(s, 3.5);
  float band = (p.x - uShape.x) * 0.55 + (p.y - uShape.y) * 0.3 - uSweep;
  al *= 1. + exp(-band * band * 14.) * 1.1 * shapeness;

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
  // keep the energy of sub-pixel points
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

let S = null; // the mounted scene, if any
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export async function mount(canvas, opt = {}) {
  if (S) return S.api;
  const isFlow = () => (typeof opt.flow === 'function' ? opt.flow() : !!opt.flow);
  const phone = !!opt.phone;
  const N = phone ? 30000 : 100000;
  const DPR = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  // production: no synchronous shader-log queries on a program's first use (they stall the main thread)
  renderer.debug.checkShaderErrors = false;
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  // ---- data
  const logo = await sampleLogo(opt.logoImg || opt.logoUrl, N);
  await yieldTask();
  const P0 = new Float32Array(N * 3), C0 = new Float32Array(N * 3);
  buildCloud(N, P0, C0);
  await yieldTask();
  const P2 = new Float32Array(N * 4), P3 = new Float32Array(N * 4), P4 = new Float32Array(N * 4);
  const R = new Float32Array(N * 4);
  const shapeIdx = [];
  for (let k = 0; k < N; k++) {
    const q = rnd();
    if (q < 0.09) {          // dust
      P4[k * 4] = (rnd() * 2 - 1); P4[k * 4 + 1] = (rnd() * 2 - 1); P4[k * 4 + 2] = -5 + rnd() * 6.5; P4[k * 4 + 3] = 2;
      P2[k * 4 + 3] = -1; P3[k * 4 + 3] = -1;
    } else {
      shapeIdx.push(k);
      if (q < 0.31) {        // barrier lattice
        let a = rnd() * 2 - 1, y = rnd() * 2 - 1;
        if (rnd() < 0.78) a = Math.round(a * 17) / 17 + (rnd() - 0.5) * 0.004;
        else y = Math.round(y * 9) / 9 + (rnd() - 0.5) * 0.004;
        if (rnd() < 0.09) { a = rnd() * 2 - 1; y = gauss(); P4[k * 4 + 2] = 9; }   // the rim of the opening
        P4[k * 4] = a; P4[k * 4 + 1] = y; if (P4[k * 4 + 2] !== 9) P4[k * 4 + 2] = (rnd() - 0.5) * 0.06; P4[k * 4 + 3] = 1;
      } else {               // ribbon cross-section offsets
        P4[k * 4] = (rnd() * 2 - 1); P4[k * 4 + 1] = gauss() * 0.5; P4[k * 4 + 2] = rnd(); P4[k * 4 + 3] = 0;
      }
    }
  }
  sampleBubble(P2, shapeIdx);
  await yieldTask();
  sampleLock(P3, shapeIdx);
  await yieldTask();
  for (let k = 0; k < N; k++) {
    R[k * 4] = rnd();
    R[k * 4 + 1] = rnd();
    R[k * 4 + 2] = rnd();
    R[k * 4 + 3] = rnd();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P0, 3));
  geo.setAttribute('aC0', new THREE.BufferAttribute(C0, 3));
  geo.setAttribute('aP1', new THREE.BufferAttribute(logo.pos, 3));
  geo.setAttribute('aC1', new THREE.BufferAttribute(logo.col, 3));
  geo.setAttribute('aP2', new THREE.BufferAttribute(P2, 4));
  geo.setAttribute('aP3', new THREE.BufferAttribute(P3, 4));
  geo.setAttribute('aP4', new THREE.BufferAttribute(P4, 4));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(R, 4));

  const U = {
    uTime: { value: 0 }, uStage: { value: 0 }, uPR: { value: DPR },
    uBase: { value: phone ? 2.1 : 1.75 }, uOpen: { value: 0 }, uAspect: { value: 1 },
    uHW: { value: 1 }, uHH: { value: 1 }, uIntro: { value: 0 },
    uFocus: { value: CAM_Z }, uAper: { value: 0.22 }, uSweep: { value: -9 },
    uShape: { value: new THREE.Vector4() }, uField: { value: new THREE.Vector4() },
    uRib: { value: new THREE.Vector4(0.12, 0.04, 0, 0) },
    uInt: { value: new THREE.Vector4(1.75, 0.8, 0.52, 0.5) },
    uInt2: { value: new THREE.Vector2(0.62, 0.5) },
    uPtr: { value: new THREE.Vector3(0, 0, 0) }, uPtr2: { value: new THREE.Vector3(0, 0, 0) },
  };
  if (phone) { U.uInt.value.set(2.2, 1.15, 0.85, 0.8); U.uInt2.value.set(0.95, 0.75); }

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
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.62, 0.12);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  await yieldTask();

  // ---- layout
  let W = 1, H = 1;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    // reallocating the drawing buffer is a synchronous GPU call: only do it when the size really changed
    if (w !== W || h !== H) {
      W = w; H = h;
      renderer.setSize(W, H, false);
      composer.setPixelRatio(DPR);
      composer.setSize(W, H);
    }
    const aspect = W / H;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const hh = CAM_Z * TAN, hw = hh * aspect;
    U.uAspect.value = aspect; U.uHW.value = hw; U.uHH.value = hh;
    if (aspect >= 1) {
      U.uShape.value.set(hw * 0.38, hh * 0.05, Math.min(2 * hh * 0.76, hw * 0.95), 0);
      U.uField.value.set(hw * 0.3, hh * 0.2, hw * 1.0, hh * 0.92);
      U.uRib.value.set(0.16, 0.06, 0.44, 0);
    } else {
      // flow (touch): a caption sits under the nav and the headline below, so the shapes sit a little lower and smaller
      if (isFlow()) U.uShape.value.set(0, hh * 0.2, Math.min(2 * hw * 0.74, 2 * hh * 0.36), 0);
      else U.uShape.value.set(0, hh * 0.3, Math.min(2 * hw * 0.86, 2 * hh * 0.44), 0);
      U.uField.value.set(0, hh * 0.3, hw * 1.25, hh * 0.62);
      U.uRib.value.set(0.08, 0.2, 0.2, 0);
    }
  }
  await yieldTask();
  resize();
  await yieldTask();
  await warm(renderer, scene, camera);

  // ---- motion state
  const ptr = { tx: 0, ty: 0, active: 0 };
  const sp1 = { x: 0, y: 0, vx: 0, vy: 0 }, sp2 = { x: 0, y: 0, vx: 0, vy: 0 };
  const str = { x: 0, v: 0 };
  const cam = { x: 0, y: 0, vx: 0, vy: 0 };
  let lastPX = 0, lastPY = 0, speed = 0, introStart = -1;
  let target = 0, s = 0, sv = 0;           // stage: scroll target, shown value, velocity
  const focus = new THREE.Vector3();

  function setPointer(nx, ny, active) {
    ptr.tx = nx; ptr.ty = ny; ptr.active = active ? 1 : 0;
  }
  function spring(o, tx, ty, k, c, dt) {
    o.vx += (k * (tx - o.x) - c * o.vx) * dt; o.vy += (k * (ty - o.y) - c * o.vy) * dt;
    o.x += o.vx * dt; o.y += o.vy * dt;
  }

  function draw(dt, still) {
    if (!still) {
      // a critically damped spring from scroll to stage
      const k = 34, c = 2 * Math.sqrt(k);
      sv += (k * (target - s) - c * sv) * dt;
      s += sv * dt;
      if (Math.abs(target - s) < 0.0004 && Math.abs(sv) < 0.0004) { s = target; sv = 0; }
      U.uTime.value += dt;
      // the intro runs on the wall clock so a slow first second cannot stretch it
      const now = performance.now();
      if (introStart < 0) introStart = now;
      const introT = Math.min(1, (now - introStart) / 2600);
      U.uIntro.value = 1 - Math.pow(1 - introT, 4);
      // pointer springs
      spring(sp1, ptr.tx, ptr.ty, 120, 12.5, dt);
      spring(sp2, sp1.x, sp1.y, 26, 7.5, dt);
      const mvx = ptr.tx - lastPX, mvy = ptr.ty - lastPY; lastPX = ptr.tx; lastPY = ptr.ty;
      speed = speed * 0.9 + Math.hypot(mvx, mvy) / Math.max(dt, 1e-3) * 0.1;
      const tgt = ptr.active ? 0.55 + Math.min(speed * 0.35, 0.6) : 0;
      str.v += (40 * (tgt - str.x) - 12.6 * str.v) * dt; str.x += str.v * dt;
      U.uPtr.value.set(sp1.x, sp1.y, Math.max(0, str.x));
      U.uPtr2.value.set(sp2.x, sp2.y, Math.min(0.9, Math.hypot(sp1.vx, sp1.vy) * 0.25) * (ptr.active ? 1 : 0.3));
      // camera: a slow drift, a little pointer parallax, and a dolly on the ribbon
      spring(cam, ptr.active ? ptr.tx : 0, ptr.active ? ptr.ty : 0, 8, 5.6, dt);
      const t = U.uTime.value;
      const dolly = smooth(3, 4, s);
      camera.position.set(0.16 * Math.sin(t * 0.07) + cam.x * 0.28, 0.1 * Math.cos(t * 0.05) + cam.y * 0.18, CAM_Z - 0.7 * dolly);
      camera.lookAt(0, 0, 0);
      U.uSweep.value = ((t * 0.55) % 9) - 4.5;
    } else {
      U.uIntro.value = 1;
      const dolly = smooth(3, 4, s);
      camera.position.set(0, 0, CAM_Z - 0.7 * dolly); camera.lookAt(0, 0, 0);
      U.uSweep.value = -9;
    }
    U.uStage.value = s;
    U.uOpen.value = 1 - smooth(2.72, 2.96, s);
    U.uAper.value = 0.26 - 0.1 * smooth(0.3, 1, s);
    if (bloom) bloom.strength = 0.9 - 0.15 * smooth(0, 1, s) + 0.1 * smooth(3, 4, s);
    composer.render();
    if (opt.onFrame) opt.onFrame(s);
  }

  // ---- loop: runs only between start() and stop()
  let raf = 0, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 24);
    last = now;
    draw(dt, false);
  }
  function start() { if (!raf && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  let lost = false;
  const onLost = (e) => { e.preventDefault(); lost = true; stop(); opt.onLost && opt.onLost(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function setProgress(stage) { target = clamp01(stage / 4) * 4; }   // 0 cloud, 1 mark, 2 bubble, 3 lock, 4 ribbon

  // where the ribbon crosses the barrier, in CSS px inside the canvas (the flood starts there)
  function getFocus() {
    focus.set(U.uRib.value.x * U.uHW.value, U.uRib.value.y * U.uHH.value, 0).project(camera);
    return { x: (focus.x * 0.5 + 0.5) * W, y: (-focus.y * 0.5 + 0.5) * H };
  }

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
    start, stop, setProgress, dispose, resize, setPointer, getFocus,
    stage: () => s,
    setStage: setProgress,
  };
  S = { api };
  return api;
}

export function start() { S && S.api.start(); }
export function stop() { S && S.api.stop(); }
export function setProgress(u) { S && S.api.setProgress(u); }
export function dispose() { S && S.api.dispose(); }

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
