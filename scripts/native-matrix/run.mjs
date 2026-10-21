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
//      used stopped, so the lane's engine is the one its first call launches; the window readers compiled once into the
//      run directory, and the screen's windows kept as the paste rows' alert baseline (./matrix-device.mjs)
//   4. the activation watcher started (`watch start`, its pid kept), the lane connected (./lane.mjs), every scene bound
//      by path with its window brought to the front first, so the bind's text (getApp emits it) is the run's own window
//   5. the frontmost regime: each target's app activated (a harness step), its speed cells (getAXState, getScreenshot,
//      listApps; --samples each) and finding-elements cell, then its method cases (./plan.mjs)
//   6. the background regime: per pairing the user scene activated, its window read as the user window, and each case
//      of the driven target run with the oracle's reading before and after the act (./matrix-device.mjs read, the focus
//      probe after); keys only through the key guard's user-window case; a paste or typeText act only between two alert
//      checks; the windowless app (the "app with no window" refusal) brought up for its pairing and quit after it
//   7. the launch path (the Electron fixture; TextEdit's is an owner option, ./plan.mjs OWNER_OPTIONS): the user
//      window in front, the scene down, the launch's intent journaled on the device, the app observed by its path
//      through the engine's own call (its text never leaves the cell), the launched process journaled by pid and start
//      time, the oracle read, the outcome read, and the launched process quit in a `finally`
//   8. end_task; the watcher's liveness read once more, the watcher stopped and every activation it saw accounted for
//      against the steps' device-clock windows (./oracle.mjs accountActivations); the lane closed; every journaled
//      launch quit; the live hold's `recover` (the put-back: Finder's chrome and keys, every scene down, the input source
//      and per-context preference, the engine stopped, the apps and Finder checked, the owner's front app by activation
//      alone); the approved home's cleanup (the engine stopped again); the engine and helper attestations judged
//
// Coverage is proven, never assumed: every step that can activate an app answers its device-clock window (`at`; a js
// cell's from ./lane.mjs), the watcher's liveness is read with every oracle reading and once before it is stopped, and an
// activation no step accounts for, a watcher gone or a record lost leaves the run incomplete (its judged rows invalid).
//
// Nothing of a window the run does not own leaves the device: cells return judgments and counts, the device reads
// return the run's own pids and other apps' bundle ids. The owner's Chrome and Claude Desktop are never touched: the
// scenes are Chrome for Testing and the run's own fixture, the put-back restores the front app by activation alone.
// A key is sent only under scripts/accept/key-guard.mjs; a skip whose front is not one of the run's windows (the owner
// at the Mac) stops the run. A possible system alert around a paste stops the run without touching it.
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
import {accountActivations, judgeInterference, userWindowOf} from './oracle.mjs';
import {CASES, caseId, OWNER_OPTIONS, SCENE_OF, WINDOWLESS_BUNDLE_ID} from './plan.mjs';

export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-matrix';
export const DEFAULT_RUNS = 3;
export const DEFAULT_SAMPLES = 10;
export const REFUSED = 2;
const SCENE_ORDER = ['textedit', 'finder', 'chrome', 'electron'];
// The acts that may paste (type_text's paste route included): each sent only between two alert checks.
export const PASTING = Object.freeze(['paste', 'typeText']);

