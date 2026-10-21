// One lane of the native matrix on a device (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system parts 4 and 5; `scripts/native-matrix.mjs run|cell`): for each of --runs runs, the whole hold from the
// admission to the put-back, and one CellResult (./cell-result.mjs) in `<out>/run-<n>/result.json`.
//
// A run, in order:
//   1. this checkout clean (the device's harness checkout must be at its commit), then the live hold's `begin`
//      (./live-device.mjs: the refusals, the owner's front app and Finder saved on the device, the engine stopped)
//   2. the approved home prepared under the admission (scripts/native-baseline/prepare.mjs, which stops the engine
//      again), the serve's preflight for --host and --engine, the approved engine checked against --approved-engine and
//      this checkout's build
//   3. the plan's scenes up (scripts/repl-parity/scenes-mac.mjs) with Finder's setup steps, then the engine those steps
//      used stopped, so the lane's engine is the one its first call launches
//   4. the activation watcher started (`watch start`), the lane connected (./lane.mjs), every scene bound by path
//   5. the frontmost regime: each target's app activated (setup.activate, not judged), its speed cells (getAXState,
//      getScreenshot, listApps; --samples each) and finding-elements cell, then its method cases (./plan.mjs)
//   6. the background regime: per pairing the user scene activated, its window read as the user window, and each case
//      of the driven target run with the oracle's reading before and after the act (./matrix-device.mjs read, the focus
//      probe after); keys only through the key guard's user-window case
//   7. the launch path (TextEdit, the Electron fixture): the scene down, the user window in front, the app resolved by
//      its path, the oracle read, the launched app brought down
//   8. end_task; the watcher stopped and its activations charged to the rows (./oracle.mjs); the lane closed; the live
//      hold's `recover` (the put-back: Finder's chrome and keys, every scene down, the input source and per-context
//      preference, the engine stopped, the apps and Finder checked, the owner's front app by activation alone); the
//      approved home's cleanup (the engine stopped again); the engine and helper attestations judged
//
// Nothing of a window the run does not own leaves the device: cells return judgments and counts, the device reads
// return the run's own pids and other apps' bundle ids. The owner's Chrome and Claude Desktop are never touched: the
// scenes are Chrome for Testing and the run's own fixture, the put-back restores the front app by activation alone.
// A key is sent only under scripts/accept/key-guard.mjs; a skip whose front is not one of the run's windows (the owner
// at the Mac) stops the run.
import * as fs from 'node:fs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';
import {quote} from '../browser-parity/topology.mjs';
import {AX_FULL, LIST_APPS, SCRATCH_GUARD, SCREENSHOT} from '../native-baseline/cells.mjs';
import {assertEngineOptions, checkApprovedEngine, engineProblem} from '../native-baseline/engine.mjs';
import {HOSTS} from '../native-baseline/remote.mjs';
import {BACKGROUND_PAIRINGS, guardOf, SCENES} from '../repl-parity/scenes-mac.mjs';
import {cellResult, validateCellResult, writeCellResult} from './cell-result.mjs';
import {checkVendorPreflight} from './goldens.mjs';
import {BIND} from './goldens-cells.mjs';
import {BIND_MS, connectLane, helpersOf} from './lane.mjs';
import {caseCells, CLOSE_PANEL, findingCell, launchCell, launchCheckCell, OPEN_PANEL, selectCell} from './matrix-cells.mjs';
import {attributeActivations, judgeInterference, userWindowOf} from './oracle.mjs';
import {CASES, caseId, SCENE_OF} from './plan.mjs';

export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-matrix';
export const DEFAULT_RUNS = 3;
export const DEFAULT_SAMPLES = 10;
export const REFUSED = 2;
const SCENE_ORDER = ['textedit', 'finder', 'chrome', 'electron'];

