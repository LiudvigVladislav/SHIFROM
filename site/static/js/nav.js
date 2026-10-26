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
