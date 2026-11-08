// #316's reader: the run's results.json files (scripts/probe-316/measure.mjs) as the candidate's and the narrower
// detectors' table. Each clicked cell is one of: landed (the target got the click), wrong (the engine answered success and
// the click went elsewhere, nowhere, or navigated), refused (the engine refused; the guard's own refusal named), or
// unclear. The candidate (ruling cb252e88) refuses by the sequence alone; each detector by the signals read just before
// the click.
//   node scripts/probe-316/offline/table.mjs <results.json>... [--detail]
import {readFileSync} from 'node:fs';

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DETAIL = process.argv.includes('--detail');
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const TEXT = new Set(['AXTextField', 'AXComboBox', 'AXSearchField', 'AXTextArea']);

function outcome(r) {
  if (r.problem || r.exception || !r.result) return 'unclear';
  const l = r.result.landing;
  if (l === 'landed') return 'landed';
  if (l.startsWith('refused:')) return /screenChanged/.test(l) ? 'guard' : 'refused';
  if (l === 'unknown') return 'unclear';
  return 'wrong';
}
const setupOk = r => r.steps.every(s => !s.setup || s.setup === 'landed' || s.setup === 'n/a');

// The detectors, each a function of the cell's signals (read 0-100 ms before the click) answering whether it refuses.
const isPage = r => ['safari', 'cft', 'stable', 'firefox'].includes(r.app);
const DETECTORS = {
  candidate: r => r.candidate,
  // (b) the app's focused element is a text control outside every web area, while the point is in the web area.
  focusOutsideWeb: r => { const f = r.signals?.focused; return Boolean(isPage(r) && f && !f.inWebArea && !f.isWebArea && TEXT.has(f.role)); },
  // (a) a window of the app's own above the target window holding the point.
  sameAppWindowAtPoint: r => (r.signals?.aboveAtPoint ?? []).some(w => w.pid === r.signals?.targetWindow?.pid),
  // (a) any window of the app's own above the target window.
  sameAppWindowAbove: r => (r.signals?.sameAppAbove ?? []).length > 0,
  // (a) the focused element is Safari's address field / its AXExpanded reads true.
  focusedAddressField: r => /WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD/.test(r.signals?.focused?.identifier ?? '') || /Address and search bar|Search with .* or enter address/.test(r.signals?.focused?.description ?? r.signals?.focused?.title ?? ''),
  focusedExpanded: r => r.signals?.focused?.expanded === true,
  // (a) a popover-like element outside the web area (list, popover, menu, table...).
  overlayOutsideWeb: r => (r.signals?.overlays ?? []).length > 0,
  // The application's hit at the point is outside every web area though the target is page content.
  appHitOutsideWeb: r => isPage(r) && r.signals?.hit != null && r.signals.hit.inWebArea === false,
  appHitMissing: r => isPage(r) && r.signals?.hit == null,
  // The system-wide hit at the point belongs to another process, or lies outside the web area.
  systemHitOther: r => r.signals?.systemHit != null && r.signals.systemHit.pid !== r.signals?.hit?.pid,
  systemHitOutsideWeb: r => isPage(r) && r.signals?.systemHit != null && r.signals.systemHit.inWebArea === false,
  // Run 2 (the signals read at the screenshot too): a window of the app's own above the screenshot's window that the
  // window list did not hold at the screenshot (any layer; layer 0 only).
  newSameAppWindow: r => newAbove(r).length > 0,
  newSameAppWindowL0: r => newAbove(r).some(w => w.layer === 0),
  // The hit lies outside every web area, or in another web area than the screenshot's hit at the point (CFEqual).
  hitLeftWebArea: r => isPage(r) && r.signals?.hit != null && (r.signals.hit.inWebArea === false || r.signals.hit.sameWebAreaAsShot === false),
  // The proposal: the new window, or the hit outside the screenshot's web area.
  proposal: r => newAbove(r).some(w => w.layer === 0) || (isPage(r) && r.signals?.hit != null && (r.signals.hit.inWebArea === false || r.signals.hit.sameWebAreaAsShot === false)),
};
/// The app's windows above the target window at the click that the screenshot's (or re-observation's) list lacked.
function newAbove(r) {
  const shot = r.atReobs ?? r.atShot;
  if (!shot) return [];
  const had = new Set((shot.appWindowsCG ?? []).map(w => w.n));
  return (r.signals?.sameAppAbove ?? []).filter(w => !had.has(w.n));
}

