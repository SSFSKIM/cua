// The hosted sittings' plans (scripts/hosted-sittings/plan.mjs; the M4/M5 pre-flight §7 "Hosted sittings" A to F):
// the exact commands each sitting's one job runs on the runner, both engines on one machine with their lanes
// alternating, and the pilot's smallest form of each. Pure: nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACCEPT_NATIVE_ITEMS, DEVICE, SITTINGS, sittingContext, sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {runSitting} from '../../scripts/hosted-sittings/run.mjs';

const CTX = {commit: 'c'.repeat(40), out: '/w/out', approvedRuntime: '/Users/runner/Library/Application Support/cua',
  approvedEngine: '/Users/runner/Library/Application Support/cua/engine/cua Engine.app', runId: '45144483807-1', olderNode: '/t/node/22.14.0/arm64/bin/node', scratch: '/t/scratch', flipped: false};
const plan = (sitting, extra = {}) => sittingPlan(sitting, {...CTX, ...extra});
const ids = p => p.steps.map(s => s.id);
const argOf = (step, flag) => step.argv[step.argv.indexOf(flag) + 1];
const approved = step => [argOf(step, '--approved-runtime'), argOf(step, '--approved-engine')];

test('six sittings, A to F, each one plan for one job', () => {
  assert.deepEqual(SITTINGS, ['a', 'b', 'c', 'd', 'e', 'f']);
  for (const s of SITTINGS) for (const pilot of [false, true]) {
    const p = plan(s, {pilot});
    assert.equal(p.sitting, s);
    assert.equal(p.form, pilot ? 'pilot' : 'full');
    assert.ok(p.steps.length > 0 && new Set(ids(p)).size === p.steps.length, `${s} step ids are unique`);
    for (const step of p.steps) for (const need of step.needs ?? []) assert.ok(ids(p).indexOf(need) >= 0 && ids(p).indexOf(need) < ids(p).indexOf(step.id), `${step.id} needs an earlier step`);
  }
  assert.throws(() => plan('g'), /no sitting g/);
});

// Ruling 1149: each run's check reads the engine its side attested, so every step that reads a run's record names the
// engine of its side, the one the run pins; #216's witness is read by the verdict it prints, NO VERDICT kept as such.
test('ruling 1149: every step that reads a run\'s record names the engine its side pins, and B\'s lanes are read by their records', () => {
  for (const s of ['a', 'b', 'c']) for (const pilot of [false, true]) {
    const reading = plan(s, {pilot}).steps.filter(step => ['record', 'saveSheet'].includes(step.check));
    assert.ok(reading.length > 0, s);
    for (const step of reading) assert.equal(step.engine, argOf(step, '--engine'), `${s} ${step.id}`);
  }
  assert.deepEqual(plan('b').steps.slice(1, 3).map(s => [s.check, s.record, s.engine]), [['record', '/w/out/vendor/meta.json', 'vendor'], ['record', '/w/out/cua/meta.json', 'cua']]);
  assert.equal(plan('d').steps.find(s => s.id === 'approval-cycles').check, 'verdict');
});

// Ruling 1169: both sides of every pair a judge compares stood on one frame, so each run's record names its pair's
// (./checks.mjs `record`): in A each lane's run i the run i of the lane before it (vc after vv, cc after vc, and so
// comparison C's vv and cc through vc), in B the cua lane the vendor lane, in C each cua run the vendor run of its number.
test('ruling 1169: each run after the first side names its pair\'s record, so the record check holds both sides to one frame', () => {
  const pairs = (s, pilot = false) => plan(s, {pilot}).steps.filter(step => step.check === 'record').map(step => [step.record, step.pair ?? null]);
  assert.deepEqual(pairs('a', true), [['/w/out/vv/run-1/meta.json', null], ['/w/out/vc/run-1/meta.json', '/w/out/vv/run-1/meta.json'], ['/w/out/cc/run-1/meta.json', '/w/out/vc/run-1/meta.json']]);
  assert.deepEqual(pairs('a').filter(([record]) => record.includes('run-3')).map(([, pair]) => pair), [null, '/w/out/vv/run-3/meta.json', '/w/out/vc/run-3/meta.json']);
  assert.deepEqual(pairs('b'), [['/w/out/vendor/meta.json', null], ['/w/out/cua/meta.json', '/w/out/vendor/meta.json']]);
  assert.deepEqual(pairs('c').filter(([record]) => record.includes('run-2')), [['/w/out/vendor/run-2/result.json', null], ['/w/out/cua/run-2/result.json', '/w/out/vendor/run-2/result.json']]);
});

