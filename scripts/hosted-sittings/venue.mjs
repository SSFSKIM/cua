// The hosted venue (ruling 1169; #117 M5): where the scene windows stand on a GitHub-hosted runner. Setup switches the
// display to 1920x1080 (./display-mode.mjs), and replayd's two capture alerts re-centre with it, to about x 830-1153,
// y 188-608 (pilot A's re-run, run 45252131587), which leaves the strip x 0-822 clear. The approved engine's frame probe
// moves Finder windows only (native/engine/Sources/Engine/WindowFrameProbe.swift), so every other window is placed
// without an Accessibility write:
//   chrome      Chrome for Testing launched at the venue's frame (--window-position, --window-size), 800x760 here
//   electron    the fixture launched at the venue's frame (its BrowserWindow's bounds, --cua-fixture-bounds), 720x560
//   finder      the existing probe pins its window at the venue's frame (setup step `finderFrame`), 800x520
//   textedit    TextEdit sizes its own windows: a new document from its preferences, WidthInChars, written to
//               com.apple.TextEdit on the throwaway runner before any judged launch (writeTextEditDefaults); the parity
//               scenes' document, an RTF opened as a file, from the view size the file carries (TEXTEDIT_DOCUMENT_VIEW,
//               `\vieww`/`\viewh`, written by the device's `up`). Nothing in its preferences places a window (its binary
//               names no frame autosave and its DocumentWindow nib carries none), so its origin stays AppKit's cascade,
//               and each run reads the frame back. NSRequiresOpenUntitledWindowAtLaunch NO beside it
//               (the parity scenes' launch argument, ../repl-parity/scenes-mac.mjs) skips the untitled document AppKit
//               opens at launch, whose frame differed between a runner's first TextEdit launch and the next (pilot A,
//               run 45272465181), so the documents the runs make are TextEdit's only windows
//   openPanel   the Open panel's frame autosave (AppKit's `NSWindow Frame NSNavPanelAutosaveName` in the host app's
//               domain, which this Mac's TextEdit and Preview domains both hold) and its size
//               (NSNavPanelExpandedSizeForOpenMode), written beside WidthInChars; whether the out-of-process panel
//               honours them is read back at every opening (the matrix's meta.placement.panel, A's meta.placement)
// Each frame is the hosted size at the mini's origin, moved clear of the alert windows read fresh after the switch by
// the shared clearFrame (./alert-guard.mjs), once, in setup, so both sides of every pair launch at one frame. A window
// that still lands under an alert is the guard's to refuse (NO VERDICT alert); nothing is re-placed mid-run.
//
// The venue record (setup.json `venue`, the runner record's, each lane's meta.venue) declares every frame that differs
// from the mini's: the frame, the reason (the alert windows read fresh), and the cells whose layout rests on it
// (../native-matrix/plan.mjs framedCells, and native-mac's scene trees). frameAsymmetry is the hosted record check's
// symmetry rule: a pair whose sides stood on different frames is NO VERDICT, naming them (./checks.mjs `record`).
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FINDER_FRAME} from '../repl-parity/scenes-mac-finder.mjs';
import {SCENES, TEXTEDIT_LAYOUTS, textEditDocument, textEditViewWords} from '../repl-parity/scenes-mac.mjs';
import {framedCells} from '../native-matrix/plan.mjs';
import {MENU_BAR, clearFrame, overlaps} from './alert-guard.mjs';
import {assertGithubHosted} from './runner.mjs';

