// About page controller: the particle entrance (lazy WebGL, paused off screen), the flood of light on scroll,
// the nav theme, the mission lit word by word, and the section entrances.
// Without JavaScript or WebGL, or with reduced motion, the page is complete: a designed still and a static horizon.
// Touch screens (hover: none, pointer: coarse; iPads included): nothing follows the scroll position. The page scrolls 1:1,
// the horizon stays the entrance's lower edge, and every reveal plays on a timer when it enters the viewport.

const root = document.documentElement;
const GL = root.classList.contains('gl');           // live entrance
const REDUCED = root.classList.contains('reduced');
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
const SCROLL_LINKED = !TOUCH && !REDUCED;            // desktop with a fine pointer: the flood and the mission follow the scroll
root.classList.toggle('touch-ui', TOUCH);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const nav = $('#nav');
const themeMeta = $('meta[name="theme-color"]');
const hero = $('.ab-hero'), stage = $('.ab-stage'), canvas = $('.ab-gl'), disc = $('.ab-disc');
const phoneMQ = matchMedia('(max-width: 700px)');
// resolved from this module, so the same script serves about.html and ru/about.html
const LOGO = new URL('../../favicon.png?v=b9180644', import.meta.url).href;
const SOLID = 0.7;          // the disc gradient is solid ground out to 70% of its radius (about.css)

/* ---------- metrics, refreshed on resize ---------- */
const M = { vh: innerHeight, top: 0, W: 1, H: 1, cx: 0, cy: 0, A: 1, B: 1, yEnd: 1, sEnd: 1 };
function measure() {
  M.vh = innerHeight;
  M.top = hero.getBoundingClientRect().top + scrollY;
  M.W = hero.clientWidth; M.H = hero.clientHeight;
  // the disc's layout box ignores its transform, so this is its rest geometry, in hero coordinates
  const w = disc.offsetWidth, h = disc.offsetHeight;
  M.cx = disc.offsetLeft + w / 2; M.cy = disc.offsetTop + h / 2;
  M.A = (w / 2) * SOLID; M.B = (h / 2) * SOLID;
  // the light has covered the entrance after half a screen of scroll: both top corners are inside it by then
  M.yEnd = M.H * 0.52;
  const need = (x, y) => Math.hypot((x - M.cx) / M.A, (y - M.cy) / M.B);
  M.sEnd = Math.max(need(0, M.yEnd), need(M.W, M.yEnd)) * 1.03;
}

/* ---------- nav: light text on the entrance, dark text once the light has reached it ---------- */
let navTheme = '';
function setTheme(t) {
  if (t === navTheme) return;
  navTheme = t;
  nav.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
}

/* ---------- the mission, lit word by word as it is read ---------- */
const lit = $('[data-lit]');
const words = [];
if (lit && !REDUCED) {
  for (const p of $$('p', lit)) {
    let i = 0;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/( +)/)) {
        if (!part) continue;
        if (/^ +$/.test(part)) { frag.append(part); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        if (TOUCH) w.style.setProperty('--i', i++);
        w.textContent = part;
        frag.append(w);
        words.push({ el: w, o: -1 });
      }
      node.replaceWith(frag);
    }
  }
}
function drawLit() {
  if (!words.length || TOUCH) return;
  const r = lit.getBoundingClientRect();
  // starts as the statement rises past 90% of the screen, done as its last line passes 72%
  const a = M.vh * 0.9, b = M.vh * 0.72;
  const p = clamp((a - r.top) / Math.max(1, r.height + a - b));
  const n = words.length, band = 7;
  const head = p * (n + band);
  for (let i = 0; i < n; i++) {
    const k = clamp((head - i) / band);
    const o = Math.round((0.2 + 0.8 * k) * 100) / 100;
    const wd = words[i];
    if (wd.o !== o) { wd.o = o; wd.el.style.opacity = o; }
  }
}

/* ---------- scroll -> flood, parallax, nav, mission ---------- */
let ticking = false, covered = false, floodF = -1;
function update() {
  ticking = false;
  const y = scrollY - M.top;
  let s = 1;
  if (SCROLL_LINKED) {
    // the light grows slowly at first, then floods: the entrance is covered after M.yEnd of scroll
    const f = clamp(y / M.yEnd);
    s = 1 + (M.sEnd - 1) * Math.pow(f, 1.6);
    if (f !== floodF) {
      floodF = f;
      disc.style.transform = f > 0 ? `scale(${s.toFixed(4)})` : '';
      // the field lags a little behind the page, so the mark lingers as the light rises
      stage.style.transform = y > 0 ? `translate3d(0, ${(y * 0.32).toFixed(1)}px, 0)` : '';
      if (scene) scene.setProgress(f);
    }
    covered = f >= 1;
  }
  const crest = M.cy - M.B * s - y;   // the top of the light, in viewport pixels
  setTheme(crest > nav.offsetHeight * 0.55 && y < M.H ? 'dark' : 'light');
  drawLit();
  sync();
}
function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
if (!TOUCH) addEventListener('scroll', schedule, { passive: true });

