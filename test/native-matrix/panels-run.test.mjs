// TextEdit's panels in a matrix run (rulings 1195, 1196; scripts/native-matrix/panels.mjs): each case on an opening of
// its own, the opening's window moved into the strip left of the capture alerts by the device (never the engine), the
// close one rule on both lanes (Escape, then its Cancel click, then the device's AX cancel), and the new judged cells.
// Pilot C-2's geometry: the alerts at 893,244 260x364 and 830,188 260x348; the panel centred at 520,162 880x448, listed
// under TextEdit's pid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {CASES, casesOf, PANEL_SEARCH} from '../../scripts/native-matrix/plan.mjs';
import {stripCause} from '../../scripts/native-matrix/panels.mjs';
import {runWith} from './run-doubles.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const ALERTS = [rect(893, 244, 260, 364), rect(830, 188, 260, 348)];
const CENTRED = rect(520, 162, 880, 448), STRIP = rect(22, 80, 800, 448), SCENE = rect(22, 80, 700, 600);
const withList = a => (a.includes('--with') ? a[a.indexOf('--with') + 1].split(',') : []);
const isGuardRead = a => a[0] === 'read' && withList(a).includes('alert-bounds');
const flag = (a, name) => a[a.indexOf(`--${name}`) + 1];
// The harness's own cells, told from the cases'.
const HARNESS_ESCAPE = code => code.includes('return {closed: true};') && code.includes('pressKey("Escape")');
const HARNESS_CANCEL = code => code.includes('if (index !== null) await __app.click(index);');
const PANEL_GONE = code => code.includes('return {closed: !') && !code.includes('pressKey(') && !code.includes('.click(');
const CASE_ESCAPE = code => code.includes('__m.threw = null') && code.includes('await __app.pressKey("Escape");');
const sent = (calls, test) => calls.some(c => test(c.code));

// A device and lane where the panel opens centred over the alerts. `moves`: whether the device's AX move takes;
// `escape`: whether a key Escape (the case's or the harness's) closes it; `click`: whether the harness's Cancel click
// does; `ax`: whether the device's AX cancel does; `alerts`: the alerts on screen (none off a hosted runner); `unread`:
// the device's window list unread at every `panel state`; `listed`: whether the panel's window shows in the guard's
// reading at all; `claims`: the harness Escape's answer whatever happened (a lane's word the device may contradict);
// `afterCase`: what a case's act does to the world (`recentre`: the panel back over the alerts; `foreign`: another
// app's window in front); `sheet`: the helper answering that it found a Save sheet as an AXSheet child.
const OTHER_FRONT = {pid: 999, bundleId: 'com.example.other', owned: false};
function panelDevice({moves = true, escape = true, click = true, ax = true, alerts = ALERTS, savePanel = false, unread = false, listed = true, twin = false, claims = null,
  afterCase = null, sheet = false} = {}) {
  let open = false, at = CENTRED, foreign = false;
  const placed = [], cancelled = [], states = [];
  const cell = code => {
    if (code.includes('__m.threw = null')) { if (afterCase === 'recentre') at = CENTRED; if (afterCase === 'foreign' || afterCase === 'unread') foreign = afterCase; }
    if (code.includes('pressKey("super+o")') || code.includes('cua-matrix-cell: savesheet.open')) { open = true; at = savePanel === true ? rect(240, 100, 480, 200) : savePanel || CENTRED; return {opened: true}; }
    if (code.includes('cua-matrix-cell: sheet.new')) return {opened: true};
    if (code.includes('cua-matrix-cell: sheet.cleanup')) return {closed: true, sceneInFront: true, front: 'scene'};
    if (HARNESS_ESCAPE(code) || CASE_ESCAPE(code)) { if (escape) open = false; return HARNESS_ESCAPE(code) ? {closed: claims ?? !open} : null; }
    if (HARNESS_CANCEL(code)) { if (click) open = false; return {closed: !open}; }
    if (PANEL_GONE(code)) return {closed: !open};
    return null;
  };
  const matrix = (base, a) => {
    if (a[0] === 'place' && ['openPanel', 'savePanel'].includes(flag(a, 'scene'))) {
      const [x, y, width, height] = flag(a, 'frame').split(',').map(Number);
      placed.push(a);
      if (moves) at = sheet ? {x, y, width: at.width, height: at.height} : {x, y, width, height};
      return {answer: {requested: {x, y, width, height}, readBack: at, matched: moves, exitStatus: null, pid: 300, ax: {trusted: true, found: true, size: sheet ? null : 0, position: sheet ? null : 0, readBack: at, ...(sheet ? {kind: 'sheet', parentPosition: 0} : {})}}, at: [1, 2]};
    }
    // The device's reading of the panel's window (`panel state`), and its AX cancel.
    if (a[0] === 'panel' && a[1] === 'state') { states.push(a); return {answer: {state: unread ? 'unread' : open ? 'open' : 'closed'}, at: [1, 2]}; }
    if (a[0] === 'panel') { cancelled.push(a); if (ax) open = false; return {answer: {found: true, via: 'cancelButton', pressed: 0, closed: !open, state: open ? 'open' : 'closed', pid: 300}, at: [1, 2]}; }
    const out = base(a);
    if (!isGuardRead(a)) return foreign && a[0] === 'read' && out.reading ? {...out, reading: {...out.reading, frontmost: foreign === 'unread' ? null : OTHER_FRONT}} : out;
    return {...out, alertBounds: {...out.alertBounds, alerts: alerts.map((bounds, i) => ({number: 59 + i, layer: 8, bounds})),
      windows: [...out.alertBounds.windows.map(w => ({...w, bounds: SCENE})), ...(open && listed ? [{scene: 'textedit', number: 994, recorded: false, bounds: at}, ...(twin ? [{scene: 'textedit', number: 995, recorded: false, bounds: rect(300, 300, 500, 300)}] : [])] : [])]}};
  };
  return {cell, ops: {matrix}, placed, cancelled, states};
}
const PANEL_PLAN = {id: 'test', frontmost: ['openPanel'], speed: true, finding: false, background: [{driven: 'openPanel', user: 'finder'}], launch: []};
const panelRows = result => result.rows.filter(r => r.section === 'method' && r.target === 'openPanel');