// The whole matrix, and what each registry cell runs of it (./registry.mjs). `id` names the plan in every result
// (meta.planId); only a 'full' plan's results count toward the verdict (./summary.mjs).
export const FULL_PLAN = Object.freeze({
  id: 'full', frontmost: ['textedit', 'openPanel', 'finder', 'chrome', 'electron'], speed: true, finding: true,
  background: [...BACKGROUND_PAIRINGS, {driven: 'openPanel', user: 'finder'}, {driven: 'windowless', user: 'finder'}],
  launch: [{scene: 'electron', user: 'finder'}],
});
const EMPTY_PLAN = {frontmost: [], speed: false, finding: false, background: [], launch: []};
const NARROWABLE = [...FULL_PLAN.frontmost, 'windowless'];
// A plan narrowed to one target (and for the background, one user): the registry's `cell <name> --scene --user`. Its id
// is 'full' only for the whole matrix.
export function planOf(kind, {scene = null, user = null} = {}) {
  if (scene !== null && !NARROWABLE.includes(scene)) throw new Error(`--scene is one of ${NARROWABLE.join(', ')}`);
  if (user !== null && !SCENE_ORDER.includes(user)) throw new Error(`--user is one of ${SCENE_ORDER.join(', ')}`);
  const plan = narrowed(kind, {scene, user});
  if (!plan.frontmost.length && !plan.background.length && !plan.launch.length) {
    const option = OWNER_OPTIONS.find(o => kind === 'launch' && o.section === 'launch' && o.id.startsWith(`${scene}/`));
    throw new Error(`the ${kind} cell has nothing to run for${scene ? ` --scene ${scene}` : ''}${user ? ` --user ${user}` : ''}${option ? `: ${option.option} (${option.reason})` : ''}`);
  }
  const id = kind === 'matrix' && scene === null && user === null ? 'full' : `${kind}${scene ? `:${scene}` : ''}${user ? `@${user}` : ''}`;
  return {...plan, id};
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

// options: {device, host, engine, approvedRuntime, approvedEngine, out, runs, samples, run (the device directory), plan
// (planOf's), cell (the registry name the results answer), sitting (the sitting's id, in every result)}; io: {ops
// (./lane.mjs matrixOps), connect, controllerCheckout(), log, dryRun, interrupt: {signal}, now}. -> 0 every run complete
// and passed, 1 otherwise, 2 refused before anything on the device changed; 130/143 on an interrupt (the put-back ran).
export async function runMatrix(options, io) {
  const {host, engine, approvedRuntime, approvedEngine, out, runs = DEFAULT_RUNS, samples = DEFAULT_SAMPLES, sitting} = options;
  if (!HOSTS.includes(host)) throw new Error('run needs --host vendor|cua');
  assertEngineOptions({platform: 'darwin', surface: 'computer', host, engine, approvedEngine});
  if (!/^\/[^\0\n]*$/.test(approvedRuntime ?? '')) throw new Error('run needs --approved-runtime <the approved CUA_HOME, an absolute path>');
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('--runs needs a positive integer');
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error('--samples needs a positive integer');
  if (!/^[\w.-]+$/.test(sitting ?? '')) throw new Error('run needs --sitting <id> (letters, digits, dot, dash, underscore): every lane of one sitting names the same');
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
  const {device, host, engine, approvedRuntime, approvedEngine, n, dir, samples, sitting, plan = FULL_PLAN, cell: cellName = 'matrix'} = options;
  const {ops, log = console.log, dryRun = false} = io;
  const now = io.now ?? Date.now;
  const interrupt = io.interrupt ?? {signal: null};
  const started = new Date().toISOString();
  const rows = [], problems = [];
  const meta = {run: n, host, engine, samples, sitting, planId: plan.id ?? 'full',
    plan: {frontmost: plan.frontmost, background: plan.background, launch: plan.launch, speed: plan.speed, finding: plan.finding},
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
  // windows: every step's device-clock window [{kind, key, at}]; judged: the rows whose activations are charged, by key.
  const ctx = {ops, run, rows, problems, meta, samples, n, engine, records: {}, lane: null, checkpoint, log, now, watcher: null, windows: [], judged: new Map()};
  let prepared = null, pre = null, laneStarted = null;
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
    ops.matrix(['compile', '--run', run]);
    ops.matrix(['alerts', 'baseline', '--run', run]);
    laneStarted = now();
    const watch = ops.live(['watch', 'start', '--run', run]);
    if (!Number.isSafeInteger(watch?.pid)) throw new Error('the activation watcher did not report its pid: no row could prove its coverage');
    ctx.watcher = watch.pid;
    const stderrFile = dryRun ? undefined : join(mkdtempSync(join(tmpdir(), 'cua-matrix-serve-')), 'serve-stderr.txt');
    ctx.lane = await connectLane({ops, pre, prepared, host, engine, connect: io.connect, bundleIds: [...SCENE_ORDER.map(id => SCENES[id].bundleId), WINDOWLESS_BUNDLE_ID], meta, stderrFile});
    for (const id of scenes) {
      // getApp emits its text: the scene's own window in front first, so that text is the run's.
      const front = activate(ctx, id);
      if (!front?.ok) throw new Error(`${id} did not come to the front before its bind (${front?.reason ?? 'no answer'})`);
      const bound = await js(ctx, 'setup', `bind:${id}`, BIND(id, ctx.records[id].app), {timeoutMs: BIND_MS});
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
    if (ctx.watcher !== null) finishWatch(ctx);
    if (ctx.lane) { try { await ctx.lane.client.close(); } catch {} }
    quitLaunched(ctx);
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

// Every launch the run journaled quit while it is still the same process (./matrix-device.mjs launched quit). -> the
// answer, or null when it failed (recorded as a problem).
function quitLaunched(ctx) {
  try {
    const quit = ctx.ops.matrix(['launched', 'quit', '--run', ctx.run]);
    if (quit?.remaining) ctx.problems.push(`${quit.remaining} app(s) the run launched did not quit`);
    return quit;
  } catch (error) { ctx.problems.push(`the run's launched apps could not be quit: ${error.message}`); return null; }
}

// The watcher's end: its liveness read once more (alive now and the same pid running the probe: alive throughout),
// then stopped, and every activation it saw accounted for. A dead watcher or a lost record leaves every judged row
// invalid and the run incomplete; an activation no step accounts for leaves the run incomplete.
function finishWatch(ctx) {
  let alive = false, activations = null;
  try { alive = read(ctx).watcher === true; } catch (error) { ctx.problems.push(`the activation watcher's liveness could not be read: ${error.message}`); }
  try { activations = ctx.ops.live(['watch', 'stop', '--run', ctx.run]).activations ?? null; } catch (error) { ctx.problems.push(`the activation watcher could not be read: ${error.message}`); }
  if (!alive || !Array.isArray(activations)) {
    ctx.problems.push(!alive ? 'the activation watcher was not running at the end: its coverage of the run is not proven' : 'the activation watcher\'s record was lost');
    for (const {row} of ctx.judged.values()) row.invalid ??= 'the activation watcher\'s coverage was not proven';
    return;
  }
  const {byRow, accounted, unaccounted} = accountActivations(activations, ctx.windows);
  for (const [key, judged] of ctx.judged) {
    const seen = byRow[key] ?? [];
    if (judged.oracle) judged.row.interference = judgeInterference({...judged.oracle, activations: seen});
    else judged.row.activations = seen.length;
  }
  // A row that ended invalid is judged by nothing: what fell in it is kept as that row's, never dropped.
  const inInvalid = Object.entries(byRow).filter(([key]) => !ctx.judged.has(key))
    .flatMap(([key, events]) => events.map(e => ({kind: 'invalid-row', key, bundleId: e.bundleId ?? null, at: e.at ?? null})));
  ctx.meta.activations = {accounted: [...accounted, ...inInvalid], unaccounted: unaccounted.map(e => ({bundleId: e.bundleId ?? null, at: e.at ?? null}))};
  if (unaccounted.length) ctx.problems.push(`${unaccounted.length} activation(s) fell in no step of the run: not accounted for`);
}

// ---- the steps and their windows ------------------------------------------------------------------------------------

const push = (ctx, row) => { ctx.rows.push(row); return row; };
// A step's device-clock window; a harness step names the apps it intends to activate (`apps`), the only activations
// it excuses (./oracle.mjs accountActivations).
const mark = (ctx, kind, key, at, apps = []) => {
  if (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite)) ctx.windows.push({kind, key, at, ...(kind === 'harness' ? {apps} : {})});
};
// A js cell, its device-clock window kept under `kind`.
async function js(ctx, kind, key, code, {timeoutMs, apps} = {}) {
  const r = await ctx.lane.js(code, timeoutMs);
  mark(ctx, kind, key, r.at, apps);
  return r;
}
const TEXTEDIT = [SCENES.textedit.bundleId];
// A scenes command through ./matrix-device.mjs step, its window the harness's: `activate` intends its scene's app,
// `down` (of a scene not in front) intends none. -> the command's answer.
function step(ctx, args) {
  const {answer, at} = ctx.ops.matrix(['step', ...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.join(':'), at, args[0] === 'activate' ? [SCENES[args[1]].bundleId] : []);
  return answer;
}
const activate = (ctx, scene) => step(ctx, ['activate', scene]);
const read = (ctx, focus = null) => ctx.ops.matrix(['read', '--run', ctx.run, ...(ctx.watcher !== null ? ['--watcher', String(ctx.watcher)] : []), ...(focus ? ['--focus', focus] : [])]);
const focusOf = w => `${w.pid},${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`;
const sameWindow = (a, b) => Boolean(a && b) && a.pid === b.pid && ['x', 'y', 'width', 'height'].every(k => a.bounds[k] === b.bounds[k]);

// The paste rows' system-alert watch (./matrix-device.mjs alerts check, the live paste check's): a possible alert stops
// the run untouched; only its sanitized export is kept.
function alertCheck(ctx, when) {
  const check = ctx.ops.matrix(['alerts', 'check', '--run', ctx.run]);
  if (check?.abort !== false) {
    ctx.meta.alert = {when, ...(check?.export ?? {})};
    throw new Stop(`a possible system alert appeared ${when}; the run stopped without touching it`);
  }
}

// A key cell sent only under the key guard: the driven scene's process in front, or (given `userWindow`) the run's
// user window. A skip with one of the run's windows in front leaves the row invalid; any other front (the owner at the
// Mac, an alert) stops the run. -> the cell's answer, or null when it was not sent.
async function sendKeys(ctx, code, keys, {scene, front, userWindow, kind = 'harness', key = `keys:${keys.join('+')}`}) {
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
async function userFront(ctx, user, userWindow) {
  let r = read(ctx);
  if (sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow)) return r;
  activate(ctx, user);
  r = read(ctx);
  return sameWindow(userWindowOf(r.reading, userWindow.pid), userWindow) ? r : null;
}

// ---- the regimes --------------------------------------------------------------------------------------------------------

// One case: prepare, act (one facade call), check; in the background regime the oracle's readings around the act, each
// with the watcher alive. The row's window runs from its prepare's start to its check's end; the activations in it are
// the row's (the frontmost regime records their count, the background regime's oracle judges them).
async function caseRow(ctx, target, regime, c, {user = null, userWindow = null, speed = false} = {}) {
  await ctx.checkpoint();
  const scene = SCENE_OF[target];
  const key = `row:${ctx.rows.length}`;
  const row = {section: 'method', id: caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene, target, regime, method: c.method, case: c.case, expect: c.expect,
    ...(user ? {user} : {})};
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
  const pushed = done({ok: check.value?.ok === true, outcome: check.value?.outcome ?? {}});
  ctx.judged.set(key, {row: pushed, oracle: regime === 'background'
    ? {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: act.route, scene, userPid: userWindow.pid} : null});
  if (speed) push(ctx, {section: 'speed', id: `${scene}/method.${target === 'openPanel' ? 'panel.' : ''}${c.method}.${c.case}`, engine: ctx.engine, sample: ctx.n, ok: true, inCellMs: act.value.actMs, wallMs: act.wallMs});
  return pushed;
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
  const closed = await js(ctx, 'harness', 'close-panel', CLOSE_PANEL, {apps: TEXTEDIT});
  if (!closed.ok || !closed.value?.closed) throw new Stop('TextEdit\'s Open panel stayed open after its cases');
}

async function backgroundPairing(ctx, {driven, user}) {
  if (driven === 'openPanel') {
    const problem = await openPanel(ctx);
    if (problem) return invalidCases(ctx, driven, 'background', problem, user);
  }
  try {
    if (driven === 'windowless') {
      const up = ctx.ops.matrix(['windowless', 'up', '--run', ctx.run]);
      mark(ctx, 'harness', 'windowless-up', up?.at, []);
      if (!Number.isSafeInteger(up?.answer?.pid)) return invalidCases(ctx, driven, 'background', 'the windowless app did not come up', user);
    }
    const front = activate(ctx, user);
    const r0 = front?.ok ? read(ctx) : null;
    const userWindow = r0 ? userWindowOf(r0.reading, ctx.records[user].pid) : null;
    if (!userWindow) invalidCases(ctx, driven, 'background', `the user window (${user}) did not come to the front`, user);
    else for (const c of CASES[driven]) await caseRow(ctx, driven, 'background', c, {user, userWindow});
  } finally {
    if (driven === 'windowless') quitLaunched(ctx);
  }
  if (driven === 'openPanel') await closePanel(ctx);
}

// The speed cells of one scene: the baseline's own observation cells on the scene's app, --samples each, the
// screenshot series bracketed by the scene-in-front guard as the baseline brackets it.
async function speedCells(ctx, scene) {
  const selected = await js(ctx, 'measure', `select:${scene}`, selectCell(scene));
  const reason = !selected.ok ? `the selection failed: ${selected.error}` : !selected.value?.inFront ? 'the scene window was not the app\'s front window' : null;
  for (const [op, code] of [['getAXState', AX_FULL], ['getScreenshot', SCREENSHOT], ['listApps', LIST_APPS]]) {
    const series = [];
    for (let i = 1; i <= ctx.samples; i++) {
      const row = {section: 'speed', id: `${scene}/${op}`, engine: ctx.engine, sample: (ctx.n - 1) * ctx.samples + i, ok: false, scene};
      if (reason) { push(ctx, {...row, invalid: reason}); continue; }
      await ctx.checkpoint();
      const r = await js(ctx, 'measure', `${scene}/${op}`, code);
      series.push(push(ctx, {...row, ok: r.ok && !r.value?.invalid, inCellMs: r.inCellMs, wallMs: r.wallMs, ...(r.value?.invalid ? {invalid: r.value.invalid} : {}),
        ...(r.ok ? {} : {error: r.error})}));
    }
    if (op === 'getScreenshot' && !reason) {
      const guard = await js(ctx, 'measure', `${scene}/scratch-guard`, SCRATCH_GUARD);
      if (!guard.ok || !guard.value?.scratchInFront) for (const row of series) row.invalid ??= 'the scene window left the front during the series';
    }
  }
}

// The finding-elements cell of one scene: one row per target, the line measures and the ID count.
async function findingRows(ctx, scene) {
  await ctx.checkpoint();
  const r = await js(ctx, 'measure', `${scene}/finding`, findingCell(scene));
  const base = {section: 'finding', engine: ctx.engine, sample: ctx.n, scene};
  if (!r.ok || r.value?.invalid) {
    push(ctx, {...base, id: `${scene}/lines`, ok: false, invalid: r.value?.invalid ?? 'the finding cell failed', ...(r.ok ? {} : {error: r.error})});
    return;
  }
  for (const t of r.value.targets) push(ctx, {...base, id: `${scene}/target.${t.id}`, ok: true, outcome: {found: t.found, resolved: t.resolved}});
  push(ctx, {...base, id: `${scene}/lines`, ok: true, outcome: {lines: r.value.lines, named: r.value.named, unclassified: r.value.unclassified}});
  push(ctx, {...base, id: `${scene}/ids`, ok: true, outcome: {ids: r.value.ids}});
}

// The launch path of one scene (part 4): the user window in front, then the scene down (not in front, so its quit hands
// the front to nothing), the launch's intent journaled on the device before the act is sent (so a controller that dies
// during or after the act leaves recovery the process to quit), the app observed by its path while it is not running
// (launchCell: the text stays in the cell), the process the engine launched journaled precisely (pid and start time),
// the oracle read, the outcome read; the launched process quit in a `finally`, whatever failed. The row's outcome (the
// launch reached the scene's own window) is its `ok`, judged apart from its interference (the oracle).
async function launchRow(ctx, {scene, user}) {
  await ctx.checkpoint();
  const key = `row:${ctx.rows.length}`;
  const row = {section: 'launch', id: `${scene}/background/launch@${user}`, engine: ctx.engine, sample: ctx.n, ok: false, scene, user, regime: 'background', method: 'getApp', case: 'launch'};
  const app = ctx.records[scene]?.app;
  const front = activate(ctx, user);
  if (!front?.ok) return push(ctx, {...row, invalid: `the user window (${user}) did not come to the front`});
  const down = step(ctx, ['down', scene]);
  if (!down?.down) return push(ctx, {...row, invalid: `the scene could not be brought down first (${down?.reason ?? 'no answer'})`});
  const before = read(ctx);
  const userWindow = userWindowOf(before.reading, ctx.records[user].pid);
  if (!userWindow) return push(ctx, {...row, invalid: `the user window (${user}) was not in front before the launch`});
  if (before.watcher !== true) return push(ctx, {...row, invalid: 'the activation watcher was not running before the launch'});
  let from = null, to = null, recorded = null;
  try {
    const intent = ctx.ops.matrix(['launched', 'intent', scene, '--run', ctx.run]);
    if (!Number.isSafeInteger(intent?.at)) return push(ctx, {...row, invalid: 'the launch\'s intent could not be journaled: nothing was sent'});
    const record = () => ctx.ops.matrix(['launched', 'record', scene, '--run', ctx.run, '--since', String(intent.at)]);
    const act = await ctx.lane.js(launchCell(scene, app)).finally(() => { recorded = record(); });
    [from, to] = act.at ?? [null, null];
    if (!act.ok) return push(ctx, {...row, invalid: 'the launch cell failed', error: act.error});
    Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, ...(act.value.error ? {error: act.value.error} : {})});
    const after = read(ctx, focusOf(userWindow));
    const check = await ctx.lane.js(launchCheckCell(scene, app));
    to = check.at?.[1] ?? to;
    const outcome = {...(check.value?.outcome ?? {}), threw: act.value.threw, launched: recorded?.recorded === true};
    Object.assign(row, {ok: check.ok && check.value?.ok === true && !act.value.threw && recorded?.recorded === true, outcome, ...(check.ok ? {} : {error: check.error})});
    if (after.watcher !== true) return push(ctx, {...row, ok: false, invalid: 'the activation watcher was not running after the launch'});
    push(ctx, row);
    ctx.judged.set(key, {row, oracle: {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: act.route, scene, userPid: userWindow.pid,
      launched: SCENES[scene].bundleId}});
    return row;
  } finally {
    if (from !== null) mark(ctx, 'row', key, [from, to ?? from]);
    const quit = quitLaunched(ctx);
    if (quit) row.outcome = {...(row.outcome ?? {}), quit: quit.quit};
  }
}

// The cleanup of a run that died (`native-matrix.mjs cleanup`): every launch the run journaled quit (while still the
// same process), the live hold's recovery and put-back, then the approved home's cleanup from the run's
// preparation.json when there is one. -> 0 when all held, else 1.
export function cleanupMatrix({device, run, preparation}, io) {
  const {ops, log = console.log} = io;
  const problems = [];
  const dirRun = run ?? `${ops.home()}/${DEFAULT_RUN}`;
  ops.journalTo?.(dirRun);
  quitLaunched({ops, run: dirRun, problems});
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
