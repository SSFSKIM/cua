// #187's live slot kit (scripts/cursor-sitting/item-187.mjs): the ABAB schedule, a row's record and its false-pass
// traps, the judge (beacon and read-back disagreeing, a held activation, a raise, a page click, an open menu, an
// unconfirmed arm, a control regressing), the end-early rule, the order put back after a raise, value-freeness and the
// CLI's dry run. Nothing is driven: the runner runs against fakes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main, read187} from '../../scripts/cursor-sitting.mjs';
import {A1_TARGET, ARMS, B_TARGET, bSchedule, clipboardReaders, CONTROLS, endEarly, freshActivation, GROUPS, groupItem, item187Markdown, item187Tasks, ITEMS, judge187,
  judgedOk, LABELS, menuOpened, metaArm, plan187, releaseOf, ROWS, rowRecord, statusArm, vendorAllowed, VENDOR_ROWS} from '../../scripts/cursor-sitting/item-187.mjs';
import {describeStep, runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {EMPTY_HASH} from '../../scripts/native-matrix/probe-plan.mjs';
import {COMPOSITION, KOREAN_2SET, UNICODE_STRINGS} from '../../scripts/native-matrix/unicode-plan.mjs';
import {HANGUL_LAYOUT} from '../../scripts/native-matrix/unicode-run.mjs';

const T0 = 1_790_000_000_000;
const PIDS = {chrome: 201, textedit: 202, electron: 203};
const ZERO = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-187-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };
// No string's text may appear in what the kit keeps (the latin string's words are common, so its full text is checked).
const leaks = text => UNICODE_STRINGS.filter(s => String(text).includes(s.text)).map(s => s.id);

// A row's readings, all as a delivering, undisturbed row under `arm` reads them; `over` replaces any of them.
function input({group = 'chrome-composing', arm = 'B', block = 1, i = 0, row = ROWS[1], item = ITEMS.b, ...over} = {}) {
  const g = GROUPS[group], expectedLength = row.string.text.length, chrome = g.driven === 'chrome';
  return {
    spec: {key: `${item}#${block}.${i}`, item, group, arm, block, i, string: row.string.id, method: row.method, expectedLength, regime: g.regime, engine: arm === 'vendor' ? 'vendor' : 'cua'},
    prepare: {ok: true, value: {ready: true}},
    act: {ok: true, value: {actMs: arm === 'B' ? 190 : 150, threw: false, message: null}, route: 'paste',
      meta: {activationGuardMs: 41, activationClick: 'outsideFrame', entered: expectedLength,
        paste: {stage: 'effect', confirmed: true, readWait: 'handedOver', readAfterPostMs: 12, effectWait: 'seen', restore: 'restored',
          focusEnforcement: {arm: arm === 'vendor' ? 'A' : arm, activated: true, point: 'outside', liftedClick: arm === 'B', activationToCommandVMs: 30, clickToCommandVMs: 20}}}},
    check: {ok: true, value: {ok: true, outcome: {exact: true, nfcEqual: true, length: expectedLength, expectedLength}}},
    page: chrome ? {mid: {seq: 4, length: 0, counts: {...ZERO}}, after: {seq: 5, length: expectedLength, counts: {...ZERO}}} : null,
    fixture: null,
    front: {mid: PIDS[g.user ?? g.driven], after: PIDS[g.user ?? g.driven], expected: PIDS[g.user ?? g.driven]},
    activations: [], raisedAt: [], stateAtStart: g.user ? 'front-above' : null, userKept: g.user ? true : null,
    clipboard: {mid: 'digest', after: 'digest'}, menu: chrome ? {read: {trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}, observed: 0} : null,
    armStatus: ARMS.includes(arm) ? arm : null, disturbed: false, ...over};
}
const record = options => rowRecord(input(options));
const taskRow = result => ({kind: 'task', task: '187-row', result});
const start = {kind: 'start'};

// The whole slot's evidence with every row delivering and nothing disturbed; `tweak(record)` may change any B row.
// The order watcher's end record of a background item: whole, no raise.
const orderStop = (over = {}) => ({kind: 'task', task: '187-order-stop', result: {ok: true, maxGapMs: 12, raises: 0, rowRaises: {}, tailRaises: {}, setupRaises: 0, unattributed: [], ...over}});
// The last item: the owner's source selected again and read back.
const endItem = (result = {ok: true, which: 'owner', switched: true, requested: 'com.apple.keylayout.ABC', current: {id: 'com.apple.keylayout.ABC'}}) =>
  [start, {kind: 'task', task: 'activate', result: {ok: true}}, {kind: 'task', task: 'select-source', args: ['owner', 'textedit'], result}];
const controlItem = (group, arm, tweak = r => r) => [start, ...ROWS.map((row, i) => taskRow(tweak(record({item: ITEMS.control(group, arm), group, arm, block: 0, i, row})))),
  ...(GROUPS[group].user ? [orderStop()] : [])];
function evidence({tweakB = r => r, tweakControlB = r => r, tweakControlA = r => r, a1 = true, b = true, end = true} = {}) {
  const items = {};
  if (a1) items[ITEMS.a1] = [start, ...[0, 1].flatMap(block => ROWS.map((row, i) => taskRow(record({item: ITEMS.a1, arm: 'A', block, i, row})))), orderStop()];
  for (const group of CONTROLS) items[ITEMS.control(group, 'A')] = controlItem(group, 'A', tweakControlA);
  if (end) items[ITEMS.end] = endItem();
  if (!b) return items;
  items[ITEMS.b] = [start, ...bSchedule().flatMap(s => s.rows.map((row, i) => { const r = record({item: ITEMS.b, arm: s.arm, block: s.block, i, row}); return taskRow(s.arm === 'B' ? tweakB(r) : r); })),
    orderStop()];
  for (const group of CONTROLS) items[ITEMS.control(group, 'B')] = controlItem(group, 'B', tweakControlB);
  return items;
}
// The record with readings replaced (a row of the evidence, recomputed).
const reRecord = (r, over) => rowRecord(input({item: r.item, group: r.group, arm: r.arm, block: r.block, i: r.i, row: ROWS.find(x => x.method === r.method && x.string.id === r.string), ...over}));

