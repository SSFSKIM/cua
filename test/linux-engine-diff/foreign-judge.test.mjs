// The harness's invariant, judged in trace order (#171 M4, T4b's audit round): no request of the harness's or an
// engine's connections changes a window the harness did not open. Each reviewer's probe of the first build is a
// negative control here, on xtrace's lines as the VM prints them (`auditForeign`) and on the whole-run RECORD's lines
// as `xprobe record-run` prints them (`auditRecord`). Display-free.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { auditForeign, auditRecord } from '../../scripts/linux-engine-diff/foreign.mjs';

const ROOT = 0x1ff;
const MINE = 0x40000c;
const PERSON = 0x600002;
const FRAME = 0x80001b;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const registered = new Set([MINE]);
const xaudit = (lines) => auditForeign(parseXtrace(lines.join('\n')), { registered, root: ROOT });
const windowsOf = (result) => result.foreign.map((f) => f.window);

// ---------------------------------------------------------------------------------------------------------------------
// xtrace (the harness's own trace and the engines' route audits)

test('a property write on a foreign window fails; on the root, or answering its own SelectionRequest, it does not', () => {
  const write = (w, atom = '0x1f0("CUA_SEL")', seq = '0004') => `000:<:${seq}: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(w)} property=${atom} type=0x1f1("UTF8_STRING") data='x'`;
  assert.deepEqual(windowsOf(xaudit([write(PERSON)])), [PERSON], 'a write the person never asked for');
  assert.equal(xaudit([write(ROOT)]).clean, true, 'a root write stays out');
  assert.equal(xaudit([write(MINE)]).clean, true);
  const request = `000:>:0003: Event SelectionRequest(30) time=CurrentTime(0x00000000) owner=${hex(MINE)} requestor=${hex(PERSON)} selection=0xe6("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`;
  const notify = `000:<:0005: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(PERSON)} event-mask=0 SelectionNotify(31) time=CurrentTime(0x00000000) requestor=${hex(PERSON)} selection=0xe6("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`;
  assert.equal(xaudit([request, write(PERSON), notify]).clean, true, 'the property its own SelectionRequest named');
  assert.deepEqual(windowsOf(xaudit([request, write(PERSON, '0x1f2("OTHER")'), notify])), [PERSON], 'another property of the requestor');
  assert.deepEqual(windowsOf(xaudit([request, write(PERSON), notify, write(PERSON, undefined, '0006')])), [PERSON], 'a write after the request was served');
  assert.deepEqual(windowsOf(xaudit([notify])), [PERSON], 'a SelectionNotify no request asked for');
  // INCR: the request stays served until the transfer's zero-length end
  const incr = `000:<:0004: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(PERSON)} property=0x1f0("CUA_SEL") type=0xed("INCR") data=0x00,0x10,0x00,0x00`;
  const chunk = (seq) => write(PERSON, undefined, seq);
  const end = `000:<:0009: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(PERSON)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING") data=''`;
  assert.equal(xaudit([request, incr, notify, chunk('0006'), chunk('0007'), end]).clean, true);
  assert.deepEqual(windowsOf(xaudit([request, incr, notify, end, chunk('000a')])), [PERSON], 'a chunk after the transfer ended');
});

test('a property deleted on a foreign window fails, by DeleteProperty or by a deleting GetProperty', () => {
  assert.deepEqual(windowsOf(xaudit([`000:<:0001: 12: Request(19): DeleteProperty window=${hex(PERSON)} property=0x27("WM_NAME")`])), [PERSON]);
  assert.deepEqual(windowsOf(xaudit([`000:<:0001: 24: Request(20): GetProperty delete=true(0x01) window=${hex(PERSON)} property=0x27("WM_NAME") type=0x0(AnyPropertyType) long-offset=0x00000000 long-length=0x00000400`])), [PERSON]);
  assert.equal(xaudit([`000:<:0001: 24: Request(20): GetProperty delete=false(0x00) window=${hex(PERSON)} property=0x27("WM_NAME") type=0x0(AnyPropertyType) long-offset=0x00000000 long-length=0x00000400`]).clean, true, 'a read');
  assert.equal(xaudit([`000:<:0001: 12: Request(19): DeleteProperty window=${hex(ROOT)} property=0x27("WM_NAME")`]).clean, true, 'the root');
});

