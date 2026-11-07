// #313 offline: A (main) against B (the fix) per artifact (group and repetition), one line per cell and head.
//   node scripts/probe-313/offline/read.mjs <run dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const load = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const ec = e => (e ? [e.reason, e.action, e.focus && `focus:${e.focus}`, e.focusStep && `step:${e.focusStep}`, e.caret && `caret:${e.caret}`, e.caretWriteError != null && `caretWriteError:${e.caretWriteError}`].filter(Boolean).join('/') : '-');
// A raise: the front app changed, or the target's window went above TextEdit's (another process's window, such as the
// engine's own, appearing between them is not one).
// Only a move counts: the target below TextEdit before and above it after.
const above = o => o && o.pidIndex != null && o.textEditIndex != null && o.pidIndex < o.textEditIndex;
const raised = (front0, front1, o0, o1) => (front0 && front1 && front0 !== front1) || (above(o1) && !above(o0));
const RAISE = (c, o0, o1) => (raised(c.frontBefore, c.frontAfter, o0, o1) ? ` RAISED${c.desktop === 'shared' || /shared/.test(c.label) ? '(shared: FAIL)' : '(dedicated)'}` : '');
const ans = a => (a ? `${a.answer}` : 'no click');
const ord = o => (o ? `${o.frontmost?.replace('com.apple.', '') ?? '?'} p${o.pidIndex ?? '-'}/te${o.textEditIndex ?? '-'}` : '-');
const prob = c => (c.problem || c.exception ? ` PROBLEM ${JSON.stringify(c.problem ?? c.exception).slice(0, 160)}` : '');

function web(r) {
  for (const c of r.cells) {
    const d = c.delta ?? {}, b = c.axBefore ?? {}, a = c.axAfter ?? {};
    const typed = c.typed ? ` typed=${c.typed.answer?.answer}:${c.typed.landedInTarget ? 'in' : c.typed.landedElsewhere ? 'ELSEWHERE' : 'nowhere'}${raised(c.frontAfter, c.typed.frontAfter, c.axAfter?.order, c.typed.order) ? '(RAISED by type)' : ''}${c.typed.markAt !== undefined ? ` markAt=${c.typed.markAt} sel=${JSON.stringify(c.typed.selectionAfterClick)} expected=${c.typed.expected?.offset ?? '-'}` : ''}` : '';
    console.log(`    ${c.label.padEnd(20)} ${ans(c.answer).padEnd(18)} ${ec(c.answer?.elementClick).padEnd(34)} tf=${d.textFocus ?? '-'} ff=${d.fieldFocus ?? '-'} pd=${d.pointerdown ?? '-'} clk=${d.click ?? '-'} opt=${d.optionChange ?? '-'} app=${d.applyClick ?? '-'} active=${c.after?.active ?? '-'} axF=${b.focusedValue ?? '-'}->${a.focusedValue ?? '-'} settable=${b.focusedSettable ?? '-'} cls=${b.listsDomClassList ?? '-'} acts=${(c.targetNode?.actions ?? []).join(',')} front=${c.frontAfter?.replace('com.apple.', '') ?? '-'} order=${ord(a.order)}${typed} later=${c.focusedAfter?.role ?? JSON.stringify(c.focusedAfter)}${RAISE(c, b.order, a.order)}${prob(c)}`);
  }
}
function k282(r) {
  for (const c of r.cells) {
    const k = c.click, m = k?.error ? k.error.meta : k?.result?.meta, d = c.delta ?? {};
    const a = !k ? 'no click' : k.error ? (k.error.errorName ?? k.error.code) : 'success';
    console.log(`    ${c.label.padEnd(26)} ${String(a).padEnd(18)} ${ec(m?.elementClick).padEnd(34)} tf=${d.textFocus ?? '-'} pd=${d.pointerdown ?? '-'} active=${c.after?.active ?? '-'} front=${c.frontAfter ?? '-'} later=${c.focusedAfter?.role ?? '-'}${RAISE(c, null, null)}${prob(c)}`);
  }
}
function k283(r) {
  for (const c of r.cells) {
    const k = c.click, m = k?.error ? k.error.meta : k?.result?.meta;
    const a = !k ? 'no click' : k.error ? (k.error.errorName ?? k.error.code) : 'success';
    console.log(`    ${c.label.padEnd(26)} ${String(a).padEnd(18)} ${ec(m?.elementClick).padEnd(34)} verdict=${JSON.stringify(c.verdict).slice(0, 160)}${raised(c.frontBefore, c.frontAfterClick, c.orderBefore, c.orderAfterClick) ? ' RAISED' : ''}${prob(c)}`);
  }
}
function native(r) {
  for (const c of r.cells) {
    const n = c.targetNode ?? {}, ev = (c.appEvents ?? []).map(e => `${e.ev}:${e.id}`).join(',');
    const typed = c.typed ? ` typed=${c.typed.answer?.answer}:${(c.typed.appEvents ?? []).map(e => `${e.id}=${JSON.stringify(e.value)}`).join(',') || JSON.stringify(c.typed.focus?.focused?.role ?? null)}` : '';
    console.log(`    ${c.label.padEnd(24)} ${ans(c.answer).padEnd(18)} ${ec(c.answer?.elementClick).padEnd(34)} role=${n.role}/${n.subrole ?? '-'} acts=${(n.actions ?? []).join(',')} axF=${c.axBefore?.focusedValue ?? '-'}->${c.axAfter?.focusedValue ?? '-'} settable=${c.axBefore?.focusedSettable ?? '-'} appFocused=${c.focusAfter?.focused?.role ?? '-'}/${c.focusAfter?.focused?.subrole ?? '-'} events=${ev || '-'} front=${c.frontAfter?.replace('com.apple.', '') ?? '-'}${typed}${RAISE(c, c.axBefore?.order, c.axAfter?.order)}${prob(c)}`);
  }
}

