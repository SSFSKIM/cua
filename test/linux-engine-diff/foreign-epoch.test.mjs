// A request to a window id the run opened is judged by the life (epoch) of that id it reaches (#171 M5, task 106; the
// design session's rulings 857 and 858). arm64's V1 at H'''' read NOT CLEAR on the vendor builds' per-request teardown
// (SendEvent FocusOut, UnredirectWindow) to the run's own gedit window, sent after the vendor had ended that gedit: the
// judge took a registered window as the harness's only while it lived, so a request to its id after the trace showed
// its end read as a change of a window the harness did not open.
// - The whole-run RECORD sees every client's creations: the exact epoch rule. A request to an id whose latest life is
//   one the run registered is the run's, ended or not; a request in a life the run never registered is foreign.
// - A route audit's xtrace sees only our connections, never another client's creation under a freed id. Once the trace
//   shows a registered life end, a request to that id is the run's only where the server refused it as BadWindow naming
//   that id (no window held it, so nothing changed); one the server accepted reached a life the trace never saw begin,
//   and is foreign. The documented gap: another client creating and destroying a window under the id between the end
//   and a refused request reads as the run's, though that request changed nothing.
// The new rule only adds to what the old one took as the harness's (ruling 858): pinned against H''''s judge, read from
// git, over the cases here and a seeded sweep. Display-free.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { auditForeign, auditRecord } from '../../scripts/linux-engine-diff/foreign.mjs';

const ROOT = 0x1ff;
const MINE = 0x0180_0064; // the run's gedit window (V1's 0x01800064)
const PERSON = 0x0060_0002;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const reg = new Set([MINE]);
const route = (lines, registered = reg) => auditForeign(parseXtrace(lines.join('\n')), { registered, root: ROOT, routeAudit: true });
const shown = (r) => r.foreign.map((f) => `${f.what} on ${hex(f.window)}`);

// the route audit's watcher (xprobe ancestry, connection 004) selects the window's structure; the engine is 005
const watch = (w = MINE) => `004:<:0001: 12: Request(2): ChangeWindowAttributes window=${hex(w)} value-list={event-mask=StructureNotify}`;
const destroyed = (w = MINE, seq = '0002') => `004:>:${seq}: Event DestroyNotify(17) event=${hex(w)} window=${hex(w)}`;
const focusOut = (seq, w = MINE) => `005:<:${seq}: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(w)} event-mask=0 FocusOut(10) detail=Nonlinear(0x03) event=${hex(w)} mode=Normal(0x00)`;
const unredirect = (seq, w = MINE) => `005:<:${seq}: 12: Composite-Request(142,3): UnredirectWindow window=${hex(w)} update=Manual(0x01)`;
const configure = (seq, w = MINE) => `005:<:${seq}: 16: Request(12): ConfigureWindow window=${hex(w)} values={x=1 y=1}`;
const error = (seq, { code = 3, name = 'Window', major = 25, minor = 0, bad = MINE } = {}) => `005:>:${seq}:Error ${code}=${name}: major=${major}, minor=${minor}, bad=${hex(bad)}, seq=${seq}`;
/** The vendor's teardown after its own gedit ended: a FocusOut, then the Composite unredirect, each refused or not. */
const teardown = ({ refused = true, w = MINE } = {}) => [focusOut('0010', w), ...(refused ? [error('0010', { bad: w })] : []), unredirect('0011', w), ...(refused ? [error('0011', { major: 142, minor: 3, bad: w })] : [])];

// ---------------------------------------------------------------------------------------------------------------------
// The route audit's xtrace

test("route audit: the vendor's teardown to the run's own ended window, refused as BadWindow, is the run's", () => {
  const result = route([watch(), destroyed(), ...teardown()]);
  assert.deepEqual(shown(result), []);
  assert.equal(result.clean, true);
});

test('route audit: a request to an ended registered id that the server accepted is foreign: a life the trace never saw begin held it', () => {
  assert.deepEqual(shown(route([watch(), destroyed(), ...teardown({ refused: false })])), [`SendEvent FocusOut on ${hex(MINE)}`, `UnredirectWindow on ${hex(MINE)}`]);
  // refused for another reason than a missing window: a window held the id
  const badValue = [watch(), destroyed(), unredirect('0011'), error('0011', { code: 2, name: 'Value', major: 142, minor: 3 })];
  assert.deepEqual(shown(route(badValue)), [`UnredirectWindow on ${hex(MINE)}`]);
  // a BadWindow naming another id says nothing of this one
  const other = [watch(), destroyed(), focusOut('0010'), error('0010', { bad: PERSON })];
  assert.deepEqual(shown(route(other)), [`SendEvent FocusOut on ${hex(MINE)}`]);
});

