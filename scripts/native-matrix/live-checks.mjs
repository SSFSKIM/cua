// The live hold's pure parts (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2a.5, "Live on the mini";
// the Decision Log's "M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.2" and "M2a.4" entries): what the checks of
// ./live.mjs and ./live-device.mjs read off cua's Skyshots and the vendor's text, how each check's result is judged,
// the refusals before anything is prepared, and the put-back plan. No I/O here.
//
// What leaves the device is what these return: booleans, counts, element indexes, error names and the engine's bounded
// sentences, input-source ids. The scenes' windows are all the run's own; even so no document text is returned, only
// whether it holds what the check put there.
import {SCENE_BUNDLE_IDS, textEditDocument} from '../repl-parity/scenes-mac.mjs';

const DOCUMENT = textEditDocument().lines;
// The run's TextEdit document's first and last lines (scenes-mac.mjs): a selection that holds both holds the whole.
export const FIRST_LINE = DOCUMENT[0];
export const LAST_LINE = DOCUMENT.at(-1);
export const KOREAN_2SET = 'com.apple.inputmethod.Korean.2SetKorean';
export const ABC = 'com.apple.keylayout.ABC';
// The owner's apps the hold never observes or drives under any rule (Chrome, any channel, and Claude Desktop). The
// put-back may still give one of them the front back by activation alone (maws-3f, 2026-10-21: NSRunningApplication's
// activate, no posted event, no Accessibility), read before and after with lsappinfo only.
export const NEVER_OBSERVED = Object.freeze(['com.google.Chrome', 'com.google.Chrome.beta', 'com.google.Chrome.dev', 'com.google.Chrome.canary',
  'com.anthropic.claudefordesktop']);
// The menu check's two items (the vendor reading's item 10): items AppKit validates against the key window's responder
// chain, so a background app may read them disabled or not act on them without activation.
export const MENU_ITEMS = Object.freeze({
  selectAll: Object.freeze({menu: 'Edit', path: Object.freeze(['Select All'])}),
  bold: Object.freeze({menu: 'Format', path: Object.freeze(['Font', 'Bold'])}),
});
// The paste check's three lines of the run's document, one replaced by each paste (a plain paste, a Markdown paste,
// type_text's paste route).
export const PASTE_TARGETS = Object.freeze(['Line 10', 'Line 11', 'Line 12']);
if (!PASTE_TARGETS.every(line => DOCUMENT.filter(l => l === line).length === 1)) throw new Error('the paste check\'s lines are not in the run\'s document once each');
const MESSAGE_CHARS = 300;

// ---- cua's Skyshots ----------------------------------------------------------------------------------------------

const nodesOf = shot => [...(Array.isArray(shot?.nodes) ? shot.nodes : []), ...(Array.isArray(shot?.menuBar) ? shot.menuBar : [])];
export const textArea = shot => nodesOf(shot).find(n => n.role === 'AXTextArea') ?? null;
export const minimizeButton = shot => nodesOf(shot).find(n => n.role === 'AXButton' && n.subrole === 'AXMinimizeButton') ?? null;
export const menuBarItem = (shot, title) => (Array.isArray(shot?.menuBar) ? shot.menuBar : []).find(n => n.role === 'AXMenuBarItem' && n.title === title) ?? null;

// The menu item at `path` (titles, outermost first) in a menu-rooted observation: each step searched only inside the
// previous one's subtree (preorder, by depth). Null when a step is not exposed (a submenu filled only once opened).
export function menuItemAt(shot, path) {
  const nodes = nodesOf(shot);
  let from = 0, to = nodes.length, found = null;
  for (const title of path) {
    const at = nodes.slice(from, to).findIndex(n => n.role === 'AXMenuItem' && n.title === title);
    if (at < 0) return null;
    const i = from + at;
    found = nodes[i];
    let end = i + 1;
    while (end < to && nodes[end].depth > found.depth) end++;
    from = i + 1;
    to = end;
  }
  return found;
}

// Whether a selection is the whole of the run's document (its first line through its last).
export const allSelected = selected => typeof selected === 'string' && selected.startsWith(FIRST_LINE) && selected.trimEnd().endsWith(LAST_LINE);
// Whether the document's first line renders bold (the Markdown the engine and the vendor read off the attributed value).
export const firstLineBold = markdown => typeof markdown === 'string' && markdown.includes(`**${FIRST_LINE}**`);

