#!/usr/bin/env node
// The live goldens recorder (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M1b: "the goldens'
// corrections expire here" and "Finder's golden is compared as full text"; Verification system part 3; the Decision
// Log's "M1b pre-flight" item 5). Run from this checkout on the controller; the device steps go over ssh to the harness
// checkout (scripts/native-baseline/remote.mjs's PARITY_CHECKOUT, placed at the sitting's commit), the way M0's
// measure.mjs drove its device side.
//
//   goldens.mjs record --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--scenes list] [--no-install]
//   goldens.mjs install <dir>          a complete recording into test/native-goldens/ (./goldens-install.mjs)
//   goldens.mjs check [--write] [--json]
//                                      re-render the pinned files (--write rewrites them) and audit every golden
//                                      against expected.json (test/native-goldens/audit.mjs): what no declaration covers,
//                                      what each declaration is needed for, and what is left once the expiring
//                                      declarations are deleted; exit 1 while anything is left to act on
//   goldens.mjs cleanup --device <alias> --preparation <dir>/preparation.json
//                                      finish what a recording that died left: Finder's teardown steps, every scene
//                                      down, the approved engine stopped, the approved home's cleanup (prepare.mjs)
//
// `record`, in one sitting and one run directory on the device (default ~/Library/Caches/cua-harness/native-goldens):
//   - Refuses before anything is prepared unless the approved engine exists and its build is the harness checkout's
//     and this checkout's (src/runtime/engine-bundle.mjs computes it).
//   - Places Chrome for Testing and builds the Electron fixture (M1b.2's single-sourced fixtures need a fresh build on
//     the device), reads the vendor's sizing config (again after the scenes), prepares the approved vendor runtime as
//     prepare.mjs's approved-home path does (admission, state/ and run/ moved aside and back, the run's helper stopped
//     at cleanup), stops the approved engine with `shutdown` at the start and the end, and refuses a dirty harness
//     checkout or a scene refusal (scripts/repl-parity/scenes-mac.mjs preflight). The vendor serve runs the vendor host
//     with CUA_NATIVE_ENGINE=vendor, and the lane stops before any scene unless its first result attests the vendor
//     engine at the serve's runtime release (vendorEngineProblem).
//   - Per scene, one at a time, with the scene's app frontmost for every capture: up and its setup steps (Finder's
//     list view, no selection, its sidebar, status bar and path bar hidden, sent through the engine under the key guard);
//     the vendor's bind; the fixed state, as cua's settled observation (read until two consecutive reads render alike,
//     ./goldens-device.mjs settledState), the vendor's full text, cua's settled observation again (verify: no problem
//     read through, as it guards the vendor's text already written), kept only when both
//     of cua's pass the scene's fixed-state checks (fixedStateProblems, the run's process and window) and render alike,
//     else taken again (three attempts); the vendor's action sequence (its full text, the click on
//     the scene's action target, its diff), kept only when cua's check of the state right after passes; the scene back
//     to the fixed state (Finder: its selection cleared in the same window; the others restarted); cua's action sequence
//     on one engine connection (./goldens-device.mjs act); then the teardown steps and down.
//   - Writes <out>/goldens/<scene>/<file> in PROVENANCE's layout, <out>/meta.json (builds, device, fixtures, sizing
//     config, each capture's window frame and the engine's diagnostics, Finder's chrome record (recordChrome); never a token, a signing identity or any
//     accessibility text) and, when complete, installs it (--no-install leaves that to `install`).
// Nothing it writes carries content of a window the run does not own: cua's Skyshots are checked on the device before
// they leave it, and a vendor text is copied off the device only after cua's check of the same state passed; otherwise
// it is removed there unread.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient, textOf} from '../browser-parity/mcp.mjs';
import {quote, remoteCommand} from '../browser-parity/topology.mjs';
import {FIRST, parseCell} from '../native-baseline/cells.mjs';
import {attestedBuild} from '../native-baseline/engine.mjs';
import {PARITY_CHECKOUT, preflightScript, preparationScript, serveCommand} from '../native-baseline/remote.mjs';
import {hostAttestationOf} from '../native-baseline.mjs';
import {declaredDevice} from '../repl-parity/devices.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {engineBuild, engineVersion} from '../../src/runtime/engine-bundle.mjs';
import {shortBuild} from '../../src/runtime/engine.mjs';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {ACTION, BIND, FIXED, isSessionFile} from './goldens-cells.mjs';
import {RESET_MAY_CLEAR, stateDigest} from './goldens-device.mjs';
import {normalizeDrift} from '../../test/native-goldens/compare.mjs';
import {GOLDENS_DIR, REPO_ROOT, SCENE_ORDER, install} from './goldens-install.mjs';

