// The matrix's run (scripts/native-matrix/run.mjs) against doubles of the device and the lane (./lane.mjs dryOps and
// dryConnect, steered per test, on one made-up device clock): the hold's order, the result's shape, the refusals, the
// engine pinned, the key guard, the activation watcher's coverage (an activation charged to the step it fell in, one in
// no step, a watcher gone, a record lost), the paste rows' alert watch, the windowless pairing and the launch path's
// journaled identity.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {AT_MARKER, dryConnect, dryOps} from '../../scripts/native-matrix/lane.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {cleanupMatrix, FULL_PLAN, PASTING, planOf, runMatrix} from '../../scripts/native-matrix/run.mjs';

const BUNDLE = '/A/cua Engine.app';
// A run on doubles: `steps` records every device step by name; `ops` and `cell` override answers, `lane` sees (and may
// fail) every js call first; `calls` (given, so a test's doubles can read it during the run) keeps every js call's code
// and device-clock window. The clock moves 2 s a reading,
// more than the activation margin, so each step's window is its own.
async function runWith({engine = 'cua', plan = planOf('background', {scene: 'textedit', user: 'finder'}), ops: over = {}, cell = null, lane = null,
  checkout = {commit: 'c', dirty: false}, attest = engine, sitting = 's1', calls = []} = {}) {
  let t = 1_000_000;
  const clock = () => (t += 2_000);
  const steps = [];
  const ops = dryOps({log: line => steps.push(line.replace(/^dry: /, '')), engine, approvedEngine: BUNDLE, commit: 'c', clock});
  for (const [k, f] of Object.entries(over)) { const base = ops[k]; ops[k] = (...a) => f(base, ...a); }
  const connect = dryConnect({log: () => {}, engine: attest, host: engine, clock});
  const steered = spec => {
    const client = connect(spec);
    const request = client.request;
    client.request = async (method, params) => {
      if (method === 'tools/call' && lane) lane(params.arguments.code);
      const answer = await request(method, params);
      if (method !== 'tools/call') return answer;
      const value = cell ? cell(params.arguments.code) : null;
      const text = value ? `CUA_NATIVE_BASELINE ${JSON.stringify({ok: true, value, inCellMs: 1})}\n${AT_MARKER}${JSON.stringify([clock(), clock()])}` : answer.content[0].text;
      calls.push({code: params.arguments.code, at: JSON.parse(text.split('\n').find(l => l.startsWith(AT_MARKER)).slice(AT_MARKER.length))});
      return {...answer, content: [{type: 'text', text}], _meta: {...answer._meta, ...(value?._meta ?? {})}};
    };
    return client;
  };
  const out = fs.mkdtempSync(join(tmpdir(), 'matrix-run-'));
  try {
    const code = await runMatrix({device: 'mini', host: engine, engine, approvedRuntime: '/H', approvedEngine: BUNDLE, out, runs: 1, samples: 2, plan, cell: 'non-interference', sitting},
      {ops, connect: steered, controllerCheckout: () => checkout, log: () => {}});
    const file = join(out, 'run-1', 'result.json');
    return {code, steps, calls, result: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null};
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
}
const args = s => JSON.parse(s.slice(s.indexOf(' ') + 1));
const names = steps => steps.map(s => s.replace(/ .*$/, '') + (/^(live|scenes|goldens|matrix) /.test(s) ? ` ${args(s)[0]}` : ''));
const matrixSteps = (steps, first) => steps.filter(s => s.startsWith('matrix ') && args(s)[0] === first).map(args);
const cellsOf = (target, method, kase) => caseCells(target, CASES[target].find(c => c.method === method && c.case === kase));
// The watcher's stop answered by `answer()`, called when the run stops it (after every row, so the windows are known).
const stopWith = answer => ({live: (base, a) => (a[0] === 'watch' && a[1] === 'stop' ? answer() : base(a))});

test('one pairing of the background regime: the hold in order, a conforming result, every row judged by the oracle', async () => {
  const {code, steps, result} = await runWith();
  assert.equal(code, 0);
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.cell, 'non-interference');
  const order = names(steps).filter(s => !/^(matrix read|matrix step|matrix alerts|helpers)/.test(s));
  assert.deepEqual(order, ['home', 'live begin', 'prepare', 'preflight', 'scenes preflight', 'scenes up', 'goldens steps', 'scenes up', 'goldens steps', 'goldens engine-stop',
    'matrix compile', 'live watch', 'serve', 'live watch', 'matrix launched', 'live recover', 'scenes frontmost', 'cleanup']);
  assert.deepEqual(matrixSteps(steps, 'alerts')[0], ['alerts', 'baseline', '--run', result.meta.runDir], 'the alert baseline is kept before the lane');
  const method = result.rows.filter(r => r.section === 'method');
  assert.ok(method.length > 10 && method.every(r => r.regime === 'background' && r.user === 'finder' && r.id.endsWith('@finder')));
  assert.ok(method.every(r => r.interference?.ok === true), 'no activation, the front unchanged, the focus kept');
  assert.deepEqual(result.lanes, [{host: 'cua', engine: 'cua', build: 'd'.repeat(64), version: '0.0.0'}]);
  assert.deepEqual([result.meta.planId, result.meta.sitting], ['background:textedit@finder', 's1']);
  // Every read names the watcher; the after-read carries the focus probe on the user window.
  assert.ok(matrixSteps(steps, 'read').every(a => a.includes('--watcher')));
  assert.ok(matrixSteps(steps, 'read').some(a => a.includes('--focus') && /^\d+,100,100,800,600$/.test(a[a.indexOf('--focus') + 1])));
  // Each scene is brought to the front before its bind, so getApp's emitted text is the run's window.
  assert.deepEqual(matrixSteps(steps, 'step').slice(0, 2).map(a => a.slice(1, 3)), [['activate', 'textedit'], ['activate', 'finder']]);
});

