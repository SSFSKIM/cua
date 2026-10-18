#!/usr/bin/env node
// The during-run runner watch for a mini run (MAWS DL 58), on the controller beside the run's driver: about every 30 s
// it reads what the gate reads (scripts/mini-rules.mjs observe) and, when the run must stop, ends only the local process
// tree under the root pid (the driver: its harness and ssh children), never anything on the mini. It exits when the root
// is gone. Every reading and decision goes to the run's own log (#157: #115 kept this at /tmp with an M1 log fixed in it).
//
//   node scripts/mini-watch.mjs --root <pid> --log <file> [--label <text>] [--mode kill|dialog-only|pause-aware]
//                               [--pause-file <file> --run-log <file>] [--hold-until <file>]
//
// Modes:
//   kill         (default) the run ends as soon as the runner works: busy, a Runner.Worker, or a macOS job queued;
//   dialog-only  only a system dialog ends it (a sitting whose cells wait at a pause, its owner standing by);
//   pause-aware  the run pauses itself at its next cell (scripts/mini-pause.mjs, the pause file and its heartbeat); it is
//                ended only when that cannot be trusted: a heartbeat older than 90 s while the runner works or the pause
//                is on; the pause file absent on two readings running while the runner works; or a pause on for over
//                60 s while the run's log shows no cell held at a boundary (its latest pause line is not "paused before").
// In every mode a system dialog in front ends the run. --hold-until names a file holding an ISO time: until then (a CI-opt
// hold) a queued job does not count as work.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {SYSTEM_PROMPTS, Unread, describeWorker, liveExec, observe} from './mini-rules.mjs';
import {heartbeatOf} from './mini-pause.mjs';

export const MODES = ['kill', 'dialog-only', 'pause-aware'];
export const STALE_BEAT_S = 90, HELD_AFTER_MS = 60_000;

// Whether the run's log shows a cell held at a boundary: its latest pause line is "paused before", not "resumed at".
export const holdingIn = text => text.lastIndexOf('paused before ') > text.lastIndexOf('resumed at ');

// One reading -> {why: [reasons to end the run], state} (state carries the pause bookkeeping between readings).
// `pause`, in pause-aware mode: {paused, beatAgeS, holding}.
export function judge({o, mode, inHold = false, pause = null, state = {absent: 0, pauseSeenAt: null}, now = Date.now()}) {
  const why = SYSTEM_PROMPTS.includes(o.front) ? [`${o.front} in front`] : [];
  const working = [o.busy && 'runner busy', o.workers > 0 && `${o.workers} Runner.Worker`, !inHold && o.queued > 0 && `${o.queued} queued macOS job(s)`].filter(Boolean);
  const next = {...state};
  if (mode === 'kill') why.push(...working);
  else if (mode === 'pause-aware') {
    if ((working.length || pause.paused) && pause.beatAgeS > STALE_BEAT_S) why.push(`pause heartbeat ${Math.round(pause.beatAgeS)} s old`);
    if (working.length && !pause.paused) { if (++next.absent >= 2) why.push(`no pause file on two readings while ${working.join(', ')}`); } else next.absent = 0;
    if (pause.paused) {
      next.pauseSeenAt ??= now;
      if (now - next.pauseSeenAt > HELD_AFTER_MS && !pause.holding) why.push('a cell still running 60 s after the pause began');
    } else next.pauseSeenAt = null;
  }
  return {why, working, state: next};
}

// The watch loop. Boundaries (`observe`, `alive`, `endTree`, `sleep`, `pauseState`, `inHold`) are injected for tests.
export async function watch({root, mode = 'kill', log, observe: read, alive, endTree, sleep, pauseState = () => null, inHold = () => false, everyMs = 30_000, now = Date.now}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}; modes: ${MODES.join(', ')}`);
  log(`started for pid ${root} (mode ${mode})`);
  let state;
  while (alive(root)) {
    let o;
    try { o = read(); } catch (error) {
      log(`unread observation (${error instanceof Unread ? 'unread' : 'error'}: ${error.message}); next reading in ${everyMs / 1000} s`);
      await sleep(everyMs);
      continue;
    }
    const pause = mode === 'pause-aware' ? pauseState() : null;
    const r = judge({o, mode, inHold: inHold(), pause, state, now: now()});
    state = r.state;
    if (pause && !r.why.length && (r.working.length || pause.paused)) log(`runner ${r.working.join(', ') || 'idle'}; pause ${pause.paused ? 'on' : 'off'}, heartbeat ${Math.round(pause.beatAgeS)} s, holding at a boundary ${pause.holding}`);
    for (const w of o.seen ?? []) log(describeWorker(w));
    log(`reading: front=${o.front} busy=${o.busy} workers=${o.workers} queued=${o.queued} load=${o.load} -> ${r.why.length ? 'STOP' : 'idle'}`);
    if (r.why.length) {
      log(`STOP the run: ${r.why.join(', ')} (front=${o.front} busy=${o.busy} workers=${o.workers} queued=${o.queued} load=${o.load})`);
      log(`ended pids ${(await endTree(root)).join(' ')}`);
      return 4;
    }
    await sleep(everyMs);
  }
  log('the run ended on its own; no stop');
  return 0;
}

const isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const children = pid => { try { return execFileSync('pgrep', ['-P', String(pid)], {encoding: 'utf8'}).trim().split('\n').filter(Boolean).map(Number); } catch { return []; } };
const tree = pid => children(pid).filter(c => c !== process.pid).flatMap(c => [...tree(c), c]);
// SIGTERM to the root's local tree (deepest first) and the root, SIGKILL to what is left 5 s later -> the pids.
async function endTree(root) {
  const pids = [...tree(root), root];
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  await new Promise(r => setTimeout(r, 5000));
  for (const pid of pids) if (isAlive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  return pids;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values: v} = parseArgs({options: {root: {type: 'string'}, log: {type: 'string'}, label: {type: 'string', default: 'run'}, mode: {type: 'string', default: 'kill'},
    'pause-file': {type: 'string'}, 'run-log': {type: 'string'}, 'hold-until': {type: 'string'}}});
  const root = Number(v.root);
  if (!Number.isInteger(root) || root <= 1 || !v.log || !MODES.includes(v.mode) || (v.mode === 'pause-aware' && !(v['pause-file'] && v['run-log']))) {
    console.error('usage: mini-watch.mjs --root <pid> --log <file> [--label <text>] [--mode kill|dialog-only|pause-aware] [--pause-file <file> --run-log <file>] [--hold-until <file>]');
    process.exit(2);
  }
  const log = line => { const text = `${new Date().toISOString()} watch ${v.label}: ${line}`; console.log(text); appendFileSync(v.log, text + '\n'); };
  const ageS = file => { try { return (Date.now() - statSync(file).mtimeMs) / 1000; } catch { return Infinity; } };
  const pauseState = () => {
    let holding = false; try { holding = holdingIn(readFileSync(v['run-log'], 'utf8')); } catch {}
    return {paused: existsSync(v['pause-file']), beatAgeS: ageS(heartbeatOf(v['pause-file'])), holding};
  };
  const inHold = () => { if (!v['hold-until']) return false; try { return Date.now() < Date.parse(readFileSync(v['hold-until'], 'utf8').trim()); } catch { return false; } };
  watch({root, mode: v.mode, log, observe: () => observe({exec: liveExec}), alive: isAlive, endTree, sleep: ms => new Promise(r => setTimeout(r, ms)), pauseState, inHold})
    .then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
