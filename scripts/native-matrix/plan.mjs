// The method matrix's plan (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 4):
// the 11 facade methods on the four scenes and TextEdit's Open panel, plus the windowless app of the "app with no window"
// refusal, each a case judged by its outcome, read back through getAXState in the same grammar on either engine
// (./matrix-text.mjs). Pure data: ./matrix-cells.mjs turns a case into its cells and the run (./run.mjs) sends them.
//
// A case: {method, case, prepare, act, check, keys?, expect, refusal?}
//   method    the facade's method (METHODS: list_apps is listApps, get_app_state is getAXState)
//   prepare   a cell body that puts the scene into a pre-state the outcome is distinguishable from (a selection the
//             action must replace or collapse, a value the action must change, a status no earlier row left) with harness
//             actions of its own, verifies it, and returns {ready: true} or {ready: false, reason}. A case that is not
//             ready sends nothing more and its row is invalid, never a fail.
//   act       the one facade call the row measures, on `__m` (prepare's state) and `__app`; a refusal is caught and kept
//             (`__m.threw`, `__m.errorName`), so the cell itself never fails on one.
//   check     a cell body: observes and returns {ok, outcome}, the exact post-state the requested transition produces
//             from the pre-state (an insertion is the pre-state's selection replaced by the text, not one more occurrence
//             of it). An outcome case whose act threw fails whatever the check reads (./matrix-cells.mjs). The select-all,
//             setValue and selectText field cases also record `outcome.selection` (./matrix-text.mjs selectionEvidence:
//             lengths and hashes against the prepare's reading, `__m.seen`), so a row that did nothing reads apart from a
//             partial selection or an insertion.
//   keys      the key names the act sends: the act is a key cell, sent only under the key guard.
//   expect    'outcome' or 'refusal'.
//   refusal   for a refusal: the vendor's sentence the engine must answer (cua's engine carries the vendor's), matched in
//             the error's message; any other error (a transport failure, another refusal) fails the case, and the
//             watched state must be unchanged.
// The scenes' methods with no meaningful target are listed in NOT_APPLICABLE with the reason, so the method table says
// so on both engines rather than leaving the cell out.
import {SCENES, textEditDocument} from '../repl-parity/scenes-mac.mjs';

