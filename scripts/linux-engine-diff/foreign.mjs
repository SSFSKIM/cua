// The harness never changes a window it did not open (the design session, 2026-11-02; #171 M4, T4b's audit round).
// One judge reads a stream of X protocol elements in the order the server handled them and fails every request of the
// harness's or an engine's connections that changes a window the harness did not open. Two sources feed it:
// - xtrace's lines (`auditForeign`): the harness's own trace and each engine's route audit, where every connection is
//   ours;
// - the whole run's RECORD (`auditRecord`, `xprobe record-run`): every client's requests as the server saw them,
//   attributed to the harness's and the engines' connections by resource-id base and process.
//
// It catches accidental changes by the harness and its engines on the person's display; it is not a proof against an
// adversarial engine.
//
// What changes a window (`changeOf`): destroying, reparenting, mapping, unmapping, configuring or circulating it; a
// SendEvent to it (a client message names its window too); warping the pointer into it; focusing it; killing its
// client; writing, deleting or rotating its properties (a deleting GetProperty included); changing its attributes other
// than our own event selection; redirecting it through Composite; creating a window inside it; and XTEST input that
// lands in it (a key by the input focus, a button by the window under the pointer, a motion by where it ends). The root
// is the desktop: writes to its properties and our event selections on it stay out, and it is the neutral destination
// of a client message to the window manager; anything else on it is foreign.
//
// Whose a window is, in trace order (`harness`): a window the harness registered (opened, adopted by its run-unique
// title, closed since), for the one life it had when the harness found it; a window our connection created once the server
// accepted the creation, under the root or one of ours; a window another client created inside one of ours; a window
// manager frame while it holds one of ours; an override-redirect window on the root that the client of one of ours
// opened during a harness operation on that window (its drag image during the drag). A window's life ends at its DestroyNotify (or DestroyWindow, or when its
// creating client is gone), so a reused id is foreign again. A window reparented into one of ours keeps the owner it
// had. One exemption: the selection owner's answer (ICCCM), paired with the SelectionRequest our connection received
// and written by that connection: the property the request named, written while the request is served (an INCR
// transfer's announcement and every chunk up to its zero-length end), and the SelectionNotify for the request's
// selection and target that completes it.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const shown = (w) => (typeof w === 'number' ? `0x${w.toString(16).padStart(8, '0')}` : w === undefined || w === null ? 'an unreadable window' : (w.keyword ?? String(w)));

/** One foreign change as a line: what it was and the window it named. */
export const foreignLine = (f) => `${f.what} on ${shown(f.window)}${f.client ? ` (${f.client})` : ''}`;

/** Ops whose window is only written to through its properties: the root's stay out. */
const PROPERTY_OPS = new Set(['ChangeProperty', 'DeleteProperty', 'GetProperty', 'RotateProperties']);
/** Ops that change one window, named by `window`. */
const WINDOW_OPS = new Set(['DestroyWindow', 'DestroySubwindows', 'MapWindow', 'MapSubwindows', 'UnmapWindow', 'UnmapSubwindows', 'ConfigureWindow', 'CirculateWindow', 'RedirectWindow', 'RedirectSubwindows', 'UnredirectWindow', 'UnredirectSubwindows']);

/**
 * How long after the harness found a window its creation may seem to come: births are timed by the server's clock
 * (the record's requests carry it), set against the wall clock once when the record begins, so this covers only the
 * clocks' drift and the reader's own polling, never the record's lag.
 */
const FOUND_SLACK_MS = 1000;
/**
 * How far outside a harness operation's span a popup's creation may seem to come: both are wall-clock times (the
 * record's by the server's clock, set against the wall clock once), so this covers only the clocks' drift.
 */
const SPAN_SLACK_MS = 250;

/**
 * The judge. `elements`: the stream (`xtraceElements`, `recordElements`). `registered`: the harness's windows, a Set,
 * or a Map from id to when it was found (ms since the epoch, or a list of them; the record binds each finding to the
 * one life of the id alive then). `strictBirth`: a registered window is the harness's only in a life the stream saw
 * begin (the record sees every client; xtrace sees only ours, so there a registered window's first life counts).
 * `spans`: the harness's operations on its windows, `{window, start, end}` (ms since the epoch), during which the
 * window's client's popups are the window's (the record times both). Returns `{clean, traced, requests, mutating,
 * foreign, unplaced, unattributed}`.
 */
