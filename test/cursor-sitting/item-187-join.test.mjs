// The isolating slot's hold-join rows (scripts/cursor-sitting/item-187-join.mjs): C2's and C3's plans, premises and
// every branch of their pre-registered bars, the popup's opening and the touch rule's reading of its window, C4's
// measures and the tail's skip, the tasks over fakes, the runner's session window and the verdict file's sections.
// Nothing is driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';
import {CONTROL_VARIANT} from '../../scripts/cursor-sitting/control-build.mjs';
import {CLICK_CELL, dialogPlan, inframePlan, ITEMS_JOIN, JOIN_REPS, joinMarkdown, joinRecord, joinStatus, joinTasks, joinVerdict, judgeJoin, judgeTail, KEY_CELL, KEYS,
  LABELS_JOIN as L, lastMenuBarIndex, MENU_CELL, menuPlan, raiseConditions, raisePlan, releaseConditions, RELEASE_SETTLE_MS, TAIL_REPS, tailMarkdown}
  from '../../scripts/cursor-sitting/item-187-join.mjs';
import {attestProblem, isolateMarkdown, isolatePlan, judgeIsolate} from '../../scripts/cursor-sitting/item-187-isolate.mjs';
import {item187Tasks, personTouchedOf, touchedOfItem} from '../../scripts/cursor-sitting/item-187.mjs';
import {describeStep, sessionRecord} from '../../scripts/cursor-sitting/runner.mjs';
import {SCENE_MARKER} from '../../scripts/cursor-sitting/target-guard.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';

const T = 1_000_000, PIDS = {chrome: 201, textedit: 202, electron: 203, finder: 204}, SCENE_PIDS = [PIDS.chrome, PIDS.textedit, PIDS.electron];
const BUILD = 'a'.repeat(64), NATIVE = {engine: 'cua', version: '0.1.0', build: BUILD}, CONTROL = {...NATIVE, build: 'c'.repeat(64), variant: CONTROL_VARIANT};
const attest = native => attestProblem(native, {build: BUILD, variant: null});
const Z = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const KEY = (frontmost = false) => ({trusted: true, ok: true, frontmost, found: true, focused: false, main: true, focusedWindow: 'run', mainWindow: 'run'});
const page = (seq, counts, focused) => ({seq, counts: {...Z, ...counts}, focused});
const start = {kind: 'start', at: T - 5000};
const chromeActivated = {kind: 'activated', bundleId: SCENES.chrome.bundleId, at: T - 50};
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-187j-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };

// A cell's answer as ./session.mjs readReply keeps it.
const answer = ({sent = true, threw = false, native = NATIVE, ...meta} = {}) => ({ok: true, value: {sent, threw, message: threw ? 'refused' : null}, route: 3, nativeEngine: native, meta});
const holderAnswer = over => answer({activationJoin: 'fresh', activationClickKind: {kind: 'inertOutside', point: 'offset', when: 'early'}, activationGuardMs: 40, ...over});
const DELIVERY = {restores: 0, raiseLeft: false, repairedAfterRelease: false, capped: false, holdStartedAt: T + 500, releasedAt: T + 560, postedAt: T + 510};
const clickAnswer = ({delivery = {}, ...over} = {}) => answer({activationJoin: 'rearmed', activationClickKind: {kind: 'action', when: 'consumedByAction'}, activationGuardMs: 45,
  delivery: {...DELIVERY, ...delivery}, actionInterval: {startedAt: T + 505}, ...over});
const run = (changes = []) => ({start: {state: 'front-above', at: T - 100}, changes, end: null});
const STOP = {ok: true, maxGapMs: 9, raises: 0};

// C2's repetition, every condition holding; `over` replaces joinRecord's inputs.
function raiseRecord({rep = 0, reads = {}, ...over} = {}) {
  return joinRecord({kind: 'raise', tag: `${ITEMS_JOIN.raise(rep)}#0`, rep, holder: holderAnswer(), click: clickAnswer(), later: {ok: true, value: {inFront: true}, meta: {}},
    reads: {before: {at: T, front: PIDS.textedit, page: page(1, {}, false), key: KEY()},
      keys: {at: T + 300, front: PIDS.textedit, page: page(3, {windowFocus: 1, windowBlur: 1, textBlur: 1}, false), key: KEY()},
      after: {at: T + 2000, front: PIDS.textedit, page: page(6, {windowFocus: 2, windowBlur: 1, textFocus: 1, textBlur: 1, mousedown: 1, click: 1}, true), key: KEY()}, ...reads},
    run: run(), activations: [], scenePids: SCENE_PIDS, texteditPid: PIDS.textedit, ...over});
}
// C3's repetition, every condition holding; the popup's opening activated Chrome (the scene's own app).
function dialogRecord({rep = 0, reads = {}, ...over} = {}) {
  return joinRecord({kind: 'dialog', tag: `${ITEMS_JOIN.dialog(rep)}#0`, rep, holder: holderAnswer(), click: clickAnswer(), later: {ok: true, value: {inFront: true}, meta: {}},
    reads: {before: {at: T, front: PIDS.textedit, page: page(2, {windowFocus: 1, windowBlur: 1}, false), key: KEY()},
      keys: {at: T + 300, front: PIDS.textedit, page: page(2, {windowFocus: 1, windowBlur: 1}, false), key: KEY()},
      held: {at: T + 1800, front: PIDS.textedit, page: page(3, {windowFocus: 2, windowBlur: 1}, true), key: KEY(true)},
      released: {at: T + 2100, front: PIDS.textedit, page: page(4, {windowFocus: 2, windowBlur: 2}, false), key: KEY(false), settledMs: 120, polls: 2}, ...reads},
    run: run(), activations: [chromeActivated], scenePids: SCENE_PIDS, texteditPid: PIDS.textedit,
    popup: {number: 555, bounds: {x: 64, y: 200, width: 360, height: 240}, ms: 900, chromeFront: true}, gone: {gone: true, ms: 80}, ...over});
}
const itemRows = (record, stop = STOP) => [start, {kind: 'task', task: '187-join-record', result: record}, {kind: 'task', task: '187-order-stop', result: stop}];
const evidence = (kind, make, overs = {}) => Object.fromEntries(Array.from({length: JOIN_REPS}, (_, n) => [ITEMS_JOIN[kind](n), overs[n] === null ? null : itemRows(make({rep: n, ...overs[n]}), overs[n]?.stop)]).filter(([, v]) => v));

