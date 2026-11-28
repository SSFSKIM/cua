// The supervisor's half of the trusted worker's `nodeRepl.launchServices.openApplication`
// (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Trusted services and privileged APIs"; the
// worker's half normalizes the target, NR:privileged-node-repl.js:455-472,603-631). The worker sends
// `launch_services_action {id, exec_id, action: 'open_application', application_path?, bundle_identifier?}`; the
// supervisor opens the application outside every sandbox and answers `privileged_result`.
//
// macOS: through LaunchServices (`/usr/bin/open -n -g -a <path>` or `-b <bundle id>`, the OS boundary, injectable). A
// path opens as a new instance (`-n`: LaunchServices would otherwise hand the request to a running copy of the same
// bundle id and launch nothing) in the background (`-g`: the launch never takes the user's focus), which is how cua's
// native engine service starts the approved engine (#117, docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "Process model"; the engine's lock makes the loser of two simultaneous launches exit). Sentences are the vendor
// supervisor's (recovered, docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md "Gaps" 5)
// where they exist.
//
// Linux (#115 M3, docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "Linux computer sessions"): the
// trusted worker runs confined, and an application sky_linux fork/execs inside its sandbox dies at start (#115 M0's
// probe: MIT-SHM and a read-only dconf), so cua's sky wrapper (src/services/sky.mjs) sends `launch_app` here as the
// application's desktop entry, which is launched with `gio launch` in a session of its own (it is never in the
// supervisor's process group, which the reaper may clear) and with the desktop session's environment only. The entry
// must be a `.desktop` file whose real path lies in an `applications/` directory of the supervisor's own XDG data
// directories ($XDG_DATA_HOME or ~/.local/share, then $XDG_DATA_DIRS or /usr/local/share:/usr/share) and in none of
// the sandbox's write roots (`writeRoots`: the session's run directory and temp and what the call's policy makes
// writable, by real path): nothing a cell or the worker can write is ever launched outside the sandbox. The scoped
// preflight refuses a layout whose applications directories overlap a write root (src/runtime/sandbox.mjs).
import {execFile, spawn} from 'node:child_process';
import {accessSync, constants, realpathSync, statSync} from 'node:fs';
import {isAbsolute, join, relative} from 'node:path';

export const PATH_NOT_ABSOLUTE_SENTENCE = 'LaunchServices application path must be absolute';
export const EXACTLY_ONE_SENTENCE = 'LaunchServices open application expected exactly one of application_path or bundle_identifier';
export const DISPATCH_FAILED_PREFIX = 'failed to dispatch LaunchServices open: ';
export const MACOS_ONLY_SENTENCE = 'LaunchServices is available only on macOS';
export const LINUX_ENTRY_REFUSED_PREFIX = 'refused to launch ';
export const LINUX_LAUNCH_FAILED_PREFIX = 'failed to launch the application: ';
const OPEN = '/usr/bin/open';
const GIO = '/usr/bin/gio';
const OPEN_TIMEOUT_MS = 30_000;
// What a launched application inherits: the desktop session it runs in, nothing of cua's (src/runtime/launch.mjs
// copies these from the caller; PATH is cua's fixed one).
const DESKTOP_ENV = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];

// The OS boundary: runs `open` with `args`; rejects with its failure.
export function runOpen(args) {
  return new Promise((resolve, reject) => {
    execFile(OPEN, args, {timeout: OPEN_TIMEOUT_MS, env: {PATH: '/usr/bin:/bin'}}, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || error.message));
      else resolve();
    });
  });
}

