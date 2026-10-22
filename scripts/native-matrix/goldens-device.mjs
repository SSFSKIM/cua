// The device side of the live goldens recorder (./goldens.mjs; the own native engine spec, M1b and the Decision Log's
// "M1b pre-flight" item 5): run from the harness checkout on the Mac that shows the scenes, over ssh, one JSON line on
// stdout per command (exit 1 with {error} when it fails).
//
//   node scripts/native-matrix/goldens-device.mjs engine-check        the approved engine and the checkout's build
//   node scripts/native-matrix/goldens-device.mjs engine-stop         `shutdown` to the approved engine (refused while
//                                                                     another connection is open)
//   node scripts/native-matrix/goldens-device.mjs observe <scene> --run <dir>
//   node scripts/native-matrix/goldens-device.mjs verify  <scene> --run <dir>
//   node scripts/native-matrix/goldens-device.mjs action  <scene> --run <dir> --expect <digest>
//   node scripts/native-matrix/goldens-device.mjs steps   <scene> --run <dir> --phase setup|reset|teardown
//
// cua's lane is the raw Skyshot straight from the approved engine's socket (src/services/engine/client.mjs and its
// protocol), as the device's own uid and outside any sandbox; no REPL host, service or policy sits between, so the
// golden is the engine's own answer. Each observation asks for the screenshot, as cua's service does on every
// observation, into <run>/goldens-screenshots, and the image is removed at once (no golden keeps it). The scene's
// fixed-state check (scripts/repl-parity/scenes-mac.mjs fixedStateProblems, plus the run's process and window) runs on
// every Skyshot before it leaves this process: one that fails is dropped here and only the problems (codes, tokens,
// roles and fields, never text) are printed, so nothing of a window the run does not own reaches the controller.
// The engine's per-observation diagnostics (`timings`, e.g. focusRead) are printed beside the Skyshot, not in it.
//
// Every fixed state is a settled one (settledState): the scene is read until two consecutive full observations, an
// interval apart, render alike, within a bound. Neither engine waits for a web area's contents (both wait only for the
// web area itself), and a scene's tree can still be filling when its window is there (the M1b.5 sitting's Chrome page
// filled its controls' values seconds after the first reads), so one observation is a sample of a moving state and two
// launches of the same scene sampled at different moments differ. `observe` returns the settled observation, `action`
// starts from one. Reading through a wrong window or a filling page is waiting for a scene still loading, which is right
// only while nothing has been captured from it: `verify` is the settled read that guards a vendor capture already
// written (the vendor's fixed text, its action's texts), and refuses on any problem of any read, so a window the owner
// put in front while the vendor captured invalidates that capture even if the scene is back by the next read.
//
// `action` is the scene's one action sequence, on one connection, so the observations share a lineage: the settled full
// observation, the scene's action target found in cua's own rendering (the service's numbering, ./observations.mjs) and
// clicked by its token, then the next observation in the default mode, the base and the subject of the diff golden (a
// single read: a second would be a diff against the first). It clicks only once the settled observation is the scene's
// fixed state (`--expect`, stateDigest of the fixed-state Skyshot the controller kept); otherwise it is refused with
// nothing clicked, and the controller resets the scene for the problems a reset may clear (RESET_MAY_CLEAR).
// `steps` sends a scene's setup, reset or teardown keys through the engine, each only while the key guard finds its
// target in front (scripts/accept/key-guard.mjs, by pid and, for Finder, the run's window). Finder's chrome is set and
// brought back by observation (scenes-mac.mjs setupSteps and teardownSteps): what its window shows is read off the
// engine's Skyshot before each toggle, since Finder's keys do not say what it draws.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createConnection} from 'node:net';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEngineClient} from '../../src/services/engine/client.mjs';
import {createObservations} from '../../src/services/engine/observations.mjs';
import {installedEngine, shortBuild, stopEngine} from '../../src/runtime/engine.mjs';
import {engineBuild, engineVersion} from '../../src/runtime/engine-bundle.mjs';
import {configuredIdentity, readSignature, signatureReport} from '../../src/runtime/engine-sign.mjs';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {normalizeDrift} from '../../test/native-goldens/compare.mjs';
import {SCENES, activateScene, finderOwned, fixedStateProblems, guardOf, readState, teardownFor, writeState} from '../repl-parity/scenes-mac.mjs';
import {
  DESELECT_ALL_KEY, FINDER_CHROME, SAVED_PREFERENCES, finderChromeShown, markVisibleRestored, recordToggleSent, recordVisibleState, toggleUntil,
  unmarkVisibleRestored,
} from '../repl-parity/scenes-mac-finder.mjs';
import {actionIndex} from '../repl-parity/scenes-mac-text.mjs';
import {frontWindow} from '../repl-parity/scenes-mac-device.mjs';
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const SCREENSHOT_DIR = 'goldens-screenshots';
// The stability read's spacing and bound: two reads this far apart must render alike, within this long of the first.
// The sitting's Chrome page filled within about five seconds of its launch.
export const SETTLE_INTERVAL_MS = 500, SETTLE_BOUND_MS = 10_000;
// Problems waiting can clear, so the stability read reads on through them: a window of the run's process whose title is
// not yet the scene's (a page or document still loading), a page whose tree is still filling (scenes-mac.mjs
// chromePageProblems; the Electron fixture's page not there yet, electronPageProblems). Any other problem (another
// process, owner text in Finder's window) is refused at once.
const TRANSIENT = new Set(['other_window', 'page_filling']);
// The refusals of `action` the controller answers by resetting the scene (a restart, or Finder's deselect) and trying
// again: a settled state that is not the kept one, a state that never settled, a page that never filled.
export const RESET_MAY_CLEAR = Object.freeze(['start_state', 'unstable', 'page_filling']);
// After a key step, the time Finder takes to apply a toggle before the next one.
const STEP_SETTLE_MS = 500;
const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// Whether the approved engine may be recorded from this checkout: it must exist and its build must be the checkout's
// (src/runtime/engine-bundle.mjs computes it). `signature` is the bundle's as readSignature reads it and `configured` the
// configured signing identity: only the signature's kind and whether it matches leave (the spec's pre-flight item 2),
// never the identity. -> {ok, engine: {..., signature: {kind, identityMatches}}, checkout, problems: [sentence]}.
export function engineCheck({installed, checkout, signature = null, configured = null}) {
  const problems = [];
  if (!installed) problems.push('no approved engine on this Mac: build and approve it first (cua engine build, cua engine approve)');
  else if (installed.build !== checkout.build) problems.push(`the approved engine's build ${shortBuild(installed.build)} is not this checkout's ${shortBuild(checkout.build)}: build and approve this checkout's engine first`);
  const engine = installed ? {bundlePath: installed.bundlePath, build: installed.build, engineVersion: installed.engineVersion, approvedAt: installed.approvedAt,
    signature: signatureReport(signature, configured)} : null;
  return {ok: problems.length === 0, engine, checkout, problems};
}

