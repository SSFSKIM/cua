// Minimized windows (#171 M4's T4; Design, Minimized windows; Acceptance 7's minimized half): cua's cases of the
// differential run, cua alone (the vendor builds leave a minimized window out of list_windows and answer every request
// to it with an error), each on cua's own window of its scene, the window minimized by the harness (`xprobe minimize`)
// before the request and restored (`xprobe restore`) after it, both outside every witness span:
//
// - `minimized` (either mode): every window-targeted input, element actions included, answers `Window <id> is
//   minimized; activate it first`, exactly, with the witness unchanged, the window still minimized and its contents
//   unchanged, and an X request audit that finds nothing sent at all (the minimized refusal comes before the device
//   refusal, so a family the device mode refuses or sends through the foreground route answers it too);
// - `minimized-read`: `list_windows` lists the window with `minimized: true` and no other window with the field; a
//   state read answers for the requested window (its id, the field on it, a tree showing the fixture's marker) with no
//   screenshot; and the same window restored gives one screenshot, a real image of that window (its file decodes, at
//   the window's size, and matches an independent capture by content), and loses the field (the control, so an engine
//   that answered no screenshot for every window, the field for every window, or another window's state or image,
//   fails);
// - `release` (a key held before the window was minimized, released after; the design session's proof, per route):
//   the hold is proven first, then the release: on the background route the window is a harness recorder
//   (`minimized-recorder`, `xprobe record … managed`), which received the hold's synthetic press and then exactly its
//   release, with nothing but the route's own FocusOut beside it; on the foreground route the server's keymap shows the
//   key down after the hold and up after the release. Either way the release answers success, activates nothing (the
//   witness unchanged, the window still minimized), and the audit, split at the harness's marks in the trace, holds
//   release events for exactly the held set, with no press, no motion, no activation and no focus request
//   (audit.mjs `auditHeldRelease`);
// - `activate`: `activate_window` restores the window and gives it the focus, answering success, where every vendor
//   build answers BadMatch for the same activation (M4, C22); the wait for the window manager's map is recorded;
// - `activate-unmapped` (the control of that wait): a window no window manager maps (withdrawn) answers the first
//   focus error once the bound has passed, and stays unmapped.
//
// The person's windows are guarded: before each minimize the harness's front window takes the focus, so the window
// manager's focus fallback lands on a harness window, and the active window after each minimize is recorded on the
// sample; one the harness did not open stops the run.

import { xExecFileSync } from './xspawn.mjs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { imageVerdict } from './images.mjs';
import { preorder } from './normalize.mjs';
import { activeWindow, configure, xdotool, XPROBE } from './scenes.mjs';
import { xprobe } from './xtools.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** cua's answer to window-targeted input while the window is minimized (engine.rs). */
export const minimizedSentence = (id) => `Window ${id} is minimized; activate it first`;

/** The engine's bound on waiting for a minimized window's map before its focus is set again (engine/windows.rs). */
export const MAP_WAIT_MS = 1000;

/** How long a refused request's window is watched for anything arriving after the answer. */
const QUIET_MS = 400;
const DEDICATED = ['--desktop', 'dedicated'];

/** A window's ICCCM state and whether it is viewable, read with the X tools (independent of any engine). */
export function windowState(id) {
  const wm = xExecFileSync('xprop', ['-id', String(id), 'WM_STATE'], { encoding: 'utf8' });
  const map = xExecFileSync('xwininfo', ['-id', String(id)], { encoding: 'utf8' });
  return { state: wm.match(/window state: (\w+)/)?.[1] ?? null, viewable: /Map State: IsViewable/.test(map) };
}

/** Whether a window reads as minimized: Iconic and not viewable. */
export const isMinimized = ({ state, viewable }) => state === 'Iconic' && !viewable;

/**
 * Whether the active window after a minimize is one the person could own: anything but none, the harness's front
 * window or one of its scene windows. `harness` is the list of the harness's window ids.
 */
export function foreignActive(active, harness) {
  return active !== 0 && !harness.includes(active);
}

