// track.mjs <out.jsonl> <trials> [label=engine flags]...: task 20b's ruling 4 measurement. Which background drags into
// Chrome (in front, active, shared mode) still land when the real pointer is parked outside Chrome's window, against
// parked inside as the control. On one harness Chrome window on track.html, per trial and lane a fresh engine, and per
// park condition (outside and inside, taking turns) one 40 px drag of each kind:
//   mouse   a mousedown/mousemove/mouseup drag on document listeners
//   pointer a pointerdown + setPointerCapture drag
//   range   the range input
//   select  a text selection (reference: dies outside, task 20)
//   dnd     the short HTML5 drag and drop (reference: dies outside, task 20)
// One JSON line per drag: the answer, its effect, and the buttonless moves the page saw during the press.
// Env: CUA_BIN the engine; OUTSIDE and INSIDE the park points (screen, default 1170,715 on the front window in its
// corner, and 300,560 inside Chrome away from every path); KINDS to narrow.
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
const bin = process.env.CUA_BIN;
const lanes = (specs.length ? specs : ['cua=']).map((s) => {
  const eq = s.indexOf('=');
  return { label: s.slice(0, eq), args: s.slice(eq + 1).split(/\s+/).filter(Boolean) };
});
const parks = { outside: (process.env.OUTSIDE ?? '1170,715').split(','), inside: (process.env.INSIDE ?? '300,560').split(',') };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (row) => appendFileSync(out, `${JSON.stringify(row)}\n`);

/** The page's counts from the window's name: `<label> | m md ml mz mx | p pd pl pz pc px | r v | d starts drops | s sel`. */
function counts(id) {
  const name = execFileSync('xdotool', ['getwindowname', String(id)], { encoding: 'utf8' }).trim().replace(/ - Google Chrome$/, '');
  const at = name.indexOf(' | ');
  if (at < 0) return { md: 0, ml: 0, mz: 0, mx: 0, pd: 0, pl: 0, pz: 0, pc: 0, px: 0, range: 0, starts: 0, drops: 0, sel: 'none' };
  const f = name.slice(at + 3).split(' | ').map((part) => part.split(' ').slice(1));
  const n = (v) => Number(v);
  return {
    md: n(f[0][0]), ml: n(f[0][1]), mz: n(f[0][2]), mx: n(f[0][3]),
    pd: n(f[1][0]), pl: n(f[1][1]), pz: n(f[1][2]), pc: n(f[1][3]), px: n(f[1][4]),
    range: n(f[2][0]), starts: n(f[3][0]), drops: n(f[3][1]), sel: f[4].join(' '),
  };
}

const flips = {};
const flip = (k) => ((flips[k] = (flips[k] ?? 0) + 1) % 2 === 0);
const KINDS = {
  mouse: { path: () => [[60, 170], [100, 170]], landed: (b, a) => a.md === b.md + 1 && a.ml === b.ml + 1 },
  pointer: { path: () => [[60, 270], [100, 270]], landed: (b, a) => a.pd === b.pd + 1 && a.pl === b.pl + 1 },
  // up from the left end, or back down to it, so every drag that lands changes the value
  range: { path: (b) => (b.range < 5 ? [[28, 82], [68, 82]] : [[68, 82], [28, 82]]), landed: (b, a) => a.range !== b.range },
  // never pressing inside the last selection, which would drag the text
  select: { path: () => (flip('select') ? [[314, 32], [354, 32]] : [[50, 32], [90, 32]]), landed: (b, a) => a.sel !== b.sel && a.sel !== 'none' },
  dnd: { path: () => [[530, 185], [570, 185]], landed: (b, a) => a.drops === b.drops + 1 },
};
const kinds = (process.env.KINDS ?? Object.keys(KINDS).join(',')).split(',');

const desktop = new Desktop({ cua: bin, run: 'task20b-track' });
const oracle = new Oracle();
try {
  await desktop.openFront('visible');
  const page = relative(`${H}/pages`, '/Users/new/.local/share/cua-171/task20b/pages/track.html');
  const chrome = await openFamily(desktop, oracle, 'chrome', 'track', { page, geometry: FAMILIES.chrome.geometry });
  chrome.kindOf = 'page';
  const at = await locate({ desktop, oracle }, chrome, []);
  const toWindow = (pts) => pts.map(([x, y]) => ({ x: x + at.page.x, y: y + at.page.y }));
  emit({ setup: true, window: chrome.window, page: at.page, parks, lanes });
  for (let i = 0; i < trials; i++) {
    for (const lane of lanes) {
      const engine = new Engine({ label: lane.label, bin, args: lane.args, stats: true }).start();
      try {
        for (const park of i % 2 === 0 ? ['outside', 'inside'] : ['inside', 'outside']) {
          for (const kind of kinds) {
            desktop.raise(chrome);
            execFileSync('xdotool', ['windowactivate', '--sync', String(chrome.id)]);
            execFileSync('xdotool', ['mousemove', ...parks[park]]);
            await sleep(600);
            const loc = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' });
            const pointer = ['X', 'Y'].map((k) => Number(loc.match(new RegExp(`^${k}=(\\d+)`, 'm'))?.[1]));
            const before = counts(chrome.id);
            const { response, ms, stats } = await engine.request('drag', { window: { id: chrome.id }, path: toWindow(KINDS[kind].path(before)) });
            await sleep(700);
            const after = counts(chrome.id);
            emit({
              lane: lane.label, i, park, pointer, kind, landed: KINDS[kind].landed(before, after), ok: response.ok,
              error: response.ok ? undefined : String(response.error).slice(0, 300), ms: Math.round(ms * 10) / 10,
              buttonless: kind === 'mouse' ? after.mz - before.mz : kind === 'pointer' ? after.pz - before.pz : undefined,
              cancels: kind === 'pointer' ? after.pc - before.pc : undefined,
              before, after, stats,
            });
          }
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
