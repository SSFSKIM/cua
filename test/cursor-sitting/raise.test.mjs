// #200's live check (scripts/cursor-sitting/raise.mjs): the delivery predicates, the watcher's record and what it says
// of each call, the judge, the scene's placement and arrangement, and the steps, on recorded shapes; nothing is driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';
import {alignmentFlipped, aPoint, arrangementProblem, buttonProblem, callWatch, caretMoved, CASES, cDrag, counterDeltas, DOCUMENT_TEXT, eRow, judgeCase, LABELS,
  lineAt, lossesIn, orderAttempt, orderLines, placementPlan, placeSteps, plannedPoints, pressedOnce, raiseMarkdown, raisesIn, raiseSteps, selectionMade, spread,
  stateAt, finderRowAlone, wordSelected} from '../../scripts/cursor-sitting/raise.mjs';
import {scenesOf, targetProblem} from '../../scripts/cursor-sitting/target-guard.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-200-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; process.stdout.write = () => true; try { return await run(); } finally { process.stdout.write = write; } };
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const caret = location => ({location, length: 0});

test('a click is delivered when the range is a caret other than the one before', () => {
  assert.deepEqual(caretMoved(caret(10), caret(25)), {delivered: true, why: null});
  assert.match(caretMoved(caret(10), caret(10)).why, /stayed at 10/);
  assert.match(caretMoved(caret(10), {location: 10, length: 4}).why, /not a caret/);
  assert.match(caretMoved(null, caret(3)).why, /before was not read/);
  assert.match(caretMoved(caret(3), null).why, /not read/);
});

test('a drag is delivered by a new, non-empty selection', () => {
  assert.equal(selectionMade(caret(5), {location: 5, length: 12}).delivered, true);
  assert.match(selectionMade({location: 5, length: 12}, {location: 5, length: 12}).why, /the one before/);
  assert.match(selectionMade(caret(5), caret(9)).why, /empty/);
});

test('a double click is delivered by exactly one word of the document, other than the one before', () => {
  const line = lineAt(DOCUMENT_TEXT.indexOf('Line 23'));
  assert.deepEqual([line.text, DOCUMENT_TEXT.slice(line.start, line.end)], ['Line 23', 'Line 23']);
  const word = {location: line.start, length: 4};
  assert.equal(wordSelected(caret(0), word).delivered, true);
  assert.equal(wordSelected(caret(0), {location: line.start + 5, length: 2}).delivered, true, 'the line number is a word too');
  assert.match(wordSelected(caret(0), {location: line.start, length: 3}).why, /part of a word/);
  assert.match(wordSelected(caret(0), {location: line.start, length: 7}).why, /not one word/);
  assert.match(wordSelected(word, word).why, /the one before/);
  assert.equal(wordSelected(caret(0), {location: 0, length: 3}).delivered, true, 'the title line starts with "cua"');
});

test('a caret at a line\'s end is in that line; an offset past the text names none', () => {
  const first = lineAt(0);
  assert.equal(first.text, 'cua scene document');
  assert.equal(lineAt(first.end).index, 0);
  assert.equal(lineAt(first.end + 1).index, 1);
  assert.equal(lineAt(DOCUMENT_TEXT.length + 1), null);
});

test('the alignment half reads the button its click chose; Finder\'s row alone; the fixture\'s count up by one', () => {
  const click = clicked => ({ok: true, value: {clicked}}), read = (center, left) => ({ok: true, value: {center, left}});
  assert.equal(alignmentFlipped(click('align center'), read('1', '0')).delivered, true);
  assert.equal(alignmentFlipped(click('align left'), read('0', '1')).delivered, true);
  assert.match(alignmentFlipped(click('align center'), read('0', '1')).why, /align center reads 0/);
  assert.match(alignmentFlipped({ok: false, error: 'refused'}, read('1', '0')).why, /element click failed: refused/);
  assert.equal(finderRowAlone({ok: true, value: {rowFound: true, selected: 1, only: true}}).delivered, true);
  assert.match(finderRowAlone({ok: true, value: {rowFound: true, selected: 2, only: false}}).why, /2 row\(s\) selected/, 'a ⌘-click adds to a selection: not this click\'s meaning');
  const pressed = n => ({ok: true, value: {pressed: n}});
  assert.equal(pressedOnce(pressed(3), pressed(4)).delivered, true);
  assert.match(pressedOnce(pressed(3), pressed(3)).why, /from 3 to 3/);
});

