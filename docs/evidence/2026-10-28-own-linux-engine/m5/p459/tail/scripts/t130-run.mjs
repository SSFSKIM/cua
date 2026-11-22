#!/usr/bin/env node
// Task 130: one drop-signals run on a private display of its own (display.mjs runOnPrivateDisplay), never :0.
//   node t130-run.mjs <repo> <out dir> <harness args...>
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, dir, ...args] = process.argv.slice(2);
const root = resolve(repo);
mkdirSync(dir, { recursive: true });
const label = `development run, not a release gate (task 130: ${args.join(' ')})`;
const log = (name) => { const p = join(dir, name); writeFileSync(p, `${label}\n`); return openSync(p, 'a'); };
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const script = new URL('./t130-inner.mjs', import.meta.url).pathname;
const result = await runOnPrivateDisplay({ dir, label, script, args: [root, dir, ...args], cwd: root, env: process.env, out: log('stdout.log'), err: log('stderr.log') });
writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.exit(result.code ?? 1);