// The whole matrix, and what each registry cell runs of it (./registry.mjs).
export const FULL_PLAN = Object.freeze({
  frontmost: ['textedit', 'openPanel', 'finder', 'chrome', 'electron'], speed: true, finding: true,
  background: [...BACKGROUND_PAIRINGS, {driven: 'openPanel', user: 'finder'}],
  launch: [{scene: 'textedit', user: 'finder'}, {scene: 'electron', user: 'finder'}],
});
const EMPTY_PLAN = {frontmost: [], speed: false, finding: false, background: [], launch: []};
// A plan narrowed to one scene (and for the background, one user): the registry's `cell <name> --scene --user`.
export function planOf(kind, {scene = null, user = null} = {}) {
  if (scene !== null && !FULL_PLAN.frontmost.includes(scene)) throw new Error(`--scene is one of ${FULL_PLAN.frontmost.join(', ')}`);
  if (user !== null && !SCENE_ORDER.includes(user)) throw new Error(`--user is one of ${SCENE_ORDER.join(', ')}`);
  const plan = narrowed(kind, {scene, user});
  if (!plan.frontmost.length && !plan.background.length && !plan.launch.length) throw new Error(`the ${kind} cell has nothing to run for${scene ? ` --scene ${scene}` : ''}${user ? ` --user ${user}` : ''}`);
  return plan;
}
function narrowed(kind, {scene, user}) {
  // --scene names a target exactly: textedit is the document, openPanel its Open panel.
  const front = t => !scene || t === scene;
  const back = p => (!scene || p.driven === scene) && (!user || p.user === user);
  switch (kind) {
    case 'matrix': return {...FULL_PLAN, frontmost: FULL_PLAN.frontmost.filter(front), background: FULL_PLAN.background.filter(back), launch: FULL_PLAN.launch.filter(l => !scene || l.scene === scene)};
    case 'method': return {...EMPTY_PLAN, frontmost: FULL_PLAN.frontmost.filter(front), background: FULL_PLAN.background.filter(back)};
    case 'speed': return {...EMPTY_PLAN, frontmost: FULL_PLAN.frontmost.filter(t => t !== 'openPanel' && front(t)), speed: true, onlyMeasures: true};
    case 'finding': return {...EMPTY_PLAN, frontmost: FULL_PLAN.frontmost.filter(t => t !== 'openPanel' && front(t)), finding: true, onlyMeasures: true};
    case 'background': return {...EMPTY_PLAN, background: FULL_PLAN.background.filter(back)};
    case 'launch': return {...EMPTY_PLAN, launch: FULL_PLAN.launch.filter(l => !scene || l.scene === scene)};
    default: throw new Error(`no plan ${kind}`);
  }
}
// The scenes a plan brings up.
export const scenesOf = plan => SCENE_ORDER.filter(id => plan.frontmost.some(t => SCENE_OF[t] === id)
  || plan.background.some(p => SCENE_OF[p.driven] === id || p.user === id) || plan.launch.some(l => l.scene === id || l.user === id));

class Stop extends Error {}

// options: {device, host, engine, approvedRuntime, approvedEngine, out, runs, samples, run (the device directory),
// plan, cell (the registry name the results answer)}; io: {ops (./lane.mjs matrixOps), connect, controllerCheckout(),
// log, dryRun, interrupt: {signal}, now}. -> 0 every run complete and passed, 1 otherwise, 2 refused before anything
// on the device changed; 130/143 on an interrupt (the put-back has run).
export async function runMatrix(options, io) {
  const {host, engine, approvedRuntime, approvedEngine, out, runs = DEFAULT_RUNS, samples = DEFAULT_SAMPLES} = options;
  if (!HOSTS.includes(host)) throw new Error('run needs --host vendor|cua');
  assertEngineOptions({platform: 'darwin', surface: 'computer', host, engine, approvedEngine});
  if (!/^\/[^\0\n]*$/.test(approvedRuntime ?? '')) throw new Error('run needs --approved-runtime <the approved CUA_HOME, an absolute path>');
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('--runs needs a positive integer');
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error('--samples needs a positive integer');
  if (!out) throw new Error('run needs --out <dir>');
  const base = resolve(out);
  const dirs = Array.from({length: runs}, (_, i) => join(base, `run-${i + 1}`));
  if (!io.dryRun) for (const dir of dirs) if (fs.existsSync(join(dir, 'result.json'))) throw new Error(`${dir} already holds a result: choose a new --out`);
  let worst = 0;
  for (const [i, dir] of dirs.entries()) {
    const code = await runOnce({...options, runs, samples, n: i + 1, dir}, io);
    if (code === REFUSED) return REFUSED;
    if (io.interrupt?.signal) return io.interrupt.signal === 'SIGINT' ? 130 : 143;
    worst = Math.max(worst, code);
  }
  return worst;
}

