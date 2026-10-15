// The device side of the native baseline: the `cua serve` command of the parity clone with the native surface and the
// requested REPL host, and the shell scripts the harness runs over ssh around the measurements (attestation, the
// handshake record, the helper, the processes left). Every script goes through topology.mjs's ssh form (BatchMode, the
// pinned node on PATH). The macOS-only scripts are here (HELPER_SCRIPT, leftoverScript); the Linux ones are in
// ./linux.mjs.
import {remoteCommand, quote} from '../browser-parity/topology.mjs';

export const PARITY_CHECKOUT = '$HOME/Developer/GitHub/cua-parity';
// The MCP protocol version the harness asks for; the handshake record is kept per surface set and this version.
export const PROTOCOL_VERSION = '2025-06-18';
export const HOSTS = ['vendor', 'cua'];
const assertHost = host => { if (!HOSTS.includes(host)) throw new Error('host must be vendor or cua'); };
// An X display name (:0, :1.0, localhost:10.0), nothing a shell could read otherwise.
// The own host's Node: an absolute path a shell cannot read otherwise, and only for the cua host (the vendor host runs on
// its pinned Node, so naming one there would change nothing but the baseline's recorded environment).
export function assertOwnNode(host, node) {
  if (node === undefined) return;
  if (host !== 'cua') throw new Error("--node names the own host's Node; the vendor host uses its pinned one");
  if (!/^\/[A-Za-z0-9._\/+-]+$/.test(node) || node.split('/').includes('..')) throw new Error('--node must be the absolute path of a Node executable on the device');
}
export const assertDisplay = display => { if (!/^[A-Za-z0-9.-]*:\d+(\.\d+)?$/.test(display ?? '')) throw new Error('display must be an X display name such as :0'); };

// Native surface only, the REPL host the run measures (explicit, so the selection is never a default that moves under
// the run; the browser service is not a factor with the browser surface off), approvals for the session only, no secret
// store: nothing of the owner's store is read and no approval outlives the connection. On Linux the serve joins the X
// session: its display and the cookie file in the account's home (a path, expanded on the device; the session bus comes
// from the ssh session's XDG_RUNTIME_DIR, src/runtime/linux-desktop.mjs). The script is named by its absolute path, so
// the serve's command line names the checkout and servePattern finds it (and no other checkout's serve, such as the
// resident agent's).
// `node` (cua host only) is the own host's Node, an absolute path on the device passed as CUA_NODE in this command's
// environment, never a shell profile; the serve itself stays on the device's node, as the vendor baseline's did.
export function serveCommand({device, checkout, home, host, platform, display, node}) {
  assertHost(host);
  assertOwnNode(host, node);
  let x = '';
  if (platform === 'linux') { assertDisplay(display); x = ` DISPLAY=${quote(display)} XAUTHORITY="$HOME/.Xauthority"`; }
  const own = node === undefined ? '' : ` CUA_NODE=${quote(node)}`;
  return remoteCommand(device, `cd ${quote(checkout)} && exec env CUA_HOME=${quote(home)} CUA_REPL_HOST=${host}${own} CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off${x} node ${quote(`${checkout}/bin/cua.mjs`)} serve`);
}
// The extended regular expression (for pgrep -f) of a serve that serveCommand started from `checkout`. The bracketed
// [b] keeps it from matching the command line of the shell that runs pgrep with it.
export const servePattern = checkout => `${checkout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[b]in/cua\\.mjs serve`;

// Linux machine facts, pure (embedded in the preflight by their source): the distribution from /etc/os-release and the
// kernel release; the root window's size and depth from xdpyinfo, or null when the display did not answer.
export function osReleaseFacts(text, kernel) {
  const field = key => text.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm'))?.[1] ?? null;
  const name = field('NAME') ?? 'Linux', pretty = field('PRETTY_NAME');
  return {name, version: pretty ? pretty.replace(new RegExp(`^${name} `), '') : field('VERSION'), build: kernel};
}
export function xDisplayFacts(text) {
  const size = /dimensions:\s+(\d+)x(\d+) pixels/.exec(text);
  if (!size) return null;
  return {pixels: `${size[1]} x ${size[2]}`, resolution: `${size[1]} x ${size[2]}`, scale: 1, depth: Number(/depth of root window:\s+(\d+)/.exec(text)?.[1] ?? NaN) || null};
}

