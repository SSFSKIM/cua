// A differential run on a private display: a private Xvfb the harness starts (`startPrivateServer`, marked private,
// under its watchdog) with Openbox, then `scripts/linux-engine-diff.mjs <args>` from the exported harness with
// DISPLAY naming it, so the run treats it as the private display it is (its own session bus, the whole-run record).
// This process withdraws the live-run declaration first, so it reaches no display it did not create, `:0` included.
// usage: node priv-run.mjs <harness dir> <out dir> -- <linux-engine-diff args...>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [harness, out, sep, ...args] = process.argv.slice(2);
if (sep !== '--') throw new Error('usage: priv-run.mjs <harness dir> <out dir> -- <args...>');
const lib = (m) => import(join(harness, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, xSpawn } = await lib('xspawn.mjs');
mkdirSync(join(out, 'server'), { recursive: true });
delete process.env[LIVE_RUN];
assertReachable('the private run', [], { DISPLAY: ':cua171-private-run' });
process.env.DISPLAY = ':cua171-private-run';
const server = await startPrivateServer({ out: join(out, 'server') });
process.env.DISPLAY = server.display;
const wm = xSpawn('openbox', [], { env: process.env, stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1500));
let code;
try {
  const child = spawn('node', ['scripts/linux-engine-diff.mjs', ...args], { cwd: harness, env: { ...process.env, DISPLAY: server.display }, stdio: 'inherit' });
  code = await new Promise((resolve) => child.once('exit', (c, s) => resolve(c ?? s)));
} finally {
  try {
    process.kill(-wm.pid, 'SIGTERM');
  } catch {
    // gone
  }
  const watched = await server.stop();
  console.log(JSON.stringify({ kind: 'private-run-end', display: server.display, code, watchdog_clean: watched.clean }));
}
process.exit(typeof code === 'number' ? code : 1);
