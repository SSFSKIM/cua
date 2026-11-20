import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {CELLS,UNITS,AT,FILLER,DEEP,recordedRole,unitKey,unitsFor,unitsForLane,repsOf,plan,pointFor,isReportOnly} from './cells.mjs';
import {FRAMELESS,overlayAt,labelledOf,quantiles,outcomeOf,stalePointOf,routeOf,findLink,covers,uncoveredBy,nodeAt,landingOf,delta,score,gates,coverage,summarize,judge,MIN_PAIRS} from './check.mjs';
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
  for (const c of Object.values(CELLS)) assert.ok(['twin', 'keep', 'big', 'asMain'].includes(c.kind));
  // A twin carries the target's label, so the topmost of those reading it is the target.
  for (const c of Object.values(CELLS)) if (c.kind === 'twin') assert.ok((c.before === c.after || c.twin === 'deco') && ['move', 'list', 'cap', 'deep', 'swap', 'cover', 'row', 'wide', 'hidden', 'deco'].includes(c.twin));
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
  // The browser's own link over the page (CfT's infobar) is not the twin; one in or below the target's row is.
  const infobar = {role: 'AXLink', title: 'Learn more', frame: {x: 700, y: 90, width: 80, height: 18}};
  assert.equal(uncoveredBy({nodes: [infobar, text, link, archive], truncated: {depth: 200}}, deep, found), null);
  assert.equal(uncoveredBy({nodes: [text, link, archive, {...infobar, frame: {...infobar.frame, y: 150}}], truncated: {depth: 200}}, deep, found), 'control');
  assert.equal(uncoveredBy({nodes: [text, link, archive], truncated: null, timings: nodeCapHit}, cap, found), 'cut');
  assert.equal(uncoveredBy({nodes: [text, link, archive, twinText], truncated: capped, timings: nodeCapHit}, cap, found), 'count');
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
    hitRole: 'AXStaticText', ms: 1.2, rechecked: false, underlyingRole: null, underlyingIdentity: null});
  // #433's fix: the control beneath, and how it was found.
  const under = stalePointOf({result: {meta: {stalePoint: {verdict: 'kept', reason: 'sameElement', recordedRole: 'AXGroup', underlyingRole: 'AXLink', underlyingIdentity: 'recreated'}}}});
  assert.equal(under.underlyingRole, 'AXLink'); assert.equal(under.underlyingIdentity, 'recreated');
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
    const v = verdictFor(r), kept = v.startsWith('kept') || v === 'wrong-target';
    return {...r, valid: true, verdict: v, click: kept ? 'success' : 'screenChangedSinceScreenshot',
      guard: {verdict: kept ? 'kept' : 'refused', reason: kept ? 'sameElement' : 'nodeGone', identity: v === 'wrong-target' ? 'recreated' : null,
        recordedRole: recordedRole(r.cell, r.at), ms: r.head === 'fix' ? 4 : 2},
      clickEvents: v === 'wrong-target' ? ['pointerdown:twin', 'click:twin'] : v === 'kept-missed' ? ['click:none'] : v.startsWith('kept') ? ['click:target'] : [],
      presentationHeld: true, ...extra(r)};
  });
}
// Main as phase 1 measured it: the twins clicked, the text that changes width and the changes of meaning refused at the
// text, the moved link refused at both points, the rest kept and landed.
// Main carries #431: it refuses the framed twins and lands on the frameless ones and on twincover's (#433).
const mainOf = r => CELLS[r.cell].kind === 'twin' ? (CELLS[r.cell].cover || FRAMELESS.has(r.cell) ? 'wrong-target' : 'refused') : ['scrim', 'nounder'].includes(r.cell) ? 'kept-missed'
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
  assert.equal(g.twinRefused.mainWrong, 0); assert.equal(g.twinUnrecorded.mainWrong, 0); assert.equal(g.twinFrameless.mainWrong, 20 * 10);
  // A moved target's own handle refuses frameMoved, which the swap cells count with nodeGone; no other twin does.
  const swapMoved = rows(good, r => r.head === 'fix' && r.cell.startsWith('twinswap') ? {guard: {verdict: 'refused', reason: 'frameMoved'}} : {});
  assert.equal(gates(swapMoved, {coverage: cov}).twinRefused.pass, true);
  assert.equal(g.noWrongTarget.mainWrong, 12 * 20);
  const cvKept = gates(rows(at('twincv', 'text', 0, 'kept-landed')), {coverage: cov});
  assert.equal(cvKept.twinFrameless.pass, false); assert.equal(cvKept.twinRefused.pass, true); assert.equal(cvKept.twinFrameless.perUnit['twincv/text'].missed, 1);
  // #433: twincover is gated at both points on the click never reaching the twin; any refusal reason counts, a keep
  // that reaches nothing is reported, not failed.
  const overlay = gates(rows(at('twincover', 'link', 3, 'wrong-target')), {coverage: cov});
  assert.equal(overlay.overlayTwin.pass, false); assert.equal(overlay.overlayTwin.reachedTwin, 1); assert.equal(overlay.noWrongTarget.pass, false);
  assert.equal(overlay.twinRefused.pass, true);
  const why = gates(rows(good, r => r.head === 'fix' && r.cell === 'twincover' ? {guard: {verdict: 'refused', reason: 'interactiveHit', recordedRole: 'AXGroup'}} : {}), {coverage: cov});
  assert.equal(why.overlayTwin.pass, true); assert.equal(why.overlayTwin.refused, 40);
  const quietKeep = gates(rows(at('twincover', 'text', 0, 'kept-missed'), r => r.head === 'fix' && r.cell === 'twincover' && r.at === 'text' && r.rep === 0 ? {clickEvents: []} : {}), {coverage: cov});
  assert.equal(quietKeep.overlayTwin.pass, true); assert.equal(quietKeep.overlayTwin.refused, 39); assert.equal(quietKeep.overlayTwin.failed, 1);
  // The builder's cost cells (#433) are reported only, outside the gates' rows.
  const costRows = ok.filter(r => r.head === 'fix' && ['stickyscroll', 'tipremount', 'twinunder', 'decomove'].includes(r.cell)).length;
  assert.equal(costRows, 4 * 2 * 20); assert.ok(['stickyscroll', 'tipremount', 'twinunder'].every(c => g.reportOnly.perUnit[c + '/link']));
  assert.deepEqual(g.guardMs.fix, {n: ok.length / 2 - costRows, p50: 4, p95: 4, max: 4});
  // Only a guard that judged the overlay counts: a fix row with no guard record, or another recorded role, fails; too few
  // rows recording the overlay on either head leave the gate inconclusive.
  assert.equal(gates(rows(at('twincover', 'text', 4, 'no-guard')), {coverage: cov}).overlayTwin.pass, false);
  assert.equal(gates(rows(at('twincover', 'link', 4, 'misplaced')), {coverage: cov}).overlayTwin.unguarded, 1);
  const elsewhere = side => rows(good, r => r.head === side && r.cell === 'twincover' && r.at === 'link' && r.rep < 11 ? {guard: {verdict: 'kept', reason: 'sameElement', recordedRole: 'AXLink'}} : {});
  const thinFix = gates(elsewhere('fix'), {coverage: cov}).overlayTwin, thinMain = gates(elsewhere('main'), {coverage: cov}).overlayTwin;
  assert.equal(thinFix.pass, false); assert.deepEqual(thinFix.thin, ['twincover/link']); assert.deepEqual(thinFix.evidence['twincover/link'], {fix: 9, main: 20});
  assert.equal(thinMain.pass, false); assert.deepEqual(thinMain.evidence['twincover/link'], {fix: 20, main: 9});
  // The regression twins answer as main, reason included: interactiveHit passes twinRefused but not twinAsMain.
  const ih = gates(rows(good, r => r.head === 'fix' && r.cell === 'twin' ? {guard: {verdict: 'refused', reason: 'interactiveHit'}} : {}), {coverage: cov});
  assert.equal(ih.twinRefused.pass, true); assert.equal(ih.twinAsMain.pass, false); assert.equal(ih.twinAsMain.reasonDiffer, 40);
  assert.equal(g.twinAsMain.pass, true); assert.equal(g.twinAsMain.usablePairs['twincap/text'], 20); assert.equal(g.twinAsMain.usablePairs['twincover/text'], undefined);
  // #433's controls: the veil over the live link kept and landed; the scrim and the bare veil as main, reason included,
  // and no click reaching a control main's never reached.
  assert.equal(gates(rows(at('overcontrol', 'text', 2, 'kept-missed')), {coverage: cov}).overlayKept.pass, false);
  assert.equal(gates(rows(at('scrim', 'link', 2, 'refused')), {coverage: cov}).overlayAsMain.pass, false);
  const through = gates(rows(at('scrim', 'link', 2, 'kept-landed')), {coverage: cov}).overlayAsMain;
  assert.equal(through.pass, false); assert.deepEqual(through.reachBeyondMain, {'scrim/link': ['target']});
  // Either head unguarded or misplaced on an overlay control fails; scrim and nounder need a main the guard kept.
  assert.equal(gates(rows(r => r.cell === 'scrim' && r.at === 'link' && r.rep === 1 ? 'no-guard' : good(r)), {coverage: cov}).overlayAsMain.unguarded, 2);
  assert.equal(gates(rows(r => r.head === 'main' && r.cell === 'overcontrol' && r.rep === 1 ? 'misplaced' : good(r)), {coverage: cov}).overlayKept.pass, false);
  const nounderRefused = gates(rows(r => r.cell === 'nounder' ? 'refused' : good(r)), {coverage: cov}).overlayAsMain;
  assert.equal(nounderRefused.differ, 0); assert.equal(nounderRefused.pass, false); assert.equal(nounderRefused.mainUnkept, 20);
  // An invalidated fix row's page log still counts toward the reach ceiling.
  const lateReach = rows(good).map(r => r.head === 'fix' && r.cell === 'scrim' && r.at === 'text' && r.rep === 7
    ? {...r, valid: false, invalid: 'evidence@witness-end', verdict: 'invalid', clickEvents: ['pointerdown:target']} : r);
  const lr = gates(lateReach, {coverage: cov, minPairs: 19}).overlayAsMain;
  assert.equal(lr.pass, false); assert.deepEqual(lr.reachBeyondMain, {'scrim/text': ['target']});
  const scrimReason = gates(rows(good, r => r.head === 'fix' && r.cell === 'nounder' ? {guard: {verdict: 'kept', reason: 'nonInteractiveHit'}} : {}), {coverage: cov});
  assert.equal(scrimReason.overlayAsMain.pass, false); assert.equal(scrimReason.overlayAsMain.reasonDiffer, 20);
  assert.equal(scrimReason.othersAsMain.pass, true);
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
  // Another refusal reason fails too (#433: every other cell answers as main, reason included).
  const reason = gates(rows(good, r => r.head === 'fix' && r.cell === 'linkmono' ? {guard: {verdict: 'refused', reason: 'relabelled'}} : {}), {coverage: cov});
  assert.equal(reason.othersAsMain.pass, false); assert.equal(reason.othersAsMain.reasonDiffer, 40);
  const foreground = rows(good, r => r.head === 'fix' && r.cell === 'like' && r.at === 'link' && r.rep === 4 ? {presentationHeld: false} : {});
  assert.deepEqual(gates(foreground, {coverage: cov}).presentation.worse, ['like/link']);
  // A unit with no valid fix row proves nothing.
  const hollow = ok.map(r => r.head === 'fix' && r.cell === 'twindeep' && r.at === 'link' ? {...r, valid: false, invalid: 'uncovered@placement'} : r);
  const gh = gates(hollow, {coverage: coverage(hollow, {planned: planned(ok), heads: ['main', 'fix']})});
  assert.equal(gh.coverage.pass, false); assert.equal(gh.twinUnrecorded.pass, false);
  assert.equal(coverage(ok.slice(0, -1), {planned: planned(ok), heads: ['main', 'fix']}).complete, false);
});

