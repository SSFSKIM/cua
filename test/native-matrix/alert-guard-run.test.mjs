// The alert guard in the matrix run (ruling 1154; scripts/native-matrix/alert-guard.mjs): every cell that sends a pointer
// event is refused, never sent, when the device's fresh reading shows an alert window over one of the run's windows, the
// alert holding the front or the key, or no reading at all; a key cell when the alert holds the key; a window capture is
// exempt. The same guard on either engine. Then the run's placement of its scene windows clear of the alerts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {CAPTURE_ALERT_PROCESS} from '../../scripts/native-matrix/live-checks.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {matrixSteps, names, runWith} from './run-doubles.mjs';

const UNC = CAPTURE_ALERT_PROCESS;
const rect = (x, y, width, height) => ({x, y, width, height});
// dryOps places every scene window at 100,100 800x600.
const OVER = rect(500, 300, 300, 200), BESIDE = rect(1000, 300, 300, 200);
const withList = a => (a.includes('--with') ? a[a.indexOf('--with') + 1].split(',') : []);
const isGuardRead = a => a[0] === 'read' && withList(a).includes('alert-bounds');
// The device's alert windows as `alerts(n)` gives them at the n-th guard read (null: the list unread), the run's own
// placement read (the first) seeing none, so its windows stay where dryOps put them. The caret cells' field reads (the
// device's text-range) answer what their prepares make and a caret after each click, so their clicks are sent unless
// the guard refuses them.
const FIELD = ['alpha one', 'bravo two', 'charlie three', 'delta four', 'echo five', 'foxtrot six', 'golf seven', 'hotel eight'].join('\n');
// Each click's before-read, then its after-read twice (the settle: two reads that agree).
const RANGES = [{location: 20, length: 7}, {location: 44, length: 0}, {location: 44, length: 0}, {location: FIELD.length, length: 0}, {location: 25, length: 0}, {location: 25, length: 0}];
const alertsBy = alerts => {
  let n = -1, ranges = 0;
  return {matrix: (base, a) => {
    if (a[0] === 'text-range') return {answer: {range: RANGES[ranges++ % RANGES.length], focused: true}, at: [1, 2]};
    if (!isGuardRead(a)) return base(a);
    const out = base(a);
    if (++n === 0) return out;
    const seen = alerts(n);
    return {...out, alertBounds: seen === null ? null : {...out.alertBounds, alerts: seen.map((bounds, i) => ({number: 90 + i, layer: 0, bounds}))}};
  }};
};
const caseOf = (target, method, kase) => CASES[target].find(c => c.method === method && c.case === kase);
const sent = (calls, code) => calls.some(c => c.code.includes(code));
const rowOf = (result, id) => result.rows.find(r => r.section === 'method' && r.id === id);
const METHOD = planOf('method', {scene: 'electron'});

test('an alert over the run\'s window: every pointer cell is refused unsent, NO VERDICT alert, on cua and the vendor alike; the rest run', async () => {
  for (const engine of ['cua', 'vendor']) {
    const calls = [];
    // With its timings on, so the timing row a refused case pushes is seen too.
    const {result} = await runWith({engine, plan: {...METHOD, speed: true}, calls, ops: alertsBy(() => [OVER])});
    assert.deepEqual(validateCellResult(result), [], engine);
    const point = rowOf(result, 'electron/frontmost/click.point');
    assert.equal(point.alertGuard.cause, 'alert', engine);
    // The cell's target's windows: the fixture's.
    assert.match(point.alertGuard.detail, /overlaps the electron window/);
    assert.equal(sampleCause({...point, hosted: true}).category, 'alert');
    // Neither its prepare (a focus click, the screenshot's size) nor its act was sent: the guard read came first.
    assert.ok(!sent(calls, caseOf('electron', 'click', 'point').act), `${engine}: #259's click was sent`);
    assert.ok(!sent(calls, caseOf('electron', 'drag', 'select').act), `${engine}: the drag was sent`);
    for (const id of ['electron/frontmost/click.button', 'electron/frontmost/drag.select', 'electron/frontmost/click.selection', 'electron/frontmost/typeText.replace'])
      assert.equal(rowOf(result, id).alertGuard?.cause, 'alert', `${engine} ${id}`);
    // A cell that sends no pointer runs: the observation, the app list, a value written by accessibility.
    for (const id of ['electron/frontmost/getAXState.tree', 'electron/frontmost/listApps.running', 'electron/frontmost/setValue.text'])
      assert.equal(rowOf(result, id).alertGuard, undefined, `${engine} ${id}`);
    // Each refusal kept in the run's meta, and its timing row NO VERDICT with it.
    assert.ok(result.meta.alertGuards.length > 0);
    const timing = result.rows.find(r => r.section === 'speed' && r.id === 'electron/method.click.point');
    assert.deepEqual([timing.ok, sampleCause(timing)?.category], [false, 'alert']);
  }
});

