// Doctor's Chrome checks: passive capability evidence beside runtime health, `pass` or `blocked`, never `fail` (they
// never change doctor's `ok`). On the vendor route read from files and the process table only (chrome.mjs); on the cua
// route from files, plus a connection to each of cua's own host sockets (chrome.hosts.live, below).
//   chrome.extension.<key>   per registered profile: the OpenAI extension is installed in its Chrome profile; blocked
//                            when absent, and when this process may not read Chrome's data directory (with the code)
//   chrome.profiles          only when $CUA_HOME/profiles.json cannot be read
//   chrome.host.registered   the native-messaging manifest for com.openai.codexextension exists, and the class of
//                            the host it names (desktop's, cua's or other); pass either way
//   chrome.hosts.live        OpenAI hosts currently running under the user's Chrome (a count; on Linux, the running
//                            Linux hosts for this arch, read from `ps -eo pid=,args=`)
// On the cua route (src/chrome/route.mjs) cuaChromeChecks reports the same rows for cua's own extension and host:
//   chrome.extension.<key>   cua's extension installed or loaded unpacked (Extensions/<id>/ or Local Extension
//                            Settings/<id>/; chrome.mjs)
//   chrome.host.registered   the io.github.ssfskim.cua manifest, whether it names this home's launcher, and whether the
//                            node and host.mjs the launcher execs are still there (a plugin update moves the checkout)
//   chrome.hosts.live        the sockets in $CUA_HOME/chrome/b that accept a connection within 500 ms: the one Chrome
//                            row that connects (to cua's own hosts only). A socket refused with ECONNREFUSED is a dead
//                            host's and is removed; one that does not answer in time is reported and kept.
// On either route, the MAWS row (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md):
//   maws.hosts               the client-mode hosts cua processes run for MAWS backends (src/chrome/client-mode.mjs),
//                            from their status files in chrome/b (instance maws:…) and sockets in chrome/m: pass with
//                            each one's instance, process and peer check, skip when there is none. A record whose
//                            process is gone is stale and removed (status file and socket). Blocked when the relay's
//                            peer check is unavailable (docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-
//                            design.md): the peer identity addon does not load here on Apple silicon macOS, or a live
//                            host's status says peerCheck 'unavailable'; such a host refuses every vendor connection.
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {connect} from 'node:net';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {CuaError} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {NATIVE_HOST_NAME, PERMISSION_FIX, PERMISSION_HINT, countLiveHosts} from './chrome.mjs';
import {profileStatuses, REASONS, reasonFor} from './registry.mjs';
import {backendDir, clientModeDir, CUA_HOST_NAME, isMawsInstance, launcherPath} from '../chrome/extension.mjs';
import {parseLauncher} from '../chrome/registration.mjs';
import {loadPeerAddon, peerAddonPath} from '../chrome/peer.mjs';

const result = (name, status, detail) => ({name, status, detail});

