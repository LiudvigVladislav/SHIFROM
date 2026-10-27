// Page controller. Two live modes:
//   gl   (fine pointer): scroll scrubs the three scenes, beat lines, the dark-to-light flood and the nav theme.
//   play (touch screens): nothing is pinned or scroll-driven; each scene plays a timeline when its section is
//        about 40% in view and pauses offscreen. No scroll listener at all.
// Both: lazy mounting (one WebGL context per scene, three at most), offscreen pause.
import { clamp, smooth, heroStage, FLOOD, PHONE_BEATS, beatAlpha } from './timing.js?v=efb2bbe9';
import './nav.js?v=8e8e58d7';

const root = document.documentElement;
const GL = root.classList.contains('gl');           // scroll-scrubbed scenes (fine pointer)
const PLAY = root.classList.contains('play');       // timed scenes (touch)
const TOUCH = root.classList.contains('touch');
const WEBGL = root.classList.contains('webgl');
const REDUCED = root.classList.contains('reduced');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const nav = $('#nav');
const themeMeta = $('meta[name="theme-color"]');
const hero = $('#hero'), film = $('#phone'), bub = $('#seal');
const heroStageEl = $('.hero-stage');
const heroBeats = $$('.hero-story .beat');
const filmBeats = $$('.film-beats .fbeat');
const floodEl = $('.hero-flood'), disc = $('.flood-disc'), fill = $('.flood-fill');
const sealCopy = $('.seal-copy'), routeCopy = $('.route-copy'), heroIntro = $('.hero-intro');
const phoneMQ = matchMedia('(max-width: 700px)');
// assets resolve from this module, so the same script serves / and /ru/
const asset = (p) => new URL('../' + p, import.meta.url).href;

/* ---------- metrics (document coordinates), refreshed on resize ---------- */
const M = { vh: innerHeight, sc: 1, hero: 0, heroH: 0, film: 0, filmH: 0, bub: 0, bubH: 0 };
function measure() {
  M.vh = heroStageEl.clientHeight || innerHeight;
  // phones run the same story on shorter pins: one screen of thumb travel covers 1/0.8 of a desktop screen
  M.sc = phoneMQ.matches ? 0.8 : 1;
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  M.hero = top(hero); M.heroH = hero.offsetHeight;
  M.film = top(film); M.filmH = film.offsetHeight;
  M.bub = top(bub); M.bubH = bub.offsetHeight;
  M.floodBand = floodEl.offsetHeight;
}

/* ---------- hero beat lines: they follow the same stage value as the particles ---------- */
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

/* ---------- phone film beat lines ---------- */
const filmBeatState = filmBeats.map(() => '');
function drawFilmBeats(p) {
  filmBeats.forEach((el, i) => {
    const { a, ain, aout } = beatAlpha(PHONE_BEATS[i], p);
    const q = Math.round(a * 200) / 200;
    const y = aout > 0 ? -aout * 36 : (1 - ain) * 36;
    const key = q + ':' + Math.round(y);
    if (filmBeatState[i] === key) return;
    filmBeatState[i] = key;
    el.style.opacity = q;
    el.style.translate = `0 ${y.toFixed(1)}px`;
    el.style.visibility = q <= 0.001 ? 'hidden' : 'visible';
  });
}

/* an element's opacity from a second source (cached, so scroll frames write only on change) */
function setOpacity(el, o, key) {
  o = Math.round(o * 200) / 200;
  const k = '_o_' + key;
  if (el[k] === o) return;
  el[k] = o;
  if (key === 'flood') el.style.setProperty('--flood-o', o);
  else { el.style.opacity = o; el.style.visibility = o < 0.005 ? 'hidden' : 'visible'; }
}

