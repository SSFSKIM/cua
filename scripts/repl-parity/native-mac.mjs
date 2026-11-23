// The native-mac parity suite's run (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system part 3, part 7's settle cell, the M2b milestone; the Decision Log's "M2b pre-flight" item 3 and the whole-M1b
// review's rule). One run is one lane: the real facade on the REPL host and the native engine it names, through the
// darwin native command (./native.mjs nativeMacCommand) on the mini's approved runtime and approved engine, driving the
// suite's scripted cells (test/repl-parity/scenarios/native-mac.mjs) on the four scenes (./scenes-mac.mjs). The vendor's
// run and cua's are compared by ./native-mac-diff.mjs.
//
//   node scripts/repl-parity.mjs prepare --device mini --commit <sha> --approved-runtime <home> --approved-engine <bundle>
//   node scripts/repl-parity.mjs run --device mini --approved-runtime <home> --approved-engine <bundle> --suite native-mac --host vendor|cua --engine vendor|cua --out <dir>
//
// A run, in order, the device steps over ssh in the harness checkout (scripts/native-baseline/remote.mjs PARITY_CHECKOUT,
// the commit the prepare placed), as the renderer goldens' recorder drives them (scripts/native-matrix/goldens.mjs):
//   - Refuses (exit 2), before the device is touched, on a controller checkout with uncommitted changes: the cells come
//     from this checkout, and the diff requires both lanes' cells from one commit.
//   - Reads the owner's front app, places Chrome for Testing and builds the Electron fixture, and takes the approved home
//     (scripts/native-baseline/prepare.mjs prepareRun: the admission, state/ and run/ moved aside, the approved engine
//     stopped with `shutdown`; preparation.json beside the run until the cleanup succeeds, the input of `goldens.mjs
//     cleanup --preparation` should the run die).
//   - Refuses unless the harness checkout is clean and at the prepared commit, the serve resolves the approved runtime,
//     the approved engine is the one --approved-engine names and its build is the checkout's
//     (scripts/native-baseline/engine.mjs checkApprovedEngine), and no scene refuses (a TextEdit, Chrome for Testing or
//     fixture the run did not start, a Finder window not the run's).
//   - Serves the lane with CUA_NATIVE_ENGINE pinned to --engine, answering only the scenes' approvals, and judges every js
//     result's engine attestation (`_meta['cua/nativeEngine']`): the first result before any scene, then each one, so a
//     run is stopped the moment another engine or build answers. Never the selection alone.
//   - Per scene, its app frontmost for every cell (the driven-app-frontmost regime of the baseline and the goldens): up
//     and its setup steps; bind; prime; cua's settled read of the fixed state (goldens-device.mjs observe); the fixed
//     text; cua's strict read (verify); the action's texts; verify again; the texts copied off the device; teardown and
//     down. A text whose state cua's read refused is removed on the device unread: the fixed text is taken again (three
//     attempts), the action's end the scene. A lane cell that fails is the lane's outcome, recorded for the diff.
//   - Always ends with every scene down, the lane closed, the approved home given back with the engine stopped
//     (prepare.mjs cleanupRun), and the owner's front app back in front. A scene's down is tried even when its teardown
//     steps failed (down checks for itself what is still the run's: Finder's refuses while the run's window is open), and
//     a scene that stayed up is tried once more at the end. One still up then leaves the approved home held and
//     preparation.json in place, so `goldens.mjs cleanup --preparation` restores it all in order (Finder's teardown,
//     every scene down, the engine stopped, the home given back): the run's journal goes only once nothing is left.
//     The owner's front app is put back last and checked: one that was to be put back and is not in front leaves the run
//     incomplete and the journal in place, the home recorded as given back, so the same cleanup tries the app again.
// It writes <out>/meta.json (the sitting's facts, the attestations, each scene's account with its window frame and its
// side reads, each with its frame and cua's engine timings; never a token, an identity or any accessibility text), <out>/results.jsonl (one row per scene and cell: bind, fixed, action, settle),
// <out>/texts/<scene>/<kind>.txt (full, before, diff, later) and <out>/result.json, the settle rows as the native
// matrix's settle cell (scripts/native-matrix/settle-cell.mjs), which its summary reads. Exit 0 complete, 1 incomplete, 2 refused.
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {StdioClient, textOf} from '../browser-parity/mcp.mjs';
import {FIRST, parseCell} from '../native-baseline/cells.mjs';
import {attestEngine, attestedBuild, checkApprovedEngine} from '../native-baseline/engine.mjs';
import {preflightScript} from '../native-baseline/remote.mjs';
import {hostAttestationOf} from '../native-baseline.mjs';
import {writeCellResult} from '../native-matrix/cell-result.mjs';
import {checkVendorPreflight, checkoutCli, controllerCheckout, deviceOps, frontPutBackHeld, frontPutBackProblem, isSceneApproval, settleRecordingProbes} from '../native-matrix/goldens.mjs';
import {isSessionFile} from '../native-matrix/goldens-cells.mjs';
import {REPO_ROOT} from '../native-matrix/goldens-install.mjs';
import {settleResult} from '../native-matrix/settle-cell.mjs';
import {ACTION, BIND, FIXED, PRIME} from '../../test/repl-parity/scenarios/native-mac.mjs';
import {EXPECTED_FILE, isSettled, validateDeclarations} from './native-mac-diff.mjs';
import {nativeMacCommand} from './native.mjs';
import {SCENES, SCENE_IDS} from './scenes-mac.mjs';

