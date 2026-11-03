// An XTEST target in a route audit (#171 M4, task 53; the design session's ruling, sminos 338): it counts as the
// harness's when, at the event, it is a window in a live harness window's client range, or the window manager's frame
// whose client child is a live harness window, with parentage from the trace's own QueryTree replies or ReparentNotify,
// never read afterwards. Task 50's two device-gtk4 false reds are rebuilt here from the engine's requests on the
// foreground route, with the window ids its committed rows name (`m4/harness-windows/t4c-full/`): a key released on GTK
// 4's focus window, and a motion placed on Openbox's frame of the scene window. Display-free.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { auditForeign, foreignLine } from '../../scripts/linux-engine-diff/foreign.mjs';

const ROOT = 0x4d6;
// task 50: the device-gtk4 scene window, its client's focus window inside it, Openbox's frame of it; the owner's
// Chrome window and its frame
const SCENE = 0x03a00004;
const FOCUS = 0x03a00005;
const FRAME = 0x005a6d2f;
const PERSON = 0x00600002;
const PERSON_FRAME = 0x005a384f;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const registered = new Map([[SCENE, null]]);
const route = (lines, reg = registered) => auditForeign(parseXtrace(lines.join('\n')), { registered: reg, root: ROOT, routeAudit: true });
const plain = (lines) => auditForeign(parseXtrace(lines.join('\n')), { registered, root: ROOT });
const shown = (result) => result.foreign.map(foreignLine);

// the watcher's connection (005, `xprobe ancestry`): its setup, its selection on each window, the parent reads
const SETUP = "005:>: Success, version is 11:0 vendor='The X.Org Foundation' release=12101011 resource-id=0x01e00000 resource-mask=0x001fffff motion-buffer-size=256";
const select = (seq, w) => `005:<:${seq}: 16: Request(2): ChangeWindowAttributes window=${hex(w)} value-list={event-mask=StructureNotify}`;
const tree = (conn, seq, w, parent, children = []) => [
  `${conn}:<:${seq}:  8: Request(15): QueryTree window=${hex(w)}`,
  `${conn}:>:${seq}:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(parent)} children=${children.map(hex).join(',')};`,
];
/** The watcher's lines, as xprobe ancestry prints them through xtrace (task 53's experiment on a private Xvfb). */
const watcher = (children = [FOCUS]) => [SETUP, select('0001', SCENE), ...tree('005', '0002', SCENE, FRAME, children), select('0003', FRAME), ...tree('005', '0004', FRAME, ROOT, [SCENE])];
const destroyed = (w) => `005:>:0005: Event DestroyNotify(17) event=${hex(w)} window=${hex(w)}`;
const reparented = (w, parent) => `005:>:0005: Event ReparentNotify(21) event=${hex(w)} window=${hex(w)} parent=${hex(parent)} x=0 y=0 override-redirect=false(0x00)`;

// the engine's connection (007) on the foreground route (engine/windows.rs `activate`, way.rs `enter`)
const XTEST = ["007:<:0001: 20: Request(98): QueryExtension name='XTEST'", '007:>:0001:32: Reply to QueryExtension: present=true(0x01) major-opcode=132 first-event=0 first-error=0'];
const activate = (seq) => [
  `007:<:${seq}: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(ROOT)} event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=${hex(SCENE)} type=0x1d5("_NET_ACTIVE_WINDOW") data=0x01,0x00,0x00,0x00`,
  `007:<:${seq}: 20: Request(12): ConfigureWindow window=${hex(SCENE)} values={stack-mode=Above(0x00)}`,
  `007:<:${seq}: 12: Request(42): SetInputFocus revert-to=PointerRoot(0x01) focus=${hex(SCENE)} time=CurrentTime(0x00000000)`,
];
const focusRead = (seq, w) => [`007:<:${seq}:  4: Request(43): GetInputFocus `, `007:>:${seq}:32: Reply to GetInputFocus: revert-to=PointerRoot(0x01) focus=${hex(w)}`];
const pointerRead = (seq, child) => [
  `007:<:${seq}:  8: Request(38): QueryPointer window=${hex(ROOT)}`,
  `007:>:${seq}:32: Reply to QueryPointer: same-screen=true(0x01) root=${hex(ROOT)} child=${child ? hex(child) : 'None(0x00000000)'} root-x=640 root-y=400 win-x=640 win-y=400 mask=0`,
];
const fake = (seq, type, detail = 0x35) => `007:<:${seq}: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=0x0${type},0x${detail.toString(16).padStart(2, '0')},0x00,0x00;`;
// press_key x: pressed while the focus is the scene window the activation set, released after a read of the focus
// finds GTK 4's own focus window there
const keyCase = [...XTEST, ...activate('0002'), ...focusRead('0003', SCENE), fake('0004', 2), ...focusRead('0005', FOCUS), fake('0006', 3)];
// move: the path's last motion placed by the next sample's pointer read, over the scene window's frame
const moveCase = (child = FRAME) => [...XTEST, ...activate('0002'), ...focusRead('0003', SCENE), ...pointerRead('0004', child), fake('0005', 6, 0), fake('0006', 6, 0), ...activate('0007'), ...pointerRead('0008', child)];