export {SCENE_ORDER};
const SCRIPT = fileURLToPath(import.meta.url);
const REFUSED = 2;
const CELL_MS = 60_000, BIND_MS = 120_000;
const FIXED_ATTEMPTS = 3, RETRY_MS = 1000, START_ATTEMPTS = 3;
const VENDOR_ACTION_FILES = ['action.vendor.before.txt', 'action.vendor.diff.txt'];
export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-goldens';
const sha = text => createHash('sha256').update(text).digest('hex');
const lastJson = text => JSON.parse(String(text).trim().split('\n').at(-1));

// A scene's recording that cannot go on: recorded as the run's problem, the scene taken down, the next one recorded.
class SceneProblem extends Error {}
const describeProblems = problems => problems.map(p => `${p.code}: ${p.message}`).join('; ');

// ---- the device ---------------------------------------------------------------------------------------------------

// The device steps over ssh, in the harness checkout. Each answer is the command's last JSON line.
export function deviceOps(device, {exec = execFileSync} = {}) {
  if (declaredDevice(device).platform !== 'darwin') throw new Error(`${device} is not a macOS device`);
  const ssh = script => { const {command, args} = remoteCommand(device, script); return exec(command, args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024}); };
  const inCheckout = script => ssh(`cd ${PARITY_CHECKOUT} && ${script}`);
  // A device CLI's answer: its JSON line, also on exit 1 when it is an answer (a refusal, a scene still up, an
  // activation that failed); an {error} throws with its text.
  const cli = (file, args, {answersOnFailure = false} = {}) => {
    const label = `${file.split('/').at(-1)} ${args[0]}${args[1] && !args[1].startsWith('--') ? ` ${args[1]}` : ''}`;
    let out;
    try { out = lastJson(inCheckout(`node ${file} ${args.map(quote).join(' ')}`)); } catch (error) {
      let answer = null;
      try { answer = lastJson(error.stdout ?? ''); } catch {}
      if (answersOnFailure && answer && !answer.error && (answer.refusals?.length || answer.down === false || answer.ok === false)) return answer;
      if (answer?.error) throw new Error(`${label}: ${answer.error}`);
      throw error;
    }
    if (out?.error) throw new Error(`${label}: ${out.error}`);
    return out;
  };
  return {
    goldens: args => cli('scripts/native-matrix/goldens-device.mjs', args),
    scenes: args => cli('scripts/repl-parity/scenes-mac.mjs', args, {answersOnFailure: true}),
    prepare: approvedHome => lastJson(ssh(preparationScript('prepare', {device, approvedHome}))),
    cleanup: prepared => lastJson(ssh(preparationScript('cleanup', prepared))),
    // The vendor lane names its engine as the native baseline's lanes do (CUA_NATIVE_ENGINE, scripts/native-baseline/
    // engine.mjs), so the account's ~/.config/cua/engine.json, under the account's HOME here, never chooses it.
    preflight: prepared => lastJson(ssh(preflightScript({host: 'vendor', engine: 'vendor', prepared, surface: 'computer'}))),
    home: () => ssh('printf %s "$HOME"').trim(),
    sizingConfig: () => inCheckout('bash scripts/native-baseline/read-sizing-config.sh'),
    take: path => ssh(`cat ${quote(path)} && rm -f ${quote(path)}`),
    discard: path => { ssh(`rm -f ${quote(path)}`); },
    serveSpec: ({pre, prepared}) => serveCommand({device, checkout: pre.checkout, home: pre.home, userHome: prepared.userHome, configHome: prepared.configHome,
      tmpdir: prepared.tmpdir, admission: prepared.admission, xSession: {}, host: 'vendor', engine: 'vendor', platform: 'darwin', surface: 'computer'}),
  };
}

// ---- the recording ------------------------------------------------------------------------------------------------

// The vendor's approval: a computer-use elicitation for one of the scenes' apps, nothing else.
export function isSceneApproval(msg, bundleIds) {
  if (msg?.method !== 'elicitation/create') return false;
  const meta = msg.params?._meta ?? {}, tool = meta.tool_params;
  return meta.connector_id === 'computer-use' && tool !== null && typeof tool === 'object' && Object.keys(tool).length === 1 && bundleIds.includes(tool.app);
}

// The engine attestation of the vendor lane's first js result (the proxy's launch attestation, `_meta['cua/nativeEngine']`)
// against the vendor engine at the serve's runtime release, as scripts/native-baseline/engine.mjs engineProblem judges a
// vendor-engine run: anything else would record cua's own rendering as the vendor's goldens. -> the problem, or null.
export function vendorEngineProblem(result, release) {
  const attested = result?._meta?.['cua/nativeEngine'];
  if (!attested || typeof attested !== 'object') return 'the vendor lane\'s first result carries no cua/nativeEngine attestation: the serve\'s engine is unknown';
  if (attested.engine !== 'vendor') return `the ${attested.engine} engine answered the vendor lane, not the vendor engine (is CUA_NATIVE_ENGINE or ~/.config/cua/engine.json selecting another?)`;
  if (attested.build !== release) return `the vendor engine attests the runtime ${attestedBuild(attested.build)}, not the prepared ${release}`;
  return null;
}

