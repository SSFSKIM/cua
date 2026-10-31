// Runs one item's steps (./plans.mjs) and records them, one JSON line per step, in <out>/item-<n>.jsonl: each cell's
// answer (its times, the values it read, the route the engine reported, the attested engine), every cue, instruction
// and watch, and every task's outcome. An image a cell emits is saved beside it. The live io (`liveIo`) drives the
// Mac: sessions through ./session.mjs, cues spoken with `say`, the go file the operator touches once the owner is done,
// the harness scenes' activation, the engine's stop and status through this checkout's CLI, engine.json's switch, the
// approved bundle's activation watcher and focus probe, and item 1's screen recording (./recording.mjs). Whatever the
// item changed outside its sessions is put back in `finally`: engine.json as it was, the watcher and the recorder
// stopped, every session closed.
import {execFileSync, spawn} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUNDLE_ID} from '../../src/runtime/engine-bundle.mjs';
import {enginePaths} from '../../src/runtime/engine.mjs';
import {runProbe, startWatch, stopWatch} from '../native-matrix/live-device.mjs';
import {FIXTURE_ACCESSIBILITY_FILE} from '../native-matrix/fixtures/electron-fixture.mjs';
import {readState} from '../repl-parity/scenes-mac.mjs';
import {engineJsonOf} from './engine-copy.mjs';
import {readFocus, runWindowBounds} from './focus.mjs';
import {liveSourceSwitch, restoreAfterFailure, sourceTargetProblem, switchSource} from './input-source.mjs';
import {clipPathProblem, recordingPlan, REPO_ROOT, screencaptureCommand, startRecording, stopRecording} from './recording.mjs';
import {openDriven} from './session.mjs';
import {latinSourceProblem} from './timing.mjs';
import {liveTargetGuard} from './target-guard.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const SCENES_CLI = fileURLToPath(new URL('../repl-parity/scenes-mac.mjs', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

// The Mac's io for `runSteps`. `run`: the harness scenes' run directory; `out`: the item's evidence directory.
export function liveIo({run, out, quiet = false, home = homedir()}) {
  const cli = (args, env = {}) => JSON.parse(execFileSync(process.execPath, [CLI, ...args], {encoding: 'utf8', env: {...process.env, ...env}, timeout: 60_000}));
  const settingsFile = engineJsonOf(home), before = join(out, 'engine.json.before');
  const guard = liveTargetGuard({bundle: enginePaths().bundle});
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
      activate: async ([scene]) => {
        let text;
        try { text = execFileSync(process.execPath, [SCENES_CLI, 'activate', scene, '--run', run], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000}); } catch (error) { text = String(error.stdout ?? ''); }
        try { return JSON.parse(text.trim().split('\n').at(-1)); } catch { return {ok: false, error: 'the scenes CLI printed no answer'}; }
      },
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
      'record-stop': async (_args, ctx) => {
        if (!ctx.recording) return {ok: false, problem: 'no recording is running'};
        const {handle, clip} = ctx.recording;
        ctx.recording = null;
        return stopRecording(handle, {file: clip});
      },
      // The input source selected for a series from the owner's recorded answer, and read back (./input-source.mjs),
      // only while the scene's own launch has its run window on top of the frontmost app.
      'select-source': async ([which, scene], ctx) => switchSource({out, which, sources: sources ??= liveSourceSwitch(), targetProblem: sourceTarget(scene),
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
  if (step.open) return `open session ${step.open}${step.device ? ` on the device ${step.device}` : ''} on ${step.scenes.join(', ')}${step.env ? ` with ${JSON.stringify(step.env)}` : ''}${step.engine ? ` (${step.engine} engine)` : ''}`;
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
    const answer = await ctx.sessions[step.run].run(code, {keys: step.keys ?? null});
    const {images, ...kept} = answer;
    const saved = images.map((image, k) => {
      const name = `item-${item}-step-${n}-${k}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      writeFileSync(join(out, name), Buffer.from(image.data, 'base64'));
      return name;
    });
    ctx.results[step.label] = answer;
    if (!answer.ok) failed++;
    record({step: n, kind: 'cell', session: step.run, label: step.label, ...(step.sample ? {sample: step.sample} : {}),
      ...(step.orderTarget ? {orderTarget: step.orderTarget} : {}), ...kept, ...(saved.length ? {images: saved} : {})});
    log(`  ${step.run}: ${step.label}: ${answer.ok ? JSON.stringify(answer.value) : `FAILED ${answer.error}`}${answer.route ? ` (route ${answer.route})` : ''}`);
  };
  record({kind: 'start', steps: steps.length, dryRun});
  try {
    for (const step of steps) {
      n++;
      log(`[${item}.${n}] ${describe(step)}`);
      if (dryRun) { record({step: n, kind: 'plan', text: describe(step)}); continue; }
      if (step.open) {
        ctx.sessions[step.open] = await io.open({name: step.open, engine: step.engine ?? engine, env: step.env ?? {}, scenes: step.scenes.map(io.scene), device: step.device ?? null});
        record({step: n, kind: 'open', session: step.open, env: step.env ?? {}, engine: step.engine ?? engine});
      } else if (step.run) await runCell(step);
      else if (step.together) await Promise.all(step.together.map(runCell));
      else if (step.cue) { record({step: n, kind: 'cue', text: step.cue}); await io.cue(step.cue); await io.wait(step.ms); }
      else if (step.owner) {
        record({step: n, kind: 'owner', text: step.owner});
        await io.cue(step.owner);
        log(`  waiting: once the owner is done, touch ${io.goFile}`);
        await io.waitGo();
      } else if (step.watch) record({step: n, kind: 'watch', id: step.id, text: step.watch});
      else if (step.wait) await io.wait(step.wait);
      else if (step.say) record({step: n, kind: 'say', text: step.say});
      else if (step.endTask) record({step: n, kind: 'end_task', session: step.endTask, answer: (await ctx.sessions[step.endTask].endTask())?.result ?? null});
      else if (step.close) { const exit = await ctx.sessions[step.close].close(); delete ctx.sessions[step.close]; record({step: n, kind: 'close', session: step.close, exit}); }
      else if (step.series) record({step: n, kind: 'series', series: step.series, counts: step.counts});
      else if (step.task) {
        const result = await io.tasks[step.task](step.args ?? [], ctx);
        if (step.task === 'engine-json-off' || step.task === 'engine-json-arm') ctx.settingsChanged = true;
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
