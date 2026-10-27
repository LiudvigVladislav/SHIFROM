// About page controller (EN and RU): the particle entrance (lazy WebGL, paused off screen), the nav theme,
// the mission lit word by word, and the section entrances.
// Nothing follows the scroll position, on any device: the page moves 1:1 with the wheel or the finger.
// The entrance gathers into the mark on a timer; the horizon of light is simply the entrance's lower edge;
// every reveal plays on a timer when it enters the viewport.
// Without JavaScript or WebGL, or with reduced motion, the page is complete: a designed still and a static horizon.

const root = document.documentElement;
const GL = root.classList.contains('gl');           // live entrance
const REDUCED = root.classList.contains('reduced');
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const nav = $('#nav');
const themeMeta = $('meta[name="theme-color"]');
const hero = $('.ab-hero'), canvas = $('.ab-gl'), disc = $('.ab-disc');
const phoneMQ = matchMedia('(max-width: 700px)');
// resolved from this module, so the same script serves about.html and ru/about.html
const LOGO = new URL('../../favicon.png?v=b9180644', import.meta.url).href;
const SOLID = 0.7;          // the disc gradient is solid ground out to 70% of its radius (about.css)

/* ---------- nav: light text on the entrance, dark text once the top of the light has passed under it ---------- */
let navTheme = '';
function setTheme(t) {
  if (t === navTheme) return;
  navTheme = t;
  nav.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
}
// a 1px marker at the crest of the light, watched by an observer (no scroll listener)
const crest = document.createElement('div');
crest.setAttribute('aria-hidden', 'true');
crest.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden';
hero.append(crest);
function placeCrest() {
  // the disc's layout box ignores any transform: its solid core's top is the crest
  crest.style.top = `${Math.round(disc.offsetTop + (disc.offsetHeight / 2) * (1 - SOLID))}px`;
}
const navLine = () => nav.offsetHeight * 0.55;
const checkTheme = () => setTheme(crest.getBoundingClientRect().top > navLine() ? 'dark' : 'light');
let themeIO = null;
function watchCrest() {
  if (themeIO) themeIO.disconnect();
  themeIO = new IntersectionObserver(checkTheme, { rootMargin: `-${Math.round(navLine())}px 0px 0px 0px` });
  themeIO.observe(crest);
}
// once per gesture (not per frame): a safety net for a fling the observer saw mid-flight
addEventListener('scrollend', checkTheme, { passive: true });

/* ---------- words: the mission and the big headings are split so they can arrive word by word ---------- */
function splitWords(el, cls, onWord) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/( +)/)) {
      if (!part) continue;
      if (/^ +$/.test(part)) { frag.append(part); continue; }
      const w = document.createElement('span');
      w.className = cls;
      onWord(w);
      w.textContent = part;
      frag.append(w);
    }
    node.replaceWith(frag);
  }
}

/* ---------- the particle entrance: mounted after first paint, runs only while it can be seen ---------- */
let scene = null, sceneOn = false, heroVisible = true, pending = false;
function sync() {
  if (!scene) return;
  const on = heroVisible && !document.hidden;
  if (on && !sceneOn) { scene.start(); sceneOn = true; }
  else if (!on && sceneOn) { scene.stop(); sceneOn = false; }
}
document.addEventListener('visibilitychange', sync);

async function mountScene() {
  if (scene || pending) return;
  pending = true;
  try {
    const m = await import('./about-particles.js?v=060aa447');
    scene = await m.mount(canvas, {
      phone: phoneMQ.matches, logoUrl: LOGO,
      onLost: fallBackToStill,
    });
    requestAnimationFrame(() => hero.classList.add('is-live'));
    sync();
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

  // a mouse may push the field (it never moves the page); fingers do not drive it
  if (FINE) {
    const onPointer = (e, active) => {
      if (!scene || !heroVisible) return;
      const r = canvas.getBoundingClientRect();
      scene.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, active);
    };
    addEventListener('pointermove', (e) => onPointer(e, true), { passive: true });
    document.addEventListener('pointerleave', (e) => onPointer(e, false));
    addEventListener('blur', () => scene && scene.setPointer(0, 0, false));
  }
}

/* ---------- reveals: each plays once, on a timer, when it enters the viewport ---------- */
if ('IntersectionObserver' in window && !REDUCED) {
  // the mission: each paragraph lights word by word (about 42ms a word)
  const lit = $('[data-lit]');
  if (lit) {
    for (const p of $$('p', lit)) { let i = 0; splitWords(p, 'w', (w) => w.style.setProperty('--i', i++)); }
    root.classList.add('lit-timer');
    const lio = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); lio.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    $$('p', lit).forEach((p) => lio.observe(p));
  }
}
if ('IntersectionObserver' in window) {
  // big headings word by word; text blocks rise; the four points draw their route
  for (const h of $$('[data-words]')) { let k = 0; splitWords(h, 'wd', (w) => w.style.setProperty('--k', k++)); }
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
  $$('[data-rise], [data-pt], [data-words]').forEach((el) => io.observe(el));
}

/* ---------- resize ---------- */
let rt = 0, lastW = innerWidth, lastH = hero.clientHeight;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    placeCrest(); watchCrest(); checkTheme();
    // phones fire resize while the address bar slides; the entrance is sized in svh, so only rebuild when it really changed
    if (scene && (innerWidth !== lastW || hero.clientHeight !== lastH)) scene.resize();
    lastW = innerWidth; lastH = hero.clientHeight;
  }, 140);
});

placeCrest(); watchCrest(); checkTheme();

