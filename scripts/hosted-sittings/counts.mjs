// The per-cell counts a hosted sitting's job summary prints (#117 M5, T10b′; T10a's request to the design session for
// its decision on a looser qualification rule): per cell, on each side, the runs every sample of which has a verdict,
// each run's verdict samples of the samples it holds, the samples NO VERDICT `alert` (ruling 1154: an alert in front
// or key, or a cell the alert guard refused unsent), the samples NO VERDICT `keyWindow` (a click or key cell refused
// because its scene's app held another key window, or none: the key-window requirement of ruling 1169's addition), the
// key cells guarded with their key reading not taken (`key unread`) and the click or key cells sent with their key
// window unread (`key window unread`; both unreadByCell).
//
// The full matrix runs are counted as the judge counts them (../native-matrix/summary.mjs judge: each judged cell's
// account, NO VERDICT causes and pairing included). Every other cell result (a narrowed matrix cell such as #212's
// `intervention-save-sheet`, or a cell implemented elsewhere) is counted per row by the row's own cause
// (../native-matrix/front-key.mjs sampleCause), since no vendor pair judges it.
import {sampleCause} from '../native-matrix/front-key.mjs';
import {judge} from '../native-matrix/summary.mjs';

const isFull = result => result.cell === 'matrix' && result.meta?.planId === 'full';
const sideOf = (byRun, {alert = 0, keyWindow = 0} = {}) => ({complete: Object.values(byRun).filter(r => r.verdicts === r.samples).length, runs: Object.keys(byRun).length, byRun,
  alert, keyUnread: 0, keyWindow, keyWindowUnread: 0});
const ROW_SPAN = /^row:(\d+)(?::\d+)?$/;
// The cells each result guarded with a reading not taken, by span key in its meta's `field`: `keyUnread` the key cells
// with their key unread (the key-cell premise, ./alert-guard.mjs keyCause), `keyWindowUnread` the click or key cells
// with their key window unread (keyWindowCause); per cell and side: a row's span (`row:<index>[:<attempt>]`) is that
// row's cell, any other span a harness cell of its own (`harness <span>`). -> Map(cell -> {source, vendor, cua, harness}).
function unreadByCell(results, field) {
  const out = new Map();
  for (const {result} of results) {
    for (const [span, n] of Object.entries(result.meta?.[field] ?? {})) {
      const row = ROW_SPAN.test(span) ? result.rows?.[Number(ROW_SPAN.exec(span)[1])] : null;
      const cell = row ? `${row.section} ${row.id}` : `harness ${span}`;
      const engine = (row?.engine ?? result.lanes?.[0]?.engine) === 'vendor' ? 'vendor' : 'cua';
      const entry = out.get(cell) ?? {source: result.cell, vendor: 0, cua: 0, harness: !row};
      entry[engine] += n;
      out.set(cell, entry);
    }
  }
  return out;
}

// `results`: [{path, result}] (../native-matrix/summary.mjs readResults). `judgeFull(results)`: the judgment of the full
// runs (the judge itself; a seam for tests). -> [{cell, source, vendor: {complete, runs, byRun: {run: {verdicts,
// samples}}, alert, keyUnread, keyWindow, keyWindowUnread}, cua: {...}, pairs, qualifies}], a cell with no sample on
// either side left out.
export function cellCounts(results, {judgeFull = full => judge(full)} = {}) {
  const full = results.filter(({result}) => isFull(result));
  const out = [];
  if (full.length) {
    for (const c of judgeFull(full).cells) {
      const refused = side => ({alert: c.account[side].noVerdict?.alert ?? 0, keyWindow: c.account[side].noVerdict?.keyWindow ?? 0});
      const vendor = sideOf(c.account.vendor.byRun, refused('vendor')), cua = sideOf(c.account.cua.byRun, refused('cua'));
      if (vendor.runs || cua.runs) out.push({cell: `${c.section} ${c.id}`, source: 'matrix', pairs: c.account.pairs, qualifies: c.qualifies, vendor, cua});
    }
  }
  const others = new Map();
  for (const {result} of results.filter(({result}) => !isFull(result))) {
    const hosted = result.meta?.hosted === true;
    for (const row of result.rows ?? []) {
      if (row.excluded) continue;
      const key = `${result.cell}\0${row.section} ${row.id}`;
      if (!others.has(key)) others.set(key, {cell: `${row.section} ${row.id}`, source: result.cell, pairs: null, qualifies: null, vendor: {}, cua: {}, refused: {vendor: {alert: 0, keyWindow: 0}, cua: {alert: 0, keyWindow: 0}}});
      const entry = others.get(key), engine = row.engine === 'vendor' ? 'vendor' : 'cua', side = entry[engine];
      const run = row.run ?? result.meta?.run ?? 1;
      side[run] ??= {verdicts: 0, samples: 0};
      side[run].samples += 1;
      const cause = sampleCause({...row, hosted});
      if (!cause) side[run].verdicts += 1;
      else if (cause.category in entry.refused[engine]) entry.refused[engine][cause.category] += 1;
    }
  }
  for (const {refused, ...entry} of others.values()) out.push({...entry, vendor: sideOf(entry.vendor, refused.vendor), cua: sideOf(entry.cua, refused.cua)});
  for (const field of ['keyUnread', 'keyWindowUnread']) {
    for (const [cell, n] of unreadByCell(results, field)) {
      let c = out.find(x => x.cell === cell);
      if (!c && !n.harness) continue;
      if (!c) out.push(c = {cell, source: n.source, pairs: null, qualifies: null, vendor: sideOf({}), cua: sideOf({})});
      c.vendor[field] = n.vendor;
      c.cua[field] = n.cua;
    }
  }
  return out;
}

