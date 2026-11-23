// How the Linux acceptance fixtures show which engine a session selected (#171 M5; the pre-flight's §3, "How the default
// is shown live"): the explicit mode names cua's engine as M4 ran them; the default mode names none, refuses to start
// unless nothing does, and reads the selection from `cua doctor --json`; the fallback homes' probe reads the default's
// refusal (#171 M6a), from doctor and from a refused open, each naming why and this cua's installer with --engine.
// Pure: no doctor runs here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FALLBACK_HOMES, defaultSelectionProblem, refusedOpenProblem, refusedSelectionProblem, selectionMode, unsetSelectionProblems} from '../scripts/accept/linux-selection.mjs';

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

// #171 M6a (F3): M5's fallback to the vendor's engine is a refusal. A fallback home passes only when doctor says the
// default prefers cua's engine and refuses every computer session for that home's own reason, its engine row a failure
// naming the reason and this cua's own installer with --engine (the absolute command the refusal names, ruling 1110).
const REMEDY = 'node /checkout/bin/cua.mjs install --engine';
const refusedDoctor = (reason, {status = 'fail', detail = `cua's engine is preferred (the default engine), but sessions here are refused (${reason}): … install this cua's engine with \`${REMEDY}\` …`,
  selected = null, preferred = {engine: 'cua', reason: 'default'}, refused = reason} = {}) => ({ok: false, checks: [{name: 'repl.host', status: 'pass', detail: '…'}, {name: 'engine', status, detail}],
  engine: {selected, reason: selected === null ? refused : 'default', refused: refused && {code: refused, message: '…'}, preferred, service: selected}});

test('a fallback home passes only when the default prefers cua\'s engine and refuses it for the home\'s own reason, naming this cua\'s installer', () => {
  assert.deepEqual(FALLBACK_HOMES, {none: 'engine_not_installed', previous: 'engine_outdated', released: 'engine_outdated', older: 'engine_outdated', unrecorded: 'engine_unrecorded'});
  const judge = (report, kind) => refusedSelectionProblem(report, kind, {remedy: REMEDY});
  for (const [kind, reason] of Object.entries(FALLBACK_HOMES)) assert.equal(judge(refusedDoctor(reason), kind), null, kind);
  // M5's fallback, the vendor's engine kept with a warning, is a failure now
  const kept = {...refusedDoctor('engine_outdated', {status: 'warn'}), engine: {selected: 'vendor', reason: 'engine_outdated', refused: null, preferred: {engine: 'cua', reason: 'default'}, service: 'vendor'}};
  assert.equal(judge(kept, 'older'), 'the session selects vendor (engine_outdated), where the default must refuse it for engine_outdated');
  assert.equal(judge(refusedDoctor('x', {selected: 'cua', refused: null}), 'older'), 'the session selects cua (default), where the default must refuse it for engine_outdated');
  assert.equal(judge(refusedDoctor('engine_not_installed'), 'older'), 'the session is refused for engine_not_installed, not engine_outdated');
  assert.equal(judge(refusedDoctor('engine_outdated', {preferred: {engine: 'cua', reason: 'explicit'}}), 'older'), 'doctor\'s preferred engine is cua (explicit), not cua\'s by default');
  assert.equal(judge(refusedDoctor('engine_outdated', {status: 'warn'}), 'older'), 'doctor\'s engine row is warn, not a failure');
  assert.equal(judge(refusedDoctor('engine_outdated', {detail: `… install this cua's engine with \`${REMEDY}\``}), 'older'), 'doctor\'s engine row does not name its reason, engine_outdated');
  assert.equal(judge(refusedDoctor('engine_outdated', {detail: '… refused (engine_outdated): run `cua install --engine`'}), 'older'), `doctor's engine row does not name ${REMEDY}`);
  assert.equal(judge(refusedDoctor('engine_outdated'), 'other'), 'no fallback home other: none, previous, released, older or unrecorded');
  assert.equal(judge(null, 'older'), 'cua doctor --json printed no report');
  // the default remedy is this checkout's own installer
  assert.match(refusedSelectionProblem(refusedDoctor('engine_outdated'), 'older'), /does not name node .*\/bin\/cua\.mjs install --engine$/);
});

// The refused open: `cua serve` exits 1 before it answers anything, saying the reason and the installer, and no engine
// runs below it. Anything less is not a refusal, and nothing that ran stands in for one.
test('a refused open: the serve exits 1 unanswered, naming the reason and the installer, with no engine below it', () => {
  const stderr = `cua: auto … selects cua's own engine, and the engine installed in this cua home (/h/engine/linux/cua-engine) is 0.4.3, older than 0.4.4, which this cua needs: install this cua's engine with \`${REMEDY}\` … [engine_outdated]\n  run \`node /checkout/bin/cua.mjs install\`; …\n`;
  const refused = {exit: {code: 1, signal: null}, stderr, answered: false, observed: []};
  const judge = (open, kind = 'older') => refusedOpenProblem(open, kind, {remedy: REMEDY});
  assert.equal(judge(refused), null);
  assert.equal(judge({...refused, exit: null}), 'cua serve did not refuse the open: it was still running when the probe stopped waiting');
  assert.equal(judge({...refused, exit: {code: 0, signal: null}}), 'cua serve exited with code 0, not 1');
  assert.equal(judge({...refused, exit: {code: null, signal: 'SIGKILL', forced: true}}), 'cua serve exited with code null, not 1');
  assert.equal(judge({...refused, answered: true}), 'cua serve answered the client: a session opened');
  assert.equal(judge(refused, 'none'), 'cua serve\'s refusal does not name engine_not_installed');
  assert.equal(judge({...refused, stderr: 'cua: … [engine_outdated]\n'}), `cua serve's refusal does not name ${REMEDY}`);
  assert.equal(judge({...refused, observed: [{exe: '/h/engine/linux/cua-engine', kind: 'cua'}]}), 'an engine ran below the refused serve: /h/engine/linux/cua-engine (cua)');
  assert.equal(judge({...refused, sampleError: 'proc unreadable'}), 'an engine observation failed (proc unreadable), so what ran below the serve is unknown');
  assert.equal(judge(refused, 'other'), 'no fallback home other: none, previous, released, older or unrecorded');
});
