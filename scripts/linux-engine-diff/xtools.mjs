// The harness's own X tools, and the display they reach (#171 M4, the design session, 2026-11-02: the harness never
// changes a window it did not open). Every tool the harness runs that can change a window, `xdotool` and xprobe's
// commands, connects through `harnessEnv()`: while a Desktop's run is on, the run's own trace (an xtrace proxy that
// `Desktop.begin` starts), so the audit of that trace sees every such request; otherwise the session's display. Only
// observers that read stay off it, for their timing or their volume: the witness, xprobe's RECORD and selection watches,
// `snap` and `imgdiff`, and the read-only `xprop` and `xwininfo`. The engines have their own traced pass. Whatever
// connects directly is still in the run's whole RECORD (`startRunRecord`), which judges every client of the harness's.
//
// Two of xprobe's observers act on the display and are fenced here (T4b's audit round): `retention` redirects its
// window through Composite, which can stop a window from being drawn, so it takes only a window the run opened and
// still has open (`retentionTrials`); `grabs` takes the root's pointer and keyboard, so it runs only on a private display the harness
// marked (xprobe refuses any other), and nothing here runs it on the session's.

import './hermetic.mjs';

import { appendFileSync, closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const XPROBE = join(here, 'xprobe', 'target', 'release', 'xprobe');

let traced = null;

/** The run's trace display for the harness's own tools (`env`, from `startProxy`), or `null` for the session's again. */
export function useHarnessDisplay(env) {
  traced = env;
}

/** The environment the harness's own X tools run with. */
export const harnessEnv = () => traced ?? process.env;

export function xdotool(...args) {
  return execFileSync('xdotool', args.map(String), { encoding: 'utf8', timeout: 15000, env: harnessEnv() }).trim();
}

/** `xdotool` as a process of its own (a chain that runs beside a request). */
export function spawnXdotool(args, options = {}) {
  return spawn('xdotool', args.map(String), { ...options, env: harnessEnv() });
}

/** One xprobe command, its stdout as text. */
export function xprobe(args, options = {}) {
  return execFileSync(XPROBE, args.map(String), { encoding: 'utf8', timeout: 15000, ...options, env: harnessEnv() });
}

/** An xprobe command that keeps running (a recorder, the clipboard owner, an overlay). */
export function spawnXprobe(args, options = {}) {
  return spawn(XPROBE, args.map(String), { ...options, env: harnessEnv() });
}

/** The root property that marks a private display the harness started (xprobe clip.rs `PRIVATE_MARK`). */
export const PRIVATE_MARK = 'CUA171_PRIVATE_DISPLAY';

const hex = (id) => `0x${Number(id).toString(16).padStart(8, '0')}`;

/**
 * `xprobe retention`'s trials on a window (it redirects the window through Composite and captures it): only a window
 * `owner` (the run's Desktop) opened, since a redirect of another client's window can stop it from being drawn.
 * Returns the trials' JSON lines.
 */
export function retentionTrials(owner, window, trials, spanMs, gapMs, dump, run = execFileSync) {
  // a window of the run's open now and still the one it opened (scenes.mjs `liveOwned`): a closed one's id may be another's
  if (!owner.liveOwned(window)) throw new Error(`xprobe retention redirects only a window the harness opened and still has open; ${hex(window)} is not one of the run's now`);
  const text = run(XPROBE, ['retention', String(window), String(trials), String(spanMs), String(gapMs), dump], { encoding: 'utf8', timeout: 600000 });
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

/**
 * Whether the display is a private one the harness started: its root carries `PRIVATE_MARK` (a read through
 * `xprop`). Anything else, a failed read included, is not.
 */
export function isPrivateDisplay({ env = process.env, run = execFileSync } = {}) {
  try {
    const text = run('xprop', ['-root', PRIVATE_MARK], { encoding: 'utf8', timeout: 5000, env });
    return new RegExp(`^${PRIVATE_MARK}\\([A-Z_]+\\) = `, 'm').test(text);
  } catch {
    return false;
  }
}

/**
 * Why the whole-run record runs only on a private display (task 41): X.Org 21.1's FlushClient, re-entered by RECORD's
 * flush callback for a recording client that fell behind, either drops recorded bytes or spins for good on a
 * zero-length writev; a lagging record client also grows the server's buffer by gigabytes. It froze the person's `:0`.
 */
export const RECORD_REFUSAL = `the whole-run RECORD runs only on a private display marked ${PRIVATE_MARK}: it can freeze X.Org 21.1 (task 41), so a person's display gets the sampled route audits instead`;

/**
 * The whole run's RECORD (`xprobe record-run`, foreign.mjs `auditRecord`): every client's requests that can change a
 * window, server-side, each client attributed to the harness (`ours`, its process) or not, on the display directly
 * (it only reads). Only on a private display (`RECORD_REFUSAL` on any other, before anything is spawned). Its lines go
 * to a file of its own. `guard(pid)` is handed its client as soon as it is spawned (the run's watchdog, which kills it
 * first on a stall: a display that freezes while the record begins is the record's to let go of, task 44). Resolves
 * once recording has begun, with its `pid` and `stop()`, which ends it and answers its text.
 */
export async function startRunRecord({ ours = process.pid, env = process.env, readyMs = 10000, isPrivate = () => isPrivateDisplay({ env }), spawnRecord = spawn, guard = () => {} } = {}) {
  if (!isPrivate()) throw new Error(RECORD_REFUSAL);
  const dir = mkdtempSync(join(tmpdir(), 'cua171-record-'));
  const file = join(dir, 'record.jsonl');
  const fd = openSync(file, 'w');
  let child;
  try {
    child = spawnRecord(XPROBE, ['record-run', '--ours', String(ours)], { stdio: ['pipe', fd, 'pipe'], env });
  } finally {
    closeSync(fd);
  }
  guard(child.pid);
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const read = () => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const deadline = Date.now() + readyMs;
  while (!read().includes('"kind":"ready"')) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`the run's record did not begin: ${stderr.trim() || 'no ready line'}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  let stopped = null;
  return {
    file,
    pid: child.pid,
    /**
     * Ends the record and answers it: its text, or with `parse` (foreign.mjs `auditRecordFile`'s kind), what
     * `parse(file)` answers, read before the file is removed. A record whose process failed says so in its last line.
     */
    stop({ parse = null } = {}) {
      stopped ??= (async () => {
        child.stdin.end();
        const timer = setTimeout(() => child.kill('SIGTERM'), 15000);
        await exited;
        clearTimeout(timer);
        try {
          if (child.exitCode !== 0 && stderr.trim()) appendFileSync(file, `${JSON.stringify({ kind: 'failed', error: stderr.trim() })}\n`);
          return parse ? await parse(file) : read();
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      })();
      return stopped;
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A file's JSON lines from byte `from` on (an unreadable line kept as such). */
function readLinesFrom(file, from) {
  if (!existsSync(file)) return [];
  return readFileSync(file)
    .subarray(from)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { kind: 'unreadable', text: line };
      }
    });
}

const how = (exit) => (exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code}`);

/** A lost watchdog's default: the alert, then the run stopped as a stall stops it (SIGTERM, which its stop hooks clean up after). */
function lostWatchdog(display, stopPid, reason) {
  process.stderr.write(`cua171 WATCHDOG: the watchdog of the X display ${display} is gone (${reason}), so the display is no longer watched; the run is stopped.\n`);
  try {
    process.kill(stopPid, 'SIGTERM');
  } catch {
    // already ended
  }
}

/** The watchdog's verdict at the run's end: `ended` (clean) only for an exit 0 after its own end line, once asked. */
function watchdogVerdict({ lines, exit, lost, unresponsive }) {
  const end = lines.find((l) => l.kind === 'end');
  const stall = lines.find((l) => l.kind === 'stall');
  const verdict = (state, reason) => ({ state, clean: state === 'ended', stalled: state === 'stalled', reason, round_trips: (end ?? stall)?.round_trips ?? null, lines });
  if (stall) return verdict('stalled', `the display stopped answering${stall.reason ? ` (${stall.reason})` : ''}`);
  if (lost) return verdict('lost', lost);
  if (unresponsive) return verdict('failed', 'it did not end when asked, and was killed');
  if (exit.error) return verdict('failed', `it could not run (${exit.error.message})`);
  if (exit.code !== 0) return verdict('failed', `it ended with ${how(exit)}`);
  if (!end) return verdict('failed', 'it ended without its end line');
  return verdict('ended', null);
}

/**
 * The run's watchdog (`xprobe watchdog`, task 41), on every display, the person's `:0` included: a GetInputFocus
 * round trip every `intervalMs` from a connection of its own. When one goes unanswered for `boundMs` it kills every
 * guarded process first (`guard(pid)`: the whole-run record client, a private server), sends SIGTERM to `stopPid` (this
 * run), writes a `stall` line to `file` and an alert naming the display on stderr, then sends SIGKILL to the run once
 * `graceMs` has passed, and exits 3. It runs apart from this process, in a process group of its own, so a run blocked
 * in a synchronous X call is stopped all the same, and a ^C to the run's group leaves it guarding the run's cleanup.
 *
 * Resolves once its own first round trip answered (task 44: a `ready` line with its pid, written after its spawn,
 * since `file` may hold an earlier run's lines); fails, the watchdog ended, on a spawn that fails, a display that does
 * not answer (its stall before the first answer) or no answer within `readyMs`. A watchdog that ends after that, before
 * the run asked it to, leaves the display unwatched: `onLost(reason)` runs, by default an alert and SIGTERM to
 * `stopPid`, as a stall stops the run. Answers `{guard(pid), stop()}`. `stop()` ends it and answers its verdict,
 * `{state, clean, stalled, reason, round_trips, lines}`: `ended` (clean: exit 0 after its end line), `stalled`, `lost`
 * or `failed`. A stall's escalation is never cut short: once a stall line is out, `stop()` answers at once and leaves
 * the watchdog to end the run's processes.
 */
export async function startRunWatchdog({ display = process.env.DISPLAY, env = process.env, stopPid = process.pid, intervalMs = 2000, boundMs = 5000, graceMs = 20000, file, readyMs = 15000, spawnWatchdog = spawn, onLost = (reason) => lostWatchdog(display, stopPid, reason) } = {}) {
  // this invocation's lines only: what the file held before the spawn is an earlier run's
  const from = existsSync(file) ? statSync(file).size : 0;
  const fd = openSync(file, 'a');
  let child;
  try {
    const args = ['watchdog', '--display', display, '--interval-ms', intervalMs, '--bound-ms', boundMs, '--grace-ms', graceMs, '--stop', stopPid].map(String);
    child = spawnWatchdog(XPROBE, args, { stdio: ['pipe', fd, 'inherit'], env, detached: true });
  } finally {
    closeSync(fd);
  }
  const lines = () => readLinesFrom(file, from);
  const stalled = () => lines().some((l) => l.kind === 'stall');
  let ready = false;
  let asked = false;
  let lost = null;
  const exit = { done: false, code: null, signal: null, error: null };
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      Object.assign(exit, { done: true, code, signal });
      resolve();
      // a stall stopped the run itself; any other end before the run asked for it leaves the display unwatched
      if (ready && !asked && !stalled()) {
        lost = `it ended before the run did (${how(exit)})`;
        onLost(lost);
      }
    });
    child.once('error', (error) => {
      Object.assign(exit, { done: true, error });
      resolve();
    });
  });
  // a watchdog that has ended takes no more lines; its stall already killed what it guarded
  child.stdin.on('error', () => {});
  const deadline = Date.now() + readyMs;
  for (;;) {
    if (exit.error) throw new Error(`the run's watchdog did not start (${exit.error.message}), so nothing is run on ${display}`);
    if (Number.isSafeInteger(child.pid) && lines().some((l) => l.kind === 'ready' && l.pid === child.pid)) break;
    if (exit.done || Date.now() > deadline) {
      child.kill('SIGKILL');
      const last = lines().at(-1);
      throw new Error(`the run's display ${display} did not answer the watchdog's first round trip in ${readyMs} ms${last ? ` (${JSON.stringify(last)})` : exit.done ? ` (the watchdog ended with ${how(exit)})` : ''}, so nothing is run on it`);
    }
    await sleep(20);
  }
  ready = true;
  let stopping = null;
  return {
    file,
    guard(pid) {
      if (Number.isSafeInteger(pid) && pid > 0 && !exit.done) child.stdin.write(`guard ${pid}\n`);
    },
    stop() {
      stopping ??= (async () => {
        asked = true;
        if (!exit.done) child.stdin.end();
        // it ends within a round trip and its bound; one escalating a stall is left to end the run's processes
        const until = Date.now() + intervalMs + boundMs + 5000;
        let unresponsive = false;
        while (!exit.done && !stalled()) {
          if (Date.now() > until) {
            unresponsive = true;
            child.kill('SIGKILL');
            await exited;
            break;
          }
          await Promise.race([exited, sleep(50)]);
        }
        return watchdogVerdict({ lines: lines(), exit, lost, unresponsive });
      })();
      return stopping;
    },
  };
}

