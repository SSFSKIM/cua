// The non-interference oracle (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 5,
// "Not interfering"): what the harness reads on the device, independently of either engine, before and after every
// action of a matrix row, and how a row is judged on it. Pure: the readings come from ./matrix-device.mjs `read` (the
// frontmost application by lsappinfo and the topmost on-screen window's owner pid and bounds by
// scripts/accept/front-window.swift), the activations from the approved bundle's resident `--probe watch-activations`
// (./live-device.mjs `watch start|stop`), and the route from the act's `cua/inputRoute`.
//
// A row passes the oracle when, after its action, the frontmost application and the top window (owner pid, number and
// bounds) are the ones read before it; no application activated between the action's start and its end plus
// ACTIVATION_MARGIN_MS (an activation handed back inside an action is still one); and its route is not 4, unless the
// scene's family is one whose route 4 the owner accepted (OWNER_ACCEPTED). An activation of the driven app at its
// launch (a launch-path row) is recorded with a declared cause for the owner's acceptance, as the spec rules for a
// family that activates itself at launch, rather than as a pass.
import {SCENES} from '../repl-parity/scenes-mac.mjs';

// How long after an action's end an activation is still charged to it: the watcher's notification arrives
// asynchronously, and an activation the action caused may be delivered after the call returned.
export const ACTIVATION_MARGIN_MS = 1_000;
// The families whose route 4, and the apps whose activation at their own launch, the owner accepted (the spec's Decision
// Log names each; none so far). Families as scripts/repl-parity/scenes-mac.mjs SCENES[*].family names them.
export const OWNER_ACCEPTED = Object.freeze({route4: Object.freeze([]), selfActivating: Object.freeze([])});

const FRAME = ['x', 'y', 'width', 'height'];
const sameBounds = (a, b) => (a == null || b == null ? a == null && b == null : FRAME.every(k => a[k] === b[k]));

// A FrontWindowProbe reading as it may leave the device: the run's own processes by pid, any other application by its
// bundle id alone (never its pid, its window's number or bounds). `owned`: the pids of the run's scene processes.
// -> {at, frontmost: {pid, bundleId, owned} | null, topWindow: {ownerPid, number, bounds, owned} | null}.
export function ownedReading(reading, owned) {
  const pids = new Set(owned);
  const front = reading?.frontmost ?? null, top = reading?.topWindow ?? null;
  return {
    at: reading?.at ?? null,
    frontmost: front ? (pids.has(front.pid) ? {pid: front.pid, bundleId: front.bundleId ?? null, owned: true} : {pid: null, bundleId: front.bundleId ?? null, owned: false}) : null,
    topWindow: top ? (pids.has(top.ownerPid) ? {ownerPid: top.ownerPid, number: top.number ?? null, bounds: top.bounds ?? null, owned: true}
      : {ownerPid: null, number: null, bounds: null, owned: false}) : null,
  };
}

// The run's user window in a reading: the user scene's process frontmost and owning the top window. -> {pid, bounds} for
// the key guard (scripts/accept/key-guard.mjs userWindow), or null.
export function userWindowOf(reading, userPid) {
  const front = reading?.frontmost, top = reading?.topWindow;
  if (!front?.owned || front.pid !== userPid || !top?.owned || top.ownerPid !== userPid || !top.bounds) return null;
  return {pid: userPid, bounds: top.bounds};
}

// Whether two readings show the same frontmost application and the same top window. A reading of an application the
// run does not own compares by bundle id only, so a change between two such readings is not seen here (the watcher sees
// it): the oracle's baseline is always one of the run's own windows.
export function sameFront(before, after) {
  const a = before?.frontmost, b = after?.frontmost;
  const frontmost = Boolean(a && b) && a.owned === b.owned && a.pid === b.pid && a.bundleId === b.bundleId;
  const x = before?.topWindow, y = after?.topWindow;
  const topWindow = Boolean(x && y) && x.owned === y.owned && x.ownerPid === y.ownerPid && x.number === y.number && sameBounds(x.bounds, y.bounds);
  return {frontmost, topWindow};
}

