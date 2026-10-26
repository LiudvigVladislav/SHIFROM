// Support page controller: the copy buttons for the wallet addresses, and the allocation graph
// (three.js, mounted lazily after load, paused when off screen or in a hidden tab).
const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RU = (root.lang || '').toLowerCase().startsWith('ru');            // one script serves both languages; EN output unchanged

/* ---------- wallet addresses ----------
   The address printed in the page is the only source: the button copies the element's own text back
   out of the DOM, so what is shown and what is copied cannot drift apart. A format check per network
   refuses to copy anything malformed (the button then stays hidden and the address stays selectable). */
const FORMAT = {
  btc: /^bc1[02-9ac-hj-np-z]{39,59}$/,          // bech32, native SegWit
  xmr: /^[48][1-9A-HJ-NP-Za-km-z]{94}$/,        // base58, 95 characters
  eth: /^0x[0-9a-fA-F]{40}$/,
};
const statusEl = $('#copy-status');

// groups of four for reading; <wbr> gives the line breaks, so no character is ever added to the text
function groupAddress(el) {
  const a = el.textContent;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < a.length; i += 4) {
    if (i) frag.append(document.createElement('wbr'));
    const s = document.createElement('span');
    s.className = 'g';
    s.textContent = a.slice(i, i + 4);
    frag.append(s);
  }
  el.replaceChildren(frag);
  if (el.textContent !== a) el.textContent = a;
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
  }
  // selection fallback: a throwaway field holding exactly the address
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.tabIndex = -1;
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;';
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function selectNode(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

let say = 0;
function announce(msg) {
  clearTimeout(say);
  statusEl.textContent = '';
  say = setTimeout(() => { statusEl.textContent = msg; }, 60);
}

for (const btn of $$('.copy[data-copy-from]')) {
  const el = document.getElementById(btn.dataset.copyFrom);
  const net = btn.dataset.net, name = btn.dataset.name;
  const box = btn.closest('.coin-addr');
  const hint = box && box.querySelector('.copy-hint');
  if (!el || !FORMAT[net] || !FORMAT[net].test(el.textContent)) {
    console.warn(`The ${name || net} address failed its format check; copying is disabled.`);
    continue;
  }
  groupAddress(el);
  btn.hidden = false;
  let timer = 0;
  btn.addEventListener('click', async () => {
    const text = el.textContent;
    if (!FORMAT[net].test(text)) return;
    const ok = await writeClipboard(text);
    if (document.activeElement !== btn) btn.focus({ preventScroll: true });
    clearTimeout(timer);
    if (ok) {
      if (hint) hint.hidden = true;
      btn.classList.add('is-done');
      box.classList.add('is-done');
      announce(RU ? `Адрес ${name} скопирован. Всегда проверяйте адрес после вставки.` : `${name} address copied. Always verify the address after pasting.`);
      timer = setTimeout(() => { btn.classList.remove('is-done'); box.classList.remove('is-done'); }, 2400);
    } else {
      selectNode(el);
      if (hint) hint.hidden = false;
      announce(RU ? `Адрес ${name} выделен. Нажмите Control C или Command C, чтобы скопировать.` : `${name} address selected. Press Control C or Command C to copy it.`);
    }
  });
}

/* ---------- touch: the statements reveal on a timer as they enter view (never by scroll position) ---------- */
if (root.classList.contains('touch')) {
  const show = (el) => el.classList.add('is-in');
  if (root.classList.contains('reduced') || !('IntersectionObserver' in window)) $$('.use').forEach(show);
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    $$('.use').forEach((u) => io.observe(u));
  }
}

/* ---------- the allocation graph ----------
   Live on desktop it is pinned beside the hero, "Where support goes" and "Ways to contribute":
   pointing at one of the three statements lights its branch (and a branch lights its statement);
   pointing at a way to contribute sends one packet from the source down all three branches. */
const stage = $('.d-stage'), canvas = $('.d-gl'), labelsEl = $('.d-labels');
const uses = $$('.use');
const LABELS = RU ? {
  src: { name: 'Ваша поддержка', tag: 'карта\u00a0· PayPal\u00a0· крипто' },
  dst: [
    { name: 'Разработка iOS', tag: 'iPhone' },
    { name: 'Инфраструктура', tag: 'ретранслятор\u00a0· домен\nTLS-сертификаты\nмост-узлы' },
    { name: 'Аудит безопасности', tag: 'независимая проверка\nдо v1.0' },
  ],
  note: 'Схема, а не пропорции',
} : {
  src: { name: 'Your support', tag: 'Card · PayPal · crypto' },
  dst: [
    { name: 'iOS development', tag: 'iPhone' },
    { name: 'Infrastructure', tag: 'Relay · domain\nTLS certificates\nbridge nodes' },
    { name: 'Security audit', tag: 'Independent review\nbefore v1.0' },
  ],
  note: 'Schematic, not proportions',
};
if (root.classList.contains('gl') && stage && canvas) {
  let api = null, booting = false, visible = false;
  const sync = () => {
    if (!api) return;
    if (visible && !document.hidden) api.start(); else api.stop();
  };
  const fallBack = (err) => {
    if (err) console.warn('The allocation graph is unavailable; the designed still stays.', err);
    stage.classList.remove('is-live');
    stage.classList.add('is-still');
    if (api) { try { api.dispose(); } catch (e) { /* already gone */ } api = null; }
  };
  async function boot() {
    try {
      const m = await import('./donate-graph.js?v=f2de6f2b');
      api = await m.mount(canvas, {
        labelsEl, labels: LABELS,
        phone: matchMedia('(max-width: 700px)').matches,
        onHover: (i) => uses.forEach((u, k) => u.classList.toggle('is-hot', k === i)),
        onLost: () => fallBack(),
      });
      requestAnimationFrame(() => stage.classList.add('is-live'));
      sync();
    } catch (err) { fallBack(err); }
  }
  // after load and an idle moment, so the scene never competes with the first paint
  const whenIdle = (fn) => {
    const go = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 700 }) : setTimeout(fn, 60));
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  };
  // the top of the window sits under the fixed nav: a sliver of the stage there is not worth drawing
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !api && !booting) { booting = true; whenIdle(boot); }
    sync();
  }, { rootMargin: '-140px 0px 0px 0px' }).observe(stage);
  document.addEventListener('visibilitychange', sync);

  // the three statements <-> the three branches
  uses.forEach((u, i) => {
    const on = () => api && api.setHot(i), off = () => api && api.setHot(-1);
    u.addEventListener('pointerenter', on);
    u.addEventListener('pointerleave', off);
    u.addEventListener('focusin', on);
    u.addEventListener('focusout', off);
  });
  // a way to contribute -> one packet down every branch (at most one every 700 ms)
  let lastPulse = 0;
  const pulse = () => { const t = performance.now(); if (api && t - lastPulse > 700) { lastPulse = t; api.pulse(); } };
  $$('.pay, .coin').forEach((el) => { el.addEventListener('pointerenter', pulse); el.addEventListener('focusin', pulse); });

  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => api && api.resize(), 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => api && api.relayout());
}