// An engine error as a result keeps it: its name, its sentence bounded, the route, whether any event was posted, and
// the activation guard's time when one ran (a failed guard keeps it, M2a.2).
export function failureOf(error) {
  const meta = error?.meta ?? null;
  return {errorName: error?.errorName ?? null, message: String(error?.message ?? error).slice(0, MESSAGE_CHARS),
    ...(meta?.inputRoute !== undefined ? {route: meta.inputRoute} : {}), posted: meta?.startedAt != null,
    ...(meta?.activationGuardMs != null ? {activationGuardMs: meta.activationGuardMs} : {})};
}

// ---- System alerts (the paste check) -------------------------------------------------------------------------------

// The system-alert processes, by bundle id, with the names they run under (owner names can be localized; these are the
// process names). Only these are ever read for text, through the engine; never Chrome or Claude Desktop.
const ALERT_PROCESSES = Object.freeze({
  'com.apple.UserNotificationCenter': 'UserNotificationCenter',
  'com.apple.coreservices.uiagent': 'CoreServicesUIAgent',
  'com.apple.SecurityAgent': 'SecurityAgent',
  'com.apple.universalAccessAuthWarn': 'universalAccessAuthWarn',
});
const ALERT_KEYWORDS = Object.freeze(['pasteboard', 'paste', 'clipboard', '붙여넣', '클립보드']);
// The layer below which a new window of another process counts as a possible alert (the Dock, the menu bar, status
// items and menus sit at 20 and above).
const ALERT_LAYER_BELOW = 20;
const alertProcessOf = w => {
  if (NEVER_OBSERVED.includes(w.ownerBundleId)) return null;
  if (Object.hasOwn(ALERT_PROCESSES, w.ownerBundleId ?? '')) return w.ownerBundleId;
  if (w.ownerBundleId == null) return Object.keys(ALERT_PROCESSES).find(id => ALERT_PROCESSES[id] === w.ownerName) ?? null;
  return null;
};
// The paste check's alert watch, between the screen before the section (`before`) and now (./system-windows.swift):
// a window of a system-alert process (there before or not), a window whose title holds a pasteboard keyword, or any new
// window of another process below the menu and Dock layers aborts the section; the run's own processes never do. What
// may leave the device (`export`) is sanitized: an alert process's bundle id and layer; for a title match only the
// keyword; for anything else only its layer, counted. `readable` names the alert processes whose text the engine may
// read; no other owner is ever observed.
// -> {abort, export: {alerts, keywords, unknown: {count, windows}}, readable: [{bundleId}]}.
export function alertWatch(before, now, {runPids}) {
  const known = new Set((before ?? []).map(w => w.number));
  const alerts = [], keywords = [], unknown = [];
  for (const w of now ?? []) {
    if (runPids.includes(w.ownerPid)) continue;
    const bundleId = alertProcessOf(w);
    const keyword = ALERT_KEYWORDS.find(k => String(w.name ?? '').toLowerCase().includes(k));
    if (bundleId) alerts.push({bundleId, layer: w.layer, isAlertProcess: true});
    else if (keyword) keywords.push({keyword, layer: w.layer, isAlertProcess: false});
    else if (!known.has(w.number) && w.layer >= 0 && w.layer < ALERT_LAYER_BELOW) unknown.push({layer: w.layer, isAlertProcess: false});
  }
  const readable = [...new Set(alerts.map(a => a.bundleId))].map(bundleId => ({bundleId}));
  return {abort: alerts.length + keywords.length + unknown.length > 0, export: {alerts, keywords, unknown: {count: unknown.length, windows: unknown}}, readable};
}

// ---- The HID composition row (MAWS P4-B2, a measurement) -----------------------------------------------------------

