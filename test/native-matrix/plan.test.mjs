// The method matrix's plan and cells (scripts/native-matrix/plan.mjs, matrix-cells.mjs): every target covers the 11
// methods by a case or a reason, and the cells, run in node against a fake app over the goldens both engines recorded on
// the mini (test/native-goldens/), judge outcomes by what they read back and return no screen content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {CASES, CHROME_FIELD_ROWS, FIELD_LINES, FOCUS_REASONS, METHODS, NOT_APPLICABLE, TARGETS, TYPE_UNCONFIRMED_NOT_TEXT, caseId, chromeDragFromField, focusVerdict, framedCells, groundCase, typeIntoList} from '../../scripts/native-matrix/plan.mjs';
import {PAGE_HTML} from '../../scripts/native-matrix/fixtures/scene-page.mjs';
import {NO_SUCH_ACTION, caseCells, findingCell, panelCell, selectCell} from '../../scripts/native-matrix/matrix-cells.mjs';
import {focusedIndexOf, selectedTextOf} from '../../scripts/native-matrix/matrix-text.mjs';
import {NOTE} from '../../src/services/engine/render.mjs';

const golden = (scene, file) => readFileSync(fileURLToPath(new URL(`../native-goldens/${scene}/${file}`, import.meta.url)), 'utf8');
// A text's trailer replaced as src/services/engine/render.mjs trailer() writes one: selected text, else selected elements,
// else the focused element, never two of them. `focused` is the focused element's line (without its tabs).
function withTrailer(ax, {selectedText = null, selected = [], focused = null}) {
  const tree = String(ax).split(/\n\n(?:The focused UI element is |Selected text: |Selected:\n)/)[0];
  if (selectedText !== null) return `${tree}\n\nSelected text: \`\`\`\n${selectedText}\n\`\`\`\n\n${NOTE}`;
  if (selected.length) return `${tree}\n\nSelected:\n${selected.map(line => `\t${line}`).join('\n')}\n\n${NOTE}`;
  return focused === null ? tree : `${tree}\n\nThe focused UI element is ${focused}`;
}
const focusedLine = ax => /^The focused UI element is (.*)$/m.exec(ax)?.[1] ?? null;
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
// `press`: the click keeps the field's selection, as cua's AXPress does on Chromium's textarea (#188), where a posted
// click places a caret; `sticky`: no write clears the selection either.
// `onClear`: what an emptying setValue("") does instead of emptying the field: 'gone' (the field leaves the text) or
// 'renumber' (the field, its value kept, prints at index 99).
function electronField({value = '', inert = false, insertAtStart = false, press = false, sticky = false, onClear = null} = {}) {
  const lines = golden('electron', 'vendor.txt').split('\n\nThe focused UI element')[0].split('\n');
  const state = {value, focused: 5, selected: null, cleared: null};
  const render = () => {
    const tree = lines.filter(line => !(state.cleared === 'gone' && /^\t+5 /.test(line)))
      .map(line => (/^\t+5 /.test(line) ? `${state.cleared === 'renumber' ? line.replace(/^(\t+)5 /, '$199 ') : line}${state.value ? `, Value: ${state.value}` : ''}` : line)).join('\n');
    const focused = lines.find(l => new RegExp(`^\\t*${state.focused} `).test(l))?.trim() ?? '';
    return withTrailer(tree, state.selected ? {selectedText: state.selected} : {focused});
  };
  const write = text => {
    if (inert) return;
    state.value = insertAtStart ? text + state.value : state.selected ? state.value.replace(state.selected, text) : state.value + text;
    state.selected = null;
  };
  const app = fakeApp('', {
    click: (_, index) => { if (Number.isInteger(index)) state.focused = index; if (!press) state.selected = null; },
    setValue: (_, index, v) => { if (index !== 5) return; if (onClear && v === '') { state.cleared = onClear; return; } if (v !== state.value && !sticky) state.selected = null; state.value = v; },
    selectText: (_, index, word) => { if (index === 5 && state.value.includes(word)) state.selected = word; },
    typeText: (_, text) => write(text), paste: (_, text) => write(text),
  });
  Object.defineProperty(app, 'ax', {get: render, set: () => {}});
  return {app, state};
}

