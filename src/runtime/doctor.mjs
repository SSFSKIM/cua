// Passive diagnosis. Reports the installed runtime's health (platform, active release, files, vendor manifest, IPC
// version, vendor signatures) separately from live-helper and permission evidence, which a passive check can only
// observe from outside: it never opens an app, starts or signals the helper, connects to its socket or requests a
// grant. The one connection doctor makes is chrome.hosts.live on the cua route, to cua's own host sockets. Live behavior is the job of explicit probe scripts. `blocked` marks evidence that is unavailable passively;
// `skip` marks a check that does not apply on this host (neither a failure nor blocked evidence).
// `ok` means runtime health only: no check failed. It does not mean the live helper, permissions or a release
// acceptance gate were proven, and it must never be reported as release acceptance.
// `secrets.store` (src/secrets/check.mjs) describes the secret store, $HOME/.config/claude-secrets, from metadata only:
// absent is `blocked` (nothing stored yet), a directory or key file the trusted services would refuse is `fail`.
// `secrets.project` describes the project tier of the working directory's project the same way, absent being `skip`.
// `codex.login` asks the relocated bundled CLI (`codex login status`, bounded) whether the server's own CODEX_HOME holds
// a Codex login, which the ChatGPT extension route needs (on the cua route the row is skip); only the exit code is kept
// and no auth file is opened. It is capability evidence, never runtime health: `pass` or `blocked`, so it never changes `ok`. It is the one check that
// executes a release binary, so it runs only when this same run found the release's files present and its vendor
// signatures valid (`runtime.signatures` pass); otherwise it is `blocked` naming the failed check.
// `chrome.host.config` (chrome-component.mjs) is installed-runtime health: the Chrome host component cua placed in the
// active release, its signature and the configuration the host reads. Not placed yet is `blocked` (install adds it);
// anything wrong with what cua placed is `fail`.
// The Chrome checks (src/profiles/checks.mjs) are capability evidence the same way as codex.login: each registered profile's
// extension, the com.openai.codexextension native-messaging registration and which host it names, and the running
// OpenAI hosts, read from files and the process table only.
// On the cua route (`cua chrome register`, src/chrome/route.mjs) the Chrome rows are cua's own (cuaChromeChecks: cua's
// extension, the io.github.ssfskim.cua registration and this home's launcher, the sockets of cua's hosts that accept a
// connection), codex.login is `skip` (that route needs no Codex login) and chrome.host.config, the OpenAI host's
// configuration, is not reported. On the vendor route and with no registration they are as before.
// `sandbox` describes the CUA_SHIM_SANDBOX in `env` (src/runtime/sandbox.mjs). Under scoped it fails when one of the
// profile's write roots ($CUA_HOME/run, $TMPDIR) overlaps a trusted code path (the release's modules, the checkout's
// src/services and src/secrets) or the runtime's CODEX_HOME: `cua serve` and the listing launch refuse such a launch.
// Another mode is the user's choice and only described.
// On Linux the release is trusted by its archive hash (runtime.signatures says so; no codesign runs), runtime.ipc does
// not apply, the darwin helper.live and helper.permissions rows give way to display, accessibility.bus and
// sandbox.userns (linux-desktop.mjs; the group-container socket, lsof and plutil are never consulted).
// `run.stale` sweeps $CUA_HOME/run as `cua serve` does at start (src/runtime/run-dir.mjs), the one thing doctor
// changes: the leftovers of sessions whose owning cua process is gone are removed and named. It is cua's own
// housekeeping, never runtime health: `pass`, or `fail` when a stale session could not be removed.
// The `agent.*` rows describe remote control (src/remote): the launchd job (`agent.installed`, `agent.running`), the
// device enrolment (`agent.enrolled`) and whether this user's session is on the console and unlocked (`agent.console`,
// the state in which remote js does nothing and is refused as console_locked). On a Mac never enrolled, with no job
// installed, all four are `skip` (a locked Mac that does no remote control is healthy). On Linux the same rows describe
// the systemd user unit (src/remote/systemd.mjs): `agent.installed` the unit file, `agent.running` the user manager's
// view of it (and whether linger keeps it past logout), and `agent.console` whether the agent's X display (the unit's
// DISPLAY and XAUTHORITY, with the user's HOME as the manager gives it, so ~/.Xauthority is found; else doctor's own) answers with the extensions the helper needs; Linux has no portable
// screen-lock signal, so the row says the lock is not read. Elsewhere all four are `skip`.
import {existsSync, readFileSync, statSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {CuaError} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {BROWSER_SERVICE, SERVICE_SUPPORT_DIRS, SKY_SERVICE} from './launch.mjs';
import {SANDBOX_CONFLICT_HINT, describeConflicts, protectedPaths, sandboxConflicts, sandboxModeFrom, scopedWriteRoots, tmpdirRoot} from './sandbox.mjs';
import {loadPins, selectPin, locateRuntime, recoveryHint} from './manifest.mjs';
import {checkLayout, checkVendorManifest, checkIpc, verifyCodeSignatures, ipcVersionsIn} from './checks.mjs';
import {inspectSecretStore, classifyStore} from '../secrets/check.mjs';
import {loginStatus, LOGIN_STATES} from './login.mjs';
import {describeSweep, sweepRun} from './run-dir.mjs';
import {chromeFacts} from '../profiles/chrome.mjs';
import {chromeChecks, cuaChromeChecks, mawsHostCheck, processTable} from '../profiles/checks.mjs';
import {chromeRoute, extensionIdFor} from '../chrome/route.mjs';
import {inspectChromeHostConfig} from './chrome-component.mjs';
import {linuxDesktopChecks, xDisplayCheck} from './linux-desktop.mjs';
import {surfacesFrom} from '../mcp/surface.mjs';
import {checkRelayUrl, readDevice} from '../remote/device.mjs';
import {agentLogPath, agentStatus} from '../remote/launchd.mjs';
import * as systemd from '../remote/systemd.mjs';
import {checkConsole, consoleCheckFrom} from '../remote/console.mjs';

export const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const LIVE_PROBE = 'scripts/probe-runtime.mjs';

const result = (name, status, detail) => ({name, status, detail});

export async function inspectRuntime({home, env = process.env, live = false, pins, host = {platform: process.platform, arch: process.arch}, verifySignatures = verifyCodeSignatures, inspectHelper = inspectNativeHelper, inspectSecrets = inspectSecretStore, inspectLinux = linuxDesktopChecks, inspectLogin = defaultInspectLogin, inspectChrome = defaultInspectChrome, inspectAgent = defaultInspectAgent, sweep = sweepRun}) {
  if (live) throw new Error(`inspectRuntime is passive; live probes are separate explicit scripts (${LIVE_PROBE})`);
  pins ??= loadPins();
  const route = chromeRoute(home);
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
  // Why no release binary may be executed in this run, until the files and signatures checks pass.
  let untrusted = 'needs a usable installed runtime to ask; run cua install, then run cua login';
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
    checks.push(result('runtime.files', layout.ok ? 'pass' : 'fail', layout.ok ? 'every pinned runtime path is present' : `missing ${layout.missing.join(', ')}; ${recoveryHint(root, manifest.platform)}`));
    const vendor = checkVendorManifest(root, manifest);
    checks.push(result('runtime.vendor-manifest', vendor.ok ? 'pass' : 'fail', vendor.detail));
    const ipc = checkIpc(root, manifest);
    checks.push(result('runtime.ipc', ipc.ok ? 'pass' : 'fail', ipc.detail));
    let signed = true;
    if (manifest.signing) {
      const signatures = await verifySignatures(root, manifest);
      const bad = signatures.filter(s => !s.valid);
      signed = !bad.length && signatures.length === manifest.signing.components.length;
      checks.push(result('runtime.signatures', signed ? 'pass' : 'fail', signed
        ? `${signatures.length} components signed by team ${manifest.signing.team}`
        : `invalid vendor signature: ${bad.map(s => `${s.component} (${s.detail})`).join('; ') || 'unchecked components'}; ${recoveryHint(root)}`));
    } else {
      checks.push(result('runtime.signatures', 'pass', `archive hash is the trust root on ${manifest.platform}: install verified the pinned archive's length and SHA-256 before extracting it, and nothing here is code-signed`));
    }
    if (layout.ok && signed) untrusted = null;
    else if (layout.ok) untrusted = 'not asked: runtime.signatures failed in this run, and doctor never executes a release binary it found untrusted; fix the release first (see runtime.signatures), then run cua login';
    if (route !== 'cua') checks.push(await inspectChromeHostConfig({runtime, verifySignatures}));
  } else if (route !== 'cua') {
    checks.push(result('chrome.host.config', 'blocked', 'needs an installed runtime; run cua install, which also places the Chrome host'));
  }
  const linuxRows = host.platform === 'linux' ? await inspectLinux({env}) : null;
  const sandbox = sandboxCheck({home, env, runtime, platform: host.platform, userns: linuxRows?.find(row => row.name === 'sandbox.userns')});
  checks.push(sandbox.row);
  checks.push(runSweepCheck(home, sweep));

  if (linuxRows) checks.push(...linuxRows.map(row => (row.name === 'sandbox.userns' ? usernsRow(row, {env, sandbox}) : row)));
  if (!linuxRows) {
    const expectedIpc = (runtime?.manifest ?? pin).runtime.ipc;
    const helper = classifyHelper(await inspectHelper({expectedIpc}), {expectedIpc, runtimeRoot: runtime?.root});
    checks.push(result('helper.live', helper.status, helper.detail));
    checks.push(result('helper.permissions', 'blocked',
      'Accessibility and Screen Recording belong to the Codex Computer Use helper and are granted by you in System Settings > Privacy & Security when macOS asks on first use; a passive check cannot read them. '
      + `Confirm with a live probe (${LIVE_PROBE}).`));
  }
  const secretsInfo = await inspectSecrets({env});
  const secretsEnabled = (env.CUA_SHIM_SECRETS ?? 'on') !== 'off';
  checks.push(classifyStore(secretsInfo, {enabled: secretsEnabled}));
  if (secretsInfo.project) checks.push(classifyStore(secretsInfo.project, {enabled: secretsEnabled, project: secretsInfo.project.root}));
  checks.push(route === 'cua' ? result('codex.login', 'skip', 'not needed: the cua extension route needs no Codex login (the ChatGPT extension route does)')
    : await codexLoginCheck({home, runtime: untrusted ? null : runtime, untrusted, inspectLogin}));
  checks.push(...await inspectChrome({home, host, env, route}));
  checks.push(...await inspectAgent({home, env, host}));

  const report = {ok: !checks.some(c => c.status === 'fail'), checks};
  if (runtime) report.runtime = {release: runtime.release, root: runtime.root, paths: runtime.paths};
  return report;
}

