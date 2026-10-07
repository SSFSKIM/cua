// cua: install, diagnose and serve the standalone computer-use runtime. `bin/cua.mjs` and the plugin's `cua-shim.mjs`
// both run `main`. The home is $CUA_HOME, default ~/Library/Application Support/cua on macOS and
// ${XDG_DATA_HOME:-~/.local/share}/cua on Linux. Exit codes: 0 success, 1 failure or an unhealthy doctor report, 2 usage
// error.
import {parseArgs} from 'node:util';
import {execFile, spawn} from 'node:child_process';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';
import {defaultHome} from './runtime/layout.mjs';
import {loadPins, selectPin, findPin} from './runtime/manifest.mjs';
import {installRuntime, useRuntime} from './runtime/install.mjs';
import {inspectRuntime, summarize} from './runtime/doctor.mjs';
import {resolveRuntime} from './runtime/manifest.mjs';
import {runLogin, loginStatus, LOGIN_STATES} from './runtime/login.mjs';
import {CuaError, fail} from './runtime/errors.mjs';
import {serve as serveMcp} from './mcp/server.mjs';
import {clientSecretKey, devicesEntry, enrollDevice, readDevice, relayEndpoint} from './remote/device.mjs';
import {addDevice, credentialStored, devicesFile, importDevice, readDevices, removeDevice, suggestedDeviceName} from './remote/devices.mjs';
import {runAgent} from './remote/agent.mjs';
import * as launchd from './remote/launchd.mjs';
import * as systemd from './remote/systemd.mjs';
import {runSecrets, PREFERRED_ENTRY} from './secrets/commands.mjs';
import {fileStore, storeDir} from './secrets/store.mjs';
import {isLabel, LABEL_RULE} from './secrets/label.mjs';
import {chromeFacts, PERMISSION_FIX} from './profiles/chrome.mjs';
import {addProfile, readRegistry, removeProfile, reasonText} from './profiles/registry.mjs';
import {bindCommand, openCommand, profileReadiness} from './profiles/commands.mjs';
import {listLiveBackends} from './profiles/inventory.mjs';
import {sandboxModeFrom} from './runtime/sandbox.mjs';
import {pickReasonFor} from './profiles/bind.mjs';
import {isPermissionError, mapExtensionDirectories} from './profiles/directory-map.mjs';
import {chooseVendorRoute, registerCuaHost, registerHost, unregisterCuaHost, unregisterVendorHost} from './chrome/registration.mjs';
import {chromeRoute, effectiveRoute, extensionIdFor} from './chrome/route.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME} from './chrome/extension.mjs';

// The usage text names this platform's archive kind and default home, and the service manager that runs an installed
// agent (agent install, uninstall, status): launchd on macOS, the systemd user manager on Linux. The console check is
// macOS-only.
const PLATFORM_USAGE = {
  darwin: {archive: 'ChatGPT zip', home: '~/Library/Application Support/cua'},
  linux: {archive: 'ChatGPT deb', home: '$XDG_DATA_HOME/cua, else ~/.local/share/cua'},
};
const AGENT_JOB_USAGE = {
  darwin: `  agent install [--http <host:port>] [--surfaces <list>] [--json]  run the agent as a launchd job in this login session
                                                               (--relay when enrolled with one; surfaces default computer,browser)
  agent uninstall [--json]                                     stop the launchd job and remove it
  agent status [--json]                                        the launchd job: installed, its node, running (pid)`,
  linux: `  agent install [--http <host:port>] [--surfaces <list>] [--display <:N>] [--xauthority <file>] [--json]
                                                               run the agent as a systemd user unit (cua-agent.service), enabled;
                                                               --relay when enrolled with one; surfaces default computer,browser;
                                                               display and X authority default to this session's (display :0)
  agent uninstall [--json]                                     stop and disable the unit and remove it
  agent status [--json]                                        the unit: installed, its node, running (pid), linger`,
};
export const usageFor = platform => {
  const {archive, home} = PLATFORM_USAGE[platform] ?? PLATFORM_USAGE.darwin;
  const darwin = (PLATFORM_USAGE[platform] ? platform : 'darwin') === 'darwin';
  return `usage: cua <command>
  install [--archive <${archive}>] [--release <id>] [--json]   install and activate the pinned runtime and its Chrome host
  doctor [--json]                                              passive runtime health; exit 1 when a check fails
  runtime use <release> [--json]                               activate another verified installed release
  serve [--http <host:port>]                                   MCP over stdin/stdout until EOF or a signal (--http: as agent run --http)
  login [--device-auth]                                        sign the server in to Codex, at this terminal (only the
                                                               ChatGPT extension route, chrome register --vendor, needs it)
  login --status                                               whether the server has a Codex login (never shows it)
  secrets set <KEY>                                            store a secret in ~/.config/claude-secrets/KEY, typed hidden
                                                               at this terminal (in Claude Code, /secret KEY is preferred)
  secrets list [--json]                                        stored keys, never values
  secrets remove <KEY> [--yes]                                 delete one secret (confirmed at the terminal)
  profiles add <key> --chrome-profile <directory> [--json]     register an existing Chrome profile under a key
  profiles list [--json]                                       registered profiles and whether each is ready
  profiles remove <key> [--json]                               forget a key (Chrome itself is never changed)
  profiles bind <key> [--extension-instance-id <id>] [--dry-run] [--json]  bind a key to its live Chrome extension backend
  profiles open <key> [--json]                                 open a window in that Chrome profile, then report its readiness
  chrome register [--replace] [--json]                         register cua's own Chrome host for the cua extension
  chrome unregister [--json]                                   remove that registration, restoring what it replaced
  chrome register --vendor [--replace] [--json]                instead register the ChatGPT extension's host (until removal)
  chrome unregister --vendor [--json]                          remove that registration, restoring what it replaced
  remote enroll [--relay <wss url>] [--rotate] [--json]        enrol this Mac for remote control; shows the client credential once
  remote show [--json]                                         the device id, relay URL and the relay's devices.json line
  agent run [--http <host:port>] [--relay]                     serve MCP to remote clients until a signal; --http 127.0.0.1:7801
                                                               serves this Mac only, its LAN address serves the LAN; --relay
                                                               dials the relay enrolled with remote enroll --relay (both: both)
${AGENT_JOB_USAGE[darwin ? 'darwin' : 'linux']}
  devices add <name> --relay <url> --device <id> [--replace] [--json]  register a remote device for devices_use; its
                                                               credential is the secret CUA_DEVICE_<id, - as _> (/secret)
  devices import <file> [--name <name>] [--replace] [--json]   register the device a client config (*.mcp.json) reaches and
                                                               store its credential (name: the file's, less .mcp.json)
  devices list [--json]                                        registered devices and whether each credential is stored
  devices remove <name> [--json]                               forget a device (its stored credential stays)
environment: CUA_HOME (default ${home}); for agent run (agent install carries those set into
  the ${darwin ? 'job' : 'unit'}): CUA_AGENT_MAX_SESSIONS (default 1), CUA_AGENT_IDLE_MINUTES (default 15), CUA_AGENT_ALLOWED_ORIGINS (browser
  origins allowed to call; none by default)${darwin ? `, CUA_AGENT_CONSOLE_CHECK (on: js answers console_locked while the screen is
  locked; off)` : ''}`;
};
const USAGE = usageFor(process.platform);