// The scenes' own frames, as the mini launches and pins them.
export const MINI_FRAMES = Object.freeze({chrome: SCENES.chrome.placement, electron: SCENES.electron.placement, finder: FINDER_FRAME});
// The hosted sizes (ruling 1169): Chrome 800x760 (the mini's height kept, so the scene page still fits its window and
// NOT_APPLICABLE's "nothing to scroll" holds), the fixture's own 720x560 (so ELECTRON_FIELD_LAYOUT holds as it is),
// Finder about 800x520 (its height kept, so its list shows the rows it shows on the mini), the Open panel 720x440.
export const HOSTED_SIZES = Object.freeze({chrome: {width: 800, height: 760}, electron: {width: 720, height: 560}, finder: {width: 800, height: 520}, openPanel: {width: 720, height: 440}});
// Where each frame starts before clearFrame: the mini's origin; the panel, which the mini leaves to AppKit (centred on
// the screen, where the alerts are), at Finder's.
const ORIGINS = Object.freeze({...MINI_FRAMES, openPanel: FINDER_FRAME});

const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
const alertsText = alerts => alerts.map(a => `alert ${a.number ?? '?'} (${rectText(a.bounds ?? a)})`).join(', ');

// Each scene's hosted frame from the alert windows read fresh after the mode switch (`alerts`: [{number, bounds}] or
// rectangles; null when the window list was unread) and the displays. -> {frames: {scene: frame}, scenes: {scene: {base,
// frame, moved, reason?}}}. A frame no move clears, or an unread screen, keeps its base, with the reason.
export function hostedFrames(alerts, displays) {
  const scenes = {}, frames = {};
  for (const [scene, size] of Object.entries(HOSTED_SIZES)) {
    const base = {x: ORIGINS[scene].x, y: ORIGINS[scene].y, ...size};
    const placed = alerts === null || alerts === undefined ? {frame: null, moved: false, reason: 'the window list was unread after the mode switch: the hosted size at the mini\'s origin, unplaced; the guard refuses what an alert overlaps'}
      : clearFrame(base, alerts, displays ?? []);
    scenes[scene] = {base, frame: placed.frame ?? base, moved: placed.moved, ...(placed.reason ? {reason: placed.reason} : {})};
    frames[scene] = scenes[scene].frame;
  }
  return {frames, scenes};
}

// ---- TextEdit's preferences -------------------------------------------------------------------------------------------

export const TEXTEDIT_DOMAIN = 'com.apple.TextEdit';
// TextEdit opens a window WidthInChars characters wide (75 by default). Pilot A's re-run read its first window at
// 241,87 586x488 and its new document at 242,107 603x505 at 1920x1080 (pilot B's scene window was 627 wide at
// 1024x768): the new document's right edge, 845, met alert 31. 60 characters scale the widest of those to at most 0.8 of
// it plus the fixed part (the scroller and padding), about 500 points, so a window cascaded 20 points right of 242 ends
// near 770, under the strip's 822. The height is left to TextEdit: the strip is clear top to bottom.
export const TEXTEDIT_WIDTH_IN_CHARS = 60;
export const TEXTEDIT_DEFAULT_WIDTH_IN_CHARS = 75;
export const PANEL_FRAME_KEY = 'NSWindow Frame NSNavPanelAutosaveName';
export const PANEL_SIZE_KEY = 'NSNavPanelExpandedSizeForOpenMode';
// AppKit's saved-frame string (-[NSWindow stringWithSavedFrame]): the window's frame in AppKit's coordinates (origin at
// the main display's bottom left), then the frame of the screen it was saved on, its visible part: here the display less
// the menu bar. Only the vertical part of that screen frame can differ from what AppKit reads (a Dock it subtracts), and
// the strip is clear top to bottom, so only x must hold, and both widths are the display's.
export const savedFrameString = (frame, display) =>
  `${frame.x} ${display.height - frame.y - frame.height} ${frame.width} ${frame.height} ${display.x} ${display.y} ${display.width} ${display.height - MENU_BAR} `;
