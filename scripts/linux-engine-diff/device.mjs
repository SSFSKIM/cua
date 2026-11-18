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
//   (the cancel's Escape is a synthetic key event, never XTEST); a drag Chrome took nothing for by its release, and
//   took after it, is judged by the late-take rules instead (ruling 756): the plain drag's ok, the after-release
//   watch's Escape, nothing dropped, and the next sample refused with the late notice, not run;
// - `late` (the same, the cancel forced after the release, `--dnd-cancel-after-release`, along a path that holds the
//   button until Chrome has taken): every answer is honest (that the drop may have happened, or that nothing was dropped
//   only where nothing dropped and the witness is unchanged), at least one answer says the drop may have happened, the
//   background audit is clean, and every sample is on the branch: a drag Chrome took nothing for by its release is
//   unexercised, a failure of the case, whatever it answered; every sample's notice is read with the next acting
//   request's answer and held to T14's contract;
// - in the cancel, late and late-take cases, a plain-drag ok for a drag Chrome never started a drag session for at all
//   is no sample of the case (ruling 823, premise.mjs): excluded and counted within its run, its cell left short of its
//   plan reading incomplete, and saying so when that is all it fails for (route D, ruling 841);
// - `late-take` (the take left unseen until after the release, `--dnd-defer-take`): the drag answers as a plain drag at
//   its release, a read on the same engine runs, the first acting request answers the late drag-and-drop notice (not
//   run), and wherever the drop landed the witness shows the change the notice reports;
// - `stray` (shared mode, a Chromium drag whose press a pointer event that is not the drag's may have reset, task 20):
//   the request answers that the drag may not have started, exactly, with nothing dropped, the witness unchanged (the
//   case's own nudges of the real pointer aside) and the background audit clean: the real pointer parked outside Chrome
//   (Chrome's capture grab crosses in from it), or nudged a pixel and back all through a text selection (a drag that
//   never takes a drag and drop is in its press window until its release); and in dedicated mode the pointer parked
//   outside takes the foreground route, where the drop lands (the design session's rulings, 2026-11-01);
// - the cancel and the late case again with the drop's signature already held when the drag begins (Chrome active,
//   focused and on top, a corner covered by an override-redirect window so the drag is watched): the engine records the
//   bits held, and the answers follow the order of the take and the release, not the signature;
// - `answer`: `capabilities`, its answer checked.
//
// Scenes: `device-gtk4` (the harness's GTK 4 scene, pages/gtk4-input.py: GTK 4 ignores synthetic input always),
// `device-firefox` (Firefox on pages/input.html: Gecko takes synthetic pointer input only while the real pointer is in
// its window, T19; the cases park the pointer in the window's visible part, under a window over its bottom half, or
// outside it),
// `device-xterm` (xterm running the recorder: it ignores synthetic keys and takes clicks), `device-qt` (kate on a long
// document: Qt ignores synthetic wheel events), `device-chrome` (Chrome on pages/input.html: Chromium takes a drag only
// along a visible path), `device-chrome-dnd` (Chrome on pages/drag.html: its HTML5 drag and drop, cancelled in shared
// mode unless Chrome is already in front) and gnome-text-editor's text refusal on the `gnome-text-editor` scene.
// M3.1's listings beyond M0's (scroll and move for GTK 4 and Gecko, scroll for Qt) join the cases as M0's did.

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pendingOf } from './drop-signals-judge.mjs';
import { AUDIT_PLAN, FOLLOW_UP_FIELDS, TIMED_QUOTAS, bindAudit, bindTimed, evidenceLabel, isShortage, judgePremise, repeatedSlots, slotProblems } from './premise.mjs';
import { preorder } from './normalize.mjs';
import { readGtk4Status } from './families.mjs';
import { IDENTITY_OPS, IDENTITY_SCENE_OPS, judgeIdentity } from './identity.mjs';
import { MINIMIZED_OPS, MINIMIZED_SCENE_OPS, judgeMinimized } from './minimized.mjs';
import { stacking, startOverlay } from './clip.mjs';
import { parkAt, restorePointer } from './park.mjs';
import { activeWindow, configure, xdotool } from './scenes.mjs';
import { spawnXdotool } from './xtools.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Device mode sentence (Design, Device mode), for the application `list_windows` names. */
export const deviceSentence = (app) => `${app} does not accept background input; use a dedicated desktop or activate the window first`;

/** The answers to a drag Chrome turned into a drag and drop, in shared mode (dnd.rs). */
export const dndCancelledSentence = (app) =>
  `${app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped. Use a dedicated desktop, or activate the window first`;
/**
 * What a drag's after-release watch leaves pending (dnd.rs `pending_notice` and `pending_refusal`, M4's T14): the
 * notice every reply carries, and the refusal of the first acting request (`command`, its wire name), not run.
 */
const lateCause = (app) =>
  `Pending from your last drag, a late drag and drop: ${app} started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop`;
const unconfirmedCause = (app) =>
  `Pending from your last drag, an unconfirmed drop: your drag into ${app} began a drag and drop, and ${app} did not confirm a drop after the release, so the drop may not have landed as the drag answered`;
/** The same kind for an Electron drop whose application did not answer the engine's syncs in time (M5's ruling 827). */
const unansweredCause = (app) =>
  `Pending from your last drag, an unconfirmed drop: your drag into ${app} began a drag and drop, and ${app} did not answer in time for its drop to be confirmed, so the drop may not have landed as the drag answered`;
const pendingNotice = (cause) => `${cause}. Read the window before sending input again: your next input request will not be run`;
const pendingRefusal = (cause, command) => `${cause}; this ${command} request was not run, so read the window before sending it again`;
export const dndLateNotice = (app) => pendingNotice(lateCause(app));
export const dndLateRefusal = (app, command) => pendingRefusal(lateCause(app), command);
export const dndUnconfirmedNotice = (app) => pendingNotice(unconfirmedCause(app));
export const dndUnconfirmedRefusal = (app, command) => pendingRefusal(unconfirmedCause(app), command);
export const dndUnansweredNotice = (app) => pendingNotice(unansweredCause(app));
export const dndUnansweredRefusal = (app, command) => pendingRefusal(unansweredCause(app), command);
export const dndMayHaveDroppedSentence = (app) =>
  `${app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop may have happened and the desktop changed. Use a dedicated desktop, or activate the window first`;

/** The answer to a Chromium drag whose press a pointer event that is not the drag's may have reset (stray.rs). */
export const strayNotice = (app) =>
  `${app} may not have started the drag, and the page may have taken the press as a click: the desktop pointer was outside the window, or entered or moved in it during the press. Read the window to see what happened before dragging again`;

/** The desktop state a drop could change: the active window, the X input focus, the stacking order. */
export function desktopState() {
  const focus = xdotool('getwindowfocus');
  return { active: activeWindow(), focus: Number(focus), stacking: stacking() };
}

const DEDICATED = ['--desktop', 'dedicated'];
/**
 * The expectations whose cells measure what cua does once Chrome turns the drag into a drag and drop, so a drag Chrome
 * never took leaves their premise unmet (ruling 823, premise.mjs): the cancel, the late cancel and the late take. A drop
 * case's plain ok with no drop is ruling 650's false ok instead, and a stray case expects no drag and drop at all.
 */