function raw(r) {
  for (const c of r.cells) {
    const a = c.act ?? {}, w = (a.writes ?? []).map(x => `${x.op}:${x.error}`).join(',') || 'none';
    const fronts = [...new Set((a.poll ?? []).map(p => p.frontOwner))].join('>');
    const lastPoll = (a.poll ?? []).at(-1) ?? {};
    console.log(`    ${c.label.padEnd(18)} writes=${w.padEnd(12)} focusedEnd=${lastPoll.focused ?? '-'} appFocus=${lastPoll.appFocusRole ?? '-'} settable=${JSON.stringify(a.target?.settable ?? null)} front=${c.frontBefore?.replace('com.apple.', '')}->${c.frontAfter?.replace('com.apple.', '')} pollFronts=${fronts || '-'} pidIndex=${a.orderBefore?.pidIndex}->${a.orderAfter?.pidIndex} page=${JSON.stringify(c.after?.counts)} active=${c.after?.active} typed=${c.typed ? `${c.typed.answer}:notes=${JSON.stringify(c.typed.notes)},field=${JSON.stringify(c.typed.field)},front=${c.typed.frontAfter?.replace('com.apple.', '')}` : '-'}${prob(c)}`);
  }
}

for (const art of readdirSync(dir).filter(n => n.startsWith('probe-313-')).sort()) {
  for (const b of existsSync(join(dir, art, 'raw')) ? readdirSync(join(dir, art, 'raw')).sort() : []) {
    const r = load(join(dir, art, 'raw', b, 'results.json'));
    if (r) { console.log(`### ${art} raw ${b} ${r.config.browserVersion}`); raw(r); }
  }
  for (const h of ['a', 'b']) {
    const base = join(dir, art, h);
    if (!existsSync(base)) continue;
    const n = load(join(base, 'native', 'results.json'));
    if (n) { console.log(`### ${art} ${h} native ${n.config.headCommit?.slice(0, 8)}`); native(n); }
    for (const b of readdirSync(base).filter(x => x !== 'native').sort()) {
      const w = load(join(base, b, 'web', 'results.json'));
      if (w) { console.log(`### ${art} ${h} ${b} web ${w.config.headCommit?.slice(0, 8)} ${w.config.browserVersion}`); web(w); }
      const p = load(join(base, b, '282', 'results.json'));
      if (p) { console.log(`### ${art} ${h} ${b} 282`); k282(p); }
      const q = load(join(base, b, '283', 'results.json'));
      if (q) { console.log(`### ${art} ${h} ${b} 283`); k283(q); }
    }
  }
}
