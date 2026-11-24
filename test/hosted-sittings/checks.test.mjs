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

// Ruling 1154: a matrix run the alert guard stopped (a harness cell it refused, nothing clicked) has no verdict to give.
test('record: a matrix run the alert guard stopped is NO VERDICT, by its meta\'s mark, never by its message', () => {
  const step = {record: '/o/c/vendor/run-1/result.json'};
  const detail = 'alert window 90 (500,300 300x200) overlaps the openPanel window (300,150 800x500)';
  const stopped = {complete: false, problems: [`nothing sent: ${detail} (the alert guard, ruling 1154)`], meta: {alertGuardStop: {cause: 'alert', detail}}};
  assert.deepEqual(check('record', step, 1, {[step.record]: stopped}),
    ['NO VERDICT', `alert: /o/c/vendor/run-1/result.json stopped: the alert guard refused a harness cell (${detail})`]);
  assert.equal(check('record', step, 1, {[step.record]: {...stopped, meta: {}}})[0], 'FAIL', 'the message alone names no cause');
  // A fixture's reset the guard refused for an unread screen is missing proof too.
  const unread = {complete: false, problems: ['stopped: the textedit fixture could not be reset'], meta: {fixturesHeld: [{row: 'r', sample: 1, scene: 'textedit', reset: false, blockedBy: 'unread'}]}};
  assert.equal(check('record', step, 1, {[step.record]: unread})[0], 'NO VERDICT');
});

// Ruling 1169: both sides of a pair stand on one frame in every run. A run's record names its pair's (`pair`); a pair
// whose sides launched at, or read back, different frames is NO VERDICT naming the cause, never a pass.
test('record: a pair whose sides stood on different frames is NO VERDICT naming them; one frame passes, a pair not yet recorded changes nothing', () => {
  const frame = (x, width = 800) => ({x, y: 60, width, height: 760});
  const matrix = chrome => ({complete: true, meta: {venue: {frames: {chrome: frame(22)}}, placement: {alerts: [], scenes: {chrome: {from: chrome, moved: false}}}}});
  const step = {record: '/o/c/cua/run-1/result.json', pair: '/o/c/vendor/run-1/result.json'};
  assert.deepEqual(check('record', step, 0, {[step.record]: matrix(frame(22)), [step.pair]: matrix(frame(22))}), ['PASS', null]);
  const [status, reason] = check('record', step, 0, {[step.record]: matrix(frame(30)), [step.pair]: matrix(frame(22))});
  assert.equal(status, 'NO VERDICT');
  assert.equal(reason, 'venue: /o/c/cua/run-1/result.json and its pair /o/c/vendor/run-1/result.json did not stand on one frame (chrome: 30,60 800x760 on this side, 22,60 800x760 on its pair)');
  assert.deepEqual(check('record', step, 0, {[step.record]: matrix(frame(22))}), ['PASS', null], 'no pair record: nothing to compare');
  // The baseline's TextEdit, each window it read back after a step.
  const baseline = width => ({complete: true, placement: [{at: 'setup.newDocument', alerts: [], windows: [{scene: 'textedit', number: 7, from: {x: 256, y: 107, width, height: 505}, moved: false}]}]});
  const a = {record: '/o/cc/run-1/meta.json', pair: '/o/vc/run-1/meta.json'};
  assert.equal(check('record', a, 0, {[a.record]: baseline(503), [a.pair]: baseline(520)})[0], 'NO VERDICT');
  // An incomplete run keeps its own reading: a runtime error is never hidden behind the frames.
  assert.equal(check('record', step, 1, {[step.record]: {...matrix(frame(30)), complete: false, problems: ['lane lost']}, [step.pair]: matrix(frame(22))})[0], 'FAIL');
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
  // An incomplete vendor-side run with one cua answer and one left unattested: the wrong engine outranks the missing one,
  // so it is NO VERDICT on the wrong engine, not the runtime error of an incomplete record.
  const [mixedStatus, mixedReason] = one({complete: false, error: 'stopped', nativeEngine: {requested: 'vendor', attested: [cua], unattested: 1}}, 1, {...step, engine: 'vendor'});
  assert.equal(mixedStatus, 'NO VERDICT');
  assert.match(mixedReason, /^the vendor side is not measured: the result attested engine cua/);

  // #212's save-sheet cell: one run of the cua side on the vendor's engine makes the step NO VERDICT.
  const records = ['/o/save-sheet/cua/run-1/result.json', '/o/save-sheet/cua/run-2/result.json'];
  const sheet = {records, row: 'textedit/intervention.saveSheet', engine: 'cua'};
  const passed = {section: 'intervention', id: sheet.row, engine: 'cua', sample: 1, ok: true, frontKey: TEXTEDIT_FRONT,
    outcome: {sheetOpen: true, destinationFiles: [], unsaved: {document: false, edited: true, editedFrom: 'window'}, goTo: {closed: true, sheetUp: true, escapes: 0, closeClicked: false}}};
  const result = attested => ({complete: true, meta: {hosted: true, nativeEngine: {requested: 'cua', attested: [attested], unattested: 0}}, rows: [passed]});
  const [sheetStatus, sheetReason] = check('saveSheet', sheet, 0, {[records[0]]: result(cua), [records[1]]: result(vendor)});
  assert.equal(sheetStatus, 'NO VERDICT');
  assert.match(sheetReason, /^\/o\/save-sheet\/cua\/run-2\/result\.json: the cua side is not measured: the cua side attested the vendor engine/);
  assert.equal(check('saveSheet', sheet, 0, {[records[0]]: result(cua), [records[1]]: result(cua)})[0], 'PASS');
});

