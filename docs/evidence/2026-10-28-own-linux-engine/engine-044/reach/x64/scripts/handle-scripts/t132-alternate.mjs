#!/usr/bin/env node
// Task 148 (task 132's t132-alternate.mjs, the run name only changed): one drop-signals plan with several engines alternating, in one session
// on one private display (t132-run.mjs runs this script once). It runs the harness <rounds> x <lanes> times, the lanes'
// order rotated each round (round k starts at lane k mod L), every run with the same `--load-factor`, display and
// checkout, and `--engine-stats` so each engine's `--stats` lines are kept beside its rows. <trials> caps each cell
// (`--trials`); `-` runs the plan whole, judged as the plan's judge judges it. A lane's `@<n>` gives its own cap.
// Development runs, never counted.
//   node t132-alternate.mjs <repo> <out dir> <family> <plan> <rounds> <trials|-> <load factor|0> <label>=<engine>[@<n>]...
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [repo, out, family, plan, roundsArg, trialsArg, loadArg, ...engines] = process.argv.slice(2);
const lanes = engines.map((e) => { const [label, spec] = e.split('='); const [bin, n] = spec.split('@'); return { label, bin, trials: n ?? trialsArg }; });
if (!repo || !out || !family || !plan || lanes.length < 1 || lanes.some((l) => !l.label || !l.bin)) throw new Error('usage: t132-alternate.mjs <repo> <out> <family> <plan> <rounds> <trials|-> <load> <A>=<bin>...');
const NORECORD = join(repo, 'scripts/linux-engine-gate/norecord.mjs');
const log = (row) => appendFileSync(join(out, 't132.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);
const load = () => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
let failed = 0;
for (let k = 0; k < Number(roundsArg); k++) {
  const order = lanes.map((_, j) => lanes[(j + k) % lanes.length]);
  for (const lane of order) {
    const dir = join(out, lane.label, `r${k}`);
    mkdirSync(dir, { recursive: true });
    const args = ['--experiment', 'drop-signals', '--family', family, '--plan', plan, ...(Number(loadArg) ? ['--load-factor', loadArg] : []),
      ...(lane.trials === '-' ? [] : ['--trials', lane.trials]), '--engine-stats', '--cua', lane.bin, '--run', `dev-t148-${plan}-${lane.label}-r${k}`, '--out', join(dir, 'run')];
    log({ kind: 'start', round: k, engine: lane.label, bin: lane.bin, load: load() });
    const r = spawnSync(process.execPath, [NORECORD, join(repo, 'scripts/linux-engine-diff.mjs'), ...args], { cwd: repo, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    log({ kind: 'end', round: k, engine: lane.label, code: r.status, signal: r.signal, load: load() });
    // a run's own verdict may fail: that is the measurement, so the alternation goes on; a run that did not finish
    // (a signal, or no exit code) stops it
    if (r.status == null) process.exit(3);
    if (r.status !== 0) failed += 1;
  }
}
log({ kind: 'done', runs_failed_their_verdict: failed });
