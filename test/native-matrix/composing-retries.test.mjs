// Ruling 1229 (item G): the composing groups' instrumentation and recorded retry. Full sitting C's failing composing
// groups failed whole at their one composition check, the key reaching neither the user window's field nor its input
// method, with emptyField's setValue("") through the engine under test the suspect. Each attempt now records what
// settles the mechanism (whether marked text was open in the field before and after that emptying, by the harness's
// own no-text reader; the probe's post; what the field and the source read after the key), a group that does not
// compose redoes its setup up to three attempts in all, and the summary counts the retries per lane and per group,
// flagging a lopsided pattern for the owner.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {composingRetriesOf, renderComposingRetries} from '../../scripts/native-matrix/composing-retries.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {focusedText, markedOf} from '../../scripts/native-matrix/matrix-device.mjs';
import {EMPTY_HASH, emptyField, emptyFieldCell} from '../../scripts/native-matrix/probe-plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {COMPOSING_ATTEMPTS} from '../../scripts/native-matrix/unicode-run.mjs';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {matrixSteps, runWith} from './run-doubles.mjs';

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const PLAN = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['composing']}};
const GROUP = 'chrome@textedit';
const JAMO = sha256Hex('ㄱ');
// The device: the user window's field reads empty after the probe's key for the first `misses` posts (the key reaching
// neither the field nor its input method, as in full sitting C), the jamo after.
const missing = misses => {
  let posts = 0;
  return {matrix: (base, a) => {
    if (a[0] === 'probe' && a[1] === 'keystroke') posts += 1;
    const out = base(a);
    return a[0] === 'read' && out.focus?.valueHash === JAMO && posts <= misses ? {...out, focus: {...out.focus, valueHash: EMPTY_HASH}} : out;
  }};
};
const attemptsOf = result => result.meta.unicode.readings.filter(r => r.group === GROUP && Number.isInteger(r.attempt));
const composingRows = result => result.rows.filter(r => r.condition === 'composing');

test('a group that composes on its second attempt runs and counts normally, its rows carrying the attempt number', async () => {
  const {result, steps} = await runWith({plan: PLAN, cellName: 'korean', ops: missing(1)});
  const rows = composingRows(result);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.ok === true && !r.invalid && r.composingAttempt === 2), JSON.stringify(rows.find(r => r.composingAttempt !== 2 || r.invalid)));
  // The setup redone: Latin to end the user window's composition and Korean with its refocus each attempt, the probe
  // posted twice.
  assert.equal(matrixSteps(steps, 'probe').filter(a => a[1] === 'keystroke').length, 2);
  assert.equal(result.meta.unicode.readings.filter(r => r.when === 'composing@textedit:end').length, 2);
  assert.deepEqual(attemptsOf(result).map(r => [r.attempt, r.composed, r.read]), [[1, false, 'empty'], [2, true, 'jamo']]);
});

test('three attempts without a composition leave the group invalid, as before, with every attempt recorded on the readings and on each row', async () => {
  assert.equal(COMPOSING_ATTEMPTS, 3);
  const {result, steps} = await runWith({plan: PLAN, cellName: 'korean', ops: missing(3)});
  assert.equal(matrixSteps(steps, 'probe').filter(a => a[1] === 'keystroke').length, 3, 'at most three attempts');
  assert.deepEqual(attemptsOf(result).map(r => [r.attempt, r.composed]), [[1, false], [2, false], [3, false]]);
  const rows = composingRows(result);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.match(r.invalid, /^no composition in progress: the user window's field did not read the composed jamo after the probe's key \(it read empty\); 3 attempts$/);
    assert.deepEqual(r.composing.map(a => a.attempt), [1, 2, 3]);
    assert.deepEqual(r.composing, attemptsOf(result), 'the row carries the readings\' own records');
  }
});

test('the first attempt\'s failure is its own record, naming the lane\'s engine its setup ran through', async () => {
  for (const engine of ['cua', 'vendor']) {
    const {result} = await runWith({engine, plan: PLAN, cellName: 'korean', ops: missing(1)});
    const [first, second] = attemptsOf(result);
    assert.deepEqual([first.attempt, first.engine, first.composed], [1, engine, false]);
    assert.match(first.failed, /did not read the composed jamo/);
    assert.equal(first.group, GROUP);
    assert.deepEqual([second.engine, second.composed, second.failed], [engine, true, undefined]);
  }
});

