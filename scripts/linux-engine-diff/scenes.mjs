// The harness's scenes: windows it opens, owns and closes. gedit on a scratch file it writes (its own
// `--standalone` process), Chrome windows on its own pages with unique titles (in the running Chrome), and a front
// window (xterm) that holds the desktop's focus so every scene window is a background window. A reader (one
// cua-engine process the harness keeps for itself) lists windows and reads effects back through the tree; it is
// never an engine under measurement. Nothing here logs the text or titles of windows the harness did not open.
//
// The harness never changes a window it did not open (the design session, 2026-11-02). The window found active when a
// run begins is never activated again: the run records it, and the active window it ends with, each marked foreign or
// the harness's, and acts on neither. A run that begins with a foreign window active first opens and activates a holder
// window of its own, kept until every other window of the run's is closed, so the window manager's focus fallback lands
// on the harness's windows throughout; when the holder closes, what the window manager activates is its own doing. The
// harness's X tools reach the display through the run's own trace (xtools.mjs), and the whole run is recorded
// server-side through RECORD (`startRunRecord`); the run's end judges both (foreign.mjs `auditForeign`, `auditRecord`)
// against the windows the harness registered, each with when it was found.
//
// Whose a window is starts here: every title the harness gives a window carries the run's label and a random nonce of
// its own (`label`), and a window that existed before the run began is never found or adopted, whatever its title
// (`preexisting`), so a window of the person's can never be taken for one of the run's (T4b's audit round).

import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseXtrace, parseXtraceFile, startProxy } from './audit.mjs';
import { Engine } from './engine.mjs';
import { auditForeign, auditRecord, auditRecordFile, foreignKeep, foreignLine } from './foreign.mjs';
import { preorder } from './normalize.mjs';
import { cleanupOnStop } from './stop.mjs';
import { spawnXprobe, startRunRecord, useHarnessDisplay, xdotool, xprobe, XPROBE } from './xtools.mjs';

export { XPROBE, xdotool };

const here = dirname(fileURLToPath(import.meta.url));
export const PAGES = join(here, 'pages');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function activeWindow() {
  const text = execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8' });
  const match = text.match(/0x[0-9a-f]+/i);
  return match ? Number.parseInt(match[0], 16) : 0;
}

/** The screen's root window. */
export function rootWindow() {
  const text = execFileSync('xwininfo', ['-root'], { encoding: 'utf8' });
  return Number.parseInt(text.match(/Window id: (0x[0-9a-f]+)/i)[1], 16);
}

/** Every window on the display, top-levels and their descendants (`xwininfo -root -tree`, a read). */
export function allWindows() {
  const text = execFileSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...text.matchAll(/^\s+(0x[0-9a-f]+)/gim)].map((m) => Number.parseInt(m[1], 16));
}

/**
 * Where the holder sits: the corner the front window takes in the visible arrangement, so it overlaps no scene window
 * the front window does not already overlap, and a covering front window covers it.
 */
const HOLDER_PLACE = [1070, 640, 200, 150];

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
export const GEOMETRY = { gedit: [910, 756], chrome: [1050, 780], recorder: [600, 400] };

/**
 * A run's end as its `end` row records it (`Desktop.ending`): the start and end active windows, each marked foreign
 * or the harness's, the holder, and the audit of the harness's own trace. `foreign` lists what fails the run: each
 * change of a window the harness did not open, or a trace that cannot show there was none.
 */
export function desktopEnding(ending) {
  if (!ending) return { record: null, foreign: ["the harness: its trace did not run, so its requests went unaudited"] };
  const { audit, record } = ending;
  const foreign = audit.foreign.map((f) => `the harness: ${foreignLine(f)}`);
  if (!audit.traced) foreign.push(`the harness: its trace recorded no request${audit.error ? ` (${audit.error})` : ''}, so its requests went unaudited`);
  // the whole run's record: every request of the harness's and the engines' clients, sampled by an audit pass or not
  foreign.push(...record.foreign.map((f) => `the run's record: ${foreignLine(f)}`));
  if (!record.traced) foreign.push(`the run's record: ${record.error ?? 'it did not run'}, so the run's requests went unjudged`);
  return {
    record: {
      active_start: ending.start,
      active_end: ending.end,
      holder: ending.holder,
      trace: { clean: audit.clean, requests: audit.requests, mutating: audit.mutating, foreign: audit.foreign.slice(0, 10).map(foreignLine), unplaced: audit.unplaced ?? 0 },
      record: { clean: record.clean, requests: record.requests, mutating: record.mutating, foreign: record.foreign.slice(0, 10).map(foreignLine), ...(record.foreign.length ? { first_foreign: record.foreign.slice(0, 5).map(({ client, what, window, text }) => ({ client, what, window, request: text })) } : {}), unplaced: record.unplaced ?? 0, unattributed: record.unattributed ?? null, ...(record.error ? { error: record.error } : {}) },
    },
    foreign,
  };
}

