// The native matrix's steps (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system parts 4
// to 6): what every section of a run (./run.mjs; the probe cells, ./probe-run.mjs; the Korean and Unicode matrix,
// ./unicode-run.mjs) does on the device and the lane, each keeping its device-clock window so the activation watcher's
// events are accounted for (./oracle.mjs accountActivations). `ctx` is the run's (./run.mjs runOnce): {ops, run, rows,
// problems, meta, samples, n, engine, records, lane, checkpoint, log, now, sleep, watcher, windows, judged, posted}.
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';
import {guardOf, SCENES} from '../repl-parity/scenes-mac.mjs';
import {COMPOSITION_QUIET_MS} from './live-device.mjs';
import {caseCells, requeryCell} from './matrix-cells.mjs';
import {userWindowOf} from './oracle.mjs';
import {caseId, SCENE_OF} from './plan.mjs';

// The acts that may paste (type_text's paste route included): each sent only between two alert checks.
export const PASTING = Object.freeze(['paste', 'typeText']);

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
// the run untouched; only its sanitized export is kept. The engine under test's own windows (its roots) are not alerts.
export function alertCheck(ctx, when) {
  const roots = [['--approved-runtime', ctx.approvedRuntime], ['--approved-engine', ctx.approvedEngine]].filter(([, root]) => root).flat();
  const check = ctx.ops.matrix(['alerts', 'check', '--run', ctx.run, ...roots]);
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


// A matrix-device command that changes nothing on screen (the scheduled probes, the input source), its window the
// harness's, intending no activation. -> the command's answer.
export function device(ctx, args) {
  const {answer, at} = ctx.ops.matrix([...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.slice(0, 2).join(':'), at, []);
  return answer;
}

// The engine's intervention debounce after a probe's keys into a scene (the keys are a user's to the engine; ./live-
// device.mjs COMPOSITION_QUIET_MS): the run records when the probe was known done (`ctx.posted[scene]`, the controller's
// clock), and before it drives that scene again it waits the debounce out (waitQuiet) and observes the scene once, which
// clears the re-query flag (quiet). Without it the run's own next step would be refused as the user's intervention.
export async function waitQuiet(ctx, scene) {
  const at = ctx.posted[scene];
  if (at === undefined) return;
  const wait = at + COMPOSITION_QUIET_MS - ctx.now();
  if (wait > 0) await ctx.sleep(wait);
}
export async function quiet(ctx, scene) {
  if (ctx.posted[scene] === undefined) return;
  await waitQuiet(ctx, scene);
  const observed = await js(ctx, 'harness', `requery:${scene}`, requeryCell(scene));
  if (!observed.ok) throw new Stop(`${scene} could not be observed after the probe's keys (${observed.error}): its re-query flag stays set`);
  delete ctx.posted[scene];
}

// ---- a case's row ----------------------------------------------------------------------------------------------------

// One case: prepare, act (one facade call), check; in the background regime the oracle's readings around the act, each
// with the watcher alive. A method row by default; the Unicode matrix's rows name their own section and id (`extra`
// kept on the row). The row's window runs from its prepare's start to its check's end; the activations in it are
// the row's (the frontmost regime records their count, the background regime's oracle judges them).
export async function caseRow(ctx, target, regime, c, {user = null, userWindow = null, speed = false, section = 'method', id = null, userValue = null, extra = {}} = {}) {
  await ctx.checkpoint();
  const scene = SCENE_OF[target];
  const key = `row:${ctx.rows.length}`;
  const row = {section, id: id ?? caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene, target, regime, method: c.method, case: c.case, expect: c.expect,
    ...(user ? {user} : {}), ...extra};
  const cells = caseCells(target, c);
  let from = null, to = null;
  const span = r => { from ??= r?.at?.[0] ?? null; to = r?.at?.[1] ?? to; return r; };
  const done = extra => { if (from !== null) mark(ctx, 'row', key, [from, to]); return push(ctx, {...row, ...extra}); };
  const prepared = span(await ctx.lane.js(cells.prepare));
  if (!prepared.ok) return done({invalid: 'the prepare cell failed', error: prepared.error});
  if (!prepared.value?.ready) return done({invalid: `not prepared: ${prepared.value?.reason ?? 'no reason'}`});
  let before = null;
  if (regime === 'background') {
    before = await userFront(ctx, user, userWindow);
    if (!before) return done({invalid: 'the user window was not in front before the action'});
    if (before.watcher !== true) return done({invalid: 'the activation watcher was not running before the action'});
  }
  if (PASTING.includes(c.method)) alertCheck(ctx, `before ${row.id}`);
  const act = span(c.keys ? await sendKeys(ctx, cells.act, c.keys, {scene, front: before, userWindow, kind: 'row', key}) : await ctx.lane.js(cells.act));
  if (act === null) return done({invalid: 'the key guard did not send the action\'s keys'});
  if (PASTING.includes(c.method)) alertCheck(ctx, `after ${row.id}`);
  if (!act.ok) return done({invalid: 'the act cell failed', error: act.error});
  Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route});
  const after = regime === 'background' ? read(ctx, focusOf(userWindow)) : null;
  const check = span(await ctx.lane.js(cells.check));
  if (!check.ok) return done({invalid: 'the check cell failed', error: check.error});
  if (check.value?.invalid) return done({invalid: check.value.invalid});
  if (after && after.watcher !== true) return done({invalid: 'the activation watcher was not running after the action'});
  // With `userValue`, the user window's field must also have kept that value (the focus probe's hash after the act).
  const kept = userValue === null ? null : after?.focus?.named === true && after.focus.valueHash === userValue;
  const pushed = done({ok: check.value?.ok === true && kept !== false, outcome: {...(check.value?.outcome ?? {}), ...(kept === null ? {} : {userKept: kept})}});
  ctx.judged.set(key, {row: pushed, oracle: regime === 'background'
    ? {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: act.route, scene, userPid: userWindow.pid} : null});
  if (speed) push(ctx, {section: 'speed', id: `${scene}/method.${target === 'openPanel' ? 'panel.' : ''}${c.method}.${c.case}`, engine: ctx.engine, sample: ctx.n, ok: true, inCellMs: act.value.actMs, wallMs: act.wallMs});
  return pushed;
}
