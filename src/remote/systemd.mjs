// `cua agent install|uninstall|status` on Linux: the resident agent (`cua agent run`, src/remote/agent.mjs) as a
// systemd user unit, ~/.config/systemd/user/cua-agent.service, the counterpart of the macOS launchd job
// (src/remote/launchd.mjs). The unit runs what src/remote/job.mjs describes (the node that ran `install` with this
// checkout's bin/cua.mjs `agent run`, `--relay` and `--http`, in the environment job.mjs names) plus the X display the
// computer surface drives: DISPLAY (--display, else the installing session's, else :0) and XAUTHORITY (--xauthority,
// else the installing session's; unset, X clients read ~/.Xauthority). The session bus needs nothing: the user manager
// gives every unit XDG_RUNTIME_DIR, from which the launch derives the bus as it does over SSH.
//
// Type=exec, so a start whose program cannot be executed fails `restart` (agent_start_failed) rather than reading as
// started. Restart=on-failure with RestartSec=10 is launchd's KeepAlive {SuccessfulExit: false} and its 10 s throttle: a crash
// or a refusal (agent_already_running) is restarted, the agent's deliberate stops (a signal, relay close codes 4001 and
// 4003, all exit 0) are not, so two agents for one device never take the relay link from each other in a loop.
// KillMode=mixed sends the stop's SIGTERM to the agent alone, which closes its sessions and their runtimes itself;
// whatever is left after it exits is killed. stdout and stderr are appended to $CUA_HOME/state/agent.log, as under
// launchd. WantedBy=default.target starts it with the user's manager: at login, or at boot once
// `loginctl enable-linger <user>` keeps the manager running without a session (install reports linger; enabling it is
// the owner's step, since logind may ask for a password).
//
// The unit is written by templating with systemd's quoting (C escapes inside double quotes, %% for a literal %, $$ for a
// literal $ in ExecStart) and checked by reading it back with cua's own reader before it replaces anything. `install`
// runs `systemctl --user daemon-reload`, `enable` and `restart` (a running agent is replaced by the new unit);
// `uninstall` runs `stop` and `disable`, removes the file and reloads. `systemctl` and `loginctl` and the user's home are
// parameters, so tests never touch a real user manager or ~/.config/systemd.
import {execFile} from 'node:child_process';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, userInfo} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CLI, DEFAULT_SURFACES, agentJobSpec} from './job.mjs';
import {CuaError, fail} from '../runtime/errors.mjs';

export const AGENT_UNIT = 'cua-agent.service';

export const agentUnitPath = (userHome = homedir()) => join(userHome, '.config', 'systemd', 'user', AGENT_UNIT);

const run = command => args => new Promise(done => {
  execFile(command, args, {encoding: 'utf8', timeout: 120_000}, (error, stdout, stderr) => done({
    code: error ? (Number.isInteger(error.code) ? error.code : -1) : 0,
    stdout: stdout ?? '',
    stderr: stderr || (error && !Number.isInteger(error.code) ? error.message : ''),
  }));
});
export const runSystemctl = args => run('systemctl')(['--user', ...args]);
export const runLoginctl = run('loginctl');

// ---- the unit ----

// Characters a unit file cannot hold in a value at all.
const UNREPRESENTABLE = /[\u0000-\u001f\u007f]/;
const DISPLAY = /^[A-Za-z0-9.-]*:\d+(\.\d+)?$/;

