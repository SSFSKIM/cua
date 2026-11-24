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
//             ready sends nothing more and its row is invalid, never a fail. Each row stands on its own: what an
//             earlier row left in a field that the prepare needs in a known state (a selection) is undone by a step the
//             prepare states (`__m.prepared`, the row's `prepared`), never inherited. A prepare that needs its field
//             focused leaves its reading in `__m.focus` (focusOn), and the row judges it (focusVerdict).
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
import {BACKGROUND_PAIRINGS, SCENES, textEditDocument} from '../repl-parity/scenes-mac.mjs';
import {POINTERDOWN_SWITCH} from './fixtures/electron-fixture.mjs';
import {POINTERDOWN} from './fixtures/scene-page.mjs';

export const METHODS = Object.freeze(['getAXState', 'listApps', 'click', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText']);
// The facade's names against the engine's (the summary prints the engine's, the spec's 11).
export const ENGINE_METHOD = Object.freeze({getAXState: 'get_app_state', listApps: 'list_apps', click: 'click', drag: 'drag', paste: 'paste',
  performSecondaryAction: 'perform_secondary_action', pressKey: 'press_key', scroll: 'scroll', selectText: 'select_text', setValue: 'set_value', typeText: 'type_text'});
// The matrix's targets: the four scenes, TextEdit's Open panel and Save sheet (both served out of process) and the
// windowless app.
export const TARGETS = Object.freeze(['textedit', 'finder', 'chrome', 'electron', 'openPanel', 'savePanel', 'windowless']);
// The scene each target drives (the panels are TextEdit's; the windowless app is no scene's).
export const SCENE_OF = Object.freeze({textedit: 'textedit', finder: 'finder', chrome: 'chrome', electron: 'electron', openPanel: 'textedit', savePanel: 'textedit', windowless: null});
// The panel targets: each opening of one is placed and closed by the harness (./panels.mjs), never measured as a scene.
export const PANEL_TARGETS = Object.freeze(['openPanel', 'savePanel']);
export const isPanelTarget = target => PANEL_TARGETS.includes(target);
// The windowless app (./matrix-device.mjs WINDOWLESS builds and launches it).
export const WINDOWLESS_BUNDLE_ID = 'io.github.ssfskim.cua.fixture.windowless';

const j = JSON.stringify;
const DOCUMENT = textEditDocument().lines;
// What the cases type and paste: correctly spelled and capitalized sentences, so TextEdit's autocorrection has nothing
// to change, and none in any scene's fixed content.
export const TYPED = 'The quick brown fox jumps over the lazy dog.';
export const PASTED = 'Pack my box with five dozen liquor jugs.';
const INVALID_INDEX = 99999;
// A refusal matched whole (`refusedAs` takes a regular expression's source): the sentence alone, or in the server
// error's envelope the vendor's helper and cua's service wrap it in (`Computer Use server error <code>: `).
const wholeRefusal = sentence => `^(?:Computer Use server error -?\\d+: )?${sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
// The vendor's refusal sentences (native/engine carries them verbatim: ValueSetting.swift, TextSelection.swift,
// src/services/engine/render.mjs indexState, Skyshot.swift).
export const REFUSALS = Object.freeze({
  notSettable: 'Cannot set a value for an element that is not settable',
  notText: 'Cannot select text for an element that does not support a settable selected text range',
  // #190: select_text's second refusal (F-helper-logic.md §16.2), after the settability check passed and no unique
  // match was found. Chromium answers a checkbox's selected text range settable, so this is the not-text refusal there.
  // The whole message, bare or in the server error's envelope: the sentence quoted inside another error is not it.
  textNotFound: wholeRefusal('Could not find the requested text to select in the element'),
  invalidIndex: `${INVALID_INDEX} is an invalid element ID`,
  noWindow: '(noWindowsAvailable|timeoutReached)',
});
// #354: cua's keyed typeText reads the focused field back, and a list's type-select has no text field to read, so cua
// answers `typeUnconfirmed` (its sentence names an element that is not a text field) once the keys are sent, where the
// vendor answers success. Concurrent use's typing into Finder's list (./probe-plan.mjs, its row judged by both landings)
// keeps that one answer as cua's expected difference, recorded in `__m.typeUnconfirmed`; any other error still fails it.
// Finder's type-select method case does not: its act throws what the engine answered, so the row records the answer
// (its error name, `effect`, `unchanged`) for the judge, which only a declared departure excuses (./departures.mjs).
export const TYPE_UNCONFIRMED_NOT_TEXT = 'the focused element is not a text field';
export const typeIntoList = text => `try { await __app.typeText(${j(text)}); } catch (e) { if (!String(e?.message ?? e).includes(${j(TYPE_UNCONFIRMED_NOT_TEXT)})) throw e; __m.typeUnconfirmed = true; }`;

// ---- shared bodies --------------------------------------------------------------------------------------------------

// Why a prepare's field is not shown focused (#188). The renderer's trailer shows selected text or selected elements
// instead of the focused element (src/services/engine/render.mjs trailer), so a trailer a selection masks says nothing
// about the focus and is never reported as a field that could not be given it.
export const FOCUS_REASONS = Object.freeze({
  unfocused: 'the field could not be given the focus',
  masked: 'the focus could not be read: a selection masks the trailer',
});
// The stated step that clears a selection masking the trailer: the field emptied (an AXPress on Chromium's textarea,
// cua's click on it, keeps an existing selection where a posted click places a caret; writing the same value back does
// not collapse it). Whether cua's click should keep the selection is a question of its own, not this harness's.
const CLEARED = 'field emptied to clear a selection';
// Ruling 1204: the clear is named done only on a read-back that shows the field empty; else the attempt and what it read.
const CLEAR_ATTEMPTED = 'emptying attempted to clear a selection';
// The field `index` (in `now`) given the focus: a click when the trailer does not show the field focused; with
// `clear`, the stated clear when a selection still masks the trailer after it. A field the unmasked trailer shows
// unfocused is not ready; otherwise the reading ('focused' or 'masked') is left in `__m.focus` for the row's verdict,
// which reads the observation's own focus where the engine reports one.
const focusOn = ({clear}) => `if (focusReading(now, index) !== "focused") { await __app.click(index); now = await observe(); }
${clear ? `if (focusReading(now, index) === "masked") {
  await __app.setValue(index, ""); now = await observe();
  const left = plain(valueOfIndex(now, index) ?? "").length;
  __m.prepared.push(left === 0 ? ${j(CLEARED)} : ${j(`${CLEAR_ATTEMPTED}, the field still read `)} + left + " characters");
}` : ''}
if (focusReading(now, index) === "unfocused") return {ready: false, reason: ${j(FOCUS_REASONS.unfocused)}};
__m.focus = {index, trailer: focusReading(now, index)};`;
// The row's verdict on a prepare's focus reading `focus` ({index, trailer}), given the engine's meta of the prepare's
// last observation (`cua/observation`, ./lane.mjs engineMetaOf; null on the vendor, which reports none). cua's names the
// focused element by index (src/services/engine/service.mjs), which no selection masks, so it is read in the trailer's
// place whenever it is there; it is the prepare's last observation, the state the act starts from. -> {by:
// 'observation' | 'trailer', problem: null | reason}.
export function focusVerdict(focus, observation) {
  if (observation && Object.hasOwn(observation, 'focusedIndex')) {
    const problem = observation.focusedIndex === focus.index ? null
      : `${FOCUS_REASONS.unfocused}${typeof observation.focusRead === 'string' ? ` (the focus read answered ${observation.focusRead})` : ''}`;
    return {by: 'observation', problem};
  }
  return {by: 'trailer', problem: focus.trailer === 'focused' ? null : FOCUS_REASONS[focus.trailer] ?? FOCUS_REASONS.unfocused};
}

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
// of the focused element (src/services/engine/render.mjs trailer), so no one observation shows both. A selection an
// earlier row left masks the first reading; with a `value` to write the field is emptied first as a stated step
// (focusOn), and the row reads cua's own focus of the last observation (focusVerdict). The value must be unchanged by
// the selection. -> the prepare body's lines, leaving `now` (the observation) and `index` (the field).
const selectedIn = ({find, value = null, word, focus = true}) => `${observed}
let now = ax, index = ${find};
if (index === null) return {ready: false, reason: "the field is not in the text"};
${focus ? focusOn({clear: value !== null}) : ''}
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
// The document's text view whether or not it holds text (TEXT_FIELDS.textedit).
const TEXT_FIELDS_TEXTEDIT = 'indexOfId(ax, "First Text View")';
const NOW_AREA = 'indexOfPart(now, "ID", "First Text View")';
const textedit = [
  // The document's first line in a real reading of its value, never a substring of raw escaped text (#526, ruling 1185).
  tree(`ax => { const reading = valueReadingOf(ax, ${TEXT_AREA}), document = reading.real && plain(reading.value ?? "").includes(${j(DOCUMENT[0])}); return {ok: document, outcome: {document}}; }`),
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
  {...dragSelect({find: TEXT_AREA, layout: {window: null, from: [0.2, 0.45], to: [0.7, 0.62]}}), framed: 'window fractions'},
  refusal({method: 'selectText', kase: 'notText', find: 'indexOfPart(ax, "Description", "bold")', act: 'await __app.selectText(__m.index, "bold");',
    watch: `[selectedTextOf(ax), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.notText}),
  refusal({method: 'setValue', kase: 'notSettable', find: 'indexOfPart(ax, "Description", "text color")', act: 'await __app.setValue(__m.index, "x");',
    watch: `[valueOfIndex(ax, indexOfPart(ax, "Description", "text color")), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.notSettable}),
  refusal({method: 'click', kase: 'invalidIndex', find: TEXT_AREA, act: `await __app.click(${INVALID_INDEX});`,
    watch: `[selectedTextOf(ax), valueOfIndex(ax, ${TEXT_AREA})]`, sentence: REFUSALS.invalidIndex}),
];

// ---- TextEdit's Open panel and Save sheet (served out of process; each case on an opening of its own, ./panels.mjs) ----

// Whether a panel is up in an observation `ax`, as cell source: the Open panel by its window's ID (./matrix-cells.mjs
// `panel`); the Save sheet by its name field, told from the keep-or-delete sheet by its missing Delete button.
export const PANEL_UP = Object.freeze({openPanel: 'panel(ax)', savePanel: '(/ID: saveAsNameTextField\\b/.test(ax) && !/ID: DontSaveButton\\b/.test(ax))'});
// What the panels' typing cases type (ruling 1196): an upper-case token, which no autocorrection rewrites and no file
// of the runner's matches; the search field's and the Save sheet's name field's.
export const PANEL_SEARCH = 'CUAMATRIXPANEL';
export const SAVE_PANEL_NAME = 'CUAMATRIXNAME';
// The Open panel's search field: a text field whose line names a search (its role word, placeholder or description).
const SEARCH_FIELD = 'elementLines(ax).find(l => /^(?:search )?(?:text field|search field)\\b/.test(l.content) && /search|검색/i.test(l.content))?.index ?? null';
// The Save sheet's name field (ID saveAsNameTextField, as #212's report names it).
const NAME_FIELD = '((m => (m ? Number(m[1]) : null))(/^[~+-]?\\t*(\\d+) [^\\n]*ID: saveAsNameTextField\\b/m.exec(ax)))';
// A panel's Escape (ruling 1196: whether a key reaches a panel drawn by the panel service): it must be gone afterwards,
// TextEdit's own window (`front`, as cell source) in front again.
const panelEscape = (target, front, what) => ({method: 'pressKey', case: 'escape', expect: 'outcome', keys: ['Escape'], regimes: ['frontmost'],
  prepare: `const ax = await observe();
if (!${PANEL_UP[target]}) return {ready: false, reason: ${j(`${what} is not up`)}};
return {ready: true};`,
  act: 'await __app.pressKey("Escape");',
  check: `let ax = await observe();
for (const end = Date.now() + 5000; ${PANEL_UP[target]} && Date.now() < end;) ax = await observe();
const closed = !${PANEL_UP[target]}, front = ${front};
return {ok: closed && front, outcome: {closed, documentInFront: front}};`});
// A panel's typing (ruling 1196): `field` (cell source over `ax`) focused by the prepare and its value, if any, selected
// whole, so the text typed replaces it; then read back, awaited up to 3 s; only whether it read back and its length leave
// the cell. Nothing is written: pilot C-3's vendor left the Save sheet's name field non-empty after setValue(""), the
// panel service's field taking no AX value write there. The selection is an AX selection both engines make (no key: a
// prepare's keys pass no key guard), read back in the trailer, which shows it in the focused element's place (so the
// focus is read before it, a click's own selection read as masked, ./matrix-text.mjs focusReading).
const panelTyping = (target, kase, field, text, what) => ({method: 'typeText', case: kase, expect: 'outcome', keys: ['typeText'], regimes: ['frontmost'],
  prepare: `let ax = await observe();
if (!${PANEL_UP[target]}) return {ready: false, reason: ${j(`${what} is not up`)}};
let index = ${field};
if (index === null) return {ready: false, reason: "the field is not in the text"};
if (focusReading(ax, index) !== "focused") { await __app.click(index); ax = await observe(); index = ${field}; }
if (index === null || focusReading(ax, index) === "unfocused") return {ready: false, reason: "the field could not be focused"};
const value = plain(valueOfIndex(ax, index) ?? "");
if (value !== "" && selectedTextOf(ax) !== value) { await __app.selectText(index, value); ax = await observe(); index = ${field}; __m.prepared.push("field selected"); }
const selected = selectedTextOf(ax);
if (value !== "" && (index === null || selected !== value || plain(valueOfIndex(ax, index) ?? "") !== value)) return {ready: false, reason: "the field's value could not be selected whole: " + value.length + " characters, " + (selected === null ? "none" : selected.length) + " selected"};
return {ready: true};`,
  act: `await __app.typeText(${j(text)});`,
  check: `let ax = await observe(), value = null;
for (const end = Date.now() + 3000; ; ax = await observe()) {
  const index = ${field};
  value = index === null ? null : plain(valueOfIndex(ax, index) ?? "");
  if (value === ${j(text)} || Date.now() >= end) break;
}
const readBack = value === ${j(text)};
return {ok: readBack, outcome: {readBack, length: value === null ? null : value.length, up: ${PANEL_UP[target]}}};`});

const openPanel = [
  {method: 'getAXState', case: 'panel', expect: 'outcome', prepare: 'return {ready: true};',
    act: '__m.ax = await __app.getAXState({emit: false, disableDiffing: true});',
    check: 'const ax = __m.ax ?? "";\nreturn {ok: panel(ax), outcome: {panel: panel(ax), elements: elementLines(ax).length}};'},
  panelTyping('openPanel', 'search', SEARCH_FIELD, PANEL_SEARCH, 'the Open panel'),
  panelEscape('openPanel', 'inFront(ax)', 'the Open panel'),
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

// The Save sheet of an untitled document (⌘N, then ⌘S: ./panels.mjs), never saved: no Return is sent.
const savePanel = [
  panelEscape('savePanel', 'typeof globalThis.__sheetDoc === "string" && windowTitleOf(ax) === globalThis.__sheetDoc', 'the Save sheet'),
  panelTyping('savePanel', 'name', NAME_FIELD, SAVE_PANEL_NAME, 'the Save sheet'),
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
  // The row cases need their rows in the list's visible subset, which the window's height decides (hold 2b): `framed`.
  {method: 'click', case: 'row', expect: 'outcome', prepare: rowPrepare(FILE(5)), framed: 'visible rows',
    act: 'if (__m.cell === null) throw new Error("the row has no cell beside its name"); await __app.click(__m.cell);', check: selectedRow(FILE(5))},
  {method: 'pressKey', case: 'down', expect: 'outcome', keys: ['Down'], prepare: rowPrepare(FILE(6), {from: FILE(5)}), act: 'await __app.pressKey("Down");', check: selectedRow(FILE(6)), framed: 'visible rows'},
  // Type-select on the run's list (never the toolbar's search field, which would list the owner's files).
  {method: 'typeText', case: 'typeSelect', expect: 'outcome', keys: ['typeText'], prepare: rowPrepare(FILE(12)), act: `await __app.typeText(${j(FILE(12))});`, check: selectedRow(FILE(12)), framed: 'visible rows'},
  refusal({method: 'selectText', kase: 'notText', find: `rowIndexOfName(ax, ${j(FILE(1))})`, act: 'await __app.selectText(__m.index, "scene");',
    watch: 'selectedIndexesOf(ax)', sentence: REFUSALS.notText}),
  ...['scroll', 'performSecondaryAction'].map(method => ({method, case: 'down', expect: 'outcome', framed: 'visible rows',
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

// ---- Ruling 1168 (#534): the pointerdown-only cell, on both web scenes ---------------------------------------------------
//
// Web UI kits open menus and popovers on `pointerdown` (Radix-style triggers). cua presses a web button through AXPress
// where the vendor posts a click (#534; F-helper-logic.md §18, the #258 reading that corrects §5.1's gate: inside a web
// view the vendor posts a real click at the frame's visible midpoint whenever the hit-test there answers "the element
// itself or a descendant"), so a press that dispatched no pointer event would miss those handlers. (Chromium's AXPress
// does dispatch one: DispatchSimulatedClick, kFromAccessibility, a trusted pointerdown with pointerId 1, "mouse",
// button 0; docs/evidence/2026-11-23-own-native-engine/gates/534.md. The cell proves reach, not path, and the row
// carries cua's route from _meta, unjudged.) The cell: a button whose
// only handler is `pointerdown`, counting into a status line, clicked by element on both engines and judged on the
// count rising by exactly one, against the vendor's sample of the same run ('reference'): cua's count unchanged (or
// risen by two) where the vendor's rose by one is worse; a vendor count not risen by exactly one makes the pair NO
// VERDICT (pointerdownReference: the vendor's real click not counting says the scene is broken); and no departure may
// name the row (./departures.mjs). Frontmost only, as #258's and #259's
// cells: behind a user window a background row is judged against ground truth alone, which would ask of cua a pointer
// into a background page that nobody has measured the vendor delivering.
//
// The buttons live in matrix-only variants of the two scenes, so the trees every other consumer reads (the renderer
// goldens, sitting B's native-mac suite, the cursor sitting's slots) stay the shared page's and fixture's: the run brings
// the scenes up with these arguments (./run.mjs), and nothing else passes them.
export const MATRIX_SCENE_ARGS = Object.freeze({chrome: Object.freeze(['--page', POINTERDOWN.variant]), electron: Object.freeze(['--electron-arg', POINTERDOWN_SWITCH])});
// The variant's pointer downs as its status line reads them, or null (the scene without the variant among them).
const pointerDowns = `(() => { const status = ${statusText(named(POINTERDOWN.status), '/Pointer downs: \\d+/')}; const m = /Pointer downs: (\\d+)/.exec(status ?? ""); return m ? Number(m[1]) : null; })()`;
const pointerdownCase = Object.freeze({method: 'click', case: 'pointerdown', expect: 'outcome', regimes: Object.freeze(['frontmost']),
  prepare: `${observed}
const index = ${named(POINTERDOWN.button)}, count = ${pointerDowns};
if (index === null || count === null) return {ready: false, reason: "the pointerdown button or its count is not in the text: the scene is not the matrix's pointerdown variant"};
__m.index = index; __m.before = count; return {ready: true};`,
  act: 'await __app.click(__m.index);',
  check: `const ax = await observe();
const after = ${pointerDowns}, rose = after === null ? null : after - __m.before;
return {ok: rose === 1, outcome: {pointerDownOnce: rose === 1, rose}};`});
// The text fields' known contents for the replacing and dragging cases: lines whose words occur once each.
export const FIELD_LINES = Object.freeze(['alpha one', 'bravo two', 'charlie three', 'delta four', 'echo five', 'foxtrot six', 'golf seven', 'hotel eight']);
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
// Chrome's drag, in window points. The page has no stylesheet (fixtures/scene-page.mjs: style-src 'none'), so the user
// agent's default layout puts the notes field (rows 8, cols 60) at the content area's top left, below Chrome's toolbar,
// whose height does not follow the window's: the field's lines stand at the same window points in any window wide enough
// for the field and tall enough to show it, the mini's 1000x760 and the hosted runner's 800x760 alike (ruling 1169). Only
// the window's size, which turns window points into the screenshot's pixels (and whose shape the prepare checks), follows
// the frame, so the layout is grounded on the frame the run launched Chrome at (groundCase), never the mini's scaled. The
// prepare's harness click at each end still proves the points land in the field before anything is dragged.
export const CHROME_DRAG_POINTS = Object.freeze({from: Object.freeze([24, 192]), to: Object.freeze([200, 237])});
export const chromeDragLayout = ({width, height}) => ({window: [width, height], ...CHROME_DRAG_POINTS});
const chromeDrag = frame => ({...dragSelect({find: named('Scene notes'), value: FIELD_VALUE, layout: chromeDragLayout(frame)}), framed: 'window points', ground: chromeDrag});
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
${focusOn({clear: true})}
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
  // The notes field's second to fifth lines, below the toolbar, heading and margins, grounded on the scene's frame.
  chromeDrag(SCENES.chrome.placement),
  refusal({method: 'setValue', kase: 'notSettable', find: named('Apply'), act: 'await __app.setValue(__m.index, "x");', watch: `[valueOfIndex(ax, ${named('Scene name')}), focusedIndexOf(ax)]`,
    sentence: REFUSALS.notSettable}),
  // The checkbox's selected text range reads settable in Chromium, so both engines refuse at the search, not the
  // settability check (#190; hold 3, both engines, both runs).
  refusal({method: 'selectText', kase: 'notText', find: named('Scene option'), act: 'await __app.selectText(__m.index, "Scene");', watch: `[valueOfIndex(ax, ${named('Scene option')}), selectedTextOf(ax)]`,
    sentence: REFUSALS.textNotFound}),
  // Ruling 1168: last, so every row before it starts where it did before the cell was added.
  pointerdownCase,
];

// ---- The Electron fixture -----------------------------------------------------------------------------------------------

// The fixture in its 720 x 560 window: the text field's second to fourth lines, below the 28-point title bar and the
// body's 16-pixel margin (fixtures/electron/fixture.css), for the drag case and #188's positional click
// (scripts/cursor-sitting/item-188.mjs).
export const ELECTRON_FIELD_LAYOUT = Object.freeze({window: Object.freeze([720, 560]), from: Object.freeze([30, 69]), to: Object.freeze([300, 99])});
// The fixture status's press count, or null.
export const pressed = `(() => { const status = ${statusText(named('Fixture status'), '/Pressed \\d+ times?/')}; const m = /Pressed (\\d+) times?/.exec(status ?? ""); return m ? Number(m[1]) : null; })()`;
// #258 and #259's caret cases (T8e, ./caret.mjs): what the prepare makes in the field (`before`, the range the device
// must read before the click) and, for #259, the point clicked (window points, the 2026-11-01 cell's: about five
// characters into the drag's middle line) and the line it aims at (0-based). `lines` the field's value, for the
// reading's line and column.
const CARET_WORD = 'charlie';
export const CARET = Object.freeze({
  selection: Object.freeze({kind: 'selection', lines: FIELD_LINES, before: Object.freeze({location: FIELD_LINES.join('\n').indexOf(CARET_WORD), length: CARET_WORD.length})}),
  point: Object.freeze({kind: 'point', lines: FIELD_LINES, before: Object.freeze({location: FIELD_LINES.join('\n').length, length: 0}),
    at: Object.freeze([60, (ELECTRON_FIELD_LAYOUT.from[1] + ELECTRON_FIELD_LAYOUT.to[1]) / 2]), line: 2}),
});
// The field holding its value, the caret at the value's end; then #259's point in the screenshot's pixels.
const caretAtEnd = `${observed}
let now = ax, index = ${named('Fixture text')};
if (index === null) return {ready: false, reason: "the field is not in the text"};
${focusOn({clear: true})}
if (plain(valueOfIndex(now, index)) !== ${FIELD_VALUE}) { await __app.setValue(index, ${FIELD_VALUE}); now = await observe(); }
if (plain(valueOfIndex(now, index)) !== ${FIELD_VALUE}) return {ready: false, reason: "the field could not be given its value"};
await __app.selectText(index, ${j(FIELD_LINES.at(-1).split(' ').at(-1))}, {selectionType: "cursor_after"}); now = await observe();
if (selectedTextOf(now) !== null) return {ready: false, reason: "a selection is left in the field"};
const size = jpegSize(await __app.getScreenshot({emit: false}));
if (!size) return {ready: false, reason: "the screenshot's size could not be read"};
const layout = ${j(ELECTRON_FIELD_LAYOUT)};
if (Math.abs(size.height / size.width - layout.window[1] / layout.window[0]) > 0.03) return {ready: false, reason: "the screenshot is not the fixture window's shape"};
const scale = size.width / layout.window[0];
__m.index = index; __m.point = ${j(CARET.point.at)}.map(v => Math.round(v * scale));
return {ready: true};`;
// The click must leave the field's value as it was.
const valueKept = `const ax = await observe();
const kept = plain(valueOfIndex(ax, ${named('Fixture text')})) === ${FIELD_VALUE};
return {ok: kept, outcome: {valueKept: kept}};`;
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
${focusOn({clear: true})}
return {ready: true};`,
    act: 'await __app.pressKey("Tab");',
    check: `const ax = await observe();
const moved = focusedIndexOf(ax) === ${named('Fixture list')};
return {ok: moved, outcome: {moved}};`},
  {method: 'setValue', case: 'text', expect: 'outcome', prepare: freshValue(named('Fixture text'), 'cua matrix set'), act: 'await __app.setValue(__m.index, __m.value);', check: setExactly(named('Fixture text'))},
  selectMatrix('text', 'Fixture text'),
  {method: 'paste', case: 'replace', expect: 'outcome', keys: ['paste'],
    prepare: `${selectedIn({find: named('Fixture text'), value: FIELD_VALUE, word: j('golf')})}\nreturn {ready: true};`, act: `await __app.paste(${j(PASTED)});`, check: replaced(named('Fixture text'), PASTED)},
  {...dragSelect({find: named('Fixture text'), value: FIELD_VALUE, layout: ELECTRON_FIELD_LAYOUT}), framed: 'window points'},
  refusal({method: 'setValue', kase: 'notSettable', find: named('Fixture button'), act: 'await __app.setValue(__m.index, "x");', watch: `[${pressed}, valueOfIndex(ax, ${named('Fixture text')})]`,
    sentence: REFUSALS.notSettable}),
  // #258 and #259 (T8e): a click into the field judged by where its caret is after it, read on the device (`caret`,
  // ./caret.mjs; ./steps.mjs caseRow) and compared with the vendor's reading (./cell-verdict.mjs 'reading'). Frontmost
  // only, as both were registered: in the background a web page takes no pointer, which is the declared refusal's
  // question and not these gates'.
  {method: 'click', case: 'selection', expect: 'outcome', regimes: ['frontmost'], caret: CARET.selection,
    prepare: `${selectedIn({find: named('Fixture text'), value: FIELD_VALUE, word: j(CARET_WORD)})}\nreturn {ready: true};`, act: 'await __app.click(__m.index);', check: valueKept},
  {method: 'click', case: 'point', expect: 'outcome', regimes: ['frontmost'], caret: CARET.point, prepare: caretAtEnd, act: 'await __app.click(__m.point);', check: valueKept, framed: 'window points'},
  // Ruling 1168: last, so every row before it starts where it did before the cell was added.
  pointerdownCase,
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

export const CASES = Object.freeze({textedit, finder, chrome, electron, openPanel, savePanel, windowless});
// A target's cases in one regime: every case but those that name other regimes (`regimes`, the caret cases').
export const casesOf = (target, regime) => CASES[target].filter(c => !c.regimes || c.regimes.includes(regime));
// A case as the run sends it, grounded on the frame its scene's window was launched at (ruling 1169): `frames` the venue's
// (meta.venue.frames, ../hosted-sittings/venue.mjs; null off a hosted runner). A case whose points stand on its window's
// size (`ground`, Chrome's drag) is rebuilt on that frame; every other case, and every case off a hosted runner, is
// sent as the plan wrote it, on the mini's frame.
export const groundCase = (target, c, frames) => {
  const frame = frames?.[SCENE_OF[target]];
  return c.ground && frame ? c.ground(frame) : c;
};
// The cells whose layout rests on the scene's window frame (`framed`: window points, window fractions or the rows its
// height shows), in both regimes, each background case under every user window it is driven behind: what the venue
// declares for a frame that differs from the mini's. -> [{id, framed}].
export function framedCells(scene) {
  const framed = regime => casesOf(scene, regime).filter(c => c.framed);
  return [...framed('frontmost').map(c => ({id: caseId(scene, 'frontmost', c), framed: c.framed})),
    ...BACKGROUND_PAIRINGS.filter(p => p.driven === scene).flatMap(({user}) => framed('background').map(c => ({id: caseId(scene, 'background', c, user), framed: c.framed})))];
}
// The state an act on each target may change, as an expression over an observation `ax`: read once the prepare is ready
// and again after an act that threw, so the row records whether the target stayed as prepared (`outcome.unchanged`, the
// reading the judge's conservative-answer rule needs, ./answers.mjs conservativeEffect; ./matrix-cells.mjs caseCells).
// One per target, covering every case on it (and the Unicode rows on its field), so no act changes what its row does
// not watch. The values stay in the cell; only whether they compared equal leaves. The windowless app has no window to
// read, so its refusal records none.
const SCENE_FIELD = id => `valueOfIndex(ax, indexOfTarget(ax, ${j(id)}))`;
export const WATCHED = Object.freeze({
  textedit: `[selectedTextOf(ax), focusedIndexOf(ax), plain(valueOfIndex(ax, ${TEXT_FIELDS_TEXTEDIT}) ?? ""), scrollBarValueBeside(ax, ${TEXT_FIELDS_TEXTEDIT}), valueOfIndex(ax, indexOfPart(ax, "Description", "align center"))]`,
  openPanel: '[panel(ax), inFront(ax)]',
  savePanel: `[${PANEL_UP.savePanel}, windowTitleOf(ax) === globalThis.__sheetDoc]`,
  finder: `[selectedIndexesOf(ax), focusedIndexOf(ax), showingOf(ax, ${LIST})]`,
  chrome: `[selectedTextOf(ax), focusedIndexOf(ax), ${['Scene notes', 'Scene name', 'Scene option'].map(SCENE_FIELD).join(', ')}, elementLines(ax).filter(l => parentIndexOf(ax, l.index) === ${named('Scene status')}).map(l => l.content), ${pointerDowns}]`,
  electron: `[selectedTextOf(ax), focusedIndexOf(ax), selectedIndexesOf(ax), ${SCENE_FIELD('Fixture text')}, ${pressed}, ${pointerDowns}]`,
  windowless: null,
});
// Each text scene's typing field, as an expression over the observation `ax` (the cases above find them so): TextEdit's
// document, the Chrome page's textarea and the Electron fixture's text field. The probe cells and the Unicode matrix
// (./probe-plan.mjs, ./unicode-plan.mjs) type into them.
// TextEdit's typing field by its identifier, whether or not it holds text: emptied, its line's lone part is the bare
// identifier (./matrix-text.mjs indexOfId), which TEXT_AREA's labelled part no longer matches.
export const TEXT_FIELDS = Object.freeze({textedit: TEXT_FIELDS_TEXTEDIT, chrome: named('Scene notes'), electron: named('Fixture text')});

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
  openPanel: Object.fromEntries(['listApps', 'drag', 'paste', 'performSecondaryAction', 'scroll', 'selectText', 'setValue']
    .map(method => [method, 'the Open panel is observed, searched for a token no file matches, closed by Escape and by its Cancel; it lists the owner\'s files, so nothing in its listing is selected, scrolled or written'])),
  savePanel: Object.fromEntries(METHODS.filter(m => !['pressKey', 'typeText'].includes(m))
    .map(method => [method, 'the Save sheet\'s cells are its Escape and its name field\'s typing (ruling 1196); it is never saved'])),
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

// Acceptance 3's cell (S L238): TextEdit's background click on its text view with Finder's window in front, which also
// carries the keystroke witness (./steps.mjs caseRow, ./probe-plan.mjs WITNESS_PREPARE_CELL).
export const ACCEPTANCE_3 = Object.freeze({target: 'textedit', user: 'finder', method: 'click', case: 'element'});
export const isAcceptance3 = (target, regime, c, user) => regime === 'background' && target === ACCEPTANCE_3.target && user === ACCEPTANCE_3.user
  && c.method === ACCEPTANCE_3.method && c.case === ACCEPTANCE_3.case;

// A row's id: `<target>/<regime>/<method>.<case>`, and in the background regime `@<user>` after it (TextEdit and Finder
// are each driven behind two user windows).
export const caseId = (target, regime, c, user = null) => `${target}/${regime}/${c.method}.${c.case}${user ? `@${user}` : ''}`;
// A frontmost case's own timing row (section 'speed'): part 5's "each method cell", one per run.
export const methodTimingId = (target, c) => `${SCENE_OF[target]}/method.${{openPanel: 'panel.', savePanel: 'savePanel.'}[target] ?? ''}${c.method}.${c.case}`;
// The method rows judged by the device's reading of the field's caret beside the vendor's (#258, #259; ./caret.mjs).
export const CARET_ROWS = Object.freeze(Object.entries(CASES).flatMap(([target, cases]) => cases.filter(c => c.caret).map(c => caseId(target, 'frontmost', c))));
export const isCaretRow = id => CARET_ROWS.includes(id);
// Ruling 1168's rows (the pointerdown-only cell on each web scene): judged against the vendor's, never declarable.
export const POINTERDOWN_ROWS = Object.freeze(Object.entries(CASES).flatMap(([target, cases]) => cases.filter(c => c === pointerdownCase).map(c => caseId(target, 'frontmost', c))));
export const isPointerdownRow = id => POINTERDOWN_ROWS.includes(id);
// Whether the vendor's sample can be the reference for a pointerdown row (ruling 1168, the coordinator's of round 1): the
// vendor posts a real click, so its count rising by anything but one says the scene is broken, not that cua differs,
// and the pair has no verdict (./cell-verdict.mjs `reference`). -> null, or the reason naming the vendor's count.
export function pointerdownReference(vendorRow) {
  const rose = vendorRow?.outcome?.rose;
  if (rose === 1) return null;
  const count = Number.isSafeInteger(rose) ? (rose === 0 ? 'its count unchanged' : `its count changed by ${rose}`) : 'its count unread';
  return `the reference side did not register the pointerdown (the vendor's click: ${count})`;
}
