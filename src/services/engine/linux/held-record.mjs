// The engine's held record, the trusted worker's part (native/linux-engine/src/held.rs and shim.rs; M4 T7b fix 5). On
// Linux the REPL host starts the worker's launcher under cua-engine's resident shim, which makes a pipe and hands its
// write end down through codex-linux-sandbox and bwrap into this process, named in CUA_ENGINE_HELD_FD. The engine
// writes on it what it holds down through XTEST, and the shim, outside the sandbox, releases that if the engine dies
// without its own release. Only the engine may write there: the XTEST devices are shared by every client, so a record
// is what tells the engine's keys from another client's. So the descriptor is no path model code could reach, and here
// it is taken before anything starts: reopened close-on-exec (Node has no fcntl; /proc reopens a pipe as a new open of
// the same pipe), the inherited one closed and its name taken out of the environment, so nothing this process starts
// gets it but each engine the client starts, at descriptor 3 (heldRecordStdio).
import {closeSync, constants, openSync} from 'node:fs';

export const HELD_RECORD_ENV = 'CUA_ENGINE_HELD_FD';
/** Where an engine finds the record: the descriptor after its stdin, stdout and stderr. */
export const ENGINE_HELD_FD = 3;

let record = null;

// Takes the record `env` names (this process's environment by default), once, before this process starts anything.
// -> the close-on-exec descriptor kept for the engine, or null (none named, or not a pipe's write end any more).
export function takeHeldRecord(env = process.env, {open = openSync, close = closeSync} = {}) {
  const named = env[HELD_RECORD_ENV];
  delete env[HELD_RECORD_ENV];
  if (!/^\d+$/.test(named ?? '') || Number(named) < 3) return null;
  const fd = Number(named);
  // non-blocking: the open of a pipe with no reader (its shim gone) fails rather than waits; the engine makes its own
  // end blocking
  try { record = open(`/proc/self/fd/${fd}`, constants.O_WRONLY | constants.O_NONBLOCK); } catch { record = null; }
  try { close(fd); } catch { /* not open */ }
  return record;
}

// What an engine's spawn adds for the record: its stdio's fourth entry and its environment's name, or nothing when
// this process holds no record. -> {stdio: [...], env: {...}} | null
export function heldRecordStdio(fd = record) {
  return fd === null ? null : {stdio: [fd], env: {[HELD_RECORD_ENV]: String(ENGINE_HELD_FD)}};
}
