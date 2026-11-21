#!/usr/bin/env node
// Task 123, ruling 953: the shipped twin of L4b on x64 at H6, as a development run that is never counted. It is plan
// `t14-long` (cua: long-left 100) at twice the load, on the engine as it ships (the `cua` lane, no measurement flag).
//
// It is L4b's launch as the H6 runner gives it (task 121's launch-plan.mjs, `plan-l4b.txt`): `linux-engine-diff.mjs
// --experiment drop-signals --family chrome --plan t14 --load-factor 2 --cua <home-x64-042's engine> --run pinned-L4b
// --pinned --out <dir>/run`, with CUA_HOME the run home and task 59's Firefox first on PATH, on a private display of
// its own (display.mjs `runOnPrivateDisplay`, as gate.mjs runs a private step). It changes three arguments, and
// nothing else:
//   - `--plan t14` becomes `--plan t14-long`;
//   - `--run pinned-L4b` becomes `--run pinned-a953-t14-long`;
//   - `--pilot` is added beside `--pinned`, so the run is a development run on the pinned release (PINNED_DEVELOPMENT),
//     never counted. It changes no plan.
// The judge is L4b's own (drop-signals-judge.mjs, run by the experiment itself).
// usage (under locked.sh): node a953.mjs <out dir>
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';

const W = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64';
const D = '/Users/new/.local/share/cua-171';
const dir = process.argv[2];
if (!dir) throw new Error('usage: a953.mjs <out dir>');
mkdirSync(join(dir, 'run'), { recursive: true });
const { runOnPrivateDisplay } = await import(`${W}/scripts/linux-engine-gate/display.mjs`);
const args = ['--experiment', 'drop-signals', '--family', 'chrome', '--plan', 't14-long', '--load-factor', '2',
  '--cua', `${D}/m5/home-x64-042/engine/linux/cua-engine`, '--run', 'pinned-a953-t14-long', '--pinned', '--pilot',
  '--out', join(dir, 'run')];
const env = { ...process.env, CUA_HOME: `${D}/m5/home-x64-042`, PATH: `${D}/task59/bin:${process.env.PATH}` };
const out = openSync(join(dir, 'stdout.log'), 'a');
const err = openSync(join(dir, 'stderr.log'), 'a');
const result = await runOnPrivateDisplay({ dir, label: 'a953', script: join(W, 'scripts/linux-engine-diff.mjs'), args, cwd: W, env, out, err });
console.log(JSON.stringify({ result }));
process.exit(result.code === 0 && result.clean ? 0 : 1);