/* ---------- the flood: light pours out of the barrier's opening ---------- */
let floodF = -1, focus = null, lightAtNav = false;
function setFlood(f) {
  if (f === floodF) return;
  floodF = f;
  if (f <= 0) { floodEl.style.visibility = 'hidden'; focus = null; lightAtNav = false; return; }
  floodEl.style.visibility = 'visible';
  if (!focus) {
    const w = floodEl.clientWidth, h = floodEl.clientHeight;
    focus = (scenes.particles && scenes.particles.getFocus()) || (phoneMQ.matches ? { x: w * 0.54, y: h * 0.4 } : { x: w * 0.58, y: h * 0.47 });
  }
  const s = 0.02 + Math.pow(f, 1.35) * 2.05;   // the light covers the screen just as the hero lets go
  // the nav turns light the moment the disc's bright rim reaches it (the disc is 120vmax across)
  lightAtNav = 0.66 * 0.6 * Math.max(innerWidth, innerHeight) * s >= focus.y - nav.offsetHeight;
  disc.style.transform = `translate3d(${focus.x.toFixed(1)}px, ${focus.y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  fill.style.opacity = smooth(0.86, 1, f).toFixed(3);
}

/* the light only pours once the particles have actually formed the ribbon (a fast scroll can outrun them) */
let floodRaw = 0;
function applyFlood() {
  const s = live.particles && scenes.particles ? scenes.particles.stage() : 4;
  setFlood(floodRaw * smooth(3.55, 3.95, s));
  covered = floodF >= 1;
}

/* ---------- nav: light text on the dark entrance, dark text after the flood ---------- */
let navTheme = '';
function setTheme(t) {
  if (t === navTheme) return;
  navTheme = t;
  nav.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
}

/* ---------- scroll -> everything ---------- */
const live = { particles: false, phone: false, bubbles: false };
const scenes = {};
let ticking = false;
function update() {
  ticking = false;
  if (TOUCH) { sync(); return; }
  const y = scrollY, vh = M.vh;
  let dark;
  if (GL) {
    const u = (y - M.hero) / vh / M.sc;
    if (scenes.particles) scenes.particles.setProgress(u);
    if (!live.particles) drawHeroBeats(heroStage(u));
    // phones run a shorter story, so the intro copy steps aside before the mark forms behind it
    if (M.sc < 1) setOpacity(heroIntro, 1 - smooth(0.08, 0.4, (y - M.hero) / vh), 'k');
    else setOpacity(heroIntro, 1, 'k');
    floodRaw = smooth(FLOOD[0], FLOOD[1], u);
    applyFlood();
    setOpacity(heroBeats[3], 1 - smooth(FLOOD[0], FLOOD[0] + 0.14, u), 'flood');
    dark = !lightAtNav && y < M.hero + M.heroH;   // flip once the light has reached the nav

    const span = Math.max(1, M.filmH - vh);
    const p = clamp((y - M.film) / span);
    const enter = clamp(1 - (M.film - y) / vh);
    if (scenes.phone) scenes.phone.setProgress(p, enter);
    if (!live.phone) drawFilmBeats(p);
  } else {
    dark = y + 40 < M.hero + M.heroH - M.floodBand * 0.45;
  }
  const ub = (y - M.bub) / vh / M.sc;
  if (scenes.bubbles) scenes.bubbles.setProgress(ub);
  if (GL) {
    // the seal copy steps aside as the conversation turns into a stream; the route copy arrives with the route
    setOpacity(sealCopy, 1 - smooth(1.1, 1.38, ub), 'k');
    setOpacity(routeCopy, M.sc < 1 ? smooth(1.92, 2.2, ub) : smooth(1.6, 2.02, ub), 'k');
  }
  setTheme(dark ? 'dark' : 'light');
  sync();
}
function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
// touch screens never listen to scroll: the nav theme and the scenes follow IntersectionObservers instead
if (!TOUCH) addEventListener('scroll', schedule, { passive: true });

/* ---------- run only what is on screen ---------- */
const visible = { particles: true, phone: false, bubbles: false };
let covered = false;
function sync() {
  for (const k of Object.keys(scenes)) {
    const sc = scenes[k];
    const on = visible[k] && !document.hidden && !(k === 'particles' && covered);
    if (on && !sc._on) { sc.start(); sc._on = true; }
    else if (!on && sc._on) { sc.stop(); sc._on = false; }
  }
}
document.addEventListener('visibilitychange', sync);
const ioVis = new IntersectionObserver((entries) => {
  for (const e of entries) visible[e.target.dataset.scene] = e.isIntersecting;
  sync();
}, { rootMargin: '0px' });

/* ---------- lazy mounting ---------- */
const hasGL = () => WEBGL;
const factories = {
  particles: () => import('./scenes/particles.js?v=88d93cc4').then((m) => m.mount($('.hero-gl'), {
    phone: phoneMQ.matches, flow: PLAY, logoUrl: asset('favicon.png?v=b9180644'),
    onFrame: (s) => {
      drawHeroBeats(s);
      if (GL && floodRaw > 0) { applyFlood(); setTheme(!lightAtNav && scrollY < M.hero + M.heroH ? 'dark' : 'light'); sync(); }
    },
    onLost: () => lose('particles', hero),
  })),
  phone: () => import('./scenes/phone.js?v=03323ef5').then((m) => m.mount($('.film-gl'), {
    flow: PLAY, logoUrl: asset('favicon.png?v=b9180644'), monoUrl: asset('fonts/jetbrains-mono-latin-500-normal.woff2?v=cb182fee'),
    onFrame: (p) => { if (GL) drawFilmBeats(p); },
    onLost: () => lose('phone', film),
  })),
  bubbles: () => import('./scenes/bubbles.js?v=aa817ea3').then((m) => m.mount($('.b-gl'), {
    phone: phoneMQ.matches && innerHeight > innerWidth, calm: REDUCED,   // landscape phones get the wide layout
    flow: PLAY,
    copyEl: PLAY ? null : $('.seal-copy'), copyPin: PLAY ? null : $('.b-seal .b-pin'),
    labels: Object.fromEntries($$('[data-lab]').map((el) => [el.dataset.lab, el])),
    navH: () => nav.offsetHeight,
    onLost: () => lose('bubbles', bub),
  })),
};
const sectionOf = { particles: hero, phone: film, bubbles: bub };
const liveClass = 'is-live';
const pending = {};
async function mountScene(k) {
  if (scenes[k] || pending[k] || !hasGL()) return;
  pending[k] = true;
  try {
    const api = await factories[k]();
    scenes[k] = api;
    live[k] = true;
    requestAnimationFrame(() => sectionOf[k].classList.add(liveClass));
    update();
    if (PLAY) playSync();
    if (k === 'bubbles' && REDUCED) api.start();
  } catch (err) {
    console.warn(`The ${k} scene is unavailable; the designed still stays.`, err);
    if (k === 'particles' && GL) fallBackToStatic();
  } finally { pending[k] = false; }
}
function lose(k, section) {
  live[k] = false;
  delete scenes[k];
  section.classList.remove(liveClass);
  update();
}
// if the first scene cannot start, the whole page uses the designed stills instead of pinned films
function fallBackToStatic() {
  root.classList.remove('gl', 'play'); root.classList.add('static');
  for (const k of Object.keys(scenes)) { scenes[k].dispose(); delete scenes[k]; }
  measure(); update();
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
if (GL || PLAY) {
  ioVis.observe(hero); ioVis.observe(film); ioVis.observe(bub);
  // the first scene starts after first paint; the others mount as they approach
  const bootHero = () => requestAnimationFrame(() => setTimeout(async () => {
    ioMount.observe(film); ioMount.observe(bub);
    await mountScene('particles');
    idleMountRest();
  }, 0));
  if (document.readyState === 'complete') bootHero(); else addEventListener('load', bootHero, { once: true });
} else if (WEBGL && REDUCED) {
  // reduced motion: the seal cluster stays live but calm (no travel); everything else is a still
  ioVis.observe(bub);
  ioMount.observe(bub);
}

/* ---------- pointer for the particle field ---------- */
if (GL) {
  const onPointer = (e, active) => {
    if (!scenes.particles || !visible.particles) return;
    scenes.particles.setPointer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, active);
  };
  addEventListener('pointermove', (e) => onPointer(e, true), { passive: true });
  addEventListener('pointerdown', (e) => onPointer(e, true), { passive: true });
  document.addEventListener('pointerleave', (e) => onPointer(e, false));
  addEventListener('blur', () => scenes.particles && scenes.particles.setPointer(0, 0, false));
}

/* ---------- resize ---------- */
let rt = 0, lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    // phones fire resize when the toolbar slides; only a width change needs the scenes rebuilt
    measure();
    // (iOS: the address bar resizes the viewport height on every scroll direction change)
    if (innerWidth !== lastW || !matchMedia('(pointer: coarse)').matches) {
      for (const k of Object.keys(scenes)) scenes[k].resize && scenes[k].resize();
      focus = null; floodF = -1;
    }
    lastW = innerWidth;
    update();
  }, 140);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); scenes.bubbles && scenes.bubbles.resize(); update(); });

/* ======================================================================
   TOUCH: timelines instead of scroll, a nav theme from an observer
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
// seconds -> value. The hero rests on the cloud while the headline is read, then plays every shape once.
const HERO_TL = [[0, 0], [2.4, 0], [4.2, 1], [6.8, 1], [8.4, 2], [11, 2], [12.6, 3], [15.2, 3], [17, 4]];
// the conversation lines up and seals, becomes a stream, then the block drops and it takes the REALITY bend
const ROUTE_TL = [[0, 0.45], [4.2, 1.25], [5, 1.25], [8.5, 2.3], [10.7, 2.9]];
const PHONE_LEN = 16;      // the phone film plays its whole story in 16 s
const TL = {
  hero: { t: 0, seen: false, end: 17.5, apply(t) { scenes.particles && scenes.particles.setStage(keyed(HERO_TL, t)); } },
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

// Bubbles on touch: one canvas, two normal-height sections. It moves into whichever stage is more in view.
const bStage = $('.b-stage'), routeFig = $('.route-figure'), bCanvas = $('.b-gl');
let zone = 'seal';
const ratio = { seal: 0, route: 0 };
function setZone(z) {
  if (z === zone) return;
  zone = z;
  const host = z === 'route' ? routeFig : bStage;
  if (bCanvas.parentNode !== host) { host.prepend(bCanvas); scenes.bubbles && scenes.bubbles.resize(); }
  bStage.classList.toggle('holds-gl', host === bStage); routeFig.classList.toggle('holds-gl', host === routeFig);
  playSync();
}

if (PLAY) {
  bStage.classList.add('holds-gl');
  const thresholds = [0, 0.2, 0.35, 0.4, 0.5, 0.65, 0.8, 1];
  const ioPlay = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const k = e.target.dataset.tl;
      if (k === 'seal' || k === 'route') ratio[k] = e.intersectionRatio;
      if (k !== 'seal') TL[k].seen = e.intersectionRatio >= 0.38;   // plays from about 40% in view, pauses below
    }
    if (ratio.route > ratio.seal && ratio.route >= 0.2) setZone('route');
    else if (ratio.seal > ratio.route && ratio.seal >= 0.2) setZone('seal');
    playSync();
  }, { threshold: thresholds });
  heroStageEl.dataset.tl = 'hero'; $('.film-stage').dataset.tl = 'phone'; bStage.dataset.tl = 'seal'; routeFig.dataset.tl = 'route';
  for (const el of [heroStageEl, $('.film-stage'), bStage, routeFig]) ioPlay.observe(el);
  document.addEventListener('visibilitychange', playSync);
}

if (TOUCH) {
  // the nav is dark while a dark part of the hero sits under it (a thin strip at the top of the viewport)
  const dark = new Set();
  const ioNav = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? dark.add(e.target) : dark.delete(e.target);
    setTheme(dark.size ? 'dark' : 'light');
  }, { rootMargin: '0px 0px -92% 0px' });
  ioNav.observe(heroStageEl);
  if (root.classList.contains('static')) { ioNav.observe($('.hero-intro')); $$('.hero-story .beat').forEach((b) => ioNav.observe(b)); }
}

measure();
update();

