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

import { auditForeign, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { harnessPair, openScene } from '../../scripts/linux-engine-diff/run.mjs';
import { desktopLine } from '../../scripts/linux-engine-diff/report.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { runOutcome } from '../../scripts/linux-engine-diff/stats.mjs';

const ROOT = 0x1ff;
const MINE = 0x40000c;
const PERSON = 0x600002;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const audit = (lines, isHarness = (id) => id === MINE) => auditForeign(parseXtrace(lines.join('\n')), { isHarness, root: ROOT });

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

test('reads, event selections, property writes and a selection reply to a foreign requestor are not changes of its window', () => {
  const result = audit([
    `000:<:0001:  8: Request(20): GetProperty delete=false(0x00) window=${hex(PERSON)} property=0x27("WM_NAME")`,
    `000:<:0002:  8: Request(15): QueryTree window=${hex(PERSON)}`,
    `000:<:0003: 12: Request(2): ChangeWindowAttributes window=${hex(PERSON)} value-list={event-mask=PropertyChange}`,
    // the CLIPBOARD owner answering the person's application's own request (ICCCM): its reply and the property it wrote
    `000:<:0004: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(PERSON)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING")`,
    `000:<:0005: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(PERSON)} event-mask=0 SelectionNotify(31) time=0x00001234 requestor=${hex(PERSON)} selection=0x1e9("CLIPBOARD")`,
  ]);
  assert.equal(result.clean, true);
  assert.equal(result.mutating, 1, 'the selection reply is counted as a request it judged');
});

test('a window the traced client created itself is its own, and a child of a harness window is resolved by the predicate', () => {
  const POPUP = 0x800000;
  const CHILD = 0x40001a;
  const result = audit(
    [
      `012:<:0001: 40: Request(1): CreateWindow depth=0x00 window=${hex(POPUP)} parent=${hex(ROOT)} x=40 y=40 width=120 height=80 border-width=0`,
      `012:<:0002:  8: Request(8): MapWindow window=${hex(POPUP)}`,
      `012:<:0003: 16: Request(12): ConfigureWindow window=${hex(POPUP)} values={sibling=${hex(PERSON)} stack-mode=Above(0x00)}`,
      `012:<:0004:  8: Request(4): DestroyWindow window=${hex(POPUP)}`,
      `013:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(CHILD)} event-mask=0 KeyPress(2) keycode=0x26`,
    ],
    (id) => id === MINE || id === CHILD,
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
function fakeTools({ active = 0, geometry = [200, 150] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-foreign-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xdotool', `case "$1" in getwindowgeometry) printf 'WINDOW=%s\\nX=0\\nY=0\\nWIDTH=${geometry[0]}\\nHEIGHT=${geometry[1]}\\n' "$3";; esac`);
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

test('closing never activates the window found active at the start', async () => {
  const tools = fakeTools({ active: PERSON });
  const HOLDER = 0x1a00002;
  const desktop = new Desktop({ cua: 'unused', run: 'foreign1', reader: fakeReader(() => desktop, { holder: HOLDER }), startActive: PERSON });
  try {
    await desktop.begin({ startTrace: fakeTrace(activate(HOLDER).join('\n')) });
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
    await desktop.begin({ startTrace: fakeTrace([...activate(HOLDER), `001:<:0012: 16: Request(12): ConfigureWindow window=${hex(SCENE)} values={x=0 y=0}`].join('\n')) });
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
    await desktop.begin({ startTrace: fakeTrace(HARNESS_ONLY.join('\n')) });
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
    await desktop.begin({ startTrace: fakeTrace([...HARNESS_ONLY, ...activate(PERSON, '0020')].join('\n')) });
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

test('the harness runs xdotool and its acting xprobe commands only through the display the run traces', () => {
  const dir = join(import.meta.dirname, '../../scripts/linux-engine-diff');
  // the private-display experiment names its own server; the stub is an engine, audited by its own pass
  const exempt = new Set(['xtools.mjs', 'events.mjs', 'stub-activating.mjs']);
  // the observers, kept off the proxy for their timing or their volume: they read, or probe the grab state on the root
  const observers = ['witness', 'request-watch', 'crossing-watch', 'cursor-watch', 'selection-watch', 'retention', 'imgdiff', 'snap', 'grabs'];
  const found = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.mjs') && !exempt.has(n))) {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const m of text.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*'xdotool'/g)) found.push(`${name}: ${m[0]}`);
    for (const m of text.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*XPROBE\s*,\s*\[\s*'([a-z-]+)'/g)) {
      if (!observers.includes(m[1])) found.push(`${name}: xprobe ${m[1]}`);
    }
  }
  assert.deepEqual(found, []);
});

test("the gedit and minimized scenes' windows of one engine are different documents, so neither rewrites the other's file", async () => {
  // a desktop that records what it was asked to open (openScene's only calls for these two scenes)
  const asked = [];
  const fake = {
    async openGedit(role, content, options = {}) {
      const label = ['cua171-diff', 'r', options.stem ?? 'gedit', role].join('-');
      asked.push(label);
      return { id: asked.length, label };
    },
    async geditText() {
      return 'text';
    },
    async listWindows() {
      return asked.map((label, i) => ({ id: i + 1, app: 'org.gnome.gedit', width: 910, height: 756 }));
    },
  };
  await openScene(fake, 'gedit', 'cua');
  await openScene(fake, 'minimized', 'cua');
  assert.equal(new Set(asked).size, 2, `labels: ${asked.join(', ')}`);
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
});
