// The probe cells' rules and cells (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system
// part 5: concurrent use and its sheet variant, intervention fires, the pre-action refusal; run by ./probe-run.mjs).
// A probe is the approved bundle's `--probe keystroke --at <unix ms>` (or `input-source --at`, the Unicode matrix's
// mid-switch row), launched ahead of its time by one device command and awaited by another (./matrix-device.mjs
// probe), while the action it must fall inside is sent; the cell that sends the action waits on the device's clock for
// its own time, so the post and the call are placed on one clock.
//
// Validity, the spec's rule: a sample says something only when the probe's printed post falls inside the action's
// interval (cua's `cua/actionInterval`, set on a result and on the error that stopped it; on the vendor's lane, which
// reports none, the cell's own clock around the call, recorded as such), or, for the pre-action refusal, when the
// engine received the request after the post and within the debounce (cua's `cua/receivedAt`; the vendor's, the cell's
// call time). Anything else is invalid, never a pass and never a fail; a cell whose samples are all invalid is no
// verdict. A run makes up to PROBE_ATTEMPTS attempts per sample, each next one aimed from the last one's times.
import {cell} from '../native-baseline/cells.mjs';
import {FINDER_TYPING_NAME} from '../repl-parity/scenes-mac.mjs';
import {INTERVENTION_DEBOUNCE_MS} from './live-device.mjs';
import {prelude} from './matrix-cells.mjs';
import {elementLines, focusedIndexOf, lineOfIndex, parentIndexOf, sha256Hex, valueOfIndex} from './matrix-text.mjs';
import {FOCUS_REASONS, TEXT_FIELDS, TYPED} from './plan.mjs';

const j = JSON.stringify;

// The stand-in user's keys: two letters no scene holds, typed (the probe's default mode) under the Latin source.
export const PROBE_TEXT = 'qz';
// How far ahead of its launch a probe is scheduled: the device command's return, a reading for the key guard and the
// lane's call must all fit before the cell's own time.
export const PROBE_LEAD_MS = 4_000;
export const PROBE_ATTEMPTS = 3;
// A long typeText, so the interval is wide (part 5): the pangram 32 times, about 1,440 keyed units.
export const LONG_TEXT = Array.from({length: 32}, () => TYPED).join(' ');
// What each concurrent-use driven scene types: Chrome its textarea's long text; Finder type-selects file 150, whose
// 240-character name is its typing target (scripts/repl-parity/scenes-mac.mjs, `expectedIntervalMs` 240).
export const CONCURRENT_TYPING = Object.freeze({chrome: LONG_TEXT, finder: FINDER_TYPING_NAME});
// The first attempt's call lead before the post: the post about a third into Chrome's seconds-long typing, inside
// Finder's quarter second once the dispatch is paid. Later attempts aim from the measured times (nextPreMs).
export const PRE_MS = Object.freeze({chrome: 400, finder: 120, textedit: 400});
// The pre-action refusal's call, this long after the post's time: well inside the debounce, after the post.
export const PRE_ACTION_DELAY_MS = 150;
// The sheet variant: super+w this long before the post, its follow-up click no earlier than this long after it.
export const SHEET_PRE_MS = 100, SHEET_FOLLOW_MS = 300;
// The engine's userIntervened sentences (native/engine/Sources/Engine/Intervention.swift), the app string elided. An
// engine error reaches a cell as a plain Error (the REPL's boundary, src/repl-host/trusted-worker.mjs), its name
// 'Error', so a refusal is told by its message alone: the vendor's envelope with userIntervened's code (−10016), then
// the sentence (the spec: the harnesses match substrings).
export const USER_CHANGED = "The user changed '";
export const STILL_INTERACTING = "The user is still interacting with '";
export const USER_INTERVENED = 'Computer Use server error -10016: ';
// Whether a cell's caught error (its `threw` and `message`) is the userIntervened refusal with `sentence`.
export const refusedWith = (value, sentence) => value?.threw === true && typeof value.message === 'string' && value.message.startsWith(USER_INTERVENED) && value.message.includes(sentence);
export const EMPTY_HASH = sha256Hex('');

