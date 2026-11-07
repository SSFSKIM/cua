// The clipboard and desktop checks of M2's text cases (Design, Verification system: "Clipboard preservation is checked
// apart from the witness"), through the harness's own X client (`xprobe clip-own`, `clip-read`, `request-watch`,
// `within`): an owner of CLIPBOARD the harness controls, so a paste's prior clipboard is the harness's own known text;
// a reader that reads CLIPBOARD with a real timestamp; whether a grab is left in force; whether a window lies inside
// another; and the window manager's stacking order.

import { xExecFileSync, xSpawn } from './xspawn.mjs';
import { createInterface } from 'node:readline';

import { XPROBE, spawnXprobe, xprobe } from './xtools.mjs';

/** CLIPBOARD's current text: `{ok, owner, text}`, or `{ok: false, why}`. */
export function clipRead() {
  return JSON.parse(xprobe(['clip-read'], { timeout: 10000 }).trim());
}

/**
 * The clipboard's and the active window's readers kept running (`xprobe reader`), so a read starts the moment it is
 * asked for, with no process to start (the settle experiment's readers, action-settle.mjs). Resolves once connected,
 * with `clip()` (CLIPBOARD's text, as `clipRead` answers it), `active()` (the root's `_NET_ACTIVE_WINDOW`, 0 when unset)
 * and `close()`. Reads are answered in order; each is bounded.
 */
export async function startReader({ readyMs = 5000, readMs = 5000 } = {}) {
  const child = spawnXprobe(['reader'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = [];
  let ready;
  let failed = null;
  const began = new Promise((resolve, reject) => {
    ready = resolve;
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`xprobe reader exited (${code}) before it was ready`)));
  });
  child.once('exit', (code, signal) => {
    failed = new Error(`xprobe reader ended (${code ?? signal})`);
    for (const w of waiting.splice(0)) w.reject(failed);
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    let answer;
    try {
      answer = JSON.parse(line);
    } catch {
      return;
    }
    if (answer.ready) return ready();
    waiting.shift()?.resolve(answer);
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), readyMs);
  try {
    await began;
  } finally {
    clearTimeout(timer);
  }
  const ask = (command) => {
    if (failed) return Promise.reject(failed);
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      waiting.push(w);
      child.stdin.write(`${command}\n`);
      setTimeout(() => {
        const i = waiting.indexOf(w);
        if (i >= 0) {
          // a late answer would be taken for the next read's: the reader is no longer trusted
          failed = new Error(`xprobe reader gave no answer to ${command} within ${readMs} ms`);
          child.kill('SIGKILL');
          reject(failed);
        }
      }, readMs).unref();
    }).then((answer) => {
      if (answer.error) throw new Error(answer.error);
      return answer;
    });
  };
  return {
    clip: () => ask('clip'),
    active: async () => (await ask('active')).active,
    close() {
      child.stdin.end();
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    },
  };
}

/**
 * A watch of every client's pointer and keyboard grabs (`xprobe request-watch`, through RECORD, which only reads: T4b's
 * audit round replaced `xprobe grabs`, which took the root's pointer and keyboard for a moment to ask, so on a person's
 * display it took their input). Resolves once recording has begun, with `stop()`, which ends the watch and answers its
 * lines, and `kill()` for a cleanup that does not wait.
 */