/** The harness's own windows: every window the run registered (scenes.mjs `harnessIds`), its front and holder among them. */
const harnessIds = (desktop) => [...desktop.harnessIds()];

/**
 * The scene window minimized, the harness's front window holding the focus first; the active window afterwards is
 * recorded, and a window the harness did not open stops the run (the design session's guard for the person's windows).
 */
export async function minimize(ctx) {
  ctx.desktop.focusFront();
  const took = JSON.parse(xprobe(['minimize', ctx.scene.id]).trim());
  const active = activeWindow();
  ctx.minimized = { ms: took.ms, active_after: active };
  if (foreignActive(active, harnessIds(ctx.desktop))) {
    throw new Error(`after minimizing ${ctx.scene.label}, the active window is ${active}, which the harness did not open: the run stops`);
  }
}

/** A window's place on the screen (xwininfo's absolute upper-left corner and size). */
function placement(id) {
  const info = xExecFileSync('xwininfo', ['-id', String(id)], { encoding: 'utf8' });
  return ['Absolute upper-left X', 'Absolute upper-left Y', 'Width', 'Height'].map((k) => info.match(new RegExp(`${k}:\\s+(-?\\d+)`))?.[1]).join(',');
}

/**
 * The window restored and settled: Openbox animates a deiconify, the frame travelling from where the icon would be,
 * so a list of windows read during it finds the window somewhere on the way (the trial run's desktop list_windows
 * differed for that). Waits until two reads 120 ms apart agree, at most 3 s.
 */
async function restoreSettled(id) {
  xprobe(['restore', id]);
  const deadline = Date.now() + 3000;
  let last = placement(id);
  for (;;) {
    await sleep(120);
    const now = placement(id);
    if (now === last || Date.now() > deadline) return;
    last = now;
  }
}

/** The scene window restored where it was, and the front window given the focus back (outside every span). */
export async function restore(ctx) {
  if (isMinimized(windowState(ctx.scene.id))) await restoreSettled(ctx.scene.id);
  ctx.desktop.focusFront();
}

/** What a minimized case's window shows: its state and its contents (gedit's text, or xterm's received bytes). */
async function contents(ctx) {
  if (ctx.scene.recorder) return { minimized: isMinimized(windowState(ctx.scene.id)) };
  const { readFileSync } = await import('node:fs');
  const state = windowState(ctx.scene.id);
  const text = ctx.scene.record ? readFileSync(ctx.scene.record, 'latin1') : await ctx.desktop.geditText(ctx.scene);
  return { minimized: isMinimized(state), text };
}

/** An element of the window that has actions, its native id, read before the window is minimized. */
async function actionElement(ctx) {
  const nodes = preorder((await ctx.desktop.state(ctx.scene)).ax_tree);
  const node = nodes.find((n) => Array.isArray(n.actions) && n.actions.length > 0 && n.id !== undefined);
  if (!node) throw new Error(`${ctx.scene.label} shows no element with an action`);
  return { id: String(node.id), action: node.actions[0] };
}

/** The base every case shares: cua alone, a handful a block, the window restored after each sample. */
function base({ expect, mode = 'shared' }) {
  return {
    kind: 'input',
    device: expect,
    cuaOnly: true,
    warmSamples: 2,
    cuaArgs: () => (mode === 'dedicated' ? DEDICATED : []),
    route: () => null,
    restore,
  };
}

/** A refusal: the request to the minimized window answers the minimized sentence, with nothing sent and nothing changed. */
function refused(request, { mode = 'shared', element = false } = {}) {
  return {
    ...base({ expect: 'minimized', mode }),
    prepare: async (ctx) => {
      if (element) ctx.element = await actionElement(ctx);
      await minimize(ctx);
    },
    read: contents,
    request: (ctx) => request(ctx),
    check: async (ctx) => {
      await sleep(QUIET_MS);
      const after = await contents(ctx);
      return {
        expected_error: minimizedSentence(ctx.scene.id),
        unchanged: ctx.before !== null && JSON.stringify(after) === JSON.stringify(ctx.before) && after.minimized === true,
        minimized_by: ctx.minimized,
      };
    },
  };
}

