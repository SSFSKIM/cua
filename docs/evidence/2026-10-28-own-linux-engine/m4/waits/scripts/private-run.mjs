#!/usr/bin/env node
// One differential run of the harness on a private X server (never :0), as task 49's session.mjs ran its phases: the
// harness's own `startPrivateServer` (Xvfb -displayfd, its watchdog, the private mark), no authority file, Openbox, and
// an xterm standing for the person's window, active at the start; the run itself through norecord.mjs; then the
// server stopped and its watchdog's verdict printed. `xprobe order-watch` records the display for the whole run.
// usage: node private-run.mjs <harness dir> <out> <linux-engine-diff.mjs arguments, --out excluded>
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, openSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [harness, out, ...args] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(out, { recursive: true });
const { startPrivateServer } = await import(join(harness, 'scripts/linux-engine-diff/xtools.mjs'));
const { declareLiveRun } = await import(join(harness, 'scripts/linux-engine-diff/xspawn.mjs'));
declareLiveRun('task 64: a private-display differential run (private-run.mjs)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (row) => appendFileSync(join(out, 'session.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);
const x = (env, cmd, a) => {
  try {
    return execFileSync(cmd, a, { env, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `error: ${String(e.stderr || e.message).trim().slice(0, 200)}`;
  }
};
const server = await startPrivateServer({ out });
const env = { ...process.env, DISPLAY: server.display, XAUTHORITY: join(out, 'no-xauthority') };
if (server.display === ':0') throw new Error('not a private display');
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
const xprobe = join(harness, 'scripts/linux-engine-diff/xprobe/target/release/xprobe');
const watcher = spawn(xprobe, ['order-watch'], { env, stdio: ['pipe', openSync(join(out, 'order.jsonl'), 'w'), 'ignore'] });
log({ kind: 'setup', openbox: wm.pid, person: personId });
const child = spawn(process.execPath, [join(here, 'norecord.mjs'), harness, ...args, '--out', join(out, 'run')], { env, cwd: harness, stdio: ['ignore', openSync(join(out, 'stdout.log'), 'w'), openSync(join(out, 'stderr.log'), 'w')] });
process.on('SIGTERM', () => child.kill('SIGTERM'));
const result = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
log({ kind: 'run-end', ...result });
watcher.stdin.end();
await sleep(500);
person.kill('SIGTERM');
wm.kill('SIGTERM');
await sleep(500);
const verdict = await server.stop();
log({ kind: 'server-stopped', clean: verdict.clean, reason: verdict.reason });
console.log(`run exit ${result.code ?? result.signal}; watchdog ${verdict.clean ? 'clean' : verdict.reason}`);
process.exit(result.code === 0 && verdict.clean ? 0 : 1);