test('the rows: hold 3\'s nine strings typed and pasted; the vendor lane pastes them; Part B is ABAB with each arm seeing every row twice', () => {
  assert.equal(ROWS.length, 18);
  assert.deepEqual([...new Set(ROWS.map(r => r.method))], ['typeText', 'paste']);
  assert.equal(VENDOR_ROWS.length, 9);
  assert.ok(VENDOR_ROWS.every(r => r.method === 'paste'));
  const blocks = bSchedule();
  assert.deepEqual(blocks.map(b => b.arm).join(''), 'ABABABAB');
  assert.deepEqual(blocks.map(b => b.block), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(blocks.every(b => b.rows.length === 9));
  for (let p = 0; p < 4; p++) assert.deepEqual(blocks[2 * p].rows, blocks[2 * p + 1].rows, 'a pair\'s A and B blocks run the same rows');
  assert.notDeepEqual(blocks[0].rows, blocks[4].rows, 'the later pairs run their half in another order');
  for (const arm of ARMS) {
    const seen = blocks.filter(b => b.arm === arm).flatMap(b => b.rows);
    assert.equal(seen.length, B_TARGET);
    for (const row of ROWS) assert.equal(seen.filter(r => r === row).length, 2, `${arm} sees ${row.method}.${row.string.id} twice`);
  }
  assert.equal(A1_TARGET, 36);
  assert.equal(releaseOf('chrome-composing'), 'electron');
  assert.equal(releaseOf('textedit-composing'), 'chrome');
  assert.equal(releaseOf('chrome-korean'), null);
});

test('a row is delivered only when the engine\'s read-back and the page\'s fresh beacon agree', () => {
  const good = record();
  assert.equal(good.delivered, true);
  assert.equal(good.invalid, null);
  assert.equal(good.ok, true);
  assert.equal(good.armConfirmed, true);
  // The engine says exact, the page's beacon after the act says empty: not delivered, and the disagreement is named.
  const empty = record({page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 5, length: 0, counts: ZERO}}});
  assert.equal(empty.delivered, false);
  assert.equal(empty.disagree, true);
  // A stale beacon (none after the act) never agrees, even with the expected length from an earlier row.
  const expected = ROWS[1].string.text.length;
  const stale = record({page: {mid: {seq: 5, length: expected, counts: ZERO}, after: {seq: 5, length: expected, counts: ZERO}}});
  assert.equal(stale.page.beaconAfterAct, false);
  assert.equal(stale.delivered, false);
  // The page agrees but the engine's read-back is not exact: not delivered either.
  const inexact = record({check: {ok: true, value: {ok: false, outcome: {exact: false, length: expected, expectedLength: expected}}}});
  assert.equal(inexact.delivered, false);
  assert.equal(inexact.disagree, true);
  // No page at all (a control on TextEdit or Electron): the read-back alone.
  assert.equal(record({group: 'electron-composing', arm: 'A', item: ITEMS.control('electron-composing', 'A')}).delivered, true);
});

test('a background act without a fresh activation is invalid, never counted; a frontmost one needs none', () => {
  const held = record({act: {...input().act, meta: {...input().act.meta, activationGuardMs: undefined}}});
  assert.match(held.invalid, /held activation/);
  assert.equal(held.ok, false);
  const shared = record({act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, focusEnforcement: {arm: 'B', activated: false}}}}});
  assert.match(shared.invalid, /held activation/);
  assert.equal(freshActivation({activationGuardMs: 40}), true);
  const front = record({group: 'chrome-korean', arm: 'A', item: ITEMS.control('chrome-korean', 'A'), act: {...input().act, meta: {entered: 3}}});
  assert.equal(front.invalid, null);
  assert.equal(record({arm: 'vendor', item: ITEMS.vendor, act: {...input().act, meta: {}}}).invalid, null, 'the vendor\'s rows are not gated');
  assert.match(record({disturbed: true}).invalid, /disturbed/);
  assert.match(record({stateAtStart: 'back-above'}).invalid, /window order/);
  assert.match(record({front: {mid: 999, after: 999, expected: PIDS.textedit}}).invalid, /frontmost process/);
});

test('the arm: the engine\'s status or the paste\'s own focusEnforcement.arm confirms it; a contradiction does not', () => {
  assert.equal(statusArm({status: {pasteFocusEnforcement: true}}), 'B');
  assert.equal(statusArm({status: {pasteFocusEnforcement: false}}), 'A');
  assert.equal(statusArm({status: {}}), null);
  assert.equal(metaArm({focusEnforcement: {arm: 'B'}}), 'B');
  assert.equal(metaArm({}), null);
  assert.equal(record({armStatus: null}).armConfirmed, true, 'the meta alone confirms');
  const noMeta = {...input().act, meta: {...input().act.meta, paste: {stage: 'effect'}}};
  assert.equal(record({act: noMeta}).armConfirmed, true, 'the status alone confirms');
  assert.equal(record({armStatus: null, act: noMeta}).armConfirmed, false, 'neither confirms');
  assert.equal(record({armStatus: 'A'}).armConfirmed, false, 'the status contradicts the meta');
});