test('a sitting is required, and only the whole matrix\'s plan is the full one', async () => {
  await assert.rejects(runWith({sitting: ''}), /--sitting/);
  assert.equal(planOf('matrix').id, 'full');
  assert.equal(planOf('matrix', {scene: 'textedit'}).id, 'matrix:textedit');
  assert.equal(planOf('method', {scene: 'windowless', user: 'finder'}).id, 'method:windowless@finder');
  assert.ok(FULL_PLAN.background.some(p => p.driven === 'windowless'));
});

test('a dirty checkout is refused before anything on the device; a begin refusal is refused with nothing prepared', async () => {
  const dirty = await runWith({checkout: {commit: 'c', dirty: true}});
  assert.equal(dirty.code, 2);
  assert.equal(dirty.result.verdict, 'refused');
  assert.ok(!names(dirty.steps).includes('live begin'));
  const refused = await runWith({ops: {live: (base, a) => (a[0] === 'begin' ? {refusals: ['a run that died left finder up']} : base(a))}});
  assert.equal(refused.code, 2);
  assert.deepEqual(refused.result.problems, ['a run that died left finder up']);
  assert.ok(!names(refused.steps).includes('prepare'));
});

test('a result attesting another engine stops the lane, and the put-back and cleanup still run', async () => {
  const {code, steps, result} = await runWith({attest: 'vendor'});
  assert.equal(code, 1);
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /attested the vendor engine, not the requested cua/.test(p)));
  assert.ok(names(steps).includes('live recover') && names(steps).includes('cleanup'));
});

test('an activation inside a row fails that row\'s oracle only; one inside a harness step is the harness\'s', async () => {
  const scroll = cellsOf('textedit', 'scroll', 'down').act;
  const calls = [];
  const r = await runWith({calls, ops: stopWith(() => {
    const during = calls.find(c => c.code.includes(scroll)).at[0] + 1;
    // The second bind's activate (Finder's) is a harness step: its window is the two clock readings before that bind's.
    const harness = calls[1].at[0] - 3_000;
    return {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: during}, {kind: 'activated', bundleId: 'com.apple.finder', at: harness}]};
  })});
  const failed = r.result.rows.filter(row => row.interference && !row.interference.ok);
  assert.deepEqual(failed.map(row => row.id), ['textedit/background/scroll.down@finder']);
  assert.equal(failed[0].interference.activations, 1);
  assert.equal(r.result.complete, true, JSON.stringify(r.result.problems));
  assert.deepEqual(r.result.meta.activations.unaccounted, []);
  assert.deepEqual(r.result.meta.activations.accounted.map(a => a.kind), ['harness']);
  assert.equal(r.result.verdict, 'pass', 'the outcome verdict is the rows\' ok; the oracle is judged by summary');
});