test('the strip: left of every alert by the margin, below the menu bar; with no alert every frame is in it', () => {
  assert.equal(stripCause(rect(22, 80, 800, 448), ALERTS), null);
  assert.match(stripCause(CENTRED, ALERTS), /outside the strip clear of the alerts \(x 0-822/);
  assert.match(stripCause(rect(22, 80, 801, 448), ALERTS), /outside the strip/, 'one point past the edge');
  assert.match(stripCause(rect(22, 10, 700, 400), ALERTS), /outside the strip/, 'under the menu bar');
  assert.equal(stripCause(CENTRED, []), null);
});

test('the Open panel opened over the alerts is moved into the strip by the device, one opening per case, its cells sent and judged on both lanes', async () => {
  for (const engine of ['vendor', 'cua']) {
    const calls = [];
    const dev = panelDevice();
    const {result} = await runWith({engine, plan: PANEL_PLAN, calls, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.deepEqual(validateCellResult(result), []);
    // One opening per frontmost case and one for the background pairing, each moved by the device to the strip's frame.
    const openings = casesOf('openPanel', 'frontmost').length + 1;
    assert.equal(dev.placed.length, openings, engine);
    for (const a of dev.placed) assert.deepEqual([flag(a, 'scene'), flag(a, 'window'), flag(a, 'frame')], ['openPanel', '994', '22,80,800,448']);
    assert.equal(result.meta.placement.panel.length, openings);
    for (const p of result.meta.placement.panel) assert.deepEqual([p.target, p.number, p.from, p.readBack, p.moved, p.inStrip], ['openPanel', 994, CENTRED, STRIP, true, true]);
    // Ruling 1199: the 880-wide panel was resized as well as moved, and its record says so.
    for (const p of result.meta.placement.panel) assert.deepEqual(p.resized, {from: CENTRED, to: STRIP});
    // Its cells ran, none refused by the guard, none NO VERDICT venue.
    for (const row of panelRows(result)) assert.deepEqual([row.alertGuard, row.venueInput], [undefined, undefined], `${engine} ${row.id}`);
    assert.ok(sent(calls, HARNESS_CANCEL) === false, 'Escape closed every opening: no harness Cancel click');
    assert.ok(sent(calls, CASE_ESCAPE), 'the judged Escape was sent');
    assert.ok(calls.some(c => c.code.includes(`typeText(${JSON.stringify(PANEL_SEARCH)})`)), 'the judged search typing was sent');
    // Every close kept with its steps.
    assert.ok(result.meta.panelCloses.every(c => c.closed && c.steps[0].step === 'escape'));
  }
});

test('a move that does not take leaves the opening\'s case NO VERDICT venue, unsent, naming where the panel stood; the run goes on', async () => {
  const calls = [];
  const dev = panelDevice({moves: false});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, calls, cell: dev.cell, ops: dev.ops});
  const rows = panelRows(result);
  assert.equal(rows.length, CASES.openPanel.length);
  for (const row of rows) {
    assert.equal(sampleCause({...row, hosted: true}).category, 'venue', row.id);
    assert.match(row.venueInput, /window 994 was not placed in the strip left of the capture alerts: it stood at 520,162 880x448/);
  }
  assert.ok(!sent(calls, CASE_ESCAPE) && !calls.some(c => c.code.includes(PANEL_SEARCH)), 'no case act was sent');
  // Each timing row NO VERDICT with its case, none missing.
  const timings = result.rows.filter(r => r.section === 'speed' && r.id.startsWith('textedit/method.panel.'));
  assert.equal(timings.length, CASES.openPanel.length);
  assert.ok(timings.every(t => sampleCause(t).category === 'venue'));
  assert.ok(result.meta.placement.panel.every(p => p.inStrip === false && p.moved === false));
});

test('off a hosted runner (no alert on screen) no panel is moved and its cells run', async () => {
  const dev = panelDevice({alerts: []});
  const {result} = await runWith({plan: PANEL_PLAN, cell: dev.cell, ops: dev.ops});
  assert.deepEqual(dev.placed, []);
  assert.ok(result.meta.placement.panel.every(p => p.inStrip === true && p.moved === false && !('to' in p)));
  assert.ok(panelRows(result).every(r => r.venueInput === undefined));
});

// ---- the close (ruling 1195): one rule on both lanes -------------------------------------------------------------

test('vendor-shaped close: Escape closes the panel; no Cancel click, no device cancel, nothing marked', async () => {
  const calls = [];
  const dev = panelDevice();
  const {result} = await runWith({engine: 'vendor', plan: {...PANEL_PLAN, background: []}, calls, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, true);
  assert.ok(!sent(calls, HARNESS_CANCEL));
  assert.deepEqual(dev.cancelled, []);
  assert.ok(result.meta.panelCloses.every(c => c.closed === true && c.rowsMarked === undefined));
  assert.ok(panelRows(result).every(r => r.panelClose === undefined));
});

test('cua-shaped close: Escape ineffective and the Cancel click refused by the guard; the device cancels by AX, the opening\'s judgeable rows NO VERDICT by that refusal, the run goes on', async () => {
  for (const engine of ['cua', 'vendor']) {
    const calls = [];
    // The panel is placed in the strip, so its case runs and is judgeable; after it the panel stands over the alerts
    // again (as the system centres it), so the guard refuses the Cancel click there, as in C-2.
    const dev = panelDevice({escape: false, afterCase: 'recentre'});
    const plan = {id: 'test', frontmost: ['openPanel', 'electron'], speed: false, finding: false, background: [], launch: []};
    const {result} = await runWith({engine, plan, calls, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.ok(!sent(calls, HARNESS_CANCEL), 'the Cancel click was refused, never sent');
    assert.equal(dev.cancelled.length, CASES.openPanel.length, 'the device cancelled each opening');
    for (const a of dev.cancelled) assert.deepEqual([a[1], flag(a, 'window')], ['cancel', '994']);
    for (const close of result.meta.panelCloses) {
      assert.deepEqual(close.steps.map(s => s.step), ['escape', 'cancel', 'device'], engine);
      // Each step's outcome as the device read it: still open after Escape and the refused click, closed after its cancel.
      assert.deepEqual([close.steps[0].device, close.steps[1].refused?.cause, close.steps[1].device, close.steps[2].device, close.closed], ['open', 'alert', 'open', 'closed', true]);
    }
    // The rows after the panel ran (the run did not stop).
    assert.ok(result.rows.some(r => r.id.startsWith('electron/') && r.alertGuard === undefined));
    // Every case was placed and judgeable (no venue mark, no guard of its own) and is now NO VERDICT by the refusal.
    for (const row of panelRows(result)) {
      assert.equal(row.venueInput, undefined, row.id);
      assert.equal(row.alertGuard, undefined, row.id);
      assert.equal(row.panelClose?.cause, 'alert', row.id);
      assert.equal(sampleCause({...row, hosted: true}).category, 'alert', row.id);
    }
  }
});

test('the close is the device\'s reading: a lane that says closed while the window stands goes on to the next step; one the device reads gone is closed without the lane', async () => {
  // The harness Escape claims closed, the panel still up: the device reads it open, so the Cancel click is sent.
  const lying = panelDevice({escape: false, claims: true});
  const calls = [];
  const a = await runWith({plan: {...PANEL_PLAN, background: [], speed: false}, calls, cell: lying.cell, ops: lying.ops});
  assert.equal(a.result.complete, true, a.result.problems.join('; '));
  assert.ok(sent(calls, HARNESS_CANCEL), 'the click followed the lane\'s false closed');
  assert.ok(a.result.meta.panelCloses.every(c => c.steps[0].closed === true && c.steps[0].device === 'open' && c.steps[1].device === 'closed' && c.closed));
  // The harness Escape claims not closed, the panel gone: the device reads it closed, and nothing more is sent.
  const quiet = panelDevice({claims: false});
  const calls2 = [];
  const b = await runWith({plan: {...PANEL_PLAN, background: [], speed: false}, calls: calls2, cell: quiet.cell, ops: quiet.ops});
  assert.ok(!sent(calls2, HARNESS_CANCEL) && quiet.cancelled.length === 0);
  assert.ok(b.result.meta.panelCloses.every(c => c.steps.length === 1 && c.steps[0].device === 'closed' && c.closed));
});

test('a device that cannot read the window list after its cancel stops the run as unread, never as closed or as a panel left open', async () => {
  const dev = panelDevice({escape: false, click: false, unread: true});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /Open panel could not be read after its close: the device's window list was unread/.test(p)), result.problems.join('; '));
  assert.deepEqual([result.meta.panelCloses.at(-1).steps.at(-1).device, result.meta.panelCloses.at(-1).closed], ['unread', false]);
});

test('a key guard stop at the close, both lanes, the front unread or another app\'s, the device\'s cancel closing it or not: both outcomes kept, every planned sample after it recorded by the guard\'s cause', async () => {
  const plan = {id: 'test', frontmost: ['openPanel', 'electron'], speed: true, finding: false, background: [], launch: []};
  for (const engine of ['vendor', 'cua']) {
    for (const [front, cause, said] of [['foreign', 'invalid', /Escape not sent: the front is not one of the run's windows \(#162\)/], ['unread', 'unread', /Escape not sent: the front is not one of the run's windows: it was unread \(#162\)/]]) {
      for (const ax of [true, false]) {
        const what = `${engine}, front ${front}, cancel ${ax ? 'closing' : 'failing'}`;
        const calls = [];
        const dev = panelDevice({afterCase: front, ax});
        const {result} = await runWith({engine, plan, calls, cell: dev.cell, ops: dev.ops});
        assert.equal(result.complete, false, what);
        const after = ax ? 'the device\'s cancel then closed the panel' : 'the device\'s cancel then left the panel open';
        const problem = result.problems.find(p => said.test(p));
        assert.ok(problem && problem.includes(after), `${what}: ${result.problems.join('; ')}`);
        assert.deepEqual(result.meta.panelCloseStop && [result.meta.panelCloseStop.cause, result.meta.panelCloseStop.device], [cause, ax ? 'closed' : 'open'], what);
        // The close: Escape recorded unsent, no click, the device's cancel tried, its outcome kept.
        const close = result.meta.panelCloses[0];
        assert.deepEqual(close.steps.map(s => s.step), ['escape', 'device'], what);
        assert.deepEqual([close.steps[0].sent, close.steps[1].device, close.closed], [false, ax ? 'closed' : 'open', ax], what);
        assert.equal(dev.cancelled.length, 1, what);
        assert.ok(!sent(calls, HARNESS_CANCEL) && !sent(calls, HARNESS_ESCAPE), what);
        // The opening's own rows: by the guard's specific cause.
        const opening = result.rows.filter(r => r.opening === result.meta.placement.panel[0].opening);
        assert.ok(opening.length >= 1, what);
        for (const r of opening) assert.equal(sampleCause({...r, hosted: true}).category, cause, `${what} ${r.id}`);
        // Every planned sample has a row; each one after the stop NO VERDICT by the guard's cause.
        const planned = manifestOf({run: 1, samples: 2}, plan);
        const have = new Set(result.rows.map(r => `${r.section} ${r.id} ${r.sample}`));
        assert.deepEqual(planned.filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`)), [], what);
        const unrun = result.rows.filter(r => /not run: the run stopped when the key guard stopped a panel's close/.test(r.alertGuard?.detail ?? ''));
        assert.ok(unrun.some(r => r.id.startsWith('electron/')), what);
        assert.ok(unrun.every(r => sampleCause(r).category === cause), what);
        assert.ok(result.rows.filter(r => r.id.startsWith('electron/')).every(r => unrun.includes(r)), what);
        assert.deepEqual(validateCellResult(result), [], what);
      }
    }
  }
});

// The capture alert holding the close's Escape is the alert's (NO VERDICT `alert`), also when the Cancel click after it
// was merely ineffective, never a generic invalid.
test('Escape held by the capture alert, the click then ineffective: the opening\'s rows are NO VERDICT alert', async () => {
  const UNC = 'com.apple.UserNotificationCenter';
  let held = false;
  const dev = panelDevice({escape: false, click: false});
  const ops = {matrix: (base, a) => {
    const out = dev.ops.matrix(base, a);
    if (a[0] === 'alerts' && a[1] === 'check') return {...out, export: {...out.export, held: {count: held ? 1 : 0, windows: []}}};
    if (held && a[0] === 'read' && !isGuardRead(a) && out.reading) return {...out, reading: {...out.reading, frontmost: {pid: 77, bundleId: UNC, owned: false}}};
    return out;
  }};
  const cell = code => {
    const answer = dev.cell(code);
    if (code.includes('__m.threw = null')) held = true;
    if (code.includes('if (index !== null) await __app.click(index);')) held = false;
    return answer;
  };
  const {result} = await runWith({plan: {id: 'test', frontmost: ['openPanel'], speed: false, finding: false, background: [], launch: []}, env: {RUNNER_ENVIRONMENT: 'github-hosted'}, cell, ops});
  const close = result.meta.panelCloses[0];
  assert.equal(close.steps[0].held, true, JSON.stringify(close));
  const first = result.rows.find(r => r.opening === result.meta.placement.panel[0].opening && r.section === 'method');
  assert.deepEqual([first.panelClose?.cause, sampleCause({...first, hosted: true}).category], ['alert', 'alert'], JSON.stringify(first));
});

test('on a hosted runner a placement it cannot prove leaves the case and its timing NO VERDICT venue, unsent, after a few reads; off a hosted runner the case runs', async () => {
  const hosted = {RUNNER_ENVIRONMENT: 'github-hosted'};
  const calls = [], slept = [];
  const dev = panelDevice({listed: false});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, env: hosted, calls, slept, cell: dev.cell, ops: dev.ops});
  const rows = panelRows(result);
  assert.equal(rows.length, CASES.openPanel.length);
  for (const row of rows) {
    assert.match(row.venueInput, /^the Open panel's placement is unproven: no window of it was found after 4 reads, so its case was not sent/, row.id);
    assert.equal(sampleCause({...row, hosted: true}).category, 'venue');
  }
  const timings = result.rows.filter(r => r.section === 'speed' && r.id.startsWith('textedit/method.panel.'));
  assert.equal(timings.length, CASES.openPanel.length);
  assert.ok(timings.every(t => sampleCause(t).category === 'venue'));
  assert.ok(!sent(calls, CASE_ESCAPE) && !calls.some(c => c.code.includes(PANEL_SEARCH)), 'no case act was sent');
  assert.ok(result.meta.placement.panel.every(p => p.found === false && p.reads === 4));
  // Off a hosted runner: recorded, and the cases run.
  const off = panelDevice({listed: false, alerts: []});
  const offCalls = [];
  const o = await runWith({plan: {...PANEL_PLAN, background: []}, calls: offCalls, cell: off.cell, ops: off.ops});
  assert.ok(panelRows(o.result).every(r => r.venueInput === undefined));
  assert.ok(sent(offCalls, CASE_ESCAPE));
  assert.ok(o.result.meta.placement.panel.every(p => p.found === false && p.reads === 1));
});

test('each opening is named by its case or pairing: its placement entries and its rows carry the id, timing rows included', async () => {
  const dev = panelDevice();
  const {result} = await runWith({plan: PANEL_PLAN, cell: dev.cell, ops: dev.ops});
  const ids = result.meta.placement.panel.map(p => p.opening);
  assert.deepEqual(ids, [...casesOf('openPanel', 'frontmost').map(c => `openPanel/frontmost/${c.method}.${c.case}`), 'openPanel/background@finder']);
  for (const row of result.rows.filter(r => r.section === 'method' && r.target === 'openPanel'))
    assert.equal(row.opening, row.regime === 'frontmost' ? row.id : 'openPanel/background@finder', row.id);
  for (const t of result.rows.filter(r => r.section === 'speed' && r.id.startsWith('textedit/method.panel.')))
    assert.equal(t.opening, `openPanel/frontmost/${t.id.slice('textedit/method.panel.'.length)}`, t.id);
});

test('a close that was merely ineffective marks the opening\'s judged rows NO VERDICT invalid, by the close', async () => {
  const dev = panelDevice({escape: false, click: false});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  const observed = panelRows(result).find(r => r.id === 'openPanel/frontmost/getAXState.panel');
  assert.deepEqual(observed.panelClose, {cause: 'invalid', detail: 'neither Escape nor the Open panel\'s Cancel click closed it'});
  assert.deepEqual(sampleCause(observed), {category: 'invalid', detail: 'the panel\'s close: neither Escape nor the Open panel\'s Cancel click closed it'});
  const timing = result.rows.find(r => r.section === 'speed' && r.id === 'textedit/method.panel.getAXState.panel');
  assert.equal(sampleCause(timing).category, 'invalid', 'its timing with it');
  assert.ok(result.meta.panelCloses.every(c => c.rowsMarked >= 0 && c.closed));
});

test('a panel nothing closes stops the run on either lane alike, every planned sample after it recorded', async () => {
  for (const engine of ['vendor', 'cua']) {
    const dev = panelDevice({escape: false, click: false, ax: false});
    const plan = {id: 'test', frontmost: ['openPanel', 'electron'], speed: true, finding: false, background: [], launch: []};
    const {result} = await runWith({engine, plan, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, false, engine);
    assert.ok(result.problems.some(p => /Open panel stayed open after its case: Escape, its Cancel click and the device's Accessibility cancel all left it up/.test(p)), engine);
    assert.equal(result.meta.panelCloses.at(-1).closed, false);
    const planned = manifestOf({run: 1, samples: 2}, plan);
    const have = new Set(result.rows.map(r => `${r.section} ${r.id} ${r.sample}`));
    assert.deepEqual(planned.filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`)), [], engine);
    assert.ok(result.rows.filter(r => r.id.startsWith('electron/')).every(r => /not run: the run stopped/.test(r.invalid)));
    assert.deepEqual(validateCellResult(result), []);
  }
});

// ---- the Save sheet (ruling 1196) -------------------------------------------------------------------------------------

test('the Save sheet: one untitled document, a sheet opened per case and placed (already in the strip: not moved), its Escape and name typing judged, the document closed after', async () => {
  const calls = [];
  const dev = panelDevice({savePanel: true});
  const plan = {id: 'test', frontmost: ['savePanel'], speed: true, finding: false, background: [], launch: []};
  const {result} = await runWith({plan, calls, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.deepEqual(validateCellResult(result), []);
  const rows = result.rows.filter(r => r.section === 'method');
  assert.deepEqual(rows.map(r => r.id), ['savePanel/frontmost/pressKey.escape', 'savePanel/frontmost/typeText.name']);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix-cell: sheet.new')).length, 1, 'one untitled document');
  assert.equal(calls.filter(c => c.code.includes('cua-matrix-cell: savesheet.open')).length, 2, 'a sheet per case');
  const cleanup = calls.findIndex(c => c.code.includes('cua-matrix-cell: sheet.cleanup'));
  assert.ok(cleanup > calls.findLastIndex(c => c.code.includes('cua-matrix-cell: savesheet.open')), 'the untitled document closed after the cases');
  assert.deepEqual(dev.placed, []);
  assert.equal(result.meta.placement.panel.length, 2);
  assert.ok(result.meta.placement.panel.every(p => p.target === 'savePanel' && p.number === 994 && p.inStrip === true && p.moved === false));
  assert.deepEqual(result.rows.filter(r => r.section === 'speed').map(r => r.id).sort(), ['textedit/method.savePanel.pressKey.escape', 'textedit/method.savePanel.typeText.name']);
});

// Review finding 1: a Save sheet is an AXSheet child of its document in AX. The device answered that it found it as
// one and placed it by moving the parent: the entry says so (`via: 'parent'`), keeps the sheet's own size (nothing was
// resized), and the sheet's read-back decides the strip.
test('a Save sheet placed through its parent document: recorded via the parent, not resized, its read-back in the strip', async () => {
  const dev = panelDevice({savePanel: rect(700, 162, 480, 220), sheet: true});
  const plan = {id: 'test', frontmost: ['savePanel'], speed: false, finding: false, background: [], launch: []};
  const {result} = await runWith({plan, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.equal(dev.placed.length, 2);
  for (const p of result.meta.placement.panel) {
    assert.deepEqual([p.target, p.via, p.resized, p.readBack, p.moved, p.inStrip], ['savePanel', 'parent', undefined, rect(22, 80, 480, 220), true, true]);
    assert.equal(p.ax.kind, 'sheet');
  }
  assert.ok(result.rows.filter(r => r.section === 'method').every(r => r.venueInput === undefined));
});

// The design keeps the panel cases on both lanes off a hosted runner too (the owner's sitting): no cell of theirs may
// ever commit anything, so none sends Return or Enter, types a line break, or presses Save (or OK) in a panel, on either
// lane, hosted or not.
test('no panel cell sends Return or Enter, types a line break, or presses Save, on either lane, off a hosted runner included', async () => {
  const plan = {id: 'test', frontmost: ['openPanel', 'savePanel'], speed: true, finding: false, background: [{driven: 'openPanel', user: 'finder'}], launch: []};
  for (const engine of ['vendor', 'cua']) {
    for (const alerts of [[], ALERTS]) {
      const calls = [];
      const dev = panelDevice({alerts, escape: false});
      const {result} = await runWith({engine, plan, calls, cell: dev.cell, ops: dev.ops});
      assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
      assert.ok(calls.length > 10);
      for (const {code} of calls) {
        assert.doesNotMatch(code, /pressKey\(\s*"(Return|Enter|KP_Enter|return|enter)"/, engine);
        assert.doesNotMatch(code, /typeText\(\s*"[^"]*\\n/, engine);
        assert.doesNotMatch(code, /OKButton|"Save"|'Save'|\bSaveButton\b/, engine);
      }
    }
  }
});

// Re-review, finding 4: two windows that both qualify for one opening do not tell which is the panel. On a hosted runner
// the placement is recorded ambiguous, nothing is moved, and the case and its timing are NO VERDICT venue, unsent; the
// close still covers both candidates.
test('an opening with two candidate windows: ambiguous, nothing moved, its case NO VERDICT venue and unsent on a hosted runner', async () => {
  const calls = [];
  const dev = panelDevice({twin: true});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, env: {RUNNER_ENVIRONMENT: 'github-hosted'}, calls, cell: dev.cell, ops: dev.ops});
  assert.deepEqual(dev.placed, [], 'no candidate moved');
  for (const p of result.meta.placement.panel) assert.deepEqual([p.ambiguous, p.candidates.map(c => c.number), 'from' in p], [true, [994, 995], false]);
  for (const row of panelRows(result)) {
    assert.match(row.venueInput, /^the Open panel's placement is ambiguous: 2 windows qualify \(994, 995\), so its case was not sent/, row.id);
    assert.equal(sampleCause({...row, hosted: true}).category, 'venue');
  }
  const timings = result.rows.filter(r => r.section === 'speed' && r.id.startsWith('textedit/method.panel.'));
  assert.ok(timings.length && timings.every(t => sampleCause(t).category === 'venue'));
  assert.ok(!sent(calls, CASE_ESCAPE) && !calls.some(c => c.code.includes(PANEL_SEARCH)), 'no case act was sent');
  assert.equal(result.complete, true, result.problems.join('; '));
});
