// The device side of the native baseline: the `cua serve` command of the parity clone with the native surface, and the
// shell scripts the harness runs over ssh around the measurements (attestation, the handshake record, the helper, the
// processes left). Every script goes through topology.mjs's ssh form (BatchMode, the pinned node on PATH).
import {remoteCommand, quote} from '../browser-parity/topology.mjs';

export const PARITY_CHECKOUT = '$HOME/Developer/GitHub/cua-parity';
// The MCP protocol version the harness asks for; the handshake record is kept per surface set and this version.
export const PROTOCOL_VERSION = '2025-06-18';

// Native surface only, approvals for the session only, no secret store: nothing of the owner's store is read and no
// approval outlives the connection. The script is named by its absolute path, so the serve's command line names the
// checkout and servePattern finds it (and no other checkout's serve, such as the resident agent's).
export function serveCommand({device, checkout, home}) {
  return remoteCommand(device, `cd ${quote(checkout)} && exec env CUA_HOME=${quote(home)} CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node ${quote(`${checkout}/bin/cua.mjs`)} serve`);
}
// The extended regular expression (for pgrep -f) of a serve that serveCommand started from `checkout`. The bracketed
// [b] keeps it from matching the command line of the shell that runs pgrep with it.
export const servePattern = checkout => `${checkout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[b]in/cua\\.mjs serve`;

// One JSON line: the clone's commit and cleanliness, the home and runtime release a serve there uses, the handshake
// record's path for the native surface, the machine (model, chip, memory, macOS, main display) and what is running
// that the run must know about (TextEdit, a cua-116-spike process, serves of the clone).
export function preflightScript() {
  // The pattern is servePattern's, for the checkout the script runs in.
  const node = `import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {defaultHome, homeLayout, readPointer} from './src/runtime/layout.mjs';
const sh = (c, a) => { try { return execFileSync(c, a, {encoding: 'utf8'}).trim(); } catch { return ''; } };
const home = defaultHome(), release = readPointer(home);
const displays = JSON.parse(sh('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json']) || '{}').SPDisplaysDataType ?? [];
const main = displays.flatMap(g => g.spdisplays_ndrvs ?? []).find(d => d.spdisplays_main === 'spdisplays_yes') ?? null;
const size = text => text?.match(/(\\d+) x (\\d+)/)?.slice(1).map(Number) ?? null;
const pixels = size(main?._spdisplays_pixels), points = size(main?._spdisplays_resolution);
console.log(JSON.stringify({
  commit: sh('git', ['rev-parse', 'HEAD']), dirty: sh('git', ['status', '--porcelain']) !== '', checkout: process.cwd(), home, release,
  handshakeRecord: join(homeLayout(home).handshake, release ?? 'none', 'computer@${PROTOCOL_VERSION}.json'),
  runtimeRoot: release ? join(homeLayout(home).runtimes, release) : null,
  hardware: {model: sh('/usr/sbin/sysctl', ['-n', 'hw.model']), chip: sh('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']), memoryBytes: Number(sh('/usr/sbin/sysctl', ['-n', 'hw.memsize']))},
  os: {name: sh('/usr/bin/sw_vers', ['-productName']), version: sh('/usr/bin/sw_vers', ['-productVersion']), build: sh('/usr/bin/sw_vers', ['-buildVersion'])},
  display: main ? {pixels: main._spdisplays_pixels ?? null, resolution: points ? points.join(' x ') : null, scale: pixels && points ? pixels[0] / points[0] : null, virtual: /virtual|가상/i.test(main._name ?? '')} : null,
  textEditRunning: sh('/usr/bin/pgrep', ['-x', 'TextEdit']) !== '',
  spikeRunning: sh('/usr/bin/pgrep', ['-f', 'cua-116-[s]pike']) !== '',
  serves: sh('/usr/bin/pgrep', ['-f', (${servePattern.toString()})(process.cwd())]).split('\\n').filter(Boolean).length,
}));`;
  return `cd ${PARITY_CHECKOUT} && node --input-type=module -e ${quote(node)}`;
}

// Clears (when asked) and then reports the native surface's handshake record: "present" or "absent".
export function handshakeScript({record, clear}) {
  if (!/\/state\/handshake\/[^/]+\/computer@[0-9-]+\.json$/.test(record)) throw new Error('not a native handshake record path');
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