const win = (ctx) => ({ id: ctx.scene.id });
/** What a state read of the case's window must be bound to: the requested window and the fixture's marker. */
const expected = (ctx) => ({ id: ctx.scene.id, marker: markerOf(ctx.scene) });

/** A read of the minimized window, checked by `judge(ctx, output, listed)` (which may be asynchronous). */
function read(request, judge, { minimized = true } = {}) {
  return {
    ...base({ expect: 'minimized-read' }),
    prepare: async (ctx) => {
      await minimize(ctx);
      // the control: the same window, minimized and then restored
      if (!minimized) {
        await restoreSettled(ctx.scene.id);
        ctx.desktop.focusFront();
      }
    },
    request,
    check: async (ctx, response) => {
      const listed = await ctx.desktop.listWindows();
      const facts = { minimized_by: ctx.minimized, still: windowState(ctx.scene.id) };
      return { answer_ok: response.ok === true && (await judge(ctx, response.output, listed, facts)) === true, ...facts };
    },
  };
}

/**
 * The listing's facts: this window's entry carries `minimized: true` (or, restored, no field), and no other window of
 * the run's (`ours`, the ids the harness opened: none of them minimized) does, with at least one listed, so an engine
 * that marks every window fails. The person's windows are never judged: one they minimized before the run is listed as
 * minimized, and the harness never requires their windows to change.
 */
export function listedAsMinimized(windows, id, minimized, ours) {
  const mine = windows.filter((w) => w.id === id);
  const others = windows.filter((w) => w.id !== id && ours.has(w.id));
  return mine.length === 1 && (minimized ? mine[0].minimized === true : !('minimized' in mine[0])) && others.length > 0 && others.every((w) => !('minimized' in w));
}

/** The fixture's marker a state read must show: gedit's scratch file name (in its title), else the scene's label. */
export const markerOf = (scene) => (scene.file ? basename(scene.file) : scene.label);

/** The state read's tree is the fixture's own: read through the accessibility bus, more than one node, its marker shown. */
function ownTree(state, marker) {
  const nodes = preorder(state.ax_tree);
  return state.ax_tree_source === 'at_spi' && nodes.length > 1 && nodes.some((n) => typeof n.name === 'string' && n.name.includes(marker));
}

/**
 * A state read of the minimized window `{id, marker}`, with or without a screenshot asked for: the answer is for that
 * window (its id, the field on it), its tree is the fixture's own, and it has no screenshot.
 */
export function minimizedState(state, { id, marker }) {
  return state.window?.id === id && state.window.minimized === true && ownTree(state, marker) && Array.isArray(state.screenshots) && state.screenshots.length === 0;
}

/**
 * The restored window's state: the answer is for that window, without the field, its tree the fixture's own, with
 * exactly one screenshot, which `shot` (`shotVerdict`) judged a real image of the window.
 */
export function restoredState(state, { id, marker }, shot) {
  return state.window?.id === id && !('minimized' in state.window) && ownTree(state, marker) && Array.isArray(state.screenshots) && state.screenshots.length === 1 && shot?.ok === true;
}

/** The same window captured twice: no rows masked, at most 0.1% of the pixels off by more than 32 in a channel. */
const SAME_WINDOW = { maskTopRows: 0, maxOverFraction: 0.001 };

/**
 * Whether a screenshot entry is a real image of `window`: it names a file, which exists and decodes (`diff`, the
 * `xprobe imgdiff` of an independent capture of the window against it, is null otherwise), at the window's size, with
 * the window's contents. Returns `{ok, reason}`.
 */
export function shotVerdict(entry, window, diff) {
  if (typeof entry?.filepath !== 'string' || !entry.filepath) return { ok: false, reason: 'the entry names no file' };
  if (!diff) return { ok: false, reason: 'the file is missing or does not decode as a JPEG' };
  const [w, h] = diff.b;
  if (w !== window?.width || h !== window?.height) return { ok: false, reason: `the image is ${w}×${h}, the window ${window?.width}×${window?.height}` };
  return imageVerdict(diff, SAME_WINDOW);
}

