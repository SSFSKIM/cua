// The native matrix's steps (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system parts 4
// to 6): what every section of a run (./run.mjs; the probe cells, ./probe-run.mjs; the Korean and Unicode matrix,
// ./unicode-run.mjs) does on the device and the lane, each keeping its device-clock window so the activation watcher's
// events are accounted for (./oracle.mjs accountActivations). `ctx` is the run's (./run.mjs runOnce): {ops, run, rows,
// problems, meta, samples, n, engine, records, lane, checkpoint, log, now, watcher, windows, judged}.
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';
import {guardOf, SCENES} from '../repl-parity/scenes-mac.mjs';
import {userWindowOf} from './oracle.mjs';

// Stops the run (its put-back runs): something the run must not act past.
export class Stop extends Error {}

export const push = (ctx, row) => { ctx.rows.push(row); return row; };
// A step's device-clock window; a harness step names the apps it intends to activate (`apps`), the only activations
// it excuses (./oracle.mjs accountActivations).
export const mark = (ctx, kind, key, at, apps = []) => {
  if (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite)) ctx.windows.push({kind, key, at, ...(kind === 'harness' ? {apps} : {})});
};
// A js cell, its device-clock window kept under `kind`.
export async function js(ctx, kind, key, code, {timeoutMs, apps} = {}) {
  const r = await ctx.lane.js(code, timeoutMs);
  mark(ctx, kind, key, r.at, apps);
  return r;
}
export const TEXTEDIT = [SCENES.textedit.bundleId];
// A scenes command through ./matrix-device.mjs step, its window the harness's: `activate` intends its scene's app,
// `down` (of a scene not in front) intends none. -> the command's answer.
export function step(ctx, args) {
  const {answer, at} = ctx.ops.matrix(['step', ...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.join(':'), at, args[0] === 'activate' ? [SCENES[args[1]].bundleId] : []);
  return answer;
}
export const activate = (ctx, scene) => step(ctx, ['activate', scene]);
export const read = (ctx, focus = null) => ctx.ops.matrix(['read', '--run', ctx.run, ...(ctx.watcher !== null ? ['--watcher', String(ctx.watcher)] : []), ...(focus ? ['--focus', focus] : [])]);
export const focusOf = w => `${w.pid},${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`;
export const sameWindow = (a, b) => Boolean(a && b) && a.pid === b.pid && ['x', 'y', 'width', 'height'].every(k => a.bounds[k] === b.bounds[k]);

// The paste rows' system-alert watch (./matrix-device.mjs alerts check, the live paste check's): a possible alert stops
// the run untouched; only its sanitized export is kept.
export function alertCheck(ctx, when) {
  const check = ctx.ops.matrix(['alerts', 'check', '--run', ctx.run]);
  if (check?.abort !== false) {
    ctx.meta.alert = {when, ...(check?.export ?? {})};
    throw new Stop(`a possible system alert appeared ${when}; the run stopped without touching it`);
  }
}

// A key cell sent only under the key guard: the driven scene's process in front, or (given `userWindow`) the run's
// user window. A skip with one of the run's windows in front leaves the row invalid; any other front (the owner at the
// Mac, an alert) stops the run. -> the cell's answer, or null when it was not sent.
export async function sendKeys(ctx, code, keys, {scene, front, userWindow, kind = 'harness', key = `keys:${keys.join('+')}`}) {
  const target = guardOf(scene, ctx.records[scene]);
  const out = await sendIfFrontmost({target, keys, frontmost: () => frontmostFromProbe((front ?? read(ctx)).reading),
    send: () => js(ctx, kind, key, code, {apps: [SCENES[scene].bundleId]}),
    ...(userWindow ? {userWindow} : {})});
  if (out.sent) return out.result;
  const seen = out.skipped.frontmost;
  ctx.meta.keySkipped.push({keys, scene, front: seen === 'unreadable' ? 'unreadable' : {bundleId: seen.bundleId ?? null, owned: seen.owned === true}});
  if (seen === 'unreadable' || seen.owned !== true) throw new Stop(`${keys.join(', ')} not sent: the front is not one of the run's windows (#162); the run stopped`);
  return null;
}

// The user window in front again before an act: read, and once re-activated when it is not. -> the reading or null.
export async function userFront(ctx, user, userWindow) {
  let r = read(ctx);
  if (sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow)) return r;
  activate(ctx, user);
  r = read(ctx);
  return sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow) ? r : null;
}

