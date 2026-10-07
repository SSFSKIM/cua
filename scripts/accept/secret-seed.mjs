// A disposable secret store for the live fixtures (scripts/accept-native.mjs, scripts/probe-secrets.mjs,
// scripts/accept-chrome.mjs). The store is a file per key under $HOME/.config/claude-secrets (src/secrets/store.mjs),
// resolved from the server's own $HOME, so a fixture creates a temporary $HOME, stores its generated value there and
// runs `cua serve` with HOME set to it: the user's own store is never read or written.
//
// seedSecret stores the value the way a person does, through `cua secrets set KEY` at its masked raw-mode prompt,
// typed twice, on a pseudo-terminal from the system `script` utility. The value travels only over script's stdin pipe
// and the pty, never in argv, the environment or a file other than the store's own; it is typed only after each prompt
// appeared (so raw mode, which turns echo off, is already on), and the terminal output is checked for it.
// The result is metadata only: nothing returned carries the value.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir, userInfo} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isLabel} from '../../src/secrets/label.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
// The prompts of `cua secrets set` (src/secrets/commands.mjs), in the order they appear.
export const SET_PROMPTS = ['(not shown): ', 'again, to confirm: '];

// A key no one else uses, in the store's grammar: PREFIX_<16 hex digits>.
export const generatedKey = (prefix = 'CUA_ACCEPT') => `${prefix}_${randomBytes(8).toString('hex').toUpperCase()}`;

// A new, empty, private temporary $HOME, by its real path (a server derives its store directory from it as given).
export const createStoreHome = (prefix = 'cua-secrets-home-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

// A server serving a temporary store runs with HOME set to that home, which is how it resolves its store; its
// runtime must still see the account's real home (os.userInfo, not $HOME): the vendor services find the native
// computer-use socket and Chrome's hosts under os.homedir(), which follows HOME.
export const accountHome = () => userInfo().homedir;
export const withAccountHome = launch => (launch.env.HOME === undefined ? launch : {...launch, env: {...launch.env, HOME: accountHome()}});

// Whether `home` is this account's own home directory, whose store a fixture must never touch.
export function isAccountHome(home) {
  const real = path => { try { return realpathSync(path); } catch { return path; } };
  return typeof home !== 'string' || !home || real(home) === real(accountHome());
}

// The `script` invocation that runs argv on a fresh pty and discards the typescript: BSD/macOS takes the command as
// arguments; util-linux takes it as one shell command after -c, with -e to return the command's exit status. bash
// execs it with its stdin a real pipe fed by `cat` from ours: Node's stdio pipes are sockets on macOS, on which BSD
// `script` fails its terminal query, and a process substitution leaves `script` itself as the child to wait for.
// On Linux the pty is Python's pty.spawn instead: util-linux `script` (2.39) keeps running after its command exits
// until its stdin reaches EOF, and when that EOF comes after the exit it hung in about half of a dozen parallel runs.
// pty.spawn returns when the command's side of the pty closes, with the command's wait status.
const PY_PTY = 'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))';
export function ptyCommand(argv, platform = process.platform) {
  const script = platform === 'linux' ? ['python3', '-c', PY_PTY, ...argv] : ['/usr/bin/script', '-q', '/dev/null', ...argv];
  return {command: '/bin/bash', args: ['-c', 'exec "$0" "$@" < <(exec cat)', ...script]};
}

// Stores `value` under `key` in the store of `home` through `cua secrets set`. Resolves
// {exit, signal, timedOut, prompts, echoed, stored, said}: `prompts` counts the prompts answered, `echoed` says whether
// the value appeared in the terminal output (it never should), `stored` whether the key's file is now listed, and
// `said` is the command's last output line, with the value cut out should it ever be there.
export function seedSecret({home, key, value, timeoutMs = 15_000, cli = CLI, platform = process.platform, env = process.env}) {
  if (!isLabel(key)) throw new TypeError(`not a secret key: ${key}`);
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('seed values must be non-empty text without control characters');
  if (isAccountHome(home)) throw new TypeError('seedSecret writes only to a temporary $HOME, never this account\'s');
  const {command, args} = ptyCommand([process.execPath, cli, 'secrets', 'set', key], platform);
  return new Promise(resolve => {
    const child = spawn(command, args, {env: {...env, HOME: home}, stdio: ['pipe', 'pipe', 'pipe']});
    let output = '';
    let prompts = 0;
    let searchFrom = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const onOutput = chunk => {
      output += chunk.toString('utf8');
      // Answer each prompt once, after it appeared; a short pause lets the prompt's raw-mode switch land first.
      for (let at; prompts < SET_PROMPTS.length && (at = output.indexOf(SET_PROMPTS[prompts], searchFrom)) >= 0;) {
        searchFrom = at + SET_PROMPTS[prompts].length;
        prompts++;
        setTimeout(() => { if (child.exitCode === null && !child.killed) child.stdin.write(`${value}\r`); }, 150);
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.stdin.on('error', () => {});
    const finish = async (exit, signal) => {
      clearTimeout(timer);
      child.stdin.end();
      let stored = false;
      try { stored = (await fileStore({dir: storeDir({HOME: home})}).list()).includes(key); } catch {}
      const said = output.split(value).join('<value>').split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) ?? '';
      resolve({exit, signal, timedOut, prompts, echoed: output.includes(value), stored, said: said.slice(0, 200)});
    };
    child.on('error', error => finish(null, error.code ?? 'error'));
    child.on('exit', (exit, signal) => finish(exit, signal));
  });
}

// Whether `home` is a home createStoreHome made: directly in the system temporary directory, named cua-*.
const isTemporaryHome = home => {
  try { return dirname(realpathSync(home)) === realpathSync(tmpdir()) && basename(home).startsWith('cua-'); } catch { return false; }
};

// Removes `key` from the store of `home` (when given) and then the temporary home itself. Resolves {keyGone, homeGone}.
export async function removeStoreHome({home, key}) {
  if (isAccountHome(home) || (existsSync(home) && !isTemporaryHome(home))) throw new TypeError('removeStoreHome removes only a temporary $HOME createStoreHome made, never this account\'s');
  let keyGone = true;
  if (key) {
    const store = fileStore({dir: storeDir({HOME: home})});
    try { await store.remove(key); } catch (error) { if (error.code !== 'not_found') keyGone = false; }
    try { keyGone = keyGone && !(await store.list()).includes(key); } catch { keyGone = false; }
  }
  rmSync(home, {recursive: true, force: true});
  return {keyGone, homeGone: !existsSync(home)};
}
