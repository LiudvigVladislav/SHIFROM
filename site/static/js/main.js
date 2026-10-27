// Homepage controller. One live mode on every device: nothing is pinned and nothing is driven by the scroll
// position. The page moves 1:1 with the wheel or the finger; each scene plays a timeline when its section is
// about 40% in view and pauses offscreen. There is no scroll listener at all.
//   play   WebGL and motion allowed: the three scenes play on timers.
//   static reduced motion or no WebGL: designed stills (the calm seal cluster stays live under reduced motion).
// Two compositions, chosen by CSS media queries and mirrored here:
//   wide   a fine pointer and more than 960px: copy beside large stages (the approved desktop layouts).
//   flow   touch screens or narrow windows: each stage, then its copy as ordinary text.
import { clamp, PHONE_BEATS, beatAlpha } from './timing.js?v=4e28233b';
import './nav.js?v=8e8e58d7';

const root = document.documentElement;
const WEBGL = root.classList.contains('webgl');
const REDUCED = root.classList.contains('reduced');
const isPlay = () => root.classList.contains('play');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const nav = $('#nav');
const themeMeta = $('meta[name="theme-color"]');
const hero = $('#hero'), film = $('#phone'), bub = $('#seal');
const heroStageEl = $('.hero-stage'), filmStage = $('.film-stage');
const heroBeats = $$('.hero-story .beat');
const filmBeats = $$('.film-beats .fbeat');
const bStage = $('.b-stage'), routeFig = $('.route-figure'), bCanvas = $('.b-gl');
const phoneMQ = matchMedia('(max-width: 700px)');
const FLOW_MQ = matchMedia('(max-width: 960px), (hover: none) and (pointer: coarse)');
const flow = () => FLOW_MQ.matches;
// the scenes draw the brand mark from the nav's own <img>, so the file is fetched once
const markImg = $('.brand-mark');
const markUrl = () => markImg.currentSrc || markImg.src;
const asset = (p) => new URL('../' + p, import.meta.url).href;   // the same script serves / and /ru/

/* ---------- hero captions follow the particle stage (hidden by CSS where the owner asked for it) ---------- */
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const heroBeatState = heroBeats.map(() => -1);
function drawHeroBeats(s) {
  heroBeats.forEach((el, i) => {
    const d = s - (i + 1);
    const vis = 1 - smooth(0.14, 0.42, Math.abs(d));
    const o = Math.round(vis * 1000) / 1000;
    if (o === heroBeatState[i]) return;
    heroBeatState[i] = o;
    const k = 1 - vis;
    el.style.opacity = o;
    el.style.transform = `translate3d(0, ${((d < 0 ? 1 : -1) * k * 34).toFixed(1)}px, 0)`;
    el.style.filter = k > 0.01 ? `blur(${(k * 9).toFixed(2)}px)` : 'none';
    el.style.visibility = o < 0.005 ? 'hidden' : 'visible';
  });
}

/* ---------- the phone film's lines: in the wide composition they swap in time beside the phone;
   in the flow composition they are ordinary text below it ---------- */
const filmBeatState = filmBeats.map(() => '');
function drawFilmBeats(p) {
  const wide = !flow();
  filmBeats.forEach((el, i) => {
    let key = 'flow';
    if (wide) {
      const { a, ain, aout } = beatAlpha(PHONE_BEATS[i], p);
      const q = Math.round(a * 200) / 200;
      const y = aout > 0 ? -aout * 36 : (1 - ain) * 36;
      key = q + ':' + Math.round(y);
      if (filmBeatState[i] === key) return;
      el.style.opacity = q;
      el.style.translate = `0 ${y.toFixed(1)}px`;
      el.style.visibility = q <= 0.001 ? 'hidden' : 'visible';
    } else if (filmBeatState[i] !== key) {
      el.style.opacity = el.style.translate = el.style.visibility = '';
    }
    filmBeatState[i] = key;
  });
}