// The writes to TextEdit's own domain: its width in characters, no untitled document at launch, the Open panel's saved
// frame and its size. -> [{key, type, value, readsAs?}].
export const UNTITLED_AT_LAUNCH_KEY = 'NSRequiresOpenUntitledWindowAtLaunch';
export const textEditWrites = (panel, display) => [
  {key: 'WidthInChars', type: 'int', value: String(TEXTEDIT_WIDTH_IN_CHARS)},
  // A bool reads back as 0 or 1.
  {key: UNTITLED_AT_LAUNCH_KEY, type: 'bool', value: 'NO', readsAs: '0'},
  {key: PANEL_FRAME_KEY, type: 'string', value: savedFrameString(panel, display)},
  {key: PANEL_SIZE_KEY, type: 'string', value: `{${panel.width}, ${panel.height}}`},
];
// The writes made, each read back (`defaults read`), only on a GitHub-hosted runner and only in TextEdit's domain: the
// owner's preferences are never written. exec(command, args) -> {status, stdout}. -> {domain, writes: [{key, value,
// readBack, matched}], ok}: ok only when every write reads back as written (a venue declared but not in force would be
// a false record).
export function writeTextEditDefaults(writes, {env = process.env, platform = process.platform, exec = (command, args) => spawnSync(command, args, {encoding: 'utf8'})} = {}) {
  assertGithubHosted(env, platform, 'TextEdit\'s preferences');
  const done = writes.map(({key, type, value, readsAs = value.trim()}) => {
    const wrote = exec('/usr/bin/defaults', ['write', TEXTEDIT_DOMAIN, key, `-${type}`, value]);
    const read = exec('/usr/bin/defaults', ['read', TEXTEDIT_DOMAIN, key]);
    const readBack = read?.status === 0 ? String(read.stdout ?? '').trim() : null;
    return {key, value, ...(readsAs !== value.trim() ? {readsAs} : {}), written: wrote?.status === 0, readBack, matched: wrote?.status === 0 && readBack === readsAs};
  });
  return {domain: TEXTEDIT_DOMAIN, writes: done, ok: done.every(w => w.matched)};
}

// ---- TextEdit's scene document ----------------------------------------------------------------------------------------

// The parity scenes open the run's RTF as a file (../repl-parity/scenes-mac.mjs textEditDocument; sittings B and C), and
// an opened RTF with no view size takes its paper's width: pilot B's (run 45274556933) stood at 213,78 627x877 on both
// sides, Letter's 612 points and a 15-point scroller, its right edge 840 over alert 31 (830,188). WidthInChars sizes new
// documents only. So on a hosted runner the document carries TextEdit's own saved view size (`\vieww`, `\viewh`), which
// AppKit's RTF reader returns as NSViewSizeDocumentAttribute and TextEdit sizes the window from: the view, its text
// padding (5 a side) and the scroller. 480 points wide: a window cascaded from the furthest origin read so far (242,
// pilot A's new document; pilot B's was 213) one step of 30 further right ends at 242 + 30 + 480 + 25 = 777, left of the
// strip's 822. The height is Letter's 792, which the 877-point window TextEdit opened unasked suggests it took (792 and
// its bars), so the rows shown stay; the read-back says. The same plan reaches every side through the runner record.
export const TEXTEDIT_DOCUMENT_VIEW = Object.freeze({width: 480, height: 792});
const sha256 = text => createHash('sha256').update(text).digest('hex');
// What the venue declares of the document: the view, its control words, and each layout's file as the mini writes it
// (no view) and as a hosted runner does, by sha256. -> {document, view, controlWords, sha256: {layout: {mini, hosted}}}.
export function textEditDocumentPlan(view = TEXTEDIT_DOCUMENT_VIEW) {
  const sha = layout => ({mini: sha256(textEditDocument({layout}).rtf), hosted: sha256(textEditDocument({layout, view}).rtf)});
  return {document: textEditDocument().name, view: {...view}, controlWords: textEditViewWords(view), sha256: Object.fromEntries(Object.keys(TEXTEDIT_LAYOUTS).map(layout => [layout, sha(layout)]))};
}

// ---- The record --------------------------------------------------------------------------------------------------------

