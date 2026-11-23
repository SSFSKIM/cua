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

// Pilot A (run 45220897246): a run its producer stopped because the capture alert was in front (incompleteCause,
// scripts/native-baseline/macos.mjs) has no verdict to give, never a failure; any other incomplete run is still a
// runtime error, and the cause is read from the record, never from its message.
test('record: an incomplete run whose cause is the alert in front is NO VERDICT; other incomplete runs still fail', () => {
  const step = {record: '/o/vv/run-1/meta.json'};
  const error = 'setup.activate: TextEdit (pid 4009) is not the frontmost application after open -a TextEdit; the frontmost is com.apple.UserNotificationCenter (pid 2596)';
  const alert = {complete: false, error, incompleteCause: {cause: 'alert', at: 'setup.activate', front: {pid: 2596, bundleId: 'com.apple.UserNotificationCenter'}}};
  assert.deepEqual(check('record', step, 1, {[step.record]: alert}),
    ['NO VERDICT', `alert: /o/vv/run-1/meta.json stopped at setup.activate with com.apple.UserNotificationCenter (pid 2596) in front (${error})`]);
  assert.equal(check('record', step, 1, {[step.record]: {complete: false, error}})[0], 'FAIL', 'the message alone names no cause');
  assert.equal(check('record', step, 1, {[step.record]: {...alert, incompleteCause: {cause: 'other'}}})[0], 'FAIL');
  assert.deepEqual(check('record', step, 0, {[step.record]: {...alert, complete: true}}), ['PASS', null], 'a complete run is read as complete');
});

// Ruling 1149: a run whose side answered on another engine measured nothing of that side. Above all the cua side that
// attested the vendor's (state 1): NO VERDICT, its cause named, whatever the record says of itself.
test('ruling 1149: a run of the cua side that attests the vendor engine is NO VERDICT naming state 1, in each record\'s shape; never a pass', () => {
  const cua = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)}, vendor = {engine: 'vendor', version: null, build: 'r'};
  const step = {record: '/o/cc/run-1/meta.json', engine: 'cua'};
  const one = (record, exit = 1, s = step) => check('record', s, exit, {[s.record]: record});
  const fellBack = [
    // The native baseline's meta.json, stopped by its own engine check.
    {complete: false, error: 'this run: the vendor engine answered, not the requested cua', nativeEngine: {requested: 'cua', attested: [vendor], unattested: 0}},
    // The matrix's result.json, even one that calls itself complete.
    {complete: true, meta: {nativeEngine: {requested: 'cua', attested: [vendor], unattested: 0}}},
    // The native-mac suite's meta.json.
    {complete: false, engine: 'cua', error: 'the vendor engine answered, not the requested cua', engineAttestation: {attested: [cua, vendor], unattested: 0}},
  ];
  for (const record of fellBack) {
    const [status, reason] = one(record);
    assert.equal(status, 'NO VERDICT', JSON.stringify(record));
    assert.match(reason, /^the cua side is not measured: the cua side attested the vendor engine, a fallback that compares the vendor with itself \(state 1\)/);
  }
  assert.deepEqual(one({complete: true, nativeEngine: {requested: 'cua', attested: [cua], unattested: 0}}, 0), ['PASS', null]);
  // A complete record that cannot show which engine answered measured nothing it can name.
  assert.deepEqual(one({complete: true, nativeEngine: {requested: 'cua', attested: [], unattested: 0}}, 0),
    ['NO VERDICT', 'the cua side is not measured: no result attested an engine (cua/nativeEngine)']);
  assert.deepEqual(one({complete: true}, 0), ['NO VERDICT', 'the cua side is not measured: the record keeps no engine attestation']);
  // A run that stopped before anything attested stays the runtime error it was.
  assert.deepEqual(one({complete: false, error: 'the scenes refuse', nativeEngine: {requested: 'cua', attested: [], unattested: 0}}),
    ['FAIL', 'runtime error: the run is incomplete (the scenes refuse)']);
  // The other way: cua's engine on the vendor side is no fallback, and no measurement of the vendor either.
  const [status, reason] = one({complete: true, nativeEngine: {requested: 'vendor', attested: [cua], unattested: 0}}, 0, {...step, engine: 'vendor'});
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /^the vendor side is not measured: the result attested engine cua .* where engine vendor was expected/);

  // #212's observation-only cell: one run of the cua side on the vendor's engine makes the step NO VERDICT.
  const records = ['/o/save-sheet/cua/run-1/result.json', '/o/save-sheet/cua/run-2/result.json'];
  const sheet = {records, observe: 'textedit/intervention.saveSheet', engine: 'cua'};
  const observed = {section: 'intervention', id: sheet.observe, engine: 'cua', sample: 1, ok: false, invalid: 'observation only',
    outcome: {observed: {before: {count: 1, lines: [{index: 0}]}}}};
  const result = attested => ({complete: true, meta: {hosted: true, nativeEngine: {requested: 'cua', attested: [attested], unattested: 0}}, rows: [observed]});
  const [sheetStatus, sheetReason] = check('observation', sheet, 0, {[records[0]]: result(cua), [records[1]]: result(vendor)});
  assert.equal(sheetStatus, 'NO VERDICT');
  assert.match(sheetReason, /^\/o\/save-sheet\/cua\/run-2\/result\.json: the cua side is not measured: the cua side attested the vendor engine/);
  assert.equal(check('observation', sheet, 0, {[records[0]]: result(cua), [records[1]]: result(cua)})[0], 'PASS');
});