class UsageError extends Error {}

function parse(args, options = {}, positionals = 0) {
  let parsed;
  try {
    parsed = parseArgs({args, options: {json: {type: 'boolean'}, ...options}, allowPositionals: positionals > 0, strict: true});
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (parsed.positionals.length !== positionals) throw new UsageError(`expected ${positionals} argument(s)`);
  return parsed;
}

const print = value => process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n');

function progressReporter() {
  if (!process.stderr.isTTY) return undefined;
  let shown = -1;
  return (received, total) => {
    const percent = Math.floor((received / total) * 100);
    if (percent !== shown && percent % 5 === 0) { shown = percent; process.stderr.write(`\rdownloading ${percent}%`); }
    if (received === total) process.stderr.write('\n');
  };
}

async function install(args) {
  const {values} = parse(args, {archive: {type: 'string'}, release: {type: 'string'}});
  const pins = loadPins();
  const manifest = values.release ? findPin(pins, values.release) : selectPin(pins);
  if (!values.json) process.stderr.write(`installing ${manifest.release} from ${values.archive ?? manifest.archive.url}\n`);
  const result = await installRuntime({home: defaultHome(), manifest, archivePath: values.archive, onProgress: values.json ? undefined : progressReporter()});
  if (values.json) print({ok: true, release: result.release, root: result.root, changed: result.changed, source: result.record.source, chromeHost: result.chromeHost});
  else if (!result.chromeHost.changed) print(`${result.release} is already installed and verified, with its Chrome host; active at ${result.root}`);
  else if (result.releaseChanged) print(`installed and activated ${result.release} at ${result.root}, with its Chrome host at ${result.chromeHost.root}`);
  else print(`added the Chrome host to the installed release ${result.release} at ${result.chromeHost.root}; nothing that was installed changed`);
}

async function doctor(args) {
  const {values} = parse(args);
  const home = defaultHome();
  const report = await inspectRuntime({home});
  if (values.json) print({home, ...report});
  else {
    print(`cua doctor (CUA_HOME=${home})`);
    for (const c of report.checks) print(`${c.status.toUpperCase().padEnd(8)} ${c.name.padEnd(24)} ${c.detail}`);
    print(summarize(report));
  }
  return report.ok ? 0 : 1;
}

async function runtime(args) {
  if (args[0] !== 'use') throw new UsageError('runtime takes the subcommand "use"');
  const {values, positionals} = parse(args.slice(1), {}, 1);
  const result = await useRuntime({home: defaultHome(), release: positionals[0]});
  if (values.json) print({ok: true, release: result.release, root: result.root});
  else print(`active release is now ${result.release}`);
}

// stdout carries only the MCP stream from here on; every diagnostic goes to stderr. A client that ends without closing
// in order (killed, its pipes closed) takes stderr with it, and a diagnostic written during the teardown that follows
// must not crash the server before it has removed what it owns, so stderr write errors are dropped. Once the server has
// closed and cleaned up, nothing may keep the process alive: an unreferenced timer exits if anything still does.
async function serve(args) {
  const {values} = parse(args, {http: {type: 'string'}}, 0);
  if (values.http !== undefined) return agentRun({http: values.http, relay: false});
  process.stderr.on('error', () => {});
  const code = await serveMcp({home: defaultHome()});
  setTimeout(() => process.exit(code), 1000).unref();
  return code;
}

// Remote control (src/remote). enroll mints the device record and shows the client credential this once; nothing
// else ever prints it (or the secret): a relay-only update and show print the device id and the relay's line, hashes
// only. Both suggest the client's registration: on the relay's endpoint when one is enrolled, else on this Mac's address.
const mcpAdd = (endpoint, credential) => `claude mcp add --transport http cua_repl ${endpoint ?? 'http://<this Mac\'s address>:7801/mcp'} --header "Authorization: Bearer ${credential}"`;
const REMOTE_USAGE = {enroll: 'remote enroll takes only --relay <wss url>, --rotate and --json', show: 'remote show takes only --json'};

function remote(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(REMOTE_USAGE, command)) throw new UsageError('remote takes enroll or show');
  let values;
  try { ({values} = parse(rest, command === 'enroll' ? {relay: {type: 'string'}, rotate: {type: 'boolean'}} : {}, 0)); } catch (error) {
    if (error instanceof UsageError) throw new UsageError(REMOTE_USAGE[command]);
    throw error;
  }
  const home = defaultHome();
  const register = (endpoint, credential) => `  ${mcpAdd(endpoint, credential)}`;
  // --json also names where a client keeps the credential, the /secret store, and the registration that reads it there,
  // so the client's setup is a printed command whose output never holds the credential. Without a relay the client's URL
  // is an address only its owner knows, so there is no command to print (null).
  // devicesAddCommand is the plugin route's registration (cua devices add), under a name taken from this machine's.
  const clientSetup = (deviceId, endpoint) => {
    const key = clientSecretKey(deviceId);
    return {
      clientSecretKey: key,
      clientRegisterCommand: endpoint ? mcpAdd(endpoint, `$(cat ~/.config/claude-secrets/${key})`) : null,
      devicesAddCommand: endpoint ? `cua devices add ${suggestedDeviceName(hostname())} --relay ${new URL(endpoint).origin} --device=${deviceId}` : null,
    };
  };
  if (command === 'show') {
    const record = readDevice(home);
    if (!record) fail('remote_not_enrolled', 'this Mac is not enrolled for remote control', {hint: 'run cua remote enroll'});
    const shown = {deviceId: record.deviceId, relayUrl: record.relayUrl ?? null, relayEndpoint: relayEndpoint(record), enrolledAt: record.enrolledAt, devicesEntry: devicesEntry(record)};
    if (values.json) return done({ok: true, ...shown, ...clientSetup(shown.deviceId, shown.relayEndpoint)});
    return done([
      `device    ${shown.deviceId}\nrelay     ${shown.relayUrl ?? 'none (local only)'}\nenrolled  ${shown.enrolledAt}\nthe relay's devices.json line:\n  ${shown.devicesEntry}`,
      ...(shown.relayEndpoint ? ['a client registers on the relay under the name cua_repl, with the credential enroll showed:', register(shown.relayEndpoint, '<client credential>')] : []),
    ].join('\n'));
  }
  const result = enrollDevice({home, relayUrl: values.relay, rotate: values.rotate});
  const endpoint = relayEndpoint(result);
  // A job installed before the relay was enrolled serves only its --http address until install rewrites it.
  const job = values.relay === undefined ? null : installedAgentJob();
  const lacksRelay = Boolean(job && !job.args.includes('--relay'));
  if (values.json) return done({ok: true, ...result, relayEndpoint: endpoint, ...clientSetup(result.deviceId, endpoint), ...(lacksRelay ? {agentJobLacksRelay: true} : {})});
  const relayLine = `the relay's devices.json line:\n  ${result.devicesEntry}`;
  const installHint = lacksRelay ? ['the installed agent job does not dial the relay: run cua agent install to add --relay'] : [];
  if (result.updated) return done([
    `device ${result.deviceId} now uses the relay ${result.relayUrl}; its secret and credentials are unchanged`,
    relayLine,
    'a client registers on the relay under the name cua_repl, with the credential enroll showed:',
    register(endpoint, '<client credential>'),
    ...installHint,
  ].join('\n'));
  return done([
    `${values.rotate ? 'rotated the secret of' : 'enrolled this Mac as'} device ${result.deviceId} (relay: ${result.relayUrl ?? 'none, local only'})`,
    'client credential, shown this once (cua never prints it again; --rotate replaces it):',
    `  ${result.clientCredential}`,
    `register it on the client under the name cua_repl, ${endpoint ? 'on the relay' : 'on this Mac\'s address'}, for example:`,
    register(endpoint, result.clientCredential),
    relayLine,
    ...installHint,
  ].join('\n'));
}

