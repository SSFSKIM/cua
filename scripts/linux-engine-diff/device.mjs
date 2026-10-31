// The device mode's cases of the differential run (#171 M3.1; Design, Device mode and the foreground route; Acceptance
// 8) and the capability report's answer. cua alone (the vendor builds have no device mode), each case on cua's own
// window of its scene, the engine in the mode the case names:
//
// - `refusal` (shared mode, a kind the family ignores): the request answers `<app> does not accept background input;
//   use a dedicated desktop or activate the window first`, exactly, with the witness unchanged, nothing the window
//   counts changed, and an X request audit that finds nothing sent at all (no SendEvent, no XTEST input, nothing the
//   background route forbids);
// - `foreground` (dedicated mode, the same kind): the request takes effect with the window activated, through the
//   foreground route: the route recorded, the witness's foreground allowance, the foreground audit;
// - `background` (a kind the family takes, or an element action): the request takes effect on the background route,
//   with the witness unchanged and the background audit clean;
// - `cancel` (shared mode, a drag that Chrome turns into a drag and drop): the request answers that the drag and drop
//   was cancelled before the drop, exactly, with nothing dropped, the witness unchanged and the background audit clean
//   (the cancel's Escape is a synthetic key event, never XTEST);
// - `late` (the same, the cancel forced after the release, `--dnd-cancel-after-release`): every answer is honest (that
//   the drop may have happened, or that nothing was dropped only where nothing dropped and the witness is unchanged),
//   at least one answer says the drop may have happened, and the background audit is clean;
// - `answer`: `capabilities`, its answer checked.
//
// Scenes: `device-gtk4` (the harness's GTK 4 scene, pages/gtk4-input.py: GTK 4 ignores synthetic input always),
// `device-firefox` (Firefox on pages/input.html: Gecko ignores synthetic coordinate clicks unless its window is fully
// unobscured; the cases put a window over its bottom half, or part of it off the screen, or leave it fully visible),
// `device-xterm` (xterm running the recorder: it ignores synthetic keys and takes clicks), `device-qt` (kate on a long
// document: Qt ignores synthetic wheel events), `device-chrome` (Chrome on pages/input.html: Chromium takes a drag only
// along a visible path), `device-chrome-dnd` (Chrome on pages/drag.html: its HTML5 drag and drop, cancelled in shared
// mode unless Chrome is already in front) and gnome-text-editor's text refusal on the `gnome-text-editor` scene.
// M3.1's listings beyond M0's (scroll and move for GTK 4 and Gecko, scroll for Qt) join the cases as M0's did.

import { readFileSync } from 'node:fs';

import { execFileSync } from 'node:child_process';

import { readGtk4Status } from './families.mjs';
import { stacking } from './clip.mjs';
import { activeWindow, configure } from './scenes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Device mode sentence (Design, Device mode), for the application `list_windows` names. */
export const deviceSentence = (app) => `${app} does not accept background input; use a dedicated desktop or activate the window first`;

/** The answers to a drag Chrome turned into a drag and drop, in shared mode (dnd.rs). */
export const dndCancelledSentence = (app) =>
  `${app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped. Use a dedicated desktop, or activate the window first`;
export const dndMayHaveDroppedSentence = (app) =>
  `${app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop may have happened and the desktop changed. Use a dedicated desktop, or activate the window first`;

/** The desktop state a drop could change: the active window, the X input focus, the stacking order. */
export function desktopState() {
  const focus = execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8' }).trim();
  return { active: activeWindow(), focus: Number(focus), stacking: stacking() };
}

const DEDICATED = ['--desktop', 'dedicated'];
const LATE = ['--dnd-cancel-after-release'];
/** How long a refused request's window is watched for anything arriving after the answer. */
const QUIET_MS = 400;

// ---------------------------------------------------------------------------------------------------------------
// the scenes' readers and places

const gtk4 = (ctx) => readGtk4Status(ctx.desktop, ctx.scene);
const page = (ctx) => ctx.desktop.inputStatus(ctx.scene);
const record = (ctx) => readFileSync(ctx.scene.record, 'latin1');
const scrollBar = (ctx) => {
  try {
    return Number(ctx.desktop.oracle.currentValue(ctx.scene.scrollbar));
  } catch {
    return null;
  }
};
/** The drag page's drag-and-drop status (pages/drag.html): `{drops, ...}`. */
const dropStatus = async (ctx) => {
  try {
    // drag.mjs imports run.mjs, which imports this module
    const { readEffect } = await import('./drag.mjs');
    return await readEffect({ desktop: ctx.desktop, oracle: ctx.desktop.oracle }, ctx.scene, ctx.scene.dndAt, 'dnd');
  } catch {
    return null;
  }
};
const fieldText = (ctx) => {
  try {
    return ctx.desktop.oracle.text(ctx.scene.field);
  } catch {
    return null;
  }
};

