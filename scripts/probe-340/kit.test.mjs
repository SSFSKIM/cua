import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {CELLS,UNITS,AT,RECORDED_ROLE,unitKey,plan,pointFor} from './cells.mjs';
import {outcomeOf,stalePointOf,routeOf,findLink,nodeAt,landingOf,delta,score,gates,coverage,summarize,judge,MIN_PAIRS} from './check.mjs';
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

test('placement: the deepest framed node at the point, by depth, else the smallest frame', () => {
  const window = {role: 'AXWindow', depth: 0, frame: {x: 400, y: 30, width: 620, height: 700}};
  const nodes = [window, {...link, depth: 7}, {...text, depth: 8}, {role: 'AXGroup', depth: 9, frame: {x: 0, y: 0, width: 0, height: 0}}];
  assert.equal(nodeAt(nodes, pointFor('text', text.frame)).role, RECORDED_ROLE.text);
  assert.equal(nodeAt(nodes, pointFor('link', link.frame)).role, RECORDED_ROLE.link);
  assert.equal(nodeAt(nodes, {x: 410, y: 40}).role, 'AXWindow');
  assert.equal(nodeAt(nodes, {x: 10, y: 10}), null);
  // Without depth, the smallest frame holding the point; a deeper large node wins over a shallower small one.
  assert.equal(nodeAt([window, link, text], pointFor('text', text.frame)).role, 'AXStaticText');
  assert.equal(nodeAt([{...text, depth: 3}, {...window, depth: 4}], pointFor('text', text.frame)).role, 'AXWindow');
  assert.equal(nodeAt(null, {x: 0, y: 0}), null);
});

const ev = (link, type = 'click') => ({type, link, trusted: true});
test('verdicts: kept and landed, refused, refused yet delivered or unreported, missed, unguarded, misplaced, wrong target first', () => {
  const kept = {verdict: 'kept', reason: 'sameElement', recordedRole: 'AXStaticText'};
  const refused = {verdict: 'refused', reason: 'nodeGone', recordedRole: 'AXStaticText'};
  const base = {attested: true, at: 'text', click: 'success'};
  const refusal = {...base, click: 'screenChangedSinceScreenshot'};
  assert.equal(score({...base, stale: kept, clicks: [ev('target', 'mousedown'), ev('target')]}).verdict, 'kept-landed');
  assert.equal(score({...base, click: 'clickUnconfirmed', stale: kept, clicks: [ev('target')]}).verdict, 'kept-landed-error');
  assert.equal(score({...base, stale: kept, clicks: [ev('none')]}).verdict, 'kept-missed');
  assert.equal(score({...base, stale: kept, clicks: [ev('target', 'mousedown')]}).verdict, 'kept-missed');
  assert.equal(score({...refusal, stale: refused, clicks: []}).verdict, 'refused');
  assert.equal(score({...refusal, stale: refused, clicks: [ev('target', 'pointerdown')]}).verdict, 'refused-delivered');
  // Refused by the guard, nothing delivered, but the click did not say so.
  assert.equal(score({...base, stale: refused, clicks: []}).verdict, 'refused-unreported');
  assert.equal(score({...base, click: 'missing', stale: refused, clicks: []}).verdict, 'refused-unreported');
  assert.equal(score({...base, stale: refused, clicks: [ev('target', 'pointerdown')]}).verdict, 'refused-delivered');
  // A click after a checked placement with no record, or one taken at another role, is the head's own answer.
  assert.equal(score({...base, stale: null, clicks: [ev('target')]}).verdict, 'no-guard');
  assert.equal(score({...refusal, stale: {...refused, recordedRole: 'AXLink'}, clicks: []}).verdict, 'misplaced');
  assert.equal(score({...base, at: 'link', stale: kept, clicks: [ev('target')]}).verdict, 'misplaced');
  assert.equal(score({...base, at: 'link', stale: {...kept, recordedRole: 'AXLink'}, clicks: [ev('target')]}).verdict, 'kept-landed');
  // Any event on another link scores wrong-target, whatever the metadata.
  assert.equal(score({...base, stale: kept, clicks: [ev('archive')]}).verdict, 'wrong-target');
  assert.equal(score({...refusal, stale: refused, clicks: [ev('drafts', 'mousedown')]}).verdict, 'wrong-target');
  assert.equal(score({...base, stale: kept, clicks: [ev('bogus')]}).verdict, 'wrong-target');
  assert.equal(score({...base, stale: null, clicks: [ev('archive')]}).verdict, 'wrong-target');
  assert.equal(score({...base, stale: {...kept, recordedRole: 'AXLink'}, clicks: [ev('target'), ev('drafts')]}).verdict, 'wrong-target');
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
  // The head's own answers after a checked placement fail the gates they reach.
  for (const v of ['no-guard', 'misplaced', 'refused-unreported']) {
    const growing = gates(rows(r => r.head === 'fix' && r.cell === 'inbox' && r.at === 'link' && r.rep === 2 ? v : good(r)), {coverage: cov});
    assert.equal(growing.keptAndLanded.pass, false, v);
    const refusing = gates(rows(r => r.head === 'fix' && r.cell === 'moved' && r.rep === 2 ? v : good(r)), {coverage: cov});
    assert.equal(refusing.stillRefused.pass, false, v);
    const other = gates(rows(r => r.head === 'fix' && r.cell === 'plain' && r.at === 'text' && r.rep === 2 ? v : good(r)), {coverage: cov});
    assert.equal(other.othersAsMain.pass, false, v); assert.equal(other.othersAsMain.differ, 1, v);
  }
});