// sandbox.userns as it bears on this setup. A scoped connection is itself refused where the probe fails, so its row
// stands. Otherwise it is `skip` only when no scoped launch can happen here: the browser surface is off (only the
// profile listing launches scoped behind a disabled connection), or CUA_SHIM_SANDBOX is set to another mode, which the
// listing honours too. Otherwise a refusal stays `blocked`: the connection runs disabled, but `cua profiles list` and
// `bind` launch scoped and are refused (sandbox_unavailable).
function usernsRow(row, {env, sandbox}) {
  if (row.status === 'pass' || !sandbox.surfaces || sandbox.mode === 'scoped') return row;
  const explicitOther = env.CUA_SHIM_SANDBOX !== undefined && env.CUA_SHIM_SANDBOX !== 'scoped';
  if (!sandbox.surfaces.includes('browser') || explicitOther) return result('sandbox.userns', 'skip', `not needed here: no scoped launch happens with ${explicitOther ? `CUA_SHIM_SANDBOX=${env.CUA_SHIM_SANDBOX}` : 'the browser surface off'}. CUA_SHIM_SANDBOX=scoped or the browser surface's profile listing would need it, and it would read: ${row.detail}`);
  return result('sandbox.userns', 'blocked', `${row.detail}. The connection runs under ${sandbox.mode}, but cua profiles list and bind launch under scoped and are refused (sandbox_unavailable)`);
}

