// The X request audit (Design, Verification system): in its own untimed pass, an engine's X connections go through
// `xtrace` on a proxy display (as R/F §0 traced the vendor), and a background-route operation fails on any forbidden
// request: SetInputFocus, ConfigureWindow with a stack mode, WarpPointer, a _NET_ACTIVE_WINDOW ClientMessage, or
// XTEST FakeInput. The VM's xtrace prints FakeInput as UNKNOWN opcode 132/2 (R/F §4.1), so FakeInput is matched by
// XTEST's major opcode as the server reported it to the traced client, with minor 2.

import './hermetic.mjs';

import { spawn } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const REQUEST = /^(\d+):<:([0-9a-f]+):\s*\d+:\s*(?:([A-Za-z0-9-]+)-)?Request\((\d+)(?:,(\d+))?\):\s*(\S+)?(.*)$/;
const QUERY = /^(\d+):<:([0-9a-f]+):.*Request\(98\): QueryExtension name='([^']+)'/;
const QUERY_REPLY = /^(\d+):>:([0-9a-f]+):.*Reply to QueryExtension: present=true\S* major-opcode=(\d+)/;
/**
 * The server's lines the foreign-window judge reads (foreign.mjs): the replies that say where a window lies, where the
 * focus and the pointer are, the errors that refuse a request, the events that end a window or ask for a selection,
 * and each connection's resource-id base.
 */
const SERVER = /^(\d+):>:(?:([0-9a-f]+):(?:\d+: Reply to (QueryTree|TranslateCoordinates|GetInputFocus|QueryPointer): |(Error) \d+=\w+: | Event (?:\(generated\) )?(SelectionRequest|DestroyNotify)\(\d+\) )| (Success), )(.*)$/;

/** A parse's state, and one trace line read into it (`parseXtrace`, `parseXtraceFile`). */
const parseState = () => ({ requests: [], elements: [], extensions: {}, asked: new Map(), offset: 0 });

function readLine(state, line, keep) {
  const at = state.offset;
  state.offset += Buffer.byteLength(line) + 1;
  const q = line.match(QUERY);
  if (q) state.asked.set(`${q[1]}|${q[2]}`, q[3]);
  const r = line.match(QUERY_REPLY);
  if (r && state.asked.has(`${r[1]}|${r[2]}`)) state.extensions[state.asked.get(`${r[1]}|${r[2]}`)] = Number(r[3]);
  const s = line.match(SERVER);
  if (s) {
    state.elements.push({ k: 'line', conn: Number(s[1]), seq: s[2] === undefined ? null : Number.parseInt(s[2], 16), what: s[3] ?? s[4] ?? s[5] ?? s[6], text: s[7].slice(0, 4000) });
    return;
  }
  const m = line.match(REQUEST);
  if (!m) return;
  const request = {
    conn: Number(m[1]),
    seq: Number.parseInt(m[2], 16),
    major: Number(m[4]),
    minor: m[5] === undefined ? null : Number(m[5]),
    ext: m[3] ?? null,
    name: m[6]?.replace(/:$/, '') ?? null,
    text: line.slice(0, 400),
    at,
  };
  if (keep && !keep(request, state.extensions)) return;
  state.requests.push(request);
  state.elements.push({ k: 'req', r: request });
}

const parsed = ({ requests, extensions, elements }) => ({ requests, extensions, elements });

/**
 * A trace's requests `{conn, seq, major, minor, name, text, at}`, the extensions' major opcodes the server reported,
 * and `elements`: in the trace's order, each request (`{k: 'req', r}`) and each server line the foreign-window judge
 * reads (`{k: 'line', conn, seq, what, text}`, `SERVER`). `at` is where the request's line starts in the trace, in
 * bytes, which the proxy's marks are measured in.
 */
export function parseXtrace(text) {
  const state = parseState();
  for (const line of text.split('\n')) readLine(state, line);
  return parsed(state);
}

/**
 * The same parse of a trace file, read line by line, so a whole run's trace never has to fit in one string; `keep`
 * (`(request, extensions) => boolean`) keeps only the requests a judge reads, so it need not fit in memory either.
 */
export async function parseXtraceFile(path, { keep = null } = {}) {
  const state = parseState();
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) readLine(state, line, keep);
  return parsed(state);
}

