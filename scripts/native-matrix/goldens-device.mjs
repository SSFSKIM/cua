// The device side of the live goldens recorder (./goldens.mjs; the own native engine spec, M1b and the Decision Log's
// "M1b pre-flight" item 5): run from the harness checkout on the Mac that shows the scenes, over ssh, one JSON line on
// stdout per command (exit 1 with {error} when it fails).
//
//   node scripts/native-matrix/goldens-device.mjs engine-check        the approved engine and the checkout's build
//   node scripts/native-matrix/goldens-device.mjs engine-stop         `shutdown` to the approved engine (refused while
//                                                                     another connection is open)
//   node scripts/native-matrix/goldens-device.mjs observe <scene> --run <dir>
//   node scripts/native-matrix/goldens-device.mjs action  <scene> --run <dir>
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
// `action` is the scene's one action sequence, on one connection, so the two observations share a lineage: a full
// observation, the scene's action target found in cua's own rendering (the service's numbering, ./observations.mjs) and
// clicked by its token, then the next observation in the default mode, the base and the subject of the diff golden.
// `steps` sends a scene's setup, reset or teardown keys through the engine, each only while the key guard finds its
// target in front (scripts/accept/key-guard.mjs, by pid and, for Finder, the run's window).
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createConnection} from 'node:net';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEngineClient} from '../../src/services/engine/client.mjs';
import {createObservations} from '../../src/services/engine/observations.mjs';
import {installedEngine, shortBuild, stopEngine} from '../../src/runtime/engine.mjs';
import {engineBuild, engineVersion} from '../../src/runtime/engine-bundle.mjs';
import {SCENES, activateScene, fixedStateProblems, readState, teardownFor} from '../repl-parity/scenes-mac.mjs';
import {DESELECT_ALL_KEY} from '../repl-parity/scenes-mac-finder.mjs';
import {actionIndex} from '../repl-parity/scenes-mac-text.mjs';
import {frontWindow} from '../repl-parity/scenes-mac-device.mjs';
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const SCREENSHOT_DIR = 'goldens-screenshots';
// The action's target may appear late (a web area after enablement): up to three observations this far apart.
const TARGET_ATTEMPTS = 3, TARGET_RETRY_MS = 1000;
// After a key step, the time Finder takes to apply a toggle before the next one.
const STEP_SETTLE_MS = 500;
const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// Whether the approved engine may be recorded from this checkout: it must exist and its build must be the checkout's
// (src/runtime/engine-bundle.mjs computes it). -> {ok, engine, checkout, problems: [sentence]}.
export function engineCheck({installed, checkout}) {
  const problems = [];
  if (!installed) problems.push('no approved engine on this Mac: build and approve it first (cua engine build, cua engine approve)');
  else if (installed.build !== checkout.build) problems.push(`the approved engine's build ${shortBuild(installed.build)} is not this checkout's ${shortBuild(checkout.build)}: build and approve this checkout's engine first`);
  const engine = installed ? {bundlePath: installed.bundlePath, build: installed.build, engineVersion: installed.engineVersion, approvedAt: installed.approvedAt} : null;
  return {ok: problems.length === 0, engine, checkout, problems};
}

// The Skyshot as a golden keeps it: the engine's answer without its diagnostics.
export const goldenForm = shot => { const {timings, ...rest} = shot; void timings; return rest; };

// Why a Skyshot is not the scene's fixed state on the run's window: another process, another window, or (Finder) a
// window showing what the run does not own. -> [{code, message, ...}], never carrying the Skyshot's text.
export function sceneProblems(id, shot, record) {
  const problems = [];
  if (shot?.app?.pid !== record.pid) problems.push({code: 'other_process', message: `the observation is not of the run's process ${record.pid}`});
  const title = shot?.window?.title;
  if (typeof title !== 'string' || !title.startsWith(SCENES[id].window.title)) problems.push({code: 'other_window', message: 'the observed window is not the scene\'s window'});
  return [...problems, ...fixedStateProblems(id, shot, record)];
}

// One get_app_state as cua's service sends it (always with the screenshot), the image removed once the answer is in.
async function getState(client, record, screenshots, extra) {
  const {result} = await client.execute('get_app_state', {app: record.app, includeScreenshot: true, outputDirectory: screenshots, ...extra});
  const url = result?.screenshot?.url;
  if (typeof url === 'string' && url.startsWith('file:')) {
    const path = fileURLToPath(url);
    if (path.startsWith(`${screenshots}/`) && !path.slice(screenshots.length + 1).includes('/')) fs.rmSync(path, {force: true});
  }
  return result;
}

// The fixed state's observation. -> {scene, build, skyshot | null, timings, frame, problems}.
export async function observe({id, record, client, screenshots}) {
  const shot = await getState(client, record, screenshots, {disableDiff: true});
  const problems = sceneProblems(id, shot, record);
  if (problems.length) return {scene: id, build: client.identity?.build ?? null, skyshot: null, timings: null, frame: null, problems};
  return {scene: id, build: client.identity?.build ?? null, skyshot: goldenForm(shot), timings: shot.timings ?? null, frame: shot.window?.frame ?? null, problems: []};
}