const PREMISE_KINDS = ['cancel', 'late', 'late-take'];
const LATE = ['--dnd-cancel-after-release'];
/** The measurement option that leaves a take during the drag unseen until after the release (dnd.rs `LateWatch`). */
const DEFER = ['--dnd-defer-take'];
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
/**
 * The drag page's drag-and-drop status (pages/drag.html): `{drops, ...}`, as drag.mjs `readEffect` reads a page's, with
 * the page's own status lines kept as written beside it (`raw`: each distinct `dnd` and `moves` line the tree carried,
 * and whether it carried the scene's page title), the evidence ruling 823's unmet premise is shown by (premise.mjs).
 * The read's time goes on the sample (`premiseReadAt`), never into the read, which `settledRead` compares.
 */
const dropStatus = async (ctx) => {
  try {
    // drag.mjs imports run.mjs, which imports this module
    const { parseDragStatus } = await import('./drag.mjs');
    const nodes = preorder((await ctx.desktop.state(ctx.scene)).ax_tree);
    const texts = nodes.flatMap((n) => [n.name, n.value, n.text].filter((t) => typeof t === 'string'));
    const status = parseDragStatus(texts);
    const lines = (prefix) => [...new Set(texts.filter((t) => t.startsWith(prefix)))];
    ctx.premiseReadAt = Date.now();
    return { ...status.dnd, log: status.moves, received: status.received, raw: { dnd: lines('dnd '), moves: lines('moves '), titled: typeof ctx.scene.label === 'string' && texts.some((t) => t.includes(ctx.scene.label)) } };
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

/**
 * GTK 4's scale dragged from a quarter to three quarters along, or back when it already stands past half (its value
 * read before the request, 0 to 100): every drag moves it, whichever sample of whichever block it is.
 */
export function scalePath(ctx) {
  const { x0, x1, y } = GTK4.scale;
  const along = (f) => Math.round(x0 + 12 + (x1 - x0 - 24) * f);
  return (ctx.before?.scale ?? 0) < 50 ? [{ x: along(0.25), y }, { x: along(0.75), y }] : [{ x: along(0.75), y }, { x: along(0.25), y }];
}

const grew = (key) => (before, after) => typeof before?.[key] === 'number' && typeof after?.[key] === 'number' && after[key] > before[key];
const higher = (before, after) => typeof before === 'number' && typeof after === 'number' && after > before;
/** A drag across the input page's pad (pages/input.html counts it), in the top half of the window. */
const padDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: [{ x: 200, y: 150 }, { x: 380, y: 180 }, { x: 600, y: 240 }] }];
const moveTo = (ctx, a, b) => ['move', { window: { id: ctx.scene.id }, ...(ctx.i % 2 === 0 ? a : b) }];
/**
 * How long a drag-and-drop case's window settles before each drag, as the dnd experiment's drags are spaced (over a
 * second apart, 10/10 drops): with 300 ms, 3 of 18 Chrome drops did not land in the first m31-verdict run, the cause
 * not established.
 */
const DND_SETTLE_MS = 1200;
/** The drag page's drag-and-drop path (`scene.dndPath`, drag.mjs's): the source dragged to the drop zone. */
const dndDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndPath }];
/**
 * The late cases' drag and drop (`scene.dndLingerPath`): the same into the zone, then back and forth across it, so the
 * button is held long enough for Chrome's take to come before the release at the gate's load, which is the cases'
 * branch: a cancel after the release (V5's line 266 released before Chrome began the drag).
 */
const dndLingerDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndLingerPath }];
/** The short drag and drop (`scene.dndShortPath`): the page's near source to just inside the drop zone, 40 px. */
const dndShortDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndShortPath }];
/** The press-inside control (M4's T14): the in-zone source pressed inside the target and dragged out of it. */
const dndInzoneDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndInzonePath }];
/** The long-path control (M4's T14): the source across the zone and out of it, longer than the floor. */
const dndLongLeftDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.dndLongLeftPath }];

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
  xdotool('windowactivate', '--sync', ctx.scene.id);
}

/**
 * The scene window in front (`alreadyInFront`: the active window, focused, on top of the managed windows) with an
 * override-redirect window of the harness's own over its bottom-right corner, away from the drag's path, so it is not
 * fully unobscured: the drop's signature already holds when the drag begins, and the engine watches the drag (the design
 * session's arrangement, 2026-10-31). The overlay lasts until the sample's `restore`.
 */
async function obscuredInFront(ctx) {
  alreadyInFront(ctx);
  const g = Object.fromEntries(
    xdotool('getwindowgeometry', '--shell', ctx.scene.id)
      .split('\n')
      .map((line) => line.split('='))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [k, Number(v)]),
  );
  await cornerOverlay(ctx, g);
}

/**
 * The override-redirect overlay over the bottom-right corner of a window of geometry `g` (`X`, `Y`, `WIDTH`, `HEIGHT`),
 * away from the scene's drag path, registered with the sample's unconditional cleanup (`ctx.dispose`, run.mjs
 * `withSampleCleanup`) as soon as it exists, so a sample that fails anywhere after it, a request timeout included, still
 * takes it away.
 */
export async function cornerOverlay(ctx, g, start = startOverlay) {
  const corner = { x: g.WIDTH - CORNER - 8, y: g.HEIGHT - CORNER - 8 };
  const paths = [...(ctx.scene.dndPath ?? []), ...(ctx.scene.dndLingerPath ?? [])];
  if (paths.some((point) => point.x >= corner.x - 20 && point.y >= corner.y - 20)) throw new Error('the drag path runs under the corner overlay');
  const overlay = await start([g.X + corner.x, g.Y + corner.y, CORNER, CORNER].map(String));
  ctx.dispose(() => overlay.stop());
  return overlay;
}
/** The corner overlay's side, px. */
const CORNER = 40;

/** The real pointer's place on the screen, and the window under it (`xdotool getmouselocation`: the client window). */
function pointerAt(tool = xdotool) {
  const out = tool('getmouselocation', '--shell');
  const get = (k) => Number(out.match(new RegExp(`^${k}=(-?\\d+)`, 'm'))?.[1]);
  return { x: get('X'), y: get('Y'), window: get('WINDOW') };
}

/** The front window's middle, in its corner in the visible arrangement (scenes.mjs `arrangeFront`): outside Chrome. */
const OUTSIDE = { x: 1170, y: 715 };

/**
 * The real pointer parked at a screen point for the sample, and put back by the sample's cleanup (outside every span)
 * where the case found it, so the cases after it find it where they did before. Every move goes only onto the root or
 * a live window of the run's, read at its point just before the move (scenes.mjs `pointerSafeAt`): a motion into
 * another's window, a popup of the person's Chrome over the scene included, is a change of it (T4b's audit round). A
 * park point under another's window fails the case unmoved; a place to go back to under another's falls back to the
 * front window's middle, and with that under another's too, the pointer stays and the skip is recorded. The park is
 * verified where it landed (park.mjs `parkAt`): over the run's window on top at the point (the scene, the cover over
 * it, the front window), or the bare root where none is; a park that did not land there throws `ParkRefused`, and the
 * case is not run. Returns the park's reading. `read` (the pointer's reading) is given only by the tests.
 */
export function parkPointer(ctx, point, { tool = xdotool, read } = {}) {
  const found = pointerAt(tool);
  if (!ctx.desktop.pointerSafeAt(point)) throw new Error(`the pointer's park point (${point.x}, ${point.y}) is over a window the run did not open: the case is not run`);
  ctx.dispose(() => {
    const back = [found, OUTSIDE].find((p) => ctx.desktop.pointerSafeAt(p));
    // verified where it landed, a restore refused recorded as a skip (park.mjs `restorePointer`)
    if (back) restorePointer(ctx.desktop, back, { move: (p) => tool('mousemove', p.x, p.y), ...(read ? { read } : {}) });
    else ctx.desktop.skip('pointer restore', `(${found.x}, ${found.y})`, 'that place and the front window\'s middle are under a window the run did not open');
  });
  return parkAt(ctx.desktop, point, { move: (p) => tool('mousemove', p.x, p.y), ...(read ? { read } : {}) });
}
/**
 * Where a Chromium case that takes the background route parks the real pointer, window-relative, away from every path
 * and every cover: a Chromium drag needs the pointer in its window (task 20: Chrome's capture grab crosses in from a
 * pointer outside, and the engine answers that the drag may not have started), and a case that inherited the pointer
 * from the case before it would depend on the order of the cases. The drag page's empty lower right; the input page's
 * top right, above the cover over the bottom half.
 */