export function judgeForeign(elements, { registered, root, strictBirth = false, spans = [] }) {
  const found = registered instanceof Map ? registered : new Map([...(registered ?? [])].map((id) => [id, null]));
  const clients = new Map();
  const lives = new Map();
  // each window's children as the stream last showed them: by a creation, a reparent, or (xtrace) a reply
  const children = new Map();
  // the stream's clock: the latest request's time (ms since the epoch, the record's server time on the wall clock)
  let clock = -Infinity;
  // by id, the time its last life ended: no finding until then can be of a later life
  const endedAt = new Map();
  // the ids the stream saw created
  const created = new Set();
  const open = new Map();
  const foreign = [];
  let requests = 0;
  let mutating = 0;
  let unplaced = 0;
  const unattributed = { clients: new Set(), mutating: 0 };
  // a creation the server refused, and every refused request, by the request element itself
  const refused = refusedRequests(elements);

  const lifeOf = (w) => {
    let life = lives.get(w);
    if (!life) {
      life = { n: 0, born: false, alive: true };
      lives.set(w, life);
    }
    return life;
  };
  const setParent = (w, parent) => {
    const life = lifeOf(w);
    if (life.parent !== undefined) children.get(life.parent)?.delete(w);
    life.parent = parent;
    if (!children.has(parent)) children.set(parent, new Set());
    children.get(parent).add(w);
  };
  const born = (el, extra) => {
    const old = lives.get(el.window);
    const life = { n: (old?.n ?? -1) + 1, born: true, bornMs: el.ms ?? null, alive: true, creator: el.c, first: !created.has(el.window), after: endedAt.get(el.window) ?? -Infinity, ...extra };
    created.add(el.window);
    if (old?.parent !== undefined) children.get(old.parent)?.delete(el.window);
    lives.set(el.window, life);
    setParent(el.window, el.parent);
    return life;
  };
  // an override-redirect window on the root that the client of a live harness window opened during a harness
  // operation on that window (its drag image during the drag, its menu during a click): that window's own. Chrome
  // serves the person's windows from the same client, so a popup opened at any other time is foreign.
  const popup = (life) => {
    if (life.or !== true || life.parent !== root || !life.born || typeof life.bornMs !== 'number') return false;
    return spans.some((s) => {
      if (life.bornMs < s.start - SPAN_SLACK_MS || life.bornMs > s.end + SPAN_SLACK_MS || !live(s.window)) return false;
      const owner = lifeOf(s.window);
      return owner.creator === life.creator && isRegistered(s.window, owner);
    });
  };
  // a window's end ends its subtree too
  const end = (w, depth = 0) => {
    const life = lifeOf(w);
    life.alive = false;
    endedAt.set(w, clock);
    if (life.parent !== undefined) children.get(life.parent)?.delete(w);
    if (depth < 64) for (const c of [...(children.get(w) ?? [])]) end(c, depth + 1);
    children.delete(w);
  };
  const isRegistered = (w, life) => {
    if (!found.has(w)) return false;
    if (!strictBirth) return life.n === 0;
    const at = found.get(w);
    if (!life.born) return false;
    // registered without being found: the first life the stream saw
    if (at === null) return life.first;
    // each time the harness found it binds the one life alive then: born at most the slack after the finding, and
    // after the life before it ended (the same id found again, a window reopened under it by the backstop, is that
    // new life; a window another client created under the id soon after the found one closed is not)
    return [at].flat().some((t) => life.bornMs <= t + FOUND_SLACK_MS && t > life.after);
  };
  const live = (w) => typeof w === 'number' && w !== root && w !== 0 && lifeOf(w).alive;
  // ours by itself, or lying inside one of ours: registered, created by us, created inside one of ours; with xtrace, a
  // reply placed it inside one of ours and no request of ours put it there
  const within = (w, depth = 0) => {
    if (!live(w) || depth > 64) return false;
    const life = lifeOf(w);
    if (life.owned || life.inside || life.popup || isRegistered(w, life)) return true;
    return life.replyParent !== undefined && !life.reparentedByUs && within(life.replyParent, depth + 1);
  };
  // holding one of ours: a window manager's frame, through as many of its own windows as it puts around the client
  const holds = (w, depth = 0) => {
    if (!live(w) || depth > 64) return false;
    for (const c of children.get(w) ?? []) if (within(c) || holds(c, depth + 1)) return true;
    return false;
  };
  const harness = (w) => within(w) || holds(w);
  const flag = (el, what, window) => foreign.push({ client: clients.get(el.c)?.name ?? null, conn: el.c, seq: el.seq, what, window, text: el.text ?? null });

  for (const el of elements) {
    if (el.k === 'client') {
      clients.set(el.c, { ours: el.ours, name: el.name ?? null });
      continue;
    }
    if (el.k === 'died') {
      for (const [w, life] of lives) if (life.alive && life.creator === el.c) end(w);
      continue;
    }
    if (el.k === 'base') {
      // a resource-id base handed to a new connection: the client that had it is gone, and its windows with it
      for (const [w, life] of lives) if (life.alive && life.creator !== undefined && life.creator !== el.c && (w & ~el.mask) === el.base) end(w);
      continue;
    }
    if (el.k === 'destroyed') {
      end(el.w);
      continue;
    }
    if (el.k === 'selreq') {
      // a SelectionRequest the connection `c` received: its answer is that connection's to write
      open.set(`${el.c}|${el.requestor}|${el.property}`, { selection: el.selection, target: el.target, incr: false });
      continue;
    }
    if (el.k === 'parent') {
      // xtrace: a reply showed where a window lies
      if (typeof el.w !== 'number' || typeof el.parent !== 'number') continue;
      lifeOf(el.w).replyParent = el.parent;
      setParent(el.w, el.parent);
      continue;
    }
    if (el.k !== 'req') continue;
    if (typeof el.ms === 'number' && el.ms > clock) clock = el.ms;

    const ours = clients.has(el.c) ? clients.get(el.c).ours : el.ours;
    const rejected = refused.has(el);
    // what every client's requests say about windows, whoever sent them
    if (el.op === 'CreateWindow') {
      if (ours === true) {
        requests++;
        mutating++;
        const parentOk = el.parent === root || harness(el.parent);
        if (!parentOk) flag(el, 'CreateWindow under', el.parent);
        if (!rejected) born(el, { owned: parentOk });
      } else if (!rejected) {
        const life = born(el, { inside: el.parent !== root && within(el.parent), or: el.or === true });
        life.popup = popup(life);
      }
      continue;
    }
    if (ours !== true) {
      if (ours === undefined || ours === null) {
        unattributed.clients.add(el.c);
        if (changeOf(el, root)) unattributed.mutating++;
      }
      if (rejected) continue;
      if (el.op === 'ReparentWindow') {
        setParent(el.window, el.parent);
        lifeOf(el.window).popup = popup(lifeOf(el.window));
      } else if (el.op === 'ChangeWindowAttributes' && el.or !== undefined && lifeOf(el.window).creator === el.c) {
        const life = lifeOf(el.window);
        life.or = el.or;
        life.popup = popup(life);
      } else if (el.op === 'DestroyWindow') end(el.window);
      else if (el.op === 'DestroySubwindows') for (const c of [...(children.get(el.window) ?? [])]) end(c);
      continue;
    }

    requests++;
    const change = changeOf(el, root);
    if (!change) continue;
    mutating++;
    if (change.selection && !harness(change.windows[0])) {
      // a selection owner's answer to a foreign requestor's own request: exempt while that request is served
      if (!serveSelection(open, el, change.selection)) flag(el, change.what, change.windows[0]);
      continue;
    }
    if (change.unplaced) {
      unplaced++;
      continue;
    }
    for (const w of new Set(change.windows)) {
      if (typeof w === 'number' && w !== root && harness(w)) continue;
      flag(el, change.what, w);
    }
    if (rejected) continue;
    if (el.op === 'ReparentWindow') {
      lifeOf(el.window).reparentedByUs = true;
      setParent(el.window, el.parent);
    } else if (el.op === 'DestroyWindow') end(el.window);
    else if (el.op === 'DestroySubwindows') for (const c of [...(children.get(el.window) ?? [])]) end(c);
  }
  const traced = elements.some((e) => e.k === 'req' || e.k === 'ready');
  return { clean: traced && foreign.length === 0, traced, requests, mutating, foreign, unplaced, unattributed: { clients: unattributed.clients.size, mutating: unattributed.mutating } };
}

