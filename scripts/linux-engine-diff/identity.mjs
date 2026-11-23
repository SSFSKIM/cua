// Identity (#171 M4's T5; Design, Window association; Acceptance 7's identity half; the design session's rulings F5,
// C14 and C15): cua's cases of the differential run, cua alone (every vendor build answers a one-node X11 tree for
// windows whose frames share a title and size, behaviour §4, and none applies kate's caption rule), on scenes of
// several windows with one title, unique to the run, and one size, each window showing its own marker
// (scenes.mjs `openDuplicates`):
//
// - `identity` (Chrome, pages/identity.html), `identity-gtk3` and `identity-gtk4` (one process of
//   pages/identity-windows.py each). Each sample goes to one of the scene's windows in turn (`targetOf`), so every
//   window is read in every block. The arrangement is the harness's, before the request and outside every witness span:
//   - placed apart (each window at its own place, the harness's front window active): a read returns the window's own
//     tree, its marker and no other window's, except under GTK 4, whose frames report window-relative extents, where
//     it answers the duplicates sentence;
//   - stacked on one place, the front window (a separate witness window) active: every read answers
//     `Window <id> matches several accessibility windows; close or retitle the duplicates`;
//   - stacked, the read window itself active: under GTK 3, whose frames carry the `active` state, the read returns
//     its own tree (the active-state tie-break; an engine without it answers the sentence and fails); Chrome marks no
//     frame active (measured: no frame and no descendant of an active window differs from an inactive one's), and
//     GTK 4 is refused outright, so both answer the sentence;
//   - stacked, another of the duplicates active: every read answers the sentence.
// - On the Chrome scene, stacked, the front window active: the requests that associate before they act (an element
//   click, a secondary action, `type_text`, `clipboard_read`) answer the sentence with nothing sent (the X request
//   audit finds no SendEvent and nothing the background route forbids) and the witness unchanged; and the release
//   (`key_up` of a key held while the windows were apart, released once they are stacked) runs, the page then showing
//   the key up again.
// - `identity-kate` (two kate windows, each its own process and document): kate titles a window `<file>  — Kate` and
//   names its frame `<file> `, which no engine's title match finds; cua's caption rule reads each window's own tree
//   (its document's name in the frame's Name, and not the other's).
//
// The person's windows are never touched: every window acted on is one the run opened (scenes.mjs), and the
// activations are the harness's own windows'.

import { xExecFileSync } from './xspawn.mjs';

import { declaredDeviation } from './deviations.mjs';
import { preorder } from './normalize.mjs';
import { activeWindow, configure, xdotool } from './scenes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** cua's answer for a window whose frame cannot be told apart from its duplicates' (identity.rs). */
export const duplicatesSentence = (id) => `Window ${id} matches several accessibility windows; close or retitle the duplicates`;

/** Where the scene's windows go placed apart: each at its own place, the front window's corner (1070, 640) clear. */
export const APART = [
  [0, 0],
  [640, 0],
  [0, 400],
];
/** Where they go stacked: all on one place. */
export const STACKED = [0, 0];

/** The window a sample reads: the scene's windows in turn. */
export const targetOf = (ctx, offset = 0) => ctx.scene.windows[(ctx.i + offset) % ctx.scene.windows.length];

/** How long a scene's arrangement may take to read back through the X server. */
const ARRANGE_MS = 3000;

/** A window's client origin as the X server has it (xwininfo's absolute upper-left corner). */
function origin(id) {
  const info = xExecFileSync('xwininfo', ['-id', String(id)], { encoding: 'utf8' });
  return ['Absolute upper-left X', 'Absolute upper-left Y'].map((k) => Number(info.match(new RegExp(`${k}:\\s+(-?\\d+)`))?.[1]));
}

/**
 * Whether the windows' origins are as an arrangement wants: all equal for `stacked`, all different for `apart`.
 */
export function arranged(origins, how) {
  const keys = new Set(origins.map((o) => o.join(',')));
  return how === 'stacked' ? keys.size === 1 : keys.size === origins.length;
}