// The alert guard's tally of a sitting, from every step's record whatever its producer (A's meta.json, the matrix's
// result.json `meta`, D's acceptance.json; ./alert-guard.mjs recordRefusal, recordKeyUnread and recordKeyWindowUnread):
// per step and cell, the refusals by cause (the key-window requirement's among them), the key cells guarded with their
// key reading not taken and the click or key cells sent with their key window unread. `records`: [{step, record}] (null
// when unread). -> [{step, cell, alert, unread, keyWindow, keyUnread, keyWindowUnread}], steps in order, cells as their
// record lists them.
export function guardTally(records) {
  const out = [];
  for (const {step, record} of records) {
    const meta = record?.meta;
    const kept = meta?.alertGuardCounts || meta?.keyUnread || meta?.keyWindowUnread ? meta : record;
    const refused = kept?.alertGuardCounts ?? {}, unread = kept?.keyUnread ?? {}, windowUnread = kept?.keyWindowUnread ?? {};
    for (const cell of new Set([...Object.keys(refused), ...Object.keys(unread), ...Object.keys(windowUnread)])) {
      out.push({step, cell, alert: refused[cell]?.alert ?? 0, unread: refused[cell]?.unread ?? 0, keyWindow: refused[cell]?.keyWindow ?? 0,
        keyUnread: unread[cell] ?? 0, keyWindowUnread: windowUnread[cell] ?? 0});
    }
  }
  return out;
}
export function renderGuardTally(tally) {
  if (!tally.length) return 'No refusal and no key cell guarded unread in this sitting\'s records.\n';
  return [
    'Per step and cell: the cells the alert guard refused unsent (NO VERDICT `alert` or `unread`) and those the key-window requirement refused (NO VERDICT `keyWindow`: the scene\'s app held another key window, or none), the key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key, which the key guard\'s front check cannot see), and the click or key cells sent with their key window unread (`cells key window unread`).',
    '',
    '| step | cell | NO VERDICT alert | NO VERDICT unread | NO VERDICT keyWindow | key cells guarded unread | cells key window unread |',
    '|---|---|---|---|---|---|---|',
    ...tally.map(t => `| ${t.step} | ${t.cell} | ${t.alert} | ${t.unread} | ${t.keyWindow} | ${t.keyUnread} | ${t.keyWindowUnread} |`),
  ].join('\n') + '\n';
}

const byRunText = side => Object.entries(side.byRun).map(([run, r]) => `${run}: ${r.verdicts}/${r.samples}`).join(', ') || '-';
// The counts as a Markdown table, for the job summary and the sitting's directory.
export function renderCounts(counts) {
  if (!counts.length) return 'No matrix cell result in this sitting\'s output: no per-cell counts.\n';
  const side = s => `${s.complete} of ${s.runs} | ${byRunText(s)} | ${s.alert} | ${s.keyWindow} | ${s.keyUnread} | ${s.keyWindowUnread}`;
  const heads = name => ['complete runs', 'verdicts by run', 'NO VERDICT alert', 'NO VERDICT keyWindow', 'key cells guarded unread', 'cells key window unread'].map(h => `${name}: ${h}`).join(' | ');
  return [
    'Per cell: the runs on each side every sample of which has a verdict (of the runs that hold the cell), each run\'s verdict samples of its samples, the side\'s samples NO VERDICT `alert` (an alert in front or key, or a cell the alert guard refused unsent, ruling 1154) and NO VERDICT `keyWindow` (a click or key cell refused unsent because its scene\'s app did not hold the scene window as its key window, ruling 1169\'s addition), its key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key) and its click or key cells sent with their key window unread (`cells key window unread`); a harness cell on its own line. A sample without a verdict is never a pass and never a fail. Complete pairs are the judge\'s (three qualify a cell); `-` for a cell judged on its own.',
    '',
    `| cell | source | ${heads('vendor')} | ${heads('cua')} | complete pairs |`,
    `|${'---|'.repeat(15)}`,
    ...counts.map(c => `| ${c.cell} | ${c.source} | ${side(c.vendor)} | ${side(c.cua)} | ${c.pairs ?? '-'} |`),
  ].join('\n') + '\n';
}
