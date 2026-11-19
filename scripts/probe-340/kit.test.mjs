import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {CELLS,UNITS,AT,RECORDED_ROLE,unitKey,plan,pointFor} from './cells.mjs';
import {outcomeOf,stalePointOf,routeOf,findLink,landingOf,delta,score,gates,coverage,summarize} from './check.mjs';
import {page} from './page.mjs';
import {toPixels} from './run.mjs';

const engine = f => readFileSync(new URL(`../../native/engine/Sources/Engine/${f}`, import.meta.url), 'utf8');
test('the guard\'s record is where the harness reads it on this checkout', () => {
  assert.ok(engine('Input.swift').includes('if let stalePoint { wire["stalePoint"] = stalePoint.wire }'));
  assert.ok(engine('Input.swift').includes('error.extra["meta"] = meta.wire'));
  const sp = engine('StalePoint.swift');
  assert.ok(sp.includes('["verdict": verdict.rawValue, "reason": reason.rawValue'));
  assert.ok(sp.includes('if let recordedRole { wire["recordedRole"] = recordedRole }'));
  assert.ok(sp.includes('enum Verdict: String { case kept, refused }'));
});

test('plans: ten per unit to measure, twenty per head interleaved to qualify', () => {
  assert.equal(UNITS.length, Object.keys(CELLS).length * AT.length);
  assert.equal(plan({mode: 'measure', heads: ['main']}).length, 10 * UNITS.length);
  const q = plan({mode: 'qualify', heads: ['main', 'fix']});
  assert.equal(q.length, 2 * 20 * UNITS.length);
  assert.deepEqual([...new Set(q.filter((_, i) => i % 2 === 0).map(r => r.head))].sort(), ['fix', 'main']);
  for (const c of Object.values(CELLS)) assert.ok(['grow', 'shrink', 'refuse', 'asMain'].includes(c.kind));
  // Every cell's text before and after is distinct from the other links', so the observation finds it alone.
  for (const c of Object.values(CELLS)) for (const t of [c.before, c.after]) assert.ok(!['Archive', 'Drafts'].includes(t));
});

test('the page\'s script parses and carries every cell', () => {
  const html = page();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new Script(scripts[0][1], {filename: 'page'});
  for (const c of Object.values(CELLS)) assert.ok(html.includes(JSON.stringify(c.before)) && html.includes(JSON.stringify(c.after)));
});

const text = {role: 'AXStaticText', value: 'Inbox', frame: {x: 452, y: 150, width: 52, height: 28}};
const link = {role: 'AXLink', title: 'Inbox', frame: {x: 420, y: 136, width: 116, height: 56}};
test('the link and its text are found by their label, the link by its frame when it has none, nothing ambiguous', () => {
  assert.deepEqual(findLink([text, link], 'Inbox'), {text, link});
  const bare = {...link, title: ''};
  assert.deepEqual(findLink([text, bare, {role: 'AXLink', title: 'Archive', frame: {x: 420, y: 200, width: 130, height: 56}}], 'Inbox'), {text, link: bare});
  assert.equal(findLink([text, link, {...text}], 'Inbox'), null);
  assert.equal(findLink([text, link], 'Inbox (3)'), null);
  assert.equal(findLink([{...text, frame: {x: 0, y: 0, width: 0, height: 0}}, link], 'Inbox'), null);
});

test('points: near the text\'s start, or in the link\'s left padding, and back through the screenshot\'s pixels', () => {
  const pt = pointFor('text', text.frame), pl = pointFor('link', link.frame);
  assert.deepEqual(pt, {x: 464, y: 164});
  assert.deepEqual(pl, {x: 426, y: 164});
  assert.ok(pl.x < text.frame.x);
  const sky = {window: {frame: {x: 400, y: 30, width: 620, height: 700}}, screenshot: {width: 1240, height: 1400}};
  assert.deepEqual(toPixels(sky, pt), {px: {x: 128, y: 268}, screen: {x: 464, y: 164}});
  assert.equal(toPixels({window: sky.window, screenshot: null}, pt), null);
});