// ---- validity ------------------------------------------------------------------------------------------------------

// The action's interval on the engine's lane (`act.engine`, ./lane.mjs engineMetaOf), or the cell's own around the call
// on the vendor's. -> {from, to, source: 'engine'|'cell'} or null (nothing posted, nothing reported).
export function intervalOf(engine, act) {
  if (engine === 'cua') {
    const {startedAt, endedAt} = act?.engine?.actionInterval ?? {};
    return Number.isFinite(startedAt) && Number.isFinite(endedAt) ? {from: startedAt, to: endedAt, source: 'engine'} : null;
  }
  const {callAt, endAt} = act?.value ?? {};
  return Number.isFinite(callAt) && Number.isFinite(endAt) ? {from: callAt, to: endAt, source: 'cell'} : null;
}

// Whether a post at `postedAt` makes the sample valid. -> null, or why it is invalid.
export function postValidity(postedAt, interval) {
  if (!Number.isFinite(postedAt)) return 'the probe printed no post time';
  if (!interval) return 'the action reported no interval (nothing was posted, or the engine reported none)';
  if (postedAt < interval.from) return `the probe posted ${interval.from - postedAt} ms before the action's interval`;
  if (postedAt > interval.to) return `the probe posted ${postedAt - interval.to} ms after the action's interval`;
  return null;
}

// The pre-action refusal's validity: the request received after the post and within the debounce. -> null or why not.
export function receiptValidity({engine, postedAt, receivedAt = null, callAt = null, debounceMs = INTERVENTION_DEBOUNCE_MS}) {
  const at = engine === 'cua' ? receivedAt : callAt;
  if (!Number.isFinite(postedAt)) return 'the probe printed no post time';
  if (!Number.isFinite(at)) return engine === 'cua' ? 'the refusal carried no cua/receivedAt' : 'the cell recorded no call time';
  if (at <= postedAt) return `the request was received ${postedAt - at} ms before the post`;
  if (at - postedAt > debounceMs) return `the request was received ${at - postedAt} ms after the post: past the ${debounceMs} ms debounce`;
  return null;
}

// The next attempt's call lead before the scheduled post (the cell calls at scheduled - lead), aiming the post at the
// middle of the interval the last attempt measured, the probe's own lateness (posted - scheduled) allowed for; kept in
// [0, PROBE_LEAD_MS - 1 s]. Nothing measured: the last lead (`preMs`) kept.
export function nextPreMs({callAt, interval, postedAt, scheduled, preMs = 0}) {
  if (!interval || ![callAt, postedAt, scheduled].every(Number.isFinite)) return preMs;
  const aim = Math.round((interval.from + interval.to) / 2) - callAt - (postedAt - scheduled);
  return Math.min(PROBE_LEAD_MS - 1_000, Math.max(0, aim));
}

// What a probe's answer says about its post or switch. -> null when it acted, else why the sample says nothing.
export function probeProblem(answer) {
  if (!answer || typeof answer !== 'object') return 'the probe printed no answer';
  if ('selected' in answer) return answer.selected === true && Number.isFinite(answer.selectedAt) ? null : 'the probe\'s source was not selected';
  if (answer.error) return `the probe did not post: ${String(answer.error).slice(0, 200)}`;
  if (answer.aborted) return 'the probe stopped mid-way: the front window was not the named one';
  return Number.isFinite(answer.postedAt) ? null : 'the probe printed no post time';
}

// ---- cells ---------------------------------------------------------------------------------------------------------
// Each carries a `cua-matrix-cell:` tag, the tests' handle on it.

