// The harness's scenes: windows it opens, owns and closes. gedit on a scratch file it writes (its own
// `--standalone` process), Chrome windows on its own pages with unique titles (in the run's own Chrome, on a profile
// under the run's scratch directory, chrome.mjs), and a front window (xterm) that holds the desktop's focus so every
// scene window is a background window. A reader (one cua-engine process the harness keeps for itself) lists windows
// and reads effects back through the tree; it is never an engine under measurement. Nothing here logs the text or
// titles of windows the harness did not open.
//
// The harness never hands a window to, starts on, or takes over a person's application instance or profile (task 43):
// every application starts as an instance of the run's own (families.mjs says how for each), Chrome only through the
// run's `ChromeInstance`, and on a private display everything of the run's runs under a session bus of the run's own
// (session-bus.mjs), so no single-instance handoff over D-Bus can reach the person's session. Every application, on
// every display, runs with a home of the run's and the XDG directories inside it (task 45, app-env.mjs,
// `appEnvironment`), so none writes the person's settings, recent files or certificate store; on a display a person
// uses, the person's accessibility switches are only read (a11y-status.mjs, `assertQtBridge`).
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

import { a11yAddress, qtBridgeRefusal, readStatus } from './a11y-status.mjs';
import { HOME_VARS, launchEnvironment, runHome } from './app-env.mjs';
import { parseXtrace, parseXtraceFile, startProxy } from './audit.mjs';
import { ChromeInstance, isChromeCommand } from './chrome.mjs';
import { Engine, watchOperations } from './engine.mjs';
import { auditForeign, auditRecord, auditRecordFile, foreignKeep, foreignLine } from './foreign.mjs';
import { preorder } from './normalize.mjs';
import { startPrivateSession } from './session-bus.mjs';
import { cleanupOnStop } from './stop.mjs';
import { RECORD_REFUSAL, isPrivateDisplay, spawnXprobe, startRunRecord, startRunWatchdog, useHarnessDisplay, xdotool, xprobe, XPROBE } from './xtools.mjs';

export { XPROBE, xdotool };

const here = dirname(fileURLToPath(import.meta.url));
export const PAGES = join(here, 'pages');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How long one of the harness's reads of the display may take (`xprop`, `xwininfo`): a display that stops answering
 * fails the read instead of holding the run in it, so its stop hooks can run (the watchdog stops the run, task 44).
 */
const READ_TIMEOUT_MS = 15000;

/** The harness's own variables a private display's run sets for its processes (`useSession`), and puts back. */
const SESSION_ENV = ['DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS'];

export function activeWindow() {
  const text = execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8', timeout: READ_TIMEOUT_MS });
  const match = text.match(/0x[0-9a-f]+/i);
  return match ? Number.parseInt(match[0], 16) : 0;
}

/** The screen's root window. */
export function rootWindow() {
  const text = execFileSync('xwininfo', ['-root'], { encoding: 'utf8', timeout: READ_TIMEOUT_MS });
  return Number.parseInt(text.match(/Window id: (0x[0-9a-f]+)/i)[1], 16);
}

/** Every window on the display, top-levels and their descendants (`xwininfo -root -tree`, a read). */
export function allWindows() {
  const text = execFileSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: READ_TIMEOUT_MS });
  return [...text.matchAll(/^\s+(0x[0-9a-f]+)/gim)].map((m) => Number.parseInt(m[1], 16));
}

/**
 * Where the holder sits: the corner the front window takes in the visible arrangement, so it overlaps no scene window
 * the front window does not already overlap, and a covering front window covers it.
 */
const HOLDER_PLACE = [1070, 640, 200, 150];

export function a11yBusAddress() {
  const text = execFileSync('xprop', ['-root', 'AT_SPI_BUS'], { encoding: 'utf8', timeout: READ_TIMEOUT_MS });
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
export const GEOMETRY = { gedit: [910, 756], chrome: [1050, 780], recorder: [600, 400], identity: [600, 380] };

/**
 * A run's end as its `end` row records it (`Desktop.ending`): the start and end active windows, each marked foreign
 * or the harness's, the holder, and the audit of the harness's own trace. `foreign` lists what fails the run: each
 * change of a window the harness did not open, or a trace that cannot show there was none.
 */
/** Each distinct line once, in the order it first came, with how many times it came where that is more than once. */
function tally(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts].map(([line, n]) => (n > 1 ? `${line} (${n} times)` : line));
}