// G1: what settles the mechanism, each read by the harness's own no-text reader (./matrix-device.mjs focusedText).
test('each attempt records emptyField\'s preparation, the marked text open before and after it, the probe\'s post and what the field and source read after the key', async () => {
  let texts = 0;
  const frame = {x: 10, y: 20, width: 300, height: 40};
  const answers = [
    // Just before the user window's emptyField: a composition open (one marked unit).
    {ok: true, role: 'AXTextArea', characters: 1, selected: {location: 1, length: 0}, marked: {open: true, length: 1}, frame},
    // Just after it: emptied, the composition still open.
    {ok: true, role: 'AXTextArea', characters: 0, selected: {location: 0, length: 0}, marked: {open: true, length: 1}, frame},
    // After the key: the same field, by role and frame.
    {ok: true, role: 'AXTextArea', characters: 0, selected: {location: 0, length: 0}, marked: {open: false, length: 0}, frame},
  ];
  const ops = {matrix: (base, a) => {
    if (a[0] === 'focused-text') return {answer: answers[Math.min(texts++, 2)], at: [1, 2]};
    const out = base(a);
    // The probe's full answer carries the keys it pressed (their characters): never recorded.
    if (a[0] === 'probe' && a[1] === 'finish' && out.answer?.answer?.units) return {...out, answer: {answer: {...out.answer.answer, layout: 'com.apple.keylayout.2SetHangul', mode: 'ansiKeys', presses: [{keyCode: 15, flags: 0, unicode: 'r'}]}}};
    return out;
  }};
  const cell = code => (tagOf(code) === 'field.empty' && code.includes('__did') ? {ready: true, prepared: ['field emptied'], did: {setValue: true, click: false}} : null);
  const {result} = await runWith({plan: PLAN, cellName: 'korean', ops, cell});
  const [a] = attemptsOf(result);
  assert.equal(a.prepared, 'emptied');
  // Each side's element checked against the prepared field: the read after the cell is that field (emptyField answered
  // it focused), the read before the same element by role and frame.
  assert.deepEqual(a.markedAtEmpty, {before: {ok: true, marked: {open: true, length: 1}, samePrepared: true}, after: {ok: true, marked: {open: true, length: 1}, samePrepared: true}});
  assert.deepEqual(Object.keys(a.probe).sort(), ['layout', 'mode', 'postedAt', 'units']);
  assert.equal(a.probe.units, 1);
  assert.equal(a.probe.layout, 'com.apple.keylayout.2SetHangul');
  assert.deepEqual(a.afterKey.source, {current: 'com.apple.inputmethod.Korean.2SetKorean', layout: 'com.apple.keylayout.2SetHangul'});
  assert.deepEqual(a.afterKey.focused, {ok: true, role: 'AXTextArea', characters: 0, selected: {location: 0, length: 0}, marked: {open: false, length: 0}, samePrepared: true});
  // Another element focused after the key (its frame another): not the prepared field.
  texts = 0;
  answers[2] = {...answers[2], frame: {...frame, y: 400}};
  const moved = await runWith({plan: PLAN, cellName: 'korean', ops, cell});
  assert.equal(attemptsOf(moved.result)[0].afterKey.focused.samePrepared, false);
});