const quote = (text, {dollar}) => {
  const escaped = text.replace(/[\\"]/g, c => `\\${c}`).replace(/%/g, '%%');
  return `"${dollar ? escaped.replace(/\$/g, '$$$$') : escaped}"`;
};

export function agentUnit({programArguments, environment, log}) {
  const env = Object.entries(environment).map(([key, value]) => `Environment=${quote(`${key}=${value}`, {dollar: false})}\n`).join('');
  const path = log.replace(/%/g, '%%');
  return `# Written by cua agent install; cua agent install rewrites it and cua agent uninstall removes it.
[Unit]
Description=cua agent (remote control of this desktop)

[Service]
Type=exec
ExecStart=${programArguments.map(arg => quote(arg, {dollar: true})).join(' ')}
${env}Restart=on-failure
RestartSec=10
KillMode=mixed
StandardOutput=append:${path}
StandardError=append:${path}

[Install]
WantedBy=default.target
`;
}

const invalidUnit = why => fail('agent_unit_invalid', `the systemd unit is not one cua wrote: ${why}`, {hint: 'run cua agent install to replace it'});

const C_ESCAPES = {n: '\n', t: '\t', r: '\r', s: ' ', '\\': '\\', '"': '"', '\'': '\''};

// One value split into words as systemd splits ExecStart and Environment: double- or single-quoted words with C escapes,
// or bare words. `dollar`: ExecStart's $$ is a literal $ and any other $ expands a variable (not something cua writes).
function words(value, {dollar, what}) {
  const out = [];
  let at = 0;
  const unescape = text => text.replace(/\\(.)/g, (_, c) => C_ESCAPES[c] ?? invalidUnit(`${what} has an escape \\${c} cua does not write`));
  const resolveText = text => {
    let resolved = text.replace(/%(.)?/g, (_, c) => (c === '%' ? '%' : invalidUnit(`${what} uses a systemd specifier %${c ?? ''} that cua does not expand`)));
    if (dollar) resolved = resolved.replace(/\$(.)?/g, (_, c) => (c === '$' ? '$' : invalidUnit(`${what} expands an environment variable, which cua does not write`)));
    return resolved;
  };
  while (at < value.length) {
    while (value[at] === ' ' || value[at] === '\t') at++;
    if (at >= value.length) break;
    const open = value[at];
    if (open === '"' || open === '\'') {
      let end = at + 1;
      while (end < value.length && value[end] !== open) end += value[end] === '\\' ? 2 : 1;
      if (end >= value.length) invalidUnit(`${what} has an unclosed quote`);
      out.push(resolveText(unescape(value.slice(at + 1, end))));
      at = end + 1;
      if (at < value.length && value[at] !== ' ' && value[at] !== '\t') invalidUnit(`${what} has text after a closing quote`);
    } else {
      const end = value.slice(at).search(/[ \t]/);
      const word = end === -1 ? value.slice(at) : value.slice(at, at + end);
      out.push(resolveText(unescape(word)));
      at += word.length;
    }
  }
  return out;
}

// cua's reader for the unit it writes: `<node> <cli> agent run <args…>`, the environment, Restart and the log. Keys and
// sections added by hand are tolerated; anything that changes what runs in a way cua cannot read is `agent_unit_invalid`.
export function readUnit(text) {
  if (typeof text !== 'string') invalidUnit('no text');
  const service = {};
  const environment = {};
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.endsWith('\\')) invalidUnit('it continues a line with \\, which cua does not write');
    const header = /^\[(.+)\]$/.exec(line);
    if (header) { section = header[1]; continue; }
    const pair = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*)$/.exec(line);
    if (!pair) invalidUnit(`a line is not key=value: ${JSON.stringify(line.slice(0, 80))}`);
    if (section !== 'Service') continue;
    const [, key, value] = pair;
    if (key === 'Environment') {
      if (value === '') { for (const name of Object.keys(environment)) delete environment[name]; continue; }
      for (const assignment of words(value, {dollar: false, what: 'Environment'})) {
        const eq = assignment.indexOf('=');
        if (eq < 1) invalidUnit(`an Environment assignment has no name: ${JSON.stringify(assignment)}`);
        Object.defineProperty(environment, assignment.slice(0, eq), {value: assignment.slice(eq + 1), enumerable: true, writable: true, configurable: true});
      }
      continue;
    }
    if (key === 'ExecStart' && Object.hasOwn(service, 'ExecStart')) invalidUnit('it has more than one ExecStart');
    service[key] = value;
  }
  if (!Object.hasOwn(service, 'ExecStart')) invalidUnit('it has no [Service] ExecStart');
  if (/^[-@:+!]/.test(service.ExecStart)) invalidUnit('its ExecStart has a prefix (-, @, :, + or !) cua does not write');
  const args = words(service.ExecStart, {dollar: true, what: 'ExecStart'});
  if (args.length < 4 || args[2] !== 'agent' || args[3] !== 'run') invalidUnit('its ExecStart is not <node> <cua> agent run …');
  const output = key => {
    const value = service[key];
    if (value === undefined) return undefined;
    const target = /^(?:append|file|truncate):(.+)$/.exec(value)?.[1];
    return target === undefined ? undefined : target.replace(/%(.)?/g, (_, c) => (c === '%' ? '%' : invalidUnit(`${key} uses a systemd specifier`)));
  };
  return {
    programArguments: args,
    node: args[0],
    cli: args[1],
    args: args.slice(4),
    environment: {...environment},
    restart: service.Restart ?? 'no',
    standardOutPath: output('StandardOutput'),
    standardErrorPath: output('StandardError'),
  };
}

