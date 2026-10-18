// cua's compatibility executable for the Codex CLI on the macOS vendor host (docs/doperpowers/specs/2026-10-17-own-
// sandbox-design.md, Design "The compat executable"; until #117 retires the vendor host). CODEX_CLI_PATH names
// bin/cua-codex-compat, a sh script that runs this file on the vendor's pinned Node; node_repl and the native helper
// call it as they called the Codex CLI:
//   sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl"
//     -c permissions.node_repl={filesystem = {…}, network = {enabled = false}} -- <node> --experimental-vm-modules <script> …
//     node_repl's launcher for its two children (the recovered template, rendered as src/runtime/sandbox.mjs sandboxArgs
//     renders it). Exactly that is accepted; anything else exits 1 with a sentence (node_repl on macOS then refuses the
//     cell). The filesystem table's read entries are node_repl's read paths (its Node, its module tree, its script
//     directory, the trusted code paths), the rest is the call's sandbox state, resolved in the launcher's working
//     directory (node_repl's sandbox cwd, the run directory). The role comes from the script's basename, since node_repl
//     writes its scripts into a random directory: trusted-worker.js is the worker, anything else the kernel. The deny
//     list and the session temp come from the session's compat settings (./compat-settings.mjs), which both roles read
//     the same way. Then /usr/bin/sandbox-exec replaces this process (process.execve) with the role's profile
//     (./index.mjs sandboxedLaunch), so the child is Node itself under cua's sandbox, as on the own host.
//   app-server --listen stdio://
//     the native helper's policy read, answered from the recorded responses (./app-server.mjs). It reads no session
//     file: the helper is shared across sessions and outlives the one that started it.
// Anything else (login, exec, no subcommand) exits 1 with a sentence. It runs outside any sandbox, as the launcher, so
// its code (bin/, src/sandbox/) is trusted code the scoped preflight keeps out of every write root.
//
// The permissions table is parsed as the inline-table subset node_repl emits and nothing else (no TOML dependency):
// bare or basic-string keys; values a basic string, an inline table or a boolean.
import {accessSync, constants, statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sandboxedLaunch} from './index.mjs';
import {recordedResponses, serveAppServer} from './app-server.mjs';
import {locateSettings, readSettings} from './compat-settings.mjs';

export class TemplateError extends Error {}
const refuse = why => { throw new TemplateError(why); };

const TEMPLATE = 'sandbox -c shell_environment_policy.inherit="all" -c default_permissions="node_repl" -c permissions.node_repl={filesystem = {…}, network = {enabled = false}} -- <command>';
const FIXED_KEYS = ['shell_environment_policy.inherit="all"', 'default_permissions="node_repl"'];
const PERMISSIONS = 'permissions.node_repl=';
const ACCESS = ['read', 'write', 'none'];
// node_repl's special filesystem keys and the permission profile's kinds (src/runtime/sandbox.mjs sandboxPolicy).
const SPECIALS = {':root': 'root', ':minimal': 'minimal', ':tmpdir': 'tmpdir', ':slash_tmp': 'slash_tmp'};

