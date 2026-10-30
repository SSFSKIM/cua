// The harness's scenes: windows it opens, owns and closes. gedit on a scratch file it writes (its own
// `--standalone` process), Chrome windows on its own pages with unique titles (in the running Chrome), and a front
// window (xterm) that holds the desktop's focus so every scene window is a background window. A reader (one
// cua-engine process the harness keeps for itself) lists windows and reads effects back through the tree; it is
// never an engine under measurement. Nothing here logs the text or titles of windows the harness did not open.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Engine } from './engine.mjs';
import { preorder } from './normalize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PAGES = join(here, 'pages');
export const XPROBE = join(here, 'xprobe', 'target', 'release', 'xprobe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function xdotool(...args) {
  return execFileSync('xdotool', args.map(String), { encoding: 'utf8', timeout: 15000 }).trim();
}

export function activeWindow() {
  const text = execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8' });
  const match = text.match(/0x[0-9a-f]+/i);
  return match ? Number.parseInt(match[0], 16) : 0;
}

export function a11yBusAddress() {
  const text = execFileSync('xprop', ['-root', 'AT_SPI_BUS'], { encoding: 'utf8' });
  const match = text.match(/"(.*)"/);
  if (!match) throw new Error('the root window has no AT_SPI_BUS property');
  return match[1];
}

/**
 * Moves and sizes a harness window, then waits until its geometry reads back as asked. (`xdotool --sync` waits
 * for a change, so it hangs on a window that already has the size.)
 */
export function configure(id, x, y, w, h) {
  xdotool('windowsize', id, w, h);
  xdotool('windowmove', id, x, y);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const geometry = xdotool('getwindowgeometry', '--shell', id);
    if (geometry.includes(`WIDTH=${w}\n`) && geometry.includes(`HEIGHT=${h}\n`)) break;
    execFileSync('sleep', ['0.05']);
  }
}

/** The geometry every scene window of a kind is given, so equivalent windows are the same size and place. */
export const GEOMETRY = { gedit: [910, 756], chrome: [1050, 780] };

export class Desktop {
  constructor({ cua, run }) {
    this.run = run;
    this.dir = mkdtempSync(join(tmpdir(), `cua171-diff-${run}-`));
    this.reader = new Engine({ label: 'reader', bin: cua }).start();
    this.windows = [];
    this.previousActive = activeWindow();
  }

  label(...parts) {
    return ['cua171-diff', this.run, ...parts].join('-');
  }

  async listWindows() {
    const { response } = await this.reader.request('list_windows', {});
    if (!response.ok) throw new Error(`list_windows failed: ${response.error}`);
    return response.output;
  }