/**
 * The scene's windows arranged (`apart` or `stacked`) and then `active` activated: `front` (the harness's front window)
 * or the index of one of the scene's windows. Waits until the origins read back as arranged and, on a toolkit that
 * marks its active frame, until exactly one of the scene's frames says `active` (`ctx.scene.marksActive`), each
 * bounded. Records what it waited for on `ctx.arranged`.
 */
export async function arrange(ctx, how, active = 'front') {
  const { scene, desktop } = ctx;
  const [w, h] = scene.size;
  scene.windows.forEach((win, n) => {
    const [x, y] = how === 'apart' ? APART[n] : STACKED;
    configure(win.id, x, y, w, h);
  });
  const deadline = Date.now() + ARRANGE_MS;
  let origins = scene.windows.map((win) => origin(win.id));
  while (!arranged(origins, how) && Date.now() < deadline) {
    await sleep(50);
    origins = scene.windows.map((win) => origin(win.id));
  }
  if (active === 'front') desktop.focusFront();
  else xdotool('windowactivate', '--sync', scene.windows[active].id);
  const marked = scene.marksActive ? await activeMarked(ctx) : null;
  ctx.arranged = { how, active: active === 'front' ? 'front' : scene.windows[active].id, origins_ok: arranged(origins, how), active_window: activeWindow(), ...(marked === null ? {} : { active_marked: marked }) };
}

/** AT-SPI's ACTIVE, bit 1 of GetState's first word. */
const ACTIVE_BIT = 1;

/** Waits, at most 1.5 s, until exactly one of the scene process's frames of the scene's title says `active`. */
async function activeMarked(ctx) {
  const { scene, desktop } = ctx;
  const oracle = desktop.oracle;
  const deadline = Date.now() + 1500;
  for (;;) {
    let n = 0;
    try {
      const frames = oracle.appsOf(scene.pid).flatMap((app) => oracle.children(app));
      for (const f of frames) {
        if (oracle.name(f) !== scene.title) continue;
        const [[low]] = oracle.on(f, 'org.a11y.atspi.Accessible', 'GetState');
        if ((low >>> ACTIVE_BIT) & 1) n += 1;
      }
    } catch {
      // read again
    }
    if (n === 1) return true;
    if (Date.now() > deadline) return false;
    await sleep(50);
  }
}

/**
 * Whether a state read answered for `win`: its own window id, read through the accessibility bus, more than one node,
 * the window's own marker shown and no other window's of the scene (`others`).
 */
export function ownState(state, win, others) {
  if (state?.window?.id !== win.id || state.ax_tree_source !== 'at_spi') return false;
  const names = preorder(state.ax_tree).map((n) => n.name).filter((n) => typeof n === 'string');
  const shows = (marker) => names.some((n) => n.includes(marker));
  return names.length > 1 && shows(win.marker) && others.every((o) => !shows(o.marker));
}

/** The expectation of a read on a scene's toolkit, per arrangement (module header). */
export function expectedRead(toolkit, arrangement) {
  if (toolkit === 'gtk4') return 'sentence';
  if (arrangement === 'apart') return 'own';
  if (arrangement === 'stacked-self' && toolkit === 'gtk3') return 'own';
  return 'sentence';
}

/** The base every case shares: cua alone, one sample per window a block. */
function base(expect) {
  return { kind: 'input', device: expect, cuaOnly: true, warmSamples: 3, route: () => null, restore: (ctx) => ctx.desktop.focusFront() };
}

/**
 * What a sample's answer was bound to and expected to be; for a state read, whether the answer is one deviations.mjs
 * declares against the vendor's for the scene (`declared`).
 */
function bound(ctx, response, expected, win, command) {
  const others = ctx.scene.windows.filter((o) => o !== win);
  return {
    target: win.id,
    expected,
    expected_error: expected === 'sentence' ? duplicatesSentence(win.id) : null,
    answer_ok: expected === 'own' ? response.ok === true && ownState(response.output, win, others) : !response.ok && response.error === duplicatesSentence(win.id),
    ...(command === 'get_window_state' ? { declared: declaredDeviation({ op: command, scene: ctx.sceneName, field: 'identity', candidate: response }) !== null } : {}),
    arranged: ctx.arranged,
  };
}

