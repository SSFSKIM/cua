// The witness (Design, Verification system): `xprobe witness` watches the desktop for the whole of an operation —
// root PropertyNotify for _NET_ACTIVE_WINDOW and _NET_CLIENT_LIST_STACKING, and the input focus and the pointer
// sampled every 5 ms — from before the request is sent until after its answer; any change in that span fails the
// operation, whatever the state at its end.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * The judgement of one span report. Conservative: a PropertyNotify for either watched property fails the span even
 * when the value reads back unchanged, since a change followed by a restore leaves the same value behind.
 */
export function judgeSpan(report) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], samples: 0, max_gap_ms: null };
  const notified = Object.entries(report.notifies ?? {}).filter(([, n]) => n > 0).map(([field]) => field);
  const fields = [...new Set([...report.changes.map((c) => c.field), ...notified])];
  return { clean: fields.length === 0, fields, samples: report.samples, max_gap_ms: report.max_gap_ms };
}

/** A running witness; `span(tag, fn)` runs fn inside a watched span and returns `{value, witness}`. */
export async function startWitness(xprobe, { tailMs = 20 } = {}) {
  const child = spawn(xprobe, ['witness'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  const queued = [];
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queued.push(message);
  });
  const next = () => (queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiting.push(resolve)));
  const ready = await next();
  if (!ready.ready) throw new Error(`the witness did not start: ${JSON.stringify(ready)}`);
  let seq = 0;
  return {
    async span(tag, fn) {
      const name = `${tag}#${++seq}`;
      child.stdin.write(`begin ${name}\n`);
      await next();
      let value;
      let error;
      try {
        value = await fn();
      } catch (e) {
        error = e;
      }
      await new Promise((r) => setTimeout(r, tailMs));
      child.stdin.write(`end ${name}\n`);
      const report = await next();
      if (error) throw error;
      return { value, report, witness: judgeSpan(report) };
    },
    async stop() {
      child.stdin.end();
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

/**
 * Whether a stacking order changed only by raising `target` to the top: `after` is `before` with the target moved to
 * the end (the stacking list is bottom first).
 */
export function raisedOnly(before, after, target) {
  if (!before.includes(target)) return false;
  const expected = [...before.filter((w) => w !== target), target];
  return expected.length === after.length && expected.every((w, i) => after[i] === w);
}

/**
 * The restacks of a span, replayed (M2.3 review): `report.tree` is the root's children when the span began, bottom
 * first, each `[id, mapped, override_redirect]`, and `report.restacks` every restack, map, unmap, creation, destruction
 * and reparenting of a root child in the order the server reported them (`xprobe witness`, never coalesced). An event
 * that leaves the order of the mapped children as it was (a geometry change, an unmapped window restacked) is no
 * restack. Any other is allowed only when it is the target's top-level (`frame`, its window manager frame) moving to
 * the top: above every mapped window that is not override-redirect (Openbox keeps one of its own above the frames), or
 * above them all, the rest in their order. Returns `{clean, raised,
 * violations}`; with no record, `clean` is false.
 */
export function judgeRestacks(report, frame, { popup = () => false, opensWindows = false } = {}) {
  if (!Array.isArray(report?.tree) || !Array.isArray(report?.restacks)) return { clean: false, raised: false, violations: ['no restack record'] };
  const { order, at, apply } = stackReplay(report.tree);
  // the target client's own override-redirect windows (`popup`) are left out of the order judged
  const own = (w) => w.or && popup(w.id);
  const visible = () => order.filter((w) => w.mapped && !own(w)).map((w) => w.id);
  const openAtStart = new Set(order.filter((w) => w.mapped && own(w)).map((w) => w.id));
  // the orders a raise of the frame may leave: above every mapped window that is not override-redirect, or above all
  // of them; the others in their order
  const raisedTo = (before) => {
    const rest = before.filter((id) => id !== frame);
    const isOr = (id) => order[at(id)]?.or;
    const last = rest.reduce((k, id, i) => (isOr(id) ? k : i), -1);
    return [
      [...rest.slice(0, last + 1), frame, ...rest.slice(last + 1)],
      [...rest, frame],
    ];
  };
  const violations = [];
  let raised = false;
  for (const e of report.restacks) {
    const before = visible();
    apply(e);
    const after = visible();
    if (sameOrder(before, after)) continue;
    if ((e.kind === 'configure' || e.kind === 'circulate') && frame && e.window === frame && raisedTo(before).some((o) => sameOrder(after, o))) raised = true;
    else violations.push(e);
  }
  // a popup still open at the end: only where the input opens one (a right click's menu); a drag's are gone by then
  if (!opensWindows) for (const w of order.filter((x) => x.mapped && own(x) && !openAtStart.has(x.id))) violations.push({ kind: 'left open', window: w.id });
  return { clean: violations.length === 0, raised, violations };
}

const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The root's children replayed through a span's restack record (`report.tree` the order when the span began, bottom
 * first, each `[id, mapped, override_redirect]`): `apply(e)` moves the order on by one restack, map, unmap, creation,
 * destruction or reparenting.
 */
function stackReplay(tree) {
  const order = tree.map(([id, mapped, or]) => ({ id, mapped: Boolean(mapped), or: Boolean(or) }));
  const at = (id) => order.findIndex((w) => w.id === id);
  const take = (id, or) => {
    const i = at(id);
    return i >= 0 ? order.splice(i, 1)[0] : { id, mapped: false, or: Boolean(or) };
  };
  const apply = (e) => {
    if (e.kind === 'configure') {
      const w = take(e.window, e.or);
      w.or = Boolean(e.or);
      const below = e.above ? at(e.above) : -1;
      if (e.above && below < 0) order.push(w);
      else order.splice(below + 1, 0, w);
    } else if (e.kind === 'circulate') {
      const w = take(e.window);
      if (e.place === 'top') order.push(w);
      else order.unshift(w);
    } else if (e.kind === 'map' || e.kind === 'unmap') {
      if (at(e.window) < 0) order.push({ id: e.window, mapped: false, or: Boolean(e.or) });
      order[at(e.window)].mapped = e.kind === 'map';
    } else if (e.kind === 'create' || (e.kind === 'reparent' && e.to_root)) {
      take(e.window);
      order.push({ id: e.window, mapped: false, or: Boolean(e.or) });
    } else if (e.kind === 'destroy' || e.kind === 'reparent') take(e.window);
  };
  return { order, at, apply };
}

/**
 * The X server's per-client resource-id mask (Xorg's `resource-id-mask`, 0x1fffff): two windows whose ids agree outside
 * it were made by the same client, as the engine attributes a paste's requests and an XDND source (`dnd.rs`).
 */
const CLIENT_MASK = 0x1fffff;
const sameClient = (a, b) => (a & ~CLIENT_MASK) === (b & ~CLIENT_MASK);

/**
 * The witness of a background request the engine recorded as made to a window already in front (`--stats` `dnd`
 * `in_front`: the active window, holding the focus, fully unobscured; Decision Log, M3.1, Chrome drag and drop): Chrome's
 * drop then asks the window manager to activate its own window, already active, and the window manager rewrites
 * `_NET_CLIENT_LIST_STACKING` with the same order. The allowance rests on the ordered event records, never on a value
 * read back, so a change coalesced inside a same-value notify cannot hide (M2.3's rules), and over the whole span:
 * - every `_NET_ACTIVE_WINDOW` request names the target or its frame (that the engine sent none is its X request
 *   audit's to show);
 * - every restack, map, unmap, creation or destruction leaves the order of the mapped managed windows (not
 *   override-redirect) as it was, with the target's frame on top when the span began, and the order of the frame among
 *   every other client's mapped windows, override-redirect ones included, as it was: only the target client's own
 *   windows (its override-redirect drag windows) may move;
 * - every focus event is the target's, its frame's or its client's windows', or the root's under a keyboard grab or its
 *   release (modes Grab and Ungrab, which do not move the focus);
 * - a value read back changed is a violation; a property notify is allowed only beside event records with none.
 * Returns `{clean, fields, allowed, violations}`.
 */
export function judgeInFrontSpan(report, { target, frame, root }) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], allowed: [], violations: ['no record'] };
  const top = root ?? report.root;
  const ours = (w) => w === frame || sameClient(w, target);
  const bad = new Set();
  const violations = [];
  const violate = (field, what) => {
    bad.add(field);
    violations.push(what);
  };
  if (!Array.isArray(report.tree) || !Array.isArray(report.restacks)) violate('stacking', 'no restack record');
  else {
    const { order, apply } = stackReplay(report.tree);
    const managed = () => order.filter((w) => w.mapped && !w.or).map((w) => w.id);
    // the target's frame among every mapped window that is not the target client's own: a foreign window crossing the
    // frame changes this order even where the foreign windows keep theirs
    const relevant = () => order.filter((w) => w.mapped && (w.id === frame || !ours(w.id))).map((w) => w.id);
    if (managed().at(-1) !== frame) violate('stacking', 'the target was not on top when the span began');
    for (const e of report.restacks) {
      const before = [managed(), relevant()];
      apply(e);
      if (!sameOrder(before[0], managed()) || !sameOrder(before[1], relevant())) violate('stacking', e);
    }
  }
  if (!Array.isArray(report.focus)) violate('focus', 'no focus record');
  else {
    for (const e of report.focus) {
      if (e.kind === 'activate') {
        if (e.window !== target && e.window !== frame) violate('active', e);
      } else if (!ours(e.window) && !(e.window === top && (e.mode === 1 || e.mode === 2))) violate('focus', e);
    }
  }
  const notified = new Set();
  for (const c of report.changes ?? []) {
    if (c.notify) notified.add(c.field);
    else violate(c.field, c);
  }
  // a notify is excused only beside event records with no violation
  for (const field of notified) if (bad.size) bad.add(field);
  const allowed = [...notified].filter((f) => !bad.has(f));
  return { clean: bad.size === 0, fields: [...bad], allowed, violations };
}

