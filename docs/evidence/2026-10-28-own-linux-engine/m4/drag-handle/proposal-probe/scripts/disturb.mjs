// Task 73's probe only: a drag_handle's requests with a disturbance between its start and its first move (patch-harness.mjs).
import { appendFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const MODE = process.env.T73_DISTURB ?? 'none';
const LANES = (process.env.T73_DISTURB_LANES ?? '').split(',').filter(Boolean);
const GAP_MS = Number(process.env.T73_GAP_MS ?? 2000);
const LOG = process.env.T73_LOG;
const XPROBE = process.env.T73_XPROBE;
const XGRAB = process.env.T73_XGRAB;
const log = (row) => LOG && appendFileSync(LOG, `${JSON.stringify({ wall: Date.now(), ...row })}\n`);
const pointer = () => {
  const out = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' });
  const get = (k) => Number(out.match(new RegExp(`^${k}=(-?\\d+)`, 'm'))[1]);
  return { x: get('X'), y: get('Y'), window: get('WINDOW') };
};

/** A foreign client's pointer grab, resolved once it holds (`{child, released}`). */
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

export async function disturbedHandle(engine, steps, { gapMs, lane, kind, i, sleep }) {
  const disturbed = LANES.includes(lane) ? MODE : 'none';
  let ms = 0;
  let grab = null;
  for (const [k, step] of steps.entries()) {
    if (k > 0 && gapMs > 0) await sleep(gapMs);
    if (k === 0 && disturbed === 'grab') grab = await holdGrab(150);
    log({ lane, kind, i, step: step.action, k, disturbed, phase: 'send' });
    const value = await engine.request('drag_handle', step);
    ms += value.ms;
    log({ lane, kind, i, step: step.action, k, ok: value.response.ok, error: value.response.ok ? undefined : String(value.response.error).slice(0, 200), phase: 'answer' });
    if (!value.response.ok) {
      if (k > 0 && step.action !== 'end') await engine.request('drag_handle', { action: 'end' });
      if (grab) await grab.released;
      return { response: value.response, ms };
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
  }
  return { response: { ok: true }, ms };
}