const renderedText = shot => render(shot, advanceNumbering(null, shot));
// The engine's frame is a JSON object whose key order varies between answers (the 04:53Z hold's Finder frames were
// identical and still read as moved), so frames are compared by their four numbers, never by their serialization.
const FRAME_KEYS = ['x', 'y', 'width', 'height'];
export const sameFrame = (a, b) => (a == null || b == null ? a == null && b == null : FRAME_KEYS.every(k => a[k] === b[k]));

// io: {ops (deviceOps), connect(spec, handlers) -> MCP client, controllerBuild() -> {build, engineVersion},
// controllerCheckout() -> {commit, dirty}, log, sleep}. -> 0 complete, 1 incomplete, 2 refused before anything was prepared.
export async function record(options, io) {
  const {device, approvedRuntime, out, scenes = SCENE_ORDER, install: installing = true, goldensDir = GOLDENS_DIR, repoRoot = REPO_ROOT} = options;
  const {ops, log = console.log} = io;
  const sleep = io.sleep ?? (ms => new Promise(done => setTimeout(done, ms)));
  const dir = resolve(out);
  if (fs.existsSync(join(dir, 'meta.json'))) throw new Error(`${dir} already holds a recording (complete, incomplete or refused): choose a new --out`);
  fs.mkdirSync(join(dir, 'goldens'), {recursive: true});
  const meta = {schema: 'native-goldens-1', device, started: new Date().toISOString(), plan: {scenes}, problems: [], complete: false, scenes: {}, elicitations: []};
  const write = () => fs.writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  // The build gate first, reading only: nothing is prepared or launched for an engine the recording may not use.
  const checked = ops.goldens(['engine-check']);
  const controller = io.controllerBuild();
  meta.engine = checked.engine;
  meta.checkout = {build: checked.checkout?.build ?? null};
  // The start-state check compares the controller's rendering with the device's (stateDigest on both sides), so both
  // must run one renderer: a clean controller checkout here, the device's commit equal to it after its preflight.
  const checkout = io.controllerCheckout();
  meta.controller = {build: controller.build, commit: checkout.commit, dirty: checkout.dirty};
  const refusals = [...checked.problems];
  if (!checkout.commit) refusals.push('this checkout\'s commit could not be read: the start-state digest needs the controller and the device on one commit');
  if (checkout.dirty) refusals.push('this checkout has uncommitted changes to tracked files: the start-state digest needs the controller to render as the device\'s commit does; commit or stash them');
  if (checked.engine && controller.build !== checked.engine.build) refusals.push(`this checkout's engine build ${shortBuild(controller.build)} is not the approved ${shortBuild(checked.engine.build)}: record from the checkout the approved engine was built from`);
  if (refusals.length) {
    meta.refused = refusals; meta.finished = new Date().toISOString(); write();
    log(`refused: ${refusals.join('; ')}`);
    return REFUSED;
  }

  const ctx = {ops, meta, dir, sleep, log, up: new Set(), prepared: null, js: null, frontmost: null};
  let client = null, stopped = false;
  write();
  try {
    // The app the owner has in front, read before anything is prepared and put back at the very end (putBackFrontmost);
    // its pid stays out of meta.json, in preparation.json only, for a cleanup to put it back too.
    ctx.frontmost = ops.scenes(['frontmost']) ?? null;
    meta.frontmost = {bundleId: ctx.frontmost?.bundleId ?? null};
    meta.fixtures = {chrome: ops.scenes(['place-chrome']), electron: ops.scenes(['build-electron'])};
    readSizingConfig(ctx, 'before');
    ctx.run = options.run ?? `${ops.home()}/${DEFAULT_RUN}`;
    meta.runDir = ctx.run;

    ctx.prepared = ops.prepare(approvedRuntime);
    fs.writeFileSync(join(dir, 'preparation.json'), `${JSON.stringify({device, prepared: ctx.prepared, run: ctx.run, frontmost: ctx.frontmost}, null, 2)}\n`, {mode: 0o600});
    log(`the approved home ${ctx.prepared.home} is held; if this recording dies, run: node scripts/native-matrix/goldens.mjs cleanup --device ${device} --preparation ${quote(join(dir, 'preparation.json'))} (${CLEANUP_STEPS})`);
    meta.vendor = {home: ctx.prepared.home};
    meta.engineStopAtStart = ops.goldens(['engine-stop']);
    stopped = true;
    const pre = ops.preflight(ctx.prepared);
    Object.assign(meta.checkout, {commit: pre.commit, dirty: pre.dirty});
    Object.assign(meta, {hardware: pre.hardware, os: pre.os, display: pre.display});
    Object.assign(meta.vendor, {release: pre.release ?? null, runtimeRoot: pre.runtimeRoot ?? null});
    // The native baseline's refusals for a vendor serve (scripts/native-baseline.mjs runBaseline).
    if (pre.dirty) throw new Error('the harness checkout is dirty');
    if (pre.commit !== checkout.commit) throw new Error(`the harness checkout is at ${pre.commit}, this checkout at ${checkout.commit}: the start-state digest needs both on one commit (one renderer); place the harness checkout at this commit`);
    if (!pre.release) throw new Error('no runtime installed in the approved home');
    if (pre.serves) throw new Error('a serve of the harness checkout is already running on the device');
    const reuse = ctx.prepared.runtimeReuse ?? null;
    if (!reuse || pre.home !== reuse.approvedHome || pre.runtimeRoot !== reuse.runtimeRoot)
      throw new Error(`the serve resolves the runtime ${pre.runtimeRoot}, not the approved ${reuse?.runtimeRoot ?? '(none prepared)'}; refusing rather than serving another copy`);

    const preflight = ops.scenes(['preflight', '--run', ctx.run]);
    if (preflight.refusals?.length) throw new Error(`the scenes refuse: ${preflight.refusals.map(r => r.message).join('; ')}`);

    const bundleIds = SCENE_ORDER.map(id => SCENES[id].bundleId);
    client = io.connect(ops.serveSpec({pre, prepared: ctx.prepared}), {
      answer: msg => (isSceneApproval(msg, bundleIds) ? {action: 'accept', content: {}} : {action: 'decline'}),
      onElicitation: (row, msg) => meta.elicitations.push({t: row.t, app: msg.params?._meta?.tool_params?.app ?? null, action: row.action}),
      // Outside the recording, which is committed: the serve's stderr is a diagnostic, not evidence.
      stderrFile: ctx.serveStderr = join(fs.mkdtempSync(join(tmpdir(), 'cua-goldens-serve-')), 'serve-stderr.txt'),
    });
    const serverInfo = (await client.initialize())?.serverInfo ?? null;
    await client.request('tools/list');
    ctx.js = async (code, timeoutMs = CELL_MS) => {
      const result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000);
      if (!meta.vendor.hostAttestation) {
        meta.vendor.hostAttestation = hostAttestationOf(serverInfo, result);
        if (meta.vendor.hostAttestation.host !== 'vendor') throw new Error(`the vendor lane was answered by the ${meta.vendor.hostAttestation.host} host`);
        const problem = vendorEngineProblem(result, pre.release);
        meta.vendor.engineAttestation = result?._meta?.['cua/nativeEngine'] ?? null;
        if (problem) throw new Error(problem);
      }
      const parsed = parseCell(textOf(result));
      if (!parsed) throw new SceneProblem(`a vendor cell printed no result marker${result?.isError ? ' (an error result)' : ''}`);
      return parsed;
    };
    const first = await ctx.js(FIRST, BIND_MS);
    if (!first.ok) throw new Error(`the vendor's first cell failed: ${first.error}`);

    for (const id of scenes) {
      try {
        await recordScene(ctx, id);
        meta.scenes[id].recorded = true;
      } catch (error) {
        if (!(error instanceof SceneProblem)) throw error;
        meta.problems.push(`${id}: ${error.message}`);
        log(`${id}: ${error.message}`);
      } finally {
        if (ctx.up.has(id)) takeDown(ctx, id);
      }
      write();
    }
    // Read again while the run's vendor helper still runs: the config it fetched for this sitting's captures.
    readSizingConfig(ctx, 'after');
    meta.complete = scenes.every(id => meta.scenes[id]?.recorded) && meta.problems.length === 0;
  } catch (error) {
    meta.error = error.message;
    log(`recording stopped: ${error.message}`);
  } finally {
    for (const id of [...ctx.up]) takeDown(ctx, id);
    if (client) {
      try { await client.call('end_task'); } catch {}
      try { await client.close(); } catch {}
    }
    if (stopped) { try { meta.engineStopAtEnd = ops.goldens(['engine-stop']); } catch (error) { meta.engineStopAtEnd = {error: error.message}; meta.complete = false; } }
    if (ctx.prepared) {
      try { meta.preparationCleanup = ops.cleanup(ctx.prepared); fs.rmSync(join(dir, 'preparation.json'), {force: true}); }
      catch (error) { meta.preparationCleanup = {removed: false, error: error.message}; meta.complete = false; }
    }
    if (ctx.frontmost?.bundleId) meta.frontmost.putBack = putBackFrontmost(ops, ctx.frontmost);
    if (meta.problems.length || meta.error) meta.complete = false;
    meta.finished = new Date().toISOString();
    write();
    // The serve's stderr: removed when it holds nothing, else left where it is and named on the console only.
    if (ctx.serveStderr) {
      if (fs.existsSync(ctx.serveStderr) && fs.statSync(ctx.serveStderr).size > 0) log(`the vendor serve's stderr: ${ctx.serveStderr}`);
      else fs.rmSync(dirname(ctx.serveStderr), {recursive: true, force: true});
    }
  }
  if (meta.complete && installing) {
    meta.installed = install(dir, {goldensDir, repoRoot});
    write();
  }
  log(`recording ${meta.complete ? 'complete' : `INCOMPLETE: ${meta.error ?? meta.problems.join('; ')}`}${meta.installed ? `; installed into ${goldensDir}` : ''}`);
  return meta.complete ? 0 : 1;
}

