#!/usr/bin/env node
// The pause for GUI-bound groups on the mini (MAWS DL 58): while MAWS CI's mac-lane runner is busy, or a macOS job is
// queued for it, a GUI-bound group (the cfprefs suites, repl-parity, accept-native's TextEdit sitting) waits at its next
// cell boundary, and it resumes after two idle readings about 45 s apart. Headless groups need none of this.
//
//   node scripts/mini-pause.mjs watch --file <pause file> [--mirror <path on the mini>] [--log <evidence log>]
//
// The watcher (on the controller, where scripts/mini-rules.mjs reads the same observations as the gate) writes the
// pause file ({since, reason}) when a reading is not idle and removes it after two idle readings `apartMs` apart. A
// reading that cannot be completed is never idle. `--mirror` keeps a copy of the file on the mini, for a group that runs
// there (accept-native). Each pause it ends is logged with its start, end and reason. On SIGTERM/SIGINT it removes the
// file (and the mirror): its owner stops it only after the group has finished.
//
// The harness side (pauseGate): before each cell it checks the file and, while it exists, waits there and never aborts;
// what it waited for is recorded in the run's evidence. A cell during which the pause turned on is marked too, so its
// timing can be dropped rather than judged.
import {appendFileSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Stop, liveExec, observeRunner} from './mini-rules.mjs';
import {quote} from './browser-parity/topology.mjs';

// One reading -> {pause, reason}: the runner busy (its flag or a Runner.Worker) or a macOS job queued; unread is a pause.
export function pauseReading({exec}) {
  let o;
  try { o = observeRunner({exec}); } catch (error) {
    if (error instanceof Stop) return {pause: true, reason: `unread (${error.message})`};
    throw error;
  }
  const reasons = [o.busy && 'runner busy', o.workers > 0 && `${o.workers} Runner.Worker`, o.queued > 0 && `${o.queued} queued macOS job(s)`].filter(Boolean);
  return {pause: reasons.length > 0, reason: reasons.length ? reasons.join(', ') : 'idle'};
}

const readPause = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {reason: 'unknown'}; } };

// A copy of the pause file on the mini (accept-native runs there).
export const sshMirror = (path, {exec}) => ({
  write: text => exec('ssh', ['-o', 'BatchMode=yes', 'mini', `mkdir -p "$(dirname ${quote(path)})" && printf %s ${quote(text)} > ${quote(path)}`]),
  remove: () => exec('ssh', ['-o', 'BatchMode=yes', 'mini', `rm -f ${quote(path)}`]),
});

// Runs until `stopped()` (or `maxReadings`); -> the pauses it ended, [{reason, since, until}].
export async function watchPause({file, exec, sleep, now = () => new Date(), log = () => {}, mirror = null, apartMs = 45_000, pollMs = 15_000,
  stopped = () => false, maxReadings = Infinity, read = () => pauseReading({exec})}) {
  const ended = [];
  let paused = existsSync(file) ? {...readPause(file), since: readPause(file).since ?? now().toISOString()} : null;
  if (paused) log(`pause file present at start (${paused.reason}): it stays until two idle readings`);
  for (let readings = 0; readings < maxReadings && !stopped();) {
    const first = read(); readings++;
    if (!paused) {
      if (first.pause) {
        paused = {since: now().toISOString(), reason: first.reason};
        const text = JSON.stringify(paused);
        writeFileSync(file, text);
        mirror?.write(text);
        log(`pause on: ${first.reason}`);
      }
      await sleep(pollMs);
      continue;
    }
    if (first.pause) { await sleep(pollMs); continue; }
    await sleep(apartMs);
    if (stopped()) break;
    const second = read(); readings++;
    if (second.pause) { log(`pause holds: the second reading is ${second.reason}`); await sleep(pollMs); continue; }
    rmSync(file, {force: true});
    mirror?.remove();
    const pause = {reason: paused.reason, since: paused.since, until: now().toISOString()};
    ended.push(pause);
    log(`pause off after two idle readings: ${JSON.stringify(pause)}`);
    paused = null;
  }
  return ended;
}

// The harness side. `file` unset: no pause, ever. -> {wait(where), active(), reason(), note(pause)}.
// wait() returns null when the file is absent, else waits until it is gone (never aborts) and returns
// {where, reason, startedAt, endedAt}, after handing it to `record`.
export function pauseGate({file, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => new Date(), log = () => {}, record = () => {}, pollMs = 2000} = {}) {
  if (!file) return NO_PAUSE;
  return {
    active: () => existsSync(file),
    reason: () => readPause(file).reason,
    note: pause => record(pause),   // a cell during which the pause turned on
    async wait(where) {
      if (!existsSync(file)) return null;
      const reason = readPause(file).reason, startedAt = now().toISOString();
      log(`paused before ${where}: ${reason}`);
      while (existsSync(file)) await sleep(pollMs);
      const pause = {where, reason, startedAt, endedAt: now().toISOString()};
      log(`resumed at ${where}`);
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
export const NO_PAUSE = Object.freeze({active: () => false, reason: () => null, note: () => {}, wait: async () => null});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values, positionals: [command]} = parseArgs({allowPositionals: true, options: {file: {type: 'string'}, mirror: {type: 'string'}, log: {type: 'string'}}});
  if (command !== 'watch' || !values.file) { console.error('usage: mini-pause.mjs watch --file <pause file> [--mirror <path on the mini>] [--log <file>]'); process.exit(2); }
  const log = line => { const text = `${new Date().toISOString()} ${line}`; console.error(`mini-pause: ${text}`); if (values.log) appendFileSync(values.log, text + '\n'); };
  const mirror = values.mirror ? sshMirror(values.mirror, {exec: liveExec}) : null;
  let stop = false, wake = null;
  const sleep = ms => new Promise(r => { const timer = setTimeout(r, ms); wake = () => { clearTimeout(timer); r(); }; });
  const end = () => { stop = true; wake?.(); };
  process.once('SIGTERM', end); process.once('SIGINT', end);
  watchPause({file: values.file, exec: liveExec, sleep, log, mirror, stopped: () => stop}).finally(() => {
    rmSync(values.file, {force: true});
    try { mirror?.remove(); } catch { /* the mini may be gone; the group has finished */ }
    log('watcher stopped; pause file removed');
  });
}
