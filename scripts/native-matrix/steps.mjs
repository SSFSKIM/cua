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
import {ACCEPTANCE_3, caseId, focusVerdict, isAcceptance3, methodTimingId, SCENE_OF, WINDOWLESS_BUNDLE_ID} from './plan.mjs';
import {probeProblem, WITNESS_FILES, WITNESS_LEAD_MS, WITNESS_PREPARE_CELL, witnessCheckCell} from './probe-plan.mjs';

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
// `down` (of a scene not in front) intends none. An activation's own check (the device's reading of front and key after
// it, ./matrix-device.mjs activationCheck) is the activate step in force (`ctx.activated`, activationOf) for the cells
// that follow, until the next. -> the command's answer.
export function step(ctx, args) {
  const {answer, at, frontKey} = ctx.ops.matrix(['step', ...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.join(':'), at, args[0] === 'activate' ? [SCENES[args[1]].bundleId] : []);
  if (args[0] === 'activate') {
    const app = SCENES[args[1]].bundleId, seen = keyReading({frontKey});
    ctx.activated = {app, front: seen.front === app, key: seen.key === app, seen};
  }
  return answer;
}
export const activate = (ctx, scene) => step(ctx, ['activate', scene]);
// The engine under test's roots, for the device to tell its own windows (./matrix-device.mjs enginePids).
const engineRoots = ctx => [['--approved-runtime', ctx.approvedRuntime], ['--approved-engine', ctx.approvedEngine]].filter(([, root]) => root).flat();
// `electronMode`: the Electron fixture's accessibility mode as its record last showed it, read with the rest
// (./matrix-device.mjs read --electron-mode); `frontKey`: the front and key applications' bundle ids (./front-key.mjs);
// `windowOrder`: every on-screen window front to back (the window-order oracle, #485).
export const read = (ctx, focus = null, {electronMode = false, frontKey = false, windowOrder = false} = {}) => {
  const also = [...(frontKey ? ['front-key'] : []), ...(windowOrder ? ['window-order'] : [])];
  return ctx.ops.matrix(['read', '--run', ctx.run, ...(ctx.watcher !== null ? ['--watcher', String(ctx.watcher)] : []),
    ...(focus ? ['--focus', focus] : []), ...engineRoots(ctx), ...(electronMode ? ['--electron-mode', 'latest'] : []), ...(also.length ? ['--with', also.join(',')] : [])]);
};
export const focusOf = w => `${w.pid},${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`;
export const sameWindow = (a, b) => Boolean(a && b) && a.pid === b.pid && ['x', 'y', 'width', 'height'].every(k => a.bounds[k] === b.bounds[k]);

// The paste rows' system-alert watch (./matrix-device.mjs alerts check, the live paste check's): a possible alert stops
// the run untouched; only its sanitized export is kept. The engine under test's own windows (its roots) are not alerts.
export function alertCheck(ctx, when) {
  const check = ctx.ops.matrix(['alerts', 'check', '--run', ctx.run, ...engineRoots(ctx)]);
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

// The user window in front, and its app key, again before an act: read (front, key and the window order with it), and
// once re-activated when it is not. `rekey` false: a key held elsewhere is read and left (the composing rows', whose user
// window holds a composition an activation could end), so the row's readings say so. -> the reading, `inFront` whether
// the user window was then the front one.
export async function userFront(ctx, user, userWindow, {rekey = true} = {}) {
  const app = SCENES[user].bundleId;
  const inFront = r => sameWindow(userWindowOf(r?.reading, userWindow.pid), userWindow);
  let r = read(ctx, null, {frontKey: true, windowOrder: true});
  if (inFront(r) && (!rekey || r?.frontKey?.key === app)) return {...r, inFront: true};
  activate(ctx, user);
  r = read(ctx, null, {frontKey: true, windowOrder: true});
  return {...r, inFront: inFront(r)};
}

// ---- the readings around a judged act (./front-key.mjs) -------------------------------------------------------------

// The service that serves TextEdit's Open panel out of process: its window is the panel's.
export const PANEL_SERVICE = 'com.apple.appkit.xpc.openAndSavePanelService';
// A target's app (a scene, the Open panel's TextEdit, the windowless app), by bundle id.
export const bundleOf = target => (target === 'windowless' ? WINDOWLESS_BUNDLE_ID : SCENES[SCENE_OF[target] ?? target].bundleId);
// The target's own windows' apps, for the window-order oracle (#485): its app's and, for the Open panel, its service's.
export const targetsOf = target => [bundleOf(target), ...(target === 'openPanel' ? [PANEL_SERVICE] : [])];
// The apps a cell itself puts on screen (./front-key.mjs `apps`): its target's and, behind a user window, the user's.
export const appsOf = (target, user = null) => [...new Set([...targetsOf(target), ...(user ? [SCENES[user].bundleId] : [])])];
// A reading's front and key applications, bundle ids (null when unread).
export const keyReading = r => ({front: r?.frontKey?.front ?? null, key: r?.frontKey?.key ?? null});
export const readKey = ctx => keyReading(read(ctx, null, {frontKey: true}));
// The activate step in force for a cell whose activated app is `app`: the last activation's own check when it was that
// app's, else a check that did not take (nothing activated it since). -> {app, front, key}.
export const activationOf = (ctx, app) => (ctx.activated?.app === app ? {app, front: ctx.activated.front, key: ctx.activated.key} : {app, front: false, key: false});
export const activated = (ctx, app) => { const a = activationOf(ctx, app); return a.front && a.key; };
// The readings of a cell whose act was skipped because its activation did not take: what the check read after the
// activate step, nothing after (./front-key.mjs: `after` null, the cause stays `activation`).
export const skippedReadings = (ctx, apps, app) => ({apps, activate: activationOf(ctx, app), before: ctx.activated?.app === app ? ctx.activated.seen : {front: null, key: null}, after: null});
// The engine's own name for the error an act threw (its result meta's `cua/errorName`, ./lane.mjs engineMetaOf), else
// the name the cell caught (the REPL's plain Error on either engine, or none).
export const errorNameOf = (act, caught = act?.value?.errorName ?? null) => act?.engine?.errorName ?? caught;

// The driven scene front and key before a frontmost act, activated again when it is not: the regime's own activate step
// (rulings 1136 and 1141: "alert up, scene activated first"). Never TextEdit under its Open panel, which an activation
// could bring up over the panel; the panel's own key reads as its service's. -> the reading.
export function drivenFront(ctx, target) {
  const scene = SCENE_OF[target] ?? target, app = SCENES[scene].bundleId;
  const r = read(ctx, null, {frontKey: true});
  if (target === 'openPanel' || (r?.frontKey?.front === app && r?.frontKey?.key === app)) return r;
  activate(ctx, scene);
  return read(ctx, null, {frontKey: true});
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

// The scenes whose rows keep the engine's per-call meta of their prepare, act and check (./lane.mjs engineMetaOf, its
// nulls dropped): the web-shaped ones, whose observations depend on enablement, the web area and the settle.
const DIAGNOSED = Object.freeze(['chrome', 'electron']);
const presentMeta = meta => {
  const kept = Object.entries(meta ?? {}).filter(([, value]) => value !== null);
  return kept.length ? Object.fromEntries(kept) : null;
};

// One case: prepare, act (one facade call), check; the steps its prepare states (`prepared`) and, for a field it needs
// focused, how the focus was read (`focusReadBy`: the observation's meta or the trailer, ./plan.mjs focusVerdict); in the
// background regime the oracle's readings around the act, each with the watcher alive, the window order among them
// (#485). A method row by default; the Unicode matrix's rows name their own section and id (`extra` kept on the row). The
// row's window runs from its prepare's start to its check's end; the activations in it are the row's (the frontmost
// regime records their count, the background regime's oracle judges them). A Chrome or Electron row keeps its three
// calls' engine meta (`engineMeta`); an Electron row records the fixture's accessibility mode (`electronMode` {enabled,
// at}, from the background's after-read, or in the frontmost from a read after the check so the act-to-check timing stays
// the earlier holds') beside the act's device-clock window (`actAt`).
// Every row whose act was sent records its front/key readings (`frontKey`, ./front-key.mjs): the activate step in force
// (the target's in the frontmost regime, activated again when the reading before the act shows it not front and key;
// the user window's in the background regime, likewise), the reading just before the act, and one after its check (and
// after Acceptance 3's keystroke witness, which TextEdit's background click carries). An activation that did not take
// front and key skips the act, its readings saying so. An act that threw records the engine's own error name where its
// meta carries it (errorNameOf).
export async function caseRow(ctx, target, regime, c, {user = null, userWindow = null, speed = false, section = 'method', id = null, userValue = null, extra = {}} = {}) {
  await ctx.checkpoint();
  const scene = SCENE_OF[target];
  if (scene) await quiet(ctx, scene);
  const key = `row:${ctx.rows.length}`;
  const row = {section, id: id ?? caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene, target, regime, method: c.method, case: c.case, expect: c.expect,
    ...(user ? {user} : {}), ...extra};
  const cells = caseCells(target, c);
  const apps = appsOf(target, user), app = SCENES[regime === 'background' ? user : scene].bundleId;
  let from = null, to = null;
  const span = r => { from ??= r?.at?.[0] ?? null; to = r?.at?.[1] ?? to; return r; };
  const done = extra => { if (from !== null) mark(ctx, 'row', key, [from, to]); return push(ctx, {...row, ...extra}); };
  const keep = (phase, r) => {
    const meta = DIAGNOSED.includes(scene) ? presentMeta(r?.engine) : null;
    if (meta) (row.engineMeta ??= {})[phase] = meta;
  };
  const electron = scene === 'electron';
  const prepared = span(await ctx.lane.js(cells.prepare));
  keep('prepare', prepared);
  if (!prepared.ok) return done({invalid: 'the prepare cell failed', error: prepared.error});
  if (Array.isArray(prepared.value?.prepared)) row.prepared = prepared.value.prepared;
  if (!prepared.value?.ready) return done({invalid: `not prepared: ${prepared.value?.reason ?? 'no reason'}`});
  // A prepare that needs its field focused: judged by the observation's own focus where the engine reports it (#188).
  if (prepared.value.focus) {
    const verdict = focusVerdict(prepared.value.focus, prepared.engine?.observation ?? null);
    row.focusReadBy = verdict.by;
    if (verdict.problem) return done({invalid: `not prepared: ${verdict.problem}`});
  }
  const before = regime === 'background' ? await userFront(ctx, user, userWindow, {rekey: userValue === null}) : drivenFront(ctx, target);
  if (!activated(ctx, app)) return done({frontKey: {...skippedReadings(ctx, apps, app), before: keyReading(before)}});
  if (regime === 'background') {
    if (!before.inFront) return done({invalid: 'the user window was not in front before the action'});
    if (before.watcher !== true) return done({invalid: 'the activation watcher was not running before the action'});
  }
  const readings = {apps, activate: activationOf(ctx, app), before: keyReading(before)};
  // The reading after the act's check (and the witness), taken once: every row from here on carries it.
  let late = null;
  const after = options => (late ??= read(ctx, null, {frontKey: true, ...options}));
  const finish = extra => done({frontKey: {...readings, after: keyReading(after())}, ...extra});
  if (PASTING.includes(c.method)) alertCheck(ctx, `before ${row.id}`);
  const act = span(c.keys ? await sendKeys(ctx, cells.act, c.keys, {scene, front: before, userWindow, kind: 'row', key}) : await ctx.lane.js(cells.act));
  if (act === null) return finish({invalid: 'the key guard did not send the action\'s keys'});
  keep('act', act);
  if (PASTING.includes(c.method)) alertCheck(ctx, `after ${row.id}`);
  if (!act.ok) return finish({invalid: 'the act cell failed', error: act.error});
  Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, ...(electron ? {actAt: act.value.at ?? act.at} : {})});
  const oracleAfter = regime === 'background' ? read(ctx, focusOf(userWindow), {electronMode: electron, windowOrder: true}) : null;
  const check = span(await ctx.lane.js(cells.check));
  keep('check', check);
  if (electron) row.electronMode = (oracleAfter ?? after({electronMode: true}))?.electronMode ?? null;
  if (!check.ok) return finish({invalid: 'the check cell failed', error: check.error});
  if (check.value?.invalid) return finish({invalid: check.value.invalid});
  if (oracleAfter && oracleAfter.watcher !== true) return finish({invalid: 'the activation watcher was not running after the action'});
  const witness = isAcceptance3(target, regime, c, user) ? await keystrokeWitness(ctx, span, userWindow) : null;
  if (witness?.invalid) return finish({invalid: witness.invalid});
  // With `userValue`, the user window's field must also have kept that value (the focus probe's hash after the act).
  const kept = userValue === null ? null : oracleAfter?.focus?.named === true && oracleAfter.focus.valueHash === userValue;
  const outcome = {...(check.value?.outcome ?? {}), ...(kept === null ? {} : {userKept: kept}), ...(witness ? {keystroke: witness.keystroke} : {})};
  if (Object.hasOwn(outcome, 'errorName')) outcome.errorName = errorNameOf(act, outcome.errorName);
  const witnessed = !witness || Object.values(witness.keystroke).every(v => v === true);
  const pushed = finish({ok: check.value?.ok === true && kept !== false && witnessed, outcome});
  ctx.judged.set(key, {row: pushed, oracle: regime === 'background'
    ? {before: before.reading, after: oracleAfter.reading, focus: oracleAfter.focus ?? null, inputRoute: act.route, scene, userPid: userWindow.pid,
      order: {before: before.windowOrder ?? null, after: oracleAfter.windowOrder ?? null}, targets: targetsOf(target),
      userWindow: {pid: userWindow.pid, number: before.reading?.topWindow?.number ?? null}} : null});
  if (speed) push(ctx, {section: 'speed', id: methodTimingId(target, c), engine: ctx.engine, sample: ctx.n, ok: true, inCellMs: act.value.actMs, wallMs: act.wallMs, frontKey: pushed.frontKey});
  return pushed;
}

// Acceptance 3's keystroke witness (S L238; ./probe-plan.mjs WITNESS_PREPARE_CELL), after TextEdit's background click
// and its check, with the user window (the run's Finder window) in front: a keystroke probe gated on that window types a
// run-owned file's name, which Finder's list must select, while TextEdit's document keeps its value. A probe that would
// not post because the window was no longer in front is the witness failing (the front was taken); one that could not
// post at all says nothing. The probe's keys are a user's to Finder: the run waits the debounce out before it drives
// Finder again (quiet). -> {keystroke: {posted, finderSelected, documentUnchanged}} | {invalid}.
async function keystrokeWitness(ctx, span, userWindow) {
  const chosen = span(await ctx.lane.js(WITNESS_PREPARE_CELL));
  const file = chosen.ok ? chosen.value?.target : null;
  if (!WITNESS_FILES.includes(file)) return {invalid: `the keystroke witness could not choose its file${chosen.ok ? '' : ` (${String(chosen.error ?? '').slice(0, 160)})`}`};
  device(ctx, ['probe', 'keystroke', '--window', focusOf(userWindow), '--text', file, '--lead', String(WITNESS_LEAD_MS)]);
  const finished = device(ctx, ['probe', 'finish']);
  ctx.posted[ACCEPTANCE_3.user] = ctx.now();
  const problem = probeProblem(finished?.answer);
  if (problem && finished?.answer?.aborted !== true) return {invalid: `the keystroke witness's probe did not post: ${problem}`};
  const checked = span(await ctx.lane.js(witnessCheckCell(file)));
  if (!checked.ok) return {invalid: `the keystroke witness's read-back failed (${String(checked.error ?? '').slice(0, 160)})`};
  return {keystroke: {posted: problem === null, finderSelected: checked.value?.finderSelected === true, documentUnchanged: checked.value?.documentUnchanged === true}};
}