// -> {mode, surfaces, row}. On Linux the row also says what F2 measured there (src/runtime/sandbox.mjs
// defaultSandboxMode): the scoped sandbox keeps the computer-use helper off the X display and the session bus, and where
// bubblewrap cannot create a user namespace (`userns`, the sandbox.userns row) the runtime's sandbox fails open, so
// scoped launches are refused. The surfaces are read on Linux only, where the default and the remedies depend on them;
// the darwin row is what it was before Phase F, and serve rejects an invalid CUA_SHIM_SURFACES itself.
function sandboxCheck({home, env, runtime, platform, userns}) {
  const linux = platform === 'linux';
  let surfaces = null;
  let mode;
  try {
    if (linux) surfaces = surfacesFrom(env.CUA_SHIM_SURFACES);
    mode = sandboxModeFrom(env, linux ? {platform, surfaces} : {platform});
  } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return {mode: null, surfaces: null, row: result('sandbox', 'fail', error.message)};
  }
  return {mode, surfaces, row: sandboxRow({home, env, runtime, platform, surfaces, userns, mode})};
}

function sandboxRow({home, env, runtime, platform, surfaces, userns, mode}) {
  const linux = platform === 'linux';
  if (mode === 'disabled' && linux && env.CUA_SHIM_SANDBOX === undefined) return result('sandbox', 'pass', 'CUA_SHIM_SANDBOX unset: on linux with the computer surface the default is disabled, because under the scoped sandbox node_repl lets no runtime process connect to a socket and the computer-use helper could not reach the X display or the session bus. JavaScript cells may write wherever your account can and reach the network (on Linux they can reach the X display directly too); CUA_SHIM_SURFACES=browser keeps scoped');
  if (mode === 'disabled') return result('sandbox', 'pass', 'CUA_SHIM_SANDBOX=disabled: JavaScript cells may write wherever your account can, cua\'s trusted code roots included (accepted under the trust model, #20), and reach the network');
  if (mode === 'default') return result('sandbox', 'pass', 'CUA_SHIM_SANDBOX=default: cua sends no sandbox state; node_repl denies every write and network connection, so profile labels and other features that need scratch space fail');
  const computer = linux && surfaces.includes('computer');
  if (linux && userns && userns.status !== 'pass') return result('sandbox', 'fail', 'CUA_SHIM_SANDBOX=scoped, but bubblewrap cannot create a user namespace here (see sandbox.userns): the runtime\'s sandbox fails open in that state, running JavaScript cells with no sandbox at all, so cua serve and the profile listing refuse scoped connections (sandbox_unavailable). Fix what sandbox.userns names, or set CUA_SHIM_SANDBOX=disabled to choose that openly'
    + (computer ? '. And even with user namespaces, scoped would keep the computer-use helper (sky_linux) off the X display and the session bus; unset CUA_SHIM_SANDBOX (the Linux default with the computer surface is disabled) or use CUA_SHIM_SURFACES=browser' : ''));
  if (computer) return result('sandbox', 'fail', 'CUA_SHIM_SANDBOX=scoped with the computer surface on linux: under the scoped sandbox node_repl lets no runtime process connect to a socket, so the computer-use helper (sky_linux) cannot reach the X display or the session bus and every computer-use call fails; unset CUA_SHIM_SANDBOX (the Linux default with the computer surface is disabled) or use CUA_SHIM_SURFACES=browser');
  const owned = homeLayout(realHome(home));
  const conflicts = sandboxConflicts({
    protectedPaths: protectedPaths({trustedCodePaths: [runtime?.paths.moduleDir, dirname(SKY_SERVICE), dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS], codexHome: owned.codexHome}),
    writeRoots: scopedWriteRoots({cwd: owned.run, cwdLabel: '$CUA_HOME/run', tmpdir: env.TMPDIR}),
  });
  if (conflicts.length) return result('sandbox', 'fail', `${describeConflicts(conflicts)}. cua serve and the profile listing refuse to start like this (sandbox_conflict): ${SANDBOX_CONFLICT_HINT}`);
  return result('sandbox', 'pass', `CUA_SHIM_SANDBOX=scoped (the default): JavaScript cells read everywhere but write only their connection's run directory and $TMPDIR${tmpdirRoot(env.TMPDIR) ? ` (${env.TMPDIR})` : ' (unset, empty or relative: no temp root)'}, no trusted code path lies under either, and cells have no network; CUA_SHIM_SANDBOX=disabled lifts both limits`);
}