// The chrome.profiles row (when the registry cannot be read) and one chrome.extension.<key> row per profile.
function extensionRows({home, chrome, extension, notInstalled, installed}) {
  const checks = [];
  let statuses = [];
  try { statuses = profileStatuses({home, chrome}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    checks.push(result('chrome.profiles', 'blocked', `${error.message}; ${error.hint ?? ''}`.trim()));
  }
  for (const p of statuses) {
    const name = `chrome.extension.${p.key}`;
    const where = `(Chrome profile "${p.chromeProfileDirectory}")`;
    if (p.reason === 'chrome_data_unreadable')
      checks.push(result(name, 'blocked', `whether the ${extension} extension is installed is unknown: this process may not read Chrome's data directory (${p.chromeDataError}) ${where}; ${PERMISSION_HINT}`));
    else if (p.reason === 'profile_directory_missing' || p.reason === 'extension_not_installed')
      checks.push(result(name, 'blocked', `${p.reason === 'extension_not_installed' ? notInstalled : REASONS[p.reason]} ${where}`));
    else checks.push(result(name, 'pass', installed(p.chromeProfileDirectory)));
  }
  return checks;
}

export function chromeChecks({home, chrome, psText, userHome = homedir(), host = {platform: process.platform, arch: process.arch}}) {
  const checks = extensionRows({home, chrome, extension: 'OpenAI', notInstalled: REASONS.extension_not_installed,
    installed: directory => `the OpenAI extension is installed in Chrome profile "${directory}" (file presence only; enabled/connected is not checked)`});
  const registered = chrome.nativeHost({cuaHome: realHome(home), userHome});
  checks.push(registered.readError
    ? result('chrome.host.registered', 'blocked', `whether a native-messaging manifest for ${NATIVE_HOST_NAME} exists is unknown: this process may not read it in ${chrome.userData} (${registered.readError}); ${PERMISSION_FIX}`)
    : !registered.present
    ? result('chrome.host.registered', 'blocked', `no native-messaging manifest for ${NATIVE_HOST_NAME} in ${chrome.userData}: the OpenAI extension cannot reach a host`)
    : registered.unreadable
      ? result('chrome.host.registered', 'blocked', `the native-messaging manifest for ${NATIVE_HOST_NAME} does not name a host path`)
      : result('chrome.host.registered', 'pass', `${registered.pathClass}: ${NATIVE_HOST_NAME} names ${registered.path}`));
  const live = countLiveHosts(psText, {host});
  checks.push(live
    ? result('chrome.hosts.live', 'pass', `${live} OpenAI Chrome host(s) running${host.platform === 'linux' ? '' : ' under Google Chrome'}`)
    : result('chrome.hosts.live', 'blocked', 'no OpenAI Chrome host is running: open Chrome with the OpenAI extension enabled in a profile'));
  return checks;
}

// The process table countLiveHosts reads for this host (see there).
export function processTable({host = {platform: process.platform}} = {}) {
  const args = host.platform === 'linux' ? ['-eo', 'pid=,args='] : ['-axo', 'pid=,ppid=,comm='];
  try { return execFileSync('/bin/ps', args, {encoding: 'utf8', timeout: 5000}); } catch { return ''; }
}

export const LIVE_PROBE_MS = 500;

export async function cuaChromeChecks({home, chrome, userHome = homedir(), probeMs = LIVE_PROBE_MS}) {
  const checks = extensionRows({home, chrome, extension: 'cua',
    notInstalled: reasonFor('extension_not_installed', 'cua'),
    installed: directory => `the cua extension is installed or loaded unpacked in Chrome profile "${directory}" (file presence only; enabled/connected is not checked)`});
  checks.push(cuaRegistration({home, chrome, userHome}));
  checks.push(await liveCuaHosts(home, probeMs));
  return checks;
}

const fileAt = path => { try { return statSync(path).isFile(); } catch { return false; } };

// Signal 0 checks that a process exists; EPERM means it does, under another user.
const processAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

const PEER_CHECK_FIX = 'reinstall or update cua, or rebuild the addon with scripts/build-peer-auth.sh';

// `addonPath` and `host` are where the peer identity addon is loaded from and the platform it is loaded on (tests point
// them elsewhere); off Apple silicon macOS, where MAWS does not run, it is not tried.
export function mawsHostCheck({home, alive = processAlive, addonPath = peerAddonPath(), host = process}) {
  const root = realHome(home);
  let names = [];
  try { names = readdirSync(backendDir(root)).filter(name => name.endsWith('.json')); } catch {}
  const hosts = [];
  for (const file of names) {
    let status;
    try { status = JSON.parse(readFileSync(join(backendDir(root), file), 'utf8')); } catch { continue; }
    if (!isMawsInstance(status?.instanceId) || !Number.isInteger(status.pid)) continue;
    hosts.push({name: file.slice(0, -'.json'.length), instanceId: status.instanceId, pid: status.pid, peerCheck: status.peerCheck ?? 'off'});
  }
  const live = hosts.filter(h => alive(h.pid));
  const stale = hosts.filter(h => !alive(h.pid));
  for (const h of stale) {
    rmSync(join(backendDir(root), `${h.name}.json`), {force: true});
    rmSync(join(clientModeDir(root), `${h.name}.sock`), {force: true});
  }
  const note = stale.length ? `; removed ${stale.length} stale host record(s) of processes that are gone` : '';
  const listed = live.length ? `${live.length} MAWS client-mode host(s) connected: ${live.map(h => `${h.instanceId} (pid ${h.pid}, peer check ${h.peerCheck})`).join(', ')}` : '';
  const addonMissing = host.platform === 'darwin' && host.arch === 'arm64' && !loadPeerAddon(addonPath, host);
  if (addonMissing) return result('maws.hosts', 'blocked', `the relay's peer check is unavailable: ${addonPath} does not load, so a MAWS client-mode host of this cua refuses every vendor browser connection; ${PEER_CHECK_FIX}${listed ? `; ${listed}` : ''}${note}`);
  const unchecked = live.filter(h => h.peerCheck === 'unavailable');
  if (unchecked.length) return result('maws.hosts', 'blocked', `${listed}; the peer check of ${unchecked.map(h => `pid ${h.pid}`).join(', ')} is unavailable (its process could not load the peer identity addon), so every vendor browser connection to it is refused; ${PEER_CHECK_FIX}${note}`);
  return live.length
    ? result('maws.hosts', 'pass', `${listed}${note}`)
    : result('maws.hosts', 'skip', `no cua process is connected to a MAWS backend (MAWS passes CUA_BROWSER_BACKENDS to its sessions' engines; cua serve connects then)${note}`);
}

function cuaRegistration({home, chrome, userHome}) {
  const cuaHome = realHome(home);
  const launcher = launcherPath(cuaHome);
  const row = (status, detail) => result('chrome.host.registered', status, detail);
  const registered = chrome.nativeHost({cuaHome, userHome, name: CUA_HOST_NAME});
  if (registered.readError) return row('blocked', `whether a native-messaging manifest for ${CUA_HOST_NAME} exists is unknown: this process may not read it in ${chrome.userData} (${registered.readError}); ${PERMISSION_FIX}`);
  if (!registered.present) return row('blocked', `no native-messaging manifest for ${CUA_HOST_NAME} in ${chrome.userData}: the cua extension cannot reach a host; run cua chrome register`);
  if (registered.unreadable) return row('blocked', `the native-messaging manifest for ${CUA_HOST_NAME} does not name a host path; run cua chrome register --replace`);
  if (registered.path !== launcher) return row('blocked', `${CUA_HOST_NAME} names ${registered.path}, not this home's launcher ${launcher} (another cua home is registered; cua chrome register --replace points it here)`);
  let text;
  try { text = readFileSync(launcher, 'utf8'); } catch (error) {
    return row('blocked', `${CUA_HOST_NAME} names this home's launcher ${launcher}, which cannot be read (${error.code ?? error.message}); run cua chrome register again to rewrite it`);
  }
  const {node, host} = parseLauncher(text);
  const missing = [['node', node], ['host', host]].filter(([, path]) => !path || !fileAt(path)).map(([what, path]) => `${what} ${path ?? '(not named)'}`);
  if (missing.length) return row('blocked', `${CUA_HOST_NAME} names this home's launcher ${launcher}, but its ${missing.join(' and ')} is not there (a plugin update or a node upgrade moves them); run cua chrome register again to rewrite it`);
  return row('pass', `cua: ${CUA_HOST_NAME} names this home's launcher ${launcher} (node ${node}, host ${host})`);
}

// -> {state: 'live'|'refused'|'timeout'|'error'|'gone', code?, ino?}
function probeSocket(path, ms) {
  return new Promise(resolve => {
    let ino;
    try { ino = statSync(path).ino; } catch { resolve({state: 'gone'}); return; }
    const socket = connect(path);
    const done = outcome => { clearTimeout(timer); socket.destroy(); resolve({...outcome, ino}); };
    const timer = setTimeout(() => done({state: 'timeout'}), ms);
    socket.once('connect', () => done({state: 'live'}));
    socket.once('error', error => done({state: error.code === 'ECONNREFUSED' ? 'refused' : 'error', code: error.code}));
  });
}

async function liveCuaHosts(home, probeMs) {
  const dir = backendDir(realHome(home));
  let names = [];
  try { names = readdirSync(dir).filter(name => name.endsWith('.sock')); } catch {}
  const probed = await Promise.all(names.map(async name => ({path: join(dir, name), ...await probeSocket(join(dir, name), probeMs)})));
  let removed = 0;
  for (const p of probed.filter(p => p.state === 'refused')) {
    // Only the file that refused: a host that took the path meanwhile has a new inode and stands.
    try { if (statSync(p.path).ino === p.ino) { rmSync(p.path); removed++; } } catch {}
  }
  const live = probed.filter(p => p.state === 'live').length;
  const slow = probed.filter(p => p.state === 'timeout').length;
  const failed = probed.filter(p => p.state === 'error');
  const notes = [
    ...(slow ? [`${slow} socket(s) did not answer within ${probeMs} ms (kept)`] : []),
    ...(failed.length ? [`${failed.length} socket(s) could not be probed (${[...new Set(failed.map(p => p.code))].join(', ')})`] : []),
    ...(removed ? [`removed ${removed} stale socket(s) of hosts that are gone`] : []),
  ].map(note => `; ${note}`).join('');
  return live
    ? result('chrome.hosts.live', 'pass', `${live} cua host(s) serving in ${dir}${notes}`)
    : result('chrome.hosts.live', 'blocked', `no cua host is serving in ${dir}: open Chrome with the cua extension enabled in a profile${notes}`);
}
