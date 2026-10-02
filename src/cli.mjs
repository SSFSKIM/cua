// cua: install, diagnose and serve the standalone computer-use runtime. `bin/cua.mjs` and the plugin's `cua-shim.mjs`
// both run `main`. The home is $CUA_HOME, default ~/Library/Application Support/cua. Exit codes: 0 success, 1 failure
// or an unhealthy doctor report, 2 usage error.
import {parseArgs} from 'node:util';
import {defaultHome} from './runtime/layout.mjs';
import {loadPins, selectPin, findPin} from './runtime/manifest.mjs';
import {installRuntime, useRuntime} from './runtime/install.mjs';
import {inspectRuntime, summarize} from './runtime/doctor.mjs';
import {CuaError} from './runtime/errors.mjs';
import {serve as serveMcp} from './mcp/server.mjs';

const USAGE = `usage: cua <command>
  install [--archive <ChatGPT zip>] [--release <id>] [--json]   install and activate the pinned runtime
  doctor [--json]                                              passive runtime health; exit 1 when a check fails
  runtime use <release> [--json]                               activate another verified installed release
  serve                                                        MCP over stdin/stdout until EOF or a signal
  secrets <set|list|remove> ...                                Keychain secrets (not yet available)
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
  if (values.json) print({ok: true, release: result.release, root: result.root, changed: result.changed, source: result.record.source});
  else print(result.changed ? `installed and activated ${result.release} at ${result.root}` : `${result.release} is already installed and verified; active at ${result.root}`);
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

function notYet(name) {
  return () => { throw new CuaError('not_available', `\`cua ${name}\` is not available in this build yet`); };
}

const COMMANDS = {install, doctor, runtime, serve, secrets: notYet('secrets')};

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