// The watcher's lines as order-watch.swift writes them (a run of 2026-10-31 on the MacBook, then a raise and its restore).
const WATCH = [
  '{"at":900,"back":2,"front":1,"intervalMs":5,"kind":"start","pid":77,"realtime":true,"state":"front-above"}',
  '{"at":1055,"kind":"order","prev":1050,"sample":32,"state":"back-above"}',
  '{"at":1065,"kind":"order","prev":1060,"sample":34,"state":"front-above"}',
  '{"at":3000,"kind":"end","lastRead":2998,"lateSamples":0,"maxGapMs":9.5,"samples":420,"state":"front-above","why":"SIGTERM"}',
].join('\n');

test('the watcher\'s file holds every attempt; a run is found by its pid, and a half-written line is skipped', () => {
  const text = `{"at":1,"kind":"start","pid":5,"state":"front-above"}\n{"at":2,"kind":"end","samples":3}\n${WATCH}\n{"at":3001,"kind":"ord`;
  const lines = orderLines(text);
  assert.equal(lines.length, 6);
  assert.equal(orderAttempt(lines, 5).end.samples, 3);
  const last = orderAttempt(lines);
  assert.equal(last.start.pid, 77);
  assert.deepEqual(raisesIn(last).map(c => c.at), [1055]);
  assert.equal(lossesIn(last).length, 0);
  assert.equal(stateAt(last, 1060), 'back-above');
  assert.equal(stateAt(last, 500), 'front-above', 'before any change, the first reading');
  assert.equal(orderAttempt(lines, 999), null);
});

// A watcher run with these changes, each seen by a read 5 ms after the one before unless `prev` says otherwise.
const run = (changes, {end = true} = {}) => orderAttempt(orderLines([WATCH.split('\n')[0],
  ...changes.map(([at, state, prev = at - 5]) => JSON.stringify({at, kind: 'order', prev, state})), ...(end ? [WATCH.split('\n')[3]] : [])].join('\n')));

test('a raise past the release that the engine repaired after it, inside its window, is a flash, not late', () => {
  const meta = {actionInterval: {startedAt: 1000, endedAt: 1001}, delivery: {holdStartedAt: 960, releasedAt: 1060, repairedAfterRelease: true, raiseLeft: false}};
  assert.equal(callWatch({meta, attempt: run([[1040, 'back-above'], [1120, 'front-above']]), from: 1000, until: 2000}).flash, 1);
  assert.equal(callWatch({meta, attempt: run([[1040, 'back-above'], [1120, 'front-above']]), from: 1000, until: 2000}).outlived, 0);
  const unrepaired = {...meta, delivery: {...meta.delivery, repairedAfterRelease: false}};
  assert.equal(callWatch({meta: unrepaired, attempt: run([[1040, 'back-above'], [1120, 'front-above']]), from: 1000, until: 2000}).outlived, 1);
});

test('a raise the guard undoes before its release is neither late nor unguarded; after it, or outliving it, is late', () => {
  const meta = {actionInterval: {startedAt: 1050, endedAt: 1052}, delivery: {restores: 1, holdStartedAt: 1040, releasedAt: 1080}};
  const undone = callWatch({meta, attempt: run([[1055, 'back-above'], [1065, 'front-above']]), from: 1000, until: 2000});
  assert.deepEqual(undone, {guarded: true, raises: 1, postToRaiseMs: 5, postToReleaseMs: 30, late: 0, outlived: 0, undecided: 0, unguarded: 0, flash: 0});
  assert.equal(callWatch({meta, attempt: run([[1055, 'back-above'], [1065, 'front-above'], [1300, 'back-above']]), from: 1000, until: 2000}).late, 1);
  assert.equal(callWatch({meta, attempt: run([[1055, 'back-above'], [1093, 'front-above']]), from: 1000, until: 2000}).outlived, 0,
    'the last read that saw it (1088) is inside the 10 ms grace, the next shows it gone');
  assert.equal(callWatch({meta, attempt: run([[1055, 'back-above'], [1100, 'front-above']]), from: 1000, until: 2000}).outlived, 1, 'a read at 1095 still saw it');
  const bare = callWatch({meta: {}, attempt: run([[1055, 'back-above'], [1065, 'front-above']]), from: 1000, until: 2000});
  assert.deepEqual([bare.guarded, bare.unguarded], [false, 1], 'a call with no guard (an element action, the vendor\'s click): every raise is seen');
  assert.equal(callWatch({meta, attempt: run([[2500, 'back-above']]), from: 1000, until: 2000}).raises, 0, 'another call\'s span');
});

