// #188: keep the focus experiment causal, and keep diagnostic reads separate from click metadata.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {planOf, scenesOf} from '../../scripts/native-matrix/run.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {focusCells, focusReleaseOf, FOCUS_VARIANTS} from '../../scripts/native-matrix/electron-focus.mjs';
import {focusSnapshot, readElectronFocus} from '../../scripts/native-matrix/electron-focus-device.mjs';
import {names, runWith} from './run-doubles.mjs';

const counts = (active = 0, resigned = 0) => ({seq: active + resigned, at: 1, counts: {appDidBecomeActive: active, appDidResignActive: resigned, textFocus: 1, textBlur: 0}});
const field = {token: 'e5', role: 'AXTextArea', description: 'Fixture text', flags: {focused: false, focusable: true}, actions: ['AXConfirm'], value: 'NEVER EXPORT'};
const shot = {app: {pid: 123, bundleIdentifier: 'io.github.ssfskim.cua.fixture.electron'}, nodes: [field], focused: null, selectedText: null, timings: {focusRead: 'outsideTheWalk'}};

test('the focus diagnostic is opt-in and owns only Electron and Finder', () => {
  assert.deepEqual(scenesOf(planOf('electron-focus')), ['finder', 'electron']);
  assert.equal(planOf('matrix').electronFocus, undefined);
  assert.throws(() => planOf('electron-focus', {scene: 'textedit'}), /nothing to run/);
  assert.throws(() => planOf('electron-focus', {user: 'textedit'}), /nothing to run/);
});

test('raw snapshot separates field AXFocused, app focused element, and selection; never exports text or arbitrary diagnostics', () => {
  const read = focusSnapshot(shot, 123);
  assert.equal(read.fieldFound, true);
  assert.equal(read.axFocused, false);
  assert.equal(read.focusedIsField, false);
  assert.equal(read.focusRead, 'outsideTheWalk');
  assert.deepEqual(read.actions, ['AXConfirm']);
  assert.ok(!JSON.stringify(read).includes('NEVER EXPORT'));
  const selected = focusSnapshot({...shot, nodes: [{...field, flags: {...field.flags, focused: true}}], focused: 'e5', selectedText: 'private', timings: {focusRead: 'private'}}, 123);
  assert.equal(selected.axFocused, true);
  assert.equal(selected.focusedIsField, true);
  assert.equal(selected.selectedTextPresent, true);
  assert.equal(selected.focusRead, null);
  assert.throws(() => focusSnapshot(shot, 124), /fixture identity/);
  assert.throws(() => focusSnapshot({...shot, nodes: [field, field]}, 123), /one fixture text area/);
});

test('device reader observes only the owned fixture through the already-running attested engine, closing its read-only connection', async () => {
  const calls = [];
  const client = {status: async () => ({connections: 1}), connect: async () => ({build: 'b'}), execute: async (...args) => {calls.push(args); return {result: shot};}, close: () => calls.push('close')};
  const io = {state: () => ({scenes: {electron: {pid: 123, bundleId: shot.app.bundleIdentifier, app: '/Fixture.app'}}}), createClient: options => {calls.push(options); return client;}};
  assert.equal((await readElectronFocus({engine: 'cua', approvedEngine: '/Engine.app'}, io)).axFocused, false);
  assert.equal(calls[1][0], 'get_app_state');
  assert.deepEqual(calls[1][1], {app: '/Fixture.app', includeScreenshot: false});
  assert.equal(calls.at(-1), 'close');
  await assert.rejects(calls[0].nodeRepl.launchServices.openApplication(), /already running/);
  await assert.rejects(readElectronFocus({engine: 'cua', approvedEngine: '/Engine.app'}, {...io, state: () => ({scenes: {}})}), /owned Electron/);
});

const ax = 'Window: "cua Electron fixture"\n0 window\n\t5 text area (settable) Fixture text\n\t6 list Fixture list\n\t7 button Fixture button';
async function execute(code, app, {state = {}, rpc = async () => null} = {}) {
  let text = '';
  const context = {performance, Date, globalThis: {__apps: {electron: app}, __ef: state}, nodeRepl: {write: s => {text += s;}, rpc}};
  await runInNewContext(`(async () => {${code}})()`, context);
  return {result: parseCell(text), state: context.globalThis.__ef};
}