// The client's device registry (src/remote/devices.mjs) for the stdio server's devices_use. Usage errors are fixed
// messages that never repeat what was passed (a stray word may be a credential pasted in the wrong place). Output names
// devices, ids, relays and the credential's key and whether it is stored, never a value.
const DEVICES_USAGE = {
  add: 'devices add takes a name, --relay <url> and --device <id> (an id starting with - as --device=<id>), and optionally --replace and --json',
  import: 'devices import takes one client config file, and optionally --name <name>, --replace and --json',
  list: 'devices list takes only --json',
  remove: 'devices remove takes exactly one name and optionally --json',
};
const DEVICES_OPTIONS = {
  add: {relay: {type: 'string'}, device: {type: 'string'}, replace: {type: 'boolean'}},
  import: {name: {type: 'string'}, replace: {type: 'boolean'}},
  list: {},
  remove: {},
};
const ENTRY_OUTCOMES = {added: 'registered', unchanged: 'already registered', replaced: 're-registered'};
const PRESENCE = new Map([[true, 'credential stored'], [false, 'credential missing'], [null, 'credential unknown (the secret store cannot be listed)']]);

async function devices(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(DEVICES_USAGE, command)) throw new UsageError('devices takes add, import, list or remove');
  let values, positionals;
  try { ({values, positionals} = parse(rest, DEVICES_OPTIONS[command], command === 'list' ? 0 : 1)); } catch (error) {
    if (error instanceof UsageError) throw new UsageError(DEVICES_USAGE[command]);
    throw error;
  }
  if (command === 'add' && (values.relay === undefined || values.device === undefined)) throw new UsageError(DEVICES_USAGE.add);
  const env = process.env;
  const store = fileStore({dir: storeDir(env)});
  const describe = d => `${d.name}: device ${d.deviceId} on ${d.relayUrl}`;
  if (command === 'list') {
    const listed = [];
    for (const [name, {deviceId, relayUrl}] of Object.entries(readDevices({env})))
      listed.push({name, deviceId, relayUrl, clientSecretKey: clientSecretKey(deviceId), credentialStored: await credentialStored(store, deviceId)});
    if (values.json) return done({ok: true, devices: listed});
    if (!listed.length) { process.stderr.write(`no devices are registered in ${devicesFile(env)}\n`); return 0; }
    const width = Math.max(...listed.map(d => d.name.length));
    return done(listed.map(d => `${d.name.padEnd(width)}  ${d.deviceId}  ${d.relayUrl}  ${PRESENCE.get(d.credentialStored)}`).join('\n'));
  }
  if (command === 'remove') {
    const removed = removeDevice({env, name: positionals[0]});
    const key = clientSecretKey(removed.deviceId);
    if (values.json) return done({ok: true, ...removed, clientSecretKey: key});
    return done(`removed ${describe(removed)}; its credential stays stored under ${key} (cua secrets remove ${key} deletes it)`);
  }
  if (command === 'import') {
    const {entry, credential, ...device} = await importDevice({env, file: positionals[0], name: values.name, replace: values.replace, store});
    const key = clientSecretKey(device.deviceId);
    if (values.json) return done({ok: true, ...device, entry, clientSecretKey: key, credential});
    return done(`${ENTRY_OUTCOMES[entry]} ${describe(device)}; credential ${credential} under ${key}`);
  }
  const {entry, ...device} = addDevice({env, name: positionals[0], relayUrl: values.relay, deviceId: values.device, replace: values.replace});
  const key = clientSecretKey(device.deviceId);
  const stored = await credentialStored(store, device.deviceId);
  const storeStep = `store the device's client credential with /secret ${key} in Claude Code (or cua secrets set ${key})`;
  if (stored === false) process.stderr.write(`warning: no credential is stored under ${key} yet; ${storeStep}\n`);
  if (stored === null) process.stderr.write(`warning: the secret store cannot be listed, so whether ${key} is stored is unknown; ${storeStep}\n`);
  if (values.json) return done({ok: true, ...device, entry, clientSecretKey: key, credentialStored: stored});
  return done(`${ENTRY_OUTCOMES[entry]} ${describe(device)}`);
}

