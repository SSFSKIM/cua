// The harness's own Chrome (#171 M4, task 43). Every Chrome window a run opens belongs to one Chrome instance the run
// starts itself, on a profile it creates under the run's scratch directory, and stops at its end. A Chrome started
// without --user-data-dir takes the default profile (~/.config/google-chrome): it hands its window to the person's
// running Chrome, or, on another display, starts a browser on the person's profile, and when the person's Chrome does
// not answer the profile's singleton handshake (a frozen display), the newcomer kills it and takes the profile. That
// is how a harness run on a private display ended the owner's Chrome (2026-11-02, 18:46). So:
// - `ChromeInstance` is the one launcher: each open passes the run's --user-data-dir, so the first starts the run's
//   browser and later ones hand their window to it (the singleton of the run's profile, never the person's);
// - `assertOwnChrome` refuses any Chrome command line whose profile is not a directory inside the run's scratch,
//   and `Desktop.spawnApp` refuses Chrome altogether (scenes.mjs), so no window reaches Chrome another way;
// - the run's end stops the instance by the pids it spawned, each only while its command line carries the run's
//   --user-data-dir and names no child process type: never by name, never any other Chrome. The profile goes after.

import { spawn as spawnProcess } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

/** What the harness runs to start Chrome: the distribution's wrapper on the PATH, as a person starts it. */
export const CHROME_COMMAND = 'google-chrome';

/** Every command that starts a Chrome or Chromium browser, by its file name: only `ChromeInstance` runs one. */
export const CHROME_COMMANDS = new Set(['google-chrome', 'google-chrome-stable', 'google-chrome-beta', 'google-chrome-unstable', 'chrome', 'chromium', 'chromium-browser']);

export const isChromeCommand = (cmd) => CHROME_COMMANDS.has(basename(String(cmd)));

/**
 * What a fresh profile needs to behave as the person's Chrome did for the scenes, and to reach nothing of theirs. No
 * flag here changes how Chrome renders, schedules or takes input: the scenes measure covered, background windows.
 */
export const CHROME_FLAGS = [
  // no welcome page, sign-in or privacy prompt over the first window
  '--no-first-run',
  // no default-browser bar, and no read of the person's default browser through xdg-settings
  '--no-default-browser-check',
  // the search engine dialog a new profile gets in some regions
  '--disable-search-engine-choice-screen',
  // the profile's secrets in the profile, never the person's keyring (gnome-keyring, KWallet), which can prompt
  '--password-store=basic',
  // the pages' AT-SPI trees: the person's Chrome ran with it (Electron's tree needs it too, M0.4)
  '--force-renderer-accessibility',
];

// Chromium reads a switch with one dash or two, and none after a bare `--`.
const PROFILE_SWITCH = /^--?user-data-dir(?:=(.*))?$/s;

/** The `--user-data-dir` values a Chrome command line gives (`undefined` for one without `=`). */
export function profileSwitches(args) {
  const values = [];
  for (const arg of args.map(String)) {
    if (arg === '--') break;
    const m = PROFILE_SWITCH.exec(arg);
    if (m) values.push(m[1]);
  }
  return values;
}

/**
 * Throws unless `cmd` is no Chrome, or its arguments name exactly one profile (`--user-data-dir=<dir>`) that is an
 * existing directory, not a symbolic link, whose real path lies inside the run's scratch directory `scratch`.
 */
export function assertOwnChrome(cmd, args, scratch) {
  if (!isChromeCommand(cmd)) return;
  const refuse = (why) => {
    throw new Error(`refusing to start ${basename(String(cmd))}: ${why}. The harness runs only a Chrome of its own, on a profile it created inside the run's scratch directory, so it never hands a window to, starts on, or takes over a person's Chrome or profile`);
  };
  if (!scratch) refuse('the run has no scratch directory');
  const values = profileSwitches(args);
  if (values.length === 0) refuse('it names no --user-data-dir, so Chrome would take the default profile');
  if (values.length > 1) refuse('it names more than one --user-data-dir');
  const [dir] = values;
  if (!dir) refuse('its --user-data-dir has no value (Chrome reads only --user-data-dir=<dir>), so Chrome would take the default profile');
  if (!isAbsolute(dir)) refuse(`its --user-data-dir ${dir} is not an absolute path`);
  let real;
  let base;
  try {
    if (lstatSync(dir).isSymbolicLink()) refuse(`its --user-data-dir ${dir} is a symbolic link`);
    real = realpathSync(dir);
    base = realpathSync(scratch);
  } catch (error) {
    if (error.message.startsWith('refusing')) throw error;
    refuse(`its --user-data-dir ${dir} is not an existing directory, or the scratch directory ${scratch} is not`);
  }
  if (!lstatSync(real).isDirectory()) refuse(`its --user-data-dir ${dir} is not a directory`);
  const rel = relative(base, real);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) refuse(`its --user-data-dir ${dir} is not inside the run's scratch directory ${scratch}`);
}