// Each scene's difference from the mini, why, and what rests on it. `framedCells` (the matrix's plan) gives the cells
// whose points, fractions or visible rows stand on the window; native-mac's scene trees follow the window too.
const NATIVE_MAC = {
  chrome: 'native-mac chrome (its tree: the page in the window, both lanes alike)',
  electron: 'native-mac electron (its tree)',
  finder: 'native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only)',
  textedit: 'native-mac textedit (its tree)',
};
const GROUNDING = {
  chrome: 'window points re-grounded on the hosted size: the page has no stylesheet, so the notes field stands at the same window points; the drag\'s layout takes the venue\'s 800x760 (../native-matrix/plan.mjs groundCase)',
  electron: 'window points on the fixture\'s size, unchanged at 720x560: its layout (ELECTRON_FIELD_LAYOUT, #259\'s point) holds as it is; only the origin moved',
  finder: 'element-addressed rows; the height is the mini\'s, so the same rows are visible',
  textedit: 'fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare\'s clicks proving each end',
  textEditDocument: 'the window\'s size only: the file is the mini\'s with the view size inserted, so its text and attribute runs are the mini\'s (textutil\'s text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells\' fractions and rows hold as for TextEdit\'s preferences; the wide page stays wider than the window (its 200% zoom)',
  openPanel: 'element-addressed (its Cancel, A\'s New Document): the frame decides only whether the guard refuses them',
};
const PANEL_CELLS = ['openPanel/frontmost/getAXState.panel', 'openPanel/frontmost/click.cancel', 'openPanel/background/getAXState.panel@finder', 'openPanel/background/click.cancel@finder',
  'native-baseline setup.newDocument (the panel at TextEdit\'s launch, where one shows: the mini\'s)'];
const cellsOf = scene => [...framedCells(scene).map(c => c.id), NATIVE_MAC[scene]];
const WIDE_PAGE_CELL = 'hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window)';

// The venue block: the alert windows read fresh after the switch, the display, the frames the scenes launch at, TextEdit's
// preferences as written and read back, its scene document's view (textEditDocumentPlan), and each difference from the
// mini's. `placed`: hostedFrames'. -> venue.
export function venueRecord({alerts, displays, placed, textEdit}) {
  const display = (displays ?? []).find(d => d.x === 0 && d.y === 0) ?? displays?.[0] ?? null;
  const fresh = alerts === null || alerts === undefined ? null : alerts.map(a => ({number: a.number ?? null, bounds: a.bounds ?? a}));
  const why = scene => {
    const frame = placed.frames[scene], mini = MINI_FRAMES[scene] ?? null;
    const geometry = fresh === null ? 'the alert windows were unread after the mode switch' : fresh.length ? `the capture alerts read fresh after the mode switch: ${alertsText(fresh)}` : 'no alert window after the mode switch';
    const under = mini && fresh?.some(a => overlaps(a.bounds, mini)) ? `; the mini's ${rectText(mini)} would overlap them` : '';
    const size = scene === 'chrome' ? '; Chrome is 800x760 on a hosted runner (ruling 1169)' : scene === 'openPanel' ? '; the mini leaves the panel centred, where the alerts are' : '';
    const moved = placed.scenes[scene]?.reason ? `; ${placed.scenes[scene].reason}` : '';
    return `${geometry}${under}${size}; the frame ${rectText(frame)}${moved}`;
  };
  const differences = [];
  for (const scene of ['chrome', 'electron', 'finder']) {
    const hosted = placed.frames[scene], mini = MINI_FRAMES[scene];
    if (['x', 'y', 'width', 'height'].every(k => hosted[k] === mini[k])) continue;
    differences.push({scene, mini, hosted, reason: why(scene), grounding: GROUNDING[scene], cells: cellsOf(scene)});
  }
  differences.push({scene: 'textedit', mini: {WidthInChars: TEXTEDIT_DEFAULT_WIDTH_IN_CHARS, [UNTITLED_AT_LAUNCH_KEY]: 'YES (AppKit\'s default)'}, hosted: {WidthInChars: TEXTEDIT_WIDTH_IN_CHARS, [UNTITLED_AT_LAUNCH_KEY]: 'NO'},
    reason: `${fresh === null ? 'the alert windows were unread after the mode switch' : `the capture alerts read fresh after the mode switch: ${alertsText(fresh)}`}; at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session)`,
    grounding: GROUNDING.textedit, cells: cellsOf('textedit')});
  const document = textEditDocumentPlan(), hashes = side => Object.fromEntries(Object.entries(document.sha256).map(([layout, h]) => [`sha256 ${layout}`, h[side]]));
  differences.push({scene: 'textedit document', mini: {'view size': 'none: TextEdit takes the paper\'s width', ...hashes('mini')},
    hosted: {'view size': `${document.view.width}x${document.view.height} (${document.controlWords})`, ...hashes('hosted')},
    reason: `the scene's ${document.document}, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view ${document.view.width} wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run`,
    grounding: GROUNDING.textEditDocument, cells: [...cellsOf('textedit'), WIDE_PAGE_CELL]});
  differences.push({scene: 'openPanel', mini: 'AppKit\'s: centred on the screen', hosted: placed.frames.openPanel, reason: why('openPanel'), grounding: GROUNDING.openPanel, cells: PANEL_CELLS});
  return {alerts: fresh, display, frames: placed.frames, textEdit: textEdit ?? null, textEditDocument: document, differences};
}

