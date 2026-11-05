// jitter.mjs <out.jsonl> <trials> <label=engine path>...: task 23's probe of the atomic press's cap on real Chrome. On
// task 20's track.html, a text selection whose path first jitters within 2 px of the press for JITTER points, then goes
// 40 px right: the press crosses Blink's threshold only at the end. Per trial and engine, a fresh engine, the pointer
// parked inside Chrome away from the path, one drag. One JSON line per drag: the answer, the selection landed, and the
// engine's `--stats` `press` (the grab's duration, the samples under it, `crossed` on the fixed engine).
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';

const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff';
const { Desktop } = await import(`${H}/scenes.mjs`);
const { Engine } = await import(`${H}/engine.mjs`);
const { Oracle } = await import(`${H}/oracle.mjs`);
const { openFamily, FAMILIES } = await import(`${H}/families.mjs`);
const { locate } = await import(`${H}/drag.mjs`);

const [out, trialsArg, ...specs] = process.argv.slice(2);
const trials = Number(trialsArg);
const engines = specs.map((s) => ({ label: s.slice(0, s.indexOf('=')), bin: s.slice(s.indexOf('=') + 1) }));
const JITTER = Number(process.env.JITTER ?? 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (row) => appendFileSync(out, `${JSON.stringify(row)}\n`);

/** The page's selection from the window's name (track.html: `... | s <selection>`). */
function selection(id) {
  const name = execFileSync('xdotool', ['getwindowname', String(id)], { encoding: 'utf8' }).trim().replace(/ - Google Chrome$/, '');
  const parts = name.split(' | ');
  return parts.length > 1 ? parts.at(-1).split(' ').slice(1).join(' ') : 'none';
}

let flip = 0;
/** A selection path that jitters at its start, alternating between two lines so it never presses in the last one. */
function path(at) {
  const [x0, y0] = flip++ % 2 === 0 ? [314, 32] : [50, 32];
  const pts = [[x0, y0]];
  for (let i = 0; i < JITTER; i++) pts.push(i % 2 === 0 ? [x0 + 2, y0 + 1] : [x0 - 1, y0 - 2]);
  pts.push([x0 + 40, y0]);
  return pts.map(([x, y]) => ({ x: x + at.page.x, y: y + at.page.y }));
}

const desktop = new Desktop({ cua: engines[0].bin, run: 'task23-jitter' });
const oracle = new Oracle();
try {
  await desktop.openFront('visible');
  const page = relative(`${H}/pages`, '/Users/new/.local/share/cua-171/task20b/pages/track.html');
  const chrome = await openFamily(desktop, oracle, 'chrome', 'track', { page, geometry: FAMILIES.chrome.geometry });
  chrome.kindOf = 'page';
  const at = await locate({ desktop, oracle }, chrome, []);
  emit({ setup: true, window: chrome.window, page: at.page, jitter: JITTER, engines });
  for (let i = 0; i < trials; i++) {
    for (const e of engines) {
      const engine = new Engine({ label: e.label, bin: e.bin, args: [], stats: true }).start();
      try {
        desktop.raise(chrome);
        execFileSync('xdotool', ['windowactivate', '--sync', String(chrome.id)]);
        execFileSync('xdotool', ['mousemove', '300', '560']);
        await sleep(600);
        const before = selection(chrome.id);
        const { response, ms, stats } = await engine.request('drag', { window: { id: chrome.id }, path: path(at) });
        await sleep(700);
        const after = selection(chrome.id);
        emit({ engine: e.label, i, ok: response.ok, error: response.ok ? undefined : String(response.error).slice(0, 200), ms: Math.round(ms * 10) / 10,
          landed: after !== before && after !== 'none', press: stats?.press ?? null });
      } finally {
        await engine.close();
      }
      desktop.focusFront();
    }
  }
} finally {
  await desktop.closeAll();
}
