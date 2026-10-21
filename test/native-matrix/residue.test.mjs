// M2b.1b's residue cells: their pure verdicts and rows (scripts/native-matrix/residue-checks.mjs), the adapter to the
// matrix's CellResult, and the device side (scripts/native-matrix/residue-device.mjs) over doubles. Nothing runs live.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {DRY_ANSWERS} from '../../scripts/native-matrix/live.mjs';
import {
  CHROME_NOT_JUDGED, HSCROLL_DEFECT, RESIDUE_CELLS, hscrollLane, SELECT_BEFORE, SELECT_MINIMIZED, asCellResult, enablementVerdict, hscrollVerdict, minimizedSelectRanges,
  minimizedSelectVerdict, modeAt, parseAccessibilityRecord, preparedEngineSettings, rangeOf, residueRows, route4Verdict,
} from '../../scripts/native-matrix/residue-checks.mjs';
import {HSCROLL_START, ROUTE4_HOME, enablementCheck, hscrollCheck, minimizedSelectCheck, route4Check, stripRestoredText, textViewOf} from '../../scripts/native-matrix/residue-device.mjs';

const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-residue-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });

const GOLDEN = JSON.parse(fs.readFileSync(new URL('../native-goldens/textedit/skyshot.json', import.meta.url), 'utf8'));
const WHOLE = ['cua scene document', 'Bold scene line', ...Array.from({length: 60}, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`)].join('\n');
const TEXTEDIT = {scene: 'textedit', app: '/System/Applications/TextEdit.app', bundleId: 'com.apple.TextEdit', pid: 600, window: {number: 41, bounds: {x: 0, y: 0, width: 610, height: 860}}};
const FINDER = {scene: 'finder', app: '/System/Library/CoreServices/Finder.app', pid: 700, window: {number: 42, bounds: {x: 0, y: 0, width: 900, height: 600}}};
const route = (inputRoute, posted = true, extra = {}) => ({meta: {inputRoute, startedAt: posted ? 1 : null, endedAt: posted ? 2 : null, receivedAt: 1, hidIdleMs: null, ...extra}});
const engineError = (errorName, reason) => new SkyComputerUseError({code: -10005, reason, errorName, meta: {inputRoute: null, startedAt: null, endedAt: null}});

// A TextEdit engine double: the run's document, a selection, a minimized flag, the text view the probe reads.
function textEditEngine({minimized = false, selectWhileMinimized = 'lands', clickRoute = 4, keyWindowRestored = true} = {}) {
  const state = {value: WHOLE, selected: null, minimized, horizontal: 0, calls: []};
  const area = () => GOLDEN.nodes.find(n => n.role === 'AXTextArea');
  const client = {
    calls: state.calls,
    async status() { return {routes: {}}; },
    async execute(method, args, options = {}) {
      state.calls.push({method, args, options});
      if (method === 'get_app_state') {
        const shot = structuredClone(GOLDEN);
        shot.app = {...shot.app, pid: TEXTEDIT.pid};
        Object.assign(shot.nodes.find(n => n.role === 'AXTextArea'), {value: state.value});
        // The observation goes through the focused element, which a minimized window does not answer.
        shot.selectedText = state.minimized ? null : state.selected;
        shot.timings = state.minimized ? {minimized: true, focusRead: 'notAnElement'} : {};
        return {result: shot, engineMs: 1};
      }
      if (method === 'select_text') {
        if (!state.minimized || selectWhileMinimized === 'lands') state.selected = args.text;
        if (state.minimized && selectWhileMinimized === 'refused') throw engineError('windowMinimized', 'minimized');
        return {result: route(1, false), engineMs: 1};
      }
      if (method === 'click') {
        if (args.element === 't49') { state.minimized = true; return {result: route(1), engineMs: 1}; }
        if (args.element === area().token) { state.selected = null; return {result: route(clickRoute, true, clickRoute === 4 ? {keyWindowRestored} : {}), engineMs: 1}; }
      }
      if (method === 'scroll') { state.horizontal += state.scrollStep ?? 0.25; return {result: route("2'"), engineMs: 1}; }
      throw new Error(`unexpected ${method}`);
    },
    close() { state.closed = true; },
  };
  const rangeNow = () => (state.selected ? rangeOf(state.value, state.selected) : {location: 0, length: 0});
  // The probe reads the text view and, given --set-horizontal, first writes the horizontal bar (unless `settable` is off).
  const probe = args => {
    assert.deepEqual(args.slice(0, 3), ['text-view', '--pid', String(TEXTEDIT.pid)]);
    let set;
    if (args.length > 3) {
      assert.equal(args[3], '--set-horizontal');
      set = {requested: Number(args[4]), written: state.settable !== false, error: state.settable !== false ? null : -25205};
      if (set.written) state.horizontal = Number(args[4]);
      state.calls.push({method: 'probe.set-horizontal', args: Number(args[4])});
    }
    return {...(set ? {set} : {}), pid: TEXTEDIT.pid, windows: [{minimized: state.minimized, textArea: {selectedRange: rangeNow(), scrollBars: {horizontal: state.horizontal, vertical: 0}}}],
      focused: {role: state.minimized ? null : 'AXTextArea', textAreaOfWindow: state.minimized ? null : 0}};
  };
  return {state, client, probe};
}
const io = (extra = {}) => ({sleep: async () => {}, now: (() => { let t = 0; return () => (t += 100); })(), frontmost: () => ({pid: FINDER.pid, bundleId: 'com.apple.finder'}),
  frontWindow: () => ({topWindow: {ownerPid: FINDER.pid, number: FINDER.window.number}}), windowOnScreen: () => true, activate: async () => ({ok: true}),
  watch: {start: () => ({pid: 9}), stop: () => [{pid: 9, watch: 'activations'}, {kind: 'activated', bundleId: 'com.apple.TextEdit', pid: 600, at: 1}, {kind: 'activated', bundleId: 'com.apple.finder', pid: 700, at: 2}]},
  stop: async () => ({wasRunning: false}), ...extra});

// ---- every cell's result is a CellResult ----------------------------------------------------------------------------

test('every residue cell\'s live result, adapted, is a conforming CellResult that keeps the live fields', () => {
  assert.deepEqual(RESIDUE_CELLS, ['route4', 'minimized-select', 'enablement', 'menu', 'hscroll']);
  const works = {found: true, enabled: true, valid: true, clicked: true, click: {ok: true, route: 1}, effect: true};
  const checks = {
    route4: DRY_ANSWERS['live-device.mjs route4'],
    'minimized-select': DRY_ANSWERS['live-device.mjs minimized-select'],
    enablement: DRY_ANSWERS['live-device.mjs enablement'],
    menu: {comparison: {items: {selectAll: {cua: {label: 'acts', enabled: true, effect: true}, vendor: {label: 'acts', enabled: true, effect: true}},
      bold: {cua: {label: 'acts'}, vendor: {label: 'acts'}}}}, cua: {items: {selectAll: works, bold: works}}, vendor: {items: {selectAll: works, bold: works}}},
    hscroll: {cua: DRY_ANSWERS['live-device.mjs hscroll'], vendor: {before: {horizontal: 0.5}, after: {horizontal: 0.9}, userInFront: true}},
  };
  for (const command of RESIDUE_CELLS) {
    const live = {schema: 'native-live-1', command, device: 'mini', started: '2026-10-21T10:00:00.000Z', finished: '2026-10-21T10:01:00.000Z', problems: [], complete: true, pass: true,
      engine: {build: 'b'.repeat(64), engineVersion: '0.1.0'}, vendor: {release: '26.928'}, check: checks[command], putBack: {ok: true}, frontApp: {same: true}};
    const shaped = asCellResult(command, live);
    assert.deepEqual(validateCellResult(shaped), [], command);
    assert.equal(shaped.schema, 'native-matrix-cell-1');
    assert.equal(shaped.cell, command);
    assert.equal(shaped.verdict, 'pass', command);
    assert.ok(shaped.rows.length > 0 && shaped.rows.every(r => r.section === 'residue'), command);
    assert.deepEqual(shaped.check, live.check, 'the live fields stay where the runbook reads them');
    assert.deepEqual(shaped.frontApp, {same: true});
    assert.equal(shaped.lanes[0].build, 'b'.repeat(64));
    assert.equal(shaped.lanes.length, ['menu', 'hscroll'].includes(command) ? 2 : 1, command);
  }
  const refused = asCellResult('route4', {device: 'mini', started: '2026-10-21T10:00:00.000Z', finished: '2026-10-21T10:00:01.000Z', problems: [], complete: false, refused: ['dirty']});
  assert.equal(refused.verdict, 'refused');
  assert.deepEqual(validateCellResult(refused), []);
  const incomplete = asCellResult('route4', {device: 'mini', started: '2026-10-21T10:00:00.000Z', finished: '2026-10-21T10:00:01.000Z', problems: ['the route4 check stopped: x'], complete: false,
    check: DRY_ANSWERS['live-device.mjs route4']});
  assert.equal(incomplete.verdict, 'fail', 'a valid passing row in an incomplete cell is not a pass');
});

// ---- route4 ------------------------------------------------------------------------------------------------------------

test('preparedEngineSettings: the owner\'s peerPolicy and routes copied, the scene app given route 4, nothing else', () => {
  assert.deepEqual(preparedEngineSettings(null, 'com.apple.TextEdit'), {routes: {'com.apple.TextEdit': 4}});
  assert.deepEqual(preparedEngineSettings({engine: 'cua', signingIdentity: 'ABC', peerPolicy: 'uid', routes: {'com.example.canvas': 4}}, 'com.apple.TextEdit'),
    {peerPolicy: 'uid', routes: {'com.example.canvas': 4, 'com.apple.TextEdit': 4}}, 'the signing identity and the engine setting are not the engine\'s to read');
  assert.deepEqual(preparedEngineSettings([1], 'x'), {routes: {x: 4}});
});

test('route4Check: the engine launched under a prepared home whose override it reads; the click collapses the selection by route 4, Finder and its window back; the home removed and the engine stopped', async () => {
  const run = scratch(), {client, state} = textEditEngine();
  let home = null, written = null;
  const stops = [];
  client.status = async () => ({routes: JSON.parse(fs.readFileSync(join(home, '.config/cua/engine.json'), 'utf8')).routes});
  const out = await route4Check({record: TEXTEDIT, user: FINDER, run, screenshots: join(run, 'shots'),
    io: io({ownerEngineSettings: () => ({signingIdentity: 'secret', routes: {'com.example.canvas': 4}}), stop: async () => { stops.push(home ? fs.existsSync(home) : null); return {wasRunning: true}; },
      clientUnderHome: given => { home = given; written = JSON.parse(fs.readFileSync(join(given, '.config/cua/engine.json'), 'utf8')); return client; }})});
  assert.equal(out.problem, undefined, out.problem);
  assert.equal(home, join(run, ROUTE4_HOME));
  assert.deepEqual(written, {routes: {'com.example.canvas': 4, 'com.apple.TextEdit': 4}});
  assert.equal((fs.statSync(join(run, ROUTE4_HOME), {throwIfNoEntry: false})), undefined, 'the prepared home is removed');
  assert.deepEqual(stops, [null, true], 'the engine stopped before the launch under the home and after the cell, before the home goes');
  assert.equal(state.closed, true);
  const {steps} = out;
  assert.deepEqual(steps.override, {read: true, routes: 2});
  assert.equal(steps.prepared, true);
  assert.deepEqual(steps.click, {ok: true, route: 4, posted: true, keyWindowRestored: true});
  assert.deepEqual(steps.after, {frontRestored: true, topWindowRestored: true});
  assert.equal(steps.landed, true);
  assert.deepEqual(steps.activations.map(a => a.bundleId), ['com.apple.TextEdit', 'com.apple.finder']);
  const v = route4Verdict(steps);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(residueRows('route4', out)[0].inputRoute, 4);
  assert.doesNotMatch(JSON.stringify(out), /secret|Line 1/);
});

test('route4Check: an override the engine did not read sends nothing; the verdict calls the sample invalid, not a failure', async () => {
  const run = scratch(), {client} = textEditEngine();
  const out = await route4Check({record: TEXTEDIT, user: FINDER, run, screenshots: join(run, 'shots'), io: io({ownerEngineSettings: () => null, clientUnderHome: () => client})});
  assert.match(out.problem, /did not read its route-4 override/);
  assert.deepEqual(client.calls, []);
  const [row] = residueRows('route4', out);
  assert.match(row.invalid, /did not read the prepared home/);
  const refused = await route4Check({record: TEXTEDIT, user: FINDER, run, screenshots: join(run, 'shots'), io: io({frontmost: () => ({pid: 1}), clientUnderHome: () => assert.fail('no launch')})});
  assert.match(refused.problem, /user window/);
});

test('route4Verdict: each of the outcome, the route, the front app, the top window and the key window decides', () => {
  const steps = DRY_ANSWERS['live-device.mjs route4'].steps;
  assert.equal(route4Verdict(steps).ok, true);
  for (const [change, why] of [[{landed: false}, 'landed'], [{click: {...steps.click, route: 3}}, 'route'], [{after: {frontRestored: false, topWindowRestored: true}}, 'front'],
    [{after: {frontRestored: true, topWindowRestored: false}}, 'top window'], [{click: {...steps.click, keyWindowRestored: false}}, 'key window'],
    [{click: {ok: false, errorName: 'foregroundRestoreFailed', route: 4}}, 'error']]) {
    const v = route4Verdict({...steps, ...change});
    assert.equal(v.valid, true, why);
    assert.equal(v.ok, false, why);
  }
  assert.equal(route4Verdict({...steps, prepared: false}).valid, false);
  assert.match(route4Verdict(steps).outcome.routeAdvice, /^not exercised/);
});

// ---- minimized-select --------------------------------------------------------------------------------------------------

test('minimizedSelectCheck: the write read past the observation while minimized, the engine\'s read beside it, both again once restored', async () => {
  const run = scratch();
  for (const [mode, write, read] of [['lands', 'landed', 'missed it'], ['dropped', 'did not land', 'nothing to see'], ['refused', 'refused (windowMinimized)', 'nothing to see']]) {
    const {client, probe, state} = textEditEngine({selectWhileMinimized: mode});
    const out = stripRestoredText(await minimizedSelectCheck({record: TEXTEDIT, client, screenshots: join(run, 'shots'),
      io: io({probe, windowOnScreen: () => !state.minimized, activate: async () => { state.minimized = false; return {ok: true}; }})}));
    assert.equal(out.problem, undefined, out.problem);
    assert.deepEqual(out.steps.expected, minimizedSelectRanges(WHOLE));
    assert.equal(out.steps.select.minimizedBefore && out.steps.select.minimizedAfter, true);
    assert.equal(out.steps.restore.onScreen, true, 'the window is back whatever happened');
    const v = minimizedSelectVerdict(out.steps);
    assert.equal(v.valid, true, JSON.stringify(v));
    assert.equal(v.write, write, mode);
    assert.equal(v.read, read, mode);
    if (mode === 'lands') {
      assert.match(v.decision, /^keep select_text.*a read gap/);
      assert.deepEqual(v.restored, {probe: true, engine: true});
      assert.deepEqual(residueRows('minimized-select', out).map(r => [r.id, r.ok]), [['minimized-select/textedit/write', true], ['minimized-select/textedit/read', false]]);
    }
    if (mode === 'dropped') {
      assert.match(v.decision, /^refuse select_text/);
      const rows = residueRows('minimized-select', out);
      assert.equal(rows[0].ok, false);
      assert.match(rows[1].invalid, /did not land/);
    }
    assert.doesNotMatch(JSON.stringify(out), /Line 0[2-9]|cua scene document/, 'no document text beyond the cell\'s own line');
  }
});

test('minimizedSelectVerdict: a window that came back mid-measure, or a prior selection that did not read, makes it invalid', () => {
  const steps = DRY_ANSWERS['live-device.mjs minimized-select'].steps;
  assert.equal(minimizedSelectVerdict(steps).write, 'landed');
  assert.equal(minimizedSelectVerdict(steps).read, 'saw it');
  assert.match(minimizedSelectVerdict({...steps, probeMinimized: {...steps.probeMinimized, minimizedAfter: false}}).invalid, /not minimized around probeMinimized/);
  assert.match(minimizedSelectVerdict({...steps, prior: {ok: true, range: null}}).invalid, /did not read back/);
  assert.equal(minimizedSelectVerdict({...steps, probeMinimized: {...steps.probeMinimized, range: {location: 5, length: 2}}}).write, 'landed elsewhere');
  assert.deepEqual(rangeOf('a Line 10 b', 'Line 10'), {location: 2, length: 7});
  assert.equal(rangeOf('Line 10 Line 10', 'Line 10'), null, 'twice is ambiguous');
  assert.notEqual(SELECT_BEFORE, SELECT_MINIMIZED);
});

test('textViewOf: the window with a text area, its range and bars; errors and missing reads kept as such', () => {
  assert.deepEqual(textViewOf({pid: 1, windows: [{minimized: false, textArea: null}, {minimized: true, textArea: {selectedRange: {location: 3, length: 4}, scrollBars: {horizontal: 0.5, vertical: null}}}],
    focused: {role: 'AXTextArea', textAreaOfWindow: 1}}), {minimized: true, range: {location: 3, length: 4}, horizontal: 0.5, vertical: null, focusedRole: 'AXTextArea', focusedIsTextArea: true});
  assert.match(textViewOf({error: 'this bundle has no Accessibility grant'}).error, /grant/);
  assert.match(textViewOf({windows: [{textArea: null}]}).error, /no window/);
});

// ---- enablement --------------------------------------------------------------------------------------------------------

test('enablementCheck: Chromium\'s own mode from the fixture\'s record: off before, on after each observation, off after each close', async () => {
  const run = scratch(), record = {scene: 'electron', app: '/f/Fixture.app', pid: 800, userDataDir: run, window: {number: 3}};
  const file = join(run, 'cua-fixture-accessibility.jsonl');
  let t = 1000;
  const append = enabled => fs.appendFileSync(file, `${JSON.stringify({at: t, enabled, source: 'event'})}\n`);
  append(false);
  const order = [];
  const out = await enablementCheck({record, screenshots: join(run, 'shots'), io: io({now: () => (t += 10), readFile: f => fs.readFileSync(f, 'utf8'),
    client: () => {
      const n = order.filter(e => e.startsWith('open')).length + 1;
      order.push(`open ${n}`);
      return {async execute(method) {
        order.push(`${method} ${n}`);
        append(true);
        return {result: {app: {pid: 800}, nodes: [], screenshot: null, timings: {enablementPrior: n === 1 ? 'false' : 'true', enabled: n === 1 ? 'AXManualAccessibility' : undefined}}};
      }, close() { order.push(`close ${n}`); t += 5; append(false); }};
    }})});
  assert.deepEqual(order, ['open 1', 'get_app_state 1', 'close 1', 'open 2', 'get_app_state 2', 'close 2']);
  assert.equal(out.steps.initial, false);
  const v = enablementVerdict(out.steps);
  assert.equal(v.released, true, JSON.stringify(v));
  assert.deepEqual(v.cycles.map(c => c.attributePrior), ['false', 'true'], 'the attribute\'s readback is recorded beside, and a stale true does not decide');
  assert.deepEqual(residueRows('enablement', out).map(r => r.ok), [true, true]);
});

test('enablementVerdict: a mode already on before the cell, or a close the mode outlived, is not a release', () => {
  assert.match(enablementVerdict({initial: true, cycles: []}).invalid, /read on before the cell/);
  const kept = enablementVerdict({initial: false, cycles: [{enabledAt: 1, closedAt: 2, releasedAt: null}]});
  assert.equal(kept.released, false);
  assert.deepEqual(residueRows('enablement', {steps: {initial: false, cycles: [{enabledAt: 1, closedAt: 2, releasedAt: null}]}}).map(r => r.ok), [false]);
  assert.deepEqual(residueRows('enablement', {steps: {initial: null, cycles: []}}).map(r => Boolean(r.invalid)), [true, true]);
  const record = parseAccessibilityRecord('{"at":1,"enabled":false,"source":"start"}\nnot json\n{"at":5,"enabled":true,"source":"event"}\n');
  assert.equal(record.length, 2);
  assert.equal(modeAt(record, 4), false);
  assert.equal(modeAt(record, 5), true);
  assert.equal(modeAt(record, 0), null);
  assert.match(CHROME_NOT_JUDGED, /not judged/);
});

// ---- hscroll -----------------------------------------------------------------------------------------------------------

test('hscrollCheck: cua\'s lane sets the bar mid-way by the probe, then scrolls the text area right one page, read back before and after', async () => {
  const run = scratch(), {client, probe, state} = textEditEngine();
  const out = await hscrollCheck({record: TEXTEDIT, user: FINDER, client, screenshots: join(run, 'shots'), io: io({probe})});
  const setAt = state.calls.findIndex(c => c.method === 'probe.set-horizontal'), scrollAt = state.calls.findIndex(c => c.method === 'scroll');
  assert.ok(setAt >= 0 && setAt < scrollAt, 'the bar is set before the scroll');
  assert.equal(state.calls[setAt].args, HSCROLL_START);
  assert.deepEqual(client.calls[scrollAt].args, {app: TEXTEDIT.app, element: GOLDEN.nodes.find(n => n.role === 'AXTextArea').token, direction: 'right', pages: 1});
  assert.deepEqual([out.before.horizontal, out.after.horizontal], [0.5, 0.75]);
  assert.deepEqual(out.before.set, {requested: 0.5, written: true, error: null});
  assert.equal(out.userInFront, true);
  assert.equal(hscrollLane(out).direction, 'right');
  const none = await hscrollCheck({record: TEXTEDIT, user: FINDER, client: textEditEngine().client, screenshots: join(run, 'shots'),
    io: io({probe: () => ({pid: 600, windows: [{minimized: false, textArea: {selectedRange: null}}]})})});
  assert.match(none.problem, /no horizontal scroll bar/);
});

test('hscrollLane: a bar the probe could not set mid-way leaves the lane invalid, since a scroll one way could not show', async () => {
  const run = scratch(), engine = textEditEngine();
  engine.state.settable = false;
  const out = await hscrollCheck({record: TEXTEDIT, user: FINDER, client: engine.client, screenshots: join(run, 'shots'), io: io({probe: engine.probe})});
  assert.deepEqual(out.before.set, {requested: 0.5, written: false, error: -25205});
  const lane = hscrollLane(out);
  assert.equal(lane.valid, false);
  assert.match(lane.invalid, /did not start mid-way \(read 0\)/);
  assert.equal(lane.direction, null);
  assert.equal(hscrollLane({before: {horizontal: 0.5}, userInFront: true}).invalid, 'the horizontal bar was not read after the scroll');
});

test('hscrollLane: the direction is the sign of the bar\'s move from mid-way: right, left, or none', () => {
  const lane = after => hscrollLane({before: {horizontal: 0.5}, after: {horizontal: after}, userInFront: true});
  assert.deepEqual([0.9, 0.1, 0.5, 0.5005].map(a => lane(a).direction), ['right', 'left', 'none', 'none']);
  assert.deepEqual([0.9, 0.1, 0.5].map(a => lane(a).moved), [true, false, false]);
});

test('hscrollVerdict: moved as cua\'s is equivalent; moved nothing is the vendor\'s declared defect and the cell passes; moved opposite is a sign difference and the cell fails', () => {
  const lane = after => ({before: {horizontal: 0.5}, after: {horizontal: after}, userInFront: true});
  const right = lane(0.9), left = lane(0.1), still = lane(0.5);
  const cell = vendor => asCellResult('hscroll', {schema: 'native-live-1', command: 'hscroll', device: 'mini', started: '2026-10-21T10:00:00.000Z',
    finished: '2026-10-21T10:01:00.000Z', problems: [], complete: true, engine: {build: 'b'.repeat(64)}, vendor: {release: '26.928'}, check: {cua: right, vendor}});

  assert.equal(hscrollVerdict(right, right).verdict, 'equivalent: the vendor\'s moves as cua\'s does');
  assert.equal(cell(right).verdict, 'pass');

  const defect = hscrollVerdict(right, still);
  assert.equal(defect.vendorDefect, true);
  assert.match(defect.verdict, /^vendor defect/);
  const rows = residueRows('hscroll', {cua: right, vendor: still});
  assert.deepEqual(rows.map(r => [r.engine, r.ok, r.outcome.direction]), [['cua', true, 'right'], ['vendor', false, 'none']]);
  assert.deepEqual(rows[1].declared, {kind: 'vendor-defect', cause: HSCROLL_DEFECT});
  assert.deepEqual(validateCellResult(cell(still)), []);
  assert.equal(cell(still).verdict, 'pass', 'finding the declared defect is the cell doing its job');

  const opposite = hscrollVerdict(right, left);
  assert.equal(opposite.oppositeSign, true);
  assert.equal(opposite.vendorDefect, false);
  assert.equal(opposite.verdict, 'opposite sign: the vendor\'s scroll moves left where cua\'s moves right');
  const oppositeRows = residueRows('hscroll', {cua: right, vendor: left});
  assert.equal(oppositeRows[1].declared, undefined, 'a sign difference is not the declared defect');
  assert.equal(oppositeRows[1].outcome.direction, 'left');
  assert.equal(cell(left).verdict, 'fail');

  assert.equal(hscrollVerdict(still, right).verdict, 'cua\'s horizontal scroll moves nothing');
  assert.equal(hscrollVerdict(left, left).verdict, 'equivalent: the vendor\'s moves as cua\'s does');
  assert.equal(residueRows('hscroll', {cua: left, vendor: left})[0].ok, false, 'cua moving left when asked right is not ok');
  assert.match(hscrollVerdict({before: {horizontal: null}}, right).verdict, /^no verdict/);
  assert.equal(residueRows('hscroll', {cua: {...right, userInFront: false}, vendor: right})[0].invalid, 'the user window left the front');
});
