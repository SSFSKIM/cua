#!/usr/bin/env node
// Task 148 (task 132's t132-run.mjs, the label only changed): t132-alternate.mjs on one private display of its own (display.mjs
// `runOnPrivateDisplay`: Xvfb with its watchdog, Openbox, the `person` xterm), never :0. Development runs, never counted.
//   node t132-run.mjs <repo> <out dir> <family> <plan> <rounds> <trials|-> <load factor|0> <label>=<engine>...
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, dir, family, plan, rounds, trials, load, ...lanes] = process.argv.slice(2);
const root = resolve(repo);
mkdirSync(dir, { recursive: true });
const label = `development run, not a release gate (task 148, linux-engine 0.4.4 pinned at H9: ${family} ${plan}, ${lanes.map((l) => l.split('=')[0]).join(' / ')}, alternating, load ${load})`;
const log = (name) => { const p = join(dir, name); writeFileSync(p, `${label}\n`); return openSync(p, 'a'); };
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const script = new URL('./t132-alternate.mjs', import.meta.url).pathname;
const result = await runOnPrivateDisplay({ dir, label, script, args: [root, dir, family, plan, rounds, trials, load, ...lanes], cwd: root, env: process.env, out: log('stdout.log'), err: log('stderr.log') });
writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.exit(result.code ?? 1);
