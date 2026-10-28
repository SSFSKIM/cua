// The differential run's operations (Acceptance 2–5: every command but text and clipboard, on the scenes): what each
// sends, which window it goes to, what it prepares untimed before the request, and how its effect reads back.
//
// Kinds: `desktop` (no scene window), `read` (a tree read of the scene's shared window), `shot` (a read with its
// screenshot, on each engine's own window), `input` (window-targeted input on each engine's own window: witnessed,
// audited, its effect read back) and `retention` (a change to a retained window, then a screenshot and an input).
// `background` marks the background route, whose audit must be clean; activate_window is the one window request that
// changes the desktop on purpose, so neither its witness nor its audit is expected clean.
//
// A sample runs: `prepare` (untimed: companion requests, the harness's change to the window), the before-state, the
// request inside a witness span, then `after` (untimed: the companion that ends a hold) and the effect. `timing`
// says what a cold sample measures: `spawn` (the engine's start and its first request) or `request` (the request
// alone, where untimed preparation must come first).

import { activeWindow, configure, xdotool } from './scenes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Which operations each scene runs. */
export const SCENE_OPS = {
  desktop: ['list_windows', 'list_apps', 'get_screenshot', 'launch_app'],
  gedit: ['tree', 'tree_shot', 'press_key', 'click'],
  chrome: ['tree', 'tree_shot', 'press_key', 'click'],
  'chrome-input': ['click_element', 'right_click', 'right_click_fallback', 'secondary_action', 'move', 'drag', 'scroll', 'scroll_element_hidden', 'key_down', 'key_up', 'activate_window'],
  'over-budget': ['tree'],
  'big-text': ['tree'],
  'gtk-table': ['tree'],
  calc: ['tree'],
  retention: ['after_resize', 'after_remap', 'after_covered_change'],
};

