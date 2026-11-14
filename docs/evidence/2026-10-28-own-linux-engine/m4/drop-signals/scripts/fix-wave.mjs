#!/usr/bin/env node
// Task 68's fix wave: the counts the review asked to be redone, from the committed records, by the judge of the harness
// given (the fix wave's). usage: fix-wave.mjs <harness dir> <run dir>...   (each run dir holds run/results.jsonl)
// - The after-release table again, each drag's signals judged with its run's least server-clock offset
//   (`serverOffset`): the accept read at the release with its indeterminates (`acceptAtRelease`).
// - The same leaves read once more taking Chrome's return to its drag loop's cursor (the serial it showed at the take,
//   shown again after it) as its handling of the release: a reading that rests on Chrome's behaviour, kept apart.
// - The live accept lane replayed on the engine's own records (`accept.changes`) with the withdrawal rule: whether any
//   accept the engine released on had already been withdrawn when it read it.
// - The populations: leaves after an in-time take, and late takes, apart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, ...runs] = process.argv.slice(2);
const judge = await import(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs'));
const MASK = judge.RESOURCE_ID_MASK;
const same = (a, b) => a && b && ((a & ~MASK) >>> 0) === ((b & ~MASK) >>> 0);
const after = (t, since) => {
  const d = (t - since) >>> 0;
  return d !== 0 && d < 2 ** 31;
};
const out = [];
const rows = [];
for (const dir of runs) {
  let window = null;
  const own = [];
  for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind === 'drop-signal-scene') window = r.window;
    if (r.kind === 'drop-signal') own.push({ ...r, window, sitting: dir.split('/').at(-1) });
  }
  const offset = judge.serverOffset(own.flatMap((r) => r.watch ?? []));
  for (const r of own) {
    if (r.wall && r.watch) r.signals = judge.signalsOf(r.watch, { target: r.window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null, serverOffsetMs: offset });
    r.offset = offset;
    rows.push(r);
  }
}
const label = (r) => `${r.load}${r.family === 'chrome' ? '' : ` (${r.family})`}`;
const byLoad = (rs) => {
  const m = new Map();
  for (const r of rs) m.set(label(r), [...(m.get(label(r)) ?? []), r]);
  return m;
};

out.push(`${rows.length} drags over ${runs.length} runs, judged again by the fix wave's judge.`, '');
// the after-release table, Chrome and Electron apart
for (const family of ['chrome', 'electron']) {
  const t = judge.afterReleaseTable(rows.filter((r) => r.family === family));
  if (t.counts.length) out.push(`### ${family}`, '', ...t.md, '');
}

// the second reading: Chrome's return to its loop's cursor as its handling of the release
const source = (r) => judge.CELL_SOURCE[r.cell] && !r.cover && r.wall && r.watch;
const inTime = (r) => r.signals?.take_after_press_ms != null && r.signals.late_take !== true;
const reading = (r) => {
  const take = r.watch.find((w) => w.kind === 'take' && same(w.owner, r.window) && w.wall_ms >= r.wall.press_ms - 5);
  const cursors = r.watch.filter((w) => w.kind === 'cursor' && w.wall_ms >= r.wall.press_ms);
  const loop = cursors.filter((c) => !c.named && !after(c.server_time, take.server_time)).at(-1);
  const back = loop ? cursors.findIndex((c) => !c.named && after(c.server_time, take.server_time) && c.serial === loop.serial) : -1;
  if (back < 0) return { shown: r.signals.accept_shown, indeterminate: r.signals.accept_indeterminate, back: false };
  // Chrome's return and every cursor change after it put after the release, the other lines (the probe) kept
  const cut = r.watch.indexOf(cursors[back]);
  const s = judge.signalsOf(r.watch.filter((w, k) => k < cut || w.kind !== 'cursor'), { target: r.window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null, serverOffsetMs: r.offset });
  return { shown: s.accept_shown, indeterminate: s.accept_indeterminate, back: true };
};
out.push(
  "The accept read at the release, read again taking Chrome's return to its drag loop's cursor (the serial it showed at the take, shown again after the take) as Chrome's handling of the release, so that it and everything after it come after the release. This rests on Chrome's behaviour, not on the server's order: the return was never read more than 10 ms before the engine's release stamp in any drag that took.",
  '',
  '| load | leaves | of them with the return seen | false accepts | indeterminate | false accepts, indeterminates counted | drops | true positives | false negatives | indeterminate drops |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
);
for (const [load, rs] of byLoad(rows.filter((r) => source(r) && inTime(r)))) {
  const read = rs.map((r) => ({ r, ...reading(r) }));
  const leaves = read.filter((x) => x.r.outcome?.landed !== true);
  const drops = read.filter((x) => x.r.outcome?.landed === true);
  const fa = leaves.filter((x) => x.shown && !x.indeterminate).length;
  const ind = leaves.filter((x) => x.indeterminate).length;
  out.push(`| ${load} | ${leaves.length} | ${leaves.filter((x) => x.back).length} | ${fa} | ${ind} | ${fa + ind} | ${drops.length} | ${drops.filter((x) => x.shown && !x.indeterminate).length} | ${drops.filter((x) => !x.shown && !x.indeterminate).length} | ${drops.filter((x) => x.indeterminate).length} |`);
}
out.push('');

