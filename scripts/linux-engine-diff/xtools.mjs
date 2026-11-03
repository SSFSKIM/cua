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

import { appendFileSync, closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
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
 * to a file of its own. Resolves once recording has begun, with its `pid` and `stop()`, which ends it and answers its
 * text.
 */
export async function startRunRecord({ ours = process.pid, env = process.env, readyMs = 10000, isPrivate = () => isPrivateDisplay({ env }), spawnRecord = spawn } = {}) {
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

/**
 * The run's watchdog (`xprobe watchdog`, task 41), on every display, the person's `:0` included: a GetInputFocus
 * round trip every `intervalMs` from a connection of its own. When one goes unanswered for `boundMs` it kills every
 * guarded process first (`guard(pid)`: the whole-run record client), sends SIGTERM to `stopPid` (this run) and SIGKILL
 * after `graceMs`, writes a `stall` line to `file`, prints an alert naming the display on stderr, and exits 3. It
 * runs apart from this process, so a run blocked in a synchronous X call is stopped all the same. Resolves once its
 * first round trip answered, with `guard(pid)` and `stop()`, which ends it and answers `{stalled, lines}`.
 */
export async function startRunWatchdog({ display = process.env.DISPLAY, env = process.env, stopPid = process.pid, intervalMs = 2000, boundMs = 5000, graceMs = 20000, file, readyMs = 15000, spawnWatchdog = spawn } = {}) {
  const fd = openSync(file, 'a');
  let child;
  try {
    const args = ['watchdog', '--display', display, '--interval-ms', intervalMs, '--bound-ms', boundMs, '--grace-ms', graceMs, '--stop', stopPid].map(String);
    child = spawnWatchdog(XPROBE, args, { stdio: ['pipe', fd, 'inherit'], env });
  } finally {
    closeSync(fd);
  }
  let failed = null;
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', (error) => {
      failed = error;
      resolve(null);
    });
  });
  // a watchdog that has ended takes no more lines; its stall already killed what it guarded
  child.stdin.on('error', () => {});
  const lines = () =>
    (existsSync(file) ? readFileSync(file, 'utf8') : '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { kind: 'unreadable', text: line };
        }
      });
  const deadline = Date.now() + readyMs;
  while (!lines().some((l) => l.kind === 'ready')) {
    if (failed || child.exitCode !== null || Date.now() > deadline) {
      child.kill('SIGKILL');
      const last = lines().at(-1);
      throw new Error(`the run's display ${display} did not answer the watchdog's first round trip in ${readyMs} ms${failed ? ` (${failed.message})` : last ? ` (${JSON.stringify(last)})` : ''}, so nothing is run on it`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  let stopping = null;
  return {
    file,
    guard(pid) {
      if (Number.isSafeInteger(pid) && pid > 0 && child.exitCode === null) child.stdin.write(`guard ${pid}\n`);
    },
    stop() {
      stopping ??= (async () => {
        if (child.exitCode === null) child.stdin.end();
        const timer = setTimeout(() => child.kill('SIGTERM'), intervalMs + boundMs + 5000);
        await exited;
        clearTimeout(timer);
        const all = lines();
        return { stalled: all.some((l) => l.kind === 'stall'), lines: all };
      })();
      return stopping;
    },
  };
}
