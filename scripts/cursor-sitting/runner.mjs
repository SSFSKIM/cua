// Runs one item's steps (./plans.mjs) and records them, one JSON line per step, in <out>/item-<n>.jsonl: each cell's
// answer (its times, the values it read, the route the engine reported, the attested engine), every cue, instruction
// and watch, and every task's outcome. An image a cell emits is saved beside it. The live io (`liveIo`) drives the
// Mac: sessions through ./session.mjs, cues spoken with `say`, the go file the operator touches once the owner is done,
// the harness scenes' activation, the engine's stop and status through this checkout's CLI, engine.json's switch, the
// approved bundle's activation watcher and focus probe, item 1's screen recording (./recording.mjs), and #200's window
// placement, order watcher, delivery reads and the fixture's relaunch (./raise.mjs), #244's first-observation reads of
// the fixture's accessibility record (./first-observation.mjs), and #187's re-slot (./item-187.mjs: the composition, each
// row's readings, the confirming cell's relaunch of Chrome and its activation). Whatever the item changed outside its sessions is
// put back in `finally`: engine.json as it was, the watchers and the recorder stopped, every session closed.
import {execFileSync, spawn} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUNDLE_ID} from '../../src/runtime/engine-bundle.mjs';
import {enginePaths} from '../../src/runtime/engine.mjs';
import {runProbe, startWatch, stopWatch} from '../native-matrix/live-device.mjs';
import {FIXTURE_ACCESSIBILITY_FILE} from '../native-matrix/fixtures/electron-fixture.mjs';
import {textViewOf} from '../native-matrix/residue-device.mjs';
import {readState} from '../repl-parity/scenes-mac.mjs';
import {engineJsonOf} from './engine-copy.mjs';
import {readFocus, runWindowBounds} from './focus.mjs';
import {capCheckWithStream} from './frames.mjs';
import {startFrameStream} from './signposts.mjs';
import {BUILT_IN_SCREEN, coverOver, farPoint, liveWindowList, overlaysAbove, plannedSettle, windowListProbe} from './glide.mjs';
import {liveSourceSwitch, restoreAfterFailure, sourceTargetProblem, switchSource} from './input-source.mjs';
import {clipPathProblem, recordingPlan, REPO_ROOT, screencaptureCommand, startRecording, stopRecording} from './recording.mjs';
import {firstTasks} from './first-observation.mjs';
import {item187Tasks, liveDeps187, stop187} from './item-187.mjs';
import {item188Tasks, stop188} from './item-188.mjs';
import {joinTasks} from './item-187-join.mjs';
import {readConsent} from './input-source.mjs';
import {liveElementFrame, liveMoveWindow, raiseTasks, stopRaiseWatch} from './raise.mjs';
import {openDriven} from './session.mjs';
import {latinSourceProblem, STILL_TAIL_MS, STILL_WAIT_MAX_MS} from './timing.mjs';
import {liveTargetGuard} from './target-guard.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const SCENES_CLI = fileURLToPath(new URL('../repl-parity/scenes-mac.mjs', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The glides the cap check counts on each side (about 4 s of probe a side), and how long it lets the series'
// frame stream deliver the last of them.
const GLIDE_CHECK_GLIDES = 2, FRAME_STREAM_SETTLE_MS = 1000;

// The engine's activations among the watcher's lines: the panel never activates the engine (Acceptance 5).
export const engineActivations = lines => lines.filter(l => l.kind === 'activated' && l.bundleId === BUNDLE_ID);

// engine.json with `patch` written over it, the other keys kept. `text`: the file's bytes, or null when there is none.
function patchedSettings(text, patch) {
  const settings = text === null ? {} : JSON.parse(text);
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('~/.config/cua/engine.json is not a JSON object; the switch is not written');
  return `${JSON.stringify({...settings, ...patch}, null, 2)}\n`;
}

// engine.json with the device switch off, the other keys kept.
export const cursorOffSettings = text => patchedSettings(text, {cursor: false});