/** What makes a request forbidden on the background route, or null. */
function forbidden(request, extensions) {
  const xtest = extensions.XTEST;
  if (request.major === 42) return 'SetInputFocus';
  if (request.major === 41) return 'WarpPointer';
  if (request.major === 12 && /stack-mode=/.test(request.text)) return 'ConfigureWindow stack-mode';
  if (request.major === 25 && /ClientMessage/.test(request.text) && /"_NET_ACTIVE_WINDOW"/.test(request.text)) return '_NET_ACTIVE_WINDOW ClientMessage';
  if (xtest !== undefined && request.major === xtest && request.minor === 2) return 'XTEST FakeInput';
  return null;
}

/**
 * The audit of one traced pass. A trace with no requests at all is not clean: it means the engine's connection did
 * not go through the proxy, which would make any audit pass.
 */
export function auditRequests({ requests, extensions }) {
  const found = [];
  for (const r of requests) {
    const what = forbidden(r, extensions);
    if (what) found.push({ conn: r.conn, seq: r.seq, what, text: r.text });
  }
  const traced = requests.length > 0;
  return { clean: traced && found.length === 0, traced, requests: requests.length, forbidden: found };
}

/** The window a background-forbidden request names: a ClientMessage's or ConfigureWindow's window, SetInputFocus's focus. */
function namedWindow(request) {
  const m = request.text.match(request.major === 42 ? /\bfocus=0x([0-9a-f]+)/ : /\bwindow=0x([0-9a-f]+)/);
  return m ? Number.parseInt(m[1], 16) : null;
}

/**
 * The audit of a request that must take the foreground route (M2 whole-branch review): the route activates its
 * target, raises it, gives it the focus and sends XTEST input, so of the requests the background route forbids, only
 * those are allowed: the `_NET_ACTIVE_WINDOW` ClientMessage, the stacking `ConfigureWindow` and `SetInputFocus` naming
 * the target window, and XTEST FakeInput. Any of them naming another window, and WarpPointer, is forbidden. A trace
 * with no requests is not clean. Returns `{clean, traced, requests, allowed, forbidden}`.
 */
export function auditForeground({ requests, extensions }, target) {
  const found = [];
  let allowed = 0;
  for (const r of requests) {
    const what = forbidden(r, extensions);
    if (!what) continue;
    const targeted = what === 'XTEST FakeInput' || (what !== 'WarpPointer' && namedWindow(r) === target);
    if (targeted) allowed++;
    else found.push({ conn: r.conn, seq: r.seq, what, text: r.text });
  }
  const traced = requests.length > 0;
  return { clean: traced && found.length === 0, traced, requests: requests.length, allowed, forbidden: found };
}

/**
 * The audit of a request that must send nothing (M3.1: a kind the window's family ignores, refused in shared mode):
 * no SendEvent at all, and none of the requests the background route forbids. A trace with no requests is not clean.
 */
export function auditNothingSent({ requests, extensions }) {
  const found = [];
  for (const r of requests) {
    const what = r.major === 25 ? 'SendEvent' : forbidden(r, extensions);
    if (what) found.push({ conn: r.conn, seq: r.seq, what, text: r.text });
  }
  const traced = requests.length > 0;
  return { clean: traced && found.length === 0, traced, requests: requests.length, forbidden: found };
}

/** The X event types an input request can carry: XTEST FakeInput's `type` byte, SendEvent's event code. */
const EVENT_TYPES = { 2: 'KeyPress', 3: 'KeyRelease', 4: 'ButtonPress', 5: 'ButtonRelease', 6: 'MotionNotify', 7: 'EnterNotify', 8: 'LeaveNotify', 9: 'FocusIn', 10: 'FocusOut' };
const SENT_EVENT = /\b(KeyPress|KeyRelease|ButtonPress|ButtonRelease|MotionNotify|EnterNotify|LeaveNotify|FocusIn|FocusOut)\((\d+)\)(?:\s+(?:keycode|button|detail)=0x([0-9a-f]+))?/;

/**
 * The input event a request carries, or null: `{via: 'xtest', type, detail}` for XTEST FakeInput (whose body xtrace
 * leaves unparsed: its first byte is the event type, its second the keycode or button), `{via: 'send', type, detail,
 * destination}` for a SendEvent of an input or focus event.
 */
export function inputEvent(request, extensions) {
  if (extensions.XTEST !== undefined && request.major === extensions.XTEST && request.minor === 2) {
    const bytes = request.text.match(/unparsed-data=(0x[0-9a-f]{2}),(0x[0-9a-f]{2})/);
    if (!bytes) return { via: 'xtest', type: 'unreadable', detail: null };
    return { via: 'xtest', type: EVENT_TYPES[Number(bytes[1])] ?? `type ${Number(bytes[1])}`, detail: Number(bytes[2]) };
  }
  if (request.major !== 25) return null;
  const sent = request.text.match(SENT_EVENT);
  if (!sent) return null;
  const destination = request.text.match(/\bdestination=0x([0-9a-f]+)/);
  return { via: 'send', type: sent[1], detail: sent[3] === undefined ? null : Number.parseInt(sent[3], 16), destination: destination ? Number.parseInt(destination[1], 16) : null };
}