// The vendor's screenshot sizing config (Statsig 406601636, scripts/native-baseline/read-sizing-config.sh), which the
// spec has re-read before goldens are recorded: before the vendor lane and after its captures.
function readSizingConfig({ops, meta}, when) {
  try { (meta.sizingConfig ??= {})[when] = {readAt: new Date().toISOString(), lines: ops.sizingConfig().trim().split('\n')}; }
  catch (error) { meta.problems.push(`the vendor's sizing config could not be read ${when} the captures: ${error.message.split('\n')[0]}`); }
}

// One scene: both lanes on its fixed state, then each lane's action from it.
async function recordScene(ctx, id) {
  const {ops, meta, run} = ctx;
  const scene = meta.scenes[id] = {captures: []};
  let record = bringUp(ctx, id);
  Object.assign(scene, {app: record.app, pid: record.pid, window: record.window});
  const capture = (name, frame, extra = {}) => scene.captures.push({name, at: new Date().toISOString(), frame: frame ?? null, ...extra});
  const checkBuild = answer => { if (answer.build !== meta.engine.build) throw new SceneProblem(`the engine that answered (build ${shortBuild(answer.build)}) is not the approved one`); return answer; };
  // A read before anything of the state is captured may wait out a scene still loading (observe); a read guarding a
  // vendor capture already written refuses on any problem (verify), so an owner window put in front while the vendor
  // captured is never waited out and its texts are removed unread.
  const observe = () => checkBuild(ops.goldens(['observe', id, '--run', run]));
  const verify = () => checkBuild(ops.goldens(['verify', id, '--run', run]));

  activate(ctx, id);
  const bound = await ctx.js(BIND(id, record.app), BIND_MS);
  if (!bound.ok) throw new SceneProblem(`the vendor could not bind the scene: ${bound.error}`);

  // The fixed state: the vendor's text between two of cua's observations that pass the checks and render alike.
  let kept = false, last = null, fixedShot = null;
  for (let attempt = 1; attempt <= FIXED_ATTEMPTS && !kept; attempt++) {
    if (attempt > 1) await ctx.sleep(RETRY_MS);
    scene.fixedAttempts = attempt;
    const first = observe();
    if (first.problems.length) { last = describeProblems(first.problems); continue; }
    const vendor = await ctx.js(FIXED(id, SCENES[id].window.title));
    if (!vendor.ok) throw new SceneProblem(`the vendor's fixed text failed: ${vendor.error}`);
    const [text] = filesOf(ctx, vendor.value, ['vendor.txt']);
    const second = verify();
    const drift = !second.problems.length && renderedText(first.skyshot) !== renderedText(second.skyshot);
    if (second.problems.length || drift) {
      discard(ctx, [text]);
      last = second.problems.length ? describeProblems(second.problems) : 'the state moved between cua\'s two observations';
      continue;
    }
    writeGolden(ctx, id, 'vendor.txt', take(ctx, text));
    writeGolden(ctx, id, 'skyshot.json', `${JSON.stringify(second.skyshot, null, 1)}\n`);
    scene.fixedDigest = stateDigest(second.skyshot);
    fixedShot = second.skyshot;
    capture('fixed.cua', first.frame, {timings: first.timings, settle: first.settle ?? null});
    capture('fixed.cua', second.frame, {timings: second.timings, settle: second.settle ?? null, kept: true});
    kept = true;
  }
  if (!kept) throw new SceneProblem(`the fixed state did not hold in ${FIXED_ATTEMPTS} attempts (${last}); nothing of it was recorded`);

  // The vendor's action, read only once cua has checked the state it left.
  activate(ctx, id);
  const action = await ctx.js(ACTION(id, SCENES[id].window.title, SCENES[id].action));
  if (!action.ok) throw new SceneProblem(`the vendor's action failed: ${action.error}`);
  const actionFiles = filesOf(ctx, action.value, VENDOR_ACTION_FILES);
  const after = verify();
  if (after.problems.length) {
    discard(ctx, actionFiles);
    throw new SceneProblem(`the state after the vendor's action is not the scene's (${describeProblems(after.problems)}); its texts were removed unread`);
  }
  for (const file of actionFiles) writeGolden(ctx, id, file.kind, take(ctx, file));
  capture('action.vendor', after.frame, {index: action.value.index, timings: after.timings});

  // Back to the fixed state, then cua's action on one engine connection, from the kept fixed state: the device clicks
  // only once its settled observation renders as the kept Skyshot does, and the controller checks the same of what it
  // returns. A start a reset may clear (a selection the reset left, a page that did not fill or settle) is reset again.
  let acted = null, why = null;
  const mismatch = (attempt, observed) => (scene.startMismatches ??= []).push({attempt, ...startDiagnostic(fixedShot, observed)});
  for (let attempt = 1; attempt <= START_ATTEMPTS && !acted; attempt++) {
    scene.startAttempts = attempt;
    if (id === 'finder') steps(ctx, id, 'reset');
    else { takeDown(ctx, id, {strict: true}); record = bringUp(ctx, id); scene.restarted = {pid: record.pid, window: record.window}; }
    activate(ctx, id);
    const answer = checkBuild(ops.goldens(['action', id, '--run', run, '--expect', scene.fixedDigest]));
    if (answer.problems.length && !answer.problems.every(p => RESET_MAY_CLEAR.includes(p.code))) throw new SceneProblem(`cua's action did not record: ${describeProblems(answer.problems)}`);
    if (answer.problems.length) { why = describeProblems(answer.problems); if (answer.observed) mismatch(attempt, answer.observed); }
    else if (stateDigest(answer.before) !== scene.fixedDigest) { why = 'cua\'s observation before its click is not the kept fixed state'; mismatch(attempt, answer.before); }
    else acted = answer;
  }
  if (!acted) throw new SceneProblem(`cua's action could not start from the fixed state in ${START_ATTEMPTS} resets (${why}); nothing of it was recorded`);
  writeGolden(ctx, id, 'action.before.skyshot.json', `${JSON.stringify(acted.before, null, 1)}\n`);
  writeGolden(ctx, id, 'action.after.skyshot.json', `${JSON.stringify(acted.after, null, 1)}\n`);
  capture('action.cua.before', acted.frames?.[0], {click: acted.click, timings: acted.timings?.before ?? null, settle: acted.settle ?? null});
  capture('action.cua.after', acted.frames?.[1], {timings: acted.timings?.after ?? null});

  // Finder's one window holds every capture, so its frame must not have moved; the others' are recorded as they were.
  const frames = scene.captures.map(c => ({capture: c.name, frame: c.frame}));
  scene.frames = {same: frames.every(f => sameFrame(f.frame, frames[0].frame)), list: frames};
  if (id === 'finder' && !scene.frames.same) throw new SceneProblem('the run\'s Finder window moved between captures; its two lanes are not on one frame');
}

