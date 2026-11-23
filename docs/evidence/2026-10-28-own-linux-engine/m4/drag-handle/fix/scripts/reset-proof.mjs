#!/usr/bin/env node
// The fix wave's end-to-end proof that a reset frees desktop pointer input at once (the design session's ruling on task
// 73's review, 2026-11-11), through cua's real Linux service and facade over a real engine, on the X display it is
// given (xvfb-run, never :0). The trusted worker outlives a kernel (src/repl-host/supervisor.mjs), so one service serves
// both kernels here; each kernel's bootstrap imports the facade afresh, whose first act is the service's setup
// (src/cua-api/sky.mjs), as a fresh kernel's first cell does after js_reset or a cell's timeout.
//   kernel 1: a drag handle started and moved on an xterm, then a desktop click, refused while the handle is held;
//             its cell then "loses" the handle (no end)
//   kernel 2: the facade imported again (the new kernel's setup), then whether button 1 is still down and whether a
//             desktop click runs
// usage: node reset-proof.mjs <checkout or harness export> <cua-engine>   (one JSON line on stdout)
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, engine] = process.argv.slice(2);
if (!process.env.DISPLAY || process.env.DISPLAY === ':0') throw new Error('a private display only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// whether the server holds button 1 down (the core pointer's QueryPointer mask, the export's own xprobe)
const xprobe = join(repo, 'scripts/linux-engine-diff/xprobe/target/release/xprobe');
const button1 = () => JSON.parse(execFileSync(xprobe, ['buttons-down'], { encoding: 'utf8' })).includes(1);
const settle = async (call) => {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};

const xterm = spawn('xterm', ['-geometry', '80x24+0+0', '-T', 'reset-proof', '-e', 'sleep', '600'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  try {
    if (execFileSync('xdotool', ['search', '--name', '^reset-proof$'], { encoding: 'utf8' }).trim()) break;
  } catch {}
  await sleep(100);
}
const { createService } = await import(pathToFileURL(join(repo, 'src/services/engine/linux/service.mjs')).href);
const service = createService({ env: { ...process.env, CUA_ENGINE_BIN: engine } });
globalThis.nodeRepl = {
  rpc: async (_name, message) => {
    const answer = await service.handleRpc(message);
    return answer === undefined ? null : JSON.parse(JSON.stringify(answer));
  },
  write: () => {},
  emitImage: async () => {},
};
const facade = pathToFileURL(join(repo, 'src/cua-api/sky.mjs')).href;
const out = { engine: execFileSync(engine, ['--version'], { encoding: 'utf8' }).trim() };
try {
  // kernel 1
  const first = await import(`${facade}?kernel=1`);
  const handle = first.sky.drag_handle();
  out.start = await settle(() => handle.start({ x: 100, y: 100 }));
  out.move = await settle(() => handle.move_to({ x: 200, y: 150 }));
  out.held_before_reset = button1();
  out.click_while_held = await settle(() => first.sky.click({ x: 20, y: 20 }));
  // js_reset: kernel 1 and its handle object are gone; kernel 2's bootstrap asks for setup first
  const reset = Date.now();
  const second = await import(`${facade}?kernel=2`);
  out.setup_ms = Date.now() - reset;
  out.held_after_reset = button1();
  out.click_after_reset = await settle(() => second.sky.click({ x: 20, y: 20 }));
  out.held_at_end = button1();
} finally {
  service.close();
  xterm.kill('SIGTERM');
}
console.log(JSON.stringify(out));
process.exit(0);
