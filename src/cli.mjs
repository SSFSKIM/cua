// cua: install, diagnose and serve the standalone computer-use runtime. `bin/cua.mjs` and the plugin's `cua-shim.mjs`
// both run `main`. The home is $CUA_HOME, default ~/Library/Application Support/cua. Exit codes: 0 success, 1 failure
// or an unhealthy doctor report, 2 usage error.
import {parseArgs} from 'node:util';
import {defaultHome} from './runtime/layout.mjs';
import {loadPins, selectPin, findPin} from './runtime/manifest.mjs';
import {installRuntime, useRuntime} from './runtime/install.mjs';
import {inspectRuntime, summarize} from './runtime/doctor.mjs';
import {resolveRuntime} from './runtime/manifest.mjs';
import {runLogin, loginStatus, LOGIN_STATES} from './runtime/login.mjs';
import {CuaError} from './runtime/errors.mjs';
import {serve as serveMcp} from './mcp/server.mjs';
import {runSecrets} from './secrets/commands.mjs';
import {isLabel, LABEL_RULE} from './secrets/label.mjs';
import {chromeFacts} from './profiles/chrome.mjs';
import {addProfile, removeProfile, profileStatuses, REASONS} from './profiles/registry.mjs';
import {bindCommand} from './profiles/commands.mjs';
import {listLiveBackends} from './profiles/inventory.mjs';
import {UNDETERMINED} from './profiles/bind.mjs';
import {registerHost, unregisterHost} from './chrome/registration.mjs';

const USAGE = `usage: cua <command>
  install [--archive <ChatGPT zip>] [--release <id>] [--json]   install and activate the pinned runtime and its Chrome host
  doctor [--json]                                              passive runtime health; exit 1 when a check fails
  runtime use <release> [--json]                               activate another verified installed release
  serve                                                        MCP over stdin/stdout until EOF or a signal
  login [--device-auth]                                        sign the server in to Codex, at this terminal
  login --status                                               whether the server has a Codex login (never shows it)
  secrets set <label>                                          store a secret, typed hidden at this terminal
  secrets list [--json]                                        stored labels, never values
  secrets remove <label> [--yes]                               delete one secret (confirmed at the terminal)
  profiles add <key> --chrome-profile <directory> [--json]     register an existing Chrome profile under a key
  profiles list [--json]                                       registered profiles and whether each is ready
  profiles remove <key> [--json]                               forget a key (Chrome itself is never changed)
  profiles bind <key> [--extension-instance-id <id>] [--json]  bind a key to its live OpenAI extension backend
  chrome register [--replace] [--json]                         register cua's Chrome host with the browsers
  chrome unregister [--json]                                   remove cua's registration, restoring what it replaced
environment: CUA_HOME (default ~/Library/Application Support/cua)`;

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

// stdout carries only the MCP stream from here on; every diagnostic goes to stderr. Once the server has closed and
// cleaned up what it owns, nothing may keep the process alive: an unreferenced timer exits if anything still does.
async function serve(args) {
  parse(args, {}, 0);
  const code = await serveMcp({home: defaultHome()});
  setTimeout(() => process.exit(code), 1000).unref();
  return code;
}

// A secret is never an argument: set takes exactly one label and the helper reads the value at the terminal. Usage
// errors here are fixed messages that never repeat what was passed (an option name or a stray word may be a value
// typed in the wrong place), so the parser's own messages are not shown.
const SECRETS_USAGE = {
  set: 'secrets set takes exactly one label; the secret is typed at the terminal, never passed as an argument',
  remove: 'secrets remove takes exactly one label and optionally --yes',
  list: 'secrets list takes only --json',
};

async function secrets(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(SECRETS_USAGE, command)) throw new UsageError('secrets takes set, list or remove');
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
  [LOGIN_STATES.notLoggedIn]: 'the cua server has no Codex login in its own CODEX_HOME; run `cua login`',
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

// Chrome profile registrations (src/profiles). Registering, listing and removing only touch $CUA_HOME/profiles.json;
// bind also runs one bounded, browser-only launch of the runtime to list the live extension backends.
const PROFILES_USAGE = {
  add: 'profiles add takes a key and --chrome-profile <directory>',
  list: 'profiles list takes only --json',
  remove: 'profiles remove takes exactly one key',
  bind: 'profiles bind takes a key and optionally --extension-instance-id <id>',
};
const done = value => { print(value); return 0; };
const LABELS = {'this-profile': 'labelled as this profile', 'other-profile': 'labelled as another profile', unlabelled: 'unlabelled',
  'comparison-unknown': 'labelled, but this profile\'s own name is unknown, so whether it is this profile cannot be told'};
const describeBackend = (b, i) => `  ${i + 1}) extension instance ${b.instanceId}  ${b.tabCount ?? '?'} tab(s)  ${LABELS[b.label]}`;

async function pickBackend(list, reason) {
  process.stderr.write(`which live backend is this profile could not be determined: ${UNDETERMINED[reason]}\n${list.map(describeBackend).join('\n')}\n`);
  const {createInterface} = await import('node:readline/promises');
  const rl = createInterface({input: process.stdin, output: process.stderr});
  try {
    const answer = (await rl.question('Pick the number of the backend that is this Chrome profile, or press Enter to cancel: ')).trim();
    const index = Number(answer);
    return answer && Number.isInteger(index) && index >= 1 && index <= list.length ? list[index - 1].instanceId : null;
  } finally { rl.close(); }
}

