// The body of the CODEX_CLI_PATH slot (#115 M0). experiment.mjs writes the slot itself, a sh script per run that sets
// these and runs this file on an absolute Node (node_repl hands its sandbox launcher only the kernel's environment, and
// runs it, like the native helper, with cua's fixed PATH, where no node is found):
//   CUA_PROBE_REAL_CLI     the CLI under test (the signed CodexCLI.app executable, or the public build)
//   CUA_PROBE_APP_SERVER   forward: `app-server` runs the CLI under test, every line both ways recorded;
//                          replay: answered from CUA_PROBE_RESPONSES (the audited capture, ./app-server.mjs) instead
//   CUA_PROBE_LOG          a private directory for invocations.jsonl and one exchange file per app-server
// `sandbox` is always the CLI under test's: logged (subcommand, the -c keys, the command's script basename), then
// replaced by it through process.execve with the slot's own CUA_PROBE_* names removed, so the CLI sees the environment
// and makes the process tree it would on its own. Raw exchange files
// stay in CUA_PROBE_LOG on the device; only app-server.mjs's audit of them is ever reported.
import {spawn} from 'node:child_process';
import {appendFileSync, readFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {createInterface} from 'node:readline';
import {renderResponses, replayAnswer} from './app-server.mjs';

const {CUA_PROBE_REAL_CLI: real, CUA_PROBE_APP_SERVER: appServerMode = 'forward', CUA_PROBE_LOG: logDir} = process.env;
const argv = process.argv.slice(2);
const now = () => new Date().toISOString();
const log = (file, record) => appendFileSync(join(logDir, file), `${JSON.stringify({t: now(), pid: process.pid, ...record})}\n`, {mode: 0o600});

if (!real || !logDir) {
  process.stderr.write('cli-slot: CUA_PROBE_REAL_CLI and CUA_PROBE_LOG must be set\n');
  process.exit(1);
}

const sub = argv[0] ?? null;
const dash = argv.indexOf('--');
log('invocations.jsonl', {ppid: process.ppid, sub, cwd: process.cwd(), mode: sub === 'app-server' ? appServerMode : 'forward',
  configKeys: argv.flatMap((a, i) => (a === '-c' ? [argv[i + 1]?.split('=')[0]] : [])),
  script: dash === -1 ? null : basename(argv.slice(dash + 1).find(a => /\.(m?js)$/.test(a)) ?? argv[dash + 1] ?? ''),
  args: sub === 'app-server' ? argv : undefined,
  // Which names reach the CLI from its caller (node_repl, the helper), never their values.
  envNames: Object.keys(process.env).filter(name => !name.startsWith('CUA_PROBE_')).sort()});

if (sub === 'app-server' && appServerMode === 'replay') {
  const audited = JSON.parse(readFileSync(process.env.CUA_PROBE_RESPONSES, 'utf8'));
  const codexHome = process.env.CODEX_HOME;
  const responses = renderResponses(audited.responses, {CODEX_HOME: codexHome, CUA_HOME: dirname(dirname(codexHome)), HOME: process.env.HOME});
  const file = `replay-${process.pid}.jsonl`;
  const lines = createInterface({input: process.stdin});
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { log(file, {dir: 'in', unparsed: true}); return; }
    const answer = replayAnswer(message, {responses, framing: audited.framing});
    log(file, {dir: 'in', method: message.method ?? null, id: message.id ?? null, answered: answer ? (answer.error ? 'error' : 'result') : 'notification'});
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  });
  lines.on('close', () => { log(file, {eof: true}); process.exit(0); });
} else if (sub === 'app-server') {
  const file = `app-server-${process.pid}.jsonl`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('CUA_PROBE_')));
  const child = spawn(real, argv, {stdio: ['pipe', 'pipe', 'inherit'], env});
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { log(file, {signal}); child.kill(signal); process.exit(128 + 15); });
  createInterface({input: process.stdin}).on('line', line => { log(file, {dir: 'in', line}); child.stdin.write(`${line}\n`); }).on('close', () => { log(file, {stdinEof: true}); child.stdin.end(); });
  createInterface({input: child.stdout}).on('line', line => { log(file, {dir: 'out', line}); process.stdout.write(`${line}\n`); });
  child.on('exit', (code, signal) => { log(file, {exit: code, signal}); process.exit(code ?? 1); });
} else {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('CUA_PROBE_')));
  process.execve(real, [real, ...argv], env);
}