// The hard guard before HID-tap keys are posted (they go to whatever is in front): the frontmost process is the run's
// TextEdit (lsappinfo), the frontmost layer-0 window is the scene window (CGWindowList) and the engine's read of
// TextEdit's own key window (its focused window first) is the scene window's frame. -> {post, reason}.
export function compositionGuard({frontmost, topWindow, observedWindow, record}) {
  if (frontmost?.pid !== record.pid) return {post: false, reason: 'front app not the scene'};
  if (topWindow?.ownerPid !== record.pid || topWindow?.number !== record.window.number) return {post: false, reason: 'front window not the scene window'};
  const b = record.window.bounds, f = observedWindow?.frame;
  if (!f || observedWindow.pid !== record.pid || [f.x - b.x, f.y - b.y, f.width - b.width, f.height - b.height].some(d => Math.abs(d) > 1)) {
    return {post: false, reason: 'the scene window is not TextEdit\'s key window'};
  }
  return {post: true, reason: null};
}
// What the scene's text read after r, k (and after the commit Return): 가 composed, "rk", "ㄱㅏ", or anything else
// verbatim (the run's own document). The reading only, no conclusion. -> {reading, verbatim?}.
export function compositionReading(value) {
  const text = String(value ?? '').replace(/\n+$/, '');
  if (text === '가') return {reading: '가'};
  if (text === 'rk') return {reading: 'rk'};
  if (text === 'ㄱㅏ') return {reading: 'ㄱㅏ'};
  return {reading: 'other', verbatim: String(value ?? '')};
}

// ---- The vendor's text (each function self-contained: a cell embeds it by its source) -------------------------------

// The index of the menu-bar item `title`: a line of that bare title under the `menu bar` element.
export function vendorMenuBarIndex(ax, title) {
  const lines = String(ax).split('\n').map(line => /^[~+-]?(\t*)(\d+) (.*)$/.exec(line)).map(m => (m ? {depth: m[1].length, index: Number(m[2]), content: m[3]} : null));
  const bar = lines.findIndex(l => l && /^menu bar(?:,|$)/.test(l.content));
  if (bar < 0) return null;
  for (let i = bar + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.depth <= lines[bar].depth) return null;
    if (line.content.replace(/^\([^)]*\) /, '').split(', ')[0] === title) return line.index;
  }
  return null;
}
// The menu item at `path` (outermost first), each step inside the previous one's subtree: {index, enabled} or null. A
// menu item prints no role word, so a line is `<index> [(<flags>)] <title>[, <parts>]`.
export function vendorMenuItem(ax, path) {
  const lines = String(ax).split('\n').map(line => /^[~+-]?(\t*)(\d+) (.*)$/.exec(line)).map(m => (m ? {depth: m[1].length, index: Number(m[2]), content: m[3]} : null));
  const parse = content => { const flags = /^\(([^)]*)\) /.exec(content); return {flags: flags ? flags[1].split(', ') : [], title: content.slice(flags ? flags[0].length : 0).split(', ')[0]}; };
  let from = 0, to = lines.length, found = null;
  for (const title of path) {
    let i = from;
    while (i < to && !(lines[i] && parse(lines[i].content).title === title)) i++;
    if (i >= to) return null;
    found = {line: lines[i], flags: parse(lines[i].content).flags};
    let end = i + 1;
    while (end < to && (!lines[end] || lines[end].depth > found.line.depth)) end++;
    from = i + 1;
    to = end;
  }
  return {index: found.line.index, enabled: !found.flags.includes('disabled')};
}
// The trailer's selected text (`Selected text: ``` … ```), or null.
export function vendorSelectedText(ax) {
  const match = /\nSelected text: ```\n([\s\S]*?)\n```/.exec(String(ax));
  return match ? match[1] : null;
}
// The index of the text area whose value begins with `firstLine` (`… Value: <firstLine>` on its first line).
export function vendorTextAreaIndex(ax, firstLine) {
  for (const line of String(ax).split('\n')) {
    const element = /^[~+-]?\t*(\d+) (.*)$/.exec(line);
    if (element && element[2].includes(`Value: ${firstLine}`)) return Number(element[1]);
  }
  return null;
}

// ---- The checks' verdicts ------------------------------------------------------------------------------------------