test('generated cells preserve the click route by doing exactly one input call and no following observe in the act', async () => {
  for (const variant of FOCUS_VARIANTS) {
    const calls = [];
    const app = {getAXState: async () => {calls.push('observe'); return ax;}, click: async (...a) => calls.push(['click', ...a])};
    const prepared = await execute(focusCells('/Fixture.app', variant).prepare, app);
    assert.equal(prepared.result.value.ready, true);
    assert.equal(prepared.state.index, 5);
    calls.length = 0;
    const acted = await execute(focusCells('/Fixture.app', variant).act, app, {state: prepared.state, rpc: async (...a) => calls.push(a)});
    assert.equal(acted.result.ok, true);
    assert.equal(acted.result.value.threw, false);
    assert.equal(calls.length, 1);
    assert.notEqual(calls[0], 'observe');
    if (variant.startsWith('natural')) assert.deepEqual(calls[0], ['click', 5]);
    else assert.equal(calls[0][1].args[0].spikeRoute, variant === 'forced1' ? '1' : '3');
  }
});

test('observation re-finds the field rather than comparing a stale index, and exposes selection hiding the trailer', async () => {
  const cells = focusCells('/Fixture.app', 'natural');
  const app = {getAXState: async () => ax.replace('5 text area', '9 text area') + '\nSelected text: ```\nSECRET\n```'};
  const {result} = await execute(cells.observe, app, {state: {ready: true, index: 5}});
  assert.equal(result.value.fieldIndex, 9);
  assert.equal(result.value.focusedIndex, null);
  assert.equal(result.value.selectedTextPresent, true);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

function simulated({release = true, routeMismatch = false, focus = true, unsupportedForced1 = false} = {}) {
  let active = 0, resigned = 0, held = false;
  const cell = code => {
    if (code.includes('cua-matrix:route-ab:release')) { if (held && release) {resigned++; held = false;} return {observed: true}; }
    if (code.includes('cua-matrix:electron-focus:seed')) return {ready: true, selectedTextPresent: true};
    if (code.includes('cua-matrix:electron-focus:prime')) {active++; held = true; return {actMs: 1, at: [100, 101], threw: false, _meta: {'cua/inputRoute': 3}};}
    if (code.includes('cua-matrix:electron-focus:prepare')) return {ready: true, fieldIndex: 5, focusedIndex: null, focusedIsField: false, selectedTextPresent: false, selectedCount: 0};
    if (code.includes('cua-matrix:electron-focus:observe')) return {fieldIndex: 5, focusedIndex: focus ? 5 : null, focusedIsField: focus, selectedTextPresent: false, selectedCount: 0};
    if (code.includes('cua-matrix:electron-focus:act')) {
      const forced1 = code.includes('spikeRoute: "1"');
      if (forced1 && unsupportedForced1) return {actMs: 2, at: [102, 104], threw: true,
        error: 'spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress', _meta: {'cua/inputRoute': null}};
      if (!forced1 && !held) {active++; resigned++;}
      return {actMs: 2, at: [102, 104], threw: false, _meta: {'cua/inputRoute': forced1 && !routeMismatch ? 1 : 3}};
    }
    return null;
  };
  return {cell, ops: {matrix: (base, args) => {
    const result = base(args);
    if (args[0] === 'electron-counters') return {...result, answer: counts(active, resigned)};
    if (args[0] === 'electron-focus' && args.includes('--status-only')) return {...result, answer: {connections: 1}};
    if (args[0] === 'electron-focus') return {...result, answer: {fieldFound: true, axFocused: focus, focusedIsField: focus, actions: unsupportedForced1 ? ['AXConfirm'] : ['AXPress'], focusRead: null}};
    return result;
  }}};
}
const run = (options = {}) => runWith({plan: planOf('electron-focus'), cellName: 'electron-focus', ...simulated(options)});
function assertIncomplete({result, code, steps}) {
  assert.deepEqual({complete: result.complete, verdict: result.verdict, code}, {complete: false, verdict: 'no-verdict', code: 1});
  assert.ok(result.problems.length > 0, 'missing mandatory evidence must explain why the run is incomplete');
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.putBack.ok, true);
  assert.equal(result.meta.preparationCleanup.removed, true);
  assert.deepEqual(names(steps).filter(s => s === 'live recover' || s === 'cleanup'), ['live recover', 'cleanup']);
}

test('four variants and the empty-field control retain separate before/after AX, facade, activation and route evidence and release every arm', async () => {
  const {result, calls, code} = await run();
  assert.deepEqual({complete: result.complete, verdict: result.verdict, code}, {complete: true, verdict: 'pass', code: 0});
  assert.deepEqual(result.problems, []);
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.rows.map(r => r.variant), ['forced1', 'forced3', 'held3', 'natural', 'natural-empty']);
  for (const row of result.rows) {
    assert.equal(row.invalid, undefined);
    assert.ok(row.axBefore && row.axAfter && row.before && row.after && row.countersBefore && row.countersAfter);
    assert.equal(row.release.released, true);
    assert.equal(row.clickPlan.reported, null, 'the fixed engine reports no plan tag');
    assert.equal(row.interference.ok, true);
  }
  assert.equal(result.rows[2].primer.inputRoute, 3);
  assert.ok(result.rows[2].afterPrime && result.rows[2].axAfterPrime);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:route-ab:release')).length, 5);
});

