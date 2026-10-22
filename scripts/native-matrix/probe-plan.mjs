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
import {sha256Hex} from './matrix-text.mjs';
import {TEXT_FIELDS, TYPED} from './plan.mjs';

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

// A text scene's typing field (./plan.mjs TEXT_FIELDS) emptied and given the focus. -> {ready} or {ready: false, reason}.
export const emptyFieldCell = scene => cell(`${prelude(scene)}
// cua-matrix-cell: field.empty
${emptyField(scene)}`);
// The body: shared with the Unicode matrix's prepare (./unicode-plan.mjs).
export const emptyField = scene => `let ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
const __find = ax => ${TEXT_FIELDS[scene]};
let __index = __find(ax);
if (__index === null) return {ready: false, reason: "the field is not in the text"};
if (plain(valueOfIndex(ax, __index) ?? "") !== "") { await __app.setValue(__index, ""); ax = await observe(); __index = __find(ax); }
if (__index !== null && focusedIndexOf(ax) !== __index) { await __app.click(__index); ax = await observe(); __index = __find(ax); }
const __empty = __index !== null && plain(valueOfIndex(ax, __index) ?? "") === "", __focused = __index !== null && focusedIndexOf(ax) === __index;
if (!__empty || !__focused) return {ready: false, reason: !__empty ? "the field could not be emptied" : "the field could not be given the focus"};
return {ready: true};`;

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

// Intervention fires: after the refusal, the last typed character's landing on the document. -> {landed}.
export const endsWithCell = (scene, text) => cell(`${prelude(scene)}
// cua-matrix-cell: intervention.landed
const ax = await observe();
const value = plain(valueOfIndex(ax, ${TEXT_FIELDS[scene]}) ?? "");
return {landed: value.endsWith(${j(text)})};`);
