// The per-cell counts a hosted sitting's job summary prints (#117 M5, T10b′; T10a's request to the design session for
// its decision on a looser qualification rule): per cell, on each side, the runs every sample of which has a verdict,
// each run's verdict samples of the samples it holds, the samples NO VERDICT `alert` (ruling 1154: an alert in front
// or key, or a cell the alert guard refused unsent), and the key cells guarded with their key reading not taken (`key
// unread`, keyUnreadByCell).
//
// The full matrix runs are counted as the judge counts them (../native-matrix/summary.mjs judge: each judged cell's
// account, NO VERDICT causes and pairing included). Every other cell result (a narrowed matrix cell such as #212's
// `intervention-save-sheet`, or a cell implemented elsewhere) is counted per row by the row's own cause
// (../native-matrix/front-key.mjs sampleCause), since no vendor pair judges it.
import {sampleCause} from '../native-matrix/front-key.mjs';
import {judge} from '../native-matrix/summary.mjs';

const isFull = result => result.cell === 'matrix' && result.meta?.planId === 'full';
const sideOf = (byRun, alert = 0, keyUnread = 0) => ({complete: Object.values(byRun).filter(r => r.verdicts === r.samples).length, runs: Object.keys(byRun).length, byRun, alert, keyUnread});
const ROW_SPAN = /^row:(\d+)(?::\d+)?$/;
// The key cells each result guarded with their key reading not taken (meta.keyUnread, by span key; the key-cell premise,
// ./alert-guard.mjs keyCause), per cell and side: a row's span (`row:<index>[:<attempt>]`) is that row's cell, any other
// span a harness key cell of its own (`harness <span>`). -> Map(cell -> {source, vendor, cua}).
function keyUnreadByCell(results) {
  const out = new Map();
  for (const {result} of results) {
    for (const [span, n] of Object.entries(result.meta?.keyUnread ?? {})) {
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
// samples}}, alert}, cua: {...}, pairs, qualifies}], a cell with no sample on either side left out.
export function cellCounts(results, {judgeFull = full => judge(full)} = {}) {
  const full = results.filter(({result}) => isFull(result));
  const out = [];
  if (full.length) {
    for (const c of judgeFull(full).cells) {
      const vendor = sideOf(c.account.vendor.byRun, c.account.vendor.noVerdict?.alert ?? 0), cua = sideOf(c.account.cua.byRun, c.account.cua.noVerdict?.alert ?? 0);
      if (vendor.runs || cua.runs) out.push({cell: `${c.section} ${c.id}`, source: 'matrix', pairs: c.account.pairs, qualifies: c.qualifies, vendor, cua});
    }
  }
  const others = new Map();
  for (const {result} of results.filter(({result}) => !isFull(result))) {
    const hosted = result.meta?.hosted === true;
    for (const row of result.rows ?? []) {
      if (row.excluded) continue;
      const key = `${result.cell}\0${row.section} ${row.id}`;
      if (!others.has(key)) others.set(key, {cell: `${row.section} ${row.id}`, source: result.cell, pairs: null, qualifies: null, vendor: {}, cua: {}, alerts: {vendor: 0, cua: 0}});
      const entry = others.get(key), engine = row.engine === 'vendor' ? 'vendor' : 'cua', side = entry[engine];
      const run = row.run ?? result.meta?.run ?? 1;
      side[run] ??= {verdicts: 0, samples: 0};
      side[run].samples += 1;
      const cause = sampleCause({...row, hosted});
      if (!cause) side[run].verdicts += 1;
      else if (cause.category === 'alert') entry.alerts[engine] += 1;
    }
  }
  for (const {alerts, ...entry} of others.values()) out.push({...entry, vendor: sideOf(entry.vendor, alerts.vendor), cua: sideOf(entry.cua, alerts.cua)});
  const unread = keyUnreadByCell(results);
  for (const c of out) {
    const n = unread.get(c.cell);
    if (n && !n.harness) { c.vendor.keyUnread = n.vendor; c.cua.keyUnread = n.cua; }
  }
  for (const [cell, n] of unread) {
    if (n.harness) out.push({cell, source: n.source, pairs: null, qualifies: null, vendor: sideOf({}, 0, n.vendor), cua: sideOf({}, 0, n.cua)});
  }
  return out;
}

// The alert guard's tally of a sitting, from every step's record whatever its producer (A's meta.json, the matrix's
// result.json `meta`, D's acceptance.json; ./alert-guard.mjs recordRefusal and recordKeyUnread): per step and cell, the
// refusals by cause and the key cells guarded with their key reading not taken. `records`: [{step, record}] (null when
// unread). -> [{step, cell, alert, unread, keyUnread}], steps in order, cells as their record lists them.
export function guardTally(records) {
  const out = [];
  for (const {step, record} of records) {
    const kept = record?.meta?.alertGuardCounts || record?.meta?.keyUnread ? record.meta : record;
    const refused = kept?.alertGuardCounts ?? {}, unread = kept?.keyUnread ?? {};
    for (const cell of new Set([...Object.keys(refused), ...Object.keys(unread)])) {
      out.push({step, cell, alert: refused[cell]?.alert ?? 0, unread: refused[cell]?.unread ?? 0, keyUnread: unread[cell] ?? 0});
    }
  }
  return out;
}
export function renderGuardTally(tally) {
  if (!tally.length) return 'No refusal and no key cell guarded unread in this sitting\'s records.\n';
  return [
    'Per step and cell: the cells the alert guard refused unsent (NO VERDICT `alert` or `unread`), and the key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key, which the key guard\'s front check cannot see).',
    '',
    '| step | cell | NO VERDICT alert | NO VERDICT unread | key cells guarded unread |',
    '|---|---|---|---|---|',
    ...tally.map(t => `| ${t.step} | ${t.cell} | ${t.alert} | ${t.unread} | ${t.keyUnread} |`),
  ].join('\n') + '\n';
}

const byRunText = side => Object.entries(side.byRun).map(([run, r]) => `${run}: ${r.verdicts}/${r.samples}`).join(', ') || '-';
// The counts as a Markdown table, for the job summary and the sitting's directory.
export function renderCounts(counts) {
  if (!counts.length) return 'No matrix cell result in this sitting\'s output: no per-cell counts.\n';
  return [
    'Per cell: the runs on each side every sample of which has a verdict (of the runs that hold the cell), each run\'s verdict samples of its samples, the side\'s samples NO VERDICT `alert` (an alert in front or key, or a cell the alert guard refused unsent, ruling 1154), and its key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key; a harness key cell on its own line). A sample without a verdict is never a pass and never a fail. Complete pairs are the judge\'s (three qualify a cell); `-` for a cell judged on its own.',
    '',
    '| cell | source | vendor: complete runs | vendor: verdicts by run | vendor: NO VERDICT alert | vendor: key cells guarded unread | cua: complete runs | cua: verdicts by run | cua: NO VERDICT alert | cua: key cells guarded unread | complete pairs |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...counts.map(c => `| ${c.cell} | ${c.source} | ${c.vendor.complete} of ${c.vendor.runs} | ${byRunText(c.vendor)} | ${c.vendor.alert} | ${c.vendor.keyUnread} | ${c.cua.complete} of ${c.cua.runs} | ${byRunText(c.cua)} | ${c.cua.alert} | ${c.cua.keyUnread} | ${c.pairs ?? '-'} |`),
  ].join('\n') + '\n';
}