async function runOnce(options, io) {
  const {device, host, engine, approvedRuntime, approvedEngine, n, dir, samples, plan = FULL_PLAN, cell: cellName = 'matrix'} = options;
  const {ops, log = console.log, dryRun = false} = io;
  const now = io.now ?? Date.now;
  const interrupt = io.interrupt ?? {signal: null};
  const started = new Date().toISOString();
  const rows = [], problems = [], pending = [];
  const meta = {run: n, host, engine, samples, plan: {frontmost: plan.frontmost, background: plan.background, launch: plan.launch, speed: plan.speed, finding: plan.finding},
    elicitations: [], keySkipped: []};
  let refused = false, complete = false, putBack, lanes = [{host, engine, build: null, version: null}];
  const write = () => {
    const result = cellResult({cell: cellName, device, started, lanes, complete, refused, problems, rows, putBack, meta});
    if (dryRun) { const bad = validateCellResult(result); log(`dry: the result ${bad.length ? `does not conform: ${bad.join('; ')}` : `conforms (${rows.length} rows, verdict ${result.verdict})`}`); return result; }
    writeCellResult(dir, result);
    return result;
  };

  const controller = io.controllerCheckout();
  meta.controller = {commit: controller.commit ?? null, dirty: controller.dirty ?? null};
  const refusals = [];
  if (!controller.commit) refusals.push('this checkout\'s commit could not be read');
  if (controller.dirty) refusals.push('this checkout has uncommitted changes to tracked files: the matrix runs a reviewed commit; commit or stash them');
  const run = options.run ?? `${ops.home()}/${DEFAULT_RUN}`;
  meta.runDir = run;
  ops.journalTo?.(run);
  let begun = null;
  if (!refusals.length) {
    try { begun = ops.live(['begin', '--run', run, '--commit', controller.commit]); } catch (error) {
      problems.push(`begin failed: ${error.message}`);
      putBack = recover(ops, run, problems);
      write();
      log(`run ${n} INCOMPLETE: begin failed (${error.message}); the put-back ran`);
      return 1;
    }
  }
  refusals.push(...(begun?.refusals ?? []));
  if (refusals.length) {
    refused = true; problems.push(...refusals); write();
    log(`refused: ${refusals.join('; ')}`);
    return REFUSED;
  }
  meta.frontApp = {saved: begun.frontmost?.bundleId ?? null};
  meta.engineStopAtStart = begun.engineStop ?? null;
  log(`run ${n}: the owner's front app (${meta.frontApp.saved ?? 'none'}) is saved on the device and the engine stopped; if this run dies: node scripts/native-matrix.mjs cleanup --device ${device} --run ${quote(run)} --preparation ${quote(join(dir, 'preparation.json'))}`);

  const checkpoint = async () => {
    await new Promise(done => setImmediate(done));
    if (interrupt.signal) throw new Stop(`interrupted by ${interrupt.signal}`);
  };
  const ctx = {ops, run, rows, pending, problems, meta, samples, n, engine, records: {}, lane: null, checkpoint, log, now};
  let prepared = null, pre = null, watching = false, laneStarted = null;
  const helpers = [];
  const snapshot = () => {
    const at = now();
    for (const h of helpersOf(ops.helpers(), pre.runtimeRoot, pre.engine?.installed?.bundlePath ?? null)) {
      const during = h.ageSeconds !== null && h.ageSeconds * 1000 <= at - laneStarted;
      const seen = helpers.find(x => x.path === h.path && x.kind === h.kind && x.origin === h.origin);
      if (seen) seen.startedDuringRun ||= during; else helpers.push({...h, startedDuringRun: during});
    }
  };
  try {
    prepared = ops.prepare(approvedRuntime);
    if (!dryRun) {
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(join(dir, 'preparation.json'), `${JSON.stringify({device, prepared, run}, null, 2)}\n`, {mode: 0o600});
    }
    if (!prepared.engineStop) throw new Error('the device\'s preparation did not stop cua\'s engine (prepare.mjs): is the harness checkout at this checkout\'s commit?');
    pre = ops.preflight({host, engine, approvedEngine, prepared});
    checkVendorPreflight(pre, prepared, {commit: controller.commit, why: 'the matrix runs the reviewed commit on the device and here'});
    const {approved, checkoutBuild} = checkApprovedEngine(pre.engine, approvedEngine);
    meta.nativeEngine = {requested: engine, approved, checkoutBuild, attested: [], unattested: 0};
    meta.runtime = {release: pre.release};
    Object.assign(meta, {commit: pre.commit, hardware: pre.hardware ?? null, os: pre.os ?? null, display: pre.display ?? null});

    const scenes = scenesOf(plan);
    meta.fixtures = {
      ...(scenes.includes('chrome') ? {chrome: ops.scenes(['place-chrome'])} : {}),
      ...(scenes.includes('electron') ? {electron: ops.scenes(['build-electron'])} : {}),
    };
    const scenePreflight = ops.scenes(['preflight', '--run', run]);
    if (scenePreflight?.refusals?.length) throw new Error(`the scenes refuse: ${scenePreflight.refusals.map(r => r.message).join('; ')}`);
    for (const id of scenes) {
      await checkpoint();
      const extra = id === 'chrome' ? ['--chrome-app', meta.fixtures.chrome.appPath] : id === 'electron' ? ['--electron-app', meta.fixtures.electron.appPath] : [];
      ctx.records[id] = ops.scenes(['up', id, '--run', run, ...extra]);
      ops.goldens(['steps', id, '--run', run, '--phase', 'setup']);
    }
    // Finder's setup steps drove cua's engine socket: stopped, so the lane's engine is the one the lane launches.
    meta.engineStopAfterSetup = ops.goldens(['engine-stop']);
    laneStarted = now();
    ops.live(['watch', 'start', '--run', run]);
    watching = true;
    const stderrFile = dryRun ? undefined : join(mkdtempSync(join(tmpdir(), 'cua-matrix-serve-')), 'serve-stderr.txt');
    ctx.lane = await connectLane({ops, pre, prepared, host, engine, connect: io.connect, bundleIds: SCENE_ORDER.map(id => SCENES[id].bundleId), meta, stderrFile});
    for (const id of scenes) {
      const bound = await ctx.lane.js(BIND(id, ctx.records[id].app), BIND_MS);
      if (!bound.ok) throw new Error(`${id} could not be bound: ${bound.error}`);
    }
    snapshot();
    for (const target of plan.frontmost) await frontmostTarget(ctx, target, plan);
    for (const pairing of plan.background) await backgroundPairing(ctx, pairing);
    for (const launch of plan.launch) await launchRow(ctx, launch);
    snapshot();
    try { await ctx.lane.client.call('end_task'); } catch (error) { problems.push(`end_task failed: ${error.message}`); }
    complete = true;
  } catch (error) {
    problems.push(error instanceof Stop ? `stopped: ${error.message}` : error.message);
    log(`run ${n} stopped: ${error.message}`);
  } finally {
    if (watching) {
      let activations = null;
      try { activations = ops.live(['watch', 'stop', '--run', run]).activations ?? null; } catch (error) { problems.push(`the activation watcher could not be read: ${error.message}`); }
      finalize(ctx, activations);
    }
    if (ctx.lane) { try { await ctx.lane.client.close(); } catch {} }
    putBack = recover(ops, run, problems);
    try {
      const front = ops.scenes(['frontmost']);
      meta.frontApp.now = front?.bundleId ?? null;
      meta.frontApp.same = meta.frontApp.saved ? meta.frontApp.now === meta.frontApp.saved : null;
    } catch (error) { meta.frontApp.error = error.message; }
    if (prepared) {
      try {
        const cleaned = ops.cleanup(prepared);
        meta.preparationCleanup = cleaned;
        if (cleaned?.removed !== true) problems.push('the approved home\'s cleanup was not confirmed');
        if (cleaned?.engineStop?.error) problems.push(`cua's engine did not stop when the run ended: ${cleaned.engineStop.error}`);
        if (!dryRun && cleaned?.removed === true) fs.rmSync(join(dir, 'preparation.json'), {force: true});
      } catch (error) { problems.push(`the approved home's cleanup failed: ${error.message}`); }
    }
    if (meta.nativeEngine && laneStarted !== null) {
      meta.service = {helpers};
      const issue = engineProblem(meta, 'this run');
      if (issue) problems.push(issue);
      const attested = meta.nativeEngine.attested[0];
      if (attested) lanes = [{host: meta.hostAttestation?.host ?? host, engine: attested.engine, build: attested.build, version: attested.version}];
    }
    complete = complete && problems.length === 0;
    meta.finished = new Date().toISOString();
    const result = write();
    log(`run ${n} ${complete ? result.verdict.toUpperCase() : 'INCOMPLETE'}${dryRun ? ' (dry run: the answers were made up, nothing ran)' : `: ${join(dir, 'result.json')}`}`);
    return complete && result.verdict === 'pass' ? 0 : 1;
  }
}

