// The clipboard and desktop checks of M2's text cases (Design, Verification system: "Clipboard preservation is checked
// apart from the witness"), through the harness's own X client (`xprobe clip-own`, `clip-read`, `grabs`, `within`):
// an owner of CLIPBOARD the harness controls, so a paste's prior clipboard is the harness's own known text; a reader
// that reads CLIPBOARD with a real timestamp; whether a grab is left in force; whether a window lies inside another;
// and the window manager's stacking order.

import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { XPROBE } from './scenes.mjs';

/** CLIPBOARD's current text: `{ok, owner, text}`, or `{ok: false, why}`. */
export function clipRead() {
  return JSON.parse(execFileSync(XPROBE, ['clip-read'], { encoding: 'utf8', timeout: 10000 }).trim());
}

/** Whether a pointer or keyboard grab is in force: `{pointer, keyboard}`, each `free` or `grabbed` (or why not). */
export function grabs() {
  return JSON.parse(execFileSync(XPROBE, ['grabs'], { encoding: 'utf8', timeout: 10000 }).trim());
}

/** Whether X window `window` is `ancestor` or lies inside it. */
export function within(window, ancestor) {
  return JSON.parse(execFileSync(XPROBE, ['within', String(window), String(ancestor)], { encoding: 'utf8', timeout: 10000 }).trim()).within;
}

/** The root child X window `window` lies in: a managed client's window manager frame (`xprobe toplevel`). */
export function toplevel(window) {
  return JSON.parse(execFileSync(XPROBE, ['toplevel', String(window)], { encoding: 'utf8', timeout: 10000 }).trim()).toplevel;
}

/**
 * cua's display-wide unconfirmed-paste window (`CUA_CLIPBOARD_QUARANTINE`, Decision Log, M2 whole-branch review):
 * `{open, remaining_ms, client}`, read as the engine reads it.
 */
export function quarantine() {
  return JSON.parse(execFileSync(XPROBE, ['quarantine'], { encoding: 'utf8', timeout: 10000 }).trim());
}

/**
 * Waits until the display-wide window has closed, never removing it: an unconfirmed paste's target may still convert
 * until the window ends, and every cua engine refuses text requests meanwhile. A window still open after `maxMs` (more
 * than the longest one, 10 s) is an error. Returns `{waited_ms, reads}`.
 */
export async function waitQuarantineOver({ read = quarantine, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxMs = 12_000 } = {}) {
  let waited = 0;
  for (let reads = 1; ; reads++) {
    const window = read();
    if (!window.open) return { waited_ms: waited, reads };
    const step = window.remaining_ms + 50;
    if (waited + step > maxMs) throw new Error(`the display's unconfirmed-paste window is still open after ${waited} ms (${window.remaining_ms} ms left)`);
    await sleep(step);
    waited += step;
  }
}

/** The window manager's stacking order, bottom first (`_NET_CLIENT_LIST_STACKING`). */
export function stacking() {
  const text = execFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING'], { encoding: 'utf8' });
  return [...text.matchAll(/0x[0-9a-f]+/gi)].map((m) => Number.parseInt(m[0], 16));
}

/**
 * An owner of CLIPBOARD serving `text`. `lines` collects its reports; `waitFor(pred)` resolves with the first report
 * that matches, `send(line)` writes a command (`arm`, `go`, `retake <ms> <text>`), `stop()` ends it.
 */
export async function startOwner(text) {
  const child = spawn(XPROBE, ['clip-own', text], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  const waiters = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    const report = JSON.parse(line);
    lines.push(report);
    for (const w of [...waiters]) {
      if (w.pred(report)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(report);
      }
    }
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const owner = {
    text,
    lines,
    waitFor(pred, ms = 5000) {
      const seen = lines.find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(new Error(`the clipboard owner reported nothing matching within ${ms} ms: ${JSON.stringify(lines.slice(-3))}`));
          }
        }, ms);
      });
    },
    send(line) {
      child.stdin.write(`${line}\n`);
    },
    async stop() {
      if (child.exitCode === null) child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(timer);
    },
  };
  try {
    await owner.waitFor((r) => 'owned' in r);
  } catch (error) {
    // an owner that never took CLIPBOARD is not left running
    await owner.stop();
    throw error;
  }
  return owner;
}

/**
 * A running `xprobe overlay <args>` (an override-redirect window of the harness's own, until `stop()`): `id`, and
 * `cross(window)`, which moves it above `window` and back below it under one server grab and resolves once done.
 */
export async function startOverlay(args) {
  const child = spawn(XPROBE, ['overlay', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  lines.on('line', (line) => waiting.shift()?.(JSON.parse(line)));
  const next = () => new Promise((resolve, reject) => {
    waiting.push(resolve);
    child.once('exit', () => reject(new Error(`xprobe overlay ${args.join(' ')} exited`)));
  });
  const { overlay: id } = await next();
  return {
    id,
    async cross(window) {
      const done = next();
      child.stdin.write(`cross ${window}\n`);
      await done;
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.stdin.end();
      await exited;
    },
  };
}