/** An extension request's minor opcode, by the name the judge gives it (core requests have none). */
const MINOR_OF = { FakeInput: 2, RedirectWindow: 1, RedirectSubwindows: 2, UnredirectWindow: 3, UnredirectSubwindows: 4 };

/**
 * The request elements the server refused, as a Set: an error names its request's opcodes and the low 16 bits of its
 * sequence number. xtrace shows every request of its connections, and a reply may come after later requests, so there
 * the error is its connection's latest request with those 16 bits (`exact`). The record reads its errors on a context
 * of their own (xprobe `contexts`), so an error may be read before or after later requests of its client; but it
 * records every request of the opcodes it reads, so the refused one is the client's latest recorded request with the
 * error's 16 bits and opcodes at or before the error's server time (`t`). An error for an opcode the record does not
 * read refuses nothing. An error without a time (a record of one context) refuses the client's latest recorded request
 * if its opcode and 16 bits match.
 */
function refusedRequests(elements) {
  const refused = new Set();
  const bySeq = new Map();
  const last = new Map();
  const timed = new Map();
  const timedKey = (c, seq, major, minor) => `${c}|${seq & 0xffff}|${major}|${minor ?? 0}`;
  for (const el of elements) {
    if (el.k !== 'req' || typeof el.t !== 'number') continue;
    const key = timedKey(el.c, el.seq, el.major, MINOR_OF[el.op]);
    if (!timed.has(key)) timed.set(key, []);
    timed.get(key).push(el);
  }
  for (const el of elements) {
    if (el.k === 'req') {
      bySeq.set(`${el.c}|${el.seq & 0xffff}`, el);
      last.set(el.c, el);
    } else if (el.k === 'error' && typeof el.t === 'number') {
      const candidates = (timed.get(timedKey(el.c, el.seq, el.major, el.minor)) ?? []).filter((r) => r.t <= el.t);
      if (candidates.length) refused.add(candidates.at(-1));
    } else if (el.k === 'error') {
      const request = el.exact ? bySeq.get(`${el.c}|${el.seq & 0xffff}`) : last.get(el.c);
      if (request && (request.seq & 0xffff) === (el.seq & 0xffff) && (request.major === undefined || request.major === el.major)) refused.add(request);
    }
  }
  return refused;
}