test("a change of a foreign window's attributes fails, an override-redirect change included; an event selection alone does not", () => {
  assert.deepEqual(windowsOf(xaudit([`003:<:0012: 16: Request(2): ChangeWindowAttributes window=${hex(PERSON)} value-list={override-redirect=true(0x01)}`])), [PERSON]);
  assert.deepEqual(windowsOf(xaudit([`003:<:0012: 16: Request(2): ChangeWindowAttributes window=${hex(PERSON)} value-list={event-mask=PropertyChange do-not-propagate-mask=KeyPress}`])), [PERSON]);
  assert.equal(xaudit([`003:<:0012: 16: Request(2): ChangeWindowAttributes window=${hex(PERSON)} value-list={event-mask=KeyPress,PropertyChange}`]).clean, true);
  assert.equal(xaudit([`003:<:0012: 16: Request(2): ChangeWindowAttributes window=${hex(ROOT)} value-list={event-mask=SubstructureNotify}`]).clean, true);
  assert.deepEqual(windowsOf(xaudit([`003:<:0012: 16: Request(2): ChangeWindowAttributes window=${hex(ROOT)} value-list={cursor=0x00400001}`])), [ROOT], "the person's desktop");
});

test('a Composite redirect of a foreign window fails; of a harness window it does not', () => {
  assert.deepEqual(windowsOf(xaudit([`009:<:0005: 12: Composite-Request(142,1): RedirectWindow window=${hex(PERSON)} update=Automatic(0x00)`])), [PERSON]);
  assert.deepEqual(windowsOf(xaudit([`009:<:0005: 12: Composite-Request(142,2): RedirectSubwindows window=${hex(ROOT)} update=Automatic(0x00)`])), [ROOT]);
  assert.equal(xaudit([`009:<:0005: 12: Composite-Request(142,1): RedirectWindow window=${hex(MINE)} update=Automatic(0x00)`, `009:<:0006: 12: Composite-Request(142,3): UnredirectWindow window=${hex(MINE)} update=Automatic(0x00)`]).clean, true);
});

const XTEST_QUERY = [
  "007:<:0001: 20: Request(98): QueryExtension name='XTEST'",
  '007:>:0001:32: Reply to QueryExtension: present=true(0x01) major-opcode=132 first-event=0 first-error=0',
];
const fake = (seq, type, detail = 0x26) => `007:<:${seq}: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=0x0${type},0x${detail.toString(16).padStart(2, '0')},0x00,0x00;`;
const focusReply = (seq, w) => [`007:<:${seq}:  4: Request(43): GetInputFocus `, `007:>:${seq}:32: Reply to GetInputFocus: revert-to=Parent(0x02) focus=${hex(w)}`];
const pointerReply = (seq, child) => [
  `007:<:${seq}:  8: Request(38): QueryPointer window=${hex(ROOT)}`,
  `007:>:${seq}:32: Reply to QueryPointer: same-screen=true(0x01) root=${hex(ROOT)} child=${child ? hex(child) : 'None(0x00000000)'} root-x=640 root-y=400 win-x=640 win-y=400 mask=0`,
];