// The minimized window (the pre-flight entry's item 2, M2a.4's item 2): the observation keeps its tree and drops its
// screenshot with the reason; a synthesized element click and an element scroll are refused naming the minimized
// window with nothing posted; set_value and select_text act and post nothing (the focus click is skipped); then typing
// and ⌘A, each a policy: plain typing decides type_text and press_key without ⌘, ⌘A decides ⌘ chords and paste
// (maws-3f's correction: paste's ⌘V is a menu key equivalent to the first responder). Every measurement is taken with
// the window read minimized before and after it: one that is not makes the section invalid. A key request that answers
// an error is inconclusive, never policy evidence. -> {status: valid|invalid|inconclusive, pass, failed, recorded,
// decision: {plainKeys, commandChordsAndPaste} | null, reason?}.
const MEASURED = ['observe', 'click', 'scroll', 'setValue', 'selectText', 'typeText', 'selectAll'];
export function minimizedVerdict(steps) {
  const {minimize, observe, click, scroll, setValue, selectText, typeText, selectAll, restore} = steps ?? {};
  const recorded = {typeTextValueChanged: typeText?.ok === true ? typeText.valueChanged ?? null : null, superAEffect: selectAll?.ok === true ? selectAll.effect ?? null : null};
  const unminimized = steps?.invalid?.at ?? MEASURED.find(name => steps?.[name] && (steps[name].minimizedBefore === false || steps[name].minimizedAfter === false));
  if (unminimized) {
    return {status: 'invalid', pass: false, failed: [], recorded, decision: null,
      reason: `the window was not minimized around ${unminimized}: the section measured nothing valid from there`};
  }
  const expectations = {
    minimized: minimize?.minimized === true,
    treePresent: observe?.treePresent === true && observe?.textArea === true,
    screenshotNull: observe?.screenshotNull === true,
    screenshotOmitted: observe?.screenshotOmitted === 'windowMinimized',
    clickRefused: click?.refused === true && click?.errorName === 'windowMinimized' && click?.namesMinimized === true,
    clickRefusedNothingPosted: click?.refused === true && click?.posted === false,
    scrollRefused: scroll?.refused === true && scroll?.errorName === 'windowMinimized' && scroll?.posted === false,
    setValueActs: setValue?.ok === true && setValue?.valueMatches === true,
    setValueNoClick: setValue?.posted === false,
    selectTextActs: selectText?.ok === true && selectText?.selectionMatches === true,
    selectTextNoClick: selectText?.posted === false,
    restored: restore?.onScreen === true,
  };
  const failed = Object.keys(expectations).filter(key => !expectations[key]);
  const policy = (step, field, request, yes, no) => (!step ? null : step.ok !== true ? `inconclusive: ${request} answered ${step.errorName ?? 'an error'}`
    : step[field] == null ? null : step[field] ? yes : no);
  const decision = {
    plainKeys: policy(typeText, 'valueChanged', 'type_text', 'type_text and press_key without ⌘ stay allowed: typed text reached the minimized window',
      'refuse type_text and press_key without ⌘ into a minimized window: typed text did not reach it'),
    commandChordsAndPaste: policy(selectAll, 'effect', 'press_key super+a', '⌘ chords and paste go through: ⌘A acted with the window minimized',
      'refuse ⌘ chords and paste into a minimized window: ⌘A did not act'),
  };
  const inconclusive = Object.values(decision).some(d => typeof d === 'string' && d.startsWith('inconclusive'));
  const concluded = Object.values(decision).every(d => typeof d === 'string' && !d.startsWith('inconclusive'));
  return {status: inconclusive ? 'inconclusive' : 'valid', pass: failed.length === 0 && concluded, failed, recorded, decision};
}

// One menu item's result as a label: `not found`; `invalid` (the lane lost the background condition before or during
// it: the user window left the front, or an activation was recorded); `unattempted` (the lane stopped before it); `read
// disabled` (read disabled and not pressed, in the off lane: valid evidence, not an attempt); `inconclusive` (the press
// answered an error); `acts` or `no effect` (pressed, valid, the effect read back).
export function menuItemLabel(item) {
  if (!item || item.found !== true) return 'not found';
  if (item.valid === false) return 'invalid';
  if (item.attempted === false) return 'unattempted';
  if (!item.click) return item.enabled === false ? 'read disabled' : 'unattempted';
  if (item.click.ok !== true) return 'inconclusive';
  return item.effect === true ? 'acts' : 'no effect';
}

