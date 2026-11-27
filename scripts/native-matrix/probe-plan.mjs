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
import {elementLines, focusedIndexOf, lineOfIndex, parentIndexOf, selectedTextOf, sha256Hex, valueOfIndex} from './matrix-text.mjs';
import {FOCUS_REASONS, PANEL_UP, TEXT_FIELDS, TYPED} from './plan.mjs';

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

// The keystroke probe's answer when its first gate found the named window not in front (KeystrokeProbe.swift): nothing
// was sent.
export const KEYSTROKE_GATE_CLOSED = 'the front window is not the named one; nothing was sent';
// Why a keystroke probe's gate held its keys back, as KeystrokeProbe.swift answers it: the named window not the front
// one at the first gate, nothing sent (`error`, KEYSTROKE_GATE_CLOSED), or at a gate between its keys after some were
// posted (`aborted`). A gate is the probe working as built, so its answer is a reading of the front, never a fault of the
// probe. -> {at: 'first' | 'during', reason} or null.
export function keystrokeGate(answer) {
  if (answer?.aborted === true) return {at: 'during', reason: 'the named window left the front between the probe\'s keys: they stopped part-way'};
  if (answer?.error === KEYSTROKE_GATE_CLOSED) return {at: 'first', reason: 'the named window was not the front one when the probe\'s keys were due: nothing was sent'};
  return null;
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
// when it was needed; a trailer a selection still masks is its own reason (./plan.mjs FOCUS_REASONS). With `steps`
// (the composing groups' prepare, ruling 1229) it also says which calls it made, `did`: its setValue("") and its click,
// each true when made, so the harness's reads around the cell can be told apart; without, the body is unchanged.
// -> {ready, prepared?, did?} or {ready: false, reason, prepared?, did?}.
export const emptyFieldCell = (scene, options) => cell(`${prelude(scene)}
// cua-matrix-cell: field.empty
${emptyField(scene, options)}`);
// The body: shared with the Unicode matrix's prepare (./unicode-plan.mjs).
export const emptyField = (scene, {steps = false} = {}) => `let ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
const __find = ax => ${TEXT_FIELDS[scene]};
let __index = __find(ax);
if (__index === null) return {ready: false, reason: "the field is not in the text"};
const __prepared = [];${steps ? '\nconst __did = {setValue: false, click: false};' : ''}
if (plain(valueOfIndex(ax, __index) ?? "") !== "") {
  await __app.setValue(__index, "");${steps ? ' __did.setValue = true;' : ''} ax = await observe(); __index = __find(ax);
  // Named emptied only on a read-back that shows it empty (ruling 1204); else what the read-back showed.
  const __left = __index === null ? null : plain(valueOfIndex(ax, __index) ?? "").length;
  __prepared.push(__left === 0 ? "field emptied" : __left === null ? "emptying attempted, the field no longer in the text" : "emptying attempted, the field still read " + __left + " characters");
}
if (__index !== null && focusedIndexOf(ax) !== __index) { await __app.click(__index);${steps ? ' __did.click = true;' : ''} ax = await observe(); __index = __find(ax); }
const __empty = __index !== null && plain(valueOfIndex(ax, __index) ?? "") === "", __focus = __index === null ? "unfocused" : focusReading(ax, __index);
const __stated = __prepared.length ? {prepared: __prepared} : {};${steps ? '\n__stated.did = __did;' : ''}
if (!__empty || __focus !== "focused") return {ready: false, reason: !__empty ? "the field could not be emptied" : __focus === "masked" ? ${j(FOCUS_REASONS.masked)} : ${j(FOCUS_REASONS.unfocused)}, ...__stated};
return {ready: true, ...__stated};`;

// A text field read back by hash against `expected` (or, with `expected` null, its hash and length returned). The value
// stays in the cell; its hash is kept beside the verdict, so two engines' failures can be shown the same read-back
// (ruling 1144). -> {ok, outcome: {exact, nfcEqual, length, expectedLength, hash}} | {hash, length} | {invalid}.
export const fieldCheck = (scene, expected) => `const ax = await observe();
const __index = ${TEXT_FIELDS[scene]};
if (__index === null) return {invalid: "the field is not in the text"};
const __value = plain(valueOfIndex(ax, __index) ?? "");
const __hash = sha256Hex(__value);
${expected === null ? 'return {hash: __hash, length: __value.length};' : `const exact = __hash === ${j(sha256Hex(expected))};
return {ok: exact, outcome: {exact, nfcEqual: __value.normalize("NFC") === ${j(expected.normalize('NFC'))}, length: __value.length, expectedLength: ${expected.length}, hash: __hash}};`}`;
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
// A capitalised sentence of dictionary words, as the method rows type (./plan.mjs TYPED): TextEdit's autocorrection has
// nothing to rewrite. Pilot C-2 typed "cua sheet variant", a lower-case first word outside the dictionary, and both lanes
// read back something else (scripts/accept/textedit.mjs: TextEdit capitalises such a word as typing continues).
export const SHEET_TYPED = 'The sheet variant is typed here.';
// The untitled document typed into. What it read leaves as {length, hash, expectedLength, foldEqual (equal ignoring
// case), prefix (the text so far is a prefix of the one sent)} and the front it saw ({untitled, panel, saveSheet,
// focusedIsField}: whether a panel served by the panel service was up instead, ruling 1196 B), never the text.
// -> {typed: true, readBack, front} | {typed: false, reason, readBack?, front?}.
export const SHEET_TYPE_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: sheet.type
let ax = await observe();
if (windowTitleOf(ax) !== globalThis.__sheetDoc) return {typed: false, reason: "the untitled document is not TextEdit's front window"};
await __app.typeText(${j(SHEET_TYPED)});
ax = await observe();
const __index = ${TEXT_FIELDS.textedit};
const front = {untitled: windowTitleOf(ax) === globalThis.__sheetDoc, panel: panel(ax), saveSheet: ${PANEL_UP.savePanel}, focusedIsField: __index !== null && focusedIndexOf(ax) === __index};
if (__index === null) return {typed: false, reason: "the untitled document's text view is not in the text after typing", readBack: null, front};
const __value = plain(valueOfIndex(ax, __index) ?? ""), __sent = ${j(SHEET_TYPED)};
const readBack = {length: __value.length, hash: sha256Hex(__value), expectedLength: __sent.length, foldEqual: __value.toLowerCase() === __sent.toLowerCase(), prefix: __sent.startsWith(__value)};
if (__value === __sent) return {typed: true, readBack, front};
const how = __value === "" ? "read back empty" : readBack.foldEqual ? "same length, equal ignoring case" : readBack.prefix ? "a prefix of it" : __value.length === __sent.length ? "same length, other characters" : "another length";
return {typed: false, reason: "the untitled document's text read back differently: " + how + (front.untitled ? "" : "; its window was no longer TextEdit's front one") + (front.panel || front.saveSheet ? "; a panel was up" : ""), readBack, front};`);
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
// names) at the cell's time, a probe keystroke SAVE_SHEET_PROBE_BEFORE_MS before it (ruling 1228). The save sheet is told
// from the keep-or-delete sheet by its missing Delete button. Its name field's index is kept across cells
// (`__saveNameIndex`), so the act's call holds the set_value alone and its meta is its own. The check reads the sheet
// again after a settle, and the run's folder: the sheet still open and the folder empty are the proof that nothing
// committed it (the probe types two letters, no Return), and a save that did commit lands in the run's folder, not the
// one the sheet inherited. The cancel is Escape on the sheet (and on the Go To dialog, if left up), the run's folder
// then removed when empty; the untitled document closes as the sheet variant's does (CLOSE_UNTITLED_CELL). The panel's
// controls are those pilot C-5 read on both lanes (SAVE_PANEL_CONTROLS, ruling 1220), so the destination cell sets the
// run's folder and the cell acts; nothing is ever saved (rulings 1196, 1199).
export const SAVE_NAME = 'cua-212-intended';
// The run's own save folder, made under the runner's temporary directory by the destination cell.
export const SAVE_DIR_PREFIX = 'cua-212-save-';
// The probe's keystroke this long BEFORE set_value is sent, on both lanes alike (ruling 1228): inside the engine's
// "still interacting" window (Intervention.swift interventionDebounceMs, 5 s from the app's last attributed key), so
// cua's answer is a refusal before it acts, never a race with the request's receipt. Fixed: no attempt re-aims it.
export const SAVE_SHEET_PROBE_BEFORE_MS = 150;
// How long after the act the sheet is read again, for a commit that lands late.
export const SAVE_SHEET_SETTLE_MS = 2_000;
// The engine's clauses (Intervention.swift `Interruption`): a stop part-way, and the list of what may have taken effect.
export const STOPPED_PART_WAY = 'The action was stopped part-way.';
export const MAY_HAVE_TAKEN_EFFECT = 'may have taken effect';
// #212's findings on a row that reached the act (its outcome as ./probe-run.mjs saveSheetAttempt records it): the one
// rule its `ok` is, and what a step reading the row names when it failed (../hosted-sittings/checks.mjs). The sheet
// still open after the settle; nothing saved (ruling 1223, R1): the run's folder read and empty after the act and empty
// at the cancel, and no file behind TextEdit's window (AXDocument); on cua's lane the sentence and the account agreeing,
// and a stop part-way (only a stop: ruling 1228) naming what may have taken effect. Whether cua acted with the probe's
// key already in TextEdit is the witness's to add (./probe-run.mjs finishSaveSheetWitness). AXEdited is a diagnostic
// only, never a finding: C-6's vendor row read it false from the close button with nothing saved. -> the findings,
// none when the row passes.
export function saveSheetFindings(outcome, engine) {
  const o = outcome ?? {}, findings = [];
  if (o.sheetOpen !== true) findings.push('the Save sheet was gone after the act');
  if (!Array.isArray(o.destinationFiles)) findings.push('the run\'s folder was not read after the act');
  else if (o.destinationFiles.length) findings.push(`the run's folder held ${o.destinationFiles.join(', ')}`);
  if (o.unsaved?.document === true) findings.push('a document on disk behind TextEdit\'s window (AXDocument names a file)');
  else if (o.unsaved?.document !== false) findings.push('nothing saved was not proved (AXDocument unread)');
  if (o.cancel?.destinationFiles?.length) findings.push(`the run's folder held ${o.cancel.destinationFiles.join(', ')} at the cancel`);
  if (engine === 'cua' && o.agree !== true) findings.push('the sentence and the structured account disagree on what the request did');
  if (engine === 'cua' && o.stopped === true && o.effectsNamed !== true) findings.push('the stop part-way did not name what may have taken effect');
  return findings;
}
const saveSheet =`const __saveSheet = ax => /ID: saveAsNameTextField\\b/.test(ax) && !/ID: DontSaveButton\\b/.test(ax);
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
// panel's pop-up naming the selected folder. Read in pilot C-5 (save-sheet/{cua,vendor}/run-1, rows[0].outcome.observed,
// the same on both lanes; ruling 1220): the panel the sheet `save-panel`; the Go To dialog the sheet `GoToWindow`, shown
// apart from the panel (the observation then the dialog alone); its path field `PathTextField`, the identifier its line
// prints as its lone part before a value and labelled after, focused on opening; the location the pop-up `where popup`
// (its title "Where:", its value the folder's name). With any of them null the destination cell only observes (it opens
// the Go To dialog, records the panel's structure and closes the dialog, nothing typed, no Return).
export const SAVE_PANEL_CONTROLS = Object.freeze({panel: Object.freeze({id: 'save-panel', role: 'sheet'}), goTo: Object.freeze({id: 'GoToWindow', role: 'sheet'}),
  goToField: Object.freeze({id: 'PathTextField', role: 'text field'}), location: Object.freeze({id: 'where popup', role: 'pop up button'})});

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
// pop-up inside the panel and outside the dialog, and the folder it names (its value, else its bare title).
// The field is focused when the trailer names it (`focusVia` 'focus'), or (C-7, ruling 1226) when the trailer shows a
// selection in its place and nothing else can hold it: the Go To dialog a root of the observation, the path field its
// only text field, and the selection the field's whole value (`focusVia` 'selection'; macOS reopens Go To with its last
// path selected, and typing replaces it; another root's selection, the Save sheet's "Untitled", is not the field's). The
// selection is compared here only; its text never leaves.
// -> {panel, goTo, field, fieldFocused, focusVia, fieldValue, location, locationName}.
export function savePanelReading(ax, controls) {
  const panel = controlIndexOf(ax, controls.panel);
  // The Go To dialog inside the panel, or where Accessibility shows it apart (TextEdit's, C-5: the observation then the
  // dialog alone, the panel absent from it) the observation's own root.
  const goTo = [controlIndexOf(ax, controls.goTo)].find(at => isInside(ax, at, panel) || (panel === null && at !== null && parentIndexOf(ax, at) === null)) ?? null;
  const field = [controlIndexOf(ax, controls.goToField)].find(at => isInside(ax, at, goTo)) ?? null;
  const location = [controlIndexOf(ax, controls.location)].find(at => isInside(ax, at, panel) && !isInside(ax, at, goTo)) ?? null;
  const clean = text => (text === null || text === undefined ? null : String(text).replace(/\*\*/g, ''));
  const named = location === null ? null : clean(valueOfIndex(ax, location)) ?? (headOf(lineOfIndex(ax, location)).slice(controls.location.role.length).trim() || null);
  const role = controls.goToField.role;
  const fields = goTo === null ? [] : elementLines(ax).filter(l => (l.content === role || l.content.startsWith(`${role} `)) && isInside(ax, l.index, goTo));
  const onlyField = goTo !== null && parentIndexOf(ax, goTo) === null && fields.length === 1 && fields[0].index === field;
  const fieldValue = field === null ? null : clean(valueOfIndex(ax, field));
  const wholeSelected = Boolean(fieldValue) && clean(selectedTextOf(ax)) === fieldValue;
  const focusVia = field === null ? null : focusedIndexOf(ax) === field ? 'focus' : onlyField && wholeSelected ? 'selection' : null;
  return {panel, goTo, field, fieldFocused: focusVia !== null, focusVia, fieldValue, location, locationName: named};
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
// listing entry), the name field as it was. Anything else fails closed: not ready, no Return, and no act. The name field
// is compared before the Return wherever the observation shows it (TextEdit shows the Go To dialog apart, the sheet
// absent from the observation, C-5), and again once the dialog is gone. Every exit after super+shift+g closes the Go To
// dialog inside the cell (ruling 1219, s1: a dialog left up made the next cell's key window another one, and the
// cleanup's refusal stopped C-5's save-sheet runs), a throw included: Escape while it is up, at most three times, each
// awaited, then its CloseButton, the Save sheet left for the cleanup; `goTo` says what was tried and whether it closed,
// `threw` the throw. The panel's location before the Go To (`initialWhere`) is kept: where the document would have been
// saved (ruling 1220). Every exit, the ready one and those before super+shift+g included, carries `goTo` and the panel's
// structure on the observation it was judged on (`lastObservation`, savePanelStructure); a dialog or field not identified
// says which (`identification`: goTo not found, field not found, or field not focused within 3 s). Once the field is read
// focused, every exit says how (`goToField.focusVia`: 'focus', or 'selection' under a remembered path, C-7) and whether
// it opened pre-filled (`goToField.prefilled`: {present, length}, its value's length, else its selection's; never text).
// -> {ready, initialWhere, goTo, goToField, lastObservation} or {ready: false, reason, goTo, lastObservation, goToField?,
// identification?, observed?, threw?}.
export const saveSheetDestinationCell = (controls = SAVE_PANEL_CONTROLS) => cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.destination
${saveSheet}
${[controlIndexOf, isInside, headOf, savePanelReading, savePanelStructure].map(f => f.toString()).join('\n')}
const __controls = ${j(controls)};
const __named = ax => { const i = __nameField(ax); return i === null ? null : plain(valueOfIndex(ax, i) ?? ""); };
let ax = await observe();
const __identified = ["panel", "goTo", "goToField", "location"].every(k => typeof __controls[k]?.id === "string" && typeof __controls[k]?.role === "string");
const __goToUp = a => (__identified ? controlIndexOf(a, __controls.goTo) !== null : !__saveSheet(a) || /\bGoToWindow\b/.test(a));
// Out of the cell with the Go To dialog closed, every step in this one dispatch (rulings 1219 and 1221): Escape while it
// is up, at most three times, each awaited, the Save sheet left up; still up, the dialog's own CloseButton clicked. The
// Save sheet's own cancel is not reachable from here while the dialog is up (fix wave I7): the dialog is a sheet on the
// Save sheet, so it takes the keys and clicks, and the observation shows it alone, the sheet's CancelButton absent from
// it; so a dialog that outlives its CloseButton is said (sheetCancel 'unreachable'), never a cancel pretended.
// sheetUp is null while the observation shows the dialog alone (the sheet unseen, not gone).
const __goToIndex = a => controlIndexOf(a, __identified ? __controls.goTo : {id: "GoToWindow", role: "sheet"});
const __closeButton = a => { const g = __goToIndex(a), b = controlIndexOf(a, {id: "CloseButton", role: "button"}); return g !== null && b !== null && isInside(a, b, g) ? b : null; };
const __out = async result => {
  let a = await observe(), escapes = 0, closeClicked = false;
  const settle = async gone => { for (const end = Date.now() + 2000; !gone(a) && Date.now() < end;) a = await observe(); };
  for (; __goToUp(a) && escapes < 3; escapes++) { await __app.pressKey("Escape"); await settle(x => !__goToUp(x)); }
  if (__goToUp(a)) {
    const b = __closeButton(a);
    if (b !== null) { closeClicked = true; await __app.click(b); await settle(x => !__goToUp(x)); }
  }
  const up = __goToUp(a), sheetUp = __saveSheet(a) ? true : up ? null : false;
  return {...result, goTo: {closed: !up, sheetUp, escapes, closeClicked, ...(up ? {sheetCancel: "unreachable"} : {})}};
};
// Every exit, the ready one included, ends through __out with the observation it was judged on (C-6: a failed
// identification kept nothing to say which control did not match), taken before the dialog is closed.
let __goToField = null;
const __exit = result => __out({...result, ...(__goToField ? {goToField: __goToField} : {}), lastObservation: savePanelStructure(ax)});
// Everything after super+shift+g ends there, a throw included (fix wave I4: typeText answering typeUnconfirmed, a key or
// an observation throwing), the throw said on the result.
const __afterGoTo = async steps => {
  let result;
  try { result = await steps(); } catch (error) {
    result = {ready: false, reason: \`the cell threw after super+shift+g: \${error?.name ?? "Error"}\`, threw: {name: error?.name ?? null, message: String(error?.message ?? error).slice(0, 200)}};
  }
  return __exit(result);
};
if (!__saveSheet(ax)) return __exit({ready: false, reason: "the Save sheet was not up"});
const __name = __named(ax), __before = ax;
if (!__identified) return __afterGoTo(async () => {
  await __app.pressKey("super+shift+g");
  for (const end = Date.now() + 3000; ax === __before && Date.now() < end;) ax = await observe();
  return {ready: false, reason: "the save panel's controls are not identified yet: observation only, nothing typed and no Return", observed: {before: savePanelStructure(__before), after: savePanelStructure(ax)}};
});
let __r = savePanelReading(ax, __controls);
if (__r.panel === null || !isInside(ax, __nameField(ax), __r.panel)) return __exit({ready: false, reason: "the save panel was not identified around the name field"});
const __initialWhere = __r.locationName;
const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
const __dir = globalThis.__saveDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), ${j(SAVE_DIR_PREFIX)}));
return __afterGoTo(async () => {
  await __app.pressKey("super+shift+g");
  for (const end = Date.now() + 3000; !__r.fieldFocused && Date.now() < end;) { ax = await observe(); __r = savePanelReading(ax, __controls); }
  if (!__r.fieldFocused) {
    // Which part of the reading failed: the dialog, its path field inside it, or the field's focus.
    const identification = __r.goTo === null ? "goTo not found" : __r.field === null ? "field not found" : "field not focused within 3 s";
    return {ready: false, reason: "the Go To dialog and its focused path field were not identified (" + identification + ")", identification};
  }
  const __prefill = [...(__r.fieldValue ?? selectedTextOf(ax) ?? "")].length;
  __goToField = {focusVia: __r.focusVia, prefilled: {present: __prefill > 0, length: __prefill}};
  await __app.typeText(__dir);
  ax = await observe(); __r = savePanelReading(ax, __controls);
  if (!__r.fieldFocused || __r.fieldValue !== __dir || (__saveSheet(ax) && __named(ax) !== __name)) return {ready: false, reason: "the path was not in the Go To dialog's focused field alone"};
  await __app.pressKey("Return");
  for (const end = Date.now() + 5000; __r.goTo !== null && Date.now() < end;) { ax = await observe(); __r = savePanelReading(ax, __controls); }
  globalThis.__saveNameIndex = __saveSheet(ax) && __r.panel !== null ? __nameField(ax) : null;
  if (globalThis.__saveNameIndex === null) return {ready: false, reason: "the Save sheet was not up after the Go To dialog"};
  if (__r.goTo !== null) return {ready: false, reason: "the Go To dialog stayed up"};
  if (__r.locationName !== path.basename(__dir)) return {ready: false, reason: "the panel's selected location is not the run's folder"};
  if (__named(ax) !== __name) return {ready: false, reason: "the name field changed"};
  return {ready: true, initialWhere: __initialWhere};
});`);
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
// Escape on the Save sheet (once more for a Go To dialog left up), the sheet awaited gone, then the run's folder's
// entries read (at most ten; null unread or no folder) and the folder removed when it is empty (a file in it is left as
// found). -> {cancelled, destinationRemoved, destinationFiles}.
export const SAVE_SHEET_CANCEL_CELL = cell(`${prelude('textedit')}
// cua-matrix-cell: savesheet.cancel
${saveSheet}
let ax = await observe();
for (let n = 0; n < 3 && __saveSheet(ax); n++) {
  await __app.pressKey("Escape");
  for (const end = Date.now() + 2000; __saveSheet(ax) && Date.now() < end;) ax = await observe();
}
let destinationRemoved = null, destinationFiles = null;
if (typeof globalThis.__saveDir === "string") {
  const fs = await import("node:fs");
  try { destinationFiles = fs.readdirSync(globalThis.__saveDir).slice(0, 10); } catch {}
  try { fs.rmdirSync(globalThis.__saveDir); globalThis.__saveDir = null; destinationRemoved = true; } catch { destinationRemoved = false; }
}
return {cancelled: !__saveSheet(ax), destinationRemoved, destinationFiles};`);