/** GTK 4's scene's places (families.mjs, as pages/gtk4-input.py lays itself out), window-relative. */
const GTK4 = { button: { x: 300, y: 103 }, list: { x: 300, y: 300 }, scale: { x0: 20, x1: 580, y: 40 } };
/** The input page's pad, in the top half of Firefox's window (below its own bars). */
const PAD = { x: 520, y: 200 };
/** A second point on the pad, so consecutive moves each move the pointer. */
const PAD2 = { x: 300, y: 200 };

/** GTK 4's scale dragged from a quarter to three quarters along on even samples, back on odd ones. */
function scalePath(i) {
  const { x0, x1, y } = GTK4.scale;
  const along = (f) => Math.round(x0 + 12 + (x1 - x0 - 24) * f);
  return i % 2 === 0 ? [{ x: along(0.25), y }, { x: along(0.75), y }] : [{ x: along(0.75), y }, { x: along(0.25), y }];
}

const grew = (key) => (before, after) => typeof before?.[key] === 'number' && typeof after?.[key] === 'number' && after[key] > before[key];
const higher = (before, after) => typeof before === 'number' && typeof after === 'number' && after > before;
/** A drag across the input page's pad (pages/input.html counts it), in the top half of the window. */
const padDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: [{ x: 200, y: 150 }, { x: 380, y: 180 }, { x: 600, y: 240 }] }];
const moveTo = (ctx, a, b) => ['move', { window: { id: ctx.scene.id }, ...(ctx.i % 2 === 0 ? a : b) }];
/** The drag page's drag-and-drop path (`scene.dndPath`, drag.mjs's): the source dragged to the drop zone. */
const dndDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndPath }];

/** The input page back at its top after a scroll series: Home through the background route (Gecko takes keys). */
async function pageHome({ scene, cua }) {
  const { Engine } = await import('./engine.mjs');
  const engine = new Engine({ label: 'reset', bin: cua }).start();
  await engine.request('press_key', { window: { id: scene.id }, key: 'Home' });
  await engine.close();
  await sleep(500);
}

const rose = (key) => (before, after) => typeof before?.[key] === 'number' && after?.[key] === before[key] + 1;

// ---------------------------------------------------------------------------------------------------------------
// the conditions

/** Firefox fully visible: raised, the front window in its corner, its window at its place. */
function visible(ctx) {
  configure(ctx.scene.id, 0, 0, ...ctx.scene.size);
  ctx.desktop.arrangeFront('visible');
  ctx.desktop.raise(ctx.scene);
}

/** A window over the bottom half of the scene window (the click point itself stays visible). */
function overlapped(ctx) {
  configure(ctx.scene.id, 0, 0, ...ctx.scene.size);
  ctx.desktop.arrange(ctx.scene, 'partial');
}

/** A window over the top 55% of the scene window, where the pad is: the window partly visible, the path covered. */
function topCovered(ctx) {
  configure(ctx.scene.id, 0, 0, ...ctx.scene.size);
  ctx.desktop.arrange(ctx.scene, 'partial-top');
}

/** The scene window with its right fifth off the screen, nothing over it. */
function offscreen(ctx) {
  const [w, h] = ctx.scene.size;
  configure(ctx.scene.id, 1280 - Math.round(w * 0.8), 0, w, h);
  ctx.desktop.arrangeFront('visible');
  ctx.desktop.raise(ctx.scene);
}

/** The front window over the whole screen. */
const covered = (ctx) => ctx.desktop.arrangeFront('covered');

/** The scene window fully visible and already in front: activated (the active window, the focus, on top). */
function alreadyInFront(ctx) {
  visible(ctx);
  execFileSync('xdotool', ['windowactivate', '--sync', String(ctx.scene.id)]);
}

// ---------------------------------------------------------------------------------------------------------------
// the cases

/**
 * A case: `device` its expectation, `scene` where it runs, `condition` the arrangement before each sample, `read` what
 * the window counts, `request`, and `effect` (from the counts before and after) for the cases that must take effect.
 */