/** A pressed key or button and the release that answers it. */
const RELEASE_OF = { KeyPress: 'KeyRelease', ButtonPress: 'ButtonRelease' };
const heldName = ({ type, detail }) => `${type === 'KeyPress' ? 'key' : 'button'} ${detail}`;

/**
 * The audit of a key or button held, its window then minimized, then released (M4's T4; the design session's proof):
 * each sample's requests are attributed by the harness's marks in the trace (`hold:<i>` and `held:<i>` around the hold,
 * `release:<i>` and `released:<i>` around the release and the quiet after it). On the hold's route (`background`: a
 * SendEvent to the target; `foreground`: XTEST):
 * - the hold is proven first: it pressed at least one key or button, and released none;
 * - the release holds exactly one release of each held key or button, and no press, no motion, no crossing, no
 *   activation and no focus request; the background route's own teardown, a synthetic FocusOut to the target, is
 *   allowed;
 * - the foreground hold may activate its target (the route's own activation); nothing else the background route
 *   forbids, anywhere;
 * - outside the samples' spans the engine sends no input and nothing the background route forbids.
 * A trace with no requests, or a sample whose marks are missing or out of order, is not clean. Returns `{clean,
 * traced, requests, samples: [{i, held}], forbidden}`.
 */
export function auditHeldRelease({ requests, extensions }, target, { route, marks }) {
  const found = [];
  const flag = (what, r) => found.push({ conn: r?.conn, seq: r?.seq, what, text: r?.text });
  const at = new Map(marks.map((m) => [m.tag, m.at]));
  const indices = [...new Set(marks.map((m) => m.tag.split(':')[1]))].sort((a, b) => Number(a) - Number(b));
  const samples = [];
  const attributed = new Set();
  const viaRoute = route === 'foreground' ? (e) => e.via === 'xtest' : (e) => e.via === 'send' && e.destination === target;
  for (const i of indices) {
    const edges = ['hold', 'held', 'release', 'released'].map((t) => at.get(`${t}:${i}`));
    if (edges.some((e) => e === undefined) || edges.some((e, k) => k > 0 && e < edges[k - 1])) {
      flag(`sample ${i}: its marks are missing or out of order`);
      continue;
    }
    const within = (from, to) => requests.filter((r) => r.at >= from && r.at < to);
    const hold = within(edges[0], edges[1]);
    const release = within(edges[2], edges[3]);
    for (const r of [...hold, ...release]) attributed.add(r);
    // the hold: its presses on its route, its own activation on the foreground route, nothing else forbidden
    const pressed = [];
    for (const r of hold) {
      const e = inputEvent(r, extensions);
      const what = forbidden(r, extensions);
      if (e && viaRoute(e) && RELEASE_OF[e.type]) pressed.push({ type: e.type, detail: e.detail });
      else if (e && ['KeyRelease', 'ButtonRelease'].includes(e.type)) flag(`sample ${i}: the hold released ${e.type} ${e.detail}`, r);
      else if (e && e.via === 'send' && e.type === 'FocusIn' && route === 'background' && e.destination === target) continue;
      else if (e && e.via !== 'xtest') flag(`sample ${i}: the hold sent ${e.type}`, r);
      if (what && what !== 'XTEST FakeInput' && !(route === 'foreground' && what !== 'WarpPointer' && namedWindow(r) === target)) flag(`sample ${i}: the hold sent ${what}`, r);
      if (what === 'XTEST FakeInput' && route !== 'foreground') flag(`sample ${i}: the hold sent ${what}`, r);
      if (e?.via === 'xtest' && route === 'foreground' && !RELEASE_OF[e.type]) flag(`sample ${i}: the hold sent XTEST ${e.type}`, r);
    }
    if (!pressed.length) flag(`sample ${i}: the hold pressed nothing on the ${route} route`);
    // the release: exactly one release of each held key or button, the background teardown allowed, nothing else
    const owed = pressed.map((p) => `${RELEASE_OF[p.type]} ${p.detail}`);
    for (const r of release) {
      const e = inputEvent(r, extensions);
      const what = forbidden(r, extensions);
      if (e && viaRoute(e) && ['KeyRelease', 'ButtonRelease'].includes(e.type)) {
        const k = owed.indexOf(`${e.type} ${e.detail}`);
        if (k >= 0) owed.splice(k, 1);
        else flag(`sample ${i}: the release sent ${e.type} ${e.detail}, which was not held or was released already`, r);
        continue;
      }
      if (e && e.via === 'send' && e.type === 'FocusOut' && route === 'background' && e.destination === target) continue;
      if (e) flag(`sample ${i}: the release sent ${e.via === 'xtest' ? 'XTEST ' : ''}${e.type}${e.detail === null ? '' : ` ${e.detail}`}`, r);
      else if (what) flag(`sample ${i}: the release sent ${what}`, r);
    }
    for (const missing of owed) flag(`sample ${i}: the release never sent ${missing}`);
    samples.push({ i: Number(i), held: pressed.map(heldName) });
  }
  if (!samples.length) flag('no sample was marked in the trace');
  for (const r of requests) {
    if (attributed.has(r)) continue;
    const e = inputEvent(r, extensions);
    const what = forbidden(r, extensions);
    if (e || what) flag(`outside the hold and the release: ${e ? `${e.via === 'xtest' ? 'XTEST ' : ''}${e.type}` : what}`, r);
  }
  const traced = requests.length > 0;
  return { clean: traced && found.length === 0, traced, requests: requests.length, samples, forbidden: found };
}