test('an unverified held3 release retains every row, blocks subsequent clicks and prevents a completed pass', async () => {
  const outcome = await run({release: false});
  const {result, calls} = outcome;
  assert.deepEqual(result.rows.map(r => r.variant), ['forced1', 'forced3', 'held3', 'natural', 'natural-empty']);
  assert.ok(result.rows.slice(0, 2).every(r => r.ok && !r.invalid));
  assert.equal(result.rows[2].release.released, false);
  assert.ok(result.rows.slice(2).every(r => /release/.test(r.invalid)));
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:electron-focus:seed')).length, 3);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:electron-focus:act')).length, 3);
  assertIncomplete(outcome);
});

test('an invalid forced route prevents completion even when every later arm succeeds', async () => {
  const outcome = await run({routeMismatch: true});
  assert.match(outcome.result.rows[0].invalid, /forced route 1/);
  assert.equal(outcome.result.rows.length, 5);
  assert.ok(outcome.result.rows.slice(1).every(r => r.ok && !r.invalid && r.release.released));
  assertIncomplete(outcome);
});

test('a skipped final control prevents completion despite four valid successful arms', async () => {
  const sim = simulated();
  let seeds = 0;
  const cell = code => {
    const value = sim.cell(code);
    return code.includes('cua-matrix:electron-focus:seed') && ++seeds === 5 ? {...value, ready: false} : value;
  };
  const outcome = await runWith({plan: planOf('electron-focus'), cellName: 'electron-focus', ...sim, cell});
  assert.equal(outcome.result.rows.length, 5);
  assert.ok(outcome.result.rows.slice(0, 4).every(r => r.ok && !r.invalid && r.release.released));
  assert.equal(outcome.result.rows[4].variant, 'natural-empty');
  assert.match(outcome.result.rows[4].invalid, /selection state/);
  assert.equal(outcome.calls.filter(c => c.code.includes('cua-matrix:electron-focus:act')).length, 4);
  assertIncomplete(outcome);
});

test('absent focus is a complete measured FAIL, not missing diagnostic evidence', async () => {
  const {result, code} = await run({focus: false});
  assert.equal(result.rows.length, 5);
  assert.ok(result.rows.every(r => !r.invalid && !r.ok && r.release.released));
  assert.deepEqual(result.problems, []);
  assert.deepEqual({complete: result.complete, verdict: result.verdict, code}, {complete: true, verdict: 'fail', code: 1});
});

test('declared unsupported forced1 remains valid mandatory diagnostic evidence', async () => {
  const {result, code} = await run({unsupportedForced1: true});
  assert.equal(result.rows.length, 5);
  assert.ok(result.rows.every(r => !r.invalid && r.release.released));
  assert.equal(result.rows[0].ok, false);
  assert.equal(result.rows[0].declared.kind, 'diagnostic');
  assert.match(result.rows[0].declared.cause, /no AXPick\/AXPress/);
  assert.ok(result.rows.slice(1).every(r => r.ok));
  assert.deepEqual(result.problems, []);
  assert.deepEqual({complete: result.complete, verdict: result.verdict, code}, {complete: true, verdict: 'pass', code: 0});
});

test('vendor comparison uses only the natural reference; no unsupported spike request or own-engine observation', async () => {
  const {result, calls, steps, code} = await runWith({engine: 'vendor', plan: planOf('electron-focus'), cellName: 'electron-focus', ...simulated()});
  assert.deepEqual({complete: result.complete, verdict: result.verdict, code}, {complete: true, verdict: 'pass', code: 0});
  assert.deepEqual(result.rows.map(r => r.variant), ['natural']);
  assert.ok(calls.every(c => !c.code.includes('spikeRoute')));
  assert.ok(steps.filter(s => s.startsWith('matrix ') && s.includes('electron-focus')).every(s => s.includes('vendor')));
});

test('each arm seeds and proves the selected-text state that can mask focusedIndexOf', async () => {
  let value = '', selected = '';
  const app = {getAXState: async () => ax + (selected ? `\nSelected text: \`\`\`\n${selected}\n\`\`\`` : ''),
    setValue: async (index, text) => {assert.equal(index, 5); value = text;},
    selectText: async (index, text) => {assert.equal(index, 5); assert.ok(value.includes(text)); selected = text;}};
  const {result} = await execute(focusCells('/Fixture.app', 'natural').seed, app);
  assert.equal(result.value.ready, true);
  assert.equal(result.value.selectedTextPresent, true);
  assert.ok(!JSON.stringify(result).includes('charlie'));
});

