// A gate step's private display (M4's T18), never `:0`: the harness's own X server (`startPrivateServer`: Xvfb
// -displayfd, its watchdog, the private mark), no authority file, Openbox, and an xterm titled `person` standing for the
// person's window, active at the start, as task 49's session and task 73's private-run.mjs set it up; `xprobe
// order-watch` records the display for the whole step. The step's harness script runs through gate-norecord.mjs, so no
// whole-run RECORD starts (task 41: RECORD can freeze the X server). Then the server is stopped and its watchdog's verdict
// answered. Every line the wrapper writes carries the step's label.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, openSync } from 'node:fs';
import { join } from 'node:path';

import { XPROBE } from './xtools.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NORECORD = new URL('./gate-norecord.mjs', import.meta.url).pathname;

/** One command on the private display: its output, or the error's first words (`xprop`, `xdotool`). */
function x(env, cmd, args) {
  try {
    return execFileSync(cmd, args, { env, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `error: ${String(e.stderr || e.message).trim().slice(0, 200)}`;
  }
}

/**
 * `node gate-norecord.mjs <script> <args...>` on a private display of its own, from `cwd`: `{code, signal, clean,
 * reason}`, `clean` the display watchdog's verdict. `out` and `err` are the open log files' descriptors.
 */
export async function runOnPrivateDisplay({ dir, label, script, args, cwd, env: base = process.env, out, err }) {
  const { startPrivateServer } = await import('./xtools.mjs');
  const { declareLiveRun } = await import('./xspawn.mjs');
  declareLiveRun("a gate step's private display (gate-display.mjs)");
  const log = (row) => appendFileSync(join(dir, 'session.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), label, ...row })}\n`);
  const server = await startPrivateServer({ out: dir });
  if (server.display === ':0') throw new Error('not a private display');
  const env = { ...base, DISPLAY: server.display, XAUTHORITY: join(dir, 'no-xauthority') };
  log({ kind: 'server', display: server.display, pid: server.pid });
  const wm = spawn('openbox', [], { env, stdio: 'ignore' });
  for (let i = 0; i < 50 && !/window id/.test(x(env, 'xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'])); i++) await sleep(100);
  const person = spawn('xterm', ['-T', 'person', '-e', 'sleep', '100000'], { env, stdio: 'ignore' });
  let personId = '';
  for (let i = 0; i < 100 && !/^\d+$/.test(personId); i++) {
    personId = x(env, 'xdotool', ['search', '--name', '^person$']).split('\n')[0];
    await sleep(100);
  }
  x(env, 'xdotool', ['windowactivate', '--sync', personId]);
  const watcher = spawn(XPROBE, ['order-watch'], { env, stdio: ['pipe', openSync(join(dir, 'order.jsonl'), 'w'), 'ignore'] });
  log({ kind: 'setup', openbox: wm.pid, person: personId });
  const child = spawn(process.execPath, [NORECORD, script, ...args], { env, cwd, stdio: ['ignore', out, err] });
  const forward = (signal) => child.kill(signal);
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  const result = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  process.off('SIGTERM', forward);
  process.off('SIGINT', forward);
  log({ kind: 'run-end', ...result });
  watcher.stdin.end();
  await sleep(500);
  person.kill('SIGTERM');
  wm.kill('SIGTERM');
  await sleep(500);
  const verdict = await server.stop();
  log({ kind: 'server-stopped', clean: verdict.clean, reason: verdict.reason });
  return { ...result, clean: verdict.clean, reason: verdict.reason };
}