// One JSON line: the platform, the clone's commit and cleanliness, the Node that runs the serve (and, given `node`, the
// own host's Node and the version it reports, null when it does not run), the home and runtime
// release a serve there uses, the handshake record's path for the native surface and the selected host
// (src/repl-host/identity.mjs hostIdentity, as src/mcp/lazy-runtime.mjs handshakeRecords keys it), the sandbox policy
// the serve resolves in this environment (src/runtime/sandbox.mjs sandboxModeFrom, computer surface), the machine and what
// is running that the run must know about (a cua-116-spike process, serves of the clone, the scratch app). macOS: model,
// chip, memory, macOS, main display, TextEdit. Linux: CPU and memory, distribution and kernel, the X display (DISPLAY
// `display`, the cookie in the account's home; checked with xdpyinfo, only its size kept), the session bus, gedit.
export function preflightScript({host, display = ':0', node: ownNode}) {
  assertHost(host);
  assertOwnNode(host, ownNode);
  assertDisplay(display);
  // The pattern is servePattern's, for the checkout the script runs in.
  const node = `import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {arch, cpus, homedir, release as kernel, totalmem} from 'node:os';
import {join} from 'node:path';
import {defaultHome, homeLayout, readPointer} from './src/runtime/layout.mjs';
import {hostIdentity} from './src/repl-host/identity.mjs';
import {sandboxModeFrom} from './src/runtime/sandbox.mjs';
const sh = (c, a, env) => { try { return execFileSync(c, a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, ...(env ? {env} : {})}).trim(); } catch { return ''; } };
const read = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const ownNodePath = ${JSON.stringify(ownNode ?? null)};
const home = defaultHome(), release = readPointer(home), id = hostIdentity({host: ${JSON.stringify(host)}, release: release ?? 'none'});
const common = {
  platform: process.platform, node: process.version,
  commit: sh('git', ['rev-parse', 'HEAD']), dirty: sh('git', ['status', '--porcelain']) !== '', checkout: process.cwd(), home, release,
  handshakeRecord: join(homeLayout(home).handshake, release ?? 'none', id.host + '@' + id.version, 'computer@${PROTOCOL_VERSION}.json'),
  runtimeRoot: release ? join(homeLayout(home).runtimes, release) : null,
  spikeRunning: sh('pgrep', ['-f', 'cua-116-[s]pike']) !== '',
  serves: sh('pgrep', ['-f', (${servePattern.toString()})(process.cwd())]).split('\\n').filter(Boolean).length,
  ...(ownNodePath === null ? {} : {ownNode: {path: ownNodePath, version: sh(ownNodePath, ['--version']) || null}}),
  sandbox: (() => { try { return {mode: sandboxModeFrom(process.env, {platform: process.platform, surfaces: ['computer']}), explicit: process.env.CUA_SHIM_SANDBOX !== undefined}; } catch (e) { return {mode: null, error: e.message}; } })(),
};
let own;
if (process.platform === 'linux') {
  const xauthority = join(homedir(), '.Xauthority');
  const x = {...process.env, DISPLAY: ${JSON.stringify(display)}, XAUTHORITY: xauthority};
  const bus = process.env.DBUS_SESSION_BUS_ADDRESS ?? (process.env.XDG_RUNTIME_DIR ? 'unix:path=' + process.env.XDG_RUNTIME_DIR + '/bus' : null);
  own = {
    hardware: {model: read('/sys/devices/virtual/dmi/id/product_name').trim() || null, chip: arch() + ', ' + cpus().length + ' CPUs', memoryBytes: totalmem()},
    os: (${osReleaseFacts.toString()})(read('/etc/os-release'), kernel()),
    display: (${xDisplayFacts.toString()})(sh('xdpyinfo', [], x)),
    x: {display: ${JSON.stringify(display)}, xauthority: '~/.Xauthority', xauthorityPresent: existsSync(xauthority), bus: bus ? bus.replace(homedir(), '~') : null},
    gedit: sh('gedit', ['--version']) || null,
    geditRunning: sh('pgrep', ['-x', 'gedit']) !== '',
  };
} else {
  const displays = JSON.parse(sh('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json']) || '{}').SPDisplaysDataType ?? [];
  const main = displays.flatMap(g => g.spdisplays_ndrvs ?? []).find(d => d.spdisplays_main === 'spdisplays_yes') ?? null;
  const size = text => text?.match(/(\\d+) x (\\d+)/)?.slice(1).map(Number) ?? null;
  const pixels = size(main?._spdisplays_pixels), points = size(main?._spdisplays_resolution);
  own = {
    hardware: {model: sh('/usr/sbin/sysctl', ['-n', 'hw.model']), chip: sh('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']), memoryBytes: Number(sh('/usr/sbin/sysctl', ['-n', 'hw.memsize']))},
    os: {name: sh('/usr/bin/sw_vers', ['-productName']), version: sh('/usr/bin/sw_vers', ['-productVersion']), build: sh('/usr/bin/sw_vers', ['-buildVersion'])},
    display: main ? {pixels: main._spdisplays_pixels ?? null, resolution: points ? points.join(' x ') : null, scale: pixels && points ? pixels[0] / points[0] : null, virtual: /virtual|가상/i.test(main._name ?? '')} : null,
    textEditRunning: sh('/usr/bin/pgrep', ['-x', 'TextEdit']) !== '',
  };
}
console.log(JSON.stringify({...common, ...own}));`;
  return `cd ${PARITY_CHECKOUT} && node --input-type=module -e ${quote(node)}`;
}