// The run directory on the device, under the account's home: one path for every lane, so the texts the scenes' own paths
// appear in (TextEdit's document URL) are the same on both engines.
export const DEFAULT_RUN = 'Library/Caches/cua-harness/repl-parity-native-mac';
const REFUSED = 2;
const CELL_MS = 60_000, BIND_MS = 120_000, FIXED_ATTEMPTS = 3;
const TEXT_KINDS = {fixed: ['full'], action: ['before', 'diff', 'later']};
const sha = text => createHash('sha256').update(text).digest('hex');
const lastJson = text => JSON.parse(String(text).trim().split('\n').at(-1));

// A scene that cannot go on: recorded as the run's problem, the scene taken down, the next one run.
class SceneProblem extends Error {}
// A signal the caller recorded (io.interrupt.signal): the run stops at its next step, then puts everything back.
class Interrupted extends Error {}
const SIGNAL_CODES = {SIGINT: 130, SIGTERM: 143};
const describeProblems = problems => problems.map(p => `${p.code}: ${p.message}`).join('; ');

// The device steps of a lane: the goldens recorder's (scenes, cua's side reads, the approved home, the files), with the
// preflight and the serve of the lane's own host and engine.
export function nativeMacOps(device, {exec} = {}) {
  const base = deviceOps(device, exec ? {exec} : {});
  const {ssh} = checkoutCli(device, exec ? {exec} : {});
  return {...base,
    preflight: (prepared, {host, engine, approvedEngine}) => lastJson(ssh(preflightScript({host, engine, approvedEngine, prepared, surface: 'computer'}))),
    serveSpec: ({pre, prepared, host, engine, approvedEngine}) => nativeMacCommand({device, host, engine, approvedEngine, pre, prepared}),
  };
}
export const nativeMacIo = device => ({ops: nativeMacOps(device), connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-repl-parity-native-mac', ...handlers}),
  controllerCheckout: () => controllerCheckout(REPO_ROOT), log: console.log});

// The lane's engine attestation (`record`: attestEngine's {attested, unattested}) against what was asked: one engine
// answered every result, the requested one, cua's at the approved version and the checkout's build, the vendor's at the
// runtime release. -> the problem, or null. (scripts/native-baseline/engine.mjs engineProblem's attestation half; its
// helper half does not apply, since cua's side reads run cua's engine on either lane, as the goldens' recorder's do.)
export function laneAttestationProblem(record, {engine, approved, checkoutBuild, release}) {
  if (record.unattested > 0) return `${record.unattested} js results carry no cua/nativeEngine attestation: the serve's engine is unknown`;
  if (record.attested.length !== 1) return `${record.attested.length} distinct engine attestations (${JSON.stringify(record.attested)}); one engine must answer every result`;
  const [answered] = record.attested;
  if (answered.engine !== engine) return `the ${answered.engine} engine answered, not the requested ${engine}`;
  if (engine === 'cua') {
    if (answered.build !== checkoutBuild) return `the attested build ${attestedBuild(answered.build)} is not the checkout's and approved build ${attestedBuild(checkoutBuild)}`;
    if (answered.version !== approved?.engineVersion) return `the attested version ${answered.version} is not the approved engine's ${approved?.engineVersion}`;
  } else if (answered.build !== release) return `the vendor engine attests the runtime ${attestedBuild(answered.build)}, not the run's ${release}`;
  return null;
}