const key = r => `${r.app} | ${r.variant} | ${r.seq}`;
const groups = new Map();
for (const r of rows) { if (!groups.has(key(r))) groups.set(key(r), []); groups.get(key(r)).push(r); }
const names = Object.keys(DETECTORS);
const tally = Object.fromEntries(names.map(n => [n, {falseRefusal: 0, trueCatch: 0, missed: 0, landed: 0, wrong: 0}]));

console.log('| app | variant | sequence | clicks | landed | wrong | guard refused | other refused | unclear | setup failed | candidate: false refusals | candidate: true catches |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, rs] of [...groups.entries()].sort()) {
  const o = rs.map(outcome);
  const c = n => o.filter(x => x === n).length;
  const cand = rs[0].candidate;
  const fr = rs.filter((r, i) => r.candidate && o[i] === 'landed').length;
  const tc = rs.filter((r, i) => r.candidate && o[i] === 'wrong').length;
  console.log(`| ${k.split(' | ').join(' | ')} | ${rs.filter(r => r.click).length} | ${c('landed')} | ${c('wrong')} | ${c('guard')} | ${c('refused')} | ${c('unclear')} | ${rs.filter(r => !setupOk(r)).length} | ${cand ? fr : '-'} | ${cand ? tc : '-'} |`);
}
for (const r of rows) {
  const o = outcome(r);
  if (o !== 'landed' && o !== 'wrong') continue;
  for (const n of names) {
    const fires = DETECTORS[n](r);
    const t = tally[n];
    if (o === 'landed') { t.landed++; if (fires) t.falseRefusal++; }
    else { t.wrong++; if (fires) t.trueCatch++; else t.missed++; }
  }
}
console.log('\n| detector | false refusals (of clicks that landed) | true catches (of wrong clicks the engine kept) | missed |');
console.log('|---|---|---|---|');
for (const n of names) { const t = tally[n]; console.log(`| ${n} | ${t.falseRefusal} / ${t.landed} | ${t.trueCatch} / ${t.wrong} | ${t.missed} |`); }
// The same per app: false refusals / landed, true catches / wrong.
const apps = [...new Set(rows.map(r => r.app))];
console.log(`\n| detector | ${apps.join(' | ')} |\n|---|${apps.map(() => '---').join('|')}|`);
for (const n of names) {
  const cells = apps.map(a => {
    const rs = rows.filter(r => r.app === a);
    const landed = rs.filter(r => outcome(r) === 'landed'), wrong = rs.filter(r => outcome(r) === 'wrong');
    return `${landed.filter(DETECTORS[n]).length}/${landed.length} false, ${wrong.filter(DETECTORS[n]).length}/${wrong.length} caught`;
  });
  console.log(`| ${n} | ${cells.join(' | ')} |`);
}

// Per detector, where it fires falsely and what it misses.
for (const n of names) {
  const fr = new Map(), miss = new Map();
  for (const r of rows) {
    const o = outcome(r);
    if (o === 'landed' && DETECTORS[n](r)) fr.set(key(r), (fr.get(key(r)) ?? 0) + 1);
    if (o === 'wrong' && !DETECTORS[n](r)) miss.set(key(r), (miss.get(key(r)) ?? 0) + 1);
  }
  console.log(`\n${n}: false refusals ${JSON.stringify(Object.fromEntries(fr))}\n${n}: missed ${JSON.stringify(Object.fromEntries(miss))}`);
}
if (DETAIL) for (const r of rows) {
  const o = outcome(r);
  if (o === 'landed') continue;
  const sp = r.click?.stalePoint;
  console.log(`${r.label}: ${o} ${r.result?.landing ?? r.problem ?? r.exception?.split('\n')[0]} ${sp ? `${sp.verdict}/${sp.reason} ${sp.recordedRole}->${sp.hitRole}` : ''} others=${JSON.stringify(r.result?.others ?? r.result?.selection ?? r.result?.caret?.line ?? '')} focus=${r.signals?.focused?.role}:${r.signals?.focused?.identifier ?? r.signals?.focused?.description ?? ''} above=${JSON.stringify((r.signals?.sameAppAbove ?? []).map(w => [w.layer, w.bounds]))} hit=${JSON.stringify(r.signals?.hit?.chain?.slice(0, 3)?.map(c => c[0]))}`);
}
