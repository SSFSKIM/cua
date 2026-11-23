// The per-cell counts a hosted sitting's job summary prints (#117 M5, T10b′; T10a's request to the design session for
// its decision on a looser qualification rule): per cell, on each side, the runs every sample of which has a verdict,
// each run's verdict samples of the samples it holds, and the samples NO VERDICT `alert` (ruling 1154: an alert in front
// or key, or a cell the alert guard refused unsent).
//
// The full matrix runs are counted as the judge counts them (../native-matrix/summary.mjs judge: each judged cell's
// account, NO VERDICT causes and pairing included). Every other cell result (a narrowed matrix cell such as #212's
// `intervention-save-sheet`, or a cell implemented elsewhere) is counted per row by the row's own cause
// (../native-matrix/front-key.mjs sampleCause), since no vendor pair judges it.
import {sampleCause} from '../native-matrix/front-key.mjs';
import {judge} from '../native-matrix/summary.mjs';

const isFull = result => result.cell === 'matrix' && result.meta?.planId === 'full';
const sideOf = (byRun, alert = 0) => ({complete: Object.values(byRun).filter(r => r.verdicts === r.samples).length, runs: Object.keys(byRun).length, byRun, alert});

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
  return out;
}

const byRunText = side => Object.entries(side.byRun).map(([run, r]) => `${run}: ${r.verdicts}/${r.samples}`).join(', ') || '-';
// The counts as a Markdown table, for the job summary and the sitting's directory.
export function renderCounts(counts) {
  if (!counts.length) return 'No matrix cell result in this sitting\'s output: no per-cell counts.\n';
  return [
    'Per cell: the runs on each side every sample of which has a verdict (of the runs that hold the cell), each run\'s verdict samples of its samples, and the side\'s samples NO VERDICT `alert` (an alert in front or key, or a cell the alert guard refused unsent, ruling 1154). A sample without a verdict is never a pass and never a fail. Complete pairs are the judge\'s (three qualify a cell); `-` for a cell judged on its own.',
    '',
    '| cell | source | vendor: complete runs | vendor: verdicts by run | vendor: NO VERDICT alert | cua: complete runs | cua: verdicts by run | cua: NO VERDICT alert | complete pairs |',
    '|---|---|---|---|---|---|---|---|---|',
    ...counts.map(c => `| ${c.cell} | ${c.source} | ${c.vendor.complete} of ${c.vendor.runs} | ${byRunText(c.vendor)} | ${c.vendor.alert} | ${c.cua.complete} of ${c.cua.runs} | ${byRunText(c.cua)} | ${c.cua.alert} | ${c.pairs ?? '-'} |`),
  ].join('\n') + '\n';
}