// The scene's action sequence on one connection. -> {scene, build, before, after, click: {index, route}, timings,
// frames, problems}; before and after null when anything refused.
export async function act({id, record, client, screenshots, retryMs = TARGET_RETRY_MS, sleep = sleepFor}) {
  const refused = problems => ({scene: id, build: client.identity?.build ?? null, before: null, after: null, click: null, timings: null, frames: null, problems});
  const observations = createObservations();
  let before = null, index = null;
  for (let attempt = 1; attempt <= TARGET_ATTEMPTS && index === null; attempt++) {
    if (attempt > 1) await sleep(retryMs);
    before = await getState(client, record, screenshots, {disableDiff: true});
    const problems = sceneProblems(id, before, record);
    if (problems.length) return refused(problems);
    index = actionIndex(observations.observe(record.app, before, {disableDiff: true}), SCENES[id].action);
  }
  if (index === null) return refused([{code: 'target_missing', message: `the action's target is not in cua's rendering after ${TARGET_ATTEMPTS} observations; nothing was clicked`}]);
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
    timings: {before: before.timings ?? null, after: after.timings ?? null}, frames: [before.window?.frame ?? null, after.window?.frame ?? null], problems: []};
}

// The steps of a phase: setup (the scene's record, from `up`), reset (Finder back to no selection, in the same window,
// between the two lanes' actions; the other scenes are restarted by the controller instead) and teardown (the scene's
// own, scenes-mac.mjs teardownFor).
function stepsOf(id, phase, {record, run, io}) {
  if (phase === 'setup') return record.setup ?? [];
  if (phase === 'reset') return id === 'finder' ? [{activate: 'finder'}, {pressKey: DESELECT_ALL_KEY, guard: {pid: record.pid, bundleId: record.bundleId, window: record.window.number}}] : [];
  if (phase === 'teardown') return io.teardown(id, run);
  throw new Error(`unknown phase ${phase}: setup, reset or teardown`);
}

// Runs a phase's steps in order; an activation that fails or a key whose guard is not in front stops them, with no later
// step sent. io: {activate(id, run) -> {ok, reason?}, frontmost() -> {pid, topWindow}, teardown(id, run), sleep}.
// -> {scene, phase, steps: [{activate} | {pressKey, route}]}.
export async function runSteps({id, phase, run, record, client, io}) {
  const done = [];
  for (const step of stepsOf(id, phase, {record, run, io})) {
    if (step.activate) {
      const front = await io.activate(step.activate, run);
      if (!front?.ok) throw new Error(`${step.activate} did not come to the front: ${front?.reason ?? 'no answer'}; no further step was sent`);
      done.push({activate: step.activate});
      continue;
    }
    const out = await sendIfFrontmost({target: step.guard, keys: [step.pressKey], frontmost: io.frontmost,
      send: () => client.execute('press_key', {app: record.app, key: step.pressKey})});
    if (!out.sent) throw new Error(`${step.pressKey} not sent: its target (pid ${step.guard?.pid}${step.guard?.window ? `, window ${step.guard.window}` : ''}) is not in front; no further step was sent`);
    done.push({pressKey: step.pressKey, route: out.result.result?.meta?.inputRoute ?? null});
    await (io.sleep ?? sleepFor)(STEP_SETTLE_MS);
  }
  return {scene: id, phase, steps: done};
}

// An EngineClient on this Mac without a REPL host: the socket opened directly, the bundle launched with `open -n -g -a`
// when nothing answers (as the own host's relay does), no cell budget to suspend.
export function engineClientFor(appPath, {connect = createConnection, open = app => execFileSync('/usr/bin/open', ['-n', '-g', '-a', app])} = {}) {
  const nodeRepl = {
    nativePipe: {createConnection: path => new Promise((resolve, reject) => {
      const socket = connect(path);
      socket.once('error', reject);
      socket.once('connect', () => { socket.off('error', reject); resolve(socket); });
    })},
    launchServices: {openApplication: async ({applicationPath}) => { open(applicationPath); }},
    withSuspendedTimeout: fn => fn(),
  };
  return createEngineClient({nodeRepl, appPath});
}

const defaultIo = () => ({
  installed: () => installedEngine(),
  checkout: () => ({build: engineBuild(), engineVersion: engineVersion()}),
  stop: () => stopEngine(),
  client: appPath => engineClientFor(appPath),
  activate: (id, run) => activateScene(id, {run}),
  frontmost: () => frontmostFromProbe(frontWindow()),
  teardown: (id, run) => teardownFor(id, {run}),
  sleep: sleepFor,
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
  if (command === 'engine-check') return engineCheck({installed: io.installed(), checkout: io.checkout()});
  if (command === 'engine-stop') return io.stop();
  if (!['observe', 'action', 'steps'].includes(command)) throw new Error('usage: goldens-device.mjs engine-check | engine-stop | observe <scene> --run <dir> | action <scene> --run <dir> | steps <scene> --run <dir> --phase setup|reset|teardown');
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
    if (command === 'observe') return await observe({id: scene, record, client, screenshots});
    if (command === 'action') return await act({id: scene, record, client, screenshots, sleep: io.sleep});
    return await runSteps({id: scene, phase: flags.phase, run, record, client, io});
  } finally { client.close(); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(JSON.stringify(out) + '\n'); },
    error => { process.stdout.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 1; });
}