// The menu path (the vendor reading's item 10): per item, each lane's label side by side; cua's lane decides whether
// the menu path takes activation: a valid cua item read disabled or without effect where the vendor's works means it
// does. Only valid, conclusive cua items decide.
export function menuComparison(cua, vendor) {
  const items = {}, ids = Object.keys(MENU_ITEMS);
  for (const id of ids) {
    const c = cua?.[id] ?? null, v = vendor?.[id] ?? null;
    const cl = c ? menuItemLabel(c) : null;
    const vl = v ? (v.found !== true ? 'not found' : v.effect === true ? 'acts' : v.enabled === false ? 'read disabled' : 'no effect') : null;
    items[id] = {cua: c && {label: cl, enabled: c.enabled ?? null, effect: c.effect ?? null},
      vendor: v && {label: vl, enabled: v.enabled ?? null, effect: v.effect ?? null},
      same: cl !== null && cl === vl, cuaBetter: cl === 'acts' && vl !== 'acts', cuaWorse: vl === 'acts' && ['no effect', 'read disabled'].includes(cl)};
  }
  const conclusive = ids.every(id => ['acts', 'no effect', 'read disabled'].includes(items[id].cua?.label) && items[id].vendor && items[id].vendor.label !== 'not found');
  const decision = !conclusive ? 'undecided: an item was not exposed, a cua item is not valid or conclusive, or a lane is missing'
    : ids.some(id => items[id].cuaWorse) ? 'the menu path takes activation: cua reads an item disabled or it does nothing where the vendor\'s works'
      : 'no activation: cua reads the responder-chain items enabled and they act without it';
  return {items, decision};
}

// The menu activation switch (M2a.2's `spikeMenuActivation`, off by default, for the hold to decide): cua's lane run
// with it off and with it on. Only valid items count: "acts without activation" comes from off-lane items pressed or
// read under the background condition, "activation is not enough" from on-lane items pressed under it. -> {setting:
// off|on|neither|undecided, line, labels: {off, on}, items: {off, on}: per item {label, effect, route,
// activationGuardMs}}.
export function menuSettingVerdict(off, on) {
  const ids = Object.keys(MENU_ITEMS);
  const labels = lane => (lane ? Object.fromEntries(ids.map(id => [id, menuItemLabel(lane[id])])) : null);
  const summary = lane => Object.fromEntries(ids.map(id => [id, {label: lane ? menuItemLabel(lane[id]) : null, effect: lane?.[id]?.effect ?? null,
    route: lane?.[id]?.click?.route ?? null, activationGuardMs: lane?.[id]?.click?.activationGuardMs ?? null}]));
  const offL = labels(off), onL = labels(on);
  const unsettled = (name, l, allowed) => {
    if (!l) return `${name} lane missing`;
    const bad = ids.filter(id => !allowed.includes(l[id]));
    return bad.length ? bad.map(id => `${name} lane ${id} ${l[id]}`).join(', ') : null;
  };
  let setting, line;
  const offReason = unsettled('off', offL, ['acts', 'no effect', 'read disabled']);
  if (offReason) [setting, line] = ['undecided', `undecided: ${offReason}`];
  else if (ids.every(id => offL[id] === 'acts')) [setting, line] = ['off', 'keep off: every item acts without activation (spikeMenuActivation stays off by default)'];
  else {
    const onReason = unsettled('on', onL, ['acts', 'no effect']);
    if (onReason) [setting, line] = ['undecided', `undecided: ${onReason}`];
    else if (ids.every(id => onL[id] === 'acts')) [setting, line] = ['on', 'set on: every item acts only with route 3\'s activation around its press (spikeMenuActivation on by default)'];
    else [setting, line] = ['neither', `neither: route 3's activation around the press is not enough for ${ids.filter(id => onL[id] !== 'acts').join(', ')}`];
  }
  return {setting, line, labels: {off: offL, on: onL}, items: {off: summary(off), on: summary(on)}};
}