// One facade call at the device time `at` (0: at once), waited for on the device's clock inside the cell, its error
// caught. -> {actMs, callAt, endAt, late, threw, errorName, message}.
export const scheduledActCell = (scene, {at = 0, act, tag}) => cell(`${prelude(scene)}
// cua-matrix-cell: ${tag}
const __m = globalThis.__m = {threw: null, errorName: null};
const __at = ${Number(at)};
while (Date.now() < __at - 30) await new Promise(done => setTimeout(done, 10));
while (Date.now() < __at) {}
const callAt = Date.now(), __t = performance.now();
try {${act}\n} catch (e) { __m.threw = String(e?.message ?? e).slice(0, 300); __m.errorName = String(e?.errorName ?? e?.name ?? "").slice(0, 80) || null; }
const actMs = performance.now() - __t, endAt = Date.now();
return {actMs, callAt, endAt, late: Math.max(0, callAt - __at), threw: __m.threw !== null, errorName: __m.errorName, message: __m.threw};`);

// A text scene's typing field (./plan.mjs TEXT_FIELDS) emptied and given the focus, the emptying named in `prepared`
// when it was needed; a trailer a selection still masks is its own reason (./plan.mjs FOCUS_REASONS). -> {ready,
// prepared?} or {ready: false, reason, prepared?}.
export const emptyFieldCell = scene => cell(`${prelude(scene)}
// cua-matrix-cell: field.empty
${emptyField(scene)}`);
// The body: shared with the Unicode matrix's prepare (./unicode-plan.mjs).
export const emptyField = scene => `let ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
const __find = ax => ${TEXT_FIELDS[scene]};
let __index = __find(ax);
if (__index === null) return {ready: false, reason: "the field is not in the text"};
const __prepared = [];
if (plain(valueOfIndex(ax, __index) ?? "") !== "") { await __app.setValue(__index, ""); ax = await observe(); __index = __find(ax); __prepared.push("field emptied"); }
if (__index !== null && focusedIndexOf(ax) !== __index) { await __app.click(__index); ax = await observe(); __index = __find(ax); }
const __empty = __index !== null && plain(valueOfIndex(ax, __index) ?? "") === "", __focus = __index === null ? "unfocused" : focusReading(ax, __index);
const __stated = __prepared.length ? {prepared: __prepared} : {};
if (!__empty || __focus !== "focused") return {ready: false, reason: !__empty ? "the field could not be emptied" : __focus === "masked" ? ${j(FOCUS_REASONS.masked)} : ${j(FOCUS_REASONS.unfocused)}, ...__stated};
return {ready: true, ...__stated};`;

// A text field read back by hash against `expected` (or, with `expected` null, its hash and length returned). The value
// stays in the cell. -> {ok, outcome: {exact, nfcEqual, length, expectedLength}} | {hash, length} | {invalid}.
export const fieldCheck = (scene, expected) => `const ax = await observe();
const __index = ${TEXT_FIELDS[scene]};
if (__index === null) return {invalid: "the field is not in the text"};
const __value = plain(valueOfIndex(ax, __index) ?? "");
const __hash = sha256Hex(__value);
${expected === null ? 'return {hash: __hash, length: __value.length};' : `const exact = __hash === ${j(sha256Hex(expected))};
return {ok: exact, outcome: {exact, nfcEqual: __value.normalize("NFC") === ${j(expected.normalize('NFC'))}, length: __value.length, expectedLength: ${expected.length}}};`}`;
export const fieldCheckCell = (scene, expected, tag = 'field.check') => cell(`${prelude(scene)}
// cua-matrix-cell: ${tag}
${fieldCheck(scene, expected)}`);

