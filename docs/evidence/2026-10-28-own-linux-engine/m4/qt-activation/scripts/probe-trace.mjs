// Probe: an X trace of Qt's own connection while a background click activates its window. The family's application
// runs behind an xtrace proxy of its own (its DISPLAY the proxy's), so the trace shows every event Qt received, in the
// order it read them, and every request it made; marks around each click split the trace by run. On a private Xvfb with
// Openbox, the front window covering the screen, at the load factor given.
// usage: node probe-trace.mjs <harness> <engine> <family> <load factor> <clicks> <out dir>
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const [root, bin, family, factorArg, clicksArg, outDir] = process.argv.slice(2);
const factor = Number(factorArg);
const clicks = Number(clicksArg);
const lib = (m) => import(join(root, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN } = await lib('xspawn.mjs');
const { Desktop, activeWindow } = await lib('scenes.mjs');
const { FAMILIES, openFamily } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Engine } = await lib('engine.mjs');
const { startProxy } = await lib('audit.mjs');
mkdirSync(outDir, { recursive: true });
const scratch = mkdtempSync('/tmp/cua171-qttrace-');
delete process.env[LIVE_RUN];
process.env.DISPLAY = ':cua171-qttrace';
const server = await startPrivateServer({ out: scratch });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: bin, run: 'qttrace', logs: scratch });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wm;
let load;
let proxy;
const rows = [];
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  proxy = await startProxy();
  const launch = FAMILIES[family].launch;
  FAMILIES[family].launch = (ctx) => {
    const spec = launch(ctx);
    return { ...spec, cmd: 'env', args: [`DISPLAY=${proxy.env.DISPLAY}`, `XAUTHORITY=${proxy.env.XAUTHORITY}`, spec.cmd, ...spec.args] };
  };
  const a = await openFamily(desktop, oracle, family, 'focus-a');
  desktop.arrangeFront('covered');
  await sleep(800);
  const head = { family, factor, window: a.id, front: desktop.front.id };
  console.log(JSON.stringify(head));
  if (factor > 0) {
    const cores = availableParallelism();
    load = spawn('stress-ng', ['--cpu', String(cores * factor), '--cpu-method', 'matrixprod', '--timeout', '1h', '--quiet'], { stdio: 'ignore', detached: true });
    await sleep(5000);
  }
  for (let i = 0; i < clicks; i++) {
    if (activeWindow() !== desktop.front.id) {
      desktop.focusFront();
      await sleep(300);
    }
    await sleep(400);
    const eng = new Engine({ label: 'click', bin, stats: true }).start();
    let response;
    const from = await proxy.mark(`before ${i}`);
    try {
      ({ response } = await eng.request('click', { window: { id: a.id }, x: 60, y: 120 }));
      await sleep(300);
    } finally {
      await eng.close();
    }
    const to = await proxy.mark(`after ${i}`);
    const row = { i, ok: response.ok, error: response.error ?? null, front_active: activeWindow() === desktop.front.id, trace: [from, to] };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  if (load) try { process.kill(-load.pid, 'SIGTERM'); } catch {}
  await desktop.closeAll();
  if (wm) try { process.kill(-wm.pid, 'SIGTERM'); } catch {}
  let text = '';
  if (proxy) text = await proxy.stop();
  writeFileSync(join(outDir, `${family}-x${factor}.xtrace`), text);
  writeFileSync(join(outDir, `${family}-x${factor}.runs.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log('watchdog', (await server.stop()).clean);
  rmSync(scratch, { recursive: true, force: true });
}