// The foreign-window judge (the harness never changes a window it did not open) is foreign.mjs's.

function freeDisplay() {
  for (let n = 40; n < 100; n++) {
    if (!existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) return n;
  }
  throw new Error('no free X display number for the audit proxy');
}

/**
 * An xtrace proxy display forwarding to `display`: `{display, env, log, stop()}`. `env` is what a client needs to
 * reach it (DISPLAY and an XAUTHORITY holding the proxy's copy of the credentials); `stop()` ends the proxy and returns
 * the trace's text.
 */
export async function startProxy({ display = process.env.DISPLAY ?? ':0' } = {}) {
  const n = freeDisplay();
  const dir = mkdtempSync(join(tmpdir(), 'cua171-audit-'));
  const log = join(dir, 'x11.log');
  // xtrace copies the display's credentials for the proxy into a copy of the authority file of the pass's own, so
  // the person's ~/.Xauthority is never written
  const auth = join(dir, 'Xauthority');
  copyFileSync(process.env.XAUTHORITY ?? join(homedir(), '.Xauthority'), auth);
  // lists shown to 256 entries: every client's connection setup, XKB keymap and keyboard mapping are tens of KB of
  // lists, the bulk of a whole run's trace (T4b's audit round), and no audit reads that far into a list
  const child = spawn('xtrace', ['-k', '-m', '256', '-d', display, '-D', `:${n}`, '-c', '-f', auth, '-F', auth, '-o', log], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const deadline = Date.now() + 5000;
  while (!existsSync(`/tmp/.X11-unix/X${n}`)) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`xtrace did not start: ${stderr.trim()}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  const marks = [];
  return {
    display: `:${n}`,
    env: { ...process.env, DISPLAY: `:${n}`, XAUTHORITY: auth },
    log,
    marks,
    /**
     * A mark at the trace's end, for attributing requests to the harness's steps: once the log has stopped growing for
     * 100 ms (xtrace writes each line as it forwards it), its length in bytes, recorded as `{tag, at}`. A request still
     * in flight when the mark is taken lands after it, in the next step's span, where the audits count it against
     * that step: a late request is never excused.
     */
    async mark(tag) {
      const size = () => (existsSync(log) ? statSync(log).size : 0);
      const deadline = Date.now() + 3000;
      let last = size();
      let quiet = Date.now();
      while (Date.now() - quiet < 100 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
        const now = size();
        if (now !== last) {
          last = now;
          quiet = Date.now();
        }
      }
      marks.push({ tag, at: last });
      return last;
    },
    /**
     * Ends the proxy and answers the trace: its text, or with `parse` (`parseXtraceFile`'s kind), what `parse(log)`
     * answers, read from the file before it is removed.
     */
    async stop({ parse = null } = {}) {
      child.kill('SIGTERM');
      await exited;
      try {
        if (parse) return await parse(log);
        return existsSync(log) ? readFileSync(log, 'utf8') : '';
      } finally {
        rmSync(dir, { recursive: true, force: true });
        // xtrace leaves its display's socket behind when it is ended; the next pass would find the number taken
        rmSync(`/tmp/.X11-unix/X${n}`, { force: true });
      }
    },
  };
}