// The resident agent (src/remote/agent.mjs) and the service that runs it: a launchd job on macOS
// (src/remote/launchd.mjs), a systemd user unit on Linux (src/remote/systemd.mjs). run's diagnostics go to stderr; once
// it has closed every session nothing may keep the process alive.
const AGENT_USAGE = {
  run: 'agent run takes --http <host:port>, --relay, or both',
  install: process.platform === 'linux'
    ? 'agent install takes only --http <host:port>, --surfaces <list>, --display <:N>, --xauthority <file> and --json'
    : 'agent install takes only --http <host:port>, --surfaces <list> and --json',
  uninstall: 'agent uninstall takes only --json',
  status: 'agent status takes only --json',
};
const AGENT_OPTIONS = {
  run: {http: {type: 'string'}, relay: {type: 'boolean'}},
  install: {http: {type: 'string'}, surfaces: {type: 'string'}, ...(process.platform === 'linux' ? {display: {type: 'string'}, xauthority: {type: 'string'}} : {})},
  uninstall: {},
  status: {},
};

// The installed agent's job as `remote enroll` reads it: the launchd job on macOS, the systemd unit on Linux.
const installedAgentJob = () => (process.platform === 'darwin' ? launchd.installedJob().job : process.platform === 'linux' ? systemd.installedJob().job : undefined);

async function agent(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(AGENT_USAGE, command)) throw new UsageError('agent takes run, install, uninstall or status');
  let values;
  try {
    if (command === 'run') ({values} = parseArgs({args: rest, options: AGENT_OPTIONS.run, allowPositionals: false, strict: true}));
    else ({values} = parse(rest, AGENT_OPTIONS[command], 0));
  } catch { throw new UsageError(AGENT_USAGE[command]); }
  if (command === 'run') {
    if (values.http === undefined && !values.relay) throw new UsageError(AGENT_USAGE.run);
    return agentRun({http: values.http ?? null, relay: values.relay === true});
  }
  if (process.platform === 'linux') return agentUnit(command, values);
  if (process.platform !== 'darwin')
    fail('unsupported_platform', `agent ${command} manages a launchd job on macOS or a systemd user unit on Linux, and this is ${process.platform}`, {hint: 'run cua agent run under this host\'s own service manager'});
  if (command === 'install') {
    const result = await launchd.installAgent({home: defaultHome(), http: values.http, surfaces: values.surfaces});
    if (values.json) return done({ok: true, ...result});
    return done([
      `installed the launchd job ${result.label} (${result.plist})`,
      `  runs    ${result.programArguments.join(' ')}`,
      `  node    ${result.node}; after upgrading or moving node, run cua agent install again${values.http ? ' (macOS\'s firewall judges this node binary for incoming connections: allow it if asked)' : ''}`,
      `  log     ${result.log}`,
      `  env     ${Object.entries(result.environment).map(([key, value]) => `${key}=${value}`).join(' ')}`,
      `  status  ${describeRunning(result.status)}`,
    ].join('\n'));
  }
  if (command === 'uninstall') {
    const result = await launchd.uninstallAgent();
    if (values.json) return done({ok: true, ...result});
    if (!result.bootedOut && !result.removed) return done(`no launchd job ${result.label} was installed; nothing changed`);
    return done(`${result.bootedOut ? 'stopped' : 'found no running'} launchd job ${result.label}${result.removed ? ` and removed ${result.plist}` : ''}`);
  }
  const status = await launchd.agentStatus();
  if (values.json) return done({ok: true, ...status});
  if (!status.installed) return done(`not installed (no ${status.plist}); run cua agent install`);
  return done([
    `job     ${status.label} (${status.plist})`,
    ...(status.job
      ? [`runs    ${status.job.programArguments.join(' ')}`, `node    ${status.job.node}`, `log     ${status.job.standardErrorPath ?? 'none'}`]
      : [`invalid ${status.invalid}`]),
    `status  ${describeRunning(status)}`,
  ].join('\n'));
}

function describeRunning(status) {
  if (status.launchdError) return `unknown: ${status.launchdError}`;
  if (status.running) return `running, pid ${status.pid}`;
  if (status.loaded) return `loaded but not running (state ${status.state ?? 'unknown'}, last exit code ${status.lastExitCode ?? 'unknown'})`;
  return 'not loaded in this login session';
}

// Linux: the systemd user unit.
async function agentUnit(command, values) {
  if (command === 'install') {
    const result = await systemd.installAgent({home: defaultHome(), http: values.http, surfaces: values.surfaces, display: values.display, xauthority: values.xauthority});
    if (values.json) return done({ok: true, ...result});
    return done([
      `installed and enabled the systemd user unit ${result.unit} (${result.path})`,
      `  runs    ${result.programArguments.join(' ')}`,
      `  node    ${result.node}; after upgrading or moving node, run cua agent install again`,
      `  log     ${result.log}`,
      `  env     ${Object.entries(result.environment).map(([key, value]) => `${key}=${value}`).join(' ')}`,
      `  status  ${describeUnit(result.status)}`,
      ...(result.status.linger === true ? [] : [`  linger  ${describeLinger(result.status.linger)}`]),
    ].join('\n'));
  }
  if (command === 'uninstall') {
    const result = await systemd.uninstallAgent();
    if (values.json) return done({ok: true, ...result});
    if (!result.stopped && !result.removed) return done(`no systemd user unit ${result.unit} was installed; nothing changed`);
    if (!result.removed) return done(`stopped systemd user unit ${result.unit}, whose file ${result.path} was already gone`);
    return done(`${result.stopped ? 'stopped and disabled' : 'disabled the stopped'} systemd user unit ${result.unit} and removed it (${result.path})`);
  }
  const status = await systemd.agentStatus();
  if (values.json) return done({ok: true, ...status});
  if (!status.installed) return done(`not installed (no ${status.path}); run cua agent install`);
  return done([
    `unit    ${status.unit} (${status.path})`,
    ...(status.job
      ? [`runs    ${status.job.programArguments.join(' ')}`, `node    ${status.job.node}`, `log     ${status.job.standardErrorPath ?? 'the user journal (journalctl --user -u cua-agent)'}`]
      : [`invalid ${status.invalid}`]),
    `status  ${describeUnit(status)}`,
    ...(status.systemdError ? [] : [`linger  ${describeLinger(status.linger)}`]),
  ].join('\n'));
}

