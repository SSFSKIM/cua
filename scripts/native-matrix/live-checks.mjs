// The live hold's pure parts (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2a.5, "Live on the mini";
// the Decision Log's "M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.2" and "M2a.4" entries): what the checks of
// ./live.mjs and ./live-device.mjs read off cua's Skyshots and the vendor's text, how each check's result is judged,
// the refusals before anything is prepared, and the put-back plan. No I/O here.
//
// What leaves the device is what these return: booleans, counts, element indexes, error names and the engine's bounded
// sentences, input-source ids. The scenes' windows are all the run's own; even so no document text is returned, only
// whether it holds what the check put there.
import {textEditDocument} from '../repl-parity/scenes-mac.mjs';

const DOCUMENT = textEditDocument().lines;
// The run's TextEdit document's first and last lines (scenes-mac.mjs): a selection that holds both holds the whole.
export const FIRST_LINE = DOCUMENT[0];
export const LAST_LINE = DOCUMENT.at(-1);
export const KOREAN_2SET = 'com.apple.inputmethod.Korean.2SetKorean';
export const ABC = 'com.apple.keylayout.ABC';
// The owner's apps a put-back never activates, whatever was in front: the hold's rule is that the run never touches them.
export const NEVER_TOUCHED = Object.freeze(['com.google.Chrome', 'com.anthropic.claudefordesktop']);
// The menu check's two items (the vendor reading's item 10): items AppKit validates against the key window's responder
// chain, so a background app may read them disabled or not act on them without activation.
export const MENU_ITEMS = Object.freeze({
  selectAll: Object.freeze({menu: 'Edit', path: Object.freeze(['Select All'])}),
  bold: Object.freeze({menu: 'Format', path: Object.freeze(['Font', 'Bold'])}),
});
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

// An engine error as a result keeps it: its name, its sentence bounded, the route and whether any event was posted.
export function failureOf(error) {
  const meta = error?.meta ?? null;
  return {errorName: error?.errorName ?? null, message: String(error?.message ?? error).slice(0, MESSAGE_CHARS),
    ...(meta?.inputRoute !== undefined ? {route: meta.inputRoute} : {}), posted: meta?.startedAt != null};
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

// The minimized window (the pre-flight entry's item 2, M2a.4's items 2): the observation keeps its tree and drops its
// screenshot with the reason, a synthesized element click is refused naming the minimized window with nothing posted,
// set_value and select_text act; then what typing and ⌘A do, which the design leaves open and which decides whether keys
// into a minimized window are refused (recorded, not judged); and the window put back on screen. -> {pass, failed,
// recorded, decision}.
export function minimizedVerdict(steps) {
  const {minimize, observe, click, setValue, selectText, typeText, selectAll, restore} = steps ?? {};
  const expectations = {
    minimized: minimize?.minimized === true,
    treePresent: observe?.treePresent === true && observe?.textArea === true,
    screenshotNull: observe?.screenshotNull === true,
    screenshotOmitted: observe?.screenshotOmitted === 'windowMinimized',
    clickRefused: click?.refused === true && click?.errorName === 'windowMinimized' && click?.namesMinimized === true,
    clickRefusedNothingPosted: click?.refused === true && click?.posted === false,
    setValueActs: setValue?.ok === true && setValue?.valueMatches === true,
    selectTextActs: selectText?.ok === true && selectText?.selectionMatches === true,
    restored: restore?.onScreen === true,
  };
  const failed = Object.keys(expectations).filter(key => !expectations[key]);
  const recorded = {typeTextValueChanged: typeText?.valueChanged ?? null, superAEffect: selectAll?.effect ?? null};
  const decision = recorded.typeTextValueChanged === null || recorded.superAEffect === null ? null
    : recorded.typeTextValueChanged || recorded.superAEffect ? 'keys act on a minimized window: they stay allowed'
      : 'keys reach no window while it is minimized: refusing typeText and pressKey into a minimized window loses nothing';
  return {pass: failed.length === 0 && decision !== null, failed, recorded, decision};
}

// The menu path (the vendor reading's item 10): per item, each lane's enabled state and effect side by side; cua's lane
// decides whether the menu path takes activation: an item it reads disabled, or one that does nothing, where the
// vendor's works, means it does.
export function menuComparison(cua, vendor) {
  const items = {}, ids = Object.keys(MENU_ITEMS);
  for (const id of ids) {
    const c = cua?.[id] ?? null, v = vendor?.[id] ?? null;
    const works = lane => lane?.found === true && lane.enabled === true && lane.effect === true;
    items[id] = {cua: c && {found: c.found === true, enabled: c.enabled ?? null, effect: c.effect ?? null},
      vendor: v && {found: v.found === true, enabled: v.enabled ?? null, effect: v.effect ?? null},
      same: Boolean(c && v) && c.found === v.found && c.enabled === v.enabled && c.effect === v.effect,
      cuaBetter: works(c) && !works(v), cuaWorse: works(v) && !works(c)};
  }
  const undecided = !cua || !vendor || ids.some(id => cua[id]?.found !== true || vendor[id]?.found !== true);
  const decision = undecided ? 'undecided: an item was not exposed or a lane is missing'
    : ids.some(id => items[id].cuaWorse) ? 'the menu path takes activation: cua reads an item disabled or it does nothing where the vendor\'s works'
      : 'no activation: cua reads the responder-chain items enabled and they act without it';
  return {items, decision};
}

// The engine's enablement diagnostics on one observation (its `timings`, M2a.4): `enabled` names the attribute this
// observation set, which the engine does only when it did not read true; `webAreaSeen` that an earlier observation of
// the process found the web area, which a release forgets.
export const enablementOf = timings => ({set: timings?.enabled ?? null, webShaped: timings?.webShaped ?? null, chromium: timings?.chromium ?? null,
  webAreaSeen: timings?.webAreaSeen === true, webAreaFound: timings?.webAreaFound ?? null});
// Enablement released (the critique's A3, M2a.4 item 3): a first connection sets the attribute and closes; the second
// connection's observation finds it not true and sets it again, with the web area forgotten. -> {released, ...}.
export function enablementVerdict({first, second}) {
  const released = !first?.set ? null : Boolean(second?.set) && second.webAreaSeen !== true;
  return {released, first, second,
    diagnostic: 'the engine reports the attribute it set (timings.enabled) only when it did not read true; it does not tell false from unreadable, which the release needs (an unreadable value is set but never owned): a prior-value diagnostic is not in M2a.4\'s engine'};
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

// The put-back after every command and in cleanup, in order: Finder's teardown (its window closed through the engine,
// its chrome toggled back to the owner's visible state when one was saved) while the engine still runs, every scene
// down (Finder's keys written back), the owner's input source and per-context preference when a switch saved them, the
// engine stopped, the check that no scene app and no Chrome for Testing runs, and the owner's front app last, once
// nothing of the run can take the front again.
export function putBackPlan({scenesUp = [], inputSourceSaved = false, frontSaved = false}) {
  return [...(scenesUp.includes('finder') ? ['finder-teardown'] : []), 'scenes-down', ...(inputSourceSaved ? ['input-source'] : []), 'engine-stop', 'apps-check',
    ...(frontSaved ? ['front-app'] : [])];
}
// Whether the owner's front app is put back in front: yes, unless nothing was saved or it is one the hold never touches.
export function frontAppAction(front) {
  if (!front?.bundleId) return {reactivate: false, reason: 'nothing was recorded in front'};
  if (NEVER_TOUCHED.includes(front.bundleId)) return {reactivate: false, reason: 'the owner\'s Chrome and Claude are never touched; bring it back by hand'};
  return {reactivate: true};
}
