// Task 73's probe (evidence m4/drag-handle/): a drag_handle's requests, in the lanes named by T73_DISTURB_LANES with a
// disturbance (patch-harness.mjs wires it into an exported copy of the harness's drag experiment). Every lane's handle
// is logged step by step to T73_LOG with wall times, each answer and the engine's `--stats` handle record, and after
// its end what it left pending: a read's `notice` on the same engine past the after-release watch's lifetime, cleared by
// an acting request that sends nothing (`preflight`), so the next run's start is not the one refused.
//
//   T73_DISTURB=none
//     | gap     T73_GAP_MS between the start's answer and the first move (an agent's round trip)
//     | popup   another client's 5x5 override-redirect window under the pointer for 5 ms, after the start (task 20's)
//     | nudge   an XTEST nudge 1 px and back, after the start: the handle's own device
//     | grab    another client's active pointer grab held over the start, released after its answer
//     | check   the pre-press try alone (`xgrab check`, the engine's own try) with the pointer parked at the start point,
//               before the start: its status and every crossing it caused in the pointer's window chain
//     | leave   a drop's path back to its first point before the end, so a drag and drop that took ends off the zone
//     | freeze  the run's browser stopped T73_FREEZE_AFTER_MS after the last move's answer and continued T73_FREEZE_MS
//               later, the end sent meanwhile (T13's reproduction of a late take: the renderer's drag start reaching
//               the browser only after the release)
import { appendFileSync, openSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const MODE = process.env.T73_DISTURB ?? 'none';
const LANES = (process.env.T73_DISTURB_LANES ?? '').split(',').filter(Boolean);
const GAP_MS = Number(process.env.T73_GAP_MS ?? 2000);
const FREEZE_AFTER_MS = Number(process.env.T73_FREEZE_AFTER_MS ?? 3);
const FREEZE_MS = Number(process.env.T73_FREEZE_MS ?? 80);
/** How long after the end the read looks for what it left pending: past the after-release watch's 300 ms. */
const PENDING_MS = 400;
const LOG = process.env.T73_LOG;
const XPROBE = process.env.T73_XPROBE;
const XGRAB = process.env.T73_XGRAB;
const log = (row) => LOG && appendFileSync(LOG, `${JSON.stringify({ wall: Date.now(), ...row })}\n`);

// T73_CURSORS: the displayed cursor's changes over the whole run (`xgrab cursors`), to that file, for the cursor a drop
// showed at its release (engine `--stats` handle `release_wall_ms`); the watch ends with this process
if (process.env.T73_CURSORS) {
  const watch = spawn(XGRAB, ['cursors'], { stdio: ['pipe', openSync(process.env.T73_CURSORS, 'a'), 'inherit'] });
  process.once('exit', () => watch.stdin.end());
}
const pointer = () => {
  const out = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' });
  const get = (k) => Number(out.match(new RegExp(`^${k}=(-?\\d+)`, 'm'))[1]);
  return { x: get('X'), y: get('Y'), window: get('WINDOW') };
};

/** A foreign client's pointer grab, resolved once it holds (`{status, released}`). */
function holdGrab(ms) {
  const child = spawn(XGRAB, ['hold', String(ms)], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  return new Promise((resolve, reject) => {
    const released = new Promise((r) => child.once('exit', r));
    lines.on('line', (line) => {
      if (line.includes('"grab"')) resolve({ status: JSON.parse(line).grab, released });
    });
    child.once('error', reject);
  });
}

/** The process that owns a window (`_NET_WM_PID`): Chrome's browser process for its window. */
function ownerPid(window) {
  const out = execFileSync('xprop', ['-id', String(window), '_NET_WM_PID'], { encoding: 'utf8' });
  const pid = Number(out.match(/= (\d+)/)?.[1]);
  if (!pid) throw new Error(`no _NET_WM_PID on window ${window}`);
  return pid;
}

export async function disturbedHandle(engine, steps, { gapMs, lane, kind, i, sleep, window }) {
  const disturbed = LANES.includes(lane) ? MODE : 'none';
  const plan = disturbed === 'leave' && kind === 'handle-dnd' ? [...steps.slice(0, -1), { action: 'move_to', x: steps[0].x, y: steps[0].y }, steps.at(-1)] : steps;
  let ms = 0;
  let grab = null;
  let failed = null;
  let frozen = null;
  try {
  for (const [k, step] of plan.entries()) {
    if (k > 0 && gapMs > 0) await sleep(gapMs);
    if (k === 0 && disturbed === 'grab') grab = await holdGrab(150);
    if (k === 0 && disturbed === 'check') {
      execFileSync('xdotool', ['mousemove', String(step.x), String(step.y)]);
      await sleep(50);
      const tried = JSON.parse(execFileSync(XGRAB, ['check'], { encoding: 'utf8' }).trim());
      log({ lane, kind, i, disturbance: 'check', ...tried, phase: 'checked' });
      await sleep(50);
    }
    log({ lane, kind, i, step: step.action, k, disturbed, phase: 'send' });
    const value = await engine.request('drag_handle', step);
    ms += value.ms;
    const ok = value.response.ok === true;
    log({ lane, kind, i, step: step.action, k, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), handle: value.stats?.handle, phase: 'answer' });
    if (frozen) {
      await sleep(FREEZE_MS);
      process.kill(frozen.pid, 'SIGCONT');
      log({ lane, kind, i, disturbance: 'freeze', pid: frozen.pid, stopped_ms: Date.now() - frozen.at, phase: 'continued' });
      frozen = null;
    }
    if (!ok) {
      failed = value.response;
      if (k > 0 && step.action !== 'end') await engine.request('drag_handle', { action: 'end' });
      break;
    }
    if (k === 0) {
      if (disturbed === 'grab') {
        await grab.released;
        log({ lane, kind, i, disturbance: 'grab', status: grab.status, phase: 'released' });
      } else if (disturbed === 'popup') {
        const p = pointer();
        execFileSync(XPROBE, ['popup', String(p.x - 2), String(p.y - 2), '5', '5', '5']);
        log({ lane, kind, i, disturbance: 'popup', at: p, phase: 'done' });
        await sleep(50);
      } else if (disturbed === 'nudge') {
        execFileSync('xdotool', ['mousemove_relative', '--', '1', '0', 'sleep', '0.002', 'mousemove_relative', '--', '-1', '0']);
        log({ lane, kind, i, disturbance: 'nudge', phase: 'done' });
        await sleep(50);
      } else if (disturbed === 'gap') {
        await sleep(GAP_MS);
        log({ lane, kind, i, disturbance: 'gap', ms: GAP_MS, phase: 'done' });
      }
    }
    // the last move answered: the browser stopped before the end goes out
    if (disturbed === 'freeze' && k === plan.length - 2) {
      const pid = ownerPid(window);
      await sleep(FREEZE_AFTER_MS);
      process.kill(pid, 'SIGSTOP');
      frozen = { pid, at: Date.now() };
      log({ lane, kind, i, disturbance: 'freeze', pid, phase: 'stopped' });
    }
  }
  } finally {
    // the browser is never left stopped, whatever happened
    if (frozen) process.kill(frozen.pid, 'SIGCONT');
  }
  if (grab) await grab.released;
  // what the handle left pending, past the after-release watch: an engine without one (the vendor's) answers none
  await sleep(PENDING_MS);
  const read = await engine.request('list_windows', {});
  const notice = read.response.notice ?? null;
  let preflight;
  if (notice !== null) {
    const p = await engine.request('preflight', {});
    preflight = { ok: p.response.ok === true, error: p.response.ok ? undefined : String(p.response.error).slice(0, 300), late_dnd: p.stats?.late_dnd };
  }
  log({ lane, kind, i, notice, preflight, phase: 'after' });
  return { response: failed ?? { ok: true }, ms };
}