/* ---------- nav: light text while a dark part of the hero sits under it ---------- */
let navTheme = '';
function setTheme(t) {
  if (t === navTheme) return;
  navTheme = t;
  nav.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
}
{
  const dark = new Set();
  const ioNav = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? dark.add(e.target) : dark.delete(e.target);
    setTheme(dark.size ? 'dark' : 'light');
  }, { rootMargin: '0px 0px -92% 0px' });   // a thin strip at the top of the viewport, where the nav is
  for (const el of [heroStageEl, $('.hero-intro'), ...heroBeats]) ioNav.observe(el);
}
// once the hero has moved at all, content passes under the nav: the dark nav gets a frosted ground (still no
// scroll listener: the hero stage simply stops being fully in view)
new IntersectionObserver(([e]) => nav.classList.toggle('is-scrolled', e.intersectionRatio < 0.985),
  { threshold: [0.985, 1] }).observe(heroStageEl);

/* ---------- scenes: lazy mounting, run only what is on screen ---------- */
const live = { particles: false, phone: false, bubbles: false };
const scenes = {};
const visible = { particles: true, phone: false, bubbles: false };
function sync() {
  for (const k of Object.keys(scenes)) {
    const sc = scenes[k];
    const on = visible[k] && !document.hidden;
    if (on && !sc._on) { sc.start(); sc._on = true; }
    else if (!on && sc._on) { sc.stop(); sc._on = false; }
  }
}
document.addEventListener('visibilitychange', sync);
const ioVis = new IntersectionObserver((entries) => {
  for (const e of entries) visible[e.target.dataset.scene] = e.isIntersecting;
  sync();
});

const factories = {
  particles: () => import('./scenes/particles.js?v=c6f54cdc').then((m) => m.mount($('.hero-gl'), {
    phone: phoneMQ.matches, flow, logoImg: markImg, logoUrl: markUrl(),
    onFrame: (s) => { drawHeroBeats(s); shown('particles'); },
    onLost: () => lose('particles', hero),
  })),
  phone: () => import('./scenes/phone.js?v=df37ff1d').then((m) => m.mount($('.film-gl'), {
    flow, logoImg: markImg, logoUrl: markUrl(), monoUrl: asset('fonts/jetbrains-mono-latin-500-normal.woff2?v=cb182fee'),
    onFrame: (p) => { drawFilmBeats(p); shown('phone'); },
    onLost: () => lose('phone', film),
  })),
  bubbles: () => import('./scenes/bubbles.js?v=e4823c99').then((m) => m.mount(bCanvas, {
    phone: phoneMQ.matches && innerHeight > innerWidth, calm: REDUCED,   // landscape phones get the wide layout
    flow, copyEl: $('.seal-copy'), copyPin: $('.b-seal .b-pin'),
    labels: Object.fromEntries($$('[data-lab]').map((el) => [el.dataset.lab, el])),
    navH: () => nav.offsetHeight,
    onFrame: () => shown('bubbles'),
    onLost: () => lose('bubbles', bub),
  })),
};
const sectionOf = { particles: hero, phone: film, bubbles: bub };
// the designed still stays until the scene has drawn its first real frame; then the canvas fades in over it
function shown(k) { if (live[k] && !sectionOf[k].classList.contains('is-live')) sectionOf[k].classList.add('is-live'); }
const pending = {};
async function mountScene(k) {
  if (scenes[k] || pending[k] || !WEBGL) return;
  pending[k] = true;
  try {
    const api = await factories[k]();
    scenes[k] = api;
    live[k] = true;
    sync();
    playSync();
    if (k === 'bubbles' && REDUCED) api.start();
  } catch (err) {
    console.warn(`The ${k} scene is unavailable; the designed still stays.`, err);
    // the hero scene is also the WebGL check: if it cannot start, the whole page uses the designed stills
    if (k === 'particles' && isPlay()) fallBackToStatic();
  } finally { pending[k] = false; }
}
function lose(k, section) {
  live[k] = false;
  delete scenes[k];
  section.classList.remove('is-live');
  playSync();
}
function fallBackToStatic() {
  root.classList.remove('play', 'webgl'); root.classList.add('static');
  for (const k of Object.keys(scenes)) { scenes[k].dispose(); delete scenes[k]; }
  for (const k of Object.keys(live)) live[k] = false;
  playSync();
}