// The scene's state as cua renders it, the lanes' drift (the loopback page's port, compare.mjs) normalized: what the
// controller and `act` compare to tell that an action starts from the kept fixed state.
export const stateDigest = shot => createHash('sha256').update(normalizeDrift(render(shot, advanceNumbering(null, shot)))).digest('hex');

// The Skyshot as a golden keeps it: the engine's answer without its diagnostics.
export const goldenForm = shot => { const {timings, ...rest} = shot; void timings; return rest; };

// Why a Skyshot is not the scene's fixed state on the run's window: another process, another window, or (Finder) a
// window showing what the run does not own. -> [{code, message, ...}], never carrying the Skyshot's text.
export function sceneProblems(id, shot, record) {
  return [...ownershipProblems(id, shot, record), ...fixedStateProblems(id, shot, record)];
}
// The part of sceneProblems that says the Skyshot is of the run's process and the scene's window, whatever state that
// window is in (what Finder's chrome steps need before the window is in its fixed state).
export function ownershipProblems(id, shot, record) {
  const problems = [];
  if (shot?.app?.pid !== record.pid) problems.push({code: 'other_process', message: `the observation is not of the run's process ${record.pid}`});
  const title = shot?.window?.title;
  if (typeof title !== 'string' || !title.startsWith(SCENES[id].window.title)) problems.push({code: 'other_window', message: 'the observed window is not the scene\'s window'});
  return problems;
}