// ---- the user manager ----

const SHOWN = ['LoadState', 'ActiveState', 'SubState', 'MainPID', 'ExecMainStatus', 'Result', 'UnitFileState', 'NeedDaemonReload', 'NRestarts'];

// `systemctl show` prints key=value lines.
export function parseShow(text) {
  const fields = {};
  for (const [, key, value] of text.matchAll(/^([A-Za-z]+)=(.*)$/gm)) fields[key] ??= value;
  return fields;
}

const unreachable = (verb, result) => fail('agent_systemd_unreachable', `systemctl --user ${verb} failed (exit ${result.code}): ${result.stderr.trim() || 'no detail'}`,
  {hint: 'the user\'s systemd manager must be reachable: run this in the user\'s own login (SSH or desktop), where XDG_RUNTIME_DIR is set'});

async function showUnit(systemctl) {
  const shown = await systemctl(['show', AGENT_UNIT, `--property=${SHOWN.join(',')}`]);
  if (shown.code !== 0) unreachable('show', shown);
  return parseShow(shown.stdout);
}

async function lingerOf(loginctl, user) {
  const shown = await loginctl(['show-user', user, '--property=Linger', '--value']);
  if (shown.code !== 0) return null;   // no logind record (no session and no linger): reported as unknown
  const value = shown.stdout.trim();
  return value === 'yes' ? true : value === 'no' ? false : null;
}

async function ran(systemctl, args, code, hint) {
  const result = await systemctl(args);
  if (result.code !== 0) fail(code, `systemctl --user ${args.join(' ')} failed (exit ${result.code}): ${result.stderr.trim() || 'no detail'}`, {hint});
  return result;
}

// ---- the commands ----

function writeUnit(path, text) {
  mkdirSync(dirname(path), {recursive: true});
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, {mode: 0o644, flag: 'wx'});
    chmodSync(temp, 0o644);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

export async function installAgent({home, env = process.env, http, surfaces = DEFAULT_SURFACES, display, xauthority, node = process.execPath, cli = CLI,
  userHome = homedir(), user = userInfo().username, systemctl = runSystemctl, loginctl = runLoginctl, loadRelay}) {
  const spec = await agentJobSpec({home, env, http, surfaces, node, cli, machine: 'this machine', ...(loadRelay ? {loadRelay} : {})});
  const shownDisplay = display ?? env.DISPLAY ?? ':0';
  if (!DISPLAY.test(shownDisplay))
    fail('invalid_display', `the X display must look like :0 or host:0.0 (got ${JSON.stringify(shownDisplay)})`, {hint: 'give --display :0 (the display the desktop session runs on)'});
  const auth = xauthority ?? env.XAUTHORITY;
  if (auth !== undefined && auth !== '' && !isAbsolute(auth))
    fail('invalid_xauthority', `the X authority file must be an absolute path (got ${JSON.stringify(auth)})`, {hint: 'give --xauthority /home/<you>/.Xauthority'});
  const environment = {DISPLAY: shownDisplay, ...(auth ? {XAUTHORITY: resolve(auth)} : {}), ...spec.environment};
  const {programArguments, log} = spec;
  const unrepresentable = [...programArguments, log, ...Object.entries(environment).flat()].find(text => UNREPRESENTABLE.test(text));
  if (unrepresentable !== undefined)
    fail('agent_path_unsupported', `${JSON.stringify(unrepresentable)} has a control character a systemd unit cannot hold`, {hint: 'install cua and node at paths without control characters'});
  if (log !== log.trim()) fail('agent_path_unsupported', `the log path ${JSON.stringify(log)} starts or ends with whitespace, which a systemd unit drops`, {hint: 'use a CUA_HOME without leading or trailing spaces'});

  const text = agentUnit({programArguments, environment, log});
  const job = readUnit(text);
  if (JSON.stringify([job.programArguments, job.environment, job.standardOutPath, job.standardErrorPath]) !== JSON.stringify([programArguments, environment, log, log]))
    fail('agent_unit_invalid', 'the systemd unit cua wrote does not read back as written', {hint: 'report this; nothing was installed'});

  const unit = agentUnitPath(userHome);
  mkdirSync(join(resolve(home), 'state'), {recursive: true, mode: 0o700});
  // The manager is asked before anything is written: an unreachable one leaves no unit behind.
  await showUnit(systemctl);
  writeUnit(unit, text);
  const hint = `the unit stays in place at ${unit}; see cua agent status and ${log}`;
  await ran(systemctl, ['daemon-reload'], 'agent_enable_failed', hint);
  await ran(systemctl, ['enable', AGENT_UNIT], 'agent_enable_failed', hint);
  await ran(systemctl, ['restart', AGENT_UNIT], 'agent_start_failed', hint);
  return {unit: AGENT_UNIT, path: unit, node, cli, programArguments, environment, log, status: await agentStatus({userHome, user, systemctl, loginctl})};
}

