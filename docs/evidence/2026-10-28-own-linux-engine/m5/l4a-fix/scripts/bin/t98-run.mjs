#!/usr/bin/env node
// Task 98: one development run of the harness on a private display of its own (the gate's wrapper, display.mjs: Xvfb,
// Openbox, the `person` xterm, the order watch; never :0), for a drop-signals plan the gate's steps do not name. The
// gate's own steps (L4a, H1) go through gate.mjs itself. Refuses while the host is held for sittings, under a load
// already running, and into a directory that exists. Run it under the host lock.
// usage: t98-run.mjs <checkout> <out dir> <run name> <harness args...>   (--out and --run are added)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [root, dir, name, ...args] = process.argv.slice(2);
const HOLD = '/Users/new/.local/share/cua-171/hold-sittings';
const label = 'development run, not a release gate (task 98)';
const refuse = (why) => {
  console.error(`refused: ${why}`);
  process.exit(2);
};
if (!root || !dir || !name) refuse('usage: t98-run.mjs <checkout> <out dir> <run name> <harness args...>');
if (existsSync(HOLD)) refuse(`${HOLD} exists: the host is held for sittings`);
if (existsSync(dir)) refuse(`${dir} exists: each run writes a directory of its own`);
try {
  execFileSync('pgrep', ['-x', 'stress-ng'], { stdio: 'ignore' });
  refuse('stress-ng is running: a run starts only on a host with no load running');
} catch {
  // none running
}
mkdirSync(join(dir, 'run'), { recursive: true });
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const argv = [...args, '--run', name, '--out', join(dir, 'run')];
const record = { label, name, checkout: root, commit, argv, started: new Date().toISOString() };
writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
const log = (file) => {
  writeFileSync(join(dir, file), `${label}\n`);
  return openSync(join(dir, file), 'a');
};
const { runOnPrivateDisplay } = await import(join(root, 'scripts/linux-engine-gate/display.mjs'));
const firefox = '/Users/new/.local/share/cua-171/task59/bin';
const env = { ...process.env, PATH: existsSync(firefox) ? `${firefox}:${process.env.PATH}` : process.env.PATH };
const result = await runOnPrivateDisplay({ dir, label, script: join(root, 'scripts/linux-engine-diff.mjs'), args: argv, cwd: root, env, out: log('stdout.log'), err: log('stderr.log') });
const exit = result.code === 0 && result.clean ? 0 : 1;
writeFileSync(join(dir, 'step.json'), `${JSON.stringify({ ...record, finished: new Date().toISOString(), exit, child_exit: result.code ?? result.signal, display_watchdog: result.clean ? 'clean' : result.reason }, null, 2)}\n`);
console.log(`${label}: ${name} exit ${exit} (harness ${result.code ?? result.signal}, display ${result.clean ? 'clean' : result.reason})`);
process.exit(exit);