/**
 * A selection owner's write or notify, judged against the open requests the writing connection received: a write of
 * the property a request named, or the SelectionNotify for that request's selection and target. An INCR transfer stays
 * served from its announcement until its zero-length final chunk. Returns whether it was served.
 */
function serveSelection(open, el, { requestor, property, notify, selection, target }) {
  const mine = `${el.c}|${requestor}|`;
  if (notify) {
    const named = (r) => r.selection === selection && r.target === target;
    // a refusal (property None) answers a request of the requestor's for that selection and target; an answer, the
    // request for its property, which it closes unless the transfer is INCR
    const keys = [...open.keys()].filter((k) => k.startsWith(mine) && named(open.get(k)) && (property === 0 || k === `${mine}${property}`));
    if (!keys.length) return false;
    for (const k of keys) if (property === 0 || !open.get(k).incr) open.delete(k);
    return true;
  }
  const key = `${mine}${property}`;
  const request = open.get(key);
  if (!request) return false;
  if (el.incr) request.incr = true;
  else if (request.incr && el.empty) open.delete(key);
  return true;
}

/**
 * What a request of ours changes: `{what, windows}` (the windows that must be the harness's), `{what, windows,
 * selection}` for a selection owner's answer, `{unplaced: true}` for XTEST input the stream cannot place, or null for a
 * request that changes no window.
 */
