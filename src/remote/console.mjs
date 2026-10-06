// Whether this user's GUI session can be driven: it is the console session (the one on the screen) and the screen is
// not locked. Input to a locked or background session goes nowhere and its screenshots are black, so remote control
// refuses js there (`console_locked`, src/mcp/http.mjs) and doctor reports it (`agent.console`).
//
// Read without a compiled helper: the IORegistry root, as `ioreg -n Root -d1 -a` prints it, carries what
// CGSessionCopyCurrentDictionary reports for every GUI session (`IOConsoleUsers`, each with kCGSSessionUserIDKey,
// kCGSSessionOnConsoleKey and, while that session's screen is locked, CGSSessionScreenIsLocked) and the kernel's own
// `IOConsoleLocked` (true while the console is locked or nobody is logged in at it).
// Either lock signal counts. `ioreg` needs no privilege and runs from a launchd job as from a terminal.
import {execFile} from 'node:child_process';
import {isDict, parsePlist} from './plist.mjs';
import {CuaError, fail} from '../runtime/errors.mjs';

const IOREG = '/usr/sbin/ioreg';

// CUA_AGENT_CONSOLE_CHECK: `on` (the default) or `off`, which stops the js refusal and reads doctor's row as skip, for a
// Mac whose registry this reader misjudges.
export function consoleCheckFrom(env) {
  const value = env.CUA_AGENT_CONSOLE_CHECK ?? 'on';
  if (value !== 'on' && value !== 'off') fail('invalid_setting', 'CUA_AGENT_CONSOLE_CHECK must be on or off');
  return value === 'on';
}

export const readConsoleRegistry = () => new Promise((resolve, reject) => {
  // The root's properties are about 200 KB (IOKitDiagnostics); the console keys are a few of them.
  execFile(IOREG, ['-n', 'Root', '-d1', '-a'], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 5000}, (error, stdout) =>
    error ? reject(error) : resolve(stdout));
});

const unreadable = why => fail('console_unreadable', `the console state could not be read (${why})`);

export function consoleStateOf(registry, uid) {
  let root;
  try { root = parsePlist(registry); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    unreadable(error.message);
  }
  const users = root?.IOConsoleUsers ?? [];
  if (!isDict(root) || !Array.isArray(users))
    unreadable('ioreg did not print the registry root');
  const session = users.find(user => user?.kCGSSessionUserIDKey === uid);
  return {
    onConsole: session?.kCGSSessionOnConsoleKey === true,
    locked: root.IOConsoleLocked === true || session?.CGSSessionScreenIsLocked === true,
  };
}

// → {onConsole, locked}; rejects with `console_unreadable` when the registry cannot be read.
export async function checkConsole({read = readConsoleRegistry, uid = process.getuid()} = {}) {
  let registry;
  try { registry = await read(); } catch (error) {
    unreadable(error.code ?? error.message);
  }
  return consoleStateOf(registry, uid);
}