/**
 * A read of one of the scene's windows in an arrangement: `apart`, `stacked` (the front window active), `stacked-self`
 * (the read window active) or `stacked-other` (another of the scene's windows active).
 */
function read(arrangement, { screenshot = false } = {}) {
  return {
    ...base('identity-read'),
    arrangement,
    arranges: true,
    prepare: async (ctx) => {
      const n = ctx.scene.windows.indexOf(targetOf(ctx));
      const active = arrangement === 'stacked-self' ? n : arrangement === 'stacked-other' ? (n + 1) % ctx.scene.windows.length : 'front';
      await arrange(ctx, arrangement === 'apart' ? 'apart' : 'stacked', active);
    },
    request: (ctx) => ['get_window_state', { window: { id: targetOf(ctx).id }, include_screenshot: screenshot }],
    check: (ctx, response) => bound(ctx, response, expectedRead(ctx.scene.toolkit, arrangement), targetOf(ctx), 'get_window_state'),
  };
}

/** A window's `_NET_WM_PID`. */
function pidOf(id) {
  return Number(xExecFileSync('xprop', ['-id', String(id), '_NET_WM_PID'], { encoding: 'utf8' }).match(/(\d+)\s*$/)?.[1]);
}

/**
 * A scene window's frame, through the harness's own reader of the bus (oracle.mjs), independent of the engine under
 * test: the one frame of the scene's title whose extents are at the window's origin, the windows apart. Found once.
 */
async function frameOf(ctx, win) {
  if (win.frame) return win.frame;
  const oracle = await ctx.desktop.ensureOracle();
  ctx.scene.pid ??= pidOf(win.id);
  const [x, y] = origin(win.id);
  const frames = oracle.appsOf(ctx.scene.pid).flatMap((app) => oracle.children(app)).filter((f) => oracle.name(f) === ctx.scene.title);
  const here = frames.filter((f) => {
    const e = oracle.extents(f);
    return e.x === x && e.y === y;
  });
  if (here.length !== 1) throw new Error(`${win.marker}: ${here.length} frames at its place, of ${frames.length} of its title`);
  win.frame = here[0];
  return win.frame;
}

/**
 * The first node under `root` of one of `roles` whose Name passes `test` (and the node itself `also`), walked with the
 * harness's reader.
 */
function findNode(oracle, root, roles, test, also = () => true) {
  const stack = [root];
  let visited = 0;
  while (stack.length && visited++ < 2000) {
    const node = stack.pop();
    try {
      if (roles.includes(oracle.role(node)) && test(String(oracle.name(node))) && also(node)) return node;
      stack.push(...oracle.children(node).reverse());
    } catch {
      // gone meanwhile, or no children
    }
  }
  return null;
}

/**
 * The page's button (pages/identity.html), its native id read with the harness's own reader while the windows are
 * apart, so an engine that does not tell the windows apart still gets a real element to refuse; found once a window.
 */
async function actionElement(ctx, win) {
  if (!win.button) {
    const oracle = await ctx.desktop.ensureOracle();
    const node = findNode(oracle, await frameOf(ctx, win), ['push button'], (name) => name === 'noop');
    if (!node) throw new Error(`${win.marker} shows no noop button`);
    win.button = node;
  }
  return { id: win.button, action: 'click' };
}

/** A request that associates before it acts, on a stacked duplicate, the front window active: refused, nothing sent. */
function refused(request, { element = false } = {}) {
  return {
    ...base('identity-refused'),
    arranges: true,
    prepare: async (ctx) => {
      if (element) {
        await arrange(ctx, 'apart');
        ctx.element = await actionElement(ctx, targetOf(ctx));
      }
      await arrange(ctx, 'stacked');
    },
    request: (ctx) => request(ctx, { id: targetOf(ctx).id }),
    check: (ctx, response) => bound(ctx, response, 'sentence', targetOf(ctx)),
  };
}

/** The identity page's key line (pages/identity.html): the keys held now and how many times Shift went up. */
const KEY_LINE = /^held .* ups \d+$/;