test('the judge: every condition holding, arm B lands', () => {
  const judged = judge187(evidence());
  assert.equal(judged.b.verdict, 'LANDS', judged.b.why.join('; '));
  assert.equal(judgedOk(judged), true);
  assert.equal(judged.endEarly.applies, true);
  assert.ok(judged.addedMs.difference > 0, 'B\'s act time against A\'s is reported');
  assert.match(item187Markdown(judged), /## Arm B: LANDS/);
});

test('the judge\'s false-pass traps: each one alone keeps arm B from landing', () => {
  const first = (fn, over) => { let done = false; return r => (done ? r : (done = true, fn(r, over))); };
  const cases = [
    ['the read-back and the beacon disagree', {tweakB: first(reRecord, {page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 5, length: 0, counts: ZERO}}})}, 'DOES NOT LAND', /not delivered exactly \(1 with the engine's read-back and the page's beacon disagreeing\)/],
    ['a stale activation', {tweakB: first(reRecord, {act: {...input().act, meta: {...input().act.meta, activationGuardMs: null}}})}, 'INCOMPLETE', /held activation/],
    ['a raise', {tweakB: first(reRecord, {raisedAt: [T0 + 5]})}, 'DOES NOT LAND', /raised Chrome's window above TextEdit's/],
    ['a page click', {tweakB: first(reRecord, {page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 6, length: ROWS[1].string.text.length, counts: {...ZERO, mousedown: 1, click: 1}}}})}, 'DOES NOT LAND', /2 page mousedown\/click/],
    ['an open menu', {tweakB: first(reRecord, {menu: {read: {trusted: true, ok: true, selected: 1, openMenus: 0, focusedRole: null}, observed: 0}})}, 'DOES NOT LAND', /menu opened/],
    ['an observed AXMenuOpened', {tweakB: first(reRecord, {menu: {read: {trusted: true, ok: true, selected: 0, openMenus: 0}, observed: 1}})}, 'DOES NOT LAND', /menu opened/],
    ['an unread menu', {tweakB: first(reRecord, {menu: {read: {trusted: false}, observed: 0}})}, 'INCOMPLETE', /menus could not be read/],
    ['an unconfirmed arm', {tweakB: r => reRecord(r, {armStatus: null, act: {...input().act, meta: {...input().act.meta, paste: {stage: 'effect'}}}})}, 'DOES NOT LAND', /arm the engine did not confirm/],
    ['a front-app change', {tweakB: first(reRecord, {activations: [{kind: 'activated', bundleId: 'com.google.chrome.for.testing', at: T0}]})}, 'DOES NOT LAND', /changed the front app/],
    ['the composition disturbed', {tweakB: first(reRecord, {userKept: false})}, 'DOES NOT LAND', /disturbed the composition/],
    ['a clipboard restore that did not hold', {tweakB: first(reRecord, {clipboard: {mid: 'a', after: 'b'}})}, 'DOES NOT LAND', /clipboard restore/],
    ['a control regressing under B', {tweakControlB: first(reRecord, {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 3}}}})}, 'DOES NOT LAND', /control row\(s\) regressed/],
    ['a control raising under B', {tweakControlB: first(reRecord, {raisedAt: [T0]})}, 'DOES NOT LAND', /control row\(s\) regressed/],
  ];
  for (const [what, options, verdict, why] of cases) {
    const judged = judge187(evidence(options));
    assert.equal(judged.b.verdict, verdict, what);
    assert.match(judged.b.why.join('; '), why, what);
    assert.equal(judgedOk(judged), false, what);
  }
  const gap = evidence();
  gap[ITEMS.b].at(-1).result.maxGapMs = 80;
  assert.equal(judge187(gap).b.verdict, 'INCOMPLETE');
  const short = evidence();
  short[ITEMS.b].splice(-3, 1);
  assert.match(judge187(short).b.why.join('; '), /35 of 36 B rows/);
  const noControl = evidence();
  delete noControl[ITEMS.control('chrome-korean', 'B')];
  assert.match(judge187(noControl).b.why.join('; '), /not run under arm B/);
});

test('the end-early rule: every Part A row delivered ends the slot after the controls; anything less runs Part B', () => {
  const rows = [0, 1].flatMap(block => ROWS.map((row, i) => record({item: ITEMS.a1, arm: 'A', block, i, row})));
  assert.equal(endEarly(rows).applies, true);
  assert.equal(endEarly(rows.slice(1)).applies, false, 'a missing row');
  assert.equal(endEarly([reRecord(rows[0], {page: {mid: {seq: 1, length: 0, counts: ZERO}, after: {seq: 1, length: 0, counts: ZERO}}}), ...rows.slice(1)]).applies, false, 'one row undelivered');
  assert.equal(endEarly([reRecord(rows[0], {disturbed: true}), ...rows.slice(1)]).applies, false, 'one row invalid');
  const ended = judge187(evidence({b: false}));
  assert.match(ended.b.verdict, /^NOT RUN \(end-early/);
  assert.equal(judgedOk(ended), true);
  assert.equal(vendorAllowed(ended).allowed, false);
  const partial = evidence({b: false});
  partial[ITEMS.a1][1] = taskRow(reRecord(partial[ITEMS.a1][1].result, {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 1}}}}));
  const notEnded = judge187(partial);
  assert.equal(notEnded.b.verdict, 'NOT RUN');
  assert.equal(judgedOk(notEnded), false);
  assert.match(item187Markdown(notEnded), /Part B runs/);
});

test('the vendor lane: only once arm B ran and some valid B row did not deliver', () => {
  assert.equal(vendorAllowed(judge187(evidence())).allowed, false);
  const failed = judge187(evidence({tweakB: r => reRecord(r, {page: {mid: {seq: 1, length: 0, counts: ZERO}, after: {seq: 2, length: 0, counts: ZERO}}})}));
  assert.equal(vendorAllowed(failed).allowed, true);
});