/* ---------- touch: no scroll listener at all ---------- */
let crestMark = null;
function placeCrest() {
  // a 1px marker at the top of the light; the nav turns light once it has passed under the nav
  if (!crestMark) {
    crestMark = document.createElement('div');
    crestMark.setAttribute('aria-hidden', 'true');
    crestMark.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden';
    hero.append(crestMark);
  }
  crestMark.style.top = `${Math.round(M.cy - M.B)}px`;
}
if (TOUCH) {
  if (words.length) {
    root.classList.add('lit-timer');
    const lio = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); lio.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    $$('p', lit).forEach((p) => lio.observe(p));
  }
}

/* ---------- the particle entrance: mounted after first paint, runs only while it can be seen ---------- */
let scene = null, sceneOn = false, heroVisible = true, pending = false;
function sync() {
  if (!scene) return;
  const on = heroVisible && !document.hidden && !covered;
  if (on && !sceneOn) { scene.start(); sceneOn = true; }
  else if (!on && sceneOn) { scene.stop(); sceneOn = false; }
}
document.addEventListener('visibilitychange', sync);

async function mountScene() {
  if (scene || pending) return;
  pending = true;
  try {
    const m = await import('./about-particles.js?v=3eb8d798');
    scene = await m.mount(canvas, {
      phone: phoneMQ.matches, logoUrl: LOGO,
      onLost: fallBackToStill,
    });
    requestAnimationFrame(() => hero.classList.add('is-live'));
    update();
  } catch (err) {
    console.warn('The particle entrance is unavailable; the designed still stays.', err);
    fallBackToStill();
  } finally { pending = false; }
}
function fallBackToStill() {
  if (scene) { try { scene.dispose(); } catch (e) { /* the context is already gone */ } }
  scene = null; sceneOn = false;
  hero.classList.remove('is-live');
  root.classList.remove('gl'); root.classList.add('static');
}

if (GL) {
  new IntersectionObserver((entries) => {
    for (const e of entries) heroVisible = e.isIntersecting;
    sync();
  }).observe(hero);
  const boot = () => requestAnimationFrame(() => setTimeout(mountScene, 0));
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot, { once: true });

  if (!TOUCH) {
  const onPointer = (e, active) => {
    if (!scene || !heroVisible) return;
    const r = canvas.getBoundingClientRect();
    scene.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, active);
  };
  addEventListener('pointermove', (e) => onPointer(e, true), { passive: true });
  addEventListener('pointerdown', (e) => onPointer(e, true), { passive: true });
  document.addEventListener('pointerleave', (e) => onPointer(e, false));
  // a finger has no hover: once it lifts (or the swipe turns into a scroll) the field lets go
  const release = (e) => { if (e.pointerType !== 'mouse') onPointer(e, false); };
  addEventListener('pointerup', release, { passive: true });
  addEventListener('pointercancel', release, { passive: true });
  addEventListener('blur', () => scene && scene.setPointer(0, 0, false));
  }
}

/* ---------- section entrances: each part rises once as it arrives; big headings word by word ---------- */
const risers = $$('[data-rise], [data-pt], [data-words]');
if ('IntersectionObserver' in window) {
  for (const h of $$('[data-words]')) {
    let k = 0;
    for (const node of [...h.childNodes]) {
      if (node.nodeType !== 3) continue;
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/( +)/)) {
        if (!part) continue;
        if (/^ +$/.test(part)) { frag.append(part); continue; }
        const w = document.createElement('span');
        w.className = 'wd';
        w.style.setProperty('--k', k++);
        w.textContent = part;
        frag.append(w);
      }
      node.replaceWith(frag);
    }
  }
  root.classList.add('reveal');
  const io = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.hasAttribute('data-rise')) el.style.transitionDelay = `${k * 80}ms`;
      k++;
      el.classList.add('in');
      io.unobserve(el);
      // the delay belongs to the entrance only; hover and focus stay immediate afterwards
      el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  risers.forEach((el) => io.observe(el));
}

/* ---------- resize ---------- */
let rt = 0, lastW = innerWidth, lastH = hero.clientHeight;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    measure(); floodF = -1;
    // phones fire resize while the address bar slides; the entrance is sized in svh, so only rebuild when it really changed
    if (scene && (innerWidth !== lastW || hero.clientHeight !== lastH)) scene.resize();
    lastW = innerWidth; lastH = hero.clientHeight;
    if (TOUCH) placeCrest(); else update();
  }, 140);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); floodF = -1; if (TOUCH) placeCrest(); else update(); });

measure();
if (TOUCH) {
  placeCrest();
  const navLine = () => nav.offsetHeight * 0.55;
  new IntersectionObserver(([e]) => {
    setTheme(e.boundingClientRect.top > navLine() ? 'dark' : 'light');
  }, { rootMargin: `-${Math.round(navLine())}px 0px 0px 0px` }).observe(crestMark);
  const checkTheme = () => setTheme(crestMark.getBoundingClientRect().top > navLine() ? 'dark' : 'light');
  checkTheme();
  // once per gesture (not per frame): a safety net for a fling the observer saw mid-flight
  addEventListener('scrollend', checkTheme, { passive: true });
} else update();

