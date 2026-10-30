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
// - `answer`: `capabilities`, its answer checked.
//
// Scenes: `device-gtk4` (the harness's GTK 4 scene, pages/gtk4-input.py: GTK 4 ignores synthetic input always),
// `device-firefox` (Firefox on pages/input.html: Gecko ignores synthetic coordinate clicks unless its window is fully
// unobscured; the cases put a window over its bottom half, or part of it off the screen, or leave it fully visible),
// `device-xterm` (xterm running the recorder: it ignores synthetic keys and takes clicks), and gnome-text-editor's
// text refusal on the `gnome-text-editor` scene.

import { readFileSync } from 'node:fs';

import { readGtk4Status } from './families.mjs';
import { activeWindow, configure } from './scenes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Device mode sentence (Design, Device mode), for the application `list_windows` names. */
export const deviceSentence = (app) => `${app} does not accept background input; use a dedicated desktop or activate the window first`;

const DEDICATED = ['--desktop', 'dedicated'];
/** How long a refused request's window is watched for anything arriving after the answer. */
const QUIET_MS = 400;

// ---------------------------------------------------------------------------------------------------------------
// the scenes' readers and places

const gtk4 = (ctx) => readGtk4Status(ctx.desktop, ctx.scene);
const page = (ctx) => ctx.desktop.inputStatus(ctx.scene);
const record = (ctx) => readFileSync(ctx.scene.record, 'latin1');
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

/** The scene window with its right fifth off the screen, nothing over it. */
function offscreen(ctx) {
  const [w, h] = ctx.scene.size;
  configure(ctx.scene.id, 1280 - Math.round(w * 0.8), 0, w, h);
  ctx.desktop.arrangeFront('visible');
  ctx.desktop.raise(ctx.scene);
}

/** The front window over the whole screen. */
const covered = (ctx) => ctx.desktop.arrangeFront('covered');

// ---------------------------------------------------------------------------------------------------------------
// the cases

/**
 * A case: `device` its expectation, `scene` where it runs, `condition` the arrangement before each sample, `read` what
 * the window counts, `request`, and `effect` (from the counts before and after) for the cases that must take effect.
 */
function device({ device: expect, condition = covered, read, request, effect, route }) {
  const dedicated = expect === 'foreground';
  return {
    kind: 'input',
    device: expect,
    cuaOnly: true,
    // a handful a block: these cases prove behaviour, not speed (cua alone has no bar)
    warmSamples: 2,
    cuaArgs: () => (dedicated ? DEDICATED : []),
    // the witness: the foreground allowance only where the foreground route is expected and reported (run.mjs)
    route: () => route ?? (dedicated ? 'foreground' : null),
    prepare: async (ctx) => {
      condition(ctx);
      await sleep(300);
    },
    read,
    request,
    effect: expect === 'refusal' ? undefined : effect,
    check: async (ctx, response) => {
      const out = {};
      if (expect === 'refusal') {
        out.expected_error = deviceSentence(ctx.scene.app);
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.unchanged = ctx.before !== null && after !== null && JSON.stringify(after) === JSON.stringify(ctx.before);
      }
      if (dedicated && response.ok) out.activated = activeWindow() === ctx.scene.id;
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
  'device-gtk4': ['gtk4_click_shared', 'gtk4_click_dedicated', 'gtk4_key_shared', 'gtk4_key_dedicated', 'gtk4_key_down_shared', 'gtk4_right_click_shared', 'gtk4_element_click'],
  'device-firefox': ['firefox_click_overlap_shared', 'firefox_click_offscreen_shared', 'firefox_right_click_overlap_shared', 'firefox_click_overlap_dedicated', 'firefox_click_visible_shared', 'firefox_element_click_covered'],
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
  return JSON.stringify(output) === JSON.stringify(expected);
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
  if (expect === 'foreground' || expect === 'background') {
    bad('a request failed', (r) => r.ok);
    bad('the effect was not verified', (r) => r.effect === true);
  }
  if (expect === 'foreground') {
    bad('not the foreground route', (r) => r.route === 'foreground');
    bad('the window was not left active', (r) => r.activated === true);
  }
  if (expect !== 'answer') bad('the witness changed', (r) => r.witness === true);
  if (expect !== 'answer') {
    if (!audit) reasons.push('the audit did not run');
    else if (!audit.clean) reasons.push(`the ${audit.kind} audit found ${audit.forbidden?.join(', ') || 'no traced requests'}`);
  }
  return { pass: reasons.length === 0, reasons };
}
