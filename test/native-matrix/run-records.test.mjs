// What the matrix records about each judged act (T10b′, part 1, of the M5 wave-1 record), against the run's doubles
// (./run-doubles.mjs): the front/key readings around every judged act with the activate step's own check
// (scripts/native-matrix/front-key.mjs's contract, rulings 1136 and 1141), an act skipped when its activation did not take
// front and key, the run marked hosted and its device mode; the engine's own error name from the act's meta; the window
// order read around every background cell (#485); and Acceptance 3's keystroke witness in TextEdit's background click.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';
import {args, cellsOf, matrixSteps, runWith} from './run-doubles.mjs';

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
  const baseline = matrixSteps((await runWith({plan: planOf('method', {scene: 'textedit'})})).steps, 'step').filter(s => s[1] === 'activate' && s[2] === 'textedit').length;
  assert.equal(activations, baseline + 1, 'one activation more, for that row');
  // The Open panel's rows list its service among the cell's own apps, and are never activated again (TextEdit would come
  // up over its own panel).
  const panel = await runWith({env: HOSTED, plan: planOf('method', {scene: 'openPanel'}), ops: steer((a, answer) => (a[0] === 'read' && a.includes('--with') ? {...answer, frontKey: {front: TEXTEDIT, key: ALERT}} : answer))});
  const panelRow = panel.result.rows.find(r => r.id === 'openPanel/frontmost/click.cancel');
  assert.deepEqual(panelRow.frontKey.apps, [TEXTEDIT, 'com.apple.appkit.xpc.openAndSavePanelService']);
  const panelActivations = steps => matrixSteps(steps, 'step').filter(s => s[1] === 'activate' && s[2] === 'textedit').length;
  assert.equal(panelActivations(panel.steps), panelActivations((await runWith({plan: planOf('method', {scene: 'openPanel'})})).steps), 'the panel\'s key elsewhere activates TextEdit no more');
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
  // The probe refused to post because Finder's window was not in front: the witness failed (the front was taken).
  const aborted = await runWith({cell: witness(), ops: steer((a, answer) => (a[0] === 'probe' && a[1] === 'finish' ? {...answer, answer: {answer: {aborted: true}}} : answer))});
  assert.deepEqual(aborted.result.rows.find(r => r.id === row.id).outcome.keystroke, {posted: false, finderSelected: true, documentUnchanged: true});
  assert.equal(aborted.result.rows.find(r => r.id === row.id).ok, false);
  // A probe that could not post at all says nothing: the row is invalid.
  const broken = await runWith({cell: witness(), ops: steer((a, answer) => (a[0] === 'probe' && a[1] === 'finish' ? {...answer, answer: {answer: {error: 'no Accessibility grant'}}} : answer))});
  assert.match(broken.result.rows.find(r => r.id === row.id).invalid, /keystroke witness/);
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