/** FocusIn's detail `Pointer`: an event about the window under the pointer while the focus is PointerRoot. */
const DETAIL_POINTER = 5;

/**
 * The focus and activation events of a span, judged (M2 whole-branch review): `report.focus` is every `FocusIn` and
 * `FocusOut` of the root and its children and every `_NET_ACTIVE_WINDOW` activation request, in order, never coalesced
 * (`xprobe witness`, `focus.rs`). Only the target may be activated (a request naming its window or its frame) or take
 * the focus (a `FocusIn` of its frame, `frame`). On its way the focus may pass through no window (the root's
 * `FocusIn`, detail `PointerRoot` or `None`, and the `Pointer` details that follow it), so long as it goes into the
 * target's frame afterwards. With no record, the span is not clean. Returns `{clean, violations}`.
 */
export function judgeFocus(report, { target, frame }) {
  if (!Array.isArray(report?.focus)) return { clean: false, violations: ['no focus record'] };
  const events = report.focus;
  // the target's frame, or the target's own window (a client created on the root has the events selected before its
  // window manager frames it)
  const ours = (w) => Boolean(frame) && (w === frame || w === target);
  const intoTarget = (e) => e.kind === 'focus_in' && ours(e.window) && e.detail !== DETAIL_POINTER;
  const violations = [];
  events.forEach((e, i) => {
    if (e.kind === 'activate') {
      if (e.window !== target && !(frame && e.window === frame)) violations.push(e);
    } else if (e.kind === 'focus_in' && !intoTarget(e)) {
      const passing = e.window === report.root || e.detail === DETAIL_POINTER;
      if (!(passing && events.slice(i + 1).some(intoTarget))) violations.push(e);
    }
  });
  return { clean: violations.length === 0, violations };
}

