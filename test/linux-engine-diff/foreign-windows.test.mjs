// The harness never changes a window it did not open (#171 M4, the design session, 2026-11-02): no restore of the
// window found active at the start, a holder window when that window is foreign, and an X request audit that fails any
// mutating request naming a window that is not the harness's. Display-free: the traces are xtrace's lines as the VM
// prints them, and `xdotool`, `xprop`, `xwininfo` and `xterm` on the PATH are scripts that log what they were asked.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { auditForeign } from '../../scripts/linux-engine-diff/foreign.mjs';
import { harnessPair, openScene } from '../../scripts/linux-engine-diff/run.mjs';
import { desktopLine } from '../../scripts/linux-engine-diff/report.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { runOutcome } from '../../scripts/linux-engine-diff/stats.mjs';

const ROOT = 0x1ff;
const MINE = 0x40000c;
const PERSON = 0x600002;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const audit = (lines, registered = new Set([MINE])) => auditForeign(parseXtrace(lines.join('\n')), { registered, root: ROOT });

// What xdotool windowactivate sends (the probe on a private display): the desktop switch to the root, then the activation.
const activate = (id, seq = '001f') => [
  `000:<:001c: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(ROOT)} event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=${hex(ROOT)} type=0xfb("_NET_CURRENT_DESKTOP") data=0x00,0x00,0x00,0x00`,
  `000:<:${seq}: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(ROOT)} event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=${hex(id)} type=0xfd("_NET_ACTIVE_WINDOW") data=0x02,0x00,0x00,0x00`,
];
const HARNESS_ONLY = [
  ...activate(MINE),
  `001:<:0012: 16: Request(12): ConfigureWindow window=${hex(MINE)} values={stack-mode=Above(0x00)}`,
  `002:<:0012: 20: Request(12): ConfigureWindow window=${hex(MINE)} values={width=300 height=200}`,
  `004:<:0012: 12: Request(42): SetInputFocus revert-to=Parent(0x02) focus=${hex(MINE)} time=CurrentTime(0x00000000)`,
  `006:<:0012:  8: Request(10): UnmapWindow window=${hex(MINE)}`,
  `007:<:0012:  8: Request(8): MapWindow window=${hex(MINE)}`,
  `008:<:0002: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(ROOT)} event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=${hex(MINE)} type=0xec("WM_CHANGE_STATE") data=0x03,0x00`,
  `011:<:0003: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(MINE)} event-mask=0 ClientMessage(33) format=0x20 window=${hex(MINE)} type=0xea("WM_PROTOCOLS") data=0xed,0x00`,
];

test("the harness's own requests pass: its window activated, raised, resized, focused, remapped, minimized and closed", () => {
  const result = audit(HARNESS_ONLY);
  assert.equal(result.clean, true);
  assert.deepEqual(result.foreign, []);
  assert.equal(result.mutating, HARNESS_ONLY.length);
});

test('the negative control: a build that restores the window found active at the start fails the audit', () => {
  // the restore the harness did until M4 (scenes.mjs closeEverything: xdotool windowactivate <previous active>)
  const result = audit([...HARNESS_ONLY, ...activate(PERSON, '0020')]);
  assert.equal(result.clean, false);
  assert.equal(result.foreign.length, 1);
  assert.equal(result.foreign[0].window, PERSON);
  assert.equal(result.foreign[0].what, '_NET_ACTIVE_WINDOW ClientMessage');
});

