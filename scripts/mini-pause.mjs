#!/usr/bin/env node
// The pause for GUI-bound groups on the mini (MAWS DL 58): while MAWS CI's mac-lane runner is busy, or a macOS job is
// queued for it, a GUI-bound group (the cfprefs suites, repl-parity, accept-native's TextEdit sitting) waits at its next
// cell boundary, and it resumes after two idle readings about 45 s apart. Headless groups need none of this.
//
//   node scripts/mini-pause.mjs watch --file <pause file> [--mirror <path on the mini>] [--log <evidence log>]
//
// The watcher (on the controller, where scripts/mini-rules.mjs reads the same observations as the gate) writes the
// pause file ({since, reason}) when a reading is not idle and removes it after two idle readings `apartMs` apart. A
// reading that cannot be completed is never idle. With each reading it rewrites its heartbeat, `<file>.alive`
// ({pid, generation, paused, longPause?, at}; `generation` counts the pauses it has started). `--mirror` keeps a copy of
// both on the mini, for a group that runs there (accept-native). Each pause it ends is logged with its start, end and
// reason, each Runner.Worker a reading sees with its command, parent and elapsed time, and a pause past 20 minutes once
// (and in the heartbeat as `longPause`, which the harness surfaces on stderr) for the runner's operator.
//
// It fails closed. If it fails, it leaves a pause in place (writing one if there was none) and stops beating; on
// SIGTERM it just stops. It never removes the pause file on exit: the group's owner does, once the group has finished
// (removePauseFiles).
//
// The harness side (pauseGate): before each cell it checks the heartbeat and the file. While the file exists it waits
// there; a watcher whose heartbeat has gone stale is a lost watcher, and the group then stops (`onLost: 'stop'`) or stays
// paused until it beats again (`'wait'`, the TextEdit sitting, which never aborts). Each wait is recorded in the run's
// evidence. A cell is also marked when a pause overlapped it (the file at its end, or a pause generation that changed
// while it ran), so its timing can be dropped rather than judged.
import {appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Stop, describeWorker, liveExec, observeRunner} from './mini-rules.mjs';
import {quote} from './browser-parity/topology.mjs';

// One reading -> {pause, reason, seen}: the runner busy (its flag or a Runner.Worker) or a macOS job queued; unread is a
// pause. `seen`: the workers it saw (mini-rules.mjs workerProbe), each logged.
export function pauseReading({exec}) {
  let o;
  try { o = observeRunner({exec}); } catch (error) {
    if (error instanceof Stop) return {pause: true, reason: `unread (${error.message})`, seen: []};
    throw error;
  }
  const reasons = [o.busy && 'runner busy', o.workers > 0 && `${o.workers} Runner.Worker`, o.queued > 0 && `${o.queued} queued macOS job(s)`].filter(Boolean);
  return {pause: reasons.length > 0, reason: reasons.length ? reasons.join(', ') : 'idle', seen: o.seen};
}
// A pause longer than this is the runner's operator's to hear about: the watcher records it, the harness surfaces it.
export const LONG_PAUSE_MS = 20 * 60_000;

const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
export const heartbeatOf = file => `${file}.alive`;

// A copy of a file on the mini (accept-native runs there).
export const sshMirror = (path, {exec}) => ({
  write: (text, target = path) => exec('ssh', ['-o', 'BatchMode=yes', 'mini', `mkdir -p "$(dirname ${quote(target)})" && printf %s ${quote(text)} > ${quote(target)}`]),
  remove: (target = path) => exec('ssh', ['-o', 'BatchMode=yes', 'mini', `rm -f ${quote(target)}`]),
  path,
});

// The pause file and heartbeat, for their owner once the group has finished (never the watcher).
export function removePauseFiles(file, {mirror = null} = {}) {
  rmSync(file, {force: true});
  rmSync(heartbeatOf(file), {force: true});
  if (mirror) { mirror.remove(); mirror.remove(heartbeatOf(mirror.path)); }
}

// Runs until `stopped()` (or `maxReadings`); -> the pauses it ended, [{reason, since, until}]. Throws when a reading or a
// write fails in a way it cannot read as a pause; the caller then leaves a pause in place (failClosed).
export async function watchPause({file, exec, sleep, now = () => new Date(), log = () => {}, mirror = null, apartMs = 45_000, pollMs = 15_000,
  stopped = () => false, maxReadings = Infinity, read = () => pauseReading({exec}), pid = process.pid}) {
  const ended = [];
  let paused = existsSync(file) ? {since: now().toISOString(), ...readJson(file, {reason: 'unknown'})} : null;
  let generation = paused ? 1 : 0;
  const beat = () => {
    if (paused && !paused.long && now().getTime() - Date.parse(paused.since) > LONG_PAUSE_MS) {
      paused.long = true;
      log(`pause over 20 minutes since ${paused.since} (${paused.reason}); report it to the runner's operator`);
    }
    const longPause = paused?.long ? {since: paused.since, reason: paused.reason} : undefined;
    const text = JSON.stringify({pid, generation, paused: Boolean(paused), ...(longPause ? {longPause} : {}), at: now().toISOString()});
    writeFileSync(heartbeatOf(file), text);
    mirror?.write(text, heartbeatOf(mirror.path));
  };
  const reading = () => { const r = read(); for (const w of r.seen ?? []) log(describeWorker(w)); return r; };
  if (paused) log(`pause file present at start (${paused.reason}): it stays until two idle readings`);
  beat();
  for (let readings = 0; readings < maxReadings && !stopped();) {
    const first = reading(); readings++;
    if (!paused) {
      if (first.pause) {
        paused = {since: now().toISOString(), reason: first.reason};
        generation++;
        const text = JSON.stringify(paused);
        writeFileSync(file, text);
        mirror?.write(text);
        log(`pause on: ${first.reason}`);
      }
      beat();
      await sleep(pollMs);
      continue;
    }
    beat();
    if (first.pause) { await sleep(pollMs); continue; }
    await sleep(apartMs);
    if (stopped()) break;
    const second = reading(); readings++;
    beat();
    if (second.pause) { log(`pause holds: the second reading is ${second.reason}`); await sleep(pollMs); continue; }
    rmSync(file, {force: true});
    mirror?.remove();
    const pause = {reason: paused.reason, since: paused.since, until: now().toISOString()};
    ended.push(pause);
    paused = null;
    beat();
    log(`pause off after two idle readings: ${JSON.stringify(pause)}`);
  }
  return ended;
}