function describeUnit(status) {
  if (status.systemdError) return `unknown: ${status.systemdError}`;
  const enabled = status.enabled ? 'enabled' : 'not enabled';
  const reload = status.needsReload ? '; the file changed since the manager read it (systemctl --user daemon-reload)' : '';
  if (status.running) return `running, pid ${status.pid} (${enabled})${reload}`;
  if (status.loaded) return `not running (${status.state ?? 'unknown'}, last exit status ${status.lastExitCode ?? 'unknown'}; ${enabled})${reload}`;
  return `not loaded by the user manager (systemctl --user daemon-reload, then cua agent install)${reload}`;
}

const describeLinger = linger => (linger === true
  ? 'on: the unit runs from boot and survives logout'
  : `${linger === false ? 'off' : 'unknown'}: the unit runs only while this user has a session; loginctl enable-linger keeps it running from boot and after logout`);

async function agentRun({http, relay}) {
  process.stderr.on('error', () => {});
  const code = await runAgent({home: defaultHome(), http, relay});
  setTimeout(() => process.exit(code), 1000).unref();
  return code;
}

// A secret is never an argument: set takes exactly one key and reads the value at a masked terminal prompt. Usage
// errors here are fixed messages that never repeat what was passed (an option name or a stray word may be a value
// typed in the wrong place), so the parser's own messages are not shown.
const SECRETS_USAGE = {
  set: 'secrets set takes exactly one key; the secret is typed at the terminal, never passed as an argument',
  remove: 'secrets remove takes exactly one key and optionally --yes',
  list: 'secrets list takes only --json',
};

async function secrets(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(SECRETS_USAGE, command)) throw new UsageError(`secrets takes set, list or remove; ${PREFERRED_ENTRY}`);
  const fixed = (options, positionals) => {
    try { return parse(rest, options, positionals); } catch (error) {
      if (error instanceof UsageError) throw new UsageError(SECRETS_USAGE[command]);
      throw error;
    }
  };
  const label = positionals => {
    if (!isLabel(positionals[0])) throw new UsageError(LABEL_RULE);
    return positionals[0];
  };
  if (command === 'set') {
    const {values, positionals} = fixed({}, 1);
    if (values.json) throw new UsageError(SECRETS_USAGE.set);
    return runSecrets({command, label: label(positionals)});
  }
  if (command === 'remove') {
    const {values, positionals} = fixed({yes: {type: 'boolean'}}, 1);
    if (values.json) throw new UsageError(SECRETS_USAGE.remove);
    return runSecrets({command, label: label(positionals), yes: values.yes});
  }
  const {values} = fixed({}, 0);
  return runSecrets({command, json: values.json});
}

// The server's own Codex login, kept in CUA_HOME's CODEX_HOME (src/runtime/login.mjs). No key or token is ever an
// argument, so everything but the two flags is refused with a fixed message that never repeats what was passed.
const LOGIN_USAGE = 'login takes only --device-auth or --status';
const LOGIN_MESSAGES = {
  [LOGIN_STATES.loggedIn]: 'the cua server has a Codex login in its own CODEX_HOME',
  [LOGIN_STATES.notLoggedIn]: 'the cua server has no Codex login in its own CODEX_HOME (only the ChatGPT extension route needs one: run `cua login` for it)',
};

async function login(args) {
  let values;
  try {
    ({values} = parseArgs({args, options: {'device-auth': {type: 'boolean'}, status: {type: 'boolean'}}, allowPositionals: false, strict: true}));
  } catch { throw new UsageError(LOGIN_USAGE); }
  if (values.status && values['device-auth']) throw new UsageError(LOGIN_USAGE);
  const home = defaultHome();
  const runtime = resolveRuntime({home});
  if (values.status) {
    const result = await loginStatus({home, runtime});
    print(LOGIN_MESSAGES[result.state] ?? `could not determine the cua server's Codex login: ${result.reason}`);
    return result.state === LOGIN_STATES.loggedIn ? 0 : 1;
  }
  process.stderr.write('signing the cua server in to Codex; its login is kept in CUA_HOME, separate from any desktop Codex login\n');
  const code = await runLogin({home, runtime, deviceAuth: values['device-auth']});
  if (code !== 0) process.stderr.write(`cua: codex login exited ${code}\n`);
  return code === 0 ? 0 : 1;
}

// Chrome profile registrations (src/profiles). Registering and removing only touch $CUA_HOME/profiles.json; bind runs
// one bounded, browser-only launch of the runtime to list the live extension backends, and list runs one (without tab
// counts) when some profile is bound, to check that its bound instance is live. Either fails (exit 1) when that
// launch's runtime could not be confirmed stopped; list still shows the profiles. open opens a window in the profile
// (the user's request, never automatic), then checks its readiness the way list does, at most three times; it exits 1
// unless the profile is ready by then.
const PROFILES_USAGE = {
  add: 'profiles add takes a key and --chrome-profile <directory>',
  list: 'profiles list takes only --json',
  remove: 'profiles remove takes exactly one key',
  bind: 'profiles bind takes a key and optionally --extension-instance-id <id> and --dry-run',
  open: 'profiles open takes exactly one key',
};
const done = value => { print(value); return 0; };
// `extension` is the home's route's extension: OpenAI's, or cua's own.
const ADDED = {
  installed: ({key, extension}) => `the ${extension} extension is installed there (next: cua profiles bind ${key})`,
  absent: ({extension}) => `the ${extension} extension is not installed there, so it stays not ready until you install it in that profile`,
  unreadable: ({key, chromeDataError, extension}) => `this process cannot read Chrome's data directory (${chromeDataError}), so that profile and its ${extension} extension could not be checked; registered anyway (next: cua profiles bind ${key}, whose live check works without that access; for the file checks, ${PERMISSION_FIX})`,
};
// Why the candidates carry no (or only some) profile directories: the mapping of directory-map.mjs, never a failure.
const MAP_UNAVAILABLE = {
  chrome_data_unreadable: ({readError}) => `this process cannot read Chrome's Local State (${readError}), so the candidates' profile directories are unknown; ${PERMISSION_FIX}`,
  local_state_unreadable: () => 'Chrome\'s Local State could not be read as a profile list, so the candidates\' profile directories are unknown',
  classic_level_unavailable: () => 'the installed runtime\'s classic-level could not be loaded, so the candidates\' profile directories are unknown',
  staging_unavailable: ({readError}) => `no scratch directory could be made under CUA_HOME/staging (${readError}), so the candidates' profile directories are unknown`,
  error: () => 'the candidates\' profile directories could not be determined',
};
const describeMap = map => !map || map.status === 'complete' ? []
  : map.status === 'unavailable' ? [MAP_UNAVAILABLE[map.reason]?.(map) ?? MAP_UNAVAILABLE.error()]
  : [`${map.unreadableStores} Chrome extension store(s) could not be read (${map.readError}), so some candidates may have no profile directory${isPermissionError(map.readError) ? `; ${PERMISSION_FIX}` : ''}`];
