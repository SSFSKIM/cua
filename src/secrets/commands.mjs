// `cua secrets set|list|remove`: thin routes to the Keychain helper. set and remove give the helper the user's
// terminal (it reads the hidden value, or the removal confirmation, itself); only the label, and --yes for remove, is
// ever passed. list reads the helper's label JSON. No route takes, prints or returns a value.
import {spawn, execFile} from 'node:child_process';
import {constants} from 'node:os';
import {CuaError, fail} from '../runtime/errors.mjs';
import {locateHelper, BUILD_HINT} from './helper.mjs';

const HELPER_ENV_KEYS = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM'];
const helperEnv = (ambient = process.env) => {
  const env = {PATH: '/usr/bin:/bin:/usr/sbin:/sbin'};
  for (const key of HELPER_ENV_KEYS) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  return env;
};

// The helper on this terminal. While it runs, terminal signals are its to handle: this process ignores them so it
// cannot exit and leave the helper holding the terminal.
export function runInteractive(path, args) {
  const ignored = ['SIGINT', 'SIGQUIT', 'SIGTSTP'];
  const ignore = () => {};
  for (const signal of ignored) process.on(signal, ignore);
  return new Promise(resolve => {
    const child = spawn(path, args, {stdio: 'inherit', env: helperEnv()});
    child.once('error', () => resolve(1));
    child.once('exit', (code, signal) => resolve(code ?? 128 + (constants.signals[signal] ?? 0)));
  }).finally(() => { for (const signal of ignored) process.off(signal, ignore); });
}

export function runCaptured(path, args) {
  return new Promise(resolve => execFile(path, args, {env: helperEnv(), encoding: 'utf8', timeout: 30_000}, (error, stdout, stderr) =>
    resolve({code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: stdout ?? '', stderr: stderr ?? ''})));
}

function builtHelper(helper) {
  if (!helper.built) fail('helper_not_built', `the Keychain helper is not built (${helper.path})`, {hint: BUILD_HINT});
  return helper.path;
}

export async function runSecrets({command, label, yes = false, json = false}, {
  helper = locateHelper(), interactive = runInteractive, captured = runCaptured,
  print = value => process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n'),
  note = line => process.stderr.write(line + '\n'),
} = {}) {
  const path = builtHelper(helper);
  if (command === 'set') return interactive(path, ['set', label]);
  if (command === 'remove') return interactive(path, ['remove', label, ...(yes ? ['--yes'] : [])]);
  const result = await captured(path, ['list']);
  if (result.code !== 0) {
    const [, message, code] = result.stderr.trim().split('\n').pop()?.match(/^cua-keychain: (.*) \[([a-z_]+)\]$/) ?? [];
    throw new CuaError(code ?? 'helper_failed', message ?? `the Keychain helper failed (exit ${result.code})`);
  }
  let labels;
  try { labels = JSON.parse(result.stdout).labels; } catch {}
  if (!Array.isArray(labels)) fail('helper_failed', 'the Keychain helper printed an unreadable label list');
  if (json) print({ok: true, labels});
  else if (labels.length) print(labels.join('\n'));
  else note('no secrets are stored');
  return 0;
}