const INSIDE = { x: 600, y: 600 };
const INSIDE_TOP = { x: 950, y: 150 };
/** Under the window over the scene's bottom half (`overlapped`), inside the scene's geometry: window-relative. */
const UNDER = { x: 700, y: 650 };
/** Outside every scene window, on the front window in its corner: a screen point (`OUTSIDE`). */
const OUT = () => OUTSIDE;

/** Chrome in front (`alreadyInFront`) with the real pointer parked outside its window, on the front window. */
function pointerOutside(ctx) {
  alreadyInFront(ctx);
  parkPointer(ctx, OUTSIDE);
}

/**
 * The real pointer nudged a pixel and back every 2 ms for about 600 ms, from just before the request is sent (XTEST,
 * xdotool's own chain, which ends where it began): whenever the press comes, a nudge follows it before the release.
 * Resolves when the chain has ended.
 */
function nudges() {
  const chain = Array.from({ length: 150 }, () => ['mousemove_relative', '--', '1', '0', 'sleep', '0.002', 'mousemove_relative', '--', '-1', '0', 'sleep', '0.002']).flat();
  const child = spawnXdotool(chain, { stdio: 'ignore' });
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
}

/**
 * A text selection across the drag page's words (`scene.selectPaths`, drag.mjs's even and odd runs): a drag that takes
 * no drag and drop. The runs take turns over the whole process, across blocks, so no press lands inside the last
 * selection, which would drag the text instead.
 */
let selections = 0;
const selectDrag = (ctx) => ['drag', { window: { id: ctx.scene.id }, path: ctx.scene.selectPaths[selections++ % 2] }];

// ---------------------------------------------------------------------------------------------------------------
// the cases

/**
 * A case: `device` its expectation, `scene` where it runs, `condition` the arrangement before each sample, `read` what
 * the window counts, `request`, and `effect` (from the counts before and after) for the cases that must take effect.
 */
