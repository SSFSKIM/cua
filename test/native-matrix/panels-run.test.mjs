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
// does; `ax`: whether the device's AX cancel does; `alerts`: the alerts on screen (none off a hosted runner).
function panelDevice({moves = true, escape = true, click = true, ax = true, alerts = ALERTS, savePanel = false} = {}) {
  let open = false, at = CENTRED;
  const placed = [], cancelled = [];
  const cell = code => {
    if (code.includes('pressKey("super+o")') || code.includes('cua-matrix-cell: savesheet.open')) { open = true; at = savePanel ? rect(240, 100, 480, 200) : CENTRED; return {opened: true}; }
    if (code.includes('cua-matrix-cell: sheet.new')) return {opened: true};
    if (code.includes('cua-matrix-cell: sheet.cleanup')) return {closed: true, sceneInFront: true, front: 'scene'};
    if (HARNESS_ESCAPE(code) || CASE_ESCAPE(code)) { if (escape) open = false; return HARNESS_ESCAPE(code) ? {closed: !open} : null; }
    if (HARNESS_CANCEL(code)) { if (click) open = false; return {closed: !open}; }
    if (PANEL_GONE(code)) return {closed: !open};
    return null;
  };
  const matrix = (base, a) => {
    if (a[0] === 'place' && ['openPanel', 'savePanel'].includes(flag(a, 'scene'))) {
      const [x, y, width, height] = flag(a, 'frame').split(',').map(Number);
      placed.push(a);
      if (moves) at = {x, y, width, height};
      return {answer: {requested: {x, y, width, height}, readBack: at, matched: moves, exitStatus: null, pid: 300, ax: {trusted: true, found: true, size: 0, position: 0, readBack: at}}, at: [1, 2]};
    }
    if (a[0] === 'panel') { cancelled.push(a); if (ax) open = false; return {answer: {found: true, via: 'cancelButton', pressed: 0, closed: !open, pid: 300}, at: [1, 2]}; }
    const out = base(a);
    if (!isGuardRead(a)) return out;
    return {...out, alertBounds: {...out.alertBounds, alerts: alerts.map((bounds, i) => ({number: 59 + i, layer: 8, bounds})),
      windows: [...out.alertBounds.windows.map(w => ({...w, bounds: SCENE})), ...(open ? [{scene: 'textedit', number: 994, recorded: false, bounds: at}] : [])]}};
  };
  return {cell, ops: {matrix}, placed, cancelled};
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

test('cua-shaped close: Escape ineffective and the Cancel click refused by the guard; the device cancels by AX, the opening\'s rows NO VERDICT, the run goes on', async () => {
  for (const engine of ['cua', 'vendor']) {
    const calls = [];
    // The panel does not move, so the guard refuses the Cancel click over the alert, as in C-2.
    const dev = panelDevice({moves: false, escape: false});
    const plan = {id: 'test', frontmost: ['openPanel', 'electron'], speed: false, finding: false, background: [], launch: []};
    const {result} = await runWith({engine, plan, calls, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.ok(!sent(calls, HARNESS_CANCEL), 'the Cancel click was refused, never sent');
    assert.equal(dev.cancelled.length, CASES.openPanel.length, 'the device cancelled each opening');
    for (const a of dev.cancelled) assert.deepEqual([a[1], flag(a, 'window')], ['cancel', '994']);
    for (const close of result.meta.panelCloses) {
      assert.deepEqual(close.steps.map(s => s.step), ['escape', 'cancel', 'device'], engine);
      assert.deepEqual([close.steps[0].closed, close.steps[1].refused?.cause, close.steps[2].closed, close.closed], [false, 'alert', true, true]);
    }
    // The rows after the panel ran (the run did not stop).
    assert.ok(result.rows.some(r => r.id.startsWith('electron/') && r.alertGuard === undefined));
    for (const row of panelRows(result)) assert.notEqual(sampleCause({...row, hosted: true}), null, row.id);
  }
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
