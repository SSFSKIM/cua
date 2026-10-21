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

// The Electron fixture's text field as a small model rendered in the vendor's grammar: its value, the focus and the
// selection, changed by the fake's actions as the app would (or, for an inert engine, not).
function electronField({value = '', inert = false, insertAtStart = false} = {}) {
  const lines = golden('electron', 'vendor.txt').split('\n\nThe focused UI element')[0].split('\n');
  const state = {value, focused: 5, selected: null};
  const render = () => {
    const tree = lines.map(line => (/^\t+5 /.test(line) ? `${line}${state.value ? `, Value: ${state.value}` : ''}` : line)).join('\n');
    const focused = lines.find(l => new RegExp(`^\\t*${state.focused} `).test(l))?.trim() ?? '';
    return `${tree}\n\nThe focused UI element is ${focused}${state.selected ? `\n\nSelected text: \`\`\`\n${state.selected}\n\`\`\`` : ''}`;
  };
  const write = text => {
    if (inert) return;
    state.value = insertAtStart ? text + state.value : state.selected ? state.value.replace(state.selected, text) : state.value + text;
    state.selected = null;
  };
  const app = fakeApp('', {
    click: (_, index) => { if (Number.isInteger(index)) state.focused = index; state.selected = null; },
    setValue: (_, index, v) => { if (index === 5) state.value = v; },
    selectText: (_, index, word) => { if (index === 5 && state.value.includes(word)) state.selected = word; },
    typeText: (_, text) => write(text), paste: (_, text) => write(text),
  });
  Object.defineProperty(app, 'ax', {get: render, set: () => {}});
  return {app, state};
}

test('an action\'s outcome is read back: TextEdit\'s align center, the Electron button, Finder\'s row from another row', async () => {
  // align center: a click on it sets its value; on the golden it is unchecked.
  const align = fakeApp(golden('textedit', 'vendor.txt'), {click: (app, index) => { if (index === 40) app.ax = app.ax.replace(/(\t40 [^\n]*Value: )0/, '$11'); }});
  const control = await runCase('textedit', 'textedit', align, 'click', 'control');
  assert.equal(control.check.value.ok, true, JSON.stringify(control));
  assert.deepEqual(align.calls, [['click', 40]]);
  const inert = await runCase('textedit', 'textedit', fakeApp(golden('textedit', 'cua.txt')), 'click', 'control');
  assert.equal(inert.check.value.ok, false);
  // The right state with an error from the action is a failure.
  const throwing = fakeApp(golden('textedit', 'vendor.txt'), {click: app => { app.ax = app.ax.replace(/(\t40 [^\n]*Value: )0/, '$11'); throw new Error('Computer Use server error -10005: actionFailed'); }});
  const threw = await runCase('textedit', 'textedit', throwing, 'click', 'control');
  assert.equal(threw.check.value.ok, false);
  assert.match(threw.check.value.outcome.threw, /actionFailed/);

  const press = fakeApp(golden('electron', 'vendor.txt'), {click: (app, index) => { if (index === 13) app.ax = app.ax.replace('Pressed 0 times', 'Pressed 1 time'); }});
  assert.equal((await runCase('electron', 'electron', press, 'click', 'button')).check.value.ok, true);

  // Finder: the list starts on row 001 (a harness click on its cell), the click lands on a cell of row 005 other than
  // its name, and row 005 is then the only selected element.
  const text = await import('../../scripts/native-matrix/matrix-text.mjs');
  const {indexOfRowCell} = await import('../../scripts/repl-parity/scenes-mac-text.mjs');
  const finder = golden('finder', 'vendor.txt');
  const names = ['scene-file-001', 'scene-file-005'];
  const select = fakeApp(finder, {click: (app, index) => {
    const name = names.find(n => indexOfRowCell(finder, n) === index);
    if (name) app.ax = finder.replace(/\n\nThe focused UI element/, `\n\nSelected:\n\t${text.rowIndexOfName(finder, name)} row (selected)\n\nThe focused UI element`);
  }});
  const row = await runCase('finder', 'finder', select, 'click', 'row');
  assert.equal(row.prepare.value.ready, true, JSON.stringify(row.prepare));
  assert.deepEqual(select.calls.map(c => c[1]), [indexOfRowCell(finder, 'scene-file-001'), indexOfRowCell(finder, 'scene-file-005')]);
  assert.equal(row.check.value.ok, true, JSON.stringify(row.check));
});

test('an insertion is the selected word replaced by the text, exactly; an engine that inserts elsewhere or not at all fails', async () => {
  const exact = electronField();
  const typed = await runCase('electron', 'electron', exact.app, 'typeText', 'replace');
  assert.equal(typed.prepare.value.ready, true, JSON.stringify(typed.prepare));
  assert.equal(typed.check.value.ok, true, JSON.stringify(typed.check));
  assert.match(exact.state.value, /^alpha one\nbravo two\nThe quick brown fox jumps over the lazy dog\. three\ndelta four\n/);
  // One more occurrence of the text, but not where the selection was: a count of occurrences passed this, the exact
  // post-state does not.
  const elsewhere = electronField({insertAtStart: true});
  const wrong = await runCase('electron', 'electron', elsewhere.app, 'paste', 'replace');
  assert.equal(wrong.check.value.outcome.inserted, 1);
  assert.equal(wrong.check.value.ok, false);
  assert.equal((await runCase('electron', 'electron', electronField({inert: true}).app, 'typeText', 'replace')).check.value.ok, false);
});

test('a fresh value: setValue writes a value no earlier row wrote, so an inert engine never passes on a repeat', async () => {
  const field = electronField();
  const first = await runCase('electron', 'electron', field.app, 'setValue', 'text');
  assert.equal(first.check.value.ok, true, JSON.stringify(first));
  const inert = electronField({value: field.state.value});
  inert.app.setValue = async () => {};
  assert.equal((await runCase('electron', 'electron', inert.app, 'setValue', 'text')).check.value.ok, false);
});

test('Chrome\'s Apply needs the fresh name in the status; a status an earlier row left does not pass', async () => {
  const page = golden('chrome', 'vendor.txt');
  const withName = (ax, v) => ax.replace(/(\t23 [^\n]*Scene name)(, Value: [^\n]*)?/, `$1, Value: ${v}`);
  let name = '';
  const stale = fakeApp(page.replace('텍스트 Ready', '텍스트 Applied: cua apply old'), {setValue: (app, index, v) => { if (index === 23) app.ax = withName(app.ax, v); }});
  const r = await runCase('chrome', 'chrome', stale, 'click', 'apply');
  assert.equal(r.prepare.value.ready, true, JSON.stringify(r.prepare));
  assert.equal(r.check.value.ok, false);
  const live = fakeApp(page, {setValue: (app, index, v) => { if (index === 23) { name = v; app.ax = withName(app.ax, v); } },
    click: (app, index) => { if (index === 24) app.ax = app.ax.replace(/텍스트 (Ready|Applied: [^\n]*)/, `텍스트 Applied: ${name}`); }});
  assert.equal((await runCase('chrome', 'chrome', live, 'click', 'apply')).check.value.ok, true);
});

test('the caret click must collapse a selection it did not make; the drag must select across lines from no selection', async () => {
  const doc = golden('textedit', 'vendor.txt');
  const trailer = sel => doc.replace(/\n\nThe focused UI element/, `\n\nSelected text: \`\`\`\n${sel}\n\`\`\`\n\nThe focused UI element`);
  const collapsing = fakeApp(doc, {selectText: (app, _, word) => { app.ax = trailer(word); }, click: app => { app.ax = doc; }});
  assert.equal((await runCase('textedit', 'textedit', collapsing, 'click', 'element')).check.value.ok, true);
  const inert = fakeApp(doc, {selectText: (app, _, word) => { app.ax = trailer(word); }});
  assert.equal((await runCase('textedit', 'textedit', inert, 'click', 'element')).check.value.ok, false, 'the line selected first is still selected');

  const field = electronField({value: 'alpha one\nbravo two\ncharlie three\ndelta four\necho five\nfoxtrot six\ngolf seven\nhotel eight'});
  // A JPEG's SOF0 header for 1440 x 1120: the 720 x 560 window at scale 2.
  const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0, 0, 0, 0, 0, 0]);
  field.app.getScreenshot = async () => jpeg(1440, 1120);
  field.app.drag = async () => { field.state.selected = 'two\ncharlie three\ndelta'; };
  const drag = await runCase('electron', 'electron', field.app, 'drag', 'select');
  assert.equal(drag.prepare.value.ready, true, JSON.stringify(drag.prepare));
  assert.equal(drag.check.value.ok, true, JSON.stringify(drag.check));
  const points = field.app.calls.filter(c => c[0] === 'click').map(c => c[1]);
  assert.deepEqual(points, [[600, 198], [60, 138]], 'each end of the drag clicked first, grounded in the fixture\'s layout');
  field.app.drag = async () => {};
  assert.equal((await runCase('electron', 'electron', field.app, 'drag', 'select')).check.value.ok, false);
  const squashed = electronField();
  squashed.app.getScreenshot = async () => jpeg(1440, 512);
  assert.match((await runCase('electron', 'electron', squashed.app, 'drag', 'select')).prepare.value.reason, /shape/);
});

