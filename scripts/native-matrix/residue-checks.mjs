// M2a's residue as cells (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2b.1b; the Decision Log's
// "M2b pre-flight" items 1 and 2, "M2a.5 hold", "menu activation held from the record" and "M2a vendor reading" item 6):
// the pure parts of the five cells ./live.mjs runs on the hold harness — route4, minimized-select, enablement, menu,
// hscroll — their verdicts, their rows, and the one adapter that writes a live command's result as the matrix's
// CellResult (./cell-result.mjs), so `native-matrix.mjs summary` reads these cells like any matrix cell. No I/O here.
//
// What leaves the device is what the device side returns: booleans, ranges and scroll-bar values of the run's own
// documents, routes, error names and bounded sentences, bundle ids of apps that activated. No document text but whether
// it holds what the cell put there.
import {cellResult} from './cell-result.mjs';
import {MENU_ITEMS} from './live-checks.mjs';

// ---- The cells, by their registry names ----------------------------------------------------------------------------

// Each residue cell's registry name is its live.mjs command.
export const RESIDUE_CELLS = Object.freeze(['route4', 'minimized-select', 'enablement', 'menu', 'hscroll']);
export const isResidueCell = command => RESIDUE_CELLS.includes(command);

// The selection the minimized-select cell writes, and the one it sets first so a write that did not land is told from one
// that did (two lines of the run's document, each once in it).
export const SELECT_BEFORE = 'Line 01';
export const SELECT_MINIMIZED = 'Line 10';

// ---- route4 ------------------------------------------------------------------------------------------------------

// The prepared home's engine.json: the owner's own settings as read (peerPolicy, routes; read only, never written),
// with `bundleId` given route 4. -> the JSON object.
export function preparedEngineSettings(owner, bundleId) {
  const settings = {};
  if (owner && typeof owner === 'object' && !Array.isArray(owner)) {
    if (owner.peerPolicy !== undefined) settings.peerPolicy = owner.peerPolicy;
    if (owner.routes && typeof owner.routes === 'object' && !Array.isArray(owner.routes)) settings.routes = {...owner.routes};
  }
  settings.routes = {...settings.routes, [bundleId]: 4};
  return settings;
}

// A range the probe read that is a caret: readable, with a zero length. An unreadable read is never one.
const isCaret = range => Number.isInteger(range?.location) && range.length === 0;

// Route 4's click (a synthesized click into the background scene app, the user window in front) judged by outcome: the
// click landed (the selection set before it, read by the probe, collapsed to a caret the probe reads: `landedRange`,
// never the observation's selected text, which a focus read that failed leaves empty too), it went by route 4, and afterwards the user's app is
// frontmost again (lsappinfo), the user's window is the top window (CGWindowList), and the engine read the user's key
// window back (keyWindowRestored). The activations the watcher saw are recorded, not judged (route 4 activates by
// design). -> {valid, invalid?, ok, outcome}.
export function route4Verdict(steps) {
  const s = steps ?? {};
  const invalid = !s.override?.read ? 'the engine did not read the prepared home\'s route-4 override'
    : s.userInFrontBefore !== true ? 'the user window was not in front before the click'
      : s.prepared !== true ? 'the selection the click should collapse could not be set'
        : !s.click ? 'the click was not sent' : null;
  const outcome = {
    landed: isCaret(s.landedRange), route: s.click?.route ?? null, clickOk: s.click?.ok ?? null, errorName: s.click?.errorName ?? null,
    frontRestored: s.after?.frontRestored ?? null, topWindowRestored: s.after?.topWindowRestored ?? null,
    keyWindowRestored: s.click?.keyWindowRestored ?? null, activations: (s.activations ?? []).map(a => `${a.kind} ${a.bundleId ?? 'unknown'}`),
    routeAdvice: 'not exercised: three route-3 guard failures in a row need an app that takes the front during the guard, which no scene does without contrivance (RouteAdviceTests cover it)',
  };
  const ok = !invalid && outcome.clickOk === true && outcome.landed === true && outcome.route === 4 && outcome.frontRestored === true
    && outcome.topWindowRestored === true && outcome.keyWindowRestored === true;
  return {valid: !invalid, ...(invalid ? {invalid} : {}), ok, outcome};
}

// ---- minimized-select ------------------------------------------------------------------------------------------------

// The selection's range in the document (UTF-16 offsets, as AXSelectedTextRange counts them). -> {location, length} or null.
export function rangeOf(value, text) {
  if (typeof value !== 'string') return null;
  const at = value.indexOf(text);
  return at < 0 || value.indexOf(text, at + 1) >= 0 ? null : {location: at, length: text.length};
}
const sameRange = (a, b) => Boolean(a && b) && a.location === b.location && a.length === b.length;