test('A: three runs of each lane, alternating vendor on vendor, cua on vendor, cua on cua, over the loopback device and the run\'s install; then comparisons A, B and C', () => {
  const full = plan('a');
  const runs = full.steps.filter(s => s.kind === 'run');
  assert.deepEqual(runs.map(s => s.id), ['vv-1', 'vc-1', 'cc-1', 'vv-2', 'vc-2', 'cc-2', 'vv-3', 'vc-3', 'cc-3']);
  for (const step of runs) {
    assert.deepEqual(step.argv.slice(0, 5), ['node', 'scripts/native-baseline.mjs', 'run', '--device', DEVICE]);
    assert.deepEqual(approved(step), [CTX.approvedRuntime, CTX.approvedEngine]);
    assert.equal(argOf(step, '--experiment'), 'hosted-45144483807-1-a');
  }
  assert.deepEqual(['vv-1', 'vc-1', 'cc-1'].map(id => full.steps.find(s => s.id === id)).map(s => [argOf(s, '--host'), argOf(s, '--engine'), argOf(s, '--out')]),
    [['vendor', 'vendor', '/w/out/vv/run-1'], ['vendor', 'cua', '/w/out/vc/run-1'], ['cua', 'cua', '/w/out/cc/run-1']]);
  assert.deepEqual(full.steps.filter(s => s.kind === 'verdict').map(s => s.argv.slice(3, 6)),
    [['--engines', '/w/out/vv', '/w/out/vc'], ['--hosts', '/w/out/vc', '/w/out/cc'], ['--end-to-end', '/w/out/vv', '/w/out/cc']]);
  assert.deepEqual(plan('a', {pilot: true}).steps.filter(s => s.kind === 'run').map(s => s.id), ['vv-1', 'vc-1', 'cc-1'], 'the pilot: one run a lane');
  // Each run is read by its record (a runtime error apart from what it measured), each comparison by the verdict it printed.
  assert.deepEqual(['vc-2'].map(id => full.steps.find(s => s.id === id)).map(s => [s.check, s.record]), [['record', '/w/out/vc/run-2/meta.json']]);
  assert.ok(full.steps.filter(s => s.kind === 'verdict').every(s => s.check === 'verdict' && s.pilotNoVerdict === true));
});