// ---- the inline-table subset ----
const ESCAPES = {'"': '"', '\\': '\\', b: '\b', t: '\t', n: '\n', f: '\f', r: '\r'};
export function parseInlineTable(text) {
  let i = 0;
  const bad = why => refuse(`the permissions table is not the inline-table subset cua accepts: ${why} at offset ${i}`);
  const space = () => { while (text[i] === ' ' || text[i] === '\t') i++; };
  const string = () => {
    let out = '';
    for (i++; ; ) {
      const c = text[i];
      if (c === undefined) bad('an unterminated string');
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        const e = text[i + 1];
        if (Object.hasOwn(ESCAPES, e)) { out += ESCAPES[e]; i += 2; continue; }
        const digits = e === 'u' ? 4 : e === 'U' ? 8 : 0;
        const hex = text.slice(i + 2, i + 2 + digits);
        const code = digits && /^[0-9A-Fa-f]+$/.test(hex) && hex.length === digits ? Number.parseInt(hex, 16) : -1;
        if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) bad('an escape that is not TOML\'s');
        out += String.fromCodePoint(code);
        i += 2 + digits;
        continue;
      }
      if ((c < ' ' && c !== '\t') || c === '\x7f') bad('a control character in a string');
      out += c;
      i++;
    }
  };
  const key = () => {
    if (text[i] === '"') return string();
    const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(i))?.[0];
    if (!bare) bad('a missing key');
    i += bare.length;
    return bare;
  };
  const value = () => {
    if (text[i] === '"') return string();
    if (text[i] === '{') return table();
    for (const [word, v] of [['true', true], ['false', false]]) if (text.startsWith(word, i) && !/[A-Za-z0-9_-]/.test(text[i + word.length] ?? '')) { i += word.length; return v; }
    return bad('a value that is neither a string, an inline table nor a boolean');
  };
  const table = () => {
    const out = {};
    i++;
    space();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      space();
      const k = key();
      space();
      if (text[i] === '.') bad('a dotted key');
      if (text[i] !== '=') bad('a missing "="');
      i++;
      space();
      if (Object.hasOwn(out, k)) bad(`a repeated key ${JSON.stringify(k)}`);
      Object.defineProperty(out, k, {value: value(), enumerable: true, writable: true, configurable: true});
      space();
      if (text[i] === ',') { i++; space(); if (text[i] === '}') bad('a trailing comma'); continue; }
      if (text[i] === '}') { i++; return out; }
      bad('a missing "," or "}"');
    }
  };
  if (text[0] !== '{') bad('no table');
  const out = table();
  if (i !== text.length) bad('text after the table');
  return out;
}

const isTable = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (object, keys) => JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort());

// argv (after the executable) -> {filesystem: {key: access | {'.': access}}, command: [file, ...args]}; throws
// TemplateError for anything but the recovered template.
export function parseSandboxArgv(argv) {
  const differs = (index, why) => refuse(`sandbox accepts only node_repl's launch template (${TEMPLATE}); ${why}${index === null ? '' : ` (argument ${index + 1}: ${JSON.stringify(argv[index] ?? null)})`}`);
  if (argv[0] !== 'sandbox') differs(0, 'this is not a sandbox call');
  const expected = ['-c', FIXED_KEYS[0], '-c', FIXED_KEYS[1], '-c'];
  for (const [offset, want] of expected.entries()) if (argv[offset + 1] !== want) differs(offset + 1, `expected ${JSON.stringify(want)}`);
  if (typeof argv[6] !== 'string' || !argv[6].startsWith(PERMISSIONS)) differs(6, `expected ${PERMISSIONS}{…}`);
  if (argv[7] === '--allow-unix-socket') differs(7, 'a Unix-socket grant is refused: cua never sets NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS');
  if (argv[7] !== '--') differs(7, 'expected "--" after the three keys');
  const command = argv.slice(8);
  if (!command.length) differs(null, 'no command follows "--"');

  const table = parseInlineTable(argv[6].slice(PERMISSIONS.length));
  if (!sameKeys(table, ['filesystem', 'network'])) refuse(`the permissions table must hold exactly filesystem and network; it holds ${Object.keys(table).join(', ') || 'nothing'}`);
  if (!isTable(table.network) || !sameKeys(table.network, ['enabled']) || table.network.enabled !== false) refuse('the permissions table\'s network must be {enabled = false}: cua\'s children never reach the network on macOS');
  if (!isTable(table.filesystem)) refuse('the permissions table\'s filesystem must be a table');
  for (const [key, access] of Object.entries(table.filesystem)) {
    if (key === ':workspace_roots') {
      if (!isTable(access) || !sameKeys(access, ['.']) || !ACCESS.includes(access['.'])) refuse(`the filesystem entry ":workspace_roots" must be {"." = "read" | "write" | "none"}`);
    } else if (key.startsWith(':')) {
      if (!Object.hasOwn(SPECIALS, key)) refuse(`the filesystem entry ${JSON.stringify(key)} is not one of node_repl's special paths (${[...Object.keys(SPECIALS), ':workspace_roots'].join(', ')})`);
      if (!ACCESS.includes(access)) refuse(`the filesystem entry ${JSON.stringify(key)} has the access ${JSON.stringify(access)}, not read, write or none`);
    } else {
      if (!isAbsolute(key)) refuse(`the filesystem entry ${JSON.stringify(key)} is not an absolute path`);
      if (access !== 'read') refuse(`the filesystem entry ${JSON.stringify(key)} is ${JSON.stringify(access)}; node_repl's own entries are read entries only`);
    }
  }
  return {filesystem: table.filesystem, command};
}

