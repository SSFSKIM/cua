// TextEdit's panels in a matrix run (rulings 1195, 1196; scripts/native-matrix/panels.mjs): each case on an opening of
// its own, the opening's window moved into the strip left of the capture alerts by the device (never the engine), the
// close one rule on both lanes (Escape, then its Cancel click, then the device's AX cancel), and the new judged cells.
// Pilot C-2's geometry: the alerts at 893,244 260x364 and 830,188 260x348; the panel centred at 520,162 880x448, listed
// under TextEdit's pid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {CASES, casesOf, FOCUS_REASONS, focusVerdict, PANEL_SEARCH, SAVE_PANEL_NAME, SAVE_PANEL_VALUE} from '../../scripts/native-matrix/plan.mjs';
import {stripCause} from '../../scripts/native-matrix/panels.mjs';
import {runWith} from './run-doubles.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const ALERTS = [rect(893, 244, 260, 364), rect(830, 188, 260, 348)];
// STRIP: where ruling 1203 places the centred panel, at its own size, its right edge at the strip's (822 - 880 = -58).
const CENTRED = rect(520, 162, 880, 448), STRIP = rect(-58, 80, 880, 448), SCENE = rect(22, 80, 700, 600);
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
// app's window in front); `sheet`: the helper answering that it found a Save sheet as an AXSheet child; `clamps`: the
// system keeping a moved panel's x at that x or more (true: 0); `axWrite`: the helper's answer for its write, over a
// successful one's; `drifts`: each move's read-back x off the asked one, in turn (none
// after them); `elements`: the frames the device reads for the panel's focused element and search field.
const OTHER_FRONT = {pid: 999, bundleId: 'com.example.other', owned: false};
function panelDevice({moves = true, escape = true, click = true, ax = true, alerts = ALERTS, savePanel = false, unread = false, listed = true, twin = false, claims = null,
  afterCase = null, sheet = false, clamps = false, axWrite = {}, drifts = [], elements = {}, foreignAtEscapeGuard = false} = {}) {
  const clampAt = clamps === true ? 0 : clamps === false ? null : clamps;
  let open = false, at = CENTRED, foreign = false, guardForeign = false;
  const placed = [], cancelled = [], states = [], elementReads = [];
  const drift = [...drifts];
  const cell = code => {
    // `foreignAtEscapeGuard`: once the judged Escape's case is prepared, another app is in front in every read the alert
    // guard takes (its own fresh read), while the plain reads before it still show TextEdit.
    if (foreignAtEscapeGuard && code.includes('__m.ready = __r?.ready') && code.includes('the Open panel is not up') && !code.includes('the field is not in the text')) guardForeign = true;
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
      if (moves) at = sheet ? {x, y, width: at.width, height: at.height} : {x: clampAt !== null ? Math.max(clampAt, x) : x + (drift.shift() ?? 0), y, width, height};
      return {answer: {requested: {x, y, width, height}, readBack: at, matched: moves, exitStatus: null, pid: 300, ax: {trusted: true, found: true, size: null, position: sheet ? null : 0, readBack: at, ...(sheet ? {kind: 'sheet', parentPosition: 0} : {}), ...axWrite}}, at: [1, 2]};
    }
    // The device's reading of the panel's window (`panel state`), and its AX cancel.
    if (a[0] === 'panel' && a[1] === 'state') { states.push(a); return {answer: {state: unread ? 'unread' : open ? 'open' : 'closed'}, at: [1, 2]}; }
    if (a[0] === 'panel' && a[1] === 'element') { elementReads.push(flag(a, 'element')); return {answer: {found: true, frame: elements[flag(a, 'element')] ?? null, inWindow: true, pid: 300}, at: [1, 2]}; }
    if (a[0] === 'panel') { cancelled.push(a); if (ax) open = false; return {answer: {found: true, via: 'cancelButton', pressed: 0, closed: !open, state: open ? 'open' : 'closed', pid: 300}, at: [1, 2]}; }
    const out = base(a);
    if (!isGuardRead(a)) return foreign && a[0] === 'read' && out.reading ? {...out, reading: {...out.reading, frontmost: foreign === 'unread' ? null : OTHER_FRONT}} : out;
    return {...out, ...(guardForeign && out.reading ? {reading: {...out.reading, frontmost: OTHER_FRONT}} : {}), alertBounds: {...out.alertBounds, alerts: alerts.map((bounds, i) => ({number: 59 + i, layer: 8, bounds})),
      windows: [...out.alertBounds.windows.map(w => ({...w, bounds: SCENE})), ...(open && listed ? [{scene: 'textedit', number: 994, recorded: false, bounds: at}, ...(twin ? [{scene: 'textedit', number: 995, recorded: false, bounds: rect(300, 300, 500, 300)}] : [])] : [])]}};
  };
  return {cell, ops: {matrix}, placed, cancelled, states, elementReads};
}
const PANEL_PLAN = {id: 'test', frontmost: ['openPanel'], speed: true, finding: false, background: [{driven: 'openPanel', user: 'finder'}], launch: []};
const panelRows = result => result.rows.filter(r => r.section === 'method' && r.target === 'openPanel');