test('the plan: the preconditions and placement first, the switch and a stopped engine before every B block, the arm read after each open, the owner\'s source last', () => {
  const plan = plan187();
  assert.deepEqual(plan.map(p => p.item), [ITEMS.place, ITEMS.a1, ...CONTROLS.map(g => ITEMS.control(g, 'A')), ITEMS.b, ...CONTROLS.map(g => ITEMS.control(g, 'B')), ITEMS.end]);
  assert.deepEqual(plan[0].steps.filter(s => s.task).map(s => s.task), ['187-preflight', '187-place', 'activate']);
  assert.deepEqual(plan.at(-1).steps.filter(s => s.task).map(s => [s.task, ...(s.args ?? [])]), [['activate', 'textedit'], ['select-source', 'owner', 'textedit']]);
  const b = plan.find(p => p.item === ITEMS.b).steps;
  const switches = b.filter(s => s.task === 'engine-json-paste').map(s => s.args[0]);
  assert.deepEqual(switches, ['off', 'on', 'off', 'on', 'off', 'on', 'off', 'on']);
  b.forEach((s, k) => {
    if (s.task === 'engine-json-paste') { assert.equal(b[k + 1].task, 'engine-stop'); assert.ok(b[k + 2].open, 'the session opens on the stopped engine'); assert.equal(b[k + 3].task, '187-arm'); }
    if (s.task === 'engine-json-restore') assert.equal(b[k + 1].task, 'engine-stop');
  });
  assert.equal(b.filter(s => s.task === '187-row').length, 2 * B_TARGET);
  // Korean engaged only after the refocus, with ABC first, gated by the runner's select-source.
  const setup = b.slice(b.findIndex(s => s.task === '187-arm'), b.findIndex(s => s.task === '187-compose') + 1).filter(s => s.task).map(s => [s.task, ...(s.args ?? [])].join(' '));
  assert.deepEqual(setup.slice(0, 10), ['187-arm 187-B#0 A', '187-setup 187-B#0 start', '187-ready 187-B#0 setup: the driven field emptied and focused', 'activate textedit', 'select-source latin textedit',
    `select-source named textedit ${KOREAN_2SET}`, 'activate electron', 'activate textedit', '187-korean 187-B#0 textedit', '187-ready 187-B#0 setup: the user window\'s field emptied and focused']);
  // Every act under the key guard of the user window, after a release observation of the third scene, and every
  // background row followed by the order's restore.
  const acts = b.filter(s => s.run && /act:/.test(s.label));
  assert.ok(acts.every(s => s.keys === 'textedit'));
  b.forEach((s, k) => { if (s.task === '187-row') assert.equal(b[k + 1].task, '187-order-restore'); });
  assert.ok(b.some(s => s.run && /release: the electron scene/.test(s.label)));
  assert.ok(plan.find(p => p.item === ITEMS.control('electron-composing', 'B')).steps.some(s => s.task === 'engine-json-paste' && s.args[0] === 'on'));
  assert.ok(!plan.find(p => p.item === ITEMS.a1).steps.some(s => s.task === 'engine-json-paste'), 'Part A runs the engine as built');
  assert.deepEqual(plan187({part: 'a'}).map(p => p.item).filter(i => i === ITEMS.b), []);
  assert.deepEqual(plan187({vendor: true}).map(p => p.item), [ITEMS.place, ITEMS.vendor, ITEMS.end]);
  assert.equal(plan187({vendor: true})[1].steps.filter(s => s.task === '187-row').length, 9);
  // Nothing the plan prints names a string's text.
  assert.deepEqual(leaks(plan.flatMap(p => p.steps.map(describeStep)).join('\n')), []);
});