test('every kind of mutating request naming a foreign window fails', () => {
  const cases = {
    ConfigureWindow: `000:<:0001: 16: Request(12): ConfigureWindow window=${hex(PERSON)} values={x=10 y=10}`,
    SetInputFocus: `000:<:0001: 12: Request(42): SetInputFocus revert-to=Parent(0x02) focus=${hex(PERSON)} time=CurrentTime(0x00000000)`,
    'SetInputFocus None': '000:<:0001: 12: Request(42): SetInputFocus revert-to=None(0x00) focus=None(0x00000000) time=CurrentTime(0x00000000)',
    'SetInputFocus PointerRoot': '000:<:0001: 12: Request(42): SetInputFocus revert-to=None(0x00) focus=PointerRoot(0x00000001) time=CurrentTime(0x00000000)',
    'SetInputFocus root': `000:<:0001: 12: Request(42): SetInputFocus revert-to=None(0x00) focus=${hex(ROOT)} time=CurrentTime(0x00000000)`,
    MapWindow: `000:<:0001:  8: Request(8): MapWindow window=${hex(PERSON)}`,
    UnmapWindow: `000:<:0001:  8: Request(10): UnmapWindow window=${hex(PERSON)}`,
    DestroyWindow: `000:<:0001:  8: Request(4): DestroyWindow window=${hex(PERSON)}`,
    ReparentWindow: `000:<:0001: 16: Request(7): ReparentWindow window=${hex(PERSON)} parent=${hex(MINE)} x=0 y=0`,
    CirculateWindow: `000:<:0001:  8: Request(13): CirculateWindow direction=RaiseLowest(0x00) window=${hex(PERSON)}`,
    KillClient: `000:<:0001:  8: Request(113): KillClient resource=${hex(PERSON)}`,
    WarpPointer: `000:<:0001: 24: Request(41): WarpPointer src-window=None(0x00000000) dst-window=${hex(PERSON)} src-x=0 src-y=0 src-width=0 src-height=0 dst-x=5 dst-y=5`,
    'SendEvent KeyPress': `000:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(PERSON)} event-mask=0 KeyPress(2) keycode=0x26 time=0x00000000 root=${hex(ROOT)} event=${hex(PERSON)}`,
    'SendEvent to the focus': `000:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=InputFocus(0x00000001) event-mask=0 KeyPress(2) keycode=0x26`,
    'WM_DELETE_WINDOW': `000:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(PERSON)} event-mask=0 ClientMessage(33) format=0x20 window=${hex(PERSON)} type=0xea("WM_PROTOCOLS") data=0xed,0x00`,
  };
  for (const [name, line] of Object.entries(cases)) {
    const result = audit([line]);
    assert.equal(result.clean, false, `${name} passed`);
    assert.equal(result.foreign.length, 1, name);
  }
});

test('reads, event selections, and the answer to a foreign requestor\'s own SelectionRequest are not changes of its window', () => {
  const result = audit([
    `000:<:0001:  8: Request(20): GetProperty delete=false(0x00) window=${hex(PERSON)} property=0x27("WM_NAME")`,
    `000:<:0002:  8: Request(15): QueryTree window=${hex(PERSON)}`,
    `000:<:0003: 12: Request(2): ChangeWindowAttributes window=${hex(PERSON)} value-list={event-mask=PropertyChange}`,
    // the CLIPBOARD owner answering the person's application's own request (ICCCM): its reply and the property it wrote
    `000:>:0003: Event SelectionRequest(30) time=0x00001234 owner=${hex(MINE)} requestor=${hex(PERSON)} selection=0x1e9("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`,
    `000:<:0004: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(PERSON)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING") data='x'`,
    `000:<:0005: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(PERSON)} event-mask=0 SelectionNotify(31) time=0x00001234 requestor=${hex(PERSON)} selection=0x1e9("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`,
  ]);
  assert.equal(result.clean, true, JSON.stringify(result.foreign));
  assert.equal(result.mutating, 2, 'the property write and the selection reply are judged, and exempt');
});

test("a window the traced client created itself is its own, and a child the trace's own reply found in a harness window is the harness's", () => {
  const POPUP = 0x800000;
  const CHILD = 0x40001a;
  const result = audit(
    [
      `012:<:0001: 40: Request(1): CreateWindow depth=0x00 window=${hex(POPUP)} parent=${hex(ROOT)} x=40 y=40 width=120 height=80 border-width=0`,
      `012:<:0002:  8: Request(8): MapWindow window=${hex(POPUP)}`,
      `012:<:0003: 16: Request(12): ConfigureWindow window=${hex(POPUP)} values={sibling=${hex(PERSON)} stack-mode=Above(0x00)}`,
      `012:<:0004:  8: Request(4): DestroyWindow window=${hex(POPUP)}`,
      `013:<:0001:  8: Request(15): QueryTree window=${hex(MINE)}`,
      `013:>:0001:36: Reply to QueryTree: root=${hex(ROOT)} parent=${hex(ROOT)} children=${hex(CHILD)};`,
      `013:<:0002: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(CHILD)} event-mask=0 KeyPress(2) keycode=0x26`,
    ],
  );
  assert.equal(result.clean, true, JSON.stringify(result.foreign));
});

test('an empty trace is not clean: the clients did not go through the proxy', () => {
  const result = audit([]);
  assert.equal(result.traced, false);
  assert.equal(result.clean, false);
});

test("a foreign window's change fails the run, whoever sent it", () => {
  const outcome = runOutcome([], { valid: true, foreign: ['the harness: _NET_ACTIVE_WINDOW ClientMessage on 0x00600002'] });
  assert.equal(outcome.pass, false);
  assert.equal(outcome.code, 1);
  assert.match(outcome.failed.join('\n'), /a window the harness did not open.*0x00600002/);
});