/** A key line parsed: `{held, ups}`, or null for a line that is not one. */
export function parseKeys(line) {
  const match = KEY_LINE.test(line) && line.match(/^held (.*) ups (\d+)$/);
  if (!match) return null;
  return { held: match[1] === 'none' ? [] : match[1].split(','), ups: Number(match[2]) };
}

/** The key line of a state's tree, parsed (`parseKeys`), or null. */
export function keyRecord(state) {
  const names = preorder(state.ax_tree).map((n) => n.name).filter((n) => typeof n === 'string');
  const line = names.find((n) => KEY_LINE.test(n));
  return line ? parseKeys(line) : null;
}

/**
 * The key record of a window (`keyRecord`'s line), read with the harness's own reader, the windows apart; the line's
 * node found once a window.
 */
async function keysOf(ctx, win) {
  await arrange(ctx, 'apart');
  return keysNow(ctx, win);
}

/**
 * The key record as the page shows it now (no arrangement): the paragraph that holds the key line, found once a
 * window, and the line read from its children each time, since Chrome replaces the text node when the line changes.
 */
async function keysNow(ctx, win) {
  const oracle = await ctx.desktop.ensureOracle();
  win.keyParagraph ??= findNode(oracle, await frameOf(ctx, win), ['paragraph'], () => true, (p) => oracle.children(p).some((c) => KEY_LINE.test(String(oracle.name(c)))));
  if (!win.keyParagraph) return null;
  const line = oracle.children(win.keyParagraph).map((c) => String(oracle.name(c))).find((name) => KEY_LINE.test(name));
  return line ? parseKeys(line) : null;
}

/**
 * The release: Shift held on a window while the windows are apart (a witnessed companion), the windows then stacked,
 * so the window becomes a duplicate, and the timed `key_up`; then, apart again, the page shows Shift up once more and
 * no key held. The key's hold is proven first: the page shows it held before the windows are stacked.
 */
const release = {
  ...base('identity-release'),
  prepare: async (ctx) => {
    const win = targetOf(ctx);
    ctx.keysBefore = await keysOf(ctx, win);
    const down = await ctx.witnessed(() => ctx.engine.request('key_down', { window: { id: win.id }, key: 'shift' }));
    if (!down.response.ok) throw new Error(`the hold before the stack failed: ${down.response.error}`);
    // Chrome takes the synthetic key a moment after the request answers
    const deadline = Date.now() + 2000;
    do {
      ctx.keysHeld = await keysNow(ctx, win);
      if (ctx.keysHeld?.held.includes('Shift')) break;
      await sleep(100);
    } while (Date.now() < deadline);
    await arrange(ctx, 'stacked');
    ctx.stackedForRelease = ctx.arranged;
  },
  request: (ctx) => ['key_up', { window: { id: targetOf(ctx).id }, key: 'shift' }],
  check: async (ctx, response) => {
    const win = targetOf(ctx);
    const deadline = Date.now() + 2000;
    let after;
    do {
      after = await keysOf(ctx, win);
      if (after && after.held.length === 0) break;
      await sleep(100);
    } while (Date.now() < deadline);
    return { target: win.id, expected: 'release', answer_ok: response.ok === true, keys_before: ctx.keysBefore, keys_held: ctx.keysHeld, keys_after: after, arranged: ctx.stackedForRelease };
  },
};

/** kate's windows: each read returns its own document (its name in the tree), told by the caption rule. */
const kateRead = {
  ...base('identity-read'),
  warmSamples: 2,
  prepare: (ctx) => ctx.desktop.focusFront(),
  request: (ctx) => ['get_window_state', { window: { id: targetOf(ctx).id }, include_screenshot: false }],
  check: (ctx, response) => bound(ctx, response, 'own', targetOf(ctx), 'get_window_state'),
};

