// L4a's residue (the design session's ruling 827, 3b) over the stored T17 Electron sittings, read-only (the M5
// pre-flight's §8.1, point 4: a fix to a judge alone re-judges the stored rows of the steps it reaches). Each sitting is
// judged twice from its own rows, through drop-signals-judge.mjs `dropSignalsVerdict`: by H's judge (read from git at
// `--old-rev`, unchanged from H to H‴) and by this checkout's, with the residue. Printed per sitting: both verdicts,
// whether it moved, each plain cell's residue count and bound, and the fails that stand. Then the negative controls: a
// passing sitting's own rows edited one way at a time, every edit failing.
//
//   node rejudge-l4a-residue.mjs --harness <checkout> [--old-rev <rev>] <label>=<sitting dir | results file | git:<rev>:<path>>...

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv.splice(at, 2)[1] : dflt;
};
const harness = resolve(opt('--harness', '.'));
const oldRev = opt('--old-rev', 'fefe306c');
const git = (...a) => execFileSync('git', ['-C', harness, ...a], { maxBuffer: 1 << 30 });

const now = await import(pathToFileURL(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const scratch = mkdtempSync(join(tmpdir(), 'l4a-residue-'));
const oldFile = join(scratch, 'drop-signals-judge.mjs');
writeFileSync(oldFile, git('show', `${oldRev}:scripts/linux-engine-diff/drop-signals-judge.mjs`));
const old = await import(pathToFileURL(oldFile).href);
rmSync(scratch, { recursive: true });

/** A sitting's results bytes: a git blob, a results file, or a step directory's `run/results.jsonl[.gz]`. */
function bytesOf(src) {
  if (src.startsWith('git:')) {
    const [, rev, ...rest] = src.split(':');
    return { bytes: git('show', `${rev}:${rest.join(':')}`), gz: src.endsWith('.gz') };
  }
  let file = src;
  if (statSync(src).isDirectory()) file = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(src, p)).find(existsSync);
  if (!file) throw new Error(`${src}: no run/results.jsonl`);
  return { bytes: readFileSync(file), gz: file.endsWith('.gz') };
}
const rowsOf = (src) => {
  const { bytes, gz } = bytesOf(src);
  return (gz ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

/** One run's verdicts by both judges, as the gate's runner judges it (experiments.mjs). */
function judge(rows) {
  const meta = rows.find((r) => r.kind === 'meta');
  if (meta?.experiment !== 'drop-signals') throw new Error('not a drop-signals run');
  const args = { families: meta.families ?? ['chrome'], plan: meta.plan ?? 'main', samplesTrials: meta.trials ?? null };
  return { meta, then: old.dropSignalsVerdict(args, rows), now: now.dropSignalsVerdict(args, rows) };
}

const verdict = (v) => (v.failed.length ? 'FAIL' : 'pass');
const residueOf = (v) => (v.counts.residue?.length ? v.counts.residue.map((x) => `${x.lane} ${x.cell} ${x.count} of ${x.drags}, bound ${x.bound}${x.over ? ' (OVER)' : ''}`).join('; ') : 'not covered');

const sittings = argv.map((a) => {
  const at = a.indexOf('=');
  return { label: a.slice(0, at), src: a.slice(at + 1) };
});
const judged = [];
for (const { label, src } of sittings) {
  const rows = rowsOf(src);
  const runs = [...new Set(rows.map((r) => r.run))];
  if (runs.length !== 1) throw new Error(`${label}: ${runs.length} runs in one results file`);
  const { meta, then, now: v } = judge(rows);
  const load = [...new Set(rows.filter((r) => r.kind === 'drop-signal').map((r) => r.load))].join(', ');
  judged.push({ label, rows, v });
  console.log(`## ${label}`);
  console.log(`source: ${src}`);
  console.log(`run ${runs[0]}, plan ${meta.plan}, load ${load}, trials ${meta.trials ?? 'the plan whole'}, ${rows.filter((r) => r.kind === 'drop-signal').length} drags; judge ${v.judge}`);
  console.log(`H's judge (${oldRev}): ${verdict(then)}; with the residue: ${verdict(v)}; ${verdict(then) === verdict(v) ? 'verdict unchanged' : 'VERDICT MOVED'}`);
  const gone = then.failed.filter((f) => !v.failed.includes(f));
  const added = v.failed.filter((f) => !then.failed.includes(f));
  console.log(`residue: ${residueOf(v)}`);
  if (gone.length) console.log(`fails the residue removed: ${gone.join(' | ')}`);
  if (added.length) console.log(`fails the residue added: ${added.join(' | ')}`);
  if (v.failed.length) console.log(`fails that stand: ${v.failed.join(' | ')}`);
  console.log('');
}

// ---- negative controls: a sitting the residue passes, its rows edited one way at a time; every edit must fail
const base = judged.find((j) => !j.v.failed.length && j.v.counts.residue?.some((x) => x.count > 0));
if (!base) {
  console.log('negative controls: no sitting passes with a residue, none run');
} else {
  const cell = base.v.counts.residue.find((x) => x.count > 0);
  const inCell = (r) => r.kind === 'drop-signal' && r.lane === cell.lane && r.cell === cell.cell;
  const residual = (r) => inCell(r) && !r.outcome?.landed;
  const clone = () => base.rows.map((r) => structuredClone(r));
  /** A landed, ok drop of the cell turned into the residue row's shape: no landing, the same kept notice, the same page record. */
  const asResidue = (rows, k) => {
    const model = rows.find(residual);
    const landed = rows.filter((r) => inCell(r) && r.outcome?.landed);
    for (const r of landed.slice(0, k)) Object.assign(r, { ok: model.ok, notice: model.notice, next: structuredClone(model.next), outcome: structuredClone(model.outcome), before: structuredClone(model.before), after: structuredClone(model.after) });
    return rows;
  };
  const controls = [
    [`one more honest non-landing than the bound (${cell.bound + 1 - cell.count} landed drops made the residue's shape)`, () => asResidue(clone(), cell.bound + 1 - cell.count)],
    ['the residue row answered ok, its notice and refusal removed: a false ok', () => clone().map((r) => (residual(r) ? { ...r, notice: null, next: { ok: true, error: null, late_dnd: null } } : r))],
    ["the residue row's notice not kept by the next acting request", () => clone().map((r) => (residual(r) ? { ...r, next: { ok: true, error: null, late_dnd: null } } : r))],
    ["the residue row's own dragend a drop elsewhere on the page", () => clone().map((r) => (residual(r) ? { ...r, after: { ...r.after, last: { ...r.after.last, effect: 1 } } } : r))],
    ['the same rows at idle', () => clone().map((r) => (r.kind === 'drop-signal' ? { ...r, load: 'idle' } : r))],
    ["the same rows at the gate's window load", () => clone().map((r) => (r.kind === 'drop-signal' ? { ...r, load: 'gate-windows' } : r))],
    ['a false ok added in the same series (another landed drop answered ok, nothing dropped)', () => {
      const rows = clone();
      const r = rows.find((x) => inCell(x) && x.outcome?.landed && x.ok === true && !x.notice);
      Object.assign(r, { outcome: { ...r.outcome, landed: false }, after: { ...r.after, last: { ...r.after.last, effect: 0 } } });
      return rows;
    }],
  ];
  console.log(`## negative controls on ${base.label} (${cell.lane} ${cell.cell}: ${cell.count} of ${cell.drags}, bound ${cell.bound})`);
  let held = 0;
  for (const [name, edit] of controls) {
    const v = judge(edit()).now;
    const ok = v.failed.length > 0;
    held += ok ? 1 : 0;
    console.log(`- ${name}: ${ok ? 'FAIL, as it must' : 'PASSED: THE CONTROL DID NOT FAIL'}${ok ? ` (${v.failed.join(' | ')})` : ''}`);
  }
  console.log(`controls: ${held} of ${controls.length} failed`);
  if (held !== controls.length) process.exitCode = 1;
}
