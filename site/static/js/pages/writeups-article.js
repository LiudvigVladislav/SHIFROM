// Engineering article: reading progress, the current section (desktop contents rail, and the phone
// contents pill), and the phone contents panel that docks once it has scrolled away.
// The page reads completely without this file; it only adds wayfinding.
const body = document.querySelector('.art-body');
const bar = document.querySelector('.read-progress span');
const toc = document.querySelector('.toc');
const dot = toc && toc.querySelector('.toc-dot');
const slot = document.querySelector('.toc-m-slot');
const tocM = slot && slot.querySelector('.toc-m');
const nowEl = tocM && tocM.querySelector('.toc-m-now');
const artEnd = document.querySelector('.art-end');

// one entry per section, in reading order, from the desktop rail (it lists every section and sub-section)
const items = (toc ? [...toc.querySelectorAll('a[href^="#"]')] : [])
  .map((a) => {
    const id = decodeURIComponent(a.hash.slice(1));
    const target = document.getElementById(id);
    const top = a.closest('.toc-list > li').querySelector(':scope > a');   // the section a node belongs to
    const m = tocM && tocM.querySelector(`a[href="#${CSS.escape(id)}"]`);
    return target ? { a, target, top, m, label: m ? m.textContent.trim() : a.textContent.trim() } : null;
  })
  .filter(Boolean);

let marks = [], endY = 1, navH = 76, current = null, frame = 0, placed = false, docked = false;

function measure() {
  const y = scrollY;
  const nav = document.getElementById('nav');           // includes the top safe area on notched phones
  navH = nav ? nav.getBoundingClientRect().height : 76;
  marks = items.map((it) => it.target.getBoundingClientRect().top + y);
  const r = body.getBoundingClientRect();
  endY = Math.max(1, r.bottom + y - innerHeight);
}

function placeDot(link, animate) {
  if (!dot || !toc.offsetParent) return;
  const cs = getComputedStyle(link);
  const lh = parseFloat(cs.lineHeight) || 19;
  // the dot is positioned in .toc; measure the link against it (the list in between is positioned too)
  const top = link.getBoundingClientRect().top - toc.getBoundingClientRect().top + toc.scrollTop;
  const y = top + parseFloat(cs.paddingTop) + lh / 2 - dot.offsetHeight / 2;
  dot.classList.toggle('no-anim', !animate);
  dot.style.setProperty('--dot-y', y.toFixed(1) + 'px');
}

/* ---------- the phone contents pill ---------- */
let scrim = null;
function setDocked(on) {
  if (on === docked) return;
  if (tocM.open) tocM.open = false;          // never carry an open panel between the two states
  docked = on;
  tocM.classList.toggle('is-docked', on);
}
function syncScrim() {
  if (!scrim) return;
  scrim.classList.toggle('is-on', docked && tocM.open);
}

function update() {
  frame = 0;
  const y = scrollY;
  if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, y / endY)).toFixed(4)})`;

  // dock the phone panel once its place has scrolled under the nav; an inline panel the reader
  // has opened stays where it is until they close it
  if (slot && slot.offsetParent) {
    const past = slot.getBoundingClientRect().bottom < navH + 8;
    if (past && !(tocM.open && !docked)) setDocked(true);
    else if (!past && docked) setDocked(false);
    if (docked && artEnd) tocM.classList.toggle('is-away', artEnd.getBoundingClientRect().top < innerHeight - 24);
  } else if (docked) setDocked(false);

  const line = y + navH + innerHeight * 0.28;
  let idx = -1;
  for (let i = 0; i < marks.length; i++) if (marks[i] <= line) idx = i;
  if (y + innerHeight >= document.documentElement.scrollHeight - 2 && marks.length) {
    const last = marks.length - 1;           // at the very end the last short section may never reach the line
    if (marks[last] > y) idx = last;
  }
  const next = idx >= 0 ? items[idx] : null;
  if (next === current) return;
  if (current) {
    current.a.removeAttribute('aria-current'); current.top.classList.remove('is-on');
    if (current.m) current.m.removeAttribute('aria-current');
  }
  current = next;
  if (nowEl) nowEl.textContent = current ? current.label : '';
  if (current) {
    current.a.setAttribute('aria-current', 'true');
    current.top.classList.add('is-on');
    if (current.m) current.m.setAttribute('aria-current', 'true');
    if (toc && toc.offsetParent) { placeDot(current.top, placed); placed = true; toc.classList.add('has-dot'); }
  } else if (toc) {
    toc.classList.remove('has-dot');
  }
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
const remeasure = () => {
  measure();
  if (current && toc && toc.offsetParent) { placeDot(current.top, false); placed = true; toc.classList.add('has-dot'); }
  schedule();
};

if (body) {
  measure();
  update();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  addEventListener('load', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(body);
}

if (tocM) {
  scrim = document.createElement('div');
  scrim.className = 'toc-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  slot.append(scrim);                         // same stacking context as the docked panel (main is isolated)
  scrim.addEventListener('click', () => { tocM.open = false; });
  tocM.addEventListener('toggle', () => {
    syncScrim();
    if (docked && tocM.open && current && current.m) {      // show where the reader is, inside the sheet only
      const nav = tocM.querySelector('nav');
      const r = current.m.getBoundingClientRect(), n = nav.getBoundingClientRect();
      nav.scrollTop += r.top - n.top - n.height / 2 + r.height / 2;
    }
    if (!tocM.open) schedule();               // closing an inline panel may let it dock
  });
  // a section was chosen: close, and let the anchor scroll happen
  tocM.addEventListener('click', (e) => { if (e.target.closest('a')) tocM.open = false; });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tocM.open) { tocM.open = false; tocM.querySelector('summary').focus(); }
  });
}