test("the negative checks' two windows are the top two of the harness's own, never the person's", () => {
  const mine = new Set([1, 2, 3]);
  assert.deepEqual(harnessPair([9, 1, 2, 8], (id) => mine.has(id)), [1, 2]);
  assert.deepEqual(harnessPair([1, 9, 2, 3, 8], (id) => mine.has(id)), [2, 3]);
  assert.equal(harnessPair([9, 1, 8], (id) => mine.has(id)), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// The Desktop: no restore, the holder, the run's start and end, and the audit of its own trace

/** Fake X tools on a fresh PATH directory, each appending its argv to `log`. */
function fakeTools({ active = 0, geometry = [200, 150], search = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-foreign-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xdotool', `case "$1" in getwindowgeometry) printf 'WINDOW=%s\\nX=0\\nY=0\\nWIDTH=${geometry[0]}\\nHEIGHT=${geometry[1]}\\n' "$3";; search) echo '${search}';; getwindowname) cat "${dir}/title-$2" 2>/dev/null || { echo "X Error: BadWindow" >&2; exit 1; };; esac`);
  tool('xprop', `echo "_NET_ACTIVE_WINDOW(WINDOW): window id # $(cat ${JSON.stringify(join(dir, 'active'))})"`);
  tool('xwininfo', `case "$*" in *-root*) echo "xwininfo: Window id: ${hex(ROOT)} (the root window) (has no name)";; *) echo "X Error: BadWindow" >&2; exit 1;; esac`);
  // the holder's terminal: a process that lives until it is signalled
  tool('xterm', 'exec sleep 30');
  writeFileSync(join(dir, 'active'), hex(active));
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return {
    dir,
    calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    setActive: (id) => writeFileSync(join(dir, 'active'), hex(id)),
    // the window's current title, as xdotool getwindowname reads it; null: the window is gone
    setTitle: (id, title) => (title === null ? rmSync(join(dir, `title-${id}`), { force: true }) : writeFileSync(join(dir, `title-${id}`), title)),
    done: () => {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A reader that lists the harness's windows by title, the holder's from when its terminal was asked for. */
function fakeReader(desktop, ids) {
  return {
    async request(command) {
      if (command !== 'list_windows') return { response: { ok: false, error: 'not in this test' } };
      return { response: { ok: true, output: desktop().windows.filter((w) => ids[w.role]).map((w) => ({ id: ids[w.role], title: w.label, app: 'xterm' })) } };
    },
    async close() {},
  };
}

/** A trace that hands back `text` when it stops, and says where its clients connect. */
const fakeTrace = (text) => () => ({ env: { ...process.env, DISPLAY: ':77' }, stop: async () => text });
/** The whole run's record (xprobe record-run), begun and ended with `lines` between. */
const fakeRecord = (lines = []) => async () => ({ stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), ...lines, JSON.stringify({ kind: 'end', ms: 2 })].join('\n') });
/** The run's watchdog (xprobe watchdog), started and stopped with nothing seen. */
const fakeWatchdog = async () => ({ guard: () => {}, stop: async () => ({ stalled: false, lines: [] }) });
// the run's session bus on a private display (session-bus.mjs), started and stopped with nothing on it
const fakeSession = async () => ({ address: 'unix:path=/nonexistent/cua171-test-bus', a11y: null, stop: async () => ({ terminated: true, killed: false }) });
// these runs stand on a private display: the whole-run record runs (task 41: only there)
const begin = (desktop, traceText, { record = [], existing = [] } = {}) => desktop.begin({ startTrace: fakeTrace(traceText), startRecord: fakeRecord(record), existing: () => existing, privateDisplay: () => true, startWatchdog: fakeWatchdog, startSession: fakeSession });

test('closing never activates the window found active at the start', async () => {
  const tools = fakeTools({ active: PERSON });
  const HOLDER = 0x1a00002;
  const desktop = new Desktop({ cua: 'unused', run: 'foreign1', reader: fakeReader(() => desktop, { holder: HOLDER }), startActive: PERSON });
  try {
    await begin(desktop, activate(HOLDER).join('\n'));
    const opening = tools.calls().length;
    await desktop.closeAll();
    assert.deepEqual(tools.calls().slice(opening).filter((c) => c.includes('windowactivate')), [], 'nothing was activated at the end');
    assert.deepEqual(tools.calls().filter((c) => c.includes(String(PERSON))), [], "the person's window was never named");
    assert.deepEqual(desktop.ending.start, { id: PERSON, owner: 'foreign' });
    assert.deepEqual(desktop.ending.end, { id: PERSON, owner: 'foreign' });
  } finally {
    desktop.unhookStop();
    tools.done();
  }
});

test('a run that starts with a foreign window active opens and activates a holder first, and closes it last', async () => {
  const tools = fakeTools({ active: PERSON });
  const HOLDER = 0x1a00002;
  const SCENE = 0x1c00002;
  const closing = [];
  const desktop = new Desktop({ cua: 'unused', run: 'foreign2', reader: fakeReader(() => desktop, { holder: HOLDER, scene: SCENE }), startActive: PERSON });
  const scene = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    await begin(desktop, [...activate(HOLDER), `001:<:0012: 16: Request(12): ConfigureWindow window=${hex(SCENE)} values={x=0 y=0}`].join('\n'));
    assert.equal(desktop.holder.id, HOLDER);
    // the holder activated before anything else of the run's was asked for
    const activations = tools.calls().filter((c) => c.startsWith('xdotool windowactivate'));
    assert.deepEqual(activations, [`xdotool windowactivate --sync ${HOLDER}`]);
    desktop.windows.push({ kind: 'xterm', role: 'scene', label: desktop.label('scene'), pid: scene.pid, id: SCENE });
    const holderPid = desktop.holder.pid;
    const reader = desktop.reader;
    reader.close = async () => {
      // every other window is closed by now; the holder is still up
      assert.doesNotThrow(() => process.kill(holderPid, 0), 'the holder is still running when the others are closed');
      assert.equal(scene.exitCode !== null || scene.signalCode !== null, true, 'the scene was closed first');
      closing.push('reader');
    };
    tools.setActive(PERSON);
    await desktop.closeAll();
    assert.deepEqual(closing, ['reader']);
    assert.throws(() => process.kill(holderPid, 0), 'the holder was closed');
    assert.deepEqual(desktop.ending.start, { id: PERSON, owner: 'foreign' });
    assert.deepEqual(desktop.ending.end, { id: PERSON, owner: 'foreign' });
    assert.equal(desktop.ending.holder, HOLDER);
    assert.equal(desktop.ending.audit.clean, true, JSON.stringify(desktop.ending.audit));
  } finally {
    scene.kill('SIGKILL');
    desktop.unhookStop();
    tools.done();
  }
});

test('a run that starts with no window active opens no holder', async () => {
  const tools = fakeTools({ active: 0 });
  const desktop = new Desktop({ cua: 'unused', run: 'foreign3', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  try {
    await begin(desktop, HARNESS_ONLY.join('\n'));
    assert.equal(desktop.holder, null);
    assert.deepEqual(tools.calls().filter((c) => c.startsWith('xterm')), []);
    await desktop.closeAll();
    assert.deepEqual(desktop.ending.start, { id: 0, owner: 'none' });
  } finally {
    desktop.unhookStop();
    tools.done();
  }
});

test("the run's own trace is audited against the windows it registered, closed ones included", async () => {
  const tools = fakeTools({ active: 0 });
  const desktop = new Desktop({ cua: 'unused', run: 'foreign4', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  try {
    // a window of the run's, already closed when the trace is audited
    desktop.closed.push({ kind: 'xterm', role: 'front', label: desktop.label('front'), id: MINE });
    await begin(desktop, [...HARNESS_ONLY, ...activate(PERSON, '0020')].join('\n'));
    await desktop.closeAll();
    const { audit: result } = desktop.ending;
    assert.equal(result.clean, false);
    assert.deepEqual(result.foreign.map((f) => f.window), [PERSON]);
    assert.equal(desktop.ownerOf(MINE), 'harness');
    assert.equal(desktop.ownerOf(PERSON), 'foreign');
    assert.equal(desktop.ownerOf(0), 'none');
  } finally {
    desktop.unhookStop();
    tools.done();
  }
});

test("a window already on the display when the run began is never found or adopted, even under the run's exact title", async () => {
  const CHROME = 0x600009;
  const tools = fakeTools({ active: 0, search: String(CHROME) });
  let title = null;
  // the reader lists a Chrome window whose title is exactly the one the run is about to give its scene's window
  const reader = { request: async () => ({ response: { ok: true, output: [{ id: CHROME, title, app: 'Google-chrome' }] } }), close: async () => {} };
  const desktop = new Desktop({ cua: 'unused', run: 'foreign5', reader, startActive: 0 });
  try {
    await begin(desktop, HARNESS_ONLY.join('\n'), { existing: [ROOT, CHROME] });
    title = `${desktop.label('scene', 'r')} - Google Chrome`;
    await assert.rejects(desktop.waitForWindow((w) => w.title === title, 'the scene', 600), /did not appear/);
    assert.deepEqual(desktop.findByTitle(title), [], 'xdotool finds it by its title; the run does not take it');
    // a Chrome scene that never came up is closed by its title: the window that was already there is left alone
    await desktop.close([{ kind: 'chrome', role: 'r', label: desktop.label('scene', 'r'), title, id: null }]);
    assert.equal(desktop.ownerOf(CHROME), 'foreign');
    assert.deepEqual(tools.calls().filter((c) => c.startsWith('xprobe') || c.includes(`close ${CHROME}`)), []);
    // a window the run did not find at its start is found, with when it was found
    desktop.preexisting.delete(CHROME);
    const found = await desktop.waitForWindow((w) => w.title === title, 'the scene', 600);
    assert.equal(found.id, CHROME);
    assert.equal(desktop.found.get(CHROME).length, 1);
  } finally {
    desktop.unhookStop();
    await desktop.closeAll();
    tools.done();
  }
});

test("every title of the run's carries a nonce of its own, so two runs of one name never share a title", () => {
  const reader = { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} };
  const a = new Desktop({ cua: 'unused', run: 'same', reader, startActive: 0 });
  const b = new Desktop({ cua: 'unused', run: 'same', reader, startActive: 0 });
  try {
    assert.match(a.label('scene', 'r'), /^cua171-diff-same-[0-9a-f]{8}-scene-r$/);
    assert.notEqual(a.label('scene', 'r'), b.label('scene', 'r'));
  } finally {
    a.unhookStop();
    b.unhookStop();
    for (const d of [a, b]) rmSync(d.dir, { recursive: true, force: true });
  }
});

test('the harness runs xdotool and its acting xprobe commands only through the display the run traces', () => {
  const dir = join(import.meta.dirname, '../../scripts/linux-engine-diff');
  // the private-display experiment names its own server; the stub is an engine, audited by its own pass
  const exempt = new Set(['xtools.mjs', 'events.mjs', 'stub-activating.mjs']);
  // the observers, kept off the proxy for their timing or their volume: they read (xprobe's `retention`, which redirects
  // its window, and `grabs`, which takes the pointer and the keyboard, are fenced in xtools.mjs, so neither is here)
  const observers = ['witness', 'request-watch', 'crossing-watch', 'cursor-watch', 'selection-watch', 'imgdiff', 'snap'];
  const found = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.mjs') && !exempt.has(n))) {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const m of text.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*'xdotool'/g)) found.push(`${name}: ${m[0]}`);
    for (const m of text.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*XPROBE\s*,\s*\[\s*'([a-z-]+)'/g)) {
      if (!observers.includes(m[1])) found.push(`${name}: xprobe ${m[1]}`);
    }
    // the fenced observers by any route: an argument list that starts with one, a wrapper's or a variable's included
    for (const m of text.matchAll(/\[\s*'(grabs|retention|record-run)'/g)) found.push(`${name}: '${m[1]}'`);
  }
  assert.deepEqual(found, []);
});

test("cleanup closes a Chrome window only while it is still the run's, and never registers its id again (an id Chrome reused for the person's window)", async () => {
  const CHROME = 0x600009;
  const tools = fakeTools({ active: 0 });
  let listed = [];
  const reader = { request: async () => ({ response: { ok: true, output: listed } }), close: async () => {} };
  const desktop = new Desktop({ cua: 'unused', run: 'foreign6', reader, startActive: 0 });
  const closed = [];
  desktop.closeWindow = (id) => closed.push(id);
  try {
    await begin(desktop, HARNESS_ONLY.join('\n'));
    const label = desktop.label('scene', 'r');
    const title = `${label} - Google Chrome`;
    // the scene's window, found once
    const scene = { kind: 'chrome', role: 'r', label, title, id: null };
    desktop.windows.push(scene);
    listed = [{ id: CHROME, title, app: 'Google-chrome' }];
    scene.id = (await desktop.waitForWindow((w) => w.title === title, label, 600)).id;
    assert.equal(desktop.found.get(CHROME).length, 1);
    // the person closed it, and Chrome gave its id to a window of the person's
    tools.setTitle(CHROME, 'a page of the person - Google Chrome');
    await desktop.close([scene]);
    assert.deepEqual(closed, [], "the person's window is not closed");
    assert.equal(desktop.found.get(CHROME).length, 1, 'cleanup found nothing: the id is not registered again');
    assert.equal(desktop.adopted.has(CHROME), false);
    assert.equal(desktop.liveOwned(CHROME), false, 'no longer the window the run opened');
    assert.deepEqual(desktop.skips.map(({ what, window }) => [what, window]), [['close', hex(CHROME)]]);
    // still the run's window: closed, and still not registered again
    const again = { kind: 'chrome', role: 'r2', label: desktop.label('scene', 'r2'), title: `${desktop.label('scene', 'r2')} - Google Chrome`, id: 0x60000a };
    desktop.windows.push(again);
    desktop.foundNow(again.id);
    tools.setTitle(again.id, again.title);
    await desktop.close([again]);
    assert.deepEqual(closed, [again.id]);
    assert.equal(desktop.found.get(again.id).length, 1);
    // a scene never found is closed by its exact title, which carries the run's nonce: found then, once
    const lost = { kind: 'chrome', role: 'r3', label: desktop.label('scene', 'r3'), title: `${desktop.label('scene', 'r3')} - Google Chrome`, id: null };
    desktop.findByTitle = (t) => (t === lost.title ? [0x60000b] : []);
    await desktop.close([lost]);
    assert.deepEqual(closed, [again.id, 0x60000b]);
    assert.equal(desktop.found.get(0x60000b).length, 1);
  } finally {
    desktop.unhookStop();
    await desktop.closeAll();
    tools.done();
  }
});

test("only a live window of the run's, still titled as the run titled it, is the run's to act on; a closed one is not", async () => {
  const tools = fakeTools({ active: 0 });
  const desktop = new Desktop({ cua: 'unused', run: 'foreign7', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  try {
    const live = { kind: 'xterm', role: 'front', label: desktop.label('front'), id: MINE };
    const gone = { kind: 'xterm', role: 'old', label: desktop.label('old'), id: 0x40000d };
    const renamed = { kind: 'xterm', role: 'other', label: desktop.label('other'), id: 0x40000e };
    desktop.windows.push(live, renamed);
    desktop.closed.push(gone);
    tools.setTitle(live.id, live.label);
    tools.setTitle(gone.id, gone.label);
    tools.setTitle(renamed.id, 'another window');
    assert.equal(desktop.liveOwned(MINE), true);
    assert.equal(desktop.liveOwned(gone.id), false, 'closed: its id may be another window now');
    assert.equal(desktop.liveOwned(renamed.id), false);
    assert.equal(desktop.liveOwned(PERSON), false);
    tools.setTitle(MINE, null);
    assert.equal(desktop.liveOwned(MINE), false, 'gone from the display');
    // the retention fence asks the same question
    const { retentionTrials } = await import('../../scripts/linux-engine-diff/xtools.mjs');
    assert.throws(() => retentionTrials(desktop, gone.id, 1, 400, 0, '/tmp/x', () => assert.fail('ran')), /only a window the harness opened/);
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
    tools.done();
  }
});

test("the pointer goes only onto the root or a live window of the run's: the top window at the point is read first", () => {
  const tools = fakeTools({ active: 0 });
  const desktop = new Desktop({ cua: 'unused', run: 'foreign8', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  try {
    const live = { kind: 'chrome', role: 'r', label: desktop.label('scene', 'r'), id: MINE };
    desktop.windows.push(live);
    tools.setTitle(MINE, `${live.label} - Google Chrome`);
    const asked = [];
    let top = { top: 0, holds: null };
    desktop.topAt = (point, ids) => (asked.push([point, ids]), top);
    assert.equal(desktop.pointerSafeAt({ x: 5, y: 6 }), true, 'nothing over the root there');
    assert.deepEqual(asked, [[{ x: 5, y: 6 }, [MINE]]], 'asked with the live windows of the run');
    top = { top: 0x200139, holds: MINE };
    assert.equal(desktop.pointerSafeAt({ x: 5, y: 6 }), true, "the frame of the run's window");
    // a popup of the person's, over the point: Chrome serves it from the client of the run's window
    top = { top: 0x707acb, holds: null };
    assert.equal(desktop.pointerSafeAt({ x: 5, y: 6 }), false);
    top = { top: 0x200139, holds: MINE };
    tools.setTitle(MINE, 'a page of the person - Google Chrome');
    assert.equal(desktop.pointerSafeAt({ x: 5, y: 6 }), false, 'its id is not the window the run opened any more');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
    tools.done();
  }
});

test("an engine's operation on a window is a span the record judges popups by; the reader's reads are not", async () => {
  const { Engine } = await import('../../scripts/linux-engine-diff/engine.mjs');
  const { auditRecord } = await import('../../scripts/linux-engine-diff/foreign.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cua171-ops-'));
  const bin = join(dir, 'engine');
  writeFileSync(bin, `#!${process.execPath}\nrequire('readline').createInterface({ input: process.stdin }).on('line', (l) => console.log(JSON.stringify({ id: JSON.parse(l).id, ok: true, output: [] })));\n`);
  chmodSync(bin, 0o755);
  const tools = fakeTools({ active: 0 });
  const reader = new Engine({ label: 'reader', bin }).start();
  const desktop = new Desktop({ cua: 'unused', run: 'foreign9', reader, startActive: 0 });
  const engine = new Engine({ label: 'cua', bin }).start();
  const DRAG = 0x707acb;
  const CHROME_CLIENT = 0x600000;
  const SCENE_ID = 0x600050;
  // Chrome's drag image created at `at`, and the engine's motion onto it
  const lines = (at, bornMs) => [
    JSON.stringify({ kind: 'client', ms: 1, client: CHROME_CLIENT, pid: 1, exe: 'chrome', ours: false }),
    JSON.stringify({ kind: 'client', ms: 1, client: 0x1600000, pid: 2, exe: 'cua-engine', ours: true }),
    JSON.stringify({ kind: 'req', ms: bornMs, client: CHROME_CLIENT, seq: 1, t: 1, op: 'CreateWindow', window: SCENE_ID, parent: ROOT }),
    JSON.stringify({ kind: 'req', ms: at, client: CHROME_CLIENT, seq: 2, t: 2, op: 'CreateWindow', window: DRAG, parent: ROOT, or: true }),
    JSON.stringify({ kind: 'req', ms: at + 1, client: 0x1600000, seq: 3, t: 3, op: 'FakeInput', type: 'MotionNotify', detail: 0, focus: SCENE_ID, pointer: DRAG }),
  ];
  const wrap = (body) => [JSON.stringify({ kind: 'ready', ms: 1 }), ...body, JSON.stringify({ kind: 'end', ms: 2 })].join('\n');
  let recorded = () => [];
  try {
    await desktop.begin({ startTrace: fakeTrace(HARNESS_ONLY.join('\n')), startRecord: async () => ({ stop: async () => wrap(recorded()) }), existing: () => [], privateDisplay: () => true, startWatchdog: fakeWatchdog, startSession: fakeSession });
    desktop.root = ROOT;
    const born = Date.now() - 5000;
    desktop.closed.push({ kind: 'chrome', role: 'r', label: desktop.label('scene', 'r'), id: SCENE_ID });
    desktop.foundNow(SCENE_ID);
    await reader.request('get_window_state', { window: { id: SCENE_ID } });
    const before = Date.now();
    await engine.request('drag', { window: { id: SCENE_ID } });
    const after = Date.now();
    assert.equal(desktop.operations.length, 1, "the reader's read is not an operation");
    const [op] = desktop.operations;
    assert.equal(op.window, SCENE_ID);
    assert.ok(op.start >= before && op.end <= after && op.start <= op.end);
    const judge = (at) => auditRecord(wrap(lines(at, born)), { registered: desktop.registry(), root: ROOT, spans: desktop.operations });
    assert.equal(judge(op.start).clean, true, JSON.stringify(judge(op.start).foreign));
    // the same popup an hour later: the person's
    assert.deepEqual(judge(op.end + 3600000).foreign.map((f) => f.window), [DRAG]);
    // the run's own end judges its record with its spans
    recorded = () => lines(op.start, born);
    await desktop.closeAll();
    assert.equal(desktop.ending.record.clean, true, JSON.stringify(desktop.ending.record));
  } finally {
    desktop.unhookStop();
    await engine.close();
    await reader.close();
    tools.done();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("xprobe retention redirects only a window the run opened: another's is refused before anything runs", async () => {
  const { retentionTrials } = await import('../../scripts/linux-engine-diff/xtools.mjs');
  const owner = { liveOwned: (id) => id === MINE };
  const ran = [];
  const run = (cmd, args) => (ran.push(args), '{"trial":0}\n');
  assert.throws(() => retentionTrials(owner, PERSON, 1, 400, 0, '/tmp/x', run), /only a window the harness opened and still has open; 0x00600002/);
  assert.deepEqual(ran, []);
  assert.deepEqual(retentionTrials(owner, MINE, 1, 400, 0, '/tmp/x', run), [{ trial: 0 }]);
  assert.deepEqual(ran, [['retention', String(MINE), '1', '400', '0', '/tmp/x']]);
});

test("no two scenes' windows resolve to one label, so none shares another's title or scratch path (7fbe9e1c, generalized)", async () => {
  // every scene a run can open, each with every role a run gives a scene window (run.mjs diffRun: the shared reading
  // window, each engine's own, each engine's text window), through openScene's real choices; each opener records the
  // label it would give its window (its title, and the name of its scratch file or directory) and stops there
  const { SCENE_OPS } = await import('../../scripts/linux-engine-diff/ops.mjs');
  const scenes = Object.keys(SCENE_OPS).filter((s) => s !== 'desktop' && s !== 'paste-target');
  const roles = ['read', 'pinned', 'newest', 'cua', 'text_pinned', 'text_newest', 'text_cua'];
  class Recorded extends Error {}
  const named = new Map();
  const fake = {
    run: 'r',
    nonce: 'n',
    dir: '/scratch',
    // the accessibility reader openScene makes for some scenes: not needed to name a window
    oracle: {},
    labels: [],
    label(...parts) {
      const label = Desktop.prototype.label.call(this, ...parts);
      this.labels.push(label);
      return label;
    },
    openGedit(role, content, { stem = 'gedit' } = {}) {
      this.label(stem, role);
      throw new Recorded();
    },
    openChrome(role, page, { stem = page.replace(/\.html$/, '') } = {}) {
      this.label(stem, role);
      throw new Recorded();
    },
    openRecorder(role) {
      this.label('recorder', role);
      throw new Recorded();
    },
    openDuplicates(role, toolkit) {
      this.label('identity', toolkit, role);
      throw new Recorded();
    },
    // the Desktop's own, on to families.mjs openFamily, which names the window and stops at `assertOpen`
    openFamilyScene: Desktop.prototype.openFamilyScene,
    assertOpen() {
      throw new Recorded();
    },
  };
  for (const scene of scenes) {
    for (const role of roles) {
      fake.labels = [];
      await assert.rejects(openScene(fake, scene, role, { text: role.startsWith('text_') }), Recorded, `${scene} ${role} opened something the test does not know`);
      const label = fake.labels.at(-1);
      const other = named.get(label);
      assert.equal(other, undefined, `${scene} (${role}) and ${other} both open ${label}`);
      named.set(label, `${scene} (${role})`);
    }
  }
  // and the run's own windows
  for (const own of [fake.label('front'), fake.label('holder'), fake.label('scene', 'stub')]) assert.equal(named.get(own), undefined, `${own} is also a scene's`);
});

test("the run's failures list each distinct foreign change once, with how many times it came", async () => {
  const { desktopEnding } = await import('../../scripts/linux-engine-diff/scenes.mjs');
  const f = (what, window, client = null) => ({ what, window, client });
  const ending = {
    start: { id: 0, owner: 'none' },
    end: { id: 0, owner: 'none' },
    holder: null,
    audit: { clean: false, traced: true, requests: 10, mutating: 3, foreign: [f('ChangeProperty', PERSON), f('ChangeProperty', PERSON)] },
    record: { clean: false, traced: true, requests: 900, mutating: 800, foreign: [...Array(230)].map(() => f('XTEST MotionNotify', PERSON, 'cua-engine pid 7')).concat([f('XTEST ButtonRelease', PERSON, 'cua-engine pid 7')]) },
  };
  assert.deepEqual(desktopEnding(ending).foreign, [
    'the harness: ChangeProperty on 0x00600002 (2 times)',
    "the run's record: XTEST MotionNotify on 0x00600002 (cua-engine pid 7) (230 times)",
    "the run's record: XTEST ButtonRelease on 0x00600002 (cua-engine pid 7)",
  ]);
});

test("the summary names the run's start and end active windows, its holder and its own trace's audit", () => {
  const record = { active_start: { id: PERSON, owner: 'foreign' }, active_end: { id: PERSON, owner: 'foreign' }, holder: 0x1a00002, trace: { clean: true, requests: 120, mutating: 14, foreign: [] } };
  assert.equal(
    desktopLine(record),
    "desktop: started with 0x00600002 active (foreign), ended with 0x00600002 active (foreign), neither acted on; holder 0x01a00002; the harness's own trace: 120 requests, 14 changes of a window, every one of its own",
  );
  const bad = { ...record, trace: { clean: false, requests: 121, mutating: 15, foreign: ['_NET_ACTIVE_WINDOW ClientMessage on 0x00600002'] } };
  assert.match(desktopLine(bad), /\*\*1 change of a window it did not open: _NET_ACTIVE_WINDOW ClientMessage on 0x00600002\*\*/);
  assert.match(desktopLine(null), /\*\*the harness's own trace did not run\*\*/);
  // the whole run's record, beside the trace
  const recorded = { ...record, record: { clean: true, requests: 5000, mutating: 300, foreign: [], unplaced: 2, unattributed: { clients: 1, mutating: 0 } } };
  assert.equal(
    desktopLine(recorded),
    `${desktopLine(record)}; the run's record: 5000 requests of the harness's and the engines' clients, 300 changes of a window, every one of its own; 2 XTEST inputs it could not place; 1 client it could not attribute (0 of its requests change a window)`,
  );
  const foreignRecord = { ...record, record: { clean: false, requests: 5000, mutating: 301, foreign: ['SendEvent KeyPress on 0x00600002 (cua-engine pid 7)'], unplaced: 0, unattributed: { clients: 0, mutating: 0 } } };
  assert.match(desktopLine(foreignRecord), /the run's record: .*\*\*1 change of a window it did not open: SendEvent KeyPress on 0x00600002 \(cua-engine pid 7\)\*\*/);
  // what the harness left undone because the window was not the run's then
  const skipped = { ...record, skipped: [{ what: 'close', window: '0x00600009', reason: 'no longer the window the run opened' }] };
  assert.equal(desktopLine(skipped), `${desktopLine(record)}; left undone, the window not the run's then: close on 0x00600009`);
  const cut = { ...record, record: { clean: false, requests: 10, mutating: 0, foreign: [], unplaced: 0, unattributed: null, error: 'the record did not end cleanly, so it may be incomplete' } };
  assert.match(desktopLine(cut), /the run's record: \*\*the record did not end cleanly, so it may be incomplete\*\*/);
});