export async function watchGrabs({ readyMs = 5000 } = {}) {
  const child = xSpawn(XPROBE, ['request-watch'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = [];
  let ready;
  const began = new Promise((resolve, reject) => {
    ready = resolve;
    child.once('exit', (code) => reject(new Error(`xprobe request-watch exited (${code}) before it began`)));
    child.once('error', reject);
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const r = JSON.parse(line);
      if (r.ready) ready();
      else lines.push(r);
    } catch {
      // not a record
    }
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const timer = setTimeout(() => child.kill('SIGKILL'), readyMs);
  try {
    await began;
  } finally {
    clearTimeout(timer);
  }
  return {
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.stdin.end();
        const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(kill);
      }
      if (child.exitCode !== 0) throw new Error(`xprobe request-watch ended with ${child.exitCode ?? child.signalCode}, so its record of grabs is incomplete`);
      return lines;
    },
    kill() {
      child.kill('SIGKILL');
    },
  };
}

/** An XInput 2 device's grab by the device: the master pointer (2) and keyboard (3) by name. */
const DEVICE = { 2: 'pointer', 3: 'keyboard' };

/**
 * The grabs a request watch's lines show (`watchGrabs`): `granted`, each grab the server granted, and `pointer` and
 * `keyboard`, `grabbed` while one is still in force at the watch's end, else `free`. A grab is in force from its
 * granted reply until its client's ungrab of that kind (an XInput 2 grab, of that device). A grab that ended with its
 * client or its window shows no ungrab and counts as held: the judgement fails closed. `held` lists what is in force.
 */
export function grabsIn(lines) {
  const pending = new Map();
  const held = new Map();
  const granted = [];
  const kindOf = (r) => (r.kind === 'xi_grab_device' || r.kind === 'xi_ungrab_device' ? (DEVICE[r.device] ?? `device ${r.device}`) : r.kind.includes('pointer') ? 'pointer' : 'keyboard');
  for (const r of lines) {
    if (r.kind === 'grab_pointer' || r.kind === 'grab_keyboard' || r.kind === 'xi_grab_device') {
      if (!pending.has(r.client)) pending.set(r.client, []);
      pending.get(r.client).push(kindOf(r));
    } else if (r.kind.endsWith('_reply') && r.kind !== 'unmatched_reply') {
      const kind = pending.get(r.client)?.shift();
      if (kind !== undefined && r.status === 0) {
        held.set(`${r.client}|${kind}`, { client: r.client, kind });
        granted.push({ client: r.client, kind, wall_ms: r.wall_ms });
      }
    } else if (r.kind === 'ungrab_pointer' || r.kind === 'ungrab_keyboard' || r.kind === 'xi_ungrab_device') {
      held.delete(`${r.client}|${kindOf(r)}`);
    }
  }
  const inForce = [...held.values()];
  const state = (kind) => (inForce.some((g) => g.kind === kind || !Object.values(DEVICE).includes(g.kind)) ? 'grabbed' : 'free');
  return { pointer: state('pointer'), keyboard: state('keyboard'), held: inForce, granted };
}

/** Whether X window `window` is `ancestor` or lies inside it. */
export function within(window, ancestor) {
  return JSON.parse(xprobe(['within', window, ancestor], { timeout: 10000 }).trim()).within;
}

/** The root child X window `window` lies in: a managed client's window manager frame (`xprobe toplevel`). */
export function toplevel(window) {
  return JSON.parse(xprobe(['toplevel', window], { timeout: 10000 }).trim()).toplevel;
}

/**
 * cua's display-wide unconfirmed-paste window (`CUA_CLIPBOARD_QUARANTINE`, Decision Log, M2 whole-branch review):
 * `{open, remaining_ms, client}`, read as the engine reads it.
 */
export function quarantine() {
  return JSON.parse(xprobe(['quarantine'], { timeout: 10000 }).trim());
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
  const text = xExecFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING'], { encoding: 'utf8' });
  return [...text.matchAll(/0x[0-9a-f]+/gi)].map((m) => Number.parseInt(m[0], 16));
}

/**
 * An owner of CLIPBOARD serving `text`. `lines` collects its reports; `waitFor(pred)` resolves with the first report
 * that matches, `send(line)` writes a command (`arm`, `go`, `retake <ms> <text>`), `stop()` ends it.
 */
export async function startOwner(text) {
  const child = spawnXprobe(['clip-own', text], { stdio: ['pipe', 'pipe', 'inherit'] });
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
  const child = spawnXprobe(['overlay', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
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