test('C2\'s plan: three items, each Chrome relaunched and placed, the watchers on, ⌘L under TextEdit\'s key guard, the click inside the hold, the tail, one observation', () => {
  const plan = raisePlan();
  assert.deepEqual(plan.map(p => [p.item, p.stage, p.rep]), [0, 1, 2].map(n => [ITEMS_JOIN.raise(n), 'raise', n]));
  const steps = plan[1].steps, tag = `${ITEMS_JOIN.raise(1)}#0`;
  const order = steps.map(s => s.task ?? (s.open ? 'open' : s.close ? 'close' : s.run ? `run ${s.label.split(': ')[0].split(' ').at(-1)}` : s.wait ? 'wait' : null)).filter(Boolean);
  assert.deepEqual(order, ['187-relaunch', '187-place', 'activate', 'select-source', '187-arrange', '187-order-start', '187-activations-start', 'open', '187-join-frame', '187-join-read',
    'run keys', '187-join-read', 'run click', 'wait', 'run after', '187-join-read', 'close', '187-activations-stop', '187-join-record', '187-order-stop', 'activate']);
  assert.deepEqual(steps.find(s => s.task === '187-relaunch').args, [ITEMS_JOIN.raise(1), 'chrome'], 'the counters page');
  const keys = steps.find(s => s.label === L.keys(tag));
  assert.equal(keys.keys, 'textedit', 'the key goes only while TextEdit\'s run window is on top');
  assert.match(keys.cell, /__app\.pressKey\("super\+l"\)/);
  assert.equal(KEYS.raise, 'super+l');
  const click = steps.find(s => s.label === L.click(tag)), at = {[L.frame(tag)]: {point: {x: 300, y: 400}, window: {x: 24, y: 100, width: 1000, height: 700}}};
  assert.equal(click.when({}), false, 'no click unless the keys went out');
  assert.equal(click.when({[L.keys(tag)]: {ok: true, value: {sent: true, threw: false}}}), true);
  assert.equal(click.when({[L.keys(tag)]: {ok: true, value: {sent: true, threw: true}}}), false);
  assert.match(click.cell(at), /await observe\(\);\nconst scale/, 'the look an agent takes, then the click');
  assert.match(click.cell(at), /"x":300,"y":400/);
  // A person-touched repetition's replacement: the next number, naming the attempt it replaces.
  const r = plan[1].replace(4200);
  assert.deepEqual([r.item, r.stage, r.replacement], [ITEMS_JOIN.raise(3), 'raise', {item: ITEMS_JOIN.raise(1), attempt: 4200}]);
  assert.deepEqual(r.steps[0], {task: '187-replaces', args: [ITEMS_JOIN.raise(1), '4200']});
  assert.equal(r.replace, undefined, 'a replacement is not replaced again');
  assert.equal(plan[2].replace(1).item, ITEMS_JOIN.raise(4));
});

test('C3\'s plan: the popup page, the watcher on before the popup opens, TextEdit in front again, a session whose Chrome is the popup, the release by a third scene', () => {
  const steps = dialogPlan()[0].steps, tag = `${ITEMS_JOIN.dialog(0)}#0`, tasks = steps.filter(s => s.task).map(s => s.task);
  assert.deepEqual(steps.find(s => s.task === '187-relaunch').args, [ITEMS_JOIN.dialog(0), 'chrome', 'popup']);
  assert.ok(tasks.indexOf('187-activations-start') < tasks.indexOf('187-popup-open'), 'the touch rule sees the popup\'s opening');
  assert.ok(tasks.indexOf('187-popup-open') < tasks.lastIndexOf('activate') && tasks.indexOf('187-popup-open') < tasks.indexOf('187-arrange'));
  assert.deepEqual(steps[steps.findIndex(s => s.task === '187-popup-open') + 1], {task: 'activate', args: ['textedit'], required: true});
  const open = steps.find(s => s.open);
  assert.deepEqual(open.scenes, ['chrome', 'textedit', 'electron']);
  assert.equal(open.windows.chrome({[L.popup(tag)]: {number: 555}}), 555);
  assert.match(describeStep(open), /chrome on the window a task found/);
  assert.deepEqual(steps.find(s => s.task === '187-join-frame').args, [tag, 'chrome', 'AXButton', 'Close popup', 'popup']);
  assert.match(steps.find(s => s.label === L.keys(tag)).cell, /pressKey\("super\+a"\)/);
  const release = steps.find(s => s.label === L.release(tag));
  assert.match(release.cell, new RegExp(SCENE_MARKER('electron').replace(/[*/]/g, '\\$&')), 'a request aimed at another app ends the hold');
  const names = steps.map(s => s.task ?? s.label ?? (s.wait ? 'wait' : null));
  assert.ok(names.indexOf('187-popup-gone') < names.indexOf(L.release(tag)) && names.indexOf(`187-join-read`) < names.indexOf(L.release(tag)));
  const after = steps.filter(s => s.task === '187-join-read').map(s => s.args);
  assert.deepEqual(after.map(a => a[1]), ['before', 'keys', 'held', 'released']);
  assert.deepEqual(after.at(-1), [tag, 'released', 'chrome', 'release']);
});