// The Mac, faked: three scenes, a page that counts what the act enters, an order watcher whose record the fake's raises
// and activations write, a composition the probe's key starts. `raiseAt`: the row keys whose act raises Chrome.
// `lateRaiseAt`: rows whose act raises Chrome, the watcher writing it only after the row's own read (a write lag);
// `activationsInWaitAt`: rows whose page beacon lags, Chrome and then TextEdit activated while the row waits for it.
// `tailRaise`: Chrome raised while the block closes its session, after the last row's restore check; `menuWatch`: the
// notification watcher's fate (ok, ended, dead, unreadable) and `menuSnapshot` whether the snapshot reads succeed.
function fakeMac(out, {raiseAt = [], lateRaiseAt = [], activationsInWaitAt = [], tailRaise = false, menuWatch = 'ok', menuSnapshot = true} = {}) {
  let clock = T0, front = 'textedit', composed = false;
  const bounds = {chrome: {x: 300, y: 80, width: 800, height: 600}, textedit: {x: 500, y: 100, width: 700, height: 500}, electron: {x: 900, y: 120, width: 500, height: 400}};
  const numbers = {chrome: 11, textedit: 12, electron: 13};
  const changes = [], calls = [], activationsLog = [];
  let attempts = 0, lagReads = 0, stalePage = null, pairDue = false;
  let page = {seq: 0, length: 0, counts: {...ZERO}};
  const tick = () => (clock += 5);
  const order = state => changes.push({kind: 'order', at: tick(), prev: clock - 5, state});
  const stateNow = () => changes.at(-1)?.state ?? 'front-above';
  const scene = id => ({id, app: `/Apps/${id}.app`, pid: PIDS[id], at: 1, window: {number: numbers[id]}});
  const session = {
    run: async (code, {keys}) => {
      tick();
      if (code.includes('// cua-187: prepare')) { page = {...page, seq: page.seq + 1, length: 0}; return {ok: true, value: {ready: true}, route: null, meta: {}, images: []}; }
      if (code.includes('// cua-187: act')) {
        const text = JSON.parse(code.match(/__app\.(?:typeText|paste)\(("(?:[^"\\]|\\.)*")\)/)[1]);
        const key = calls.filter(c => c[0] === 'act').length;
        calls.push(['act', keys]);
        if (activationsInWaitAt.includes(key)) { stalePage = {...page}; lagReads = 2; pairDue = true; }
        page = {...page, seq: page.seq + 1, length: text.length};
        if (raiseAt.includes(key)) order('back-above');
        if (lateRaiseAt.includes(key)) { order('back-above'); changes.at(-1).visibleAfter = attempts + 2; }
        return {ok: true, value: {actMs: 180, threw: false, message: null}, route: 'paste', images: [],
          meta: {activationGuardMs: 40, activationClick: 'outsideFrame', entered: text.length, paste: {stage: 'effect', confirmed: true, focusEnforcement: {arm: 'B', activated: true, point: 'outside', liftedClick: true}}}};
      }
      if (code.includes('// cua-187: check')) { const expectedLength = Number(code.match(/expectedLength: (\d+)/)[1]); return {ok: true, value: {ok: true, outcome: {exact: true, nfcEqual: true, length: expectedLength, expectedLength}}, route: null, meta: {}, images: []}; }
      return {ok: true, value: {inFront: true}, route: null, meta: {}, images: []};
    },
    close: async () => { if (tailRaise) order('back-above'); return 0; }, endTask: async () => ({}),
  };
  const io = {
    scene, open: async () => session, wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: join(out, 'go'),
    tasks: {
      activate: async ([id]) => { calls.push(['activate', id]); front = id; if (id === 'textedit' && stateNow() === 'back-above') order('front-above'); return {ok: true}; },
      'select-source': async args => { calls.push(['select-source', ...args]); return {ok: true, switched: true}; },
      'engine-json-paste': async () => ({ok: true}), 'engine-stop': async () => ({ok: true}), 'engine-json-restore': async () => ({ok: true}),
    },
  };
  const deps = {
    out, scene, state: () => ({scenes: {chrome: {page: {variant: 'counters'}}, textedit: {}, electron: {}}}), activate: id => io.tasks.activate([id]),
    frontmost: () => ({pid: PIDS[front], topWindow: {number: numbers[front]}}), windows: pid => { const id = Object.keys(PIDS).find(k => PIDS[k] === pid); return [{number: numbers[id], bounds: bounds[id], onScreen: true}]; },
    windowList: () => ['textedit', 'chrome', 'electron'].map(id => ({number: numbers[id], bounds: bounds[id]})),
    probe: args => {
      if (args[0] === 'input-source') return {id: KOREAN_2SET, layout: HANGUL_LAYOUT, perContextInput: false};
      if (args[0] === 'keystroke') { composed = true; return {exitStatus: 0, units: 1}; }
      if (args[0] === 'focus') return {named: true, valueHash: composed ? sha256Hex(COMPOSITION.composed) : EMPTY_HASH};
      return null;
    },
    engineStatus: () => ({build: 'b1', approved: true, status: {pasteFocusEnforcement: true}}), engineJson: () => ({}),
    consent: () => ({consent: true, owner: {id: 'com.apple.keylayout.ABC'}}), clipboard: () => 'digest', processNames: () => ['/usr/sbin/pboard', '/bin/zsh'],
    pageCounters: () => (lagReads > 0 ? (lagReads--, {...stalePage}) : {...page}), fixtureCounters: () => null,
    moveWindow: ([pid, , dx, dy]) => { const id = Object.keys(PIDS).find(k => PIDS[k] === Number(pid)); bounds[id] = {...bounds[id], x: bounds[id].x + Number(dx), y: bounds[id].y + Number(dy)}; calls.push(['move', id]); return {moved: true}; },
    order: {start: async ({file}) => ({pid: 77, file, start: {state: 'front-above'}}), stop: async () => ({start: {state: 'front-above'}, changes, end: {samples: 400, maxGapMs: 9}}),
      attempt: () => { attempts += 1; return {start: {state: 'front-above', at: T0}, changes: changes.filter(c => !(c.visibleAfter > attempts)), end: null}; }},
    activations: {start: () => ({}), lines: () => [...activationsLog], stop: () => []},
    menu: {read: () => ({trusted: true, ok: menuSnapshot, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}), start: async () => ({registered: true}),
      stop: async () => ({opened: 0, end: {at: clock}}), alive: () => menuWatch !== 'dead',
      lines: () => { if (menuWatch === 'unreadable') throw new Error('the log could not be read'); return menuWatch === 'ended' ? [{kind: 'end', at: T0, why: 'crashed'}] : []; }},
    write: () => {}, now: () => tick(),
    sleep: async ms => {
      clock += ms;
      if (pairDue) { pairDue = false; activationsLog.push({kind: 'activated', bundleId: 'com.google.chrome.for.testing', at: tick()}, {kind: 'activated', bundleId: 'com.apple.TextEdit', at: tick()}); }
    },
  };
  Object.assign(io.tasks, item187Tasks(deps));
  return {io, calls};
}

test('a raise after a B row: the kit puts the order back before the next row, the row is a B failure with the raise\'s time, and the judge counts it', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac(out, {raiseAt: [1]});
  const steps = groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: [{block: 1, arm: 'B', rows: ROWS.slice(0, 3), switchTo: 'on'}]});
  await runSteps(steps, {item: ITEMS.b, out, io, log: () => {}});
  const rows = readFileSync(join(out, `item-${ITEMS.b}.jsonl`), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const records = rows.filter(r => r.task === '187-row').map(r => r.result);
  assert.deepEqual(records.map(r => r.raises), [0, 1, 0]);
  assert.equal(records[1].raisedAt.length, 1);
  assert.ok(Number.isFinite(records[1].raisedAt[0]));
  assert.equal(records[1].delivered, true, 'the raised row delivered; the raise alone fails it');
  assert.equal(records[2].invalid, null, 'the next row starts with the order put back');
  assert.equal(records[2].stateAtStart, 'front-above');
  const restores = rows.filter(r => r.task === '187-order-restore').map(r => r.result);
  assert.deepEqual(restores.map(r => r.restored), [false, true, false]);
  assert.equal(restores[1].ok, true);
  assert.deepEqual(restores[1].raisedAt, records[1].raisedAt);
  assert.deepEqual(restores[1].how, ['placement', 'activate textedit']);
  const restoreAt = rows.findIndex(r => r.task === '187-order-restore' && r.result.restored);
  const nextRow = rows.findIndex((r, k) => k > restoreAt && r.task === '187-before');
  assert.ok(restoreAt > 0 && nextRow > restoreAt, 'the restore runs before the next row');
  assert.ok(calls.filter(c => c[0] === 'act').every(c => c[1] === 'textedit'), 'every act went under the user window\'s key guard');
  // The judge, with this block standing in for Part B's B rows.
  const items = evidence();
  items[ITEMS.b] = [start, ...rows.filter(r => r.task === '187-row' || r.task === '187-order-restore' || r.task === '187-order-stop')];
  const judged = judge187(items);
  assert.equal(judged.b.verdict, 'DOES NOT LAND');
  assert.match(judged.b.why.join('; '), new RegExp(`1 B row\\(s\\) raised Chrome's window above TextEdit's \\(${records[1].key} at ${records[1].raisedAt[0]}\\)`));
  assert.equal(judged.groups.find(g => g.item === ITEMS.b && g.arm === 'B').restores.length, 1);
  assert.match(item187Markdown(judged), /the kit put the window order back after 1 row/);
  // Value-free: nothing the run kept names a string's text, and the rows carry no value.
  const kept = readFileSync(join(out, `item-${ITEMS.b}.jsonl`), 'utf8');
  assert.deepEqual(leaks(kept), []);
  assert.ok(!/"(value|text)":"[^"]/.test(JSON.stringify(records)), 'a record holds no text field');
});