// Review m4: around emptyField each read keeps its element's identity against the prepared field and, when it failed,
// why (its reason, or the reads it names failed with their AXErrors), never only the marked range.
test('the reads around emptyField keep their element\'s identity against the prepared field and a failed read\'s reason and errors', async () => {
  const frame = {x: 10, y: 20, width: 300, height: 40};
  const run = async (before, after, ready = true) => {
    let texts = 0;
    const ops = {matrix: (base, a) => {
      if (a[0] === 'focused-text') { texts += 1; return {answer: texts === 1 ? before : texts === 2 ? after : {ok: true, role: 'AXTextArea', characters: 0, selected: null, frame}, at: [1, 2]}; }
      return base(a);
    }};
    const cell = code => (tagOf(code) === 'field.empty' && code.includes('__did') ? (ready ? {ready: true, did: {setValue: false, click: false}} : {ready: false, reason: 'the field could not be emptied', did: {setValue: true, click: false}}) : null);
    return attemptsOf((await runWith({plan: PLAN, cellName: 'korean', ops, cell})).result)[0].markedAtEmpty;
  };
  const field = {ok: true, role: 'AXTextArea', characters: 0, selected: {location: 0, length: 0}, failed: [], errors: {}, marked: {open: false, length: 0}, frame};
  // Another element focused before the cell: its frame another.
  assert.deepEqual(await run({...field, frame: {...frame, x: 600}}, field), {before: {ok: true, marked: {open: false, length: 0}, samePrepared: false}, after: {ok: true, marked: {open: false, length: 0}, samePrepared: true}});
  // A read that failed whole keeps its reason; one with failed reads keeps their names and AXErrors; a frame not read is
  // no identity (null).
  const failedWhole = {ok: false, reason: 'the reader is not trusted for Accessibility'};
  const partly = {...field, ok: false, failed: ['selected'], errors: {selected: -25212}, marked: {open: null, length: null, errors: {range: -25205, marker: -25205}}, frame: null};
  assert.deepEqual(await run(failedWhole, partly), {before: {ok: false, reason: 'the reader is not trusted for Accessibility', samePrepared: null},
    after: {ok: false, marked: {open: null, length: null, errors: {range: -25205, marker: -25205}}, samePrepared: null, failed: ['selected'], errors: {selected: -25212}}});
  // The cell not ready: the read after is not shown to be the prepared field, so neither side's identity is known.
  const notReady = await run(field, field, false);
  assert.deepEqual([notReady.before.samePrepared, notReady.after.samePrepared], [null, null]);
});

test('no text field anywhere in the new records: presence, lengths, counts, roles, ranges and times only', async () => {
  const ops = {matrix: (base, a) => {
    if (a[0] === 'focused-text') return {answer: {ok: true, role: 'AXTextArea', characters: 1, selected: {location: 0, length: 1}, marked: {open: true, length: 1}, frame: {x: 0, y: 0, width: 1, height: 1}}, at: [1, 2]};
    const out = missing(3).matrix(base, a);
    if (a[0] === 'probe' && a[1] === 'finish' && out.answer?.answer?.units) return {...out, answer: {answer: {...out.answer.answer, keys: 'r', presses: [{keyCode: 15, flags: 0, unicode: 'r'}]}}};
    return out;
  }};
  const {result} = await runWith({plan: PLAN, cellName: 'korean', ops});
  const records = [...attemptsOf(result), ...composingRows(result).flatMap(r => r.composing ?? [])];
  assert.ok(records.length >= 3);
  // Every string in them is a name the harness chose (a key's reading, an engine, a role, a source id, a sentence of
  // its own), never a value the field or the probe's keys held.
  const STRING_KEYS = new Set(['when', 'group', 'engine', 'prepared', 'read', 'layout', 'current', 'role', 'mode', 'failed', 'reason', 'setup']);
  const walk = (x, key) => {
    if (typeof x === 'string') assert.ok(STRING_KEYS.has(key), `a string under ${key}: ${x}`);
    else if (Array.isArray(x)) x.forEach(v => walk(v, key));
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { assert.ok(!['value', 'text', 'keys', 'presses', 'unicode', 'chars'].includes(k), `a ${k} field`); walk(v, k); }
  };
  walk(records, null);
  assert.ok(!JSON.stringify(records).includes('ㄱ'));
});

// ---- the harness's reader: the marked range, presence and length only ---------------------------------------------

