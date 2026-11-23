#!/usr/bin/env node
// Task 130: the harness once, on the display runOnPrivateDisplay gave (DISPLAY in env).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const [repo, out, ...args] = process.argv.slice(2);
const r = spawnSync(process.execPath, [join(repo, 'scripts/linux-engine-gate/norecord.mjs'), join(repo, 'scripts/linux-engine-diff.mjs'), ...args, '--out', join(out, 'run')], { cwd: repo, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
process.exit(r.status ?? 3);
