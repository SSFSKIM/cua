// The harness's own X tools, and the display they reach (#171 M4, the design session, 2026-11-02: the harness never
// changes a window it did not open). Every tool the harness runs that can change a window, `xdotool` and xprobe's
// commands, connects through `harnessEnv()`: while a Desktop's run is on, the run's own trace (an xtrace proxy that
// `Desktop.begin` starts), so the audit of that trace sees every such request; otherwise the session's display. Only
// observers that read stay off it, for their timing or their volume: the witness, xprobe's RECORD and selection watches,
// `snap` and `imgdiff`, and the read-only `xprop` and `xwininfo`. The engines have their own traced pass. Whatever
// connects directly is still in the run's whole RECORD (`startRunRecord`), which judges every client of the harness's.
//
// Two of xprobe's observers act on the display and are fenced here (T4b's audit round): `retention` redirects its
// window through Composite, which can stop a window from being drawn, so it takes only a window the run opened
// (`retentionTrials`); `grabs` takes the root's pointer and keyboard, so it runs only on a private display the harness
// marked (xprobe refuses any other), and nothing here runs it on the session's.

import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
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
  if (owner.ownerOf(window) !== 'harness') throw new Error(`xprobe retention redirects only a window the harness opened; ${hex(window)} is not one of the run's`);
  const text = run(XPROBE, ['retention', String(window), String(trials), String(spanMs), String(gapMs), dump], { encoding: 'utf8', timeout: 600000 });
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

/**
 * The whole run's RECORD (`xprobe record-run`, foreign.mjs `auditRecord`): every client's requests that can change a
 * window, server-side, each client attributed to the harness (`ours`, its process) or not, on the session's display
 * directly (it only reads). Its lines go to a file of its own. Resolves once recording has begun, with `stop()`, which
 * ends it and answers its text.
 */
export async function startRunRecord({ ours = process.pid, env = process.env, readyMs = 10000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-record-'));
  const file = join(dir, 'record.jsonl');
  const fd = openSync(file, 'w');
  let child;
  try {
    child = spawn(XPROBE, ['record-run', '--ours', String(ours)], { stdio: ['pipe', fd, 'pipe'], env });
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
    stop() {
      stopped ??= (async () => {
        child.stdin.end();
        const timer = setTimeout(() => child.kill('SIGTERM'), 15000);
        await exited;
        clearTimeout(timer);
        const text = read();
        rmSync(dir, { recursive: true, force: true });
        return stderr.trim() && !text.includes('"kind":"end"') ? `${text}\n${JSON.stringify({ kind: 'failed', error: stderr.trim() })}\n` : text;
      })();
      return stopped;
    },
  };
}