// Concurrent use's driven preparation and read-back. Chrome: its textarea emptied and focused, then its value against
// the long text. Finder: its list's selection set to the first file (scrolled to the top first), then the one selected
// row the typing target.
const FIRST_FILE = 'scene-file-001';
export const concurrentPrepareCell = driven => (driven === 'finder' ? cell(`${prelude('finder')}
// cua-matrix-cell: concurrent.prepare
let ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
if (rowIndexOfName(ax, ${j(FIRST_FILE)}) === null) { const list = indexOfPart(ax, "ID", "ListView"); if (list !== null) { await __app.scroll(list, "up", 20); ax = await observe(); } }
const only = name => { const s = selectedIndexesOf(ax); return s.length === 1 && s[0] === rowIndexOfName(ax, name); };
if (!only(${j(FIRST_FILE)})) { const c = indexOfRowCell(ax, ${j(FIRST_FILE)}); if (c !== null) { await __app.click(c); ax = await observe(); } }
if (!only(${j(FIRST_FILE)})) return {ready: false, reason: "the list's selection could not be set to its first file"};
return {ready: true};`) : emptyFieldCell(driven));
export const concurrentCheckCell = driven => (driven === 'finder' ? cell(`${prelude('finder')}
// cua-matrix-cell: concurrent.check
const ax = await observe();
const row = rowIndexOfName(ax, ${j(FINDER_TYPING_NAME)}), selected = selectedIndexesOf(ax);
const only = row !== null && selected.length === 1 && selected[0] === row;
return {ok: only, outcome: {rowFound: row !== null, selected: selected.length}};`) : fieldCheckCell(driven, CONCURRENT_TYPING[driven], 'concurrent.check'));

// The sheet variant's steps on TextEdit (scripts/repl-parity/scenes-mac.mjs CONCURRENT_USE_SHEET), the keys sent under the
// key guard with the user window in front. super+n: a new untitled document in front of the scene's (its title kept in
// the cell); its text typed; then the opening action, super+w at the cell's time, alone in its call so the call's
// result meta (its interval, route and receipt) is that action's own; then the follow-up in a call of its own: the
// keep-or-delete sheet awaited and a click on its Delete button (ID DontSaveButton), sent no earlier than `followAt`,
// after the probe's post, the action the intervention rule must not refuse, last in its call so the meta is the click's.
const keepOrDelete = `const __sheet = ax => /ID: save-panel\\b/.test(lineOfIndex(ax, 0) ?? "") && /ID: DontSaveButton\\b/.test(ax) && typeof globalThis.__sheetDoc === "string" && ax.includes(globalThis.__sheetDoc);
const __deleteButton = ax => { const m = /^[~+-]?\\t*(\\d+) [^\\n]*ID: DontSaveButton\\b/m.exec(ax); return m ? Number(m[1]) : null; };`;
export const NEW_DOCUMENT_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.new
let ax = await observe();
if (!inFront(ax)) return {opened: false, reason: "the scene document is not TextEdit's front window"};
await __app.pressKey("super+n");
for (const end = Date.now() + 5000; inFront(ax) && Date.now() < end;) ax = await observe();
const title = windowTitleOf(ax);
globalThis.__sheetDoc = inFront(ax) || panel(ax) ? null : title;
return {opened: typeof globalThis.__sheetDoc === "string" && globalThis.__sheetDoc.length > 0};`);
export const SHEET_TYPED = 'cua sheet variant';
export const SHEET_TYPE_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.type
let ax = await observe();
if (windowTitleOf(ax) !== globalThis.__sheetDoc) return {typed: false, reason: "the untitled document is not TextEdit's front window"};
await __app.typeText(${j(SHEET_TYPED)});
ax = await observe();
return {typed: plain(valueOfIndex(ax, ${TEXT_FIELDS.textedit}) ?? "") === ${j(SHEET_TYPED)}};`);
export const sheetOpenCell = ({at}) => scheduledActCell('textedit', {at, act: 'await __app.pressKey("super+w");', tag: 'sheet.open'});
export const sheetFollowCell = ({followAt}) => cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.follow
${keepOrDelete}
const __m = globalThis.__m = {threw: null, errorName: null};
let ax = await observe();
for (const end = Date.now() + 5000; !__sheet(ax) && Date.now() < end;) ax = await observe();
const opened = __sheet(ax), button = opened ? __deleteButton(ax) : null;
const __followAt = ${Number(followAt)};
while (Date.now() < __followAt) await new Promise(done => setTimeout(done, 10));
const clickAt = Date.now();
if (button !== null) { try { await __app.click(button); } catch (e) { __m.threw = String(e?.message ?? e).slice(0, 300); __m.errorName = String(e?.errorName ?? e?.name ?? "").slice(0, 80) || null; } }
const endAt = Date.now();
return {opened, clicked: button !== null, clickAt, endAt, threw: __m.threw !== null, errorName: __m.errorName, message: __m.threw};`);
// After the follow-up: the sheet gone and the scene's document TextEdit's front window again. -> {closed, sceneInFront}.
export const sheetCheckCell = () => cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.check
${keepOrDelete}
let ax = await observe();
for (const end = Date.now() + 5000; (__sheet(ax) || !inFront(ax)) && Date.now() < end;) ax = await observe();
return {closed: !__sheet(ax), sceneInFront: inFront(ax)};`);