function device({ device: expect, condition = covered, read, request, effect, route, args, inFront = false }) {
  const dedicated = expect === 'foreground';
  return {
    // the witness's in-front allowance (witness.mjs), for the request the engine records as made to a window in front
    inFront,
    kind: 'input',
    device: expect,
    cuaOnly: true,
    // a handful a block: these cases prove behaviour, not speed (cua alone has no bar)
    warmSamples: 2,
    cuaArgs: () => args ?? (dedicated ? DEDICATED : []),
    // the witness: the foreground allowance only where the foreground route is expected and reported (run.mjs)
    route: () => route ?? (dedicated ? 'foreground' : null),
    prepare: async (ctx) => {
      condition(ctx);
      await sleep(300);
      if (inFront) ctx.desktopBefore = desktopState();
    },
    read,
    request,
    effect: ['refusal', 'cancel', 'late'].includes(expect) ? undefined : effect,
    check: async (ctx, response) => {
      const out = {};
      if (expect === 'refusal') {
        out.expected_error = deviceSentence(ctx.scene.app);
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.unchanged = ctx.before !== null && after !== null && JSON.stringify(after) === JSON.stringify(ctx.before);
      }
      if (expect === 'cancel' || expect === 'late') {
        out.expected_error = dndCancelledSentence(ctx.scene.app);
        if (expect === 'late') out.late_error = dndMayHaveDroppedSentence(ctx.scene.app);
        // a drop the page counts shows within its settle; one never read counts as dropped
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.dropped = !(typeof ctx.before?.drops === 'number' && after?.drops === ctx.before.drops);
      }
      if (dedicated && response.ok) out.activated = activeWindow() === ctx.scene.id;
      // in front: the desktop at the end as it was at the start
      if (inFront) out.desktop_same = JSON.stringify(desktopState()) === JSON.stringify(ctx.desktopBefore);
      return out;
    },
    // the foreground route leaves its window active: the front window takes the focus back, outside every span
    restore: (ctx) => ctx.desktop.focusFront(),
  };
}

const at = (point) => ({ x: point.x, y: point.y });