test('an activation the run cannot place makes the run incomplete, never clean', async () => {
  // 1.5 s after a row's check ends: past the margin, before the next step reads its clock.
  const check = cellsOf('textedit', 'click', 'control').check;
  const calls = [];
  const r = await runWith({calls, ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.example.other', at: calls.find(c => c.code.includes(check)).at[1] + 1_500}]}))});
  assert.equal(r.result.complete, false);
  assert.ok(r.result.problems.some(p => /fell in no step/.test(p)));
  assert.equal(r.result.meta.activations.unaccounted.length, 1);
});

test('the watcher\'s coverage: gone at a row\'s read leaves that row invalid; a record lost leaves every judged row invalid', async () => {
  // Reads: the user window (1), the first row's before (2) and after (3).
  let reads = 0;
  const gone = await runWith({ops: {matrix: (base, a) => {
    const answer = base(a);
    return a[0] === 'read' && ++reads === 3 ? {...answer, watcher: false} : answer;
  }}});
  assert.deepEqual(gone.result.rows.filter(r => /watcher was not running/.test(r.invalid ?? '')).map(r => r.id), ['textedit/background/getAXState.tree@finder']);
  const lost = await runWith({ops: stopWith(() => { throw new Error('ssh: connection reset'); })});
  assert.equal(lost.result.complete, false);
  assert.ok(lost.result.problems.some(p => /could not be read/.test(p)));
  assert.equal(lost.result.rows.filter(r => r.section === 'method' && !r.invalid).length, 0, 'no row stands without coverage');
  const empty = await runWith({ops: stopWith(() => ({}))});
  assert.equal(empty.result.complete, false, 'a stop with no activations array is a lost record, not "no activations"');
});

test('the watcher not running at the end: its coverage of the run is not proven', async () => {
  // The helpers are read twice: after the binds and after the last row; every read after the second is the end's.
  let snapshots = 0;
  const r = await runWith({ops: {
    matrix: (base, a) => { const answer = base(a); return a[0] === 'read' && snapshots >= 2 ? {...answer, watcher: false} : answer; },
    helpers: base => { snapshots++; return base(); },
  }});
  assert.equal(r.result.complete, false);
  assert.ok(r.result.problems.some(p => /not running at the end/.test(p)));
  assert.ok(r.result.rows.filter(row => row.section === 'method').every(row => row.invalid));
});

test('a paste or typeText act is sent only between two alert checks; an alert before it stops the run with nothing sent', async () => {
  const ok = await runWith();
  const checks = matrixSteps(ok.steps, 'alerts').filter(a => a[1] === 'check');
  assert.equal(checks.length, 2 * CASES.textedit.filter(c => PASTING.includes(c.method)).length);
  const pastingActs = CASES.textedit.filter(c => PASTING.includes(c.method)).map(c => caseCells('textedit', c).act);
  let sent = 0;
  const stopped = await runWith({lane: code => { if (pastingActs.some(a => code.includes(a))) sent++; },
    ops: {matrix: (base, a) => (a[0] === 'alerts' && a[1] === 'check' ? {abort: true, export: {alerts: [{bundleId: 'com.apple.UserNotificationCenter', layer: 8}]}} : base(a))}});
  assert.equal(sent, 0);
  assert.equal(stopped.result.complete, false);
  assert.ok(stopped.result.problems.some(p => /possible system alert appeared before/.test(p)));
  assert.deepEqual(stopped.result.meta.alert.alerts, [{bundleId: 'com.apple.UserNotificationCenter', layer: 8}]);
  assert.ok(names(stopped.steps).includes('live recover'));
});

test('the windowless pairing: the app brought up by the harness, its refusal case run behind the user window, then quit', async () => {
  const {steps, result} = await runWith({plan: planOf('background', {scene: 'windowless', user: 'finder'})});
  assert.deepEqual(names(steps).filter(s => /^matrix (windowless|launched)/.test(s)), ['matrix windowless', 'matrix launched', 'matrix launched']);
  assert.deepEqual(result.rows.map(r => r.id), ['windowless/background/getAXState.noWindow@finder']);
  assert.ok(result.rows[0].interference, 'judged by the oracle');
});

test('the launch path: identity journaled whatever the act did, the run\'s document only into TextEdit, the launch quit even when the check fails', async () => {
  const plan = planOf('launch');
  const {steps, result} = await runWith({plan});
  const launched = matrixSteps(steps, 'launched');
  // textedit: record, quit; electron: record, quit; then the run's own quit before the put-back.
  assert.deepEqual(launched.map(a => a[1]), ['record', 'quit', 'record', 'quit', 'quit']);
  assert.ok(launched.filter(a => a[1] === 'record').every(a => Number.isSafeInteger(Number(a[a.indexOf('--since') + 1]))));
  assert.equal(matrixSteps(steps, 'open-document').length, 1);
  assert.deepEqual(result.rows.map(r => [r.id, r.ok]), [['textedit/background/launch@finder', true], ['electron/background/launch@finder', true]]);
  assert.ok(result.rows.every(r => r.interference && r.outcome.launched === true));

  // The lane fails during the act: the launch is still journaled and quit, and the run stops.
  const failing = await runWith({plan, lane: code => { if (code.includes('cua.computer.get_app_state') && !code.includes('cua.listApps')) throw new Error('transport closed'); }});
  assert.deepEqual(matrixSteps(failing.steps, 'launched').map(a => a[1]).slice(0, 2), ['record', 'quit']);
  assert.equal(failing.result.complete, false);

  // The launch row's outcome is its own: the scene's window never came to the front.
  const stuck = await runWith({plan, cell: code => (code.includes('cua.listApps({emit: false})') ? {ok: false, outcome: {listed: true, running: true, scene: false, panel: true}} : null)});
  assert.ok(stuck.result.rows.every(r => r.ok === false && r.outcome.panel === true));
});

test('a key skipped with one of the run\'s windows in front leaves the row invalid; with another app in front the run stops', async () => {
  // The user window (Finder) is in front; a frontmost-regime key cell for TextEdit sees Finder: skipped, the row invalid.
  const plan = {id: 'test', frontmost: ['finder', 'textedit'], speed: false, finding: false, background: [], launch: []};
  const own = await runWith({plan, ops: {matrix: (base, a) => (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit' ? base(['step', 'activate', 'finder', ...a.slice(3)]) : base(a))}});
  const skipped = own.result.rows.filter(r => /key guard/.test(r.invalid ?? ''));
  assert.deepEqual(skipped.map(r => r.id).sort(), ['textedit/frontmost/paste.replace', 'textedit/frontmost/pressKey.selectAll', 'textedit/frontmost/typeText.replace']);
  assert.ok(own.result.rows.filter(r => r.target === 'finder').every(r => !r.invalid), 'Finder\'s own keys went with Finder in front');
  assert.ok(own.result.meta.keySkipped.every(k => k.front.owned === true));
  const foreign = await runWith({plan, ops: {matrix: (base, a) => (a[0] === 'read' ? {reading: {at: 0, frontmost: {pid: null, bundleId: 'com.google.Chrome', owned: false}, topWindow: null}, watcher: true, at: [1, 2]} : base(a))}});
  assert.equal(foreign.code, 1);
  assert.ok(foreign.result.problems.some(p => /not one of the run's windows/.test(p)));
  assert.ok(names(foreign.steps).includes('live recover'));
});

test('the cleanup of a run that died quits the run\'s journaled launches before the put-back', () => {
  const steps = [];
  const ops = dryOps({log: line => steps.push(line.replace(/^dry: /, '')), engine: 'cua', approvedEngine: BUNDLE, commit: 'c'});
  assert.equal(cleanupMatrix({device: 'mini', run: '/r'}, {ops, log: () => {}, dryRun: true}), 0);
  assert.deepEqual(names(steps).filter(s => /^(matrix|live)/.test(s)), ['matrix launched', 'live recover']);
});