// The Linux boundary: `gio launch <entry>` in a new session (`detached`), with `env`; resolves when gio exits having
// asked for the launch (the application lives on outside cua's process tree), rejects with how gio ended.
// The application inherits gio's stdin, stdout and stderr and most keep them open, so all three are /dev/null, as the
// engine's own launch_app gives them (#598): a pipe to cua held the answer until the timeout and, closed, broke the
// application's next write; a file would take its output for its whole life. gio's own words go with them: it ends 1
// on every failure, and launchLinux names the usual ones (the entry missing or unreadable) before gio runs.
export function runGioLaunch(path, env, {gio = GIO, timeoutMs = OPEN_TIMEOUT_MS} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(gio, ['launch', path], {env, detached: true, stdio: 'ignore'});
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const settle = (error, code, signal) => {
      clearTimeout(timer);
      if (error) reject(error);
      else if (timedOut) reject(new Error(`gio launch ${path} did not finish within ${timeoutMs} ms`));
      else if (code !== 0) reject(new Error(`gio launch ${path} ${signal ? `was ended by ${signal}` : `exited with status ${code}`}`));
      else resolve();
    };
    child.once('error', error => settle(error));
    child.once('exit', (code, signal) => settle(null, code, signal));
  });
}

const within = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};
const realOrNull = path => { try { return realpathSync(path); } catch { return null; } };
const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };

// The applications directories of the XDG data directories `env` names, as spelled, whether or not they exist.
export function xdgApplicationRoots(env) {
  const home = isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(env.HOME ?? '/', '.local', 'share');
  const dirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(isAbsolute);
  return [home, ...dirs].map(dir => join(dir, 'applications'));
}

// Those that exist, by real path.
export const xdgApplicationDirs = env => xdgApplicationRoots(env).map(realOrNull).filter(Boolean);

async function launchLinux(message, {launch, env, writeRoots}) {
  const path = message.application_path ?? null;
  if (path === null || message.bundle_identifier != null) throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}anything but a desktop entry's path on Linux`);
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(PATH_NOT_ABSOLUTE_SENTENCE);
  const real = realOrNull(path);
  // An entry where launch_app looks says why it is not launched; one elsewhere is refused without saying whether it exists.
  if (real === null && [...xdgApplicationRoots(env), ...xdgApplicationDirs(env)].some(dir => within(path, dir)))
    throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}${path}: it does not exist`);
  if (real === null || !isFile(real) || !real.endsWith('.desktop') || !xdgApplicationDirs(env).some(dir => within(real, dir)))
    throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}${path}: only a desktop entry in an XDG applications directory is launched`);
  if (writeRoots.map(root => realOrNull(root) ?? root).some(root => within(real, root)))
    throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}${path}: it lies where the sandbox lets JavaScript write, so it is not launched outside it`);
  try {
    accessSync(real, constants.R_OK);
  } catch (error) {
    throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}${path}: it cannot be read (${error.code})`);
  }
  const desktopEnv = Object.fromEntries(DESKTOP_ENV.filter(name => typeof env[name] === 'string').map(name => [name, env[name]]));
  try {
    await launch(real, desktopEnv);
  } catch (error) {
    throw new Error(`${LINUX_LAUNCH_FAILED_PREFIX}${error.message}`);
  }
}

// A `launch_services_action` -> resolves once the OS was asked to open the application; rejects with the sentence the
// worker is answered. `env` is the supervisor's environment (the XDG directories and the desktop session);
// `writeRoots`, the sandbox's write roots for the call (Linux).
export async function launchServicesAction(message, {platform = process.platform, open = runOpen, launch = runGioLaunch, env = process.env, writeRoots = []} = {}) {
  if (message.action !== 'open_application') throw new Error(`unsupported LaunchServices action: ${String(message.action)}`);
  if (platform === 'linux') return launchLinux(message, {launch, env, writeRoots});
  const path = message.application_path ?? null;
  const bundle = message.bundle_identifier ?? null;
  if ((path === null) === (bundle === null)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (path !== null && (typeof path !== 'string' || !isAbsolute(path))) throw new Error(PATH_NOT_ABSOLUTE_SENTENCE);
  if (bundle !== null && (typeof bundle !== 'string' || !bundle)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (platform !== 'darwin') throw new Error(MACOS_ONLY_SENTENCE);
  try {
    await open(path !== null ? ['-n', '-g', '-a', path] : ['-b', bundle]);
  } catch (error) {
    throw new Error(`${DISPATCH_FAILED_PREFIX}${error.message}`);
  }
}