// The cleanup of a sheet variant that stopped part-way (a key cell, sent under the guard): the untitled document closed
// (super+w, and its sheet's Delete when one comes up), so the scene's document is TextEdit's front window again.
// `front` names what TextEdit's front window was at the end, for the run's stop: scene, untitled, sheet, panel, other
// or none (no window observed). -> {closed, sceneInFront, front}.
export const CLOSE_UNTITLED_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.cleanup
${keepOrDelete}
const __observe = async () => { try { return await observe(); } catch (e) { if (/noWindowsAvailable/.test(String(e?.message ?? e))) return ""; throw e; } };
const __untitled = ax => typeof globalThis.__sheetDoc === "string" && windowTitleOf(ax) === globalThis.__sheetDoc;
let ax = await __observe();
if (!inFront(ax) && !__sheet(ax) && __untitled(ax)) { await __app.pressKey("super+w"); ax = await __observe(); }
for (const end = Date.now() + 5000; !inFront(ax) && !__sheet(ax) && Date.now() < end;) ax = await __observe();
if (__sheet(ax)) { const b = __deleteButton(ax); if (b !== null) await __app.click(b); ax = await __observe(); }
for (const end = Date.now() + 5000; !inFront(ax) && Date.now() < end;) ax = await __observe();
const front = ax === "" ? "none" : inFront(ax) ? "scene" : __sheet(ax) ? "sheet" : panel(ax) ? "panel" : __untitled(ax) ? "untitled" : "other";
return {closed: !__sheet(ax), sceneInFront: inFront(ax), front};`);

// #212's save sheet (its gate's hosted cell, the M5 pre-flight §6): the sheet variant's dirty untitled document (its
// new-document and typing cells) given its Save sheet by super+s, its destination moved to a folder the run made (the
// panel's Go To dialog), then set_value on the sheet's name field (ID saveAsNameTextField, the field #212's report
// names) at the cell's time, a probe keystroke aimed just after the engine receives the request. The save sheet is told
// from the keep-or-delete sheet by its missing Delete button. Its name field's index is kept across cells
// (`__saveNameIndex`), so the act's call holds the set_value alone and its meta is its own. The check reads the sheet
// again after a settle, and the run's folder: the sheet still open and the folder empty are the proof that nothing
// committed it (the probe types two letters, no Return), and a save that did commit lands in the run's folder, not the
// one the sheet inherited. The cancel is Escape on the sheet (and on the Go To dialog, if left up), the run's folder
// then removed when empty; the untitled document closes as the sheet variant's does (CLOSE_UNTITLED_CELL). The ids come
// from #212's report and the keep-or-delete cells, not yet read on a runner's Save sheet, and the Go To dialog's
// controls are not read at all (SAVE_PANEL_CONTROLS): until a pilot run reads them, the destination cell only observes
// and the cell never acts.
export const SAVE_NAME = 'cua-212-intended';
// The run's own save folder, made under the runner's temporary directory by the destination cell.
export const SAVE_DIR_PREFIX = 'cua-212-save-';
// The first attempt's call this long before the post (the call reaches the engine a few ms after it is made); later
// attempts aim the post SAVE_SHEET_AIM_MS after the measured receipt.
export const SAVE_SHEET_PRE_MS = 10, SAVE_SHEET_AIM_MS = 5;
// How long after the act the sheet is read again, for a commit that lands late.
export const SAVE_SHEET_SETTLE_MS = 2_000;
// The engine's clauses (Intervention.swift `Interruption`): a stop part-way, and the list of what may have taken effect.
export const STOPPED_PART_WAY = 'The action was stopped part-way.';
export const MAY_HAVE_TAKEN_EFFECT = 'may have taken effect';
const saveSheet = `const __saveSheet = ax => /ID: saveAsNameTextField\\b/.test(ax) && !/ID: DontSaveButton\\b/.test(ax);
const __nameField = ax => { const m = /^[~+-]?\\t*(\\d+) [^\\n]*ID: saveAsNameTextField\\b/m.exec(ax); return m ? Number(m[1]) : null; };`;
export const SAVE_SHEET_OPEN_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.open
${saveSheet}
globalThis.__saveDir = null;
let ax = await observe();
if (windowTitleOf(ax) !== globalThis.__sheetDoc) return {opened: false, reason: "the untitled document is not TextEdit's front window"};
await __app.pressKey("super+s");
for (const end = Date.now() + 5000; !__saveSheet(ax) && Date.now() < end;) ax = await observe();
globalThis.__saveNameIndex = __saveSheet(ax) ? __nameField(ax) : null;
return {opened: globalThis.__saveNameIndex !== null, ...(globalThis.__saveNameIndex === null ? {reason: __saveSheet(ax) ? "the sheet's name field has no index" : "no Save sheet came up"} : {})};`);
// The Save panel's controls the destination cell must identify, each {id, role}: its identifier and its role word as
// the observation prints them (the grammar carries no raw role or subrole; TextEdit runs in English). `panel` is the
// sheet around the name field, `goTo` the Go To dialog inside it, `goToField` the dialog's path field, `location` the
// panel's pop-up naming the selected folder. None is read on a runner yet, so all are null: the destination cell then
// only observes (it opens the Go To dialog and records the panel's structure, nothing typed, no Return), the row is
// invalid and nothing acts. A pilot run's `outcome.observed` is where they are read.
export const SAVE_PANEL_CONTROLS = Object.freeze({panel: null, goTo: null, goToField: null, location: null});