// The live hold's recovery and put-back (./live-device.mjs recover). -> its answer, a failure recorded as a problem.
function recover(ops, run, problems) {
  try {
    const answer = ops.live(['recover', '--run', run]);
    if (answer?.ok !== true) problems.push(`the put-back did not hold${answer?.manual ? `: ${answer.manual}` : ''}`);
    return {ok: answer?.ok === true, ...(answer?.putBack ? {steps: answer.putBack.steps ?? null} : {}), ...(answer?.manual ? {manual: answer.manual} : {})};
  } catch (error) { problems.push(`the put-back failed: ${error.message}`); return {ok: false, error: error.message}; }
}

// The watcher's activations charged to the background rows and each row's oracle judged; without the watcher's record
// no row can pass the oracle, so each is invalid.
function finalize(ctx, activations) {
  if (activations === null) {
    for (const p of ctx.pending) p.row.invalid ??= 'the activation watcher\'s record was lost';
    return;
  }
  const {byRow, unattributed} = attributeActivations(activations, ctx.pending.map((p, key) => ({key, at: p.at})));
  ctx.pending.forEach((p, key) => {
    p.row.interference = judgeInterference({before: p.before, after: p.after, activations: byRow[key], inputRoute: p.inputRoute, scene: p.scene,
      launched: p.launched ?? null, focus: p.focus ?? null, userPid: p.userPid});
  });
  ctx.meta.unattributedActivations = unattributed.map(e => ({bundleId: e.bundleId ?? null, at: e.at ?? null}));
}

