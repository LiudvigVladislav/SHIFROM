// Shared by every page: the phone menu is a <details>, so it works without JavaScript;
// this only closes it on an outside tap, on Escape and after a link is chosen.
const menu = document.querySelector('.nav .menu');
if (menu) {
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.open = false; });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
}

// Back to top: a floating button on every page, added here so no page needs markup for it (the footer's
// "#top" link is the no-JavaScript fallback). It shows once the reader is about 1.5 screens down, without a
// scroll listener: an observed band covers the first 1.5 screens of the page.
{
  const ru = (document.documentElement.lang || '').toLowerCase().startsWith('ru');
  const label = ru ? 'Наверх' : 'Back to top';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'to-top';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const marker = document.createElement('div');
  marker.className = 'to-top-marker';
  marker.setAttribute('aria-hidden', 'true');
  document.body.append(marker, btn);

  new IntersectionObserver(([e]) => {
    // the band has scrolled entirely above the viewport: the reader is past 1.5 screens
    btn.classList.toggle('is-shown', !e.isIntersecting && e.boundingClientRect.top < 0);
  }).observe(marker);

  btn.addEventListener('click', () => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // keyboard and screen-reader users land where the page starts: the skip-link target, else the first heading
    const target = document.getElementById('main') || document.querySelector('h1');
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  // write-up pages dock a "Contents" pill in the same corner on phones: stack above it while it is there
  const toc = document.querySelector('.toc-m');
  if (toc) {
    const place = () => btn.classList.toggle('is-stacked', toc.classList.contains('is-docked') && !toc.classList.contains('is-away'));
    new MutationObserver(place).observe(toc, { attributes: true, attributeFilter: ['class'] });
    place();
  }
}
