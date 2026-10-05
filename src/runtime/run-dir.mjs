// Ownership of $CUA_HOME/run. Every runtime launch (a `cua serve` connection, a profile listing) claims a session
// there, under a fresh random session ID:
//   run/<session>.pid    the claiming process's pid: written first, removed last
//   run/<session>/       the runtime's working directory; its JavaScript cells may write in it, so the record sits beside it
//   run/<session>.sock   the connection's secrets broker endpoint (src/secrets/broker.mjs), when it has one
// The owner removes them when it closes, and a process exit cua does not handle in order (an uncaught error, a crash)
// still removes them through an exit hook. A process killed outright (SIGKILL, a client killing its process group)
// cannot; the sweep removes every session whose recorded owner is no longer alive, at `cua serve` start and in
// `cua doctor`. Liveness is kill(pid, 0): a reused pid only keeps a stale session longer, never removes a live one.
// Within run/ a session's names belong to its owner: once the owner is gone they are removed by name. Entries with no
// readable record (left by a cua that wrote none, or not cua's) are reported, never removed.
import {lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homeLayout, realHome} from './layout.mjs';

const RECORD = /^([A-Za-z0-9-]{1,128})\.pid$/;
const claims = new Map();  // session ID -> the run directory, for sessions this process has not released yet

function isSocket(path) {
  try { return lstatSync(path).isSocket(); } catch { return false; }
}

function exists(path) {
  try { lstatSync(path); return true; } catch { return false; }
}

// Removes a session's entries, the record last and only once nothing else of the session remains (a later sweep
// retries what is left). `socket: false` leaves the endpoint to its broker, which removes only the socket it created.
function removeSession(run, sessionId, {socket = true} = {}) {
  const errors = [];
  const sock = join(run, `${sessionId}.sock`);
  const dir = join(run, sessionId);
  if (socket && isSocket(sock)) try { rmSync(sock, {force: true}); } catch (error) { errors.push(`${sock}: ${error.code ?? 'error'}`); }
  try { rmSync(dir, {recursive: true, force: true}); } catch (error) { errors.push(`${dir}: ${error.code ?? 'error'}`); }
  if (!exists(sock) && !exists(dir)) try { rmSync(join(run, `${sessionId}.pid`), {force: true}); } catch (error) { errors.push(`${sessionId}.pid: ${error.code ?? 'error'}`); }
  return errors;
}

let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', () => { for (const [sessionId, run] of claims) removeSession(run, sessionId); });
}

// Claims `sessionId` for this process, creating run/ if needed. `release()` removes the session's working directory
// and then its record, leaving the socket to the broker's own close (a socket still there keeps the record, so the
// sweep removes both once this process is gone).
export function claimRunSession(home, sessionId) {
  const {run} = homeLayout(realHome(home));
  mkdirSync(run, {recursive: true, mode: 0o700});
  writeFileSync(join(run, `${sessionId}.pid`), `${process.pid}\n`, {flag: 'wx', mode: 0o600});
  claims.set(sessionId, run);
  hookExit();
  return {
    release: () => {
      claims.delete(sessionId);
      return removeSession(run, sessionId, {socket: false});
    },
  };
}

const defaultAlive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

// Removes the sessions whose recorded owner is gone. Returns what it found: {swept: [{session, pid}], live: [{session,
// pid}], unowned: [entry names with no readable record], failed: [{session, pid, errors}]}.
export function sweepRun(home, {alive = defaultAlive} = {}) {
  const {run} = homeLayout(realHome(home));
  let names;
  try { names = readdirSync(run); } catch (error) {
    if (error.code === 'ENOENT') return {run, swept: [], live: [], unowned: [], failed: []};
    throw error;
  }
  const result = {run, swept: [], live: [], unowned: [], failed: []};
  const recorded = new Set();
  for (const name of names) {
    const session = RECORD.exec(name)?.[1];
    if (!session) continue;
    let pid;
    try { pid = Number(readFileSync(join(run, name), 'utf8').trim()); } catch { continue; }
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;  // unreadable, or still being written: not a record yet
    recorded.add(session);
    if (alive(pid)) { result.live.push({session, pid}); continue; }
    const errors = removeSession(run, session);
    if (errors.length) result.failed.push({session, pid, errors});
    else result.swept.push({session, pid});
  }
  for (const name of names) {
    const session = RECORD.exec(name)?.[1] ?? name.replace(/\.sock$/, '');
    if (!recorded.has(session)) result.unowned.push(name);
  }
  return result;
}

// One line on what a sweep did, or null when there was nothing stale to remove or report.
export function describeSweep({swept, unowned, failed}) {
  const parts = [];
  if (swept.length) parts.push(`removed the leftovers of ${swept.length} connection${swept.length === 1 ? '' : 's'} whose cua process is gone (${swept.map(s => `${s.session}, pid ${s.pid}`).join('; ')})`);
  if (failed.length) parts.push(`could not remove the leftovers of ${failed.map(f => `${f.session} (pid ${f.pid} is gone): ${f.errors.join(', ')}`).join('; ')}`);
  if (unowned.length) parts.push(`left alone ${unowned.length} entr${unowned.length === 1 ? 'y' : 'ies'} with no owner record (${unowned.join(', ')}): written by a cua that kept no record, or not cua's; remove them yourself once no cua serve or profile listing is running`);
  return parts.length ? parts.join('; ') : null;
}