test('XTEST is judged by where it lands: a key by the input focus, a button by the window under the pointer, a motion by where it ends', () => {
  assert.deepEqual(windowsOf(xaudit([...XTEST_QUERY, ...focusReply('0002', PERSON), fake('0003', 2)])), [PERSON], 'a key while the focus is foreign');
  assert.equal(xaudit([...XTEST_QUERY, ...focusReply('0002', MINE), fake('0003', 2), fake('0004', 3)]).clean, true, 'keys to the harness window');
  assert.deepEqual(windowsOf(xaudit([...XTEST_QUERY, ...pointerReply('0002', PERSON), fake('0003', 4, 1)])), [PERSON], 'a button over a foreign window');
  assert.deepEqual(windowsOf(xaudit([...XTEST_QUERY, ...pointerReply('0002', null), fake('0003', 4, 1)])), [ROOT], "a button on the person's desktop");
  assert.deepEqual(windowsOf(xaudit([...XTEST_QUERY, ...pointerReply('0002', MINE), fake('0003', 6, 0), ...pointerReply('0004', PERSON)])), [PERSON], 'a motion that ends over a foreign window');
  assert.equal(xaudit([...XTEST_QUERY, ...pointerReply('0002', PERSON), fake('0003', 6, 0), ...pointerReply('0004', MINE), fake('0005', 4, 1)]).clean, true, 'a motion into the harness window, then its button');
  // a warp moves the pointer as a motion does (xdotool mousemove warps): judged by where it ends too
  const warp = `007:<:0006: 24: Request(41): WarpPointer src-window=None(0x00000000) dst-window=${hex(ROOT)} src-x=0 src-y=0 src-width=0 src-height=0 dst-x=5 dst-y=5`;
  assert.deepEqual(windowsOf(xaudit([warp, ...pointerReply('0007', PERSON)])), [PERSON], 'a warp onto a foreign window');
  assert.equal(xaudit([warp, ...pointerReply('0007', MINE)]).clean, true);
  // where the trace cannot place it, it is counted, not passed silently
  const unplaced = xaudit([...XTEST_QUERY, fake('0002', 2), ...pointerReply('0003', MINE), fake('0004', 6, 0)]);
  assert.equal(unplaced.clean, true);
  assert.equal(unplaced.unplaced, 2);
});

test('a foreign ConfigureWindow followed by a rejected CreateWindow of that id fails: a creation counts only once the server accepts it', () => {
  const X = 0x400020;
  const result = xaudit([
    `002:<:0010: 16: Request(12): ConfigureWindow window=${hex(X)} values={x=10 y=10}`,
    `002:<:0011: 40: Request(1): CreateWindow depth=0x00 window=${hex(X)} parent=${hex(ROOT)} x=0 y=0 width=10 height=10 border-width=0`,
    '002:>:0011:Error 14=IDChoice: major=1, minor=0, bad=0x00400020, seq=0011',
    `002:<:0012: 16: Request(12): ConfigureWindow window=${hex(X)} values={x=20 y=20}`,
  ]);
  assert.deepEqual(windowsOf(result), [X, X], 'before the creation, and after its refusal');
  // the same creation accepted: its own changes pass, after it
  assert.equal(xaudit([`002:<:0011: 40: Request(1): CreateWindow depth=0x00 window=${hex(X)} parent=${hex(ROOT)} x=0 y=0 width=10 height=10 border-width=0`, `002:<:0012: 16: Request(12): ConfigureWindow window=${hex(X)} values={x=20 y=20}`]).clean, true);
});

test("a window created under a foreign parent is a change of that parent, and is not the harness's", () => {
  const C = 0x400030;
  const result = xaudit([
    `002:<:0011: 40: Request(1): CreateWindow depth=0x00 window=${hex(C)} parent=${hex(PERSON)} x=0 y=0 width=10 height=10 border-width=0`,
    `002:<:0012:  8: Request(8): MapWindow window=${hex(C)}`,
  ]);
  assert.deepEqual(windowsOf(result), [PERSON, C]);
  assert.equal(xaudit([`002:<:0011: 40: Request(1): CreateWindow depth=0x00 window=${hex(C)} parent=${hex(MINE)} x=0 y=0 width=10 height=10 border-width=0`, `002:<:0012:  8: Request(8): MapWindow window=${hex(C)}`]).clean, true, 'inside a harness window');
});