// A run the alert guard stopped may leave its TextEdit running (its cleanup's ⌘Q refused while the alert holds the
// key), and the next run refuses a running TextEdit at its preflight: so each A run needs the one before it to have
// passed. The runs after a stop are SKIP, never FAILs of their own, and the stop's NO VERDICT is the sitting's.
test('A: each run needs the one before it; after a run the guard stopped the rest are SKIP and the sitting is NO VERDICT, not PASS', async () => {
  for (const pilot of [false, true]) {
    const runs = plan('a', {pilot}).steps.filter(s => s.kind === 'run');
    assert.deepEqual(runs.map(s => s.needs ?? []), runs.map((s, i) => (i ? [runs[i - 1].id] : [])), `pilot ${pilot}`);
  }
  // Each comparison needs every run of both its lanes, so a lane a stop left unmeasured skips it rather than crash it.
  for (const pilot of [false, true]) {
    const p = plan('a', {pilot}), runIds = lane => p.steps.filter(s => s.kind === 'run' && s.id.startsWith(`${lane}-`)).map(s => s.id);
    assert.deepEqual(p.steps.filter(s => s.kind === 'verdict').map(s => [s.id, s.needs]),
      [['compare-A', [...runIds('vv'), ...runIds('vc')]], ['compare-B', [...runIds('vc'), ...runIds('cc')]], ['compare-C', [...runIds('vv'), ...runIds('cc')]]]);
  }
  // The comparisons' output is never faked here: a step that ran and printed no VERDICT line would read FAIL.
  for (const pilot of [true, false]) {
    const p = plan('a', {pilot});
    const stopped = {complete: false, error: 'task.act sample 1: nothing sent', alertGuardStop: {cause: 'alert', detail: 'd', at: 'task.act'}, nativeEngine: {attested: [{engine: 'vendor'}]}};
    const ran = [];
    const report = await runSitting(p, {out: '/w/out', exec: async s => { ran.push(s.id); return {exit: s.id === 'vv-1' ? 1 : 0}; }, keep: () => {}, readText: () => '',
      readJson: path => (path === '/w/out/vv/run-1/meta.json' ? stopped : null), exists: () => false, remove: () => {}, now: () => 0, log: () => {}});
    const status = Object.fromEntries(report.steps.map(s => [s.id, s.status]));
    assert.deepEqual(ran, ['vv-1'], 'no run after the stop, and no comparison');
    assert.equal(status['vv-1'], 'NO VERDICT');
    assert.ok(report.steps.filter(s => s.id !== 'vv-1').every(s => s.status === 'SKIP'), JSON.stringify(status));
    assert.deepEqual([report.verdict, report.exit], ['NO VERDICT', 4], `pilot ${pilot}`);
  }
});

test('B: the native-mac pair on the run\'s install, its diff against the declared differences, and the preparation given back', () => {
  const p = plan('b');
  assert.deepEqual(ids(p), ['prepare', 'vendor', 'cua', 'diff', 'cleanup']);
  assert.deepEqual(p.steps[0].argv, ['node', 'scripts/repl-parity.mjs', 'prepare', '--device', DEVICE, '--commit', CTX.commit, '--approved-runtime', CTX.approvedRuntime, '--approved-engine', CTX.approvedEngine]);
  assert.deepEqual(p.steps.slice(1, 3).map(s => [argOf(s, '--suite'), argOf(s, '--host'), argOf(s, '--engine'), ...approved(s)]),
    [['native-mac', 'vendor', 'vendor', ...approved(p.steps[0])], ['native-mac', 'cua', 'cua', ...approved(p.steps[0])]]);
  assert.deepEqual(p.steps[3].argv, ['node', 'scripts/repl-parity.mjs', 'diff', '/w/out/vendor', '/w/out/cua', '--expected', 'scripts/repl-parity/expected/native-mac.json']);
  assert.equal(p.steps[4].kind, 'cleanup');
  // The cua lane runs only after the vendor lane passed: a vendor lane that left the screen dirty (a scene it could not
  // bring down, pilot B's Finder window) fails, and the next lane is never started into what it left.
  assert.deepEqual(p.steps[2].needs, ['prepare', 'vendor']);
  assert.deepEqual([p.steps[3].check, p.steps[3].pilotNoVerdict], [undefined, undefined], 'B\'s diff keeps its real verdict, in the pilot too');
  assert.deepEqual(ids(plan('b', {pilot: true})), ids(p), 'one pair is already its smallest form');
});