test('C4\'s plans: one item each, three repetitions in one session; the menu\'s click with no observation between; Finder the in-frame item\'s scene and never bound', () => {
  const menu = menuPlan(), inframe = inframePlan();
  assert.deepEqual([menu.length, inframe.length, menu[0].stage, inframe[0].stage], [1, 1, 'tail', 'tail']);
  const m = menu[0].steps, f = inframe[0].steps;
  assert.equal(m.filter(s => s.open).length, 1);
  assert.equal(m.filter(s => s.label?.includes(' menu: ')).length, TAIL_REPS);
  assert.equal(m.filter(s => s.task === '187-join-record').length, TAIL_REPS);
  const click = m.find(s => s.label === L.click(`${ITEMS_JOIN.menu}#1`)), at = {[L.frame(ITEMS_JOIN.menu)]: {point: {x: 1, y: 2}, window: {x: 0, y: 0, width: 10, height: 10}}};
  assert.ok(!click.cell(at).includes('await observe()'), 'the recorded menu is not observed again before the click');
  assert.ok(m.findIndex(s => s.task === '187-join-menu') < m.findIndex(s => s.label === L.click(`${ITEMS_JOIN.menu}#0`)));
  assert.deepEqual(f.find(s => s.task === '187-place').args, ['textedit', 'finder']);
  assert.deepEqual(f.find(s => s.task === '187-activations-start').args, [ITEMS_JOIN.inframe, 'finder']);
  const open = f.find(s => s.open);
  assert.deepEqual([open.scenes, open.bind], [['textedit', 'finder', 'electron'], ['textedit', 'electron']]);
  const keys = f.find(s => s.label === L.keys(`${ITEMS_JOIN.inframe}#0`));
  assert.equal(keys.keys, 'finder');
  assert.match(keys.cell, /pressKey\("super\+Up"\)/);
  assert.equal(f.filter(s => s.task === '187-join-tidy').length, TAIL_REPS, 'a raise left over is put back between repetitions');
  // The tail is skipped with --no-tail, every verdict item kept.
  const full = isolatePlan(), short = isolatePlan({tail: false});
  assert.deepEqual(full.filter(p => p.stage === 'tail').map(p => p.item), [ITEMS_JOIN.menu, ITEMS_JOIN.inframe]);
  assert.deepEqual(short.map(p => p.item), full.filter(p => p.stage !== 'tail').map(p => p.item));
});

