// cost.mjs <out.jsonl> <trials> <label=flags>...: what each candidate adds to short drags, drag-and-drop or not. On one
// harness Chrome window on the drag page (in front, active) and one gedit window, per lane a fresh engine and TRIALS
// rounds of: Chrome 40 px text select, Chrome 40 px range drag, Chrome 40 px drag and drop (the near source), Chrome's
// long drag and drop (250 px), gedit 40 px text select. Each drag's answer time and effect, one JSON line each.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff';
const { Desktop } = await import(`${H}/scenes.mjs`);
const { Engine } = await import(`${H}/engine.mjs`);
const { Oracle } = await import(`${H}/oracle.mjs`);
const { openFamily, FAMILIES } = await import(`${H}/families.mjs`);
const { PAGE, locate, readEffect, runPath } = await import(`${H}/drag.mjs`);

const [out, trialsArg, ...specs] = process.argv.slice(2);
const trials = Number(trialsArg);
const bin = process.env.CUA_BIN;
const lanes = specs.map((s) => {
  const eq = s.indexOf('=');
  return { label: s.slice(0, eq), bin, args: s.slice(eq + 1).split(/\s+/).filter(Boolean) };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flips = {};
const flip = (k) => ((flips[k] = (flips[k] ?? 0) + 1) % 2 === 0);
const emit = (row) => appendFileSync(out, `${JSON.stringify(row)}\n`);

const desktop = new Desktop({ cua: bin, run: 'task20-cost' });
const oracle = new Oracle();
try {
  await desktop.openFront('visible');
  const chrome = await openFamily(desktop, oracle, 'chrome', 'cost', { page: PAGE, geometry: FAMILIES.chrome.geometry });
  chrome.kindOf = 'page';
  const ctx = { desktop, oracle };
  const at = await locate(ctx, chrome, ['dnd']);
  const page = (pts) => pts.map(([x, y]) => ({ x: x + at.page.x, y: y + at.page.y }));
  const gedit = await desktop.openGedit('cost', 'alpha bravo charlie delta echo foxtrot golf hotel india\n'.repeat(20));
  const kinds = [
    // a global count alternates each kind's path, so no press lands in the last selection (that would drag the text) and
    // every range drag moves the slider
    { kind: 'chrome-select-40', scene: chrome, path: () => page(flip('select') ? [[314, 32], [354, 32]] : [[50, 32], [90, 32]]), effect: async () => (await readEffect(ctx, chrome, at, 'select')) },
    { kind: 'chrome-range-40', scene: chrome, path: () => page(flip('range') ? [[68, 82], [28, 82]] : [[28, 82], [68, 82]]), effect: async () => (await readEffect(ctx, chrome, at, 'range')) },
    { kind: 'chrome-dnd-40', scene: chrome, path: () => runPath(at, 'dnd-short', 0), effect: async () => (await readEffect(ctx, chrome, at, 'dnd')).drops },
    { kind: 'chrome-dnd-250', scene: chrome, path: () => runPath(at, 'dnd', 0), effect: async () => (await readEffect(ctx, chrome, at, 'dnd')).drops },
    { kind: 'gedit-select-40', scene: gedit, path: () => [{ x: 60, y: 90 }, { x: 100, y: 90 }], effect: async () => null },
  ];
  for (let i = 0; i < trials; i++) {
    for (const lane of lanes) {
      const engine = new Engine({ ...lane, stats: true }).start();
      try {
        for (const k of kinds) {
          desktop.raise(k.scene);
          execFileSync('xdotool', ['windowactivate', '--sync', String(k.scene.id)]);
          // PARK=x,y: the real pointer parked there first (outside the window, to see which drags still take)
          if (process.env.PARK) execFileSync('xdotool', ['mousemove', '--sync', ...process.env.PARK.split(',')]);
          await sleep(600);
          const before = await k.effect();
          const { response, ms, stats } = await engine.request('drag', { window: { id: k.scene.id }, path: k.path(i) });
          await sleep(700);
          const after = await k.effect();
          emit({ lane: lane.label, i, kind: k.kind, ok: response.ok, error: response.ok ? undefined : String(response.error).slice(0, 200), ms: Math.round(ms * 10) / 10, before, after, take_wait: stats?.take_wait, after_take: stats?.after_take });
          // the range back to 0 for the next even run, the text selection cleared by the next press anyway
        }
      } finally {
        await engine.close();
      }
      desktop.focusFront();
    }
  }
} finally {
  await desktop.closeAll();
}