test('the doubles write the renderer\'s trailer: a selection replaces the focused element, so no text carries both', async () => {
  const {app} = electronField({value: 'alpha one\nbravo two'});
  assert.equal(focusedIndexOf(app.ax), 5);
  await app.selectText(5, 'bravo');
  assert.deepEqual([selectedTextOf(app.ax), focusedIndexOf(app.ax)], ['bravo', null]);
  assert.ok(app.ax.endsWith(NOTE));
  // TextEdit's three selection preparations (typeText, select-all, paste) reach ready on that grammar: the focus is read
  // before the word is selected, and the selection after it.
  const doc = golden('textedit', 'vendor.txt');
  const lineOf = index => new RegExp(`^\\t*(${index} .*)$`, 'm').exec(doc)[1];
  for (const [method, kase] of [['typeText', 'replace'], ['pressKey', 'selectAll'], ['paste', 'replace']]) {
    const text = fakeApp(withTrailer(doc, {focused: focusedLine(doc)}), {
      click: (app, index) => { app.ax = withTrailer(doc, {focused: lineOf(index)}); },
      selectText: (app, _, word) => { app.ax = withTrailer(doc, {selectedText: word}); },
    });
    const cells = caseCells('textedit', casesOf('textedit', method, kase));
    const prepared = await run(cells.prepare, {apps: {textedit: text}});
    delete globalThis.__m;
    assert.equal(prepared.value.ready, true, `${method}.${kase}: ${JSON.stringify(prepared.value)}`);
  }
});

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
    if (name) app.ax = withTrailer(finder, {selected: [`${text.rowIndexOfName(finder, name)} row (selected)`]});
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
  let inert = false;
  const live = fakeApp(page, {setValue: (app, index, v) => { if (index === 23) { name = v; app.ax = withName(app.ax, v); } },
    click: (app, index) => { if (index === 24 && !inert) app.ax = app.ax.replace(/텍스트 (Ready|Applied: [^\n]*)/, `텍스트 Applied: ${name}`); }});
  assert.equal((await runCase('chrome', 'chrome', live, 'click', 'apply')).check.value.ok, true);
  // The same case again (the next run's row) with a click that does nothing: the status the first row left is not this
  // row's, because this row's name is new.
  inert = true;
  assert.equal((await runCase('chrome', 'chrome', live, 'click', 'apply')).check.value.ok, false);
});

test('the caret click must collapse a selection it did not make; the drag must select across lines from no selection', async () => {
  const doc = golden('textedit', 'vendor.txt');
  const trailer = sel => withTrailer(doc, {selectedText: sel});
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

// The Chrome page's notes field (index 22 in the vendor's golden), focused, its value set by setValue; a click by point
// leaves the focus where it is, as a click inside the field does.
function chromeField() {
  const lines = golden('chrome', 'vendor.txt').split('\n\nThe focused UI element')[0].split('\n');
  const state = {value: ''};
  const app = fakeApp('', {setValue: (_, index, v) => { if (index === 22) state.value = v; }});
  Object.defineProperty(app, 'ax', {get: () => withTrailer(lines.map(line => (/^\t+22 /.test(line) && state.value ? `${line}, Value: ${state.value}` : line)).join('\n'),
    {focused: lines.find(l => /^\t+22 /.test(l)).trim()}), set: () => {}});
  return app;
}
const jpegOf = (w, h) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0, 0, 0, 0, 0, 0]);
const dragPoints = async (c, shot) => {
  const app = chromeField();
  app.getScreenshot = async () => shot;
  const prepare = await run(caseCells('chrome', c).prepare, {apps: {chrome: app}});
  delete globalThis.__m;
  return {ready: prepare.value?.ready, points: app.calls.filter(x => x[0] === 'click').map(x => x[1])};
};

// Ruling 1226 (replacing 1169's fixed points): Chrome's drag is grounded on the field-frame reading, whichever window
// it was read in. Unread, the plan's own case is never prepared. Read on the hosted 800x760 window (1x: the shot is
// 800x760, window points are its pixels) the prepare clicks the field's own points; read on the mini's 2x 1000x760 the
// same window points are doubled. The mini's golden tree puts the field at 8,224 504x131 in its window (an infobar under
// the toolbar); the hosted window is narrower, the field the same.
test('ruling 1226: Chrome\'s drag is grounded on the field frame read; ungrounded, it is never prepared', async () => {
  const drag = casesOf('chrome', 'drag', 'select');
  assert.equal(groundCase(drag, null), drag);
  assert.deepEqual(await dragPoints(drag, jpegOf(800, 760)), {ready: false, points: []}, 'no frame read: nothing clicked');
  const field = {x: 8, y: 224, width: 504, height: 131};
  const hosted = groundCase(drag, {window: {width: 800, height: 760}, field});
  assert.notEqual(hosted, drag);
  assert.deepEqual([hosted.method, hosted.case, hosted.expect, hosted.framed, hosted.prepareInFront], ['drag', 'select', 'outcome', 'window points', true]);
  const {from, to} = chromeDragFromField({window: {width: 800, height: 760}, field});
  assert.deepEqual({from, to}, {from: [16, 250], to: [310, 282]});
  assert.deepEqual(await dragPoints(hosted, jpegOf(800, 760)), {ready: true, points: [to, from]});
  const mini = groundCase(drag, {window: {width: 1000, height: 760}, field});
  assert.deepEqual(await dragPoints(mini, jpegOf(2000, 1520)), {ready: true, points: [[620, 564], [32, 500]]});
  // A reading in another window than the shot's fails the prepare's shape check (0.95 against 0.76): never dragged.
  assert.equal((await dragPoints(mini, jpegOf(800, 760))).ready, false);
  // The other targets' cases are never grounded on a reading: the fixture keeps its size (its layout is the mini's),
  // TextEdit's drag is in fractions of its window, Finder's cases address rows.
  for (const target of ['textedit', 'finder', 'electron', 'openPanel']) for (const c of CASES[target]) {
    assert.equal(c.fieldFrame, undefined, `${target} ${c.method}.${c.case}`);
    assert.equal(groundCase(c, {window: {width: 800, height: 760}, field}), c, `${target} ${c.method}.${c.case}`);
  }
});