function device({ device: expect, condition = covered, park, read, request, effect, route, args, inFront = false, heldAtStart = false, settleMs = 300, alongside, pointerMoves = false, confirm = false }) {
  const dedicated = expect === 'foreground';
  return {
    // a drop the engine confirms or reports: its notice read on the same engine after the drop's window (`confirm`)
    confirm,
    // the witness's in-front allowance (witness.mjs), for the request the engine records as made to a window in front
    inFront,
    // the drop's signature already held when the watched drag began (`obscuredInFront`), as the engine records it
    heldAtStart,
    // the harness's own input beside the request (`nudges`), from just before it is sent until it ends, and the
    // witness's allowance for the real pointer it moves (that field alone)
    alongside,
    pointerMoves,
    kind: 'input',
    device: expect,
    cuaOnly: true,
    // a handful a block: these cases prove behaviour, not speed (cua alone has no bar)
    warmSamples: 2,
    cuaArgs: () => args ?? (dedicated ? DEDICATED : []),
    // the witness: the foreground allowance only where the foreground route is expected and reported (run.mjs)
    route: () => route ?? (dedicated ? 'foreground' : null),
    // the real pointer parked after the condition: window-relative (`INSIDE`), or a screen point a function gives
    // (`OUT`)
    park,
    prepare: async (ctx) => {
      await condition(ctx);
      if (park) parkPointer(ctx, typeof park === 'function' ? park(ctx) : { x: ctx.scene.window.x + park.x, y: ctx.scene.window.y + park.y });
      await sleep(settleMs);
      if (inFront) ctx.desktopBefore = desktopState();
    },
    read,
    request,
    effect: ['refusal', 'cancel', 'late', 'late-take', 'stray'].includes(expect) ? undefined : effect,
    check: async (ctx, response) => {
      const out = {};
      // the sample's attempt, for ruling 823's evidence: from the page's last read before the request
      const attemptFrom = ctx.premiseReadAt;
      // the reply's own notice, for ruling 823's plain-drag ok (premise.mjs): one that claims or implies a drop is never
      // an unmet premise
      if (PREMISE_KINDS.includes(expect)) out.reply_notice = response.notice ?? null;
      // past the drop's window: a confirmed drop leaves nothing pending, an unconfirmed one its notice; a late case's
      // drag, whatever it answered, may leave the after-release watch's report of a late take
      if ((confirm && response.ok) || expect === 'late') Object.assign(out, await readPending(ctx));
      if (expect === 'leaves') {
        // whether a drag that leaves the zone started its drag and drop, and whether anything dropped on the zone
        const after = await read(ctx);
        out.started = typeof ctx.before?.starts === 'number' && typeof after?.starts === 'number' && after.starts > ctx.before.starts;
        out.dropped = !(typeof ctx.before?.drops === 'number' && after?.drops === ctx.before.drops);
      }
      if (expect === 'refusal') {
        out.expected_error = deviceSentence(ctx.scene.app);
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.unchanged = ctx.before !== null && after !== null && JSON.stringify(after) === JSON.stringify(ctx.before);
      }
      if (expect === 'late-take') {
        // the drag answered as a plain drag; on the same engine a read runs, carrying the notice, and the first acting
        // request (a pointer move into the window, harmless had it run) is refused with it
        out.expected_notice = dndLateRefusal(ctx.scene.app, 'move');
        const listed = await ctx.engine.request('list_windows', {});
        out.read_ok = listed.response.ok === true;
        if (!out.read_ok) out.read_error = String(listed.response.error);
        out.read_notice = listed.response.notice === dndLateNotice(ctx.scene.app);
        // whatever notice the read carried, the late one or another (ruling 823: a notice implies a drop)
        out.read_notice_text = listed.response.notice ?? null;
        const next = await ctx.engine.request('move', { window: { id: ctx.scene.id }, x: 10, y: 10 });
        out.next_ok = next.response.ok === true;
        out.next_error = next.response.ok ? null : String(next.response.error);
        out.late_dnd = next.stats?.late_dnd ?? null;
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.dropped = !(typeof ctx.before?.drops === 'number' && after?.drops === ctx.before.drops);
      }
      if (expect === 'stray') {
        out.expected_error = strayNotice(ctx.scene.app);
        await sleep(QUIET_MS);
        const after = await read(ctx);
        out.dropped = !(typeof ctx.before?.drops === 'number' && after?.drops === ctx.before.drops);
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
      // a drag-and-drop case's page counts, before and after, for the record
      if (read === dropStatus) out.drop_status = { before: ctx.before, after: await read(ctx) };
      // ruling 823's evidence of the sample, on its row and in the run's own record of it (premise.mjs)
      if (PREMISE_KINDS.includes(expect)) out.premise_evidence = recordPremise(ctx, response, out, { from: attemptFrom, to: Date.now() });
      return out;
    },
    // the foreground route leaves its window active: the front window takes the focus back, outside every span (a
    // corner overlay goes with the sample's cleanup, however the sample ends)
    restore: (ctx) => ctx.desktop.focusFront(),
  };
}

/**
 * What the drag left pending, read through the engine once its after-release watch has run out (T14's contract): the
 * read's notice, and the answer of the next acting request, `preflight`, which sends nothing, so it clears what was
 * pending and the next sample's drag is not the one refused. Kept with each request's id and the engine's raw record of
 * the watch: `--stats` `notice` on the read, and `late_dnd` (what the watch saw: the take's time after the release, the
 * Escape's, or unconfirmed, or failed) on the refused request; both null where nothing was pending.
 */
async function readPending(ctx) {
  await sleep(QUIET_MS);
  const state = await ctx.engine.request('get_window_state', { window: { id: ctx.scene.id }, include_screenshot: false });
  const next = await ctx.engine.request('preflight', {});
  return {
    state_ok: state.response.ok === true,
    state_notice: state.response.notice ?? null,
    next_ok: next.response.ok === true,
    next_error: next.response.ok ? null : String(next.response.error),
    late_watch: { read: { id: state.id, notice: state.stats?.notice ?? null }, next: { id: next.id, late_dnd: next.stats?.late_dnd ?? null } },
  };
}

/** Whether a pending read holds T14's contract: the read's notice and the next acting request's refusal agree. */
const pendingKept = (r) => pendingOf({ notice: r.state_notice, next: { ok: r.next_ok, error: r.next_error } }).kept;

/**
 * Whether a drag-and-drop sample's pointer log is its own press's (pages/drag.html: a source's press counts in `downs`
 * and opens the log numbered with it): where the press reached a source, the log read after must carry that number. A
 * press on no source (a text selection) leaves both as they were. A stale or unread log leaves the sample's motion
 * unaccounted for, which is how V5's in-zone false success could not be told apart.
 */
function ownPointerLog(r) {
  const { before, after } = r.drop_status ?? {};
  if (typeof before?.downs !== 'number' || typeof after?.downs !== 'number' || after.downs === before.downs) return true;
  return after.log?.seq === after.downs;
}

/** Whether a late case's drag reached its branch: a take before the release, so the engine decided an order (dnd.rs `Outcome`). */
const lateBranch = (r) => typeof r.dnd?.outcome === 'string' && r.dnd.outcome !== 'no_start';

/** The page's counts a drag would move (pages/drag.html): its press on a source, its drag start, its drop, its end. */
const PAGE_COUNTS = ['downs', 'starts', 'drops', 'ends', 'ups'];

/**
 * Whether a sample shows no drag of its own: no route, drag or press record (the row's or the engine's), the page read
 * before and after with every count it keeps unmoved, and the witness unchanged. A refused request's text alone does not
 * show it was not run (the task review's probe: a drag that ran, with a refusal's text, passed).
 */
function notRun(r) {
  const es = r.engine_stats ?? {};
  const { before, after } = r.drop_status ?? {};
  const pageStill = before != null && after != null && PAGE_COUNTS.every((k) => typeof before[k] === 'number' && after[k] === before[k]);
  return r.route == null && r.dnd == null && r.press == null && es.dnd == null && es.press == null && es.wall == null && pageStill && r.witness === true;
}

/**
 * A cancel case's late takes (the design session's ruling 756, from V5's rerun at H): a drag Chrome took nothing for by
 * its release (the engine's record, `dnd.outcome` `no_start`) answers at the release as a plain drag, and a take after
 * the release is T14's after-release watch's, as the late-take case's (`--dnd-defer-take`) is: its Escape sent and
 * recorded with the take's time after the release (`late_dnd`) on the next request on the same engine, the block's next
 * sample, which is refused with the late notice and shows no drag of its own (`notRun`). Returns each such drag and its
 * refused request: they answer without the cancel's sentence, and the case's other rules (nothing dropped, the witness
 * unchanged) still judge both. A drag Chrome took before its release is a drag and drop under way, so it still needs
 * the sentence.
 */
function lateTakes(rows) {
  const pairs = new Set();
  for (const drag of rows) {
    const next = rows.find((r) => r.block === drag.block && r.i === drag.i + 1);
    if (!next) continue;
    const late = next.engine_stats?.late_dnd;
    const app = late?.app;
    const takenAfterRelease = drag.ok === true && drag.dnd?.outcome === 'no_start' && typeof late?.after_release_ms === 'number' && late.after_release_ms > 0 && late.escaped === true;
    // the next request answered the notice as T14's contract says, for this case's app: the drag it was, not run
    const answeredNotice = next.ok === false && next.expected_error === dndCancelledSentence(app) && next.error === dndLateRefusal(app, 'drag');
    if (takenAfterRelease && answeredNotice && notRun(next)) {
      pairs.add(drag);
      pairs.add(next);
    }
  }
  return pairs;
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
  gtk4_drag_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => ['drag', { window: { id: ctx.scene.id }, path: scalePath(ctx) }] }),
  gtk4_drag_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => ['drag', { window: { id: ctx.scene.id }, path: scalePath(ctx) }], effect: (before, after) => typeof before?.scale === 'number' && typeof after?.scale === 'number' && after.scale !== before.scale }),
  gtk4_move_shared: device({ device: 'refusal', read: gtk4, request: (ctx) => moveTo(ctx, { x: 200, y: 300 }, { x: 400, y: 300 }) }),
  gtk4_move_dedicated: device({ device: 'foreground', read: gtk4, request: (ctx) => moveTo(ctx, { x: 200, y: 300 }, { x: 400, y: 300 }), effect: grew('moves') }),
  // gnome-text-editor (GTK 4): typeText in shared mode
  gte_type_text_shared: device({ device: 'refusal', read: fieldText, request: (ctx) => ['type_text', { window: { id: ctx.scene.id }, text: 'cua171 refused' }] }),
  // Firefox (`device-firefox`), by the real pointer (T19): with it in the window's visible part, coordinate clicks,
  // scrolls, moves and drags take the background route, half covered or not; with it under the cover or outside, they
  // are refused in shared mode and take the foreground route in dedicated mode; the element click on a covered window,
  // background
  firefox_click_pointer_out_shared: device({ device: 'refusal', condition: visible, park: OUT, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }] }),
  firefox_click_pointer_under_shared: device({ device: 'refusal', condition: overlapped, park: UNDER, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }] }),
  firefox_right_click_pointer_out_shared: device({ device: 'refusal', condition: overlapped, park: OUT, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.elements.menu, mouse_button: 'right' }] }),
  firefox_click_pointer_out_dedicated: device({ device: 'foreground', condition: overlapped, park: OUT, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }], effect: rose('downs') }),
  firefox_click_visible_shared: device({ device: 'background', route: 'background', condition: visible, park: INSIDE_TOP, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }], effect: rose('downs') }),
  firefox_click_overlap_pointer_in_shared: device({ device: 'background', route: 'background', condition: overlapped, park: INSIDE_TOP, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, ...PAD }], effect: rose('downs') }),
  firefox_scroll_pointer_out_shared: device({ device: 'refusal', condition: overlapped, park: OUT, read: page, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...PAD }] }),
  firefox_scroll_overlap_pointer_in_shared: {
    ...device({ device: 'background', route: 'background', condition: overlapped, park: INSIDE_TOP, read: page, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...PAD }], effect: grew('scroll') }),
    reset: pageHome,
  },
  firefox_scroll_covered_dedicated: {
    ...device({ device: 'foreground', condition: covered, park: OUT, read: page, request: (ctx) => ['scroll', { window: { id: ctx.scene.id }, direction: 'down', pixels: 300, ...PAD }], effect: grew('scroll') }),
    reset: pageHome,
  },
  firefox_move_pointer_out_shared: device({ device: 'refusal', condition: overlapped, park: OUT, read: page, request: (ctx) => moveTo(ctx, PAD, PAD2) }),
  firefox_move_overlap_pointer_in_shared: device({ device: 'background', route: 'background', condition: overlapped, park: INSIDE_TOP, read: page, request: (ctx) => moveTo(ctx, PAD, PAD2), effect: grew('moves') }),
  firefox_move_covered_dedicated: device({ device: 'foreground', condition: covered, park: OUT, read: page, request: (ctx) => moveTo(ctx, PAD, PAD2), effect: grew('moves') }),
  firefox_drag_pointer_out_shared: device({ device: 'refusal', condition: overlapped, park: OUT, read: page, request: padDrag }),
  firefox_drag_overlap_pointer_in_shared: device({ device: 'background', route: 'background', condition: overlapped, park: INSIDE_TOP, read: page, request: padDrag, effect: rose('drags') }),
  firefox_drag_covered_dedicated: device({ device: 'foreground', condition: covered, park: OUT, read: page, request: padDrag, effect: rose('drags') }),
  firefox_element_click_covered: device({ device: 'background', condition: covered, park: OUT, read: page, request: (ctx) => ['click', { window: { id: ctx.scene.id }, element_id: ctx.scene.elements.press }], effect: rose('clicks') }),
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
  chrome_drag_visible_path_shared: device({ device: 'background', route: 'background', condition: overlapped, park: INSIDE_TOP, read: page, request: padDrag, effect: rose('drags') }),
  chrome_drag_covered_path_shared: device({ device: 'refusal', condition: topCovered, read: page, request: padDrag }),
  chrome_drag_covered_dedicated: device({ device: 'foreground', condition: covered, read: page, request: padDrag, effect: rose('drags') }),
  // Chrome's HTML5 drag and drop (`device-chrome-dnd`): cancelled before the drop in shared mode; let through when Chrome
  // is already in front, the desktop unchanged; an honest answer when the cancel comes too late; the drop through the
  // foreground route in dedicated mode, Chrome's own drag windows coming and going beside its frame's raise
  chrome_dnd_shared: device({ device: 'cancel', condition: visible, park: INSIDE, read: dropStatus, request: dndDrag, settleMs: DND_SETTLE_MS }),
  // the drops that land carry nothing pending: Chrome's activation request confirmed each (`confirm`, M4's T14), the
  // control of the after-release watch's reports
  chrome_dnd_in_front_shared: device({ device: 'background', route: 'background', condition: alreadyInFront, park: INSIDE, read: dropStatus, request: dndDrag, effect: rose('drops'), inFront: true, settleMs: DND_SETTLE_MS, confirm: true }),
  chrome_dnd_late_shared: device({ device: 'late', condition: visible, park: INSIDE, read: dropStatus, request: dndLingerDrag, args: LATE, settleMs: DND_SETTLE_MS }),
  chrome_dnd_covered_dedicated: device({ device: 'foreground', condition: covered, read: dropStatus, request: dndDrag, effect: rose('drops'), settleMs: DND_SETTLE_MS, confirm: true }),
  // a short drag and drop (40 px) where the drop goes ahead, in front and dedicated: released at Chrome's accept cursor,
  // or at the floor after the take (dnd.rs RELEASE_AFTER_TAKE), so it lands
  chrome_dnd_short_in_front_shared: device({ device: 'background', route: 'background', condition: alreadyInFront, park: INSIDE, read: dropStatus, request: dndShortDrag, effect: rose('drops'), inFront: true, settleMs: DND_SETTLE_MS, confirm: true }),
  // the press-inside control at the floor (the design session, 2026-11-10): a press on a source inside the zone, its
  // first status already an accept, and a path out of it. Chrome must not drop on the stale accept; nothing landing,
  // the drag is never answered ok with nothing pending (task 69 saw one released early that Chrome confirmed)
  chrome_dnd_inzone_out_in_front_shared: device({ device: 'leaves', route: 'background', condition: alreadyInFront, park: INSIDE, read: dropStatus, request: dndInzoneDrag, effect: rose('drops'), inFront: true, settleMs: DND_SETTLE_MS, confirm: true }),
  // and the long path that crosses the zone and ends outside it, its steps after the take outlasting the floor, so the
  // release follows its last step (the design session, 2026-11-10: measured clean, the control stays in the gate)
  chrome_dnd_long_left_in_front_shared: device({ device: 'leaves', route: 'background', condition: alreadyInFront, park: INSIDE, read: dropStatus, request: dndLongLeftDrag, effect: rose('drops'), inFront: true, settleMs: DND_SETTLE_MS, confirm: true }),
  chrome_dnd_short_covered_dedicated: device({ device: 'foreground', condition: covered, read: dropStatus, request: dndShortDrag, effect: rose('drops'), settleMs: DND_SETTLE_MS, confirm: true }),
  // the same with the drop's signature already held (Chrome active, focused, on top) and a corner covered, so the drag
  // is watched: cancelled in time and said so; with the cancel forced late, every answer says the drop may have happened
  chrome_dnd_obscured_in_front_shared: device({ device: 'cancel', condition: obscuredInFront, park: INSIDE, read: dropStatus, request: dndDrag, heldAtStart: true, settleMs: DND_SETTLE_MS }),
  // a take left unseen until the release (the forced late take): the drag answers at its release, the next request
  // carries the notice, and the witness shows the change the notice reports
  chrome_dnd_late_take_shared: device({ device: 'late-take', condition: visible, park: INSIDE, read: dropStatus, request: dndDrag, args: DEFER, settleMs: DND_SETTLE_MS }),
  chrome_dnd_obscured_in_front_late_shared: device({ device: 'late', condition: obscuredInFront, park: INSIDE, read: dropStatus, request: dndLingerDrag, args: LATE, heldAtStart: true, settleMs: DND_SETTLE_MS }),
  // the real pointer outside Chrome (task 20): Chrome's capture grab crosses in from it with no button, so the drop
  // cannot start; in shared mode the drag is sent and answers that it may not have started, in dedicated mode it takes
  // the foreground route, which puts the pointer there, and the drop lands. And the real pointer nudged all through a
  // text selection: the press window of a drag that never takes a drag and drop runs to its release
  chrome_dnd_short_pointer_outside_shared: device({ device: 'stray', condition: pointerOutside, read: dropStatus, request: dndShortDrag, inFront: true, settleMs: DND_SETTLE_MS }),
  chrome_dnd_short_pointer_outside_dedicated: device({ device: 'foreground', condition: pointerOutside, read: dropStatus, request: dndShortDrag, effect: rose('drops'), settleMs: DND_SETTLE_MS, confirm: true }),
  chrome_select_nudged_shared: device({ device: 'stray', condition: alreadyInFront, park: INSIDE, read: dropStatus, request: selectDrag, inFront: true, alongside: nudges, pointerMoves: true, settleMs: DND_SETTLE_MS }),
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
  // M4's T4: minimized windows (minimized.mjs), cua's cases on gedit and xterm
  ...MINIMIZED_OPS,
  // M4's T5: identity (identity.mjs), cua's cases on windows of one title and size
  ...IDENTITY_OPS,
};