test('a foreign window reparented into a harness window stays foreign', () => {
  const result = xaudit([
    `002:<:0011: 16: Request(7): ReparentWindow window=${hex(PERSON)} parent=${hex(MINE)} x=0 y=0`,
    `002:<:0012: 16: Request(12): ConfigureWindow window=${hex(PERSON)} values={x=1 y=1}`,
    // a read now finds it inside the harness window: still the person's
    `002:<:0013:  8: Request(15): QueryTree window=${hex(MINE)}`,
    `002:>:0013:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(FRAME)} children=${hex(PERSON)};`,
    `002:<:0014:  8: Request(10): UnmapWindow window=${hex(PERSON)}`,
  ]);
  assert.deepEqual(windowsOf(result), [PERSON, PERSON, PERSON]);
});

test("a closed window's id is the harness's no more: a reused id is foreign again", () => {
  const X = 0x400040;
  const create = `002:<:0011: 40: Request(1): CreateWindow depth=0x00 window=${hex(X)} parent=${hex(ROOT)} x=0 y=0 width=10 height=10 border-width=0`;
  const configure = (seq) => `004:<:${seq}: 16: Request(12): ConfigureWindow window=${hex(X)} values={x=1 y=1}`;
  assert.deepEqual(windowsOf(xaudit([create, `002:<:0012:  8: Request(4): DestroyWindow window=${hex(X)}`, configure('0020')])), [X], 'destroyed by its creator');
  assert.deepEqual(windowsOf(xaudit([create, `002:>:0013: Event DestroyNotify(17) event=${hex(X)} window=${hex(X)}`, configure('0020')])), [X], 'its DestroyNotify seen');
  assert.deepEqual(windowsOf(xaudit([`004:>:0001: Event DestroyNotify(17) event=${hex(MINE)} window=${hex(MINE)}`, `004:<:0002: 16: Request(12): ConfigureWindow window=${hex(MINE)} values={x=1 y=1}`])), [MINE], 'a registered window, once closed');
  // the creating connection gone and its resource-id base handed to another client: its windows ended with it
  assert.deepEqual(
    windowsOf(xaudit([create, "005:>: Success, version is 11:0 vendor='The X.Org Foundation' release=12101011 resource-id=0x00400000 resource-mask=0x001fffff motion-buffer-size=256", configure('0020')])),
    [X],
  );
});

test("parentage comes from the trace at request time: a child an engine's reply found inside a harness window is the harness's", () => {
  const CHILD = 0x600123;
  const send = `013:<:0005: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(CHILD)} event-mask=0 KeyPress(2) keycode=0x26`;
  assert.deepEqual(windowsOf(xaudit([send])), [CHILD], 'with nothing in the trace saying where it lies');
  const translated = [
    `013:<:0004: 16: Request(40): TranslateCoordinates src-window=${hex(MINE)} dst-window=${hex(MINE)} src-x=5 src-y=5`,
    `013:>:0004:32: Reply to TranslateCoordinates: same-screen=true(0x01) child=${hex(CHILD)} dst-x=5 dst-y=5`,
  ];
  assert.equal(xaudit([...translated, send]).clean, true);
  // a window manager frame holding a harness window is the harness window's container
  const tree = [`013:<:0006:  8: Request(15): QueryTree window=${hex(MINE)}`, `013:>:0006:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(FRAME)} children=;`];
  assert.equal(xaudit([...tree, `013:<:0007: 16: Request(12): ConfigureWindow window=${hex(FRAME)} values={stack-mode=Above(0x00)}`]).clean, true);
});