export function desktopEnding(ending) {
  if (!ending) return { record: null, foreign: ["the harness: its trace did not run, so its requests went unaudited"] };
  const { audit, record } = ending;
  const foreign = tally(audit.foreign.map((f) => `the harness: ${foreignLine(f)}`));
  if (!audit.traced) foreign.push(`the harness: its trace recorded no request${audit.error ? ` (${audit.error})` : ''}, so its requests went unaudited`);
  // the whole run's record: every request of the harness's and the engines' clients, sampled by an audit pass or not
  foreign.push(...tally(record.foreign.map((f) => `the run's record: ${foreignLine(f)}`)));
  // a record not run on purpose (a person's display, task 41) fails nothing: the sampled route audits judge the engines
  if (!record.traced && !record.skipped) foreign.push(`the run's record: ${record.error ?? 'it did not run'}, so the run's requests went unjudged`);
  // a run whose watchdog did not end cleanly (stalled, lost before the run ended, failed, or none) ran unwatched
  const { watchdog } = ending;
  if (!watchdog?.clean) foreign.push(`the run's watchdog: ${watchdog ? watchdog.reason : 'there was none'}, so the display went unwatched`);
  return {
    record: {
      active_start: ending.start,
      active_end: ending.end,
      holder: ending.holder,
      skipped: ending.skipped ?? [],
      trace: { clean: audit.clean, requests: audit.requests, mutating: audit.mutating, foreign: audit.foreign.slice(0, 10).map(foreignLine), unplaced: audit.unplaced ?? 0 },
      watchdog: watchdog ? { state: watchdog.state, round_trips: watchdog.round_trips ?? null, ...(watchdog.clean ? {} : { reason: watchdog.reason }) } : null,
      // the run's Chrome as its end stopped it (pids it spawned: terminated, killed, still running), and its session bus
      ...(ending.chrome ? { chrome: { spawned: ending.chrome.spawned.length, terminated: ending.chrome.terminated, killed: ending.chrome.killed, left: ending.chrome.left } } : {}),
      ...(ending.session ? { session: ending.session } : {}),
      record: record.skipped ? { skipped: record.skipped } : { clean: record.clean, requests: record.requests, mutating: record.mutating, foreign: record.foreign.slice(0, 10).map(foreignLine), ...(record.foreign.length ? { first_foreign: record.foreign.slice(0, 5).map(({ client, what, window, text }) => ({ client, what, window, request: text })) } : {}), unplaced: record.unplaced ?? 0, unattributed: record.unattributed ?? null, ...(record.error ? { error: record.error } : {}) },
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
    // started at its first use, after `begin`: on a private display it then runs under the run's session bus
    this.readerBin = cua;
    this.ownReader = reader ?? null;
    // the run's Chrome (chrome.mjs), made at the first Chrome window; the run's session bus on a private display
    this.chrome = null;
    this.session = null;
    // whether the run's display is a private one the harness marked (`begin`); until known, it counts as a person's
    this.isPrivate = null;
    // the watchdog's own directory, for a run that keeps no results (`watchdogFile`)
    this.watchdogDir = null;
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
    // the engines' operations on windows (engine.mjs `watchOperations`), the reader's reads aside: the spans during
    // which a window's client's popups are that window's (foreign.mjs `judgeForeign`)
    this.operations = [];
    // what the harness left undone because the window it would have acted on was not the run's then: `{what, window,
    // reason}`, recorded in the run's end row
    this.skips = [];
    // the window active before the run opened anything (read by `begin`, once its watchdog answered); it is recorded,
    // never activated again
    this.startActive = startActive ?? null;
    this.holder = null;
    this.trace = null;
    // what the run's end records (`closeEverything`): the start and end active windows, the holder, the trace's audit
    this.ending = null;
    // the opens in flight, and whether the run is stopping: then no window is asked for any more
    this.opening = new Set();
    this.stopping = false;
    // the run's start while it is in flight (`begin`): a stop waits for it
    this.starting = null;
    // a run stopped by SIGINT or SIGTERM closes what it opened, as one that ends does (stop.mjs)
    this.stopHooks = [];
    this.unhookStop = cleanupOnStop(() => this.stop());
  }

  /** The harness's own reader (one cua-engine process), started at its first use. */
  get reader() {
    this.ownReader ??= new Engine({ label: 'reader', bin: this.readerBin }).start();
    return this.ownReader;
  }

  set reader(reader) {
    this.ownReader = reader;
  }

  /**
   * The run's start. First the watchdog, on every display, before anything of the run's reads or touches the display
   * (task 44): a display that does not answer its first round trip fails the start here. Then the windows already on
   * the display (never the run's) and the window active (never acted on), on a private display the run's own session
   * bus (every process the run starts from then on inherits it) and the whole run's record, its own trace, through
   * which every X tool of the harness's then connects (xtools.mjs), and, when the window found active is foreign, the
   * holder opened and activated before anything else. A start that fails ends what it began, the watchdog last.
   * A stop during the start (a signal's, stop.mjs) waits for it: the start sees the stop after each step it awaited,
   * ends what it acquired the same way, starts nothing more and fails, so nothing of the run's outlives the stop; a
   * run stopped before it begins starts nothing. `startTrace`, `startRecord`, `startSession`, `startWatchdog`,
   * `privateDisplay` and `existing` are the display-free tests' own. Returns the window found active, marked.
   */
  begin(options = {}) {
    if (this.stopping) return Promise.reject(new Error('the harness was stopped before the run began: nothing of it starts'));
    this.starting = this.runStart(options);
    return this.starting;
  }

  /** `begin`'s work, which `stop` waits for. */
  async runStart({ startTrace = startProxy, startRecord = startRunRecord, existing = allWindows, privateDisplay = () => isPrivateDisplay(), startWatchdog = startRunWatchdog, startSession = startPrivateSession }) {
    // A signal's stop (stop.mjs) runs only once node reads the signal, in an event loop turn's I/O poll, and a stage
    // whose start ends synchronously (the session bus's `busctl` calls) gives it no turn: checked straight away, a
    // stop landing there was seen only after the next stage had started (task 46). So the check first lets two turns
    // pass: the first may be finishing the very turn whose poll came before the signal; the second polls after it.
    const unlessStopped = async () => {
      await new Promise(setImmediate);
      await new Promise(setImmediate);
      if (this.stopping) throw new Error('the harness was stopped while the run was starting: nothing more of it starts');
    };
    this.unwatchOperations = watchOperations(({ engine, window, start, end }) => {
      if (engine !== this.ownReader) this.operations.push({ window, start, end });
    });
    // a stall stops the run, killing the record client first (task 41)
    try {
      this.watchdog = await startWatchdog({ display: process.env.DISPLAY, file: this.watchdogFile() });
    } catch (error) {
      this.dropWatchdogDir();
      throw error;
    }
    try {
      await unlessStopped();
      this.root = rootWindow();
      this.preexisting = new Set(existing());
      this.startActive ??= activeWindow();
      const isPrivate = privateDisplay();
      // what the run's applications are launched for from now on (`appEnvironment`): a display a person uses, unless marked
      this.isPrivate = isPrivate;
      // a private display's run under a session bus of its own, before anything of the run's starts (task 43); its
      // launcher with the run's home and its settings in memory, so its accessibility switch is the run's (task 45)
      if (isPrivate) {
        const session = await startSession({ dir: join(this.dir, 'session'), display: process.env.DISPLAY, env: this.appEnvironment({}, { settings: 'memory' }) });
        // never installed on a stopped run: ended here, the environment untouched
        try {
          await unlessStopped();
        } catch (error) {
          await session.stop();
          throw error;
        }
        this.useSession(session);
      }
      // the whole-run record only on a private display: on a person's, the sampled route audits judge the engines;
      // its client guarded from its spawn
      this.record = isPrivate ? await startRecord({ guard: (pid) => this.watchdog.guard(pid) }) : null;
      await unlessStopped();
      // the trace reads no authority file on the harness's own display (audit.mjs, task 46's finding 3)
      this.trace = await startTrace({ privateDisplay: isPrivate });
      await unlessStopped();
    } catch (error) {
      try {
        await this.trace?.stop();
      } catch {
        // its proxy already gone: nothing of it is judged for a run that did not begin
      }
      this.trace = null;
      await this.record?.stop();
      this.record = null;
      await this.endSession();
      await this.stopWatchdog();
      throw error;
    }
    useHarnessDisplay(this.trace.env);
    if (this.ownerOf(this.startActive) === 'foreign') await this.openHolder();
    return this.activeRecord(this.startActive);
  }

  /**
   * The run's session bus in use: every process the run starts from now on (the scene applications, Chrome, the
   * engines, the reader, `busctl`) inherits its address in place of the person's. The harness's own processes also get
   * the run's accessibility bus as `AT_SPI_BUS_ADDRESS` in place of an inherited one, the person's (with no accessibility
   * bus of the session's own, the variable is removed, so the display's property decides); applications are handed
   * none at all (app-env.mjs: the display's `AT_SPI_BUS` names the run's, and with the variable set Qt 6 registers no
   * tree).
   */
  useSession(session) {
    this.session = session;
    this.sessionSaved = Object.fromEntries(SESSION_ENV.map((name) => [name, { had: name in process.env, value: process.env[name] }]));
    process.env.DBUS_SESSION_BUS_ADDRESS = session.address;
    if (session.a11y) process.env.AT_SPI_BUS_ADDRESS = session.a11y;
    else delete process.env.AT_SPI_BUS_ADDRESS;
  }

  /** The run's session bus ended, and the harness's own variables as they were found. Answers what the stop did. */
  async endSession() {
    if (!this.session) return null;
    for (const [name, { had, value }] of Object.entries(this.sessionSaved)) {
      if (had) process.env[name] = value;
      else delete process.env[name];
    }
    const session = this.session;
    this.session = null;
    return { address: session.address, a11y: session.a11y ?? null, ...(await session.stop()) };
  }

  /**
   * Where the run's watchdog writes its lines (its `stall` line included): beside the run's results, or in a directory of
   * its own, which goes once the watchdog has stopped (`stopWatchdog`; a run without results keeps no evidence).
   */
  watchdogFile() {
    if (this.logs) return join(dirname(this.logs), 'watchdog.jsonl');
    this.watchdogDir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-'));
    return join(this.watchdogDir, 'watchdog.jsonl');
  }

  /** The run's watchdog's own directory removed, when it has one. */
  dropWatchdogDir() {
    if (this.watchdogDir) rmSync(this.watchdogDir, { recursive: true, force: true });
    this.watchdogDir = null;
  }

  /** The run's watchdog stopped, then its own directory removed. Answers the watchdog's verdict. */
  async stopWatchdog() {
    try {
      return await this.watchdog.stop();
    } finally {
      this.dropWatchdogDir();
    }
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

  /** A window's title now (`xdotool getwindowname`), or null when there is no such window. */
  windowTitle(id) {
    try {
      return xdotool('getwindowname', id);
    } catch {
      return null;
    }
  }

  /**
   * Whether a scene's window is still the one the run opened: alive, and titled with the scene's label, which carries
   * the run's nonce. A window closed by another (the person) may have given its id to a window of theirs.
   */
  stillOurs(scene) {
    const title = scene.id ? this.windowTitle(scene.id) : null;
    return typeof title === 'string' && title.includes(scene.label);
  }

  /** Whether `id` is a window of the run's open now, and still the one it opened (`stillOurs`): the run's to act on. */
  liveOwned(id) {
    const scene = this.windows.find((w) => w.id === id);
    return Boolean(scene) && this.stillOurs(scene);
  }

  /** Something the harness did not do, and why: the run's end row records it. */
  skip(what, window, reason) {
    this.skips.push({ what, window: typeof window === 'number' ? `0x${window.toString(16).padStart(8, '0')}` : window, reason });
  }

  /**
   * The top window at a screen point and, among `ids`, the window it holds (`xprobe top-at`): `{top, holds}`, top 0 for
   * none (the root).
   */
  topAt(point, ids) {
    return JSON.parse(xprobe(['top-at', point.x, point.y, ...ids]));
  }

  /**
   * Whether the pointer may go to a screen point: nothing there but the root, or a live window of the run's (its window
   * manager's frame included) on top there. Read just before the move: another's popup over the point says no.
   */
  pointerSafeAt(point) {
    const ids = this.windows.map((w) => w.id).filter((id) => Number.isSafeInteger(id) && id > 0);
    const { top, holds } = this.topAt(point, ids);
    if (!top) return true;
    return typeof holds === 'number' && this.liveOwned(holds);
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
    // a start in flight first: it ends what it acquired once it sees the stop (`begin`)
    await Promise.allSettled([this.starting, ...this.opening]);
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
   * failure (#268). stdin and stdout are discarded; without a log directory, everything is, as before. Never Chrome:
   * Chrome starts only as the run's own instance (`openChrome`, chrome.mjs). Its environment is the run's
   * (`appEnvironment`): `env` holds only the application's own variables, and `home: 'xdg'` keeps the harness's HOME
   * for a family a separate HOME breaks.
   */
  spawnApp(label, cmd, args, { stdout = 'ignore', env: extra = {}, home = 'run', ...options } = {}) {
    if (isChromeCommand(cmd)) throw new Error(`refusing to start ${cmd} as a scene application: Chrome starts only as the run's own instance, on the run's profile (chrome.mjs), so it never hands a window to, starts on, or takes over a person's Chrome or profile`);
    // built before anything is opened: an environment it refuses starts nothing
    const env = this.appEnvironment(extra, { home });
    let fd = null;
    if (this.logs) {
      mkdirSync(this.logs, { recursive: true });
      fd = openSync(join(this.logs, `${label}.stderr`), 'a');
    }
    try {
      // `stdout: 'pipe'` for a scene program that reports on it (pages/identity-windows.py)
      const child = spawn(cmd, args, { ...options, env, stdio: ['ignore', stdout, fd === null ? 'ignore' : fd], detached: true });
      child.unref();
      return child;
    } finally {
      // the child holds its own copy
      if (fd !== null) closeSync(fd);
    }
  }

  /**
   * The environment of every application the run launches (app-env.mjs), scene applications and the run's Chrome alike:
   * the run's home, made here at its first use, under the run's scratch directory, which goes at the run's end; the
   * display and buses as the harness has them now (a private display's session sets the buses, `useSession`); settings
   * in memory unless the display is a private one (`settings: 'memory'` for the run's own session bus, whose launcher
   * keeps the run's accessibility switch). `extra`: the application's own variables.
   */
  appEnvironment(extra = {}, { home = 'run', settings } = {}) {
    const homes = runHome(this.dir);
    for (const name of HOME_VARS) mkdirSync(homes[name], { recursive: true, mode: 0o700 });
    return launchEnvironment({ scratch: this.dir, base: process.env, privateDisplay: this.isPrivate === true, home, ...(settings ? { settings } : {}), extra });
  }

  /**
   * Refuses a Qt application, before it starts, when it would put no tree on the accessibility bus: the session's
   * `org.a11y.Status` switches both off (a11y-status.mjs), read from the run's own bus on a private display and from the
   * person's on any other, where the harness only reads them, and no `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` in `env`.
   * `read` is the display-free tests' own.
   */
  assertQtBridge(what, env = {}, read = readStatus) {
    const address = a11yAddress(this);
    const where = address ? "the run's own session bus" : "the person's session bus";
    let status;
    try {
      status = read({ address });
    } catch (error) {
      throw new Error(`refusing to start ${what}: org.a11y.Status could not be read on ${where} (${error.message.split('\n')[0]}), so whether a Qt application would put its tree on the accessibility bus is unknown`);
    }
    const refusal = qtBridgeRefusal(status, env, where);
    if (refusal) throw new Error(`refusing to start ${what}: ${refusal}`);
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

  /**
   * A Chrome window closed as Chrome's own close does (WM_DELETE_WINDOW): one window of the run's Chrome, which itself is
   * stopped at the run's end (`closeEverything`).
   */
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

  /** The run's Chrome (chrome.mjs): one instance on a profile in the run's scratch directory, made at its first use. */
  chromeInstance() {
    this.chrome ??= new ChromeInstance({ scratch: this.dir, environment: () => this.appEnvironment() });
    return this.chrome;
  }

  /** A window of the run's Chrome on one of the harness's pages, its title unique to this window. */
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
      // the run's own Chrome: the first open starts it on the run's profile, later ones hand it the URL
      this.chromeInstance().open(url);
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

  /**
   * The identity scene (M4's T5, identity.mjs; Acceptance 7): `count` windows with one title, unique to the run, and one
   * size, each showing its own marker (`<label>-<n>`), so a read shows which window it read while the X11 titles and
   * sizes leave the windows indistinguishable. `toolkit`: `chrome`, windows of the run's Chrome on
   * pages/identity.html, opened one at a time, each found as the one window of the title not found before; or `gtk3`
   * or `gtk4`, one process of pages/identity-windows.py, which reports each window's marker and X11 id once it is
   * mapped. Every window is registered as the run's own as soon as it is known; the scene is `{kind: 'identity',
   * toolkit, label, title, id (the first window's), windows: [{id, marker, label}], size, pid?, marksActive}`, its
   * windows placed apart.
   */
  openDuplicates(role, toolkit, { count = 3 } = {}) {
    this.assertOpen();
    return this.track(async () => {
      const label = this.label('identity', toolkit, role);
      const [w, h] = GEOMETRY.identity;
      const windows = [];
      let title = label;
      let pid = null;
      if (toolkit === 'chrome') {
        title = `${label} - Google Chrome`;
        for (let n = 1; n <= count && !this.stopping; n++) {
          // registered before Chrome is asked for it, by the title: a stop meanwhile closes it by that title
          const win = { kind: 'chrome', role: `${role}_${n}`, label, page: 'identity.html', title, id: null, marker: `${label}-${n}` };
          this.windows.push(win);
          const url = `${pathToFileURL(join(PAGES, 'identity.html')).href}?marker=${encodeURIComponent(win.marker)}#${encodeURIComponent(label)}`;
          // the run's own Chrome, as `openChrome`'s windows are
          this.chromeInstance().open(url);
          const known = new Set(windows.map((x) => x.id));
          try {
            win.id = (await this.waitForWindow((x) => x.title === title && !known.has(x.id), win.marker, 30000)).id;
          } catch (error) {
            await this.close([win]);
            throw error;
          }
          windows.push(win);
        }
      } else {
        // a Qt fixture's tree needs the session's accessibility switch on, which the harness never sets on a person's display
        if (toolkit === 'qt5' || toolkit === 'qt6') this.assertQtBridge(label);
        const child = this.spawnApp(label, 'python3', ['-I', join(PAGES, 'identity-windows.py'), toolkit, label, label, count, w, h], { stdout: 'pipe' });
        pid = child.pid;
        // one entry per window, the process's: a stop or a window that never comes ends the process
        const pending = { kind: 'fixture', role, label, pid, id: null };
        this.windows.push(pending);
        const reported = [];
        const lines = createInterface({ input: child.stdout });
        lines.on('line', (line) => {
          try {
            reported.push(JSON.parse(line));
          } catch {
            // not a report
          }
        });
        const deadline = Date.now() + 20000;
        while (reported.length < count && Date.now() < deadline && !this.stopping) await sleep(100);
        lines.close();
        child.stdout.destroy();
        if (reported.length < count) throw new Error(`${label} reported ${reported.length} of its ${count} windows`);
        this.windows = this.windows.filter((x) => x !== pending);
        for (const { marker, xid } of reported.sort((a, b) => a.marker - b.marker)) {
          const win = { kind: 'fixture', role: `${role}_${marker}`, label, pid, id: xid, marker: `${label}-${marker}` };
          this.windows.push(win);
          this.foundNow(xid);
          windows.push(win);
        }
      }
      const scene = { kind: 'identity', toolkit, role, label, title, id: windows[0]?.id ?? null, windows, size: [w, h], pid, marksActive: toolkit !== 'chrome' };
      if (this.stopping) return scene;
      windows.forEach((win, n) => configure(win.id, n === 1 ? 640 : 0, n === 2 ? 400 : 0, w, h));
      await this.waitForFrames(scene);
      return scene;
    });
  }

  /**
   * Waits, at most 30 s, until the scene's process shows a frame of the scene's title for each of its windows, read by
   * the harness's own reader of the bus (oracle.mjs), independent of any engine; then, for Chrome, whose page fills its
   * frame a moment later, while the reader's read of a window answers its tree without the window's marker yet. A
   * reader that does not tell the windows apart (an engine under test as a control) ends that wait at once. Not
   * finding them is the cases' to fail, not the scene's: the scene is returned all the same, with `frames_ready`.
   */
  async waitForFrames(scene) {
    const oracle = await this.ensureOracle();
    const pid = scene.pid ?? Number(execFileSync('xprop', ['-id', String(scene.id), '_NET_WM_PID'], { encoding: 'utf8' }).match(/(\d+)\s*$/)?.[1]);
    const deadline = Date.now() + 30000;
    scene.frames_ready = false;
    while (Date.now() < deadline && !this.stopping) {
      try {
        const frames = oracle.appsOf(pid).flatMap((app) => oracle.children(app)).filter((f) => oracle.name(f) === scene.title);
        if (frames.length >= scene.windows.length) {
          scene.frames_ready = true;
          break;
        }
      } catch {
        // read again
      }
      await sleep(500);
    }
    if (scene.toolkit !== 'chrome') return;
    for (const win of scene.windows) {
      while (Date.now() < deadline && !this.stopping) {
        const { response } = await this.reader.request('get_window_state', { window: { id: win.id }, include_screenshot: false });
        if (!response.ok || response.output.ax_tree_source !== 'at_spi') break;
        if (preorder(response.output.ax_tree).some((n) => n.name === `marker ${win.marker}`)) break;
        await sleep(300);
      }
    }
  }

  /** The harness's own reader of the accessibility bus (oracle.mjs), made once. */
  async ensureOracle() {
    const { Oracle } = await import('./oracle.mjs');
    this.oracle ??= new Oracle();
    return this.oracle;
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
   * Closes some of the harness's windows: Chrome's with WM_DELETE_WINDOW (the run's Chrome itself is stopped at the
   * run's end), an application the harness started as its own process group (`group`) by signalling the group, the rest
   * by PID.
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
        if (scene.kind === 'chrome') {
          if (scene.id) {
            // the window it found, closed only while it is still that window: never registered again here
            if (this.stillOurs(scene)) this.closeWindow(scene.id);
            else this.skip('close', scene.id, 'no longer the window the run opened: closed by another, its id perhaps given to a window of theirs');
          } else {
            // a Chrome window not found yet: whatever came up with its exact title, unique to the run, found now
            for (const id of this.findByTitle(scene.title)) {
              this.adopted.add(id);
              this.foundNow(id);
              this.closeWindow(id);
            }
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
   * activated again (it is foreign: nothing of the run's was open then). Then the run's Chrome is stopped by the pids it
   * spawned (chrome.mjs `stop`), and the run's session bus. A run that began records `ending`: the start and end active
   * windows, each marked, the holder, the Chrome and the session bus it stopped, and the audit of its trace, which
   * covers this cleanup too.
   */
  async closeEverything() {
    await this.close(this.windows.filter((w) => w !== this.holder));
    await this.ownReader?.close();
    // the holder last: until here the window manager's fallback lands on it; after it, the window manager chooses
    if (this.holder && this.windows.includes(this.holder)) await this.close([this.holder]);
    this.chromeEnding = this.chrome ? await this.chrome.stop() : null;
    this.sessionEnding = await this.endSession();
    rmSync(this.dir, { recursive: true, force: true });
    this.pruneLogs();
    if (this.trace) this.ending = await this.finishTrace();
    this.unwatchOperations?.();
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
    const spans = this.operations;
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
    if (!this.record) {
      // not run on purpose (task 41): a person's display gets the sampled route audits
      record = { skipped: RECORD_REFUSAL, clean: true, traced: false, requests: 0, mutating: 0, foreign: [] };
    } else {
      try {
        const judged = await this.record.stop({
          parse: async (file) => {
            const audit = await auditRecordFile(file, { registered, root: this.root, spans });
            // a record that failed is kept as the run's evidence, compressed (window ids, atoms and processes, no text)
            if (!audit.clean && this.logs) await pipeline(createReadStream(file), createGzip(), createWriteStream(join(dirname(this.logs), 'record.jsonl.gz')));
            return audit;
          },
        });
        record = typeof judged === 'string' ? auditRecord(judged, { registered, root: this.root, spans }) : judged;
      } catch (error) {
        record = { clean: false, traced: false, requests: 0, mutating: 0, foreign: [], error: error.message };
      }
    }
    // the watchdog last: it guarded the cleanup too
    const watchdog = this.watchdog ? await this.stopWatchdog() : null;
    return { start: this.activeRecord(this.startActive), end: end === null ? null : this.activeRecord(end), holder: this.holder?.id ?? null, audit, record, watchdog, skipped: this.skips, chrome: this.chromeEnding ?? null, session: this.sessionEnding ?? null };
  }
}