function runSweepCheck(home, sweep) {
  let found;
  try { found = sweep(home); } catch (error) {
    return result('run.stale', 'fail', `${homeLayout(realHome(home)).run} could not be swept (${error.code ?? error.message}); cua serve cannot use it either`);
  }
  const live = found.live.length ? `; ${found.live.length} live session${found.live.length === 1 ? '' : 's'} left alone` : '';
  return result('run.stale', found.failed.length ? 'fail' : 'pass', `${found.run}: ${describeSweep(found) ?? 'nothing stale'}${live}`);
}

const defaultInspectLogin = ({home, runtime}) => loginStatus({home, runtime});
const defaultInspectChrome = async ({home, host, env, route}) => [...(route === 'cua'
  ? await cuaChromeChecks({home, chrome: chromeFacts({host, env, extensionId: extensionIdFor(route)})})
  : chromeChecks({home, host, chrome: chromeFacts({host, env}), psText: processTable({host})})), mawsHostCheck({home})];
const defaultInspectAgent = ({home, env, host}) => agentChecks({home, env, host});

async function codexLoginCheck({home, runtime, untrusted, inspectLogin}) {
  if (!runtime) return result('codex.login', 'blocked', untrusted);
  let status;
  try { status = await inspectLogin({home, runtime}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return result('codex.login', 'blocked', `${error.message}; run cua login once CUA_HOME is fixed`);
  }
  return status.state === LOGIN_STATES.loggedIn
    ? result('codex.login', 'pass', 'the server has a Codex login in its own CODEX_HOME (needed by the ChatGPT extension route)')
    : result('codex.login', 'blocked', `no Codex login in the server's own CODEX_HOME (${status.reason ?? status.state}); the ChatGPT extension route needs one: run cua login`);
}

const AGENT_ROWS = ['agent.installed', 'agent.running', 'agent.enrolled', 'agent.console'];

// The remote-control rows. `launchd` ({userHome, uid, launchctl}), `systemd` ({userHome, user, systemctl, loginctl}),
// `checkConsole` and `checkDisplay` are seams: tests never read the real launchd domain, ~/Library/LaunchAgents, the
// user's systemd manager, ~/.config/systemd, the console or an X display.
export async function agentChecks({home, env = process.env, host, launchd = {}, systemd: unitSeams = {}, checkConsole: readConsole = checkConsole, checkDisplay = xDisplayCheck}) {
  if (host.platform !== 'darwin' && host.platform !== 'linux') return AGENT_ROWS.map(name => result(name, 'skip', 'remote control\'s installed agent is a launchd job on macOS or a systemd user unit on Linux'));
  let device = null;
  let deviceError = null;
  try { device = readDevice(home); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    deviceError = error;
  }
  if (host.platform === 'linux') return linuxAgentChecks({home, env, device, deviceError, unitSeams, checkDisplay});
  const status = await agentStatus(launchd);
  if (!device && !deviceError && !status.installed) {
    const notSetUp = 'this Mac is not set up for remote control (not applicable); to set it up: run cua remote enroll, then cua agent install';
    return AGENT_ROWS.map(name => result(name, 'skip', notSetUp));
  }
  // One uid for launchd and the console, the one the seam names. The console check is the job's setting when there is
  // a job (the agent sees only its plist's environment), else doctor's own.
  const uid = launchd.uid ?? process.getuid();
  return [installedRow(status, device), runningRow(status, home, uid), enrolledRow(home, device, deviceError),
    await consoleRow(status.job ? status.job.environment : env, uid, readConsole, status.job ? 'the agent\'s job' : 'this environment')];
}

async function linuxAgentChecks({home, env, device, deviceError, unitSeams, checkDisplay}) {
  const status = await systemd.agentStatus(unitSeams);
  if (!device && !deviceError && !status.installed) {
    const notSetUp = 'this machine is not set up for remote control (not applicable); to set it up: run cua remote enroll, then cua agent install';
    return AGENT_ROWS.map(name => result(name, 'skip', notSetUp));
  }
  return [unitInstalledRow(status, device), unitRunningRow(status, home), enrolledRow(home, device, deviceError, 'this machine'),
    await displayRow(status.job ? {HOME: env.HOME ?? homedir(), ...status.job.environment} : env, status.job ? 'the agent\'s unit' : 'this environment', checkDisplay)];
}

// What is wrong with an installed job's program and its relay flag, whichever manager runs it.
function jobProblems(job, device) {
  const problems = [];
  if (!existsSync(job.node)) problems.push(`the node it runs, ${job.node}, is gone (moved by a node upgrade?)`);
  if (!existsSync(job.cli)) problems.push(`its program, ${job.cli}, is gone`);
  if (device?.relayUrl && !job.args.includes('--relay')) problems.push(`it does not dial the relay ${device.relayUrl} enrolled since`);
  if (device && !device.relayUrl && job.args.includes('--relay')) problems.push('it dials a relay, but the device has no relay URL');
  return problems;
}

function unitInstalledRow(status, device) {
  if (!status.installed) return result('agent.installed', 'blocked', 'this machine is enrolled but has no systemd user unit, so nothing serves remote clients unless an agent runs in a terminal; run cua agent install');
  if (status.invalid) return result('agent.installed', 'fail', `${status.path}: ${status.invalid}; run cua agent install to replace it`);
  const {job} = status;
  const display = job.environment.DISPLAY ? `, display ${job.environment.DISPLAY}` : ', no DISPLAY (the computer surface cannot reach X)';
  const described = `${status.path}: node ${job.node}, runs ${job.cli} agent run ${job.args.join(' ')}${display}`;
  const problems = jobProblems(job, device);
  return problems.length
    ? result('agent.installed', 'fail', `${described}; but ${problems.join('; ')}; run cua agent install with the node you use now to rewrite it`)
    : result('agent.installed', 'pass', described);
}

function unitRunningRow(status, home) {
  if (!status.installed || status.invalid) return result('agent.running', 'blocked', 'needs a systemd user unit cua can read (see agent.installed)');
  if (status.systemdError) return result('agent.running', 'blocked', status.systemdError);
  const log = status.job.standardErrorPath ?? agentLogPath(home);
  const linger = status.linger === true
    ? 'linger on: it runs from boot and survives logout'
    : `linger ${status.linger === false ? 'off' : 'unknown'}: it stops when this user's last session ends (loginctl enable-linger keeps it)`;
  if (status.running) return result('agent.running', 'pass', `pid ${status.pid}, systemd user unit ${status.unit} (${status.enabled ? 'enabled' : 'not enabled: it will not start at the next login'}; ${linger})`);
  if (status.loaded) return result('agent.running', 'fail', `the user manager has the unit but it is not running (${status.state ?? 'unknown'}, last exit status ${status.lastExitCode ?? 'unknown'}); see ${log}`);
  return result('agent.running', 'fail', `the user manager has not loaded ${status.unit}; run cua agent install to load and start it; its log is ${log}`);
}

async function displayRow(env, whose, checkDisplay) {
  const row = await checkDisplay(env);
  const detail = row.status === 'pass' ? `${row.detail} for ${whose}; a locked screen is not detected on Linux` : `${row.detail} (in ${whose})`;
  return result('agent.console', row.status, detail);
}

function installedRow(status, device) {
  if (!status.installed) return result('agent.installed', 'blocked', `this Mac is enrolled but has no launchd agent, so nothing serves remote clients unless an agent runs in a terminal; run cua agent install`);
  if (status.invalid) return result('agent.installed', 'fail', `${status.plist}: ${status.invalid}; run cua agent install to replace it`);
  const {job} = status;
  const described = `${status.plist}: node ${job.node}, runs ${job.cli} agent run ${job.args.join(' ')}`;
  const problems = jobProblems(job, device);
  return problems.length
    ? result('agent.installed', 'fail', `${described}; but ${problems.join('; ')}; run cua agent install with the node you use now to rewrite it`)
    : result('agent.installed', 'pass', described);
}

function runningRow(status, home, uid) {
  if (!status.installed || status.invalid) return result('agent.running', 'blocked', 'needs a launchd agent cua can read (see agent.installed)');
  if (status.launchdError) return result('agent.running', 'blocked', status.launchdError);
  const log = status.job.standardErrorPath ?? agentLogPath(home);
  if (status.running) return result('agent.running', 'pass', `pid ${status.pid}, launchd job gui/${uid}/${status.label}`);
  if (status.loaded) return result('agent.running', 'fail', `launchd has the job but it is not running (state ${status.state ?? 'unknown'}, last exit code ${status.lastExitCode ?? 'unknown'}); see ${log}`);
  return result('agent.running', 'fail', `the job is not loaded in launchd's gui/${uid} domain (booted out, or this login session has not loaded it); run cua agent install to load it; its log is ${log}`);
}

function enrolledRow(home, device, deviceError, machine = 'this Mac') {
  if (deviceError) return result('agent.enrolled', 'fail', `${deviceError.message}${deviceError.hint ? `; ${deviceError.hint}` : ''}`);
  if (!device) return result('agent.enrolled', 'fail', machine === 'this Mac'
    ? 'a launchd agent is installed but this Mac is not enrolled, so the agent cannot start; run cua remote enroll (or cua agent uninstall)'
    : 'a systemd user unit is installed but this machine is not enrolled, so the agent cannot start; run cua remote enroll (or cua agent uninstall)');
  const path = join(home, 'remote', 'device.json');
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) return result('agent.enrolled', 'fail', `${path} is mode 0${mode.toString(8)} but holds the device secret; chmod 600 "${path}"`);
  if (device.relayUrl) try { checkRelayUrl(device.relayUrl); } catch (error) {
    return result('agent.enrolled', 'fail', `${error.message}, so the agent refuses to dial it; ${error.hint}`);
  }
  return result('agent.enrolled', 'pass', `device ${device.deviceId}, ${device.relayUrl ? `relay ${device.relayUrl}` : 'local only (no relay)'}`);
}

async function consoleRow(env, uid, readConsole, whose) {
  let on;
  try { on = consoleCheckFrom(env); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return result('agent.console', 'fail', `${error.message} (in ${whose})`);
  }
  if (!on) return result('agent.console', 'skip', `the console check is off (CUA_AGENT_CONSOLE_CHECK=off in ${whose}): remote js calls are not refused while the screen is locked`);
  let state;
  try { state = await readConsole({uid}); } catch (error) {
    return result('agent.console', 'blocked', `${error.message} [${error.code ?? 'error'}]`);
  }
  if (!state.onConsole) return result('agent.console', 'fail', 'this user\'s session is not on the console (nobody is logged in at the screen, or another user is): remote js calls are refused (console_locked) until this user is at the screen, unlocked');
  if (state.locked) return result('agent.console', 'fail', 'this user\'s session is on the console but the screen is locked: remote js calls are refused (console_locked) until it is unlocked');
  return result('agent.console', 'pass', `this user's session (uid ${uid}) is on the console and the screen is unlocked`);
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
