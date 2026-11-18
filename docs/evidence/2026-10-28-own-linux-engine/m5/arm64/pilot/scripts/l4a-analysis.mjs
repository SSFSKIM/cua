// Task 96: L4a's rate (the controller's word): from a drop-signals run's results.jsonl, each lane and cell's drags with
// their answer class (as the judge's summary counts them), and for the cua:handle lane every drag's signals: answered
// ok with nothing pending and no drop (a false ok), take_after_press, take_after_release, accept_shown,
// accept_indeterminate, and the shown cursor's first-seen time against the release. Read only.
// usage: node l4a-analysis.mjs <results.jsonl> [summary.md]
import { readFileSync } from 'node:fs';
const [file, summary] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const drags = rows.filter((r) => r.kind === 'drop-signal');
const verdict = rows.find((r) => r.kind === 'electron-drop-verdict');
console.log(`drags ${drags.length}; lanes ${[...new Set(drags.map((d) => d.lane))].join(', ')}; load ${[...new Set(drags.map((d) => d.load))].join(',')}`);
console.log(`verdict pass=${verdict?.pass} failed=${JSON.stringify(verdict?.failed)}`);
console.log(`counts ${JSON.stringify(verdict?.counts)}`);
// a drag's class: landed, an unconfirmed or other notice, an error, or ok with nothing pending (no drop: a false ok)
const cls = (d) => {
  if (d.outcome?.landed) return 'landed';
  if (d.notice) return /unconfirmed/.test(d.notice) ? 'notice-unconfirmed' : 'notice-other';
  if (d.ok === false) return 'error';
  return 'ok-nothing-pending';
};
// the shown cursor (drop_cursor.shown, by its serial) first seen in the run's cursor signals, ms after the press
const shownAt = (d) => {
  const serial = d.drop_cursor?.shown?.serial;
  const c = (d.signals?.cursors ?? []).find((x) => serial !== undefined && x.serial === serial);
  return c ? c.t_ms : null;
};
const releaseMs = (d) => (d.wall ? d.wall.release_ms - d.wall.press_ms : null);
const byCell = {};
for (const d of drags) {
  const k = `${d.lane} ${d.cell}`;
  byCell[k] ??= { n: 0, classes: {}, ind: { true: 0, false: 0, undefined: 0 } };
  byCell[k].n++;
  byCell[k].classes[cls(d)] = (byCell[k].classes[cls(d)] ?? 0) + 1;
}
console.log('\n| lane cell | drags | classes |');
for (const [k, v] of Object.entries(byCell)) console.log(`| ${k} | ${v.n} | ${JSON.stringify(v.classes)} |`);
const handle = drags.filter((d) => d.lane === 'cua:handle');
console.log('\ncua:handle, every drag: cell i cold ms class | confirmed_by | take_after_press take_after_release | accept_shown accept_indeterminate | shown cursor first seen (ms after press) vs release (ms after press)');
const cross = {};
for (const d of handle) {
  const c = cls(d);
  const falseOk = c === 'ok-nothing-pending';
  const s = d.signals ?? {};
  const key = `${falseOk ? 'false-ok' : c} accept_shown=${s.accept_shown} indeterminate=${s.accept_indeterminate} confirmed_by=${d.handle?.confirmed_by}`;
  cross[key] = (cross[key] ?? 0) + 1;
  console.log(`${d.cell} ${d.i} ${d.cold ? 'cold' : 'warm'} ${d.ms} ${falseOk ? 'FALSE-OK' : c} | ${d.handle?.confirmed_by ?? '–'} | ${s.take_after_press_ms} ${s.take_after_release_ms} | ${s.accept_shown} ${s.accept_indeterminate} | ${shownAt(d)} vs ${releaseMs(d)?.toFixed(1)}`);
}
console.log('\ncua:handle class by accept_shown, accept_indeterminate and what confirmed the handle:');
for (const [k, v] of Object.entries(cross)) console.log(`  ${k}: ${v}`);
if (summary) {
  const s = readFileSync(summary, 'utf8');
  console.log('\nthe judge\'s lines:');
  for (const l of s.split('\n').filter((l) => /^\*\*Fails|^Findings|^\| cua:handle|^\| lane \| cell \| drags \| end not/.test(l))) console.log(l.slice(0, 300));
}
