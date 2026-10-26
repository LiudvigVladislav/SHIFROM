// Roadmap page controller. The ledger is the content and works without any of this.
// Fine pointer (desktop): scroll -> the ledger row at the reading line -> the pinned track graph's camera;
//   rows and nodes highlight each other on hover; the nav turns light where the page floods back to the light ground.
// Touch (hover: none, pointer: coarse): nothing follows scroll and nothing pins. The graph is a figure at the top
//   that draws itself on when seen; tapping a row (or a node) frames that node with a short time-based move, and a
//   small «show on graph» link in that row scrolls up to it on request; the iOS node lights up (time-based) when
//   "Why iOS comes next" comes into view. No scroll listeners: observers only.
const root = document.documentElement;
const GL = root.classList.contains('gl');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const rm = $('.rm');
const stage = $('.rm-stage');
const canvas = $('.rm-gl');
const rows = $$('.lg-row');
const whyAnchor = $('.rm-why-h');
const flood = $('.rm-flood');
const nav = $('#nav');
const themeMeta = $('meta[name="theme-color"]');
const phoneMQ = matchMedia('(max-width: 700px)');
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;   // decided once, like the gl/static mode
if (TOUCH) root.classList.add('touch');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------- metrics, in document coordinates ---------- */
const M = { line: 0, c: [], why: 0 };
function measure() {
  const vh = innerHeight;
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  if (phoneMQ.matches) {
    const band = stage.getBoundingClientRect();
    const freeTop = parseFloat(getComputedStyle(stage).top) + band.height;
    M.line = freeTop + (vh - freeTop) * 0.4;
  } else M.line = vh * 0.5;
  M.c = rows.map((el) => top(el) + el.offsetHeight / 2);
  M.why = top(whyAnchor) + whyAnchor.offsetHeight / 2;
}
// strings the graph draws itself; the ledger, legend and headings are in the page's own HTML
const T = {
  ru: {
    lanes: { crypto: 'Криптография', transport: 'Транспорт', messaging: 'Сообщения', platform: 'Платформа' },
    zones: { shipped: 'Готово', progress: 'В работе', planned: 'В планах' },
    now: 'Сейчас · Alpha 2', beta: 'Beta', betaSub: 'Здесь появятся публичные сборки', v1: 'v1.0', v1Sub: 'Сначала независимый аудит',
  },
}[root.lang] || null;

// the phone band keeps a frozen gutter for the lane names, as wide as the longest name in this language
function gutter() {
  const w = Math.max(0, ...$$('.gl-lab.is-lane').map((el) => el.offsetWidth));
  const g = Math.max(114, Math.ceil(16 + w + 11));
  rm.style.setProperty('--gut', g + 'px');
  return g;
}
const edge = () => {
  if (phoneMQ.matches || TOUCH) return gutter();
  const g = $('.rm-ledger .lg-group');
  return g ? g.getBoundingClientRect().right + 24 : innerWidth * 0.4;
};

/* scroll position -> graph progress */
function progress(y) {
  const c = M.c, n = c.length, at = y + M.line;
  if (!n) return { t: 0, ov: 1, end: 0 };
  if (at <= c[0]) return { t: 0, ov: 1 - smooth(0.15, 1, y / Math.max(1, c[0] - M.line)), end: 0 };
  if (at >= c[n - 1]) return { t: n - 1, ov: 0, end: smooth(0.15, 0.85, (at - c[n - 1]) / Math.max(1, M.why - c[n - 1])) };
  let i = 0;
  while (i < n - 2 && at >= c[i + 1]) i++;
  return { t: i + (at - c[i]) / Math.max(1, c[i + 1] - c[i]), ov: 0, end: 0 };
}

/* ---------- the row at the reading line ---------- */
let nowRow = -1;
function markRow(p) {
  const i = p.ov < 0.5 && p.end < 0.5 ? Math.round(p.t) : -1;
  if (i === nowRow) return;
  if (nowRow >= 0) rows[nowRow].classList.remove('is-now');
  nowRow = i;
  if (i >= 0) rows[i].classList.add('is-now');
}

/* ---------- nav: dark over the instrument, light again once the page floods back to the light ground ---------- */
let navTheme = '';
function setTheme() {
  const f = flood.getBoundingClientRect();
  const t = f.top + f.height * 0.55 < nav.offsetHeight ? 'light' : 'dark';
  if (t === navTheme) return;
  navTheme = t;
  nav.dataset.theme = t;
  root.classList.toggle('is-light-top', t === 'light');
  themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
}

/* ---------- scene ---------- */
let scene = null, pending = false, visible = true, ticking = false;
function update() {
  ticking = false;
  if (TOUCH) return;
  setTheme();
  if (!scene) return;
  const p = progress(scrollY);
  scene.setProgress(p);
  markRow(p);
}
function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
if (!TOUCH) addEventListener('scroll', schedule, { passive: true });

function sync() {
  if (!scene) return;
  const on = visible && !document.hidden;
  if (on && !scene._on) { scene.start(); scene._on = true; }
  else if (!on && scene._on) { scene.stop(); scene._on = false; }
}