test('focused-text: the marked range as presence and length, from the Cocoa range or a web view\'s marker range; the frame kept for the field\'s identity', () => {
  assert.deepEqual(markedOf({range: {location: 3, length: 1}, rangeError: null, marker: false, markerLength: null, markerError: -25205}), {open: true, length: 1});
  assert.deepEqual(markedOf({range: {location: null, length: 0}, rangeError: null, marker: false, markerLength: null, markerError: -25205}), {open: false, length: 0});
  assert.deepEqual(markedOf({range: null, rangeError: -25205, marker: true, markerLength: 2, markerError: null}), {open: true, length: 2});
  // No value: the element keeps a marked range and none is open.
  assert.deepEqual(markedOf({range: null, rangeError: -25212, marker: false, markerLength: null, markerError: -25212}), {open: false, length: 0});
  // Neither read supported, or a marker range whose length did not read: not known.
  assert.deepEqual(markedOf({range: null, rangeError: -25205, marker: false, markerLength: null, markerError: -25205}), {open: null, length: null, errors: {range: -25205, marker: -25205}});
  assert.deepEqual(markedOf({range: null, rangeError: -25205, marker: true, markerLength: null, markerError: -25201}), {open: null, length: null, errors: {range: -25205, marker: -25201}});
  const state = {scenes: {textedit: {pid: 41}}};
  const frame = {x: 1, y: 2, width: 3, height: 4};
  const io = {state: () => state, axText: () => ({trusted: true, ok: true, failed: [], errors: {}, role: 'AXTextArea', frame, characters: 1, selected: {location: 1, length: 0}, bounds: [],
    marked: {range: {location: 0, length: 1}, rangeError: null, marker: false, markerLength: null, markerError: -25205}})};
  assert.deepEqual(focusedText({scene: 'textedit'}, io), {ok: true, role: 'AXTextArea', characters: 1, selected: {location: 1, length: 0}, failed: [], errors: {}, marked: {open: true, length: 1}, frame});
});

// ---- emptyField's steps (the Unicode prepare's record of what it did) ----------------------------------------------

const textEditDouble = ({value, focused}) => {
  const skyshot = JSON.parse(readFileSync(fileURLToPath(new URL('../native-goldens/textedit/skyshot.json', import.meta.url)), 'utf8'));
  const area = skyshot.nodes.find(n => n.identifier === 'First Text View');
  const state = {value, focused};
  const observe = () => {
    const s = structuredClone(skyshot), a = s.nodes.find(n => n.token === area.token);
    a.value = state.value; delete a.valueMarkdown; a.numberOfCharacters = state.value.length; a.flags.focused = state.focused;
    s.focused = state.focused ? area.token : null; s.selectedText = null;
    return render(s, advanceNumbering(null, s));
  };
  return {getAXState: async () => observe(), setValue: async (index, v) => { state.value = v; }, click: async () => { state.focused = true; }};
};
const prepared = async (start, options) => {
  globalThis.__apps = {textedit: textEditDouble(start)};
  const output = [];
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', emptyFieldCell('textedit', options))({write: t => output.push(t)}); }
  finally { delete globalThis.__apps; }
  return parseCell(output.join('\n'))?.value;
};

test('emptyField with its steps recorded names whether it emptied, clicked, both or neither; without, its body is the one every other caller runs', async () => {
  for (const scene of ['textedit', 'chrome', 'electron']) {
    assert.equal(emptyField(scene, {steps: false}), emptyField(scene));
    assert.ok(!emptyField(scene).includes('__did'));
  }
  const steps = {steps: true};
  assert.deepEqual(await prepared({value: 'abc', focused: false}, steps), {ready: true, prepared: ['field emptied'], did: {setValue: true, click: true}});
  assert.deepEqual(await prepared({value: 'abc', focused: true}, steps), {ready: true, prepared: ['field emptied'], did: {setValue: true, click: false}});
  assert.deepEqual(await prepared({value: '', focused: false}, steps), {ready: true, did: {setValue: false, click: true}});
  assert.deepEqual(await prepared({value: '', focused: true}, steps), {ready: true, did: {setValue: false, click: false}});
  assert.deepEqual(await prepared({value: '', focused: false}), {ready: true}, 'unchanged without it');
});

// ---- G3: the summary ------------------------------------------------------------------------------------------------

const attempt = (engine, group, n, composed) => ({when: `composing@${group.split('@')[1]}`, group, attempt: n, engine, composed});
const run = (engine, number, readings) => ({result: {lanes: [{engine}], meta: {run: number, unicode: {readings}}}});