test('the composition: a row that disturbs it makes the rest of its block invalid, unsent', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac(out);
  // The composition's hash as kept differs from what the field reads after the first row: it was disturbed.
  const tasks = io.tasks, probe = tasks['187-compose'];
  tasks['187-compose'] = async (args, ctx) => { const r = await probe(args, ctx); ctx.r187.compose[args[0]].jamo = 'f'.repeat(64); return r; };
  await runSteps(groupItem({item: ITEMS.a1, group: 'chrome-composing', blocks: [{block: 0, arm: 'A', rows: ROWS.slice(0, 3)}]}), {item: ITEMS.a1, out, io, log: () => {}});
  const records = read187(out)[ITEMS.a1].filter(r => r.task === '187-row').map(r => r.result);
  assert.equal(records[0].userKept, false);
  assert.deepEqual(records.slice(1).map(r => r.invalid), Array(2).fill('an earlier row of the block disturbed the user window\'s composition'));
  assert.equal(calls.filter(c => c[0] === 'act').length, 1, 'no act after the disturbance');
});

test('value-free helpers: the clipboard readers by name only; an open menu by roles and counts', () => {
  assert.deepEqual(clipboardReaders(['/Applications/Maccy.app/Contents/MacOS/Maccy', '/usr/sbin/pboard', '/bin/zsh', 'cmux-paste-worker', '  ']), ['Maccy', 'cmux-paste-worker', 'pboard']);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}), false);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 1}), true);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXMenuItem'}), true);
  assert.equal(menuOpened({trusted: false}), null);
  const r = record({act: {...input().act, value: {actMs: 1, threw: true, message: 'Timed out waiting for the application to read the clipboard'}}});
  assert.deepEqual(leaks(JSON.stringify(r)), []);
  assert.equal(LABELS.act('187-B#1.0', 'paste', 'hangul'), '187-B#1.0 act: paste.hangul');
});

test('review P1.1: arm B\'s control comparison needs complete, valid A baselines; without one the result is incomplete, never LANDS', () => {
  const failing = r => reRecord(r, {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 3}}}});
  const noA = evidence({tweakControlB: failing});
  for (const g of CONTROLS) delete noA[ITEMS.control(g, 'A')];
  const judged = judge187(noA);
  assert.equal(judged.b.verdict, 'INCOMPLETE');
  assert.match(judged.b.why.join('; '), /no complete A baseline/);
  const invalidA = evidence();
  invalidA[ITEMS.control('electron-composing', 'A')][1] = taskRow(reRecord(invalidA[ITEMS.control('electron-composing', 'A')][1].result, {disturbed: true}));
  assert.equal(judge187(invalidA).b.verdict, 'INCOMPLETE');
  const shortA = evidence();
  shortA[ITEMS.control('chrome-korean', 'A')].splice(3, 1);
  assert.match(judge187(shortA).b.why.join('; '), /chrome\/korean control under arm A has 17 of 18 rows/);
});

test('review P1.2: end-early success needs the three A controls finished with valid coverage; their delivery failures stay diagnostic', () => {
  const stopped = evidence({b: false});
  stopped[ITEMS.control('textedit-composing', 'A')] = [start, {kind: 'stopped', error: '187-korean refused: the Korean source did not engage'}];
  const judged = judge187(stopped);
  assert.equal(judgedOk(judged), false);
  assert.equal(judged.overall.verdict, 'INCOMPLETE');
  assert.match(judged.overall.why.join('; '), /textedit\/composing@electron control under arm A/);
  const missing = evidence({b: false});
  delete missing[ITEMS.control('chrome-korean', 'A')];
  assert.equal(judgedOk(judge187(missing)), false);
  const undelivered = evidence({b: false, tweakControlA: r => reRecord(r, {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 3}}}})});
  assert.equal(judgedOk(judge187(undelivered)), true, 'a control\'s known delivery failures do not stop the end-early success');
});