/**
 * The witness of a request that took the foreground route (Decision Log, M2.2: the allowance is keyed to the route the
 * request took, and the route each scene's request must take is known beforehand, run.mjs). On a dedicated desktop the
 * route may activate its target window and move the pointer, and nothing else: every change of the active window goes
 * to the target, every change of the input focus goes into it (`focusWithin`), and the stacking order changes only by
 * the target's raise. The stacking is judged on the restack events (`judgeRestacks`, `frame` the target's top-level):
 * only the target's frame may move, and only to the top. The property `_NET_CLIENT_LIST_STACKING` is a second record:
 * each change read back with its orders must be the target's raise, and a notify that leaves the order as it was (the
 * window manager rewriting it) is allowed only because the restack events show no forbidden restack beside it. No
 * restack record, or no frame, is a violation. The activation and the focus are judged the same way on their events
 * (`judgeFocus`): only the target may be activated or take the focus, and an active-window notify, which carries no
 * value, is allowed only when those events show no forbidden switch; the sampled focus and the active window read back
 * are the second record. On its way the window manager may pass through no active window and no input focus (None or
 * PointerRoot), so long as the last change goes to the target. Anything else, a protocol error included, is a
 * violation. Returns `{clean, fields, allowed}`: `fields` the violations, `allowed` the fields that changed within the
 * allowance.
 */