// ---- the regimes --------------------------------------------------------------------------------------------------------

const push = (ctx, row) => { ctx.rows.push(row); return row; };
const read = (ctx, focus = null) => ctx.ops.matrix(['read', '--run', ctx.run, ...(focus ? ['--focus', focus] : [])]);
const focusOf = w => `${w.pid},${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`;
const activate = (ctx, scene) => ctx.ops.scenes(['activate', scene, '--run', ctx.run]);
const sameWindow = (a, b) => Boolean(a && b) && a.pid === b.pid && ['x', 'y', 'width', 'height'].every(k => a.bounds[k] === b.bounds[k]);

// A key cell sent only under the key guard: the driven scene's process in front, or (given `userWindow`) the run's
// user window. A skip with one of the run's windows in front leaves the row invalid; any other front (the owner at the
// Mac, an alert) stops the run. -> the cell's answer, or null when it was not sent.
async function sendKeys(ctx, code, keys, {scene, front, userWindow}) {
  const target = guardOf(scene, ctx.records[scene]);
  const out = await sendIfFrontmost({target, keys, frontmost: () => frontmostFromProbe((front ?? read(ctx)).reading), send: () => ctx.lane.js(code),
    ...(userWindow ? {userWindow} : {})});
  if (out.sent) return out.result;
  const seen = out.skipped.frontmost;
  ctx.meta.keySkipped.push({keys, scene, front: seen === 'unreadable' ? 'unreadable' : {bundleId: seen.bundleId ?? null, owned: seen.owned === true}});
  if (seen === 'unreadable' || seen.owned !== true) throw new Stop(`${keys.join(', ')} not sent: the front is not one of the run's windows (#162); the run stopped`);
  return null;
}

