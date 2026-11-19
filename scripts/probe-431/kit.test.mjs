import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {CELLS,UNITS,AT,FILLER,DEEP,recordedRole,unitKey,unitsFor,plan,pointFor} from './cells.mjs';
import {quantiles,outcomeOf,stalePointOf,routeOf,findLink,covers,nodeAt,landingOf,delta,score,gates,coverage,summarize,judge,MIN_PAIRS} from './check.mjs';
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

test('the walk\'s caps the ruling-881 twins rely on are this checkout\'s', () => {
  const walk = engine('Walk.swift'), num = name => Number(walk.match(new RegExp(`let ${name} = ([0-9_]+)`))[1].replaceAll('_', ''));
  // Past the node cap: the filler alone outnumbers it, in groups the width rule reads whole.
  assert.ok(FILLER.groups * FILLER.each > num('maxObservedNodes')); assert.ok(FILLER.each <= num('widthThreshold'));
  // Below the depth cap, within the guard's ancestor walk (so #316's web-area rule still reaches the web area).
  const levels = Number(engine('StalePoint.swift').match(/let stalePointAncestorLevels = (\d+)/)[1]);
  assert.ok(DEEP > num('maxDepth') && DEEP + 20 < levels);
});

test('plans: ten per unit to measure, twenty per head interleaved to qualify', () => {
  assert.equal(UNITS.length, Object.values(CELLS).reduce((n, c) => n + (c.at ?? AT).length, 0));
  assert.deepEqual(UNITS.filter(u => u.cell === 'twinbtn').map(u => u.at), ['link']);
  assert.equal(recordedRole('twinbtn', 'link'), 'AXButton'); assert.equal(recordedRole('twin', 'link'), 'AXLink');
  assert.equal(recordedRole('twinbtn', 'text'), 'AXStaticText');
  assert.equal(plan({mode: 'measure', heads: ['main']}).length, 10 * UNITS.length);
  const q = plan({mode: 'qualify', heads: ['main', 'fix']});
  assert.equal(q.length, 2 * 20 * UNITS.length);
  assert.deepEqual([...new Set(q.filter((_, i) => i % 2 === 0).map(r => r.head))].sort(), ['fix', 'main']);
  for (const c of Object.values(CELLS)) assert.ok(['twin', 'keep', 'asMain'].includes(c.kind));
  // A twin carries the target's label, so the topmost of those reading it is the target.
  for (const c of Object.values(CELLS)) if (c.kind === 'twin') assert.ok(c.before === c.after && ['move', 'list', 'cap', 'deep'].includes(c.twin));
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
  // The twin cell: two same-label links, the topmost taken with the link holding its text.
  const text2 = {...text, frame: {...text.frame, y: 214}}, link2 = {...link, frame: {...link.frame, y: 200}};
  assert.equal(findLink([text2, link2, text, link], 'Inbox'), null);
  assert.deepEqual(findLink([text2, link2, text, link], 'Inbox', {first: true}), {text, link});
  assert.deepEqual(findLink([text2, link2], 'Inbox', {first: true}), {text: text2, link: link2});
  assert.equal(score({attested: true, at: 'text', click: 'success', stale: {verdict: 'kept', recordedRole: 'AXStaticText'},
    clicks: [{type: 'click', link: 'twin'}]}).verdict, 'wrong-target');
  const bare = {...link, title: ''};
  assert.deepEqual(findLink([text, bare, {role: 'AXLink', title: 'Archive', frame: {x: 420, y: 200, width: 130, height: 56}}], 'Inbox'), {text, link: bare});
  assert.equal(findLink([text, link, {...text}], 'Inbox'), null);
  assert.equal(findLink([text, link], 'Inbox (3)'), null);
  assert.equal(findLink([{...text, frame: {x: 0, y: 0, width: 0, height: 0}}, link], 'Inbox'), null);
  // A button, with or without a text child; the topmost of two with `first`.
  const button = {...link, role: 'AXButton'}, button2 = {...link2, role: 'AXButton'};
  assert.deepEqual(findLink([button2, button], 'Inbox', {first: true, role: 'AXButton'}), {text: null, link: button});
  assert.deepEqual(findLink([button, text], 'Inbox', {role: 'AXButton'}), {text, link: button});
  assert.equal(findLink([button2, button], 'Inbox', {role: 'AXButton'}), null);
  assert.equal(findLink([text, link], 'Inbox', {role: 'AXButton'}), null);
});