test('the cells: the key, the click (scaled from the window\'s points into the screenshot\'s pixels), the menu record of the menu bar\'s last item', () => {
  const key = KEY_CELL('chrome', 'super+l');
  assert.ok(key.includes(SCENE_MARKER('chrome')), 'the target guard knows the cell acts on Chrome');
  assert.match(key, /return \{sent: true, threw, message\}/);
  const click = CLICK_CELL('chrome', {x: 124, y: 300}, {x: 24, y: 100, width: 1000, height: 700}, {observe: false});
  assert.match(click, /point = \[Math\.round\(\(g\.x - w\.x\) \* scale\)/);
  assert.match(CLICK_CELL('chrome', null, null), /nothing sent/);
  assert.match(MENU_CELL('chrome'), /const lastMenuBarIndex = function lastMenuBarIndex/);
  const ax = ['0 window, cua scene page', '\t1 menu bar', '\t\t2 Apple', '\t\t\t3 About This Mac', '\t\t4 File', '\t\t5 도움말', '\t\t\t6 menu', '\t7 web area'].join('\n');
  assert.equal(lastMenuBarIndex(ax), 5);
  assert.equal(lastMenuBarIndex('0 window\n\t1 button'), null);
  assert.equal(lastMenuBarIndex('0 window\n\t1 menu bar\n\t2 web area'), null);
});

test('C2\'s bar: every condition holding passes; each one failing, a premise unmet, the half not attested, the person, an act that did not go out', () => {
  const ok = raiseRecord();
  assert.equal(ok.personTouched, null);
  assert.deepEqual(joinStatus('raise', ok, {attest}), ['counted', null]);
  assert.deepEqual(raiseConditions(ok, STOP), {noRaise: true, frontmostTextEdit: true, noRepairs: true, pageSaw: true, noFlash: true});
  const raised = raiseRecord({run: run([{at: T + 520, prev: T + 515, state: 'back-above'}, {at: T + 540, prev: T + 535, state: 'front-above'}])});
  assert.deepEqual([raiseConditions(raised, STOP).noRaise, raiseConditions(raised, STOP).noFlash], [false, true], 'a raise inside the display hold: ordered, but never on screen');
  const late = raiseRecord({run: run([{at: T + 700, prev: T + 695, state: 'back-above'}, {at: T + 900, prev: T + 895, state: 'front-above'}])});
  assert.deepEqual([raiseConditions(late, STOP).noRaise, raiseConditions(late, STOP).noFlash], [false, false], 'a raise past the hold\'s release is out of place');
  const cases = [
    ['Chrome frontmost at a reading', raiseRecord({reads: {keys: {at: T + 300, front: PIDS.chrome, page: page(3, {}, false), key: KEY(true)}}}), 'frontmostTextEdit'],
    ['an app activated during the row', raiseRecord({activations: [{kind: 'activated', bundleId: SCENES.chrome.bundleId, at: T + 600}]}), 'frontmostTextEdit'],
    ['the delivery guard restored', raiseRecord({click: clickAnswer({delivery: {restores: 1}})}), 'noRepairs'],
    ['a repair after the release', raiseRecord({click: clickAnswer({delivery: {repairedAfterRelease: true}})}), 'noRepairs'],
    ['the after-action watch repaired the click', raiseRecord({later: {ok: true, value: {}, meta: {afterActionRepairs: {repairs: 1, actions: [{postedAt: T + 510, repairs: 1, latencyMs: 30}]}}}}), 'noRepairs'],
    ['the page saw no textarea focus', raiseRecord({reads: {after: {at: T + 2000, front: PIDS.textedit, page: page(6, {mousedown: 1, click: 1, windowFocus: 1, windowBlur: 1, textBlur: 1}, true), key: KEY()}}}), 'pageSaw'],
  ];
  for (const [what, record, condition] of cases) {
    const c = raiseConditions(record, STOP);
    assert.equal(c[condition], false, what);
    assert.equal(Object.values(c).filter(v => v === false).length, 1, `${what}: only ${condition} fails`);
    assert.equal(joinVerdict([{item: 'x', counted: true, conditions: c}], 1).verdict, 'FAIL', what);
  }
  // Unread, never failed: the watcher's record with a gap, the page not read, the after-observation failed.
  assert.deepEqual([raiseConditions(ok, {ok: true, maxGapMs: 80}).noRaise, raiseConditions(ok, null).noFlash], [null, null]);
  assert.equal(raiseConditions(raiseRecord({reads: {after: {at: T + 2000, front: PIDS.textedit, page: null, key: null}}}), STOP).pageSaw, null);
  const statuses = [
    ['the join shared, not rearmed', raiseRecord({click: clickAnswer({activationJoin: 'shared'})}), 'premise not met', /activationJoin was shared, not rearmed/],
    ['no join recorded', raiseRecord({click: clickAnswer({activationJoin: undefined})}), 'premise not met', /unrecorded/],
    ['the control build answered', raiseRecord({click: clickAnswer({native: CONTROL})}), 'not attested', /the click: the result's build was cccccccccccc/],
    ['the key answered by the control build', raiseRecord({holder: holderAnswer({native: CONTROL})}), 'not attested', /the key equivalent/],
    ['the key refused', raiseRecord({holder: holderAnswer({threw: true})}), 'invalid', /the key equivalent did not go out \(refused\)/],
    ['the click not sent', raiseRecord({click: null}), 'invalid', /the click did not go out \(not sent\)/],
    ['the observation after failed', raiseRecord({later: {ok: false, error: 'no answer'}}), 'invalid', /the observation after the click failed \(no answer\)/],
    ['the person', raiseRecord({activations: [{kind: 'activated', bundleId: 'com.apple.ActivityMonitor', at: T + 100}]}), 'person-touched', /touched by the person/],
  ];
  for (const [what, record, status, why] of statuses) {
    const [s, w] = joinStatus('raise', record, {attest});
    assert.equal(s, status, what);
    assert.match(w, why, what);
  }
});

test('C2\'s verdict from the evidence: PASS on 3 of 3; FAIL on one failing; INCOMPLETE with a premise unmet or a reading missing; a replacement counts for a person-touched one', () => {
  const judged = overs => judgeJoin('raise', evidence('raise', raiseRecord, overs), {attest});
  assert.equal(judged({}).verdict, 'PASS');
  const fail = judged({1: {click: clickAnswer({delivery: {restores: 1}})}});
  assert.equal(fail.verdict, 'FAIL');
  assert.match(fail.why.join('; '), /187-iso-raise-1: not noRepairs/);
  const premise = judged({2: {click: clickAnswer({activationJoin: 'shared'})}});
  assert.equal(premise.verdict, 'INCOMPLETE');
  assert.match(premise.why.join('; '), /2 of 3 repetitions counted/);
  assert.equal(premise.reps[2].status, 'premise not met');
  const gap = judged({0: {stop: {ok: true, maxGapMs: 90}}});
  assert.equal(gap.verdict, 'INCOMPLETE');
  assert.match(gap.why.join('; '), /noRaise, noFlash unread/);
  assert.equal(judged({0: null}).reps[0].status, 'not recorded');
  // A failing counted repetition fails the part even with another not counted.
  assert.equal(judged({0: {click: clickAnswer({activationJoin: 'fresh'})}, 1: {reads: {keys: {at: T + 300, front: PIDS.chrome, page: page(3, {}, false), key: KEY()}}}}).verdict, 'FAIL');
  // The person touched repetition 1: its replacement (number 3) counts for it.
  const items = evidence('raise', raiseRecord, {1: {activations: [{kind: 'activated', bundleId: 'com.apple.ActivityMonitor', at: T + 100}]}});
  items[ITEMS_JOIN.raise(1)][0] = {...start, at: 7000};
  assert.equal(judgeJoin('raise', items, {attest}).verdict, 'INCOMPLETE');
  items[ITEMS_JOIN.raise(3)] = [{...start, at: 8000}, {kind: 'task', task: '187-replaces', result: {ok: true, parent: ITEMS_JOIN.raise(1), attempt: 7000}}, ...itemRows(raiseRecord({rep: 3})).slice(1)];
  const replaced = judgeJoin('raise', items, {attest});
  assert.deepEqual(replaced.reps.map(c => c.status), ['counted', 'person-touched', 'counted', 'counted']);
  assert.equal(replaced.verdict, 'PASS');
});

test('C3\'s bar: after the release the page\'s focus gone with its blur, AXFrontmost false, TextEdit in front; each failing; the premise; the page unread when it held no focus', () => {
  const ok = dialogRecord();
  assert.deepEqual(joinStatus('dialog', ok, {attest}), ['counted', null]);
  assert.deepEqual(releaseConditions(ok.reads.released, ok.reads.held, PIDS.textedit), {pageReleased: true, appNotFrontmost: true, texteditFront: true});
  const released = over => ({at: T + 2100, front: PIDS.textedit, page: page(4, {windowFocus: 2, windowBlur: 2}, false), key: KEY(false), ...over});
  const fails = [
    ['the app still believes it is active: the page keeps the focus', {page: page(4, {windowFocus: 2, windowBlur: 1}, true)}, 'pageReleased'],
    ['no blur beaconed after the release', {page: page(4, {windowFocus: 2, windowBlur: 1}, false)}, 'pageReleased'],
    ['AXFrontmost still true', {key: KEY(true)}, 'appNotFrontmost'],
    ['Chrome frontmost', {front: PIDS.chrome}, 'texteditFront'],
  ];
  for (const [what, over, condition] of fails) {
    const record = dialogRecord({reads: {released: released(over)}}), c = releaseConditions(record.reads.released, record.reads.held, PIDS.textedit);
    assert.equal(c[condition], false, what);
    assert.equal(Object.values(c).filter(v => v === false).length, 1, what);
    assert.equal(judgeJoin('dialog', evidence('dialog', dialogRecord, {0: {reads: {released: released(over)}}}), {attest}).verdict, 'FAIL', what);
  }
  // The page held no focus as the hold ended: its blur could not show, so the page's condition is unread, not failed.
  const unfocused = {held: {at: T + 1800, front: PIDS.textedit, page: page(3, {windowFocus: 1, windowBlur: 1}, false), key: KEY(true)}};
  assert.equal(releaseConditions(released({}), unfocused.held, PIDS.textedit).pageReleased, null);
  assert.equal(judgeJoin('dialog', evidence('dialog', dialogRecord, {1: {reads: unfocused}}), {attest}).verdict, 'INCOMPLETE');
  assert.equal(releaseConditions({...released({}), key: {trusted: true, ok: false, frontmost: false}}, ok.reads.held, PIDS.textedit).appNotFrontmost, null);
  const premises = [
    ['the popup did not open', dialogRecord({popup: null}), /the popup did not open/],
    ['the join shared', dialogRecord({click: clickAnswer({activationJoin: 'shared'})}), /not rearmed/],
    ['the popup still there', dialogRecord({gone: {gone: false, ms: 2000}}), /still on screen after the click/],
  ];
  for (const [what, record, why] of premises) {
    const [s, w] = joinStatus('dialog', record, {attest});
    assert.equal(s, 'premise not met', what);
    assert.match(w, why, what);
  }
  assert.match(joinStatus('dialog', dialogRecord({later: {ok: false, error: 'refused'}}), {attest})[1], /the release observation failed/);
  assert.equal(judgeJoin('dialog', evidence('dialog', dialogRecord), {attest}).verdict, 'PASS');
});

test('the touch rule: the popup\'s window is the scene\'s (its process, its bundle), so its activation is never the person\'s; Finder counts only where the item names it', () => {
  // The popup's opening activated Chrome, and Chrome (the popup on top) was frontmost at a reading: the scene's.
  const popupFront = dialogRecord({reads: {keys: {at: T + 300, front: PIDS.chrome, page: page(2, {}, false), key: KEY(true)}}});
  assert.equal(popupFront.personTouched, null);
  assert.equal(personTouchedOf({activations: [chromeActivated], fronts: [PIDS.chrome, PIDS.textedit], scenePids: SCENE_PIDS}), null);
  assert.deepEqual(personTouchedOf({activations: [chromeActivated, {kind: 'activated', bundleId: 'com.apple.Safari', at: T}], scenePids: SCENE_PIDS}), {apps: ['com.apple.Safari'], frontPids: []});
  const finderLine = {kind: 'activated', bundleId: SCENES.finder.bundleId, at: T};
  assert.deepEqual(personTouchedOf({activations: [finderLine], fronts: [PIDS.finder], scenePids: SCENE_PIDS}), {apps: [SCENES.finder.bundleId], frontPids: [PIDS.finder]}, 'Finder is no scene of the slot by default');
  assert.equal(personTouchedOf({activations: [finderLine], fronts: [PIDS.finder], scenePids: [...SCENE_PIDS, PIDS.finder], own: [SCENES.finder.bundleId]}), null);
  // The drive's rule (touchedOfItem): the watcher's summary, or its lines read with the item's own scenes.
  const stopped = summary => [start, {kind: 'task', task: '187-activations-start', result: {ok: true}}, {kind: 'task', task: '187-activations-stop', result: {ok: true, personTouched: summary}},
    {kind: 'task', task: '187-join-record', result: popupFront}];
  assert.deepEqual(touchedOfItem(stopped(null), [chromeActivated]), {count: 0, rep: false, foreign: null});
  const halfway = own => [start, {kind: 'task', task: '187-activations-start', result: {ok: true, ...(own ? {scenes: ['finder'], own: [SCENES.finder.bundleId]} : {})}}];
  assert.equal(touchedOfItem(halfway(true), [finderLine]).count, 0, 'stopped before its summary: the lines read with Finder as the item\'s');
  assert.equal(touchedOfItem(halfway(false), [finderLine]).count, 1);
  // A hold-join row's own record says the repetition was touched.
  const touched = [start, {kind: 'task', task: '187-join-record', result: {...popupFront, personTouched: {apps: ['com.apple.Safari'], frontPids: []}}}];
  assert.deepEqual([touchedOfItem(touched).count, touchedOfItem(touched).rep], [1, true]);
});

// A fake Mac for the join tasks: Chrome's windows (its run window, the popup once the page opens it), the page's
// beacons, the frontmost process, the order watcher's run.
function fakeMac({opensAfter = 2, closesAfter = 1, page = 'popup', release = []} = {}) {
  let clock = T, asks = 0, popupOpen = false, gonePolls = 0, beacons = [...release];
  const calls = [], RUN = {number: 11, bounds: {x: 24, y: 100, width: 1000, height: 700}, onScreen: true}, POPUP = {number: 555, bounds: {x: 64, y: 220, width: 360, height: 240}, onScreen: true};
  const scenes = {chrome: {id: 'chrome', pid: PIDS.chrome, window: {number: 11}}, textedit: {id: 'textedit', pid: PIDS.textedit, window: {number: 12}}, electron: {id: 'electron', pid: PIDS.electron, window: {number: 13}},
    finder: {id: 'finder', pid: PIDS.finder, window: {number: 14}}};
  let order = run(), front = PIDS.textedit;
  const d = {
    scene: id => scenes[id], state: () => ({scenes: {chrome: {page: {variant: page, url: 'http://127.0.0.1:5555/'}}}}),
    windows: pid => (pid !== PIDS.chrome ? [{number: Object.values(scenes).find(s => s.pid === pid).window.number, bounds: RUN.bounds, onScreen: true}]
      : popupOpen ? (closesAfter !== null && gonePolls > 0 && --gonePolls === 0 ? (popupOpen = false, [RUN]) : [POPUP, RUN]) : [RUN]),
    frontmost: () => ({pid: front}), pageCounters: () => (beacons.length > 1 ? beacons.shift() : beacons[0] ?? null),
    axWindow: () => KEY(front === PIDS.chrome), elementFrame: ([pid, role, name]) => { calls.push(['frame', pid, role, name]); return {trusted: true, found: true, frame: {x: 200, y: 300, width: 80, height: 24}}; },
    openPopup: async url => { calls.push(['open', url]); asks += 1; if (asks <= opensAfter) return 409; popupOpen = true; front = PIDS.chrome; return 200; },
    menu: {read: () => ({trusted: true, ok: true, selected: 1, openMenus: 0, focusedRole: 'AXMenuItem'})},
    order: {attempt: () => order}, activate: async id => { calls.push(['activate', id]); front = scenes[id].pid; order = run([...order.changes, {at: clock, prev: clock - 5, state: 'front-above'}]); },
    now: () => clock, sleep: async ms => { clock += ms; },
  };
  return {d, calls, tasks: joinTasks(d), setOrder: o => { order = o; }, setFront: p => { front = p; }, closeAfterClick: () => { gonePolls = closesAfter; }, POPUP, RUN};
}

test('the tasks: the popup opened through the page\'s server and found, its frame read inside it, its window gone after the click', async () => {
  const mac = fakeMac(), ctx = {results: {}}, tag = `${ITEMS_JOIN.dialog(0)}#0`;
  const opened = await mac.tasks['187-popup-open']([tag], ctx);
  assert.equal(opened.ok, true, opened.problem);
  assert.deepEqual([opened.asks, opened.popup.number, opened.chromeFront], [3, 555, true], 'asked until the page was waiting');
  assert.deepEqual(ctx.results[L.popup(tag)].number, 555);
  assert.deepEqual(mac.calls.filter(c => c[0] === 'open').map(c => c[1]), Array(3).fill('http://127.0.0.1:5555/'));
  const frame = await mac.tasks['187-join-frame']([tag, 'chrome', 'AXButton', 'Close popup', 'popup'], ctx);
  assert.equal(frame.ok, true, frame.problem);
  assert.deepEqual(ctx.results[L.frame(tag)], {point: {x: 240, y: 312}, window: mac.POPUP.bounds});
  mac.d.elementFrame = () => ({trusted: true, found: false, error: 'no AXButton named Close popup'});
  assert.match((await mac.tasks['187-join-frame']([tag, 'chrome', 'AXButton', 'Close popup', 'popup'], {results: {...ctx.results}})).problem, /was not found: no AXButton named Close popup/);
  mac.d.elementFrame = () => ({trusted: true, found: true, frame: {x: 900, y: 300, width: 80, height: 24}});
  assert.match((await mac.tasks['187-join-frame']([tag, 'chrome', 'AXButton', 'Close popup', 'popup'], {results: {...ctx.results}})).problem, /middle is not inside the popup window/);
  mac.closeAfterClick();
  const gone = await mac.tasks['187-popup-gone']([tag], ctx);
  assert.deepEqual([gone.ok, ctx.results[L.gone(tag)].gone], [true, true]);
  // The open refused on the counters page, and with no page waiting.
  assert.match((await fakeMac({page: 'counters'}).tasks['187-popup-open']([tag], {results: {}})).problem, /not on the popup page/);
  const never = await fakeMac({opensAfter: 1e9}).tasks['187-popup-open']([tag], {results: {}});
  assert.equal(never.ok, false);
  assert.match(never.problem, /no page took the popup's open within 5000 ms \(the server answered 409\)/);
  const still = fakeMac({closesAfter: null}), sctx = {results: {}};
  await still.tasks['187-popup-open']([tag], sctx);
  const kept = await still.tasks['187-popup-gone']([tag], sctx);
  assert.equal(kept.ok, false);
  assert.match(kept.problem, /still on screen 2000 ms after the click/);
});

test('the tasks: the release read polled until its three conditions hold, the record built from the run\'s state, a raise left over put back', async () => {
  const tag = `${ITEMS_JOIN.dialog(0)}#0`;
  const mac = fakeMac({release: [page(3, {windowFocus: 2, windowBlur: 1}, true), page(3, {windowFocus: 2, windowBlur: 1}, true), page(4, {windowFocus: 2, windowBlur: 2}, false)]});
  const ctx = {results: {[L.read(tag, 'held')]: {at: T, front: PIDS.textedit, page: page(3, {windowFocus: 2, windowBlur: 1}, true), key: KEY(true)}}};
  const read = await mac.tasks['187-join-read']([tag, 'released', 'chrome', 'release'], ctx);
  assert.deepEqual(releaseConditions(read, ctx.results[L.read(tag, 'held')], PIDS.textedit), {pageReleased: true, appNotFrontmost: true, texteditFront: true});
  assert.equal(read.polls, 3);
  assert.ok(read.settledMs < RELEASE_SETTLE_MS);
  const stuck = await fakeMac({release: [page(3, {windowFocus: 2, windowBlur: 1}, true)]}).tasks['187-join-read']([tag, 'released', 'chrome', 'release'], {results: {...ctx.results}});
  assert.equal(stuck.settledMs, RELEASE_SETTLE_MS, 'read until the bound when the page keeps its focus');
  // The record: the run's watchers' state (./item-187.mjs keeps it in ctx.r187), the popup's opening seen and the scene's.
  Object.assign(ctx.results, {[L.keys(tag)]: holderAnswer(), [L.click(tag)]: clickAnswer(), [L.release(tag)]: {ok: true, value: {inFront: true}, meta: {}},
    [L.read(tag, 'before')]: {at: T - 10, front: PIDS.textedit, page: page(2, {}, false), key: KEY()}, [L.popup(tag)]: {number: 555, bounds: mac.POPUP.bounds, ms: 300, chromeFront: true}, [L.gone(tag)]: {gone: true, ms: 50}});
  ctx.r187 = {order: {pid: 77}, itemActivations: [chromeActivated], own: [], ownScenes: []};
  const record = await mac.tasks['187-join-record']([tag, 'dialog', '0'], ctx);
  assert.deepEqual([record.kind, record.item, record.rep, record.personTouched, record.popup.number, record.click.join, record.texteditPid], ['dialog', ITEMS_JOIN.dialog(0), 0, null, 555, 'rearmed', PIDS.textedit]);
  assert.deepEqual(Object.keys(record.reads), ['before', 'held', 'released']);
  assert.deepEqual(joinStatus('dialog', record, {attest}), ['counted', null]);
  // Between C4's repetitions: the driven window left above the user's is put back.
  const tidy = fakeMac(), tctx = {results: {}, r187: {order: {pid: 77}}};
  tidy.setOrder(run([{at: T + 10, prev: T + 5, state: 'back-above'}]));
  const put = await tidy.tasks['187-join-tidy']([`${ITEMS_JOIN.inframe}#0`, 'textedit-behind-finder'], tctx);
  assert.deepEqual([put.ok, put.restored, put.state], [true, true, 'front-above']);
  assert.deepEqual(tidy.calls.filter(c => c[0] === 'activate'), [['activate', 'finder']]);
  assert.equal((await tidy.tasks['187-join-tidy']([`${ITEMS_JOIN.inframe}#1`, 'textedit-behind-finder'], tctx)).restored, false);
  const menu = await tidy.tasks['187-join-menu']([`${ITEMS_JOIN.menu}#0`], tctx);
  assert.deepEqual([menu.ok, menu.opened, tctx.results[L.menuRead(`${ITEMS_JOIN.menu}#0`)].opened], [true, true, true]);
  const point = await tidy.tasks['187-join-point']([ITEMS_JOIN.inframe, 'textedit', '0.25', '0.5'], tctx);
  assert.deepEqual(tctx.results[L.frame(ITEMS_JOIN.inframe)].point, {x: 24 + 250, y: 100 + 350});
  assert.equal(point.ok, true);
});

test('the activation watcher names an item\'s further scenes; the relaunch comes up on the page asked; the placement takes another pair', async () => {
  const lines = [{kind: 'activated', bundleId: SCENES.finder.bundleId, at: T}], writes = [];
  const tasks = item187Tasks({activations: {start: () => ({}), stop: () => lines}, write: (name, text) => writes.push(name), scene: id => ({pid: PIDS[id], window: {number: 1}})});
  const ctx = {results: {}};
  assert.deepEqual(await tasks['187-activations-start'](['187-iso-inframe', 'finder'], ctx), {ok: true, item: '187-iso-inframe', scenes: ['finder'], own: [SCENES.finder.bundleId]});
  assert.equal((await tasks['187-activations-stop'](['187-iso-inframe'], ctx)).personTouched, null);
  const plain = {results: {}};
  await tasks['187-activations-start'](['187-iso-menu'], plain);
  assert.deepEqual((await tasks['187-activations-stop'](['187-iso-menu'], plain)).personTouched, {apps: [SCENES.finder.bundleId], frontPids: []});
  let variant = null;
  const relaunch = item187Tasks({scene: () => ({pid: 1, window: {number: 2}}), scenes: args => { if (args[0] === 'up') variant = args[3]; return args[0] === 'down' ? {down: true} : {pid: 9, window: {number: 3}}; },
    state: () => ({scenes: {chrome: {page: {variant}}}}), windows: () => [{number: 3, bounds: {x: 0, y: 0, width: 800, height: 600}, onScreen: true}], now: () => T, sleep: async () => {}});
  const up = await relaunch['187-relaunch'](['187-iso-dialog-0', 'chrome', 'popup']);
  assert.deepEqual([up.ok, up.page, variant], [true, 'popup', 'popup']);
  assert.equal((await relaunch['187-relaunch'](['187-iso-raise-0', 'chrome'])).ok, true);
  assert.equal(variant, 'counters');
});

test('the runner: a session\'s scene on the window a task found, else the item stops', () => {
  const record = {id: 'chrome', pid: 201, at: 5, window: {number: 11, title: 'x'}};
  assert.equal(sessionRecord(record, undefined, {}), record);
  assert.deepEqual(sessionRecord(record, () => 555, {}), {...record, window: {number: 555, title: 'x'}});
  assert.throws(() => sessionRecord(record, () => null, {}), /the chrome scene's window for this session was not found/);
});

test('C4\'s measures, no verdict: ordered, the repairs and their times, out of place after the hold, the joins; NOT RUN when left out', () => {
  const tag = k => `${ITEMS_JOIN.inframe}#${k}`;
  const rec = (k, over) => joinRecord({kind: 'inframe', tag: tag(k), rep: k, holder: holderAnswer({activationJoin: 'fresh', activationClickKind: {kind: 'atPoint', when: 'early'}}),
    click: clickAnswer({activationJoin: 'shared', delivery: {restores: 1, restoreLatencyMs: 18}}), later: {ok: true, value: {}, meta: {afterActionRepairs: {repairs: 1, actions: [{postedAt: T + 510, repairs: 1, latencyMs: 40}]}}},
    reads: {before: {at: T, front: PIDS.finder}, after: {at: T + 2000, front: PIDS.finder}}, run: run([{at: T + 520, prev: T + 515, state: 'back-above'}, {at: T + 700, prev: T + 695, state: 'front-above'}]),
    scenePids: [...SCENE_PIDS, PIDS.finder], own: [SCENES.finder.bundleId], activations: [{kind: 'activated', bundleId: SCENES.finder.bundleId, at: T - 10}], ...over});
  const items = {[ITEMS_JOIN.inframe]: [start, ...[0, 1, 2].map(k => ({kind: 'task', task: '187-join-record', result: rec(k)})), {kind: 'task', task: '187-order-stop', result: STOP}]};
  const [menu, inframe] = judgeTail(items);
  assert.equal(menu.ran, false);
  assert.equal(inframe.reps.length, TAIL_REPS);
  assert.deepEqual(inframe.reps[0], {rep: 0, sent: true, join: 'shared', holderJoin: 'fresh', holderClick: {kind: 'atPoint', when: 'early'}, ordered: true, raises: 1, restores: 1,
    repairedAfterRelease: false, restoreLatencyMs: 18, postToReleaseMs: 50, postToRaiseMs: 10, afterAction: {repairs: 1, latencyMs: 40}, outOfPlace: true, unguarded: 0, undecided: 0,
    menuShown: undefined, personTouched: null});
  const md = tailMarkdown([menu, inframe]).join('\n');
  assert.match(md, /## C4: #279's cases \(measured, no verdict\)/);
  assert.match(md, /### C4 \(b\)[^\n]*\n\nNOT RUN/);
  assert.match(md, /\| 1 \| yes \| fresh \/ atPoint early \| shared \| yes \(1\) \| 1 \(18\) \| no \| 1 \(40\) \| 50 \| yes \| 0 \| 0 \|/);
  assert.equal(judgeTail({...items, [ITEMS_JOIN.inframe]: [...items[ITEMS_JOIN.inframe].slice(0, -1), {kind: 'task', task: '187-order-stop', result: {ok: false}}]})[1].reps[0].ordered, null, 'a watcher record not whole reads unread');
});

test('the verdict file: C2 and C3 with their own verdicts beside C1\'s, unchanged by theirs; C4 measured; the CLI\'s dry run with and without the tail', async t => {
  const swaps = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [`187-iso-swap-${n}`, [start, {kind: 'task', task: '187-iso-swap', result: {ok: true, half: [1, 4, 5, 7].includes(n) ? 'after' : 'before', saved: [1, 4, 5, 7].includes(n) ? BUILD : CONTROL.build}},
    {kind: 'task', task: '187-iso-attest', result: {ok: true}}]]));
  const items = {...swaps, ...evidence('raise', raiseRecord, {1: {click: clickAnswer({delivery: {restores: 2}})}}), ...evidence('dialog', dialogRecord)};
  const j = judgeIsolate(items);
  assert.deepEqual([j.raise.verdict, j.dialog.verdict, j.verdict], ['FAIL', 'PASS', 'INCONCLUSIVE'], 'C1 has no repetition here: its own verdict, whatever C2\'s and C3\'s');
  const md = isolateMarkdown(j);
  assert.match(md, /- C2, the keys-then-click row: \*\*FAIL\*\*/);
  assert.match(md, /- C3, the dialog variant: \*\*PASS\*\*/);
  assert.match(md, /## C2: the keys-then-click raise row on background Chrome: FAIL/);
  assert.match(md, /## C3: the dialog variant, a popup closed by its own button: PASS/);
  assert.match(md, /\| 2 \| 187-iso-raise-1 \| counted \| fresh \/ inertOutside offset early \| rearmed \/ action consumedByAction \| yes \| yes \| no \| yes \| yes \| 0 \| 2 \| 0 \|/);
  assert.match(md, /\| 1 \| 555 \| yes \| yes \(80\) \| yes \| no \| 1 \| no \| yes \| 120 \|/);
  assert.match(md, /## C4: #279's cases/);
  assert.equal(joinMarkdown(j.raise).at(-1), '');
  assert.equal(judgeIsolate({...items, ...evidence('raise', raiseRecord)}).verdict, j.verdict, 'C2 never moves the isolating verdict');
  const out = join(scratch(t), 'never-made');
  const full = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet']));
  assert.match(full.text, /dry run: block 7, AFTER only \(188, C2, C3\): \d+ steps/);
  assert.match(full.text, /dry run: the tail \(C4b, C4c\): \d+ steps/);
  const skipped = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet', '--no-tail']));
  assert.ok(!skipped.text.includes('the tail'), '--no-tail leaves the tail out');
  const steps = plan => plan.reduce((n, p) => n + p.steps.length, 0);
  assert.match(skipped.text, new RegExp(`dry run: ${steps(isolatePlan({tail: false}))} steps, nothing sent`));
  assert.equal(steps(isolatePlan()) - steps(isolatePlan({tail: false})), steps([...menuPlan(), ...inframePlan()]));
});