// One get_app_state as cua's service sends it (always with the screenshot), the image removed once the answer is in.
// `options` are the request's (deadlineMs: the engine's deadline for it; the client's default otherwise).
async function getState(client, record, screenshots, extra, options) {
  const {result} = await client.execute('get_app_state', {app: record.app, includeScreenshot: true, outputDirectory: screenshots, ...extra}, options);
  const url = result?.screenshot?.url;
  if (typeof url === 'string' && url.startsWith('file:')) {
    const path = fileURLToPath(url);
    if (path.startsWith(`${screenshots}/`) && !path.slice(screenshots.length + 1).includes('/')) fs.rmSync(path, {force: true});
  }
  return result;
}

// The scene read until it has settled: full observations `intervalMs` apart until two consecutive ones pass the scene's
// checks and render alike (stateDigest), within `boundMs` of the first. The bound holds for the reads themselves: each
// request carries the time left as the engine's deadline (a stalled read is cut at the bound, not at the client's
// 120 s default), and a read that answers past the bound is not accepted. -> {shot, problems: [], settle} with the
// later of the two; or {shot: null, problems, settle}: a problem waiting cannot clear (with `strict`, any problem) at
// once, the transient problems of the last read at the bound, or `unstable` (with `observed`, the last read, when it
// passed the checks) when no two reads passed alike in time; a refusal also carries `timings` and `frame`, the engine's
// diagnostics of its last read and the window frame it read (null before any answered), never its text. `settle` is {reads, ms} for the record. `check` is what a
// read must pass (sceneProblems; Finder's chrome steps check only ownership).
export async function settledState({id, record, client, screenshots, sleep = sleepFor, now = Date.now, boundMs = SETTLE_BOUND_MS, intervalMs = SETTLE_INTERVAL_MS, strict = false, check = sceneProblems}) {
  const t0 = now(), deadline = t0 + boundMs;
  let reads = 0, previous = null, problems = [], observed = null, timings = null, frame = null;
  const settle = () => ({reads, ms: now() - t0});
  for (;;) {
    if (reads) await sleep(intervalMs);
    const remaining = deadline - now();
    if (remaining <= 0) break;
    reads++;
    let shot;
    try { shot = await getState(client, record, screenshots, {disableDiff: true}, {deadlineMs: remaining}); } catch (error) {
      if (now() >= deadline) break;   // the engine's deadline: the bound reached inside the read
      throw error;
    }
    if (now() > deadline) break;
    timings = shot?.timings ?? null;
    frame = shot?.window?.frame ?? null;
    problems = check(id, shot, record);
    if (problems.some(p => strict || !TRANSIENT.has(p.code))) return {shot: null, problems, timings, frame, settle: settle()};
    const digest = problems.length ? null : stateDigest(goldenForm(shot));
    if (digest !== null && digest === previous) return {shot, problems: [], settle: settle()};
    previous = digest;
    observed = digest === null ? null : goldenForm(shot);
  }
  if (problems.length) return {shot: null, problems, timings, frame, settle: settle()};
  return {shot: null, timings, frame, problems: [{code: 'unstable', message: `cua's observation did not render alike in two consecutive reads ${intervalMs} ms apart within ${boundMs} ms`}],
    ...(observed ? {observed} : {}), settle: settle()};
}

