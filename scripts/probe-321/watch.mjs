// #321: win.swift's watch and dump for the kits, and the reading of a watch against the engine's hold.
import {spawn, spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function dump(win) {
  const r = spawnSync(win, ['dump'], {encoding: 'utf8', timeout: 10_000});
  try { return JSON.parse(r.stdout); } catch { return {error: (r.stderr || '').slice(0, 300)}; }
}

/// The watch of `pid`'s windows against the cover app's (owner name `cover`): ready once it has sampled, `go()` starts
/// its `ms`, `done()` answers its changes.
export async function watch(win, pid, cover, ms = 3000) {
  const child = spawn(win, ['watch', String(pid), cover, String(ms), '5'], {stdio: ['pipe', 'pipe', 'ignore']});
  child.stdin.on('error', () => {});
  const lines = createInterface({input: child.stdout});
  const queue = [], waiters = [];
  lines.on('line', l => { let v; try { v = JSON.parse(l); } catch { v = {bad: l}; } if (waiters.length) waiters.shift()(v); else queue.push(v); });
  const next = t => Promise.race([queue.length ? Promise.resolve(queue.shift()) : new Promise(r => waiters.push(r)), sleep(t).then(() => ({timeout: true}))]);
  const ready = await next(5000);
  return {ready, go: () => { child.stdin.write('go\n'); return Date.now(); }, done: () => next(ms + 4000).then(v => ({...v, ms})).finally(() => child.kill())};
}

/// A watch read against the click's hold (the delivery record's holdStartedAt and screenHoldMs; no record, no hold):
/// raises inside it (hidden by the screen-update hold) and after it (visible), whether the front app and its key window
/// stayed the cover's throughout.
export function judge(w, delivery, coverBundle, coverName) {
  const changes = w?.changes ?? [];
  const holdStart = delivery?.holdStartedAt, holdEnd = delivery?.holdStartedAt != null ? delivery.holdStartedAt + (delivery.screenHoldMs ?? 0) : null;
  let inside = false, after = false, aboveMs = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c.aboveAny) continue;
    // The span above runs from this change to the next (or the watch's end): visible wherever it lies past the hold.
    const end = changes[i + 1]?.atMs ?? Infinity;
    aboveMs += (Number.isFinite(end) ? end : w.goAt + w.ms) - c.atMs;
    if (holdEnd == null || end > holdEnd) after = true;
    if (holdStart != null && c.atMs < holdEnd) inside = true;
  }
  return {raisedInsideHold: inside, raisedAfterHold: after, aboveMs: Math.round(aboveMs), stuck: changes.length > 0 && changes[changes.length - 1].aboveAny,
    frontHeld: changes.every(c => c.frontmost === coverBundle), keyHeld: changes.every(c => (c.key ?? '').startsWith(`${coverName}:`)),
    keys: [...new Set(changes.map(c => c.key))], fronts: [...new Set(changes.map(c => c.frontmost))]};
}