test('a refused case passes only on the vendor\'s sentence with nothing changed', async () => {
  const refuse = sentence => fakeApp(golden('chrome', 'vendor.txt'), {setValue: () => { throw Object.assign(new Error(`Computer Use server error -10005: ${sentence}`), {errorName: 'valueNotSettable'}); }});
  const refused = await runCase('chrome', 'chrome', refuse('Cannot set a value for an element that is not settable'), 'setValue', 'notSettable');
  assert.equal(refused.check.value.ok, true, JSON.stringify(refused.check));
  assert.equal(refused.check.value.outcome.errorName, 'valueNotSettable');
  const transport = await runCase('chrome', 'chrome', fakeApp(golden('chrome', 'vendor.txt'), {setValue: () => { throw new Error('transport unavailable'); }}), 'setValue', 'notSettable');
  assert.equal(transport.check.value.ok, false, 'any other error is not the refusal');
  const accepts = await runCase('chrome', 'chrome', fakeApp(golden('chrome', 'vendor.txt')), 'setValue', 'notSettable');
  assert.equal(accepts.check.value.ok, false);
  // The sentence, but the state moved: not a refusal.
  const moved = fakeApp(golden('textedit', 'vendor.txt'), {selectText: app => { app.ax = app.ax.replace('Line 10', 'Line 1O'); throw new Error('Cannot select text for an element that does not support a settable selected text range'); }});
  assert.equal((await runCase('textedit', 'textedit', moved, 'selectText', 'notText')).check.value.ok, false);
  const invalid = fakeApp(golden('textedit', 'vendor.txt'), {click: () => { throw new Error('Computer Use server error -10005: 99999 is an invalid element ID'); }});
  assert.equal((await runCase('textedit', 'textedit', invalid, 'click', 'invalidIndex')).check.value.ok, true);
});