test('route audit: a request to an id the run never registered is foreign, refused or not', () => {
  assert.deepEqual(shown(route([watch(PERSON), destroyed(PERSON), ...teardown({ w: PERSON })])), [`SendEvent FocusOut on ${hex(PERSON)}`, `UnredirectWindow on ${hex(PERSON)}`]);
  assert.deepEqual(shown(route([...teardown({ refused: false, w: PERSON })])), [`SendEvent FocusOut on ${hex(PERSON)}`, `UnredirectWindow on ${hex(PERSON)}`]);
  // a registered id's refusal lends nothing to an unregistered one
  assert.deepEqual(shown(route([watch(), destroyed(), configure('0012', PERSON), error('0012', { major: 12, bad: PERSON })])), [`ConfigureWindow on ${hex(PERSON)}`]);
});

test('route audit: the live registered window is the run\'s, refused or not, as before', () => {
  assert.equal(route([watch(), ...teardown({ refused: false })]).clean, true);
  assert.equal(route([watch(), configure('0012'), error('0012', { code: 8, name: 'Match', major: 12 })]).clean, true);
});

test('route audit, the documented gap: another client creating and destroying a window under the id is invisible here, so a refused request reads as the run\'s', () => {
  // between the end and the teardown, a client handed the freed range may open and close a window under 0x01800064;
  // nothing of it reaches this trace (no connection of ours selected the root's substructure). The teardown is refused
  // as BadWindow either way: it changed nothing, and it reads as the run's. The whole-run RECORD closes this gap.
  assert.equal(route([watch(), destroyed(), ...teardown()]).clean, true);
});

