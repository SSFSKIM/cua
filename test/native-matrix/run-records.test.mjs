// What the matrix records about each judged act (T10b′, part 1, of the M5 wave-1 record), against the run's doubles
// (./run-doubles.mjs): the front/key readings around every judged act with the activate step's own check
// (scripts/native-matrix/front-key.mjs's contract, rulings 1136 and 1141), an act skipped when its activation did not take
// front and key, the run marked hosted and its device mode; the engine's own error name from the act's meta; the window
// order read around every background cell (#485); and Acceptance 3's keystroke witness in TextEdit's background click.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AX_FULL} from '../../scripts/native-baseline/cells.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';
import {args, cellsOf, matrixSteps, runWith, stopWith} from './run-doubles.mjs';

const TEXTEDIT = SCENES.textedit.bundleId, FINDER = SCENES.finder.bundleId, ELECTRON = SCENES.electron.bundleId, ALERT = 'com.apple.UserNotificationCenter';
const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
// The doubles' readings, steered: `matrix read` and `matrix step` answers rewritten by `patch(args, answer)`.
const steer = patch => ({matrix: (base, a) => patch(a, base(a))});
const judged = row => !row.invalid && !row.excluded;

test('a hosted run: every judged row carries its front/key readings and the activate step\'s check; meta says hosted and the shared mode', async () => {
  const {result, steps} = await runWith({env: HOSTED});
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.meta.hosted, true);
  assert.equal(result.meta.desktopMode, 'shared');
  const method = result.rows.filter(r => r.section === 'method');
  assert.ok(method.length > 10 && method.every(judged));
  for (const row of method) {
    assert.deepEqual(row.frontKey, {apps: [TEXTEDIT, FINDER], activate: {app: FINDER, front: true, key: true}, before: {front: FINDER, key: FINDER}, after: {front: FINDER, key: FINDER}}, row.id);
    assert.equal(sampleCause({...row, hosted: true}), null, `${row.id} has a verdict`);
  }
  // The readings are asked of the device: front and key around each act, the window order around each background one.
  assert.ok(matrixSteps(steps, 'read').some(a => a.includes('--with') && a[a.indexOf('--with') + 1] === 'front-key,window-order'));
  // Off a runner, the run is not hosted.
  assert.equal((await runWith()).result.meta.hosted, false);
});

// T10b′ part 2: the device's own record of the job's run is the run's hosted attestation (meta.runner), the run's install
// its approved runtime and engine; a record of another run, or a controller off the runner, leaves the run incomplete.
const RECORD = {kind: 'github-hosted', image: {name: 'macos26', version: '20261117.0516.1'}, run: {id: '7', attempt: '1'}, vm: {id: 'vm-1', platformUuid: 'P', bootedAt: 'B'},
  install: {home: '/H', release: '26.0-dry'}, engine: {bundle: '/A/cua Engine.app', build: 'b', engineVersion: '0.2.0'}};