test('replies: outcome, the guard\'s record on a refusal and on a success, the route', () => {
  const refused = {error: {errorName: 'screenChangedSinceScreenshot', meta: {inputRoute: 'synthesized',
    stalePoint: {verdict: 'refused', reason: 'nodeGone', recordedRole: 'AXStaticText', hitRole: 'AXStaticText', ms: 1.2}}}};
  assert.equal(outcomeOf(refused), 'screenChangedSinceScreenshot');
  assert.deepEqual(stalePointOf(refused), {verdict: 'refused', reason: 'nodeGone', identity: null, recordedRole: 'AXStaticText',
    hitRole: 'AXStaticText', ms: 1.2, rechecked: false});
  assert.equal(routeOf(refused), 'synthesized');
  const kept = {result: {meta: {stalePoint: {verdict: 'kept', reason: 'sameElement', identity: 'recreated', recordedRole: 'AXLink', hitRole: 'AX Link'}}}};
  assert.equal(outcomeOf(kept), 'success');
  assert.equal(stalePointOf(kept).identity, 'recreated');
  assert.equal(stalePointOf(kept).hitRole, 'other');
  assert.equal(stalePointOf({result: {meta: {}}}), null);
  assert.equal(outcomeOf(null), 'missing');
  assert.equal(outcomeOf({error: {errorName: 'has spaces'}}), 'other');
  assert.deepEqual(delta({x: 1, y: 2, width: 10, height: 5}, {x: 1, y: 2, width: 19.5, height: 5}), {dx: 0, dy: 0, dw: 9.5, dh: 0});
});

const ev = (link, type = 'click') => ({type, link, trusted: true});
test('verdicts: kept and landed, refused, refused yet delivered, missed, and any event on another link', () => {
  const kept = {verdict: 'kept', reason: 'sameElement'}, refused = {verdict: 'refused', reason: 'nodeGone'};
  const base = {attested: true, click: 'success'};
  assert.equal(score({...base, stale: kept, clicks: [ev('target', 'mousedown'), ev('target')]}).verdict, 'kept-landed');
  assert.equal(score({...base, click: 'clickUnconfirmed', stale: kept, clicks: [ev('target')]}).verdict, 'kept-landed-error');
  assert.equal(score({...base, stale: kept, clicks: [ev('none')]}).verdict, 'kept-missed');
  assert.equal(score({...base, stale: kept, clicks: [ev('target', 'mousedown')]}).verdict, 'kept-missed');
  assert.equal(score({...base, click: 'screenChangedSinceScreenshot', stale: refused, clicks: []}).verdict, 'refused');
  assert.equal(score({...base, stale: refused, clicks: [ev('target', 'pointerdown')]}).verdict, 'refused-delivered');
  assert.equal(score({...base, stale: kept, clicks: [ev('archive')]}).verdict, 'wrong-target');
  assert.equal(score({...base, stale: refused, clicks: [ev('drafts', 'mousedown')]}).verdict, 'wrong-target');
  assert.equal(score({...base, stale: kept, clicks: [ev('bogus')]}).verdict, 'wrong-target');
  assert.equal(score({attested: true, observeFailed: true}).verdict, 'observe-failed');
  assert.equal(score({attested: false}).verdict, 'invalid');
  assert.deepEqual(landingOf([ev('target'), ev('none', 'mouseup')]), {landed: true, reached: true, wrong: [], nowhere: true, events: 2});
});

// Synthetic qualification rows: `verdictFor` names each row's verdict.
function rows(verdictFor, extra = () => ({})) {
  return plan({mode: 'qualify', heads: ['main', 'fix']}).map(r => {
    const v = verdictFor(r);
    return {...r, valid: true, verdict: v, click: v.startsWith('kept') ? 'success' : 'screenChangedSinceScreenshot',
      guard: {verdict: v.startsWith('kept') ? 'kept' : 'refused', reason: v.startsWith('kept') ? 'sameElement' : 'nodeGone', recordedRole: RECORDED_ROLE[r.at]},
      presentationHeld: true, ...extra(r)};
  });
}
const mainOf = r => ['refuse'].includes(CELLS[r.cell].kind) || r.cell === 'linkmono' ? 'refused'
  : ['grow', 'shrink'].includes(CELLS[r.cell].kind) && r.at === 'text' ? 'refused' : 'kept-landed';
