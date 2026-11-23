#!/usr/bin/env node
// Task 121 (#171 M5): one harness run on a private display of its own, set up as a gate step's is
// (scripts/linux-engine-gate/display.mjs `runOnPrivateDisplay`: Xvfb with its watchdog, Openbox, the `person` xterm),
// for development runs that are no gate step (the 0.4.2 late-take sweep). Development runs only, never counted.
//
//   node private-run.mjs <repo> <dir> <label> -- <harness args...>
//
// The harness's own --out is <dir>/run; its stdout and stderr go to <dir>/stdout.log and <dir>/stderr.log.

import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, dir, label, sep, ...args] = process.argv.slice(2);
if (!repo || !dir || !label || sep !== '--') throw new Error('usage: private-run.mjs <repo> <dir> <label> -- <harness args...>');
const root = resolve(repo);
mkdirSync(join(dir, 'run'), { recursive: true });
const log = (name) => {
  const path = join(dir, name);
  writeFileSync(path, `${label}\n`);
  return openSync(path, 'a');
};
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
const result = await runOnPrivateDisplay({ dir, label, script: join(root, 'scripts/linux-engine-diff.mjs'), args: [...args, '--out', join(dir, 'run')], cwd: root, env: process.env, out: log('stdout.log'), err: log('stderr.log') });
writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${label}: ${JSON.stringify(result)}\n`);
process.exit(result.code === 0 && result.clean ? 0 : 1);
