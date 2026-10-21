// The method matrix's plan (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 4):
// the 11 facade methods on the four scenes and TextEdit's Open panel, each a case judged by its outcome, read back
// through getAXState in the same grammar on either engine (./matrix-text.mjs). Pure data: ./matrix-cells.mjs turns a case
// into its cells and the run (./run.mjs) sends them, in both regimes.
//
// A case: {method, case, prepare, act, check, keys?, checkKeys?, expect}
//   method    the facade's method (METHODS: list_apps is listApps, get_app_state is getAXState)
//   prepare   a cell body: observes, finds the case's element by name in the text, may put the scene into the case's
//             precondition with a harness action of its own (clicking the field it types into, scrolling a list back
//             up), and returns {ready: true} or {ready: false, reason}. A case that is not ready sends nothing more and
//             its row is invalid, never a fail: a precondition that does not hold says nothing of the engine.
//   act       the one facade call the row measures (its in-cell time is the method's), on `__m` (prepare's state) and
//             `__app` (the scene's bound app); a refusal is caught and kept, so the cell itself never fails on one.
//   check     a cell body: observes and returns {ok, outcome}, judged against the fixture's ground truth (the scene's
//             known content and the state prepare read), never against the vendor: in the frontmost regime the vendor's
//             outcome is compared at `compare`, sample for sample.
//   keys      the key names the act sends: the act is a key cell, sent only under the key guard (the driven scene's
//             process in front, or in the background regime the run's user window, scripts/accept/key-guard.mjs).
//   checkKeys the key names the check sends (click.element reads the caret by selecting to the line's start).
//   expect    'outcome' (the action's effect) or 'refusal' (the engine refuses: a sentence, nothing changed).
// The scenes' methods with no meaningful target are listed in NOT_APPLICABLE with the reason, so the method table says
// so on both engines rather than leaving the cell out.
import {SCENES, textEditDocument} from '../repl-parity/scenes-mac.mjs';