test('C: the matrix, three runs a side with vendor and cua alternating per run number in one hold; #212\'s save-sheet cell on both lanes; the summary and the comparison', () => {
  const full = plan('c');
  const runs = full.steps.filter(s => s.id.startsWith('matrix-'));
  assert.deepEqual(runs.map(s => s.id), ['matrix-vendor-1', 'matrix-cua-1', 'matrix-vendor-2', 'matrix-cua-2', 'matrix-vendor-3', 'matrix-cua-3']);
  for (const step of runs) {
    const engine = step.id.split('-')[1];
    assert.deepEqual(step.argv.slice(0, 5), ['node', 'scripts/native-matrix.mjs', 'run', '--device', DEVICE]);
    assert.deepEqual([argOf(step, '--host'), argOf(step, '--engine'), argOf(step, '--out'), argOf(step, '--sitting')], [engine, engine, `/w/out/${engine}`, 'hosted-45144483807-1-c']);
    assert.equal(argOf(step, '--run-number'), step.id.split('-')[2]);
    assert.deepEqual(approved(step), [CTX.approvedRuntime, CTX.approvedEngine]);
  }
  const sheet = full.steps.filter(s => s.id.startsWith('save-sheet-'));
  assert.deepEqual(sheet.map(s => [s.argv[2], s.argv[3], argOf(s, '--engine'), argOf(s, '--out')]),
    [['cell', 'intervention-save-sheet', 'vendor', '/w/out/save-sheet/vendor'], ['cell', 'intervention-save-sheet', 'cua', '/w/out/save-sheet/cua']]);
  // Each lane's cell asks for its runs, and its check reads every one of their records.
  assert.deepEqual(sheet.map(s => [argOf(s, '--runs'), s.records]), [['3', [1, 2, 3].map(n => `/w/out/save-sheet/vendor/run-${n}/result.json`)], ['3', [1, 2, 3].map(n => `/w/out/save-sheet/cua/run-${n}/result.json`)]]);
  assert.deepEqual(full.steps.filter(s => s.kind === 'verdict').map(s => s.argv.slice(2)),
    [['summary', '/w/out/vendor', '/w/out/cua', '--out', '/w/out/summary.md'], ['compare', '/w/out/vendor', '/w/out/cua', '--out', '/w/out/comparison.md']]);
  assert.deepEqual(full.counts, ['/w/out/vendor', '/w/out/cua', '/w/out/save-sheet']);
  assert.equal(full.pilotReads, false);
  assert.deepEqual(['matrix-cua-2', 'save-sheet-vendor', 'summary', 'compare'].map(id => full.steps.find(s => s.id === id)).map(s => [s.check, s.record ?? s.records?.[0] ?? s.report ?? null, s.row ?? null, s.pilotNoVerdict ?? false]), [
    ['record', '/w/out/cua/run-2/result.json', null, false],
    ['saveSheet', '/w/out/save-sheet/vendor/run-1/result.json', 'textedit/intervention.saveSheet', false],
    ['report', '/w/out/summary.md', null, false],
    ['verdict', null, null, true]]);
  // Each run needs the one before it, through the alternation: a run that left a scene up fails, and the next is SKIP
  // rather than started into what it left (pilot B's Finder window).
  assert.deepEqual(runs.map(s => s.needs ?? []), [[], ['matrix-vendor-1'], ['matrix-cua-1'], ['matrix-vendor-2'], ['matrix-cua-2'], ['matrix-vendor-3']]);
  // Ruling 1214: on the put-back the run before it holds (its record), not on its PASS.
  assert.deepEqual(runs.map(s => s.gate?.putBack ?? null), [null, '/w/out/vendor/run-1/result.json', '/w/out/cua/run-1/result.json', '/w/out/vendor/run-2/result.json',
    '/w/out/cua/run-2/result.json', '/w/out/vendor/run-3/result.json']);
  const pilot = plan('c', {pilot: true});
  assert.deepEqual(pilot.steps.filter(s => s.id.startsWith('matrix-')).map(s => s.id), ['matrix-vendor-1', 'matrix-cua-1'], 'the pilot: one run pair');
  assert.deepEqual(pilot.steps.filter(s => s.id.startsWith('matrix-')).map(s => s.needs ?? []), [[], ['matrix-vendor-1']], 'the pilot\'s pair chained the same way, after the focus timing it does not need');
  assert.deepEqual(pilot.steps.filter(s => s.id.startsWith('save-sheet-')).map(s => [argOf(s, '--runs'), s.records]),
    [['1', ['/w/out/save-sheet/vendor/run-1/result.json']], ['1', ['/w/out/save-sheet/cua/run-1/result.json']]], 'the pilot\'s cell: exactly one run a lane, and that run\'s record checked');
  assert.equal(pilot.steps[0].id, 'focus-timing', 'the pilot times the focus probe before anything else runs');
  assert.deepEqual(pilot.steps[0].argv, ['node', 'scripts/hosted-sittings.mjs', 'focus-timing', '--approved-engine', CTX.approvedEngine, '--out', '/w/out/focus-timing.json']);
  assert.equal(pilot.pilotReads, true);
});