// engine.json with the cursor's diagnostic arm `arm` (`cursorDebug`), the other keys kept.
export const cursorDebugSettings = (text, arm) => patchedSettings(text, {cursorDebug: arm});

// The Mac's io for `runSteps`. `run`: the harness scenes' run directory; `out`: the item's evidence directory; `gap`:
// a series' signpost reads, run in its waits.
export function liveIo({run, out, quiet = false, home = homedir(), gap = null}) {
  const cli = (args, env = {}) => JSON.parse(execFileSync(process.execPath, [CLI, ...args], {encoding: 'utf8', env: {...process.env, ...env}, timeout: 60_000}));
  const settingsFile = engineJsonOf(home), before = join(out, 'engine.json.before');
  const guard = liveTargetGuard({bundle: enginePaths().bundle});
  // The scenes CLI on the run (scripts/repl-parity/scenes-mac.mjs): its last JSON line, also when it exits non-zero.
  const scenes = (args, timeout = 30_000) => {
    let text;
    try { text = execFileSync(process.execPath, [SCENES_CLI, ...args, '--run', run], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout}); } catch (error) { text = String(error.stdout ?? ''); }
    try { return JSON.parse(text.trim().split('\n').at(-1)); } catch { return {ok: false, error: 'the scenes CLI printed no answer'}; }
  };
  let sources = null;
  // Why a source may not be selected for `scene` now (its launch, its run window on top of the frontmost app), or null.
  const sourceTarget = scene => {
    try { const record = io.scene(scene); return sourceTargetProblem({record, problem: guard.problem(record), frontmost: guard.frontmost()}); } catch (error) {
      return `the ${scene} scene could not be read (${error.message.split('\n')[0]})`;
    }
  };
  const io = {
    scene: id => {
      const record = readState(run).scenes[id];
      if (!record) throw new Error(`the ${id} scene is not up in ${run} (node scripts/repl-parity/scenes-mac.mjs up ${id} --run ${run})`);
      return {id, app: record.app, pid: record.pid, at: record.at, window: record.window};
    },
    open: options => openDriven({...options, guard}),
    wait: sleep,
    // The series' signpost reads' gap (./signposts.mjs startSignpostChunks), when they run.
    ...(gap ? {gap} : {}),
    cue: async text => {
      if (quiet || !existsSync('/usr/bin/say')) return;
      await new Promise(resolve => spawn('/usr/bin/say', [text], {stdio: 'ignore'}).once('exit', resolve).once('error', resolve));
    },
    waitGo: async () => {
      const go = join(out, 'go');
      while (!existsSync(go)) await sleep(250);
      rmSync(go, {force: true});
    },
    goFile: join(out, 'go'),
    tasks: {
      // The scene's process brought to the front (its answer's `ok`, false when another stayed in front).
      activate: async ([scene]) => scenes(['activate', scene]),
      'engine-stop': async () => cli(['engine', 'stop', '--json']),
      // The device switch as the running engine reports it; with `arm`, its cursorDebug must be that arm too.
      'engine-status': async ([expect, arm]) => {
        const status = cli(['engine', 'status', '--json']);
        const line = execFileSync(process.execPath, [CLI, 'engine', 'status'], {encoding: 'utf8', timeout: 60_000}).split('\n').find(l => l.startsWith('cursor:')) ?? null;
        const cursorDebug = status.status?.cursorDebug ?? null;
        return {ok: status.cursor === expect && (arm === undefined || cursorDebug === arm), cursor: status.cursor, cursorDebug, line, build: status.build, approved: status.approved};
      },
      // The file's bytes kept in the item's directory first (or that there was none), then the switch written.
      'engine-json-off': async () => writeSettings(cursorOffSettings),
      // Likewise, the cursor's diagnostic arm written (the engine reads it at its next launch).
      'engine-json-arm': async ([arm]) => ({...writeSettings(text => cursorDebugSettings(text, arm)), arm}),
      // The default's 60 Hz cap, proven before the series of the arm that lifts it (`uncapped`; ./frames.mjs): the
      // approved bundle's cursor probe glides twice and rocks, on its own transparent window, nothing driven, with the
      // arm and then without it; the window server's frames inside each glide and the rock counted. Recorded, never stopping the
      // series (./frames.mjs glideFramesCheck): a cap that does not take effect is the finding, and a count that fails is
      // undetermined; only a probe whose end is unconfirmed (stuck) stops it. The probes' pids are kept, so the series'
      // own count leaves their glides out.
      // The frames come from a FrameUpdate stream that runs for this task only (./signposts.mjs startFrameStream), before
      // any session opens, so no timed sample runs under it; `log show` drops some even seconds after.
      'glide-frames': async ([arm]) => capCheckWithStream(arm, {probe: args => runProbe(enginePaths().bundle, args), startStream: startFrameStream,
        glides: GLIDE_CHECK_GLIDES, settleMs: FRAME_STREAM_SETTLE_MS, sleep}),
      // The keyboard's input source as the approved bundle's probe reads it, TextEdit in front: `latin` requires a
      // Latin keyboard layout (./timing.mjs latinSourceProblem), `record` only keeps the reading.
      'input-source': async ([mode]) => {
        const answer = runProbe(enginePaths().bundle, ['input-source', 'current']);
        const reading = answer && {id: answer.id ?? null, name: answer.name ?? null, keyboardLayout: answer.keyboardLayout ?? null,
          asciiCapable: answer.asciiCapable ?? null, layout: answer.layout ?? null, perContextInput: answer.perContextInput ?? null};
        const problem = latinSourceProblem(reading);
        return {ok: mode === 'record' || problem === null, mode, reading, ...(problem ? {problem} : {})};
      },
      'engine-json-restore': async () => {
        if (existsSync(`${before}.absent`)) { rmSync(settingsFile, {force: true}); rmSync(`${before}.absent`); return {ok: true, removed: true}; }
        if (!existsSync(before)) return {ok: true, nothing: true};
        writeFileSync(settingsFile, readFileSync(before), {mode: 0o600});
        rmSync(before);
        return {ok: true, restored: true};
      },
      // The approved bundle's focus probe, its window named by the scene's run window where it is now: the focused app
      // and window and the focused element's value hash (never a value), once a scene that keeps an accessibility
      // record (the Electron fixture) has it on (./focus.mjs). With a third argument, the reading must equal that one.
      focus: async ([label, scene, equalTo], ctx) => {
        const userDataDir = readState(run).scenes[scene]?.userDataDir;
        const record = join(userDataDir ?? '', FIXTURE_ACCESSIBILITY_FILE);
        return readFocus({label, record: io.scene(scene), equalTo, store: ctx.focus ??= {}, windows: guard.windows,
          probe: args => runProbe(enginePaths().bundle, args),
          accessibilityText: userDataDir ? () => (existsSync(record) ? readFileSync(record, 'utf8') : null) : null});
      },
      // Item 1's recording: the rectangle the scenes' run windows fill (where they are now), refused unless it holds
      // only them and no window of the frontmost app lies over it; then the recorder started into `clip`, outside the
      // repository. The handle stays in the context, for record-stop or the finally.
      'record-start': async ([clip, ...scenes], ctx) => {
        const pathProblem = clipPathProblem(clip, REPO_ROOT);
        if (pathProblem) return {ok: false, problem: pathProblem};
        const records = scenes.map(io.scene), frontmost = guard.frontmost();
        const plan = recordingPlan({windows: Object.fromEntries(records.map(r => [r.id, runWindowBounds(guard.windows(r.pid), r.window.number)])),
          pids: Object.fromEntries(records.map(r => [r.id, r.pid])), frontmost, frontWindows: frontmost ? guard.windows(frontmost.pid) : []});
        if (!plan.ok) return plan;
        const started = await startRecording({recorder: screencaptureCommand({region: plan.region, file: clip})});
        if (!started.ok) return {...plan, ok: false, problem: started.problem};
        ctx.recording = {handle: started.handle, clip};
        return {...plan, clip, spawnAt: started.spawnAt, readyAt: started.readyAt};
      },
      // Item 1 without a clip: both run windows' bounds now, and TextEdit's point farthest from Chrome's window, where a
      // scroll puts the cursor before the second click (./glide.mjs farPoint); kept for that cell as `glide start`.
      'glide-start': async ([from, to], ctx) => {
        const bounds = Object.fromEntries([from, to].map(id => { const r = io.scene(id); return [id, runWindowBounds(guard.windows(r.pid), r.window.number)]; }));
        const gone = Object.keys(bounds).find(id => !bounds[id]);
        if (gone) return {ok: false, bounds, problem: `the ${gone} scene's run window is not on screen`};
        const far = farPoint(bounds[from], bounds[to]);
        ctx.results['glide start'] = far;
        return {ok: true, bounds, ...far};
      },
      // The scene's own windows over its run window (./glide.mjs overlaysAbove), kept as `overlays`; with `none`,
      // ok only when there are none.
      'overlay-check': async ([scene, expect], ctx) => {
        const record = io.scene(scene);
        const overlays = overlaysAbove(guard.windows(record.pid), record.window.number).map(w => ({number: w.number, bounds: w.bounds}));
        ctx.results.overlays = overlays;
        if (expect === 'none' && overlays.length) return {ok: false, overlays, problem: `the ${scene} scene's own window${overlays.length > 1 ? 's' : ''} ${overlays.map(o => `${o.number} (${o.bounds.width} × ${o.bounds.height} pt)`).join(', ')} still lie${overlays.length > 1 ? '' : 's'} over its run window`};
        return {ok: true, overlays};
      },
      // The still series' wait: the motion the engine plans for its glide click (./glide.mjs plannedSettle, from the
      // run window's bounds now), plus the tail; refused when that does not fit under the fade.
      'still-plan': async ([scene, from, to, floorMs], ctx) => {
        const record = io.scene(scene), b = runWindowBounds(guard.windows(record.pid), record.window.number);
        if (!b) return {ok: false, problem: `the ${scene} scene's run window is not on screen`};
        const point = f => ({x: b.x + f[0] * b.width, y: b.y + f[1] * b.height});
        const planned = plannedSettle(point(from), point(to));
        const waitMs = Math.max(floorMs, Math.ceil(planned.settleSeconds * 1000 + STILL_TAIL_MS));
        ctx.results['still plan'] = {waitMs};
        return {ok: waitMs <= STILL_WAIT_MAX_MS, waitMs, planned, bounds: b, screen: BUILT_IN_SCREEN, ...(waitMs > STILL_WAIT_MAX_MS ? {problem: `the glide's planned settle (${planned.settleSeconds} s) does not fit under the fade`} : {})};
      },
      // Item 1 without a clip, right before the second click: what lies over the target scene's run window by the
      // engine's own occlusion rule (./glide.mjs coverOver, CursorAttachment.swift occluded), from the whole window list.
      // A cover can make the engine snap rather than glide (CursorHub.perform: both ends occluded), so the judgement
      // needs none.
      // Before the cursor is positioned: glide-cover's probe compiled now, so no compile runs between the scroll and the
      // click, where the cursor's idle fade could start.
      'window-list-ready': async () => ({ok: true, probe: windowListProbe()}),
      'glide-cover': async ([scene]) => {
        const record = io.scene(scene), b = runWindowBounds(guard.windows(record.pid), record.window.number);
        if (!b) return {ok: false, problem: `the ${scene} scene's run window is not on screen`};
        const covers = coverOver(liveWindowList(), record.window.number, b, guard.enginePids());
        if (covers === null) return {ok: false, problem: `the ${scene} scene's run window is not in the window list`};
        return {ok: covers.length === 0, covers, bounds: b, ...(covers.length ? {problem: `${covers.length} window(s) lie over the ${scene} scene's run window`} : {})};
      },
      'record-stop': async (_args, ctx) => {
        if (!ctx.recording) return {ok: false, problem: 'no recording is running'};
        const {handle, clip} = ctx.recording;
        ctx.recording = null;
        return stopRecording(handle, {file: clip});
      },
      // The input source selected for a series from the owner's recorded answer, and read back (./input-source.mjs),
      // only while the scene's own launch has its run window on top of the frontmost app.
      'select-source': async ([which, scene, id], ctx) => switchSource({out, which, id: id ?? null, sources: sources ??= liveSourceSwitch(), targetProblem: sourceTarget(scene),
        beforeSelect: () => { ctx.sourceChanged = true; ctx.sourceScene = scene; }}),
      'watch-start': async () => ({ok: true, watch: startWatch(enginePaths().bundle, out)}),
      'watch-stop': async (_args, ctx) => {
        const lines = ctx.watch ? stopWatch(ctx.watch) : [];
        writeFileSync(join(out, 'activations.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
        const engine = engineActivations(lines);
        return {ok: engine.length === 0, lines: lines.length, engineActivations: engine.length};
      },
    },
    // What the finally puts back: engine.json, and the engine stopped so none keeps running under the changed file.
    cleanup: async ctx => {
      await stopRaiseWatch(ctx);
      await stop187(ctx);
      stop188(ctx);
      if (ctx.settingsChanged) {
        await ctx.io.tasks['engine-json-restore']();
        await ctx.io.tasks['engine-stop']();
      }
      if (ctx.watch) stopWatch(ctx.watch);
      if (ctx.recording) { const {handle, clip} = ctx.recording; ctx.recording = null; await stopRecording(handle, {file: clip}); }
      // A failed run that had attempted a selection: the owner's source back, onto the scene's own window only
      // (recorded as the run's last row); left as it is, and said loudly, when that window is no longer on top.
      const restored = restoreAfterFailure({ctx, out, sources: sources ??= liveSourceSwitch(), targetProblem: ctx.sourceChanged ? sourceTarget(ctx.sourceScene) : null});
      if (restored?.left) process.stderr.write(`\n!!! ${restored.problem}\n\n`);
      return restored ? [{task: restored.left ? 'source-left-after-failure' : 'source-restored-after-failure', result: restored}] : [];
    },
  };
  // #200's tasks (./raise.mjs): the harness windows placed, the arrangement checked, the order watcher, the deliveries.
  Object.assign(io.tasks, raiseTasks({io, run, guard, out, windowList: () => liveWindowList(), probe: args => runProbe(enginePaths().bundle, args),
    textView: textViewOf, moveWindow: liveMoveWindow(), elementFrame: liveElementFrame(), scenes: args => scenes(args, 120_000)}));
  // #244's tasks (./first-observation.mjs): the relaunch with the variant's switch, the marks, the record's reads.
  Object.assign(io.tasks, firstTasks({run}));
  // #187's tasks (./item-187.mjs): the slot's preconditions and placement, the composition, each row's readings, the
  // cell's relaunch of Chrome (the scenes CLI) and its activation. #188's tasks over the same deps (./item-188.mjs): the
  // ABC gate, the matrix rows' readings, cell 3's range reads, #259's geometry.
  const deps187 = liveDeps187({io, run, out, guard, cli: args => cli(args), probe: args => runProbe(enginePaths().bundle, args),
    bundle: enginePaths().bundle, windowList: () => liveWindowList(), moveWindow: liveMoveWindow(), elementFrame: liveElementFrame(), consent: () => readConsent(out), scenes: args => scenes(args, 120_000)});
  // The isolating slot's hold-join rows (./item-187-join.mjs: C2, C3, C4's tail) over the same deps.
  Object.assign(io.tasks, item187Tasks(deps187), item188Tasks(deps187), joinTasks(deps187));
  function writeSettings(write) {
    const text = existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : null;
    if (existsSync(before) || existsSync(`${before}.absent`)) throw new Error(`${before} exists from an earlier run: restore engine.json from it by hand, then remove it`);
    const written = write(text);  // refuses a file that is not an object before anything is kept or written
    if (text === null) writeFileSync(`${before}.absent`, ''); else writeFileSync(before, text, {mode: 0o600});
    mkdirSync(join(settingsFile, '..'), {recursive: true, mode: 0o700});
    writeFileSync(`${settingsFile}.sitting.tmp`, written, {mode: 0o600});
    renameSync(`${settingsFile}.sitting.tmp`, settingsFile);
    return {ok: true, file: settingsFile, existed: text !== null};
  }
  return io;
}

const describe = step => {
  if (step.open) return `open session ${step.open}${step.device ? ` on the device ${step.device}` : ''} on ${step.scenes.join(', ')}${step.bind === false ? ' (none bound)' : Array.isArray(step.bind) ? ` (${step.bind.join(', ')} bound)` : ''}${step.windows ? ` (${Object.keys(step.windows).join(', ')} on the window a task found)` : ''}${step.env ? ` with ${JSON.stringify(step.env)}` : ''}${step.engine ? ` (${step.engine} engine)` : ''}`;
  if (step.run) return `${step.run}: ${step.label}${step.keys ? ` (only while ${step.keys} is frontmost)` : ''}`;
  if (step.together) return `at once: ${step.together.map(describe).join(' | ')}`;
  if (step.cue) return `CUE (spoken to the owner, then ${step.ms} ms): ${step.cue}`;
  if (step.owner) return `OWNER: ${step.owner}`;
  if (step.watch) return `WATCH [${step.id}]: ${step.watch}`;
  if (step.wait) return `wait ${step.wait} ms`;
  if (step.say) return step.say;
  if (step.task) return `task ${step.task}${step.args ? ` ${step.args.join(' ')}` : ''}`;
  if (step.series) return `this run's series: ${step.series.join(', ')}`;
  if (step.endTask) return `${step.endTask}: end_task`;
  if (step.close) return `close session ${step.close}`;
  return JSON.stringify(step);
};
export {describe as describeStep};

// A session's record of a scene: the run's, or, where the open step names a window for it (`windows[id](results)`: a
// window number an earlier task found, the isolating slot's popup), the same process on that window, so the session's
// target guard checks that window as the scene's front one. A window named but not found stops the item.
export function sessionRecord(record, windowOf, results) {
  if (!windowOf) return record;
  const number = windowOf(results);
  if (!Number.isSafeInteger(number)) throw new Error(`the ${record.id} scene's window for this session was not found: nothing is opened`);
  return {...record, window: {...record.window, number}};
}

// Runs `steps` for `item`, recording into <out>/item-<item>.jsonl (a re-run appends after a new `start` row; the
// summary reads the last attempt). `engine`: the sessions' engine unless a step names one. -> {rows, failed}: `failed`
// counts the cells and tasks that did not answer ok.
export async function runSteps(steps, {item, out, io, engine = 'cua', log = line => process.stdout.write(`${line}\n`), dryRun = false}) {
  if (!dryRun) mkdirSync(out, {recursive: true, mode: 0o700});
  const file = join(out, `item-${item}.jsonl`);
  const rows = [];
  const record = row => { const full = {item, at: Date.now(), ...row}; rows.push(full); if (!dryRun) appendFileSync(file, JSON.stringify(full) + '\n'); };
  const ctx = {io, sessions: {}, results: {}, watch: null, recording: null, settingsChanged: false, sourceChanged: false, sourceScene: null, error: null, failed: 0};
  let failed = 0, n = 0;
  const runCell = async step => {
    const code = typeof step.cell === 'function' ? step.cell(ctx.results) : step.cell;
    const startedAt = Date.now();  // the cell's own span, which the signposts' coverage checks a sample against
    const answer = await ctx.sessions[step.run].run(code, {keys: step.keys ?? null});
    const {images, ...kept} = answer;
    const saved = images.map((image, k) => {
      const name = `item-${item}-step-${n}-${k}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      writeFileSync(join(out, name), Buffer.from(image.data, 'base64'));
      return name;
    });
    ctx.results[step.label] = answer;
    if (!answer.ok) failed++;
    record({step: n, kind: 'cell', session: step.run, label: step.label, startedAt, ...(step.sample ? {sample: step.sample} : {}),
      ...(step.orderTarget ? {orderTarget: step.orderTarget} : {}), ...(step.role ? {role: step.role} : {}), ...kept, ...(saved.length ? {images: saved} : {})});
    log(`  ${step.run}: ${step.label}: ${answer.ok ? JSON.stringify(answer.value) : `FAILED ${answer.error}`}${answer.route ? ` (route ${answer.route})` : ''}`);
    // A required cell that did not answer ok stops the item here (its finally still puts everything back).
    if (step.required && !answer.ok) throw new Error(`required cell "${step.label}" failed: ${answer.error}`);
  };
  record({kind: 'start', steps: steps.length, dryRun});
  try {
    for (const step of steps) {
      n++;
      log(`[${item}.${n}] ${describe(step)}`);
      if (dryRun) { record({step: n, kind: 'plan', text: describe(step)}); continue; }
      if (step.when && !step.when(ctx.results)) { record({step: n, kind: 'skipped', text: describe(step)}); continue; }
      if (step.open) {
        ctx.sessions[step.open] = await io.open({name: step.open, engine: step.engine ?? engine, env: step.env ?? {}, scenes: step.scenes.map(id => sessionRecord(io.scene(id), step.windows?.[id], ctx.results)), device: step.device ?? null,
          bind: step.bind ?? true});
        record({step: n, kind: 'open', session: step.open, env: step.env ?? {}, engine: step.engine ?? engine, ...(step.bind === false || Array.isArray(step.bind) ? {bound: step.bind} : {})});
      } else if (step.run) await runCell(step);
      else if (step.together) await Promise.all(step.together.map(runCell));
      else if (step.cue) { record({step: n, kind: 'cue', text: step.cue}); await io.cue(step.cue); await io.wait(step.ms); }
      else if (step.owner) {
        record({step: n, kind: 'owner', text: step.owner});
        await io.cue(step.owner);
        log(`  waiting: once the owner is done, touch ${io.goFile}`);
        await io.waitGo();
      } else if (step.watch) record({step: n, kind: 'watch', id: step.id, text: step.watch});
      // A wait is a gap between samples: a series' signpost reads run there and only there (./signposts.mjs).
      else if (step.wait) await (io.gap ? io.gap(step.wait, row => record({step: n, ...row})) : io.wait(step.wait));
      else if (step.say) record({step: n, kind: 'say', text: step.say});
      else if (step.endTask) record({step: n, kind: 'end_task', session: step.endTask, answer: (await ctx.sessions[step.endTask].endTask())?.result ?? null});
      else if (step.close) { const exit = await ctx.sessions[step.close].close(); delete ctx.sessions[step.close]; record({step: n, kind: 'close', session: step.close, exit}); }
      else if (step.series) record({step: n, kind: 'series', series: step.series, counts: step.counts});
      else if (step.task) {
        const result = await io.tasks[step.task](step.args ?? [], ctx);
        if (['engine-json-off', 'engine-json-arm'].includes(step.task)) ctx.settingsChanged = true;
        if (step.task === 'engine-json-restore') ctx.settingsChanged = false;
        if (step.task === 'watch-start') ctx.watch = result.watch;
        if (step.task === 'watch-stop') ctx.watch = null;
        if (result?.ok === false) failed++;
        record({step: n, kind: 'task', task: step.task, args: step.args ?? [], result});
        log(`  ${JSON.stringify(result)}`);
        // A required precondition that does not hold stops the item here (its finally still puts everything back).
        if (step.required && result?.ok === false) throw new Error(`${step.task} refused: ${result.problem ?? JSON.stringify(result)}`);
      }
    }
  } catch (error) {
    ctx.error = error;
    throw error;
  } finally {
    ctx.failed = failed;  // how the run ended, for the cleanup: a thrown failure, or failed results
    if (!dryRun) {
      for (const [name, session] of Object.entries(ctx.sessions)) { try { await session.close(); } catch (error) { log(`closing ${name}: ${error.message}`); } }
      const notes = await io.cleanup?.(ctx);
      for (const note of Array.isArray(notes) ? notes : []) record({kind: 'cleanup', ...note});
    }
  }
  return {rows, failed};
}
