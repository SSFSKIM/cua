#!/usr/bin/env node
// #302's key_up form (the design session's rulings 864 and 865; the pre-flight's §8.1 point 4): every stored L3b record
// read again through the settle judge with the form, beside the judge before it. A read of stored rows, not a rerun.
// For each record it prints:
// - the stored verdict, and whether the judge before the form, over the same rows, reproduces it (the check that the
//   sitting is rebuilt as it ran: a record it does not reproduce is not re-judged, and the script exits 1);
// - the verdict under the judge with the form, and whether it moved;
// - per Electron press_key and key_up cell, its #302 runs (trial, ms), and every run whose class changed, with the reason
//   a key_up miss is not #302.
// Usage, from the repository's root:
//   node docs/evidence/2026-10-28-own-linux-engine/m5/rejudge-302-keyup.mjs [--before <commit>] <label>=<results.jsonl>...
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const at = (p) => pathToFileURL(join(ROOT, p)).href;
const args = process.argv.slice(2);
// the judge before the form: feat/171-m5 at H'''' plus its DL entry, where this change branched
let BEFORE = 'b2662fe8';
if (args[0] === '--before') [, BEFORE] = args.splice(0, 2);
if (!args.length) {
  console.error('usage: rejudge-302-keyup.mjs [--before <commit>] <label>=<results.jsonl>...');
  process.exit(2);
}
const after = await import(at('scripts/linux-engine-diff/action-settle-cells.mjs'));
const scratch = mkdtempSync(join(tmpdir(), 'rejudge-302-keyup-'));
let before;
try {
  const source = execFileSync('git', ['-C', ROOT, 'show', `${BEFORE}:scripts/linux-engine-diff/action-settle-cells.mjs`], { encoding: 'utf8' })
    .replace("'../../src/services/engine/linux/settle.mjs'", `'${at('src/services/engine/linux/settle.mjs')}'`)
    .replace("'./deviations.mjs'", `'${at('scripts/linux-engine-diff/deviations.mjs')}'`)
    .replace("'./focus-timer.mjs'", `'${at('scripts/linux-engine-diff/focus-timer.mjs')}'`);
  writeFileSync(join(scratch, 'action-settle-cells.mjs'), source);
  before = await import(pathToFileURL(join(scratch, 'action-settle-cells.mjs')).href);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

/**
 * A stored settle record judged by a judge module, as the sitting ran (action-settle.mjs `runSettle`'s end): every series
 * rebuilt from its runs, its next same-page run after the last, then the sitting with the record's audits and skips.
 * A pilot is told by its stored verdict's `unjudged` (ruling 730). The rows store neither the private display's watchdog
 * nor the desktop's ending (a change to a window the run did not open), so the rebuild has neither: a stored failure from
 * either is one the judge before the form does not reproduce, and the script then fails closed (exit 1).
 */
function judgeRecord(judge, rows) {
  const runs = rows.filter((r) => r.kind === 'settle-run');
  const meta = rows.find((r) => r.kind === 'meta');
  const stored = rows.find((r) => r.kind === 'settle-verdict');
  const controlled = rows.some((r) => r.kind === 'settle-series' && r.input === 'menu_unconfirmed');
  const planned = judge.cellsFor({ families: meta.families, kinds: meta.kinds, routes: meta.routes }).filter((c) => controlled || c.kind !== 'menu_unconfirmed');
  const series = rows.filter((r) => r.kind === 'settle-series').map((s) => {
    const mine = runs.filter((r) => r.cell === s.cell && r.lane === s.lane && r.load === s.load);
    const last = runs.indexOf(mine.at(-1));
    const next = runs.slice(last + 1).find((r) => r.scene === s.scene);
    const judged = judge.judgeSettleSeries(mine, { need: s.need, next });
    return { ...s, runs: judged.runs, misses: judged.misses, streak: judged.streak, reached: judged.reached, late_302: judged.late_302, false_ok: judged.false_ok, judged: judged.judged };
  });
  const skipped = rows.filter((r) => r.kind === 'settle-skipped').flatMap((k) => planned.filter((c) => judge.FAMILY_SCENES[k.family].includes(c.scene)).map((c) => ({ cell: judge.cellName(c), why: k.why })));
  const audited = meta.lanes.includes('shipped') ? planned.filter((c) => c.route === 'background' && !judge.ACTIVATING.includes(c.kind)).map(judge.cellName) : [];
  const pilot = Array.isArray(stored?.unjudged);
  const v = judge.sittingVerdict({ series, cells: planned.map(judge.cellName), search: false, skipped, audits: rows.filter((r) => r.kind === 'settle-audit'), audited, pilot });
  return { ...v, series };
}

const ELECTRON_KEYS = /^electron-\S+ (press_key|key_up) /;
let moved = 0;
let unreproduced = 0;
for (const spec of args) {
  const [label, file] = spec.includes('=') ? spec.split(/=(.*)/s) : [spec, spec];
  const text = readFileSync(file, 'utf8');
  const rows = text.trim().split('\n').map((l) => JSON.parse(l));
  const stored = rows.find((r) => r.kind === 'settle-verdict');
  const b = judgeRecord(before, rows);
  const a = judgeRecord(after, rows);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const reproduced = same(b.failed, stored.failed);
  const pass = (v) => (v.failed.length ? 'FAIL' : 'PASS');
  console.log(`\n## ${label} (${rows.find((r) => r.kind === 'meta').run}, ${file}, sha256 ${createHash('sha256').update(text).digest('hex')})`);
  console.log(`stored verdict: ${stored.pass ? 'PASS' : 'FAIL'}${stored.failed.length ? ` (${stored.failed.join('; ')})` : ''}`);
  console.log(`the judge before the form (${BEFORE}) over these rows: ${pass(b)}; reproduces the stored failures: ${reproduced ? 'yes' : `NO (${b.failed.join('; ')})`}`);
  // a sitting not rebuilt as it ran: its re-judge would rest on a baseline that is not the record's, so it is not read
  if (!reproduced) {
    unreproduced++;
    console.log('NOT RE-JUDGED: the rebuild does not reproduce the stored verdict');
    continue;
  }
  console.log(`the judge with the form: ${pass(a)}${a.failed.length ? ` (${a.failed.join('; ')})` : ''}; verdict moved: ${pass(a) === pass(b) ? 'no' : 'YES'}`);
  if (pass(a) !== pass(b)) moved++;
  for (const s of a.series.filter((x) => ELECTRON_KEYS.test(`${x.cell} `))) {
    const was = b.series.find((x) => x.cell === s.cell && x.lane === s.lane);
    const changed = s.judged.filter((j, k) => j.cls !== was.judged[k].cls).map((j) => `trial ${j.trial} ${was.judged.find((w) => w.trial === j.trial).cls} -> ${j.cls}`);
    const keyUpMisses = s.input === 'key_up' ? s.judged.filter((j) => j.cls !== 'pass' && j.cls !== '#302').map((j) => `trial ${j.trial} ${j.cls}: ${j.why ?? ''}`) : [];
    console.log(`- ${s.cell} (${s.lane}): ${s.runs} runs, #302 ${s.late_302.length}${s.late_302.length ? ` (${s.late_302.map((l) => `t${l.trial} ${l.late_ms} ms`).join(', ')})` : ''}, reached ${s.reached}${changed.length ? `; changed: ${changed.join(', ')}` : ''}${keyUpMisses.length ? `; key_up misses not #302: ${keyUpMisses.join('; ')}` : ''}`);
  }
}
console.log(`\nrecords: ${args.length}; verdicts moved: ${moved}; not reproduced: ${unreproduced}`);
if (unreproduced) process.exit(1);