test('a judge is read by the verdict it printed: missing proof is NO VERDICT, the owner\'s calls OWNER, and no verdict at all a runtime error', () => {
  for (const verdict of ['PASS', 'FAIL', 'NO VERDICT', 'OWNER'])
    assert.deepEqual(check('verdict', {}, verdict === 'PASS' ? 0 : 1, {}, `wrote /o/comparison.md\nVERDICT: ${verdict}\n  missing: x`), [verdict, null]);
  assert.deepEqual(check('verdict', {}, 1, {}, 'Error: no results'), ['FAIL', 'runtime error: no verdict printed (exit 1)']);
});

// C-6's two rows of #212's save-sheet cell (save-sheet/{vendor,cua}/run-1/result.json rows[0]), trimmed to what the step
// reads: the vendor's reached the act and failed on AXEdited false read from the close button; cua's never reached it,
// the Go To dialog's field not identified.
const TEXTEDIT_FRONT = Object.freeze({apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: true, key: true},
  before: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}, after: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}});
const C6_VENDOR = Object.freeze({section: 'intervention', id: 'textedit/intervention.saveSheet', scene: 'textedit', regime: 'frontmost', method: 'setValue', case: 'saveSheet',
  engine: 'vendor', sample: 1, ok: false, inCellMs: 498.99, wallMs: 4287.19, inputRoute: null, frontKey: TEXTEDIT_FRONT, attempts: 1,
  outcome: {stopped: false, agree: null, effectsNamed: false, interruption: null, sheetOpen: true, nameWritten: true, destinationFiles: [], initialWhere: 'textedit',
    unsaved: {document: false, edited: false, editedFrom: 'closeButton'}, threw: false, errorName: null, message: null, leadMs: 10, validity: null}});
const C6_CUA = Object.freeze({section: 'intervention', id: 'textedit/intervention.saveSheet', scene: 'textedit', regime: 'frontmost', method: 'setValue', case: 'saveSheet',
  engine: 'cua', sample: 1, ok: false, invalid: 'the Save sheet\'s destination was not set to the run\'s folder (the Go To dialog and its focused path field were not identified)',
  outcome: {goTo: {closed: true, sheetUp: true, escapes: 1, closeClicked: false}}, attempts: 1});