test('the retries per lane and per group, and a lopsided pattern flagged for the owner', () => {
  const full = [
    run('vendor', 1, [attempt('vendor', 'chrome@textedit', 1, false), attempt('vendor', 'chrome@textedit', 2, true), attempt('vendor', 'textedit@electron', 1, true)]),
    run('vendor', 2, [attempt('vendor', 'chrome@textedit', 1, true), ...[1, 2, 3].map(n => attempt('vendor', 'textedit@electron', n, false))]),
    run('cua', 1, [attempt('cua', 'chrome@textedit', 1, true), attempt('cua', 'textedit@electron', 1, true)]),
    // A run recorded before ruling 1229: one composition reading per group, no attempt: one attempt, no retry.
    run('cua', 2, [{when: 'composing@textedit', composed: true, read: 'jamo', reads: 1}]),
  ];
  const c = composingRetriesOf(full);
  assert.deepEqual(c.lanes, {vendor: {groups: 2, retries: 3, unconfirmed: 1}, cua: {groups: 0, retries: 0, unconfirmed: 0}});
  assert.deepEqual(c.groups.find(g => g.engine === 'vendor' && g.group === 'chrome@textedit'), {group: 'chrome@textedit', engine: 'vendor', runs: 2, retried: 1, retries: 1, unconfirmed: 0});
  assert.deepEqual(c.groups.find(g => g.engine === 'vendor' && g.group === 'textedit@electron'), {group: 'textedit@electron', engine: 'vendor', runs: 2, retried: 1, retries: 2, unconfirmed: 1});
  assert.equal(c.findings.length, 1);
  assert.match(c.findings[0], /^composing retries are lopsided: the vendor lane needed a retry in 2 groups \(chrome@textedit, textedit@electron\) and cua in none/);
  const page = renderComposingRetries(c).join('\n');
  assert.match(page, /^## Composing retries \(ruling 1229\)$/m);
  assert.match(page, /^- \*\*For the owner\*\*: composing retries are lopsided/m);
  assert.match(page, /^\| textedit@electron \| vendor \| 2 \| 1 \| 2 \| 1 \|$/m);
  // Both lanes retrying, or one lane in a single group: no finding.
  const both = composingRetriesOf([...full, run('cua', 3, [attempt('cua', 'chrome@textedit', 1, false), attempt('cua', 'chrome@textedit', 2, true)])]);
  assert.deepEqual(both.findings, []);
  assert.deepEqual(composingRetriesOf(full.slice(0, 1).concat(full.slice(2))).findings, []);
  // Nothing recorded: no section.
  assert.deepEqual(renderComposingRetries(composingRetriesOf([run('cua', 1, [])])), []);
});

test('the summary carries the retries as the judge\'s field and renders their section with the owner\'s finding', async () => {
  const {judge, renderSummary} = await import('../../scripts/native-matrix/summary.mjs');
  const result = (engine, readings) => ({path: `${engine}/run-1/result.json`, result: {cell: 'matrix', complete: true, lanes: [{host: engine, engine}], rows: [],
    meta: {run: 1, samples: 2, planId: 'full', unicode: {readings}}}});
  const j = judge([result('vendor', [attempt('vendor', 'chrome@textedit', 1, false), attempt('vendor', 'chrome@textedit', 2, true),
    ...[1, 2, 3].map(n => attempt('vendor', 'textedit@electron', n, false))]), result('cua', [attempt('cua', 'chrome@textedit', 1, true)])], [], {departures: []});
  assert.deepEqual(j.composingRetries.lanes.vendor, {groups: 2, retries: 3, unconfirmed: 1});
  assert.equal(j.composingRetries.findings.length, 1);
  assert.match(renderSummary(j), /^## Composing retries \(ruling 1229\)$[\s\S]*^- \*\*For the owner\*\*: composing retries are lopsided/m);
});

// Review m7: a retry redoes only the group's setup and the probe; no case cell (no act) runs until an attempt composed.
test('no case act cell runs during a composing retry: the acts come only after the attempt that composed', async () => {
  let posts = 0;
  const acts = [];
  const lane = code => { if (code.includes('the case was not prepared; nothing was sent')) acts[posts] = (acts[posts] ?? 0) + 1; };
  const {matrix} = missing(2);
  const ops = {matrix: (base, a) => { if (a[0] === 'probe' && a[1] === 'keystroke') posts += 1; return matrix(base, a); }};
  const {result} = await runWith({plan: PLAN, cellName: 'korean', ops, lane});
  const rows = composingRows(result);
  assert.ok(rows.length > 0 && rows.every(r => r.composingAttempt === 3 && !r.invalid));
  // Indexed by the probe posts so far: none before the first, none after the first or second (the failed attempts),
  // one per row after the third.
  assert.deepEqual([acts[0] ?? 0, acts[1] ?? 0, acts[2] ?? 0, acts[3]], [0, 0, 0, rows.length]);
});

// Ruling 1230, R2: a marked-range read around emptyField that came back unread (open: null; Chromium may not answer it)
// leaves the mechanism unsettled for that app, said so, and no other app's reading (TextEdit's) stands in for it.
test('an unread marked range around emptyField leaves the mechanism unsettled for that app, with no inference from TextEdit\'s reading', () => {
  const side = open => ({ok: true, marked: open === null ? {open: null, length: null, errors: {range: -25205, marker: -25205}} : {open, length: open ? 1 : 0}, samePrepared: true});
  const withMarks = (engine, group, n, composed, before, after) => ({...attempt(engine, group, n, composed), markedAtEmpty: {before: side(before), after: side(after)}});
  const full = [
    run('vendor', 1, [withMarks('vendor', 'textedit@electron', 1, false, null, null), withMarks('vendor', 'textedit@electron', 2, true, null, null),
      withMarks('vendor', 'chrome@textedit', 1, true, true, false)]),
    run('cua', 1, [withMarks('cua', 'textedit@electron', 1, true, false, null), withMarks('cua', 'chrome@textedit', 1, true, false, false),
      // A setup that stopped before emptyField read nothing there: not counted either way.
      {...attempt('cua', 'electron@textedit', 1, false), markedAtEmpty: null, setup: 'the user window did not take front and key'}]),
  ];
  const c = composingRetriesOf(full);
  assert.deepEqual(c.unsettled, [{scene: 'electron', unread: 3, attempts: 3}]);
  const page = renderComposingRetries(c).join('\n');
  assert.match(page, /^- The mechanism is unsettled for the Electron fixture: the marked range around emptyField read back unread in 3 of 3 attempt\(s\); no inference is drawn from TextEdit's reading\.$/m);
  assert.doesNotMatch(page, /unsettled for TextEdit/);
  // TextEdit's own unread reading names no other app's.
  const te = composingRetriesOf([run('cua', 1, [withMarks('cua', 'chrome@textedit', 1, true, null, false)])]);
  assert.match(renderComposingRetries(te).join('\n'), /^- The mechanism is unsettled for TextEdit: the marked range around emptyField read back unread in 1 of 1 attempt\(s\); no other app's reading stands in for it\.$/m);
});

// Ruling 1230, R3: the lopsided flag is a finding for the owner page only: it never enters the judge's owner, blocking
// or missing lists, so the verdict is the one the same runs give without it.
test('a lopsided retry pattern leaves the verdict and the judge\'s owner, blocking and missing lists unchanged', async () => {
  const {judge} = await import('../../scripts/native-matrix/summary.mjs');
  const result = (engine, readings) => ({path: `${engine}/run-1/result.json`, result: {cell: 'matrix', complete: true, lanes: [{host: engine, engine}], rows: [],
    meta: {run: 1, samples: 2, planId: 'full', unicode: {readings}}}});
  const lopsided = [attempt('vendor', 'chrome@textedit', 1, false), attempt('vendor', 'chrome@textedit', 2, true), attempt('vendor', 'textedit@electron', 1, false), attempt('vendor', 'textedit@electron', 2, true)];
  const flagged = judge([result('vendor', lopsided), result('cua', [attempt('cua', 'chrome@textedit', 1, true)])], [], {departures: []});
  const plain = judge([result('vendor', []), result('cua', [])], [], {departures: []});
  assert.equal(flagged.composingRetries.findings.length, 1);
  assert.deepEqual([flagged.verdict, flagged.owner, flagged.blocking, flagged.missing], [plain.verdict, plain.owner, plain.blocking, plain.missing]);
  assert.ok(![...flagged.owner, ...flagged.blocking, ...flagged.missing].some(line => /lopsided|composing retr/.test(line)));
});