// the device cases' effect functions take (before, after); run.mjs calls effect(ctx, input, before, after)
for (const op of Object.values(DEVICE_OPS)) {
  if (op.effect) {
    const judge = op.effect;
    op.effect = (ctx, input, before, after) => judge(before, after);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// ruling 823's evidence of each sample (premise.mjs)

const here = dirname(fileURLToPath(import.meta.url));
const once = new Map();
const cached = (key, make) => (once.has(key) ? once.get(key) : once.set(key, make()).get(key));
/** The checkout's head, as run.mjs's meta row records it. */
const head = () =>
  cached('head', () => {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  });
/** The sha256 of the engine binary a sample's engine runs. */
const engineSha = (bin) => (typeof bin === 'string' && existsSync(bin) ? cached(`sha|${bin}`, () => createHash('sha256').update(readFileSync(bin)).digest('hex')) : null);
/** The run's load profile, from its own meta row (run.mjs writes it first): its ballast and occlusion. */
const loadOf = (results) => {
  if (once.has(`load|${results}`)) return once.get(`load|${results}`);
  try {
    const meta = JSON.parse(readFileSync(results, 'utf8').split('\n')[0]);
    if (meta.kind !== 'meta') return null;
    // and the run's recorded plan, its blocks, for the in-run judge (`premiseBinding`)
    if (Number.isInteger(meta.blocks) && typeof meta.run === 'string') PLANS.set(meta.run, meta.blocks);
    return once.set(`load|${results}`, { ballast: meta.ballast ?? null, occlusion: meta.occlusion ?? null }).get(`load|${results}`);
  } catch {
    // not read yet: nothing kept, so the next sample reads it again
    return null;
  }
};

/**
 * Every evidence record this process made, by run (`recordedPremise`): the in-run judge's own, for the audit's samples,
 * whose rows run.mjs does not keep, and the sidecar the judge binds every sample to. A re-judge of stored rows reads the
 * same records from the run's `premise-evidence.jsonl` (rejudge-device.mjs).
 */
const RECORDED = [];
/** Each run's recorded plan (its meta's `blocks`), by run, as this process's recorder read it. */
const PLANS = new Map();

/**
 * A premise case's sample as its evidence (premise.mjs): the sample named (its run, scene, case, block and request
 * number, its engine's lifecycle, the engine's request id, the window and the page's title), the run's head, engine
 * bytes and load, its attempt (from the page's last read before the request to the check's end, epoch ms), cua's
 * reply, the page's status lines before and after as the page wrote them, and the case's own reads. Kept in memory and
 * appended to the run's `premise-evidence.jsonl` beside its results.
 */
function recordPremise(ctx, response, out, attempt) {
  ctx.engine.premiseLifecycle ??= randomUUID();
  const outDir = ctx.desktop.logs ? dirname(ctx.desktop.logs) : null;
  // the case's follow-up reads, by the one allowlist the binding reads them by (premise.mjs `FOLLOW_UPS`)
  const reads = Object.fromEntries(FOLLOW_UP_FIELDS.filter((k) => k in out).map((k) => [k, out[k]]));
  const { op, block, i } = ctx.scene.lastRequest ?? {};
  const record = {
    kind: 'premise-evidence',
    run: ctx.desktop.run ?? null,
    head: head(),
    engine_sha256: engineSha(ctx.engine.bin),
    load: outDir ? loadOf(join(outDir, 'results.jsonl')) : null,
    scene: ctx.sceneName,
    op,
    block,
    i,
    series: i === 0 ? 'cold' : 'warm',
    lifecycle: ctx.engine.premiseLifecycle,
    request: Number.isInteger(response.id) ? response.id : null,
    window: ctx.scene.id,
    fixture: { label: ctx.scene.label ?? null },
    attempt,
    reply: { ok: response.ok === true, error: response.ok ? null : String(response.error).slice(0, 300), notice: response.notice ?? null },
    page: { before: ctx.before?.raw ?? null, after: out.drop_status?.after?.raw ?? null },
    dropped: out.dropped,
    reads,
  };
  RECORDED.push(record);
  if (outDir) appendFileSync(join(outDir, 'premise-evidence.jsonl'), `${JSON.stringify(record)}\n`);
  return record;
}

/**
 * The in-run judge's sidecar: every record this process made for the samples' run (`lines`, null where it made none, as
 * for stored rows), and the window its audit is bound to, the run's timed evidence's. A process records one run, so the
 * run's records are all of them, a foreign fixture's among them a binding error.
 */
function recordedPremise(samples) {
  const run = samples[0]?.run;
  const ofRun = RECORDED.filter((r) => r.run === run);
  return { lines: ofRun.length ? ofRun : null, window: samples.find((r) => r.premise_evidence)?.premise_evidence.window ?? null };
}

/**
 * A premise cell's two passes bound to the run's sidecar and checked against its recorded plan, both before either is
 * classified (review 5, finding 4). `premise`: the re-judge's `{lines, window, plan}`; without it (or without `plan`) the
 * in-run judge's, from this process's records and the run's meta. The plan (`{blocks, audit}`) checks the timed slots
 * and the audit's cardinality whether or not evidence exists; with none recorded, nothing is excluded and the cell is
 * marked `unverified`. A slot recorded twice is a problem with or without a plan (review 6). With any problem in either
 * pass, neither keeps evidence: both are judged from their own rows and answers. Answers `{plan, problems: {slots, plan,
 * timed, audit}, rows, entries, unverified}`, `rows` the samples or their copies, index for index.
 */
export function premiseBinding(op, samples, audit, premise = undefined) {
  const run = samples[0]?.run;
  const source = premise?.lines !== undefined ? premise : recordedPremise(samples);
  const plan = premise && 'plan' in premise ? premise.plan : Number.isInteger(PLANS.get(run)) ? { blocks: PLANS.get(run), audit: audit?.kind !== 'skipped' } : null;
  const answered = audit && audit.kind !== 'skipped' ? audit.answered ?? [] : [];
  const bare = bindAudit({ ...audit, answered }, null, { run }).entries;
  const strip = () => samples.map((r) => (r.premise_evidence == null ? r : (({ premise_evidence, ...rest }) => rest)(r)));
  const problems = { slots: repeatedSlots(samples), plan: [], timed: [], audit: [] };
  const lines = source.lines ?? null;
  const evidenced = samples.some((r) => r.premise_evidence) || (lines ?? []).some((l) => l?.op === op && l?.run === run);
  if (!plan) return { plan, problems, rows: strip(), entries: bare, unverified: evidenced };
  problems.plan.push(...slotProblems(samples, { blocks: plan.blocks, seriesLength: 1 + (DEVICE_OPS[op].warmSamples ?? 0) }));
  if (plan.audit && (!audit || audit.kind === 'skipped')) problems.plan.push('no audit, where its plan has one');
  else if (plan.audit && answered.length !== AUDIT_PLAN) problems.plan.push(`the audit recorded ${answered.length} request${answered.length === 1 ? '' : 's'}, its plan ${AUDIT_PLAN}`);
  else if (!plan.audit && audit && audit.kind !== 'skipped') problems.plan.push('an audit its plan has none for (--no-audit)');
  const timed = bindTimed(samples, { lines });
  problems.timed.push(...timed.problems);
  let entries = bare;
  if (audit?.kind === 'skipped') {
    // the runner's skipped-audit sentinel (`--no-audit`): no audit, so no audit evidence either
    const stray = (lines ?? []).filter((l) => l?.block === 'audit' && l?.op === op && l?.run === run);
    if (stray.length) problems.audit.push(`${stray.length} audit evidence lines for an audit the run skipped`);
  } else if (audit) {
    const bound = bindAudit(audit, lines, { run, scene: samples[0]?.scene, op, expect: DEVICE_OPS[op].device, window: source.window, label: evidenceLabel(samples) });
    problems.audit.push(...bound.problems);
    entries = bound.entries;
  }
  const any = Object.values(problems).some((p) => p.length > 0);
  return { plan, problems, rows: any ? strip() : timed.rows, entries: any ? bare : entries, unverified: false };
}

/** The cells ruling 823's unmet premise can occur in (`PREMISE_KINDS`): V5's cancel, late and late-take cells. */
export const PREMISE_OPS = new Set(Object.keys(DEVICE_OPS).filter((op) => PREMISE_KINDS.includes(DEVICE_OPS[op].device)));

export const DEVICE_SCENE_OPS = {
  'device-gtk4': ['gtk4_click_shared', 'gtk4_click_dedicated', 'gtk4_key_shared', 'gtk4_key_dedicated', 'gtk4_key_down_shared', 'gtk4_right_click_shared', 'gtk4_element_click', 'gtk4_scroll_shared', 'gtk4_scroll_dedicated', 'gtk4_move_shared', 'gtk4_move_dedicated', 'gtk4_drag_shared', 'gtk4_drag_dedicated'],
  // the scroll last: its series ends with the page put back at its top (`reset`)
  'device-firefox': ['firefox_click_pointer_out_shared', 'firefox_click_pointer_under_shared', 'firefox_right_click_pointer_out_shared', 'firefox_click_pointer_out_dedicated', 'firefox_click_visible_shared', 'firefox_click_overlap_pointer_in_shared', 'firefox_element_click_covered', 'firefox_move_pointer_out_shared', 'firefox_move_overlap_pointer_in_shared', 'firefox_move_covered_dedicated', 'firefox_drag_pointer_out_shared', 'firefox_drag_overlap_pointer_in_shared', 'firefox_drag_covered_dedicated', 'firefox_scroll_pointer_out_shared', 'firefox_scroll_overlap_pointer_in_shared', 'firefox_scroll_covered_dedicated'],
  'device-chrome': ['chrome_drag_visible_path_shared', 'chrome_drag_covered_path_shared', 'chrome_drag_covered_dedicated'],
  'device-chrome-dnd': ['chrome_dnd_shared', 'chrome_dnd_in_front_shared', 'chrome_dnd_late_shared', 'chrome_dnd_covered_dedicated', 'chrome_dnd_short_in_front_shared', 'chrome_dnd_short_covered_dedicated', 'chrome_dnd_obscured_in_front_shared', 'chrome_dnd_obscured_in_front_late_shared', 'chrome_dnd_late_take_shared', 'chrome_dnd_short_pointer_outside_shared', 'chrome_dnd_short_pointer_outside_dedicated', 'chrome_select_nudged_shared',
    'chrome_dnd_inzone_out_in_front_shared', 'chrome_dnd_long_left_in_front_shared'],
  'device-qt': ['qt_scroll_shared', 'qt_scroll_dedicated'],
  'device-xterm': ['xterm_key_shared', 'xterm_key_dedicated', 'xterm_click_shared'],
  'gnome-text-editor': ['gte_type_text_shared'],
  desktop: ['capabilities'],
  ...MINIMIZED_SCENE_OPS,
  ...IDENTITY_SCENE_OPS,
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
 * A device case's verdict from its samples and its audit (`{clean, kind, answered}`, the audit kind its expectation
 * needs): every sample as its expectation says (module header), and the audit clean over at least one audited request
 * that answered as the case expects (a refusal or a cancel its sentence, a late case an honest one, the others
 * success), so a trace of requests that never did what the case measures proves nothing. In ruling 823's cells
 * (`PREMISE_OPS`) a sample or audited request whose premise was unmet is excluded first (premise.mjs). Returns `{pass,
 * reasons}`, with `drops` for a drop case and `premise_unmet` (each pass's record) where anything was excluded.
 */
export function judgeDevice(op, samples, audit, premise = undefined) {
  // the minimized cases have expectations of their own (minimized.mjs)
  if (op in MINIMIZED_OPS) return judgeMinimized(op, samples, audit);
  // and so do the identity cases (identity.mjs)
  if (op in IDENTITY_OPS) return judgeIdentity(op, samples, audit);
  const expect = DEVICE_OPS[op].device;
  const reasons = [];
  if (!samples.length) return { pass: false, reasons: ['no samples'] };
  // ruling 823 (premise.mjs): a sample whose premise was unmet is excluded and counted, and every rule below judges the
  // rest; a cell short of its planned cold or warm samples fails as incomplete (route D, ruling 841). Only evidence
  // bound to the run's sidecar (`premise`: `{lines, window}`, the re-judge's; else this process's records) excludes;
  // evidence that does not fit its samples is never excluded on, and fails the cell.
  const unmet = {};
  let rows = samples;
  let excluded = 0;
  let binding = null;
  if (PREMISE_OPS.has(op)) {
    // both passes bound and checked against the plan before either is classified
    binding = premiseBinding(op, samples, audit, premise);
    for (const p of binding.problems.slots) reasons.push(`the run's rows record a slot twice (ruling 823, never excluded on): ${p}`);
    for (const p of binding.problems.plan) reasons.push(`the run's rows do not fit its recorded plan (ruling 823, never excluded on): ${p}`);
    for (const p of binding.problems.timed) reasons.push(`the premise evidence of the timed samples does not fit them (ruling 823, never excluded on): ${p}`);
    for (const p of binding.problems.audit) reasons.push(`the premise evidence of the ${audit?.kind ?? ''} audit does not fit it (ruling 823, never excluded on): ${p}`);
    const judged = judgePremise(binding.rows, { name: (r) => `${r.block}/${r.i}`, quotas: TIMED_QUOTAS });
    reasons.push(...judged.reasons);
    if (judged.record) unmet.timed = judged.record;
    rows = judged.judged;
    excluded += judged.excluded;
  }
  // a condition that some judged sample shows something, where every sample was excluded for its unmet premise: untested,
  // not failed, since the cell is short of its plan already (review 3, finding 2)
  const exists = (what, pred) => {
    if (!rows.length) reasons.push(`untested: every sample was excluded for its unmet premise, so whether ${what} is untested`);
    else if (!rows.some(pred)) return false;
    return true;
  };
  const badOf = (list) => (what, pred) => {
    const failed = list.filter((r) => !pred(r));
    if (failed.length) reasons.push(`${what} on ${failed.length} of ${list.length} samples (${failed.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
  };
  const bad = badOf(rows);
  // a check of the engine's own guard, which holds whether or not Chrome took the drag: over every sample, the excluded
  // ones too, so an exclusion never excuses it (task 100's review 2, finding 5)
  const badAll = badOf(samples);
  if (expect === 'answer') bad('the answer was not the report', (r) => r.ok && r.answer_ok === true);
  if (expect === 'refusal') {
    bad('not refused with the Device mode sentence', (r) => !r.ok && r.error === r.expected_error);
    bad('the window changed', (r) => r.unchanged === true);
  }
  // a take after the release is judged by the late-take rules (ruling 756, `lateTakes`): the very rows it was found on,
  // and their copies the binding judges (their evidence stripped, index for index), never another row of their slot
  // (task 100's review 6)
  const late = new Set(expect === 'cancel' ? lateTakes(samples) : []);
  binding?.rows.forEach((r, k) => late.has(samples[k]) && late.add(r));
  if (expect === 'cancel') {
    bad('not cancelled with the drag-and-drop sentence', (r) => (!r.ok && r.error === r.expected_error) || late.has(r));
    bad('it dropped', (r) => r.dropped === false);
  }
  if (expect === 'stray') {
    bad('not answered that the drag may not have started', (r) => !r.ok && r.error === r.expected_error);
    bad('it dropped', (r) => r.dropped === false);
  }
  if (expect === 'late-take') {
    bad('the drag did not answer as a plain drag', (r) => r.ok);
    bad('the read after the drag did not run', (r) => r.read_ok === true);
    bad('the read did not carry the notice', (r) => r.read_notice === true);
    bad('the next acting request did not carry the late drag and drop', (r) => r.next_ok === false && r.next_error === r.expected_notice);
    // the notice says the desktop may have changed: where the drop landed, the witness must show it
    bad('a drop the witness did not record', (r) => !r.dropped || r.witness === false);
    if (!exists('a drop landed', (r) => r.dropped && r.witness === false)) reasons.push('no drop landed: the case showed no change for the notice to report');
  }
  // the drops the engine confirms or reports, counted (the design session, 2026-11-10): a drop that landed and was
  // reported unconfirmed is honest, counted for the run (stats.mjs `dropCounts`, a finding only over 5% of a load's
  // landed drops); a drag answered ok with no drop and nothing pending is a false ok, the one failure
  let drops = null;
  if (DEVICE_OPS[op].confirm) {
    // a notice holds only when the acting request after it was refused with it (drop-signals-judge.mjs `pendingOf`)
    const held = (r) => pendingOf({ notice: r.state_notice, next: r.state_notice == null ? null : { ok: r.next_ok, error: r.next_error } });
    const pending = (r) => r.state_notice != null && held(r).kept;
    const landed = rows.filter((r) => r.effect === true);
    const falseOk = rows.filter((r) => r.ok && r.effect !== true && !pending(r));
    drops = { samples: rows.length, landed: landed.length, ok: rows.filter((r) => r.ok).length, false_ok: falseOk.length, unconfirmed_landed: landed.filter(pending).length };
    if (falseOk.length) reasons.push(`a drag answered ok with no drop and nothing pending on ${falseOk.length} of ${rows.length} samples (${falseOk.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
    const unrefused = rows.filter((r) => r.state_notice != null && !held(r).kept);
    if (unrefused.length) reasons.push(`a notice the next acting request was not refused with on ${unrefused.length} of ${rows.length} samples (${unrefused.slice(0, 3).map((r) => `${r.block}/${r.i}`).join(', ')})`);
    // and the other way: the next acting request refused for something pending that the read did not announce
    bad('the next acting request was refused for something pending with no notice on the read', (r) => r.state_notice != null || r.next_ok !== false);
  }
  // a drag-and-drop sample's motion is accounted for by its own press's pointer log
  if (DEVICE_OPS[op].read === dropStatus) bad("the page's pointer log was not the sample's own press", ownPointerLog);
  if (expect === 'leaves') {
    // a drag and drop whose path ends outside the zone (the press inside it, or a long path that outlasts the floor):
    // Chrome must not drop on a stale accept, and a drag that started is what the control needs
    if (!rows.some((r) => r.started)) reasons.push('no drag and drop started: the control proved nothing');
  }
  if (expect === 'late') {
    // the case measures a cancel that comes after the release, so only a drag Chrome took by its release is on its
    // branch; one it took nothing for answers as a plain drag and proves nothing, whatever it answered (V5's line 266),
    // and one it never started a drag session for at all was excluded above (ruling 823)
    bad('unexercised: Chrome took no drag and drop by the release, so the late branch was not reached,', lateBranch);
    bad('a request answered success', (r) => !lateBranch(r) || !r.ok);
    // "nothing was dropped" only where nothing dropped and the desktop is as it was; off the branch, a plain drag's ok
    // only where nothing dropped, or what dropped was reported pending (the after-release watch's late take)
    const reported = (r) => r.state_notice != null && pendingKept(r);
    bad('an answer was not honest', (r) =>
      lateBranch(r) ? r.error === r.late_error || (r.error === r.expected_error && r.dropped === false && r.witness === true) : r.ok && (reported(r) || (r.dropped === false && r.witness === true)),
    );
    // every drag's pending read, on the branch or off it, held to T14's contract
    bad("the read's notice and the next acting request's refusal did not agree", (r) => r.state_notice !== undefined && r.next_ok !== undefined && pendingKept(r));
    if (!exists('an answer said the drop may have happened', (r) => r.error === r.late_error)) reasons.push('no answer said the drop may have happened: no cancel came too late');
  }
  if (expect === 'foreground' || expect === 'background') {
    bad('a request failed', (r) => r.ok);
    bad('the effect was not verified', (r) => r.effect === true);
  }
  // a request refused for a late take did not run, so there is no drag of its own to have watched
  const ran = (r) => !(late.has(r) && r.ok === false);
  if (DEVICE_OPS[op].heldAtStart) badAll('the engine did not watch the drag with the signature already held', (r) => !ran(r) || (r.dnd?.in_front === false && r.dnd?.held_at_start === true));
  if (DEVICE_OPS[op].inFront) {
    bad('the engine did not record the window as in front', (r) => r.dnd?.in_front === true);
    bad('the desktop at the end was not as at the start', (r) => r.desktop_same === true);
  }
  if (expect === 'foreground') {
    bad('not the foreground route', (r) => r.route === 'foreground');
    bad('the window was not left active', (r) => r.activated === true);
  }
  // a late cancel's drop changes the desktop: its answer is judged instead
  if (!['answer', 'late', 'late-take'].includes(expect)) bad('the witness changed', (r) => r.witness === true);
  if (expect !== 'answer') {
    if (!audit) reasons.push('the audit did not run');
    else if (!audit.clean) reasons.push(`the ${audit.kind} audit found ${audit.forbidden?.join(', ') || 'no traced requests'}`);
    if (audit && audit.kind !== 'skipped') {
      // the audit counts only where its requests did what the case measures: answered as the case expects
      const audited = audit.answered ?? [];
      let answered = audited;
      // the audit's own requests as the binding left them (`premiseBinding`), those whose premise was unmet excluded
      // (ruling 823); a binding error in either pass binds none, so none is excluded
      if (PREMISE_OPS.has(op)) {
        const judged = judgePremise(binding.entries, { name: (e) => `audit/${e.i}`, what: 'audited requests', prefix: `the ${audit.kind} audit is incomplete` });
        reasons.push(...judged.reasons);
        if (judged.record) unmet.audit = judged.record;
        answered = judged.judged;
        excluded += judged.excluded;
      }
      const expected = (a) => {
        if (expect === 'refusal' || expect === 'cancel' || expect === 'stray') return !a.ok && a.error === a.expected_error;
        if (expect === 'late') return !a.ok && (a.error === a.late_error || a.error === a.expected_error);
        return a.ok;
      };
      if (!audited.length) reasons.push(`the ${audit.kind} audit audited no request`);
      else if (!answered.every(expected)) reasons.push(`the ${audit.kind} audit's requests did not answer as the case expects (${answered.map((a) => (a.ok ? 'success' : a.error)).join('; ').slice(0, 200)})`);
    }
  }
  // a cell that excluded samples says first what it fails for, so the cause reads off the verdict: only the shortage
  // (whether V5 is rerun whole for it is the controller's call under §8.2, route D), or more than that
  if (excluded > 0 && reasons.some(isShortage)) {
    const n = `${excluded} proven premise-unmet sample${excluded === 1 ? '' : 's'}`;
    reasons.unshift(reasons.every(isShortage) ? `incomplete only by ${n} (a whole V5 rerun under §8.2, the controller's call)` : `incomplete by ${n}, and failing for more than that (below)`);
  }
  return { pass: reasons.length === 0, reasons, ...(drops ? { drops } : {}), ...(Object.keys(unmet).length ? { premise_unmet: unmet } : {}), ...(binding?.unverified ? { plan_unverified: true } : {}) };
}