test("a whole run's trace is read from its file line by line, keeping only what the judge reads, to the same verdict", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { parseXtraceFile } = await import('../../scripts/linux-engine-diff/audit.mjs');
  const { foreignKeep } = await import('../../scripts/linux-engine-diff/foreign.mjs');
  const lines = [
    "001:<:0001: 20: Request(16): InternAtom only-if-exists=false(0x00) name='_NET_WM_NAME'",
    `001:<:0002: 12: Request(101): GetKeyboardMapping first-keycode=0x08 count=0xf8`,
    `001:<:0003:  8: Request(15): QueryTree window=${hex(MINE)}`,
    `001:>:0003:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(ROOT)} children=0x00600123;`,
    `001:<:0004: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00600123 event-mask=0 KeyPress(2) keycode=0x26`,
    `001:<:0005: 16: Request(12): ConfigureWindow window=${hex(PERSON)} values={x=1 y=1}`,
  ];
  const dir = mkdtempSync(join(tmpdir(), 'cua171-trace-file-'));
  try {
    const file = join(dir, 'x11.log');
    writeFileSync(file, `${lines.join('\n')}\n`);
    const fromFile = await parseXtraceFile(file, { keep: foreignKeep });
    assert.deepEqual(fromFile.requests.map((r) => r.major), [15, 25, 12], 'the reads and the changes the judge reads; nothing else');
    const verdict = auditForeign(fromFile, { registered, root: ROOT });
    assert.deepEqual(verdict, xaudit(lines));
    assert.deepEqual(windowsOf(verdict), [PERSON]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The whole-run RECORD (every client's requests, server-side)

const OURS = 0x400000;
const ENGINE = 0x1600000;
const CHROME = 0x600000;
const WM = 0x200000;
const rec = (kind, fields) => JSON.stringify({ kind, ms: 1000, ...fields });
const client = (c, ours, exe) => rec('client', { client: c, pid: 1, exe, ours });
const req = (c, seq, op, fields) => rec('req', { client: c, seq, t: seq, op, ...fields });
const START = [rec('ready', { root: ROOT, xtest: 132, composite: 142 }), client(OURS, true, 'xtrace'), client(ENGINE, true, 'cua-engine'), client(CHROME, false, 'chrome'), client(WM, false, 'openbox')];
const SCENE = 0x600050;
const END = rec('end', {});
const raudit = (lines, reg = new Map([[SCENE, 1000]])) => auditRecord([...lines, END].join('\n'), { registered: reg, root: ROOT });

test('the whole-run record judges every request of the harness and the engines, sampled or not', () => {
  // Chrome opens the harness's page window, the harness registers it; an engine sends it keys, and later, on a request
  // no audit pass sampled, a key to the person's window
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    req(CHROME, 11, 'CreateWindow', { window: PERSON, parent: ROOT }),
    req(ENGINE, 40, 'SendEvent', { destination: SCENE, event: 'KeyPress' }),
    req(ENGINE, 41, 'SendEvent', { destination: PERSON, event: 'KeyPress' }),
  ];
  const result = raudit(lines);
  assert.equal(result.clean, false);
  assert.deepEqual(windowsOf(result), [PERSON]);
  assert.equal(result.foreign[0].what, 'SendEvent KeyPress');
  assert.match(result.foreign[0].client, /cua-engine/);
  assert.equal(raudit(lines.slice(0, -1)).clean, true);
});

test("the person's own clients' requests are not judged, and a client the record could not attribute is counted", () => {
  const result = raudit([...START, req(CHROME, 11, 'ConfigureWindow', { window: PERSON }), req(0x1800000, 3, 'ConfigureWindow', { window: PERSON })]);
  assert.equal(result.clean, true);
  assert.equal(result.unattributed.mutating, 1);
});

test('the record: a foreign window another client reparents into a harness window stays foreign', () => {
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    req(CHROME, 11, 'CreateWindow', { window: PERSON, parent: ROOT }),
    req(CHROME, 12, 'ReparentWindow', { window: PERSON, parent: SCENE }),
    req(ENGINE, 40, 'SendEvent', { destination: PERSON, event: 'KeyPress' }),
  ];
  assert.deepEqual(windowsOf(raudit(lines)), [PERSON]);
});

test("the record: a window created inside a harness window is the harness's; a frame holds its harness window while it does", () => {
  const CHILD = 0x600060;
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    req(CHROME, 11, 'CreateWindow', { window: CHILD, parent: SCENE }),
    req(WM, 5, 'CreateWindow', { window: FRAME, parent: ROOT }),
    req(WM, 6, 'ReparentWindow', { window: SCENE, parent: FRAME }),
    req(ENGINE, 40, 'SendEvent', { destination: CHILD, event: 'KeyPress' }),
    req(OURS, 41, 'ConfigureWindow', { window: FRAME }),
  ];
  assert.equal(raudit(lines).clean, true, JSON.stringify(raudit(lines).foreign));
  // the frame let go of the harness window: no longer the harness's
  const after = [...lines, req(WM, 7, 'ReparentWindow', { window: SCENE, parent: ROOT }), req(OURS, 42, 'ConfigureWindow', { window: FRAME })];
  assert.deepEqual(windowsOf(raudit(after)), [FRAME]);
});

test("the record: a frame that holds the harness window through its own inner window is the harness window's; its decorations are not", () => {
  // Openbox puts the client inside a window of its frame's, not in the frame itself
  const PLATE = 0x80001c;
  const TITLE = 0x80001d;
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    req(WM, 5, 'CreateWindow', { window: FRAME, parent: ROOT }),
    req(WM, 6, 'CreateWindow', { window: PLATE, parent: FRAME }),
    req(WM, 7, 'ReparentWindow', { window: SCENE, parent: PLATE }),
    req(WM, 8, 'CreateWindow', { window: TITLE, parent: FRAME }),
    req(OURS, 41, 'ConfigureWindow', { window: FRAME }),
    req(ENGINE, 42, 'FakeInput', { type: 'ButtonPress', detail: 1, focus: SCENE, pointer: FRAME }),
    req(OURS, 43, 'ConfigureWindow', { window: TITLE }),
  ];
  assert.deepEqual(windowsOf(raudit(lines)), [TITLE]);
});