const frameCell = f => (f && typeof f === 'object' && 'x' in f ? rectText(f) : f && typeof f === 'object' ? Object.entries(f).map(([k, v]) => `${k} ${v}`).join(', ') : String(f ?? ''));
const escape = text => String(text).replace(/\|/g, '\\|');
// sitting.md's section: the venue's differences, one row each, with the cells resting on them. -> markdown.
export function renderVenue(venue) {
  const head = ['## The venue (ruling 1169)', ''];
  if (!venue) return [...head, 'no venue recorded: the scenes ran on their own frames (no hosted setup on this machine).', ''].join('\n');
  const writes = venue.textEdit?.writes?.length ? `TextEdit's preferences (${venue.textEdit.domain}): ${venue.textEdit.writes.map(w => `${w.key} ${w.matched ? 'read back' : `NOT read back (${w.readBack ?? 'unread'})`}`).join(', ')}.` : 'TextEdit\'s preferences: none recorded.';
  return [...head, `The alert windows after the mode switch: ${venue.alerts === null ? 'unread' : venue.alerts.length ? alertsText(venue.alerts) : 'none'}. ${writes}`, '',
    '| scene | the mini | hosted | why | grounding | cells resting on it |', '|---|---|---|---|---|---|',
    ...venue.differences.map(d => `| ${d.scene} | ${escape(frameCell(d.mini))} | ${escape(frameCell(d.hosted))} | ${escape(d.reason)} | ${escape(d.grounding)} | ${escape(d.cells.join(', '))} |`), ''].join('\n');
}

// ---- Symmetry ----------------------------------------------------------------------------------------------------------