async function profiles(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(PROFILES_USAGE, command)) throw new UsageError('profiles takes add, list, remove or bind');
  const parsed = (options, positionals) => {
    try { return parse(rest, options, positionals); } catch (error) {
      if (error instanceof UsageError) throw new UsageError(PROFILES_USAGE[command]);
      throw error;
    }
  };
  const home = defaultHome();
  const chrome = chromeFacts();
  if (command === 'add') {
    const {values, positionals} = parsed({'chrome-profile': {type: 'string'}}, 1);
    if (values['chrome-profile'] === undefined) throw new UsageError(PROFILES_USAGE.add);
    const added = addProfile({home, key: positionals[0], directory: values['chrome-profile'], chrome});
    if (values.json) return done({ok: true, ...added});
    return done(`registered ${added.key} -> Chrome profile "${added.chromeProfileDirectory}"; ${added.extensionInstalled
      ? `the OpenAI extension is installed there (next: cua profiles bind ${added.key})`
      : 'the OpenAI extension is not installed there, so it stays not ready until you install it in that profile'}`);
  }
  if (command === 'list') {
    const {values} = parsed({}, 0);
    const list = profileStatuses({home, chrome});
    if (values.json) return done({ok: true, profiles: list});
    if (!list.length) return done('no Chrome profiles are registered (cua profiles add <key> --chrome-profile <directory>)');
    for (const p of list) print(`${p.key.padEnd(12)} ${(p.ready ? 'ready' : 'not ready').padEnd(10)} ${p.chromeProfileDirectory.padEnd(12)} ${p.ready ? `extension instance ${p.extensionInstanceId}` : REASONS[p.reason]}`);
    return 0;
  }
  if (command === 'remove') {
    const {values, positionals} = parsed({}, 1);
    removeProfile({home, key: positionals[0]});
    return done(values.json ? {ok: true, key: positionals[0], removed: true} : `removed the registration ${positionals[0]}; the Chrome profile itself is unchanged`);
  }
  const {values, positionals} = parsed({'extension-instance-id': {type: 'string'}}, 1);
  const explicitId = values['extension-instance-id'];
  const interactive = !values.json && explicitId === undefined && process.stdin.isTTY && process.stderr.isTTY;
  const runtime = resolveRuntime({home});
  if (!values.json) process.stderr.write('listing the live Chrome extension backends through the runtime (one bounded launch)...\n');
  const result = await bindCommand({home, key: positionals[0], chrome, explicitId,
    listBackends: () => listLiveBackends({home, runtime}), pick: interactive ? pickBackend : undefined});
  if (values.json) { print(result); return result.ok ? 0 : 1; }
  if (result.ok) {
    print(`bound ${result.key} to extension instance ${result.extensionInstanceId} (${result.how === 'automatic' ? 'the runtime labelled exactly one live backend with this profile\'s unique name' : 'your explicit pick'})`);
    return 0;
  }
  print(`${result.key} was not bound: ${UNDETERMINED[result.reason]}`);
  if (result.backends.length) print(`live backends:\n${result.backends.map(describeBackend).join('\n')}\nrerun with the instance of this Chrome profile: cua profiles bind ${result.key} --extension-instance-id <id>`);
  return 1;
}

// The OpenAI extension's native-messaging registration (src/chrome/registration.mjs). register refuses while another
// host's manifest is present unless --replace, which backs it up first; unregister removes only cua's manifests and
// restores what cua replaced. Exit 1 on a refusal or when a restoration is BLOCKED.
const CHROME_USAGE = {register: 'chrome register takes only --replace and --json', unregister: 'chrome unregister takes only --json'};
const ACTIONS = {placed: 'placed', replaced: 'replaced', updated: 'updated', unchanged: 'unchanged', removed: 'removed', restored: 'restored', not_ours: 'not ours', not_removed: 'kept'};

async function chrome(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(CHROME_USAGE, command)) throw new UsageError('chrome takes register or unregister');
  let values;
  try { ({values} = parse(rest, command === 'register' ? {replace: {type: 'boolean'}} : {}, 0)); } catch (error) {
    if (error instanceof UsageError) throw new UsageError(CHROME_USAGE[command]);
    throw error;
  }
  const home = defaultHome();
  if (command === 'register') {
    const runtime = resolveRuntime({home});
    let consequences;
    const result = await registerHost({home, runtime, replace: values.replace, onReplace: lines => {
      consequences = lines;
      process.stderr.write(`replacing a registration cua did not write (backed up first). Consequences:\n${lines.map((l, i) => `  ${i + 1}. ${l}`).join('\n')}\n`);
    }});
    if (values.json) return done({ok: true, host: result.host, browsers: result.browsers, ...(consequences ? {consequences} : {})});
    print(`registered cua's Chrome host ${result.host}:`);
    for (const b of result.browsers) print(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}${b.backup ? ` (previous manifest backed up to ${b.backup})` : ''}`);
    print('the browser launches the host on the extension\'s next connection; running hosts are not stopped');
    return 0;
  }
  const result = unregisterHost({home});
  if (values.json) { print({ok: true, ...result}); return result.blocked ? 1 : 0; }
  const shown = result.browsers.filter(b => b.action !== 'absent');
  if (!shown.some(b => b.action === 'removed' || b.action === 'restored')) print('nothing to unregister: no com.openai.codexextension manifest names cua\'s host');
  for (const b of shown) {
    const what = b.action === 'not_ours' ? `names a ${b.pathClass} host; left unchanged`
      : b.restoration === 'restored' ? 'restored the backed-up manifest, verified byte-for-byte'
        : b.restoration === 'not_needed' ? 'nothing to restore (cua placed it in an empty slot)'
          : `restoration BLOCKED: ${b.reason}. To fix: ${b.userAction}`;
    print(`  ${b.browser.padEnd(8)} ${ACTIONS[b.action].padEnd(10)} ${b.manifestPath}: ${what}`);
  }
  return result.blocked ? 1 : 0;
}

const COMMANDS = {install, doctor, runtime, serve, secrets, login, profiles, chrome};

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