// The fixed state's observation, settled; `strict` for verify. -> {scene, build, skyshot | null, timings, frame, settle,
// problems}; a refused one keeps the timings and the frame of its last read (the native-mac lane records them).
export async function observe({id, record, client, screenshots, sleep, now, strict = false}) {
  const {shot, problems, settle, timings, frame} = await settledState({id, record, client, screenshots, sleep, now, strict});
  if (problems.length) return {scene: id, build: client.identity?.build ?? null, skyshot: null, timings, frame, settle, problems};
  return {scene: id, build: client.identity?.build ?? null, skyshot: goldenForm(shot), timings: shot.timings ?? null, frame: shot.window?.frame ?? null, settle, problems: []};
}

// The settled observation that guards a vendor capture already written: any problem of any read refuses it.
export const verify = options => observe({...options, strict: true});

// The scene's action sequence on one connection, from the settled state whose stateDigest is `expect`.
// -> {scene, build, before, after, click: {index, route}, timings, frames, settle, problems}; before and after null when
// anything refused; on `start_state` and `unstable`, `observed` is the last observation (it passed the scene's checks),
// for the controller's diagnostic.
export async function act({id, record, client, screenshots, expect, sleep, now}) {
  const refused = (problems, extra = {}) => ({scene: id, build: client.identity?.build ?? null, before: null, after: null, click: null, timings: null, frames: null, ...extra, problems});
  const observations = createObservations();
  if (typeof expect !== 'string' || !/^[0-9a-f]{64}$/.test(expect)) throw new Error('action needs --expect <the fixed state\'s digest>');
  const settled = await settledState({id, record, client, screenshots, sleep, now});
  const {shot: before, settle} = settled;
  if (settled.problems.length) return refused(settled.problems, {settle, ...(settled.observed ? {observed: settled.observed} : {})});
  if (stateDigest(goldenForm(before)) !== expect)
    return refused([{code: 'start_state', message: 'cua\'s settled observation is not the scene\'s kept fixed state; nothing was clicked'}], {settle, observed: goldenForm(before)});
  const index = actionIndex(observations.observe(record.app, before, {disableDiff: true}), SCENES[id].action);
  if (index === null) return refused([{code: 'target_missing', message: 'the action\'s target is not in cua\'s rendering of the settled fixed state; nothing was clicked'}], {settle});
  const {token, lineage} = observations.element(record.app, index);
  let clicked;
  try { clicked = await client.execute('click', {app: record.app, element: token}, {lineage}); } catch (error) {
    return refused([{code: 'click_failed', message: `the engine refused the click: ${error.errorName ?? error.name}: ${String(error.message).slice(0, 300)}`}]);
  }
  const after = await getState(client, record, screenshots, {});
  const problems = sceneProblems(id, after, record);
  if (after?.lineage !== before.lineage) problems.push({code: 'lineage_changed', message: 'the observation after the click is of another lineage (the engine or the connection restarted)'});
  if (problems.length) return refused(problems);
  return {scene: id, build: client.identity?.build ?? null, before: goldenForm(before), after: goldenForm(after), click: {index, route: clicked.result?.meta?.inputRoute ?? null},
    timings: {before: before.timings ?? null, after: after.timings ?? null}, frames: [before.window?.frame ?? null, after.window?.frame ?? null], settle, problems: []};
}

// The steps of a phase: setup (the scene's record, from `up`), reset (Finder back to no selection, in the same window,
// between the two lanes' actions; the other scenes are restarted by the controller instead) and teardown (the scene's
// own, scenes-mac.mjs teardownFor).
function stepsOf(id, phase, {record, run, io}) {
  if (phase === 'setup') return record.setup ?? [];
  if (phase === 'reset') return id === 'finder' ? [{activate: 'finder'}, {pressKey: DESELECT_ALL_KEY, guard: guardOf(id, record)}] : [];
  if (phase === 'teardown') return io.teardown(id, run);
  throw new Error(`unknown phase ${phase}: setup, reset or teardown`);
}