export function changeOf(el, root) {
  const { op } = el;
  if (WINDOW_OPS.has(op)) return { what: op, windows: [el.window] };
  if (PROPERTY_OPS.has(op)) {
    if (op === 'GetProperty' && !el.delete) return null;
    if (el.window === root) return null;
    const what = op === 'GetProperty' ? 'GetProperty delete' : op;
    if (op === 'ChangeProperty') return { what, windows: [el.window], selection: { requestor: el.window, property: el.property } };
    return { what, windows: [el.window] };
  }
  switch (op) {
    case 'ChangeWindowAttributes':
      // our own event selection changes nothing of the window's
      return el.attributes.every((a) => a === 'event-mask') ? null : { what: `ChangeWindowAttributes ${el.attributes.join(',')}`, windows: [el.window] };
    case 'ReparentWindow':
      return { what: op, windows: [el.window, el.parent] };
    case 'SendEvent': {
      if (el.event === 'SelectionNotify') return { what: 'SendEvent SelectionNotify', windows: [el.destination], selection: { requestor: el.requestor ?? el.destination, property: el.property ?? 0, notify: true, selection: el.selection, target: el.target } };
      // the root is the desktop's own channel: a message to the window manager names no window of the root's
      const windows = el.destination === root ? [] : [el.destination];
      if (el.event === 'ClientMessage') {
        if (el.cmWindow !== root) windows.push(el.cmWindow);
        return { what: `${el.cmType ?? 'a'} ClientMessage`, windows };
      }
      return { what: `SendEvent ${el.event ?? 'event'}`, windows };
    }
    case 'WarpPointer': {
      // judged as a motion is, by where it ends, and by the window it names
      const named = el.dst === root || el.dst?.keyword === 'None' ? [] : [el.dst];
      if (el.target === undefined || el.target === null) return named.length ? { what: op, windows: named } : { unplaced: true };
      return { what: op, windows: [...named, el.target] };
    }
    case 'SetInputFocus':
      return { what: op, windows: [el.focus] };
    case 'KillClient':
      return { what: op, windows: [el.resource] };
    case 'FakeInput': {
      if (el.target === undefined || el.target === null) return { unplaced: true };
      // keys while the focus is None go nowhere
      if (el.target?.keyword === 'None') return null;
      return { what: `XTEST ${el.type}`, windows: [el.target] };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// xtrace

const KEYWORDS = /^([A-Za-z]+)\(0x([0-9a-f]+)\)/;
/** A window field of xtrace's text: a number, `{keyword}` for a named value, or undefined when it is not there. */
function field(text, name) {
  const m = text.match(new RegExp(`\\b${name}=(0x[0-9a-f]+|[A-Za-z]+\\(0x[0-9a-f]+\\))`));
  if (!m) return undefined;
  if (m[1].startsWith('0x')) return Number.parseInt(m[1], 16);
  const k = m[1].match(KEYWORDS);
  return { keyword: k[1], value: Number.parseInt(k[2], 16) };
}
const atom = (text, name) => text.match(new RegExp(`\\b${name}=0x([0-9a-f]+)`)) && Number.parseInt(text.match(new RegExp(`\\b${name}=0x([0-9a-f]+)`))[1], 16);
const atomName = (text, name) => text.match(new RegExp(`\\b${name}=0x[0-9a-f]+\\("([^"]+)"\\)`))?.[1];

/** The value-list's keys of a ChangeWindowAttributes line. */
function attributeKeys(text) {
  const list = text.match(/value-list=\{(.*)\}/)?.[1] ?? '';
  return [...list.matchAll(/(?:^|\s)([a-z-]+)=/g)].map((m) => m[1]);
}

const CORE_OPS = { 1: 'CreateWindow', 2: 'ChangeWindowAttributes', 4: 'DestroyWindow', 5: 'DestroySubwindows', 7: 'ReparentWindow', 8: 'MapWindow', 9: 'MapSubwindows', 10: 'UnmapWindow', 11: 'UnmapSubwindows', 12: 'ConfigureWindow', 13: 'CirculateWindow', 15: 'QueryTree', 18: 'ChangeProperty', 19: 'DeleteProperty', 20: 'GetProperty', 25: 'SendEvent', 38: 'QueryPointer', 40: 'TranslateCoordinates', 41: 'WarpPointer', 42: 'SetInputFocus', 43: 'GetInputFocus', 113: 'KillClient', 114: 'RotateProperties' };
const READS = new Set(['GetInputFocus', 'QueryPointer', 'QueryTree', 'TranslateCoordinates']);
const COMPOSITE_OPS = { 1: 'RedirectWindow', 2: 'RedirectSubwindows', 3: 'UnredirectWindow', 4: 'UnredirectSubwindows' };
const EVENT_TYPES = { 2: 'KeyPress', 3: 'KeyRelease', 4: 'ButtonPress', 5: 'ButtonRelease', 6: 'MotionNotify' };

/** Whether the judge reads an xtrace request (audit.mjs `parseXtraceFile`'s `keep`, for a whole run's trace). */
export function foreignKeep(r, extensions) {
  if (r.minor === null) return r.major in CORE_OPS;
  return ['Composite', 'XTEST'].includes(r.ext) || r.major === extensions.Composite || r.major === extensions.XTEST;
}

/** One xtrace request as a judge element, or null for one the judge does not read. */
function xtraceRequest(r, extensions) {
  const base = { k: 'req', c: r.conn, seq: r.seq, major: r.major, ours: true, text: r.text };
  const { text } = r;
  if (r.minor === null) {
    const op = CORE_OPS[r.major];
    if (!op) return null;
    switch (op) {
      case 'CreateWindow':
      case 'ReparentWindow':
        return { ...base, op, window: field(text, 'window'), parent: field(text, 'parent') };
      case 'ChangeWindowAttributes':
        return { ...base, op, window: field(text, 'window'), attributes: attributeKeys(text) };
      case 'ChangeProperty':
        return { ...base, op, window: field(text, 'window'), property: atom(text, 'property'), incr: atomName(text, 'type') === 'INCR', empty: /\bdata=(?:''|)$/.test(text) };
      case 'DeleteProperty':
      case 'RotateProperties':
        return { ...base, op, window: field(text, 'window'), property: atom(text, 'property') };
      case 'GetProperty':
        return { ...base, op, window: field(text, 'window'), property: atom(text, 'property'), delete: /\bdelete=true/.test(text) };
      case 'SendEvent': {
        const event = text.match(/event-mask=\S*\s+([A-Za-z]+)\(\d+\)/)?.[1] ?? null;
        const out = { ...base, op, destination: field(text, 'destination'), event };
        if (event === 'ClientMessage') {
          const cm = text.match(/ClientMessage\(33\).*?\bwindow=(0x[0-9a-f]+)/);
          out.cmWindow = cm ? Number.parseInt(cm[1], 16) : undefined;
          out.cmType = text.match(/type=0x[0-9a-f]+\("([^"]+)"\)/)?.[1] ?? null;
        }
        if (event === 'SelectionNotify') {
          out.requestor = field(text, 'requestor');
          const p = field(text, 'property');
          out.property = typeof p === 'number' ? p : 0;
          out.selection = atom(text, 'selection');
          out.target = atom(text, 'target');
        }
        return out;
      }
      case 'WarpPointer':
        return { ...base, op, dst: field(text, 'dst-window') };
      case 'SetInputFocus':
        return { ...base, op, focus: field(text, 'focus') };
      case 'GetInputFocus':
        return { ...base, op };
      case 'QueryPointer':
      case 'QueryTree':
        return { ...base, op, window: field(text, 'window') };
      case 'TranslateCoordinates':
        return { ...base, op, window: field(text, 'dst-window') };
      case 'KillClient':
        return { ...base, op, resource: field(text, 'resource') };
      default:
        return { ...base, op, window: field(text, 'window') };
    }
  }
  // an extension's request by the name xtrace prints, else by the major opcode the server reported
  const is = (name) => r.ext === name || (extensions[name] !== undefined && r.major === extensions[name]);
  if (is('Composite') && COMPOSITE_OPS[r.minor]) return { ...base, op: COMPOSITE_OPS[r.minor], window: field(text, 'window') };
  if (is('XTEST') && r.minor === 2) {
    const bytes = text.match(/unparsed-data=(0x[0-9a-f]{2}),(0x[0-9a-f]{2})/);
    return { ...base, op: 'FakeInput', type: bytes ? (EVENT_TYPES[Number(bytes[1])] ?? `type ${Number(bytes[1])}`) : 'unreadable', detail: bytes ? Number(bytes[2]) : null };
  }
  return null;
}

/**
 * A parsed xtrace trace (audit.mjs `parseXtrace`) as the judge's elements: every connection ours; the replies that say
 * where a window lies (`parent`), the errors, the DestroyNotify and SelectionRequest events its connections
 * received, and each connection's resource-id base. XTEST input is placed from what the trace itself shows: a key by
 * the latest input focus a request set or a reply read, a button by the latest pointer reply with no motion since, a
 * motion by the first pointer reply after it and before the next input; anything else is left unplaced.
 */
export function xtraceElements({ elements, extensions }, root) {
  const out = [];
  const bySeq = new Map();
  let focus;
  let pointer;
  let motionSince = false;
  let pendingMotions = [];
  const place = (target) => {
    for (const m of pendingMotions) m.target = target;
    pendingMotions = [];
  };
  for (const item of elements) {
    if (item.k === 'req') {
      const el = xtraceRequest(item.r, extensions);
      if (!el) continue;
      bySeq.set(`${el.c}|${el.seq}`, el);
      if (el.op === 'SetInputFocus') focus = el.focus;
      if (el.op === 'WarpPointer') {
        pendingMotions = [el];
        motionSince = true;
      }
      if (el.op === 'FakeInput') {
        // a motion not placed by the time the next input comes stays unplaced
        pendingMotions = [];
        if (el.type === 'KeyPress' || el.type === 'KeyRelease') el.target = focus?.keyword === 'PointerRoot' ? (motionSince ? undefined : pointer) : focus;
        else if (el.type === 'MotionNotify') {
          motionSince = true;
          pendingMotions.push(el);
        } else el.target = motionSince ? undefined : pointer;
      }
      // the reads only place what follows
      if (!READS.has(el.op)) out.push(el);
      continue;
    }
    const { conn, seq, what, text } = item;
    if (what === 'Success') {
      const base = text.match(/resource-id=0x([0-9a-f]+) resource-mask=0x([0-9a-f]+)/);
      if (base) out.push({ k: 'base', c: conn, base: Number.parseInt(base[1], 16), mask: Number.parseInt(base[2], 16) });
    } else if (what === 'Error') {
      const s = text.match(/\bmajor=(\d+),.*\bseq=([0-9a-f]+)/);
      if (s) out.push({ k: 'error', c: conn, seq: Number.parseInt(s[2], 16), major: Number(s[1]), exact: true });
    } else if (what === 'DestroyNotify') {
      const w = field(text, 'window');
      if (typeof w === 'number') out.push({ k: 'destroyed', w });
    } else if (what === 'SelectionRequest') {
      const requestor = field(text, 'requestor');
      const p = field(text, 'property');
      const property = typeof p === 'number' && p !== 0 ? p : atom(text, 'target');
      out.push({ k: 'selreq', c: conn, requestor, property, selection: atom(text, 'selection'), target: atom(text, 'target') });
    } else {
      const request = bySeq.get(`${conn}|${seq}`);
      if (what === 'QueryTree' && request) {
        const parent = field(text, 'parent');
        if (typeof parent === 'number' && parent !== 0) out.push({ k: 'parent', w: request.window, parent });
        const children = text.match(/children=([^;]*)/)?.[1] ?? '';
        for (const m of children.matchAll(/0x([0-9a-f]+)/g)) out.push({ k: 'parent', w: Number.parseInt(m[1], 16), parent: request.window });
      } else if (what === 'TranslateCoordinates' && request) {
        const child = field(text, 'child');
        if (typeof child === 'number' && child !== 0) out.push({ k: 'parent', w: child, parent: request.window });
      } else if (what === 'GetInputFocus') {
        focus = field(text, 'focus');
      } else if (what === 'QueryPointer') {
        const child = field(text, 'child');
        pointer = typeof child === 'number' ? child : (request?.window ?? root);
        motionSince = false;
        place(pointer);
      }
    }
  }
  return out;
}

/**
 * The audit of an xtrace trace (the harness's own, and each engine's route audit): `registered`, the harness's windows
 * (a Set or a Map, see `judgeForeign`). A trace with no requests is not clean: its clients did not go through the proxy.
 */
export function auditForeign(trace, { registered, root }) {
  return judgeForeign(xtraceElements(trace, root), { registered, root });
}

// ---------------------------------------------------------------------------------------------------------------------
// The whole run's RECORD (`xprobe record-run`)

/** Special values of the record's window fields, by the field: the X protocol's named constants. */
const RECORD_KEYWORDS = {
  focus: { 0: 'None', 1: 'PointerRoot' },
  destination: { 0: 'PointerWindow', 1: 'InputFocus' },
  dst: { 0: 'None' },
  resource: { 0: 'AllTemporary' },
};
const keyword = (fieldName, value) => (typeof value === 'number' && RECORD_KEYWORDS[fieldName]?.[value] ? { keyword: RECORD_KEYWORDS[fieldName][value] } : value);

/**
 * The record's lines as the judge's elements. A client is ours as the record classified it (`client` lines); XTEST
 * input carries where it landed, read by the record right after the server handled it (`focus` and `pointer`, the root
 * child under the pointer, or null where it could not read them): a key goes to the focus (to the window under the
 * pointer while the focus is PointerRoot), a button or a motion to the window under the pointer.
 */
export function recordElements(lines, root) {
  const out = [];
  const meta = { ready: false, ended: false, error: null };
  for (const line of lines) recordLine(line, out, meta, root);
  return { elements: out, meta };
}

/** One line of the record into the judge's elements (`out`) and the record's own state (`meta`). */
function recordLine(line, out, meta, root) {
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    return;
  }
  switch (r.kind) {
    case 'ready':
      meta.ready = true;
      // the record's clock against the server's: a request's server time on the wall clock, however late it was read
      if (typeof r.t0 === 'number') meta.offset = r.ms - r.t0;
      meta.xtest = r.xtest;
      meta.composite = r.composite;
      out.push({ k: 'ready' });
      break;
    case 'failed':
      meta.error = r.error ?? 'the record failed';
      break;
    case 'end':
      meta.ended = true;
      break;
    case 'client':
      out.push({ k: 'client', c: r.client, ours: r.ours === true ? true : r.ours === false ? false : null, name: `${r.exe ?? 'unknown'}${r.pid ? ` pid ${r.pid}` : ''}` });
      break;
    case 'died':
      out.push({ k: 'died', c: r.client });
      break;
    case 'destroyed':
      out.push({ k: 'destroyed', w: r.window });
      break;
    case 'selreq':
      out.push({ k: 'selreq', c: r.client, requestor: r.requestor, property: r.property || r.target, selection: r.selection, target: r.target });
      break;
    case 'error':
      out.push({ k: 'error', c: r.client, seq: r.seq, major: r.major, ...(typeof r.t === 'number' ? { minor: r.minor ?? 0, t: r.t } : {}) });
      break;
    case 'req': {
      const el = { k: 'req', c: r.client, text: null, ...r, ms: meta.offset !== undefined && typeof r.t === 'number' ? r.t + meta.offset : r.ms };
      el.major = OP_MAJOR[r.op] ?? (r.op === 'FakeInput' ? meta.xtest : r.op in COMPOSITE_MAJOR_OF ? meta.composite : undefined);
      delete el.kind;
      delete el.client;
      if (r.op === 'ChangeWindowAttributes') el.attributes = attributeNames(r.mask);
      if ('or' in r) el.or = r.or === true || r.or === 1;
      if (r.op === 'ChangeProperty') {
        el.incr = r.type_name === 'INCR';
        el.empty = r.length === 0;
      }
      for (const f of ['focus', 'destination', 'dst', 'resource']) if (f in r && r.op !== 'FakeInput') el[f] = keyword(f, r[f]);
      if (r.op === 'SendEvent' && r.event === 'ClientMessage') {
        el.cmWindow = r.cm_window;
        el.cmType = r.cm_type ?? null;
      }
      if (r.op === 'FakeInput') el.target = fakeTarget(r, root);
      if (r.op === 'WarpPointer') el.target = r.pointer === null || r.pointer === undefined ? null : r.pointer === 0 ? root : r.pointer;
      el.text = describe(r);
      out.push(el);
      break;
    }
    default:
      break;
  }
}

const OP_MAJOR = Object.fromEntries(Object.entries(CORE_OPS).map(([major, op]) => [op, Number(major)]));
const COMPOSITE_MAJOR_OF = Object.fromEntries(Object.values(COMPOSITE_OPS).map((op) => [op, true]));

/** Where a recorded XTEST event landed: a key at the focus (or under the pointer for PointerRoot), the rest under the pointer. */
function fakeTarget(r, root) {
  const under = r.pointer === null || r.pointer === undefined ? null : r.pointer === 0 ? root : r.pointer;
  if (r.type === 'KeyPress' || r.type === 'KeyRelease') {
    if (r.focus === null || r.focus === undefined) return null;
    if (r.focus === 0) return { keyword: 'None' };
    if (r.focus === 1) return under;
    return r.focus;
  }
  return under;
}

/** ChangeWindowAttributes' value-mask bits by name (the X protocol's CW order). */
const CW = ['background-pixmap', 'background-pixel', 'border-pixmap', 'border-pixel', 'bit-gravity', 'win-gravity', 'backing-store', 'backing-planes', 'backing-pixel', 'override-redirect', 'save-under', 'event-mask', 'do-not-propagate-mask', 'colormap', 'cursor'];
const attributeNames = (mask) => CW.filter((_, i) => mask & (1 << i));

const describe = (r) => {
  const { kind, ms, t, ...rest } = r;
  return JSON.stringify(rest).slice(0, 400);
};

/**
 * The audit of the whole run's record (`xprobe record-run`'s lines, as text): `registered`, the harness's windows, a
 * Map from id to when it was found; `spans`, the harness's operations on its windows (`judgeForeign`). A record that
 * never began, ended in a failure or never said it ended (cut short) is not clean.
 */
export function auditRecord(text, { registered, root, spans = [] }) {
  const { elements, meta } = recordElements(text.split('\n').filter(Boolean), root);
  return recordVerdict(elements, meta, { registered, root, spans });
}

/** The same audit of the record's file, read line by line: a whole run's record is too large for one string. */
export async function auditRecordFile(path, { registered, root, spans = [] }) {
  const out = [];
  const meta = { ready: false, ended: false, error: null };
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) if (line) recordLine(line, out, meta, root);
  return recordVerdict(out, meta, { registered, root, spans });
}

function recordVerdict(elements, meta, { registered, root, spans }) {
  const judged = judgeForeign(elements, { registered, root, strictBirth: true, spans });
  const error = meta.error ?? (!meta.ready ? 'the record never began' : !meta.ended ? 'the record did not end cleanly, so it may be incomplete' : null);
  const traced = meta.ready && meta.ended && !meta.error;
  return { ...judged, clean: traced && judged.foreign.length === 0, traced, ...(error ? { error } : {}) };
}
