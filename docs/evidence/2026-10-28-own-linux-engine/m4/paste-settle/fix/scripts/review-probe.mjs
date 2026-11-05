// The review's click-then-paste probe (task 60's review, its exact-probe.mjs), as a regression over engines: Chrome on
// a page of two textareas, the focus in A, B's mousedown handler spending 50 ms; a click into B, then a `type_text`
// with no element, pipelined, on a fresh engine per run. The paste must land in B, confirmed. On a private display the
// script starts itself (the harness's `startPrivateServer`), Openbox, the harness's own Chrome; nothing reaches `:0`.
// usage: node review-probe.mjs [--front] <harness root> <out dir> <runs> <label>=<engine> [<label>=<engine>...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const argv = process.argv.slice(2);
const front = argv[0] === '--front';
const [root, out, runsArg, ...engines] = front ? argv.slice(1) : argv;
const runs = Number(runsArg);
const lib = (m) => import(join(root, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN } = await lib('xspawn.mjs');
const { Desktop, PAGES } = await lib('scenes.mjs');
const { Engine } = await lib('engine.mjs');
const { Oracle } = await lib('oracle.mjs');
const { preorder } = await lib('normalize.mjs');
mkdirSync(out, { recursive: true });
const fixture = join(out, 'click-paste.html');
writeFileSync(
  fixture,
  `<title>review</title><style>textarea{display:block;width:600px;height:150px;margin:20px;font:16px monospace}</style><textarea id=a aria-label="A">AAA</textarea><textarea id=b aria-label="B">BBB</textarea><script>document.title=decodeURIComponent(location.hash.slice(1));a.focus();b.addEventListener('mousedown',()=>{const t=performance.now()+50;while(performance.now()<t){}});</script>`,
);
delete process.env[LIVE_RUN];
process.env.DISPLAY = ':cua171-review-probe';
const server = await startPrivateServer({ out });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: engines[0].split('=')[1], run: 'review', logs: out });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
let wm;
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1000);
  const scene = await desktop.openChrome('click', relative(PAGES, fixture));
  const oracle = new Oracle();
  const state = await desktop.state(scene);
  const nodes = preorder(state.ax_tree);
  const a = nodes.find((n) => n.name === 'A' && n.role === 'entry');
  const b = nodes.find((n) => n.name === 'B' && n.role === 'entry');
  const e = oracle.extents(b.id);
  const w = state.window;
  const coords = { x: e.x - w.x + 20, y: e.y - w.y + 30 };
  await desktop.openFront('covered');
  await sleep(200);
  for (const spec of engines) {
    const [label, bin] = spec.split('=');
    for (let i = 0; i < runs; i++) {
      oracle.grabFocus(a.id);
      // GrabFocus gives Chrome the X input focus too: with `--front`, the front window takes it back, so the run's
      // window is in the background as the engine's background route assumes (the review's probe left it focused)
      if (front) desktop.focusFront();
      await sleep(200);
      const before = { a: oracle.text(a.id), b: oracle.text(b.id) };
      const eng = new Engine({ label, bin, stats: true }).start();
      try {
        const got = await eng.pipeline([
          { command: 'click', input: { window: { id: scene.id }, ...coords } },
          { command: 'type_text', input: { window: { id: scene.id }, text: 'Q' } },
        ]);
        await sleep(200);
        const after = { a: oracle.text(a.id), b: oracle.text(b.id) };
        const paste = [...eng.statsById.values()].find((s) => s?.paste)?.paste;
        const answer = got.responses[1];
        const landedIn = after.b.length > before.b.length ? 'B' : after.a.length > before.a.length ? 'A' : 'none';
        const row = { label, run: i, ok: answer.ok === true && landedIn === 'B', answer: answer.ok ? 'confirmed' : answer.error, landed_in: landedIn, observed: paste?.observed ?? null, settle: paste?.settle ?? null, ms: got.ms };
        rows.push(row);
        console.log(JSON.stringify(row));
        // an unconfirmed paste raises the engine's retry guard: the next run waits it out
        if (!answer.ok && /could not be confirmed/.test(answer.error)) await sleep(11000);
      } finally {
        await eng.close();
      }
    }
  }
} finally {
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  const watched = await server.stop();
  const summary = engines.map((spec) => {
    const label = spec.split('=')[0];
    const mine = rows.filter((r) => r.label === label);
    return { label, runs: mine.length, passed: mine.filter((r) => r.ok).length, landed_in_b: mine.filter((r) => r.landed_in === 'B').length };
  });
  console.log(JSON.stringify({ kind: 'summary', summary, watchdog_clean: watched.clean }));
  writeFileSync(join(out, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ summary, watchdog_clean: watched.clean }, null, 2) + '\n');
}
