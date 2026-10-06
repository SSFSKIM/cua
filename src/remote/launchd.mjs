// `cua agent install|uninstall|status`: the resident agent (`cua agent run`, src/remote/agent.mjs) as a launchd job in
// the user's GUI login session, ~/Library/LaunchAgents/com.ssfskim.cua.agent.plist, loaded with
// `launchctl bootstrap gui/<uid>`. A GUI-session job is the point: TCC prompts, the login Keychain and the screen belong
// to that session, and bootstrap puts a process there without a terminal (an SSH session cannot).
//
// The job runs the node that ran `install` (process.execPath, recorded and shown, because a Homebrew or nvm upgrade
// that moves it breaks the job until `install` runs again; it is also the binary macOS's firewall judges for an --http
// listener) with this checkout's bin/cua.mjs `agent run`, plus `--relay` when the device has a relay URL and
// `--http <host:port>` when given. RunAtLoad is on and KeepAlive is {SuccessfulExit: false}: launchd restarts a crash
// or a refusal (agent_already_running: the job takes over once a terminal agent stops), never the agent's deliberate
// stops (a signal shutdown, relay close codes 4001/4003), which exit 0. `--relay` is refused (relay_unavailable) when
// this checkout cannot load the ws package the relay path needs. launchd appends stdout and stderr to
// $CUA_HOME/state/agent.log (the agent writes its diagnostics to stderr). The environment carries CUA_HOME when it is
// set, CUA_SHIM_SURFACES (default computer,browser: remote use is for the browser as much as the desktop) and each of
// the agent's own settings (CUA_AGENT_MAX_SESSIONS, _IDLE_MINUTES, _ALLOWED_ORIGINS, _CONSOLE_CHECK) set in the
// environment `install` runs in, refused (invalid_setting) as `agent run` would refuse it.
//
// The plist is written by templating with XML escaping and checked by reading it back with cua's own reader before it
// replaces anything; `install` on an installed job replaces the plist, boots the old job out, waits until launchd has
// let it go, and bootstraps the new one. `launchctl` and the user's home are parameters, so tests never touch the real
// launchd domain or ~/Library/LaunchAgents.
import {execFile} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {escapeXml, isDict, parsePlist, representable} from './plist.mjs';
import {checkRelayUrl, readDevice} from './device.mjs';
import {AGENT_SETTINGS, limitsFrom} from './limits.mjs';
import {consoleCheckFrom} from './console.mjs';
import {parseFixedAddress} from './address.mjs';
import {surfacesFrom} from '../mcp/surface.mjs';
import {loadWebSocket} from './relay-link.mjs';
import {CuaError, fail} from '../runtime/errors.mjs';

export const AGENT_LABEL = 'com.ssfskim.cua.agent';
export const DEFAULT_SURFACES = 'computer,browser';
const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const SETTLE_TIMEOUT_MS = 20_000;

export const agentPlistPath = (userHome = homedir()) => join(userHome, 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);
export const agentLogPath = home => join(resolve(home), 'state', 'agent.log');

export const runLaunchctl = args => new Promise(done => {
  execFile('/bin/launchctl', args, {encoding: 'utf8', timeout: 30_000}, (error, stdout, stderr) => done({
    code: error ? (Number.isInteger(error.code) ? error.code : -1) : 0,
    stdout: stdout ?? '',
    stderr: stderr || (error && !Number.isInteger(error.code) ? error.message : ''),
  }));
});

const sleep = ms => new Promise(done => setTimeout(done, ms));

// ---- the plist ----