// The paste check (M2a.3 live): a plain and a Markdown paste into the run's TextEdit behind the run's Finder window,
// each landing where a selection was; type_text under Korean 2-Set taking the paste route and landing, measured only
// when its precondition holds (Korean selected and read back, the per-context preference read off); the user window in
// front after each; the input source restored; no system alert during it (one aborts the section); the owner's
// clipboard's item and type lists unchanged, a topology check only (no content is read: a second process reading the
// owner's pasteboard is the privacy-alert risk itself; the content restore is the engine's unit tests'). Bold Markdown,
// `entered`, the preference read and restored and the source after type_text are recorded; a met precondition followed
// by a keyed type_text is the engine finding. -> {pass, failed, typeText: measured|<why not>, finding, recorded}.
export function pasteVerdict(steps) {
  const {userInFront, text, markdown, typeText, inputSource, pasteAlert, clipboard} = steps ?? {};
  const measured = typeText?.measured === true;
  const expectations = {
    textLands: text?.ok === true && text.route === 'paste' && text.lands === true,
    markdownLands: markdown?.ok === true && markdown.route === 'paste' && markdown.lands === true,
    ...(measured ? {typeTextPasteRoute: typeText.route === 'paste', typeTextLands: typeText.ok === true && typeText.lands === true} : {typeTextMeasured: false}),
    userStaysInFront: Array.isArray(userInFront) && userInFront.length > 0 && userInFront.every(Boolean),
    inputSourceRestored: inputSource?.restored === true,
    noPasteAlert: pasteAlert === false,
    clipboardTypesUnchanged: clipboard?.typesUnchanged === true,
  };
  const failed = Object.keys(expectations).filter(key => !expectations[key]);
  const finding = measured && typeText.ok === true && typeText.route !== 'paste'
    ? `engine finding: type_text keyed (route ${typeText.route}) with Korean 2-Set selected and read back and the per-context preference off; the engine reports no source on the wire, and the probe read ${typeText.sourceAfter ?? 'nothing'} right after`
    : null;
  return {pass: failed.length === 0, failed, typeText: measured ? 'measured' : typeText?.reason ?? 'not reached', finding,
    recorded: {markdownBold: markdown?.bold ?? null, entered: typeText?.entered ?? null, perContext: inputSource?.perContext ?? null, sourceAfter: typeText?.sourceAfter ?? null}};
}

// The engine's enablement diagnostics on one observation (its `timings`, M2a.4): `enablementPrior` what the attribute
// read before the observation touched it ("true", "false" or "unreadable"; absent when the app lists neither), `enabled`
// the attribute it set, which the engine does only when it read false; `webAreaSeen` that an earlier observation of the
// process found the web area, which a release forgets.
export const enablementOf = timings => ({prior: timings?.enablementPrior ?? null, set: timings?.enabled ?? null, webShaped: timings?.webShaped ?? null,
  chromium: timings?.chromium ?? null, webAreaSeen: timings?.webAreaSeen === true, webAreaFound: timings?.webAreaFound ?? null});
// Enablement released (the critique's A3, M2a.4 item 3): the first connection's first observation reads the attribute
// false and the engine sets it; after that connection closes, a new connection's first observation reads it false
// again. -> {released, priors, first, second}.
export function enablementVerdict({first, second}) {
  const released = first?.prior === 'false' && Boolean(first?.set) && second?.prior === 'false';
  return {released, priors: {first: first?.prior ?? null, second: second?.prior ?? null}, first, second};
}

// --probe input-source (the pre-flight entry's item 4): Korean 2-Set selected and read back by a second probe, then the
// owner's source and per-context preference restored.
export function inputSourceVerdict({saved, selected, readBack, restored}) {
  const expectations = {
    saved: Boolean(saved?.source?.id),
    selected: selected?.selected === true,
    readBack: readBack?.id === KOREAN_2SET,
    sourceRestored: restored?.sourceRestored === true,
    perContextRestored: restored?.perContextRestored === true,
  };
  const failed = Object.keys(expectations).filter(key => !expectations[key]);
  return {pass: failed.length === 0, failed};
}

// `defaults read com.apple.HIToolbox AppleGlobalTextInputProperties` (old-style text): the per-context input preference
// ("Automatically switch to a document's input source"), true or false, or null when it is not set.
export function parsePerContext(text) {
  const match = /TextInputGlobalPropertyPerContextInput\s*=\s*(\d+);/.exec(String(text ?? ''));
  return match ? match[1] !== '0' : null;
}
// What restores the per-context preference to `saved` from `current`: nothing when equal, a write of the saved Boolean,
// or, for a preference that was unset and is now set, nothing the harness can write back (defaults cannot remove a key
// inside the dictionary without rewriting the rest), named for the owner.
export function perContextRestore(saved, current) {
  if (saved === current) return {write: false};
  if (saved === null) return {unrestorable: 'the per-context input preference was unset before the run and is set now; set "Automatically switch to a document\'s input source" in System Settings → Keyboard → Input Sources as the owner had it'};
  return {write: true, value: saved};
}
// The source a restore selects: the owner's, saved before the switch; ABC when no record was saved.
export const restoreTarget = saved => saved?.source?.id || ABC;

// ---- Refusals and the put-back -------------------------------------------------------------------------------------

