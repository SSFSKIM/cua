// How a sitting's step is read (scripts/hosted-sittings/checks.mjs): a measurement by its own record (a runtime error
// apart from what it measured), a judge by the verdict it printed (NO VERDICT and OWNER kept as such), #212's
// observation-only cell by the observation it must record, sitting E's lanes by a fresh report that shows the engine and
// host selected. Records are built in memory.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHECKS} from '../../scripts/hosted-sittings/checks.mjs';

const read = (records, log = '') => ({readJson: path => records[path] ?? null, logText: () => log, exists: path => Object.hasOwn(records, path)});
const check = (name, step, exit, records = {}, log = '') => CHECKS[name](step, {exit, ...read(records, log)});

test('a measurement is read by its record: complete is recorded whatever its exit, a missing or incomplete record is a runtime error', () => {
  const step = {record: '/o/vc/run-1/meta.json'};
  assert.deepEqual(check('record', step, 0, {[step.record]: {complete: true}}), ['PASS', null]);
  const [status, reason] = check('record', step, 1, {[step.record]: {complete: true}});
  assert.equal(status, 'PASS');
  assert.match(reason, /exit 1 is the run's own outcome/);
  assert.deepEqual(check('record', step, 1, {[step.record]: {complete: false, error: 'the engine did not stop'}}), ['FAIL', 'runtime error: the run is incomplete (the engine did not stop)']);
  assert.deepEqual(check('record', step, 1, {[step.record]: {complete: false, problems: ['lane lost']}}), ['FAIL', 'runtime error: the run is incomplete (lane lost)']);
  assert.deepEqual(check('record', step, 1), ['FAIL', 'runtime error: no record at /o/vc/run-1/meta.json (exit 1)']);
});

test('a judge is read by the verdict it printed: missing proof is NO VERDICT, the owner\'s calls OWNER, and no verdict at all a runtime error', () => {
  for (const verdict of ['PASS', 'FAIL', 'NO VERDICT', 'OWNER'])
    assert.deepEqual(check('verdict', {}, verdict === 'PASS' ? 0 : 1, {}, `wrote /o/comparison.md\nVERDICT: ${verdict}\n  missing: x`), [verdict, null]);
  assert.deepEqual(check('verdict', {}, 1, {}, 'Error: no results'), ['FAIL', 'runtime error: no verdict printed (exit 1)']);
});

test('#212\'s observation-only cell: the observation recorded passes, NO VERDICT samples stay NO VERDICT, anything else is a driver failure', () => {
  const step = {record: '/o/save-sheet/cua/run-1/result.json', observe: 'textedit/intervention.saveSheet'};
  const row = extra => ({section: 'intervention', id: step.observe, engine: 'cua', sample: 1, ok: false, ...extra});
  const result = rows => ({[step.record]: {complete: true, meta: {hosted: true}, rows}});
  const observed = row({invalid: 'the Save sheet\'s destination was not set', outcome: {observed: {count: 2, lines: []}}});
  assert.deepEqual(check('observation', step, 1, result([observed, row({invalid: 'x'})])), ['PASS', 'observed in 1 of 2 samples']);
  const skipped = row({frontKey: {apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: false, key: false}, before: {front: 'com.apple.UserNotificationCenter', key: 'com.apple.UserNotificationCenter'}, after: null}});
  const [status, reason] = check('observation', step, 1, result([skipped, skipped]));
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /no sample observed: activation 2/);
  assert.deepEqual(check('observation', step, 1, result([row({invalid: 'the untitled document did not open (not sent)'})])),
    ['FAIL', 'driver failure: no observation recorded (the untitled document did not open (not sent))']);
  assert.deepEqual(check('observation', step, 1, result([])), ['FAIL', 'driver failure: no textedit/intervention.saveSheet sample recorded']);
  assert.deepEqual(check('observation', step, 1), ['FAIL', 'runtime error: no record at /o/save-sheet/cua/run-1/result.json (exit 1)']);
});

// Sitting E's homes (scripts/accept/macos-selection.mjs HOMES) as each ref selects them: before the flip the vendor's
// default holds in every home (reason default, the vendor host for its native peer); on the flip the default home selects
// cua's engine and each fallback keeps the vendor's for its own reason.
const PRE_FLIP = {selected: 'vendor', reason: 'default', host: {host: 'vendor', reason: 'macos_native_peer_requires_vendor', status: 'pass'}};
const FLIP = {default: {selected: 'cua', reason: 'default', host: {host: 'cua', reason: 'cua_engine', status: 'pass'}},
  none: {selected: 'vendor', reason: 'engine_not_installed', host: {host: 'vendor', reason: 'engine_not_installed', status: 'warn'}},
  node: {selected: 'vendor', reason: 'own_host_node_unavailable', host: {host: 'vendor', reason: 'own_host_node_unavailable', status: 'warn'}},
  outdated: {selected: 'vendor', reason: 'engine_outdated', host: {host: 'vendor', reason: 'engine_outdated', status: 'warn'}}};