// An engine error that says nothing about the case: the user intervened, or the engine timed out (a busy machine).
const INCONCLUSIVE_ERRORS = Object.freeze(['userIntervened', 'timeoutReached']);
// select_text's error as the write's outcome: the minimized-window refusal with nothing posted is the refusal the rule
// would be; any other error (an element or lineage no longer valid, a refusal after posting) is a failure. null when it
// answered ok. (An inconclusive error never reaches here: it makes the sample invalid.)
const selectFailure = select => (select.ok === true ? null
  : select.errorName === 'windowMinimized' ? (select.posted === false ? 'refused (windowMinimized)' : 'failed (windowMinimized, after posting)')
    : `failed (${select.errorName ?? 'an error'})`);

// select_text into a minimized window, told apart (the M2a.5 hold's item 2: it answered ok and the observation showed no
// selection): the write, read by `--probe text-view` (AXSelectedTextRange on the text area itself, past the focused
// element) while the window is still minimized; the engine's read, its observation's selected text then; and both again
// once the window is back. The decision (refuse select_text into a minimized window, or keep it) follows from which
// failed. -> {valid, invalid?, write, read, restored, decision}.
export function minimizedSelectVerdict(steps) {
  const s = steps ?? {};
  const unminimized = ['select', 'probeMinimized', 'engineMinimized'].find(name => s[name] && (s[name].minimizedBefore === false || s[name].minimizedAfter === false));
  const invalid = s.problem ? s.problem
    : unminimized ? `the window was not minimized around ${unminimized}`
      : !sameRange(s.prior?.range, s.expected?.before) ? 'the selection set before minimizing did not read back'
        : !s.select ? 'select_text was not sent'
          : s.select.ok !== true && INCONCLUSIVE_ERRORS.includes(s.select.errorName) ? `select_text ended ${s.select.errorName}: the sample says nothing about a minimized window`
            : !s.probeMinimized?.range ? 'the text view could not be read while minimized' : null;
  const expected = s.expected?.minimized ?? null;
  const failure = invalid ? null : selectFailure(s.select);
  const write = invalid ? null : failure ? failure
    : sameRange(s.probeMinimized.range, expected) ? 'landed' : sameRange(s.probeMinimized.range, s.expected?.before) ? 'did not land' : 'landed elsewhere';
  const read = invalid ? null : s.engineMinimized?.selectedText === SELECT_MINIMIZED ? 'saw it'
    : write === 'landed' ? 'missed it' : 'nothing to see';
  const restored = s.restored ? {probe: sameRange(s.restored.range, expected), engine: s.restored.selectedText === SELECT_MINIMIZED} : null;
  const decision = invalid ? null
    : write === 'landed' ? (read === 'saw it' ? 'keep select_text into a minimized window: the write lands and the observation shows it'
      : 'keep select_text into a minimized window: the write lands; the observation of a minimized window does not show the selection (a read gap, not a write failure)')
      : write.startsWith('refused') ? 'select_text is refused already; nothing to decide'
        : write.startsWith('failed') ? null
          : 'refuse select_text into a minimized window: it answers ok and the selection does not change';
  return {valid: !invalid, ...(invalid ? {invalid} : {}), write, read, restored, decision};
}

// ---- enablement ------------------------------------------------------------------------------------------------------

// The fixture's accessibility record (JSON lines {at, enabled, source}) parsed, unreadable lines dropped.
export const parseAccessibilityRecord = text => String(text ?? '').split('\n').flatMap(line => {
  try { const r = JSON.parse(line); return typeof r?.enabled === 'boolean' && Number.isFinite(r.at) ? [r] : []; } catch { return []; }
});
// The mode at `t` by the record: the last reading at or before it (null before the first).
export const modeAt = (record, t) => [...record].filter(r => r.at <= t).at(-1)?.enabled ?? null;