// A watcher that failed leaves a pause in place: the pause file stays (or is written), never removed.
export function failClosed(file, error, {mirror = null, now = () => new Date(), log = () => {}} = {}) {
  const text = JSON.stringify({since: now().toISOString(), reason: `the pause watcher failed (${error.message.split('\n')[0]})`});
  if (!existsSync(file)) writeFileSync(file, text);
  try { mirror?.write(text); } catch { /* the mini may be unreachable: its group sees no heartbeat and stops or waits */ }
  log(`watcher failed, pause left in place: ${error.message.split('\n')[0]}`);
}

export class PauseLost extends Error {}

// The harness side. `file` unset: no pause, ever. -> {wait(where), begin(), overlapped(token, where)}.
// wait() returns null when no pause holds, else waits until it is gone and returns {where, reason, startedAt, endedAt},
// after handing it to `record`. A stale heartbeat (older than `staleMs`, by the file's own mtime, so a mirror is judged
// by the mini's clock) is a lost watcher: `onLost` 'stop' throws PauseLost, 'wait' stays paused until it beats again.
// A pause the watcher marked as long (over LONG_PAUSE_MS) is surfaced through `warn`, once per pause.
export function pauseGate({file, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => new Date(), log = () => {}, record = () => {},
  pollMs = 2000, staleMs = 180_000, onLost = 'stop', warn = line => console.error(`mini-pause: ${line}`)} = {}) {
  if (!file) return NO_PAUSE;
  const heartbeat = heartbeatOf(file);
  const alive = () => { try { return now().getTime() - statSync(heartbeat).mtimeMs <= staleMs; } catch { return false; } };
  const generation = () => readJson(heartbeat, {}).generation ?? null;
  const reason = () => readJson(file, {reason: 'unknown'}).reason;
  const held = () => existsSync(file) || !alive();
  let warnedSince = null;
  const surfaceLong = where => {
    const long = readJson(heartbeat, {}).longPause;
    if (!long || long.since === warnedSince) return;
    warnedSince = long.since;
    warn(`pause over 20 minutes since ${long.since} (${long.reason}), held at ${where}: report it to the runner's operator`);
  };
  return {
    async wait(where) {
      if (!held()) return null;
      const startedAt = now().toISOString();
      let why = alive() ? reason() : 'the pause watcher has no heartbeat';
      log(`paused before ${where}: ${why}`);
      while (held()) {
        surfaceLong(where);
        if (!alive()) {
          why = 'the pause watcher has no heartbeat';
          if (onLost === 'stop') throw new PauseLost(`the pause watcher is gone (no heartbeat within ${staleMs / 1000} s); the group stops before ${where}`);
        }
        await sleep(pollMs);
      }
      const pause = {where, reason: why, startedAt, endedAt: now().toISOString()};
      log(`resumed at ${where}`);
      record(pause);
      return pause;
    },
    // At a cell's start (after its wait): what a later overlapped() compares against.
    begin: () => ({generation: generation()}),
    // At its end: whether a pause overlapped the cell -> {where, reason, during: true} (recorded) or null.
    overlapped(token, where) {
      if (!existsSync(file) && generation() === token.generation) return null;
      const pause = {where, reason: existsSync(file) ? reason() : 'a pause that began and ended while the cell ran', during: true};
      record(pause);
      return pause;
    },
  };
}
// `session` (anything with a js(code, ...) method) with each cell waiting at its boundary while `gate` holds a pause:
// for a sitting that must wait and never abort (accept-native's TextEdit, its owner standing by). In place.
export function pausing(session, gate, where = 'a cell') {
  const js = session.js.bind(session);
  session.js = async (...args) => { await gate.wait(where); return js(...args); };
  return session;
}
export const NO_PAUSE = Object.freeze({wait: async () => null, begin: () => ({generation: null}), overlapped: () => null});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values, positionals: [command]} = parseArgs({allowPositionals: true, options: {file: {type: 'string'}, mirror: {type: 'string'}, log: {type: 'string'}}});
  if (command !== 'watch' || !values.file) { console.error('usage: mini-pause.mjs watch --file <pause file> [--mirror <path on the mini>] [--log <file>]'); process.exit(2); }
  const log = line => { const text = `${new Date().toISOString()} ${line}`; console.error(`mini-pause: ${text}`); if (values.log) appendFileSync(values.log, text + '\n'); };
  const mirror = values.mirror ? sshMirror(values.mirror, {exec: liveExec}) : null;
  let stop = false, wake = null;
  const sleep = ms => new Promise(r => { const timer = setTimeout(r, ms); wake = () => { clearTimeout(timer); r(); }; });
  const end = () => { stop = true; wake?.(); };
  process.once('SIGTERM', end); process.once('SIGINT', end);
  watchPause({file: values.file, exec: liveExec, sleep, log, mirror, stopped: () => stop}).then(
    () => log('watcher stopped; the pause file is its owner\'s to remove'),
    error => { failClosed(values.file, error, {mirror, log}); process.exitCode = 1; });
}