// The one element whose line begins with the role word `control.role` and carries the identifier `control.id` (its
// `ID:` part, or its lone part); null when none or more than one does.
export function controlIndexOf(ax, control) {
  if (typeof control?.id !== 'string' || typeof control?.role !== 'string') return null;
  const id = control.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelled = new RegExp(`(?:^| |, )ID: ${id}(?:,| \\(showing |$)`), lone = new RegExp(` ${id}$`);
  const found = elementLines(ax).filter(l => (l.content === control.role || l.content.startsWith(`${control.role} `)) && (labelled.test(l.content) || lone.test(l.content)));
  return found.length === 1 ? found[0].index : null;
}
// Whether the element `index` lies inside the element `ancestor`.
export function isInside(ax, index, ancestor) {
  if (index === null || ancestor === null) return false;
  for (let at = parentIndexOf(ax, index); at !== null; at = parentIndexOf(ax, at)) if (at === ancestor) return true;
  return false;
}
// The line's role word and bare title (its flags and labelled parts dropped), at most 40 characters.
export function headOf(content) {
  const flagless = String(content).replace(/ \([^)]*\)/, '');
  const part = /(?:^| |, )(?:Description|Rows|Columns|URL|Help|Value|Details|Placeholder|ID|Secondary Actions): /.exec(flagless);
  return (part ? flagless.slice(0, part.index) : flagless).replace(/,$/, '').trim().slice(0, 40);
}
// The save panel as the destination cell reads it (`controls`, SAVE_PANEL_CONTROLS' shape): the panel; the Go To dialog
// inside it and the path field inside that, whether the field is the focused element and its value; the location
// pop-up inside the panel and outside the dialog, and the folder it names (its value, else its bare title). ->
// {panel, goTo, field, fieldFocused, fieldValue, location, locationName}.
export function savePanelReading(ax, controls) {
  const panel = controlIndexOf(ax, controls.panel);
  const goTo = [controlIndexOf(ax, controls.goTo)].find(at => isInside(ax, at, panel)) ?? null;
  const field = [controlIndexOf(ax, controls.goToField)].find(at => isInside(ax, at, goTo)) ?? null;
  const location = [controlIndexOf(ax, controls.location)].find(at => isInside(ax, at, panel) && !isInside(ax, at, goTo)) ?? null;
  const clean = text => (text === null || text === undefined ? null : String(text).replace(/\*\*/g, ''));
  const named = location === null ? null : clean(valueOfIndex(ax, location)) ?? (headOf(lineOfIndex(ax, location)).slice(controls.location.role.length).trim() || null);
  return {panel, goTo, field, fieldFocused: field !== null && focusedIndexOf(ax) === field, fieldValue: field === null ? null : clean(valueOfIndex(ax, field)),
    location, locationName: named};
}
// The panel's structure for a pilot's reading of SAVE_PANEL_CONTROLS: the trailer's kind and, for at most 80 element
// lines, the index, depth, parent, `ID:` part, role word and bare title (`headOf`) and whether it is focused. No value
// leaves; the titles are the panel's own on a run's fixture document.
export function savePanelStructure(ax) {
  const focused = focusedIndexOf(ax);
  const trailer = /\nSelected text: /.test(ax) ? 'selectedText' : /\nSelected:\n/.test(ax) ? 'selected' : focused !== null ? 'focused' : 'none';
  const lines = elementLines(ax);
  return {trailer, count: lines.length, lines: lines.slice(0, 80).map(l => ({index: l.index, depth: l.depth, parent: parentIndexOf(ax, l.index),
    id: /(?:^| |, )ID: ([^,]+?)(?:,| \(showing |$)/.exec(l.content)?.[1] ?? null, head: headOf(l.content), focused: l.index === focused}))};
}

// The sheet's destination: a folder made for this attempt, reached through the panel's Go To dialog. Every control is
// identified first (`controls`; unread, the cell only observes, `SAVE_PANEL_CONTROLS`). After super+shift+g the dialog
// and its path field must be identified, inside the panel, the field focused, before anything is typed; after typing,
// the field must still be the focused one, hold the path exactly, and the name field must read as before, checked again
// on the observation just before the Return, so the Return can only reach the dialog's field and never save the
// document. Afterwards the dialog must be gone, the panel up and the panel's location pop-up must name the folder (not a
// listing entry), the name field as it was. Anything else fails closed: not ready, no Return, and no act. -> {ready} or
// {ready: false, reason, observed?}.
export const saveSheetDestinationCell = (controls = SAVE_PANEL_CONTROLS) => cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.destination
${saveSheet}
${[controlIndexOf, isInside, headOf, savePanelReading, savePanelStructure].map(f => f.toString()).join('\n')}
const __controls = ${j(controls)};
const __named = ax => { const i = __nameField(ax); return i === null ? null : plain(valueOfIndex(ax, i) ?? ""); };
let ax = await observe();
if (!__saveSheet(ax)) return {ready: false, reason: "the Save sheet was not up"};
const __name = __named(ax), __before = ax;
if (!["panel", "goTo", "goToField", "location"].every(k => typeof __controls[k]?.id === "string" && typeof __controls[k]?.role === "string")) {
  await __app.pressKey("super+shift+g");
  for (const end = Date.now() + 3000; ax === __before && Date.now() < end;) ax = await observe();
  return {ready: false, reason: "the save panel's controls are not identified yet: observation only, nothing typed and no Return", observed: {before: savePanelStructure(__before), after: savePanelStructure(ax)}};
}
let __r = savePanelReading(ax, __controls);
if (__r.panel === null || !isInside(ax, __nameField(ax), __r.panel)) return {ready: false, reason: "the save panel was not identified around the name field"};
const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
const __dir = globalThis.__saveDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), ${j(SAVE_DIR_PREFIX)}));
await __app.pressKey("super+shift+g");
for (const end = Date.now() + 3000; !__r.fieldFocused && Date.now() < end;) { ax = await observe(); __r = savePanelReading(ax, __controls); }
if (!__r.fieldFocused) return {ready: false, reason: "the Go To dialog and its focused path field were not identified"};
await __app.typeText(__dir);
ax = await observe(); __r = savePanelReading(ax, __controls);
if (!__r.fieldFocused || __r.fieldValue !== __dir || __named(ax) !== __name) return {ready: false, reason: "the path was not in the Go To dialog's focused field alone"};
await __app.pressKey("Return");
for (const end = Date.now() + 5000; __r.goTo !== null && Date.now() < end;) { ax = await observe(); __r = savePanelReading(ax, __controls); }
globalThis.__saveNameIndex = __saveSheet(ax) && __r.panel !== null ? __nameField(ax) : null;
if (globalThis.__saveNameIndex === null) return {ready: false, reason: "the Save sheet was not up after the Go To dialog"};
if (__r.goTo !== null) return {ready: false, reason: "the Go To dialog stayed up"};
if (__r.locationName !== path.basename(__dir)) return {ready: false, reason: "the panel's selected location is not the run's folder"};
if (__named(ax) !== __name) return {ready: false, reason: "the name field changed"};
return {ready: true};`);
export const SAVE_SHEET_DESTINATION_CELL = saveSheetDestinationCell();
export const saveSheetActCell = ({at}) => scheduledActCell('textedit', {at, act: `await __app.setValue(globalThis.__saveNameIndex, ${j(SAVE_NAME)});`, tag: 'savesheet.act'});
// -> {sheetOpen, nameWritten (whether the field reads the name set_value wrote; the probe's letters may follow it),
// destinationFiles (the run's folder's entries, at most ten; null when it could not be read)}.
export const SAVE_SHEET_CHECK_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.check
${saveSheet}
await new Promise(done => setTimeout(done, ${SAVE_SHEET_SETTLE_MS}));
const ax = await observe();
const __index = __saveSheet(ax) ? __nameField(ax) : null;
const fs = await import("node:fs");
let destinationFiles = null;
try { if (typeof globalThis.__saveDir === "string") destinationFiles = fs.readdirSync(globalThis.__saveDir).slice(0, 10); } catch {}
return {sheetOpen: __saveSheet(ax), nameWritten: __index !== null && plain(valueOfIndex(ax, __index) ?? "").startsWith(${j(SAVE_NAME)}), destinationFiles};`);
// Escape on the Save sheet (once more for a Go To dialog left up), the sheet awaited gone, then the run's folder removed
// when it is empty (a file in it is left as found). -> {cancelled, destinationRemoved}.
export const SAVE_SHEET_CANCEL_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.cancel
${saveSheet}
let ax = await observe();
for (let n = 0; n < 3 && __saveSheet(ax); n++) {
  await __app.pressKey("Escape");
  for (const end = Date.now() + 2000; __saveSheet(ax) && Date.now() < end;) ax = await observe();
}
let destinationRemoved = null;
if (typeof globalThis.__saveDir === "string") {
  const fs = await import("node:fs");
  try { fs.rmdirSync(globalThis.__saveDir); globalThis.__saveDir = null; destinationRemoved = true; } catch { destinationRemoved = false; }
}
return {cancelled: !__saveSheet(ax), destinationRemoved};`);

// Intervention fires: after the refusal, the last typed character's landing on the document. -> {landed}.
export const endsWithCell = (scene, text) => cell(`${prelude(scene)}
// cua-matrix-cell: intervention.landed
const ax = await observe();
const value = plain(valueOfIndex(ax, ${TEXT_FIELDS[scene]}) ?? "");
return {landed: value.endsWith(${j(text)})};`);