// The head script only guesses WebGL (a real check there would block the first paint). This is the real check,
// run after the first paint and before any scene is built: a failed context means stills, quietly.
function webglWorks() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}

const ioMount = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) mountScene(e.target.dataset.scene);
}, { rootMargin: '250% 0px 250% 0px' });
// After the hero is up, the other scenes are imported and built in idle time, one at a time and in small steps,
// so no scene is ever assembled while the reader is scrolling towards it.
const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
function idleMountRest() {
  idle(async () => {
    await mountScene('phone');
    idle(() => mountScene('bubbles'));
  });
}

hero.dataset.scene = 'particles'; film.dataset.scene = 'phone'; bub.dataset.scene = 'bubbles';
if (isPlay()) {
  ioVis.observe(hero); ioVis.observe(film); ioVis.observe(bub);
  // the hero boots as soon as this module runs (the DOM is parsed; its modules are preloaded), after the first
  // paint; the other scenes are imported and built in idle time
  requestAnimationFrame(() => setTimeout(async () => {
    if (!webglWorks()) { fallBackToStatic(); return; }
    ioMount.observe(film); ioMount.observe(bub);
    await mountScene('particles');
    if (isPlay()) idleMountRest();
  }, 0));
} else if (WEBGL && REDUCED) {
  // reduced motion: the seal cluster stays live but calm (no travel); everything else is a still
  requestAnimationFrame(() => setTimeout(() => {
    if (!webglWorks()) { root.classList.remove('webgl'); return; }
    ioVis.observe(bub);
    ioMount.observe(bub);
  }, 0));
}

/* ---------- pointer for the particle field (a fine pointer only) ---------- */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const onPointer = (e, active) => {
    if (!scenes.particles || !visible.particles) return;
    scenes.particles.setPointer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, active);
  };
  addEventListener('pointermove', (e) => onPointer(e, true), { passive: true });
  document.addEventListener('pointerleave', (e) => onPointer(e, false));
  addEventListener('blur', () => scenes.particles && scenes.particles.setPointer(0, 0, false));
}

/* ---------- resize ---------- */
let rt = 0, lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    // iOS resizes the viewport height whenever the address bar slides: only a width change (or a desktop
    // window resize) rebuilds the scene buffers
    if (innerWidth !== lastW || !matchMedia('(pointer: coarse)').matches) {
      for (const k of Object.keys(scenes)) scenes[k].resize && scenes[k].resize();
    }
    lastW = innerWidth;
    drawFilmBeats(TL.phone.t > 0 ? clamp((TL.phone.t - 0.8) / PHONE_LEN) : 0);
  }, 140);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { scenes.bubbles && scenes.bubbles.resize(); });

/* ======================================================================
   TIMELINES: seconds -> scene state. Each plays once when its stage is about 40% in view.
   ====================================================================== */