/**
 * A private X server of the harness's own, and the harness's one way to start one (task 44): `Xvfb -displayfd`, so the
 * display is the server's choice and never one another server has; `-noreset`, so it keeps its mark and its keymap
 * when its last client leaves; its output not piped, since a full pipe would stall the keymap compiler and with it the
 * server. It is watched from its first client on: the watchdog answers before anything probes or drives it, and
 * guards the server itself, so a stall kills it with the run. Then it is marked private (`PRIVATE_MARK`). A server
 * that fails to start, or whose watchdog does not answer, is ended, and nothing runs on it. Answers `{display, pid,
 * stop()}`: `stop()` ends the watchdog first (a server ending under it would read as a stall), then the server, and
 * answers the watchdog's verdict (`startRunWatchdog`).
 */
export async function startPrivateServer({ out, startWatchdog = startRunWatchdog, run = execFileSync } = {}) {
  const child = spawn('Xvfb', ['-displayfd', '3', '-noreset', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  const ended = new Promise((resolve) => child.once('exit', resolve));
  const end = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await ended;
  };
  const display = await new Promise((resolve, reject) => {
    let text = '';
    child.stdio[3].on('data', (chunk) => {
      text += chunk;
      const [first, ...rest] = text.split('\n');
      if (!rest.length) return;
      if (/^\d+$/.test(first.trim())) resolve(`:${first.trim()}`);
      else reject(new Error(`Xvfb named no display (${JSON.stringify(first)})`));
    });
    child.once('exit', (code, signal) => reject(new Error(`Xvfb exited (${signal ?? code}) before it named its display`)));
    child.once('error', (error) => reject(new Error(`Xvfb did not start (${error.message})`)));
  }).catch(async (error) => {
    if (!child.pid) throw error;
    await end();
    throw error;
  });
  let watchdog = null;
  try {
    watchdog = await startWatchdog({ display, file: join(out, 'watchdog.jsonl') });
    watchdog.guard(child.pid);
    // marked private: the one kind of display where xprobe's `grabs` may take the pointer and the keyboard
    run('xprop', ['-root', '-f', PRIVATE_MARK, '8s', '-set', PRIVATE_MARK, '1'], { env: { ...process.env, DISPLAY: display }, timeout: 15000 });
  } catch (error) {
    await watchdog?.stop();
    await end();
    throw error;
  }
  return {
    display,
    pid: child.pid,
    async stop() {
      const verdict = await watchdog.stop();
      await end();
      return verdict;
    },
  };
}