let hotRow = -1, pinned = -1, iosSeen = false;
const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
const focusIndex = rows.findIndex((el) => el.hasAttribute('data-focus'));
function pin(i) {
  pinned = i;
  if (scene) scene.setHot(i);
  setHotRow(i);
  if (TOUCH) {
    // frame the node (the scene eases there on its own clock), or go back to the whole road
    if (scene) scene.setProgress(i >= 0 ? { t: i, ov: 0, end: 0 } : touchRest());
    placeShow(i);
  }
}
const touchRest = () => (iosSeen ? { t: focusIndex, ov: 0, end: 1 } : { t: 0, ov: 1, end: 0 });

/* touch: one small «show on graph» link, placed in the tapped row while the graph is off screen */
const show = document.createElement('button');
show.type = 'button';
show.className = 'lg-show';
show.textContent = root.lang === 'ru' ? 'Показать на графике' : 'Show on graph';
show.addEventListener('click', (e) => {
  e.stopPropagation();
  const top = stage.getBoundingClientRect().top + scrollY - nav.offsetHeight - 8;
  scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
function placeShow(i) {
  if (i < 0 || visible) { show.remove(); return; }
  rows[i].appendChild(show);
}
function setHotRow(i) {
  if (i === hotRow) return;
  if (hotRow >= 0) rows[hotRow].classList.remove('is-hot');
  hotRow = i;
  if (i >= 0) rows[i].classList.add('is-hot');
}

async function mountScene() {
  if (scene || pending) return;
  pending = true;
  try {
    const m = await import('./roadmap-scene.js?v=5432f890');
    measure();
    const api = await m.mount(canvas, {
      items: rows.map((el) => ({ status: el.dataset.status, area: el.dataset.area, name: el.querySelector('.lg-item').textContent.trim() })),
      focus: rows.findIndex((el) => el.hasAttribute('data-focus')),
      labelsEl: $('.rm-labels'),
      t: T,
      touch: TOUCH,
      edge,
      initial: TOUCH ? touchRest() : progress(scrollY),
      onHover: (i) => setHotRow(i >= 0 ? i : pinned),
      onPick: (i) => { if (TOUCH) { pin(pinned === i ? -1 : i); return; } pin(i); scrollTo({ top: Math.max(0, M.c[i] - M.line), behavior: 'smooth' }); },
      onLost: () => { scene = null; rm.classList.remove('is-live'); setHotRow(-1); markRow({ t: 0, ov: 1, end: 0 }); },
    });
    scene = api;
    requestAnimationFrame(() => rm.classList.add('is-live'));
    update();
    sync();
  } catch (err) {
    console.warn('The track graph is unavailable; the designed still stays.', err);
  } finally { pending = false; }
}

if (GL && canvas) {
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver((entries) => {
    for (const e of entries) visible = e.isIntersecting;
    if (TOUCH) placeShow(visible ? -1 : pinned);
    sync();
  }).observe(stage);
  if (TOUCH) {
    // the iOS node lights up once "Why iOS comes next" has been seen (time-based; the graph eases there when next in view)
    new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || iosSeen) return;
      iosSeen = true;
      if (scene && pinned < 0) scene.setProgress(touchRest());
    }, { threshold: 0.4 }).observe($('.rm-why'));
  }
  // ledger rows light their node; nodes light their row (the scene reports pointer hovers through onHover)
  // touch has no hover: a tap on a row pins its node (and a tap on a node pins its row); a second tap releases it
  rows.forEach((el, i) => {
    el.addEventListener('pointerenter', (e) => { if (!TOUCH && e.pointerType === 'mouse' && scene) scene.setHot(i); });
    el.addEventListener('pointerleave', (e) => { if (!TOUCH && e.pointerType === 'mouse' && scene) scene.setHot(pinned); });
    el.addEventListener('click', (e) => { if (!fineMQ.matches && !e.target.closest('a')) pin(pinned === i ? -1 : i); });
  });
  // the graph starts after first paint, so the text and the still arrive first
  const boot = () => requestAnimationFrame(() => setTimeout(mountScene, 60));
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); if (scene) scene.resize(); update(); });
}

let rt = 0, lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    // touch: the address bar sliding fires resize; only a width change needs the graph laid out again
    if (TOUCH && innerWidth === lastW) return;
    lastW = innerWidth;
    measure(); if (scene) scene.resize(); update();
  }, 140);
});
if (TOUCH) {
  // the nav turns light where the page floods back to the light ground: a sentinel and an observer, no scroll handler
  const mark = document.createElement('div');
  mark.className = 'rm-flood-mark';
  flood.appendChild(mark);
  new IntersectionObserver(([e]) => {
    const t = !e.isIntersecting && e.boundingClientRect.top < nav.offsetHeight ? 'light' : 'dark';
    if (t === navTheme) return;
    navTheme = t; nav.dataset.theme = t;
    root.classList.toggle('is-light-top', t === 'light');
    themeMeta.content = t === 'dark' ? '#05050a' : '#F4F3F8';
  }, { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` }).observe(mark);
}
measure();
if (!TOUCH) update();