function bringUp(ctx, id) {
  const {ops, meta, run} = ctx;
  const extra = id === 'chrome' ? ['--chrome-app', meta.fixtures.chrome.appPath] : id === 'electron' ? ['--electron-app', meta.fixtures.electron.appPath] : [];
  // A refusal arrives as `up`'s {error, refusals}, which ops.scenes throws with its text.
  let record;
  try { record = ops.scenes(['up', id, '--run', run, ...extra]); } catch (error) { throw new SceneProblem(`it did not come up: ${error.message}`); }
  ctx.up.add(id);
  steps(ctx, id, 'setup');
  return record;
}

// A phase of the scene's steps on the device (./goldens-device.mjs runSteps); a step that cannot be sent stops the scene.
function steps(ctx, id, phase) {
  let out;
  try { out = ctx.ops.goldens(['steps', id, '--run', ctx.run, '--phase', phase]); } catch (error) { throw new SceneProblem(`its ${phase} steps stopped: ${error.message}`); }
  recordChrome(ctx.meta.scenes[id], phase, out?.steps ?? []);
  return out;
}

// Finder's chrome as its setup and teardown steps report it, into the scene's meta: the owner's visible state the setup
// observed, the toggles each phase sent per part, and whether the teardown brought the window back to that state. Only
// booleans and counts: the device's steps carry nothing else.
function recordChrome(scene, phase, done) {
  const parts = done.filter(step => step.chrome);
  const recorded = done.find(step => step.visibleState === 'record');
  if (!scene || (!parts.length && !recorded)) return;
  const chrome = scene.chrome ??= {visible: null, setupToggles: {}, teardownToggles: {}, restored: false};
  if (recorded) chrome.visible = Object.fromEntries(Object.entries(recorded.visible ?? {}).map(([part, shown]) => [part, shown === true]));
  const toggles = Object.fromEntries(parts.map(step => [step.chrome, Number(step.toggles) || 0]));
  if (phase === 'setup') chrome.setupToggles = toggles;
  if (phase === 'teardown') { chrome.teardownToggles = toggles; chrome.restored = done.some(step => step.visibleState === 'restored'); }
}