// Stops and disables the unit (also when its file is already gone), removes the file and reloads the manager.
// An agent still running after its file was deleted and the manager reloaded reads LoadState=not-found while active:
// it is stopped all the same, and `disable` (which needs the file) runs only while the file exists.
export async function uninstallAgent({userHome = homedir(), systemctl = runSystemctl} = {}) {
  const unit = agentUnitPath(userHome);
  const before = await showUnit(systemctl);
  const known = before.LoadState !== 'not-found';
  const wasActive = ['active', 'activating', 'reloading', 'deactivating'].includes(before.ActiveState);
  const hint = `run systemctl --user stop ${AGENT_UNIT} and retry`;
  if (wasActive) await ran(systemctl, ['stop', AGENT_UNIT], 'agent_stop_failed', hint);
  const removed = existsSync(unit);
  if (removed) await ran(systemctl, ['disable', AGENT_UNIT], 'agent_stop_failed', `run systemctl --user disable ${AGENT_UNIT} and retry`);
  rmSync(unit, {force: true});
  // `disable` refuses once the file is gone (systemd 255: "Unit file … does not exist"), leaving the enable link behind.
  const wants = join(dirname(unit), 'default.target.wants', AGENT_UNIT);
  let linked = false;
  try { linked = lstatSync(wants).isSymbolicLink() && readlinkSync(wants) === unit; } catch {}
  if (linked) rmSync(wants, {force: true});
  if (known || removed || wasActive || linked) await ran(systemctl, ['daemon-reload'], 'agent_stop_failed', 'run systemctl --user daemon-reload');
  return {unit: AGENT_UNIT, path: unit, stopped: wasActive, removed: removed || linked};
}

// The unit as installed, from its file alone (the manager is not asked): {unit, path, installed, job?, invalid?}.
export function installedJob({userHome = homedir()} = {}) {
  const path = agentUnitPath(userHome);
  let text;
  const found = {unit: AGENT_UNIT, path, installed: true};
  try { text = readFileSync(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {unit: AGENT_UNIT, path, installed: false};
    found.invalid = `the unit could not be read (${error.code ?? error.message})`;
  }
  if (text !== undefined) try { found.job = readUnit(text); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    found.invalid = error.message;
  }
  return found;
}

// The unit as installed and as the user manager runs it, with whether the manager outlives the user's sessions
// (linger: true, false, or null when logind has no record). The manager is asked only when the unit file exists.
export async function agentStatus({userHome = homedir(), user = userInfo().username, systemctl = runSystemctl, loginctl = runLoginctl} = {}) {
  const status = installedJob({userHome});
  if (!status.installed) return {...status, loaded: false, running: false};
  let shown;
  try { shown = await showUnit(systemctl); } catch (error) {
    if (error.code !== 'agent_systemd_unreachable') throw error;
    return {...status, loaded: false, running: false, systemdError: error.message};
  }
  const pid = /^\d+$/.test(shown.MainPID ?? '') && Number(shown.MainPID) > 0 ? Number(shown.MainPID) : undefined;
  return {
    ...status,
    loaded: shown.LoadState === 'loaded',
    running: shown.ActiveState === 'active' && pid !== undefined,
    pid,
    state: shown.ActiveState && `${shown.ActiveState}${shown.SubState ? ` (${shown.SubState})` : ''}`,
    lastExitCode: shown.ExecMainStatus,
    enabled: shown.UnitFileState === 'enabled',
    needsReload: shown.NeedDaemonReload === 'yes',
    restarts: /^\d+$/.test(shown.NRestarts ?? '') ? Number(shown.NRestarts) : undefined,
    linger: await lingerOf(loginctl, user),
  };
}
