// A pid the harness reads from a file, signalled only while it is still the process the harness meant (#171 M5, T4's
// second round; task 87's finding 8, the design session's ruling 725). A scene's pidfile (families.mjs `vteLaunch`)
// names the program gnome-terminal's server runs for it, outside the scene's process group; by the run's end that
// program may have ended and its pid been given to any process. So the scene records the process's identity when it
// opens (its start time since boot and its executable, from /proc), and its close signals the pid only while both are
// the same. Anything else is left alone, and the reason recorded.

import { existsSync, readFileSync, readlinkSync } from 'node:fs';
import { basename } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A live process's identity, `{pid, start, exe}`: `start` its start time in clock ticks since boot (/proc/<pid>/stat's
 * 22nd field, which an exec keeps and no later process under the same pid can share), `exe` its executable. Null for a
 * pid with no such process, or one this user cannot read.
 */
export function processIdentity(pid, { proc = '/proc' } = {}) {
  try {
    const stat = readFileSync(`${proc}/${pid}/stat`, 'utf8');
    // the fields after the command's name, which is in parentheses and may hold spaces or parentheses itself
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(' ');
    return { pid, start: fields[19], exe: readlinkSync(`${proc}/${pid}/exe`) };
  } catch {
    return null;
  }
}

/** Whether `now` is the process `recorded` was: the same pid, start time and executable. */
export const sameProcess = (recorded, now) => Boolean(recorded && now && recorded.pid === now.pid && recorded.start === now.start && recorded.exe === now.exe);

/**
 * `signal` sent to `recorded.pid` only while it is the recorded process (`sameProcess`). Answers `{signalled: true}`, or
 * `{signalled: false, reason}`: no identity recorded, the process gone, or another process under the pid now.
 */
export function signalIfSame(recorded, signal, { read = processIdentity, kill = (pid, s) => process.kill(pid, s) } = {}) {
  if (!recorded) return { signalled: false, reason: 'no identity was recorded when the scene opened' };
  const now = read(recorded.pid);
  if (!now) return { signalled: false, reason: 'gone' };
  if (!sameProcess(recorded, now)) return { signalled: false, reason: `pid ${recorded.pid} is another process now (started at tick ${now.start}, ${now.exe}; the scene's started at tick ${recorded.start}, ${recorded.exe})` };
  try {
    kill(recorded.pid, signal);
  } catch {
    return { signalled: false, reason: 'gone' };
  }
  return { signalled: true };
}

/**
 * The identity of the process a pidfile names, once it runs `program` (its script writes its pid, then execs the
 * program: the identity is the program's, not the shell's), waiting up to `waitMs`. Null when the file or the process
 * is not there, or it never became `program`: the close then signals nothing.
 */
export async function pidfileIdentity(pidfile, { program, waitMs = 3000, read = processIdentity } = {}) {
  for (const end = Date.now() + waitMs; ; await sleep(25)) {
    let pid = null;
    try {
      pid = Number(readFileSync(pidfile, 'utf8').trim());
    } catch {
      // not written yet
    }
    const id = Number.isSafeInteger(pid) && pid > 0 ? read(pid) : null;
    if (id && (!program || basename(id.exe) === program)) return id;
    if (Date.now() >= end) return null;
  }
}

/**
 * Whether a pid's process is there, from its stat alone (its exe need not read): `{state: 'absent'}` (no such process),
 * `{state: 'live', start}` (its start time in ticks since boot), or `{state: 'unknown', reason}` when the process is
 * there and its stat cannot be read (fix wave 2: an unreadable process is never taken for a gone one).
 */
export function processState(pid, { proc = '/proc' } = {}) {
  const at = `${proc}/${pid}`;
  let stat;
  try {
    stat = readFileSync(`${at}/stat`, 'utf8');
  } catch (error) {
    if (!existsSync(at)) return { state: 'absent' };
    return { state: 'unknown', reason: error.code ?? String(error.message) };
  }
  const start = stat.slice(stat.lastIndexOf(')') + 2).trim().split(' ')[19];
  return /^\d+$/.test(start ?? '') ? { state: 'live', start } : { state: 'unknown', reason: 'its stat does not read' };
}
