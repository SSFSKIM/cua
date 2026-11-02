// Minimized windows (#171 M4's T4; Design, Minimized windows; Acceptance 7's minimized half): cua's cases of the
// differential run, cua alone (the vendor builds leave a minimized window out of list_windows and answer every request
// to it with an error), each on cua's own window of its scene, the window minimized by the harness (`xprobe minimize`)
// before the request and restored (`xprobe restore`) after it, both outside every witness span:
//
// - `minimized` (either mode): every window-targeted input, element actions included, answers `Window <id> is
//   minimized; activate it first`, exactly, with the witness unchanged, the window still minimized and its contents
//   unchanged, and an X request audit that finds nothing sent at all (the minimized refusal comes before the device
//   refusal, so a family the device mode refuses or sends through the foreground route answers it too);
// - `minimized-read`: `list_windows` lists the window with `minimized: true` and no other window with the field; its
//   tree is read; its screenshot is none; and the same window restored gives one screenshot and loses the field (the
//   control, so an engine that answered no screenshot for every window, or the field for every window, fails);
// - `release` (a key held before the window was minimized, released after): the release answers success, activates
//   nothing (the witness unchanged, the window still minimized), and the audit shows only the release: on the
//   background route nothing the route forbids, on the foreground route the hold's own activation once a sample and
//   nothing more;
// - `activate`: `activate_window` restores the window and gives it the focus, answering success, where every vendor
//   build answers BadMatch for the same activation (M4, C22); the wait for the window manager's map is recorded;
// - `activate-unmapped` (the control of that wait): a window no window manager maps (withdrawn) answers the first
//   focus error once the bound has passed, and stays unmapped.
//
// The person's windows are guarded: before each minimize the harness's front window takes the focus, so the window
// manager's focus fallback lands on a harness window, and the active window after each minimize is recorded on the
// sample; one the harness did not open stops the run.

import { execFileSync } from 'node:child_process';

import { preorder } from './normalize.mjs';
import { activeWindow, configure, xdotool, XPROBE } from './scenes.mjs';

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
  const wm = execFileSync('xprop', ['-id', String(id), 'WM_STATE'], { encoding: 'utf8' });
  const map = execFileSync('xwininfo', ['-id', String(id)], { encoding: 'utf8' });
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

/** The harness's own windows: its scene windows and its front window. */
const harnessIds = (desktop) => [...desktop.windows.map((w) => w.id), desktop.front?.id].filter((id) => Number.isSafeInteger(id));

/**
 * The scene window minimized, the harness's front window holding the focus first; the active window afterwards is
 * recorded, and a window the harness did not open stops the run (the design session's guard for the person's windows).
 */
export async function minimize(ctx) {
  ctx.desktop.focusFront();
  const took = JSON.parse(execFileSync(XPROBE, ['minimize', String(ctx.scene.id)], { encoding: 'utf8' }).trim());
  const active = activeWindow();
  ctx.minimized = { ms: took.ms, active_after: active };
  if (foreignActive(active, harnessIds(ctx.desktop))) {
    throw new Error(`after minimizing ${ctx.scene.label}, the active window is ${active}, which the harness did not open: the run stops`);
  }
}

/** A window's place on the screen (xwininfo's absolute upper-left corner and size). */
function placement(id) {
  const info = execFileSync('xwininfo', ['-id', String(id)], { encoding: 'utf8' });
  return ['Absolute upper-left X', 'Absolute upper-left Y', 'Width', 'Height'].map((k) => info.match(new RegExp(`${k}:\\s+(-?\\d+)`))?.[1]).join(',');
}

/**
 * The window restored and settled: Openbox animates a deiconify, the frame travelling from where the icon would be,
 * so a list of windows read during it finds the window somewhere on the way (the trial run's desktop list_windows
 * differed for that). Waits until two reads 120 ms apart agree, at most 3 s.
 */
async function restoreSettled(id) {
  execFileSync(XPROBE, ['restore', String(id)], { encoding: 'utf8' });
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

/** A read of the minimized window, checked by `judge(ctx, response)`. */
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
      return { answer_ok: response.ok === true && judge(ctx, response.output, listed), minimized_by: ctx.minimized, still: windowState(ctx.scene.id) };
    },
  };
}