test('reproduced: main refused at least half its valid rows of the growing links\' text, else inconclusive', () => {
  const cov = {complete: true, covered: true};
  assert.equal(gates(rows(good), {coverage: cov}).reproduced.pass, true);
  const half = rows(r => r.head === 'main' && CELLS[r.cell].kind === 'grow' && r.at === 'text' && r.rep < 10 ? 'kept-landed' : good(r));
  assert.deepEqual(gates(half, {coverage: cov}).reproduced, {pass: true, result: 'reproduced', mainRows: 40, mainRefused: 20});
  const lost = rows(r => r.head === 'main' && CELLS[r.cell].kind === 'grow' && r.at === 'text' && r.rep < 11 ? 'kept-landed' : good(r));
  const g = gates(lost, {coverage: cov}).reproduced;
  assert.equal(g.pass, false); assert.equal(g.result, 'not reproduced (inconclusive)');
  // Shrinking text and the link's padding do not count; nor do invalid rows.
  const noText = rows(good).filter(r => !(r.head === 'main' && CELLS[r.cell].kind === 'grow' && r.at === 'text'));
  assert.equal(gates(noText, {coverage: cov}).reproduced.pass, false);
});

test('othersAsMain needs usable pairs in every unit: both rows valid, neither observation failed', () => {
  const cov = {complete: true, covered: true};
  const blind = n => rows(r => r.cell === 'like' && r.at === 'link' && r.rep < n ? 'observe-failed' : good(r));
  const enough = gates(blind(20 - MIN_PAIRS), {coverage: cov}).othersAsMain;
  assert.equal(enough.pass, true); assert.equal(enough.usablePairs['like/link'], MIN_PAIRS); assert.equal(enough.usablePairs['plain/text'], 20);
  const thin = gates(blind(21 - MIN_PAIRS), {coverage: cov}).othersAsMain;
  assert.equal(thin.pass, false); assert.equal(thin.differ, 0); assert.deepEqual(thin.thin, ['like/link']);
  // A main row that is invalid leaves its fix row unpaired.
  const unpaired = rows(good).map(r => r.head === 'main' && r.cell === 'linkmono' && r.at === 'text' && r.rep < 11 ? {...r, valid: false, invalid: 'mark@mark'} : r);
  const gu = gates(unpaired, {coverage: cov}).othersAsMain;
  assert.equal(gu.pass, false); assert.equal(gu.usablePairs['linkmono/text'], 9);
});

test('gates judge a qualification only: smoke and measure pass on coverage alone', () => {
  const bad = rows(r => r.head === 'fix' ? 'wrong-target' : good(r)), cov = coverage(bad, {planned: planned(bad), heads: ['main', 'fix']});
  assert.deepEqual(judge(bad, {mode: 'measure', abort: null, coverage: cov}), {gates: null, pass: true});
  assert.deepEqual(judge(bad, {mode: 'smoke', abort: null, coverage: cov}), {gates: null, pass: true});
  const q = judge(bad, {mode: 'qualify', abort: null, coverage: cov});
  assert.equal(q.pass, false); assert.equal(q.gates.noWrongTarget.pass, false);
  assert.equal(judge(rows(good), {mode: 'qualify', abort: null, coverage: cov}).pass, true);
  assert.equal(judge(rows(good), {mode: 'qualify', abort: 'engine-start', coverage: cov}).pass, false);
  assert.equal(judge(bad, {mode: 'measure', abort: null, coverage: {...cov, covered: false}}).pass, false);
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