// Ruling 1203: a panel's left part may stand off the display; the part on it must still be clear.
test('the strip takes a panel at a negative x: its on-screen part from x 0, its right edge at the strip\'s', () => {
  assert.equal(stripCause(rect(-58, 72, 880, 448), ALERTS), null, 'C-3\'s panel at -58');
  assert.match(stripCause(rect(-57, 72, 880, 448), ALERTS), /outside the strip/, 'one point past the edge');
  assert.match(stripCause(rect(-58, 10, 880, 448), ALERTS), /outside the strip/, 'under the menu bar');
  assert.match(stripCause(rect(-900, 80, 880, 448), ALERTS), /outside the strip/, 'nothing of it on the display');
});
test('the strip: left of every alert by the margin, below the menu bar; with no alert every frame is in it', () => {
  assert.equal(stripCause(rect(22, 80, 800, 448), ALERTS), null);
  assert.match(stripCause(CENTRED, ALERTS), /outside the strip clear of the alerts \(x 0-822/);
  assert.match(stripCause(rect(22, 80, 801, 448), ALERTS), /outside the strip/, 'one point past the edge');
  assert.match(stripCause(rect(22, 10, 700, 400), ALERTS), /outside the strip/, 'under the menu bar');
  assert.equal(stripCause(CENTRED, []), null);
});

test('the Open panel opened over the alerts is moved into the strip by the device at its own size, its right edge at the strip\'s, one opening per case, its cells sent and judged on both lanes', async () => {
  for (const engine of ['vendor', 'cua']) {
    const calls = [];
    const dev = panelDevice();
    const {result} = await runWith({engine, plan: PANEL_PLAN, calls, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.deepEqual(validateCellResult(result), []);
    // One opening per frontmost case and one for the background pairing, each moved by the device to the strip's frame.
    const openings = casesOf('openPanel', 'frontmost').length + 1;
    assert.equal(dev.placed.length, openings, engine);
    // Ruling 1203: x = 822 - 880, from the width read before the move; no other size asked.
    for (const a of dev.placed) assert.deepEqual([flag(a, 'scene'), flag(a, 'window'), flag(a, 'frame')], ['openPanel', '994', '-58,80,880,448']);
    assert.equal(result.meta.placement.panel.length, openings);
    for (const p of result.meta.placement.panel) assert.deepEqual([p.target, p.number, p.from, p.to, p.readBack, p.moved, p.inStrip], ['openPanel', 994, CENTRED, STRIP, STRIP, true, true]);
    // Its size read back unchanged: nothing says resized, and no fallback was taken.
    for (const p of result.meta.placement.panel) assert.deepEqual([p.resized, p.fallback, p.corrected], [undefined, undefined, undefined]);
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
  assert.deepEqual(rows.map(r => r.id), ['savePanel/frontmost/pressKey.escape', 'savePanel/frontmost/typeText.name', 'savePanel/frontmost/setValue.name']);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix-cell: sheet.new')).length, 1, 'one untitled document');
  assert.equal(calls.filter(c => c.code.includes('cua-matrix-cell: savesheet.open')).length, 3, 'a sheet per case');
  const cleanup = calls.findIndex(c => c.code.includes('cua-matrix-cell: sheet.cleanup'));
  assert.ok(cleanup > calls.findLastIndex(c => c.code.includes('cua-matrix-cell: savesheet.open')), 'the untitled document closed after the cases');
  assert.deepEqual(dev.placed, []);
  assert.equal(result.meta.placement.panel.length, 3);
  assert.ok(result.meta.placement.panel.every(p => p.target === 'savePanel' && p.number === 994 && p.inStrip === true && p.moved === false));
  assert.deepEqual(result.rows.filter(r => r.section === 'speed').map(r => r.id).sort(), ['textedit/method.savePanel.pressKey.escape', 'textedit/method.savePanel.setValue.name', 'textedit/method.savePanel.typeText.name']);
});

// Review finding 1: a Save sheet is an AXSheet child of its document in AX. The device answered that it found it as
// one and placed it by moving the parent: the entry says so (`via: 'parent'`), keeps the sheet's own size (nothing was
// resized), and the sheet's read-back decides the strip.
test('a Save sheet placed through its parent document: recorded via the parent, not resized, its read-back in the strip', async () => {
  const dev = panelDevice({savePanel: rect(700, 162, 480, 220), sheet: true});
  const plan = {id: 'test', frontmost: ['savePanel'], speed: false, finding: false, background: [], launch: []};
  const {result} = await runWith({plan, cell: dev.cell, ops: dev.ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.equal(dev.placed.length, 3);
  for (const p of result.meta.placement.panel) {
    assert.deepEqual([p.target, p.via, p.resized, p.readBack, p.moved, p.inStrip], ['savePanel', 'parent', undefined, rect(342, 80, 480, 220), true, true]);
    assert.equal(p.ax.kind, 'sheet');
  }
  assert.ok(result.rows.filter(r => r.section === 'method').every(r => r.venueInput === undefined));
});

// The design keeps the panel cases on both lanes off a hosted runner too (the owner's sitting): no cell of theirs may
// ever commit anything, so none sends Return or Enter, types a line break, or presses Save or OK in a panel, on either
// lane, on a hosted runner and off one (explicit environments; runWith's default is neither said).
const COMMITS = [/pressKey\(\s*"(Return|Enter|KP_Enter|return|enter)"/, /typeText\(\s*"[^"]*\\n/, /OKButton|"OK"|'OK'|"Save"|'Save'|\bSaveButton\b/];
test('no panel cell sends Return or Enter, types a line break, or presses Save or OK, on either lane, hosted and off a hosted runner', async () => {
  const plan = {id: 'test', frontmost: ['openPanel', 'savePanel'], speed: true, finding: false, background: [{driven: 'openPanel', user: 'finder'}], launch: []};
  const acted = (calls, act) => calls.filter(c => c.code.includes('__m.threw = null') && c.code.includes(act)).length;
  for (const engine of ['vendor', 'cua']) {
    for (const [where, env, alerts] of [['hosted', {RUNNER_ENVIRONMENT: 'github-hosted'}, ALERTS], ['off hosted', {}, []]]) {
      const what = `${engine}, ${where}`;
      const calls = [];
      const dev = panelDevice({alerts});
      const {result} = await runWith({engine, plan, env, calls, cell: dev.cell, ops: dev.ops});
      assert.equal(result.complete, true, `${what}: ${result.problems.join('; ')}`);
      assert.equal(result.meta.hosted, where === 'hosted', what);
      // All four of ruling 1196's panel cases ran: each one's act was sent.
      assert.equal(acted(calls, 'await __app.pressKey("Escape");'), 2, `${what}: the Open panel's and the Save sheet's Escape`);
      assert.equal(acted(calls, `typeText(${JSON.stringify(PANEL_SEARCH)})`), 1, `${what}: the search typing`);
      assert.equal(acted(calls, `typeText(${JSON.stringify(SAVE_PANEL_NAME)})`), 1, `${what}: the name typing`);
      assert.equal(acted(calls, `setValue(__m.index, ${JSON.stringify(SAVE_PANEL_VALUE)})`), 1, `${what}: the name's setValue (ruling 1204)`);
      for (const {code} of calls) for (const commit of COMMITS) assert.doesNotMatch(code, commit, what);
    }
  }
});

// The same cells executed against a stand-in TextEdit whose panel records every key, text, value, selection and click it
// is sent: the openers, each case's prepare, act and check, and the harness's close cells. Nothing but the opening keys
// and Escape is pressed, nothing but the two tokens typed, nothing written but the setValue case's fixture string into
// the name field (ruling 1204), and only the panel's fields and its Cancel
// are clicked.
const AsyncFunction = (async () => {}).constructor;
async function runCell(text, apps) {
  let out = '';
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', text)({}, {write: s => { out += s; }}); } finally { delete globalThis.__apps; }
  return parseCell(out);
}
// `saveName`: the name the Save sheet opens with, wholly selected in its focused name field (AppKit's); `writes`: whether
// an AX value write takes (pilot C-3: the vendor's setValue("") on the sheet's name field left it non-empty). The trailer
// shows the selected text in place of the focused element, as the renderer does.
// `elsewhere`: the sheet opens with another control (4) focused, holding the name's own text selected, and a click on the
// name field does not take (review finding 5).
// `write`: how setValue lands, given the value and {set(text), close()}; it may throw (by default it sets the value
// when `writes`).
function standInTextEdit({saveName = '', writes = true, elsewhere = false, write = null} = {}) {
  const sent = {keys: [], texts: [], values: [], selections: [], clicks: []};
  let up = null, value = '', focused = null, selected = null;
  const CANCEL = 3;
  const close = () => { up = null; value = ''; focused = null; selected = null; };
  const render = () => {
    const field = `${value ? `, Value: ${value}` : ''}`;
    const trailer = selected !== null ? `Selected text: \`\`\`\n${selected}\n\`\`\`` : null;
    if (up === 'open') return [`Window: "Open", App: TextEdit.`, '0 standard window ID: open-panel', `\t1 search text field (settable) Description: Search${field}`, `\t${CANCEL} button Cancel`, '',
      trailer ?? `The focused UI element is ${focused ?? 0} ${focused === 1 ? 'search text field' : 'standard window'}`].join('\n');
    if (up === 'save') return [`Window: "Untitled", App: TextEdit.`, '0 standard window Untitled', '\t1 sheet ID: save-panel', `\t\t2 text field (settable) ID: saveAsNameTextField${field}`, `\t\t${CANCEL} button Cancel`,
      ...(elsewhere ? [`\t\t4 text field (settable) ID: tagsField, Value: ${saveName}`] : []), '',
      trailer ?? `The focused UI element is ${focused ?? 0} ${focused === 2 ? 'text field' : 'standard window'}`].join('\n');
    return 'Window: "Untitled", App: TextEdit.\n0 standard window Untitled\n\t1 text entry area (settable) ID: First Text View\n';
  };
  const app = {
    async getAXState() { return render(); },
    async pressKey(k) {
      sent.keys.push(k);
      if (k === 'super+o') up = 'open';
      if (k === 'super+s') { up = 'save'; value = saveName; focused = elsewhere ? 4 : 2; selected = saveName || null; }
      if (k === 'Escape') close();
    },
    async typeText(t) { sent.texts.push(t); value = selected !== null ? value.replace(selected, t) : value + t; selected = null; },
    async setValue(i, v) {
      sent.values.push([i, v]);
      if (write) return write(v, {set: text => { value = text; selected = null; }, close});
      if (writes) { value = v; selected = null; }
    },
    async selectText(i, t) { sent.selections.push([i, t]); if (i === focused && value.includes(t)) selected = t; },
    async click(i) { sent.clicks.push(i); if (i === CANCEL) close(); else if (!elsewhere) { focused = i; selected = null; } },
  };
  return {app, sent, open: () => { up = 'open'; }};
}
// Each frontmost case of the panels run in the stand-in, its opener first and the harness's close after. -> [{target,
// case, prepare, check}], each cell's answer.
async function standInCases(stand) {
  const {closePanelClickCell, closePanelKeyCell, panelGoneCell, caseCells} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const {SAVE_SHEET_OPEN_CELL} = await import('../../scripts/native-matrix/probe-plan.mjs');
  const apps = {textedit: stand.app}, out = [];
  globalThis.__sheetDoc = 'Untitled';
  try {
    // The Open panel is opened in the stand-in itself (OPEN_PANEL's ⌘O needs the run's scene document in front; its
    // source is in the scan above); the Save sheet by its own opener.
    for (const [target, opener] of [['openPanel', null], ['savePanel', SAVE_SHEET_OPEN_CELL]]) {
      for (const c of casesOf(target, 'frontmost')) {
        if (opener) await runCell(opener, apps); else stand.open();
        const cells = caseCells(target, c);
        const prepare = await runCell(cells.prepare, apps);
        await runCell(cells.act, apps);
        out.push({target, case: `${c.method}.${c.case}`, prepare: prepare.value, check: (await runCell(cells.check, apps)).value});
        for (const cell of [closePanelKeyCell(target), closePanelClickCell(target), panelGoneCell(target)]) await runCell(cell, apps);
      }
    }
  } finally { delete globalThis.__sheetDoc; delete globalThis.__m; }
  return out;
}
test('the panel cells executed against a stand-in TextEdit press, type, write and click nothing that could commit', async () => {
  const stand = standInTextEdit();
  const {sent} = stand;
  await standInCases(stand);
  assert.deepEqual([...new Set(sent.keys)].sort(), ['Escape', 'super+s']);
  assert.deepEqual([...new Set(sent.texts)].sort(), [PANEL_SEARCH, SAVE_PANEL_NAME].sort(), 'both typing cases typed their token');
  assert.deepEqual(sent.values, [[2, SAVE_PANEL_VALUE]], 'nothing written but the setValue case\'s string, into the name field');
  assert.ok(sent.clicks.every(i => [1, 2, 3].includes(i)), `only the fields and Cancel: ${JSON.stringify(sent.clicks)}`);
  assert.ok(sent.texts.every(t => !/[\r\n]/.test(t)));
});
// Pilot C-3: the vendor's Save sheet name typing was "not prepared: the field could not be emptied" after its setValue("")
// (prepared: field emptied) left the name field non-empty. The prepare writes nothing: it focuses the field and selects
// its whole value (an AX selection, no key, as both engines do), so the typing replaces it; the check, the token read
// back whole, is unchanged.
test('a Save sheet name field no value write empties: its name selected whole by the prepare, the token typed over it and read back', async () => {
  const stand = standInTextEdit({saveName: 'Untitled', writes: false});
  const name = (await standInCases(stand)).find(r => r.case === 'typeText.name');
  assert.equal(name.prepare.ready, true, JSON.stringify(name.prepare));
  assert.deepEqual(name.check.outcome, {readBack: true, length: SAVE_PANEL_NAME.length, up: true});
  assert.equal(name.check.ok, true);
  // The typing case wrote nothing (the setValue case's own write is its own).
  assert.deepEqual(stand.sent.values, [[2, SAVE_PANEL_VALUE]]);
  // The field focused and its name selected by the prepare (the click deselects what AppKit selected at the opening).
  assert.deepEqual(stand.sent.selections, [[2, 'Untitled']]);
  assert.deepEqual(name.prepare.prepared, ['field selected']);
});
// Review finding 5: the name's own text selected in another control, the click on the name field not taking. The trailer
// shows that selection, so it proves nothing about the name field: the prepare's focus reading is the masked trailer (and
// cua's focused index another control's), which the row's verdict refuses, no typing sent.
test('the name\'s text selected in another control, the name field unfocused: the focus is not proven, the row not prepared', async () => {
  const {caseCells} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const {SAVE_SHEET_OPEN_CELL} = await import('../../scripts/native-matrix/probe-plan.mjs');
  const stand = standInTextEdit({saveName: 'Untitled', elsewhere: true});
  const apps = {textedit: stand.app};
  globalThis.__sheetDoc = 'Untitled';
  let prepare;
  try {
    await runCell(SAVE_SHEET_OPEN_CELL, apps);
    prepare = (await runCell(caseCells('savePanel', CASES.savePanel.find(c => c.method === 'typeText' && c.case === 'name')).prepare, apps)).value;
  } finally { delete globalThis.__sheetDoc; delete globalThis.__m; }
  // The selection was asked of the name field itself, never taken from the trailer.
  assert.deepEqual(stand.sent.selections, [[2, 'Untitled']]);
  assert.deepEqual(prepare.focus, {index: 2, trailer: 'masked'});
  assert.equal(focusVerdict(prepare.focus, null).problem, FOCUS_REASONS.masked, 'the vendor: the trailer masked');
  assert.match(focusVerdict(prepare.focus, {focusedIndex: 4}).problem, /^the field could not be given the focus/, 'cua: another control focused');
  assert.equal(focusVerdict({index: 2, trailer: 'focused'}, null).problem, null);
  assert.deepEqual(stand.sent.texts, []);
});
// Ruling 1204: the Save sheet's name written through the facade and read back by the settle. A write that takes passes,
// its reads timed; one that returns while the field keeps its value (pilot C-3's reading) fails and says so.
test('the Save sheet\'s setValue.name: a write that takes passes; one that returns while the field keeps its value fails, named', async () => {
  const took = (await standInCases(standInTextEdit({saveName: 'Untitled'}))).find(r => r.case === 'setValue.name');
  assert.equal(took.prepare.ready, true, JSON.stringify(took.prepare));
  assert.equal(took.check.ok, true, JSON.stringify(took.check));
  const o = took.check.outcome;
  assert.deepEqual([o.written, o.returnedOk, o.unchanged, o.length, o.prefix, o.failure], [true, true, false, SAVE_PANEL_VALUE.length, SAVE_PANEL_VALUE, undefined]);
  assert.match(o.hash, /^[0-9a-f]{64}$/);
  assert.equal(o.final, 'read');
  // The trace: diagnostics apart from the compared fields.
  assert.ok(o.trace.reads.length >= 1 && o.trace.reads.every(r => Number.isInteger(r.ms) && Number.isInteger(r.length)) && o.trace.reads.at(-1).prefix === SAVE_PANEL_VALUE, JSON.stringify(o.trace));
  assert.ok(Number.isInteger(o.trace.settleMs) && o.trace.settleMs < 500);
  assert.deepEqual(['reads', 'settleMs', 'late'].filter(k => k in o), [], 'no timing beside the effect');
  const kept = (await standInCases(standInTextEdit({saveName: 'Untitled', writes: false}))).find(r => r.case === 'setValue.name');
  const k = kept.check.outcome;
  assert.equal(kept.check.ok, false);
  assert.deepEqual([k.written, k.returnedOk, k.unchanged, k.prefix, k.failure], [false, true, true, 'Untitled', 'setValue returned ok, the field did not change']);
  // The settle waited for the value to hold still before judging it.
  assert.ok(k.trace.settleMs >= 500 && k.trace.reads.length > 1, JSON.stringify(k));
});
// Final review, item 1: the trace's times never make two failures differ. Two engines that both returned and both left
// the name as it was fail the same way (parity), however their reads were timed; another read-back is another failure.
test('setValue.name: equal failures with different timings are the same failure; another read-back is not', async () => {
  const {sameFailure} = await import('../../scripts/native-matrix/answers.mjs');
  const kept = (await standInCases(standInTextEdit({saveName: 'Untitled', writes: false}))).find(r => r.case === 'setValue.name');
  const vendor = {ok: false, outcome: kept.check.outcome};
  const cua = {ok: false, outcome: {...kept.check.outcome, trace: {reads: [{ms: 0, length: 8, prefix: 'Untitled'}, {ms: 101, length: 8, prefix: 'Untitled'}], settleMs: 611, late: true}}};
  assert.notDeepEqual(vendor.outcome.trace, cua.outcome.trace);
  assert.equal(sameFailure(vendor, cua), true);
  const partial = (await standInCases(standInTextEdit({saveName: 'Untitled', write: (v, {set}) => set(v.slice(0, 9))}))).find(r => r.case === 'setValue.name');
  assert.equal(sameFailure(vendor, {ok: false, outcome: partial.check.outcome}), false);
  // The pressKey rows share the settle: their failures compare by the read-back's hash alone (ruling 1144), so their
  // `reads`, `settleMs` and `late` never made two of them differ.
  const pressed = extra => ({ok: false, outcome: {exact: false, nfcEqual: false, length: 1, expectedLength: 1, hash: 'a'.repeat(64), ...extra}});
  assert.equal(sameFailure(pressed({reads: 3, settleMs: 512}), pressed({reads: 9, settleMs: 1990, late: true}), {readBack: true}), true);
});
// Final review, item 2: a setValue that threw is measured by its effect on the name, the thrown reply kept beside it.
test('setValue.name thrown: landed passes, a partial change fails as changed, a field gone keeps the answer and trace, unread', async () => {
  const thrown = write => standInCases(standInTextEdit({saveName: 'Untitled', write})).then(rows => rows.find(r => r.case === 'setValue.name').check);
  const landed = await thrown((v, {set}) => { set(v); throw new Error('the write was not confirmed'); });
  assert.equal(landed.ok, true, JSON.stringify(landed));
  assert.deepEqual([landed.outcome.written, landed.outcome.unchanged, landed.outcome.returnedOk, landed.outcome.threw, landed.outcome.effect], [true, false, false, 'the write was not confirmed', true]);
  const partial = await thrown((v, {set}) => { set(v.slice(0, 9)); throw new Error('stopped part-way'); });
  assert.equal(partial.ok, false);
  assert.deepEqual([partial.outcome.written, partial.outcome.unchanged, partial.outcome.prefix, partial.outcome.threw, partial.outcome.failure], [false, false, 'CUAMATRIX', 'stopped part-way', undefined]);
  const gone = await thrown((v, {close}) => { close(); throw new Error('the sheet went away'); });
  assert.equal(gone.ok, false);
  assert.deepEqual([gone.outcome.written, gone.outcome.final, gone.outcome.returnedOk, gone.outcome.threw, gone.outcome.trace.missing], [false, 'unread', false, 'the sheet went away', true]);
  assert.deepEqual([gone.outcome.trace.reads.at(-1).length, 'hash' in gone.outcome], [null, false]);
  // Returned and gone: the answer and the trace kept all the same.
  const quiet = await thrown((v, {close}) => { close(); });
  assert.deepEqual([quiet.ok, quiet.outcome.final, quiet.outcome.returnedOk, quiet.outcome.trace.missing], [false, 'unread', true, true]);
});
test('a field whose value the prepare cannot select whole is not prepared, by a reason that says so, nothing typed', async () => {
  const stand = standInTextEdit({saveName: 'Untitled'});
  stand.app.selectText = async () => {};
  const name = (await standInCases(stand)).find(r => r.case === 'typeText.name');
  assert.equal(name.prepare.ready, false);
  assert.match(name.prepare.reason, /^the field's value could not be selected whole/);
  assert.ok(!stand.sent.texts.includes(SAVE_PANEL_NAME));
});
// The move's own drift (pilot C-3 read 81,73 back for 80,80): a read-back one point past the strip's edge is moved once
// more by that point, and the entry says so.
test('a read-back past the strip\'s edge by the move\'s drift is moved once more by that much, then in the strip', async () => {
  const dev = panelDevice({drifts: [1]});
  const plan = {...PANEL_PLAN, frontmost: ['openPanel'], background: [], speed: false};
  const {result} = await runWith({plan: {...plan, only: undefined}, cell: dev.cell, ops: dev.ops});
  const first = result.meta.placement.panel[0];
  assert.deepEqual(dev.placed.slice(0, 2).map(a => flag(a, 'frame')), ['-58,80,880,448', '-59,80,880,448']);
  assert.deepEqual([first.corrected, first.readBack, first.inStrip], [{first: rect(-57, 80, 880, 448), to: rect(-59, 80, 880, 448)}, rect(-59, 80, 880, 448), true]);
  assert.ok(result.meta.placement.panel.slice(1).every(p => p.corrected === undefined && p.inStrip));
});

// Ruling 1203's fallback: the system clamps the panel's negative x (read back at 0), so no move puts it in the strip. Its
// key cases run, each cell checked against the frame of the element its input lands on; its pointer cases go to the
// owner's sitting, unsent; its observation runs.
const FIELD = rect(560, 96, 220, 22), UNDER_ALERT = rect(840, 200, 40, 22);
const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
test('a clamped panel takes the fallback: its key cells clear of the alerts run, its click cells go to the owner\'s sitting, unsent', async () => {
  for (const engine of ['vendor', 'cua']) {
    const calls = [];
    const dev = panelDevice({clamps: true, elements: {focused: FIELD, search: FIELD}});
    const {result} = await runWith({engine, plan: PANEL_PLAN, env: HOSTED, calls, cell: dev.cell, ops: dev.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.deepEqual(validateCellResult(result), []);
    for (const p of result.meta.placement.panel) assert.deepEqual([p.readBack, p.inStrip, p.fallback], [rect(0, 80, 880, 448), false, 'clamped'], engine);
    const rows = Object.fromEntries(panelRows(result).map(r => [r.id, r]));
    // The key cases and the observation ran and were judged: no mark of the guard, the venue or the owner's sitting.
    for (const id of ['openPanel/frontmost/typeText.search', 'openPanel/frontmost/pressKey.escape', 'openPanel/frontmost/getAXState.panel', 'openPanel/background/getAXState.panel@finder']) {
      assert.deepEqual([rows[id].alertGuard, rows[id].venueInput, rows[id].ownerSitting], [undefined, undefined, undefined], `${engine} ${id}`);
    }
    assert.ok(sent(calls, CASE_ESCAPE), 'the judged Escape was sent');
    assert.ok(calls.some(c => c.code.includes(`typeText(${JSON.stringify(PANEL_SEARCH)})`)), 'the judged search typing was sent');
    // The search typing's click on its field checked on the field, its keys on the focused element; the judged Escape's
    // on the focused element, and so the close's Escape after each of the five openings (review finding 4).
    assert.deepEqual([dev.elementReads.filter(e => e === 'search').length, dev.elementReads.filter(e => e === 'focused').length], [1, 2 + 5], engine);
    assert.ok(result.meta.elementGuards.every(g => g.cause === undefined && g.frame.x === FIELD.x));
    // The click cases: NO VERDICT ownerSitting, their act never sent; their timing row with them.
    for (const id of ['openPanel/frontmost/click.cancel', 'openPanel/background/click.cancel@finder']) {
      assert.equal(sampleCause({...rows[id], hosted: true}).category, 'ownerSitting', `${engine} ${id}`);
      assert.match(rows[id].ownerSitting, /left to the owner's sitting, unsent: the Open panel's window 994 stood at 0,80 880x448: its x clamped where -116 was asked/);
    }
    assert.ok(!calls.some(c => c.code.includes('__m.threw = null') && c.code.includes('await __app.click(__m.index)')), 'no click case\'s act was sent');
    assert.equal(sampleCause(result.rows.find(r => r.section === 'speed' && r.id === 'textedit/method.panel.click.cancel')).category, 'ownerSitting');
  }
});
test('under the fallback a key cell whose element an alert overlaps, or whose element is unread, is refused unsent; no Escape is sent, judged or the close\'s', async () => {
  for (const [elements, category] of [[{focused: UNDER_ALERT, search: FIELD}, 'alert'], [{search: FIELD}, 'unread']]) {
    for (const engine of ['vendor', 'cua']) {
      const calls = [];
      const dev = panelDevice({clamps: true, elements});
      const {result} = await runWith({engine, plan: {...PANEL_PLAN, background: []}, env: HOSTED, calls, cell: dev.cell, ops: dev.ops});
      const escape = panelRows(result).find(r => r.id === 'openPanel/frontmost/pressKey.escape');
      assert.equal(escape.alertGuard?.cause, category, JSON.stringify(escape));
      if (category === 'alert') assert.match(escape.alertGuard.detail, /overlaps the Open panel's focused element \(840,200 40x22\)/);
      assert.ok(!sent(calls, CASE_ESCAPE), 'the judged Escape was not sent');
      assert.ok(!sent(calls, HARNESS_ESCAPE), 'nor any close\'s Escape');
      // Every close refused its Escape and went on: the click refused by the guard (the panel over the alerts), the
      // device's AX cancel closing it.
      assert.ok(result.meta.panelCloses.every(c => c.closed && c.steps[0].refused?.cause === category && c.steps.at(-1).step === 'device'), JSON.stringify(result.meta.panelCloses));
      assert.equal(result.complete, true, result.problems.join('; '));
    }
  }
});
// Review finding 3: a clamp is judged on the final read-back, and only after a position write that took. A write not
// taken, or one that left the panel where it opened, is an unproven placement: NO VERDICT venue, the case unsent. A clamp
// short of the strip at a negative x is a clamp too.
test('a clamp is a written position the system moved elsewhere; a write not taken, or no move, is the venue\'s', async () => {
  const plan = {...PANEL_PLAN, background: []};
  for (const [what, options, fallback] of [
    ['untrusted, unmoved', {moves: false, axWrite: {trusted: false, position: null}}, false],
    ['no window found, unmoved', {moves: false, axWrite: {found: false, position: null}}, false],
    ['an AXError, unmoved', {moves: false, axWrite: {position: -25205}}, false],
    ['written, unmoved', {moves: false}, false],
    ['written, clamped at x -20', {clamps: -20, elements: {focused: FIELD, search: FIELD}}, true],
    ['written, clamped at x 0', {clamps: true, elements: {focused: FIELD, search: FIELD}}, true],
  ]) {
    const calls = [];
    const dev = panelDevice(options);
    const {result} = await runWith({plan, env: HOSTED, calls, cell: dev.cell, ops: dev.ops});
    const placements = result.meta.placement.panel;
    assert.ok(placements.every(p => (p.fallback === 'clamped') === fallback && p.inStrip === false), `${what}: ${JSON.stringify(placements[0])}`);
    const rows = panelRows(result);
    if (fallback) assert.ok(rows.every(r => r.venueInput === undefined), what);
    else {
      assert.ok(rows.every(r => sampleCause({...r, hosted: true}).category === 'venue' && r.ownerSitting === undefined), what);
      assert.ok(!sent(calls, CASE_ESCAPE), `${what}: nothing of the cases sent`);
    }
  }
  // At -20 the read-back is judged after the one correction: asked -58, then -58 - 38, read back at -20 both times.
  const dev = panelDevice({clamps: -20, elements: {focused: FIELD, search: FIELD}});
  const {result} = await runWith({plan, env: HOSTED, cell: dev.cell, ops: dev.ops});
  assert.deepEqual(dev.placed.slice(0, 2).map(a => flag(a, 'frame')), ['-58,80,880,448', '-96,80,880,448']);
  assert.deepEqual(result.meta.placement.panel[0].readBack, rect(-20, 80, 880, 448));
});
// Review finding 4: under the fallback the key guard sends on its own fresh reading, not on the one taken before it.
test('under the fallback the judged Escape is sent on the guard\'s fresh reading: another app in front there, nothing sent', async () => {
  const calls = [];
  const dev = panelDevice({clamps: true, elements: {focused: FIELD, search: FIELD}, foreignAtEscapeGuard: true});
  const {result} = await runWith({plan: {...PANEL_PLAN, background: []}, env: HOSTED, calls, cell: dev.cell, ops: dev.ops});
  assert.ok(!sent(calls, CASE_ESCAPE), 'the judged Escape was not sent');
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /not one of the run's windows/.test(p)), result.problems.join('; '));
});
test('off a hosted runner no fallback is taken: nothing is moved, nothing left to the owner\'s sitting', async () => {
  const dev = panelDevice({clamps: true, alerts: []});
  const {result} = await runWith({plan: PANEL_PLAN, cell: dev.cell, ops: dev.ops});
  assert.ok(result.meta.placement.panel.every(p => p.fallback === undefined));
  assert.ok(panelRows(result).every(r => r.ownerSitting === undefined));
  assert.deepEqual(dev.elementReads, []);
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