test('an alert beside the run\'s windows: the pointer cells are sent and judged', async () => {
  const calls = [];
  const {result} = await runWith({plan: METHOD, calls, ops: alertsBy(() => [BESIDE])});
  assert.ok(sent(calls, caseOf('electron', 'click', 'point').act));
  assert.equal(rowOf(result, 'electron/frontmost/click.point').alertGuard, undefined);
  assert.equal(result.meta.alertGuards, undefined);
});

test('the window list unread at the guard: the pointer cell is NO VERDICT unread, never sent', async () => {
  const calls = [];
  const {result} = await runWith({plan: METHOD, calls, ops: alertsBy(() => null)});
  const point = rowOf(result, 'electron/frontmost/click.point');
  assert.equal(point.alertGuard.cause, 'unread');
  assert.equal(sampleCause(point).category, 'unread');
  assert.ok(!sent(calls, caseOf('electron', 'click', 'point').act));
});

test('a second alert appearing mid-run: the cells read before it are sent, those after it refused; nothing is retried', async () => {
  const calls = [];
  let reads = 0;
  // Clear for the first ten guard reads, then a new alert over the scenes.
  const {result, steps} = await runWith({plan: METHOD, calls, ops: alertsBy(n => { reads = n; return n <= 10 ? [BESIDE] : [BESIDE, OVER]; })});
  const pointerRows = result.rows.filter(r => r.section === 'method');
  const guarded = pointerRows.filter(r => r.alertGuard), judged = pointerRows.filter(r => !r.alertGuard);
  assert.ok(guarded.length > 0 && judged.length > 0);
  const first = result.rows.indexOf(guarded[0]);
  assert.ok(judged.some(r => result.rows.indexOf(r) < first), 'rows before the alert are judged');
  assert.ok(result.meta.alertGuards.every(g => /overlaps/.test(g.detail)));
  // One guard read per pointer cell sent or refused (and the placement's), never a second try of a refused one.
  assert.equal(matrixSteps(steps, 'read').filter(isGuardRead).length, reads + 1);
  assert.equal(new Set(result.rows.filter(r => r.alertGuard).map(r => `${r.id}:${r.sample}`)).size, result.rows.filter(r => r.alertGuard).length);
});

test('a key cell is refused when the alert holds the key, its keys never sent', async () => {
  const calls = [];
  const typed = caseOf('electron', 'typeText', 'replace');
  let armed = false;
  const {result} = await runWith({plan: planOf('method', {scene: 'electron'}), calls, ops: {matrix: (base, a) => {
    const out = base(a);
    // The alert takes the key once the typeText case's prepare has run (its field focused and the word selected).
    if (calls.some(c => c.code.includes(typed.prepare.slice(0, 60))) && !armed) armed = true;
    return armed && a[0] === 'read' && withList(a).includes('front-key') && !isGuardRead(a) ? {...out, frontKey: {...out.frontKey, key: UNC}} : out;
  }}});
  const row = rowOf(result, 'electron/frontmost/typeText.replace');
  assert.equal(row.alertGuard?.cause, 'alert');
  assert.match(row.alertGuard.detail, /holds the key/);
  assert.ok(!sent(calls, typed.act));
});

test('a screenshot of a window under an alert is NO VERDICT alert, unsent (the vendor may crop a display capture); one clear of it is exempt', async () => {
  const shots = result => result.rows.filter(r => r.section === 'speed' && r.id === 'electron/getScreenshot');
  const over = await runWith({plan: planOf('speed', {scene: 'electron'}), ops: alertsBy(() => [OVER])});
  assert.ok(shots(over.result).length > 0);
  assert.ok(shots(over.result).every(r => r.alertGuard?.cause === 'alert' && sampleCause(r).category === 'alert'));
  // The other speed ops capture nothing: measured whatever the alert.
  assert.ok(over.result.rows.filter(r => r.id === 'electron/getAXState').every(r => r.alertGuard === undefined));
  const beside = await runWith({plan: planOf('speed', {scene: 'electron'}), ops: alertsBy(() => [BESIDE])});
  assert.ok(shots(beside.result).every(r => r.alertGuard === undefined && Number.isFinite(r.inCellMs)));
});