const ease = (t) => t * t * (3 - 2 * t);
function keyed(K, t) {
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
    const [t0, v0] = K[i - 1], [t1, v1] = K[i];
    return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return K[K.length - 1][1];
}
// the hero rests on the cloud while the headline is read, then plays every shape once and ends on the ribbon
const HERO_TL = [[0, 0], [2.4, 0], [4.2, 1], [6.8, 1], [8.4, 2], [11, 2], [12.6, 3], [15.2, 3], [17, 4]];
// the conversation lines up and seals, becomes a stream, then the block drops and it takes the REALITY bend
const ROUTE_TL = [[0, 0.45], [4.2, 1.25], [5, 1.25], [8.5, 2.3], [10.7, 2.9]];
const PHONE_LEN = 16;      // the phone film plays its whole story in 16 s
const TL = {
  hero: { t: 0, seen: false, end: 17.5, apply(t) { scenes.particles && scenes.particles.setProgress(keyed(HERO_TL, t)); } },
  phone: { t: 0, seen: false, end: PHONE_LEN + 1, apply(t) {
    scenes.phone && scenes.phone.setProgress(clamp((t - 0.8) / PHONE_LEN), ease(clamp(t / 1.4)));
  } },
  route: { t: 0, seen: false, end: 11, apply(t) { scenes.bubbles && scenes.bubbles.setProgress(keyed(ROUTE_TL, t)); } },
};
const tlScene = { hero: 'particles', phone: 'phone', route: 'bubbles' };
let tickRaf = 0, tickLast = 0;
function running(k) { return TL[k].seen && live[tlScene[k]] && !document.hidden && TL[k].t < TL[k].end && (k !== 'route' || zone === 'route'); }
function tick(now) {
  const dt = Math.min(0.05, (now - tickLast) / 1000); tickLast = now;
  let any = false;
  for (const k of Object.keys(TL)) if (running(k)) { TL[k].t += dt; TL[k].apply(TL[k].t); any = true; }
  tickRaf = any ? requestAnimationFrame(tick) : 0;
}
function playSync() {
  for (const k of Object.keys(TL)) if (live[tlScene[k]] && (k !== 'route' || zone === 'route')) TL[k].apply(TL[k].t);
  if (zone === 'seal' && scenes.bubbles) scenes.bubbles.setProgress(0);
  const want = Object.keys(TL).some(running);
  if (want && !tickRaf) { tickLast = performance.now(); tickRaf = requestAnimationFrame(tick); }
  else if (!want && tickRaf) { cancelAnimationFrame(tickRaf); tickRaf = 0; }
}

// Bubbles: one canvas. Wide: it stays in the seal stage, which holds still under both beats (CSS), and the zone
// follows the copy. Flow: there are two stages (seal, route) and it moves into whichever is more in view.
let zone = 'seal';
const ratio = { seal: 0, sealCopy: 0, route: 0 };
const bSeal = $('.b-seal'), labEls = $$('[data-lab]');
function hostGl() {
  const host = zone === 'route' && flow() ? routeFig : bStage;
  if (bCanvas.parentNode !== host) {
    host.prepend(bCanvas); scenes.bubbles && scenes.bubbles.resize();
    // the stage it left fades to its still (CSS); the canvas fades in here instead of popping
    if (!REDUCED && bCanvas.animate) bCanvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }
  bStage.classList.toggle('holds-gl', host === bStage); routeFig.classList.toggle('holds-gl', host === routeFig);
  const labHost = flow() ? routeFig : bStage;
  for (const el of labEls) if (el.parentNode !== labHost) labHost.append(el);
}
function setZone(z) {
  if (z === zone) return;
  zone = z;
  hostGl();
  playSync();
}

if (isPlay()) {
  hostGl();
  FLOW_MQ.addEventListener('change', hostGl);
  const ioPlay = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const k = e.target.dataset.tl;
      if (k in ratio) ratio[k] = e.intersectionRatio;
      if (k in TL) TL[k].seen = e.intersectionRatio >= 0.38;   // plays from about 40% in view, pauses below
    }
    // the held wide stage is always fully in view, so there the seal copy says how far the page has moved
    const seal = flow() ? ratio.seal : ratio.sealCopy;
    if (ratio.route > seal && ratio.route >= 0.2) setZone('route');
    else if (seal > ratio.route && seal >= 0.2) setZone('seal');
    playSync();
  }, { threshold: [0, 0.2, 0.35, 0.4, 0.5, 0.65, 0.8, 1] });
  heroStageEl.dataset.tl = 'hero'; filmStage.dataset.tl = 'phone'; bStage.dataset.tl = 'seal'; bSeal.dataset.tl = 'sealCopy'; routeFig.dataset.tl = 'route';
  for (const el of [heroStageEl, filmStage, bStage, bSeal, routeFig]) ioPlay.observe(el);
  document.addEventListener('visibilitychange', playSync);
}
drawFilmBeats(0);