// The user window in front again before an act: read, and once re-activated when it is not. -> the reading or null.
async function userFront(ctx, user, userWindow) {
  let r = read(ctx);
  if (sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow)) return r;
  activate(ctx, user);
  r = read(ctx);
  return sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow) ? r : null;
}

// One case: prepare, act (one facade call), check; in the background regime the oracle's readings around the act.
async function caseRow(ctx, target, regime, c, {user = null, userWindow = null, speed = false} = {}) {
  await ctx.checkpoint();
  const scene = SCENE_OF[target];
  const row = {section: 'method', id: caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene, target, regime, method: c.method, case: c.case, expect: c.expect,
    ...(user ? {user} : {})};
  const cells = caseCells(target, c);
  const prepared = await ctx.lane.js(cells.prepare);
  if (!prepared.ok) return push(ctx, {...row, invalid: 'the prepare cell failed', error: prepared.error});
  if (!prepared.value?.ready) return push(ctx, {...row, invalid: `not prepared: ${prepared.value?.reason ?? 'no reason'}`});
  let before = null;
  if (regime === 'background') {
    before = await userFront(ctx, user, userWindow);
    if (!before) return push(ctx, {...row, invalid: 'the user window was not in front before the action'});
  }
  const act = c.keys ? await sendKeys(ctx, cells.act, c.keys, {scene, front: before, userWindow}) : await ctx.lane.js(cells.act);
  if (act === null) return push(ctx, {...row, invalid: 'the key guard did not send the action\'s keys'});
  if (!act.ok) return push(ctx, {...row, invalid: 'the act cell failed', error: act.error});
  Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route});
  const after = regime === 'background' ? read(ctx, focusOf(userWindow)) : null;
  const check = c.checkKeys ? await sendKeys(ctx, cells.check, c.checkKeys, {scene, front: after, userWindow}) : await ctx.lane.js(cells.check);
  if (check === null) return push(ctx, {...row, invalid: 'the key guard did not send the check\'s keys'});
  if (!check.ok) return push(ctx, {...row, invalid: 'the check cell failed', error: check.error});
  if (check.value?.invalid) return push(ctx, {...row, invalid: check.value.invalid});
  Object.assign(row, {ok: check.value?.ok === true, outcome: check.value?.outcome ?? {}});
  push(ctx, row);
  if (regime === 'background') ctx.pending.push({row, before: before.reading, after: after.reading, focus: after.focus ?? null, at: act.value.at, inputRoute: act.route, scene, userPid: userWindow.pid});
  if (speed) push(ctx, {section: 'speed', id: `${scene}/method.${target === 'openPanel' ? 'panel.' : ''}${c.method}.${c.case}`, engine: ctx.engine, sample: ctx.n, ok: true, inCellMs: act.value.actMs, wallMs: act.wallMs});
  return row;
}

// Every case of a target left invalid for one reason (its precondition could not be set up).
const invalidCases = (ctx, target, regime, reason, user = null) => {
  for (const c of CASES[target]) push(ctx, {section: 'method', id: caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene: SCENE_OF[target], target, regime,
    method: c.method, case: c.case, expect: c.expect, ...(user ? {user} : {}), invalid: reason});
};