test('per target: an alert over Finder\'s window alone leaves the Electron fixture\'s pointer cells sent', async () => {
  const calls = [];
  const overFinder = alertsBy(() => [rect(150, 150, 100, 100)]);
  const apart = {matrix: (base, a) => {
    const out = overFinder.matrix(base, a);
    if (!isGuardRead(a) || !out?.alertBounds) return out;
    return {...out, alertBounds: {...out.alertBounds, windows: out.alertBounds.windows.map(w => (w.scene === 'electron' ? {...w, bounds: rect(1000, 100, 800, 600)} : w))}};
  }};
  const {result} = await runWith({plan: METHOD, calls, ops: apart});
  assert.ok(sent(calls, caseOf('electron', 'drag', 'select').act));
  assert.equal(rowOf(result, 'electron/frontmost/click.button').alertGuard, undefined);
  assert.equal(rowOf(result, 'electron/background/click.button@finder').alertGuard, undefined, 'behind Finder\'s window, the target is still the fixture');
});

test('the finding cell scrolls Finder\'s list back up: under an alert it is refused, each of its rows NO VERDICT alert', async () => {
  const calls = [];
  const {result} = await runWith({plan: planOf('finding', {scene: 'finder'}), calls, ops: alertsBy(() => [OVER])});
  const rows = result.rows.filter(r => r.section === 'finding');
  assert.ok(rows.length > 1);
  assert.ok(rows.every(r => r.alertGuard?.cause === 'alert'));
});

test('a probe cell whose prepare clicks or scrolls is refused under an alert: one attempt, its row NO VERDICT alert, the run going on', async () => {
  const {result} = await runWith({plan: planOf('concurrent-use', {scene: 'finder'}), ops: alertsBy(() => [OVER])});
  const row = result.rows.find(r => r.section === 'concurrent');
  assert.deepEqual([row.alertGuard?.cause, row.attempts], ['alert', 1]);
  assert.equal(sampleCause(row).category, 'alert');
  assert.equal(result.complete, true, result.problems.join('; '));
});

test('the Unicode rows: a field\'s focus click the guard refused leaves its rows NO VERDICT alert, never sent, in every condition', async () => {
  const {result} = await runWith({plan: planOf('korean', {scene: 'chrome'}), ops: alertsBy(() => [OVER])});
  const rows = result.rows.filter(r => r.section === 'unicode');
  assert.ok(rows.length > 0);
  // Frontmost (Latin, Korean) by their case's prepare; composing behind the user window and per-context by the harness's
  // focus click on the fields; the mid-switch row by its prepare.
  assert.deepEqual([...new Set(rows.map(r => r.condition))].sort(), ['composing', 'korean', 'latin', 'midSwitch', 'perContext']);
  for (const r of rows) assert.equal(r.alertGuard?.cause, 'alert', `${r.condition} ${r.id}`);
  assert.deepEqual(result.problems, [], 'no refusal stopped the run');
});

// The Open panel under the pilots' alerts (pilot A: about x 382-671, y 118-511 on 1920x1080). `escape`: whether Escape
// closes the panel; `placeable`: whether the frame probe moves its window.
const PILOT = rect(382, 118, 289, 393), PANEL_AT = rect(300, 100, 800, 500);
// The harness's own Cancel click (./matrix-cells.mjs CLOSE_PANEL), told from the case's.
const HARNESS_CANCEL = 'if (index !== null) await __app.click(index);';
const PANEL_PLAN = {id: 'test', frontmost: ['openPanel', 'electron'], speed: false, finding: false, background: [], launch: []};
function panelRun({escape = true, placeable = true} = {}) {
  let open = false, panelAt = PANEL_AT;
  const placed = [];
  const cell = code => {
    if (code.includes('pressKey("super+o")')) { open = true; return {opened: true}; }
    if (code.includes('pressKey("Escape")')) { if (escape) open = false; return {closed: escape}; }
    if (code.includes(HARNESS_CANCEL)) { open = false; return {closed: true}; }
    return null;
  };
  const matrix = (base, a) => {
    if (a[0] === 'place' && a[a.indexOf('--scene') + 1] === 'openPanel') {
      placed.push(a);
      const [x, y, width, height] = a[a.indexOf('--frame') + 1].split(',').map(Number), to = {x, y, width, height};
      if (placeable) panelAt = to;
      return {answer: {requested: to, readBack: placeable ? to : PANEL_AT, matched: placeable, exitStatus: 0, pid: 12}, at: [1, 2]};
    }
    const out = base(a);
    if (!isGuardRead(a)) return out;
    return {...out, alertBounds: {...out.alertBounds, alerts: [{number: 90, layer: 0, bounds: PILOT}],
      windows: [...out.alertBounds.windows, ...(open ? [{scene: 'openPanel', number: 77, recorded: false, bounds: panelAt}] : [])]}};
  };
  return {cell, ops: {matrix}, placed};
}