// Enablement released (M2a.4 item 3; the critique's A3), judged by Chromium's own mode as the Electron fixture records it
// (app.isAccessibilitySupportEnabled and its change event), never by the attribute's readback: off before the cell,
// on after a connection's observation, off again after that connection closed; twice, the second connection proving the
// release left the app re-enableable. Chrome for Testing is not judged (`chrome`). -> {valid, invalid?, cycles, released}.
export function enablementVerdict(steps) {
  const s = steps ?? {};
  const invalid = s.problem ? s.problem
    : s.initial !== false ? `Chromium's mode read ${s.initial === true ? 'on' : 'nothing'} before the cell: the engine would not own the attribute, so its release says nothing`
      : null;
  const cycles = (s.cycles ?? []).map(c => ({enabledByObservation: c.enabledAt != null, releasedAfterClose: c.releasedAt != null,
    releaseMs: c.releasedAt != null && c.closedAt != null ? c.releasedAt - c.closedAt : null, attributePrior: c.engine?.prior ?? null}));
  const released = !invalid && cycles.length === 2 && cycles.every(c => c.enabledByObservation && c.releasedAfterClose);
  return {valid: !invalid, ...(invalid ? {invalid} : {}), cycles, released};
}
export const CHROME_NOT_JUDGED = 'Chrome for Testing is not judged: its accessibility mode is readable only through chrome://accessibility, a WebUI page that needs a second tab or window in the scene\'s process, or CDP\'s Accessibility domain, whose enable itself turns renderer accessibility on; the enablement attribute\'s readback is AppKit\'s, not Chromium\'s mode (Surprises, M2a.5 enablement). The release path is the same engine code for both attributes; Electron\'s AXManualAccessibility is judged.';

// ---- menu ------------------------------------------------------------------------------------------------------------

// One cua menu item's label (./live-checks.mjs menuItemLabel) as a row: ground truth is the item acting (Select All
// selects the document, Bold bolds its first line), on either engine. An item whose lane lost the background condition
// is invalid; one the lane never reached likewise.
const LABEL_INVALID = ['invalid', 'unattempted'];
const menuRow = (id, engine, label, extra) => ({section: 'residue', id: `menu/textedit-behind-finder/${id}`, engine, sample: 1,
  ok: label === 'acts', ...(LABEL_INVALID.includes(label) ? {invalid: `the item is ${label}`} : {}), scene: 'textedit', user: 'finder', regime: 'background', method: 'click', outcome: {label, ...extra}});

// ---- hscroll ---------------------------------------------------------------------------------------------------------

// One lane's horizontal scroll by its read-back position: the scene's horizontal scroll bar's value before (both bars
// set mid-way by the probe, so a scroll either way shows) and after, read by `--probe text-view` for either engine alike.
// The lane is judged only from a usable start (hscrollStartProblem), and its motion is the lane's only when its scroll
// was carried out (cua's: answered ok, posted; the vendor's: its cell found the text area and its scroll returned).
// cua's own failure to scroll is its failure; the vendor's, an intervention or a timeout say nothing. `direction` is
// where the content went: `right` (the bar's value grew: what "right" asks for), `left` (the opposite sign), `none`. -> {valid, invalid?, sent, scrollError?, direction, moved, before, after}.
export const HSCROLL_START_BAND = Object.freeze([0.2, 0.8]);
const HSCROLL_EPSILON = 0.001;
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Why a lane's start, its reading before the scroll (residue-device.mjs hscrollRead with the start written), gives no
// evidence, or null; each lane refuses to send its scroll on one. A bar read mid-way; horizontally scrollable content,
// which the bar reading the written value does not show: hold 1 (2026-10-21) read TextEdit's page view laid out within
// its window take 0.5 on a disabled bar and move nothing, so the bar must not read disabled and the start's write,
// made after the far end, must have moved the content (the probe's `contentMoved`); and the text area's midpoint
// showing, so the element scroll's preparation (positionElement, the vendor's and cua's alike: Positioning.swift) has
// nothing to move before the wheel.
export function hscrollStartProblem(before) {
  const horizontal = finite(before?.horizontal), moved = before?.set?.horizontal?.contentMoved;
  const [low, high] = HSCROLL_START_BAND;
  return horizontal === null ? `the scene shows no horizontal scroll bar to read${before?.error ? ` (${before.error})` : ''}`
    : horizontal < low || horizontal > high ? `the horizontal bar did not start mid-way (read ${horizontal}): a scroll one way could not show`
      : before.horizontalEnabled === false ? 'no horizontally scrollable content: the horizontal scroll bar is disabled'
        : moved !== true ? `no horizontally scrollable content: the content did not move when the start was written${moved === false ? '' : ' (its position could not be read)'}`
          : before.midpointShows !== true ? 'the text area\'s midpoint did not show before the scroll: the element scroll\'s preparation would move the view before the wheel'
            : null;
}
export function hscrollLane(lane, engine) {
  const before = finite(lane?.before?.horizontal), after = finite(lane?.after?.horizontal), scroll = lane?.scroll ?? null;
  const sent = engine === 'vendor' ? scroll?.found === true && scroll?.scrolled === true : scroll?.ok === true && scroll?.posted === true;
  const scrollError = sent ? null : !scroll ? 'not sent'
    : engine === 'vendor' ? (scroll.found === false ? 'the vendor found no text area' : scroll.scrollError ?? 'not scrolled') : scroll.errorName ?? 'nothing posted';
  const saysNothing = !sent && (engine === 'vendor' || !scroll || INCONCLUSIVE_ERRORS.includes(scroll.errorName));
  const invalid = lane?.problem ? lane.problem : hscrollStartProblem(lane?.before)
    ?? (saysNothing ? `the scroll was not carried out (${scrollError})`
      : sent && after === null ? `the horizontal bar was not read after the scroll (${lane?.after?.error ?? 'no value'})`
        : lane?.userInFront === false ? 'the user window left the front' : null);
  const direction = invalid || !sent ? null : after > before + HSCROLL_EPSILON ? 'right' : after < before - HSCROLL_EPSILON ? 'left' : 'none';
  return {valid: !invalid, ...(invalid ? {invalid} : {}), sent, ...(sent ? {} : {scrollError}), direction, moved: direction === 'right', before, after};
}
export const HSCROLL_DEFECT = 'the vendor\'s one-wheel horizontal scroll moves nothing, either way, from a mid-way start (its delta rides in the second wheel of a one-wheel event); declared as the vendor\'s defect, as Finder\'s capped item count is (M2a vendor reading item 6)';
// The verdict of item 6, by direction, on two valid lanes whose scrolls were carried out: the vendor's moving as cua's
// does is equivalent; moving nothing (where cua's moves) is its defect, declared; moving the other way is a sign
// difference, recorded and not declared.
export function hscrollVerdict(cua, vendor) {
  const c = hscrollLane(cua, 'cua'), v = hscrollLane(vendor, 'vendor');
  const verdict = !c.valid || !v.valid ? 'no verdict: a lane is not valid'
    : !c.sent ? `cua's scroll failed (${c.scrollError})`
      : c.direction === 'none' ? 'cua\'s horizontal scroll moves nothing'
        : v.direction === c.direction ? 'equivalent: the vendor\'s moves as cua\'s does'
          : v.direction === 'none' ? 'vendor defect: its one-wheel horizontal scroll moves nothing where cua\'s moves'
            : `opposite sign: the vendor's scroll moves ${v.direction} where cua's moves ${c.direction}`;
  return {cua: c, vendor: v, verdict, vendorDefect: verdict.startsWith('vendor defect'), oppositeSign: verdict.startsWith('opposite sign')};
}