test('a ruling-881 twin must be absent from the observation, which the walk must have cut', () => {
  const found = {text, link}, archive = {role: 'AXLink', title: 'Archive', frame: {x: 420, y: 200, width: 130, height: 56}};
  const twinText = {...text, frame: {...text.frame, y: 2000}};
  const cap = CELLS.twincap, deep = CELLS.twindeep, capped = {count: 2300}, nodeCapHit = {nodeCapHit: true};
  assert.equal(covers({nodes: [text, link, archive], truncated: capped, timings: nodeCapHit}, cap, found), true);
  assert.equal(covers({nodes: [text, link, archive, twinText], truncated: capped, timings: nodeCapHit}, cap, found), false);
  assert.equal(covers({nodes: [text, link, archive], truncated: null, timings: nodeCapHit}, cap, found), false);
  // A cut by the deadline, not the node cap, does not test the cap.
  assert.equal(covers({nodes: [text, link, archive], truncated: capped, timings: {deadlineHit: true}}, cap, found), false);
  assert.equal(covers({nodes: [text, link, archive], truncated: {depth: 200}}, cap, found), false);
  assert.equal(covers({nodes: [text, link, archive], truncated: {depth: 200}}, deep, found), true);
  assert.equal(covers({nodes: [text, link, {...link, frame: {...link.frame, y: 200}}], truncated: {depth: 200}}, deep, found), false);
  assert.equal(covers({nodes: [text, link], truncated: {count: 10}}, deep, found), false);
  // The twin's link read without its label or a usable frame still puts it in the record.
  const bareTwin = {role: 'AXLink', title: '', frame: {x: 0, y: 0, width: 0, height: 0}};
  assert.equal(covers({nodes: [text, link, archive, bareTwin], truncated: capped, timings: nodeCapHit}, cap, found), false);
  assert.equal(covers({nodes: [text, link, archive, {role: 'AXLink'}], truncated: {depth: 200}}, deep, found), false);
  // A twin cell's observation holds exactly the controls it prepares, so the found one is the target.
  const text2 = {...text, frame: {...text.frame, y: 214}};
  assert.equal(covers({nodes: [text, text2]}, CELLS.twin, found), true);
  assert.equal(covers({nodes: [text2]}, CELLS.twin, {text: text2, link}), false);
  const del = y => ({...text, value: 'Delete', frame: {...text.frame, y}});
  assert.equal(covers({nodes: [del(150), del(214), del(278)]}, CELLS.twindel, found), true);
  assert.equal(covers({nodes: [del(214), del(278)]}, CELLS.twindel, {text: del(214), link}), false);
  const button = {...link, role: 'AXButton'}, button2 = {...button, frame: {...link.frame, y: 200}};
  assert.equal(covers({nodes: [button, button2]}, CELLS.twinbtn, {text: null, link: button}, {role: 'AXButton'}), true);
  assert.equal(covers({nodes: [button2]}, CELLS.twinbtn, {text: null, link: button2}, {role: 'AXButton'}), false);
  assert.equal(covers({nodes: []}, CELLS.plain, found), true);
  // A button with no text child leaves the text point unplaceable, never a thrown error.
  assert.equal(pointFor('text', findLink([button], 'Inbox', {role: 'AXButton'}).text?.frame), null);
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
  assert.equal(nodeAt(nodes, pointFor('text', text.frame)).role, recordedRole('plain', 'text'));
  assert.equal(nodeAt(nodes, pointFor('link', link.frame)).role, recordedRole('plain', 'link'));
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
function rows(verdictFor, extra = () => ({}), units = UNITS) {
  return plan({mode: 'qualify', heads: ['main', 'fix'], units}).map(r => {
    const v = verdictFor(r);
    return {...r, valid: true, verdict: v, click: v.startsWith('kept') ? 'success' : 'screenChangedSinceScreenshot',
      guard: {verdict: v.startsWith('kept') ? 'kept' : 'refused', reason: v.startsWith('kept') ? 'sameElement' : 'nodeGone',
        recordedRole: recordedRole(r.cell, r.at), ms: r.head === 'fix' ? 4 : 2},
      clickEvents: v === 'wrong-target' ? ['pointerdown:twin', 'click:twin'] : v.startsWith('kept') ? ['click:target'] : [],
      presentationHeld: true, ...extra(r)};
  });
}
// Main as phase 1 measured it: the twins clicked, the text that changes width and the changes of meaning refused at the
// text, the moved link refused at both points, the rest kept and landed.
const mainOf = r => CELLS[r.cell].kind === 'twin' ? 'wrong-target'
  : ['linksave', 'moved', 'linkmono'].includes(r.cell) || ['inbox', 'reltime', 'shrink', 'right', 'centre'].includes(r.cell) && r.at === 'text'
    ? 'refused' : 'kept-landed';
const good = r => r.head === 'fix' && CELLS[r.cell].kind === 'twin' ? 'refused' : mainOf(r);
const planned = list => list.reduce((o, r) => (o[`${r.head}/${unitKey(r)}`] = (o[`${r.head}/${unitKey(r)}`] ?? 0) + 1, o), {});
const at = (cell, pt, rep, v) => r => r.head === 'fix' && r.cell === cell && (!pt || r.at === pt) && (rep == null || r.rep === rep) ? v : good(r);

test('gates pass a fix that refuses every twin and answers as main elsewhere, and fail each way it can be wrong', () => {
  const ok = rows(good), cov = coverage(ok, {planned: planned(ok), heads: ['main', 'fix']});
  const g = gates(ok, {coverage: cov});
  assert.ok(Object.values(g).every(x => x.pass), JSON.stringify(g));
  assert.equal(g.reproduced.result, 'reproduced');
  assert.equal(g.twinRefused.mainWrong, 20 * 5); assert.equal(g.twinUnrecorded.mainWrong, 20 * 4);
  assert.equal(g.noWrongTarget.mainWrong, 9 * 20); assert.deepEqual(g.guardMs.fix, {n: ok.length / 2, p50: 4, p95: 4, max: 4});
  // A twin kept (on the twin, or anywhere), or refused for another reason, fails its gate; a click on it fails both.
  const landed = gates(rows(at('twindel', 'link', 3, 'wrong-target')), {coverage: cov});
  assert.equal(landed.twinRefused.pass, false); assert.equal(landed.twinRefused.fixWrong, 1); assert.equal(landed.noWrongTarget.pass, false);
  assert.equal(landed.twinUnrecorded.pass, true);
  const capped = gates(rows(at('twincap', 'text', 0, 'wrong-target')), {coverage: cov});
  assert.equal(capped.twinUnrecorded.pass, false); assert.equal(capped.twinRefused.pass, true);
  assert.equal(capped.twinUnrecorded.perUnit['twincap/text'].missed, 1);
  const other = rows(good, r => r.head === 'fix' && r.cell === 'twinbtn' ? {guard: {verdict: 'refused', reason: 'frameMoved'}} : {});
  assert.equal(gates(other, {coverage: cov}).twinRefused.pass, false);
  for (const v of ['kept-landed', 'kept-missed', 'refused-delivered', 'refused-unreported', 'no-guard', 'misplaced'])
    assert.equal(gates(rows(at('twin', 'text', 2, v)), {coverage: cov}).twinRefused.pass, false, v);
  // A re-creation refused where main kept and landed: the regression keptAsMain names.
  const regressed = gates(rows(at('remount', 'link', 5, 'refused')), {coverage: cov}).keptAsMain;
  assert.equal(regressed.pass, false); assert.equal(regressed.refusedWhereMainKept, 1); assert.equal(regressed.differ, 1);
  assert.equal(gates(rows(at('like', 'text', 5, 'kept-missed')), {coverage: cov}).keptAsMain.pass, false);
  // Both heads refusing a re-creation alike are equal and still wrong; main's unkept baseline is counted apart.
  const bothRefuse = gates(rows(r => r.cell === 'remount' ? 'refused' : good(r)), {coverage: cov}).keptAsMain;
  assert.equal(bothRefuse.differ, 0); assert.equal(bothRefuse.pass, false);
  assert.equal(bothRefuse.fixNotKept, 40); assert.equal(bothRefuse.mainNotKept, 40);
  // Every other cell as main: a refusal kept, a kept one refused.
  assert.equal(gates(rows(at('linksave', 'text', 0, 'kept-landed')), {coverage: cov}).othersAsMain.pass, false);
  assert.equal(gates(rows(at('inbox', 'link', 0, 'refused')), {coverage: cov}).othersAsMain.pass, false);
  const moved = gates(rows(at('moved', 'text', 0, 'wrong-target')), {coverage: cov});
  assert.equal(moved.othersAsMain.pass, false); assert.equal(moved.noWrongTarget.pass, false);
  // Another refusal reason alone is reported, not failed, outside the twins.
  const reason = gates(rows(good, r => r.head === 'fix' && r.cell === 'linkmono' ? {guard: {verdict: 'refused', reason: 'relabelled'}} : {}), {coverage: cov});
  assert.equal(reason.othersAsMain.pass, true); assert.equal(reason.othersAsMain.reasonDiffer, 40);
  const foreground = rows(good, r => r.head === 'fix' && r.cell === 'like' && r.at === 'link' && r.rep === 4 ? {presentationHeld: false} : {});
  assert.deepEqual(gates(foreground, {coverage: cov}).presentation.worse, ['like/link']);
  // A unit with no valid fix row proves nothing.
  const hollow = ok.map(r => r.head === 'fix' && r.cell === 'twindeep' && r.at === 'link' ? {...r, valid: false, invalid: 'uncovered@placement'} : r);
  const gh = gates(hollow, {coverage: coverage(hollow, {planned: planned(ok), heads: ['main', 'fix']})});
  assert.equal(gh.coverage.pass, false); assert.equal(gh.twinUnrecorded.pass, false);
  assert.equal(coverage(ok.slice(0, -1), {planned: planned(ok), heads: ['main', 'fix']}).complete, false);
});

test('reproduced: main clicked the twin on at least half its valid rows of `twin`, else inconclusive', () => {
  const cov = {complete: true, covered: true};
  const half = rows(r => r.head === 'main' && r.cell === 'twin' && r.rep < 10 ? 'kept-landed' : good(r));
  assert.deepEqual(gates(half, {coverage: cov}).reproduced, {pass: true, result: 'reproduced', mainRows: 40, mainWrong: 20});
  const lost = gates(rows(r => r.head === 'main' && r.cell === 'twin' && r.rep < 11 ? 'refused' : good(r)), {coverage: cov}).reproduced;
  assert.equal(lost.pass, false); assert.equal(lost.result, 'not reproduced (inconclusive)');
  // Only a click on the twin itself reproduces: a pointerdown alone, or a click on Archive, does not.
  const partial = rows(good, r => r.head === 'main' && r.cell === 'twin' ? {clickEvents: r.rep < 11 ? ['pointerdown:twin'] : ['click:twin:untrusted']} : {});
  assert.equal(gates(partial, {coverage: cov}).reproduced.pass, false);
  const archive = rows(good, r => r.head === 'main' && r.cell === 'twin' ? {clickEvents: ['click:archive']} : {});
  assert.equal(gates(archive, {coverage: cov}).reproduced.mainWrong, 0);
});

test('a wrong event on a fix row a later step invalidated still fails noWrongTarget', () => {
  const ok = rows(good), cov = coverage(ok, {planned: planned(ok), heads: ['main', 'fix']});
  const late = ok.map(r => r.head === 'fix' && r.cell === 'twin' && r.at === 'text' && r.rep === 19
    ? {...r, valid: false, invalid: 'evidence@witness-end', verdict: 'invalid', clickEvents: ['click:twin']} : r);
  const g = gates(late, {coverage: coverage(late, {planned: planned(ok), heads: ['main', 'fix']})});
  assert.equal(g.coverage.pass, true); assert.equal(g.twinRefused.pass, true);
  assert.equal(g.noWrongTarget.pass, false); assert.equal(g.noWrongTarget.invalidRowsWithWrongEvents, 1);
  const quiet = ok.map(r => r.head === 'fix' && r.cell === 'twin' && r.rep === 19 ? {...r, valid: false, invalid: 'prepare', clickEvents: null} : r);
  assert.equal(gates(quiet, {coverage: cov}).noWrongTarget.pass, true);
});

test('a run of some cells is judged on those cells alone', () => {
  const units = unitsFor('remount,twincap'), cov = {complete: true, covered: true};
  assert.deepEqual(units.map(unitKey), ['twincap/text', 'twincap/link', 'remount/text', 'remount/link']);
  assert.throws(() => unitsFor('remount,nosuch'));
  assert.throws(() => unitsFor('constructor')); assert.throws(() => unitsFor(' , '));
  assert.equal(unitsFor(''), UNITS);
  const g = gates(rows(good, () => ({}), units), {coverage: cov, units});
  assert.ok(Object.values(g).every(x => x.pass), JSON.stringify(g));
  assert.equal(g.reproduced.result, 'not in this run');
  assert.equal(gates(rows(at('twincap', 'link', 1, 'kept-landed'), () => ({}), units), {coverage: cov, units}).twinUnrecorded.pass, false);
  const c = coverage(rows(good, () => ({}), units), {planned: planned(rows(good, () => ({}), units)), heads: ['main', 'fix'], units});
  assert.equal(Object.keys(c.per).length, 8); assert.ok(c.complete && c.covered);
});

test('paired gates need usable pairs in every unit: both rows valid, neither observation failed', () => {
  const cov = {complete: true, covered: true};
  const blind = n => rows(r => r.cell === 'like' && r.at === 'link' && r.rep < n ? 'observe-failed' : good(r));
  const enough = gates(blind(20 - MIN_PAIRS), {coverage: cov}).keptAsMain;
  assert.equal(enough.pass, true); assert.equal(enough.usablePairs['like/link'], MIN_PAIRS); assert.equal(enough.usablePairs['plain/text'], 20);
  const thin = gates(blind(21 - MIN_PAIRS), {coverage: cov}).keptAsMain;
  assert.equal(thin.pass, false); assert.equal(thin.differ, 0); assert.deepEqual(thin.thin, ['like/link']);
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
  assert.deepEqual(quantiles([3, 1, 2, 10]), {n: 4, p50: 3, p95: 10, max: 10});
});