/** The listing's facts: this window's entry carries `minimized: true` (or, restored, no field), and no other one does. */
export function listedAsMinimized(windows, id, minimized = true) {
  const mine = windows.filter((w) => w.id === id);
  const others = windows.filter((w) => w.id !== id);
  return mine.length === 1 && (minimized ? mine[0].minimized === true : !('minimized' in mine[0])) && others.every((w) => !('minimized' in w));
}

/**
 * A state read of the minimized window, with or without a screenshot asked for: its tree read through the accessibility
 * bus (more than the X11 fallback's one node), no screenshot, and the field in its window.
 */
export function minimizedState(state) {
  const nodes = preorder(state.ax_tree);
  return state.ax_tree_source === 'at_spi' && nodes.length > 1 && state.window?.minimized === true && Array.isArray(state.screenshots) && state.screenshots.length === 0;
}

/** The restored window's state: one screenshot, and no field. */
export function restoredState(state) {
  return state.ax_tree_source === 'at_spi' && Array.isArray(state.screenshots) && state.screenshots.length === 1 && !('minimized' in (state.window ?? {}));
}

/**
 * A key held before the window was minimized and released after: `key_down` on the window, then the minimize, then
 * the timed `key_up`. Shift, so the hold types nothing. On the background route the hold is a witnessed companion; on
 * the foreground route it activates the window, which is that route's doing, so it runs outside the spans, and the
 * audit counts its activation (`held-release`).
 */
function release({ mode, audit }) {
  return {
    ...base({ expect: 'release', mode }),
    audit,
    prepare: async (ctx) => {
      ctx.desktop.focusFront();
      const hold = () => ctx.engine.request('key_down', { window: win(ctx), key: 'shift' });
      const down = mode === 'dedicated' ? await hold() : await ctx.witnessed(hold);
      if (!down.response.ok) throw new Error(`the hold before the minimize failed: ${down.response.error}`);
      await minimize(ctx);
    },
    read: contents,
    request: (ctx) => ['key_up', { window: win(ctx), key: 'shift' }],
    check: async (ctx) => {
      await sleep(QUIET_MS);
      const after = await contents(ctx);
      return { still_minimized: after.minimized === true, active_window: activeWindow(), keys_down: keysDown(), minimized_by: ctx.minimized };
    },
  };
}

/** The keycodes the X server holds down (`xprobe keys-down`), or null when they could not be read. */
function keysDown() {
  try {
    return JSON.parse(execFileSync(XPROBE, ['keys-down'], { encoding: 'utf8' }).trim());
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
  minimized_list: read(() => ['list_windows', {}], (ctx, output) => listedAsMinimized(output, ctx.scene.id)),
  minimized_tree: read((ctx) => ['get_window_state', { window: win(ctx), include_screenshot: false }], (ctx, output) => minimizedState(output)),
  minimized_shot: read((ctx) => ['get_window_state', { window: win(ctx), include_screenshot: true }], (ctx, output) => minimizedState(output)),
  minimized_restored_shot: read(
    (ctx) => ['get_window_state', { window: win(ctx), include_screenshot: true }],
    (ctx, output, listed) => restoredState(output) && listedAsMinimized(listed, ctx.scene.id, false),
    { minimized: false },
  ),
  minimized_restored_list: read(() => ['list_windows', {}], (ctx, output) => listedAsMinimized(output, ctx.scene.id, false), { minimized: false }),
  // a held key released on the minimized window, on the background route
  minimized_key_up_background: release({ mode: 'shared' }),
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
  minimized_xterm_key_up_foreground: release({ mode: 'dedicated', audit: 'held-release' }),
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
    'minimized_key_up_background',
    'minimized_activate',
    'minimized_activate_withdrawn',
  ],
  'minimized-xterm': ['minimized_xterm_key_shared', 'minimized_xterm_key_dedicated', 'minimized_xterm_key_up_foreground'],
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
    bad('a key is still held at the server', (r) => Array.isArray(r.keys_down) && r.keys_down.length === 0);
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