test('review P1.3: the owner\'s source restore (187-end) is part of overall success and of the report', () => {
  assert.equal(judgedOk(judge187(evidence())), true);
  const none = evidence({end: false});
  assert.equal(judgedOk(judge187(none)), false);
  assert.match(judge187(none).overall.why.join('; '), /owner's input source/);
  const failed = evidence();
  failed[ITEMS.end] = endItem({ok: false, which: 'owner', switched: true, requested: 'com.apple.keylayout.ABC', current: {id: 'com.apple.inputmethod.Korean.2SetKorean'}, problem: 'read back 2-Set'});
  const judged = judge187(failed);
  assert.equal(judged.b.verdict, 'LANDS');
  assert.equal(judgedOk(judged), false);
  assert.match(item187Markdown(judged), /owner's input source: NOT restored/);
  const unread = evidence();
  unread[ITEMS.end] = endItem({ok: true, which: 'owner', switched: true, requested: 'com.apple.keylayout.ABC', current: null});
  assert.equal(judgedOk(judge187(unread)), false, 'a restore without its read-back is not a restore');
  assert.match(item187Markdown(judge187(evidence())), /owner's input source: restored \(com\.apple\.keylayout\.ABC, read back\)/);
});

test('review P1.4: a raise the watcher writes after the row\'s own read is still seen before the next row, put back, and attributed to the row', async t => {
  const out = scratch(t);
  const {io} = fakeMac(out, {lateRaiseAt: [1]});
  await runSteps(groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: [{block: 1, arm: 'B', rows: ROWS.slice(0, 3), switchTo: 'on'}]}), {item: ITEMS.b, out, io, log: () => {}});
  const rows = read187(out)[ITEMS.b];
  const restores = rows.filter(r => r.task === '187-order-restore').map(r => r.result);
  assert.deepEqual(restores.map(r => r.restored), [false, true, false]);
  assert.equal(restores[1].lateRaisedAt.length, 1);
  const records = rows.filter(r => r.task === '187-row').map(r => r.result);
  assert.equal(records[2].invalid, null, 'the next row starts with the order put back');
  const items = evidence();
  items[ITEMS.b] = [start, ...rows.filter(r => ['187-row', '187-order-restore', '187-order-stop'].includes(r.task))];
  const judged = judge187(items);
  assert.match(judged.b.why.join('; '), new RegExp(`raised Chrome's window above TextEdit's \\(${records[1].key} at`));
});

test('review P1.4: the final watcher\'s raises in a row\'s span are reconciled with the row records', () => {
  const items = evidence();
  const b = items[ITEMS.b], key = b.find(r => r.task === '187-row' && r.result.arm === 'B').result.key;
  b[b.length - 1] = orderStop({raises: 1, rowRaises: {[key]: [T0 + 7]}});
  const judged = judge187(items);
  assert.equal(judged.b.verdict, 'DOES NOT LAND');
  assert.match(judged.b.why.join('; '), new RegExp(`${key.replace(/[#.]/g, m => `\\${m}`)} at ${T0 + 7}`));
});

test('review P1.5: an activation pair during the row\'s wait for the page\'s beacon counts as a front-app change', async t => {
  const out = scratch(t);
  const {io} = fakeMac(out, {activationsInWaitAt: [0]});
  await runSteps(groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: [{block: 1, arm: 'B', rows: ROWS.slice(0, 2), switchTo: 'on'}]}), {item: ITEMS.b, out, io, log: () => {}});
  const records = read187(out)[ITEMS.b].filter(r => r.task === '187-row').map(r => r.result);
  assert.equal(records[0].activations.length, 2);
  assert.equal(records[0].front.changed, true);
  assert.equal(records[1].front.changed, false);
});

test('review P2.6: a chrome row with no counter read before the act has incomplete counter evidence, never delivered-and-valid', () => {
  const expected = ROWS[1].string.text.length;
  const r = record({page: {mid: null, after: {seq: 5, length: expected, counts: {...ZERO, click: 1}}}});
  assert.match(r.invalid, /page counters before the act/);
  assert.equal(r.ok, false);
});

test('review P2.7: an unreadable menu snapshot is no evidence; only a good snapshot or a verified watch says no menu opened', () => {
  assert.equal(menuOpened({trusted: true, ok: false, menuBar: false, items: 0, selected: 0, openMenus: 0}), null);
  assert.equal(menuOpened({trusted: true, selected: 0, openMenus: 0}), null, 'a snapshot that does not say it read everything');
  const unread = {read: {trusted: true, ok: false, selected: 0, openMenus: 0}, observed: 0};
  assert.equal(record({menu: {...unread, watchVerified: false}}).menu.opened, null);
  assert.equal(record({menu: {...unread, watchVerified: true}}).menu.opened, false);
  assert.equal(judge187(evidence({tweakB: r => reRecord(r, {menu: unread})})).b.verdict, 'INCOMPLETE');
  assert.match(readFileSync(new URL('../../scripts/cursor-sitting/menu-open.swift', import.meta.url), 'utf8'), /"ok": ok/, 'the helper says whether every read succeeded');
});

test('review P2.8: B control rows count in the comparison only with the engine confirming arm B', () => {
  const unconfirmed = r => reRecord(r, {armStatus: null, act: {...input().act, meta: {...input().act.meta, paste: {stage: 'effect'}}}});
  const judged = judge187(evidence({tweakControlB: unconfirmed}));
  assert.equal(judged.b.verdict, 'INCOMPLETE');
  assert.match(judged.b.why.join('; '), /arm B is not confirmed/);
});