// Every activation the watcher saw, accounted for (part 5: "recorded no activation of any app" during each judged cell,
// and nothing the run cannot explain). `windows`: every step of the judged phase on the device clock, [{key, kind, at:
// [from, to], apps?}], kind 'harness' (the harness's own steps: activating a scene, opening the Open panel; `apps` the
// bundle ids the step intends to activate, none for a step that intends none), 'row' (a matrix row, from its first
// cell's start to its check's end), 'measure' (speed and finding cells) or 'setup' (binds). An `activated` event of an
// app a harness step intended, inside that step's window (to its end plus `marginMs`, the notification's delivery), is
// the harness's; any other app's activation is never excused by a harness step: inside a row's window it is that row's; else inside a measure or setup window, that step's; before the first
// window or after the last, the phase around the judged one's; anything else is unaccounted, which leaves the run
// incomplete. Events of `probePids` (when the event carries a pid) are the harness's probes.
// -> {byRow: {key: [event]}, accounted: [{kind, key, bundleId, at}], unaccounted: [event]}.
export function accountActivations(activations, windows, {marginMs = ACTIVATION_MARGIN_MS, probePids = []} = {}) {
  const excluded = new Set(probePids);
  const inside = (w, at) => at >= w.at[0] && at <= w.at[1] + marginMs;
  const byRow = Object.fromEntries(windows.filter(w => w.kind === 'row').map(w => [w.key, []]));
  const accounted = [], unaccounted = [];
  const first = Math.min(...windows.map(w => w.at[0])), last = Math.max(...windows.map(w => w.at[1])) + marginMs;
  for (const event of activations ?? []) {
    if (event?.kind !== 'activated' || (event.pid !== undefined && excluded.has(event.pid))) continue;
    const at = event.at;
    const keep = (kind, key = null) => accounted.push({kind, key, bundleId: event.bundleId ?? null, at});
    if (!Number.isFinite(at)) { unaccounted.push(event); continue; }
    const harness = windows.find(w => w.kind === 'harness' && (w.apps ?? []).includes(event.bundleId) && inside(w, at));
    if (harness) { keep('harness', harness.key); continue; }
    const row = windows.find(w => w.kind === 'row' && inside(w, at));
    if (row) { byRow[row.key].push(event); continue; }
    const step = windows.find(w => (w.kind === 'measure' || w.kind === 'setup') && inside(w, at));
    if (step) { keep(step.kind, step.key); continue; }
    if (!windows.length || at < first || at > last) { keep('outside'); continue; }
    unaccounted.push(event);
  }
  return {byRow, accounted, unaccounted};
}

// Whether a window of the target (an entry of `order`, ./matrix-device.mjs windowOrderOf, whose bundle id is one of
// `targets`) lies above the person's window (`userWindow` {pid, number}, the run's user window) in the window order,
// front to back, at any layer. Only an order that holds the person's window, known by its number, proves a target stayed
// below it. A known window gone from the order has any target window above it; with none, or with the person's window
// not known (its number unread), the order proves nothing. -> true, false, or null when the order was not read or
// proves nothing.
export function targetAbove(order, targets, userWindow) {
  if (!Array.isArray(order) || !Number.isInteger(userWindow?.pid) || !Number.isInteger(userWindow?.number)) return null;
  const at = order.findIndex(w => w?.owned === true && w.pid === userWindow.pid && w.number === userWindow.number);
  const above = order.slice(0, at < 0 ? order.length : at).some(w => targets.includes(w?.bundleId));
  return at < 0 && !above ? null : above;
}

// Ruling 1223 (R3): the top window changed to another window of the user app's own process (C-6: a 52x22 window of
// the user TextEdit's pid over Finder's and Chrome's concurrent@textedit rows). It is no interference only when all hold:
// the user window still in the order by its number and still the focused window at its bounds (the focus probe names
// a window by its pid and bounds, within a point), the user's input landed, and the witness tap (`posts`, ruling 1225,
// ./witness.mjs rowPosts) shows the engine posted nothing to the user app's pid in the cell. A failed condition fails
// it whatever the witness; otherwise no witness, or one with a gap (`gaps`: coverage, its positive control, the
// person's posts not told from the engine's), is NO VERDICT, what is missing named, and a post by anyone but the
// simulated person (`others`) fails it. -> null when the top window is not such a window, else {pass, failed, noVerdict?}.
function userAppWindow({same, after, userPid, userWindow, order, focusKept, userLanded, posts}) {
  const top = after?.topWindow;
  if (same.topWindow || top?.owned !== true || userPid === null || top.ownerPid !== userPid || !Number.isInteger(userWindow?.number) || top.number === userWindow.number) return null;
  const failed = [];
  if (!(Array.isArray(order?.after) && order.after.some(w => w?.owned === true && w.pid === userPid && w.number === userWindow.number))) failed.push('the user window\'s number is not in the order after the act');
  if (focusKept !== true) failed.push('the user window is not the focused window at its bounds');
  if (userLanded !== true) failed.push('the user\'s input did not land');
  if (failed.length) return {pass: false, failed};
  const noVerdict = !posts ? 'no witness tap covered the cell: where the engine posted is unrecorded' : posts.gaps.length ? posts.gaps.join('; ') : null;
  if (noVerdict) return {pass: false, failed, noVerdict};
  const n = posts.others.length;
  if (n) failed.push(`the engine posted to the user app's pid in the cell (${posts.source}: ${n} event${n === 1 ? '' : 's'})`);
  return {pass: failed.length === 0, failed};
}