test('an already-ended synthesized activation needs balance, an outstanding hold also needs a later resignation', () => {
  const start = counts(4, 4);
  assert.equal(focusReleaseOf({start, before: start, after: counts(5, 5), now: counts(5, 5)}).released, true);
  assert.equal(focusReleaseOf({start, before: start, after: counts(5, 4), now: counts(5, 4)}).released, false);
  assert.equal(focusReleaseOf({start, before: start, after: counts(5, 4), now: counts(5, 5)}).released, true);
  assert.equal(focusReleaseOf({start, before: start, after: null, now: counts(5, 5)}).released, false);
});

test('raw focus snapshot refuses an observation that opened the app or lacks preparation telemetry', () => {
  assert.throws(() => focusSnapshot({...shot, timings: {launched: true}}, 123), /opened/);
  assert.throws(() => focusSnapshot({...shot, timings: {reopened: true}}, 123), /opened/);
  assert.throws(() => focusSnapshot({...shot, timings: undefined}, 123), /preparation/);
});

test('a leftover connection blocks the next arm before its seed and all remaining arms', async () => {
  const sim = simulated(); let checks = 0;
  const matrix = sim.ops.matrix;
  sim.ops.matrix = (base, args) => {
    const out = matrix(base, args);
    if (args[0] === 'electron-focus' && args.includes('--status-only')) out.answer.connections = ++checks === 1 ? 1 : 2;
    return out;
  };
  const outcome = await runWith({plan: planOf('electron-focus'), cellName: 'electron-focus', ...sim});
  const {result, calls} = outcome;
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[1].connectionCheck.connections, 2);
  assert.ok(result.rows.slice(1).every(r => /connection/.test(r.invalid)));
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:electron-focus:seed')).length, 1);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:electron-focus:act')).length, 1);
  assertIncomplete(outcome);
});

test('counter movement around a sidecar invalidates the sample and is retained with both readings', async () => {
  const sim = simulated(); let focus = 0;
  const matrix = sim.ops.matrix;
  sim.ops.matrix = (base, args) => {
    const out = matrix(base, args);
    if (args[0] === 'electron-counters') out.answer.counts.textFocus = ++focus;
    return out;
  };
  const outcome = await runWith({plan: planOf('electron-focus'), cellName: 'electron-focus', ...sim});
  const {result, calls} = outcome;
  assert.equal(result.rows.length, 5);
  assert.match(result.rows[0].invalid, /counters changed/);
  assert.equal(result.rows[0].sidecars[0].countersMoved, true);
  assert.ok(result.rows[0].sidecars[0].countersBefore && result.rows[0].sidecars[0].countersAfter);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:electron-focus:act')).length, 0);
  assertIncomplete(outcome);
});

test('the empty-field natural control clears text and selection without emitting text', async () => {
  let selected = 'charlie';
  const app = {getAXState: async () => ax + (selected ? `\nSelected text: \`\`\`\n${selected}\n\`\`\`` : ''),
    setValue: async (index, text) => {assert.equal(index, 5); assert.equal(text, ''); selected = '';},
    selectText: async () => assert.fail('the fresh control must not select text')};
  const {result} = await execute(focusCells('/Fixture.app', 'natural-empty').seed, app);
  assert.equal(result.value.ready, true);
  assert.equal(result.value.selectedTextPresent, false);
});

test('a sidecar refuses a second driving connection before any observation, and always closes', async () => {
  const calls = [];
  const client = {connect: async () => ({}), status: async () => ({connections: 2}),
    execute: async () => assert.fail('must not observe'), close: () => calls.push('closed')};
  const io = {state: () => ({scenes: {electron: {pid: 123, bundleId: shot.app.bundleIdentifier, app: '/Fixture.app'}}}), createClient: () => client};
  await assert.rejects(readElectronFocus({engine: 'cua', approvedEngine: '/Engine.app'}, io), /one driving connection/);
  assert.deepEqual(calls, ['closed']);
  assert.deepEqual(await readElectronFocus({engine: 'cua', approvedEngine: '/Engine.app', statusOnly: true}, io), {connections: 2});
});

test('vendor probe has no raw AXFocused and never exports the probe tree', async () => {
  const io = {state: () => ({scenes: {electron: {pid: 123, bundleId: shot.app.bundleIdentifier, app: '/Fixture.app'}}}),
    probe: args => {assert.deepEqual(args, ['text-view', '--pid', '123']); return {exitStatus: 0, pid: 123,
      windows: [{textArea: {private: 'NEVER EXPORT'}}], focused: {role: 'AXTextArea', textAreaOfWindow: 0}};}};
  const read = await readElectronFocus({engine: 'vendor', approvedEngine: '/Engine.app'}, io);
  assert.equal(read.axFocused, null);
  assert.match(read.axFocusedUnavailable, /does not expose/);
  assert.equal(read.focusedIsField, true);
  assert.ok(!JSON.stringify(read).includes('NEVER EXPORT'));
});
