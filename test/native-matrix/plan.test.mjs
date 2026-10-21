// The method matrix's plan and cells (scripts/native-matrix/plan.mjs, matrix-cells.mjs): every target covers the 11
// methods by a case or a reason, and the cells, run in node against a fake app over the goldens both engines recorded on
// the mini (test/native-goldens/), judge outcomes by what they read back and return no screen content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {CASES, METHODS, NOT_APPLICABLE, TARGETS, caseId} from '../../scripts/native-matrix/plan.mjs';
import {NO_SUCH_ACTION, caseCells, findingCell, panelCell, selectCell} from '../../scripts/native-matrix/matrix-cells.mjs';

const golden = (scene, file) => readFileSync(fileURLToPath(new URL(`../native-goldens/${scene}/${file}`, import.meta.url)), 'utf8');
const AsyncFunction = (async () => {}).constructor;

// Runs a cell's text as the REPL would, with `cua` and the scenes bound. -> the cell's {ok, value|error, inCellMs}.
async function run(text, {apps = {}, cua = {}} = {}) {
  let out = '';
  globalThis.__apps = apps;
  try {
    await new AsyncFunction('cua', 'nodeRepl', text)(cua, {write: s => { out += s; }});
  } finally { delete globalThis.__apps; }
  return parseCell(out);
}
// A fake app over a text the test changes as the engine would.
function fakeApp(initial, actions = {}) {
  const app = {ax: initial, calls: [],
    async getAXState(options) { assert.deepEqual(options, {emit: false, disableDiffing: true}); return app.ax; }};
  for (const method of ['click', 'drag', 'paste', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText', 'performSecondaryAction', 'getScreenshot'])
    app[method] = async (...args) => { app.calls.push([method, ...args]); return actions[method]?.(app, ...args); };
  return app;
}
const casesOf = (target, method, kase) => CASES[target].find(c => c.method === method && c.case === kase);
async function runCase(target, scene, app, method, kase, cua) {
  const cells = caseCells(target, casesOf(target, method, kase));
  const apps = {[scene]: app};
  const prepare = await run(cells.prepare, {apps, cua});
  const act = await run(cells.act, {apps, cua});
  const check = await run(cells.check, {apps, cua});
  delete globalThis.__m;
  return {prepare, act, check};
}

test('every target covers the 11 methods by a case or a stated reason, never both, with unique case ids', () => {
  assert.equal(METHODS.length, 11);
  for (const target of TARGETS) {
    const cases = CASES[target], na = NOT_APPLICABLE[target] ?? {};
    for (const method of METHODS) {
      const has = cases.some(c => c.method === method);
      assert.ok(has !== Object.hasOwn(na, method), `${target}.${method}: a case xor a reason`);
      if (!has) assert.ok(na[method].length > 20, `${target}.${method}: the reason is a sentence`);
    }
    const ids = cases.map(c => caseId(target, 'frontmost', c));
    assert.equal(new Set(ids).size, ids.length, `${target}: case ids are unique`);
    for (const c of cases) {
      assert.ok(['outcome', 'refusal'].includes(c.expect), `${target} ${c.method}.${c.case}`);
      for (const part of ['prepare', 'act', 'check']) assert.equal(typeof c[part], 'string');
      // Every case that sends input through the keyboard is flagged, so the run guards it.
      if (['typeText', 'paste', 'pressKey'].includes(c.method)) assert.ok(c.keys?.length, `${target} ${c.method}.${c.case} is a key case`);
    }
  }
  // The refused cases the spec names: a non-text element, a non-settable control, an invalid index.
  assert.ok(casesOf('textedit', 'selectText', 'notText') && casesOf('textedit', 'setValue', 'notSettable') && casesOf('textedit', 'click', 'invalidIndex'));
});

test('every case\'s cells compile on every target', () => {
  for (const target of TARGETS) for (const c of CASES[target]) for (const [part, text] of Object.entries(caseCells(target, c)))
    assert.doesNotThrow(() => new AsyncFunction('cua', 'nodeRepl', text), `${target} ${c.method}.${c.case} ${part}`);
  for (const scene of ['textedit', 'finder', 'chrome', 'electron']) {
    new AsyncFunction('cua', 'nodeRepl', selectCell(scene));
    new AsyncFunction('cua', 'nodeRepl', findingCell(scene));
  }
  new AsyncFunction('cua', 'nodeRepl', panelCell(true));
});

test('the tree case passes on both engines\' goldens of every scene, and returns no screen content', async () => {
  for (const scene of ['textedit', 'finder', 'chrome', 'electron']) for (const engine of ['vendor', 'cua']) {
    const {prepare, act, check} = await runCase(scene, scene, fakeApp(golden(scene, `${engine}.txt`)), 'getAXState', 'tree');
    assert.deepEqual(prepare.value, {ready: true});
    assert.equal(act.ok, true);
    assert.equal(act.value.threw, false);
    assert.ok(act.value.at[0] <= act.value.at[1]);
    assert.equal(check.value.ok, true, `${scene} ${engine}: ${JSON.stringify(check.value)}`);
    assert.doesNotMatch(JSON.stringify([prepare, act, check]), /Line 01|scene-file|Fixture|Scene notes/);
  }
});

test('an action\'s outcome is read back: TextEdit\'s align center, the Electron button, Finder\'s row', async () => {
  // align center: a click on it sets its value; on the golden it is unchecked.
  const align = fakeApp(golden('textedit', 'vendor.txt'), {click: (app, index) => { if (index === 40) app.ax = app.ax.replace(/(\t40 [^\n]*Value: )0/, '$11'); }});
  const control = await runCase('textedit', 'textedit', align, 'click', 'control');
  assert.equal(control.check.value.ok, true, JSON.stringify(control));
  assert.deepEqual(align.calls, [['click', 40]]);
  // An engine whose click does nothing fails the case.
  const inert = await runCase('textedit', 'textedit', fakeApp(golden('textedit', 'cua.txt')), 'click', 'control');
  assert.equal(inert.check.value.ok, false);

  const press = fakeApp(golden('electron', 'vendor.txt'), {click: (app, index) => { if (index === 13) app.ax = app.ax.replace('Pressed 0 times', 'Pressed 1 time'); }});
  const button = await runCase('electron', 'electron', press, 'click', 'button');
  assert.equal(button.check.value.ok, true, JSON.stringify(button));

  // Finder: the click lands on a cell of row 005 other than its name; the row is then the only selected element.
  const finder = golden('finder', 'vendor.txt');
  const row5 = (await import('../../scripts/native-matrix/matrix-text.mjs')).rowIndexOfName(finder, 'scene-file-005');
  const select = fakeApp(finder, {click: app => { app.ax = app.ax.replace(/\n\nThe focused UI element/, `\n\nSelected:\n\t${row5} row (selected)\n\nThe focused UI element`); }});
  const row = await runCase('finder', 'finder', select, 'click', 'row');
  assert.equal(row.prepare.value.ready, true, JSON.stringify(row.prepare));
  assert.notEqual(select.calls[0][1], row5, 'the click is on a cell, not the row');
  assert.equal(row.check.value.ok, true, JSON.stringify(row.check));
});

test('a refused case passes on a sentence with nothing changed, and fails when the engine acts instead', async () => {
  const refuse = fakeApp(golden('chrome', 'vendor.txt'), {setValue: () => { throw new Error('element 24 is not settable'); }});
  const refused = await runCase('chrome', 'chrome', refuse, 'setValue', 'notSettable');
  assert.deepEqual(refused.check.value, {ok: true, outcome: {refused: true, unchanged: true, message: 'element 24 is not settable'}});
  const accepts = await runCase('chrome', 'chrome', fakeApp(golden('chrome', 'vendor.txt')), 'setValue', 'notSettable');
  assert.equal(accepts.check.value.ok, false);
  const invalid = fakeApp(golden('textedit', 'vendor.txt'), {click: () => { throw new Error('invalid element ID 99999'); }});
  assert.equal((await runCase('textedit', 'textedit', invalid, 'click', 'invalidIndex')).check.value.ok, true);
});

test('a case whose precondition does not hold sends nothing and its row is invalid', async () => {
  // Electron's typeText needs the text field focused: a click that does not move the focus leaves the case unprepared.
  const app = fakeApp(golden('electron', 'vendor.txt').replace('The focused UI element is 5 ', 'The focused UI element is 13 '));
  const {prepare, act, check} = await runCase('electron', 'electron', app, 'typeText', 'text');
  assert.equal(prepare.value.ready, false);
  assert.match(prepare.value.reason, /focus/);
  assert.equal(act.ok, false);
  assert.match(act.error, /not prepared; nothing was sent/);
  assert.deepEqual(app.calls.map(c => c[0]), ['click'], 'only the harness\'s focus click');
  assert.deepEqual(check.value, {invalid: 'the case was not prepared'});
  // Another scene's window in front: not ready, nothing sent.
  const other = fakeApp(golden('textedit', 'vendor.txt').replace('Window: "cua-scene.rtf"', 'Window: "Untitled"'));
  const notFront = await runCase('textedit', 'textedit', other, 'click', 'control');
  assert.equal(notFront.prepare.value.ready, false);
  assert.deepEqual(other.calls, []);
});

test('the finding scorer resolves each found target by an action that does nothing, and returns counts only', async () => {
  for (const scene of ['textedit', 'finder', 'chrome', 'electron']) {
    const app = fakeApp(golden(scene, 'vendor.txt'), {performSecondaryAction: (_, index, action) => { throw new Error(`${action} is not a valid secondary action for element ${index}`); }});
    const result = await run(findingCell(scene), {apps: {[scene]: app}});
    assert.equal(result.ok, true, JSON.stringify(result));
    const {targets, lines, named, ids} = result.value;
    assert.equal(targets.length, 10, scene);
    assert.ok(targets.every(t => t.resolved === t.found), scene);
    assert.ok(app.calls.every(([method, , action]) => method === 'performSecondaryAction' && action === NO_SUCH_ACTION));
    assert.equal(app.calls.length, targets.filter(t => t.found).length);
    assert.ok(lines > 0 && named <= lines && Number.isInteger(ids));
    assert.doesNotMatch(JSON.stringify(result), /Line 01|scene-file-0|Fixture button|Scene notes/);
  }
  // An engine whose index names no element (another refusal) does not resolve.
  const stale = fakeApp(golden('electron', 'vendor.txt'), {performSecondaryAction: () => { throw new Error('element 13 is no longer valid'); }});
  const r = await run(findingCell('electron'), {apps: {electron: stale}});
  assert.ok(r.value.targets.every(t => !t.resolved));
});

test('the speed selection binds the scene as the baseline\'s cells expect it', async () => {
  const app = fakeApp(golden('finder', 'cua.txt'));
  const r = await run(selectCell('finder'), {apps: {finder: app}});
  assert.deepEqual(r.value, {inFront: true});
  assert.equal(globalThis.app, app);
  assert.equal(typeof globalThis.__scratch, 'string');
  delete globalThis.app; delete globalThis.__scratch;
});

test('the Open panel: opened by ⌘O only from the scene document, closed by a click on Cancel', async () => {
  const {OPEN_PANEL, CLOSE_PANEL} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const document = golden('textedit', 'vendor.txt');
  const panelText = 'Window: "Open", App: TextEdit.\n0 standard window ID: open-panel\n\t1 button Cancel\n';
  const app = fakeApp(document, {pressKey: a => { a.ax = panelText; }, click: (a, index) => { if (index === 1) a.ax = document; }});
  assert.deepEqual((await run(OPEN_PANEL, {apps: {textedit: app}})).value, {opened: true});
  assert.deepEqual(app.calls, [['pressKey', 'super+o']]);
  assert.deepEqual((await run(CLOSE_PANEL, {apps: {textedit: app}})).value, {closed: true});
  assert.deepEqual(app.calls.at(-1), ['click', 1]);
  const elsewhere = fakeApp(document.replace('Window: "cua-scene.rtf"', 'Window: "Untitled"'));
  assert.equal((await run(OPEN_PANEL, {apps: {textedit: elsewhere}})).value.opened, false);
  assert.deepEqual(elsewhere.calls, [], 'nothing is sent from another window');
});

test('the launch path: the app resolved by its path, timed on the device clock, and found running', async () => {
  const {launchCell, launchCheckCell} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const asked = [];
  const cua = {getApp: async app => { asked.push(app); return {launched: true}; }, listApps: async () => [{id: 'com.apple.TextEdit', isRunning: true}]};
  const act = await run(launchCell('textedit', '/System/Applications/TextEdit.app'), {cua});
  assert.equal(act.value.threw, false);
  assert.deepEqual(asked, ['/System/Applications/TextEdit.app']);
  assert.deepEqual((await run(launchCheckCell('textedit'), {cua})).value, {ok: true, outcome: {listed: true, running: true}});
  const failing = await run(launchCell('electron', '/x.app'), {cua: {getApp: async () => { throw new Error('appNotFound'); }}});
  assert.deepEqual([failing.value.threw, failing.value.error], [true, 'appNotFound']);
});