test('route audit: XTEST input placed on an ended registered window is not excused by the new rule', () => {
  const XTEST = ["005:<:0003: 20: Request(98): QueryExtension name='XTEST'", '005:>:0003:32: Reply to QueryExtension: present=true(0x01) major-opcode=132 first-event=0 first-error=0'];
  const focus = [`005:<:0004:  4: Request(43): GetInputFocus `, `005:>:0004:32: Reply to GetInputFocus: revert-to=Parent(0x02) focus=${hex(MINE)}`];
  const key = `005:<:0005: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=0x02,0x26,0x00,0x00;`;
  const refusedKey = `005:>:0005:Error 3=Window: major=132, minor=2, bad=${hex(MINE)}, seq=0005`;
  assert.deepEqual(shown(route([watch(), destroyed(), ...XTEST, ...focus, key, refusedKey])), [`XTEST KeyPress on ${hex(MINE)}`]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The whole-run RECORD: the exact epoch rule

const OURS = 0x400000;
const ENGINE = 0x1600000;
const GEDIT = 0x1800000; // the run's gedit's client: the window's creator
const OTHER = 0x2400000; // a client of the person's
const at = (ms, kind, fields) => JSON.stringify({ kind, ms, ...fields });
const client = (c, ours, exe) => at(0, 'client', { client: c, pid: 1, exe, ours });
const reqAt = (ms, c, seq, op, fields) => JSON.stringify({ kind: 'req', ms, client: c, seq, t: seq, op, ...fields });
const START = [at(0, 'ready', { root: ROOT, xtest: 132, composite: 142 }), client(OURS, true, 'xtrace'), client(ENGINE, true, 'sky'), client(GEDIT, false, 'gedit'), client(OTHER, false, 'xterm')];
const created = (ms, c, seq) => reqAt(ms, c, seq, 'CreateWindow', { window: MINE, parent: ROOT });
const gone = (ms) => at(ms, 'destroyed', { window: MINE });
const engineFocusOut = (ms, seq) => reqAt(ms, ENGINE, seq, 'SendEvent', { destination: MINE, event: 'FocusOut' });
const record = (lines, found) => auditRecord([...START, ...lines, at(99999, 'end', {})].join('\n'), { registered: new Map([[MINE, found]]), root: ROOT });
const seqs = (r) => r.foreign.map((f) => f.seq);

test('record: a request to the run\'s own ended window, no newer life under its id, is the run\'s', () => {
  assert.equal(record([created(1000, GEDIT, 10), gone(2000), engineFocusOut(2010, 40)], [1050]).clean, true);
});

test('record: a request inside a later life the run registered (the restarted gedit reusing the id) is the run\'s', () => {
  // the first gedit found at 1050 and ended; the restarted one created at 3000 and found at 3200
  const lines = [created(1000, GEDIT, 10), gone(2000), created(3000, GEDIT, 11), engineFocusOut(3100, 40), engineFocusOut(3300, 41)];
  assert.equal(record(lines, [1050, 3200]).clean, true, JSON.stringify(record(lines, [1050, 3200]).foreign));
});

test('record: a request between two of the run\'s lives, in a life another client created, is foreign', () => {
  // the life between, never found, and no finding after it
  const lines = [created(1000, GEDIT, 10), gone(2000), created(2500, OTHER, 20), engineFocusOut(2600, 40), gone(2700), created(3000, GEDIT, 11), engineFocusOut(3300, 41)];
  assert.deepEqual(seqs(record(lines, [1050])), [40, 41], 'the restarted window not found: neither later life is the run\'s');
});

test(
  "record: a finding binds only the life alive when it was made, never a foreign life that ended before it (#425)",
  { todo: "H''''s binding, kept for the superset property (task 106's report): a finding binds any life born before it and after the previous end, so the restart's finding at 3200 binds the foreign life between too" },
  () => {
    const lines = [created(1000, GEDIT, 10), gone(2000), created(2500, OTHER, 20), engineFocusOut(2600, 40), gone(2700), created(3000, GEDIT, 11), engineFocusOut(3300, 41)];
    assert.deepEqual(seqs(record(lines, [1050, 3200])), [40]);
  },
);

test('record: a foreign client in a new epoch on a recycled id stays foreign', () => {
  const lines = [created(1000, GEDIT, 10), gone(2000), created(5000, OTHER, 20), engineFocusOut(5100, 40)];
  assert.deepEqual(seqs(record(lines, [1050])), [40]);
});

test('record: the gap the route audit leaves is closed here: a request after another client\'s life under the id ended is foreign', () => {
  const lines = [created(1000, GEDIT, 10), gone(2000), created(2500, OTHER, 20), gone(2600), engineFocusOut(2700, 40)];
  assert.deepEqual(seqs(record(lines, [1050])), [40]);
});

test('record: a registered window the record never saw created is not the run\'s, ended or not', () => {
  assert.deepEqual(seqs(record([gone(2000), engineFocusOut(2010, 40)], [1050])), [40]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The superset property (ruling 858): whatever the old judge took as the harness's, the new one does too

/** H'''' (3b5c0441), the head V1 ran at: its judge, read from git into a scratch directory of the test's own. */
const OLD_HEAD = '3b5c0441';
let old;
let scratch;
before(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'cua171-epoch-'));
  const source = execFileSync('git', ['show', `${OLD_HEAD}:scripts/linux-engine-diff/foreign.mjs`], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' });
  const file = join(scratch, 'foreign-old.mjs');
  writeFileSync(file, source);
  old = await import(pathToFileURL(file).href);
});
after(() => rmSync(scratch, { recursive: true, force: true }));

const key = (f) => `${f.conn}|${f.seq}|${f.what}|${typeof f.window === 'number' ? f.window : JSON.stringify(f.window)}`;
/** Every finding of the new judge is one of the old judge's: nothing the old rule took as the harness's turns foreign. */
function assertSuperset(name, now, before) {
  const was = new Set(before.foreign.map(key));
  const added = now.foreign.map(key).filter((k) => !was.has(k));
  assert.deepEqual(added, [], `${name}: the new judge flags what the old one took as the harness's`);
}

/** A seeded generator (mulberry32), so a failing sweep replays. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("superset: no request the old route-audit rule took as the harness's reads foreign under the new rule", () => {
  const cases = {
    'refused teardown after the end': [watch(), destroyed(), ...teardown()],
    'accepted teardown after the end': [watch(), destroyed(), ...teardown({ refused: false })],
    'live teardown': [watch(), ...teardown({ refused: false })],
    'unregistered, refused': [...teardown({ w: PERSON })],
    'BadValue after the end': [watch(), destroyed(), unredirect('0011'), error('0011', { code: 2, name: 'Value', major: 142, minor: 3 })],
  };
  for (const [name, lines] of Object.entries(cases)) {
    const trace = parseXtrace(lines.join('\n'));
    assertSuperset(name, auditForeign(trace, { registered: reg, root: ROOT, routeAudit: true }), old.auditForeign(trace, { registered: reg, root: ROOT, routeAudit: true }));
  }
  // the seeded sweep: random interleavings of ends, creations, placements and requests, refused or not, on registered,
  // unregistered and our own ids, judged as a route audit and as the harness's own trace
  const OWN = 0x0040_0040;
  const ids = [MINE, PERSON, OWN, ROOT];
  const ops = [
    (s, w) => [focusOut(s, w)],
    (s, w) => [unredirect(s, w)],
    (s, w) => [configure(s, w)],
    (s, w) => [`005:<:${s}: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(w)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING") data='x'`],
    (s, w) => [`005:<:${s}:  8: Request(8): MapWindow window=${hex(w)}`],
    (s, w) => [`005:<:${s}: 40: Request(1): CreateWindow depth=0x00 window=${hex(OWN)} parent=${hex(w)} x=0 y=0 width=10 height=10 border-width=0`],
  ];
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const lines = ["005:>: Success, version is 11:0 vendor='The X.Org Foundation' release=12101011 resource-id=0x00400000 resource-mask=0x001fffff motion-buffer-size=256"];
    if (r() < 0.8) lines.push(watch());
    for (let i = 0, seq = 0x10; i < 12; i++, seq++) {
      const s = seq.toString(16).padStart(4, '0');
      const roll = r();
      if (roll < 0.2) lines.push(destroyed(pick(ids), s));
      else if (roll < 0.3) lines.push(`004:<:${s}:  8: Request(15): QueryTree window=${hex(MINE)}`, `004:>:${s}:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(ROOT)} children=${hex(pick([PERSON, OWN]))};`);
      else {
        const w = pick(ids);
        lines.push(...pick(ops)(s, w));
        const e = r();
        if (e < 0.4) lines.push(error(s, { bad: pick([w, w, PERSON]) }));
        else if (e < 0.5) lines.push(error(s, { code: 8, name: 'Match' }));
      }
    }
    const trace = parseXtrace(lines.join('\n'));
    for (const routeAudit of [true, false]) assertSuperset(`seed ${seed}${routeAudit ? '' : ' (own trace)'}`, auditForeign(trace, { registered: reg, root: ROOT, routeAudit }), old.auditForeign(trace, { registered: reg, root: ROOT, routeAudit }));
  }
});

test("superset: no request the old record rule took as the harness's reads foreign under the new rule", () => {
  const ops = [
    (ms, seq) => engineFocusOut(ms, seq),
    (ms, seq) => reqAt(ms, OURS, seq, 'ConfigureWindow', { window: MINE }),
    (ms, seq) => reqAt(ms, ENGINE, seq, 'MapWindow', { window: PERSON }),
    (ms, seq) => reqAt(ms, ENGINE, seq, 'ChangeProperty', { window: MINE, property: 0x1f0, type_name: 'STRING', length: 1 }),
  ];
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const lines = [];
    const found = [];
    for (let i = 0, ms = 1000, seq = 10; i < 14; i++, ms += 100 + Math.floor(r() * 400), seq++) {
      const roll = r();
      if (roll < 0.2) {
        lines.push(created(ms, pick([GEDIT, OTHER]), seq));
        if (r() < 0.6) found.push(ms + Math.floor(r() * 300));
      } else if (roll < 0.35) lines.push(gone(ms));
      else if (roll < 0.4) lines.push(at(ms, 'died', { client: pick([GEDIT, OTHER]) }));
      else lines.push(pick(ops)(ms, seq));
    }
    const text = [...START, ...lines, at(99999, 'end', {})].join('\n');
    for (const registered of [new Map([[MINE, found]]), new Map([[MINE, null]])]) assertSuperset(`record seed ${seed}`, auditRecord(text, { registered, root: ROOT }), old.auditRecord(text, { registered, root: ROOT }));
  }
});