export const DEVICE_OPS = {
  // GTK 4 (`device-gtk4`): coordinate clicks, keys and the element right click, refused or foreground; the element
  // click through its action, on the background route in shared mode
  gtk4_click_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...at(GTK4.button) }] }),
  gtk4_click_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...at(GTK4.button) }], effect: rose('presses') }),
  gtk4_key_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['press_key', { window: { id: ctx.scene.id }, key: 'x' }] }),
  gtk4_key_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => ['press_key', { window: { id: ctx.scene.id }, key: 'x' }], effect: rose('keys') }),
  gtk4_key_down_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['key_down', { window: { id: ctx.scene.id }, key: 'x' }] }),
  gtk4_right_click_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.button, mouse_button: 'right' }] }),
  gtk4_element_click: device({ device: 'background', read: gtk4, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.button }], effect: rose('presses') }),
  gtk4_scroll_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...at(GTK4.list) }] }),
  gtk4_scroll_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...at(GTK4.list) }], effect: (before, after) => typeof before?.scroll === 'number' && after?.scroll > before.scroll }),
  gtk4_drag_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['drag', { window: { id: ctx.scene.id }, path: scalePath(ctx.i) }] }),
  gtk4_drag_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => ['drag', { window: { id: ctx.scene.id }, path: scalePath(ctx.i) }], effect: (before, after) => typeof before?.scale === 'number' && typeof after?.scale === 'number' && after.scale !== before.scale }),
  gtk4_move_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => moveTo(ctx, { x: 200, y: 300 }, { x: 400, y: 300 }) }),
  gtk4_move_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => moveTo(ctx, { x: 200, y: 300 }, { x: 400, y: 300 }), effect: grew('moves') }),
  // gnome-text-editor (GTK 4): typeText in shared mode
  gte_type_text_shared: device({ device: 'refusal', read: fieldText, request: (ctx) => ['type_text', { window: { id: ctx.scene.id }, text: 'cua171 refused' }] }),
  // Firefox (`device-firefox`): coordinate clicks refused with any overlap and with part of the window off the screen,
  // foreground in dedicated mode, background while fully visible; the element right click refused under overlap; the
  // element click on a covered window, background
  firefox_click_overlap_shared: device({ device: 'refusal', condition: overlapped, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }] }),
  firefox_click_offscreen_shared: device({ device: 'refusal', condition: offscreen, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }] }),
  firefox_right_click_overlap_shared: device({ device: 'refusal', condition: overlapped, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.elements.menu, mouse_button: 'right' }] }),
  firefox_click_overlap_dedicated: device({ device: 'foreground', condition: overlapped, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }], effect: rose('downs') }),
  firefox_click_visible_shared: device({ device: 'background', route: 'background', condition: visible, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }], effect: rose('downs') }),
  firefox_scroll_overlap_shared: device({ device: 'refusal', condition: overlapped, read: page, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...PAD }] }),
  firefox_scroll_covered_dedicated: {
    ...device({ device: 'foreground', condition: covered, read: page, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...PAD }], effect: grew('scroll') }),
    reset: pageHome,
  },
  firefox_move_overlap_shared: device({ device: 'refusal', condition: overlapped, read: page, request: (ctx) => moveTo(ctx, PAD, PAD2) }),
  firefox_move_covered_dedicated: device({ device: 'foreground', condition: covered, read: page, request: (ctx) => moveTo(ctx, PAD, PAD2), effect: grew('moves') }),
  firefox_drag_overlap_shared: device({ device: 'refusal', condition: overlapped, read: page, request: padDrag }),
  firefox_drag_covered_dedicated: device({ device: 'foreground', condition: covered, read: page, request: padDrag, effect: rose('drags') }),
  firefox_element_click_covered: device({ device: 'background', condition: covered, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.elements.press }], effect: rose('clicks') }),
  // xterm (`device-xterm`): keys refused or foreground; a click on the background route (a mouse report arrives)
  xterm_key_shared: device({ device: 'refusal', read: record, request: (ctx) => ['press_key', { window: { id: ctx.scene.id }, key: 'x' }] }),
  xterm_key_dedicated: device({ device: 'foreground', read: record, request: (ctx) => ['press_key', { window: { id: ctx.scene.id }, key: 'x' }], effect: (before, after) => typeof before === 'string' && after === `${before}x` }),
  xterm_click_shared: device({
    device: 'background',
    route: 'background',
    read: record,
    request: (ctx) => ['click', { window: { id: ctx.scene.id }, x: 100, y: 100 }],
    effect: (before, after) => typeof before === 'string' && typeof after === 'string' && after.slice(before.length).includes('\x1b[M'),
  }),
  // Chrome (`device-chrome`): a drag along a path the cover leaves visible takes the background route; one along a
  // covered path is refused, or in dedicated mode sent through the foreground route
  chrome_drag_visible_path_shared: device({ device: 'background', route: 'background', condition: overlapped, read: page, request: padDrag, effect: rose('drags') }),
  chrome_drag_covered_path_shared: device({ device: 'refusal', condition: topCovered, read: page, request: padDrag }),
  chrome_drag_covered_dedicated: device({ device: 'foreground', condition: covered, read: page, request: padDrag, effect: rose('drags') }),
  // Chrome's HTML5 drag and drop (`device-chrome-dnd`): cancelled before the drop in shared mode; let through when Chrome
  // is already in front, the desktop unchanged; an honest answer when the cancel comes too late; the drop through the
  // foreground route in dedicated mode, Chrome's own drag windows coming and going beside its frame's raise
  chrome_dnd_shared: device({ device: 'cancel', condition: visible, read: dropStatus, request: dndDrag }),
  chrome_dnd_in_front_shared: device({ device: 'background', route: 'background', condition: alreadyInFront, read: dropStatus, request: dndDrag, effect: rose('drops'), inFront: true }),
  chrome_dnd_late_shared: device({ device: 'late', condition: visible, read: dropStatus, request: dndDrag, args: LATE }),
  chrome_dnd_covered_dedicated: device({ device: 'foreground', condition: covered, read: dropStatus, request: dndDrag, effect: rose('drops') }),
  // Qt (`device-qt`, kate on a long document): its scroll bar's value
  qt_scroll_shared: device({ device: 'refusal', read: scrollBar, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, x: 450, y: 350 }] }),
  qt_scroll_dedicated: device({ device: 'foreground', read: scrollBar, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, x: 450, y: 350 }], effect: higher }),
  // the capability report (Design, The capability report), in shared mode
  capabilities: {
    kind: 'desktop',
    device: 'answer',
    cuaOnly: true,
    request: () => ['capabilities', {}],
    check: (ctx, response) => ({ answer_ok: capabilitiesAnswer(response.output, ctx.cuaVersion) }),
  },
};

// the device cases' effect functions take (before, after); run.mjs calls effect(ctx, input, before, after)
for (const op of Object.values(DEVICE_OPS)) {
  if (op.effect) {
    const judge = op.effect;
    op.effect = (ctx, input, before, after) => judge(before, after);
  }
}