// The scene's teardown steps, then down. A failure is the run's problem; `strict` (a restart) stops the scene too.
function takeDown(ctx, id, {strict = false} = {}) {
  const {ops, meta, run} = ctx;
  let reason = null;
  try {
    steps(ctx, id, 'teardown');
    const down = ops.scenes(['down', id, '--run', run]);
    if (down.down) ctx.up.delete(id);
    else reason = down.reason ?? 'it stayed up';
  } catch (error) { reason = error.message; }
  if (reason === null) return;
  meta.problems.push(`${id}: could not be brought down (${reason})`);
  if (strict) throw new SceneProblem(`could not be restarted for cua's action (${reason})`);
}

function activate(ctx, id) {
  const front = ctx.ops.scenes(['activate', id, '--run', ctx.run]);
  if (!front.ok) throw new SceneProblem(`the scene did not come to the front (${front.reason ?? 'no answer'})`);
}

// A vendor file copied off the device (and removed there): only one of the recorder's in the session's temp directory,
// and only bytes the cell hashed.
function take(ctx, file) {
  if (!isSessionFile(ctx.prepared, file.path)) throw new SceneProblem(`${file.kind} was written outside the session's temp directory; it was not read`);
  const text = ctx.ops.take(file.path);
  if (sha(text) !== file.sha256) throw new SceneProblem(`${file.kind} changed between the cell and the copy; it was not kept`);
  return text;
}
// Why a start was not the kept fixed state, bounded for meta.json (never a golden): how many rendered lines differ,
// the drift normalized, and the first differing pair, clipped. Both renderings passed the scene's owner-content checks.
const DIAGNOSTIC_CHARS = 200;
export function startDiagnostic(kept, observed) {
  const lines = shot => normalizeDrift(renderedText(shot)).split('\n');
  const a = lines(kept), b = lines(observed);
  const differing = Array.from({length: Math.max(a.length, b.length)}, (_, i) => i).filter(i => a[i] !== b[i]);
  const clip = line => (line === undefined ? null : line.length > DIAGNOSTIC_CHARS ? `${line.slice(0, DIAGNOSTIC_CHARS - 3)}...` : line);
  const first = differing[0];
  return {differingLines: differing.length, lines: {kept: a.length, observed: b.length},
    first: first === undefined ? null : {line: first + 1, kept: clip(a[first]), observed: clip(b[first])}};
}