// the live accept lane on the engine's own records, the withdrawal rule replayed at the moment the engine read its accept
out.push(
  "The live accept lane (`--drag-dnd-release-at-accept`) replayed on the engine's own cursor record (`accept.changes`: each change's serial, server time and name) with the withdrawal rule, over the changes up to Chrome's return to its drag loop's cursor (the release's; the whole record where there is none): whether the accept the engine released on was still the cursor shown, and the sequences seen after the take (L: the loop's cursor).",
  '',
  '| load | lane | cell | released at the accept | still shown at the release | withdrawn before it | sequences after the take |',
  '|---|---|---|---:|---:|---:|---|',
);
const acceptIndex = (changes, take) => {
  let counted = 0;
  let last = null;
  let accept = null;
  let shown = -1;
  for (const [k, c] of changes.entries()) {
    if (c.named || !after(c.time, take) || c.serial === last) continue;
    last = c.serial;
    counted += 1;
    if (counted === 2) accept = c.serial;
    if (counted >= 2) shown = c.serial === accept ? k : -1;
  }
  return shown;
};
const live = rows.filter((r) => String(r.lane).startsWith('cua:accept') && r.accept?.accepted === true);
const m = new Map();
for (const r of live) {
  const k = [label(r), r.lane, r.cell].join('\u0000');
  const take = r.accept.take_time;
  const changes = (r.accept.changes ?? []).map(([serial, time, named]) => ({ serial, time, named }));
  const loop = changes.filter((c) => !c.named && !after(c.time, take)).at(-1);
  const back = loop ? changes.findIndex((c) => !c.named && after(c.time, take) && c.serial === loop.serial) : -1;
  const ok = acceptIndex(back < 0 ? changes : changes.slice(0, back), take) >= 0;
  const c = m.get(k) ?? { n: 0, still: 0, withdrawn: 0, seqs: new Map() };
  c.n += 1;
  c.still += ok ? 1 : 0;
  c.withdrawn += ok ? 0 : 1;
  const seq = changes.filter((x) => !x.named && after(x.time, take)).map((x) => (x.serial === loop?.serial ? 'L' : x.serial)).join(', ');
  c.seqs.set(seq, (c.seqs.get(seq) ?? 0) + 1);
  m.set(k, c);
}
for (const [k, c] of m) out.push(`| ${k.split('\u0000').join(' | ')} | ${c.n} | ${c.still} | ${c.withdrawn} | ${[...c.seqs].map(([q, n]) => `${q}: ${n}`).join('; ')} |`);
out.push('');

// the populations
out.push('The populations: drags whose source took by the release and did not land (the after-release table\'s leaves), and late takes (the take after the release; none landed), apart.', '', '| load | leaves after an in-time take | of them with an activation request | late takes | of them with an activation request | late takes landed |', '|---|---:|---:|---:|---:|---:|');
const all = { leaves: 0, late: 0, act: 0 };
for (const [load, rs] of byLoad(rows.filter(source))) {
  const leaves = rs.filter((r) => inTime(r) && r.outcome?.landed !== true);
  const late = rs.filter((r) => r.signals?.late_take === true);
  const act = (xs) => xs.filter((r) => typeof r.signals.activation_after_release_ms === 'number' && r.signals.activation_after_release_ms <= judge.AFTER_RELEASE_WINDOW_MS).length;
  out.push(`| ${load} | ${leaves.length} | ${act(leaves)} | ${late.length} | ${act(late)} | ${late.filter((r) => r.outcome?.landed === true).length} |`);
  if (!load.includes('(')) {
    all.leaves += leaves.length;
    all.late += late.length;
    all.act += act(leaves) + act(late);
  }
}
out.push('', `Chrome: ${all.leaves} leaves after an in-time take and ${all.late} late takes, ${all.leaves + all.late} drags that did not land after a take, ${all.act} of them with an activation request.`, '');
process.stdout.write(`${out.join('\n')}\n`);