test('reproduced (#433, reported): main clicked the twin through the kept overlay on at least half its valid twincover rows', () => {
  const cov = {complete: true, covered: true};
  const half = rows(r => r.head === 'main' && r.cell === 'twincover' && r.at === 'text' && r.rep < 10 ? 'kept-missed' : good(r));
  const h = gates(half, {coverage: cov}).reproduced;
  assert.equal(h.informational, true); assert.equal(h.pass, true); assert.equal(h.mainRows, 40); assert.equal(h.mainWrong, 30);
  assert.deepEqual(h.perUnit['twincover/text'], {mainRows: 20, mainTwinClicked: 10});
  const lost = gates(rows(r => r.head === 'main' && r.cell === 'twincover' && r.at === 'link' && r.rep < 11 ? 'refused' : good(r)), {coverage: cov});
  assert.equal(lost.reproduced.pass, false); assert.equal(lost.reproduced.result, 'not reproduced (inconclusive)');
  // Reported only: an unreproduced run still passes on its gates.
  assert.equal(judge(rows(r => r.head === 'main' && r.cell === 'twincover' ? 'refused' : good(r)), {mode: 'qualify', abort: null, coverage: cov}).pass, true);
  // Only a click on the twin itself reproduces: a pointerdown alone does not.
  const partial = rows(good, r => r.head === 'main' && r.cell === 'twincover' ? {clickEvents: ['pointerdown:twin']} : {});
  assert.equal(gates(partial, {coverage: cov}).reproduced.pass, false);
  const twinUnits = unitsFor('twin'), framed = rows(r => r.cell === 'twin' ? 'refused' : good(r), () => ({}), twinUnits);
  assert.equal(gates(framed, {coverage: cov, units: twinUnits}).reproduced.result, 'not in this run');
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

test('a big page\'s re-creation refused by the fix is reported, never failed; its cut must show', () => {
  const cov = {complete: true, covered: true}, ok = rows(good);
  assert.equal(gates(ok, {coverage: cov}).bigPage.fixNotKept, 0);
  const refused = rows(r => r.head === 'fix' && CELLS[r.cell].kind === 'big' ? 'refused' : good(r));
  const g = gates(refused, {coverage: cov});
  assert.equal(g.bigPage.informational, true); assert.equal(g.bigPage.pass, false);
  assert.equal(g.bigPage.refusedWhereMainKept, 4 * 20); assert.equal(g.keptAsMain.pass, true);
  assert.equal(judge(refused, {mode: 'qualify', abort: null, coverage: cov}).pass, true);
  // The strict form's cost: of main's kept-and-landed pairs per unit, those the fix refused.
  assert.deepEqual(g.cost.perUnit['capremount/text'], {mainKept: 20, fixRefused: 20, unmeasured: 0});
  assert.deepEqual(g.cost.perUnit['remount/link'], {mainKept: 20, fixRefused: 0, unmeasured: 0});
  assert.equal(g.cost.perUnit['twin/text'], undefined);
  // interactiveHit is a twin refusal ruling 889 accepts; relabelled is not.
  const hit = v => rows(good, r => r.head === 'fix' && r.cell === 'twinrow' ? {guard: {verdict: 'refused', reason: v}} : {});
  assert.equal(gates(hit('interactiveHit'), {coverage: cov}).twinRefused.pass, true);
  assert.equal(gates(hit('relabelled'), {coverage: cov}).twinRefused.pass, false);
  const found = {text: null, link: null};
  assert.equal(uncoveredBy({nodes: [{role: 'AXGroup', shown: {count: 30, of: 151}}]}, CELLS.wideremount, found), null);
  assert.equal(uncoveredBy({nodes: [{role: 'AXGroup', shown: {count: 151, of: 151}}]}, CELLS.wideremount, found), 'cut');
  assert.equal(uncoveredBy({nodes: [], timings: {nodeCapHit: true}}, CELLS.capremount, found), null);
  assert.equal(uncoveredBy({nodes: [], timings: {deadlineHit: true}}, CELLS.capremount, found), 'cut');
});

test('the second review: lanes without units, reps, report-only coverage, the wide twin, unmeasured cost', () => {
  // A Safari-only cell gives a Chromium lane no unit (the plan drops the lane, the runner refuses it).
  assert.equal(unitsForLane('twinwide', 'cft').length, 0); assert.equal(unitsForLane('twinwide', 'safari').length, 2);
  assert.equal(unitsForLane('', 'cft').length, UNITS.length - 4);
  // reps: empty takes the mode's; anything but an integer 1-99 is refused.
  assert.equal(repsOf(''), null); assert.equal(repsOf('5'), 5);
  for (const bad of ['2 ', '0', '100', 'x', '-1']) assert.throws(() => repsOf(bad), bad);
  // #433 gates twincover at both points: its invalid rows count against coverage.
  const units = unitsFor('twincover'), list = rows(good, () => ({}), units)
    .map(r => r.at === 'link' && r.rep >= 1 ? {...r, valid: false, invalid: 'placement@placement'} : r);
  const cov = coverage(list, {planned: planned(list), heads: ['main', 'fix'], units});
  assert.equal(cov.covered, false); assert.equal(cov.per['fix/twincover/link'].reportOnly, undefined);
  // The wide twin: a control at or below the target's bottom is the twin (or a row after it) in the read.
  const target = {role: 'AXLink', frame: {x: 20, y: 500, width: 116, height: 56}}, tt = {role: 'AXStaticText', value: 'Delete', frame: {x: 52, y: 514, width: 60, height: 28}};
  const cut = {role: 'AXGroup', shown: {count: 3, of: 150}}, above = {role: 'AXLink', frame: {x: 20, y: 372, width: 90, height: 56}};
  const sky = extra => ({nodes: [cut, above, tt, target, ...extra]});
  assert.equal(uncoveredBy(sky([]), CELLS.twinwide, {text: tt, link: target}), null);
  assert.equal(uncoveredBy(sky([{role: 'AXLink', title: '', frame: {x: 20, y: 564, width: 116, height: 56}}]), CELLS.twinwide, {text: tt, link: target}), 'control');
  // Cost: a fix row whose observation failed is unmeasured, never a refusal's denominator.
  const cu = unitsFor('remount'), cr = rows(r => r.head === 'fix' && r.at === 'link' && r.rep < 4 ? 'observe-failed' : r.head === 'fix' && r.at === 'link' && r.rep === 4 ? 'refused' : good(r), () => ({}), cu);
  const c = gates(cr, {coverage: {complete: true, covered: true}, units: cu}).cost.perUnit['remount/link'];
  assert.deepEqual(c, {mainKept: 16, fixRefused: 1, unmeasured: 4});
});

test('a short qualification plans its repetitions and asks no more pairs than it planned', () => {
  const units = unitsFor('remount,like'), short = plan({mode: 'qualify', heads: ['main', 'fix'], units, reps: 5});
  assert.equal(short.length, 2 * 5 * units.length);
  const list = short.map(r => ({...r, valid: true, verdict: 'kept-landed', click: 'success',
    guard: {verdict: 'kept', reason: 'sameElement', recordedRole: recordedRole(r.cell, r.at)}, presentationHeld: true}));
  const cov = coverage(list, {planned: planned(list), heads: ['main', 'fix'], units});
  assert.equal(judge(list, {mode: 'qualify', abort: null, coverage: cov, units, reps: 5}).pass, true);
  assert.equal(judge(list, {mode: 'qualify', abort: null, coverage: cov, units}).gates.keptAsMain.pass, false);
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

test('#435: a frameless twin must be listed without a frame at the unit\'s role, the target where the page put it', () => {
  const found = {text, link}, archive = {role: 'AXLink', title: 'Archive', frame: {x: 420, y: 264, width: 130, height: 56}};
  const ftext = {role: 'AXStaticText', value: 'Inbox', frame: null}, flink = {role: 'AXLink', title: 'Inbox', frame: null};
  const spec = CELLS.twindetails, sky = nodes => ({nodes});
  assert.equal(uncoveredBy(sky([text, link, flink, ftext, archive]), spec, found, {at: 'text'}), null);
  assert.equal(uncoveredBy(sky([text, link, flink, ftext, archive]), spec, found, {at: 'link'}), null);
  // The engine's label rule: the value by its words; a title before a description.
  assert.equal(uncoveredBy(sky([text, link, {...ftext, value: 'INBOX'}, archive]), spec, found, {at: 'text'}), null);
  assert.equal(uncoveredBy(sky([text, link, {role: 'AXLink', title: 'Other', description: 'Inbox', frame: null}, archive]), spec, found, {at: 'link'}), 'frameless');
  // Only the link listed frameless: the link point is tested, the text point is not; a framed twin text fails only the text point.
  assert.equal(uncoveredBy(sky([text, link, flink, archive]), spec, found, {at: 'text'}), 'frameless');
  const twinText = {...text, frame: {...text.frame, y: 214}};
  assert.equal(uncoveredBy(sky([text, link, flink, twinText, archive]), spec, found, {at: 'link'}), null);
  assert.equal(uncoveredBy(sky([text, link, flink, twinText, ftext, archive]), spec, found, {at: 'text'}), 'framed');
  // An unlabelled frameless link is not tied to the fixture's twin; one of another label is no twin.
  assert.equal(uncoveredBy(sky([text, link, {role: 'AXLink', title: '', frame: null}, archive]), spec, found, {at: 'link'}), 'frameless');
  assert.equal(uncoveredBy(sky([text, link, {role: 'AXLink', title: 'Other', frame: null}, archive]), spec, found, {at: 'link'}), 'frameless');
  assert.equal(uncoveredBy(sky([text, link, archive]), spec, found, {at: 'link'}), 'frameless');
  // A zero-size twin, or a zero-size unlabelled link, is framed for #431's search.
  const zero = {x: 420, y: 200, width: 0, height: 0};
  assert.equal(uncoveredBy(sky([text, link, {...ftext, frame: zero}, ftext, archive]), spec, found, {at: 'text'}), 'framed');
  assert.equal(uncoveredBy(sky([text, link, flink, {role: 'AXLink', title: '', frame: zero}, archive]), spec, found, {at: 'link'}), 'framed');
  // The target where the page put it: 128 pt above Archive (64 for cv), else the control found is not known to be it.
  assert.equal(uncoveredBy(sky([text, link, flink, archive]), CELLS.twincv, found, {at: 'link'}), 'target');
  assert.equal(uncoveredBy(sky([text, link, flink, {...archive, frame: {...archive.frame, y: 200}}]), CELLS.twincv, found, {at: 'link'}), null);
  assert.equal(uncoveredBy(sky([text, link, flink]), spec, found, {at: 'link'}), 'target');
  // The discovery's evidence: the label's carriers by role and frame, every frameless node by role.
  assert.deepEqual(labelledOf([text, link, ftext, flink, {...ftext, frame: zero}, {role: 'AXGroup', frame: null}, archive], 'Inbox'),
    {label: {'AXStaticText:framed': 1, 'AXLink:framed': 1, 'AXStaticText:frameless': 1, 'AXLink:frameless': 1, 'AXStaticText:zero': 1},
      frameless: {AXStaticText: 1, AXLink: 1, AXGroup: 1}});
  // Units by `cell/at`.
  assert.deepEqual(unitsFor('twincv/link,remount').map(unitKey), ['twincv/link', 'remount/text', 'remount/link']);
  assert.throws(() => unitsFor('twincv/middle'));
  // A short qualification asks the valid bar of its repetitions in usable pairs.
  const units = unitsFor('remount'), ten = plan({mode: 'qualify', heads: ['main', 'fix'], units, reps: 10});
  assert.equal(plan({mode: 'discover', heads: ['main'], units}).length, 3 * units.length);
  const kept = ten.map(r => ({...r, lane: 'cft', valid: !(r.head === 'fix' && r.rep < 2), invalid: null, verdict: 'kept-landed',
    guard: {verdict: 'kept', reason: 'sameElement', ms: 1}, click: 'success', clickEvents: [], presentationHeld: true}));
  const cov = coverage(kept, {planned: planned(ten), heads: ['main', 'fix'], units});
  assert.equal(judge(kept, {mode: 'qualify', abort: null, coverage: cov, units, reps: 10}).pass, true);
  // A discovery passes only on rows that carry the walk's evidence.
  const disc = plan({mode: 'discover', heads: ['main'], units}).map(r => ({...r, lane: 'cft', valid: true, verdict: 'observe-failed'}));
  const dcov = coverage(disc, {planned: planned(disc), heads: ['main'], units});
  assert.equal(judge(disc, {mode: 'discover', abort: null, coverage: dcov, units}).pass, false);
  assert.equal(judge(disc.map(r => ({...r, walk: {labelled: {label: {}, frameless: {}}}})), {mode: 'discover', abort: null, coverage: dcov, units}).pass, true);
});

test('#435: the fix must refuse a frameless twin nodeGone', () => {
  const units = unitsFor('twincv'), list = plan({mode: 'qualify', heads: ['main', 'fix'], units, reps: 10}).map(r => ({...r, lane: 'cft', valid: true,
    invalid: null, presentationHeld: true, click: r.head === 'main' ? 'success' : 'screenChangedSinceScreenshot',
    verdict: r.head === 'main' ? 'wrong-target' : 'refused', clickEvents: r.head === 'main' ? ['click:twin'] : [],
    guard: r.head === 'main' ? {verdict: 'kept', reason: 'sameElement', identity: 'recreated', ms: 1} : {verdict: 'refused', reason: 'nodeGone', ms: 1}}));
  const cov = coverage(list, {planned: planned(list), heads: ['main', 'fix'], units});
  const g = gates(list, {coverage: cov, units, minPairs: 8});
  assert.equal(g.twinFrameless.pass, true);
  // interactiveHit is not #435's refusal.
  const ih = list.map(r => r.head === 'fix' ? {...r, guard: {verdict: 'refused', reason: 'interactiveHit'}} : r);
  assert.equal(gates(ih, {coverage: cov, units, minPairs: 8}).twinFrameless.pass, false);
});

test('#433: the overlay cells record the overlay at their point, which lies under it and past the link for nounder', () => {
  for (const c of ['twincover', 'overcontrol', 'scrim', 'nounder']) for (const at of CELLS[c].at ?? AT) assert.equal(recordedRole(c, at), 'AXGroup');
  assert.deepEqual(UNITS.filter(u => u.cell === 'nounder').map(u => u.at), ['link']);
  assert.equal(isReportOnly({cell: 'twincover', at: 'link'}), false);
  const p = pointFor('link', link.frame, CELLS.nounder);
  assert.ok(p.x > link.frame.x + link.frame.width && p.y === link.frame.y + link.frame.height / 2);
  // The overlay nested two groups below the row lies deeper than the link's text: placement takes it at both points.
  const veil = {role: 'AXGroup', depth: 7, frame: {x: 420, y: 132, width: 800, height: 64}};
  const nodes = [{...link, depth: 5}, {...text, depth: 6}, {role: 'AXGroup', depth: 5, frame: veil.frame}, {role: 'AXGroup', depth: 6, frame: veil.frame}, veil];
  assert.equal(nodeAt(nodes, pointFor('text', text.frame)), veil); assert.equal(nodeAt(nodes, pointFor('link', link.frame)), veil);
  // Placement takes the fixture's overlay only: a group spanning the row over the link, or one wholly past it for nounder.
  const found = {text, link};
  assert.equal(overlayAt(veil, CELLS.twincover, found), true); assert.equal(overlayAt(veil, CELLS.scrim, found), true);
  assert.equal(overlayAt({...veil, frame: {x: 430, y: 132, width: 40, height: 64}}, CELLS.overcontrol, found), false);
  assert.equal(overlayAt({...veil, role: 'AXLink'}, CELLS.twincover, found), false);
  const beside = {role: 'AXGroup', frame: {x: link.frame.x + link.frame.width + 20, y: 132, width: 240, height: 64}};
  assert.equal(overlayAt(beside, CELLS.nounder, found), true); assert.equal(overlayAt(veil, CELLS.nounder, found), false);
  assert.equal(overlayAt(beside, CELLS.twincover, found), false);
});
