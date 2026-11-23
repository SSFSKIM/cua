#!/usr/bin/env node
// Task 126 (#459's prototype, rulings 957 and 958): one drop-signals plan with several engines alternating, in one
// session on one private display (display.mjs `runOnPrivateDisplay` runs this script once, through p459-run.mjs). It
// runs the harness <rounds> x <lanes> times, each run `--trials <n>` (one block, its first drag cold), the lanes'
// order rotated each round (round k starts at lane k mod L), every run with the same `--load-factor`, display and
// checkout, `--engine-stats` (an experiment is a development run) so each engine's `--stats` lines are kept beside its rows. Task 122's
// a957-alternate.mjs generalized to L lanes. Development runs, never counted.
//   node p459-alternate.mjs <repo> <out dir> <plan> <rounds> <trials> <load factor|0> <label>=<engine>...
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [repo, out, plan, roundsArg, trialsArg, loadArg, ...engines] = process.argv.slice(2);
// a lane's `@<n>` suffix gives its own trials a run, in place of <trials> (ruling 974: 150 of one lane beside 100)
const lanes = engines.map((e) => { const [label, spec] = e.split('='); const [bin, n] = spec.split('@'); return { label, bin, trials: n ?? null }; });
if (!repo || !out || !plan || lanes.length < 1 || lanes.some((l) => !l.label || !l.bin)) throw new Error('usage: p459-alternate.mjs <repo> <out> <plan> <rounds> <trials> <load> <A>=<bin>...');
const NORECORD = join(repo, 'scripts/linux-engine-gate/norecord.mjs');
const log = (row) => appendFileSync(join(out, 'p459.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);
const load = () => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
let failed = 0;
for (let k = 0; k < Number(roundsArg); k++) {
  const order = lanes.map((_, j) => lanes[(j + k) % lanes.length]);
  for (const lane of order) {
    const dir = join(out, lane.label, `r${k}`);
    mkdirSync(dir, { recursive: true });
    const args = ['--experiment', 'drop-signals', '--family', 'chrome', '--plan', plan, ...(Number(loadArg) ? ['--load-factor', loadArg] : []),
      '--trials', lane.trials ?? trialsArg, '--engine-stats', '--cua', lane.bin, '--run', `dev-p459-${plan}-${lane.label}-r${k}`, '--out', join(dir, 'run')];
    log({ kind: 'start', round: k, engine: lane.label, bin: lane.bin, load: load() });
    const r = spawnSync(process.execPath, [NORECORD, join(repo, 'scripts/linux-engine-diff.mjs'), ...args], { cwd: repo, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    log({ kind: 'end', round: k, engine: lane.label, code: r.status, signal: r.signal, load: load() });
    // a run's own verdict may fail on a false ok: that is the measurement, so the alternation goes on; a run that did
    // not finish (a signal, or no exit code) stops it
    if (r.status == null) process.exit(3);
    if (r.status !== 0) failed += 1;
  }
}
log({ kind: 'done', runs_failed_their_verdict: failed });
