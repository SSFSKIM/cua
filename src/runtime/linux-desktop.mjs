// What the Linux computer surface needs from the desktop session, read from outside for `cua doctor` (in place of the
// darwin helper.live and helper.permissions rows). Each check runs one bounded system command and never touches the
// runtime, its helper or the user's apps:
//   display            DISPLAY is set and `xdpyinfo` lists the X extensions the vendor helper (sky_linux) needs:
//                      XTEST (input), Composite (window capture) and XFIXES (cursor image)
//   accessibility.bus  the session bus answers ListNames and AT-SPI's org.a11y.Bus is on it, or activatable on it (a
//                      minimal session starts it on first use); without it accessibility trees fall back to X11
//                      window-level only
//   sandbox.userns     `bwrap --ro-bind / / true` exits 0: bubblewrap can create an unprivileged user namespace. The
//                      runtime's sandbox (the pinned `codex`) uses system bubblewrap (its legacy Landlock path is the
//                      other one; which it takes when bwrap fails is unverified), and Ubuntu 23.10 and later restrict
//                      these namespaces through AppArmor (kernel.apparmor_restrict_unprivileged_userns). The row says
//                      what bubblewrap did, not whether the runtime's sandbox starts
// A missing tool reads `blocked` naming it and its package (missing_tool); a display or bus that is absent, refuses or
// lacks what the helper needs is `fail`; a sandbox refusal is `blocked` with bubblewrap's own words, because whether to
// lift the restriction (or run with CUA_SHIM_SANDBOX=disabled) is the owner's call.
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {findTool as findOnPath} from './tools.mjs';

export const X_EXTENSIONS = ['XTEST', 'Composite', 'XFIXES'];
const A11Y_BUS = 'org.a11y.Bus';
const PROBE_TIMEOUT_MS = 5000;

// The session bus the runtime and doctor use: DBUS_SESSION_BUS_ADDRESS, else the systemd user bus under
// XDG_RUNTIME_DIR (an SSH session has the latter and not the former), else none.
export function sessionBusAddress(env) {
  if (env.DBUS_SESSION_BUS_ADDRESS) return env.DBUS_SESSION_BUS_ADDRESS;
  return env.XDG_RUNTIME_DIR ? `unix:path=${env.XDG_RUNTIME_DIR}/bus` : undefined;
}