test("task 50's two device-gtk4 false reds, rebuilt from the engine's requests, are what the audit without the rule flags", () => {
  assert.deepEqual(shown(plain(keyCase)), ['XTEST KeyRelease on 0x03a00005']);
  assert.deepEqual(shown(plain(moveCase())), ['XTEST MotionNotify on 0x005a6d2f']);
  // and what it flags with the rule but no line of the trace saying where they lie: nothing is read afterwards
  assert.deepEqual(shown(route(moveCase())), ['XTEST MotionNotify on 0x005a6d2f']);
});

test("a key on GTK 4's focus window, in the live harness window's client range, is the harness's", () => {
  // the watcher read the scene window before GTK 4 made its focus window: no reply places it, only its client range
  const result = route([...watcher([]), ...keyCase]);
  assert.equal(result.clean, true, shown(result).join());
  // the watcher's reply placing the focus window inside the scene window clears it too
  assert.equal(route([...watcher(), ...keyCase]).clean, true);
});

test("a motion on the window manager's frame of a live harness window is the harness's, by the trace's own parentage", () => {
  assert.equal(route([...watcher(), ...moveCase()]).clean, true);
  // a ReparentNotify the watcher received: the window manager's new frame holds it, the old one no more
  const NEW_FRAME = 0x005a7000;
  assert.equal(route([...watcher(), reparented(SCENE, NEW_FRAME), ...moveCase(NEW_FRAME)]).clean, true);
  assert.deepEqual(shown(route([...watcher(), reparented(SCENE, NEW_FRAME), ...moveCase(FRAME)])), ['XTEST MotionNotify on 0x005a6d2f']);
  // one another client sent (SendEvent) reports only what that client wrote: the owner's frame holds nothing of ours
  const forged = reparented(SCENE, PERSON_FRAME).replace(' Event ', ' Event (generated) ');
  assert.deepEqual(shown(route([...watcher(), forged, ...moveCase(PERSON_FRAME)])), ['XTEST MotionNotify on 0x005a384f']);
});

test("negative controls: another client's window, the frame of a foreign window, a harness window already destroyed", () => {
  // another client's window has the focus: the owner's Chrome
  assert.deepEqual(shown(route([...watcher(), ...XTEST, ...activate('0002'), fake('0003', 2), ...focusRead('0004', PERSON), fake('0005', 3)])), ['XTEST KeyRelease on 0x00600002']);
  // the frame of a foreign window, which the engine's own read placed the owner's window in
  assert.deepEqual(shown(route([...watcher(), ...tree('007', '0009', PERSON, PERSON_FRAME), ...moveCase(PERSON_FRAME)])), ['XTEST MotionNotify on 0x005a384f']);
  // the scene window ended after its activation and before the input: its focus window and its frame are no longer
  // the harness's
  const key = [...XTEST, ...activate('0002'), ...focusRead('0003', SCENE), fake('0004', 2), destroyed(SCENE), ...focusRead('0005', FOCUS), fake('0006', 3)];
  assert.deepEqual(shown(route([...watcher([]), ...key])), ['XTEST KeyRelease on 0x03a00005']);
  assert.deepEqual(shown(route([...watcher(), ...key])), ['XTEST KeyRelease on 0x03a00005'], 'inside it by a reply, which its end ends too');
  const move = [...XTEST, ...activate('0002'), destroyed(SCENE), ...pointerRead('0004', FRAME), fake('0005', 6, 0), ...pointerRead('0006', FRAME)];
  assert.deepEqual(shown(route([...watcher(), ...move])), ['XTEST MotionNotify on 0x005a6d2f']);
});

test('the client range counts only where the trace can see the harness window end, and only for XTEST in a route audit', () => {
  const LATER = 0x03a00007;
  const keyOn = (w) => [...XTEST, ...activate('0002'), fake('0003', 2), ...focusRead('0004', w), fake('0005', 3)];
  assert.equal(route([...watcher(), ...keyOn(LATER)]).clean, true, 'a window of the scene client the trace never placed');
  // the scene window not watched: its end would not reach the trace, so its range is not taken as alive
  assert.deepEqual(shown(route([SETUP, ...keyOn(LATER)])), ['XTEST KeyRelease on 0x03a00007']);
  // a selection the server refused watches nothing
  const refused = [SETUP, select('0001', SCENE), '005:>:0001:Error 3=Window: major=2, minor=0, bad=0x03a00004, seq=0001'];
  assert.deepEqual(shown(route([...refused, ...keyOn(LATER)])), ['XTEST KeyRelease on 0x03a00007']);
  // no mask in the trace: no range at all
  assert.deepEqual(shown(route([select('0001', SCENE), ...keyOn(LATER)])), ['XTEST KeyRelease on 0x03a00007']);
  // a window not registered by the harness lends its range to nothing
  assert.deepEqual(shown(route([...watcher(), ...XTEST, ...focusRead('0002', LATER), fake('0003', 3)], new Map())), ['XTEST KeyRelease on 0x03a00007']);
  // the harness's own trace is not a route audit
  assert.deepEqual(shown(plain([...watcher(), ...keyOn(LATER)])), ['XTEST KeyRelease on 0x03a00007']);
  // a change other than XTEST input on a window of the range stays foreign
  assert.deepEqual(shown(route([...watcher(), `007:<:0009: 16: Request(12): ConfigureWindow window=${hex(LATER)} values={x=1 y=1}`])), ['ConfigureWindow on 0x03a00007']);
  // the desktop itself is never in a range
  assert.deepEqual(shown(route([...watcher(), ...XTEST, ...pointerRead('0002', null), fake('0003', 4, 1)])), [`XTEST ButtonPress on ${hex(ROOT)}`]);
});