export const IDENTITY_OPS = {
  identity_apart: read('apart'),
  identity_apart_shot: read('apart', { screenshot: true }),
  identity_stacked: read('stacked'),
  identity_stacked_self_active: read('stacked-self'),
  identity_stacked_other_active: read('stacked-other'),
  identity_click_element: refused((ctx, window) => ['click', { window, element_id: ctx.element.id }], { element: true }),
  identity_secondary_action: refused((ctx, window) => ['perform_secondary_action', { window, element_id: ctx.element.id, action: ctx.element.action }], { element: true }),
  identity_type_text: refused((ctx, window) => ['type_text', { window, text: 'cua171 refused' }]),
  identity_clipboard_read: refused((ctx, window) => ['clipboard_read', { window }]),
  identity_key_up: release,
  identity_kate: kateRead,
};

const READS = ['identity_apart', 'identity_stacked', 'identity_stacked_self_active', 'identity_stacked_other_active'];

export const IDENTITY_SCENE_OPS = {
  identity: [...READS, 'identity_apart_shot', 'identity_click_element', 'identity_secondary_action', 'identity_type_text', 'identity_clipboard_read', 'identity_key_up'],
  'identity-gtk3': READS,
  'identity-gtk4': READS,
  'identity-kate': ['identity_kate'],
};

/**
 * An identity case's verdict from its samples and its audit (`{clean, kind, answered}`), as judgeDevice's are: every
 * sample as its expectation says (module header) with the witness unchanged, and the audit clean over at least one
 * audited request that answered as the case expects. Returns `{pass, reasons}`.
 */
export function judgeIdentity(op, rows, audit) {
  const expect = IDENTITY_OPS[op].device;
  const reasons = [];
  if (!rows.length) return { pass: false, reasons: ['no samples'] };
  const bad = (what, pred) => {
    const failed = rows.filter((r) => !pred(r));
    if (failed.length) reasons.push(`${what} on ${failed.length} of ${rows.length} samples (${failed.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
  };
  if (expect === 'identity-read' || expect === 'identity-refused') {
    bad('not answered as expected (its own tree, or the duplicates sentence)', (r) => r.answer_ok === true);
    if (IDENTITY_OPS[op].arranges) bad('the arrangement did not read back', (r) => r.arranged?.origins_ok === true);
  }
  if (expect === 'identity-refused') bad('not refused with the duplicates sentence', (r) => !r.ok && r.error === r.expected_error);
  if (expect === 'identity-read') {
    bad('not an answer deviations.mjs declares against the vendor', (r) => r.declared === true);
    const windows = new Set(rows.map((r) => r.target));
    if (windows.size < 2) reasons.push(`the samples read ${windows.size} window; every window of the scene is read`);
  }
  if (expect === 'identity-release') {
    bad('the release did not run', (r) => r.ok && r.answer_ok === true);
    bad('the hold was not proven (the page did not show Shift held)', (r) => r.keys_held?.held?.includes('Shift') === true);
    bad('Shift was not released (the page shows a key held, or no new key up)', (r) => r.keys_after?.held?.length === 0 && r.keys_after.ups > (r.keys_held?.ups ?? Infinity));
    bad('the windows were not stacked for the release', (r) => r.arranged?.how === 'stacked' && r.arranged.origins_ok === true);
  }
  bad('the witness changed', (r) => r.witness === true);
  if (!audit) reasons.push('the audit did not run');
  else if (audit.kind !== 'skipped') {
    if (!audit.clean) reasons.push(`the ${audit.kind} audit found ${audit.forbidden?.join(', ') || 'no traced requests'}`);
    const answered = audit.answered ?? [];
    const expected = (a) => (expect === 'identity-refused' ? !a.ok && a.error === a.expected_error : expect === 'identity-release' ? a.ok : a.expected_error ? !a.ok && a.error === a.expected_error : a.ok);
    if (!answered.length) reasons.push(`the ${audit.kind} audit audited no request`);
    else if (!answered.every(expected)) reasons.push(`the ${audit.kind} audit's requests did not answer as the case expects (${answered.map((a) => (a.ok ? 'success' : a.error)).join('; ').slice(0, 200)})`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** The audit kind an identity case is audited with: nothing sent for a refusal, else the background route's. */
export function identityAuditKind(op) {
  return IDENTITY_OPS[op].device === 'identity-refused' ? 'nothing-sent' : 'background';
}