// options: {device, host, engine, approvedRuntime, approvedEngine, commit (the prepared sitting's), sitting (the hold's id,
// in meta.json: the diff pairs two lanes only of one hold), out, run?}.
// io: {ops (nativeMacOps), connect(spec, handlers) -> MCP client, controllerCheckout() -> {commit, dirty}, log, sleep,
// interrupt? ({signal}: once set, the run stops before its next device step or lane cell, and its end runs as always)}.
// -> 0 complete, 1 incomplete, 2 refused, 130 or 143 interrupted.
export async function runNativeMac(options, io) {
  const {device, host, engine, approvedRuntime, approvedEngine, commit, sitting, out} = options;
  const {ops, log = console.log} = io;
  if (typeof sitting !== 'string' || !sitting) throw new Error('a native-mac lane needs the hold it belongs to (its sitting id): the diff pairs two lanes of one hold only');
  const dir = resolve(out);
  if (fs.existsSync(join(dir, 'meta.json'))) throw new Error(`${dir} already holds a run: choose a new --out`);
  fs.mkdirSync(dir, {recursive: true});
  const meta = {schema: 'native-mac-1', suite: 'native-mac', device, platform: 'darwin', host, engine, sitting, commit, approvedRuntime, approvedEngine,
    started: new Date().toISOString(), plan: {scenes: [...SCENE_IDS]}, problems: [], scenes: {}, elicitations: [], complete: false};
  const write = () => fs.writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  // The lane's settle rows as the matrix's settle cell (scripts/native-matrix/settle-cell.mjs), beside meta.json.
  const writeSettle = () => {
    const rows = fs.existsSync(join(dir, 'results.jsonl')) ? fs.readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    writeCellResult(dir, settleResult({meta, rows, declarations: validateDeclarations(JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8')))}));
  };
  const controller = io.controllerCheckout();
  meta.harness = {commit: controller.commit, dirty: controller.dirty};
  if (!controller.commit || controller.dirty) {
    meta.refused = [controller.commit ? 'this checkout has uncommitted changes to tracked files: the cells come from it, and both lanes must run one commit\'s cells; commit or stash them' : 'this checkout\'s commit could not be read'];
    meta.finished = new Date().toISOString(); write(); writeSettle();
    log(`refused: ${meta.refused.join('; ')}`);
    return REFUSED;
  }
  fs.writeFileSync(join(dir, 'results.jsonl'), '');
  const emit = row => fs.appendFileSync(join(dir, 'results.jsonl'), `${JSON.stringify(row)}\n`);
  const interrupt = io.interrupt ?? {signal: null};
  const checkpoint = () => { if (interrupt.signal) throw new Interrupted(`interrupted by ${interrupt.signal}`); };
  const ctx = {ops, meta, dir, emit, log, checkpoint, up: new Set(), prepared: null, js: null, run: null, fixtures: null};
  let client = null, frontmost = null, released = false;
  write();
  try {
    frontmost = ops.scenes(['frontmost']) ?? null;
    meta.frontmost = {bundleId: frontmost?.bundleId ?? null};
    ctx.fixtures = {chrome: ops.scenes(['place-chrome']), electron: ops.scenes(['build-electron'])};
    meta.fixtures = {chrome: {version: ctx.fixtures.chrome?.version ?? null}, electron: {electronVersion: ctx.fixtures.electron?.electronVersion ?? null, sourceHash: ctx.fixtures.electron?.sourceHash ?? null}};
    ctx.run = options.run ?? `${ops.home()}/${DEFAULT_RUN}`;
    ctx.prepared = ops.prepare(approvedRuntime);
    fs.writeFileSync(join(dir, 'preparation.json'), `${JSON.stringify({device, prepared: ctx.prepared, run: ctx.run, frontmost}, null, 2)}\n`, {mode: 0o600});
    log(`the approved home ${ctx.prepared.home} is held; if this run dies: node scripts/native-matrix/goldens.mjs cleanup --device ${device} --preparation ${join(dir, 'preparation.json')}`);
    checkpoint();
    if (!ctx.prepared.engineStop) throw new Error('the device\'s preparation did not stop cua\'s engine (every live run begins with cua engine stop, scripts/native-baseline/prepare.mjs): is the harness checkout at this sitting\'s commit?');
    meta.engineStop = {start: ctx.prepared.engineStop};

    const pre = ops.preflight(ctx.prepared, {host, engine, approvedEngine});
    checkVendorPreflight(pre, ctx.prepared, {commit, why: 'the sitting\'s prepare placed it there (repl-parity.mjs prepare), and both lanes run its checkout'});
    const {approved, checkoutBuild} = checkApprovedEngine(pre.engine, approvedEngine);
    Object.assign(meta, {runtimeRelease: pre.release, checkoutBuild, approved: {build: approved.build, engineVersion: approved.engineVersion, signature: approved.signature ?? null},
      hardware: pre.hardware ?? null, os: pre.os ?? null, display: pre.display ?? null});
    const scenesPreflight = ops.scenes(['preflight', '--run', ctx.run]);
    if (scenesPreflight.refusals?.length) throw new Error(`the scenes refuse: ${scenesPreflight.refusals.map(r => r.message).join('; ')}`);

    checkpoint();
    // The lane, judged on the attestation of every result.
    meta.engineAttestation = {attested: [], unattested: 0};
    const expected = {engine, approved, checkoutBuild, release: pre.release};
    const serveStderr = join(fs.mkdtempSync(join(tmpdir(), 'cua-native-mac-serve-')), 'serve-stderr.txt');
    ctx.serveStderr = serveStderr;
    client = io.connect(ops.serveSpec({pre, prepared: ctx.prepared, host, engine, approvedEngine}), {
      answer: msg => (isSceneApproval(msg, SCENE_IDS.map(id => SCENES[id].bundleId)) ? {action: 'accept', content: {}} : {action: 'decline'}),
      onElicitation: (row, msg) => meta.elicitations.push({t: row.t, app: msg.params?._meta?.tool_params?.app ?? null, action: row.action}),
      stderrFile: serveStderr,
    });
    const serverInfo = (await client.initialize())?.serverInfo ?? null;
    await client.request('tools/list');
    ctx.js = async (code, timeoutMs = CELL_MS) => {
      const result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000);
      attestEngine(meta.engineAttestation, result);
      if (!meta.hostAttestation) {
        meta.hostAttestation = hostAttestationOf(serverInfo, result);
        if (meta.hostAttestation.host !== host) throw new Error(`the ${meta.hostAttestation.host} host answered the lane, not the requested ${host}`);
      }
      const problem = laneAttestationProblem(meta.engineAttestation, expected);
      if (problem) throw new Error(problem);
      const parsed = parseCell(textOf(result));
      if (!parsed) throw new Error(`a cell printed no result marker${result?.isError ? ' (an error result)' : ''}`);
      return parsed;
    };
    const first = await ctx.js(FIRST, BIND_MS);
    if (!first.ok) throw new Error(`the lane's first cell failed: ${first.error}`);

    for (const id of SCENE_IDS) {
      try {
        checkpoint();
        await runScene(ctx, id);
        meta.scenes[id].recorded = true;
      } catch (error) {
        if (!(error instanceof SceneProblem)) throw error;
        meta.problems.push(`${id}: ${error.message}`);
        log(`${id}: ${error.message}`);
      } finally {
        if (ctx.up.has(id)) takeDown(ctx, id);
      }
      write();
      if (meta.probeSettlement?.ok === false) break;
    }
    meta.complete = SCENE_IDS.every(id => meta.scenes[id]?.recorded) && meta.problems.length === 0;
  } catch (error) {
    meta.error = error.message;
    if (error instanceof Interrupted) meta.interrupted = interrupt.signal;
    log(`run stopped: ${error.message}`);
  } finally {
    // No restoration may race a frame probe, even after a controller/SSH interruption.
    // The bounded final recovery: each scene still up gets one more teardown and down.
    for (const id of [...ctx.up]) takeDown(ctx, id);
    const probesSettled = !ctx.prepared || settleRecordingProbes(ctx).ok === true;
    const outstanding = [...ctx.up];
    for (const id of outstanding) meta.problems.push(`${id}: could not be brought down (${meta.scenes[id]?.takeDown?.failures.at(-1) ?? 'it stayed up'})`);
    if (client) {
      try { await client.call('end_task'); } catch {}
      try { await client.close(); } catch {}
    }
    if (ctx.prepared && !probesSettled) {
      meta.preparationCleanup = {deferred: 'probes are not confirmed settled; run cleanup again'};
      meta.problems.push('probe settlement failed; preparation.json and the approved home kept for cleanup');
    } else if (ctx.prepared && outstanding.length) {
      meta.preparationCleanup = {deferred: `the scenes ${outstanding.join(', ')} are still up`};
      log(`${outstanding.join(', ')} still up: the approved home stays held and ${join(dir, 'preparation.json')} kept; restore it all with node scripts/native-matrix/goldens.mjs cleanup --device ${device} --preparation ${join(dir, 'preparation.json')}`);
    } else if (ctx.prepared) {
      const file = join(dir, 'preparation.json');
      try {
        const cleanup = ops.cleanup(ctx.prepared);
        meta.preparationCleanup = {removed: cleanup.removed === true};
        if (cleanup.engineStop !== undefined) meta.engineStop = {...meta.engineStop, end: cleanup.engineStop};
        if (cleanup.removed !== true) throw new Error('the approved home\'s cleanup was not confirmed');
        // The home is given back (prepare.mjs cleanupRun gives it back even when its engine stop fails): the journal
        // says so, and goes only once the engine stopped and the owner's front app is back.
        fs.writeFileSync(file, `${JSON.stringify({...JSON.parse(fs.readFileSync(file, 'utf8')), preparationCleaned: true}, null, 2)}\n`, {mode: 0o600});
        if (cleanup.engineStop?.error) {
          log(`cua's engine did not stop: once it can, node scripts/native-matrix/goldens.mjs cleanup --device ${device} --preparation ${file}`);
          throw new Error(`cua's engine did not stop when the run ended: ${cleanup.engineStop.error}`);
        }
        released = true;
      } catch (error) { meta.preparationCleanup = {...meta.preparationCleanup, error: error.message}; meta.error ??= error.message; }
    }
    // The owner's front app, last: one that was to be put back and is not in front leaves the run incomplete, and the
    // journal (the home recorded as given back) lets goldens.mjs cleanup try it again.
    let frontHeld = true;
    if (probesSettled && frontmost?.bundleId) {
      meta.frontmost.putBack = putBackFrontmost(ops, frontmost);
      frontHeld = frontPutBackHeld(meta.frontmost.putBack);
      if (!frontHeld) meta.problems.push(frontPutBackProblem(meta.frontmost.putBack));
    }
    if (released && frontHeld) fs.rmSync(join(dir, 'preparation.json'), {force: true});
    else if (released) log(`the owner's front app is not back in front: node scripts/native-matrix/goldens.mjs cleanup --device ${device} --preparation ${join(dir, 'preparation.json')} tries again`);
    if (meta.problems.length || meta.error) meta.complete = false;
    meta.finished = new Date().toISOString();
    write();
    writeSettle();
    if (ctx.serveStderr) {
      if (fs.existsSync(ctx.serveStderr) && fs.statSync(ctx.serveStderr).size > 0) log(`the serve's stderr: ${ctx.serveStderr}`);
      else fs.rmSync(dirname(ctx.serveStderr), {recursive: true, force: true});
    }
  }
  log(`native-mac ${host}/${engine}: ${meta.complete ? 'complete' : `INCOMPLETE: ${meta.error ?? meta.problems.join('; ')}`}`);
  return meta.interrupted ? SIGNAL_CODES[meta.interrupted] ?? 1 : meta.complete ? 0 : 1;
}

// One scene on the lane: the cells between cua's side reads, its texts kept only once the state they were read from is
// the scene's. A cell's failure ends the scene as the lane's outcome (its row records it); a harness failure is a problem.
async function runScene(ctx, id) {
  const {ops, meta, run, emit} = ctx, scene = SCENES[id];
  const account = meta.scenes[id] = {};
  const checkBuild = answer => { if (answer.build !== meta.approved.build) throw new SceneProblem(`the engine that answered cua's read (build ${attestedBuild(answer.build)}) is not the approved one`); return answer; };
  // Each side read is recorded in the scene's account (sideRead), whatever it answered.
  account.sideReads = [];
  const read = (command, step) => {
    ctx.checkpoint();
    const answer = checkBuild(ops.goldens([command, id, '--run', run]));
    account.sideReads.push(sideRead(command, step, answer));
    return answer;
  };
  const record = bringUp(ctx, id);
  activate(ctx, id);
  const lane = async (cell, code, timeoutMs) => {
    ctx.checkpoint();
    const answer = await ctx.js(code, timeoutMs);
    if (!answer.ok) { emit({scene: id, cell, ok: false, error: answer.error}); account.outcome = `${cell} failed on the lane`; }
    return answer;
  };
  if (!(await lane('bind', BIND(id, record.app), BIND_MS)).ok) return;
  emit({scene: id, cell: 'bind', ok: true});
  // The prime's failure is the fixed state's: it is the first read of it.
  if (!(await lane('fixed', PRIME(id))).ok) return;

  let kept = null, last = null;
  for (let attempt = 1; attempt <= FIXED_ATTEMPTS && !kept; attempt++) {
    account.fixedAttempts = attempt;
    const before = read('observe', `fixed ${attempt}`);
    if (before.problems.length) { last = describeProblems(before.problems); continue; }
    const fixed = await lane('fixed', FIXED(id, scene.window.title));
    if (!fixed.ok) return;
    const files = filesOf(ctx, fixed.value, TEXT_KINDS.fixed);
    const after = read('verify', `fixed ${attempt}`);
    if (after.problems.length) { discard(ctx, files); last = describeProblems(after.problems); continue; }
    kept = {reads: fixed.value.reads, texts: Object.fromEntries(files.map(file => [file.kind, keep(ctx, id, file)]))};
    // The scene's frame: the window the kept fixed text was guarded in, which the diff pairs lanes by (checkPair).
    account.frame = after.frame ?? null;
  }
  if (!kept) throw new SceneProblem(`the fixed state did not hold in ${FIXED_ATTEMPTS} attempts (${last}); nothing of it was kept`);
  emit({scene: id, cell: 'fixed', ok: true, ...kept});

  activate(ctx, id);
  const action = await lane('action', ACTION(id, scene.window.title, scene.action));
  if (!action.ok) return;
  const files = filesOf(ctx, action.value, TEXT_KINDS.action);
  const after = read('verify', 'action');
  if (after.problems.length) {
    discard(ctx, files);
    throw new SceneProblem(`the state after the action is not the scene's (${describeProblems(after.problems)}); its texts were removed unread`);
  }
  const texts = Object.fromEntries(files.map(file => [file.kind, keep(ctx, id, file)]));
  emit({scene: id, cell: 'action', ok: true, index: action.value.index, texts});
  const keptText = kind => fs.readFileSync(join(ctx.dir, texts[kind].file), 'utf8');
  emit({scene: id, cell: 'settle', ok: true, settled: isSettled(keptText('diff'), keptText('later'))});
}

// A side read as the scene's account keeps it: which read, at which step (`fixed <attempt>` or `action`), the problem
// codes, the window's frame it read, and the engine's observation diagnostics as they come (`timings`: the enablement, the web-area wait, the
// settle; null when the read carried none). Recorded, never judged. The side reads are cua's engine on either lane, so
// these are cua's readings of the scene the lane drives; the lane's own reads return only text through the facade (cua's
// service passes no timings on, nor does the vendor's), so neither lane's own engine's timings reach the run.
const sideRead = (read, step, answer) => ({read, step, engine: 'cua', problems: (answer.problems ?? []).map(p => p.code), frame: answer.frame ?? null, timings: answer.timings ?? null});

function bringUp(ctx, id) {
  const {ops, run, fixtures} = ctx;
  const extra = id === 'chrome' ? ['--chrome-app', fixtures.chrome.appPath] : id === 'electron' ? ['--electron-app', fixtures.electron.appPath] : [];
  // Counted up before `up` answers: an up that failed part way may have started what down must stop (down of a scene
  // the run never brought up answers down).
  ctx.up.add(id);
  let record;
  try { record = ops.scenes(['up', id, '--run', run, ...extra]); } catch (error) { throw new SceneProblem(`it did not come up: ${error.message}`); }
  steps(ctx, id, 'setup');
  return record;
}
// A phase of the scene's steps on the device (goldens-device.mjs runSteps, through cua's engine under the key guard).
function steps(ctx, id, phase) {
  try { return ctx.ops.goldens(['steps', id, '--run', ctx.run, '--phase', phase]); } catch (error) { throw new SceneProblem(`its ${phase} steps stopped: ${error.message}`); }
}
// The scene's teardown steps, then its down whatever the steps answered; it leaves ctx.up only once down confirms it.
// Each attempt is in the scene's account (meta.scenes[id].takeDown); the run's finally decides what a scene still up means.
function takeDown(ctx, id) {
  const account = (ctx.meta.scenes[id] ??= {}).takeDown ??= {attempts: 0, failures: []};
  account.attempts++;
  const settlement = settleRecordingProbes(ctx);
  if (!settlement.ok) {
    account.failures.push(settlement.manual ?? settlement.error ?? 'probes are not confirmed settled');
    account.down = false;
    return;
  }
  try { steps(ctx, id, 'teardown'); } catch (error) { account.failures.push(error.message); }
  try {
    const down = ctx.ops.scenes(['down', id, '--run', ctx.run]);
    if (down.down) ctx.up.delete(id); else account.failures.push(down.reason ?? 'it stayed up');
  } catch (error) { account.failures.push(error.message); }
  account.down = !ctx.up.has(id);
}
function activate(ctx, id) {
  const front = ctx.ops.scenes(['activate', id, '--run', ctx.run]);
  if (!front.ok) throw new SceneProblem(`the scene did not come to the front (${front.reason ?? 'no answer'})`);
}

// The files a lane cell names, exactly `kinds` in that order; anything else is removed on the device unread.
function filesOf(ctx, value, kinds) {
  const files = Array.isArray(value?.files) ? value.files : [];
  if (files.length === kinds.length && files.every((file, i) => file?.kind === kinds[i])) return files;
  discard(ctx, files);
  throw new SceneProblem(`a lane cell named the files ${JSON.stringify(files.map(file => file?.kind ?? null))}, not ${kinds.join(', ')}; none was read`);
}
function discard(ctx, files) {
  for (const file of files) if (isSessionFile(ctx.prepared, file.path)) ctx.ops.discard(file.path);
}
// A text copied off the device (and removed there) into texts/<scene>/<kind>.txt: only one of the cells' files in the
// session's temp directory, and only the bytes the cell hashed. -> its row entry {file, sha256, bytes}.
function keep(ctx, id, file) {
  if (!isSessionFile(ctx.prepared, file.path)) throw new SceneProblem(`${file.kind} was written outside the session's temp directory; it was not read`);
  const text = ctx.ops.take(file.path);
  if (typeof text !== 'string' || sha(text) !== file.sha256) throw new SceneProblem(`${file.kind} changed between the cell and the copy; it was not kept`);
  const path = join('texts', id, `${file.kind}.txt`);
  fs.mkdirSync(join(ctx.dir, 'texts', id), {recursive: true});
  fs.writeFileSync(join(ctx.dir, path), text);
  return {file: path, sha256: file.sha256, bytes: Buffer.byteLength(text)};
}

// The owner's front app back in front (scenes-mac.mjs reactivateApp decides on the device whether it may be); its pid
// and the transport's text never reach meta.json.
function putBackFrontmost(ops, front) {
  try { return ops.scenes(['reactivate', '--bundle-id', front.bundleId, '--pid', String(front.pid)]); } catch (error) {
    return {error: 'the put-back of the front app failed', ...(Number.isInteger(error.status) ? {status: error.status} : {})};
  }
}
