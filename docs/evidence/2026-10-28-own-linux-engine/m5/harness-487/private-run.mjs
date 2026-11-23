#!/usr/bin/env node
// Task 142: one development sitting of the harness on a private display of its own (the gate's `runOnPrivateDisplay`:
// Xvfb, Openbox, a `person` xterm, `xprobe order-watch`, the run through norecord.mjs), never :0, for a plan no gate
// step runs (`t487-named`). Run it under the host lock. CUA_HOME is the environment's.
//
//   node private-run.mjs <out> <label> <linux-engine-diff.mjs arguments, --out excluded>

import { mkdirSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runOnPrivateDisplay } from '../../../../../scripts/linux-engine-gate/display.mjs';

const [out, label, ...args] = process.argv.slice(2);
const root = resolve(new URL('../../../../../', import.meta.url).pathname);
const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const result = await runOnPrivateDisplay({
  dir,
  label,
  script: join(root, 'scripts/linux-engine-diff.mjs'),
  args: [...args, '--out', join(dir, 'run')],
  cwd: root,
  out: openSync(join(dir, 'stdout.log'), 'w'),
  err: openSync(join(dir, 'stderr.log'), 'w'),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.code === 0 && result.clean ? 0 : 1);