const attesting = record => ({preflight: (base, a) => ({...base(a), runner: record})});
test('a hosted run records the runner the device attests; another run\'s record or a controller off the runner stops it', async () => {
  const env = {...HOSTED, GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '1'};
  const {result} = await runWith({env, ops: attesting(RECORD)});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.equal(result.meta.hosted, true);
  assert.deepEqual(result.meta.runner, RECORD);
  // Without the device's record the hosted run is unattested (the judge's missing proof), still hosted.
  assert.deepEqual([(await runWith({env})).result.meta.runner, (await runWith({env})).result.meta.hosted], [null, true]);
  const stale = (await runWith({env, ops: attesting({...RECORD, run: {id: '6', attempt: '1'}})})).result;
  assert.equal(stale.complete, false);
  assert.ok(stale.problems.some(p => /names run 6 attempt 1, not this job's run 7 attempt 1/.test(p)), stale.problems.join('; '));
  const off = (await runWith({ops: attesting(RECORD)})).result;
  assert.equal(off.complete, false);
  assert.ok(off.problems.some(p => /this controller is not on one/.test(p)), off.problems.join('; '));
  const install = (await runWith({env, ops: attesting({...RECORD, install: {home: '/other', release: 'r'}})})).result;
  assert.ok(install.problems.some(p => /--approved-runtime \/H is not the run's install \(\/other\)/.test(p)), install.problems.join('; '));
});

test('an activate step that did not take key (the alert kept it): the act is skipped, its readings say why, no verdict and no fail', async () => {
  const calls = [];
  const {result} = await runWith({env: HOSTED, calls, ops: steer((a, answer) => {
    if (a[0] === 'step' && a[1] === 'activate' && a[2] === 'finder') return {...answer, frontKey: {front: FINDER, key: ALERT}};
    if (a[0] === 'read' && a.includes('--with')) return {...answer, frontKey: {front: FINDER, key: ALERT}};
    return answer;
  })});
  const method = result.rows.filter(r => r.section === 'method');
  assert.ok(method.length > 10);
  for (const row of method) {
    assert.deepEqual([row.ok, row.invalid, row.frontKey.activate, row.frontKey.after], [false, undefined, {app: FINDER, front: true, key: false}, null], row.id);
    assert.equal(sampleCause({...row, hosted: true}).category, 'activation');
  }
  assert.ok(!calls.some(c => c.code.includes(cellsOf('textedit', 'scroll', 'down').act)), 'no act was sent');
  assert.deepEqual(validateCellResult(result), []);
});

test('a scene command that could not bring its app to the front: every sample it was for is recorded skipped from the check, none vanishes and none is invalid', async () => {
  // Every activation of `scene` after the one before its bind (a run whose setup cannot bind stops).
  const refuse = scene => { let seen = 0; return steer((a, answer) => (a[0] === 'step' && a[1] === 'activate' && a[2] === scene && seen++ > 0
    ? {...answer, answer: {scene, ok: false, reason: 'the run\'s process 7 is not frontmost within 5000 ms'}, frontKey: {front: FINDER, key: ALERT}} : answer)); };
  const matrix = (await runWith({env: HOSTED, plan: planOf('matrix', {scene: 'textedit', user: 'finder'}), ops: refuse('textedit')})).result;
  const skippedOf = section => matrix.rows.filter(r => r.section === section && r.scene === 'textedit' && r.frontKey?.after === null);
  const method = matrix.rows.filter(r => r.id.startsWith('textedit/frontmost/'));
  assert.ok(method.length > 10 && method.every(r => r.ok === false && r.invalid === undefined && r.frontKey.activate.front === false), 'the method cases');
  for (const row of method) assert.equal(sampleCause({...row, hosted: true}).category, 'activation');
  assert.equal(skippedOf('speed').length, 6, 'three ops, two samples each');
  assert.ok(skippedOf('finding').some(r => r.id === 'textedit/lines'));
  assert.ok(matrix.rows.some(r => r.id === 'textedit/method.click.control' && r.frontKey?.after === null), 'the cases\' timings too');
  assert.deepEqual(validateCellResult(matrix), []);
  // A measures-only cell records its samples too.
  const speed = (await runWith({env: HOSTED, plan: planOf('speed', {scene: 'textedit'}), ops: refuse('textedit')})).result;
  assert.equal(speed.rows.filter(r => r.section === 'speed' && r.frontKey?.activate.front === false).length, 6);
  // The background regime's user window too.
  const background = (await runWith({env: HOSTED, ops: refuse('finder')})).result;
  assert.ok(background.rows.filter(r => r.section === 'method').every(r => r.invalid === undefined && r.frontKey?.activate.app === FINDER && r.frontKey.after === null));
  // Finder in front and key but its run window not on top: the setup's own failure, invalid as before.
  let finderSeen = 0;
  const wrongWindow = steer((a, answer) => (a[0] === 'step' && a[1] === 'activate' && a[2] === 'finder' && finderSeen++ > 0
    ? {...answer, answer: {scene: 'finder', ok: false, reason: 'the run\'s Finder is frontmost but its top window is not the run\'s window'}} : answer));
  const finder = (await runWith({env: HOSTED, plan: planOf('method', {scene: 'finder'}), ops: wrongWindow})).result;
  assert.ok(finder.rows.filter(r => r.id.startsWith('finder/frontmost/')).every(r => /did not come to the front/.test(r.invalid ?? '')));
});

test('a case whose re-activation after its prepare did not take: its timing is skipped with it, the case\'s readings its own', async () => {
  const calls = [];
  const prepare = cellsOf('textedit', 'click', 'control').prepare;
  let armed = false, alertSeen = null;
  const {result} = await runWith({env: HOSTED, calls, plan: planOf('matrix', {scene: 'textedit'}), ops: {...steer((a, answer) => {
    // After click.control's prepare the alert is front and key, and the activation that follows does not take it back.
    if (a[0] === 'read' && a.includes('--with') && calls.at(-1)?.code.includes(prepare)) {
      armed = true;
      if (alertSeen === null) alertSeen = answer.at[1];
      return {...answer, frontKey: {front: ALERT, key: ALERT}};
    }
    if (armed && a[0] === 'step' && a[1] === 'activate') { armed = false; return {...answer, frontKey: {front: ALERT, key: ALERT}}; }
    return answer;
  }),
  // The watcher saw the alert come up during the before-read that prompted the re-activation (its end, past the
  // prepare's margin): the row's, so the run stays complete and the sample is NO VERDICT (ruling 1141).
  ...stopWith(() => ({activations: [{kind: 'activated', bundleId: ALERT, at: alertSeen}]}))}});
  const row = result.rows.find(r => r.id === 'textedit/frontmost/click.control' && r.sample === 1);
  assert.deepEqual([row.ok, row.invalid, row.frontKey.activate.front, row.frontKey.after], [false, undefined, false, null]);
  const timing = result.rows.filter(r => r.section === 'speed' && r.id === 'textedit/method.click.control');
  assert.equal(timing.length, 1, 'the timing row is there, once');
  assert.deepEqual([timing[0].ok, timing[0].frontKey], [false, row.frontKey]);
  assert.equal(sampleCause({...timing[0], hosted: true}).category, 'activation');
  assert.equal(result.complete, true, JSON.stringify(result.problems));
  assert.deepEqual(result.meta.activations.unaccounted, []);
});

test('the frontmost regime: a scene that is not front and key before its act is activated again, and the row reads the new check', async () => {
  const calls = [];
  const prepare = cellsOf('textedit', 'click', 'control').prepare;
  let stolen = 0;
  const {result, steps} = await runWith({env: HOSTED, calls, plan: planOf('method', {scene: 'textedit'}), ops: steer((a, answer) => {
    // The read just after click.control's prepare sees the alert in front, once.
    if (a[0] === 'read' && a.includes('--with') && calls.at(-1)?.code.includes(prepare) && !stolen) { stolen++; return {...answer, frontKey: {front: ALERT, key: ALERT}}; }
    return answer;
  })});
  const row = result.rows.find(r => r.id === 'textedit/frontmost/click.control');
  assert.equal(stolen, 1);
  assert.deepEqual(row.frontKey, {apps: [TEXTEDIT], activate: {app: TEXTEDIT, front: true, key: true}, before: {front: TEXTEDIT, key: TEXTEDIT}, after: {front: TEXTEDIT, key: TEXTEDIT}});
  assert.equal(row.ok, true);
  const activations = matrixSteps(steps, 'step').filter(s => s[1] === 'activate' && s[2] === 'textedit').length;
  // The baseline hosted too: a hosted run's warm-up activates TextEdit once before any row (ruling 1278 (b)).
  const baseline = matrixSteps((await runWith({env: HOSTED, plan: planOf('method', {scene: 'textedit'})})).steps, 'step').filter(s => s[1] === 'activate' && s[2] === 'textedit').length;
  assert.equal(activations, baseline + 1, 'one activation more, for that row');
  // The Open panel's rows list its service among the cell's own apps, and are never activated again (TextEdit would come
  // up over its own panel).
  const panel = await runWith({env: HOSTED, plan: planOf('method', {scene: 'openPanel'}), ops: steer((a, answer) => (a[0] === 'read' && a.includes('--with') ? {...answer, frontKey: {front: TEXTEDIT, key: ALERT}} : answer))});
  const panelRow = panel.result.rows.find(r => r.id === 'openPanel/frontmost/click.cancel');
  assert.deepEqual(panelRow.frontKey.apps, [TEXTEDIT, 'com.apple.appkit.xpc.openAndSavePanelService']);
  const panelActivations = steps => matrixSteps(steps, 'step').filter(s => s[1] === 'activate' && s[2] === 'textedit').length;
  // The baseline also closes its background pairing's panel with TextEdit activated first (T8e review, Minor 1): a panel
  // the held ⌘O never opened in the alert's run.
  // The hosted run's warm-up activates TextEdit before any row (ruling 1278 (b)): not the rows', so not counted.
  const warmUp = panel.result.meta.warmUp.steps.filter(s => s.venue === 'textedit' && !s.skipped).length;
  assert.equal(warmUp, 1);
  assert.equal(panelActivations(panel.steps) - warmUp, panelActivations((await runWith({plan: planOf('method', {scene: 'openPanel'})})).steps) - 1, 'the panel\'s key elsewhere activates TextEdit no more');
});

test('the engine\'s own error name is recorded from the act\'s meta, not the plain Error the REPL hands the cell', async () => {
  const act = cellsOf('textedit', 'click', 'element').act, check = cellsOf('textedit', 'click', 'element').check;
  const {result} = await runWith({cell: code => (code.includes(act) ? {actMs: 1, at: [1, 2], threw: true, _meta: {'cua/errorName': 'backgroundClickRefused'}}
    : code.includes(check) ? {ok: false, outcome: {collapsed: false, unchanged: true, effect: false, threw: 'Computer Use server error -10005: refused', errorName: 'Error'}} : null)});
  const row = result.rows.find(r => r.id === 'textedit/background/click.element@finder');
  assert.equal(row.outcome.errorName, 'backgroundClickRefused');
  // Without the meta (the vendor's lane, or a service that sets none), the cell's own name stays.
  const plain = await runWith({cell: code => (code.includes(check) ? {ok: false, outcome: {threw: 'x', errorName: 'Error'}} : null)});
  assert.equal(plain.result.rows.find(r => r.id === 'textedit/background/click.element@finder').outcome.errorName, 'Error');
});

test('#485: the window order is read around every background act; a target window left above the person\'s fails that row\'s non-interference', async () => {
  const scroll = cellsOf('textedit', 'scroll', 'down').act;
  const calls = [];
  const {result, steps} = await runWith({calls, ops: steer((a, answer) => {
    // The oracle's read after the scroll's act: TextEdit's window above Finder's, an alert's above both.
    if (a[0] === 'read' && a.includes('--focus') && calls.at(-1)?.code.includes(scroll)) {
      const [user, target] = [answer.windowOrder.find(w => w.bundleId === FINDER), answer.windowOrder.find(w => w.bundleId === TEXTEDIT)];
      return {...answer, windowOrder: [{owned: false, bundleId: ALERT, layer: 8}, target, user]};
    }
    return answer;
  })});
  const failed = result.rows.filter(r => r.interference && !r.interference.ok);
  assert.deepEqual(failed.map(r => r.id), ['textedit/background/scroll.down@finder']);
  assert.deepEqual(failed[0].interference.windowOrder, {before: false, after: true});
  assert.ok(result.rows.filter(r => r.section === 'method' && judged(r)).every(r => r.interference.windowOrder), 'every background row judged its window order');
  const reads = matrixSteps(steps, 'read');
  assert.ok(reads.filter(a => a.includes('--focus')).every(a => a.includes('--with') && a[a.indexOf('--with') + 1].includes('window-order')), 'the after-reads carry it');
});

test('Acceptance 3: after TextEdit\'s background click, a probe keystroke into Finder moves its selection to a run-owned file, the document unchanged', async () => {
  const click = cellsOf('textedit', 'click', 'element');
  const calls = [];
  const witness = (answers = {}) => code => (code.includes('cua-matrix-cell: witness.prepare') ? {target: 'scene-file-007', ...answers.prepare}
    : code.includes('cua-matrix-cell: witness.check') ? {finderSelected: true, documentUnchanged: true, ...answers.check} : null);
  const {result, steps} = await runWith({calls, cell: witness()});
  const row = result.rows.find(r => r.id === 'textedit/background/click.element@finder');
  assert.equal(row.ok, true);
  assert.deepEqual(row.outcome.keystroke, {posted: true, finderSelected: true, documentUnchanged: true});
  // The keystroke after the click's check, gated on the run's Finder window, typing the file's name.
  const probes = matrixSteps(steps, 'probe');
  assert.equal(probes.length, 2);
  assert.deepEqual(probes[0].slice(0, 2), ['probe', 'keystroke']);
  assert.match(probes[0][probes[0].indexOf('--window') + 1], /^\d+,100,100,800,600$/);
  assert.equal(probes[0][probes[0].indexOf('--text') + 1], 'scene-file-007');
  assert.equal(probes[1][1], 'finish');
  const order = calls.map(c => (c.code.includes(click.check) ? 'check' : c.code.includes('witness.prepare') ? 'witness.prepare' : c.code.includes('witness.check') ? 'witness.check' : null)).filter(Boolean);
  assert.deepEqual(order, ['check', 'witness.prepare', 'witness.check']);
  // Only that cell: the other cases of the pairing send no keystroke.
  assert.equal(result.rows.filter(r => r.outcome?.keystroke).length, 1);
  // The document changed, or Finder's selection did not move: the row fails, the click's own outcome aside.
  for (const check of [{documentUnchanged: false}, {finderSelected: false}]) {
    const failed = (await runWith({cell: witness({check})})).result.rows.find(r => r.id === row.id);
    assert.deepEqual([failed.ok, failed.invalid], [false, undefined], JSON.stringify(check));
  }
  // The probe's gate held its keys because Finder's window was not in front: the witness failed (the front was taken),
  // the gate's reason recorded and the row judged, its interference too. Both of KeystrokeProbe.swift's answers: at its
  // first gate (status 4, nothing sent) and between its keys (status 4, `aborted` after the first were posted).
  const answering = probe => ({cell: witness(), ops: steer((a, answer) => (a[0] === 'probe' && a[1] === 'finish' ? {...answer, answer: {answer: probe}} : answer))});
  const firstGate = {error: 'the front window is not the named one; nothing was sent'};
  const midPost = {pid: 4242, layout: 'com.apple.keylayout.ABC', mode: 'layout', presses: [{keyCode: 1, flags: 0, unicode: 's'}], postedAt: 1_700_000_000_000, aborted: true, units: 14};
  for (const [probe, at] of [[firstGate, 'first'], [midPost, 'during']]) {
    const failed = (await runWith(answering(probe))).result.rows.find(r => r.id === row.id);
    assert.deepEqual([failed.ok, failed.invalid], [false, undefined], at);
    assert.deepEqual({...failed.outcome.keystroke, gate: failed.outcome.keystroke.gate.at}, {posted: false, gate: at, finderSelected: true, documentUnchanged: true});
    assert.match(failed.outcome.keystroke.gate.reason, /named window/);
    assert.equal(typeof failed.interference?.ok, 'boolean', 'judged by the oracle');
  }
  // The gate held the keys and the read-back after it failed: the gate's failure stands, the read-back recorded as
  // unavailable, the row judged; without a gate, the same failed read-back leaves the row invalid.
  const failingCheck = witness({check: {cellError: 'Finder did not answer'}});
  const gated = (await runWith({...answering(firstGate), cell: failingCheck})).result.rows.find(r => r.id === row.id);
  assert.deepEqual([gated.ok, gated.invalid], [false, undefined]);
  assert.deepEqual({...gated.outcome.keystroke, gate: gated.outcome.keystroke.gate.at, readBack: gated.outcome.keystroke.readBack.unavailable},
    {posted: false, gate: 'first', finderSelected: null, documentUnchanged: null, readBack: true});
  assert.match(gated.outcome.keystroke.readBack.error, /Finder did not answer/);
  assert.equal(typeof gated.interference?.ok, 'boolean', 'judged by the oracle');
  const ungated = (await runWith({cell: failingCheck})).result.rows.find(r => r.id === row.id);
  assert.match(ungated.invalid, /read-back failed/);
  // A probe that failed as a probe (no layout, an event it could not make, no answer) says nothing: the row is invalid.
  for (const probe of [{error: 'Unable to get the current keyboard layout.'}, {error: 'a key event could not be created'}, null]) {
    const broken = (await runWith(answering(probe))).result.rows.find(r => r.id === row.id);
    assert.match(broken.invalid, /keystroke witness/, JSON.stringify(probe));
  }
});

test('the launch row reads front and key, the activate check and the window order, the launched app the target', async () => {
  const {result} = await runWith({env: HOSTED, plan: planOf('launch', {scene: 'electron'})});
  const row = result.rows.find(r => r.section === 'launch');
  assert.deepEqual(row.frontKey, {apps: [ELECTRON, FINDER], activate: {app: FINDER, front: true, key: true}, before: {front: FINDER, key: FINDER}, after: {front: FINDER, key: FINDER}});
  assert.deepEqual(row.interference.windowOrder, {before: false, after: false});
  assert.equal(sampleCause({...row, hosted: true}), null);
});

test('the speed and finding rows carry the readings around their series, and the method timings their case\'s', async () => {
  const {result} = await runWith({env: HOSTED, plan: planOf('matrix', {scene: 'textedit'})});
  const measured = result.rows.filter(r => (r.section === 'speed' || r.section === 'finding') && judged(r));
  assert.ok(measured.length > 5);
  for (const row of measured) assert.deepEqual(row.frontKey?.activate, {app: TEXTEDIT, front: true, key: true}, row.id);
  const timing = result.rows.find(r => r.section === 'speed' && r.id === 'textedit/method.click.control');
  assert.deepEqual(timing.frontKey, result.rows.find(r => r.id === 'textedit/frontmost/click.control').frontKey);
  assert.ok(result.rows.filter(judged).every(r => r.frontKey), result.rows.filter(r => judged(r) && !r.frontKey).map(r => `${r.section} ${r.id}`).join(', '));
});

test('each speed sample reads front and key at its own call\'s boundaries, sharing one only with the call next to it', async () => {
  // Every front/key reading is a new one (its key numbered), so the rows show which reading each boundary used.
  let n = 0;
  const {result} = await runWith({env: HOSTED, plan: planOf('speed', {scene: 'textedit'}), ops: steer((a, answer) => (a[0] === 'read' && a.includes('--with') ? {...answer, frontKey: {front: TEXTEDIT, key: `reading-${++n}`}} : answer))});
  const series = op => result.rows.filter(r => r.section === 'speed' && r.id === `textedit/${op}`);
  const [ax, shot, apps] = ['getAXState', 'getScreenshot', 'listApps'].map(series);
  for (const list of [ax, shot, apps]) {
    assert.equal(list.length, 2);
    assert.notDeepEqual(list[0].frontKey.before, list[0].frontKey.after, 'each sample is read after its call');
    assert.deepEqual(list[1].frontKey.before, list[0].frontKey.after, 'the next call\'s before is the boundary they share');
    assert.notDeepEqual(list[1].frontKey.after, list[0].frontKey.after);
  }
  assert.deepEqual(shot[0].frontKey.before, ax[1].frontKey.after, 'nothing runs between the two series');
  assert.notDeepEqual(apps[0].frontKey.before, shot[1].frontKey.after, 'the scratch guard ran between them: read afresh');
});

test('an activation the front/key read after a measured call or a row saw is that call\'s or row\'s, never unaccounted', async () => {
  const at = (calls, code, index = 0) => calls.filter(c => c.code.includes(code))[index].at;
  // A speed sample's after-read: between the first getAXState sample's end and the second's start, past the calls'
  // margin. The sample's measure window runs to that read's end.
  const speedCalls = [];
  const speed = (await runWith({env: HOSTED, calls: speedCalls, plan: planOf('speed', {scene: 'textedit'}),
    ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: ALERT, at: at(speedCalls, AX_FULL, 1)[0] - 1_500}]}))})).result;
  assert.equal(speed.complete, true, JSON.stringify(speed.problems));
  assert.deepEqual(speed.meta.activations.unaccounted, []);
  assert.deepEqual(speed.meta.activations.accounted.map(a => [a.kind, a.key]), [['measure', 'textedit/getAXState']]);
  // A case row's read after its check: the row's window runs to that read's end, so the activation is the row's.
  const check = cellsOf('textedit', 'click', 'control').check;
  const rowCalls = [];
  const row = (await runWith({calls: rowCalls, ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: ALERT, at: at(rowCalls, check)[1] + 1_500}]}))})).result;
  assert.equal(row.complete, true, JSON.stringify(row.problems));
  assert.deepEqual(row.meta.activations.unaccounted, []);
  assert.equal(row.rows.find(r => r.id === 'textedit/background/click.control@finder').interference.activations, 1);
});