// The Open panel opened from the run's document (⌘O, under the key guard with TextEdit's process in front).
async function openPanel(ctx) {
  const front = activate(ctx, 'textedit');
  if (!front?.ok) return `TextEdit did not come to the front (${front?.reason ?? 'no answer'})`;
  const opened = await sendKeys(ctx, OPEN_PANEL, ['super+o'], {scene: 'textedit', front: read(ctx)});
  if (opened === null) return 'the key guard did not send ⌘O';
  if (!opened.ok || !opened.value?.opened) return `the Open panel did not open (${opened.error ?? opened.value?.reason ?? 'not seen'})`;
  return null;
}

async function frontmostTarget(ctx, target, plan) {
  const scene = SCENE_OF[target];
  if (target === 'openPanel') {
    const problem = await openPanel(ctx);
    if (problem) { if (!plan.onlyMeasures) invalidCases(ctx, target, 'frontmost', problem); return; }
  } else {
    const front = activate(ctx, scene);
    if (!front?.ok) { if (!plan.onlyMeasures) invalidCases(ctx, target, 'frontmost', `the scene did not come to the front (${front?.reason ?? 'no answer'})`); return; }
    if (plan.speed) await speedCells(ctx, scene);
    if (plan.finding) await findingRows(ctx, scene);
  }
  if (!plan.onlyMeasures) for (const c of CASES[target]) await caseRow(ctx, target, 'frontmost', c, {speed: plan.speed});
  if (target === 'openPanel') await closePanel(ctx);
}

async function closePanel(ctx) {
  const closed = await ctx.lane.js(CLOSE_PANEL);
  if (!closed.ok || !closed.value?.closed) throw new Stop('TextEdit\'s Open panel stayed open after its cases');
}

async function backgroundPairing(ctx, {driven, user}) {
  if (driven === 'openPanel') {
    const problem = await openPanel(ctx);
    if (problem) return invalidCases(ctx, driven, 'background', problem, user);
  }
  const front = activate(ctx, user);
  const r0 = front?.ok ? read(ctx) : null;
  const userWindow = r0 ? userWindowOf(r0.reading, ctx.records[user].pid) : null;
  if (!userWindow) invalidCases(ctx, driven, 'background', `the user window (${user}) did not come to the front`, user);
  else for (const c of CASES[driven]) await caseRow(ctx, driven, 'background', c, {user, userWindow});
  if (driven === 'openPanel') await closePanel(ctx);
}

// The speed cells of one scene: the baseline's own observation cells on the scene's app, --samples each, the
// screenshot series bracketed by the scene-in-front guard as the baseline brackets it.
async function speedCells(ctx, scene) {
  const selected = await ctx.lane.js(selectCell(scene));
  const reason = !selected.ok ? `the selection failed: ${selected.error}` : !selected.value?.inFront ? 'the scene window was not the app\'s front window' : null;
  for (const [op, code] of [['getAXState', AX_FULL], ['getScreenshot', SCREENSHOT], ['listApps', LIST_APPS]]) {
    const series = [];
    for (let i = 1; i <= ctx.samples; i++) {
      const row = {section: 'speed', id: `${scene}/${op}`, engine: ctx.engine, sample: (ctx.n - 1) * ctx.samples + i, ok: false, scene};
      if (reason) { push(ctx, {...row, invalid: reason}); continue; }
      await ctx.checkpoint();
      const r = await ctx.lane.js(code);
      series.push(push(ctx, {...row, ok: r.ok && !r.value?.invalid, inCellMs: r.inCellMs, wallMs: r.wallMs, ...(r.value?.invalid ? {invalid: r.value.invalid} : {}),
        ...(r.ok ? {} : {error: r.error})}));
    }
    if (op === 'getScreenshot' && !reason) {
      const guard = await ctx.lane.js(SCRATCH_GUARD);
      if (!guard.ok || !guard.value?.scratchInFront) for (const row of series) row.invalid ??= 'the scene window left the front during the series';
    }
  }
}