test('#212\'s save-sheet step judges the real path\'s rows: C-6\'s vendor row fails naming its finding, cua\'s is NO VERDICT naming why', () => {
  const cua = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)}, vendor = {engine: 'vendor', version: null, build: 'r'};
  const sheetStep = engine => ({row: 'textedit/intervention.saveSheet', engine, records: [`/o/save-sheet/${engine}/run-1/result.json`]});
  const recorded = (engine, rows) => ({[`/o/save-sheet/${engine}/run-1/result.json`]: {complete: true, meta: {hosted: true, nativeEngine: {requested: engine, attested: [engine === 'cua' ? cua : vendor], unattested: 0}}, rows}});
  const [vendorStatus, vendorReason] = check('saveSheet', sheetStep('vendor'), 1, recorded('vendor', [C6_VENDOR]));
  assert.equal(vendorStatus, 'FAIL');
  assert.equal(vendorReason, '1 sample over 1 run: vendor run-1 sample 1 FAIL (the edits read saved: AXEdited false, from the closeButton); the run\'s folder empty; AXDocument none, AXEdited false (closeButton); Go To not recorded');
  const [cuaStatus, cuaReason] = check('saveSheet', sheetStep('cua'), 1, recorded('cua', [C6_CUA]));
  assert.equal(cuaStatus, 'NO VERDICT');
  assert.equal(cuaReason, `1 sample over 1 run: cua run-1 sample 1 NO VERDICT (${C6_CUA.invalid}); Go To closed (Escape 1x)`);
});

