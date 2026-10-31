// The timing series' preconditions and arms (scripts/cursor-sitting/timing.mjs, runner.mjs; #235's spec, Decision Log
// 2026-10-31): a judged series runs only under a Latin input source, checked before it and refused otherwise; one series
// under the owner's own source is recorded, never judged; an arm series runs with engine.json's `cursorDebug` set and
// puts it back. Checked without a Mac.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cursorDebugSettings, runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {CURSOR_ARMS, latinSourceProblem, timingItem, timingSteps} from '../../scripts/cursor-sitting/timing.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-timing-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };

const ABC = {id: 'com.apple.keylayout.ABC', name: 'ABC', keyboardLayout: true, asciiCapable: true, perContextInput: false, layout: 'com.apple.keylayout.ABC'};

test('a Latin source is a plain ASCII-capable keyboard layout that key events are translated with', () => {
  assert.equal(latinSourceProblem(ABC), null);
  assert.equal(latinSourceProblem({...ABC, id: 'com.apple.keylayout.US', layout: 'com.apple.keylayout.US'}), null);
  assert.match(latinSourceProblem({...ABC, id: 'com.apple.inputmethod.Korean.2SetKorean', name: '2-Set Korean', keyboardLayout: false, layout: 'com.apple.keylayout.2SetHangul'}),
    /2-Set Korean.*not a Latin keyboard layout/);
  assert.match(latinSourceProblem({...ABC, id: 'com.apple.keylayout.Russian', name: 'Russian', asciiCapable: false, layout: 'com.apple.keylayout.Russian'}), /Russian/);
  assert.match(latinSourceProblem({...ABC, layout: 'com.apple.keylayout.2SetHangul'}), /translated with com\.apple\.keylayout\.2SetHangul/);
  assert.match(latinSourceProblem({...ABC, layout: null}), /could not be read/);
  assert.match(latinSourceProblem(null), /could not be read/);
});

test('every timing series selects and checks the source first, with TextEdit in front, before any session opens; a judged one requires Latin', () => {
  for (const kind of ['typing', 'clicks']) {
    for (const options of [{}, {arm: 'noRock'}, {ownerSource: true}]) {
      const steps = timingSteps(kind, 2, options);
      const check = steps.findIndex(s => s.task === 'input-source');
      assert.ok(check > 0 && check < steps.findIndex(s => s.open && s.open !== 'tidy'), JSON.stringify(options));
      assert.deepEqual(steps.slice(0, check).filter(s => s.task).map(s => s.task), ['activate', 'overlay-check', 'overlay-check', 'select-source']);
      const select = steps.find(s => s.task === 'select-source');
      assert.deepEqual(select.args, [options.ownerSource ? 'owner' : 'latin', 'textedit'], 'ABC for a judged series and an arm, the owner\'s own for theirs, in TextEdit\'s run window');
      assert.equal(select.required, true, 'a selection that does not read back stops the series');
      assert.equal(steps[check].required, true, 'a refusal stops the series');
      assert.deepEqual(steps[check].args, [options.ownerSource ? 'record' : 'latin']);
    }
  }
});

test('an arm series sets cursorDebug, relaunches the engine, checks the running arm, and puts engine.json back', () => {
  const steps = timingSteps('typing', 2, {arm: 'panelOut'});
  const tasks = steps.filter(s => s.task).map(s => [s.task, ...(s.args ?? [])].join(' '));
  assert.deepEqual(tasks, ['activate textedit', 'overlay-check textedit', 'overlay-check textedit none', 'select-source latin textedit', 'input-source latin', 'engine-json-arm panelOut', 'engine-stop', 'activate textedit',
    'engine-status on panelOut', 'engine-json-restore', 'engine-stop']);
  assert.ok(steps.findIndex(s => s.task === 'engine-status') > steps.findIndex(s => s.open === 'off'), 'read once the sessions launched the engine');
  assert.equal(steps.find(s => s.task === 'engine-status').required, true);
  assert.ok(steps.findIndex(s => s.task === 'engine-json-restore') > steps.findIndex(s => s.close === 'on'));
  assert.throws(() => timingSteps('typing', 2, {arm: 'noRockFilter'}), /panelOut, noBackdrop, noRock, legacyLayers, fps60/);
  assert.throws(() => timingSteps('typing', 2, {arm: 'noRock', ownerSource: true}), /one at a time/);
  assert.deepEqual(CURSOR_ARMS, ['panelOut', 'noBackdrop', 'noRock', 'legacyLayers', 'fps60']);
});

