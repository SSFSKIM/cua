// The scene applications' stderr kept as evidence (#268): a GTK critical a scene application prints (GTK 3's
// `PasteText` callback reading freed stack, behind both vendor builds' gedit `clipboard_write` failure) lands in the
// run's output directory, under `apps/<label>.stderr`, instead of being discarded. Display-free: `gedit`, `xterm` and
// a family's command on the PATH are scripts, and the reader, the placing and the tree wait are the test's own.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `name` on a fresh PATH directory: a script that prints `line` to stderr and `stdout` to stdout, then exits. */
function fakeApp(dir, name, line) {
  writeFileSync(join(dir, name), `#!/bin/sh\necho ${JSON.stringify(line)} >&2\necho stdout-noise\n`);
  chmodSync(join(dir, name), 0o755);
}

/** A reader listing one window per call to `list_windows`, matched by the test's own predicate. */
const reader = (windows) => ({ request: async () => ({ response: { ok: true, output: windows() } }), close: async () => {} });

async function waitFor(file, text) {
  for (let i = 0; i < 100; i++) {
    if (existsSync(file) && readFileSync(file, 'utf8').includes(text)) return;
    await sleep(20);
  }
  assert.fail(`${file} never held ${text}`);
}

function setup(run, windows, { logs = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-app-logs-'));
  const out = join(dir, 'out');
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  const desktop = new Desktop({ cua: 'unused', run, reader: reader(windows), startActive: 0, ...(logs ? { logs: out } : {}) });
  desktop.place = () => {};
  desktop.waitForTree = async () => {};
  desktop.arrangeFront = () => {};
  const done = async () => {
    process.env.PATH = saved;
    desktop.unhookStop();
    await desktop.closeAll();
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, out, desktop, done };
}

test("gedit's stderr lands in the run's output directory and outlives the run's own scratch directory", async () => {
  const s = setup('applogs1', () => [{ id: 9, app: 'org.gnome.gedit', title: 'cua171-diff-applogs1-gedit-r.txt - gedit' }]);
  try {
    fakeApp(s.dir, 'gedit', '(gedit:1): Gtk-CRITICAL **: gtk_text_buffer_insert: assertion failed');
    const scene = await s.desktop.openGedit('r', 'cua171 text');
    const log = join(s.out, 'apps', `${scene.label}.stderr`);
    await waitFor(log, 'Gtk-CRITICAL');
    assert.equal(readFileSync(log, 'utf8').includes('stdout-noise'), false, 'stdout is not kept');
    await s.desktop.closeAll();
    assert.match(readFileSync(log, 'utf8'), /gtk_text_buffer_insert: assertion failed/);
  } finally {
    await s.done();
  }
});

test('a window reopened under the same label (the backstop) appends to its log', async () => {
  const s = setup('applogs2', () => [{ id: 9, app: 'org.gnome.gedit', title: 'cua171-diff-applogs2-gedit-r.txt - gedit' }]);
  try {
    fakeApp(s.dir, 'gedit', 'first window');
    const scene = await s.desktop.openGedit('r', 'cua171 text');
    const log = join(s.out, 'apps', `${scene.label}.stderr`);
    await waitFor(log, 'first window');
    fakeApp(s.dir, 'gedit', 'second window');
    await s.desktop.openGedit('r', 'cua171 text');
    await waitFor(log, 'second window');
    assert.match(readFileSync(log, 'utf8'), /first window\n[^]*second window/);
  } finally {
    await s.done();
  }
});

test("the front window's stderr is kept, and an application that said nothing leaves no file", async () => {
  let label = null;
  const s = setup('applogs3', () => (label ? [{ id: 5, app: 'XTerm', title: label }] : []));
  try {
    fakeApp(s.dir, 'xterm', 'xterm: cannot load font');
    label = s.desktop.label('front');
    const front = await s.desktop.openFront('visible');
    const log = join(s.out, 'apps', `${front.label}.stderr`);
    await waitFor(log, 'cannot load font');
    // a quiet application: its empty log is removed when the run closes
    writeFileSync(join(s.dir, 'gedit'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(s.dir, 'gedit'), 0o755);
    label = null;
    const windows = [{ id: 9, app: 'org.gnome.gedit', title: 'cua171-diff-applogs3-gedit-q.txt - gedit' }];
    s.desktop.reader = reader(() => windows);
    const quiet = await s.desktop.openGedit('q', 'cua171 text');
    await sleep(100);
    await s.desktop.closeAll();
    assert.deepEqual(readdirSync(join(s.out, 'apps')), [`${front.label}.stderr`]);
    assert.equal(existsSync(join(s.out, 'apps', `${quiet.label}.stderr`)), false);
  } finally {
    await s.done();
  }
});

test('without a log directory nothing is written (the applications are discarded as before)', async () => {
  const s = setup('applogs4', () => [{ id: 9, app: 'org.gnome.gedit', title: 'cua171-diff-applogs4-gedit-r.txt - gedit' }], { logs: false });
  try {
    fakeApp(s.dir, 'gedit', 'nowhere');
    await s.desktop.openGedit('r', 'cua171 text');
    await sleep(100);
    assert.equal(existsSync(s.out), false);
  } finally {
    await s.done();
  }
});