test('D: accept-native\'s exact selection with both live flags on a scratch home and its own sentinel store; verify --bind on each engine; #216\'s twenty cycles; T3b\'s staged onboarding last, on the scratch document', () => {
  const p = plan('d');
  assert.deepEqual(ids(p), ['scratch-install', 'accept-native', 'textedit-up', 'verify-cua', 'verify-vendor', 'approval-cycles', 'onboarding', 'textedit-down']);
  assert.deepEqual(ACCEPT_NATIVE_ITEMS, [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13], 'never item 9, the release gates');
  const accept = p.steps[1];
  assert.deepEqual(accept.argv, ['node', 'scripts/accept-native.mjs', '--engine', 'cua', '--live-textedit', '--live-secrets', '--items', '1,2,3,4,5,6,7,8,10,11,12,13', '--report', '/w/out/acceptance.json']);
  assert.ok(!accept.argv.includes('--secret-key') && !accept.argv.includes('--secret-home'), 'the live secrets are generated sentinels in a temporary home accept-native makes and removes');
  assert.deepEqual([p.steps[0].env, accept.env], [{CUA_HOME: '/t/scratch/cua-accept', CUA_NATIVE_ENGINE: 'vendor'}, {CUA_HOME: '/t/scratch/cua-accept', XDG_CONFIG_HOME: '/t/scratch/accept-config'}],
    'item 13 needs a scratch XDG_CONFIG_HOME of the run\'s own, never the account\'s ~/.config');
  assert.deepEqual(p.scratchDirs, ['/t/scratch/accept-config'], 'made before the steps run');
  assert.deepEqual(plan('a').scratchDirs, []);
  assert.deepEqual(accept.needs, ['scratch-install']);
  assert.deepEqual(p.steps.slice(3, 5).map(s => s.argv), [['node', 'verify.mjs', '--engine', 'cua', '--bind', 'com.apple.TextEdit'], ['node', 'verify.mjs', '--engine', 'vendor', '--bind', 'com.apple.TextEdit']]);
  assert.equal(p.steps[7].kind, 'cleanup');
  const cycles = p.steps[5];
  assert.deepEqual(cycles.argv, ['node', 'scripts/approval-cycles.mjs', '--engine', 'cua', '--approve', 'com.apple.TextEdit', '--decline', 'com.apple.calculator', '--cycles', '20']);
  assert.deepEqual(cycles.needs, ['textedit-up'], 'the approved app\'s window is the kit\'s scratch document (approval-cycles.mjs waits for it)');
  assert.deepEqual(cycles.env, {CUA_SHIM_SURFACES: 'computer,browser'});
  // T3b: the last step that measures (it removes and restores cua's engine's rows), on the same scratch document, read
  // by its record; the document's cleanup follows it.
  const onboarding = p.steps[6];
  assert.deepEqual([onboarding.kind, onboarding.check, onboarding.engine, onboarding.record, onboarding.report, onboarding.needs],
    ['run', 'onboarding', 'cua', '/w/out/onboarding.json', '/w/out/onboarding.json', ['textedit-up']], 'its record removed before it runs, so the one read is its own; the side it measures is cua\'s (ruling 1149)');
  assert.deepEqual(onboarding.argv, ['node', 'scripts/hosted-sittings.mjs', 'onboarding', '--out', '/w/out/onboarding.json']);
  assert.ok(!onboarding.pilotNoVerdict, 'its verdict counts in the pilot too');
  assert.ok(!p.steps.some(s => s.kind === 'pending'), 'D has nothing left unbuilt');
  const pilot = plan('d', {pilot: true});
  assert.deepEqual(pilot.steps.find(s => s.id === 'approval-cycles').argv.at(-1), '20', 'the pilot runs the twenty-cycle witness #216 waits on');
  assert.deepEqual(pilot.steps.filter(s => s.id === 'onboarding'), [onboarding], 'the pilot runs the stages once, as the full sitting does');
});

