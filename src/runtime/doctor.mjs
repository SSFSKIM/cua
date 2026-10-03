// Passive diagnosis. Reports the installed runtime's health (platform, active release, files, vendor manifest, IPC
// version, vendor signatures) separately from live-helper and permission evidence, which a passive check can only
// observe from outside: it never opens an app, starts or signals the helper, connects to its socket or requests a
// grant. Live behavior is the job of explicit probe scripts. `blocked` marks evidence that is unavailable passively.
// `ok` means runtime health only: no check failed. It does not mean the live helper, permissions or a release
// acceptance gate were proven, and it must never be reported as release acceptance.
// The Keychain helper (secrets) is inspected from its file and signature, never run: not built or without a stable
// signing identity is `blocked` (secrets, or their stable Keychain trust, are not available yet); a helper that is
// present but speaks another broker protocol or whose signature does not verify is `fail`.
// `codex.login` asks the relocated bundled CLI (`codex login status`, bounded) whether the server's own CODEX_HOME holds
// a Codex login, which the browser route needs; only the exit code is kept and no auth file is opened. It is
// capability evidence, never runtime health: `pass` or `blocked`, so it never changes `ok`.
// The Chrome checks (src/profiles/checks.mjs) are capability evidence the same way: each registered profile's
// extension, the com.openai.codexextension native-messaging registration and which host it names, and the running
// OpenAI hosts, read from files and the process table only.
import {existsSync, readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {CuaError} from './errors.mjs';
import {loadPins, selectPin, locateRuntime, recoveryHint} from './manifest.mjs';
import {checkLayout, checkVendorManifest, checkIpc, verifyCodeSignatures, ipcVersionsIn} from './checks.mjs';
import {inspectKeychainHelper, classifyKeychainHelper} from '../secrets/helper.mjs';
import {loginStatus, LOGIN_STATES} from './login.mjs';
import {chromeFacts} from '../profiles/chrome.mjs';
import {chromeChecks, processTable} from '../profiles/checks.mjs';

export const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const LIVE_PROBE = 'scripts/probe-runtime.mjs';

const result = (name, status, detail) => ({name, status, detail});

export async function inspectRuntime({home, live = false, pins, host = {platform: process.platform, arch: process.arch}, verifySignatures = verifyCodeSignatures, inspectHelper = inspectNativeHelper, inspectSecrets = inspectKeychainHelper, inspectLogin = defaultInspectLogin, inspectChrome = defaultInspectChrome}) {
  if (live) throw new Error(`inspectRuntime is passive; live probes are separate explicit scripts (${LIVE_PROBE})`);
  pins ??= loadPins();
  const checks = [];
  let pin;
  try {
    pin = selectPin(pins, host);
    checks.push(result('platform', 'pass', `${host.platform}-${host.arch} has pinned release ${pin.release}`));
  } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    checks.push(result('platform', 'fail', error.message));
    return {ok: false, checks};
  }

  let runtime;
  let runtimeUsable = false;
  try {
    runtime = locateRuntime({home, pins, host});
    checks.push(result('runtime.installed', 'pass', `active release ${runtime.release} at ${runtime.root}`));
  } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    checks.push(result('runtime.installed', 'fail', error.hint ? `${error.message}; ${error.hint}` : error.message));
  }

  if (runtime) {
    const {root, manifest} = runtime;
    const layout = checkLayout(root, manifest);
    runtimeUsable = layout.ok;
    checks.push(result('runtime.files', layout.ok ? 'pass' : 'fail', layout.ok ? 'every pinned runtime path is present' : `missing ${layout.missing.join(', ')}; ${recoveryHint(root)}`));
    const vendor = checkVendorManifest(root, manifest);
    checks.push(result('runtime.vendor-manifest', vendor.ok ? 'pass' : 'fail', vendor.detail));
    const ipc = checkIpc(root, manifest);
    checks.push(result('runtime.ipc', ipc.ok ? 'pass' : 'fail', ipc.detail));
    const signatures = await verifySignatures(root, manifest);
    const bad = signatures.filter(s => !s.valid);
    checks.push(result('runtime.signatures', bad.length ? 'fail' : 'pass', bad.length
      ? `invalid vendor signature: ${bad.map(s => `${s.component} (${s.detail})`).join('; ')}; ${recoveryHint(root)}`
      : `${signatures.length} components signed by team ${manifest.signing.team}`));
  }

  const expectedIpc = (runtime?.manifest ?? pin).runtime.ipc;
  const helper = classifyHelper(await inspectHelper({expectedIpc}), {expectedIpc, runtimeRoot: runtime?.root});
  checks.push(result('helper.live', helper.status, helper.detail));
  checks.push(result('helper.permissions', 'blocked',
    'Accessibility and Screen Recording belong to the Codex Computer Use helper and are granted by you in System Settings > Privacy & Security when macOS asks on first use; a passive check cannot read them. '
    + `Confirm with a live probe (${LIVE_PROBE}).`));
  checks.push(...classifyKeychainHelper(await inspectSecrets()));
  checks.push(await codexLoginCheck({home, runtime: runtimeUsable ? runtime : null, inspectLogin}));
  checks.push(...await inspectChrome({home}));

  const report = {ok: !checks.some(c => c.status === 'fail'), checks};
  if (runtime) report.runtime = {release: runtime.release, root: runtime.root, paths: runtime.paths};
  return report;
}

