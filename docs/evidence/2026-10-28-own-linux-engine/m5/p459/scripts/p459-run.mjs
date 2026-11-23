#!/usr/bin/env node
// Task 126 (#459's prototype): p459-alternate.mjs on one private display of its own (display.mjs `runOnPrivateDisplay`,
// the private display a gate step gets: Xvfb with its watchdog, Openbox, the `person` xterm), as task 122's
// a957-run.mjs runs it. Development runs, never counted.
//   node p459-run.mjs <repo> <out dir> <plan> <rounds> <trials> <load factor|0> <label>=<engine>...
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, dir, plan, rounds, trials, load, ...lanes] = process.argv.slice(2);
const root = resolve(repo);
mkdirSync(dir, { recursive: true });
const label = `development run, not a release gate (task 126, #459's prototype: ${plan}, ${lanes.map((l) => l.split('=')[0]).join(' / ')}, alternating, load ${load})`;
const log = (name) => { const p = join(dir, name); writeFileSync(p, `${label}\n`); return openSync(p, 'a'); };
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const script = new URL('./p459-alternate.mjs', import.meta.url).pathname;
const result = await runOnPrivateDisplay({ dir, label, script, args: [root, dir, plan, rounds, trials, load, ...lanes], cwd: root, env: process.env, out: log('stdout.log'), err: log('stderr.log') });
writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.exit(result.code ?? 1);