// The desktop session a Linux runtime (or the login CLI's browser opener) needs from the caller's environment: the X11
// display and its cookie, the session bus (derived from XDG_RUNTIME_DIR when an SSH session lacks the address), and
// where app discovery reads .desktop entries. Copied when set; nothing else.
const DESKTOP_SESSION_KEYS = ['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];
export function desktopSessionEnv(ambient) {
  const env = {};
  for (const key of DESKTOP_SESSION_KEYS) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  const bus = sessionBusAddress(env);
  if (bus) env.DBUS_SESSION_BUS_ADDRESS = bus;
  return env;
}

const result = (name, status, detail) => ({name, status, detail});
const lastLine = text => String(text ?? '').trim().split('\n').at(-1) || 'no output';
const missing = (name, tool, pkg, what) => result(name, 'blocked', `missing_tool: ${tool} is not installed, so ${what} cannot be checked; install ${pkg} (sudo apt-get install ${pkg})`);

function defaultExec(command, args, {env}) {
  return new Promise(resolve => execFile(command, args, {env, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS},
    (error, stdout, stderr) => resolve({code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: stdout ?? '', stderr: stderr || (error && typeof error.code !== 'number' ? error.message : '')})));
}
const defaultOsRelease = () => { try { return readFileSync('/etc/os-release', 'utf8'); } catch { return ''; } };

// Ubuntu 23.10 and later restrict unprivileged user namespaces through AppArmor.
function restrictsUserns(osRelease) {
  const field = key => osRelease.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm'))?.[1];
  if (field('ID') !== 'ubuntu') return false;
  const [major, minor] = (field('VERSION_ID') ?? '').split('.').map(Number);
  return major > 23 || (major === 23 && minor >= 10);
}

// -> [display, accessibility.bus, sandbox.userns]. `exec`, `findTool` and `osRelease` are test seams.
export async function linuxDesktopChecks({env = process.env, exec = defaultExec, findTool = name => findOnPath(name, env.PATH), osRelease = defaultOsRelease}) {
  return [await displayCheck(env, exec, findTool), await busCheck(env, exec, findTool), await usernsCheck(exec, findTool, osRelease)];
}

async function displayCheck(env, exec, findTool) {
  if (!env.DISPLAY) return result('display', 'fail', 'DISPLAY is not set: the computer surface drives an X11 display (Xorg, Xvfb or a VNC session; Wayland only through XWayland); export DISPLAY (for example :0) where cua runs');
  const xdpyinfo = findTool('xdpyinfo');
  if (!xdpyinfo) return missing('display', 'xdpyinfo', 'x11-utils', `the X extensions of display ${env.DISPLAY}`);
  const run = await exec(xdpyinfo, [], {env: {DISPLAY: env.DISPLAY, ...(env.XAUTHORITY ? {XAUTHORITY: env.XAUTHORITY} : {}), ...(env.HOME ? {HOME: env.HOME} : {})}});
  if (run.code !== 0) return result('display', 'fail', `xdpyinfo could not use display ${env.DISPLAY} (${lastLine(run.stderr)}); check DISPLAY and XAUTHORITY`);
  const lacking = X_EXTENSIONS.filter(ext => !new RegExp(`^\\s+${ext}\\s*$`, 'm').test(run.stdout));
  if (lacking.length) return result('display', 'fail', `X display ${env.DISPLAY} lacks ${lacking.join(', ')}, which the computer-use helper needs (XTEST input, Composite capture, XFIXES cursor)`);
  return result('display', 'pass', `X display ${env.DISPLAY} has XTEST, Composite and XFIXES`);
}

async function busCheck(env, exec, findTool) {
  const address = sessionBusAddress(env);
  if (!address) return result('accessibility.bus', 'fail', 'no session bus: neither DBUS_SESSION_BUS_ADDRESS nor XDG_RUNTIME_DIR is set, so AT-SPI accessibility trees are unreachable');
  const dbusSend = findTool('dbus-send');
  if (!dbusSend) return missing('accessibility.bus', 'dbus-send', 'dbus-bin', `the session bus at ${address}`);
  const ask = method => exec(dbusSend, ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/', `org.freedesktop.DBus.${method}`],
    {env: {DBUS_SESSION_BUS_ADDRESS: address, ...(env.HOME ? {HOME: env.HOME} : {})}});
  const lists = text => text.includes(`"${A11Y_BUS}"`);
  const names = await ask('ListNames');
  if (names.code !== 0) return result('accessibility.bus', 'fail', `the session bus at ${address} did not answer (${lastLine(names.stderr)})`);
  if (lists(names.stdout)) return result('accessibility.bus', 'pass', `AT-SPI (${A11Y_BUS}) is on the session bus at ${address}`);
  const activatable = await ask('ListActivatableNames');
  if (activatable.code === 0 && lists(activatable.stdout)) return result('accessibility.bus', 'pass', `AT-SPI (${A11Y_BUS}) is activatable on the session bus at ${address}; it starts on first use`);
  return result('accessibility.bus', 'fail', `the session bus at ${address} has no AT-SPI (${A11Y_BUS}), running or activatable; install at-spi2-core, or accessibility trees fall back to X11 window-level only`);
}

async function usernsCheck(exec, findTool, osRelease) {
  const bwrap = findTool('bwrap');
  if (!bwrap) return missing('sandbox.userns', 'bwrap', 'bubblewrap', 'whether bubblewrap can create a user namespace');
  const run = await exec(bwrap, ['--ro-bind', '/', '/', 'true'], {env: {PATH: '/usr/bin:/bin'}});
  if (run.code === 0) return result('sandbox.userns', 'pass', 'bubblewrap can create an unprivileged user namespace (bwrap --ro-bind / / true), which the runtime\'s sandbox uses');
  const ubuntu = restrictsUserns(osRelease())
    ? '; Ubuntu restricts unprivileged user namespaces: set kernel.apparmor_restrict_unprivileged_userns=0 (sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0) or install an AppArmor profile allowing userns for the release\'s codex'
    : '';
  return result('sandbox.userns', 'blocked', `bubblewrap could not create an unprivileged user namespace: bwrap --ro-bind / / true failed (${lastLine(run.stderr)})${ubuntu}; or choose CUA_SHIM_SANDBOX=disabled`);
}