const KINDS = ['default', 'none', 'node', 'outdated'];
const preFlipHomes = () => Object.fromEntries(KINDS.map(kind => [kind, {mode: 'default', ...PRE_FLIP, problem: 'selects the vendor'}]));
const flipHomes = () => Object.fromEntries(KINDS.map(kind => [kind, {mode: 'default', ...FLIP[kind], problem: null}]));

test('sitting E: the expected red is the judge\'s, on a fresh report in which every home selects as the pre-flip ref does; the flip shows cua\'s', () => {
  const step = {report: '/o/fixture.json', lane: 'fixture', expect: 1};
  const report = (verdict, homes, lane = 'fixture') => ({[step.report]: {lane, verdict, homes}});
  assert.deepEqual(check('selection', step, 1, report('FAIL', preFlipHomes())),
    ['PASS', 'the judge\'s FAIL: every home (default, none, node, outdated) selects the vendor engine (default) on the vendor host (macos_native_peer_requires_vendor)']);
  const homes = (kind, home) => ({...preFlipHomes(), [kind]: home});
  // The default home fell back for want of an engine: a FAIL, but not the pre-flip ref's.
  assert.deepEqual(check('selection', step, 1, report('FAIL', homes('default', {...PRE_FLIP, reason: 'engine_not_installed', problem: 'x'}))),
    ['FAIL', 'not the expected red: the default home selects the vendor engine (engine_not_installed) on the vendor host (macos_native_peer_requires_vendor), not the vendor engine (default) on the vendor host (macos_native_peer_requires_vendor)']);
  const {none, node, outdated, ...onlyDefault} = preFlipHomes();
  assert.deepEqual(check('selection', step, 1, report('FAIL', onlyDefault)), ['FAIL', 'not the expected red: no observation of the none, node, outdated homes']);
  assert.deepEqual(check('selection', step, 1, report('FAIL', homes('node', {problem: 'CUA_NATIVE_ENGINE is set'}))),
    ['FAIL', 'not the expected red: no observation of the node home (CUA_NATIVE_ENGINE is set)']);
  assert.deepEqual(check('selection', step, 1, report('FAIL', homes('outdated', {selected: null, reason: null, host: null, problem: 'cua doctor --json printed no report'}))),
    ['FAIL', 'not the expected red: no observation of the outdated home (cua doctor --json printed no report)']);
  assert.deepEqual(check('selection', step, 1, report('FAIL', homes('default', {...PRE_FLIP, selected: 'cua'}))),
    ['FAIL', 'not the expected red: the default home selects the cua engine (default) on the vendor host (macos_native_peer_requires_vendor), not the vendor engine (default) on the vendor host (macos_native_peer_requires_vendor)']);
  assert.deepEqual(check('selection', step, 1, report('FAIL', preFlipHomes(), 'approved')), ['FAIL', 'the report is the approved lane\'s, not the fixture lane\'s']);
  assert.deepEqual(check('selection', step, 1), ['FAIL', 'no report at /o/fixture.json: the exit (1) is not its judge\'s']);
  assert.deepEqual(check('selection', step, 2, report('FAIL', preFlipHomes())), ['FAIL', 'exit 2, expected 1']);
  const flip = {...step, expect: 0};
  assert.deepEqual(check('selection', flip, 0, report('PASS', flipHomes())),
    ['PASS', 'the judge\'s PASS: the default home selects the cua engine (default) on the cua host (cua_engine), and each fallback home keeps the vendor\'s for its reason']);
  assert.deepEqual(check('selection', flip, 0, report('PASS', {...flipHomes(), default: {...FLIP.default, host: {host: 'vendor', reason: 'x'}}})),
    ['FAIL', 'not the flip: the default home selects the cua engine (default) on the vendor host (x), not the cua engine (default) on the cua host (cua_engine)']);
  assert.deepEqual(check('selection', flip, 0, report('PASS', {...flipHomes(), none: {...FLIP.none, reason: 'default'}})),
    ['FAIL', 'not the flip: the none home selects the vendor engine (default) on the vendor host (engine_not_installed), not the vendor engine (engine_not_installed) on the vendor host (engine_not_installed)']);
});
