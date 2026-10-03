// The standalone server's own Codex login. The browser route's session requests need a Codex identity, which
// `codex app-server` reads from the runtime's CODEX_HOME; the server's CODEX_HOME is <home>/state/codex, never the
// desktop's ~/.codex. `cua login` runs the relocated bundled CLI (`codex login`) against that home, interactively at
// the user's terminal; `loginStatus` asks `codex login status` and keeps only its exit code.
//
// This module never opens, reads, prints or stores the credential file the CLI writes, and offers no route that feeds
// a key or token in (`--with-api-key`, `--with-access-token`): signing in is the CLI's own browser or device-code flow.
// Status output is discarded unread, since it may name the account.
//
// Environment (everything else from the caller is dropped, including CODEX_HOME, OPENAI_API_KEY and NODE_OPTIONS):
//   HOME USER LOGNAME TMPDIR LANG LC_ALL LC_CTYPE __CF_USER_TEXT_ENCODING TERM COLORTERM   copied when set
//   HTTP(S)_PROXY ALL_PROXY NO_PROXY (either case)                                          copied when set: sign-in
//                                                                                           is network traffic
//   PATH          fixed system path (the CLI opens the browser with /usr/bin/open)
//   CODEX_HOME    <home>/state/codex
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';

const AMBIENT_ALLOWLIST = [
  'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING', 'TERM', 'COLORTERM',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const MODES = {login: ['login'], 'device-auth': ['login', '--device-auth'], status: ['login', 'status']};
export const STATUS_TIMEOUT_MS = 10_000;
export const LOGIN_STATES = {loggedIn: 'logged-in', notLoggedIn: 'not-logged-in', unknown: 'unknown'};

const realOrSelf = path => { try { return realpathSync(path); } catch { return path; } };

// The owned CODEX_HOME must never be (or resolve to) the user's own Codex home.
function ownedCodexHome(home, ambient) {
  const codexHome = homeLayout(realHome(home)).codexHome;
  const userCodex = join(ambient.HOME || homedir(), '.codex');
  if (realOrSelf(codexHome) === realOrSelf(userCodex))
    fail('codex_home_not_owned', `${codexHome} resolves to your own Codex home; cua keeps its login in its own CODEX_HOME`, {hint: 'point CUA_HOME at a directory of its own'});
  return codexHome;
}

export function loginInvocation({runtime, home, mode, ambient = process.env}) {
  if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown login mode ${JSON.stringify(mode)}`);
  const codexHome = ownedCodexHome(home, ambient);
  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  Object.assign(env, {PATH: FIXED_PATH, CODEX_HOME: codexHome});
  return {command: runtime.paths.codexCli, args: [...MODES[mode]], env, codexHome};
}

const defaultIsTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

// Interactive sign-in at the user's terminal. Resolves with the CLI's exit code (1 if it died by a signal).
export async function runLogin({home, runtime, deviceAuth = false, isTTY = defaultIsTTY, ambient = process.env, stdio = 'inherit'}) {
  if (!isTTY()) fail('tty_required', 'cua login signs in interactively and needs a terminal (stdin and stdout must be a TTY)', {hint: 'run `cua login` yourself in a terminal window'});
  realHome(home, {create: true});
  const invocation = loginInvocation({runtime, home, mode: deviceAuth ? 'device-auth' : 'login', ambient});
  mkdirSync(invocation.codexHome, {recursive: true, mode: 0o700});
  // Ctrl-C reaches the CLI too (same foreground group); cua waits for it to finish rather than dying first.
  const ignore = () => {};
  process.on('SIGINT', ignore);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {env: invocation.env, stdio});
      child.once('error', error => reject(new Error(`could not start the bundled codex CLI (${error.code ?? error.message})`)));
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } finally {
    process.off('SIGINT', ignore);
  }
}

// `codex login status` against the owned CODEX_HOME, bounded by `timeoutMs`. Only the exit code is kept: 0 logged
// in, 1 not logged in, anything else (or no answer) unknown. Without an owned CODEX_HOME nothing is run or created.
export async function loginStatus({home, runtime, timeoutMs = STATUS_TIMEOUT_MS, ambient = process.env}) {
  const invocation = loginInvocation({runtime, home, mode: 'status', ambient});
  if (!existsSync(invocation.codexHome)) return {state: LOGIN_STATES.notLoggedIn, reason: 'the owned CODEX_HOME does not exist yet'};
  return new Promise(resolve => {
    let settled = false;
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const child = spawn(invocation.command, invocation.args, {env: invocation.env, stdio: 'ignore'});
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done({state: LOGIN_STATES.unknown, reason: `codex login status did not answer within ${timeoutMs} ms`});
    }, timeoutMs);
    child.once('error', error => done({state: LOGIN_STATES.unknown, reason: `could not start the bundled codex CLI (${error.code ?? 'error'})`}));
    child.once('exit', (code, signal) => {
      if (code === 0) done({state: LOGIN_STATES.loggedIn});
      else if (code === 1) done({state: LOGIN_STATES.notLoggedIn, reason: 'codex login status reports no login'});
      else done({state: LOGIN_STATES.unknown, reason: signal ? `codex login status ended by ${signal}` : `codex login status exited ${code}`});
    });
  });
}