test('a raise before the hold began was on the display, whatever the cell\'s final action reports: unguarded', () => {
  // An observation, then the click: the cell keeps the click's meta, its hold 1400–1450; the raise at 1100–1200 came first.
  const meta = {actionInterval: {startedAt: 1410, endedAt: 1412}, delivery: {restores: 0, holdStartedAt: 1400, releasedAt: 1450}};
  const w = callWatch({meta, attempt: run([[1100, 'back-above'], [1200, 'front-above']]), from: 1000, until: 2000});
  assert.deepEqual([w.unguarded, w.late, w.outlived], [1, 0, 0]);
  const straddling = callWatch({meta, attempt: run([[1420, 'back-above', 1360], [1430, 'front-above']]), from: 1000, until: 2000});
  assert.equal(straddling.undecided, 1, 'a gap reaching back before the hold leaves its start unknown');
});

test('a raise outlives the hold only when a read past the grace shows it; a gap across the grace leaves it undecided', () => {
  const meta = {actionInterval: {startedAt: 1050, endedAt: 1052}, delivery: {restores: 1, holdStartedAt: 1040, releasedAt: 1080}};
  const gap = callWatch({meta, attempt: run([[1055, 'back-above'], [1100, 'front-above', 1078]]), from: 1000, until: 2000});
  assert.deepEqual([gap.outlived, gap.late, gap.undecided], [0, 0, 1], 'reads at 1078 and 1100: nothing shows the order at 1090');
  const left = callWatch({meta, attempt: run([[1055, 'back-above']]), from: 1000, until: 2000});
  assert.equal(left.outlived, 1, 'never undone, and the watcher read on to its end');
  assert.equal(callWatch({meta, attempt: run([[1055, 'back-above']], {end: false}), from: 1000, until: 2000}).undecided, 1, 'the record stops: undecided');
  const lastRead = orderAttempt(orderLines([WATCH.split('\n')[0], '{"at":1055,"kind":"order","prev":1050,"state":"back-above"}',
    '{"at":1100,"kind":"end","lastRead":1085,"maxGapMs":9.5,"samples":10,"state":"back-above","why":"SIGTERM"}'].join('\n')));
  const unread = callWatch({meta, attempt: lastRead, from: 1000, until: 2000});
  assert.deepEqual([unread.outlived, unread.undecided], [0, 1], 'the end record was written at 1100, but its last read was at 1085: nothing shows the order past 1090');
});

test('a sample a watcher gap leaves undecided makes the case incomplete, reported apart from raises', () => {
  const order = orderLines([WATCH.split('\n')[0], '{"at":1055,"kind":"order","prev":1050,"state":"back-above"}',
    '{"at":1100,"kind":"order","prev":1078,"state":"front-above"}', WATCH.split('\n')[3]].join('\n'));
  const j = judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order});
  assert.deepEqual([j.verdict, j.late, j.undecided], ['INCOMPLETE', 0, 1]);
  assert.deepEqual(j.undecidedSamples, [0]);
  assert.match(j.why, /1 raise\(s\) undecided by a gap in the watcher's reads \(sample 0\)/);
  assert.match(raiseMarkdown([j]), /undecided/);
});

test('a case that did not end cleanly, or whose watcher stopped before its tail, never passes', () => {
  const tailDeath = caseRows();
  tailDeath.splice(tailDeath.findIndex(r => r.kind === 'close'), 2, {kind: 'stopped', at: 2600, error: 'raise-check refused: the watcher is no longer running'});
  const died = judgeCase({kase: 'a', engine: 'cua', rows: tailDeath, order: ORDER});
  assert.equal(died.verdict, 'INCOMPLETE', 'every delivery row is there, but the case stopped in its tail');
  assert.match(died.why, /stopped: raise-check refused/);
  const early = orderLines(WATCH.replace('{"at":3000,', '{"at":2500,'));
  const short = judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: early});
  assert.deepEqual([short.verdict, short.why], ['INCOMPLETE', 'the watcher ended before the case\'s tail (2500 against 2650)']);
});

test('spread gives min, median, p95 and max', () => {
  assert.deepEqual(spread([30, 10, 20, null]), {n: 3, min: 10, median: 20, p95: 30, max: 30});
  assert.deepEqual(spread([]), {n: 0});
});