export class Desktop {
  /**
   * `reader`, `startActive` and `nonce`: the display-free tests' own (stop.test.mjs); a run's are the defaults. `logs`: the
   * run's output directory, where the scene applications' stderr is kept (`spawnApp`); without it, it is discarded.
   * A run calls `begin` before it opens anything.
   */
  constructor({ cua, run, reader, startActive, logs, nonce }) {
    this.run = run;
    this.dir = mkdtempSync(join(tmpdir(), `cua171-diff-${run}-`));
    this.logs = logs ? join(logs, 'apps') : null;
    this.reader = reader ?? new Engine({ label: 'reader', bin: cua }).start();
    // in every title the harness gives a window: a window of another's can never carry it, whatever its run label
    this.nonce = nonce ?? randomBytes(4).toString('hex');
    // the windows on the display before the run began (`begin`): never found and never adopted, whatever their title
    this.preexisting = new Set();
    // when each window of the run's was found, every time (ms since the epoch): the record judges the life it had then
    this.found = new Map();
    // every window the harness asked for, registered before it is asked for (so a stop finds it), its id once found
    this.windows = [];
    // the windows closed since: still the harness's own for the audit of its trace
    this.closed = [];
    // windows the harness found by their run-unique title and closed before it had registered their id
    this.adopted = new Set();
    // the window active before the run opened anything; it is recorded, never activated again
    this.startActive = startActive ?? activeWindow();
    this.holder = null;
    this.trace = null;
    // what the run's end records (`closeEverything`): the start and end active windows, the holder, the trace's audit
    this.ending = null;
    // the opens in flight, and whether the run is stopping: then no window is asked for any more
    this.opening = new Set();
    this.stopping = false;
    // a run stopped by SIGINT or SIGTERM closes what it opened, as one that ends does (stop.mjs)
    this.stopHooks = [];
    this.unhookStop = cleanupOnStop(() => this.stop());
  }

  /**
   * The run's start: the windows already on the display (never the run's), the whole run's record, its own trace,
   * through which every X tool of the harness's then connects (xtools.mjs), and, when the window found active is
   * foreign, the holder opened and activated before anything else. `startTrace`, `startRecord` and `existing` are the
   * display-free tests' own. Returns the window found active, marked.
   */
  async begin({ startTrace = startProxy, startRecord = startRunRecord, existing = allWindows } = {}) {
    this.root = rootWindow();
    this.preexisting = new Set(existing());
    this.record = await startRecord();
    try {
      this.trace = await startTrace();
    } catch (error) {
      await this.record.stop();
      this.record = null;
      throw error;
    }
    useHarnessDisplay(this.trace.env);
    if (this.ownerOf(this.startActive) === 'foreign') await this.openHolder();
    return this.activeRecord(this.startActive);
  }

  /**
   * Every window the harness opened in this run, closed ones included, with each time it was found (ms since the epoch, or
   * null where it was registered without being found): the windows it registered and those it adopted by title.
   */
  registry() {
    const ids = [...this.windows, ...this.closed].map((w) => w.id).filter((id) => Number.isSafeInteger(id) && id > 0);
    return new Map([...ids, ...this.adopted].map((id) => [id, this.found.get(id) ?? null]));
  }

  /** A window of the run's found now: each finding is kept, since a window reopened may get the id of the one it replaced. */
  foundNow(id) {
    if (!this.found.has(id)) this.found.set(id, []);
    this.found.get(id).push(Date.now());
  }

  /** Every window id the harness opened in this run. */
  harnessIds() {
    return new Set(this.registry().keys());
  }

  /** `harness` for a window the run opened, `foreign` for any other, `none` for no window. */
  ownerOf(id) {
    if (!id) return 'none';
    return this.harnessIds().has(id) ? 'harness' : 'foreign';
  }

  activeRecord(id) {
    return { id, owner: this.ownerOf(id) };
  }