test('the app with no window: its bind refused with the vendor\'s sentence, nothing bound', async () => {
  const cells = caseCells('windowless', casesOf('windowless', 'getAXState', 'noWindow'));
  const once = async getApp => {
    const cua = {getApp};
    await run(cells.prepare, {cua}); await run(cells.act, {cua});
    const check = await run(cells.check, {cua});
    delete globalThis.__m;
    return check.value;
  };
  assert.equal((await once(async () => { throw new Error('Computer Use server error -10005: noWindowsAvailable'); })).ok, true);
  assert.equal((await once(async () => { throw new Error('approval declined'); })).ok, false);
  assert.equal((await once(async () => ({bound: true}))).ok, false);
});

test('a case whose precondition does not hold sends nothing and its row is invalid', async () => {
  // Electron's typeText needs the text field focused: a click that does not move the focus leaves the case unprepared.
  const app = fakeApp(golden('electron', 'vendor.txt').replace('The focused UI element is 5 ', 'The focused UI element is 13 '));
  const {prepare, act, check} = await runCase('electron', 'electron', app, 'typeText', 'replace');
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

test('the launch path: the app observed through the engine\'s call, its text kept in the cell; the Open panel never counts', async () => {
  const {launchCell, launchCheckCell} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const panelText = 'Window: "Open", App: TextEdit.\n0 standard window ID: open-panel\n\t1 row owner-secret-file.pages\n';
  const asked = [];
  let text = panelText;
  const cua = {computer: {get_app_state: async request => { asked.push(request); return {text}; }}, listApps: async () => [{id: 'com.apple.TextEdit', isRunning: true}],
    getApp: async () => { throw new Error('getApp emits the text; the launch path must not call it'); }};
  const act = await run(launchCell('textedit', '/System/Applications/TextEdit.app'), {cua});
  assert.deepEqual([act.value.threw, act.value.state, act.value.panel, act.value.scene], [false, true, true, false]);
  assert.deepEqual(asked[0], {app: '/System/Applications/TextEdit.app', disableDiff: true});
  assert.doesNotMatch(JSON.stringify(act), /owner-secret-file/);
  // With the panel still in front, the launch has not reached the run's state.
  const stuck = await run(launchCheckCell('textedit', '/System/Applications/TextEdit.app').replace('Date.now() + 10000', 'Date.now() + 50'), {cua});
  assert.equal(stuck.value.ok, false);
  assert.doesNotMatch(JSON.stringify(stuck), /owner-secret-file/);
  text = golden('textedit', 'vendor.txt');
  assert.deepEqual((await run(launchCheckCell('textedit', '/System/Applications/TextEdit.app'), {cua})).value, {ok: true, outcome: {listed: true, running: true, scene: true, panel: false}});
  const failing = await run(launchCell('electron', '/x.app'), {cua: {computer: {get_app_state: async () => { throw new Error('appNotFound'); }}}});
  assert.deepEqual([failing.value.threw, failing.value.error], [true, 'appNotFound']);
});