function agentPlist({programArguments, environment, log}) {
  const string = text => `<string>${escapeXml(text)}</string>`;
  const env = Object.entries(environment).map(([key, value]) => `\t\t<key>${escapeXml(key)}</key>\n\t\t${string(value)}\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t${string(AGENT_LABEL)}
\t<key>ProgramArguments</key>
\t<array>
${programArguments.map(arg => `\t\t${string(arg)}\n`).join('')}\t</array>
\t<key>EnvironmentVariables</key>
\t<dict>
${env}\t</dict>
\t<key>KeepAlive</key>
\t<dict>
\t\t<key>SuccessfulExit</key>
\t\t<false/>
\t</dict>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>StandardOutPath</key>
\t${string(log)}
\t<key>StandardErrorPath</key>
\t${string(log)}
</dict>
</plist>
`;
}

const invalidJob = why => fail('agent_plist_invalid', `the launchd job is not one cua wrote: ${why}`, {hint: 'run cua agent install to replace it'});
const isStringMap = value => isDict(value) && Object.values(value).every(v => typeof v === 'string');

// cua's reader for the job it writes: the label, `<node> <cli> agent run <args…>`, and the keys cua sets. Keys added by
// hand (a ProcessType, an extra variable) are tolerated.
export function readPlist(text) {
  let job;
  try { job = parsePlist(text); } catch (error) {
    if (error.code === 'plist_invalid') invalidJob(error.message);
    throw error;
  }
  if (!isDict(job)) invalidJob('it is not a dictionary');
  if (job.Label !== AGENT_LABEL) invalidJob(`its Label is ${JSON.stringify(job.Label)}, not ${AGENT_LABEL}`);
  const args = job.ProgramArguments;
  if (!Array.isArray(args) || !args.every(a => typeof a === 'string') || args.length < 4 || args[2] !== 'agent' || args[3] !== 'run')
    invalidJob('its ProgramArguments are not <node> <cua> agent run …');
  if (job.EnvironmentVariables !== undefined && !isStringMap(job.EnvironmentVariables)) invalidJob('its EnvironmentVariables are not all strings');
  const keepAlive = job.KeepAlive ?? false;
  if (typeof keepAlive !== 'boolean' && !(isDict(keepAlive) && Object.values(keepAlive).every(v => typeof v === 'boolean')))
    invalidJob('its KeepAlive is neither true/false nor a dictionary of conditions');
  for (const key of ['StandardOutPath', 'StandardErrorPath'])
    if (job[key] !== undefined && typeof job[key] !== 'string') invalidJob(`its ${key} is not a path`);
  return {
    label: job.Label,
    programArguments: args,
    node: args[0],
    cli: args[1],
    args: args.slice(4),
    environment: {...job.EnvironmentVariables},
    keepAlive,
    runAtLoad: job.RunAtLoad === true,
    standardOutPath: job.StandardOutPath,
    standardErrorPath: job.StandardErrorPath,
  };
}

// ---- launchd ----

// The job's own lines of `launchctl print`: one tab deep (nested sections are deeper).
export function parseLaunchdPrint(text) {
  const fields = {};
  for (const [, key, value] of text.matchAll(/^\t([a-z][a-z ]*?) = (.*)$/gm)) fields[key] ??= value;
  const pid = /^\d+$/.test(fields.pid ?? '') ? Number(fields.pid) : undefined;
  return {state: fields.state, pid, lastExitCode: fields['last exit code']};
}

const serviceOf = uid => `gui/${uid}/${AGENT_LABEL}`;

async function loadedJob(launchctl, uid) {
  const printed = await launchctl(['print', serviceOf(uid)]);
  if (printed.code === 0) return parseLaunchdPrint(printed.stdout);
  if (/could not find service/i.test(printed.stderr) || printed.code === 113) return null;
  fail('agent_launchd_unreadable', `launchctl print ${serviceOf(uid)} failed (exit ${printed.code}): ${printed.stderr.trim()}`);
}

// Boots the job out if launchd has it, then waits until launchd no longer lists it (a stopping agent closes its
// sessions first). Returns whether there was a job to boot out.
async function bootOut(launchctl, uid, settleMs) {
  if (!await loadedJob(launchctl, uid)) return false;
  const result = await launchctl(['bootout', serviceOf(uid)]);
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (await loadedJob(launchctl, uid)) {
    if (Date.now() > deadline)
      fail('agent_bootout_failed', `launchd still has ${serviceOf(uid)} after launchctl bootout (exit ${result.code}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''})`, {hint: `run launchctl bootout ${serviceOf(uid)} and retry`});
    await sleep(settleMs);
  }
  return true;
}

// ---- the commands ----

function writePlist(path, text) {
  mkdirSync(dirname(path), {recursive: true});
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, {mode: 0o644, flag: 'wx'});
    chmodSync(temp, 0o644);   // whatever the umask: launchd refuses a job file others may write
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

export async function installAgent({home, env = process.env, http, surfaces = DEFAULT_SURFACES, node = process.execPath, cli = CLI,
  userHome = homedir(), uid = process.getuid(), launchctl = runLaunchctl, settleMs = 250, loadRelay = loadWebSocket}) {
  if (http !== undefined && http !== null) parseFixedAddress(http);
  const named = surfacesFrom(surfaces).join(',');
  limitsFrom(env);
  consoleCheckFrom(env);
  const device = readDevice(home);
  if (!device) fail('remote_not_enrolled', 'this Mac is not enrolled for remote control', {hint: 'run cua remote enroll first'});
  if (device.relayUrl) checkRelayUrl(device.relayUrl);
  // A --relay job whose checkout cannot load ws would refuse at every start and be restarted every 10 s.
  if (device.relayUrl) await loadRelay();
  const args = [...(device.relayUrl ? ['--relay'] : []), ...(http ? ['--http', http] : [])];
  if (!args.length)
    fail('agent_nothing_to_serve', 'the agent would have nothing to serve: no relay is enrolled and no --http address was given', {hint: 'give --http <this Mac\'s LAN address>:7801, or enrol a relay with cua remote enroll --relay <wss url>'});
  const log = agentLogPath(home);
  const settings = Object.fromEntries(AGENT_SETTINGS.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  const environment = {...(env.CUA_HOME ? {CUA_HOME: resolve(env.CUA_HOME)} : {}), CUA_SHIM_SURFACES: named, ...settings};
  const programArguments = [node, cli, 'agent', 'run', ...args];
  const unrepresentable = [...programArguments, log, ...Object.values(environment)].find(text => !representable(text));
  if (unrepresentable !== undefined)
    fail('agent_path_unsupported', `${JSON.stringify(unrepresentable)} has a control character a launchd plist cannot hold`, {hint: 'install cua and node at paths without control characters'});

  const text = agentPlist({programArguments, environment, log});
  const job = readPlist(text);
  if (JSON.stringify([job.programArguments, job.environment, job.standardOutPath]) !== JSON.stringify([programArguments, environment, log]))
    fail('agent_plist_invalid', 'the launchd job cua wrote does not read back as written', {hint: 'report this; nothing was installed'});

  const plist = agentPlistPath(userHome);
  mkdirSync(join(resolve(home), 'state'), {recursive: true, mode: 0o700});
  writePlist(plist, text);
  await bootOut(launchctl, uid, settleMs);
  const loaded = await launchctl(['bootstrap', `gui/${uid}`, plist]);
  if (loaded.code !== 0)
    fail('agent_bootstrap_failed', `launchctl bootstrap gui/${uid} ${plist} failed (exit ${loaded.code}): ${loaded.stderr.trim() || 'no detail'}`, {hint: `the plist stays in place; see cua agent status and ${log}`});
  return {label: AGENT_LABEL, plist, node, cli, programArguments, environment, log, status: await agentStatus({userHome, uid, launchctl})};
}

// Boots the job out (also when its plist is already gone) and removes the plist.
export async function uninstallAgent({userHome = homedir(), uid = process.getuid(), launchctl = runLaunchctl, settleMs = 250} = {}) {
  const plist = agentPlistPath(userHome);
  const bootedOut = await bootOut(launchctl, uid, settleMs);
  const removed = existsSync(plist);
  rmSync(plist, {force: true});
  return {label: AGENT_LABEL, plist, bootedOut, removed};
}

// The job as installed, from its plist alone (launchd is not asked): {label, plist, installed, job?, invalid?}. Whatever
// is at the path, damage reads as `invalid`, never a throw: doctor, status and enroll's hint report it.
export function installedJob({userHome = homedir()} = {}) {
  const plist = agentPlistPath(userHome);
  let text;
  const found = {label: AGENT_LABEL, plist, installed: true};
  try { text = readFileSync(plist, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {label: AGENT_LABEL, plist, installed: false};
    found.invalid = `the plist could not be read (${error.code ?? error.message})`;
  }
  if (text !== undefined) try { found.job = readPlist(text); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    found.invalid = error.message;
  }
  return found;
}

// The job as installed and as launchd runs it. launchd is asked only when the plist exists: without it there is no job
// of cua's to describe.
export async function agentStatus({userHome = homedir(), uid = process.getuid(), launchctl = runLaunchctl} = {}) {
  const status = installedJob({userHome});
  if (!status.installed) return {...status, loaded: false, running: false};
  let loaded;
  try { loaded = await loadedJob(launchctl, uid); } catch (error) {
    if (error.code !== 'agent_launchd_unreadable') throw error;
    return {...status, loaded: false, running: false, launchdError: error.message};
  }
  return {...status, loaded: loaded !== null, running: loaded?.pid !== undefined, pid: loaded?.pid, state: loaded?.state, lastExitCode: loaded?.lastExitCode};
}