// Case a on cua, two samples, as the runner records it: each click guarded, the first raising and undone at once.
function caseRows({delivery = i => ({restores: i === 0 ? 1 : 0, holdStartedAt: 1040 + i * 1000, releasedAt: 1080 + i * 1000, capped: false, raiseLeft: false, guardMs: 20, screenHoldMs: 30}), delivered = [true, true], route = '3', stop = false} = {}) {
  const rows = [{kind: 'start', at: 910}, {kind: 'series', series: ['200-a-cua'], counts: {samples: 2}, at: 911}, {kind: 'task', task: 'arrangement', result: {ok: true}, at: 912},
    {kind: 'task', task: 'order-watch-start', result: {ok: true, pid: 77}, at: 920}, {kind: 'open', at: 990}, {kind: 'task', task: 'text-view', result: {ok: true, range: caret(1)}, at: 995}];
  for (const i of [0, 1]) {
    rows.push({kind: 'cell', label: LABELS.action('a', i, 'click'), sample: {case: 'a', i, part: 'click'}, startedAt: 1000 + i * 1000, at: 1100 + i * 1000, ok: true, route,
      meta: {activationClick: 'posted', activationGuardMs: 40, actionInterval: {startedAt: 1050 + i * 1000, endedAt: 1052 + i * 1000}, ...(delivery(i) ? {delivery: delivery(i)} : {})}});
    rows.push({kind: 'task', task: 'deliver', result: {ok: delivered[i], i, part: 'click', delivered: delivered[i], why: delivered[i] ? null : 'the caret stayed at 1'}, at: 1500 + i * 1000});
    if (stop && i === 0) { rows.push({kind: 'stopped', error: 'raise-check refused: the textedit window stays above Chrome\'s'}); return rows; }
  }
  rows.push({kind: 'task', task: 'raise-check', args: ['a', 'end'], result: {ok: true}, at: 2600}, {kind: 'close', at: 2650}, {kind: 'task', task: 'order-watch-stop', result: {ok: true}, at: 3001});
  return rows;
}
const ORDER = orderLines(WATCH);

test('the judge passes a case delivered on every sample whose raises the guard undid inside its hold', () => {
  const j = judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: ORDER});
  assert.equal(j.verdict, 'PASS', j.why);
  assert.deepEqual([j.samples, j.delivered, j.raises, j.restores, j.late, j.unguarded, j.raiseLeft, j.capped], [2, 2, 1, 1, 0, 0, 0, 0]);
  assert.deepEqual(j.postToRaiseMs, {n: 1, min: 5, median: 5, p95: 5, max: 5});
  assert.equal(j.postToReleaseMs.n, 2);
  assert.deepEqual(j.routes, {'click 3': 2});
  assert.equal(j.guarded, '2 of 2');
});

test('the judge fails a late raise, a raise left, an unguarded raise or an undelivered sample, and records the vendor\'s', () => {
  const late = orderLines(`${WATCH.split('\n').slice(0, 3).join('\n')}\n{"at":1200,"kind":"order","prev":1195,"state":"back-above"}\n{"at":1210,"kind":"order","prev":1205,"state":"front-above"}\n${WATCH.split('\n')[3]}`);
  assert.equal(judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: late}).late, 1);
  assert.equal(judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: late}).verdict, 'FAIL');
  const left = judgeCase({kase: 'a', engine: 'cua', rows: caseRows({delivery: i => ({restores: 0, holdStartedAt: 1040 + i * 1000, releasedAt: 1080 + i * 1000, capped: true, raiseLeft: i === 1})}), order: ORDER});
  assert.deepEqual([left.verdict, left.raiseLeft, left.capped], ['FAIL', 1, 2]);
  const bare = judgeCase({kase: 'a', engine: 'cua', rows: caseRows({delivery: () => null}), order: ORDER});
  assert.deepEqual([bare.verdict, bare.unguarded], ['FAIL', 1]);
  assert.match(judgeCase({kase: 'a', engine: 'cua', rows: caseRows({delivered: [true, false]}), order: ORDER}).why, /1 half or sample\(s\) not delivered/);
  const vendor = judgeCase({kase: 'a', engine: 'vendor', rows: caseRows({delivery: () => null, route: null}), order: ORDER});
  assert.deepEqual([vendor.verdict, vendor.wouldBe], ['recorded', 'FAIL']);
});