// Runs a phase's steps in order; an activation that fails, a key whose guard is not in front, or a Finder chrome step
// that cannot read the window or reach its state stops them, with no later step sent. Finder's chrome steps read the
// run's window as a settled observation that must be the run's own window (ownershipProblems, every problem refused at
// once) and keep what they saw on this device: only which parts were shown and the toggle counts leave.
// io: {activate(id, run) -> {ok, reason?}, frontmost() -> {pid, topWindow}, teardown(id, run), sleep, now,
// savedPreferencesFile}. -> {scene, phase, steps: [{activate} | {pressKey, route} | {visibleState, ...} | {chrome,
// shown, toggles}]}.
export async function runSteps({id, phase, run, record, client, io, screenshots = join(run ?? '.', SCREENSHOT_DIR)}) {
  const sleep = io.sleep ?? sleepFor, saved = io.savedPreferencesFile ?? SAVED_PREFERENCES;
  const press = async (key, guard) => {
    const out = await sendIfFrontmost({target: guard, keys: [key], frontmost: io.frontmost, send: () => client.execute('press_key', {app: record.app, key})});
    if (!out.sent) throw new Error(`${key} not sent: its target (pid ${guard?.pid}${guard?.window ? `, window ${guard.window}` : ''}) is not in front; no further step was sent`);
    await sleep(STEP_SETTLE_MS);
    return out.result.result?.meta?.inputRoute ?? null;
  };
  const chromeShown = async () => {
    const read = await settledState({id, record, client, screenshots, sleep, now: io.now, strict: true, check: ownershipProblems});
    if (read.problems.length) throw new Error(`the run's Finder window could not be observed: ${read.problems.map(p => p.code).join(', ')}; no further step was sent`);
    return finderChromeShown(read.shot, finderOwned(record));
  };
  const done = [];
  for (const step of stepsOf(id, phase, {record, run, io})) {
    if (step.activate) {
      const front = await io.activate(step.activate, run);
      if (!front?.ok) throw new Error(`${step.activate} did not come to the front: ${front?.reason ?? 'no answer'}; no further step was sent`);
      done.push({activate: step.activate});
    } else if (step.visibleState === 'record') {
      const shown = await chromeShown();
      if (!shown) throw new Error('Finder\'s chrome could not be read: the run\'s list is not in its window; no further step was sent');
      done.push({visibleState: 'record', ...recordVisibleState(saved, shown)});
    } else if (step.visibleState === 'restored') {
      markVisibleRestored(saved);
      done.push({visibleState: 'restored'});
    } else if (step.chrome) {
      const toggle = FINDER_CHROME.find(part => part.id === step.chrome).toggle;
      done.push({chrome: step.chrome, ...await toggleUntil({part: step.chrome, shown: step.shown, observe: chromeShown,
        toggle: () => { unmarkVisibleRestored(saved); return press(toggle, step.guard); }, sent: part => recordToggleSent(saved, part)})});
    } else if (step.finderFrame) {
      const requested = step.finderFrame;
      const out = await io.probe(['window-frame', '--pid', String(record.pid), '--window', String(record.window.number),
        '--frame', ['x', 'y', 'width', 'height'].map(k => requested[k]).join(',')], run);
      const framePin = {pid: out?.pid ?? null, window: out?.window ?? null, requested,
        readBack: out?.readBack ?? null, matched: out?.matched === true, exitStatus: out?.exitStatus ?? null};
      // Preserve even a refusal's read-back, beside the owned scene identity. Later bind/teardown snapshots carry it.
      const state = readState(run);
      writeState(run, {...state, scenes: {...state.scenes, [id]: {...record, framePin}}});
      if (framePin.pid !== record.pid || framePin.window !== record.window.number || !framePin.matched || framePin.exitStatus !== 0
        || !['x', 'y', 'width', 'height'].every(k => framePin.readBack?.[k] === requested[k]))
        throw new Error('Finder frame probe did not confirm the requested frame on the run window; no further step was sent');
      done.push({framePin});
    } else done.push({pressKey: step.pressKey, route: await press(step.pressKey, step.guard)});
  }
  return {scene: id, phase, steps: done};
}