export const METHODS = Object.freeze(['getAXState', 'listApps', 'click', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText']);
// The facade's names against the engine's (the summary prints the engine's, the spec's 11).
export const ENGINE_METHOD = Object.freeze({getAXState: 'get_app_state', listApps: 'list_apps', click: 'click', drag: 'drag', paste: 'paste',
  performSecondaryAction: 'perform_secondary_action', pressKey: 'press_key', scroll: 'scroll', selectText: 'select_text', setValue: 'set_value', typeText: 'type_text'});
// The matrix's targets: the four scenes, TextEdit's Open panel (served out of process) and the windowless app.
export const TARGETS = Object.freeze(['textedit', 'finder', 'chrome', 'electron', 'openPanel', 'windowless']);
// The scene each target drives (the Open panel is TextEdit's; the windowless app is no scene's).
export const SCENE_OF = Object.freeze({textedit: 'textedit', finder: 'finder', chrome: 'chrome', electron: 'electron', openPanel: 'textedit', windowless: null});
// The windowless app (./matrix-device.mjs WINDOWLESS builds and launches it).
export const WINDOWLESS_BUNDLE_ID = 'io.github.ssfskim.cua.fixture.windowless';

const j = JSON.stringify;
const DOCUMENT = textEditDocument().lines;
// What the cases type and paste: correctly spelled and capitalized sentences, so TextEdit's autocorrection has nothing
// to change, and none in any scene's fixed content.
export const TYPED = 'The quick brown fox jumps over the lazy dog.';
export const PASTED = 'Pack my box with five dozen liquor jugs.';
const INVALID_INDEX = 99999;
// The vendor's refusal sentences (native/engine carries them verbatim: ValueSetting.swift, TextSelection.swift,
// src/services/engine/render.mjs indexState, Skyshot.swift).
export const REFUSALS = Object.freeze({
  notSettable: 'Cannot set a value for an element that is not settable',
  notText: 'Cannot select text for an element that does not support a settable selected text range',
  invalidIndex: `${INVALID_INDEX} is an invalid element ID`,
  noWindow: '(noWindowsAvailable|timeoutReached)',
});

// ---- shared bodies --------------------------------------------------------------------------------------------------

const observed = `const ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};`;
const listApps = target => ({
  method: 'listApps', case: 'running', expect: 'outcome', prepare: 'return {ready: true};',
  act: '__m.apps = await cua.listApps({emit: false});',
  check: `const apps = Array.isArray(__m.apps) ? __m.apps : [];
const hit = apps.find(a => [a?.id, a?.bundleId, a?.bundleIdentifier].includes(${j(SCENES[SCENE_OF[target]].bundleId)}));
return {ok: Boolean(hit) && hit.isRunning !== false, outcome: {apps: apps.length, listed: Boolean(hit), running: hit ? hit.isRunning !== false : null}};`,
});
const tree = test => ({
  method: 'getAXState', case: 'tree', expect: 'outcome', prepare: 'return {ready: true};',
  act: '__m.ax = await __app.getAXState({emit: false, disableDiffing: true});',
  check: `const ax = __m.ax ?? "";
const facts = (${test})(ax);
return {ok: inFront(ax) && facts.ok, outcome: {inFront: inFront(ax), ...facts.outcome, elements: elementLines(ax).length}};`,
});
// A refusal: the act must throw the expected sentence, and the watched state (read the same way before and after)
// must be unchanged.
const refusal = ({method, kase, find, act, watch, sentence}) => ({
  method, case: kase, expect: 'refusal', refusal: sentence,
  prepare: `${observed}
const index = ${find};
if (index === null) return {ready: false, reason: "the case's element is not in the text"};
__m.index = index; __m.before = JSON.stringify(${watch});
return {ready: true};`,
  act,
  check: `const ax = await observe();
const unchanged = JSON.stringify(${watch}) === __m.before;
return {ok: refusedAs(${j(sentence)}) && unchanged, outcome: {refused: __m.threw !== null, expected: refusedAs(${j(sentence)}), unchanged, errorName: __m.errorName, message: __m.threw}};`,
});
// A text field put into a known pre-state: focused, holding `value` (when given), with `word` (once in it) selected.
// The focus is read before the selection and the selection after it: the renderer's trailer shows selected text instead
// of the focused element (src/services/engine/render.mjs trailer), so no one observation shows both. The value must be
// unchanged by the selection. -> the prepare body's lines, leaving `now` (the observation) and `index` (the field).
const selectedIn = ({find, value = null, word, focus = true}) => `${observed}
let now = ax, index = ${find};
if (index === null) return {ready: false, reason: "the field is not in the text"};
${focus ? `if (focusedIndexOf(now) !== index) { await __app.click(index); now = await observe(); }
if (focusedIndexOf(now) !== index) return {ready: false, reason: "the field could not be given the focus"};` : ''}
${value === null ? '' : `if (plain(valueOfIndex(now, index)) !== ${value}) { await __app.setValue(index, ${value}); now = await observe(); }`}
if (count(plain(valueOfIndex(now, index)), ${word}) !== 1) return {ready: false, reason: "the word to replace is not in the field once"};
const unselected = plain(valueOfIndex(now, index));
await __app.selectText(index, ${word}); now = await observe();
if (selectedTextOf(now) !== ${word}) return {ready: false, reason: "the word could not be selected in the field"};
if (plain(valueOfIndex(now, index)) !== unselected) return {ready: false, reason: "the field's value changed when the word was selected"};
__m.index = index; __m.word = ${word}; __m.before = unselected; __m.seen = fieldReading(now, index);`;
// The exact post-state of an insertion over a selection: the pre-state with the selected word replaced by the text.
const replaced = (find, text) => `const ax = await observe();
const after = plain(valueOfIndex(ax, ${find}));
const expected = __m.before.replace(__m.word, ${j(text)});
return {ok: after === expected, outcome: {exact: after === expected, inserted: count(after, ${j(text)}) - count(__m.before, ${j(text)})}};`;
// A field's text after a harness setValue of a fresh value (a nonce no earlier row wrote).
const freshValue = (find, stem) => `${observed}
const index = ${find};
if (index === null) return {ready: false, reason: "the field is not in the text"};
__m.index = index; __m.value = ${j(stem)} + " " + nonce(); __m.seen = fieldReading(ax, index);
if (plain(valueOfIndex(ax, index)) === __m.value) return {ready: false, reason: "the field already holds the value"};
return {ready: true};`;
const setExactly = find => `const ax = await observe();
const equal = plain(valueOfIndex(ax, ${find})) === __m.value;
return {ok: equal, outcome: {equal, selection: selectionEvidence(ax, ${find}, __m.seen)}};`;
// A drag across the lines of a text field, at points grounded in the scene's layout (window points, scaled into the
// screenshot's pixel space by the window's width) and verified before the drag: a harness click at each end must land
// in the field (it takes the focus, nothing is selected). The post-state: a selection spanning lines, part of the
// field's value, the value unchanged. `layout`: {window: [w, h] in points or null (TextEdit: fractions of the shot),
// from: [x, y], to: [x, y]} (points, or fractions when window is null).
const dragSelect = ({find, value = null, layout}) => ({
  method: 'drag', case: 'select', expect: 'outcome',
  prepare: `${observed}
let now = ax, index = ${find};
if (index === null) return {ready: false, reason: "the field is not in the text"};
${value === null ? '' : `if (plain(valueOfIndex(now, index)) !== ${value}) { await __app.setValue(index, ${value}); now = await observe(); }`}
let size = jpegSize(await __app.getScreenshot({emit: false}));
if (!size) return {ready: false, reason: "the screenshot's size could not be read"};
const layout = ${j(layout)};
let scale = null;
if (layout.window) {
  scale = size.width / layout.window[0];
  if (Math.abs(size.height / size.width - layout.window[1] / layout.window[0]) > 0.03) return {ready: false, reason: "the screenshot is not the scene window's shape"};
}
const at = p => (scale === null ? [Math.round(size.width * p[0]), Math.round(size.height * p[1])] : [Math.round(p[0] * scale), Math.round(p[1] * scale)]);
__m.from = at(layout.from); __m.to = at(layout.to);
for (const point of [__m.to, __m.from]) {
  await __app.click(point); now = await observe();
  if (focusedIndexOf(now) !== index || selectedTextOf(now)) return {ready: false, reason: "a point of the drag is not in the field"};
}
const again = jpegSize(await __app.getScreenshot({emit: false}));
if (!again || again.width !== size.width || again.height !== size.height) return {ready: false, reason: "the window changed size"};
__m.index = index; __m.before = plain(valueOfIndex(now, index));
return {ready: true};`,
  act: 'await __app.drag(__m.from, __m.to);',
  check: `const ax = await observe();
const selected = selectedTextOf(ax), value = plain(valueOfIndex(ax, ${find}));
const lines = typeof selected === "string" && selected.includes("\\n") && value.includes(plain(selected));
return {ok: lines && value === __m.before, outcome: {selected: typeof selected === "string", spansLines: lines, unchanged: value === __m.before}};`,
});

// ---- TextEdit -----------------------------------------------------------------------------------------------------------

const TEXT_AREA = 'indexOfPart(ax, "ID", "First Text View")';
const NOW_AREA = 'indexOfPart(now, "ID", "First Text View")';
const textedit = [
  tree(`ax => { const value = valueOfIndex(ax, ${TEXT_AREA}) ?? ""; return {ok: plain(value).includes(${j(DOCUMENT[0])}), outcome: {document: plain(value).includes(${j(DOCUMENT[0])})}}; }`),
  listApps('textedit'),
  // A synthesized click (the text view advertises no action) from a selection it must collapse.
  {method: 'click', case: 'element', expect: 'outcome',
    prepare: `${observed}
let now = ax;
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
await __app.selectText(index, ${j(DOCUMENT[41])}); now = await observe();
if (selectedTextOf(now) !== ${j(DOCUMENT[41])}) return {ready: false, reason: "a line could not be selected first"};
__m.index = index; __m.before = plain(valueOfIndex(now, index)); return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const collapsed = selectedTextOf(ax) === null, unchanged = plain(valueOfIndex(ax, ${TEXT_AREA})) === __m.before;
return {ok: collapsed && unchanged, outcome: {collapsed, unchanged}};`},
  // An advertised action (the format bar's checkbox): align center checked; from align left when it already is.
  {method: 'click', case: 'control', expect: 'outcome',
    prepare: `${observed}
let now = ax, index = indexOfPart(now, "Description", "align center");
if (index === null) return {ready: false, reason: "the align center control is not in the text"};
if (valueOfIndex(now, index) === "1") { await __app.click(indexOfPart(now, "Description", "align left")); now = await observe(); index = indexOfPart(now, "Description", "align center"); }
if (valueOfIndex(now, index) !== "0") return {ready: false, reason: "align center could not be unchecked first"};
__m.index = index; return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const value = valueOfIndex(ax, indexOfPart(ax, "Description", "align center"));
return {ok: value === "1", outcome: {checked: value === "1"}};`},
  {method: 'typeText', case: 'replace', expect: 'outcome', keys: ['typeText'],
    prepare: `${selectedIn({find: TEXT_AREA, word: j(DOCUMENT[6])})}\nreturn {ready: true};`, act: `await __app.typeText(${j(TYPED)});`, check: replaced(TEXT_AREA, TYPED)},
  {method: 'pressKey', case: 'selectAll', expect: 'outcome', keys: ['super+a'],
    prepare: `${selectedIn({find: TEXT_AREA, word: j(DOCUMENT[4])})}\nreturn {ready: true};`, act: 'await __app.pressKey("super+a");',
    check: `const ax = await observe();
const selected = selectedTextOf(ax), value = valueOfIndex(ax, ${TEXT_AREA});
const whole = typeof selected === "string" && plain(selected).trim() === plain(value).trim();
return {ok: whole, outcome: {selected: typeof selected === "string", whole, selection: selectionEvidence(ax, ${TEXT_AREA}, __m.seen)}};`},
  {method: 'selectText', case: 'line', expect: 'outcome',
    prepare: `${observed}
let now = ax;
const index = ${TEXT_AREA};
if (index === null || count(plain(valueOfIndex(now, index)), ${j(DOCUMENT[4])}) !== 1) return {ready: false, reason: "the line is not in the document once"};
if (selectedTextOf(now) === ${j(DOCUMENT[4])}) { await __app.selectText(index, ${j(DOCUMENT[5])}); now = await observe(); }
if (selectedTextOf(now) === ${j(DOCUMENT[4])}) return {ready: false, reason: "the line was already selected"};
__m.index = index; __m.seen = fieldReading(now, index); return {ready: true};`,
    act: `await __app.selectText(__m.index, ${j(DOCUMENT[4])});`,
    check: `const ax = await observe();
return {ok: selectedTextOf(ax) === ${j(DOCUMENT[4])}, outcome: {selected: selectedTextOf(ax) === ${j(DOCUMENT[4])}, selection: selectionEvidence(ax, ${TEXT_AREA}, __m.seen)}};`},
  {method: 'paste', case: 'replace', expect: 'outcome', keys: ['paste'],
    prepare: `${selectedIn({find: TEXT_AREA, word: j(DOCUMENT[8])})}\nreturn {ready: true};`, act: `await __app.paste(${j(PASTED)});`, check: replaced(TEXT_AREA, PASTED)},
  // A settable value written whole: the scene's lines and a fresh last line, so the cases after it (and the next
  // regime) find their lines again, and a second write is never already in place.
  {method: 'setValue', case: 'document', expect: 'outcome',
    prepare: `${observed}
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
__m.index = index; __m.value = ${j(DOCUMENT.join('\n'))} + "\\ncua matrix set " + nonce(); __m.seen = fieldReading(ax, index);
if (plain(valueOfIndex(ax, index)).trimEnd() === __m.value) return {ready: false, reason: "the document already holds the value"};
return {ready: true};`,
    act: 'await __app.setValue(__m.index, __m.value);',
    check: `const ax = await observe();
const equal = plain(valueOfIndex(ax, ${TEXT_AREA})).trimEnd() === __m.value;
return {ok: equal, outcome: {equal, selection: selectionEvidence(ax, ${TEXT_AREA}, __m.seen)}};`},
  ...['scroll', 'performSecondaryAction'].map(method => ({method, case: 'down', expect: 'outcome',
    prepare: `${observed}
let now = ax;
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
let before = scrollBarValueBeside(now, index);
if (before !== null && before > 0.5) { await __app.scroll(index, "up", 20); now = await observe(); before = scrollBarValueBeside(now, ${NOW_AREA}); }
if (before === null || before > 0.5) return {ready: false, reason: "the vertical scroll bar is not readable at the document's top half"};
__m.index = index; __m.area = parentIndexOf(now, index); __m.before = before;
return {ready: true};`,
    act: method === 'scroll' ? 'await __app.scroll(__m.index, "down", 1);' : 'await __app.performSecondaryAction(__m.area, "Scroll Down");',
    check: `const ax = await observe();
const after = scrollBarValueBeside(ax, ${TEXT_AREA});
return {ok: after !== null && after > __m.before, outcome: {moved: after !== null && after > __m.before}};`})),
  // Fractions of the document window's screenshot, inside its text view whatever TextEdit's window size.
  dragSelect({find: TEXT_AREA, layout: {window: null, from: [0.2, 0.45], to: [0.7, 0.62]}}),
  refusal({method: 'selectText', kase: 'notText', find: 'indexOfPart(ax, "Description", "bold")', act: 'await __app.selectText(__m.index, "bold");',
    watch: `[selectedTextOf(ax), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.notText}),
  refusal({method: 'setValue', kase: 'notSettable', find: 'indexOfPart(ax, "Description", "text color")', act: 'await __app.setValue(__m.index, "x");',
    watch: `[valueOfIndex(ax, indexOfPart(ax, "Description", "text color")), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.notSettable}),
  refusal({method: 'click', kase: 'invalidIndex', find: TEXT_AREA, act: `await __app.click(${INVALID_INDEX});`,
    watch: `[selectedTextOf(ax), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.invalidIndex}),
];

// ---- TextEdit's Open panel (served out of process; opened by the run's ⌘O, ./run.mjs) ----------------------------------

const openPanel = [
  {method: 'getAXState', case: 'panel', expect: 'outcome', prepare: 'return {ready: true};',
    act: '__m.ax = await __app.getAXState({emit: false, disableDiffing: true});',
    check: 'const ax = __m.ax ?? "";\nreturn {ok: panel(ax), outcome: {panel: panel(ax), elements: elementLines(ax).length}};'},
  {method: 'click', case: 'cancel', expect: 'outcome',
    prepare: `const ax = await observe();
if (!panel(ax)) return {ready: false, reason: "the Open panel is not the app's front window"};
const index = indexOfTarget(ax, "Cancel") ?? indexOfTarget(ax, "취소");
if (index === null) return {ready: false, reason: "the panel's Cancel button is not in the text"};
__m.index = index; return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `let ax = await observe();
for (const end = Date.now() + 5000; panel(ax) && Date.now() < end;) ax = await observe();
return {ok: !panel(ax) && inFront(ax), outcome: {closed: !panel(ax), documentInFront: inFront(ax)}};`},
];

// ---- Finder -------------------------------------------------------------------------------------------------------------

const LIST = 'indexOfPart(ax, "ID", "ListView")';
const FILE = n => `scene-file-${String(n).padStart(3, '0')}`;
// The rows a case selects must be in the text's visible subset (a list scrolled down is scrolled back up first), and the
// row the case must select must not be selected already (a harness click on another row's cell when it is).
const rowPrepare = (target, {from = null} = {}) => `${observed}
let now = ax;
if (rowIndexOfName(now, ${j(target)}) === null || ${from === null ? 'false' : `rowIndexOfName(now, ${j(from)}) === null`}) { const list = indexOfPart(now, "ID", "ListView"); if (list !== null) { await __app.scroll(list, "up", 20); now = await observe(); } }
if (rowIndexOfName(now, ${j(target)}) === null) return {ready: false, reason: "the row is not in the list's visible subset"};
const only = name => { const s = selectedIndexesOf(now); return s.length === 1 && s[0] === rowIndexOfName(now, name); };
const start = ${j(from ?? FILE(1))};
if (!only(start)) { const cell = indexOfRowCell(now, start); if (cell !== null) { await __app.click(cell); now = await observe(); } }
if (!only(start) || only(${j(target)})) return {ready: false, reason: "the list's selection could not be set to the starting row"};
__m.cell = indexOfRowCell(now, ${j(target)});
return {ready: true};`;
const selectedRow = name => `const ax = await observe();
const row = rowIndexOfName(ax, ${j(name)}), selected = selectedIndexesOf(ax);
const only = row !== null && selected.length === 1 && selected[0] === row;
return {ok: only, outcome: {rowFound: row !== null, selected: selected.length, only}};`;
const finder = [
  tree(`ax => { const list = ${LIST}; return {ok: list !== null, outcome: {list: list !== null}}; }`),
  listApps('finder'),
  {method: 'click', case: 'row', expect: 'outcome', prepare: rowPrepare(FILE(5)),
    act: 'if (__m.cell === null) throw new Error("the row has no cell beside its name"); await __app.click(__m.cell);', check: selectedRow(FILE(5))},
  {method: 'pressKey', case: 'down', expect: 'outcome', keys: ['Down'], prepare: rowPrepare(FILE(6), {from: FILE(5)}), act: 'await __app.pressKey("Down");', check: selectedRow(FILE(6))},
  // Type-select on the run's list (never the toolbar's search field, which would list the owner's files).
  {method: 'typeText', case: 'typeSelect', expect: 'outcome', keys: ['typeText'], prepare: rowPrepare(FILE(12)), act: `await __app.typeText(${j(FILE(12))});`, check: selectedRow(FILE(12))},
  refusal({method: 'selectText', kase: 'notText', find: `rowIndexOfName(ax, ${j(FILE(1))})`, act: 'await __app.selectText(__m.index, "scene");',
    watch: 'selectedIndexesOf(ax)', sentence: REFUSALS.notText}),
  ...['scroll', 'performSecondaryAction'].map(method => ({method, case: 'down', expect: 'outcome',
    prepare: `${observed}
let now = ax, list = ${LIST};
if (list === null) return {ready: false, reason: "the list is not in the text"};
if ((showingOf(now, list)?.from ?? 0) > 0) { await __app.scroll(list, "up", 20); now = await observe(); list = indexOfPart(now, "ID", "ListView"); }
const shown = showingOf(now, list);
if (!shown || shown.from !== 0) return {ready: false, reason: "the list's visible range is not readable at its top"};
__m.list = list; __m.area = parentIndexOf(now, list); __m.before = shown.from;
return {ready: true};`,
    act: method === 'scroll' ? 'await __app.scroll(__m.list, "down", 1);' : 'await __app.performSecondaryAction(__m.area, "Scroll Down");',
    check: `const ax = await observe();
const shown = showingOf(ax, ${LIST});
return {ok: shown !== null && shown.from > __m.before, outcome: {moved: shown !== null && shown.from > __m.before}};`})),
];

// ---- Chrome for Testing's scene page ------------------------------------------------------------------------------------

const named = name => `indexOfTarget(ax, ${j(name)})`;
const statusText = (container, pattern) => `elementLines(ax).filter(l => parentIndexOf(ax, l.index) === ${container}).map(l => l.content).find(c => ${pattern}.test(c)) ?? null`;
// The text fields' known contents for the replacing and dragging cases: lines whose words occur once each.
const FIELD_LINES = ['alpha one', 'bravo two', 'charlie three', 'delta four', 'echo five', 'foxtrot six', 'golf seven', 'hotel eight'];
const FIELD_VALUE = j(FIELD_LINES.join('\n'));
// A web field's selectText: the field given a fresh text holding "matrix" once, which the act selects.
const selectMatrix = (kase, name) => ({method: 'selectText', case: kase, expect: 'outcome',
  prepare: `${observed}
let now = ax, index = ${named(name)};
if (index === null) return {ready: false, reason: "the field is not in the text"};
await __app.setValue(index, "cua select " + nonce() + " matrix"); now = await observe(); index = indexOfTarget(now, ${j(name)});
if (count(plain(valueOfIndex(now, index)), "matrix") !== 1 || selectedTextOf(now) === "matrix") return {ready: false, reason: "the field could not be given its text first"};
__m.index = index; __m.seen = fieldReading(now, index); return {ready: true};`,
  act: 'await __app.selectText(__m.index, "matrix");',
  check: `const ax = await observe();
return {ok: selectedTextOf(ax) === "matrix", outcome: {selected: selectedTextOf(ax) === "matrix", selection: selectionEvidence(ax, ${named(name)}, __m.seen)}};`,
});
const chrome = [
  tree(`ax => { const page = ${named('Scene notes')} !== null && ${named('Apply')} !== null; return {ok: page, outcome: {page}}; }`),
  listApps('chrome'),
  {method: 'click', case: 'checkbox', expect: 'outcome',
    prepare: `${observed}
const index = ${named('Scene option')};
if (index === null || !["0", "1"].includes(valueOfIndex(ax, index))) return {ready: false, reason: "the checkbox or its value is not in the text"};
__m.index = index; __m.before = valueOfIndex(ax, index); return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const after = valueOfIndex(ax, ${named('Scene option')});
const toggled = after === (__m.before === "1" ? "0" : "1");
return {ok: toggled, outcome: {toggled}};`},
  {method: 'typeText', case: 'replace', expect: 'outcome', keys: ['typeText'],
    prepare: `${selectedIn({find: named('Scene notes'), value: FIELD_VALUE, word: j('delta')})}\nreturn {ready: true};`, act: `await __app.typeText(${j(TYPED)});`, check: replaced(named('Scene notes'), TYPED)},
  {method: 'pressKey', case: 'tab', expect: 'outcome', keys: ['Tab'],
    prepare: `${observed}
let now = ax;
const index = ${named('Scene notes')};
if (index === null) return {ready: false, reason: "the field is not in the text"};
if (focusedIndexOf(now) !== index) { await __app.click(index); now = await observe(); }
if (focusedIndexOf(now) !== index) return {ready: false, reason: "the field could not be given the focus"};
return {ready: true};`,
    act: 'await __app.pressKey("Tab");',
    check: `const ax = await observe();
const moved = focusedIndexOf(ax) === ${named('Scene name')};
return {ok: moved, outcome: {moved}};`},
  {method: 'setValue', case: 'name', expect: 'outcome', prepare: freshValue(named('Scene name'), 'cua matrix set'), act: 'await __app.setValue(__m.index, __m.value);', check: setExactly(named('Scene name'))},
  selectMatrix('name', 'Scene name'),
  {method: 'paste', case: 'replace', expect: 'outcome', keys: ['paste'],
    prepare: `${selectedIn({find: named('Scene notes'), value: FIELD_VALUE, word: j('foxtrot')})}\nreturn {ready: true};`, act: `await __app.paste(${j(PASTED)});`, check: replaced(named('Scene notes'), PASTED)},
  // Apply writes what the name field holds into the status line: a fresh name, which no earlier row applied.
  {method: 'click', case: 'apply', expect: 'outcome',
    prepare: `${observed}
let now = ax;
const name = "cua apply " + nonce();
await __app.setValue(${named('Scene name')}, name); now = await observe();
if (valueOfIndex(now, indexOfTarget(now, "Scene name")) !== name) return {ready: false, reason: "the name field could not be given a fresh name"};
__m.index = indexOfTarget(now, "Apply"); __m.name = name;
return __m.index === null ? {ready: false, reason: "the button is not in the text"} : {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const status = ${statusText(named('Scene status'), '/Applied: /')};
const applied = typeof status === "string" && status.endsWith("Applied: " + __m.name);
return {ok: applied, outcome: {applied}};`},
  // The page in its 1000 x 760 window: the notes field's second to fifth lines, below the toolbar, heading and margins.
  dragSelect({find: named('Scene notes'), value: FIELD_VALUE, layout: {window: [1000, 760], from: [24, 192], to: [200, 237]}}),
  refusal({method: 'setValue', kase: 'notSettable', find: named('Apply'), act: 'await __app.setValue(__m.index, "x");', watch: `[valueOfIndex(ax, ${named('Scene name')}), focusedIndexOf(ax)]`,
    sentence: REFUSALS.notSettable}),
  refusal({method: 'selectText', kase: 'notText', find: named('Scene option'), act: 'await __app.selectText(__m.index, "Scene");', watch: `[valueOfIndex(ax, ${named('Scene option')}), selectedTextOf(ax)]`,
    sentence: REFUSALS.notText}),
];

// ---- The Electron fixture -----------------------------------------------------------------------------------------------

const pressed = `(() => { const status = ${statusText(named('Fixture status'), '/Pressed \\d+ times?/')}; const m = /Pressed (\\d+) times?/.exec(status ?? ""); return m ? Number(m[1]) : null; })()`;
const electron = [
  tree(`ax => ({ok: ${named('Fixture text')} !== null, outcome: {fixture: ${named('Fixture text')} !== null}})`),
  listApps('electron'),
  {method: 'click', case: 'button', expect: 'outcome',
    prepare: `${observed}
const index = ${named('Fixture button')}, count = ${pressed};
if (index === null || count === null) return {ready: false, reason: "the button or its status is not in the text"};
__m.index = index; __m.before = count; return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const after = ${pressed};
return {ok: after === __m.before + 1, outcome: {pressedOnce: after === __m.before + 1}};`},
  {method: 'typeText', case: 'replace', expect: 'outcome', keys: ['typeText'],
    prepare: `${selectedIn({find: named('Fixture text'), value: FIELD_VALUE, word: j('charlie')})}\nreturn {ready: true};`, act: `await __app.typeText(${j(TYPED)});`, check: replaced(named('Fixture text'), TYPED)},
  {method: 'pressKey', case: 'tab', expect: 'outcome', keys: ['Tab'],
    prepare: `${observed}
let now = ax;
const index = ${named('Fixture text')};
if (index === null) return {ready: false, reason: "the field is not in the text"};
if (focusedIndexOf(now) !== index) { await __app.click(index); now = await observe(); }
if (focusedIndexOf(now) !== index) return {ready: false, reason: "the field could not be given the focus"};
return {ready: true};`,
    act: 'await __app.pressKey("Tab");',
    check: `const ax = await observe();
const moved = focusedIndexOf(ax) === ${named('Fixture list')};
return {ok: moved, outcome: {moved}};`},
  {method: 'setValue', case: 'text', expect: 'outcome', prepare: freshValue(named('Fixture text'), 'cua matrix set'), act: 'await __app.setValue(__m.index, __m.value);', check: setExactly(named('Fixture text'))},
  selectMatrix('text', 'Fixture text'),
  {method: 'paste', case: 'replace', expect: 'outcome', keys: ['paste'],
    prepare: `${selectedIn({find: named('Fixture text'), value: FIELD_VALUE, word: j('golf')})}\nreturn {ready: true};`, act: `await __app.paste(${j(PASTED)});`, check: replaced(named('Fixture text'), PASTED)},
  // The fixture in its 720 x 560 window: the text field's second to fourth lines, below the 28-point title bar and the
  // body's 16-pixel margin (fixtures/electron/fixture.css).
  dragSelect({find: named('Fixture text'), value: FIELD_VALUE, layout: {window: [720, 560], from: [30, 69], to: [300, 99]}}),
  refusal({method: 'setValue', kase: 'notSettable', find: named('Fixture button'), act: 'await __app.setValue(__m.index, "x");', watch: `[${pressed}, valueOfIndex(ax, ${named('Fixture text')})]`,
    sentence: REFUSALS.notSettable}),
];

// ---- The windowless app (the "app with no window" refusal) ------------------------------------------------------------

// The run launched it in the background with no window (./matrix-device.mjs windowless up); binding it must be refused
// with the vendor's sentence and bind nothing, and (judged by the oracle) without activating it.
const windowless = [
  {method: 'getAXState', case: 'noWindow', expect: 'refusal', refusal: REFUSALS.noWindow,
    prepare: 'return {ready: true};',
    act: `__m.bound = await cua.getApp(${j(WINDOWLESS_BUNDLE_ID)});`,
    check: `const unbound = __m.bound === undefined;
return {ok: refusedAs(${j(REFUSALS.noWindow)}) && unbound, outcome: {refused: __m.threw !== null, expected: refusedAs(${j(REFUSALS.noWindow)}), unbound, errorName: __m.errorName, message: __m.threw}};`},
];

export const CASES = Object.freeze({textedit, finder, chrome, electron, openPanel, windowless});
// Each text scene's typing field, as an expression over the observation `ax` (the cases above find them so): TextEdit's
// document, the Chrome page's textarea and the Electron fixture's text field. The probe cells and the Unicode matrix
// (./probe-plan.mjs, ./unicode-plan.mjs) type into them.
// TextEdit's typing field by its identifier, whether or not it holds text: emptied, its line's lone part is the bare
// identifier (./matrix-text.mjs indexOfId), which TEXT_AREA's labelled part no longer matches.
export const TEXT_FIELDS = Object.freeze({textedit: 'indexOfId(ax, "First Text View")', chrome: named('Scene notes'), electron: named('Fixture text')});

// What a target has no meaningful case for, on both engines alike, with the reason the method table prints.
export const NOT_APPLICABLE = Object.freeze({
  finder: {
    setValue: 'a value written into a file\'s name field renames a run file, and the scene\'s other cases and targets read those names',
    drag: 'a drag in Finder\'s list moves run files or starts a rubber band whose outcome follows the pointer\'s path',
    paste: 'Finder pastes files, not text, into a folder',
  },
  chrome: {
    scroll: 'the scene page fits its window: nothing to scroll',
    performSecondaryAction: 'no control on the scene page advertises a secondary action (the window\'s Raise would reorder it over the user\'s)',
  },
  electron: {
    scroll: 'the fixture\'s list of six fits its box: nothing to scroll',
    performSecondaryAction: 'no control in the fixture advertises a secondary action',
  },
  openPanel: Object.fromEntries(['listApps', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText']
    .map(method => [method, 'the Open panel is observed and its Cancel clicked; it lists the owner\'s files, so nothing is typed, selected or scrolled in it'])),
  windowless: Object.fromEntries(METHODS.filter(m => m !== 'getAXState')
    .map(method => [method, 'an app with no window refuses its observation, so no element exists for any other method'])),
});

// What the matrix does not run on a shared Mac, offered to the owner as an option: never missing proof and never a
// blocker (./summary.mjs lists them apart from the verdict). TextEdit's launch: the engine launches it with no
// arguments, so its first observation, whose screenshot the engine captures, would show either the owner's windows
// restored from saved state or, with nothing to restore, TextEdit's iCloud Open panel listing the owner's files; an
// isolated launch needs TextEdit's state changed, which the run does not do. The launch path is app-agnostic, and the
// Electron fixture's launch row (its own scratch user-data path) proves it.
export const OWNER_OPTIONS = Object.freeze([
  {section: 'launch', id: 'textedit/background/launch@finder', option: 'TextEdit launch under the engine: provable in a scratch macOS user if wanted',
    reason: 'on the shared Mac its first observation\'s screenshot would capture the owner\'s restored TextEdit windows or, with none to restore, TextEdit\'s iCloud Open panel; isolating it would change the owner\'s TextEdit state'},
]);

// A row's id: `<target>/<regime>/<method>.<case>`, and in the background regime `@<user>` after it (TextEdit and Finder
// are each driven behind two user windows).
export const caseId = (target, regime, c, user = null) => `${target}/${regime}/${c.method}.${c.case}${user ? `@${user}` : ''}`;
