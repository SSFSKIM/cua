// GTK 4's first window of a run (#171 M4, task 51, item 1; the design session's ruling, sminos 336). A run's fresh home
// starts with a cold GPU shader cache, and GTK 4's GL renderer compiles its shaders before the window's tree reaches
// the accessibility bus: for seconds the window reads as an X11 tree, and a settle that took two equal reads ended on
// it, so gnome-text-editor's scenes had no field (task 49's finding 1). Now the run opens a GTK 4 warm-up window of its
// own (gnome-text-editor through the one launcher, in the run's home) before its first GTK 4 scene and closes it, and a
// GTK 4 window's wait ends on its AT-SPI frame's registration, within a bound whose end fails the case. Display-free:
// the applications are stand-ins, the reader a fake that answers an X11 tree until the window "registers".

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { runHome } from '../../scripts/linux-engine-diff/app-env.mjs';
import { FAMILIES, openFamily } from '../../scripts/linux-engine-diff/families.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

/** Stand-ins on a PATH of the test's own: the applications log their start and environment, xdotool sizes nothing. */
function standIns() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-gtk4-tools-'));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  for (const app of ['gnome-text-editor', 'python3', 'xterm']) {
    tool(app, `printf '%s %s %s %s\\n' "$HOME" "\${XDG_CACHE_HOME-unset}" "\${MESA_SHADER_CACHE_DIR-unset}" "$*" >> ${JSON.stringify(join(dir, `${app}.log`))}`);
  }
  // configure's size check: the size last asked for
  tool('xdotool', `case "$1" in windowsize) echo "$3 $4" > ${JSON.stringify(join(dir, 'size'))};; getwindowgeometry) set -- $(cat ${JSON.stringify(join(dir, 'size'))}); printf 'WIDTH=%s\\nHEIGHT=%s\\nSCREEN=0\\n' "$1" "$2";; esac`);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return {
    started: (app) => (existsSync(join(dir, `${app}.log`)) ? readFileSync(join(dir, `${app}.log`), 'utf8').trim().split('\n') : []),
    done() {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A run's Desktop whose windows come at once, each read as an X11 tree for its first `x11Reads` reads (a cold GTK 4
 * window) and then as its AT-SPI tree, or never (`x11Reads: Infinity`); `events` records each start, find and close.
 */
function gtk4Desktop({ x11Reads = () => 0, registrationMs } = {}) {
  const reads = new Map();
  const titles = new Map();
  const reader = {
    async request(command, input) {
      if (command !== 'get_window_state') return { response: { ok: false, error: 'not in this test' } };
      const id = input.window.id;
      const n = (reads.get(id) ?? 0) + 1;
      reads.set(id, n);
      const window = { id, title: titles.get(id), x: 0, y: 0, width: 600, height: 400 };
      if (n <= x11Reads(titles.get(id))) return { response: { ok: true, output: { ax_tree: { id: String(id), role: 'window', children: [] }, ax_tree_source: 'x11', window } } };
      return { response: { ok: true, output: { ax_tree: { id: ':1.9/0', role: 'frame', name: titles.get(id), children: [{ id: ':1.9/1', role: 'push button', name: 'presses 0', children: [] }] }, ax_tree_source: 'at_spi', window } } };
    },
    async close() {},
  };
  const desktop = new Desktop({ cua: 'unused', run: 'gtk4', reader, startActive: 0, nonce: 'n0' });
  desktop.session = { address: 'unix:path=/nonexistent/cua171-test-bus', stop: async () => ({}) };
  if (registrationMs) desktop.registrationMs = registrationMs;
  const events = [];
  let next = 0x4600001;
  desktop.waitForWindow = async (match, label) => {
    const id = next++;
    titles.set(id, label);
    events.push(['found', label]);
    return { id, title: label };
  };
  const close = desktop.close.bind(desktop);
  desktop.close = async (scenes) => {
    events.push(...scenes.map((s) => ['closed', s.label]));
    return close(scenes);
  };
  return { desktop, events, reads };
}

const ended = (desktop) => {
  desktop.unhookStop();
  rmSync(desktop.dir, { recursive: true, force: true });
};

test("a GTK 4 window's wait ends on its AT-SPI frame's registration, not on an X11 tree that reads the same twice", async () => {
  const tools = standIns();
  // the scene's window reads as X11 for its first three reads, as a cold window did in task 49
  const { desktop } = gtk4Desktop({ x11Reads: (label) => (label.includes('gtk4button') ? 3 : 0) });
  try {
    const scene = await openFamily(desktop, null, 'gtk4-button', 'r');
    assert.equal(scene.source, 'at_spi', 'the scene settled on its AT-SPI tree');
    assert.equal(scene.button, ':1.9/1', 'its button found in that tree');
    // a family that is not GTK 4 still settles as it did: an X11 tree read the same twice (xterm has none)
    const xterm = gtk4Desktop({ x11Reads: () => Infinity });
    try {
      assert.equal((await openFamily(xterm.desktop, null, 'xterm', 'r')).source, 'x11');
    } finally {
      await xterm.desktop.close(xterm.desktop.windows);
      ended(xterm.desktop);
    }
  } finally {
    await desktop.close(desktop.windows);
    ended(desktop);
    tools.done();
  }
});

test('a GTK 4 window whose frame never registers within the bound fails its case; it never passes as an X11 tree', async () => {
  const tools = standIns();
  const { desktop } = gtk4Desktop({ x11Reads: (label) => (label.includes('gtk4button') ? Infinity : 0), registrationMs: 2000 });
  try {
    await assert.rejects(openFamily(desktop, null, 'gtk4-button', 'r'), /cua171-diff-gtk4-n0-gtk4button-r: its AT-SPI frame did not register within 2 s/);
  } finally {
    await desktop.close(desktop.windows);
    ended(desktop);
    tools.done();
  }
});

test("before the run's first GTK 4 scene, a warm-up window of the run's own opens in the run's home, registers and closes; once a run", async () => {
  const tools = standIns();
  const saved = process.env.MESA_SHADER_CACHE_DIR;
  // a shader cache the harness's own environment names (task 49's session did): never the run's applications'
  process.env.MESA_SHADER_CACHE_DIR = '/home/person/.cache/mesa_shader_cache';
  const { desktop, events } = gtk4Desktop({ x11Reads: (label) => (label.includes('warmup') ? 2 : 0) });
  try {
    const first = await openFamily(desktop, null, 'gtk4-input', 'pinned');
    await openFamily(desktop, null, 'gnome-text-editor', 'cua').catch(() => {});
    await openFamily(desktop, null, 'xterm', 'newest');
    const warmup = 'cua171-diff-gtk4-n0-gnometexteditor-gtk4warmup';
    assert.deepEqual(events.slice(0, 3), [['found', warmup], ['closed', warmup], ['found', first.label]], 'the warm-up opened, registered and closed before the first GTK 4 scene was started');
    assert.equal(events.filter(([, label]) => label === warmup).length, 2, 'one warm-up a run');
    const [warm, ...rest] = tools.started('gnome-text-editor');
    const homes = runHome(desktop.dir);
    assert.equal(warm.split(' ').slice(0, 3).join(' '), `${homes.HOME} ${homes.XDG_CACHE_HOME} unset`, "in the run's home, its cache the run's, the harness's shader cache never named");
    assert.match(warm, /--standalone \S+\/cua171-diff-gtk4-n0-gnometexteditor-gtk4warmup\.txt$/, 'on a document of its own');
    assert.equal(rest.length, 1, "the gnome-text-editor scene's own window, after the warm-up");
    assert.equal(tools.started('python3').length, 1);
    assert.equal(FAMILIES.xterm.gtk4, undefined);
  } finally {
    if (saved === undefined) delete process.env.MESA_SHADER_CACHE_DIR;
    else process.env.MESA_SHADER_CACHE_DIR = saved;
    await desktop.close(desktop.windows);
    ended(desktop);
    tools.done();
  }
});

test("a warm-up that never registers fails the run's GTK 4 scenes, each with its reason, and the identity scene's GTK 4 windows wait for it too", async () => {
  const tools = standIns();
  const { desktop } = gtk4Desktop({ x11Reads: (label) => (label.includes('warmup') ? Infinity : 0), registrationMs: 1500 });
  try {
    for (const family of ['gtk4-button', 'gtk4-input']) {
      await assert.rejects(openFamily(desktop, null, family, 'r'), /the run's GTK 4 warm-up failed: .*gtk4warmup: its AT-SPI frame did not register within 1\.5 s/, family);
    }
    assert.equal(tools.started('python3').length, 0, 'no GTK 4 scene started');
    assert.equal(tools.started('gnome-text-editor').length, 1, 'one warm-up, tried once');
    // the identity scene's GTK 4 fixture asks for the warm-up before it starts
    await assert.rejects(desktop.openDuplicates('r', 'gtk4'), /the run's GTK 4 warm-up failed/);
    assert.equal(tools.started('python3').length, 0);
  } finally {
    await desktop.close(desktop.windows);
    ended(desktop);
    tools.done();
  }
});