test('#212\'s save-sheet step: a row that passed passes; FAIL outranks NO VERDICT, which outranks PASS; a run\'s record is classed first', () => {
  const records = ['/o/save-sheet/cua/run-1/result.json', '/o/save-sheet/cua/run-2/result.json'];
  const step = {records, row: 'textedit/intervention.saveSheet'};
  const row = extra => ({section: 'intervention', id: step.row, engine: 'cua', sample: 1, frontKey: TEXTEDIT_FRONT, ...extra});
  const outcome = {sheetOpen: true, destinationFiles: [], unsaved: {document: false, edited: true, editedFrom: 'window'}, agree: true, effectsNamed: true,
    goTo: {closed: true, sheetUp: true, escapes: 0, closeClicked: false}, identification: undefined};
  const passed = row({ok: true, outcome});
  const result = (rows, extra = {}) => ({complete: true, meta: {hosted: true}, rows, ...extra});
  const both = (one, two = one) => ({[records[0]]: one, [records[1]]: two});
  assert.deepEqual(check('saveSheet', step, 0, both(result([passed]))),
    ['PASS', '2 samples over 2 runs: cua run-1 sample 1 PASS; the run\'s folder empty; AXDocument none, AXEdited true (window); Go To closed (Escape 0x) | cua run-2 sample 1 PASS; the run\'s folder empty; AXDocument none, AXEdited true (window); Go To closed (Escape 0x)']);
  // A finding the row recorded is named as recorded; the folder and the proof as the row kept them.
  const saved = row({ok: false, outcome: {...outcome, destinationFiles: ['cua-212-intended.rtf'], unsaved: {document: true, edited: false, editedFrom: 'window'},
    findings: ['the run\'s folder held cua-212-intended.rtf', 'a document on disk behind TextEdit\'s window (AXDocument names a file)']}});
  const [savedStatus, savedReason] = check('saveSheet', step, 1, both(result([passed]), result([saved])));
  assert.equal(savedStatus, 'FAIL');
  assert.match(savedReason, /cua run-2 sample 1 FAIL \(the run's folder held cua-212-intended\.rtf; a document on disk behind TextEdit's window \(AXDocument names a file\)\); the run's folder held cua-212-intended\.rtf; AXDocument names a file/);
  // An invalid row is missing proof; the folder and the proof it kept still said, the unread proof with why.
  const invalid = row({ok: false, invalid: 'the act cell failed', outcome: {goTo: outcome.goTo, unsaved: {unread: 'the Save sheet was not cancelled first (the sheet still up)'},
    cancel: {cancelled: false, destinationRemoved: null, destinationFiles: null}, identification: 'field not focused within 3 s'}});
  const [invalidStatus, invalidReason] = check('saveSheet', step, 1, both(result([passed]), result([invalid])));
  assert.equal(invalidStatus, 'NO VERDICT');
  assert.match(invalidReason, /cua run-2 sample 1 NO VERDICT \(the act cell failed\); the run's folder unread; unsaved unread \(the Save sheet was not cancelled first \(the sheet still up\)\); Go To closed \(Escape 0x; field not focused within 3 s\)$/);
  assert.equal(check('saveSheet', step, 1, both(result([saved]), result([invalid])))[0], 'FAIL');
  // The folder as the cancel found it, when the act's check never read it.
  const cancelled = row({ok: false, invalid: 'the act cell failed', outcome: {cancel: {cancelled: true, destinationRemoved: true, destinationFiles: []}}});
  assert.match(check('saveSheet', step, 1, both(result([cancelled])))[1], /NO VERDICT \(the act cell failed\); the run's folder empty at the cancel; Go To not recorded$/);
  // A row that failed with nothing to name says so.
  assert.match(check('saveSheet', step, 1, both(result([row({ok: false, outcome: {sheetOpen: true, destinationFiles: [], unsaved: {document: false, edited: true}, agree: true, effectsNamed: true}})])))[1],
    /FAIL \(ok false, no finding named\)/);
  // A run that did not complete is never a pass, nor is a record missing; the rows' own judgments do not enter.
  assert.deepEqual(check('saveSheet', step, 1, both(result([passed]), result([passed], {complete: false, error: 'the run stopped'}))),
    ['FAIL', `runtime error: ${records[1]} is incomplete (the run stopped)`]);
  assert.deepEqual(check('saveSheet', step, 1, {[records[0]]: result([passed])}), ['FAIL', `runtime error: no record at ${records[1]} (exit 1)`]);
  assert.deepEqual(check('saveSheet', step, 1), ['FAIL', `runtime error: no record at ${records[0]} (exit 1); also: runtime error: no record at ${records[1]} (exit 1)`]);
  // The run stopped because the alert held its fixture's reset too: missing proof, not a failure. Any other reset failure fails.
  const blocked = {complete: false, error: 'stopped: the textedit fixture … could not be reset', meta: {hosted: true, fixturesHeld: [{row: step.row, sample: 1, scene: 'textedit', reset: false, blockedBy: 'alert'}]}, rows: [passed]};
  assert.deepEqual(check('saveSheet', step, 4, both(result([passed]), blocked)),
    ['NO VERDICT', `${records[1]} stopped: a fixture's cleanup the capture alert held could not be reset (stopped: the textedit fixture … could not be reset)`]);
  const otherwise = {...blocked, meta: {hosted: true, fixturesHeld: [{row: step.row, sample: 1, scene: 'textedit', reset: false}]}};
  assert.equal(check('saveSheet', step, 1, both(result([passed]), otherwise))[0], 'FAIL');
  assert.deepEqual(check('saveSheet', step, 1, both(result([passed]), result([]))), ['FAIL', `driver failure: no ${step.row} sample recorded in ${records[1]}`]);
  // A sample with no verdict (the activation did not take, a cell the key-window requirement refused) is NO VERDICT, named.
  const skipped = row({ok: false, frontKey: {apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: false, key: false}, before: {front: 'com.apple.UserNotificationCenter', key: 'com.apple.UserNotificationCenter'}, after: null}});
  const keyWindowed = row({ok: false, frontKey: undefined, invalid: 'the alert guard refused the cell: nothing of it was sent', alertGuard: {cause: 'keyWindow', detail: 'the textedit app holds no key window'}});
  const [status, reason] = check('saveSheet', step, 1, both(result([skipped]), result([keyWindowed])));
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /cua run-1 sample 1 NO VERDICT \(activation: [^)]*\); Go To not recorded \| cua run-2 sample 1 NO VERDICT \(keyWindow: the alert guard: the textedit app holds no key window\); Go To not recorded$/);
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

// Every record is read before the step's status is chosen, so the order of the records changes nothing. The precedence:
// another engine (NO VERDICT), then a reset the alert held (NO VERDICT), then a missing or incomplete run (FAIL), then a
// complete run that shows no engine (NO VERDICT). The other records' findings stay in the reason.
test('ruling 1149: #212\'s records are all read before the step\'s status; the precedence is the step\'s, whatever the records\' order', () => {
  const cua = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)}, vendor = {engine: 'vendor', version: null, build: 'r'};
  const [A, B] = ['/o/save-sheet/cua/run-1/result.json', '/o/save-sheet/cua/run-2/result.json'];
  const observe = 'textedit/intervention.saveSheet';
  const row = {section: 'intervention', id: observe, engine: 'cua', sample: 1, ok: false, invalid: 'the act cell failed', outcome: {}};
  const attesting = (answer, extra = {}) => ({complete: true, rows: [row], ...extra, meta: {hosted: true, nativeEngine: {requested: 'cua', attested: [answer], unattested: 0}, ...extra.meta}});
  const plain = attesting(cua, {complete: false, error: 'the run stopped'});
  const held = attesting(cua, {complete: false, error: 'stopped: the reset was held', meta: {fixturesHeld: [{row: observe, sample: 1, scene: 'textedit', reset: false, blockedBy: 'alert'}]}});
  const fellBack = attesting(vendor);
  const bothOrders = (first, second) => [
    check('saveSheet', {records: [A, B], row: observe, engine: 'cua'}, 1, {...(first ? {[A]: first} : {}), ...(second ? {[B]: second} : {})}),
    check('saveSheet', {records: [A, B], row: observe, engine: 'cua'}, 1, {...(second ? {[A]: second} : {}), ...(first ? {[B]: first} : {})}),
  ];
  // An incomplete run beside one the alert held: NO VERDICT in either order, the other run named.
  for (const [status, reason] of bothOrders(plain, held)) {
    assert.equal(status, 'NO VERDICT');
    assert.match(reason, /stopped: a fixture's cleanup the capture alert held could not be reset/);
    assert.match(reason, /; also: runtime error: \/o\/save-sheet\/cua\/run-\d\/result\.json is incomplete \(the run stopped\)/);
  }
  // A missing record beside a run of the vendor's engine: NO VERDICT naming state 1, in either order, the missing one named.
  for (const [status, reason] of bothOrders(null, fellBack)) {
    assert.equal(status, 'NO VERDICT');
    assert.match(reason, /the cua side is not measured: the cua side attested the vendor engine/);
    assert.match(reason, /; also: runtime error: no record at \/o\/save-sheet\/cua\/run-\d\/result\.json \(exit 1\)/);
  }
  // An incomplete run beside a complete one showing no engine: the incomplete one's FAIL, in either order.
  const unattested = {complete: true, rows: [row], meta: {hosted: true}};
  for (const [status, reason] of bothOrders(plain, unattested)) {
    assert.equal(status, 'FAIL');
    assert.match(reason, /^runtime error: \/o\/save-sheet\/cua\/run-\d\/result\.json is incomplete \(the run stopped\); also: .*the record keeps no engine attestation/);
  }
});

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

test('T3b\'s staged onboarding is read by its record and judged stage by stage; no record is NO VERDICT, never a pass', () => {
  const step = {record: '/o/onboarding.json'};
  assert.deepEqual(check('onboarding', step, 1), ['NO VERDICT', 'no onboarding record at /o/onboarding.json (exit 1)']);
  assert.deepEqual(check('onboarding', step, 0, {[step.record]: {kind: 'hosted-onboarding', hosted: true, complete: false, problem: 'the driver stopped: no lane', stages: []}}),
    ['NO VERDICT', 'incomplete: 4 stage(s) not run (the driver stopped: no lane)']);
});