  async waitForWindow(match, what, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = (await this.listWindows()).filter(match);
      if (found.length === 1) return found[0];
      await sleep(250);
    }
    throw new Error(`${what} did not appear as exactly one window`);
  }

  place(id, kind, x = 0, y = 0) {
    const [w, h] = GEOMETRY[kind];
    configure(id, x, y, w, h);
  }

  /** gedit on a scratch file the harness writes; `content` is the file's text. */
  async openGedit(role, content) {
    const label = this.label('gedit', role);
    const file = join(this.dir, `${label}.txt`);
    writeFileSync(file, content);
    const child = spawn('gedit', ['--standalone', file], { stdio: 'ignore', detached: true });
    child.unref();
    const name = basename(file);
    const info = await this.waitForWindow((w) => w.app === 'org.gnome.gedit' && w.title.includes(name), label);
    const scene = { kind: 'gedit', role, label, file, content, pid: child.pid, id: info.id };
    this.windows.push(scene);
    this.place(scene.id, 'gedit');
    await this.waitForTree(scene);
    return scene;
  }

  /** A Chrome window on one of the harness's pages, its title unique to this window. */
  async openChrome(role, page, { stem = page.replace(/\.html$/, ''), query = '' } = {}) {
    // `stem`: the scene's name where two scenes open one page, so every window's title stays its own; `query`: the
    // page's own parameters
    const label = this.label(stem, role);
    const url = `${pathToFileURL(join(PAGES, page)).href}${query ? `?${query}` : ''}#${encodeURIComponent(label)}`;
    const child = spawn('google-chrome', ['--new-window', url], { stdio: 'ignore', detached: true });
    child.unref();
    const title = `${label} - Google Chrome`;
    let info;
    try {
      info = await this.waitForWindow((w) => w.title === title, label, 30000);
    } catch (error) {
      // the harness closes what it opened, also when its window did not come up as exactly one
      for (const w of (await this.listWindows()).filter((x) => x.title === title)) {
        try {
          execFileSync(XPROBE, ['close', String(w.id)]);
        } catch {
          // already gone
        }
      }
      throw error;
    }
    const scene = { kind: 'chrome', role, label, page, id: info.id };
    this.windows.push(scene);
    this.place(scene.id, 'chrome');
    await this.waitForTree(scene);
    return scene;
  }

  /** Waits until the scene's tree reads through AT-SPI and two reads agree (the page or the document settled). */
  async waitForTree(scene, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let previous = null;
    while (Date.now() < deadline) {
      const { response } = await this.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
      if (response.ok && response.output.ax_tree_source === 'at_spi') {
        const text = JSON.stringify(response.output.ax_tree);
        if (text === previous) return response.output;
        previous = text;
      }
      await sleep(300);
    }
    throw new Error(`${scene.label} has no stable AT-SPI tree`);
  }

  /** The front window: an xterm that holds the focus, covering the screen (covered) or in a corner (visible). */
  async openFront(occlusion) {
    const label = this.label('front');
    const child = spawn('xterm', ['-T', label, '-e', 'sleep', '86400'], { stdio: 'ignore', detached: true });
    child.unref();
    const info = await this.waitForWindow((w) => w.title === label, label);
    this.front = { kind: 'xterm', role: 'front', label, pid: child.pid, id: info.id };
    this.windows.push(this.front);
    this.arrangeFront(occlusion);
    return this.front;
  }

  arrangeFront(occlusion) {
    const id = this.front.id;
    if (occlusion === 'covered') configure(id, 0, 0, 1280, 800);
    else configure(id, 1070, 640, 200, 150);
    this.focusFront();
  }

  focusFront() {
    xdotool('windowactivate', '--sync', this.front.id);
  }

  /** The harness's own change to a retained window: a new size, at the scene's place (outside any witness span). */
  resize(id, w, h) {
    configure(id, 0, 0, w, h);
  }

  /** The harness's own change to a retained window: unmapped and mapped again at the scene's place and size. */
  async remap(id, [w, h]) {
    xdotool('windowunmap', '--sync', id);
    await sleep(200);
    xdotool('windowmap', '--sync', id);
    configure(id, 0, 0, w, h);
  }

  /** For the visible condition: the scene window above the other scene windows, the focus still in front. */
  raise(scene) {
    xdotool('windowraise', scene.id);
    this.focusFront();
  }

  /**
   * A scene window put in an occlusion condition before its request, the focus in front: `covered` (the front window
   * over the whole screen), `visible` (the window raised above the other scene windows, the front window in its
   * corner), `partial` (the window raised, the front window over its bottom half), `partial-deep` (over its bottom
   * 70%) or `partial-top` (over its top 55%, where the targets are).
   */
  arrange(scene, occlusion) {
    if (occlusion === 'covered') return this.arrangeFront('covered');
    if (occlusion === 'partial-top') {
      // the window raised, the front window over its top 55%, where the targets are: the window partly visible, the
      // points under the cover
      xdotool('windowraise', scene.id);
      configure(this.front.id, 0, 0, 1280, scene.window.y + Math.round(scene.window.height * 0.55));
      return this.focusFront();
    }
    if (occlusion === 'partial' || occlusion === 'partial-deep') {
      xdotool('windowraise', scene.id);
      const y = scene.window.y + Math.round(scene.window.height * (occlusion === 'partial' ? 0.5 : 0.3));
      configure(this.front.id, 0, y, 1280, 800 - y);
      return this.focusFront();
    }
    return this.raise(scene);
  }

  async state(scene) {
    const { response } = await this.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
    if (!response.ok) throw new Error(`reading ${scene.label} failed: ${response.error}`);
    return response.output;
  }

  /** gedit: the document's text (the editable text node's value). */
  async geditText(scene) {
    const nodes = preorder((await this.state(scene)).ax_tree);
    const text = nodes.find((n) => n.role === 'text' && n.states?.includes('editable'));
    return text?.value ?? null;
  }

  /** The input scene's status lines (pages/input.html), parsed. */
  async inputStatus(scene) {
    const { parseInputStatus } = await import('./ops.mjs');
    const nodes = preorder((await this.state(scene)).ax_tree);
    return parseInputStatus(nodes.map((n) => n.name).filter((n) => typeof n === 'string'));
  }

  /** Native ids of a scene's push buttons, by accessible name (`{key: name}` to `{key: id}`). */
  async elementsByName(scene, names) {
    const nodes = preorder((await this.state(scene)).ax_tree);
    const out = {};
    for (const [key, name] of Object.entries(names)) {
      const node = nodes.find((n) => n.role === 'push button' && n.name === name);
      if (!node) throw new Error(`${scene.label} has no button named ${name}`);
      out[key] = node.id;
    }
    return out;
  }

  /** A family's window (families.mjs) as a scene: its application started, sized and settled. */
  async openFamilyScene(name, role) {
    const { openFamily } = await import('./families.mjs');
    const { Oracle } = await import('./oracle.mjs');
    this.oracle ??= new Oracle();
    return openFamily(this, this.oracle, name, role);
  }

  /** The scene page's counters: clicks, keys, the last key and the typed sequence. */
  async chromeCounters(scene) {
    const nodes = preorder((await this.state(scene)).ax_tree);
    const named = (prefix) => nodes.find((n) => n.role === 'static' && n.name?.startsWith(prefix))?.name ?? '';
    const clicks = Number(named('clicks ').split(' ')[1]);
    const [, keys, , last] = named('keys ').split(' ');
    return { clicks, keys: Number(keys), last, seq: named('seq ').slice(4) };
  }

  /**
   * Closes some of the harness's windows: Chrome's with WM_DELETE_WINDOW (the browser is the person's), an
   * application the harness started as its own process group (`group`) by signalling the group, the rest by PID.
   */
  async close(scenes) {
    for (const scene of [...scenes].reverse()) {
      // a window another process owns (gnome-terminal's server): its program, whose PID it wrote, ends first
      if (scene.pidfile) {
        try {
          process.kill(Number(readFileSync(scene.pidfile, 'utf8').trim()), 'SIGTERM');
        } catch {
          // never started, or already gone
        }
      }
      try {
        if (scene.kind === 'chrome') execFileSync(XPROBE, ['close', String(scene.id)]);
        else if (scene.group) process.kill(-scene.pid, 'SIGTERM');
        else process.kill(scene.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    this.windows = this.windows.filter((w) => !scenes.includes(w));
    await sleep(1000);
    for (const scene of scenes.filter((s) => s.group)) {
      try {
        process.kill(-scene.pid, 'SIGKILL');
      } catch {
        // the group ended on SIGTERM
      }
    }
  }

  async closeAll() {
    await this.close(this.windows);
    await this.reader.close();
    rmSync(this.dir, { recursive: true, force: true });
    if (this.previousActive) {
      try {
        xdotool('windowactivate', this.previousActive);
      } catch {
        // the previously active window is gone
      }
    }
  }
}