// An EngineClient on this Mac without a REPL host: the socket opened directly, the bundle launched with `open -n -g -a`
// when nothing answers (as the own host's relay does), no cell budget to suspend.
export const engineClientFor = (appPath, seams) => createEngineClient({nodeRepl: engineNodeRepl(seams), appPath});

// The trusted worker's part the client needs (src/services/engine/client.mjs): the socket, the bundle's launch, and no
// cell budget.
export function engineNodeRepl({connect = createConnection, open = app => execFileSync('/usr/bin/open', ['-n', '-g', '-a', app])} = {}) {
  return {
    nativePipe: {createConnection: path => new Promise((resolve, reject) => {
      const socket = connect(path);
      socket.once('error', reject);
      socket.once('connect', () => { socket.off('error', reject); resolve(socket); });
    })},
    launchServices: {openApplication: async ({applicationPath}) => { open(applicationPath); }},
    withSuspendedTimeout: fn => fn(),
  };
}

const defaultIo = () => ({
  installed: () => installedEngine(),
  signature: bundlePath => ({signature: readSignature(bundlePath), configured: configuredIdentity()}),
  checkout: () => ({build: engineBuild(), engineVersion: engineVersion()}),
  stop: () => stopEngine(),
  client: appPath => engineClientFor(appPath),
  activate: (id, run) => activateScene(id, {run}),
  // Lazy because live-device already consumes this module. Reuse its journaled, bounded LaunchServices probe path:
  // the approved bundle owns AX trust, never an ssh-launched Swift interpreter or an Automation grant.
  probe: async (args, run) => (await import('./live-device.mjs')).defaultIo(run).probe(args),
  frontmost: () => frontmostFromProbe(frontWindow()),
  teardown: (id, run) => teardownFor(id, {run}),
  sleep: sleepFor,
  now: Date.now,
});

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else positional.push(rest[i]);
  }
  return {command, scene: positional[0], flags};
}

export async function main(argv, {io: given = {}} = {}) {
  const io = {...defaultIo(), ...given};
  const {command, scene, flags} = parse(argv);
  if (command === 'engine-check') {
    const installed = io.installed();
    return engineCheck({installed, checkout: io.checkout(), ...(installed ? io.signature(installed.bundlePath) : {})});
  }
  if (command === 'engine-stop') return io.stop();
  if (!['observe', 'verify', 'action', 'steps'].includes(command)) throw new Error('usage: goldens-device.mjs engine-check | engine-stop | observe|verify <scene> --run <dir> | action <scene> --run <dir> --expect <digest> | steps <scene> --run <dir> --phase setup|reset|teardown');
  if (!Object.hasOwn(SCENES, scene ?? '')) throw new Error(`unknown scene ${scene}`);
  if (!flags.run || !isAbsolute(flags.run)) throw new Error('--run <absolute directory> is required');
  const run = fs.realpathSync(flags.run);
  const record = readState(run).scenes?.[scene];
  if (!record) throw new Error(`scene ${scene} is not up in ${run}`);
  const installed = io.installed();
  if (!installed) throw new Error('no approved engine on this Mac: build and approve it first (cua engine build, cua engine approve)');
  const client = io.client(installed.bundlePath);
  const screenshots = join(run, SCREENSHOT_DIR);
  try {
    if (command === 'observe' || command === 'verify') return await observe({id: scene, record, client, screenshots, sleep: io.sleep, now: io.now, strict: command === 'verify'});
    if (command === 'action') return await act({id: scene, record, client, screenshots, expect: flags.expect, sleep: io.sleep, now: io.now});
    return await runSteps({id: scene, phase: flags.phase, run, record, client, io, screenshots});
  } finally { client.close(); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(JSON.stringify(out) + '\n'); },
    error => { process.stdout.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 1; });
}