// One refused Local State read is one note, covering both what it costs the labels and the directories.
const describeUnreadable = result => {
  const both = result.localStateUnreadable && result.directoryMap?.reason === 'chrome_data_unreadable';
  return [
    ...(result.chromeDataUnreadable ? [`this process cannot read Chrome's data directory (${result.chromeDataUnreadable}): the extension's presence was not checked, the live listing decides`] : []),
    ...(both ? [`this process cannot read Chrome's Local State (${result.localStateUnreadable}): backend labels cannot be compared with this profile's name and the candidates' profile directories are unknown; ${PERMISSION_FIX}`]
      : [...(result.localStateUnreadable ? [`this process cannot read Chrome's Local State (${result.localStateUnreadable}): backend labels cannot be compared with this profile's name`] : []),
        ...describeMap(result.directoryMap)]),
  ].map(line => `note: ${line}\n`).join('');
};
// Each candidate with the vendor's profile label, how it compares with this profile's name, and the likely-match mark
// (on the backend an automatic bind chose, so the user sees which label decided it).
// The label is JSON-quoted with C1 controls and bidirectional overrides escaped too (JSON leaves them raw), so a name
// can neither drive the terminal (U+009B is a CSI) nor reorder the row the user picks from.
const quoted = text => JSON.stringify(text).replace(/[\u0080-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const LABELS = {'this-profile': 'this profile\'s name', 'other-profile': 'another profile\'s name',
  'comparison-unknown': 'this profile\'s own name is unknown, so it cannot be compared'};
const describeLabel = b => b.profileName === null ? 'unlabelled' : `labelled ${quoted(b.profileName)} (${LABELS[b.label]})`;
// Where cua's own read of the extension stores places the candidate (absent when the mapping did not run).
const describeDirectory = b => b.chromeProfile === undefined ? ''
  : b.chromeProfile === null ? '  profile directory unknown'
  : `  Chrome profile ${quoted(b.chromeProfile.directory)}${b.chromeProfile.name === null ? '' : ` ${quoted(b.chromeProfile.name)}`} (${b.chromeProfile.thisProfile ? 'this profile\'s directory' : 'another profile\'s directory'})`;
const describeBackend = (b, i) => `  ${i + 1}) extension instance ${b.instanceId}  ${b.tabCount ?? '?'} tab(s)${describeDirectory(b)}  ${describeLabel(b)}${b.likelyMatch ? '  <- likely match' : ''}`;
const describeExcluded = n => n ? `\n  (${n} extension backend(s) of a browser other than Google Chrome not listed: cua binds Google Chrome profiles only)` : '';
const describeStale = id => `the recorded binding, extension instance ${id}, is stale: it is not among the live backends. An extension disable/enable or reinstall mints a new id; pick this profile's new one from the live backends.`;

async function pickBackend(list, reason, nonChromeExcluded, {staleBinding, route} = {}) {
  if (staleBinding) process.stderr.write(`${describeStale(staleBinding)}\n`);
  process.stderr.write(`which live backend is this profile could not be determined: ${pickReasonFor(reason, route)}\n${list.map(describeBackend).join('\n')}${describeExcluded(nonChromeExcluded)}\n`);
  const {createInterface} = await import('node:readline/promises');
  const rl = createInterface({input: process.stdin, output: process.stderr});
  try {
    const answer = (await rl.question('Pick the number of the backend that is this Chrome profile, or press Enter to cancel: ')).trim();
    const index = Number(answer);
    return answer && Number.isInteger(index) && index >= 1 && index <= list.length ? list[index - 1].instanceId : null;
  } finally { rl.close(); }
}

const readinessLine = (p, route) => `${p.key.padEnd(12)} ${(p.ready ? 'ready' : 'not ready').padEnd(10)} ${p.chromeProfileDirectory.padEnd(12)} ${p.ready ? `extension instance ${p.extensionInstanceId}` : reasonText(p, {route})}`;
// The command as the user could paste it; it runs without a shell (execFile).
const shellWord = word => /^[A-Za-z0-9_./=:-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
// A detached opener (Linux's google-chrome, which becomes the browser itself when none runs) is done once it has
// started; nothing waits for it to exit.
export const runOpen = (command, args, {detached = false} = {}) => detached
  ? new Promise(resolve => {
    const child = spawn(command, args, {detached: true, stdio: 'ignore'});
    child.once('spawn', () => { child.unref(); resolve({code: 0, stderr: ''}); });
    child.once('error', error => resolve({code: 1, stderr: error.message}));
  })
  : new Promise(resolve => execFile(command, args, {encoding: 'utf8', timeout: 30_000}, (error, _stdout, stderr) =>
    resolve({code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stderr: stderr || (error && typeof error.code !== 'number' ? error.message : '')})));

async function profiles(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(PROFILES_USAGE, command)) throw new UsageError('profiles takes add, list, remove, bind or open');
  const parsed = (options, positionals) => {
    try { return parse(rest, options, positionals); } catch (error) {
      if (error instanceof UsageError) throw new UsageError(PROFILES_USAGE[command]);
      throw error;
    }
  };
  const home = defaultHome();
  const route = chromeRoute(home);
  const chrome = chromeFacts({extensionId: extensionIdFor(route)});
  if (command === 'add') {
    const {values, positionals} = parsed({'chrome-profile': {type: 'string'}}, 1);
    if (values['chrome-profile'] === undefined) throw new UsageError(PROFILES_USAGE.add);
    const added = addProfile({home, key: positionals[0], directory: values['chrome-profile'], chrome});
    if (values.json) return done({ok: true, ...added});
    return done(`registered ${added.key} -> Chrome profile "${added.chromeProfileDirectory}"; ${ADDED[added.extension]({...added, extension: route === 'cua' ? 'cua' : 'OpenAI'})}`);
  }
  // list and bind launch the runtime with the sandbox state CUA_SHIM_SANDBOX picks; a bad value fails the command here,
  // before readiness would fold a listing failure into its report.
  if (command === 'list' || command === 'bind' || command === 'open') sandboxModeFrom(process.env);
  if (command === 'list') {
    const {values} = parsed({}, 0);
    const {profiles: list, listingError} = await profileReadiness({home, chrome, listBackends: () => {
      if (!values.json) process.stderr.write('checking the live Chrome extension backends through the runtime (one bounded launch)...\n');
      return listLiveBackends({home, runtime: resolveRuntime({home}), tabCounts: false});
    }});
    const leftover = listingError?.code === 'runtime_teardown_unconfirmed';
    if (values.json) { print({ok: !leftover, profiles: list, ...(listingError ? {listingError: listingError.code} : {})}); return leftover ? 1 : 0; }
    if (listingError) process.stderr.write(`cua: the live Chrome extension backends could not be listed (${listingError.code}: ${listingError.message})\n`);
    if (!list.length) return done('no Chrome profiles are registered (cua profiles add <key> --chrome-profile <directory>)');
    for (const p of list) print(readinessLine(p, route));
    return leftover ? 1 : 0;
  }
  if (command === 'open') {
    const {values, positionals} = parsed({}, 1);
    const runtime = () => resolveRuntime({home});
    const result = await openCommand({home, key: positionals[0], chrome, run: runOpen,
      listBackends: () => listLiveBackends({home, runtime: runtime(), tabCounts: false}),
      onCheck: values.json ? undefined : ({check, of, afterMs}) => process.stderr.write(`checking its readiness ${Math.round(afterMs / 1000)} s after opening (${check} of at most ${of}; one bounded runtime launch)...\n`)});
    if (values.json) { print(result); return result.ok ? 0 : 1; }
    print(`ran: ${result.command.map(shellWord).join(' ')}`);
    if (result.readiness.listingError) process.stderr.write(`cua: the live Chrome extension backends could not be listed (${result.readiness.listingError}: ${result.readiness.listingMessage})\n`);
    print(readinessLine({key: result.key, chromeProfileDirectory: result.directory, ...result.readiness}, route));
    return result.ok ? 0 : 1;
  }
  if (command === 'remove') {
    const {values, positionals} = parsed({}, 1);
    removeProfile({home, key: positionals[0]});
    return done(values.json ? {ok: true, key: positionals[0], removed: true} : `removed the registration ${positionals[0]}; the Chrome profile itself is unchanged`);
  }
  const {values, positionals} = parsed({'extension-instance-id': {type: 'string'}, 'dry-run': {type: 'boolean'}}, 1);
  const explicitId = values['extension-instance-id'];
  const dryRun = values['dry-run'] === true;
  const interactive = !values.json && !dryRun && explicitId === undefined && process.stdin.isTTY && process.stderr.isTTY;
  const runtime = resolveRuntime({home});
  if (!values.json) process.stderr.write('listing the live Chrome extension backends through the runtime (one bounded launch)...\n');
  const result = await bindCommand({home, key: positionals[0], chrome, explicitId, dryRun,
    listBackends: () => listLiveBackends({home, runtime}), pick: interactive ? (list, reason, excluded, options) => pickBackend(list, reason, excluded, {...options, route}) : undefined,
    mapDirectories: () => mapExtensionDirectories({home, chrome, moduleDir: runtime.paths.moduleDir,
      extensionIds: route === 'cua' ? [CUA_EXTENSION_ID] : runtime.manifest.chromePlugin.nativeHost.extensionIds})});
  if (values.json) { print(result); return result.ok ? 0 : 1; }
  process.stderr.write(describeUnreadable(result));
  if (result.ok) {
    const automatic = result.how === 'automatic';
    const why = !automatic ? 'your explicit pick' : result.by === 'directory' ? 'this profile directory\'s extension store records exactly this live backend' : 'the runtime labelled exactly one live backend with this profile\'s unique name';
    print(`${result.dryRun ? 'would bind' : 'bound'} ${result.key} to extension instance ${result.extensionInstanceId} (${why})${result.staleBinding ? `, replacing the stale binding ${result.staleBinding}` : ''}${result.dryRun ? '; dry run, nothing was recorded' : ''}`);
    if (automatic) print(`live backends:\n${result.backends.map(describeBackend).join('\n')}${describeExcluded(result.nonChromeExcluded)}\nif the marked one is not this Chrome profile: cua profiles bind ${result.key} --extension-instance-id <id>`);
    return 0;
  }
  print(`${result.key} was not bound: ${pickReasonFor(result.reason, route)}${describeExcluded(result.nonChromeExcluded)}`);
  if (result.staleBinding) print(describeStale(result.staleBinding));
  if (result.backends.length) print(`live backends:\n${result.backends.map(describeBackend).join('\n')}\nrerun with the instance of this Chrome profile: cua profiles bind ${result.key} --extension-instance-id <id>`);
  return 1;
}

// The browsers' native-messaging registration (src/chrome/registration.mjs), on the home's Chrome route
// (src/chrome/route.mjs): cua's own host for cua's extension by default, the ChatGPT extension's (OpenAI's host, placed
// by `cua install`) with --vendor. Whichever ran last is the route. register refuses while another host's manifest is
// present unless --replace, which backs it up first; unregister removes only this home's manifests and restores what
// they replaced. Exit 1 on a refusal or when a restoration is BLOCKED. A registration that switched the route names the
// profile bindings made on the other route, which `cua profiles bind` must make again.
const CHROME_USAGE = {register: 'chrome register takes only --vendor, --replace and --json', unregister: 'chrome unregister takes only --vendor and --json'};
const ACTIONS = {placed: 'placed', replaced: 'replaced', updated: 'updated', unchanged: 'unchanged', removed: 'removed', restored: 'restored', not_ours: 'not ours', not_removed: 'kept', unknown: 'unknown'};
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url));