// The files a vendor cell names, exactly `kinds` in that order (a kind becomes a golden's file name); anything else is
// removed on the device unread.
function filesOf(ctx, value, kinds) {
  const files = Array.isArray(value?.files) ? value.files : [];
  if (files.length === kinds.length && files.every((file, i) => file?.kind === kinds[i])) return files;
  discard(ctx, files);
  throw new SceneProblem(`a vendor cell named the files ${JSON.stringify(files.map(file => file?.kind ?? null))}, not ${kinds.join(', ')}; none was read`);
}
function discard(ctx, files) {
  for (const file of files) if (isSessionFile(ctx.prepared, file.path)) ctx.ops.discard(file.path);
}
function writeGolden(ctx, id, name, text) {
  fs.mkdirSync(join(ctx.dir, 'goldens', id), {recursive: true});
  fs.writeFileSync(join(ctx.dir, 'goldens', id, name), text, {mode: 0o644});
}

// The owner's front app back in front (scripts/repl-parity/scenes-mac.mjs reactivateApp decides on the device whether it
// may be). -> {reactivated, inFront?, reason?} or {error}; never the pid.
function putBackFrontmost(ops, front) {
  try { return ops.scenes(['reactivate', '--bundle-id', front.bundleId, '--pid', String(front.pid)]); } catch (error) { return {error: error.message}; }
}

// What a dead recording leaves and `cleanup` undoes, in order.
const CLEANUP_STEPS = 'Finder\'s teardown steps (goldens-device.mjs steps finder --phase teardown), scenes-mac.mjs down all --run <run>, goldens-device.mjs engine-stop, the approved home\'s cleanup, then the owner\'s front app put back';

// The cleanup of a recording that died, from its preparation.json ({device, prepared, run, frontmost?}): each step tried
// whatever the one before answered. -> {finderTeardown, scenesDown, engineStop, preparationCleanup, frontmost?}.
export function cleanupRecording({prepared, run, frontmost = null}, ops) {
  const tried = fn => { try { return fn(); } catch (error) { return {error: error.message}; } };
  return {
    finderTeardown: tried(() => ops.goldens(['steps', 'finder', '--run', run, '--phase', 'teardown'])),
    scenesDown: tried(() => ops.scenes(['down', 'all', '--run', run])),
    engineStop: tried(() => ops.goldens(['engine-stop'])),
    preparationCleanup: tried(() => ops.cleanup(prepared)),
    ...(frontmost?.bundleId ? {frontmost: putBackFrontmost(ops, frontmost)} : {}),
  };
}

