// Debug: does a background click into Firefox's textarea, the window fully unobscured, move the caret?
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';


const root = process.argv[2];
const engine = process.argv[3];
const lib = (m) => import(join(root, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN } = await lib('xspawn.mjs');
const { Desktop, configure } = await lib('scenes.mjs');
const { openFamily } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Engine } = await lib('engine.mjs');
const { preorder } = await lib('normalize.mjs');
const out = mkdtempSync('/tmp/cua171-fx-');
delete process.env[LIVE_RUN];
process.env.DISPLAY = ':cua171-fx-debug';
const server = await startPrivateServer({ out });
process.env.DISPLAY = server.display;
process.env.PATH = `${process.env.HOME}/.local/share/cua-171/task59/bin:${process.env.PATH}`;
const desktop = new Desktop({ cua: engine, run: 'fxdebug', logs: out });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wm;
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const a = await openFamily(desktop, oracle, 'firefox', 'focus-a', { geometry: [620, 600] });
  configure(a.id, 0, 0, 620, 600);
  desktop.arrangeFront('visible');
  await sleep(800);
  const eng = new Engine({ label: 'dbg', bin: engine, stats: true }).start();
  try {
    for (const key of ['s', 'e', 'e', 'd', 'x', 'y', 'z', 'ctrl+End']) await eng.request('press_key', { window: { id: a.id }, key });
    await sleep(500);
    const state = (await eng.request('get_window_state', { window: { id: a.id }, include_screenshot: false })).response.output;
    const origin = state.window;
    const field = a.field;
    console.log('text', JSON.stringify(oracle.text(field)), 'caret', oracle.caret(field), 'origin', JSON.stringify(origin));
    console.log('char0', JSON.stringify(oracle.charExtents(field, 0)), 'field', JSON.stringify(oracle.extents(field)));
    const node = preorder(state.ax_tree).find((n) => n.name === 'Field');
    console.log('node', JSON.stringify(node).slice(0, 300));
    const f = oracle.extents(field);
    for (const [x, y] of [[f.x - origin.x + 3, f.y - origin.y + 10], [f.x - origin.x + 6, f.y - origin.y + 12], [f.x - origin.x + 40, f.y - origin.y + 40]]) {
      const { response } = await eng.request('click', { window: { id: a.id }, x, y });
      await sleep(400);
      await eng.request('press_key', { window: { id: a.id }, key: 'Q' });
      await sleep(400);
      console.log('click', x, y, JSON.stringify(response).slice(0, 200), 'caret', oracle.caret(field), 'text after Q', JSON.stringify(oracle.text(field)));
      await eng.request('press_key', { window: { id: a.id }, key: 'ctrl+End' });
      await sleep(300);
    }
    const { response } = await eng.request('click', { window: { id: a.id }, element_id: node.id });
    await sleep(400);
    console.log('element click', JSON.stringify(response).slice(0, 200), 'caret', oracle.caret(field));
  } finally {
    await eng.close();
  }
} finally {
  await desktop.closeAll();
  if (wm) try { process.kill(-wm.pid, 'SIGTERM'); } catch {}
  console.log('watchdog', (await server.stop()).clean);
  rmSync(out, { recursive: true, force: true });
}