export function judgeForegroundSpan(report, { target, frame, focusWithin, opensWindows = false }) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], allowed: [] };
  const bad = new Set();
  const allowed = new Set();
  // the target client's own override-redirect windows answering the input (Decision Log, M3.1): with no target,
  // nothing is the target's
  const popup = (w) => typeof target === 'number' && sameClient(w, target);
  const restacks = judgeRestacks(report, frame, { popup, opensWindows });
  if (!restacks.clean || !frame) bad.add('stacking');
  else if (restacks.raised) allowed.add('stacking');
  const focus = judgeFocus(report, { target, frame });
  if (!focus.clean) {
    bad.add('focus');
    // a forbidden switch leaves no active-window notify excusable
    if ((report.changes ?? []).some((c) => c.field === 'active') || focus.violations.some((e) => e.kind === 'activate')) bad.add('active');
  }
  const changes = report.changes ?? [];
  const toTarget = (to) => Array.isArray(to) && to.length === 1 && to[0] === target;
  const noneActive = (to) => Array.isArray(to) && (to.length === 0 || (to.length === 1 && to[0] === 0));
  const last = (field) => changes.filter((c) => c.field === field && !c.notify).at(-1);
  for (const c of changes) {
    if (c.field === 'pointer') allowed.add('pointer');
    else if (c.field === 'active') {
      if (c.notify || toTarget(c.to) || (noneActive(c.to) && toTarget(last('active').to))) allowed.add('active');
      else bad.add('active');
    } else if (c.field === 'focus') {
      if (focusWithin(c.to) || ([0, 1].includes(c.to) && focusWithin(last('focus').to))) allowed.add('focus');
      else bad.add('focus');
    } else if (c.field === 'stacking') {
      if (c.notify || (Array.isArray(c.from) && Array.isArray(c.to) && raisedOnly(c.from, c.to, target))) {
        if (!bad.has('stacking')) allowed.add('stacking');
      } else bad.add('stacking');
    } else bad.add(c.field);
  }
  allowed.forEach((f) => bad.has(f) && allowed.delete(f));
  return { clean: bad.size === 0, fields: [...bad], allowed: [...allowed] };
}

/**
 * The witness of a request whose route is known beforehand (`expected`, text.mjs `expectedRoute`) against the route
 * the engine reports it took (`reported`): the foreground route's allowance (`judgeForegroundSpan`) only where both are
 * the foreground route; anything else is judged strictly (`judgeSpan`), and a reported route other than the expected
 * one, a missing record included, is a violation of its own. With no expected route (a vendor build, an operation that
 * pastes nothing) the span is judged strictly whatever is reported. Returns `{clean, fields, allowed, foreground}`.
 */
export function judgeRouteSpan(report, { expected, reported, target, frame, focusWithin, inFront = false, root, opensWindows = false }) {
  const fields = [];
  if (expected && reported !== expected) fields.push(`route ${reported ?? 'not recorded'}, expected ${expected}`);
  const foreground = expected === 'foreground' && reported === 'foreground';
  // the in-front allowance: only a background request the engine recorded as made to a window already in front
  const front = inFront && expected === 'background' && reported === 'background';
  const judged = foreground
    ? judgeForegroundSpan(report, { target, frame, focusWithin, opensWindows })
    : front
      ? judgeInFrontSpan(report, { target, frame, root })
      : { ...judgeSpan(report), allowed: [] };
  fields.push(...judged.fields);
  return { clean: fields.length === 0, fields, allowed: judged.allowed, foreground };
}