export const DEVICE_SCENE_OPS = {
  'device-gtk4': ['gtk4_click_shared', 'gtk4_click_dedicated', 'gtk4_key_shared', 'gtk4_key_dedicated', 'gtk4_key_down_shared', 'gtk4_right_click_shared', 'gtk4_element_click', 'gtk4_scroll_shared', 'gtk4_scroll_dedicated', 'gtk4_move_shared', 'gtk4_move_dedicated', 'gtk4_drag_shared', 'gtk4_drag_dedicated'],
  // the scroll last: its series ends with the page put back at its top (`reset`)
  'device-firefox': ['firefox_click_overlap_shared', 'firefox_click_offscreen_shared', 'firefox_right_click_overlap_shared', 'firefox_click_overlap_dedicated', 'firefox_click_visible_shared', 'firefox_element_click_covered', 'firefox_move_overlap_shared', 'firefox_move_covered_dedicated', 'firefox_drag_overlap_shared', 'firefox_drag_covered_dedicated', 'firefox_scroll_overlap_shared', 'firefox_scroll_covered_dedicated'],
  'device-chrome': ['chrome_drag_visible_path_shared', 'chrome_drag_covered_path_shared', 'chrome_drag_covered_dedicated'],
  'device-chrome-dnd': ['chrome_dnd_shared', 'chrome_dnd_in_front_shared', 'chrome_dnd_late_shared', 'chrome_dnd_covered_dedicated'],
  'device-qt': ['qt_scroll_shared', 'qt_scroll_dedicated'],
  'device-xterm': ['xterm_key_shared', 'xterm_key_dedicated', 'xterm_click_shared'],
  'gnome-text-editor': ['gte_type_text_shared'],
  desktop: ['capabilities'],
};

/** Whether `capabilities` answered the X11 backend's report in shared mode, for this engine's version. */
export function capabilitiesAnswer(output, version) {
  const [semver, build] = (version ?? '').replace(/^cua-engine /, '').split(' ');
  const expected = {
    backend: 'x11',
    tree: 'at_spi',
    input: { background: true, desktop: true },
    capture: { window: 'retained', desktop: true },
    text: { paste: 'verified', literal: true },
    desktop: 'shared',
    version: semver,
    build: build?.replace(/[()]/g, ''),
  };
  // the engine's map serializes its keys in its own order: compared by content
  const canonical = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
  return JSON.stringify(canonical(output)) === JSON.stringify(canonical(expected));
}

/**
 * A device case's verdict from its samples and its audit (`{clean, oks}`, the audit kind its expectation needs): every
 * sample as its expectation says (module header). Returns `{pass, reasons}`.
 */
export function judgeDevice(op, rows, audit) {
  const expect = DEVICE_OPS[op].device;
  const reasons = [];
  if (!rows.length) return { pass: false, reasons: ['no samples'] };
  const bad = (what, pred) => {
    const failed = rows.filter((r) => !pred(r));
    if (failed.length) reasons.push(`${what} on ${failed.length} of ${rows.length} samples (${failed.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
  };
  if (expect === 'answer') bad('the answer was not the report', (r) => r.ok && r.answer_ok === true);
  if (expect === 'refusal') {
    bad('not refused with the Device mode sentence', (r) => !r.ok && r.error === r.expected_error);
    bad('the window changed', (r) => r.unchanged === true);
  }
  if (expect === 'cancel') {
    bad('not cancelled with the drag-and-drop sentence', (r) => !r.ok && r.error === r.expected_error);
    bad('it dropped', (r) => r.dropped === false);
  }
  if (expect === 'late') {
    bad('a request answered success', (r) => !r.ok);
    // "nothing was dropped" only where nothing dropped and the desktop is as it was
    bad('an answer was not honest', (r) => r.error === r.late_error || (r.error === r.expected_error && r.dropped === false && r.witness === true));
    if (!rows.some((r) => r.error === r.late_error)) reasons.push('no answer said the drop may have happened: no cancel came too late');
  }
  if (expect === 'foreground' || expect === 'background') {
    bad('a request failed', (r) => r.ok);
    bad('the effect was not verified', (r) => r.effect === true);
  }
  if (DEVICE_OPS[op].inFront) {
    bad('the engine did not record the window as in front', (r) => r.dnd?.in_front === true);
    bad('the desktop at the end was not as at the start', (r) => r.desktop_same === true);
  }
  if (expect === 'foreground') {
    bad('not the foreground route', (r) => r.route === 'foreground');
    bad('the window was not left active', (r) => r.activated === true);
  }
  // a late cancel's drop changes the desktop: its answer is judged instead
  if (expect !== 'answer' && expect !== 'late') bad('the witness changed', (r) => r.witness === true);
  if (expect !== 'answer') {
    if (!audit) reasons.push('the audit did not run');
    else if (!audit.clean) reasons.push(`the ${audit.kind} audit found ${audit.forbidden?.join(', ') || 'no traced requests'}`);
  }
  return { pass: reasons.length === 0, reasons };
}
