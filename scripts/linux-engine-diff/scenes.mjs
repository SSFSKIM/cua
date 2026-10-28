// The harness's scenes: windows it opens, owns and closes. gedit on a scratch file it writes (its own
// `--standalone` process), Chrome windows on its own pages with unique titles (in the running Chrome), and a front
// window (xterm) that holds the desktop's focus so every scene window is a background window. A reader (one
// cua-engine process the harness keeps for itself) lists windows and reads effects back through the tree; it is
// never an engine under measurement. Nothing here logs the text or titles of windows the harness did not open.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  async openChrome(role, page) {
    const label = this.label(page.replace(/\.html$/, ''), role);
    const url = `${pathToFileURL(join(PAGES, page)).href}#${encodeURIComponent(label)}`;
    const child = spawn('google-chrome', ['--new-window', url], { stdio: 'ignore', detached: true });
    child.unref();
    const title = `${label} - Google Chrome`;
    const info = await this.waitForWindow((w) => w.title === title, label, 30000);
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

  /** For the visible condition: the scene window above the other scene windows, the focus still in front. */
  raise(scene) {
    xdotool('windowraise', scene.id);
    this.focusFront();
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