// The frames one side stood on, keyed alike on both sides of a pair: the venue it launched at (`venue:<scene>`) and every
// window it read back, as each producer records its placement: the matrix's meta.placement ({scenes: {id: entry}, panel:
// [entry]}), native-mac's meta.scenes[id].placement ({windows}) and the baseline's meta.placement ([{at, windows}]). The
// scratch document's record (`textedit up`, {placement: {windows}}) is read as one step. An entry's frame is where the
// window was last read: its read-back when a move read one back, else where it was read before (a window not moved,
// one the probe was not asked to move, one whose move read nothing back, pilot B's), so no window read is dropped.
// -> {key: frame}.
const standing = entry => entry?.readBack ?? entry?.from ?? null;
const numbered = (prefix, windows, out) => {
  const seen = {};
  for (const w of windows ?? []) {
    seen[w.scene] = (seen[w.scene] ?? 0) + 1;
    const frame = standing(w);
    if (frame) out[`${prefix}${w.scene}#${seen[w.scene]}`] = frame;
  }
};
export function sceneFrames(record) {
  const meta = record?.meta ?? record ?? {}, out = {};
  for (const [scene, frame] of Object.entries(meta.venue?.frames ?? {})) out[`venue:${scene}`] = frame;
  const placement = meta.placement;
  if (Array.isArray(placement)) for (const step of placement) numbered(`${step.at}/`, step.windows, out);
  else if (placement?.scenes) {
    for (const [scene, entry] of Object.entries(placement.scenes)) { const frame = standing(entry); if (frame) out[scene] = frame; }
    (placement.panel ?? []).forEach((entry, i) => { const frame = standing(entry); if (frame) out[`openPanel#${i + 1}`] = frame; });
  } else if (Array.isArray(placement?.windows)) numbered('', placement.windows, out);
  for (const [id, scene] of Object.entries(meta.scenes ?? {})) numbered(`${id}/`, scene?.placement?.windows, out);
  return out;
}
// Recorded checks (1) and (2) of ruling 1169: where each step's TextEdit windows and Open panels stood (sceneFrames),
// against what the venue planned (TextEdit: the scene document's view size for the parity scenes' document, the matrix's
// `textedit` and native-mac's `textedit/...`, its width in characters for a new or scratch document, and its right edge
// left of the alerts, its origin being AppKit's; the panel: its saved frame) and whether an alert the venue read
// overlapped them. `records`: [{step, record}]. -> [{step, window, planned, actual, overlap}].
export function readBackRows(records, venue) {
  const alerts = (venue?.alerts ?? []).map(a => a.bounds ?? a);
  const width = venue?.differences?.find(d => d.scene === 'textedit')?.hosted?.WidthInChars ?? TEXTEDIT_WIDTH_IN_CHARS;
  const view = venue?.textEditDocument?.view ?? null;
  const edge = alerts.length ? `left of x ${Math.min(...alerts.map(a => a.x))}` : 'no alert to keep left of';
  const sceneDocument = window => view !== null && (window === 'textedit' || window.startsWith('textedit/'));
  const out = [];
  for (const {step, record} of records) {
    for (const [window, actual] of Object.entries(sceneFrames(record))) {
      const kind = /(?:^|\/)(textedit|openPanel)(?:#\d+)?$/.exec(window)?.[1];
      if (!kind) continue;
      const planned = kind === 'openPanel' ? venue?.frames?.openPanel ?? null : sceneDocument(window) ? `view ${view.width}x${view.height}, ${edge}` : `WidthInChars ${width}, ${edge}`;
      out.push({step, window, planned, actual, overlap: alerts.some(a => overlaps(a, actual))});
    }
  }
  return out;
}
export function renderReadBack(rows) {
  const head = ['## TextEdit and the Open panel, read back (ruling 1169)', ''];
  if (!rows.length) return [...head, 'No TextEdit window or Open panel was read back in this sitting\'s records.', ''].join('\n');
  const text = v => (v === null ? 'unplanned' : typeof v === 'string' ? v : rectText(v));
  return [...head, 'Where each step\'s TextEdit windows and Open panels stood, against what the venue planned, and whether an alert the venue read overlapped them (the alert guard then refused the cells there).', '',
    '| step | window | planned | actual | overlaps an alert |', '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.step} | ${r.window} | ${text(r.planned)} | ${rectText(r.actual)} | ${r.overlap ? 'yes' : 'no'} |`), ''].join('\n');
}
const sameFrame = (a, b) => ['x', 'y', 'width', 'height'].every(k => a?.[k] === b?.[k]);
// Why a pair's sides were not measured on one frame: each key both read whose frames differ. -> the reason, or null.
export function frameAsymmetry(record, pair) {
  if (!record || !pair) return null;
  const mine = sceneFrames(record), theirs = sceneFrames(pair);
  const differ = Object.keys(mine).filter(key => key in theirs && !sameFrame(mine[key], theirs[key]));
  return differ.length ? differ.map(key => `${key}: ${rectText(mine[key])} on this side, ${rectText(theirs[key])} on its pair`).join('; ') : null;
}
