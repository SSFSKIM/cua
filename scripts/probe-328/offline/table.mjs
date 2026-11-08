// #328's route × app table: every results-*.json under the given directories, trials collapsed into route classes,
// one cell per class and target: delivered n/N (Accessibility's read-back, or the bar the asked way), the median move
// against the 120 points asked (pixel units; line units and page actions as moved), raises and key-window changes
// (the cover's focused window or the front app; a target window's title that only filled in is not counted), and the
// median cost (the call) + first move, in ms.
//   node scripts/probe-328/offline/table.mjs <dir>... [--csv]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const dirs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(f)) files.push(p); } };
dirs.forEach(walk);
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results.filter(r => r.name && r.block !== 'engine' && !r.label));
const med = xs => { const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const f0 = v => (v == null ? '-' : Math.round(v));

const CLASSES = [
  ['pid, main\'s event', n => /^post\/pid\/(over|away)\/none\/pixel\/vendor$/.test(n)],
  ['pid, no window fields', n => /^post\/pid\/(over|away)\/none\/pixel\/none$/.test(n)],
  ['pid, 91+92 only', n => /^split\/f9192\//.test(n)],
  ['pid, 51 only', n => /^split\/f51\//.test(n)],
  ['pid, line units', n => /^post\/pid\/(over|away)\/none\/line\/vendor$/.test(n)],
  ['pid, gesture phases', n => /^post\/pid\/(over|away)\/gesture\/pixel\/vendor$/.test(n)],
  ['session tap, pointer away', n => /^post\/session\/away\/none\/pixel\/vendor$/.test(n)],
  ['HID tap, pointer over', n => /^post\/hid\/over\/none\/pixel\/vendor$/.test(n)],
  ['HID tap, pointer away', n => /^post\/hid\/away\/none\/pixel\/vendor$/.test(n)],
  ['#324\'s point (below the window), pid', n => /^outside\/pid\//.test(n)],
  ['AX bar AXValue write', n => n === 'ax/barWrite'],
  ['AX bar page-button press', n => n === 'ax/pagePress'],
  ['AX bar AXIncrement', n => n === 'ax/barIncrement'],
  ['AX AXScrollDownByPage', n => n === 'ax/scrollByPage'],
  ['AX AXScrollToVisible (below the fold)', n => n === 'ax/scrollToVisible'],
  ['AX AXVisibleCharacterRange write', n => n === 'ax/visibleRange'],
  ['AX AXMakeScreenRectVisible write', n => n === 'ax/makeRectVisible'],
];
const fam = t => t.replace(/#.*$/, '').replace(/_NS:\d+/, 'list');
const judge = r => {
  const sign = r.down === false ? -1 : 1;
  const px = r.movedPx == null ? null : r.movedPx * sign;
  const bar = r.barDelta != null && r.barDelta * sign > 0.0005;
  const kb = r.keysBefore ?? {}, ka = r.keysAfter ?? {};
  // A key change: the cover lost its focused window or the front, another app came front, or the target's focused
  // window became another window (not the same window's title filling in from empty).
  const titleFill = (x, y) => x === y || x === '' || x == null;
  const key = kb.coverFocused !== ka.coverFocused || ka.coverFrontmost === false || (r.frontOther?.length ?? 0) > 0
    || !titleFill(kb.targetFocused, ka.targetFocused) || !titleFill(kb.targetMain, ka.targetMain);
  return {ok: (px != null && px > 2) || bar, px, raised: !!r.raised, key, cost: r.costMs, first: r.firstMoveMs};
};
const targets = [...new Set(rows.map(r => fam(r.target)))].sort();
const out = [];
for (const [label, test] of CLASSES) {
  for (const t of targets) {
    const rs = rows.filter(r => fam(r.target) === t && test(r.name));
    if (!rs.length) continue;
    const j = rs.map(judge);
    const ok = j.filter(x => x.ok);
    out.push({route: label, target: t, n: `${ok.length}/${rs.length}`, moved: f0(med(ok.map(x => x.px))), raised: j.filter(x => x.raised).length, key: j.filter(x => x.key).length,
      ms: `${f0(med(rs.map(x => x.costMs)))}+${f0(med(ok.map(x => x.first)))}`});
  }
}
if (process.argv.includes('--csv')) { for (const o of out) console.log(Object.values(o).join(',')); process.exit(0); }
// One block per route class: target, n/N, moved, raised, key changes, ms.
for (const [label] of CLASSES) {
  const os = out.filter(o => o.route === label);
  if (!os.length) continue;
  console.log(`\n**${label}**: ` + os.map(o => `${o.target} ${o.n}${o.n.startsWith('0/') ? '' : ` (${o.moved} pt, ${o.ms} ms)`}${o.raised ? ` raised ${o.raised}` : ''}${o.key ? ` key ${o.key}` : ''}`).join('; '));
}