const defaultInspectLogin = ({home, runtime}) => loginStatus({home, runtime});
const defaultInspectChrome = async ({home}) => chromeChecks({home, chrome: chromeFacts(), psText: processTable()});

async function codexLoginCheck({home, runtime, inspectLogin}) {
  if (!runtime) return result('codex.login', 'blocked', 'needs a usable installed runtime to ask; run cua install, then run cua login');
  let status;
  try { status = await inspectLogin({home, runtime}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return result('codex.login', 'blocked', `${error.message}; run cua login once CUA_HOME is fixed`);
  }
  return status.state === LOGIN_STATES.loggedIn
    ? result('codex.login', 'pass', 'the server has a Codex login in its own CODEX_HOME (needed by the browser route)')
    : result('codex.login', 'blocked', `no Codex login in the server's own CODEX_HOME (${status.reason ?? status.state}); the browser route needs one: run cua login`);
}

// One-line human verdict that never overstates `ok`: blocked checks leave live capability unverified.
export function summarize(report) {
  if (!report.ok) return 'unhealthy: see FAIL lines';
  const blocked = report.checks.filter(c => c.status === 'blocked').map(c => c.name);
  return blocked.length
    ? `passive runtime checks pass; live capability remains unverified (blocked: ${blocked.join(', ')})`
    : 'passive runtime checks pass';
}

export function classifyHelper({socket, holders}, {expectedIpc, runtimeRoot}) {
  if (!holders.length)
    return {status: 'blocked', detail: `no native helper holds ${socket}; the pinned helper is opened through LaunchServices on first use. Whether it starts, and with which permissions, only a live probe (${LIVE_PROBE}) shows.`};
  const describe = h => `pid ${h.pid} (${h.executable}${h.version ? `, version ${h.version}` : ''})`;
  const incompatible = holders.filter(h => h.ipc.length && !h.ipc.includes(expectedIpc));
  if (incompatible.length)
    return {status: 'fail', detail: `incompatible native helper ${incompatible.map(describe).join(', ')} speaks ${incompatible.flatMap(h => h.ipc).join(', ')}; the active runtime expects ${expectedIpc}. cua will not stop or replace it: quit or update the application that started it, then retry.`};
  const unknown = holders.filter(h => !h.ipc.length);
  if (unknown.length)
    return {status: 'blocked', detail: `native helper ${unknown.map(describe).join(', ')} holds ${socket}, but its IPC version could not be read; only a live probe (${LIVE_PROBE}) shows whether it is compatible.`};
  const whose = h => runtimeRoot && h.executable.startsWith(runtimeRoot + '/') ? 'the pinned runtime\'s helper' : 'another installation\'s helper, not started by cua';
  return {status: 'pass', detail: holders.map(h => `${describe(h)} speaks ${expectedIpc}; ${whose(h)}, reused as-is`).join('; ')};
}

const output = (command, args) => new Promise(resolve => execFile(command, args, {encoding: 'utf8'}, (_error, stdout) => resolve(stdout ?? '')));

// Who holds the native socket, read from outside with lsof/ps and the holder's own files; never a connection.
export async function inspectNativeHelper({expectedIpc, socket = NATIVE_SOCKET}) {
  if (!existsSync(socket)) return {socket, holders: []};
  const holders = [];
  for (const line of (await output('/usr/sbin/lsof', ['-F', 'p', socket])).split('\n')) {
    if (!line.startsWith('p')) continue;
    const pid = Number(line.slice(1));
    const executable = (await output('/bin/ps', ['-o', 'comm=', '-p', String(pid)])).trim();
    let ipc = [];
    try { ipc = ipcVersionsIn(readFileSync(executable, 'latin1'), expectedIpc); } catch {}
    const bundle = executable.match(/^(.*?\.app)\/Contents\/MacOS\//)?.[1];
    const version = bundle ? (await output('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(bundle, 'Contents/Info.plist')])).trim() : '';
    holders.push({pid, executable, ipc, ...(version ? {version} : {})});
  }
  return {socket, holders};
}
