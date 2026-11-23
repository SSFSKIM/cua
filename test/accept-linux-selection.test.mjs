// How the Linux acceptance fixtures show which engine a session selected (#171 M5; the pre-flight's §3, "How the default
// is shown live"): the explicit mode names cua's engine as M4 ran them; the default mode names none, refuses to start
// unless nothing does, and reads the selection from `cua doctor --json`; the fallback homes' probe reads the vendor's,
// with the warning that names why and `cua install --engine`. Pure: no doctor runs here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FALLBACK_HOMES, defaultSelectionProblem, fallbackSelectionProblem, selectionMode, unsetSelectionProblems} from '../scripts/accept/linux-selection.mjs';

test('the mode is --selection explicit or default, explicit when not given; anything else is refused', () => {
  assert.equal(selectionMode([]), 'explicit');
  assert.equal(selectionMode(['--screenshot', '/tmp/a.png']), 'explicit');
  assert.equal(selectionMode(['--selection', 'default']), 'default');
  assert.equal(selectionMode(['--selection', 'explicit']), 'explicit');
  assert.throws(() => selectionMode(['--selection', 'cua']), /--selection must be explicit or default/);
  assert.throws(() => selectionMode(['--selection']), /--selection must be explicit or default/);
});

test('the default mode starts only when nothing selects an engine: no CUA_NATIVE_ENGINE, no "engine" in engine.json; the device mode may stand', () => {
  const path = '/run/home/.config/cua/engine.json';
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => ({}), path}), []);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_DESKTOP_MODE: 'dedicated'}, settings: () => ({desktop: 'dedicated'}), path}), []);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: 'cua'}, settings: () => ({}), path}), ['CUA_NATIVE_ENGINE is set ("cua"): the default mode runs with none']);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: ''}, settings: () => ({}), path}), ['CUA_NATIVE_ENGINE is set (""): the default mode runs with none'], 'even empty: the runner sets none');
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => ({engine: 'cua', desktop: 'shared'}), path}), [`"engine": "cua" is in ${path}: the default mode runs with no "engine" there`]);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: () => ({engine: 'vendor'}), path}).length, 2, 'each input that is set is named');
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => { throw new Error('/x is not a JSON object'); }, path}), [`${path} cannot be read (/x is not a JSON object)`]);
});

// doctor --json's report, as `cua doctor --json` prints it on Linux: the engine row and the report's engine object
const doctor = (selected, reason, {status = 'pass', detail = 'cua\'s engine is selected (the default engine): …'} = {}) => ({ok: true, checks: [{name: 'repl.host', status: 'pass', detail: '…'}, {name: 'engine', status, detail}],
  engine: {selected, reason, preferred: {engine: selected === 'cua' ? 'cua' : 'cua', reason: 'default'}, service: selected}});

test('the default mode passes only when doctor says the default selected cua\'s engine; otherwise it names what was selected and why', () => {
  assert.equal(defaultSelectionProblem(doctor('cua', 'default')), null);
  // the negative control: the unflipped default
  assert.equal(defaultSelectionProblem({...doctor('vendor', 'default'), engine: {selected: 'vendor', reason: 'default', preferred: {engine: 'vendor', reason: 'default'}}}),
    'the session selects vendor (default), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem(doctor('cua', 'explicit')), 'the session selects cua (explicit), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem(doctor('vendor', 'engine_outdated', {status: 'warn'})), 'the session selects vendor (engine_outdated), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem({ok: false, checks: []}), 'cua doctor --json reports no engine selection');
  assert.equal(defaultSelectionProblem(null), 'cua doctor --json printed no report');
});

test('a fallback home passes only when the default keeps the vendor\'s engine for its own reason, with a warning naming cua install --engine', () => {
  assert.deepEqual(FALLBACK_HOMES, {none: 'engine_not_installed', previous: 'engine_outdated', released: 'engine_outdated', older: 'engine_outdated', unrecorded: 'engine_unrecorded'});
  const warned = reason => doctor('vendor', reason, {status: 'warn', detail: `cua's engine is the default, but … (${reason}): … cua install --engine …`});
  for (const [kind, reason] of Object.entries(FALLBACK_HOMES)) assert.equal(fallbackSelectionProblem(warned(reason), kind), null, kind);
  assert.equal(fallbackSelectionProblem(warned('engine_not_installed'), 'older'), 'the session selects vendor (engine_not_installed), not the vendor\'s engine for engine_outdated');
  assert.equal(fallbackSelectionProblem(doctor('cua', 'default'), 'older'), 'the session selects cua (default), not the vendor\'s engine for engine_outdated');
  const unwarned = doctor('vendor', 'engine_outdated', {status: 'pass', detail: '… cua install --engine'});
  assert.equal(fallbackSelectionProblem(unwarned, 'older'), 'doctor\'s engine row is pass, not a warning');
  const noRemedy = doctor('vendor', 'engine_outdated', {status: 'warn', detail: 'cua\'s engine is the default, but … (engine_outdated)'});
  assert.equal(fallbackSelectionProblem(noRemedy, 'older'), 'doctor\'s engine row does not name cua install --engine');
  const noReason = doctor('vendor', 'engine_outdated', {status: 'warn', detail: 'cua\'s engine is the default, but …: cua install --engine replaces it'});
  assert.equal(fallbackSelectionProblem(noReason, 'older'), 'doctor\'s engine row does not name its reason, engine_outdated');
  assert.equal(fallbackSelectionProblem(warned('engine_outdated'), 'other'), 'no fallback home other: none, previous, released, older or unrecorded');
});