/**
 * A screenshot entry judged against the window itself: an independent capture (`xprobe snap`, the window's own drawable
 * once it holds still, which the engine's retention keeps readable under cover) compared with the entry's file.
 */
function inspectShot(entry, window) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-snap-'));
  try {
    let diff = null;
    if (typeof entry?.filepath === 'string' && existsSync(entry.filepath)) {
      const reference = join(dir, 'reference.jpg');
      xExecFileSync(XPROBE, ['snap', String(window.id), reference], { encoding: 'utf8' });
      try {
        diff = JSON.parse(xExecFileSync(XPROBE, ['imgdiff', reference, entry.filepath, '0'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      } catch {
        // it does not decode
      }
    }
    return { ...shotVerdict(entry, window, diff), ...(diff ? { mad: diff.mad, over: diff.over, size: diff.b } : {}) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The events a background hold put into its window: the synthetic presses, a synthetic FocusIn allowed beside them. */
export function syntheticHold(events) {
  const held = [];
  const extra = [];
  for (const e of events ?? []) {
    if (e.send === true && ['KeyPress', 'ButtonPress'].includes(e.type)) held.push({ type: e.type, detail: e.detail });
    else if (!(e.send === true && e.type === 'FocusIn')) extra.push(e);
  }
  return { held, extra };
}

/**
 * Whether the events a background release put into its window are exactly one synthetic release of each held key or
 * button, with nothing beside them but the route's own synthetic FocusOut. Returns `{ok, reasons}`.
 */
export function syntheticRelease(events, held) {
  const reasons = [];
  if (!held?.length) reasons.push('no hold was proven');
  const owed = (held ?? []).map((h) => `${h.type === 'KeyPress' ? 'KeyRelease' : 'ButtonRelease'} ${h.detail}`);
  for (const e of events ?? []) {
    if (e.send === true && e.type === 'FocusOut') continue;
    const k = e.send === true ? owed.indexOf(`${e.type} ${e.detail}`) : -1;
    if (k >= 0) owed.splice(k, 1);
    else reasons.push(`the window received ${e.send ? 'synthetic' : 'real'} ${e.type} ${e.detail}`);
  }
  for (const missing of owed) reasons.push(`the window never received ${missing}`);
  return { ok: reasons.length === 0, reasons };
}

/** The keys a foreground (XTEST) hold put down at the server: down after it and not before. */
export function xtestHold(before, after) {
  return (after ?? []).filter((k) => !(before ?? []).includes(k));
}

/** Whether a foreground release left the held keys up, and no key down at all. Returns `{ok, reasons}`. */
export function xtestRelease(after, held) {
  const reasons = [];
  if (!held?.length) reasons.push('no hold was proven');
  if (!Array.isArray(after)) reasons.push('the keymap was not read');
  else if (after.length) reasons.push(`keys still down: ${after.join(', ')}`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * A key held before the window was minimized and released after: `key_down` on the window, then the minimize, then
 * the timed `key_up`. Shift, so the hold types nothing. The hold is proven before the minimize and the release after
 * the quiet, on the route's own evidence (module header), and the trace is marked around each for the audit
 * (`ctx.traceMark`, the audit pass's). On the background route the hold is a witnessed companion; on the foreground
 * route it activates the window, which is that route's doing, so it runs outside the spans, and the audit allows its
 * activation.
 */
function release({ mode, holdRoute }) {
  const background = holdRoute === 'background';
  return {
    ...base({ expect: 'release', mode }),
    audit: 'held-release',
    holdRoute,
    prepare: async (ctx) => {
      ctx.desktop.focusFront();
      const hold = () => ctx.engine.request('key_down', { window: win(ctx), key: 'shift' });
      if (background) await ctx.scene.recorder.mark('before-hold');
      else ctx.keysBefore = keysDown();
      await ctx.traceMark?.('hold');
      const down = background ? await ctx.witnessed(hold) : await hold();
      await ctx.traceMark?.('held');
      if (background) ctx.holdEvents = await ctx.scene.recorder.mark('hold');
      else ctx.keysHeld = keysDown();
      if (!down.response.ok) throw new Error(`the hold before the minimize failed: ${down.response.error}`);
      await minimize(ctx);
      // what the minimize itself caused at the window is the minimize's, not the release's
      if (background) await ctx.scene.recorder.mark('minimized');
      await ctx.traceMark?.('release');
    },
    read: contents,
    request: (ctx) => ['key_up', { window: win(ctx), key: 'shift' }],
    check: async (ctx) => {
      await sleep(QUIET_MS);
      await ctx.traceMark?.('released');
      const after = await contents(ctx);
      const facts = { still_minimized: after.minimized === true, active_window: activeWindow(), minimized_by: ctx.minimized };
      if (background) return { ...facts, hold_events: ctx.holdEvents ?? null, release_events: await ctx.scene.recorder.mark('release') };
      return { ...facts, keys_before: ctx.keysBefore ?? null, keys_held: ctx.keysHeld ?? null, keys_down: keysDown() };
    },
  };
}

/** The keycodes the X server holds down (`xprobe keys-down`), or null when they could not be read. */
function keysDown() {
  try {
    return JSON.parse(xprobe(['keys-down']).trim());
  } catch {
    return null;
  }
}

export const MINIMIZED_OPS = {
  // gedit (`minimized`): every window-targeted input refused, in shared mode, and the commonest in dedicated mode too
  minimized_press_key: refused((ctx) => ['press_key', { window: win(ctx), key: 'x' }]),
  minimized_key_down: refused((ctx) => ['key_down', { window: win(ctx), key: 'x' }]),
  minimized_click: refused((ctx) => ['click', { window: win(ctx), x: 200, y: 200 }]),
  minimized_right_click: refused((ctx) => ['click', { window: win(ctx), x: 200, y: 200, mouse_button: 'right' }]),
  minimized_click_element: refused((ctx) => ['click', { window: win(ctx), element_id: ctx.element.id }], { element: true }),
  minimized_secondary_action: refused((ctx) => ['perform_secondary_action', { window: win(ctx), element_id: ctx.element.id, action: ctx.element.action }], { element: true }),
  minimized_move: refused((ctx) => ['move', { window: win(ctx), x: 200, y: 200 }]),
  minimized_scroll: refused((ctx) => ['scroll', { window: win(ctx), x: 200, y: 200, direction: 'down', pixels: 100 }]),
  minimized_drag: refused((ctx) => ['drag', { window: win(ctx), path: [{ x: 100, y: 200 }, { x: 300, y: 200 }] }]),
  minimized_type_text: refused((ctx) => ['type_text', { window: win(ctx), text: 'cua171 refused' }]),
  minimized_type_characters: refused((ctx) => ['type_characters', { window: win(ctx), text: 'abc' }]),
  minimized_clipboard_read: refused((ctx) => ['clipboard_read', { window: win(ctx) }]),
  minimized_clipboard_write: refused((ctx) => ['clipboard_write', { window: win(ctx), handle: 'clipboard-1' }]),
  minimized_press_key_dedicated: refused((ctx) => ['press_key', { window: win(ctx), key: 'x' }], { mode: 'dedicated' }),
  minimized_click_dedicated: refused((ctx) => ['click', { window: win(ctx), x: 200, y: 200 }], { mode: 'dedicated' }),
  minimized_type_text_dedicated: refused((ctx) => ['type_text', { window: win(ctx), text: 'cua171 refused' }], { mode: 'dedicated' }),
  // the reads, and the restored window as their control
  minimized_list: read(() => ['list_windows', {}], (ctx, output) => listedAsMinimized(output, ctx.scene.id, true, ctx.desktop.harnessIds())),
  minimized_tree: read((ctx) => ['get_window_state', { window: win(ctx), include_screenshot: false }], (ctx, output) => minimizedState(output, expected(ctx))),
  minimized_shot: read((ctx) => ['get_window_state', { window: win(ctx), include_screenshot: true }], (ctx, output) => minimizedState(output, expected(ctx))),
  minimized_restored_shot: read(
    (ctx) => ['get_window_state', { window: win(ctx), include_screenshot: true }],
    (ctx, output, listed, facts) => {
      facts.shot = inspectShot(output?.screenshots?.[0], { id: ctx.scene.id, width: output?.window?.width, height: output?.window?.height });
      return restoredState(output, expected(ctx), facts.shot) && listedAsMinimized(listed, ctx.scene.id, false, ctx.desktop.harnessIds());
    },
    { minimized: false },
  ),
  minimized_restored_list: read(() => ['list_windows', {}], (ctx, output) => listedAsMinimized(output, ctx.scene.id, false, ctx.desktop.harnessIds()), { minimized: false }),
  // a held key released on the minimized window, on the background route: a recorder window (`minimized-recorder`),
  // which shows what the release delivered
  minimized_key_up_background: release({ mode: 'shared', holdRoute: 'background' }),
  // the activation that restores it, and the control of its wait: a window no window manager maps
  minimized_activate: {
    ...base({ expect: 'activate' }),
    audit: 'foreground',
    prepare: minimize,
    request: (ctx) => ['activate_window', { window: win(ctx) }],
    check: async (ctx) => {
      const state = windowState(ctx.scene.id);
      return { restored: state.state === 'Normal' && state.viewable, active: activeWindow() === ctx.scene.id, minimized_by: ctx.minimized };
    },
  },
  minimized_activate_withdrawn: {
    ...base({ expect: 'activate-unmapped' }),
    audit: 'foreground',
    prepare: (ctx) => {
      ctx.desktop.focusFront();
      // unmapped by its client: the window manager withdraws it and maps it again only when its client does
      xdotool('windowunmap', '--sync', ctx.scene.id);
      ctx.withdrawn = { active_after: activeWindow() };
      if (foreignActive(ctx.withdrawn.active_after, harnessIds(ctx.desktop))) throw new Error(`after withdrawing ${ctx.scene.label}, the active window is ${ctx.withdrawn.active_after}, which the harness did not open: the run stops`);
    },
    request: (ctx) => ['activate_window', { window: win(ctx) }],
    check: async (ctx) => ({ expected_error_start: `failed to focus X11 window ${ctx.scene.id}: `, still: windowState(ctx.scene.id), withdrawn_by: ctx.withdrawn }),
    restore: async (ctx) => {
      if (!windowState(ctx.scene.id).viewable) xdotool('windowmap', '--sync', ctx.scene.id);
      const [w, h] = ctx.scene.size;
      configure(ctx.scene.id, 0, 0, w, h);
      ctx.desktop.focusFront();
    },
  },
  // xterm (`minimized-xterm`): its keys refused in both modes before the device refusal, and a key held through the
  // foreground route in dedicated mode released on the minimized window without activating it
  minimized_xterm_key_shared: refused((ctx) => ['press_key', { window: win(ctx), key: 'x' }]),
  minimized_xterm_key_dedicated: refused((ctx) => ['press_key', { window: win(ctx), key: 'x' }], { mode: 'dedicated' }),
  minimized_xterm_key_up_foreground: release({ mode: 'dedicated', holdRoute: 'foreground' }),
};

export const MINIMIZED_SCENE_OPS = {
  minimized: [
    'minimized_press_key',
    'minimized_key_down',
    'minimized_click',
    'minimized_right_click',
    'minimized_click_element',
    'minimized_secondary_action',
    'minimized_move',
    'minimized_scroll',
    'minimized_drag',
    'minimized_type_text',
    'minimized_type_characters',
    'minimized_clipboard_read',
    'minimized_clipboard_write',
    'minimized_press_key_dedicated',
    'minimized_click_dedicated',
    'minimized_type_text_dedicated',
    'minimized_list',
    'minimized_tree',
    'minimized_shot',
    'minimized_restored_shot',
    'minimized_restored_list',
    'minimized_activate',
    'minimized_activate_withdrawn',
  ],
  'minimized-xterm': ['minimized_xterm_key_shared', 'minimized_xterm_key_dedicated', 'minimized_xterm_key_up_foreground'],
  'minimized-recorder': ['minimized_key_up_background'],
};

/**
 * A minimized case's verdict from its samples and its audit (`{clean, kind, answered}`), as judgeDevice's are: every
 * sample as its expectation says (module header), and, where the case is audited, the audit clean over at least one
 * audited request that answered as the case expects. Returns `{pass, reasons}`.
 */
export function judgeMinimized(op, rows, audit) {
  const expect = MINIMIZED_OPS[op].device;
  const reasons = [];
  if (!rows.length) return { pass: false, reasons: ['no samples'] };
  const bad = (what, pred) => {
    const failed = rows.filter((r) => !pred(r));
    if (failed.length) reasons.push(`${what} on ${failed.length} of ${rows.length} samples (${failed.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
  };
  let expected = (a) => a.ok;
  if (expect === 'minimized') {
    bad('not refused with the minimized sentence', (r) => !r.ok && r.error === r.expected_error);
    bad('the window changed, or is no longer minimized', (r) => r.unchanged === true);
    expected = (a) => !a.ok && a.error === a.expected_error;
  }
  if (expect === 'minimized-read') bad('the answer was not as minimized windows are read', (r) => r.ok && r.answer_ok === true);
  if (expect === 'release') {
    bad('the release did not run', (r) => r.ok);
    bad('the window is no longer minimized', (r) => r.still_minimized === true);
    if (MINIMIZED_OPS[op].holdRoute === 'background') {
      bad('the hold was not proven (the window received no synthetic press, or more)', (r) => {
        const hold = syntheticHold(r.hold_events);
        return hold.held.length > 0 && hold.extra.length === 0;
      });
      bad('the window did not receive exactly the release of the held set', (r) => syntheticRelease(r.release_events, syntheticHold(r.hold_events).held).ok);
    } else {
      bad('the hold was not proven (no key went down at the server)', (r) => xtestHold(r.keys_before, r.keys_held).length > 0);
      bad('a key is still held at the server', (r) => xtestRelease(r.keys_down, xtestHold(r.keys_before, r.keys_held)).ok);
    }
  }
  if (expect === 'activate') {
    bad('the activation did not answer success', (r) => r.ok);
    bad('the window was not restored and active', (r) => r.restored === true && r.active === true);
  }
  if (expect === 'activate-unmapped') {
    bad('not the first focus error', (r) => !r.ok && r.error?.startsWith(r.expected_error_start) && /\bMatch\b/.test(r.error));
    bad('answered before the bound', (r) => r.request_ms >= MAP_WAIT_MS);
    bad('the window was mapped', (r) => r.still?.viewable === false);
    expected = (a) => !a.ok;
  }
  // an activation changes the desktop on purpose: its witness is not judged
  if (!['activate', 'activate-unmapped'].includes(expect)) bad('the witness changed', (r) => r.witness === true);
  if (!audit) reasons.push('the audit did not run');
  else if (audit.kind !== 'skipped') {
    if (!audit.clean) reasons.push(`the ${audit.kind} audit found ${audit.forbidden?.join(', ') || 'no traced requests'}`);
    const answered = audit.answered ?? [];
    if (!answered.length) reasons.push(`the ${audit.kind} audit audited no request`);
    else if (!answered.every(expected)) reasons.push(`the ${audit.kind} audit's requests did not answer as the case expects (${answered.map((a) => (a.ok ? 'success' : a.error)).join('; ').slice(0, 200)})`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** The audit kind a minimized case is audited with: nothing sent for a refusal, else the case's own, else background. */
export function minimizedAuditKind(op) {
  const def = MINIMIZED_OPS[op];
  if (def.device === 'minimized') return 'nothing-sent';
  return def.audit ?? 'background';
}