// One row's oracle. `scene`: the driven scene (its family decides route 4's acceptance); `launched`: the bundle id a
// launch-path row brought up, whose own activation is declared for the owner rather than counted as a pass; `focus`:
// the `--probe focus` reading after the action, naming the user window (./matrix-device.mjs ownedFocus), which must
// still be the focused application's focused window (the keyboard focus kept, Acceptance 3); null when not read.
// `order` {before, after}: the window order read around the action (#485, ruling 1069), with `targets` the target's
// bundle ids (the driven scene's, the Open panel's service, a launched app's) and `userWindow` {pid, number} the
// person's window: a target window above the person's after the action fails the row, whatever the front and the top
// window read (an alert's window above both, say), and so does an order unread after it or one that does not hold the
// person's window (targetAbove null); `before` is recorded beside it.
// -> {ok, frontmost, topWindow, focus, activations, route4, windowOrder?: {before, after}, declared?}.
// `named`: the front-window probe's own naming of each reading's top window (./matrix-device.mjs frontWindow.top), for
// `topChange` (ruling 1219, h5): when the top window changed, what it was before and after (the run's own by pid, number
// and bounds; another app's by its bundle) and whether the user's own window moved (the same process on top, another
// window or other bounds), so a judge tells the person's window moving from another window over it. Never judged here.
// `userLanded`: whether the user's own input landed (a concurrent row's); `posts` {source, gaps, others, probe}: the
// witness tap's record of the cell (./witness.mjs rowPosts), null when none covered it (userAppWindow). `noVerdict`:
// the witness's gap, set only when the row would pass but for it, so the run records the row NO VERDICT.
// -> {..., noVerdict?}.
export function judgeInterference({before, after, activations = [], inputRoute = null, scene, launched = null, focus = null, userPid = null, accepted = OWNER_ACCEPTED,
  order = null, targets = [], userWindow = null, named = null, userLanded = null, posts = null}) {
  const same = sameFront(before, after);
  const focusKept = focus === null ? null : focus.appOwned === true && focus.appPid === userPid && focus.named === true;
  const windowOrder = order === null ? null : {before: targetAbove(order.before, targets, userWindow), after: targetAbove(order.after, targets, userWindow)};
  const ownApp = userAppWindow({same, after, userPid, userWindow, order, focusKept, userLanded, posts});
  const topWindowWith = ownPass => (same.topWindow || ownPass) && focusKept !== false && (windowOrder === null || windowOrder.after === false);
  const frontmost = same.frontmost, topWindow = topWindowWith(ownApp?.pass === true);
  const family = SCENES[scene]?.family ?? null;
  // One action's route, or every route of a row made of several actions (the sheet variant's).
  const route4 = (Array.isArray(inputRoute) ? inputRoute : [inputRoute]).includes(4);
  const route4Accepted = route4 && accepted.route4.includes(family);
  const own = launched ? activations.filter(e => e.bundleId === launched) : [];
  const others = activations.filter(e => !own.includes(e));
  const selfAccepted = own.length > 0 && accepted.selfActivating.includes(family);
  const okWith = top => frontmost && top && others.length === 0 && (own.length === 0 || selfAccepted) && (!route4 || route4Accepted);
  const ok = okWith(topWindow);
  const noVerdict = ownApp?.noVerdict && okWith(topWindowWith(true)) ? ownApp.noVerdict : null;
  // Why the focus probe did not name the user window (./matrix-device.mjs ownedFocus), recorded and never judged.
  const describe = (w, n) => (!w ? null : w.owned ? {owned: true, pid: w.ownerPid, number: w.number ?? null, bounds: w.bounds ?? null} : {owned: false, bundleId: n?.bundleId ?? null});
  const userTop = w => w?.owned === true && userPid !== null && w.ownerPid === userPid;
  const topChange = same.topWindow ? null : {before: describe(before?.topWindow, named?.before), after: describe(after?.topWindow, named?.after),
    userWindowMoved: userTop(before?.topWindow) && userTop(after?.topWindow)};
  const out = {ok, frontmost, topWindow: same.topWindow, focus: focusKept, ...(focus?.unnamed ? {focusUnnamed: focus.unnamed} : {}), activations: activations.length, route4,
    ...(windowOrder ? {windowOrder} : {}), ...(topChange ? {topChange} : {}), ...(ownApp ? {userAppWindow: ownApp} : {}),
    ...(ok && ownApp?.pass ? {topWindowBy: 'user app\'s own window'} : {}), ...(noVerdict ? {noVerdict} : {})};
  if (own.length && !selfAccepted && frontmost && topWindow && others.length === 0)
    return {...out, declared: {kind: 'self-activating', cause: `${launched} activated at its launch: the family's own activation, recorded for the owner's acceptance`}};
  if (route4Accepted) return {...out, declared: {kind: 'route4-accepted', cause: `route 4 on ${family}, a family the owner accepted`}};
  return out;
}