/** A process's arguments (`/proc/<pid>/cmdline`), or null when there is no such process to read. */
export function procCmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The run's Chrome: its profile `<scratch>/chrome-profile`, made at the first open; every open one `google-chrome`
 * process with the same profile, the first becoming the browser and each later one handing its window to it and
 * exiting (or becoming the browser itself, if the run's browser had quit when its last window closed). `spawn`,
 * `cmdline` and `kill` are the display-free tests' own.
 */
export class ChromeInstance {
  constructor({ scratch, spawn = spawnProcess, cmdline = procCmdline, kill = (pid, signal) => process.kill(pid, signal) }) {
    this.scratch = scratch;
    this.profile = join(scratch, 'chrome-profile');
    this.spawnProcess = spawn;
    this.cmdline = cmdline;
    this.kill = kill;
    // every pid an open started: the browser among them, whichever open started it
    this.spawned = [];
    this.stopped = null;
  }

  /** The command line of an open of `url`. */
  args(url) {
    return [...CHROME_FLAGS, `--user-data-dir=${this.profile}`, '--new-window', url];
  }

  /** Asks the run's Chrome for a window on `url` (starting the browser on the first open). */
  open(url) {
    if (this.stopped) throw new Error("the run's Chrome is stopped: no window is opened now");
    mkdirSync(this.profile, { recursive: true, mode: 0o700 });
    const args = this.args(url);
    assertOwnChrome(CHROME_COMMAND, args, this.scratch);
    const child = this.spawnProcess(CHROME_COMMAND, args, { stdio: 'ignore', detached: true });
    // a Chrome that cannot start shows as a window that never comes, which the open's wait reports
    child.on?.('error', () => {});
    child.unref?.();
    if (Number.isSafeInteger(child.pid)) this.spawned.push(child.pid);
    return child;
  }

  /**
   * Whether `pid` is a browser process of this instance now: its command line carries exactly the run's
   * --user-data-dir and names no child process type (a renderer or the zygote carries the profile too).
   */
  owns(pid) {
    const argv = this.cmdline(pid);
    if (!argv) return false;
    const profiles = profileSwitches(argv);
    return profiles.length === 1 && profiles[0] === this.profile && !argv.some((a) => a.startsWith('--type='));
  }

  /**
   * The run's end: every pid it spawned that is still a browser of its profile gets SIGTERM, and SIGKILL if it is
   * still one after `graceMs` (checked again just before). Then the profile is removed. Returns what it did:
   * `{profile, spawned, terminated, killed, left}`; `left`: pids still running the profile, which are reported.
   */
  stop({ graceMs = 10000, killMs = 3000 } = {}) {
    this.stopped ??= (async () => {
      const record = { profile: this.profile, spawned: [...this.spawned], terminated: [], killed: [], left: [] };
      for (const pid of this.spawned) {
        if (!this.owns(pid)) continue;
        try {
          this.kill(pid, 'SIGTERM');
          record.terminated.push(pid);
        } catch {
          // gone meanwhile
        }
      }
      const running = () => record.terminated.filter((pid) => this.owns(pid));
      const deadline = Date.now() + graceMs;
      while (running().length && Date.now() < deadline) await sleep(100);
      for (const pid of running()) {
        try {
          this.kill(pid, 'SIGKILL');
          record.killed.push(pid);
        } catch {
          // gone meanwhile
        }
      }
      const killDeadline = Date.now() + killMs;
      while (running().length && Date.now() < killDeadline) await sleep(100);
      record.left = running();
      rmSync(this.profile, { recursive: true, force: true });
      return record;
    })();
    return this.stopped;
  }
}