// ---- Rows and the adapter --------------------------------------------------------------------------------------------

const row = (id, engine, judged, extra = {}) => ({section: 'residue', id, engine, sample: 1, ok: judged.valid === true && judged.ok === true,
  ...(judged.valid === false ? {invalid: judged.invalid} : {}), ...extra});

// A residue command's check as matrix rows (Row in ./cell-result.mjs). -> [Row].
export function residueRows(command, check) {
  if (!check) return [];
  if (command === 'route4') {
    const v = route4Verdict(check.steps);
    return [row('route4/textedit-behind-finder/click', 'cua', v, {scene: 'textedit', user: 'finder', regime: 'background', method: 'click',
      case: 'synthesized element click', inputRoute: v.outcome.route, outcome: v.outcome})];
  }
  if (command === 'minimized-select') {
    const v = minimizedSelectVerdict(check.steps);
    const base = {scene: 'textedit', method: 'select_text', case: 'minimized window', inputRoute: check.steps?.select?.route ?? null};
    return [
      row('minimized-select/textedit/write', 'cua', {valid: v.valid, invalid: v.invalid, ok: v.write === 'landed' || v.write === 'refused (windowMinimized)'}, {...base, outcome: {write: v.write}}),
      row('minimized-select/textedit/read', 'cua', {valid: v.valid && v.write === 'landed', invalid: v.invalid ?? 'the write did not land: nothing to read', ok: v.read === 'saw it'},
        {...base, outcome: {read: v.read, restored: v.restored}}),
    ];
  }
  if (command === 'enablement') {
    const v = enablementVerdict(check.steps);
    return (v.valid ? v.cycles : [{}, {}]).map((c, i) => row(`enablement/electron/release-${i + 1}`, 'cua',
      {valid: v.valid, invalid: v.invalid, ok: c.enabledByObservation === true && c.releasedAfterClose === true}, {scene: 'electron', outcome: c}));
  }
  if (command === 'menu') {
    const items = check.comparison?.items ?? {};
    return Object.keys(MENU_ITEMS).flatMap(id => [
      ...(items[id]?.cua ? [menuRow(id, 'cua', items[id].cua.label, {enabled: items[id].cua.enabled, effect: items[id].cua.effect, route: items[id].cua.route ?? null})] : []),
      ...(items[id]?.vendor ? [menuRow(id, 'vendor', items[id].vendor.label, {enabled: items[id].vendor.enabled, effect: items[id].vendor.effect})] : []),
    ]);
  }
  if (command === 'hscroll') {
    const v = hscrollVerdict(check.cua, check.vendor);
    const base = {scene: 'textedit', user: 'finder', regime: 'background', method: 'scroll', case: 'right, 1 page, wide page'};
    return [
      row('hscroll/textedit-wide-page/right', 'cua', {...v.cua, ok: v.cua.moved}, {...base, inputRoute: check.cua?.scroll?.route ?? null,
        outcome: {direction: v.cua.direction, before: v.cua.before, after: v.cua.after, ...(v.cua.sent ? {} : {scrollError: v.cua.scrollError})}}),
      row('hscroll/textedit-wide-page/right', 'vendor', {...v.vendor, ok: v.vendor.moved}, {...base, outcome: {direction: v.vendor.direction, before: v.vendor.before, after: v.vendor.after,
        ...(v.vendor.sent ? {} : {scrollError: v.vendor.scrollError}), verdict: v.verdict},
        ...(v.vendorDefect ? {declared: {kind: 'vendor-defect', cause: HSCROLL_DEFECT}} : {})}),
    ];
  }
  return [];
}