test('the fps60 arm\'s series first proves its cap: the probe\'s glides with and without the arm, before engine.json changes', () => {
  for (const kind of ['typing', 'clicks']) {
    const steps = timingSteps(kind, 2, {arm: 'fps60'});
    const tasks = steps.filter(s => s.task).map(s => [s.task, ...(s.args ?? [])].join(' '));
    assert.deepEqual(tasks.slice(4, 8), ['input-source latin', 'glide-frames fps60', 'engine-json-arm fps60', 'engine-stop']);
    const check = steps.find(s => s.task === 'glide-frames');
    assert.notEqual(check.required, true, 'recorded: a cap that did not take effect is the finding, not a reason to stop');
    assert.ok(steps.indexOf(check) < steps.findIndex(s => s.open === 'on'));
  }
  assert.equal(timingSteps('typing', 2, {arm: 'noRock'}).some(s => s.task === 'glide-frames'), false, 'only the cap\'s arm has a cap to prove');
  assert.equal(timingSteps('typing', 2).some(s => s.task === 'glide-frames'), false);
});

test('only the plain series is judged: an arm or the owner\'s source records under its own item', () => {
  assert.equal(timingItem('typing'), '12');
  assert.equal(timingItem('clicks', {arm: 'noBackdrop'}), '13-noBackdrop');
  assert.equal(timingItem('typing', {ownerSource: true}), '12-owner-source');
});

test('engine.json\'s arm keeps the other keys and refuses a file that is not an object', () => {
  assert.deepEqual(JSON.parse(cursorDebugSettings('{"engine": "cua", "cursor": true}', 'noRock')), {engine: 'cua', cursor: true, cursorDebug: 'noRock'});
  assert.deepEqual(JSON.parse(cursorDebugSettings(null, 'panelOut')), {cursorDebug: 'panelOut'});
  assert.throws(() => cursorDebugSettings('[]', 'noRock'), /not a JSON object/);
});