test("the record: a popup the client of a harness window opens during the run (a drag image) is that window's; not another client's, nor a managed window", () => {
  const DRAG = 0x707acb;
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    // Chrome's drag image, override-redirect on the root, under the pointer for the whole drop
    req(CHROME, 30, 'CreateWindow', { window: DRAG, parent: ROOT, or: true }),
    req(ENGINE, 40, 'FakeInput', { type: 'MotionNotify', detail: 0, focus: SCENE, pointer: DRAG }),
    req(ENGINE, 41, 'FakeInput', { type: 'ButtonRelease', detail: 1, focus: SCENE, pointer: DRAG }),
  ];
  assert.equal(raudit(lines).clean, true, JSON.stringify(raudit(lines).foreign));
  // a new managed window of the same client (a browser window the person opens) is not
  const managed = [...START, req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }), req(CHROME, 30, 'CreateWindow', { window: DRAG, parent: ROOT }), req(ENGINE, 40, 'FakeInput', { type: 'MotionNotify', detail: 0, focus: SCENE, pointer: DRAG })];
  assert.deepEqual(windowsOf(raudit(managed)), [DRAG]);
  // a popup of a client with no harness window of its own is not, nor one opened after its harness window closed
  const other = [...START, req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }), req(WM, 30, 'CreateWindow', { window: 0x200099, parent: ROOT, or: true }), req(ENGINE, 40, 'FakeInput', { type: 'MotionNotify', detail: 0, focus: SCENE, pointer: 0x200099 })];
  assert.deepEqual(windowsOf(raudit(other)), [0x200099]);
  const after = [...START, req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }), rec('destroyed', { window: SCENE }), req(CHROME, 30, 'CreateWindow', { window: DRAG, parent: ROOT, or: true }), req(ENGINE, 40, 'SendEvent', { destination: DRAG, event: 'KeyPress' })];
  assert.deepEqual(windowsOf(raudit(after)), [DRAG]);
  // override-redirect set after the creation counts the same
  const later = [...START, req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }), req(CHROME, 30, 'CreateWindow', { window: DRAG, parent: ROOT }), req(CHROME, 31, 'ChangeWindowAttributes', { window: DRAG, mask: 0x200, or: true }), req(ENGINE, 40, 'SendEvent', { destination: DRAG, event: 'KeyPress' })];
  assert.equal(raudit(later).clean, true);
});