test('the probe cells and the Unicode rows of a full plan carry their readings too', async () => {
  const {result} = await runWith({env: HOSTED, plan: planOf('matrix')});
  const missing = result.rows.filter(r => judged(r) && !r.frontKey).map(r => `${r.section} ${r.id}`);
  assert.deepEqual(missing, []);
  assert.deepEqual(validateCellResult(result), []);
  // A concurrent-use sample the doubles make valid (its typing reports an interval the probe's post falls in): judged by
  // the oracle with the window order, its readings the user window's.
  const at = c => Number(/const __at = (\d+)/.exec(c)?.[1]);
  const acted = c => ({actMs: 2_000, callAt: at(c), endAt: at(c) + 3_000, late: 0, threw: false, errorName: null, message: null,
    _meta: {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: at(c) + 50, endedAt: at(c) + 2_500}}});
  const run = await runWith({env: HOSTED, plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use', cell: c => (c.includes('cua-matrix-cell: concurrent.act') ? acted(c) : null)});
  const concurrent = run.result.rows.find(r => r.id === 'chrome/concurrent@textedit');
  assert.equal(concurrent.ok, true);
  assert.deepEqual(concurrent.frontKey, {apps: [SCENES.chrome.bundleId, TEXTEDIT], activate: {app: TEXTEDIT, front: true, key: true},
    before: {front: TEXTEDIT, key: TEXTEDIT}, after: {front: TEXTEDIT, key: TEXTEDIT}});
  assert.deepEqual(concurrent.interference.windowOrder, {before: false, after: false});
});

// #590 (ruling 1223, R5 ii): a typeUnconfirmed row records its read-back in detail: what cua's engine put on the error
// (its typeReadback record, the key target's pid on a cut-off walk) and the harness's own read of the focused text
// element right after the call, with its time after the call's end.
test('a typeUnconfirmed row records the engine\'s read-back record and the harness\'s read of the focused field right after the call', async () => {
  const {act, check} = cellsOf('textedit', 'typeText', 'replace');
  const record = {confirmed: false, snapshotMs: 1.2, reason: 'valueUnreadable', pollMs: 0, reads: 0};
  const reads = [];
  const ops = steer((a, answer) => {
    if (a[0] !== 'focused-text') return answer;
    reads.push(a);
    return {answer: {ok: false, role: 'AXTextArea', characters: 44, selected: null, failed: ['selected'], errors: {selected: -25212}}, at: [7_010, 7_020]};
  });
  const {result} = await runWith({ops, cell: code => (code.includes(act) ? {actMs: 1, at: [6_990, 7_000], threw: true, _meta: {'cua/errorName': 'typeUnconfirmed', 'cua/typeReadback': record, 'cua/keyTargetCutOff': {pid: 11}}}
    : code.includes(check) ? {ok: false, outcome: {effect: true, threw: 'Computer Use server error -10005: The text was typed, but the field\'s text could not be read back', errorName: 'Error'}} : null)});
  const row = result.rows.find(r => r.section === 'method' && r.method === 'typeText' && r.case === 'replace');
  assert.equal(row.outcome.errorName, 'typeUnconfirmed');
  assert.deepEqual(row.readback, {engine: record, keyTargetCutOff: {pid: 11},
    harness: {ok: false, role: 'AXTextArea', characters: 44, selected: null, failed: ['selected'], errors: {selected: -25212}}, msAfterCall: 10});
  assert.ok(reads.every(a => a[a.indexOf('--scene') + 1] === 'textedit'));
  // Fix wave M2: a harness read that throws is recorded, never the run's stop.
  const failing = steer((a, answer) => { if (a[0] === 'focused-text') throw new Error('the reader died'); return answer; });
  const broken = await runWith({ops: failing, cell: code => (code.includes(act) ? {actMs: 1, at: [6_990, 7_000], threw: true, _meta: {'cua/errorName': 'typeUnconfirmed', 'cua/typeReadback': record}}
    : code.includes(check) ? {ok: false, outcome: {effect: true, threw: 'x', errorName: 'Error'}} : null)});
  const unread = broken.result.rows.find(r => r.section === 'method' && r.method === 'typeText' && r.case === 'replace');
  assert.deepEqual([unread.readback.harness, unread.readback.msAfterCall], [{ok: false, reason: 'the reader died'}, null]);
  assert.ok(!broken.result.problems.some(p => /the reader died/.test(p)), JSON.stringify(broken.result.problems));
  // Any other answer reads nothing more.
  const plain = await runWith({ops, cell: code => (code.includes(check) ? {ok: false, outcome: {threw: 'x', errorName: 'Error'}} : null)});
  assert.equal(plain.result.rows.find(r => r.section === 'method' && r.method === 'typeText' && r.case === 'replace').readback, undefined);
});