// The refusals before anything is prepared (the goldens recorder's and the scenes' preconditions): the scenes' own
// (scenes-mac.mjs preflight), a harness checkout with uncommitted changes or at another commit than this one's, the
// approved engine missing or of another build (goldens-device.mjs engineCheck), and scenes a run that died left up.
export function liveRefusals({preflight, checkout, engine, state}, {controllerCommit}) {
  const out = (preflight?.refusals ?? []).map(r => r.message);
  if (checkout?.dirty !== false) out.push('the harness checkout has uncommitted changes to tracked files (or its state could not be read): commit or stash them');
  if (checkout?.commit !== controllerCommit) out.push(`the harness checkout is at ${checkout?.commit ?? 'an unreadable commit'}, this checkout at ${controllerCommit}: place the harness checkout at this commit`);
  out.push(...(engine?.problems ?? []));
  const up = Object.keys(state?.scenes ?? {});
  if (up.length) out.push(`a run that died left ${up.join(', ')} up in the run directory: run live.mjs cleanup first`);
  return out;
}

// The put-back after every command and in cleanup (after the recovery stopped anything still running), in order: the
// activation watcher a command left running stopped and verified gone, Finder's teardown (its window closed through
// the engine) while the engine still runs, every scene down (Finder's keys written back), the owner's input source and
// per-context preference when a switch saved them (verified here, then the record removed), the engine stopped, the
// check that no scene app and no Chrome for Testing runs, Finder observed (the run's window gone, its windows and
// chrome keys as at begin), and the owner's front app last, once nothing of the run can take the front again.
export function putBackPlan({scenesUp = [], inputSourceSaved = false, frontSaved = false, watchSaved = false, finderBaseline = false}) {
  return [...(watchSaved ? ['watch-stop'] : []), ...(scenesUp.includes('finder') ? ['finder-teardown'] : []), 'scenes-down', ...(inputSourceSaved ? ['input-source'] : []),
    'engine-stop', 'apps-check', ...(finderBaseline ? ['finder-check'] : []), ...(frontSaved ? ['front-app'] : [])];
}
// Whether the owner's front app is given the front back: yes for any app saved at begin that is not a scene app,
// Chrome and Claude Desktop included (by activation alone; maws-3f, 2026-10-21).
export function frontAppAction(front) {
  if (!front?.bundleId) return {reactivate: false, reason: 'nothing was recorded in front'};
  if (SCENE_BUNDLE_IDS.includes(front.bundleId)) return {reactivate: false, reason: 'the app in front was a scene app; it is not brought back'};
  return {reactivate: true};
}
// Finder after the put-back against Finder at begin: the run's window gone, Finder's on-screen windows (numbers) as at
// begin, its three chrome keys as the owner's. -> {ok, runWindowGone, windowsAsAtBegin, keysAsSaved}.
export function finderCheck(baseline, now, {runWindow}) {
  if (!baseline || !now) return {ok: false, runWindowGone: null, windowsAsAtBegin: null, keysAsSaved: null};
  const runWindowGone = runWindow == null || !now.windows.includes(runWindow);
  const same = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
  const windowsAsAtBegin = same(now.windows, baseline.windows);
  const keysAsSaved = Object.keys(baseline.keys ?? {}).every(key => now.keys?.[key] === baseline.keys[key]);
  return {ok: runWindowGone && windowsAsAtBegin && keysAsSaved, runWindowGone, windowsAsAtBegin, keysAsSaved};
}
// The harness's own work still running on the device after a command was cut off (`ps -axo pid=,ppid=,uid=,command=`):
// the device CLIs this hold runs from the harness checkout and the vendor serve started from it, of this user, never
// the caller or its ancestors, and never a cua serve started from anywhere else (the owner's). -> [{pid, command}].
const HARNESS_COMMANDS = /^node scripts\/(native-matrix\/(live-device|goldens-device)|repl-parity\/scenes-mac)\.mjs /;
export function outstandingHarness(psText, {self, ancestors = [], uid, checkout}) {
  const serve = new RegExp(`^node ${checkout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(bin/cua\\.mjs serve|scripts/native-baseline/serve\\.mjs)`);
  return String(psText).split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, user, command]) => ({pid: Number(pid), ppid: Number(ppid), uid: Number(user), command}))
    .filter(p => p.uid === uid && p.pid !== self && !ancestors.includes(p.pid) && (HARNESS_COMMANDS.test(p.command) || serve.test(p.command)))
    .map(({pid, command}) => ({pid, command}));
}