// The finding-elements cell of one scene: one row per target, the line measures and the ID count.
async function findingRows(ctx, scene) {
  await ctx.checkpoint();
  const r = await ctx.lane.js(findingCell(scene));
  const base = {section: 'finding', engine: ctx.engine, sample: ctx.n, scene};
  if (!r.ok || r.value?.invalid) {
    push(ctx, {...base, id: `${scene}/lines`, ok: false, invalid: r.value?.invalid ?? 'the finding cell failed', ...(r.ok ? {} : {error: r.error})});
    return;
  }
  for (const t of r.value.targets) push(ctx, {...base, id: `${scene}/target.${t.id}`, ok: true, outcome: {found: t.found, resolved: t.resolved}});
  push(ctx, {...base, id: `${scene}/lines`, ok: true, outcome: {lines: r.value.lines, named: r.value.named, unclassified: r.value.unclassified}});
  push(ctx, {...base, id: `${scene}/ids`, ok: true, outcome: {ids: r.value.ids}});
}

// The launch path of one scene (part 4): the scene down, the user window in front, the app resolved by its path while
// it is not running, the oracle read, then the app the engine launched brought down (the scene stays down).
async function launchRow(ctx, {scene, user}) {
  await ctx.checkpoint();
  const row = {section: 'launch', id: `${scene}/background/launch@${user}`, engine: ctx.engine, sample: ctx.n, ok: false, scene, user, regime: 'background', method: 'getApp', case: 'launch'};
  const app = ctx.records[scene]?.app;
  const down = ctx.ops.scenes(['down', scene, '--run', ctx.run]);
  if (!down?.down) return push(ctx, {...row, invalid: `the scene could not be brought down first (${down?.reason ?? 'no answer'})`});
  const front = activate(ctx, user);
  const before = front?.ok ? read(ctx) : null;
  const userWindow = before ? userWindowOf(before.reading, ctx.records[user].pid) : null;
  if (!userWindow) return push(ctx, {...row, invalid: `the user window (${user}) did not come to the front`});
  const act = await ctx.lane.js(launchCell(scene, app));
  if (!act.ok) return push(ctx, {...row, invalid: 'the launch cell failed', error: act.error});
  Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, ...(act.value.error ? {error: act.value.error} : {})});
  const after = read(ctx, focusOf(userWindow));
  const check = await ctx.lane.js(launchCheckCell(scene));
  const quit = ctx.ops.matrix(['launched', scene, '--run', ctx.run, '--since', String(act.value.at[0])]);
  if (quit.remaining) ctx.problems.push(`${scene}: the app the launch path brought up did not quit`);
  Object.assign(row, {ok: check.ok && check.value?.ok === true && !act.value.threw, outcome: {...(check.value?.outcome ?? {}), threw: act.value.threw, quit: quit.quit}});
  push(ctx, row);
  ctx.pending.push({row, before: before.reading, after: after.reading, focus: after.focus ?? null, at: act.value.at, inputRoute: act.route, scene, userPid: userWindow.pid, launched: SCENES[scene].bundleId});
  return row;
}

// The cleanup of a run that died (`native-matrix.mjs cleanup`): the live hold's recovery and put-back, then the
// approved home's cleanup from the run's preparation.json when there is one. -> 0 when both held, else 1.
export function cleanupMatrix({device, run, preparation}, io) {
  const {ops, log = console.log} = io;
  const problems = [];
  const dirRun = run ?? `${ops.home()}/${DEFAULT_RUN}`;
  ops.journalTo?.(dirRun);
  const putBack = recover(ops, dirRun, problems);
  if (preparation) {
    const saved = JSON.parse(fs.readFileSync(preparation, 'utf8'));
    if (saved.device !== device) throw new Error(`${preparation} is a preparation on ${saved.device}, not ${device}`);
    try {
      const cleaned = ops.cleanup(saved.prepared);
      if (cleaned?.removed !== true) problems.push('the approved home\'s cleanup was not confirmed');
      else if (!io.dryRun) fs.rmSync(preparation, {force: true});
    } catch (error) { problems.push(`the approved home's cleanup failed: ${error.message}`); }
  }
  log(`cleanup ${problems.length ? `INCOMPLETE: ${problems.join('; ')}` : 'done'}${putBack.manual ? `; the recovery needs you: ${putBack.manual}` : ''}`);
  return problems.length ? 1 : 0;
}