test('the record: a registered window existing before the record began is never the harness’s', () => {
  // the run never saw it created: a window that was already there (a pre-existing exact-title match)
  assert.deepEqual(windowsOf(raudit([...START, req(OURS, 41, 'ConfigureWindow', { window: SCENE })])), [SCENE]);
});

test("the record: a registered window's id, reused by another client after it closed, is foreign again", () => {
  const lines = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    rec('destroyed', { window: SCENE }),
    JSON.stringify({ kind: 'req', ms: 5000, client: WM, seq: 9, t: 9, op: 'CreateWindow', window: SCENE, parent: ROOT }),
    req(OURS, 41, 'ConfigureWindow', { window: SCENE }),
  ];
  assert.deepEqual(windowsOf(raudit(lines)), [SCENE]);
  // the harness found the id again for a window it reopened (the backstop): that life is the harness's
  assert.equal(raudit(lines, new Map([[SCENE, [1000, 5000]]])).clean, true);
  // the client that created a window gone: its windows went with it
  const died = [...START, req(ENGINE, 3, 'CreateWindow', { window: 0x1600001, parent: ROOT }), rec('died', { client: ENGINE }), req(OURS, 41, 'MapWindow', { window: 0x1600001 })];
  assert.deepEqual(windowsOf(raudit(died)), [0x1600001]);
});

test('the record: a rejected creation is not a window of the harness, and XTEST is judged where it landed', () => {
  const X = 0x1600005;
  const rejected = [...START, req(ENGINE, 7, 'CreateWindow', { window: X, parent: ROOT }), rec('error', { client: ENGINE, seq: 7, major: 1, code: 14 }), req(ENGINE, 8, 'MapWindow', { window: X })];
  assert.deepEqual(windowsOf(raudit(rejected)), [X]);
  const xtest = [
    ...START,
    req(CHROME, 10, 'CreateWindow', { window: SCENE, parent: ROOT }),
    req(ENGINE, 20, 'FakeInput', { type: 'KeyPress', detail: 38, focus: SCENE, pointer: SCENE }),
    req(ENGINE, 21, 'FakeInput', { type: 'KeyPress', detail: 38, focus: PERSON, pointer: SCENE }),
    req(ENGINE, 22, 'FakeInput', { type: 'ButtonPress', detail: 1, focus: SCENE, pointer: PERSON }),
    req(ENGINE, 23, 'FakeInput', { type: 'KeyPress', detail: 38, focus: 1, pointer: SCENE }),
    req(ENGINE, 24, 'FakeInput', { type: 'KeyPress', detail: 38, focus: 1, pointer: PERSON }),
    req(ENGINE, 25, 'FakeInput', { type: 'KeyPress', detail: 38, focus: null, pointer: null }),
    req(OURS, 26, 'WarpPointer', { dst: ROOT, pointer: PERSON }),
    req(OURS, 27, 'WarpPointer', { dst: ROOT, pointer: SCENE }),
  ];
  const result = raudit(xtest);
  assert.deepEqual(windowsOf(result), [PERSON, PERSON, PERSON, PERSON], 'the focus foreign; the button over the person; PointerRoot over the person; a warp onto the person');
  assert.equal(result.unplaced, 1);
});

test('the record: a record that never started, failed or was cut short is not clean', () => {
  assert.equal(raudit([]).clean, false);
  assert.equal(raudit([]).traced, false);
  const failed = raudit([...START, rec('failed', { error: 'the record collector failed' })]);
  assert.equal(failed.clean, false);
  assert.match(failed.error, /collector failed/);
  const cut = auditRecord(START.join('\n'), { registered: new Map(), root: ROOT });
  assert.equal(cut.clean, false);
  assert.match(cut.error, /did not end/);
  assert.equal(raudit(START).clean, true);
});
