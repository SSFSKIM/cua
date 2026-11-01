// #188's additions to #187's slot kit (scripts/cursor-sitting/item-188.mjs): the four repaired matrix rows run as the
// matrix defines them and judged as it judges them, cell 3 recorded only, both only under ABC, value-free, and neither
// ever counting for #187's verdict. Nothing is driven: the runner runs against fakes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {read187} from '../../scripts/cursor-sitting.mjs';
import {item187Markdown, ITEMS, judge187, judgedOk, plan187} from '../../scripts/cursor-sitting/item-187.mjs';
import {ALL_ITEMS_188, caseOf188, CLICK_LINE_RANGE, CLICK_VALUE, clickItem188, clickRecord188, END_RANGE, item188Tasks, ITEMS_188, judge188, LABELS_188, markdown188, row188,
  rowId188, ROWS_188, rowsItem188, selectionOutcome, WORD_RANGE} from '../../scripts/cursor-sitting/item-188.mjs';
import {runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {FIELD_LINES, FOCUS_REASONS, PASTED, TYPED} from '../../scripts/native-matrix/plan.mjs';
import {KOREAN_2SET} from '../../scripts/native-matrix/unicode-plan.mjs';
import {SCENE_MARKER} from '../../scripts/cursor-sitting/target-guard.mjs';

const ABC = 'com.apple.keylayout.ABC';
const PIDS = {electron: 203, finder: 204, chrome: 201, textedit: 202};
const NUMBERS = {electron: 13, finder: 14, chrome: 11, textedit: 12};
const BOUNDS = {electron: {x: 140, y: 100, width: 720, height: 560}, finder: {x: 600, y: 80, width: 700, height: 500}};
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-188-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
// No field text, typed sentence or pasted sentence in what the kit keeps.
const leaks = text => [...FIELD_LINES, TYPED, PASTED].filter(s => String(text).includes(s));

test('the four rows are the matrix\'s: ids, cells and prepares as plan.mjs and matrix-cells.mjs make them, never forked', () => {
  assert.deepEqual(ROWS_188.map(rowId188), ['electron/frontmost/paste.replace', 'electron/background/typeText.replace@finder', 'electron/background/pressKey.tab@finder',
    'electron/background/paste.replace@finder']);
  for (const engine of ['cua', 'vendor']) {
    const steps = rowsItem188(engine), cells = steps.filter(s => s.run).map(s => s.cell);
    for (const r of ROWS_188) {
      const made = caseCells('electron', caseOf188(r));
      for (const phase of ['prepare', 'act', 'check']) assert.ok(cells.includes(`${SCENE_MARKER('electron')}\n${made[phase]}`), `${rowId188(r)}'s ${phase} is the matrix's own cell`);
    }
    const open = steps.find(s => s.open);
    assert.equal(open.engine, engine);
    assert.deepEqual(open.bind, ['electron'], 'Finder is the user window: never bound, never observed');
    // The background acts under the user window's key guard, the frontmost one under the fixture's.
    const acts = steps.filter(s => s.run && /act:/.test(s.label));
    assert.deepEqual(acts.map(s => s.keys), ['electron', 'finder', 'finder', 'finder']);
    const userAt = steps.findIndex(s => s.task === '188-activate' && s.args[0] === 'finder');
    assert.ok(userAt > steps.indexOf(acts[0]) && userAt < steps.indexOf(acts[1]), 'Finder comes to the front after the frontmost row, before the background ones');
  }
  const click = clickItem188('vendor');
  assert.equal(click.find(s => s.open).engine, 'vendor');
  assert.equal(click.filter(s => s.task === '188-click-record').length, 2);
});

test('the #188 rows never run under 2-Set: every item gates on ABC before its first act, and all of them run before Korean is engaged', () => {
  const plan = plan187();
  const order = plan.map(p => p.item);
  assert.deepEqual(order.slice(0, 6), [ITEMS.place, ITEMS_188.rows('cua'), ITEMS_188.click('cua'), ITEMS_188.rows('vendor'), ITEMS_188.click('vendor'), ITEMS.a1]);
  const steps = plan.flatMap(p => p.steps.map(s => ({...s, item: p.item})));
  const firstKorean = steps.findIndex(s => s.task === 'select-source' && s.args.includes(KOREAN_2SET));
  const last188 = steps.findLastIndex(s => ALL_ITEMS_188.includes(s.item));
  assert.ok(firstKorean > last188, 'no 2-Set selection before the last #188 step');
  for (const item of plan.filter(p => ALL_ITEMS_188.includes(p.item))) {
    const s = item.steps, gate = s.findIndex(x => x.task === '188-abc' && x.args[1] === 'start');
    const select = s.findIndex(x => x.task === 'select-source');
    assert.deepEqual(s[select].args.slice(0, 1), ['latin']);
    assert.ok(select < gate && s[gate].required === true, `${item.item}: ABC selected, then read back as a required gate`);
    const firstAct = s.findIndex(x => x.run && (/act:|click$/.test(x.label)));
    assert.ok(gate < firstAct, `${item.item}: the gate precedes every act`);
    assert.ok(s.findIndex(x => x.task === '188-abc' && x.args[1] === 'end') > s.findLastIndex(x => x.run), `${item.item}: the source read back after the last cell`);
    assert.ok(!s.some(x => x.task === 'select-source' && x.args[0] !== 'latin'), `${item.item} selects nothing but ABC`);
  }
  assert.deepEqual(plan187({part: '188'}).map(p => p.item), [ITEMS.place, ...ALL_ITEMS_188, ITEMS.end]);
  assert.ok(!plan187({part: 'a'}).some(p => ALL_ITEMS_188.includes(p.item)), '--part a is #187\'s Part A alone');
  assert.ok(!plan187({vendor: true}).some(p => ALL_ITEMS_188.includes(p.item)));
});

// A row's answers, a delivering background row on cua; `over` replaces any.
function rowInput({r = ROWS_188[1], engine = 'cua', ...over} = {}) {
  const key = `${ITEMS_188.rows(engine)}.${ROWS_188.indexOf(r)}`, background = r.regime === 'background';
  const reading = (pid, number) => ({at: 1, frontmost: {pid, bundleId: 'b', owned: true}, topWindow: {ownerPid: pid, number, bounds: BOUNDS.finder, owned: true}});
  return {
    spec: {key, item: ITEMS_188.rows(engine), id: rowId188(r), engine, regime: r.regime, method: r.method, case: r.case, user: r.user},
    prepare: {ok: true, value: {ready: true, focus: {index: 4, trailer: engine === 'cua' ? 'masked' : 'focused'}, prepared: ['field emptied to clear a selection']},
      meta: engine === 'cua' ? {observation: {focusedIndex: 4, focusedRole: 'AXTextArea'}} : {}},
    front: background ? {ok: true, reading: reading(PIDS.finder, NUMBERS.finder), userWindow: {pid: PIDS.finder, bounds: BOUNDS.finder}, watcher: true} : {ok: true, reading: reading(PIDS.electron, NUMBERS.electron)},
    act: {ok: true, value: {actMs: 120, threw: false}, route: 3, meta: {activationGuardMs: 40, activationClick: 'posted', entered: 44}},
    after: background ? {reading: reading(PIDS.finder, NUMBERS.finder), focus: {appOwned: true, appPid: PIDS.finder, named: true, valueHash: null}, watcher: true} : {reading: reading(PIDS.electron, NUMBERS.electron)},
    check: {ok: true, value: {ok: true, outcome: {exact: true, inserted: 1}}},
    window: [10, 20], ...over};
}
const rowEvidence = (engine, records, {stop = {ok: true, byRow: {}, unaccounted: []}, end = {ok: true, edge: 'end', source: {id: ABC}}} = {}) => [
  {kind: 'start'}, {kind: 'task', task: '188-abc', result: {ok: true, edge: 'start', source: {id: ABC}}},
  ...records.map(result => ({kind: 'task', task: '188-row', result})),
  ...(end ? [{kind: 'task', task: '188-abc', result: end}] : []), ...(stop ? [{kind: 'task', task: '188-activations-stop', result: stop}] : [])];
const allRows = (engine, tweak = x => x) => ROWS_188.map(r => tweak(row188(rowInput({r, engine}))));

test('a row: the matrix\'s focus verdict (an unmaskable focus on cua, the trailer on the vendor), the stated clear kept, the user window and watcher required', () => {
  const good = row188(rowInput());
  assert.equal(good.valid, true);
  assert.equal(good.delivered, true);
  assert.equal(good.focusReadBy, 'observation', 'a masked trailer is judged by cua\'s focusedIndex');
  assert.deepEqual(good.prepared, ['field emptied to clear a selection']);
  const vendor = row188(rowInput({engine: 'vendor', prepare: {ok: true, value: {ready: true, focus: {index: 4, trailer: 'focused'}}, meta: {}}}));
  assert.equal(vendor.focusReadBy, 'trailer');
  assert.equal(vendor.valid, true);
  const masked = row188(rowInput({engine: 'vendor', prepare: {ok: true, value: {ready: true, focus: {index: 4, trailer: 'masked'}}, meta: {}}}));
  assert.equal(masked.invalid, `not prepared: ${FOCUS_REASONS.masked}`, 'the masked reason is its own');
  const elsewhere = row188(rowInput({prepare: {ok: true, value: {ready: true, focus: {index: 4, trailer: 'masked'}}, meta: {observation: {focusedIndex: 9, focusRead: 'AXError -25212'}}}}));
  assert.match(elsewhere.invalid, /could not be given the focus \(the focus read answered AXError -25212\)/);
  assert.equal(row188(rowInput({front: {ok: false, userWindow: null, watcher: true}})).invalid, 'the user window was not in front before the action');
  assert.equal(row188(rowInput({act: null})).invalid, 'the key guard did not send the action\'s keys');
  assert.equal(row188(rowInput({after: {...rowInput().after, watcher: false}})).invalid, 'the activation watcher was not running after the action');
  assert.equal(row188(rowInput({check: {ok: true, value: {ok: false, outcome: {exact: false, inserted: 0}}}})).delivered, false);
  // A refusal's sentence keeps no typed text.
  const threw = row188(rowInput({check: {ok: true, value: {ok: false, outcome: {exact: false, threw: `could not type ${TYPED}`}}}}));
  assert.deepEqual(leaks(JSON.stringify(threw)), []);
});

test('the judge: PASS needs every row valid, delivered and, behind Finder, the matrix\'s oracle clean; the vendor is the comparison', () => {
  const items = {[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua')), [ITEMS_188.rows('vendor')]: rowEvidence('vendor', allRows('vendor'))};
  const judged = judge188(items);
  assert.equal(judged.cua.verdict, 'PASS', JSON.stringify(judged.rows.cua.map(r => r.why)));
  assert.deepEqual(judged.rows.vendor.map(r => r.verdict), Array(4).fill('PASS'));
  assert.ok(judged.rows.cua.filter(r => r.record.regime === 'background').every(r => r.interference.ok));
  // An activation in a background row's span is the oracle's failure.
  const key = judged.rows.cua[2].record.key;
  const activated = judge188({[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua'), {stop: {ok: true, byRow: {[key]: [{bundleId: 'io.github.ssfskim.cua.fixture.electron', at: 15}]}, unaccounted: []}})});
  assert.equal(activated.cua.verdict, 'FAIL');
  assert.equal(activated.rows.cua[2].verdict, 'FAIL');
  assert.match(activated.rows.cua[2].why, /interfered/);
  // The front app changed: the oracle's frontmost.
  const moved = allRows('cua', r => (r.regime === 'background' ? {...r, oracle: {...r.oracle, after: {...r.oracle.after, frontmost: {pid: PIDS.electron, bundleId: 'e', owned: true}}}} : r));
  assert.equal(judge188({[ITEMS_188.rows('cua')]: rowEvidence('cua', moved)}).cua.verdict, 'FAIL');
  // No watcher record: the background rows' coverage is unproven, never a pass.
  const noStop = judge188({[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua'), {stop: null})});
  assert.equal(noStop.cua.verdict, 'INCOMPLETE');
  assert.equal(noStop.rows.cua[0].verdict, 'PASS', 'the frontmost row needs no oracle');
  // The source after the rows not ABC: the rows are not counted.
  const korean = judge188({[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua'), {end: {ok: false, edge: 'end', source: {id: KOREAN_2SET}}})});
  assert.ok(korean.rows.cua.every(r => r.verdict === 'INVALID' && /not ABC/.test(r.why)));
  assert.notEqual(korean.cua.verdict, 'PASS');
  // An invalid row and a missing one.
  const partial = judge188({[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua', r => (r.id.includes('tab') ? {...r, invalid: 'not prepared: x', valid: false, delivered: false} : r)).slice(0, 3))});
  assert.deepEqual(partial.rows.cua.map(r => r.verdict), ['PASS', 'PASS', 'INVALID', 'NOT RUN']);
  assert.equal(partial.cua.verdict, 'INCOMPLETE');
  const md = markdown188(judged).join('\n');
  assert.match(md, /## #188 rows \(counted for #188, never for #187\): PASS on cua \(4 of 4\)/);
  assert.match(md, /\| electron\/background\/pressKey\.tab@finder \| PASS \| PASS \|/);
  assert.match(md, /focus read by observation/);
  assert.match(markdown188(judge188({})).join('\n'), /NOT RUN/);
});

test('cell 3\'s outcomes: (i) the selection kept, collapsed or moved; (ii) the caret moved to the point, stayed, or elsewhere', () => {
  assert.deepEqual(WORD_RANGE, {location: CLICK_VALUE.indexOf('charlie'), length: 7});
  assert.equal(END_RANGE.location, CLICK_VALUE.length);
  assert.deepEqual(selectionOutcome('i', WORD_RANGE, WORD_RANGE, null), {outcome: 'kept', by: 'probe'});
  assert.deepEqual(selectionOutcome('i', WORD_RANGE, {location: 22, length: 0}, null), {outcome: 'collapsed', where: 'elsewhere', by: 'probe'});
  assert.deepEqual(selectionOutcome('i', WORD_RANGE, {location: WORD_RANGE.location + 7, length: 0}, null).where, 'at its end');
  assert.equal(selectionOutcome('i', WORD_RANGE, {location: 0, length: 3}, null).outcome, 'moved');
  assert.deepEqual(selectionOutcome('i', WORD_RANGE, null, {sameWord: true, selectedLength: 7}), {outcome: 'kept', by: 'trailer'});
  assert.equal(selectionOutcome('ii', END_RANGE, {location: CLICK_LINE_RANGE[0] + 5, length: 0}, null).outcome, 'moved to the click point');
  assert.equal(selectionOutcome('ii', END_RANGE, END_RANGE, null).outcome, 'stayed');
  assert.equal(selectionOutcome('ii', END_RANGE, {location: 3, length: 0}, null).outcome, 'moved elsewhere');
  assert.equal(selectionOutcome('ii', END_RANGE, {location: 3, length: 2}, null).outcome, 'selected');
  assert.equal(selectionOutcome('ii', END_RANGE, null, null).outcome, 'unread');
});

test('cell 3\'s record is value-free whatever its answers carry, and keeps the element click\'s meta', () => {
  const smuggled = CLICK_VALUE;
  const record = clickRecord188({item: ITEMS_188.click('cua'), engine: 'cua', part: 'i',
    prepare: {ok: true, value: {ready: true, value: smuggled, text: smuggled}},
    before: {range: {location: WORD_RANGE.location, length: 7, text: smuggled}, focusedIsTextArea: true},
    click: {ok: true, value: {clickMs: 30, threw: false, selected: smuggled}, route: 1, meta: {elementClick: {plan: 'action', action: 'AXPress', reason: 'advertised', hit: 'same', hitTest: 'application', extra: smuggled}}},
    after: {range: {location: WORD_RANGE.location, length: 7}, focusedIsTextArea: true},
    read: {ok: true, value: {fieldIndex: 4, selectedLength: 7, sameWord: true, valueIntact: true, focusedByTrailer: false, selected: smuggled}, meta: {observation: {focusedIndex: 4}}}});
  assert.equal(record.outcome, 'kept');
  assert.equal(record.precondition, true);
  assert.deepEqual(record.elementClick, {plan: 'action', action: 'AXPress', reason: 'advertised', hit: 'same', hitTest: 'application'});
  assert.equal(record.focusedOnField, true);
  assert.deepEqual(leaks(JSON.stringify(record)), []);
  const unready = clickRecord188({item: 'x', engine: 'vendor', part: 'ii', prepare: {ok: true, value: {ready: false, reason: 'a selection is left in the field'}}});
  assert.equal(unready.invalid, 'not prepared: a selection is left in the field');
  assert.equal(unready.outcome, null);
  // The cells return judgments: no return of a cell's own body (after the shared prelude) hands out the value or the
  // selected text, only lengths, comparisons and indexes.
  for (const step of clickItem188('cua').filter(s => s.run)) {
    const body = step.cell.slice(step.cell.indexOf('// cua-188'));
    const returns = [...body.matchAll(/return (\{[^;]*\});/g)].map(m => m[1]);
    assert.ok(returns.length > 0);
    for (const r of returns) assert.ok(!/valueOfIndex\(|selectedTextOf\(|:\s*selected\s*[,}]|:\s*(now|ax|ax0)\s*[,}]/.test(r), `${step.label} returns no text: ${r}`);
  }
});

// The Mac, faked for #188: the fixture and Finder up, a source the probe reads, an activation watcher, a session whose
// cells answer by their markers. `source`: what input-source reads; `activateDuring`: row keys whose act activates the
// fixture (an interference the watcher sees).
function fakeMac188(out, {source = ABC, activateDuring = []} = {}) {
  let clock = 1_790_000_000_000, front = 'electron';
  const tick = () => (clock += 5), calls = [], log = [];
  const scene = id => ({id, app: `/Apps/${id}.app`, pid: PIDS[id], ...(id === 'finder' ? {} : {at: 1}), window: {number: NUMBERS[id]}});
  let range = {location: 0, length: 0}, actKey = 0;
  const reply = (value, meta = {}, route = null) => ({ok: true, value, route, meta, engine: 'cua', images: []});
  const session = {
    run: async (code, {keys}) => {
      tick();
      if (code.includes('globalThis.__m = {ready: false')) return reply({ready: true, focus: {index: 4, trailer: 'masked'}, prepared: ['field emptied to clear a selection']}, {observation: {focusedIndex: 4, focusedRole: 'AXTextArea'}});
      if (code.includes('the case was not prepared; nothing was sent')) {
        calls.push(['act', keys]);
        clock += 1500;  // an act and its row take longer than the oracle's margin after the kit's own activations
        if (activateDuring.includes(actKey++)) log.push({kind: 'activated', bundleId: 'io.github.ssfskim.cua.fixture.electron', at: tick()});
        return reply({actMs: 100, at: [clock, clock], threw: false}, {activationGuardMs: 40}, 3);
      }
      if (code.includes('return {invalid: "the case was not prepared"}')) return reply({ok: true, outcome: {exact: true, inserted: 1}});
      if (code.includes('// cua-188: click prepare (i)')) { range = {...WORD_RANGE}; return reply({ready: true}); }
      if (code.includes('// cua-188: click prepare (ii)')) { range = {...END_RANGE}; return reply({ready: true, point: [86, 121]}); }
      if (code.includes('// cua-188: click\n')) {
        calls.push(['click', code.includes('__c3.point') ? 'point' : 'index']);
        if (code.includes('__c3.point')) range = {location: CLICK_LINE_RANGE[0] + 5, length: 0};
        return reply({clickMs: 20, threw: false}, code.includes('__c3.index') ? {elementClick: {plan: 'action', action: 'AXPress', reason: 'advertised', hit: 'same', hitTest: 'application'}} : {}, code.includes('__c3.index') ? 1 : 3);
      }
      if (code.includes('// cua-188: the observation after the click')) return reply({fieldIndex: 4, focusedByTrailer: false, selectedLength: range.length || null, sameWord: range.length === 7, valueIntact: true}, {observation: {focusedIndex: 4}});
      return reply({});
    },
    close: async () => 0, endTask: async () => ({}),
  };
  const io = {
    scene, open: async options => { calls.push(['open', options.engine, options.bind]); return session; }, wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: join(out, 'go'),
    tasks: {'select-source': async args => { calls.push(['select-source', ...args]); return {ok: true, switched: true, requested: ABC}; }},
  };
  const deps = {
    out, scene, state: () => ({scenes: {electron: {pid: PIDS.electron}, finder: {pid: PIDS.finder}}}),
    activate: async id => { calls.push(['activate', id]); front = id; return {ok: true}; },
    frontmost: () => ({pid: PIDS[front], bundleId: front, topWindow: {ownerPid: PIDS[front], number: NUMBERS[front], bounds: BOUNDS[front]}}),
    probe: args => {
      if (args[0] === 'input-source') return {id: source, layout: source === ABC ? 'ABC' : '2SetHangul'};
      if (args[0] === 'focus') return {focusedApp: {pid: PIDS.finder}, named: true, valueHash: 'a'.repeat(64)};
      if (args[0] === 'text-view') return {windows: [{minimized: false, textArea: {selectedRange: {...range}}}], focused: {role: 'AXTextArea', textAreaOfWindow: 0}};
      return null;
    },
    activations: {start: () => ({pid: 1}), alive: () => true, stop: () => [...log]},
    write: () => {}, now: () => tick(),
  };
  Object.assign(io.tasks, item188Tasks(deps));
  return {io, calls};
}
const run188 = async (out, io, item, steps) => { await runSteps(steps, {item, out, io, log: () => {}}); return read187(out)[item]; };

test('the rows item end to end on fakes: four rows recorded, the oracle and the activations accounted, PASS', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac188(out);
  const evidence = await run188(out, io, ITEMS_188.rows('cua'), rowsItem188('cua'));
  assert.deepEqual(calls.find(c => c[0] === 'open'), ['open', 'cua', ['electron']]);
  assert.deepEqual(calls.filter(c => c[0] === 'act').map(c => c[1]), ['electron', 'finder', 'finder', 'finder']);
  const judged = judge188({[ITEMS_188.rows('cua')]: evidence});
  assert.equal(judged.cua.verdict, 'PASS', JSON.stringify(judged.rows.cua.map(r => r.why)));
  assert.ok(judged.rows.cua.slice(1).every(r => r.interference?.ok === true && r.record.focusReadBy === 'observation'));
  assert.deepEqual(leaks(JSON.stringify(evidence)), []);
  // An activation of the fixture during a background act: the oracle fails that row.
  const out2 = scratch(t);
  const bad = fakeMac188(out2, {activateDuring: [2]});
  const judged2 = judge188({[ITEMS_188.rows('cua')]: await run188(out2, bad.io, ITEMS_188.rows('cua'), rowsItem188('cua'))});
  assert.deepEqual(judged2.rows.cua.map(r => r.verdict), ['PASS', 'PASS', 'FAIL', 'PASS']);
});

test('under 2-Set an item sends nothing past its gate: no act, no click, its rows never recorded', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac188(out, {source: KOREAN_2SET});
  await assert.rejects(runSteps(rowsItem188('cua'), {item: ITEMS_188.rows('cua'), out, io, log: () => {}}), /188-abc refused: the input source reads com\.apple\.inputmethod\.Korean\.2SetKorean/);
  await assert.rejects(runSteps(clickItem188('vendor'), {item: ITEMS_188.click('vendor'), out, io, log: () => {}}), /188-abc refused/);
  assert.equal(calls.filter(c => c[0] === 'act' || c[0] === 'click').length, 0);
  const judged = judge188(read187(out));
  assert.deepEqual(judged.rows.cua.map(r => r.verdict), Array(4).fill('NOT RUN'));
});

test('cell 3 end to end on fakes: (i) by index with the element click\'s meta, (ii) by point, both recorded', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac188(out);
  const evidence = await run188(out, io, ITEMS_188.click('cua'), clickItem188('cua'));
  assert.deepEqual(calls.filter(c => c[0] === 'click').map(c => c[1]), ['index', 'point']);
  const judged = judge188({[ITEMS_188.click('cua')]: evidence});
  const {i, ii} = judged.click.cua.parts;
  assert.equal(i.outcome, 'kept');
  assert.equal(i.elementClick.action, 'AXPress');
  assert.equal(ii.outcome, 'moved to the click point');
  assert.deepEqual(ii.point, [86, 121]);
  assert.equal(judged.click.cua.abc, true);
  assert.match(markdown188(judged).join('\n'), /\| cua \| i \| 20\+7 \(20\+7\) \| 20\+7 \| kept \| 1 \| action, AXPress, advertised, same \|/);
  assert.deepEqual(leaks(JSON.stringify(evidence)), []);
  assert.equal(LABELS_188.click(ITEMS_188.click('cua'), 'i'), '188-click-cua i click');
});

test('neither the #188 rows nor cell 3 ever counts for #187\'s verdict', () => {
  const failing = {[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua', r => ({...r, delivered: false}))),
    [ITEMS_188.click('cua')]: [{kind: 'start'}, {kind: 'stopped', error: 'x'}]};
  const passing = {[ITEMS_188.rows('cua')]: rowEvidence('cua', allRows('cua'))};
  const base = judge187({});
  for (const extra of [failing, passing]) {
    const judged = judge187(extra);
    assert.deepEqual(judged.overall, base.overall);
    assert.deepEqual(judged.b, base.b);
    assert.equal(judgedOk(judged), judgedOk(base));
    assert.deepEqual(judged.groups, base.groups, 'no #188 item is one of #187\'s groups');
  }
  assert.equal(judge187(failing).item188.cua.verdict, 'FAIL');
  const md = item187Markdown(judge187(passing));
  assert.match(md, /## #188 rows \(counted for #188, never for #187\): PASS on cua/);
  assert.match(md, /## #188 cell 3, the click and the selection \(recorded only, never counted for #187 or #188\)/);
});
