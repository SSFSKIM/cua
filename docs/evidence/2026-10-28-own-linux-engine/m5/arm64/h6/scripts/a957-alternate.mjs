#!/usr/bin/env node
// Task 122, ruling 957: plan t14-long (the `cua` lane, long-left) at twice the load with two pinned engines alternating,
// in one session on one private display. display.mjs `runOnPrivateDisplay` runs this script once (through
// norecord.mjs); it runs the harness 2 x <rounds> times in turn, each run `--trials 10` (10 long-left drags, one block,
// its first drag cold, as each of t14-long's ten blocks), the engines in ABBA order (round k even: A then B; odd: B then
// A), every run with `--load-factor 2`, on the same display and checkout. Every harness run goes through norecord.mjs as
// the display's own child does. Development runs, never counted.
//   node a957-alternate.mjs <repo> <out dir> <rounds> <label A>=<engine A> <label B>=<engine B>
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [repo, out, roundsArg, ...engines] = process.argv.slice(2);
const lanes = engines.map((e) => { const [label, bin] = e.split('='); return { label, bin }; });
if (!repo || !out || lanes.length !== 2 || lanes.some((l) => !l.label || !l.bin)) throw new Error('usage: a957-alternate.mjs <repo> <out> <rounds> <A>=<bin> <B>=<bin>');
const NORECORD = join(repo, 'scripts/linux-engine-gate/norecord.mjs');
const log = (row) => appendFileSync(join(out, 'a957.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);
let failed = 0;
for (let k = 0; k < Number(roundsArg); k++) {
  for (const lane of k % 2 === 0 ? lanes : [...lanes].reverse()) {
    const dir = join(out, lane.label, `r${k}`);
    mkdirSync(dir, { recursive: true });
    const args = ['--experiment', 'drop-signals', '--family', 'chrome', '--plan', 't14-long', '--load-factor', '2', '--trials', '10',
      '--cua', lane.bin, '--run', `dev-a957-${lane.label}-r${k}`, '--out', join(dir, 'run')];
    log({ kind: 'start', round: k, engine: lane.label, bin: lane.bin, load: (await import('node:fs')).readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ') });
    const r = spawnSync(process.execPath, [NORECORD, join(repo, 'scripts/linux-engine-diff.mjs'), ...args], { cwd: repo, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
    log({ kind: 'end', round: k, engine: lane.label, code: r.status, signal: r.signal });
    // a run's own verdict may fail on a false ok: that is the measurement, so the alternation goes on; a run that did
    // not finish (a signal, or no exit code) stops it
    if (r.status == null) process.exit(3);
    if (r.status !== 0) failed += 1;
  }
}
log({ kind: 'done', runs_failed_their_verdict: failed });