test('the Open panel under the pilots\' alerts is placed clear after ⌘O, its Cancel sent, and closed by Escape under the key guard', async () => {
  const calls = [];
  const {cell, ops, placed} = panelRun();
  const {result} = await runWith({plan: PANEL_PLAN, calls, cell, ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.deepEqual(placed.map(a => [a[a.indexOf('--window') + 1], a[a.indexOf('--frame') + 1]]), [['77', '679,100,800,500']]);
  assert.deepEqual(result.meta.placement.panel, [{beforeRow: 0, number: 77, from: PANEL_AT, to: rect(679, 100, 800, 500), moved: true, matched: true, readBack: rect(679, 100, 800, 500), pid: 12}]);
  // The scenes went to the same column, clear of the alert.
  assert.deepEqual(result.meta.placement.scenes.electron.to, rect(679, 100, 800, 600));
  assert.equal(rowOf(result, 'openPanel/frontmost/click.cancel').alertGuard, undefined);
  assert.ok(sent(calls, 'pressKey("Escape")') && !sent(calls, HARNESS_CANCEL), 'closed by key, its Cancel never clicked by the harness');
  assert.equal(rowOf(result, 'electron/frontmost/click.point').alertGuard, undefined, 'the targets after it ran');
});

test('a panel that cannot be placed nor closed by key: its Cancel refused stops the run, and every sample it planned after is NO VERDICT alert', async () => {
  const calls = [];
  const {cell, ops} = panelRun({escape: false, placeable: false});
  const {result} = await runWith({plan: PANEL_PLAN, calls, cell, ops});
  assert.equal(rowOf(result, 'openPanel/frontmost/click.cancel').alertGuard.cause, 'alert');
  assert.equal(result.meta.placement.panel[0].matched, false);
  assert.ok(!sent(calls, HARNESS_CANCEL), 'the harness\'s Cancel click refused, never sent');
  assert.equal(result.complete, false);
  assert.equal(result.meta.alertGuardStop.cause, 'alert');
  assert.ok(result.problems.some(p => /nothing sent: .* \(the alert guard, ruling 1154\)/.test(p)));
  // Every planned sample is there: the Electron fixture's never ran, each NO VERDICT alert on this side.
  const planned = manifestOf({run: 1, samples: 2}, PANEL_PLAN);
  const have = new Set(result.rows.map(r => `${r.section} ${r.id} ${r.sample}`));
  assert.deepEqual(planned.filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`)), []);
  const unrun = result.rows.filter(r => r.id.startsWith('electron/'));
  assert.equal(unrun.length, planned.filter(e => e.id.startsWith('electron/')).length);
  assert.ok(unrun.every(r => r.engine === 'cua' && sampleCause(r).category === 'alert' && /not run/.test(r.alertGuard.detail)));
  assert.deepEqual(validateCellResult(result), []);
});

test('a fixture whose cleanup the guard refused for an unread screen is kept blocked by `unread`, its real cause', async () => {
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', ops: alertsBy(() => null)});
  assert.equal(result.complete, false);
  assert.deepEqual(result.meta.fixturesHeld.map(f => [f.reset, f.blockedBy]), [[false, 'unread']]);
});

// ---- placement --------------------------------------------------------------------------------------------------------

test('placement: a scene window under an alert is moved clear before the lane connects, the same size, and the run\'s meta records it', async () => {
  const placed = [];
  const frame = text => { const [x, y, width, height] = text.split(',').map(Number); return {x, y, width, height}; };
  const {result, steps} = await runWith({plan: METHOD, ops: {
    matrix: (base, a) => {
      if (a[0] === 'place') placed.push(a);
      if (!isGuardRead(a)) return base(a);
      const out = base(a);
      // Before the move, the scenes at dryOps' 100,100; after it, wherever they were placed.
      const at = scene => { const p = placed.find(x => x[x.indexOf('--scene') + 1] === scene); return p ? frame(p[p.indexOf('--frame') + 1]) : rect(100, 100, 800, 600); };
      return {...out, alertBounds: {...out.alertBounds, alerts: [{number: 90, layer: 0, bounds: rect(500, 300, 300, 200)}],
        windows: out.alertBounds.windows.map(w => ({...w, bounds: at(w.scene)}))}};
    }}});
  assert.ok(placed.length >= 1);
  // Placed once its scenes are up and set up, before the engine those steps drove is stopped and the lane connects.
  const order = names(steps);
  assert.ok(order.indexOf('matrix place') > order.lastIndexOf('goldens steps') && order.lastIndexOf('matrix place') < order.indexOf('goldens engine-stop'));
  const meta = result.meta.placement;
  assert.deepEqual(meta.alerts, [rect(500, 300, 300, 200)]);
  for (const [scene, p] of Object.entries(meta.scenes)) {
    assert.deepEqual(p.from, rect(100, 100, 800, 600), scene);
    assert.equal(p.moved, true, scene);
    assert.deepEqual([p.to.width, p.to.height], [800, 600]);
  }
  // Placed clear, the guard lets the pointer cells run.
  assert.equal(rowOf(result, 'electron/frontmost/click.point').alertGuard, undefined);
});
