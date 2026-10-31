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
      assert.ok(check > 0 && check < steps.findIndex(s => s.open), JSON.stringify(options));
      assert.deepEqual(steps.slice(0, check).filter(s => s.task).map(s => s.task), ['activate', 'select-source']);
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
  assert.deepEqual(tasks, ['activate textedit', 'select-source latin textedit', 'input-source latin', 'engine-json-arm panelOut', 'engine-stop', 'activate textedit',
    'engine-status on panelOut', 'engine-json-restore', 'engine-stop']);
  assert.ok(steps.findIndex(s => s.task === 'engine-status') > steps.findIndex(s => s.open === 'off'), 'read once the sessions launched the engine');
  assert.equal(steps.find(s => s.task === 'engine-status').required, true);
  assert.ok(steps.findIndex(s => s.task === 'engine-json-restore') > steps.findIndex(s => s.close === 'on'));
  assert.throws(() => timingSteps('typing', 2, {arm: 'noRockFilter'}), /panelOut, noBackdrop, noRock, legacyLayers/);
  assert.throws(() => timingSteps('typing', 2, {arm: 'noRock', ownerSource: true}), /one at a time/);
  assert.deepEqual(CURSOR_ARMS, ['panelOut', 'noBackdrop', 'noRock', 'legacyLayers']);
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
      'select-source': async ([which]) => ({ok: false, which, switched: true, requested: 'com.apple.keylayout.ABC', problem: 'com.apple.keylayout.ABC was selected, but the current source reads com.apple.inputmethod.Korean.2SetKorean'}),
      'input-source': async () => { log.push('checked'); return {ok: true}; },
    },
    cleanup: async () => log.push('cleanup'),
  };
  await assert.rejects(runSteps(timingSteps('clicks', 2), {item: '13', out, io, log: () => {}}), /select-source refused: .*current source reads/);
  assert.deepEqual(log, ['cleanup'], 'neither checked nor opened');
});
