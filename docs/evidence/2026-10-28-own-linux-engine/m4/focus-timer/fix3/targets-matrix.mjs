// Task 56 fix 3's matrix pass: which X clients ask CLIPBOARD for TARGETS when its owner changes. On a private Xvfb
// the harness starts (the live-run declaration withdrawn first, so the spawner refuses `:0`), with Openbox and the
// front window covering them, one window each of Chrome, Electron, gedit (GTK 3), gnome-text-editor (GTK 4), kate
// (Qt 5), qtcreator (Qt 6), Firefox (Gecko), Writer (its gtk3 plugin, and an observer on its gen plugin) and
// gnome-terminal (VTE), all open at once. Then, for each family
// that takes a background paste, `runs` pastes into its window, one fresh engine each with `--targets-wait-ms <wait>`
// (every family waits, measurement only) and `--stats`: the owner's log of each paste names every request it saw, its
// requestor window (whose X client is a family's by its resource range), its target, outcome and ms from the chord's
// dispatch. A client's TARGETS request before the dispatch, or any from a client that got no chord, is one its owner
// change caused. Rows to <out>/matrix.jsonl.
// usage: node targets-matrix.mjs <harness dir> <cua-engine> <out dir> [runs=5] [wait ms=1000 | none] [--load]
//        [--targets <family,...>]  (the families pasted into; every window still opens)
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

const [harness, cua, out, runsArg, waitArg, ...rest] = process.argv.slice(2);
const runs = Number(runsArg ?? 5);
const wait = String(waitArg ?? 1000);
// `none`: the engine as it ships, each family's own wait
const waitArgs = wait === 'none' ? [] : ['--targets-wait-ms', wait];
const load = rest.includes('--load');
const only = rest.includes('--targets') ? rest[rest.indexOf('--targets') + 1].split(',') : null;
const lib = (m) => import(join(harness, 'scripts/linux-engine-diff', m));
const { Engine } = await lib('engine.mjs');
const { openFamily } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Desktop } = await lib('scenes.mjs');
const { preorder } = await lib('normalize.mjs');
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, xExecFileSync } = await lib('xspawn.mjs');
const { CHROMIUM, KEYS_PAGE, GUARD_WAIT_MS, UNCONFIRMED } = await lib('focus-timer.mjs');

mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = createWriteStream(join(out, 'matrix.jsonl'));
const emit = (o) => {
  rows.write(`${JSON.stringify(o)}\n`);
  console.log(JSON.stringify(o).slice(0, 300));
};

delete process.env[LIVE_RUN];
const use = (d) => {
  assertReachable('the targets matrix', [], { DISPLAY: d });
  process.env.DISPLAY = d;
};
use(':cua171-targets-matrix');
const server = await startPrivateServer({ out });
use(server.display);

const TARGETS_TAKERS = ['chrome', 'electron', 'gedit', 'kate', 'qtcreator', 'firefox', 'writer', 'gnome-terminal'];
const OBSERVERS = ['gnome-text-editor', 'writer-gen'];
const desktop = new Desktop({ cua, run: 'targets-matrix', logs: out });
let wm;
let stress;
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const scenes = {};
  for (const family of [...TARGETS_TAKERS, ...OBSERVERS]) {
    try {
      scenes[family] = await openFamily(desktop, oracle, family, 'matrix', CHROMIUM.includes(family) ? { page: KEYS_PAGE } : {});
    } catch (error) {
      emit({ kind: 'skipped', family, why: String(error.message).slice(0, 300) });
    }
  }
  desktop.arrangeFront('covered');
  await sleep(1000);
  emit({ kind: 'meta', version: xExecFileSync(cua, ['--version'], { encoding: 'utf8' }).trim(), wait_ms: wait === 'none' ? null : Number(wait), runs, load, windows: Object.fromEntries(Object.entries(scenes).map(([f, s]) => [f, s.id])) });
  if (load) {
    const workers = availableParallelism() * 2;
    stress = spawn('stress-ng', ['--cpu', String(workers), '--cpu-method', 'matrixprod', '--timeout', '1h', '--quiet'], { stdio: 'ignore', detached: true });
    await sleep(5000);
    emit({ kind: 'load', workers });
  }
  let n = 0;
  for (const family of TARGETS_TAKERS.filter((f) => !only || only.includes(f))) {
    const scene = scenes[family];
    if (!scene) continue;
    for (let trial = 0; trial < runs; trial++) {
      const engine = new Engine({ label: 'matrix', bin: cua, args: waitArgs, stats: true }).start();
      let result;
      try {
        result = await engine.request('type_text', { window: { id: scene.id }, text: `Matrix${n++}` });
      } finally {
        await engine.close();
      }
      const paste = result.stats?.paste ?? null;
      const mask = Number(result.stats?.paste_route?.resource_id_mask ?? 0x1fffff);
      const clientOf = (window) => {
        const hit = Object.entries(scenes).find(([, s]) => (s.id & ~mask) === (Number(window) & ~mask));
        return hit ? hit[0] : `unknown ${window}`;
      };
      const requests = (paste?.log ?? []).map((entry) => {
        const [whose, window, target, outcome, time, at] = entry.split(' ');
        return { client: clientOf(window), whose, window, target: Number(target), outcome, time, ms: Number(at.replace(/ms$/, '')) };
      });
      emit({ kind: 'paste', target: family, trial, engine_family: result.stats?.paste_route?.family ?? null, toolkit: result.stats?.toolkit ?? null, ok: result.response.ok, error: result.response.error ?? null, confirmed: paste?.confirmed ?? null, transfer: paste?.transfer ?? null, targets: paste?.targets ?? null, requests });
      if (result.response.error === UNCONFIRMED) await sleep(GUARD_WAIT_MS);
    }
  }
  await desktop.close(Object.values(scenes));
} finally {
  if (stress) {
    try {
      process.kill(-stress.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  const watched = await server.stop();
  emit({ kind: 'end', watchdog: watched });
  await new Promise((r) => rows.end(r));
}
