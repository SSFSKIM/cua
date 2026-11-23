// Probe: does a Qt window's AT-SPI frame report `active` once Qt has taken the engine's synthetic FocusIn, and lose it
// after the FocusOut (Qt's 100 ms focusInTimer)? And how often does a background click activate the window, idle and at
// twice the load? On a private Xvfb with Openbox, the front window covering the screen.
// usage: node probe-signal.mjs <harness> <engine> <family> <load factor, 0 idle> <clicks>
import { mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const [root, bin, family, factorArg, clicksArg] = process.argv.slice(2);
const factor = Number(factorArg);
const clicks = Number(clicksArg ?? 10);
const lib = (m) => import(join(root, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN } = await lib('xspawn.mjs');
const { Desktop, activeWindow } = await lib('scenes.mjs');
const { openFamily } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Engine } = await lib('engine.mjs');
const out = mkdtempSync('/tmp/cua171-qtsig-');
delete process.env[LIVE_RUN];
process.env.DISPLAY = ':cua171-qtsig';
const server = await startPrivateServer({ out });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: bin, run: 'qtsig', logs: out });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wm;
let load;
const active = (oracle, frame) => {
  const [[low]] = oracle.on(frame, 'org.a11y.atspi.Accessible', 'GetState');
  return ((low >>> 1) & 1) === 1;
};
async function until(cond, boundMs) {
  const t0 = performance.now();
  while (performance.now() - t0 < boundMs) {
    if (cond()) return Math.round((performance.now() - t0) * 10) / 10;
    await sleep(1);
  }
  return null;
}
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const a = await openFamily(desktop, oracle, family, 'focus-a');
  desktop.arrangeFront('covered');
  await sleep(800);
  console.log(JSON.stringify({ family, frame: a.frame, field: a.field, front: desktop.front.id, window: a.id, active_window: activeWindow(), frame_active: active(oracle, a.frame) }));
  if (factor > 0) {
    const cores = availableParallelism();
    load = spawn('stress-ng', ['--cpu', String(cores * factor), '--cpu-method', 'matrixprod', '--timeout', '1h', '--quiet'], { stdio: 'ignore', detached: true });
    await sleep(5000);
  }
  // A: the frame's active state across a session held open by a key hold (FocusIn, no press), then its FocusOut
  for (let i = 0; i < 5; i++) {
    const eng = new Engine({ label: 'sig', bin, stats: true }).start();
    try {
      const t0 = performance.now();
      const { response } = await eng.request('key_down', { window: { id: a.id }, key: 'shift' });
      const answered = performance.now() - t0;
      const on = await until(() => active(oracle, a.frame), 2000);
      await eng.request('key_up', { window: { id: a.id }, key: 'shift' });
      const off = await until(() => !active(oracle, a.frame), 2000);
      console.log(JSON.stringify({ probe: 'hold', i, ok: response.ok, answered_ms: Math.round(answered * 10) / 10, active_after_ms: on, inactive_after_focus_out_ms: off, active_window_is_front: activeWindow() === desktop.front.id }));
    } finally {
      await eng.close();
    }
    await sleep(300);
  }
  // B: background clicks, one fresh engine each; the front window's state after each
  let lost = 0;
  for (let i = 0; i < clicks; i++) {
    if (activeWindow() !== desktop.front.id) {
      desktop.focusFront();
      await sleep(300);
    }
    await sleep(300);
    const eng = new Engine({ label: 'click', bin, stats: true }).start();
    try {
      const { response } = await eng.request('click', { window: { id: a.id }, x: 60, y: 120 });
      await sleep(300);
      const front = activeWindow() === desktop.front.id;
      if (!front) lost++;
      console.log(JSON.stringify({ probe: 'click', i, ok: response.ok, error: response.error ?? null, front_active: front }));
    } finally {
      await eng.close();
    }
  }
  console.log(JSON.stringify({ family, factor, clicks, front_lost: lost }));
} finally {
  if (load) try { process.kill(-load.pid, 'SIGTERM'); } catch {}
  await desktop.closeAll();
  if (wm) try { process.kill(-wm.pid, 'SIGTERM'); } catch {}
  console.log('watchdog', (await server.stop()).clean);
  rmSync(out, { recursive: true, force: true });
}