/** The commands the text and clipboard deviation covers: cua's refusals, checked apart (no vendor runs them here). */
export const REFUSED = ['type_text', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release'];

const GEDIT = [910, 756];
const CHROME = [1050, 780];
const RESIZED = [950, 700];

// ---------------------------------------------------------------------------------------------------------------
// effects of the existing gedit and Chrome scenes (M0.3)

async function geditOrPage(ctx) {
  if (ctx.scene.kind === 'gedit') return { text: await ctx.desktop.geditText(ctx.scene) };
  return ctx.desktop.chromeCounters(ctx.scene);
}

/**
 * gedit's press_key types `x` while the document is at its original length and takes it back with BackSpace
 * otherwise, so a key that did not arrive never makes a later BackSpace delete the scene's own text. Chrome: `x`.
 */
const pressKey = {
  kind: 'input',
  background: true,
  read: geditOrPage,
  request: ({ scene, before }) => ['press_key', { window: { id: scene.id }, key: scene.kind === 'gedit' && before.text.length > scene.originalLength ? 'BackSpace' : 'x' }],
  effect: ({ scene }, input, before, after) => {
    if (scene.kind === 'gedit') {
      if (before.text === null || after.text === null) return null;
      return input.key === 'x' ? after.text.length === before.text.length + 1 : after.text.length === before.text.length - 1;
    }
    return after.keys === before.keys + 1 && after.last === input.key;
  },
};

/**
 * gedit's clicks alternate between two points far apart in the empty area below the text (they move only the caret,
 * which the tree does not show, so no effect is read): clicks at one point less than the double-click time apart would
 * be a double and a triple click, which selects a line the next key then replaces. Chrome: the scene's big button.
 */
const click = {
  kind: 'input',
  background: true,
  read: (ctx) => (ctx.scene.kind === 'gedit' ? null : ctx.desktop.chromeCounters(ctx.scene)),
  request: ({ scene, i }) => {
    if (scene.kind === 'chrome') return ['click', { window: { id: scene.id }, x: Math.round(CHROME[0] / 2), y: Math.round(CHROME[1] * 0.45) }];
    return ['click', { window: { id: scene.id }, x: Math.round(GEDIT[0] / 2) + (i % 2 ? 150 : -150), y: Math.round(GEDIT[1] * 0.8) }];
  },
  effect: ({ scene }, input, before, after) => (scene.kind === 'gedit' || !before || !after ? null : after.clicks === before.clicks + 1),
};

// ---------------------------------------------------------------------------------------------------------------
// the input scene (pages/input.html): window-relative points on its pad, its buttons by element id

/** The status lines of the input scene, parsed. */
export function parseInputStatus(names) {
  const line = (prefix) => names.find((n) => n.startsWith(prefix)) ?? '';
  const num = (text, key) => {
    const m = text.match(new RegExp(`\\b${key} (-?\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const pointer = line('pointer ');
  const keys = line('keys ');
  const context = line('context ');
  return {
    moves: num(pointer, 'moves'),
    downs: num(pointer, 'downs'),
    ups: num(pointer, 'ups'),
    drags: num(pointer, 'drags'),
    key_downs: num(keys, 'down'),
    key_ups: num(keys, 'up'),
    last_key: keys.match(/\blast (\S+)/)?.[1] ?? null,
    scroll: num(line('scroll '), 'scroll'),
    context: num(context, 'context'),
    context_on: context.match(/\bon (\S+)/)?.[1] ?? null,
    clicks: num(line('clicks '), 'clicks'),
  };
}

const status = (ctx) => ctx.desktop.inputStatus(ctx.scene);
// the engine's own element ids where it numbers them (the vendor JavaScript's decimal ids, resolved untimed), else native
const element = (ctx, name) => ctx.ids?.[name] ?? ctx.scene.elements[name];
const rose = (before, after, key, by = 1) => before?.[key] !== null && after?.[key] !== null && after[key] === before[key] + by;

const inputScene = {
  click_element: {
    kind: 'input',
    background: true,
    read: status,
    request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: element(ctx, 'press') }],
    effect: (ctx, input, before, after) => rose(before, after, 'clicks'),
  },
  right_click: {
    kind: 'input',
    background: true,
    read: status,
    request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: element(ctx, 'menu'), mouse_button: 'right' }],
    effect: (ctx, input, before, after) => rose(before, after, 'context') && after.context_on === 'menu',
  },
  // "Far" is below the first screen: no visible point, so the right click falls back to its showContextMenu action
  right_click_fallback: {
    kind: 'input',
    background: true,
    read: status,
    request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: element(ctx, 'far'), mouse_button: 'right' }],
    effect: (ctx, input, before, after) => rose(before, after, 'context') && after.context_on === 'far',
  },
  secondary_action: {
    kind: 'input',
    background: true,
    read: status,
    request: (ctx) => ['perform_secondary_action', { window: { id: ctx.scene.id }, element_id: element(ctx, 'menu'), action: 'showContextMenu' }],
    effect: (ctx, input, before, after) => rose(before, after, 'context') && after.context_on === 'menu',
  },
  // across the pad, alternating between two points so every move is one
  move: {
    kind: 'input',
    background: true,
    read: status,
    request: ({ scene, i }) => ['move', { window: { id: scene.id }, x: i % 2 ? 700 : 300, y: 200 }],
    effect: (ctx, input, before, after) => before.moves !== null && after.moves > before.moves,
  },
  drag: {
    kind: 'input',
    background: true,
    read: status,
    request: ({ scene }) => ['drag', { window: { id: scene.id }, path: [{ x: 200, y: 150 }, { x: 380, y: 180 }, { x: 600, y: 240 }] }],
    effect: (ctx, input, before, after) => rose(before, after, 'drags') && rose(before, after, 'downs') && rose(before, after, 'ups'),
  },
  // down from the top, back up otherwise, so the page stays near its top
  scroll: {
    kind: 'input',
    background: true,
    read: status,
    request: ({ scene, before }) => ['scroll', { window: { id: scene.id }, direction: before.scroll > 0 ? 'up' : 'down', pixels: 300, x: 520, y: 500 }],
    effect: (ctx, input, before, after) => (input.direction === 'down' ? after.scroll > before.scroll : after.scroll < before.scroll),
  },
  // an element with no visible point in the window: both engines refuse; cua's sentence is a declared deviation
  scroll_element_hidden: {
    kind: 'input',
    background: true,
    read: status,
    request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, element_id: element(ctx, 'far'), direction: 'down' }],
    effect: (ctx, input, before, after) => (after.scroll === before.scroll ? null : false),
  },
  // the hold ends after the effect is read (untimed), so every sample starts with nothing held
  key_down: {
    kind: 'input',
    background: true,
    read: status,
    request: ({ scene }) => ['key_down', { window: { id: scene.id }, key: 'a' }],
    after: async (ctx) => ctx.engine.request('key_up', { window: { id: ctx.scene.id }, key: 'a' }),
    effect: (ctx, input, before, after) => rose(before, after, 'key_downs') && after.last_key === 'a',
  },
  // the hold starts before the before-state (untimed); a cold sample is the engine's start, the key_down and the key_up
  key_up: {
    kind: 'input',
    background: true,
    timing: 'spawn',
    prepare: async (ctx) => ctx.engine.request('key_down', { window: { id: ctx.scene.id }, key: 'b' }),
    read: status,
    request: ({ scene }) => ['key_up', { window: { id: scene.id }, key: 'b' }],
    effect: (ctx, input, before, after) => rose(before, after, 'key_ups') && after.last_key === 'b',
  },
  // the one window request that changes the desktop on purpose; the harness gives the focus back after the effect
  activate_window: {
    kind: 'input',
    background: false,
    read: () => ({ active: activeWindow() }),
    readAfter: true,
    request: ({ scene }) => ['activate_window', { window: { id: scene.id } }],
    effect: (ctx, input, before, after) => after.active === ctx.scene.id,
    restore: (ctx) => ctx.desktop.focusFront(),
  },
};

// ---------------------------------------------------------------------------------------------------------------
// retention (Design, Retention and the fixed waits: "the harness checks it where it could go stale")

/** The window retained first: one screenshot by the engine under test before its first change. */
async function retainOnce(ctx) {
  if (ctx.scene.retainedBy === ctx.engine) return;
  const { response } = await ctx.engine.request('get_window_state', { window: { id: ctx.scene.id }, include_screenshot: true });
  if (!response.ok) throw new Error(`retaining ${ctx.scene.label} failed: ${response.error}`);
  ctx.scene.retainedBy = ctx.engine;
}

const keyFollows = {
  // the input after the change: a key to the page, its counter read back
  follow: (ctx) => ['press_key', { window: { id: ctx.scene.id }, key: 'x' }],
  read: (ctx) => ctx.desktop.chromeCounters(ctx.scene),
  effect: (ctx, input, before, after) => after.keys === before.keys + 1 && after.last === 'x',
};

const retention = {
  // the window resized between two sizes, so every sample's pixmap is a new one
  after_resize: {
    kind: 'retention',
    background: true,
    timing: 'request',
    prepare: async (ctx) => {
      await retainOnce(ctx);
      const [w, h] = ctx.i % 2 ? CHROME : RESIZED;
      configure(ctx.scene.id, 0, 0, w, h);
      await sleep(400);
    },
    ...keyFollows,
  },
  // unmapped and mapped again (a new pixmap); the window manager may focus or move the mapped window, so the harness
  // puts it back and gives the focus back to the front window before the request
  after_remap: {
    kind: 'retention',
    background: true,
    timing: 'request',
    prepare: async (ctx) => {
      await retainOnce(ctx);
      xdotool('windowunmap', '--sync', ctx.scene.id);
      await sleep(200);
      xdotool('windowmap', '--sync', ctx.scene.id);
      configure(ctx.scene.id, 0, 0, ...CHROME);
      ctx.desktop.focusFront();
      await sleep(400);
    },
    ...keyFollows,
  },
  // a change drawn while the window is fully covered (the page counts a key the engine sends), then the screenshot,
  // which must show it
  after_covered_change: {
    kind: 'retention',
    background: true,
    timing: 'request',
    prepare: async (ctx) => {
      await retainOnce(ctx);
      ctx.changeBefore = await ctx.desktop.chromeCounters(ctx.scene);
      const { response } = await ctx.engine.request('press_key', { window: { id: ctx.scene.id }, key: 'x' });
      ctx.changeAnswer = response;
      await sleep(300);
    },
    changeEffect: async (ctx) => {
      const after = await ctx.desktop.chromeCounters(ctx.scene);
      return ctx.changeAnswer?.ok === true && after.keys === ctx.changeBefore.keys + 1;
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------
// the desktop and the reads

const desktop = {
  list_windows: { kind: 'desktop', request: () => ['list_windows', {}] },
  list_apps: { kind: 'desktop', request: () => ['list_apps', {}] },
  get_screenshot: { kind: 'desktop', shot: true, request: () => ['get_screenshot', {}] },
  // the harness's own desktop entry only (the engine's XDG directories point at it), its program touches a file
  launch_app: {
    kind: 'desktop',
    apps: true,
    request: () => ['launch_app', { app: 'cua171 Launch Probe' }],
    read: (ctx) => ({ launched: ctx.desktop.launchCount() }),
    readAfter: true,
    effect: (ctx, input, before, after) => after.launched === before.launched + 1,
  },
};

export const OPS = {
  ...desktop,
  tree: { kind: 'read', request: ({ scene }) => ['get_window_state', { window: { id: scene.id }, include_screenshot: false }] },
  tree_shot: { kind: 'shot', request: ({ scene }) => ['get_window_state', { window: { id: scene.id }, include_screenshot: true }] },
  press_key: pressKey,
  click,
  ...inputScene,
  ...Object.fromEntries(Object.entries(retention).map(([name, op]) => [name, { ...op, request: ({ scene }) => ['get_window_state', { window: { id: scene.id }, include_screenshot: true }] }])),
};

/** Whether an operation goes to each engine's own window (screenshots, input, retention). */
export const ownWindow = (op) => ['shot', 'input', 'retention'].includes(OPS[op].kind);
/** Whether an operation is window-targeted (witnessed). */
export const targeted = (op) => OPS[op].kind !== 'desktop';
/** Whether an operation's samples carry a screenshot to compare. */
export const shotOf = (op) => OPS[op].kind === 'shot' || OPS[op].kind === 'retention' || OPS[op].shot === true;
/** Whether an operation is window-targeted input (audited, its effect read back). */
export const inputOp = (op) => OPS[op].kind === 'input' || OPS[op].kind === 'retention';