export const METHODS = Object.freeze(['getAXState', 'listApps', 'click', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText']);
// The facade's names against the engine's (the summary prints the engine's, the spec's 11).
export const ENGINE_METHOD = Object.freeze({getAXState: 'get_app_state', listApps: 'list_apps', click: 'click', drag: 'drag', paste: 'paste',
  performSecondaryAction: 'perform_secondary_action', pressKey: 'press_key', scroll: 'scroll', selectText: 'select_text', setValue: 'set_value', typeText: 'type_text'});
// The matrix's targets: the four scenes and TextEdit's Open panel, served out of process (an out-of-process target).
export const TARGETS = Object.freeze(['textedit', 'finder', 'chrome', 'electron', 'openPanel']);
// The scene each target drives (the Open panel is TextEdit's).
export const SCENE_OF = Object.freeze({textedit: 'textedit', finder: 'finder', chrome: 'chrome', electron: 'electron', openPanel: 'textedit'});

const j = JSON.stringify;
const DOCUMENT = textEditDocument().lines;
// What the cases put into the scenes: each a string none of the scenes' fixed content holds.
export const TYPED = 'cua matrix typed';
export const PASTED = 'cua matrix pasted';
export const SET = 'cua matrix set';
const INVALID_INDEX = 99999;

// Shared bodies.
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
// A refusal: the act throws a sentence and the element the case names, and the watched value, are unchanged.
const refusal = ({method, kase, find, act, watch}) => ({
  method, case: kase, expect: 'refusal',
  prepare: `${observed}
const index = ${find};
if (index === null) return {ready: false, reason: "the case's element is not in the text"};
__m.index = index; __m.before = ${watch};
return {ready: true};`,
  act,
  check: `const ax = await observe();
const unchanged = ${watch} === __m.before;
return {ok: __m.threw !== null && unchanged, outcome: {refused: __m.threw !== null, unchanged, message: __m.threw}};`,
});
// The field a key or paste case types into, given the focus first when the trailer names another (a harness click on
// it: Chromium moves the focus to whatever was clicked last).
const focused = (find, then = '') => `${observed}
const index = ${find};
if (index === null) return {ready: false, reason: "the field is not in the text"};
let now = ax;
if (focusedIndexOf(now) !== index) { await __app.click(index); now = await observe(); }
if (focusedIndexOf(now) !== index) return {ready: false, reason: "the field could not be given the focus"};
__m.index = index; __m.before = valueOfIndex(now, index) ?? "";
${then}return {ready: true};`;
const insertion = (text, find) => `const ax = await observe();
const after = valueOfIndex(ax, ${find}) ?? "";
const added = count(plain(after), ${j(text)}) - count(plain(__m.before), ${j(text)});
return {ok: added === 1, outcome: {added}};`;

// ---- TextEdit ---------------------------------------------------------------------------------------------------------

const TEXT_AREA = 'indexOfPart(ax, "ID", "First Text View")';
// The run's document as the setValue case writes it back: the scene's lines and one line more, so the later cases (and
// the next regime) find the lines they name again.
const SET_DOCUMENT = `${DOCUMENT.join('\n')}\n${SET}`;
const textedit = [
  tree(`ax => { const value = valueOfIndex(ax, ${TEXT_AREA}) ?? ""; return {ok: plain(value).includes(${j(DOCUMENT[0])}), outcome: {document: plain(value).includes(${j(DOCUMENT[0])})}}; }`),
  listApps('textedit'),
  // A synthesized click (the text view advertises no action): the caret lands on a line, read by selecting to its start.
  {method: 'click', case: 'element', expect: 'outcome', checkKeys: ['shift+super+Left'],
    prepare: `${observed}
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
__m.index = index; return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `await __app.pressKey("shift+super+Left");
const ax = await observe();
const selected = selectedTextOf(ax), lines = plain(valueOfIndex(ax, ${TEXT_AREA})).split("\\n");
const onALine = typeof selected === "string" && selected.length > 0 && !selected.includes("\\n") && lines.some(line => line.startsWith(plain(selected)));
return {ok: onALine, outcome: {selected: typeof selected === "string", onALine}};`},
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
  {method: 'typeText', case: 'insert', expect: 'outcome', keys: ['typeText'],
    prepare: focused(TEXT_AREA), act: `await __app.typeText(${j(` ${TYPED}`)});`, check: insertion(TYPED, TEXT_AREA)},
  {method: 'pressKey', case: 'selectAll', expect: 'outcome', keys: ['super+a'],
    prepare: focused(TEXT_AREA), act: 'await __app.pressKey("super+a");',
    check: `const ax = await observe();
const selected = selectedTextOf(ax), value = valueOfIndex(ax, ${TEXT_AREA});
const whole = typeof selected === "string" && plain(selected).trim() === plain(value).trim();
return {ok: whole, outcome: {selected: typeof selected === "string", whole}};`},
  {method: 'selectText', case: 'line', expect: 'outcome',
    prepare: `${observed}
const index = ${TEXT_AREA};
if (index === null || count(plain(valueOfIndex(ax, index)), ${j(DOCUMENT[3])}) !== 1) return {ready: false, reason: "the line is not in the document once"};
__m.index = index; return {ready: true};`,
    act: `await __app.selectText(__m.index, ${j(DOCUMENT[3])});`,
    check: `const ax = await observe();
return {ok: selectedTextOf(ax) === ${j(DOCUMENT[3])}, outcome: {selected: selectedTextOf(ax) === ${j(DOCUMENT[3])}}};`},
  {method: 'paste', case: 'insert', expect: 'outcome', keys: ['paste'],
    prepare: focused(TEXT_AREA), act: `await __app.paste(${j(` ${PASTED}`)});`, check: insertion(PASTED, TEXT_AREA)},
  // A settable value written whole: the scene's lines and one more, so the cases after it find their lines again.
  {method: 'setValue', case: 'document', expect: 'outcome',
    prepare: `${observed}
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
__m.index = index; return {ready: true};`,
    act: `await __app.setValue(__m.index, ${j(SET_DOCUMENT)});`,
    check: `const ax = await observe();
const equal = plain(valueOfIndex(ax, ${TEXT_AREA})).trimEnd() === ${j(SET_DOCUMENT)};
return {ok: equal, outcome: {equal}};`},
  ...['scroll', 'performSecondaryAction'].map(method => ({method, case: 'down', expect: 'outcome',
    prepare: `${observed}
let now = ax;
const index = ${TEXT_AREA};
if (index === null) return {ready: false, reason: "the document's text view is not in the text"};
let before = scrollBarValueBeside(now, index);
if (before !== null && before > 0.5) { await __app.scroll(index, "up", 20); now = await observe(); before = scrollBarValueBeside(now, index); }
if (before === null || before > 0.5) return {ready: false, reason: "the vertical scroll bar is not readable at the document's top half"};
__m.index = index; __m.area = parentIndexOf(now, index); __m.before = before;
return {ready: true};`,
    act: method === 'scroll' ? 'await __app.scroll(__m.index, "down", 1);' : 'await __app.performSecondaryAction(__m.area, "Scroll Down");',
    check: `const ax = await observe();
const after = scrollBarValueBeside(ax, ${TEXT_AREA});
return {ok: after !== null && after > __m.before, outcome: {moved: after !== null && after > __m.before}};`})),
  // A drag across the document's lines in the screenshot's pixel space (the coordinates every engine takes): a selection.
  {method: 'drag', case: 'select', expect: 'outcome',
    prepare: `${observed}
const shot = await __app.getScreenshot({emit: false});
const size = jpegSize(shot);
if (!size) return {ready: false, reason: "the screenshot's size could not be read"};
__m.from = [Math.round(size.width * 0.2), Math.round(size.height * 0.5)];
__m.to = [Math.round(size.width * 0.7), Math.round(size.height * 0.62)];
return {ready: true};`,
    act: 'await __app.drag(__m.from, __m.to);',
    check: `const ax = await observe();
const selected = selectedTextOf(ax), value = plain(valueOfIndex(ax, ${TEXT_AREA}));
const inDocument = typeof selected === "string" && selected.length > 0 && value.includes(plain(selected));
return {ok: inDocument, outcome: {selected: typeof selected === "string", inDocument}};`},
  refusal({method: 'selectText', kase: 'notText', find: 'indexOfPart(ax, "Description", "bold")', act: 'await __app.selectText(__m.index, "bold");',
    watch: `valueOfIndex(ax, ${TEXT_AREA})`}),
  refusal({method: 'setValue', kase: 'notSettable', find: 'indexOfPart(ax, "Description", "text color")', act: 'await __app.setValue(__m.index, "x");',
    watch: `valueOfIndex(ax, ${TEXT_AREA})`}),
  {method: 'click', case: 'invalidIndex', expect: 'refusal', prepare: `${observed}\nreturn {ready: true};`,
    act: `await __app.click(${INVALID_INDEX});`,
    check: `const named = typeof __m.threw === "string" && __m.threw.includes(${j(String(INVALID_INDEX))}) && /invalid element ID|no longer valid/i.test(__m.threw);
return {ok: named, outcome: {refused: __m.threw !== null, named, message: __m.threw}};`},
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

// ---- Finder -----------------------------------------------------------------------------------------------------------

const LIST = 'indexOfPart(ax, "ID", "ListView")';
const FILE = n => `scene-file-${String(n).padStart(3, '0')}`;
// The rows the cases select must be in the text's visible subset: a list scrolled down (by the scroll cases) is scrolled
// back up first.
const visibleRow = (name, then) => `${observed}
let now = ax;
if (rowIndexOfName(now, ${j(name)}) === null) { const list = indexOfPart(now, "ID", "ListView"); if (list !== null) { await __app.scroll(list, "up", 20); now = await observe(); } }
if (rowIndexOfName(now, ${j(name)}) === null) return {ready: false, reason: "the row is not in the list's visible subset"};
${then}`;
const selectedRow = name => `const ax = await observe();
const row = rowIndexOfName(ax, ${j(name)}), selected = selectedIndexesOf(ax);
const only = row !== null && selected.length === 1 && selected[0] === row;
return {ok: only, outcome: {rowFound: row !== null, selected: selected.length, only}};`;
const finder = [
  tree(`ax => { const list = ${LIST}; return {ok: list !== null, outcome: {list: list !== null}}; }`),
  listApps('finder'),
  {method: 'click', case: 'row', expect: 'outcome',
    prepare: visibleRow(FILE(5), `const index = indexOfRowCell(now, ${j(FILE(5))});
if (index === null) return {ready: false, reason: "the row has no cell beside its name"};
__m.index = index; return {ready: true};`),
    act: 'await __app.click(__m.index);', check: selectedRow(FILE(5))},
  {method: 'pressKey', case: 'down', expect: 'outcome', keys: ['Down'],
    prepare: visibleRow(FILE(6), `const row = rowIndexOfName(now, ${j(FILE(5))});
if (row === null || !(selectedIndexesOf(now).length === 1 && selectedIndexesOf(now)[0] === row)) { await __app.click(indexOfRowCell(now, ${j(FILE(5))})); now = await observe(); }
const selected = selectedIndexesOf(now);
if (!(selected.length === 1 && selected[0] === rowIndexOfName(now, ${j(FILE(5))}))) return {ready: false, reason: "the row above could not be selected first"};
return {ready: true};`),
    act: 'await __app.pressKey("Down");', check: selectedRow(FILE(6))},
  // Type-select on the run's list (never the toolbar's search field, which would list the owner's files).
  {method: 'typeText', case: 'typeSelect', expect: 'outcome', keys: ['typeText'],
    prepare: visibleRow(FILE(12), 'return {ready: true};'), act: `await __app.typeText(${j(FILE(12))});`, check: selectedRow(FILE(12))},
  refusal({method: 'selectText', kase: 'notText', find: `rowIndexOfName(ax, ${j(FILE(1))})`, act: 'await __app.selectText(__m.index, "scene");',
    watch: `JSON.stringify(selectedIndexesOf(ax))`}),
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

// ---- Chrome for Testing's scene page ----------------------------------------------------------------------------------

const named = name => `indexOfTarget(ax, ${j(name)})`;
const statusText = (container, pattern) => `elementLines(ax).filter(l => parentIndexOf(ax, l.index) === ${container}).map(l => l.content).find(c => ${pattern}.test(c)) ?? null`;
const chrome = [
  tree(`ax => { const page = ${named('Scene notes')} !== null && ${named('Apply')} !== null; return {ok: page, outcome: {page}}; }`),
  listApps('chrome'),
  {method: 'click', case: 'checkbox', expect: 'outcome',
    prepare: `${observed}
const index = ${named('Scene option')};
if (index === null) return {ready: false, reason: "the checkbox is not in the text"};
__m.index = index; __m.before = valueOfIndex(ax, index); return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const after = valueOfIndex(ax, ${named('Scene option')});
const toggled = ["0", "1"].includes(after) && after !== __m.before;
return {ok: toggled, outcome: {toggled}};`},
  {method: 'typeText', case: 'notes', expect: 'outcome', keys: ['typeText'], prepare: focused(named('Scene notes')), act: `await __app.typeText(${j(TYPED)});`,
    check: insertion(TYPED, named('Scene notes'))},
  {method: 'pressKey', case: 'tab', expect: 'outcome', keys: ['Tab'], prepare: focused(named('Scene notes')), act: 'await __app.pressKey("Tab");',
    check: `const ax = await observe();
const moved = focusedIndexOf(ax) === ${named('Scene name')};
return {ok: moved, outcome: {moved}};`},
  {method: 'setValue', case: 'name', expect: 'outcome',
    prepare: `${observed}\nconst index = ${named('Scene name')};\nif (index === null) return {ready: false, reason: "the field is not in the text"};\n__m.index = index; return {ready: true};`,
    act: `await __app.setValue(__m.index, ${j(SET)});`,
    check: `const ax = await observe();\nconst equal = valueOfIndex(ax, ${named('Scene name')}) === ${j(SET)};\nreturn {ok: equal, outcome: {equal}};`},
  {method: 'selectText', case: 'name', expect: 'outcome',
    prepare: `${observed}
let now = ax, index = ${named('Scene name')};
if (index === null) return {ready: false, reason: "the field is not in the text"};
if (!(valueOfIndex(now, index) ?? "").includes("matrix")) { await __app.setValue(index, ${j(SET)}); now = await observe(); index = indexOfTarget(now, "Scene name"); }
if (!(valueOfIndex(now, index) ?? "").includes("matrix")) return {ready: false, reason: "the field could not be given its text first"};
__m.index = index; return {ready: true};`,
    act: 'await __app.selectText(__m.index, "matrix");',
    check: 'const ax = await observe();\nreturn {ok: selectedTextOf(ax) === "matrix", outcome: {selected: selectedTextOf(ax) === "matrix"}};'},
  {method: 'paste', case: 'notes', expect: 'outcome', keys: ['paste'], prepare: focused(named('Scene notes')), act: `await __app.paste(${j(PASTED)});`,
    check: insertion(PASTED, named('Scene notes'))},
  // Apply writes what the name field holds into the status line: the click's outcome is the page's own.
  {method: 'click', case: 'apply', expect: 'outcome',
    prepare: `${observed}
const index = ${named('Apply')};
if (index === null) return {ready: false, reason: "the button is not in the text"};
let now = ax, name = valueOfIndex(now, ${named('Scene name')}) ?? "";
if (name === "") { await __app.setValue(${named('Scene name')}, ${j(SET)}); now = await observe(); name = valueOfIndex(now, indexOfTarget(now, "Scene name")) ?? ""; }
if (name === "") return {ready: false, reason: "the name field could not be given its text first"};
__m.index = indexOfTarget(now, "Apply"); __m.name = name; return {ready: true};`,
    act: 'await __app.click(__m.index);',
    check: `const ax = await observe();
const status = ${statusText(named('Scene status'), '/Applied: /')};
const applied = typeof status === "string" && status.endsWith("Applied: " + __m.name);
return {ok: applied, outcome: {applied}};`},
  refusal({method: 'setValue', kase: 'notSettable', find: named('Apply'), act: 'await __app.setValue(__m.index, "x");', watch: `valueOfIndex(ax, ${named('Scene name')})`}),
  refusal({method: 'selectText', kase: 'notText', find: named('Scene option'), act: 'await __app.selectText(__m.index, "Scene");', watch: `valueOfIndex(ax, ${named('Scene option')})`}),
];

// ---- The Electron fixture ---------------------------------------------------------------------------------------------

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
  {method: 'typeText', case: 'text', expect: 'outcome', keys: ['typeText'], prepare: focused(named('Fixture text')), act: `await __app.typeText(${j(TYPED)});`,
    check: insertion(TYPED, named('Fixture text'))},
  {method: 'pressKey', case: 'tab', expect: 'outcome', keys: ['Tab'], prepare: focused(named('Fixture text')), act: 'await __app.pressKey("Tab");',
    check: `const ax = await observe();
const moved = focusedIndexOf(ax) === ${named('Fixture list')};
return {ok: moved, outcome: {moved}};`},
  {method: 'setValue', case: 'text', expect: 'outcome',
    prepare: `${observed}\nconst index = ${named('Fixture text')};\nif (index === null) return {ready: false, reason: "the field is not in the text"};\n__m.index = index; return {ready: true};`,
    act: `await __app.setValue(__m.index, ${j(SET)});`,
    check: `const ax = await observe();\nconst equal = valueOfIndex(ax, ${named('Fixture text')}) === ${j(SET)};\nreturn {ok: equal, outcome: {equal}};`},
  {method: 'selectText', case: 'text', expect: 'outcome',
    prepare: `${observed}
let now = ax, index = ${named('Fixture text')};
if (index === null) return {ready: false, reason: "the field is not in the text"};
if (!(valueOfIndex(now, index) ?? "").includes("matrix")) { await __app.setValue(index, ${j(SET)}); now = await observe(); index = indexOfTarget(now, "Fixture text"); }
if (!(valueOfIndex(now, index) ?? "").includes("matrix")) return {ready: false, reason: "the field could not be given its text first"};
__m.index = index; return {ready: true};`,
    act: 'await __app.selectText(__m.index, "matrix");',
    check: 'const ax = await observe();\nreturn {ok: selectedTextOf(ax) === "matrix", outcome: {selected: selectedTextOf(ax) === "matrix"}};'},
  {method: 'paste', case: 'text', expect: 'outcome', keys: ['paste'], prepare: focused(named('Fixture text')), act: `await __app.paste(${j(PASTED)});`,
    check: insertion(PASTED, named('Fixture text'))},
  refusal({method: 'setValue', kase: 'notSettable', find: named('Fixture button'), act: 'await __app.setValue(__m.index, "x");', watch: pressed}),
];

export const CASES = Object.freeze({textedit, finder, chrome, electron, openPanel});

// What a scene has no meaningful target for, on both engines alike, with the reason the method table prints.
export const NOT_APPLICABLE = Object.freeze({
  finder: {
    setValue: 'a value written into a file\'s name field renames a run file, and the scene\'s other cases and targets read those names',
    drag: 'a drag in Finder\'s list moves run files or starts a rubber band whose outcome follows the pointer\'s path',
    paste: 'Finder pastes files, not text, into a folder',
  },
  chrome: {
    scroll: 'the scene page fits its window: nothing to scroll',
    drag: 'the scene page has no draggable control',
    performSecondaryAction: 'no control on the scene page advertises a secondary action (the window\'s Raise would reorder it over the user\'s)',
  },
  electron: {
    scroll: 'the fixture\'s list of six fits its box: nothing to scroll',
    drag: 'the fixture has no draggable control',
    performSecondaryAction: 'no control in the fixture advertises a secondary action',
  },
  openPanel: Object.fromEntries(['listApps', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText']
    .map(method => [method, 'the Open panel is observed and its Cancel clicked; it lists the owner\'s files, so nothing is typed, selected or scrolled in it'])),
});

// A row's id: `<target>/<regime>/<method>.<case>`.
export const caseId = (target, regime, c) => `${target}/${regime}/${c.method}.${c.case}`;