  /** The holder: a terminal of the harness's own, placed in the front window's corner and activated. */
  openHolder() {
    this.assertOpen();
    return this.track(async () => {
      const label = this.label('holder');
      const child = this.spawnApp(label, 'xterm', ['-T', label, '-e', 'sleep', '86400']);
      const holder = { kind: 'xterm', role: 'holder', label, pid: child.pid, id: null };
      this.windows.push(holder);
      this.holder = holder;
      const info = await this.waitForWindow((w) => w.title === label, label);
      holder.id = info.id;
      if (this.stopping) return holder;
      configure(holder.id, ...HOLDER_PLACE);
      xdotool('windowactivate', '--sync', holder.id);
      return holder;
    });
  }

  /** Something of the run's own to stop before the windows close when the run is stopped (its witness). */
  onStop(hook) {
    this.stopHooks.push(hook);
  }

  /**
   * The cleanup of a stopped run: no window is asked for any more, the opens in flight end (each bounded by its own
   * wait for its window, which a stop does not cut short, so a window that appears meanwhile is found), the run's own
   * hooks run, and everything registered is closed.
   */
  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.opening]);
    for (const hook of this.stopHooks) {
      try {
        await hook();
      } catch {
        // each tried on its own; the windows close regardless
      }
    }
    await this.closeAll();
  }

  /**
   * A scene application the harness starts as its own detached process, its stderr appended to
   * `<logs>/apps/<label>.stderr` (a window reopened under its label appends), so a toolkit's own complaints are
   * evidence: GTK 3's criticals were the only trace of the stack bug behind both vendor builds' gedit `clipboard_write`
   * failure (#268). stdin and stdout are discarded; without a log directory, everything is, as before.
   */
  spawnApp(label, cmd, args, options = {}) {
    let fd = null;
    if (this.logs) {
      mkdirSync(this.logs, { recursive: true });
      fd = openSync(join(this.logs, `${label}.stderr`), 'a');
    }
    try {
      const child = spawn(cmd, args, { ...options, stdio: fd === null ? 'ignore' : ['ignore', 'ignore', fd], detached: true });
      child.unref();
      return child;
    } finally {
      // the child holds its own copy
      if (fd !== null) closeSync(fd);
    }
  }

  /** The logs of applications that printed nothing removed, and the directory too when none is left. */
  pruneLogs() {
    if (!this.logs) return;
    try {
      for (const name of readdirSync(this.logs)) {
        const path = join(this.logs, name);
        if (statSync(path).size === 0) unlinkSync(path);
      }
      if (readdirSync(this.logs).length === 0) rmdirSync(this.logs);
    } catch {
      // never created
    }
  }

  /** Refuses a new window once the run is stopping. */
  assertOpen() {
    if (this.stopping) throw new Error('the harness is stopping: no window is opened now');
  }

  /** An open, tracked while it is in flight (`stop`). */
  track(open) {
    const opened = open();
    this.opening.add(opened);
    opened.then(
      () => this.opening.delete(opened),
      () => this.opening.delete(opened),
    );
    return opened;
  }

  /** The harness's Chrome windows titled `title` (`xdotool`, no reader needed), never one that was there before the run. */
  findByTitle(title) {
    try {
      const pattern = `^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
      return xdotool('search', '--name', pattern).split('\n').filter(Boolean).map(Number).filter((id) => !this.preexisting.has(id));
    } catch {
      // none
      return [];
    }
  }

  /** A Chrome window closed as Chrome's own close does (WM_DELETE_WINDOW): the browser is the person's. */
  closeWindow(id) {
    try {
      xprobe(['close', id]);
    } catch {
      // already gone
    }
  }

  /** A title of the run's own: its run label and its nonce, then the parts. */
  label(...parts) {
    return ['cua171-diff', this.run, this.nonce, ...parts].join('-');
  }

  async listWindows() {
    const { response } = await this.reader.request('list_windows', {});
    if (!response.ok) throw new Error(`list_windows failed: ${response.error}`);
    return response.output;
  }

  /**
   * The one window `match` finds among those the run did not find on the display at its start, recorded as found now.
   */
  async waitForWindow(match, what, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = (await this.listWindows()).filter((w) => !this.preexisting.has(w.id) && match(w));
      if (found.length === 1) {
        this.foundNow(found[0].id);
        return found[0];
      }
      await sleep(250);
    }
    throw new Error(`${what} did not appear as exactly one window`);
  }

  place(id, kind, x = 0, y = 0) {
    const [w, h] = GEOMETRY[kind];
    configure(id, x, y, w, h);
  }

  /**
   * gedit on a scratch file the harness writes; `content` is the file's text. `stem`: the scene's name where two scenes
   * open gedit windows for one engine, so each window has a document of its own: with one file for the gedit and the
   * minimized scenes, the second open rewrote the first window's file, and cua's gedit `press_key` lost its effect on
   * every sample of a sitting with both scenes (task 35).
   */
  openGedit(role, content, { stem = 'gedit' } = {}) {
    this.assertOpen();
    return this.track(async () => {
      const label = this.label(stem, role);
      const file = join(this.dir, `${label}.txt`);
      writeFileSync(file, content);
      const child = this.spawnApp(label, 'gedit', ['--standalone', file]);
      // registered with its process at once: a stop or a window that never comes ends the process
      const scene = { kind: 'gedit', role, label, file, content, pid: child.pid, id: null };
      this.windows.push(scene);
      const name = basename(file);
      const info = await this.waitForWindow((w) => w.app === 'org.gnome.gedit' && w.title.includes(name), label);
      scene.id = info.id;
      if (this.stopping) return scene;
      this.place(scene.id, 'gedit');
      await this.waitForTree(scene);
      return scene;
    });
  }

  /** A Chrome window on one of the harness's pages, its title unique to this window. */
  openChrome(role, page, { stem = page.replace(/\.html$/, ''), query = '' } = {}) {
    this.assertOpen();
    return this.track(async () => {
      // `stem`: the scene's name where two scenes open one page, so every window's title stays its own; `query`: the
      // page's own parameters
      const label = this.label(stem, role);
      const url = `${pathToFileURL(join(PAGES, page)).href}${query ? `?${query}` : ''}#${encodeURIComponent(label)}`;
      const title = `${label} - Google Chrome`;
      // registered before Chrome is asked for it, by its title: a stop meanwhile closes it by that title
      const scene = { kind: 'chrome', role, label, page, title, id: null };
      this.windows.push(scene);
      // not `spawnApp`: the window belongs to the person's running Chrome, and this launcher only hands it the URL
      const child = spawn('google-chrome', ['--new-window', url], { stdio: 'ignore', detached: true });
      child.unref();
      let info;
      try {
        info = await this.waitForWindow((w) => w.title === title, label, 30000);
      } catch (error) {
        // the harness closes what it opened, also when its window did not come up as exactly one
        await this.close([scene]);
        throw error;
      }
      scene.id = info.id;
      if (this.stopping) return scene;
      this.place(scene.id, 'chrome');
      await this.waitForTree(scene);
      return scene;
    });
  }

  /** Waits until the scene's tree reads through AT-SPI and two reads agree (the page or the document settled). */
  async waitForTree(scene, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let previous = null;
    while (Date.now() < deadline) {
      // a stopping run closes the window instead
      if (this.stopping) return null;
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
  openFront(occlusion) {
    this.assertOpen();
    return this.track(async () => {
      const label = this.label('front');
      const child = this.spawnApp(label, 'xterm', ['-T', label, '-e', 'sleep', '86400']);
      const front = { kind: 'xterm', role: 'front', label, pid: child.pid, id: null };
      this.windows.push(front);
      const info = await this.waitForWindow((w) => w.title === label, label);
      front.id = info.id;
      this.front = front;
      if (this.stopping) return front;
      this.arrangeFront(occlusion);
      return front;
    });
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

  /**
   * A recorder window as a scene (M4's T4): `xprobe record … managed`, an ordinary top-level the window manager
   * manages (so it can be minimized), titled with the scene's label, whose client is the harness, so a synthetic event
   * sent to it with an empty mask reaches the harness. `scene.recorder.mark(tag)` returns the events it received since
   * the last mark (a round trip first, so every event the server queued before it is read).
   */
  openRecorder(role) {
    this.assertOpen();
    return this.track(async () => {
      const label = this.label('recorder', role);
      const [w, h] = GEOMETRY.recorder;
      const child = spawnXprobe(['record', 0, 0, w, h, 'managed', label], { stdio: ['pipe', 'pipe', 'ignore'] });
      const scene = { kind: 'recorder', role, label, pid: child.pid, id: null, size: [w, h] };
      this.windows.push(scene);
      const lines = [];
      const waiters = [];
      createInterface({ input: child.stdout }).on('line', (line) => {
        lines.push(JSON.parse(line));
        for (const waiter of waiters.splice(0)) waiter();
      });
      const next = async (match) => {
        for (;;) {
          const index = lines.findIndex(match);
          if (index >= 0) return lines.splice(0, index + 1);
          if (child.exitCode !== null) throw new Error(`${label}'s recorder exited`);
          await new Promise((resolve) => waiters.push(resolve));
        }
      };
      child.once('exit', () => {
        for (const waiter of waiters.splice(0)) waiter();
      });
      scene.recorder = {
        async mark(tag) {
          child.stdin.write(`mark ${tag}\n`);
          const got = await next((m) => m.mark === tag);
          return got.filter((m) => m.type).map(({ time, ...event }) => event);
        },
      };
      const info = await this.waitForWindow((w) => w.title === label, label);
      scene.id = info.id;
      if (this.stopping) return scene;
      configure(scene.id, 0, 0, w, h);
      return scene;
    });
  }

  /** A family's window (families.mjs) as a scene: its application started, sized and settled. */
  async openFamilyScene(name, role, { stem } = {}) {
    const { openFamily } = await import('./families.mjs');
    const { Oracle } = await import('./oracle.mjs');
    this.oracle ??= new Oracle();
    return openFamily(this, this.oracle, name, role, stem ? { stem } : {});
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
        // a Chrome window not found yet: whatever came up with its title
        if (scene.kind === 'chrome') {
          for (const id of scene.id ? [scene.id] : this.findByTitle(scene.title)) {
            // found by its title, unique to the run: the harness's own, though its id was never registered
            this.adopted.add(id);
            this.foundNow(id);
            this.closeWindow(id);
          }
        }
        else if (scene.group) process.kill(-scene.pid, 'SIGTERM');
        else process.kill(scene.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    this.windows = this.windows.filter((w) => !scenes.includes(w));
    this.closed.push(...scenes.filter((w) => !this.closed.includes(w)));
    await sleep(1000);
    for (const scene of scenes.filter((s) => s.group)) {
      try {
        process.kill(-scene.pid, 'SIGKILL');
      } catch {
        // the group ended on SIGTERM
      }
    }
  }

  /** Everything the harness opened closed, once: the end of the run and a stop that interrupts it share one cleanup. */
  closeAll() {
    this.closing ??= this.closeEverything();
    return this.closing;
  }

  /**
   * The run's end: every window of the run's closed, the holder last; the window found active at the start is not
   * activated again (it is foreign: nothing of the run's was open then). A run that began records `ending`: the start
   * and end active windows, each marked, the holder, and the audit of its trace, which covers this cleanup too.
   */
  async closeEverything() {
    await this.close(this.windows.filter((w) => w !== this.holder));
    await this.reader.close();
    // the holder last: until here the window manager's fallback lands on it; after it, the window manager chooses
    if (this.holder && this.windows.includes(this.holder)) await this.close([this.holder]);
    rmSync(this.dir, { recursive: true, force: true });
    this.pruneLogs();
    if (this.trace) this.ending = await this.finishTrace();
    // only once everything is closed: a signal meanwhile still waits for this cleanup
    this.unhookStop();
  }

  /**
   * The trace and the record stopped and audited, the harness's tools back on the session's display, and the run's end
   * recorded.
   */
  async finishTrace() {
    let end = null;
    try {
      end = activeWindow();
    } catch {
      // unreadable: recorded as unknown
    }
    const registered = this.registry();
    let audit;
    try {
      // read from its file line by line, keeping what the judge reads: a whole run's trace is too large for one string
      const trace = await this.trace.stop({ parse: (log) => parseXtraceFile(log, { keep: foreignKeep }) });
      audit = auditForeign(typeof trace === 'string' ? parseXtrace(trace) : trace, { registered, root: this.root });
    } catch (error) {
      audit = { clean: false, traced: false, requests: 0, mutating: 0, foreign: [], error: error.message };
    } finally {
      useHarnessDisplay(null);
    }
    let record;
    try {
      const judged = await this.record.stop({
        parse: async (file) => {
          const audit = await auditRecordFile(file, { registered, root: this.root });
          // a record that failed is kept as the run's evidence, compressed (window ids, atoms and processes, no text)
          if (!audit.clean && this.logs) await pipeline(createReadStream(file), createGzip(), createWriteStream(join(dirname(this.logs), 'record.jsonl.gz')));
          return audit;
        },
      });
      record = typeof judged === 'string' ? auditRecord(judged, { registered, root: this.root }) : judged;
    } catch (error) {
      record = { clean: false, traced: false, requests: 0, mutating: 0, foreign: [], error: error.message };
    }
    return { start: this.activeRecord(this.startActive), end: end === null ? null : this.activeRecord(end), holder: this.holder?.id ?? null, audit, record };
  }
}