// Clears (when asked) and then reports the native surface's handshake record of the selected host (the record of
// <release>/vendor@<release> or <release>/cua@<version>, src/mcp/lazy-runtime.mjs handshakeRecords): "present" or
// "absent".
export function handshakeScript({record, clear}) {
  if (!/\/state\/handshake\/([^/]+)\/(vendor@\1|cua@[A-Za-z0-9._-]*[A-Za-z0-9_-])\/computer@[0-9-]+\.json$/.test(record) || record.includes('/../'))
    throw new Error('not a native handshake record path');
  return `${clear ? `rm -f ${quote(record)} && ` : ''}if [ -f ${quote(record)} ]; then echo present; else echo absent; fi`;
}

// The running computer-use helpers, one per line: elapsed time ([[dd-]hh:]mm:ss) and executable path.
export const HELPER_SCRIPT = `/bin/ps -axo etime=,comm= | /usr/bin/grep '/SkyComputerUseService$' || true`;
// What the run may have left: serves of the clone (servePattern) and TextEdit, as two counts.
export const leftoverScript = checkout => `printf '%s %s\\n' "$(/usr/bin/pgrep -f ${quote(servePattern(checkout))} | wc -l | tr -d ' ')" "$(/usr/bin/pgrep -x TextEdit | wc -l | tr -d ' ')"`;
// The one cua-116-spike check the run waits on.
export const SPIKE_SCRIPT = `/usr/bin/pgrep -f 'cua-116-[s]pike' >/dev/null && echo running || echo idle`;

// The helpers classified against the pinned runtime (the vendor's sky from the runtime this host pins, or another
// installation's, which the vendor client would reuse), each with its age in seconds.
const seconds = etime => {
  const [days, clock] = etime.includes('-') ? etime.split('-') : ['0', etime];
  return Number(days) * 86400 + clock.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
};
export function classifyHelpers(output, runtimeRoot) {
  return String(output).split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [, etime, path] = line.match(/^(\S+)\s+(.*)$/) ?? [null, null, line];
    const age = etime ? seconds(etime) : NaN;
    return {path: path.replace(/^\/Users\/[^/]+/, '~'), origin: runtimeRoot && path.startsWith(`${runtimeRoot}/`) ? 'pinned runtime' : 'another installation',
      ageSeconds: Number.isFinite(age) ? age : null};
  });
}