test('review P2.9: each composing control\'s own order-watcher coverage must be whole', () => {
  const gap = evidence();
  gap[ITEMS.control('electron-composing', 'B')].splice(-1, 1, orderStop({maxGapMs: 80}));
  assert.match(judge187(gap).b.why.join('; '), /electron\/composing@textedit control under arm B: the order watcher's longest gap was 80 ms/);
  const none = evidence();
  none[ITEMS.control('textedit-composing', 'A')].pop();
  assert.equal(judge187(none).b.verdict, 'INCOMPLETE');
});

test('re-review P1: a raise in the block\'s tail, after the last row\'s restore check, is reconciled and keeps B from landing', async t => {
  const out = scratch(t);
  const {io} = fakeMac(out, {tailRaise: true});
  await runSteps(groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: [{block: 1, arm: 'B', rows: ROWS.slice(0, 2), switchTo: 'on'}]}), {item: ITEMS.b, out, io, log: () => {}});
  const rows = read187(out)[ITEMS.b], stop = rows.find(r => r.task === '187-order-stop').result;
  const last = rows.filter(r => r.task === '187-row').at(-1).result;
  assert.equal(stop.raises, 1);
  assert.equal(stop.tailRaises[last.key].length, 1, 'the tail raise goes to the block\'s last row');
  const items = evidence();
  items[ITEMS.b] = [start, ...rows.filter(r => ['187-row', '187-order-restore', '187-order-stop'].includes(r.task))];
  const judged = judge187(items);
  assert.equal(judged.b.verdict, 'DOES NOT LAND');
  assert.match(judged.b.why.join('; '), /raised Chrome's window/);
});

test('re-review P1: the watcher\'s raise total must equal attributed plus setup-explained raises', () => {
  const lands = evidence();
  lands[ITEMS.b].splice(-1, 1, orderStop({raises: 1, setupRaises: 1}));
  assert.equal(judge187(lands).b.verdict, 'LANDS', 'a raise inside the kit\'s own setup or restore step is explained');
  const loose = evidence();
  loose[ITEMS.b].splice(-1, 1, orderStop({raises: 1, unattributed: [T0 + 3]}));
  assert.equal(judge187(loose).b.verdict, 'DOES NOT LAND');
  assert.match(judge187(loose).b.why.join('; '), /1 raise\(s\) of Chrome's window outside every row and every setup step/);
  const mismatch = evidence();
  mismatch[ITEMS.b].splice(-1, 1, orderStop({raises: 2}));
  assert.notEqual(judge187(mismatch).b.verdict, 'LANDS');
  const old = evidence();
  old[ITEMS.b].splice(-1, 1, {kind: 'task', task: '187-order-stop', result: {ok: true, maxGapMs: 12, raises: 0}});
  assert.notEqual(judge187(old).b.verdict, 'LANDS', 'an unreconciled record never lands');
});

test('re-review P2: the menu watch counts only while it stayed alive and its log was readable through the row', async t => {
  const openedOf = async options => {
    const out = scratch(t);
    const {io} = fakeMac(out, {menuSnapshot: false, ...options});
    await runSteps(groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: [{block: 1, arm: 'B', rows: ROWS.slice(0, 1), switchTo: 'on'}]}), {item: ITEMS.b, out, io, log: () => {}});
    return read187(out)[ITEMS.b].find(r => r.task === '187-row').result.menu;
  };
  assert.equal((await openedOf({menuWatch: 'ok'})).opened, false);
  for (const fate of ['ended', 'dead', 'unreadable']) {
    const menu = await openedOf({menuWatch: fate});
    assert.equal(menu.opened, null, `a watch that ${fate} is no evidence`);
    assert.equal(menu.watchVerified, false);
  }
  assert.equal((await openedOf({menuWatch: 'unreadable'})).observed, null, 'a log that cannot be read is unread, not zero events');
});

test('re-review P2: menu-open.swift reads the focused element\'s role with its status', () => {
  const swift = readFileSync(new URL('../../scripts/cursor-sitting/menu-open.swift', import.meta.url), 'utf8');
  const focus = swift.slice(swift.indexOf('kAXFocusedUIElementAttribute as CFString'), swift.indexOf('emit(["trusted": true, "ok"'));
  assert.match(focus, /read\(f, kAXRoleAttribute\)/, 'the role through the status-bearing reader');
  assert.match(focus, /failed\.append\("focusedRole"\)/, 'a failed or malformed role read is not ok');
});

test('the CLI: the dry run prints every step and touches nothing; judge writes item-187.md', async t => {
  const dir = scratch(t), out = join(dir, 'never-made');
  const {code, text} = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet']));
  assert.equal(code, 0);
  const total = plan187().reduce((n, p) => n + p.steps.length, 0);
  assert.match(text, new RegExp(`dry run: ${total} steps, nothing sent`));
  assert.equal(existsSync(out), false, 'the dry run creates nothing');
  assert.deepEqual(leaks(text), []);
  const vendor = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--vendor']));
  assert.match(vendor.text, /dry run: \d+ steps/);
  await assert.rejects(main(['paste-187', 'drive', '--out', out, '--dry-run', '--part', 'c']), /--part takes all, a or b/);
  await assert.rejects(main(['paste-187', 'drive', '--out', dir, '--run', dir, '--vendor']), /only once arm B has failed to deliver/);
  const judged = await quietly(() => main(['paste-187', 'judge', '--out', dir]));
  assert.equal(judged.code, 1, 'nothing recorded: nothing lands');
  assert.match(readFileSync(join(dir, 'item-187.md'), 'utf8'), /## Arm B: NOT RUN/);
});