test('a refused source stops the series before any session opens, and the reading is kept', async t => {
  const out = scratch(t), log = [];
  const korean = {...ABC, id: 'com.apple.inputmethod.Korean.2SetKorean', name: '2-Set Korean', keyboardLayout: false, layout: 'com.apple.keylayout.2SetHangul'};
  const io = {
    scene: id => ({id}), wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: '/dev/null',
    open: async ({name}) => { log.push(`open ${name}`); return {run: async () => ({ok: true, value: {}, images: []}), close: async () => ({})}; },
    tasks: {
      activate: async () => ({ok: true}),
      'overlay-check': async () => ({ok: true, overlays: []}),
      'select-source': async ([which]) => ({ok: true, which, switched: false}),
      'input-source': async ([mode]) => { const problem = latinSourceProblem(korean); return {ok: mode === 'record' || problem === null, mode, reading: korean, problem}; },
    },
    cleanup: async () => log.push('cleanup'),
  };
  await assert.rejects(runSteps(timingSteps('typing', 2), {item: '12', out, io, log: () => {}}), /input-source refused: .*2-Set Korean/);
  assert.deepEqual(log, ['cleanup'], 'nothing opened');
  const rows = readFileSync(join(out, 'item-12.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(rows.at(-1).task, 'input-source');
  assert.equal(rows.at(-1).result.reading.id, korean.id);
  const {failed} = await runSteps(timingSteps('typing', 1, {ownerSource: true}), {item: '12-owner-source', out, io, log: () => {}});
  assert.equal(failed, 0, 'the owner\'s own source is recorded, not refused');
  assert.ok(log.includes('open on') && log.includes('open off'));
});

test('a selection that does not read back stops the series before the check and before any session opens', async t => {
  const out = scratch(t), log = [];
  const io = {
    scene: id => ({id}), wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: '/dev/null',
    open: async ({name}) => { log.push(`open ${name}`); return {run: async () => ({ok: true, value: {}, images: []}), close: async () => ({})}; },
    tasks: {
      activate: async () => ({ok: true}),
      'overlay-check': async () => ({ok: true, overlays: []}),
      'select-source': async ([which]) => ({ok: false, which, switched: true, requested: 'com.apple.keylayout.ABC', problem: 'com.apple.keylayout.ABC was selected, but the current source reads com.apple.inputmethod.Korean.2SetKorean'}),
      'input-source': async () => { log.push('checked'); return {ok: true}; },
    },
    cleanup: async () => log.push('cleanup'),
  };
  await assert.rejects(runSteps(timingSteps('clicks', 2), {item: '13', out, io, log: () => {}}), /select-source refused: .*current source reads/);
  assert.deepEqual(log, ['cleanup'], 'neither checked nor opened');
});

const KOREAN_ID = 'com.apple.inputmethod.Korean.2SetKorean';
test('a typing series under a named source: recorded under its own item, selected and checked like the others, the owner\'s put back after it', () => {
  assert.equal(timingItem('typing', {source: KOREAN_ID}), '12-source-2SetKorean');
  const steps = timingSteps('typing', 2, {source: KOREAN_ID});
  const tasks = steps.filter(s => s.task).map(s => [s.task, ...(s.args ?? [])].join(' '));
  assert.deepEqual(tasks, ['activate textedit', 'overlay-check textedit', 'overlay-check textedit none', `select-source named textedit ${KOREAN_ID}`, 'input-source record', 'activate textedit', 'select-source owner textedit']);
  assert.ok(steps.filter(s => s.task === 'select-source').every(s => s.required === true));
  assert.ok(steps.findIndex(s => s.task === 'select-source' && s.args[0] === 'owner') > steps.findIndex(s => s.close === 'on'), 'the owner\'s source comes back after the series');
  assert.throws(() => timingSteps('typing', 2, {source: KOREAN_ID, ownerSource: true}), /one at a time/);
  assert.throws(() => timingSteps('typing', 2, {source: KOREAN_ID, arm: 'noRock'}), /one at a time/);
  assert.throws(() => timingSteps('clicks', 2, {source: KOREAN_ID}), /typing/);
});

test('the still series: press_key only, recorded under its own item, ABC with the usual guards, the owner\'s source back after', async () => {
  const {sampleCounts} = await import('../../scripts/cursor-sitting/timing.mjs');
  assert.equal(timingItem('typing', {still: true}), '12-still');
  const steps = timingSteps('typing', sampleCounts('typing', {recorded: true, only: ['press-key']}), {still: true});
  const tasks = steps.filter(s => s.task).map(s => s.task);
  assert.deepEqual(steps.find(s => s.task === 'select-source').args, ['latin', 'textedit']);
  assert.deepEqual(steps.find(s => s.task === 'input-source').args, ['latin']);
  assert.equal(tasks.at(-1), 'select-source');
  assert.deepEqual(steps.filter(s => s.task === 'select-source').at(-1).args, ['owner', 'textedit']);
  const plan = steps.findIndex(s => s.task === 'still-plan');
  assert.ok(plan > steps.findIndex(s => s.task === 'input-source') && plan < steps.findIndex(s => s.open === 'on'));
  assert.equal(steps[plan].required, true, 'no series unless the planned glide settles inside the wait');
  const sample = steps.find(s => s.sample);
  assert.deepEqual(sample.sample.covers, ['press_key x30']);
  const cell = sample.cell({'still plan': {waitMs: 1300}});
  const glide = cell.indexOf('await __app.click(', cell.indexOf('setTimeout(resolve, 400)'));
  const keepAlive = cell.indexOf('await observe()'), keys = cell.indexOf('pressKey');
  assert.ok(glide > 0 && glide < keepAlive && keepAlive < keys, 'the glide click, then the kept-alive wait, then the keys');
  assert.match(cell, /1300/);
  assert.match(cell, /setTimeout\(resolve, 100\)/, 'no gap of 0.3 s with no request, so the rock cannot start');
  assert.throws(() => timingSteps('typing', 2, {still: true, arm: 'noRock'}), /one at a time/);
  assert.throws(() => timingSteps('clicks', 2, {still: true}), /typing/);
});

test('before every guarded series, a small window of TextEdit\'s own on top of its run window is dismissed, and its absence required', () => {
  for (const options of [{}, {arm: 'noRock'}, {ownerSource: true}, {still: true}]) {
    const steps = timingSteps(options.still ? 'typing' : 'clicks', options.still ? {'press_key x30': 2} : 2, options);
    const check = steps.findIndex(s => s.task === 'overlay-check'), select = steps.findIndex(s => s.task === 'select-source');
    const tidy = steps.slice(check + 1, select);
    assert.ok(check > steps.findIndex(s => s.task === 'activate') && check < select, JSON.stringify(options));
    assert.ok(tidy.some(s => s.open === 'tidy' && s.env?.CUA_CURSOR === '0' && typeof s.when === 'function'), 'a cursor-off session, only when there is one');
    assert.ok(tidy.some(s => s.run === 'tidy' && typeof s.when === 'function'));
    assert.ok(tidy.some(s => s.close === 'tidy'));
    const again = tidy.find(s => s.task === 'overlay-check');
    assert.equal(again.required, true);
    assert.deepEqual(again.args, ['textedit', 'none']);
  }
});

test('a step whose `when` says no is skipped and recorded as skipped', async t => {
  const out = scratch(t), log = [];
  const io = {
    scene: id => ({id}), wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: '/dev/null',
    open: async ({name}) => { log.push(`open ${name}`); return {run: async () => ({ok: true, value: {}, images: []}), close: async () => ({})}; },
    tasks: {}, cleanup: async () => {},
  };
  const {rows} = await runSteps([{open: 'x', scenes: [], when: () => false}, {open: 'y', scenes: [], when: results => results.go === undefined}, {close: 'y'}], {item: 'w', out, io, log: () => {}});
  assert.deepEqual(log, ['open y']);
  assert.ok(rows.some(r => r.kind === 'skipped' && r.step === 1));
});

test('with a window over the run window, the tidy session opens, clicks, closes, and the series goes on once it is gone', async t => {
  const out = scratch(t), log = [];
  let checks = 0;
  const io = {
    scene: id => ({id}), wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: '/dev/null',
    open: async ({name, env}) => { log.push(`open ${name} ${JSON.stringify(env)}`); return {run: async () => { log.push(`run ${name}`); return {ok: true, value: {}, images: []}; }, close: async () => { log.push(`close ${name}`); return {}; }}; },
    tasks: {
      activate: async () => ({ok: true}),
      'overlay-check': async ([, expect], ctx) => { checks++; ctx.results.overlays = checks === 1 ? [{number: 9, bounds: {width: 53, height: 48}}] : []; return {ok: true, overlays: ctx.results.overlays, expect}; },
      'select-source': async () => ({ok: false, problem: 'stop here'}),
    },
    cleanup: async () => {},
  };
  await assert.rejects(runSteps(timingSteps('typing', 1), {item: '12', out, io, log: () => {}}), /select-source refused/);
  assert.deepEqual(log, ['open tidy {"CUA_CURSOR":"0"}', 'run tidy', 'close tidy']);
  assert.equal(checks, 2);
});

test('no coordinate input to an unverified window: every drag is followed by clearing its selection by an element action, and the tidy step uses the same', async () => {
  const {CLEAR_SELECTION} = await import('../../scripts/cursor-sitting/cells.mjs');
  assert.ok(!/__app\.(click|drag|scroll|pressKey|typeText)\(/.test(CLEAR_SELECTION), 'no coordinates and no keys');
  assert.match(CLEAR_SELECTION, /if \(!inFront\(ax\)\) throw/, 'refused unless the observation is of the run window');
  assert.match(CLEAR_SELECTION, /__app\.selectText\(index, "Line", \{selectionType: "cursor_after"\}\)/);
  const steps = timingSteps('clicks', 2);
  steps.forEach((s, k) => { if (s.sample?.series === 'drag') { assert.equal(steps[k + 1].cell, CLEAR_SELECTION); assert.equal(steps[k + 1].required, true); } });
  assert.ok(!timingSteps('clicks', {'element click': 2}).some(s => s.cell === CLEAR_SELECTION && s.run !== 'tidy'), 'no drag, nothing to clear');
  const tidy = steps.find(s => s.run === 'tidy');
  assert.equal(tidy.cell, CLEAR_SELECTION);
  assert.equal(tidy.required, true);
});