// The keys bound on the other route than `route` (each needs `cua profiles bind` again); none when the registry cannot
// be read (profiles list reports that).
function rebindRequired(home, route) {
  try {
    return Object.entries(readRegistry(home).profiles).filter(([, p]) => p.extensionInstanceId && effectiveRoute(p.route) !== route).map(([key]) => key);
  } catch { return []; }
}
const rebindLine = keys => `note: ${keys.join(', ')} ${keys.length === 1 ? 'was' : 'were'} bound on the other Chrome route; bind again: ${keys.map(key => `cua profiles bind ${key}`).join('; ')}`;

async function chrome(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(CHROME_USAGE, command)) throw new UsageError('chrome takes register or unregister');
  let values;
  try { ({values} = parse(rest, command === 'register' ? {replace: {type: 'boolean'}, vendor: {type: 'boolean'}} : {vendor: {type: 'boolean'}}, 0)); } catch (error) {
    if (error instanceof UsageError) throw new UsageError(CHROME_USAGE[command]);
    throw error;
  }
  const home = defaultHome();
  if (!values.vendor) return command === 'register' ? registerCua(home, values) : unregisterCua(home, values);
  if (command === 'register') {
    const runtime = resolveRuntime({home});
    let consequences;
    const result = await registerHost({home, runtime, replace: values.replace, onReplace: lines => {
      consequences = lines;
      process.stderr.write(`replacing a registration cua did not write (backed up first). Consequences:\n${lines.map((l, i) => `  ${i + 1}. ${l}`).join('\n')}\n`);
    }});
    chooseVendorRoute(home);
    const rebind = rebindRequired(home, 'vendor');
    if (values.json) return done({ok: true, route: 'vendor', host: result.host, browsers: result.browsers, ...(consequences ? {consequences} : {}), rebindRequired: rebind});
    print(`registered cua's Chrome host ${result.host}:`);
    for (const b of result.browsers) print(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}${b.backup ? ` (previous manifest backed up to ${b.backup})` : ''}`);
    print('the browser launches the host on the extension\'s next connection; running hosts are not stopped');
    if (rebind.length) print(rebindLine(rebind));
    return 0;
  }
  const result = unregisterVendorHost({home});
  if (values.json) { print({ok: true, ...result}); return result.blocked ? 1 : 0; }
  for (const line of unregisterLines(result)) print(line);
  return result.blocked ? 1 : 0;
}

async function registerCua(home, values) {
  const result = await registerCuaHost({home, checkout: CHECKOUT, nodePath: process.execPath, replace: values.replace});
  const previous = [...new Set(result.browsers.map(b => b.previous).filter(Boolean))];
  const rebind = rebindRequired(home, 'cua');
  if (values.json) return done({ok: true, route: 'cua', launcher: result.launcher, backendsDir: result.backendsDir, browsers: result.browsers, previous, rebindRequired: rebind});
  print(`registered cua's Chrome host launcher ${result.launcher}:`);
  for (const b of result.browsers) print(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}${b.backup ? ` (previous manifest backed up to ${b.backup})` : ''}`);
  print(`previous launcher recorded: ${previous.length ? previous.join(', ') : 'none'}`);
  print('the browser starts the host when the cua extension next connects; running hosts are not stopped');
  if (rebind.length) print(rebindLine(rebind));
  return 0;
}

function unregisterCua(home, values) {
  const result = unregisterCuaHost({home});
  if (values.json) { print({ok: true, ...result}); return result.blocked ? 1 : 0; }
  for (const line of cuaUnregisterLines(result)) print(line);
  return result.blocked ? 1 : 0;
}

export function cuaUnregisterLines(result) {
  const shown = result.browsers.filter(b => b.action !== 'absent');
  const lines = shown.every(b => b.action === 'not_ours') ? [`nothing to unregister: no ${CUA_HOST_NAME} manifest names this home's launcher`] : [];
  for (const b of shown) {
    const what = b.action === 'not_ours' ? `names ${b.previous ?? 'no host path'}; left unchanged`
      : b.restoration === 'restored' ? `restored the previous manifest${b.previous ? ` (naming ${b.previous})` : ''}, verified byte-for-byte`
        : b.restoration === 'not_needed' ? 'nothing to restore (cua placed it in an empty slot)'
          : `restoration BLOCKED: ${b.reason}. To fix: ${b.userAction}`;
    lines.push(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}: ${what}`);
  }
  return lines;
}

// unregister's human-readable report. "nothing to unregister" is said only when every browser is empty or holds another
// host's manifest: a slot whose state is unknown, or where cua's manifest was kept, is not evidence of absence.
export function unregisterLines(result) {
  const shown = result.browsers.filter(b => b.action !== 'absent');
  const lines = shown.every(b => b.action === 'not_ours') ? ['nothing to unregister: no com.openai.codexextension manifest names cua\'s host'] : [];
  for (const b of shown) {
    const what = b.action === 'not_ours' ? `names a ${b.pathClass} host; left unchanged`
      : b.restoration === 'restored' ? 'restored the backed-up manifest, verified byte-for-byte'
        : b.restoration === 'not_needed' ? 'nothing to restore (cua placed it in an empty slot)'
          : `restoration BLOCKED: ${b.reason}. To fix: ${b.userAction}`;
    lines.push(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}: ${what}`);
  }
  return lines;
}

const COMMANDS = {install, doctor, runtime, serve, secrets, login, profiles, chrome, remote, agent, devices};

export async function main(argv) {
  const [command, ...rest] = argv;
  const json = rest.includes('--json');
  try {
    if (command === 'help' || command === '--help' || command === '-h') { print(USAGE); return 0; }
    const handler = COMMANDS[command];
    if (!handler) throw new UsageError(command ? `unknown command "${command}"` : 'missing command');
    return (await handler(rest)) ?? 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`cua: ${error.message}\n${USAGE}\n`);
      return 2;
    }
    if (error instanceof CuaError) {
      if (json) print({ok: false, error: {code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})}});
      process.stderr.write(`cua: ${error.message} [${error.code}]\n${error.hint ? `  ${error.hint}\n` : ''}`);
      return 1;
    }
    process.stderr.write(`cua: unexpected error: ${error.stack ?? error}\n`);
    return 1;
  }
}