test('a case cut short, or a watcher record with no end, is incomplete, never a pass', () => {
  const short = judgeCase({kase: 'a', engine: 'cua', rows: caseRows({stop: true}), order: ORDER});
  assert.equal(short.verdict, 'INCOMPLETE');
  assert.match(short.why, /1 of 2 samples \(raise-check refused/);
  const noEnd = judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: ORDER.slice(0, 3)});
  assert.deepEqual([noEnd.verdict, noEnd.why], ['INCOMPLETE', 'the watcher\'s record has no end']);
  const gappy = orderLines(WATCH.replace('"maxGapMs":9.5', '"maxGapMs":80'));
  assert.match(judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: gappy}).why, /longest gap was 80 ms/);
});

test('the fixture\'s counters are summed over each click\'s before and after; the report prints the case', () => {
  const read = (i, when, counts) => ({kind: 'task', task: 'fixture-counters', result: {ok: true, i, when, counters: {seq: 1, at: 1, counts}}});
  const deltas = counterDeltas([read(0, 'before', {windowFocus: 1, appDidBecomeActive: 2}), read(0, 'after', {windowFocus: 2, appDidBecomeActive: 4}),
    read(1, 'before', {windowFocus: 2, appDidBecomeActive: 4}), read(1, 'after', {windowFocus: 2, appDidBecomeActive: 5})]);
  assert.deepEqual(deltas, {sum: {windowFocus: 1, appDidBecomeActive: 3}, samples: {windowFocus: 1, appDidBecomeActive: 2}});
  const md = raiseMarkdown([judgeCase({kase: 'a', engine: 'cua', rows: caseRows(), order: ORDER})]);
  assert.match(md, /\| a: a coordinate click in TextEdit's text.* \| cua \| 2 \/ 2 \| 2 \| 1 \| 1 \| 0 \(0\) \| 0 \| 0 \| 0 \| 0 \| 0 \| \*\*PASS\*\* \|/);
  assert.match(md, /\| a \| cua \| 5\.0 \/ 5\.0 \/ 5\.0 \/ 5\.0 \(1\) \| 30\.0 \/ 30\.0 \/ 30\.0 \/ 30\.0 \(2\) \| 2 of 2 \|/);
});

test('the kit places TextEdit at the left and Chrome over its right half; the arrangement checks order and the points', () => {
  const te = {x: 300, y: 200, width: 600, height: 500}, chrome = {x: 80, y: 60, width: 1000, height: 760};
  const plan = placementPlan({back: te, front: chrome, extras: [{width: 800, height: 400}]});
  assert.deepEqual(plan.back, {x: 24, y: 260}, 'centred under the menu bar: 37 + (945 - 500) / 2');
  assert.deepEqual(plan.front, {x: 324, y: 130}, 'from TextEdit\'s middle, centred on its height');
  assert.deepEqual(plan.extras, [{x: 24, y: 260}]);
  const back = {...te, ...plan.back}, front = {...chrome, ...plan.front};
  const list = [{number: 1, bounds: front}, {number: 9, bounds: {x: 0, y: 0, width: 10, height: 10}}, {number: 2, bounds: back}];
  const records = {front: {id: 'chrome', pid: 10, number: 1}, back: {id: 'textedit', pid: 20, number: 2}};
  assert.equal(arrangementProblem({frontmost: {pid: 10}, list, ...records, points: plannedPoints('a', 40)}), null);
  assert.equal(arrangementProblem({frontmost: {pid: 10}, list, ...records, points: plannedPoints('c', 20)}), null);
  assert.match(arrangementProblem({frontmost: {pid: 20}, list, ...records}), /frontmost app is 20/);
  assert.match(arrangementProblem({frontmost: {pid: 10}, list: [list[2], list[0]], ...records}), /textedit scene's run window is above/);
  assert.match(arrangementProblem({frontmost: {pid: 10}, list: [list[0]], ...records}), /run window 2 is not on screen/);
  const narrow = [{number: 1, bounds: {...front, x: back.x + back.width * 0.9}}, list[2]];
  assert.match(arrangementProblem({frontmost: {pid: 10}, list: narrow, ...records, points: plannedPoints('a', 2)}), /\(0\.75, .*\) of the textedit window is not under the chrome window/);
});

test('the fixture button\'s frame must be read and lie in its window', () => {
  const w = {x: 24, y: 200, width: 720, height: 560};
  assert.equal(buttonProblem({trusted: true, found: true, frame: {x: 40, y: 480, width: 110, height: 22}}, w), null);
  assert.match(buttonProblem({trusted: false, found: false}, w), /not trusted for Accessibility/);
  assert.match(buttonProblem({trusted: true, found: true, frame: {x: 900, y: 480, width: 110, height: 22}}, w), /not inside/);
});

test('the samples move the caret every time, alternate sides, and keep clear of b\'s line', () => {
  const ys = Array.from({length: 40}, (_, i) => aPoint(i).fraction[1]);
  assert.equal(new Set(ys.slice(0, 20)).size, 20);
  for (let i = 1; i < 40; i++) {
    assert.ok(Math.abs(ys[i] - ys[i - 1]) >= 0.17, `a ${i}`);
    assert.notEqual(aPoint(i).covered, aPoint(i - 1).covered);
    assert.notEqual(eRow(i), eRow(i - 1));
    assert.notEqual(cDrag(i).from[1], cDrag(i - 1).from[1]);
  }
  assert.ok(ys.every(y => y >= 0.3 && y <= 0.8));
});

test('every case\'s steps: each cell names its scene, each action\'s label is the one its delivery reads, the watcher spans it', () => {
  for (const kase of Object.keys(CASES)) {
    const steps = raiseSteps(kase, {engine: 'cua', samples: 3});
    const runs = steps.filter(s => s.run);
    for (const s of runs) assert.deepEqual(scenesOf(typeof s.cell === 'function' ? s.cell({}) : s.cell), [CASES[kase].back], s.label);
    assert.equal(new Set(runs.map(s => s.label)).size, runs.length, `${kase}: labels are unique`);
    for (const d of steps.filter(s => s.task === 'deliver')) {
      const [, , i, part] = d.args;
      assert.ok(runs.some(s => s.label === LABELS.action(kase, Number(i), part)), `${kase} ${i} ${part}`);
    }
    const tasks = steps.map(s => s.task ?? (s.open ? 'open' : s.close ? 'close' : null));
    assert.ok(tasks.indexOf('arrangement') < tasks.indexOf('order-watch-start') && tasks.indexOf('order-watch-start') < tasks.indexOf('open'));
    assert.ok(tasks.indexOf('close') < tasks.indexOf('order-watch-stop'));
    assert.equal(steps.filter(s => s.task === 'deliver').length, 3 * CASES[kase].halves.length);
    assert.ok(steps.filter(s => s.task === 'raise-check').every(s => s.required));
  }
  assert.deepEqual(placeSteps({extras: ['finder']}).map(s => s.task).filter(Boolean), ['raise-place', 'activate']);
});

test('Finder\'s system process passes the target guard by running, its window in front', () => {
  const finder = {id: 'finder', pid: 400, window: {number: 31}};
  const win = number => ({number, bounds: {x: 0, y: 0, width: 600, height: 400}, onScreen: true});
  assert.equal(targetProblem(finder, {launchAt: 1_790_000_000_000, windows: [win(31)]}), null);
  assert.match(targetProblem(finder, {launchAt: null, windows: [win(31)]}), /no longer running/);
  assert.match(targetProblem(finder, {launchAt: 1, windows: [win(32), win(31)]}), /front window is window 32/);
  assert.match(targetProblem({...finder, id: 'textedit'}, {launchAt: 1, windows: [win(31)]}), /names no launch/);
});

test('raise drive --dry-run prints every case\'s steps and writes nothing; judge writes item-200.md', async t => {
  const out = join(scratch(t), 'evidence');
  assert.equal(await quietly(() => main(['raise', 'drive', '--engine', 'vendor', '--out', out, '--dry-run', '--quiet'])), 0);
  assert.equal(existsSync(out), false);
  await assert.rejects(main(['raise', 'drive', '--engine', 'other', '--out', out, '--dry-run']), /--engine cua or --engine vendor/);
  await assert.rejects(main(['raise', 'drive', '--engine', 'cua', '--case', 'a,z', '--out', out, '--dry-run']), /--case takes/);
  const dir = scratch(t);
  writeFileSync(join(dir, 'item-200-a-cua.jsonl'), jsonl(caseRows()));
  writeFileSync(join(dir, 'item-200-a-cua-order.jsonl'), `${WATCH}\n`);
  writeFileSync(join(dir, 'item-200-a-vendor.jsonl'), jsonl(caseRows({delivery: () => null})));
  writeFileSync(join(dir, 'item-200-a-vendor-order.jsonl'), `${WATCH}\n`);
  assert.equal(await quietly(() => main(['raise', 'judge', '--out', dir])), 0, 'the vendor\'s rows are not judged');
  const md = readFileSync(join(dir, 'item-200.md'), 'utf8');
  assert.match(md, /\| cua \| 2 \/ 2 .*\*\*PASS\*\*/);
  assert.match(md, /\| vendor \| 2 \/ 2 .*recorded \(would be FAIL\)/);
});
