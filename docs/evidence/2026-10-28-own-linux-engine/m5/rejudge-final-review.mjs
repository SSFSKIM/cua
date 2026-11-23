// The stored counted rows at H8 judged again by the final review's fixes (task 139, ruling 1091), offline the 957 way:
// nothing rerun, each step's own rows through this checkout's judges, beside the verdict it stored.
// - V5, K1, K2 (device.mjs `judgeDevice`): a drop the page showed after the effect poll (`drop_seen`, or the later
//   `drop_status` read risen) now counts as a drop wherever the path ended. Per step: the drop cells' rows that reading
//   reaches (the effect not seen, a drop seen), each listed, and every device verdict re-judged (rejudge-device.mjs).
// - L4d (`partsVerdict`): each part's manifest held to its plan's declared cells (`PART_CELLS`).
// - K3 and every other drop-signals step: re-judged through `dropSignalsVerdict` (rejudge-drops.mjs), beside the stored
//   verdict, with the lanes and trials the run ran under.
// Writes `rejudge-final-review.txt` into each step's directory and prints a line per step.
//
//   node docs/evidence/2026-10-28-own-linux-engine/m5/rejudge-final-review.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { DEVICE_OPS } from '../../../../scripts/linux-engine-diff/device.mjs';
import { evidenceOf, rejudgeDevice } from '../../../../scripts/linux-engine-diff/rejudge-device.mjs';
import { rejudge } from '../../../../scripts/linux-engine-diff/rejudge-drops.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();

const STEPS = {
  x64: { device: ['zero/V5.pinned-release', 'out/K1.pinned-release', 'out/K2.pinned-release'], drops: ['out/L4d.pinned-release', 'out/K3.pinned-release', 'out/C1.pinned-release', 'out/H1.pinned-release', 'out/L4b.pinned-release', 'out/L4c.pinned-release'] },
  arm64: { device: ['out/V5.pinned-release', 'out/V5.pinned-release.stopped-1', 'out/V5.pinned-release.stopped-2', 'out/K1.pinned-release', 'out/K2.pinned-release'], drops: ['out/L4d.pinned-release', 'out/K3.pinned-release', 'out/C1.pinned-release', 'out/H1.pinned-release', 'out/L4b.pinned-release', 'out/L4c.pinned-release'] },
};

const resultsOf = (dir) => ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, p)).find(existsSync);
const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

/** device.mjs `dropSeen`, read off a stored row: the runner's first read risen, or the page's later one. */
const dropSeen = (r) => r.drop_seen === true || (typeof r.drop_status?.before?.drops === 'number' && typeof r.drop_status?.after?.drops === 'number' && r.drop_status.after.drops > r.drop_status.before.drops);

const summary = [];
for (const [arch, { device, drops }] of Object.entries(STEPS)) {
  for (const step of device) {
    const dir = join(HERE, arch, 'h8', step);
    const file = resultsOf(dir);
    const lines = [`# ${arch} ${step}: the device verdicts re-judged at ${head} (task 139; the final review's P1, ruling 1091)`, ''];
    if (!file) {
      lines.push('no results rows: nothing to re-judge');
      summary.push(`${arch} ${step}: no rows`);
    } else {
      const rows = rowsOf(file);
      const confirm = rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && DEVICE_OPS[r.op]?.confirm);
      const reached = confirm.filter((r) => r.effect !== true && dropSeen(r));
      lines.push(`drop cells' samples: ${confirm.length}; reached by the new reading (effect not seen, a drop seen): ${reached.length}`);
      for (const r of reached) lines.push(`  ${r.op} ${r.block}/${r.i}: ok ${r.ok}, effect ${r.effect}, drop_seen ${r.drop_seen ?? '-'}, drops ${r.drop_status?.before?.drops ?? '-'} -> ${r.drop_status?.after?.drops ?? '-'}`);
      const runs = rejudgeDevice(rows, { lines: evidenceOf(dir) });
      for (const run of runs) {
        lines.push('', `run ${run.run}: ${run.verdicts.length} device verdicts; moved ${run.moved.length ? run.moved.join('; ') : 'none'}; failing now ${run.failing.length ? run.failing.join(', ') : 'none'}; the end record's other failures ${run.others.length ? run.others.join('; ') : 'none'}`);
        for (const v of run.verdicts) lines.push(`  ${v.name}: stored ${v.stored.verdict}, now ${v.now.verdict === 'fail' ? 'fail' : 'pass'}${v.moved ? ' MOVED' : ''}`);
      }
      const moved = runs.flatMap((r) => r.moved);
      summary.push(`${arch} ${step}: ${runs.reduce((n, r) => n + r.verdicts.length, 0)} device verdicts, ${reached.length} rows reached, moved ${moved.length ? moved.join('; ') : 'none'}`);
    }
    writeFileSync(join(dir, 'rejudge-final-review.txt'), `${lines.join('\n')}\n`);
  }
  for (const step of drops) {
    const dir = join(HERE, arch, 'h8', step);
    const lines = [`# ${arch} ${step}: the drop-signals verdict re-judged at ${head} (task 139; the final review's P2s)`, ''];
    for (const r of await rejudge([dir])) {
      lines.push(`run ${r.run}: ${r.family} ${r.plan}, gate ${r.gate}, lanes ${JSON.stringify(r.lanes)}, trials ${r.trials}, judge ${r.judge}`);
      lines.push(`  stored: ${r.stored ? (r.stored.pass ? 'pass' : `fail: ${r.stored.failed.join('; ')}`) : 'none'}`);
      lines.push(`  now: ${r.failed.length ? `fail: ${r.failed.join('; ')}` : 'pass'}${r.moved ? ' MOVED' : ''}`);
      if (r.judge === 'partsVerdict') {
        const scenes = rowsOf(resultsOf(dir)).filter((x) => x.kind === 'drop-signal-scene');
        for (const s of scenes) lines.push(`  part ${s.part + 1} (${s.family} ${s.plan}) manifest: ${s.specs.map((c) => `${c.lane} ${c.cell} x${c.n}`).join(', ') || 'empty'}`);
        for (const p of r.counts.parts) lines.push(`  part ${p.part + 1} (${p.family} ${p.plan}): ${p.judge} ${p.pass ? 'pass' : 'fail'}, drags ${p.counts.drags}, false oks ${p.counts.false_ok}, stale-position drops ${p.counts.stale_drops}, ambiguous ${p.counts.ambiguous}`);
      }
      summary.push(`${arch} ${step}: ${r.judge} stored ${r.stored?.pass ? 'pass' : 'fail'}, now ${r.failed.length ? 'fail' : 'pass'}, moved ${r.moved ? 'YES' : 'no'}, lanes ${JSON.stringify(r.lanes)}, trials ${r.trials}`);
    }
    writeFileSync(join(dir, 'rejudge-final-review.txt'), `${lines.join('\n')}\n`);
  }
}
const out = [`# The H8 counted rows re-judged at ${head} (task 139), per step; each step's own file beside its README`, '', ...summary];
writeFileSync(join(HERE, 'rejudge-final-review.txt'), `${out.join('\n')}\n`);
process.stdout.write(`${out.join('\n')}\n`);
process.stdout.write(`written under ${relative(ROOT, HERE)}\n`);
