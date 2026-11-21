// #456's reader: per cell, prehold and head, each row classed by when the popup opened against the click's checks, then
// what the engine answered and where the click went; every distinct refusal sentence; the rows to look at.
//   node scripts/probe-456/summary.mjs <results.json>...
//
// The times are wall-clock ms on the runner: the engine's receivedAt (the request in; the first check runs right after
// it), the wait's end (the meta's startedAt, the press or the focus write, else the answer's arrival when nothing was
// posted), and the racer's first sight of a window of Chrome's other than the observed one, alpha above 0, holding the
// click's point. Classes: early (refused appWindowOverPoint at the first check, `rechecked` absent), in (popup seen after
// receivedAt and by the wait's end), late (no popup by the wait's end), pre (seen before receivedAt but not refused at the
// first check), nopopup (none seen at all, in the watch's 1.3 s).
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
const r0 = v => (v == null ? '-' : Math.round(v));

export function classify(r) {
  const c = r.click, rc = r.race;
  if (!c || !rc) return null;
  const sp = c.stalePoint ?? {};
  const received = c.receivedAt, end = c.startedAt ?? c.answeredAt;
  const tv = rc.firstVisible?.t ?? null;
  if (c.error === 'userIntervened') return {cls: 'intervened', received, end, tv};
  // Refused by the guard at the first check: #452's rule, or #316's rule W once the popup's window is listed (at alpha 0
  // before it shows) above the screenshot's.
  if ((c.error === 'appWindowOverPoint' || (c.error === 'screenChangedSinceScreenshot' && sp.reason === 'newWindow')) && !sp.rechecked) return {cls: 'early', received, end, tv};
  if (tv == null) return {cls: r.cell === 'nokeys' || r.cell === 'plain' ? 'nokeys' : 'nopopup', received, end, tv};
  if (tv <= received) return {cls: 'pre', received, end, tv};
  if (tv <= end) return {cls: 'in', received, end, tv, margin: end - tv};
  return {cls: 'late', received, end, tv};
}
export function outcome(r) {
  const c = r.click;
  if (!c) return r.cell === 'keysonly' ? 'keysonly' : 'noclick';
  const sp = c.stalePoint ?? {};
  const pressed = r.cell === 'field' ? (r.jitter ? c.posted : r.landed?.uf) : r.cell === 'plain' ? r.landed?.b2 : r.landed?.ub;
  const what = r.cell === 'field' ? (r.jitter ? 'focus written' : `focused${c.posted ? '' : ''}`) : 'pressed';
  const wrote = r.cell === 'field' && !r.jitter ? (c.posted ? ' (focus written)' : ' (nothing written)') : '';
  if (c.error) return `refused ${c.error}${sp.rechecked ? ' rechecked' : ''}${sp.afterActivation ? ' afterActivation' : ''}${sp.by ? ` by ${sp.by}` : ''}${sp.overWindow != null ? ` over ${sp.overWindow === r.race?.firstVisible?.n ? 'the popup' : sp.overWindow}` : ''}${pressed ? `, ${what} anyway` : `, not ${what}`}`;
  return `ok ${sp.verdict ?? '-'}/${sp.reason ?? '-'}${sp.rechecked ? ' rechecked' : ''}, ${pressed ? what : `not ${what}`}${wrote}`;
}

for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## heads ${config.heads.join(', ')} ${config.engineRefs}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| cell | prehold | head | rows | class | answer and landing |');
  console.log('|---|---|---|---|---|---|');
  const groups = new Map();
  for (const r of results) { const k = `${r.cell}${r.via && r.via !== 'racer' ? `/${r.via}` : ''}${r.jitter ? '/jitter' : ''}|${r.prehold ? 'held' : 'free'}|${r.head}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, rs] of groups) {
    const [cell, prehold, head] = k.split('|');
    const cls = tally(rs.map(r => r.problem ? `problem:${r.problem}` : r.exception ? 'exception' : classify(r)?.cls ?? (r.race?.firstVisible ? 'popup' : 'nopopup')));
    const by = tally(rs.filter(r => !r.problem && !r.exception).map(r => `${classify(r)?.cls ?? '-'}: ${outcome(r)}`));
    console.log(`| ${cell} | ${prehold} | ${head} | ${rs.length} | ${cls} | ${by} |`);
  }
  console.log('\nper row (times in ms from receivedAt; keysonly from the planned base):');
  for (const r of results) {
    if (r.problem || r.exception) { console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 160)}`); continue; }
    const c = r.click, rc = r.race ?? {}, k = classify(r);
    const t0 = c?.receivedAt ?? r.base;
    const rel = t => (t == null ? '-' : r0(t - t0));
    const ev = (r.after?.events ?? []).filter(e => ['wfocus', 'wblur', 'click', 'focusin', 'jitter', 'jitterEnd'].includes(e.type)).map(e => `${e.type}:${e.id ?? ''}@${rel(e.t)}`).join(' ');
    console.log(`  ${r.label}: ${k?.cls ?? '-'} sent=${c ? rel(c.sentAt) : '-'} keys=${rc.keys ? rel(rc.keys[0]) : '-'} listed=${rc.firstListed ? `${rc.firstListed.n}@${rel(rc.firstListed.t)}` : '-'} visible=${rc.firstVisible ? `${rc.firstVisible.n}@${rel(rc.firstVisible.t)}` : '-'} ax=${rc.axAtSeen ? `${rc.axAtSeen.role}/inTarget=${rc.axAtSeen.inTarget}@${rel(rc.axAtSeen.t0)}+${rc.axAtSeen.ms}` : '-'} end=${c ? rel(c.startedAt ?? c.answeredAt) : '-'} answered=${c ? rel(c.answeredAt) : '-'} guard=${c?.activationGuardMs ?? '-'} pend=${c?.pendingClick ? JSON.stringify(c.pendingClick) : '-'} sp=${c?.stalePoint ? `${c.stalePoint.verdict}/${c.stalePoint.reason}/ms=${c.stalePoint.ms}/hitMs=${c.stalePoint.hitMs ?? '-'}` : '-'} route=${c?.route ?? '-'} => ${outcome(r)} | ${ev} | after popup=${r.after?.popup ? r.after.popup.n : '-'} focused=${r.after?.focused?.role ?? '-'}:${r.after?.focused?.description ?? ''}${r.press ? ` | press=${r.press.error ?? 'ok'}/${r.press.route}` : ''}${r.prehold ? ` | prehold=${r.prehold.error ?? 'ok'}/${r.prehold.route}` : ''}${r.engineKeys ? ` | engineKeys key=${r.engineKeys.key.error ?? 'ok'}@${rel(r.engineKeys.at)}..${rel(r.engineKeys.keyAnswered)} type=${r.engineKeys.type.error ?? 'ok'}@..${rel(r.engineKeys.typeAnswered)}` : ''}`);
  }
  console.log('\nrefusal sentences:');
  const sentences = results.filter(r => r.click?.message).reduce((m, r) => { const s = `${r.click.error}: ${r.click.message}`; (m[s] ??= []).push(`${r.head}:${r.cell}`); return m; }, {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nto look at: the fix kept an in-window row, or any head refused a nokeys/plain row, or pressed under a popup:');
  for (const r of results) {
    const k = classify(r);
    if (!k) continue;
    const bad = (k.cls === 'in' && !r.click.error) || ((r.cell === 'nokeys' || r.cell === 'plain') && r.click.error);
    if (bad) console.log(`  ${r.label}: ${k.cls} margin=${r0(k.margin)} ${outcome(r)}`);
  }
  console.log('\n');
}