test('a judge is read by the verdict it printed: missing proof is NO VERDICT, the owner\'s calls OWNER, and no verdict at all a runtime error', () => {
  for (const verdict of ['PASS', 'FAIL', 'NO VERDICT', 'OWNER'])
    assert.deepEqual(check('verdict', {}, verdict === 'PASS' ? 0 : 1, {}, `wrote /o/comparison.md\nVERDICT: ${verdict}\n  missing: x`), [verdict, null]);
  assert.deepEqual(check('verdict', {}, 1, {}, 'Error: no results'), ['FAIL', 'runtime error: no verdict printed (exit 1)']);
});

test('#212\'s observation-only cell: every run asked for recorded complete, and the Save panel\'s structure observed, passes; NO VERDICT samples stay NO VERDICT; anything else fails', () => {
  const records = ['/o/save-sheet/cua/run-1/result.json', '/o/save-sheet/cua/run-2/result.json'];
  const step = {records, observe: 'textedit/intervention.saveSheet'};
  const row = extra => ({section: 'intervention', id: step.observe, engine: 'cua', sample: 1, ok: false, ...extra});
  const result = (rows, extra = {}) => ({complete: true, meta: {hosted: true}, rows, ...extra});
  const both = (one, two = one) => ({[records[0]]: one, [records[1]]: two});
  const structure = count => ({trailer: 'focused', count, lines: Array.from({length: count}, (_, index) => ({index, depth: 0, parent: null, id: null, head: 'AXSheet', focused: false}))});
  const invalid = 'the Save sheet\'s destination was not set to the run\'s folder (observation only)';
  const observed = row({invalid, outcome: {observed: {before: structure(3), after: structure(4)}}});
  assert.deepEqual(check('observation', step, 1, both(result([observed, row({invalid: 'x'})]), result([row({invalid: 'x'})]))),
    ['PASS', 'the Save panel\'s structure observed in 1 of 3 samples over 2 runs']);
  // An observation with no panel structure, or a row that ran through without one, is not the observation.
  const blank = row({invalid, outcome: {observed: {before: structure(0), after: structure(0)}}});
  assert.deepEqual(check('observation', step, 1, both(result([blank]))), ['FAIL', `driver failure: no observation recorded (${invalid})`]);
  const through = row({frontKey: {apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: true, key: true}, before: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}, after: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}}, outcome: {sheetOpen: true}});
  assert.equal(check('observation', step, 0, both(result([through])))[0], 'FAIL');
  // A run that did not complete is never a pass; what it observed stays in its record, and the reason says so.
  assert.deepEqual(check('observation', step, 1, both(result([observed]), result([observed], {complete: false, error: 'the run stopped'}))),
    ['FAIL', `runtime error: ${records[1]} is incomplete (the run stopped); 2 panel observations kept in the records`]);
  assert.deepEqual(check('observation', step, 1, {[records[0]]: result([observed])}),
    ['FAIL', `runtime error: no record at ${records[1]} (exit 1); 1 panel observation kept in the records`]);
  // The run stopped because the alert held its fixture's reset too: missing proof, not a failure. Any other reset failure fails.
  const blocked = {complete: false, error: 'stopped: the textedit fixture … could not be reset', meta: {hosted: true, fixturesHeld: [{row: step.observe, sample: 1, scene: 'textedit', reset: false, blockedBy: 'alert'}]}, rows: [observed]};
  assert.deepEqual(check('observation', step, 4, both(result([observed]), blocked)),
    ['NO VERDICT', `${records[1]} stopped: a fixture's cleanup the capture alert held could not be reset (stopped: the textedit fixture … could not be reset); 2 panel observations kept in the records`]);
  const otherwise = {...blocked, meta: {hosted: true, fixturesHeld: [{row: step.observe, sample: 1, scene: 'textedit', reset: false}]}};
  assert.equal(check('observation', step, 1, both(result([observed]), otherwise))[0], 'FAIL');
  assert.deepEqual(check('record', {record: records[1]}, 4, {[records[1]]: blocked}),
    ['NO VERDICT', `${records[1]} stopped: a fixture's cleanup the capture alert held could not be reset (stopped: the textedit fixture … could not be reset)`]);
  assert.deepEqual(check('observation', step, 1, both(result([observed]), result([]))), ['FAIL', `driver failure: no ${step.observe} sample recorded in ${records[1]}`]);
  const skipped = row({frontKey: {apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: false, key: false}, before: {front: 'com.apple.UserNotificationCenter', key: 'com.apple.UserNotificationCenter'}, after: null}});
  const [status, reason] = check('observation', step, 1, both(result([skipped, skipped]), result([skipped])));
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /no sample observed: activation 3/);
  assert.deepEqual(check('observation', step, 1, both(result([row({invalid: 'the untitled document did not open (not sent)'})]))),
    ['FAIL', 'driver failure: no observation recorded (the untitled document did not open (not sent))']);
  assert.deepEqual(check('observation', step, 1), ['FAIL', `runtime error: no record at ${records[0]} (exit 1)`]);
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