test('the cells grounded on a scene\'s frame are named from the plan, in both regimes', () => {
  assert.deepEqual(framedCells('chrome'), [{id: 'chrome/frontmost/drag.select', framed: 'window points'}, {id: 'chrome/background/drag.select@textedit', framed: 'window points'}]);
  assert.deepEqual(framedCells('electron').map(c => c.id), ['electron/frontmost/drag.select', 'electron/frontmost/click.point', 'electron/background/drag.select@finder']);
  assert.deepEqual(framedCells('textedit').map(c => [c.id, c.framed]), [['textedit/frontmost/drag.select', 'window fractions'], ['textedit/background/drag.select@finder', 'window fractions'],
    ['textedit/background/drag.select@chrome', 'window fractions']]);
  assert.ok(framedCells('finder').every(c => c.framed === 'visible rows'));
  assert.deepEqual(framedCells('finder').filter(c => !c.id.includes('@')).map(c => c.id),
    ['finder/frontmost/click.row', 'finder/frontmost/pressKey.down', 'finder/frontmost/typeText.typeSelect', 'finder/frontmost/scroll.down', 'finder/frontmost/performSecondaryAction.down']);
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

// #190: Chromium answers a checkbox's AXSelectedTextRange settable, so the vendor's select_text passes its settability
// check there and refuses at the search; hold 3 recorded that sentence from both engines in both runs. The Chrome row
// expects it, exactly; TextEdit's and Finder's rows keep the settability refusal.
test('selectText.notText expects each scene\'s own refusal sentence and no other', async () => {
  const notFound = 'Could not find the requested text to select in the element';
  const notSettable = 'Cannot select text for an element that does not support a settable selected text range';
  const refuse = (scene, sentence) => fakeApp(golden(scene, 'vendor.txt'), {selectText: () => { throw new Error(`Computer Use server error -10005: ${sentence}`); }});
  const check = async (scene, sentence) => (await runCase(scene, scene, refuse(scene, sentence), 'selectText', 'notText')).check.value;
  const chrome = await check('chrome', notFound);
  assert.equal(chrome.ok, true, JSON.stringify(chrome));
  for (const other of [notSettable, 'Timed out waiting for the application to respond', 'The element did not accept the text selection.'])
    assert.equal((await check('chrome', other)).ok, false, other);
  // The whole refusal, in the server error's envelope or bare: the sentence quoted inside another error is not it.
  const thrown = message => fakeApp(golden('chrome', 'vendor.txt'), {selectText: () => { throw new Error(message); }});
  const whole = async message => (await runCase('chrome', 'chrome', thrown(message), 'selectText', 'notText')).check.value.ok;
  assert.equal(await whole(notFound), true, 'bare');
  assert.equal(await whole(`Computer Use server error -10005: ${notFound}`), true, 'in the envelope');
  for (const quoted of [`Computer Use server error -10005: Timed out waiting for focus after: ${notFound}`, `${notFound}, then the focus timed out`,
    `Error: ${notFound}`, `Computer Use server error -10005: ${notFound}.`])
    assert.equal(await whole(quoted), false, quoted);
  for (const scene of ['textedit', 'finder']) {
    assert.equal((await check(scene, notSettable)).ok, true, scene);
    assert.equal((await check(scene, notFound)).ok, false, scene);
  }
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

// #188: a row's prepare that reads the field's focus does not depend on what an earlier row left selected in it. The
// renderer's trailer shows selected text instead of the focused element, and cua's click on the Electron field (an
// AXPress) keeps an existing selection, so the prepare clears it as a stated step; a selection it cannot clear is
// reported as masking the trailer, never as a field that could not be given the focus.
const CLEARED = 'field emptied to clear a selection';
test('a selection an earlier row left in the field is cleared as a stated step, so the focused field passes', async () => {
  for (const [method, kase] of [['typeText', 'replace'], ['pressKey', 'tab'], ['paste', 'replace']]) {
    // drag.select's multi-line selection, or selectText's "matrix", left in the focused field; the click keeps it.
    const {app, state} = electronField({value: 'alpha one\nbravo two\ncharlie three\ndelta four\necho five\nfoxtrot six\ngolf seven\nhotel eight', press: true});
    state.selected = 'bravo two\ncharlie';
    const cells = caseCells('electron', casesOf('electron', method, kase));
    const prepared = await run(cells.prepare, {apps: {electron: app}});
    delete globalThis.__m;
    assert.equal(prepared.value.ready, true, `${method}.${kase}: ${JSON.stringify(prepared.value)}`);
    assert.deepEqual(prepared.value.prepared, [CLEARED], 'the clear is named in the prepare\'s result');
    assert.deepEqual(prepared.value.focus, {index: 5, trailer: 'focused'});
    assert.deepEqual(app.calls.slice(0, 2), [['click', 5], ['setValue', 5, '']], 'the click first; the clear only because the selection survived it');
  }
  // A click that collapses the selection (a posted click, the vendor's) needs no clear, and none is stated.
  const {app, state} = electronField({value: 'alpha one\nbravo two'});
  state.selected = 'bravo';
  const prepared = await run(caseCells('electron', casesOf('electron', 'pressKey', 'tab')).prepare, {apps: {electron: app}});
  delete globalThis.__m;
  assert.deepEqual(prepared.value, {ready: true, focus: {index: 5, trailer: 'focused'}});
  assert.deepEqual(app.calls, [['click', 5]]);
});

// Ruling 1204: the clear is named only when the read-back shows the field empty; one that did not take is stated as
// attempted, with what the field still read, and the selection still masking the trailer is the row's reason.
test('a clear that does not take is stated as attempted, never as emptied', async () => {
  const {app, state} = electronField({value: 'alpha one\nbravo two', press: true});
  state.selected = 'bravo';
  app.setValue = async () => {};
  const prepared = await run(caseCells('electron', casesOf('electron', 'pressKey', 'tab')).prepare, {apps: {electron: app}});
  delete globalThis.__m;
  assert.deepEqual(prepared.value.prepared, ['emptying attempted to clear a selection, the field still read 19 characters']);
  assert.ok(!prepared.value.prepared.includes(CLEARED));
});

// Final review, item 3: the clear's read-back finds the field again in the fresh observation. A field that left the text
// is not an empty one, and a renumbered field's old index reads nothing of it.
test('the clear\'s read-back re-finds the field: gone is not emptied, renumbered is read where it now is', async () => {
  for (const [onClear, prepared, reason] of [
    ['gone', ['emptying attempted to clear a selection, the field no longer in the text'], 'the field is not in the text'],
    ['renumber', ['emptying attempted to clear a selection, the field still read 19 characters'], FOCUS_REASONS.masked],
  ]) {
    const {app, state} = electronField({value: 'alpha one\nbravo two', press: true, onClear});
    state.selected = 'bravo';
    const out = await run(caseCells('electron', casesOf('electron', 'pressKey', 'tab')).prepare, {apps: {electron: app}});
    delete globalThis.__m;
    assert.deepEqual(out.value.prepared, prepared, onClear);
    assert.ok(!out.value.prepared.includes(CLEARED), onClear);
    if (onClear === 'gone') assert.deepEqual([out.value.ready, out.value.reason], [false, reason]);
    else assert.deepEqual(out.value.focus, {index: 99, trailer: 'masked'}, 'the field read at its new index');
  }
});

test('rows no longer depend on the selection an earlier row left: Electron\'s selectText then paste, in one field', async () => {
  const {app} = electronField({value: 'alpha one', press: true});
  const select = await runCase('electron', 'electron', app, 'selectText', 'text');
  assert.equal(select.check.value.ok, true, 'selectText leaves "matrix" selected in the field');
  const paste = await runCase('electron', 'electron', app, 'paste', 'replace');
  assert.equal(paste.prepare.value.ready, true, JSON.stringify(paste.prepare.value));
  assert.deepEqual(paste.prepare.value.prepared, [CLEARED]);
  assert.equal(paste.check.value.ok, true, 'the paste replaces the word its own prepare selected');
});

test('a selection that masks the trailer is reported as its own reason, and the observation\'s own focus is read in its place', async () => {
  // The clear does not take: the trailer still shows only the selection, so the cell cannot tell the focus.
  const {app, state} = electronField({value: 'alpha one\nbravo two', press: true, sticky: true});
  state.selected = 'bravo';
  const prepared = await run(caseCells('electron', casesOf('electron', 'pressKey', 'tab')).prepare, {apps: {electron: app}});
  delete globalThis.__m;
  assert.deepEqual(prepared.value, {ready: true, focus: {index: 5, trailer: 'masked'}, prepared: [CLEARED]}, 'left to the harness\'s verdict');
  assert.equal(FOCUS_REASONS.masked, 'the focus could not be read: a selection masks the trailer');
  assert.notEqual(FOCUS_REASONS.masked, FOCUS_REASONS.unfocused);
  // The vendor reports no observation meta: the trailer decides, and a masked one is its own reason.
  assert.deepEqual(focusVerdict(prepared.value.focus, null), {by: 'trailer', problem: FOCUS_REASONS.masked});
  assert.deepEqual(focusVerdict({index: 5, trailer: 'focused'}, null), {by: 'trailer', problem: null});
  // cua's observation names the focused element, which no selection masks: it is read instead of the trailer.
  assert.deepEqual(focusVerdict(prepared.value.focus, {webShaped: true, focusedIndex: 5, focusedRole: 'AXTextArea'}), {by: 'observation', problem: null});
  assert.deepEqual(focusVerdict({index: 5, trailer: 'focused'}, {focusedIndex: 13, focusedRole: 'AXButton'}), {by: 'observation', problem: FOCUS_REASONS.unfocused},
    'preferred over the trailer when present');
  assert.deepEqual(focusVerdict(prepared.value.focus, {focusedIndex: null, focusRead: 'AXError -25212'}),
    {by: 'observation', problem: `${FOCUS_REASONS.unfocused} (the focus read answered AXError -25212)`});
  assert.deepEqual(focusVerdict(prepared.value.focus, {webShaped: true}), {by: 'trailer', problem: FOCUS_REASONS.masked}, 'an observation meta without the focus read');
  // TextEdit's prepare (no value of its own to write back) has no clear: a masked trailer is left to the verdict too.
  const doc = golden('textedit', 'vendor.txt');
  const keeps = fakeApp(withTrailer(doc, {selectedText: 'Line 10'}), {selectText: (a, _, word) => { a.ax = withTrailer(doc, {selectedText: word}); }});
  const textedit = await run(caseCells('textedit', casesOf('textedit', 'typeText', 'replace')).prepare, {apps: {textedit: keeps}});
  delete globalThis.__m;
  assert.deepEqual([textedit.value.ready, textedit.value.focus?.trailer, textedit.value.prepared], [true, 'masked', undefined]);
  assert.ok(!keeps.calls.some(c => c[0] === 'setValue'), 'nothing written into the document');
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

const sha = async s => (await import('node:crypto')).createHash('sha256').update(s, 'utf8').digest('hex');

test('the select-all check records the selection by length and hash: nothing happened, a partial selection and the whole selection read apart', async () => {
  const text = await import('../../scripts/native-matrix/matrix-text.mjs');
  const doc = golden('textedit', 'vendor.txt');
  const area = text.indexOfPart(doc, 'ID', 'First Text View');
  const value = text.valueOfIndex(doc, area).replace(/\*\*/g, '');
  const lineOf = index => new RegExp(`^\\t*(${index} .*)$`, 'm').exec(doc)[1];
  const selectAll = onKeys => fakeApp(withTrailer(doc, {focused: focusedLine(doc)}), {
    click: (app, index) => { app.ax = withTrailer(doc, {focused: lineOf(index)}); },
    selectText: (app, _, word) => { app.ax = withTrailer(doc, {selectedText: word}); },
    pressKey: app => onKeys(app),
  });
  const outcomeOf = async onKeys => {
    const {prepare, check} = await runCase('textedit', 'textedit', selectAll(onKeys), 'pressKey', 'selectAll');
    assert.equal(prepare.value.ready, true, JSON.stringify(prepare));
    assert.doesNotMatch(JSON.stringify(check), /Line 0|cua scene document/, 'hashes only, never the text');
    return check.value;
  };
  const nothing = await outcomeOf(() => {});
  assert.equal(nothing.ok, false);
  assert.deepEqual(nothing.outcome.selection, {selectedLength: 7, selectedHash: await sha('Line 03'), valueLength: value.length, valueHash: await sha(value), valueChanged: false,
    selectionChanged: false}, 'the prepare\'s Line 03 still selected');
  const partial = await outcomeOf(app => { app.ax = withTrailer(doc, {selectedText: 'Line 03\nLine 04'}); });
  assert.deepEqual([partial.ok, partial.outcome.selection.selectedLength, partial.outcome.selection.selectionChanged, partial.outcome.selection.valueChanged], [false, 15, true, false]);
  const whole = await outcomeOf(app => { app.ax = withTrailer(doc, {selectedText: value}); });
  assert.equal(whole.ok, true, JSON.stringify(whole));
  assert.deepEqual([whole.outcome.selection.selectedLength, whole.outcome.selection.selectedHash], [value.length, await sha(value)]);
});

test('the setValue and selectText checks record the field\'s selection and value by length and hash, and whether the value changed from the prepare\'s', async () => {
  const field = electronField({value: 'alpha one'});
  const set = await runCase('electron', 'electron', field.app, 'setValue', 'text');
  assert.equal(set.check.value.ok, true, JSON.stringify(set));
  assert.deepEqual(set.check.value.outcome.selection, {selectedLength: null, selectedHash: null, valueLength: field.state.value.length, valueHash: await sha(field.state.value),
    valueChanged: true, selectionChanged: false});
  const select = await runCase('electron', 'electron', field.app, 'selectText', 'text');
  assert.equal(select.check.value.ok, true, JSON.stringify(select));
  assert.deepEqual(select.check.value.outcome.selection, {selectedLength: 6, selectedHash: await sha('matrix'), valueLength: field.state.value.length, valueHash: await sha(field.state.value),
    valueChanged: false, selectionChanged: true});
  assert.doesNotMatch(JSON.stringify([set, select]), /cua matrix set|cua select/);
  // An inert setValue: the value unchanged from the prepare's reading.
  const inert = electronField({value: 'alpha one'});
  inert.app.setValue = async () => {};
  const stuck = await runCase('electron', 'electron', inert.app, 'setValue', 'text');
  assert.deepEqual([stuck.check.value.ok, stuck.check.value.outcome.selection.valueChanged], [false, false]);
  // TextEdit's and Chrome's cases record the same.
  for (const [target, method, kase] of [['textedit', 'setValue', 'document'], ['textedit', 'selectText', 'line'], ['chrome', 'setValue', 'name'], ['chrome', 'selectText', 'name']])
    assert.match(caseCells(target, casesOf(target, method, kase)).check, /selection: selectionEvidence\(/, `${target} ${method}.${kase}`);
});

test('the finding scorer starts Finder\'s list at its first rows, scrolled back up when it is not, and records the range; a list it cannot bring there is invalid', async () => {
  const finder = golden('finder', 'vendor.txt');
  const scrolled = finder.replace('(showing 0-21 of 100 items)', '(showing 125-146 of 200 items)');
  const refuse = (_, index, action) => { throw new Error(`${action} is not a valid secondary action for element ${index}`); };
  // At its first rows already: nothing is scrolled.
  const top = fakeApp(finder, {performSecondaryAction: refuse});
  const atTop = await run(findingCell('finder'), {apps: {finder: top}});
  assert.deepEqual(atTop.value.showing, {from: 0, to: 21, of: 100});
  assert.ok(top.calls.every(([method]) => method === 'performSecondaryAction'));
  // Scrolled down (another run's viewport): scrolled up as the Finder rows' prepare does, then scored.
  const down = fakeApp(scrolled, {performSecondaryAction: refuse, scroll: app => { app.ax = finder; }});
  const normalized = await run(findingCell('finder'), {apps: {finder: down}});
  assert.deepEqual(down.calls[0], ['scroll', 4, 'up', 20]);
  assert.deepEqual(normalized.value.showing, {from: 0, to: 21, of: 100});
  assert.deepEqual(normalized.value.targets, atTop.value.targets, 'the scored observation is the normalized one');
  // A list that stays scrolled, or whose range cannot be read: invalid, never scored.
  const stuck = fakeApp(scrolled, {performSecondaryAction: refuse});
  const notTop = await run(findingCell('finder'), {apps: {finder: stuck}});
  assert.deepEqual(notTop.value, {invalid: 'Finder\'s list did not start at its first rows', showing: {from: 125, to: 146, of: 200}});
  assert.deepEqual(stuck.calls.map(c => c[0]), ['scroll']);
  const unread = await run(findingCell('finder'), {apps: {finder: fakeApp(finder.replace(' (showing 0-21 of 100 items)', ''), {performSecondaryAction: refuse})}});
  assert.deepEqual(unread.value, {invalid: 'Finder\'s list did not start at its first rows', showing: null});
  // The other scenes have no list to normalize.
  const chrome = await run(findingCell('chrome'), {apps: {chrome: fakeApp(golden('chrome', 'vendor.txt'), {performSecondaryAction: refuse})}});
  assert.equal('showing' in chrome.value, false);
});

test('#354: Finder\'s type-select case lets cua\'s typeUnconfirmed through, so the row records the answer, the selection it read and whether the list stayed as prepared', async () => {
  const text = await import('../../scripts/native-matrix/matrix-text.mjs');
  const finder = golden('finder', 'vendor.txt');
  const selecting = name => withTrailer(finder, {selected: [`${text.rowIndexOfName(finder, name)} row (selected)`]});
  const unconfirmed = Object.assign(new Error(`Computer Use server error -10005: The text was typed, but ${TYPE_UNCONFIRMED_NOT_TEXT}, so it is not confirmed.`), {errorName: 'typeUnconfirmed'});
  const app = (typed, thrown) => fakeApp(finder, {
    click: app => { app.ax = selecting('scene-file-001'); },
    typeText: app => { if (typed) app.ax = selecting('scene-file-012'); if (thrown) throw thrown; },
  });
  // Typed and selected, then unconfirmed: the row fails as cua answered, its effect read all the same.
  const landed = await runCase('finder', 'finder', app(true, unconfirmed), 'typeText', 'typeSelect');
  assert.equal(landed.prepare.value.ready, true, JSON.stringify(landed.prepare));
  assert.deepEqual([landed.act.value.threw, landed.check.value.ok], [true, false]);
  assert.deepEqual({effect: landed.check.value.outcome.effect, unchanged: landed.check.value.outcome.unchanged, errorName: landed.check.value.outcome.errorName, only: landed.check.value.outcome.only},
    {effect: true, unchanged: false, errorName: 'typeUnconfirmed', only: true});
  // Unconfirmed with nothing selected: no effect, the list as prepared.
  const inert = await runCase('finder', 'finder', app(false, unconfirmed), 'typeText', 'typeSelect');
  assert.deepEqual([inert.check.value.outcome.effect, inert.check.value.outcome.unchanged], [false, true]);
  // The vendor's success.
  assert.equal((await runCase('finder', 'finder', app(true, null), 'typeText', 'typeSelect')).check.value.ok, true);
});

test('#354: concurrent use\'s typing into a list keeps cua\'s typeUnconfirmed for an element that is not a text field as its expected difference; any other error still throws', async () => {
  const act = new AsyncFunction('__app', '__m', `${typeIntoList('scene-file-012')}\nreturn __m;`);
  const answering = message => ({typeText: async () => { if (message) throw new Error(`Computer Use server error -10005: ${message}`); }});
  const unconfirmed = `The text was typed, but ${TYPE_UNCONFIRMED_NOT_TEXT}, so it is not confirmed and some or all of it may have gone in.`;
  assert.deepEqual(await act(answering(unconfirmed), {}), {typeUnconfirmed: true});
  assert.deepEqual(await act(answering(null), {}), {}, 'the vendor\'s success');
  await assert.rejects(act(answering('The text was typed, but the field does not read as expected'), {}), /does not read as expected/);
  await assert.rejects(act(answering('The user changed \'x\'.'), {}), /user changed/);
});

// T10b′ (the M5 wave-1 record): what the judge's conservative-answer rule reads (./answers.mjs conservativeEffect), on
// an act that threw: the target's watched state read unchanged since the prepare (`unchanged`), and the case's own
// check reading its intended effect all the same (`effect`), both read back from the fixture, never inferred.
test('an act that threw records whether the state stayed as prepared and whether the intended effect was read anyway', async () => {
  const thrower = (field, {write, name}) => {
    field.app.typeText = async (...args) => {
      field.app.calls.push(['typeText', ...args]);
      if (write) field.state.value = field.state.value.replace(field.state.selected, args[0]);
      field.state.selected = null;
      throw Object.assign(new Error(`Computer Use server error -10005: ${name}`), {errorName: name});
    };
    return field;
  };
  const landed = await runCase('electron', 'electron', thrower(electronField(), {write: true, name: 'typeUnconfirmed'}).app, 'typeText', 'replace');
  assert.equal(landed.act.value.threw, true);
  assert.equal(landed.check.value.ok, false, 'an outcome case whose act threw fails whatever it reads');
  assert.deepEqual([landed.check.value.outcome.effect, landed.check.value.outcome.unchanged, landed.check.value.outcome.errorName], [true, false, 'typeUnconfirmed']);
  const refused = await runCase('electron', 'electron', thrower(electronField(), {write: false, name: 'backgroundClickRefused'}).app, 'typeText', 'replace');
  assert.deepEqual([refused.check.value.outcome.effect, refused.check.value.outcome.unchanged], [false, false], 'the selection collapsed: not the state as prepared');
  // Nothing at all moved: the state as prepared, selection and value alike.
  const still = electronField();
  still.app.typeText = async () => { throw Object.assign(new Error('Computer Use server error -10005: refused'), {errorName: 'backgroundClickRefused'}); };
  const untouched = await runCase('electron', 'electron', still.app, 'typeText', 'replace');
  assert.deepEqual([untouched.check.value.outcome.effect, untouched.check.value.outcome.unchanged], [false, true]);
  // An act that answered: its outcome as before, no reading for an answer it did not give.
  const ok = await runCase('electron', 'electron', electronField().app, 'typeText', 'replace');
  assert.equal(ok.check.value.ok, true);
  assert.equal('unchanged' in ok.check.value.outcome || 'effect' in ok.check.value.outcome, false);
  assert.doesNotMatch(JSON.stringify([landed, refused, untouched]), /alpha|bravo|charlie|quick brown/, 'the watched state stays in the cell');
});

test('a fixed-string Unicode row whose act threw: the field read empty as prepared, or holding the expected text', async () => {
  const {unicodeCase} = await import('../../scripts/native-matrix/unicode-plan.mjs');
  const c = unicodeCase({field: 'electron', method: 'typeText', string: {id: 'hangul', text: '한글 테스트'}});
  const cells = caseCells('electron', c);
  const runOn = async app => { const apps = {electron: app}; await run(cells.prepare, {apps}); await run(cells.act, {apps}); const check = await run(cells.check, {apps}); delete globalThis.__m; return check.value; };
  const unconfirmed = electronField();
  unconfirmed.app.typeText = async text => { unconfirmed.state.value = text; throw Object.assign(new Error('Computer Use server error -10005: not confirmed'), {errorName: 'typeUnconfirmed'}); };
  assert.deepEqual(await runOn(unconfirmed.app).then(v => [v.ok, v.outcome.exact, v.outcome.effect, v.outcome.unchanged]), [false, true, true, false]);
  const refused = electronField();
  refused.app.typeText = async () => { throw Object.assign(new Error('Computer Use server error -10005: refused before any key'), {errorName: 'concealedInputUnavailable'}); };
  assert.deepEqual(await runOn(refused.app).then(v => [v.ok, v.outcome.exact, v.outcome.effect, v.outcome.unchanged]), [false, false, false, true]);
});

// C-6 (ruling 1223, R4): chrome/background/pressKey.tab@textedit read moved=false on both engines while cua's own
// observation put the focus on the name field (index 22 to 23, as the frontmost row, which passed). The frontmost rows
// before it leave a name in the field; Chrome selects a text input's whole value when Tab focuses it, and the trailer
// then shows that selection in place of the focused element, so the check could not see the focus. The prepare empties
// the name field first, so the Tab's landing reads as the frontmost row's does.
function chromeFields({name = ''} = {}) {
  const doc = golden('chrome', 'vendor.txt');
  const tree = doc.split('\n\nThe focused UI element')[0].split('\n');
  const state = {focused: 22, notes: '', name, selected: null};
  const render = () => {
    const lines = tree.map(line => (/^\t+22 /.test(line) && state.notes ? `${line}, Value: ${state.notes}` : /^\t+23 /.test(line) && state.name ? `${line}, Value: ${state.name}` : line));
    const focused = tree.find(l => new RegExp(`^\\t*${state.focused} `).test(l))?.trim() ?? '';
    return withTrailer(lines.join('\n'), state.selected ? {selectedText: state.selected} : {focused});
  };
  const app = fakeApp('', {
    click: (_, index) => { state.focused = index; state.selected = null; },
    setValue: (_, index, v) => { if (index === 22) state.notes = v; if (index === 23) state.name = v; state.selected = null; },
    // Tab from the notes to the name field, which selects its whole value as Chrome does.
    pressKey: (_, key) => { if (key === 'Tab' && state.focused === 22) { state.focused = 23; state.selected = state.name || null; } },
  });
  Object.defineProperty(app, 'ax', {get: render, set: () => {}});
  return {app, state};
}
test('Chrome\'s Tab row: a name an earlier row left in the target field is emptied first, so the focus the Tab moved is read, not masked by its selection', async () => {
  // C-6's background row, a name left by the frontmost rows.
  const left = chromeFields({name: 'cua apply 1a2b'});
  const out = await runCase('chrome', 'chrome', left.app, 'pressKey', 'tab');
  assert.equal(out.prepare.value.ready, true, JSON.stringify(out.prepare.value));
  assert.deepEqual(out.check.value, {ok: true, outcome: {moved: true, focus: 'focused'}});
  assert.deepEqual(left.app.calls.filter(c => c[0] === 'setValue')[0], ['setValue', 23, ''], 'the name field emptied before the Tab');
  assert.ok(out.prepare.value.prepared.includes('the Tab\'s target field emptied first'), JSON.stringify(out.prepare.value));
  // The frontmost row's state, the field already empty: nothing emptied, nothing stated.
  const empty = chromeFields();
  const plain = await runCase('chrome', 'chrome', empty.app, 'pressKey', 'tab');
  assert.deepEqual(plain.check.value, {ok: true, outcome: {moved: true, focus: 'focused'}});
  assert.ok(!empty.app.calls.some(c => c[0] === 'setValue' && c[1] === 23));
  // A Tab that did not move the focus fails, its reading said.
  const stuck = chromeFields();
  stuck.app.pressKey = async () => {};
  assert.deepEqual((await runCase('chrome', 'chrome', stuck.app, 'pressKey', 'tab')).check.value, {ok: false, outcome: {moved: false, focus: 'unfocused'}});
  // Fix wave M4: a selection that still masks the trailer after the Tab says nothing about the focus: invalid, never FAIL.
  const masked = chromeFields();
  masked.app.pressKey = async () => { masked.state.focused = 23; masked.state.name = 'x'; masked.state.selected = 'x'; };
  assert.deepEqual((await runCase('chrome', 'chrome', masked.app, 'pressKey', 'tab')).check.value, {invalid: 'the focus could not be read: a selection masks the trailer', outcome: {moved: false, focus: 'masked'}});
  // A target field that would not empty leaves the row unprepared, nothing sent.
  const kept = chromeFields({name: 'cua apply 1a2b'});
  const setValue = kept.app.setValue;
  kept.app.setValue = async (index, v) => (index === 23 ? undefined : setValue(index, v));
  const refused = await runCase('chrome', 'chrome', kept.app, 'pressKey', 'tab');
  assert.deepEqual([refused.prepare.value.ready, refused.prepare.value.reason], [false, 'the Tab\'s target field could not be emptied first']);
});

// Ruling 1226: the fixed points ([24,192] to [200,237]) never landed in the notes field on the hosted 800x760 Chrome for
// Testing window, C-2 to C-7, either lane, either regime. The drag is grounded on the field's own frame as read (its
// window points): from just inside its left edge on its second line to its right part on its fourth.
test('Chrome\'s drag points come from the notes field\'s own frame, inside it, on its second and fourth lines', () => {
  // The line height divides by the field's rows, the fixture's own (review minor M2), not by the lines it is given.
  assert.equal(Number(/<textarea id="notes"[^>]* rows="(\d+)"/.exec(PAGE_HTML)?.[1]), CHROME_FIELD_ROWS);
  const window = {width: 800, height: 760}, field = {x: 16, y: 187, width: 444, height: 126};
  const layout = chromeDragFromField({window, field});
  assert.deepEqual(layout.window, [800, 760]);
  const inside = ([x, y]) => x > field.x && x < field.x + field.width && y > field.y && y < field.y + field.height;
  assert.ok(inside(layout.from) && inside(layout.to), JSON.stringify(layout));
  const line = (field.height - 6) / CHROME_FIELD_ROWS, lineOf = y => Math.floor((y - field.y - 3) / line);
  assert.deepEqual([lineOf(layout.from[1]), lineOf(layout.to[1])], [1, 3], 'the second line to the fourth: a drag across lines');
  assert.ok(layout.from[0] - field.x <= 10, 'just inside the left edge, before the line\'s first character');
  assert.ok(layout.to[0] > field.x + field.width / 2, 'in the field\'s right part');
  assert.ok(FIELD_LINES.length >= 4);
  // The case the run sends, rebuilt on that reading, carries these points.
  const c = CASES.chrome.find(x => x.method === 'drag' && x.case === 'select');
  assert.deepEqual(c.fieldFrame, {role: 'AXTextArea'});
  const grounded = c.ground({window, field});
  assert.ok(grounded.prepare.includes(JSON.stringify(layout)), 'the prepare\'s layout is the field\'s');
  assert.ok(grounded.prepare.includes('a point of the drag is not in the field'), 'the prepare still proves both points land in the field');
});