// ---- the CLI ------------------------------------------------------------------------------------------------------

export const USAGE = 'usage: goldens.mjs record --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--scenes list] [--no-install] | goldens.mjs install <dir> | goldens.mjs check [--write] [--json] | goldens.mjs cleanup --device <alias> --preparation <file>';
const OPTIONS = {device: {type: 'string'}, 'approved-runtime': {type: 'string'}, out: {type: 'string'}, run: {type: 'string'}, scenes: {type: 'string'},
  'no-install': {type: 'boolean', default: false}, write: {type: 'boolean', default: false}, json: {type: 'boolean', default: false}, preparation: {type: 'string'}};

const fail = message => { throw new Error(`${message}\n${USAGE}`); };
const absolute = (value, name) => { if (value !== undefined && (!isAbsolute(value) || value.includes('\n'))) fail(`--${name} needs an absolute path`); return value; };

export function parseCommand(argv) {
  let parsed;
  try { parsed = parseArgs({args: argv, allowPositionals: true, options: OPTIONS}); } catch (error) { fail(error.message); }
  const {values, positionals: [command, ...rest]} = parsed;
  if (command === 'check') return {command, write: values.write, json: values.json};
  if (command === 'install') { if (rest.length !== 1) fail('install takes the recording\'s directory'); return {command, dir: resolve(rest[0])}; }
  if (!values.device) fail('--device is required');
  if (command === 'cleanup') return {command, device: values.device, preparation: absolute(values.preparation, 'preparation') ?? fail('cleanup needs --preparation <file>')};
  if (command !== 'record') fail(`unknown command ${command}`);
  const approvedRuntime = absolute(values['approved-runtime'], 'approved-runtime') ?? fail('--approved-runtime is required');
  if (!values.out) fail('--out is required');
  const scenes = values.scenes ? values.scenes.split(',') : [...SCENE_ORDER];
  if (!scenes.length || scenes.some(s => !SCENE_ORDER.includes(s))) fail(`--scenes is a list of ${SCENE_ORDER.join(', ')}`);
  if (!values['no-install'] && SCENE_ORDER.some(s => !scenes.includes(s))) fail('a recording of some scenes cannot be installed (install takes all four): add --no-install');
  return {command, device: values.device, approvedRuntime, out: resolve(values.out), run: absolute(values.run, 'run'), scenes: SCENE_ORDER.filter(s => scenes.includes(s)), install: !values['no-install']};
}

export async function main(argv = process.argv.slice(2), {log = console.log} = {}) {
  const command = parseCommand(argv);
  if (command.command === 'install') { log(JSON.stringify(install(command.dir), null, 2)); return 0; }
  if (command.command === 'check') {
    const {audit, auditClean, formatAudit, rerender} = await import('../../test/native-goldens/audit.mjs');
    const rendered = rerender({write: command.write});
    const report = audit();
    const pending = rendered.filter(r => r.changed && !command.write);
    if (command.json) log(JSON.stringify({rendered, ...report}, null, 2));
    else {
      log(`Pinned renderings: ${rendered.filter(r => r.changed).map(r => `${r.scene}/${r.file}`).join(', ') || 'none changed'}${rendered.some(r => r.changed) ? (command.write ? ' (rewritten)' : ' (changed; --write rewrites them)') : ''}\n`);
      log(formatAudit(report));
    }
    return auditClean(report) && !pending.length ? 0 : 1;
  }
  const ops = deviceOps(command.device);
  if (command.command === 'cleanup') {
    const preparation = JSON.parse(fs.readFileSync(command.preparation, 'utf8'));
    if (preparation.device !== command.device) throw new Error(`${command.preparation} is a preparation on ${preparation.device}, not ${command.device}`);
    const out = cleanupRecording(preparation, ops);
    log(JSON.stringify(out, null, 2));
    if (out.preparationCleanup?.error) return 1;
    fs.rmSync(command.preparation, {force: true});
    return 0;
  }
  return record(command, {ops, log, connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-native-goldens', ...handlers}),
    controllerBuild: () => ({build: engineBuild(), engineVersion: engineVersion()}),
    controllerCheckout: () => controllerCheckout(REPO_ROOT)});
}

// This checkout's commit and whether a tracked file differs from it (untracked files, such as earlier recordings'
// directories, are not the renderer). -> {commit | null, dirty}.
export function controllerCheckout(cwd, {exec = execFileSync} = {}) {
  try {
    const commit = exec('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8'}).trim();
    const dirty = exec('git', ['status', '--porcelain', '--untracked-files=no'], {cwd, encoding: 'utf8'}).trim() !== '';
    return {commit, dirty};
  } catch { return {commit: null, dirty: true}; }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
