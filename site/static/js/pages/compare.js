// Comparison: the "only what differs" switch. Cells marked data-same say the same as SHIFROM's cell in that row;
// with the switch on they fade back, so what is left standing is where the apps differ from SHIFROM. A row
// where every app matches SHIFROM drops out. Without JavaScript the switch stays hidden and the table is whole.
const table = document.querySelector('.cmp-table');
const btn = document.querySelector('.cmp-diff');
if (table && btn) {
  for (const tr of table.tBodies[0].rows) {
    const others = tr.querySelectorAll('td:not(.cmp-us)');
    if (others.length && [...others].every((td) => td.hasAttribute('data-same'))) tr.classList.add('cmp-alike');
  }
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    table.classList.toggle('is-diff', on);
  });
}