const good = r => r.head === 'main' ? mainOf(r) : ['grow', 'shrink'].includes(CELLS[r.cell].kind) ? 'kept-landed' : mainOf(r);
const planned = list => list.reduce((o, r) => (o[`${r.head}/${unitKey(r)}`] = (o[`${r.head}/${unitKey(r)}`] ?? 0) + 1, o), {});
test('gates pass a fix that keeps the growing links and still refuses the rest, and fail each way it can be wrong', () => {
  const ok = rows(good), cov = coverage(ok, {planned: planned(ok), heads: ['main', 'fix']});
  const g = gates(ok, {coverage: cov});
  assert.ok(Object.values(g).every(x => x.pass), JSON.stringify(g));
  const unfixed = rows(r => r.head === 'fix' && r.cell === 'reltime' && r.at === 'text' && r.rep === 7 ? 'refused' : good(r));
  assert.equal(gates(unfixed, {coverage: cov}).keptAndLanded.pass, false);
  const missed = rows(r => r.head === 'fix' && r.cell === 'shrink' && r.rep === 1 ? 'kept-missed' : good(r));
  assert.equal(gates(missed, {coverage: cov}).keptAndLanded.pass, false);
  const loose = rows(r => r.head === 'fix' && r.cell === 'moved' && r.at === 'text' && r.rep === 3 ? 'wrong-target' : good(r));
  const gl = gates(loose, {coverage: cov});
  assert.equal(gl.stillRefused.pass, false); assert.equal(gl.noWrongTarget.pass, false);
  const kept = rows(r => r.head === 'fix' && r.cell === 'linksave' && r.rep === 0 ? 'kept-landed' : good(r));
  assert.equal(gates(kept, {coverage: cov}).stillRefused.pass, false);
  const changed = rows(r => r.head === 'fix' && r.cell === 'linkmono' && r.at === 'text' && r.rep === 5 ? 'kept-landed' : good(r));
  assert.equal(gates(changed, {coverage: cov}).othersAsMain.pass, false);
  // Another refusal reason alone is reported, not failed.
  const reason = rows(good, r => r.head === 'fix' && r.cell === 'linkmono' ? {guard: {verdict: 'refused', reason: 'relabelled'}} : {});
  const gr = gates(reason, {coverage: cov});
  assert.equal(gr.othersAsMain.pass, true); assert.equal(gr.othersAsMain.reasonDiffer, 40);
  const foreground = rows(good, r => r.head === 'fix' && r.cell === 'like' && r.at === 'link' && r.rep === 4 ? {presentationHeld: false} : {});
  assert.deepEqual(gates(foreground, {coverage: cov}).presentation.worse, ['like/link']);
  // A unit with no valid fix row proves nothing.
  const hollow = ok.map(r => r.head === 'fix' && r.cell === 'inbox' && r.at === 'text' ? {...r, valid: false, invalid: 'prepare'} : r);
  const gh = gates(hollow, {coverage: coverage(hollow, {planned: planned(ok), heads: ['main', 'fix']})});
  assert.equal(gh.coverage.pass, false); assert.equal(gh.keptAndLanded.pass, false);
  assert.equal(coverage(ok.slice(0, -1), {planned: planned(ok), heads: ['main', 'fix']}).complete, false);
});

test('summaries carry the geometry as median and span', () => {
  const s = summarize([{head: 'main', cell: 'inbox', at: 'text', valid: true, verdict: 'refused', guard: {verdict: 'refused', reason: 'nodeGone'},
    ax: {recorded: {dx: 0, dy: 0, dw: 30, dh: 0}}, dom: {text: {dx: 0, dy: 0, dw: 31, dh: 0}}},
  {head: 'main', cell: 'inbox', at: 'text', valid: true, verdict: 'refused', guard: {verdict: 'refused', reason: 'nodeGone'},
    ax: {recorded: {dx: 0, dy: 0, dw: 32, dh: 0}}, dom: null}])['main|inbox/text'];
  assert.deepEqual(s.axRecorded, {n: 2, dx: {median: 0, span: [0, 0]}, dy: {median: 0, span: [0, 0]}, dw: {median: 30, span: [30, 32]}});
  assert.equal(s.domText.n, 1);
  assert.deepEqual(s.reason, {'refused/nodeGone': 2});
});