test('E: the default-selection mode\'s two lanes, each expected to fail before the flip and to pass on it', () => {
  const before = plan('e'), flip = plan('e', {flipped: true});
  assert.deepEqual(ids(before), ['fixture', 'approved']);
  assert.deepEqual(before.steps[0].argv, ['node', 'scripts/accept/macos-default-selection.mjs', '--older-node', CTX.olderNode, '--out', '/w/out/fixture.json']);
  assert.deepEqual(before.steps[1].argv, ['sh', 'scripts/accept/macos-default-selection-hosted.sh']);
  assert.deepEqual(before.steps[1].env, {CUA_HOSTED_APPROVE: 'node scripts/hosted-sittings.mjs approve'});
  assert.deepEqual(before.steps[1].keep, ['default-selection-approved-out/report.json']);
  assert.deepEqual(before.steps.map(s => s.report), ['/w/out/fixture.json', 'default-selection-approved-out/report.json'],
    'an expected FAIL counts only as the judge\'s: a build or approve that exits 1 before the judge ran is no witness of the flip');
  assert.deepEqual(before.steps.map(s => [s.kind, s.expect, s.check, s.lane]), [['expect', 1, 'selection', 'fixture'], ['expect', 1, 'selection', 'approved']],
    'the expected red is the judge\'s own, on its fresh report showing the vendor\'s engine and host');
  assert.deepEqual(flip.steps.map(s => [s.kind, s.expect]), [['expect', 0], ['expect', 0]]);
  assert.match(plan('e', {olderNode: null}).steps[0].missing, /no Node 22/);
  assert.equal(before.setup, false, 'E builds and approves its own engine in a disposable home: no device setup');
});

test('F: the MAWS sitting waits on T12, a placeholder', () => {
  const p = plan('f');
  assert.deepEqual(p.steps.map(s => [s.id, s.kind]), [['maws', 'pending']]);
  assert.match(p.steps[0].pending, /T12/);
});

test('a sitting\'s context: the job\'s run and attempt, and the approved paths the runner\'s record names, which a sitting with setup cannot run without', () => {
  const record = {install: {home: CTX.approvedRuntime}, engine: {bundle: CTX.approvedEngine}};
  const env = {GITHUB_RUN_ID: '45144483807', GITHUB_RUN_ATTEMPT: '1'};
  const ctx = sittingContext('c', {env, record, commit: CTX.commit, out: '/w/out', scratch: '/t/scratch', olderNode: null, pilot: true, flipped: false});
  assert.deepEqual(ctx, {commit: CTX.commit, out: '/w/out', approvedRuntime: CTX.approvedRuntime, approvedEngine: CTX.approvedEngine, runId: '45144483807-1', olderNode: null, scratch: '/t/scratch', flipped: false, pilot: true});
  assert.throws(() => sittingContext('a', {env, record: null, commit: CTX.commit, out: '/w/out'}), /no runner record.*setup/);
  assert.equal(sittingContext('e', {env, record: null, commit: CTX.commit, out: '/w/out'}).approvedEngine, null, 'E approves its own engine in a disposable home');
});
