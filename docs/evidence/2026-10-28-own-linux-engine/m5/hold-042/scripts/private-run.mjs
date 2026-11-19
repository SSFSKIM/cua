#!/usr/bin/env node
// Task 113 (M5, ruling 886 (i)): one development run of the diff harness on a private display of its own, through the
// gate's own private-display wrapper (scripts/linux-engine-gate/display.mjs: Xvfb -displayfd, openbox, the `person`
// xterm, the display watchdog, norecord.mjs), never :0. With --load-factor N, N stress-ng CPU workers per core run for
// the harness's whole length, started by this script and ended by it (its own process group only). Refused while
// hold-sittings exists or while any stress-ng runs before it starts.
// usage: node private-run.mjs <checkout> <step dir> <label> [--load-factor N] -- <linux-engine-diff.mjs args, no --out>
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, dir, label, ...rest] = process.argv.slice(2);
const sep = rest.indexOf('--');
if (!root || !dir || !label || sep < 0) {
  console.error('usage: node private-run.mjs <checkout> <step dir> <label> [--load-factor N] -- <harness args>');
  process.exit(2);
}
const own = rest.slice(0, sep);
const args = rest.slice(sep + 1);
const factor = own[0] === '--load-factor' ? Number(own[1]) : 0;
const HOLD = '/Users/new/.local/share/cua-171/hold-sittings';
if (existsSync(HOLD)) {
  console.error('hold-sittings present: refusing');
  process.exit(5);
}
const loadRunning = () => {
  try {
    execFileSync('pgrep', ['-x', 'stress-ng']);
    return true;
  } catch {
    return false;
  }
};
// the run before's own load ends its workers a moment after that run released the lock: waited for, at most 20 s,
// before a load still running refuses the run
let running = loadRunning();
for (let i = 0; running && i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  running = loadRunning();
}
if (running) {
  console.error('a stress-ng load is already running: refusing');
  process.exit(4);
}
if (existsSync(dir)) {
  console.error(`${dir} exists: each run writes a directory of its own`);
  process.exit(2);
}
mkdirSync(join(dir, 'run'), { recursive: true });
const record = { label, started: new Date().toISOString(), load_factor: factor || null, cores: availableParallelism(), args };
writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
let load = null;
if (factor > 0) {
  load = spawn('stress-ng', ['--cpu', String(availableParallelism() * factor), '--cpu-method', 'matrixprod', '--timeout', '3h', '--quiet'], { stdio: 'ignore', detached: true });
  const end = () => {
    try {
      process.kill(-load.pid, 'SIGTERM');
    } catch {
      // already ended
    }
  };
  process.once('exit', end);
  process.once('SIGTERM', () => {
    end();
    process.exit(143);
  });
}
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const out = openSync(join(dir, 'stdout.log'), 'a');
const err = openSync(join(dir, 'stderr.log'), 'a');
const result = await runOnPrivateDisplay({ dir, label, script: join(root, 'scripts/linux-engine-diff.mjs'), args: [...args, '--out', join(dir, 'run')], cwd: root, env: process.env, out, err });
if (load) {
  try {
    process.kill(-load.pid, 'SIGTERM');
  } catch {
    // already ended
  }
}
Object.assign(record, { finished: new Date().toISOString(), result });
writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`${label}: exit ${result.code} display ${result.clean ? 'clean' : result.reason}`);
process.exit(result.code === 0 && result.clean ? 0 : 1);