// The rows a residue cell cannot be judged without, by (id, engine): every lane and item it compares. (The minimized-
// select read row is not: it has something to read only when the write landed.)
const MANDATORY_ROWS = {
  route4: () => [['route4/textedit-behind-finder/click', 'cua']],
  'minimized-select': () => [['minimized-select/textedit/write', 'cua']],
  enablement: () => [1, 2].map(i => [`enablement/electron/release-${i}`, 'cua']),
  menu: () => Object.keys(MENU_ITEMS).flatMap(id => ['cua', 'vendor'].map(engine => [`menu/textedit-behind-finder/${id}`, engine])),
  hscroll: () => ['cua', 'vendor'].map(engine => ['hscroll/textedit-wide-page/right', engine]),
};
// The mandatory evidence a cell's rows lack: each mandatory row missing or invalid, as `<id> (<engine>): <why>`. A
// cell with any is incomplete (./cell-result.mjs: an incomplete cell never passes), its invalid rows kept. -> [string].
export function residueGaps(command, rows) {
  return (MANDATORY_ROWS[command]?.() ?? []).flatMap(([id, engine]) => {
    const found = rows.find(r => r.id === id && r.engine === engine);
    return !found ? [`${id} (${engine}): not measured`] : found.invalid ? [`${id} (${engine}): ${found.invalid}`] : [];
  });
}
export const gapProblem = gap => `no valid evidence: ${gap}`;

// The lanes a residue cell measured: cua's engine through its socket (no host), and the vendor's through the vendor
// host for the cells that compare. -> [{host, engine, build, version}].
export function residueLanes(command, live) {
  const lanes = [{host: null, engine: 'cua', build: live?.engine?.build ?? null, version: live?.engine?.engineVersion ?? null}];
  if (['menu', 'hscroll'].includes(command)) lanes.push({host: 'vendor', engine: 'vendor', build: live?.vendor?.release ?? null, version: null});
  return lanes;
}

// The one adapter: a live command's result (schema native-live-1, ./live.mjs) as a CellResult. The live result's own
// fields stay (check, putBack, recovery, frontApp, ... : every read path the runbook names), the CellResult's
// (schema, cell, lanes, verdict, rows; complete and problems kept) are laid over them.
export function asCellResult(command, live) {
  const rows = residueRows(command, live.check);
  const gaps = live.refused ? [] : residueGaps(command, rows).map(gapProblem);
  const problems = [...(live.problems ?? []), ...gaps.filter(gap => !(live.problems ?? []).includes(gap))];
  const shaped = cellResult({cell: command, device: live.device ?? null, started: live.started, finished: live.finished ?? new Date().toISOString(),
    lanes: residueLanes(command, live), complete: live.complete === true && gaps.length === 0, refused: Boolean(live.refused), problems,
    rows, ...(live.putBack !== undefined && live.putBack !== null ? {putBack: live.putBack} : {})});
  return {...live, ...shaped};
}

// The minimized-select cell's expected ranges in the run's document value. -> {before, minimized}.
export const minimizedSelectRanges = value => ({before: rangeOf(value, SELECT_BEFORE), minimized: rangeOf(value, SELECT_MINIMIZED)});
