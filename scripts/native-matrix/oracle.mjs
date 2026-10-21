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

// The watcher's activations charged to each row: an `activated` event whose time falls in a row's action interval
// [from, to + marginMs]; events of `probePids` (the probe instances, when the event carries a pid) are not counted.
// `rows`: [{key, at: [from, to]}] (the act cell's device clock). -> {byRow: {key: [event]}, unattributed: [event]}.
export function attributeActivations(activations, rows, {marginMs = ACTIVATION_MARGIN_MS, probePids = []} = {}) {
  const excluded = new Set(probePids);
  const byRow = Object.fromEntries(rows.map(r => [r.key, []]));
  const unattributed = [];
  for (const event of activations ?? []) {
    if (event?.kind !== 'activated' || (event.pid !== undefined && excluded.has(event.pid))) continue;
    const row = Number.isFinite(event.at) ? rows.find(r => Array.isArray(r.at) && event.at >= r.at[0] && event.at <= r.at[1] + marginMs) : undefined;
    if (row) byRow[row.key].push(event); else unattributed.push(event);
  }
  return {byRow, unattributed};
}

// One row's oracle. `scene`: the driven scene (its family decides route 4's acceptance); `launched`: the bundle id a
// launch-path row brought up, whose own activation is declared for the owner rather than counted as a pass; `focus`:
// the `--probe focus` reading after the action, naming the user window (./matrix-device.mjs ownedFocus), which must
// still be the focused application's focused window (the keyboard focus kept, Acceptance 3); null when not read.
// -> {ok, frontmost, topWindow, focus, activations, route4, declared?}.
export function judgeInterference({before, after, activations = [], inputRoute = null, scene, launched = null, focus = null, userPid = null, accepted = OWNER_ACCEPTED}) {
  const same = sameFront(before, after);
  const focusKept = focus === null ? null : focus.appOwned === true && focus.appPid === userPid && focus.named === true;
  const frontmost = same.frontmost, topWindow = same.topWindow && focusKept !== false;
  const family = SCENES[scene]?.family ?? null;
  const route4 = inputRoute === 4;
  const route4Accepted = route4 && accepted.route4.includes(family);
  const own = launched ? activations.filter(e => e.bundleId === launched) : [];
  const others = activations.filter(e => !own.includes(e));
  const selfAccepted = own.length > 0 && accepted.selfActivating.includes(family);
  const ok = frontmost && topWindow && others.length === 0 && (own.length === 0 || selfAccepted) && (!route4 || route4Accepted);
  const out = {ok, frontmost, topWindow: same.topWindow, focus: focusKept, activations: activations.length, route4};
  if (own.length && !selfAccepted && frontmost && topWindow && others.length === 0)
    return {...out, declared: {kind: 'self-activating', cause: `${launched} activated at its launch: the family's own activation, recorded for the owner's acceptance`}};
  if (route4Accepted) return {...out, declared: {kind: 'route4-accepted', cause: `route 4 on ${family}, a family the owner accepted`}};
  return out;
}