// The table as what src/sandbox takes -> {state, readPaths}: node_repl's read entries are its read paths; the special
// entries are the call's managed profile, resolved in `cwd` (the launcher's working directory: node_repl's sandbox cwd).
export function sandboxRequest({filesystem, cwd}) {
  const readPaths = [], entries = [];
  for (const [key, access] of Object.entries(filesystem)) {
    if (key === ':workspace_roots') entries.push({path: {type: 'special', value: {kind: 'project_roots'}}, access: access['.']});
    else if (Object.hasOwn(SPECIALS, key)) entries.push({path: {type: 'special', value: {kind: SPECIALS[key]}}, access});
    else readPaths.push(key);
  }
  return {readPaths, state: {permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries}, network: 'restricted'}, sandboxCwd: pathToFileURL(cwd).href}};
}

// The child's role, by its script's basename (the first argument after the Node that is not an option): node_repl's
// trusted-worker.js is the worker; anything else gets the kernel's stricter profile.
export function roleOf(command) {
  const script = command.slice(1).find(arg => !arg.startsWith('-'));
  return script?.split('/').at(-1) === 'trusted-worker.js' ? 'worker' : 'kernel';
}

const canExecute = path => {
  try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
};
const PROCESS_IO = {stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, cwd: () => process.cwd(), chdir: dir => process.chdir(dir),
  execve: (file, args, env) => process.execve(file, args, env), canExecute};

// -> the exit status (1 for every refusal, 0 when app-server reaches EOF), or nothing once `sandbox` has handed the
// process to sandbox-exec. `io` is the process boundary, doubled in tests.
export async function main(argv, env, io = PROCESS_IO) {
  const say = message => io.stderr.write(`cua-codex-compat: ${message}\n`);
  try {
    if (argv[0] === 'app-server') {
      if (argv.length !== 3 || argv[1] !== '--listen' || argv[2] !== 'stdio://') { say('app-server runs only as `app-server --listen stdio://`, the native helper\'s call'); return 1; }
      await serveAppServer({input: io.stdin, output: io.stdout, responses: recordedResponses(env)});
      return 0;
    }
    if (argv[0] !== 'sandbox') {
      say(`${argv[0] === undefined ? 'no subcommand' : JSON.stringify(argv[0])}: cua's compatibility executable for the Codex CLI runs only \`sandbox\` (node_repl's children) and \`app-server --listen stdio://\` (the native helper's policy read)`);
      return 1;
    }
    const {filesystem, command} = parseSandboxArgv(argv);
    const settings = readSettings(locateSettings(env), env);
    const cwd = io.cwd();
    const {state, readPaths} = sandboxRequest({filesystem, cwd});
    const launch = sandboxedLaunch({platform: 'darwin', state, role: roleOf(command), command, env, cwd, readPaths, denyRead: settings.denyRead});
    if (!io.canExecute(launch.command)) { say(`could not run ${launch.command}: it is missing or not executable, and nothing runs unconfined`); return 1; }
    io.chdir(launch.cwd);
    try {
      io.execve(launch.command, [launch.command, ...launch.args], launch.env);
    } catch (error) {
      say(`could not run ${launch.command} (${error.code ?? error.message}), and nothing runs unconfined`);
      return 1;
    }
    return undefined;
  } catch (error) {
    say(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main(process.argv.slice(2), process.env);
  if (typeof code === 'number') process.exitCode = code;
}