// ---- Acceptance 3's keystroke witness ---------------------------------------------------------------------------------
// In TextEdit's background click with Finder's window in front (./plan.mjs isAcceptance3), after the click and its check:
// a probe keystroke, gated on the run's Finder window, types a run-owned file's name, which Finder's list must select
// (type-select), while TextEdit's document keeps its value (S L238: Finder kept the keyboard focus, the document took no
// key). The file is the seventh, or the eighth when the seventh is already the one selected, so the selection must move.
export const WITNESS_FILES = Object.freeze(['scene-file-007', 'scene-file-008']);
// The probe's time ahead of its launch: the launch and its gate's first reading fit inside it.
export const WITNESS_LEAD_MS = 1_500;
const onlySelected = 'const __only = (ax, name) => { const s = selectedIndexesOf(ax), row = rowIndexOfName(ax, name); return row !== null && s.length === 1 && s[0] === row; };';
// -> {target}.
export const WITNESS_PREPARE_CELL = cell(`${prelude('finder')}
// cua-matrix-cell: witness.prepare
${onlySelected}
const ax = await observe();
return {target: __only(ax, ${j(WITNESS_FILES[0])}) ? ${j(WITNESS_FILES[1])} : ${j(WITNESS_FILES[0])}};`);
// Finder's list read for the file alone selected, and TextEdit's document against its value before the click (the click
// case's prepare kept it in `__m.before`); both through the lane's observations of the run's own windows, booleans out.
// -> {finderSelected, documentUnchanged}.
export const witnessCheckCell = target => cell(`${prelude('finder')}
// cua-matrix-cell: witness.check
${onlySelected}
const ax = await observe();
const __doc = globalThis.__apps?.textedit;
const __text = __doc ? await __doc.getAXState({emit: false, disableDiffing: true}) : "";
const __value = plain(valueOfIndex(__text, indexOfId(__text, "First Text View")) ?? "");
return {finderSelected: __only(ax, ${j(target)}), documentUnchanged: typeof globalThis.__m?.before === "string" && __value === globalThis.__m.before};`);

// Intervention fires: after the refusal, the last typed character's landing on the document. -> {landed}.
export const endsWithCell = (scene, text) => cell(`${prelude(scene)}
// cua-matrix-cell: intervention.landed
const ax = await observe();
// A real reading of the value, never the end of raw escaped text (#526, ruling 1185).
const reading = valueReadingOf(ax, ${TEXT_FIELDS[scene]});
return {landed: reading.real && plain(reading.value ?? "").endsWith(${j(text)})};`);
