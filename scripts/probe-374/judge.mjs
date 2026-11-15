// #374's verdict over measure.mjs's rows (rows.jsonl), pure so it is tested offline (judge.test.mjs).
//
// A row is one Show Menu: {family, cell, placement, rep, offered, answer: "ok" | <errorName>, menu (the engine's
// cua/menu record), before and after (the side oracle's `menus` reads around the action), page (the fixture page's
// state after it, web families), pageBefore}. Its truth is what the oracle and the page saw, never the engine's answer:
//   menuOpen  a native menu window or AXMenu child more than before, or (the aria cell) the page's ARIA menu open;
//   reached   the page's contextmenu counter for the cell rose (web families), or the AppKit view counted the action.
// Its class:
//   falseOk            answered ok with no menu open: the hard failure this fix exists to remove;
//   falseUnconfirmed   answered menuUnconfirmed with a menu the engine could have seen open (not the own cell's);
//   honestUnconfirmed  menuUnconfirmed with no menu open (the ignored request, a menu that did not stay open);
//   ownUnconfirmed     the own cell's menuUnconfirmed: the page drew its own menu, which no AXMenu shows;
//   confirmed          ok with a menu open;
//   notOffered         the element offers no Show Menu (a stated limit of that family, never a pass);
//   error              any other answer.
export const EXPECT = Object.freeze({
  native: 'confirmed', popup: 'confirmed', blocking: 'confirmed', aria: 'confirmed',
  own: 'ownUnconfirmed', ignored: 'honestUnconfirmed',
});

const more = (after, before, key) => (after?.[key] ?? 0) > (before?.[key] ?? 0);
const rose = (row) => (row.page?.counts?.[row.cell] ?? 0) > (row.pageBefore?.counts?.[row.cell] ?? 0);

export function truth(row) {
  const native = more(row.after, row.before, 'windows') || more(row.after, row.before, 'axMenus');
  const aria = row.cell === 'aria' && row.page?.ariaOpen === true;
  return {menuOpen: native || aria, native, aria, reached: row.page ? rose(row) : row.appkitShows > 0, ownOpen: row.page?.ownOpen === true};
}

export function classify(row) {
  if (row.offered === false) return 'notOffered';
  const t = truth(row);
  if (row.answer === 'ok') return t.menuOpen ? 'confirmed' : 'falseOk';
  if (row.answer === 'menuUnconfirmed') {
    if (row.cell === 'own') return t.menuOpen ? 'falseUnconfirmed' : 'ownUnconfirmed';
    return t.menuOpen ? 'falseUnconfirmed' : 'honestUnconfirmed';
  }
  return 'error';
}

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};

/// One cell's summary (family × cell × placement) and its verdict: `pass` when every row is the cell's expected class;
/// `fail` on any falseOk, anywhere; `limit` when the family does not offer Show Menu there, or (the aria cell) never
/// shows its ARIA menu as one; otherwise `review`, with the classes counted for the reader.
export function summarize(rows) {
  const cells = new Map();
  for (const row of rows) {
    const key = `${row.family}|${row.cell}|${row.placement}`;
    if (!cells.has(key)) cells.set(key, {family: row.family, cell: row.cell, placement: row.placement, rows: []});
    cells.get(key).rows.push(row);
  }
  return [...cells.values()].map(({rows: cellRows, ...cell}) => {
    const classes = {};
    for (const row of cellRows) classes[classify(row)] = (classes[classify(row)] ?? 0) + 1;
    const ms = answer => cellRows.filter(r => r.answer === answer && Number.isFinite(r.menu?.ms)).map(r => r.menu.ms);
    const seen = {};
    for (const row of cellRows) if (row.menu?.seen) seen[row.menu.seen] = (seen[row.menu.seen] ?? 0) + 1;
    const actionErrors = {};
    for (const row of cellRows) if (row.menu?.actionError != null) actionErrors[row.menu.actionError] = (actionErrors[row.menu.actionError] ?? 0) + 1;
    const reached = cellRows.filter(r => truth(r).reached).length;
    const expected = EXPECT[cell.cell];
    let verdict = 'review';
    if (classes.falseOk) verdict = 'fail';
    else if (classes.notOffered === cellRows.length) verdict = 'limit';
    else if (classes[expected] === cellRows.length && (expected !== 'ownUnconfirmed' || reached === cellRows.length)) verdict = 'pass';
    else if (cell.cell === 'aria' && (classes.honestUnconfirmed ?? 0) + (classes.falseUnconfirmed ?? 0) === cellRows.length && !seen.focus) verdict = 'limit';
    return {...cell, n: cellRows.length, verdict, expected, classes, seen, actionErrors, reached,
      okMs: {p50: quantile(ms('ok'), 0.5), p95: quantile(ms('ok'), 0.95)},
      unconfirmedMs: {p50: quantile(ms('menuUnconfirmed'), 0.5), max: quantile(ms('menuUnconfirmed'), 1)}};
  });
}

/// The run's gate: no falseOk anywhere, and every cell pass or a stated limit.
export function gate(summary) {
  const falseOk = summary.reduce((n, c) => n + (c.classes.falseOk ?? 0), 0);
  const open = summary.filter(c => !['pass', 'limit'].includes(c.verdict)).map(c => `${c.family}/${c.cell}/${c.placement}: ${c.verdict}`);
  return {falseOk, open, green: falseOk === 0 && open.length === 0};
}

export function table(summary) {
  const head = '| family | cell | placement | n | verdict | classes | seen | actionError | reached | ok ms p50/p95 | unconfirmed ms p50/max |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  return [head, ...summary.map(c => `| ${c.family} | ${c.cell} | ${c.placement} | ${c.n} | ${c.verdict} | ${fmt(c.classes)} | ${fmt(c.seen)} | ${fmt(c.actionErrors)} | ${c.reached} | ${c.okMs.p50 ?? '-'}/${c.okMs.p95 ?? '-'} | ${c.unconfirmedMs.p50 ?? '-'}/${c.unconfirmedMs.max ?? '-'} |`)].join('\n');
}
