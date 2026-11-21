#!/usr/bin/env node
// Task 122, ruling 957: a957-alternate.mjs on one private display of its own (display.mjs `runOnPrivateDisplay`, the
// private display a gate step gets: Xvfb with its watchdog, Openbox, the `person` xterm), as task 121's private-run.mjs
// runs the harness. Development runs, never counted.
//   node a957-run.mjs <repo> <out dir> <rounds> <A>=<bin> <B>=<bin>
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, dir, rounds, a, b] = process.argv.slice(2);
const root = resolve(repo);
mkdirSync(dir, { recursive: true });
const label = `development run, not a release gate (task 122, ruling 957: t14-long, ${a.split('=')[0]} against ${b.split('=')[0]}, alternating)`;
const log = (name) => { const p = join(dir, name); writeFileSync(p, `${label}\n`); return openSync(p, 'a'); };
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const script = new URL('./a957-alternate.mjs', import.meta.url).pathname;
const result = await runOnPrivateDisplay({ dir, label, script, args: [root, dir, rounds, a, b], cwd: root, env: process.env, out: log('stdout.log'), err: log('stderr.log') });
writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.exit(result.code ?? 1);
