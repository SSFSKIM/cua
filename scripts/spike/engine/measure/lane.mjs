// One lane of measure.mjs (the own native engine spec, M0 "Spike"; Concrete Steps "M0 spike on the mini"): N runs, each
// in <out>/run-<n> with results.jsonl (one row per sample or probe verdict) and meta.json, on the four scenes
// (scripts/spike/engine/scenes.mjs), through the real facade and a real REPL host:
//   vendor  the approved vendor runtime served by `cua serve` on the vendor host, through prepare.mjs's approved-home
//           path (admission, the home's state/ and run/ moved aside and back, the run's helper stopped at cleanup):
//           scripts/native-baseline/{prepare,remote,serve}.mjs as the native baseline uses them.
//   cua     the spike's serve (scripts/spike/engine/serve.mjs, cua's own host with the spike service) from the harness
//           checkout, on the same prepared home, after the approved engine is launched with `open -n -g -a` (the own
//           host's relay still runs plain `open -a` until M1a, so no measured cell takes the relay's launch).
// Every run begins and ends with the engine stop discipline (`shutdown`, refused while another connection is open),
// and the cua lane refuses unless the checkout's build is approved.json's (./engine-control.mjs).
//
// Input: the cua engine answers click, press_key and type_text with notImplemented until its input routes are built
// (written elsewhere), so on the cua lane every cell that needs input is recorded as a row `notRun: "input methods not
// built"`, behind the one switch CUA_INPUT_METHODS_BUILT; the cells themselves are written and run as soon as it flips.
// The vendor lane runs its input cells as the native baseline does, keys only through the #162 key guard.
import * as fs from 'node:fs';
import {mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {FIRST, LIST_APPS, AX_FULL, SCREENSHOT, SCRATCH_GUARD, TASK_NEW, TASK_TYPE, TASK_VERIFY, TASK_CLOSE, QUIT_TEXTEDIT, parseCell} from '../../../native-baseline/cells.mjs';
import {serveCommand, preparationScript, preflightScript, HELPER_SCRIPT, classifyHelpers} from '../../../native-baseline/remote.mjs';
import {FRONTMOST_SCRIPT, parseFrontmost, sendIfFrontmost} from '../../../accept/key-guard.mjs';
import {hostAttestationOf} from '../../../native-baseline.mjs';
import {textOf} from '../../../browser-parity/mcp.mjs';
import {quote} from '../../../browser-parity/topology.mjs';
import {SCENES, FINDER_TYPING_NAME, finderFolderFiles} from '../scenes.mjs';
import {PAGE_TITLE} from '../fixtures/scene-page.mjs';
import * as spike from './cells.mjs';
import {stopEngine, assertApprovedBuild, launchEngine, EngineRefusal} from './engine-control.mjs';
import {engineOps, inCheckout, lastJson} from './device.mjs';
import {redactGolden} from './redact.mjs';

// THE switch: whether the cua engine answers click, press_key and type_text. While false, the cua lane records every
// input cell as not run; flip it when the engine's input routes land.
export const CUA_INPUT_METHODS_BUILT = false;
export const NOT_BUILT = 'input methods not built';
const REFUSED = 2;
export const LANES = ['vendor', 'cua'];
export const SCENE_ORDER = ['textedit', 'finder', 'chrome', 'electron'];
const CELL_MS = 60_000, BIND_MS = 120_000;
const round = ms => Math.round(ms * 1000) / 1000;

// What names each scene's window (a prefix of its title) and what each probe acts on.
export const SCENE_WINDOW = Object.freeze({textedit: 'cua-scene', finder: SCENES.finder.fixedState.folder, chrome: PAGE_TITLE, electron: SCENES.electron.fixedState.title});
export const ACTION_TARGET = Object.freeze({textedit: SCENES.textedit.fixedState.firstLine, finder: 'scene-file-050', chrome: 'Scene option', electron: 'Fixture button'});
export const KEY_PROBE = Object.freeze({textedit: 'shift+Right', finder: 'Down', chrome: 'Tab', electron: 'Tab'});
export const USER_WINDOW = Object.freeze({textedit: 'finder', finder: 'textedit', chrome: 'textedit', electron: 'finder'});
// Probe (e)'s strings (Verification system part 6) and the two input sources it runs under.
export const UNICODE_STRINGS = Object.freeze(['The quick brown fox jumps over the lazy dog.', '한글 테스트', 'ㄱㄴㄷ', '가나다 abc 123', '😀 이모지', 'é', '日本語', '줄1\n줄2']);
export const INPUT_SOURCES = Object.freeze({latin: 'com.apple.keylayout.ABC', korean: 'com.apple.inputmethod.Korean.2SetKorean'});

// The approval the harness answers: a computer-use elicitation for one of the run's scene apps. The own host's
// elicitation carries no `mode: 'form'` (src/repl-host/elicitation.mjs), so, unlike scripts/accept/lib.mjs's
// isTextEditApproval, the mode is not required.
export function isSceneApproval(msg, bundleIds) {
  if (msg?.method !== 'elicitation/create') return false;
  const params = msg.params ?? {}, meta = params._meta ?? {}, schema = params.requestedSchema, tool = meta.tool_params;
  return /^Allow Computer Use to use ".+"\?$/.test(params.message ?? '')
    && schema !== null && typeof schema === 'object' && schema.type === 'object' && Object.keys(schema.properties ?? {}).length === 0
    && meta.connector_id === 'computer-use' && meta.codex_approval_kind === 'mcp_tool_call'
    && tool !== null && typeof tool === 'object' && Object.keys(tool).length === 1 && bundleIds.includes(tool.app);
}

// The rows a lane records instead of running its input cells, one per cell, so `summary` shows each. -> [row].
export function notRunRows({lane, scenes, inputBuilt = lane === 'vendor' || CUA_INPUT_METHODS_BUILT}) {
  if (inputBuilt || lane !== 'cua') return [];
  const row = (op, extra = {}) => ({op, sample: 1, ok: false, notRun: NOT_BUILT, ...extra});
  return [
    ...(scenes.includes('textedit') ? ['task.act', 'task.verify', 'task.close', 'task.total'].map(op => row(op, {scene: 'textedit'})) : []),
    ...scenes.map(scene => row('golden.action', {scene})),
    ...scenes.flatMap(scene => ['click', 'key'].flatMap(action => [row(`probe.a.${action}`, {scene, user: USER_WINDOW[scene]}), row(`probe.b.${action}`, {scene})])),
    ...scenes.map(scene => row('probe.c\'.settle.afterAction', {scene})),
    row('probe.d.noFire', {scene: 'textedit'}), row('probe.d.operatorKeystroke', {scene: 'textedit'}), row('probe.d.backgroundClick', {scene: 'textedit'}),
    ...['latin', 'korean'].flatMap(source => ['textedit', 'chrome'].filter(s => scenes.includes(s)).map(scene => row('probe.e.typeText', {scene, source}))),
  ];
}

// Rows that do not depend on the input switch: what the spike cannot measure on either lane yet, each with its reason.
export const STRUCTURAL_ROWS = Object.freeze([
  {op: 'probe.d.tap', sample: 1, ok: false, notRun: 'the engine has no listen-only event tap yet (the input half)', scene: 'textedit'},
  {op: 'probe.d.hidReset', sample: 1, ok: false, notRun: 'the engine has no --probe keystroke yet (the input half)', scene: 'textedit'},
  {op: 'probe.e.concealed', sample: 1, ok: false, notRun: 'a concealed type_text needs the secret store; the spike serve runs with secrets off', scene: 'textedit'},
  {op: 'probe.e.perContext', sample: 1, ok: false, notRun: 'the per-context input preference is the owner\'s; changing and restoring it is the matrix\'s (M2b)', scene: 'textedit'},
]);

// The own host's serve of the spike (scripts/spike/engine/serve.mjs) on the device, in the prepared environment.
export function cuaServeCommand(d, {home, userHome, configHome, tmpdir: tmp, engine, node}) {
  const env = `-i PATH="$PATH" LANG=C.UTF-8 HOME=${quote(userHome)} XDG_CONFIG_HOME=${quote(configHome)} TMPDIR=${quote(tmp)} CUA_HOME=${quote(home)}`
    + `${engine ? ` CUA_ENGINE_APP=${quote(engine)}` : ''}${node ? ` CUA_NODE=${quote(node)}` : ''} CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off`;
  return d.command(inCheckout(d, `exec env ${env} ${d.node} scripts/spike/engine/serve.mjs`));
}

// The input source around a cell group that switches it: saved into the run directory first, restored afterwards
// whatever happens (the owner's source is never left switched).
export async function withInputSource(ops, dir, fn) {
  const saved = ops.inputSource('current');
  if (!saved?.id) throw new Error(`the input source could not be read (${JSON.stringify(saved?.error ?? saved)})`);
  fs.writeFileSync(join(dir, 'input-source.json'), JSON.stringify(saved, null, 2) + '\n', {mode: 0o600});
  try { return await fn(saved); }
  finally {
    const now = ops.inputSource('current');
    if (now?.id !== saved.id) {
      const restored = ops.inputSource(saved.id);
      if (restored?.current?.id !== saved.id) throw new Error(`the owner's input source ${saved.id} could not be restored`);
    }
  }
}

class Stop extends Error {}

// One run of a lane. `io`: {shell, ops, connect(spec, handlers), confirm, log, sleep}. -> 0 when complete.
export async function runOnce(options, io) {
  const {lane, d, dir, approvedRuntime, engine, scenes, samples, tasks, node, sceneDir, probes = ['c'], operator = false, inputBuilt = lane === 'vendor' || CUA_INPUT_METHODS_BUILT} = options;
  const {shell, ops, log = console.log} = io;
  const sleep = io.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  if (fs.existsSync(join(dir, 'results.jsonl')) || fs.existsSync(join(dir, 'meta.json'))) throw new Error(`${dir} already holds a run`);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(join(dir, 'results.jsonl'), '');
  const meta = {schema: 'spike-measure-1', lane, run: options.run, device: d.device, sceneDir, started: new Date().toISOString(), plan: {samples, tasks, scenes, probes, operator, inputBuilt},
    elicitations: [], problems: [], complete: false};
  const emit = row => { const full = {lane, run: options.run, ...row}; fs.appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(full) + '\n'); return full; };
  const write = () => fs.writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  const sceneCli = args => lastJson(shell(`${d.node} scripts/spike/engine/scenes.mjs ${args.map(quote).join(' ')}`));
  const front = () => sceneCli(['front']);
  let prepared = null, client = null, stopped = null, records = {};

  // The stop discipline and the build gate come first: nothing is prepared or launched against an engine the run may
  // not use or stop.
  try {
    meta.engineStopAtStart = await stopEngine(ops);
    meta.engine = lane === 'cua' ? await assertApprovedBuild(ops) : {approved: ops.approved()};
  } catch (error) {
    meta.error = error.message; meta.refused = error instanceof EngineRefusal; write();
    log(`run ${options.run}: refused: ${error.message}`);
    return REFUSED;
  }

  try {
    prepared = d.local ? localPrepared({approvedRuntime, lane}) : lastJson(shell(preparationScript('prepare', {device: d.device, approvedHome: approvedRuntime})));
    meta.preparation = prepared;
    const pre = lastJson(shell(preflightScript({host: lane, prepared, surface: 'computer'})));
    Object.assign(meta, {commit: pre.commit, dirty: pre.dirty, checkout: pre.checkout, release: pre.release, sandbox: pre.sandbox, hardware: pre.hardware, os: pre.os, display: pre.display, ownNode: pre.ownNode});
    if (!d.local && pre.dirty) throw new Error('the harness checkout is dirty');
    meta.helpersAtStart = classifyHelpers(shell(HELPER_SCRIPT), pre.runtimeRoot);

    // The scenes' refusals before anything is launched. The scene directory is shared by the sitting (Finder remembers
    // its view per folder, and the cua lane leaves its Finder window up for the next run).
    const checked = sceneCli(['preflight', '--run', sceneDir]);
    if (checked.refusals?.length) throw new Error(`the scenes refuse: ${checked.refusals.map(r => r.message).join('; ')}`);
    const kept = readSceneState(shell, sceneDir).scenes ?? {};
    const finderKept = kept.finder && (checked.finderWindows ?? []).includes(kept.finder.window?.number);

    if (lane === 'cua' && probes.includes('c')) await probeC({d, shell, ops, emit, front, log});
    if (lane === 'cua') meta.engineLaunch = {via: 'open -n -g -a', ...pick(await launchEngine(ops), ['pid', 'build', 'accessibility', 'screenRecording', 'connections'])};

    for (const scene of scenes) {
      if (scene === 'finder' && finderKept) { records.finder = kept.finder; meta.finderReused = true; continue; }
      const up = sceneCli(['up', scene, '--run', sceneDir]);
      if (up.error) throw new Error(`scene ${scene} did not come up: ${up.error}`);
      records[scene] = up;
    }
    meta.scenes = Object.fromEntries(Object.entries(records).map(([id, r]) => [id, {app: r.app, bundleId: r.bundleId, pid: r.pid, window: r.window?.number ?? null}]));
    const bundleIds = Object.values(records).map(r => r.bundleId);

    // The connection.
    const spec = lane === 'vendor'
      ? serveCommand({device: d.device, checkout: pre.checkout, home: pre.home, userHome: prepared.userHome, configHome: prepared.configHome, tmpdir: prepared.tmpdir, admission: prepared.admission, xSession: {}, host: 'vendor', platform: 'darwin', surface: 'computer'})
      : cuaServeCommand(d, {home: prepared.home, userHome: prepared.userHome, configHome: prepared.configHome, tmpdir: prepared.tmpdir, engine, node});
    client = io.connect(spec, {
      answer: msg => (isSceneApproval(msg, bundleIds) ? {action: 'accept', content: {}} : {action: 'decline'}),
      onElicitation: (row, msg) => meta.elicitations.push({t: row.t, app: msg.params?._meta?.tool_params?.app ?? null, action: row.action}),
      stderrFile: join(dir, 'serve-stderr.txt'),
    });
    const serverInfo = (await client.initialize())?.serverInfo ?? null;
    await client.request('tools/list');

    const js = async (code, timeoutMs = CELL_MS) => {
      if (stopped) throw new Stop(stopped);
      const started = performance.now();
      let result;
      try { result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000); }
      catch (error) {
        if (/timed out/.test(error.message)) { stopped = `a cell timed out (${error.message}); no further input was sent`; throw new Stop(stopped); }
        return {wallMs: performance.now() - started, cell: null, meta: null, failure: error.message};
      }
      meta.hostAttestation ??= hostAttestationOf(serverInfo, result);
      const text = textOf(result), parsed = parseCell(text);
      return {wallMs: performance.now() - started, cell: parsed, meta: result?._meta ?? null, failure: parsed ? null : (text.split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300)};
    };
    const record = (op, sample, r, extra = {}) => {
      const value = r.cell?.ok ? r.cell.value ?? {} : null;
      return {op, sample, ok: Boolean(value) && !value.invalid, wallMs: round(r.wallMs), ...(r.cell?.inCellMs !== undefined ? {inCellMs: round(r.cell.inCellMs)} : {}),
        ...(value ?? {error: r.cell?.error ?? r.failure ?? 'failed'}), ...extra};
    };
    const row = (op, sample, r, extra) => emit(record(op, sample, r, extra));
    const attest = r => {
      const native = r.meta?.['cua/nativeEngine'];
      if (lane === 'cua' && native && !meta.nativeEngine) {
        meta.nativeEngine = native;
        if (native.build !== meta.engine.build) meta.problems.push(`the engine that answered (build ${String(native.build).slice(0, 12)}) is not the approved build`);
      }
      return r;
    };
    const frontmost = () => parseFrontmost(shell(FRONTMOST_SCRIPT));
    // A key cell for an app the harness put in front (#162): sent only while that app is frontmost.
    const keyCell = async (bundleId, code, keys) => {
      const out = await sendIfFrontmost({target: bundleId, keys, frontmost, send: () => js(code)});
      if (out.sent) return out.result;
      emit({op: 'key.skipped', sample: 1, ok: false, ...out.skipped});
      stopped = `${keys.join(', ')} not sent: the frontmost application is ${out.skipped.frontmost}, not ${bundleId} (#162)`;
      throw new Stop(stopped);
    };
    const activate = async scene => {
      shell(`/usr/bin/open -a ${quote(records[scene].app)}`);
      const started = performance.now();
      for (let i = 0; i < 20 && frontmost() !== records[scene].bundleId; i++) await sleep(250);
      const ok = frontmost() === records[scene].bundleId;
      emit({op: 'setup.activate', scene, sample: 1, ok, wallMs: round(performance.now() - started), note: 'harness-owned, not judged: device-side open -a, checked with lsappinfo front'});
      if (!ok) throw new Error(`${scene} did not become the frontmost application`);
    };
    // Finder's key goes only while Finder is frontmost and its top window is the run's.
    const finderKey = async (code, keys) => {
      const seen = front();
      if (seen.frontmost?.bundleId !== 'com.apple.finder' || seen.topWindow?.number !== records.finder.window.number) {
        emit({op: 'key.skipped', sample: 1, ok: false, keys, target: 'the run\'s Finder window', frontmost: seen.frontmost?.bundleId ?? 'unreadable'});
        stopped = `${keys.join(', ')} not sent: the run's Finder window is not in front`; throw new Stop(stopped);
      }
      return js(code);
    };
    const ctx = {lane, d, dir, meta, emit, row, js, attest, records, scenes, samples, tasks, inputBuilt, operator, keyCell, finderKey, activate, front, ops, shell, io, log, prepared};

    const first = await js(FIRST, BIND_MS);
    if (!first.cell?.ok) throw new Error(`the first cell failed: ${first.failure ?? first.cell?.error}`);
    for (let sample = 1; sample <= samples; sample++) row('warm.listApps', sample, attest(await js(LIST_APPS)));
    for (const scene of scenes) row('bind.getApp', 1, await js(spike.BIND(scene, records[scene].app), BIND_MS), {scene});

    for (const notRun of [...notRunRows({lane, scenes, inputBuilt}), ...STRUCTURAL_ROWS]) emit(notRun);
    if (scenes.includes('finder')) await finderSetup(ctx);
    for (const scene of scenes) await golden(ctx, scene, 'golden.fixed', spike.GOLDEN(scene, records[scene].app, SCENE_WINDOW[scene], {raw: lane === 'cua'}));
    if (scenes.includes('textedit')) await textEditCells(ctx);
    for (const scene of scenes) await treeCells(ctx, scene);
    if (lane === 'cua') for (const scene of scenes) await engineCells(ctx, scene);
    if (inputBuilt) {
      for (const scene of scenes) await golden(ctx, scene, 'golden.action', spike.ACTION_GOLDEN(scene, records[scene].app, SCENE_WINDOW[scene], ACTION_TARGET[scene], {raw: lane === 'cua'}));
      if (lane === 'cua') await inputProbes(ctx);
    }
    const ended = await client.call('end_task');
    emit({op: 'end_task', sample: 1, ok: ended.isError !== true});
    meta.complete = true;
  } catch (error) {
    meta.error = error.message;
    if (!(error instanceof Stop)) log(`run ${options.run}: ${error.message}`);
  } finally {
    if (stopped) { meta.stopped = stopped; meta.complete = false; }
    meta.teardown = await teardown({lane, shell, client, records, scenes, sceneCli, sceneDir, stopped, inputBuilt, sleep}).catch(error => ({error: error.message}));
    if (meta.teardown?.error) meta.complete = false;
    try { meta.engineStopAtEnd = await stopEngine(ops); } catch (error) { meta.engineStopAtEnd = {error: error.message}; meta.complete = false; }
    try { meta.helpersAtEnd = classifyHelpers(shell(HELPER_SCRIPT), meta.preparation?.runtimeReuse?.runtimeRoot ?? null); } catch {}
    if (prepared && !d.local) {
      try { meta.preparationCleanup = lastJson(shell(preparationScript('cleanup', prepared))); }
      catch (error) { meta.preparationCleanup = {removed: false, error: error.message}; meta.complete = false; }
    }
    if (prepared?.local) for (const path of [prepared.configHome, prepared.tmpdir]) fs.rmSync(path, {recursive: true, force: true});
    if (meta.problems.length) meta.complete = false;
    meta.finished = new Date().toISOString();
    write();
  }
  log(`run ${options.run} (${lane}): ${meta.complete ? 'complete' : `INCOMPLETE: ${meta.stopped ?? meta.error ?? meta.problems.join('; ')}`}`);
  return meta.complete ? 0 : 1;
}

const pick = (object, keys) => Object.fromEntries(keys.filter(k => object?.[k] !== undefined).map(k => [k, object[k]]));
const readSceneState = (shell, sceneDir) => {
  try { return JSON.parse(shell(`cat ${quote(join(sceneDir, 'scenes.json'))} 2>/dev/null || echo '{}'`)); } catch { return {}; }
};

// This Mac's run (--device local, cua lane only): no prepare.mjs admission (it serves declared devices); the given
// home is served as it is, with the run's own XDG_CONFIG_HOME and TMPDIR.
function localPrepared({approvedRuntime, lane}) {
  if (lane !== 'cua') throw new Error('the vendor lane runs through prepare.mjs\'s approved-home admission, which serves declared devices only; on this Mac run the cua lane');
  const scratch = mkdtempSync(join(tmpdir(), 'cua-spike-measure-'));
  const configHome = join(scratch, 'config'), tmp = join(scratch, 'tmp');
  fs.mkdirSync(configHome, {mode: 0o700}); fs.mkdirSync(tmp, {mode: 0o700});
  return {local: true, home: fs.realpathSync(approvedRuntime), userHome: process.env.HOME, configHome, tmpdir: tmp, scratch};
}

// A golden: the cell writes its files into the session's temp directory; the harness copies them, checks their
// hashes, redacts Finder's (the sidebar is the owner's) and writes them under <run>/goldens/.
async function golden({js, row, shell, dir, records, prepared}, scene, op, code) {
  const r = await js(code, BIND_MS);
  const files = r.cell?.ok ? r.cell.value.files : [];
  const kept = [], problems = [];
  const allowed = scene === 'finder' ? [SCENES.finder.fixedState.folder, ...finderFolderFiles()] : null;
  for (const file of files) {
    if (!isSessionFile(prepared, file.path)) { problems.push(`not read: ${file.kind} was written outside the session's temp directory`); continue; }
    const text = shell(`cat ${quote(file.path)}`);
    if (createHash('sha256').update(text).digest('hex') !== file.sha256) { problems.push(`not kept: ${file.kind} changed between the cell and the copy`); continue; }
    const out = allowed ? redactGolden(text, file.kind, allowed) : text;
    fs.mkdirSync(join(dir, 'goldens'), {recursive: true});
    const name = file.path.split('/').at(-1).replace(/^cua-spike-golden-/, '');
    fs.writeFileSync(join(dir, 'goldens', name), out, {mode: 0o644});
    kept.push({kind: file.kind, name, bytes: file.bytes, redacted: Boolean(allowed)});
  }
  row(op, 1, r, {scene, files: kept, ...(problems.length ? {ok: false, error: problems.join('; ')} : {})});
}
// A golden file the harness may read: written by the cell into the session's temp directory, which is the session's
// own under the served home's run/ (buildLaunch) or the run's TMPDIR.
export const isSessionFile = ({home, tmpdir: runTmp}, path) => typeof path === 'string' && !path.includes('/../')
  && /\/cua-spike-golden-[A-Za-z0-9.+-]+$/.test(path)
  && [`${home}/run/`, ...(runTmp ? [`${runTmp}/`] : [])].some(prefix => path.startsWith(prefix));

// Finder's fixed state is list view. The vendor lane sets it (Finder in front with the run's window on top, then
// super+2 through the guard); Finder keeps the view per folder, so the cua lane, which cannot send keys yet, checks it.
async function finderSetup(ctx) {
  const {lane, js, row, emit, activate, finderKey, inputBuilt} = ctx;
  if (lane === 'vendor' || inputBuilt) {
    await activate('finder');
    row('setup.finderListView', 1, await finderKey(spike.PRESS('finder', 'super+2'), ['super+2']), {scene: 'finder'});
  }
  const view = await js(spike.FINDER_VIEW(SCENE_WINDOW.finder));
  row('check.finderListView', 1, view, {scene: 'finder'});
  if (view.cell?.ok && !view.cell.value.listView) emit({op: 'check.finderListView', scene: 'finder', sample: 2, ok: false, error: 'the run\'s Finder folder is not in list view: run the vendor lane first in this sitting, which sets it'});
}

// The baseline's TextEdit cells on the scene document: setup.activate, getAXState and getScreenshot (bracketed by
// the scratch guard), the three-cell task through the key guard (vendor lane; on the cua lane those rows are not run).
async function textEditCells(ctx) {
  const {js, row, emit, activate, keyCell, samples, tasks, inputBuilt, attest} = ctx;
  await activate('textedit');
  const ready = await js(spike.USE_TEXTEDIT(SCENE_WINDOW.textedit));
  if (!ready.cell?.ok) throw new Error(`the TextEdit scene is not ready: ${ready.cell?.error ?? ready.failure}`);
  for (let sample = 1; sample <= samples; sample++) row('warm.getAXState', sample, attest(await js(AX_FULL)), {scene: 'textedit'});
  const guard = async n => { const r = row('guard.scratch', n, await js(SCRATCH_GUARD), {scene: 'textedit'}); return r.ok && r.scratchInFront === true; };
  if (!await guard(1)) throw new Error('the scene document is not in front before the screenshot series');
  const shots = [];
  for (let sample = 1; sample <= samples; sample++) shots.push({sample, r: await js(SCREENSHOT)});
  const still = await guard(2);
  for (const {sample, r} of shots) row('warm.getScreenshot', sample, r, {scene: 'textedit', ...(still ? {} : {ok: false, invalid: 'the scene document was not in front after the series'})});
  if (!inputBuilt) return;
  for (let sample = 1; sample <= tasks; sample++) {
    const steps = [];
    const opened = await keyCell('com.apple.TextEdit', TASK_NEW, ['super+n']);
    const typed = opened.cell?.ok ? await keyCell('com.apple.TextEdit', TASK_TYPE, ['typeText']) : null;
    const act = typed ? {...typed, wallMs: opened.wallMs + typed.wallMs, cell: typed.cell && {...typed.cell, inCellMs: (opened.cell.inCellMs ?? 0) + (typed.cell.inCellMs ?? 0)}} : opened;
    steps.push(row('task.act', sample, act, {scene: 'textedit', route: typed?.meta?.['cua/inputRoute'] ?? null}));
    if (steps[0].ok) steps.push(row('task.verify', sample, await js(TASK_VERIFY), {scene: 'textedit'}));
    steps.push(row('task.close', sample, await keyCell('com.apple.TextEdit', TASK_CLOSE, ['super+w']), {scene: 'textedit'}));
    const ok = steps.length === 3 && steps.every(s => s.ok);
    emit({op: 'task.total', scene: 'textedit', sample, ok, wallMs: round(steps.reduce((t, s) => t + (s.wallMs ?? 0), 0)), inCellMs: round(steps.reduce((t, s) => t + (s.inCellMs ?? 0), 0)),
      outcome: ok ? 'typed text verified, document closed without saving' : steps.find(s => !s.ok)?.error ?? 'failed'});
    if (!steps.at(-1).ok) throw new Error(`task ${sample}'s document could not be confirmed closed`);
  }
}

// The tree read of each scene through the facade, with the raw Skyshot's size and the engine's timings on the cua lane.
async function treeCells({lane, js, row, attest, records, samples}, scene) {
  for (let sample = 1; sample <= samples; sample++) {
    const r = attest(await js(spike.TREE(scene, SCENE_WINDOW[scene])));
    const extra = {scene};
    if (lane === 'cua' && r.cell?.ok) {
      const facts = await js(spike.SKYSHOT_FACTS(records[scene].app));
      if (facts.cell?.ok) Object.assign(extra, {engine: facts.cell.value});
    }
    row('tree.getAXState', sample, r, extra);
  }
}

// Cua lane, probe (c′) and valueMarkdown's cost: the two fetch routes alternated per sample, valueMarkdown on and off
// alternated per sample, and the settle notification count at rest. A row whose switch the service did not forward is
// not a measurement (its `forwarded` is false).
async function engineCells({js, row, records, samples}, scene) {
  const app = records[scene].app;
  for (let sample = 1; sample <= samples; sample++) {
    for (const prefetch of sample % 2 ? ['public', 'hierarchy'] : ['hierarchy', 'public'])
      row(`probe.c'.route.${prefetch}`, sample, await js(spike.ENGINE_OBSERVE(app, {prefetch})), {scene});
    for (const valueMarkdown of sample % 2 ? [true, false] : [false, true])
      row(`valueMarkdown.${valueMarkdown ? 'on' : 'off'}`, sample, await js(spike.ENGINE_OBSERVE(app, {valueMarkdown})), {scene});
  }
  for (let sample = 1; sample <= Math.min(samples, 5); sample++) row('probe.c\'.settle.rest', sample, await js(spike.ENGINE_OBSERVE(app, {settle: true})), {scene});
}

// Probe (c), on the cua lane with the engine stopped: does `open -a` without -g activate the engine; do two copies at
// different paths both come up under `open -n -g -a` and bind their own sockets. Both stopped and the copy removed.
async function probeC({d, shell, ops, emit, front, log}) {
  const before = front();
  try {
    const status = await launchEngine(ops, {plain: true});
    const after = front();
    emit({op: 'probe.c.plainOpen', sample: 1, ok: true, enginePid: status.pid, activated: after.frontmost?.pid === status.pid,
      frontmostChanged: before.frontmost?.pid !== after.frontmost?.pid, topWindowChanged: before.topWindow?.number !== after.topWindow?.number});
  } catch (error) { emit({op: 'probe.c.plainOpen', sample: 1, ok: false, error: error.message}); }
  finally { await stopEngine(ops); }
  const bundle = ops.bundle().bundle, copyDir = join(dirname(dirname(bundle)), 'engine-probe-c');
  const copy = engineOps(d, shell, {engine: join(copyDir, 'cua Engine.app')});
  try {
    ops.removeCopy(copyDir);
    ops.copy(copyDir);
    const a = await launchEngine(ops), b = await launchEngine(copy);
    const after = front();
    emit({op: 'probe.c.twoCopies', sample: 1, ok: a.pid !== b.pid && a.socket !== b.socket, approved: pick(a, ['pid', 'socket', 'bundlePath']), copy: pick(b, ['pid', 'socket', 'bundlePath']),
      frontmostChanged: before.frontmost?.pid !== after.frontmost?.pid});
  } catch (error) { emit({op: 'probe.c.twoCopies', sample: 1, ok: false, error: error.message}); }
  finally {
    for (const target of [copy, ops]) { try { await stopEngine(target); } catch (error) { log(`probe (c): ${error.message}`); } }
    ops.removeCopy(copyDir);
  }
}

// Cua lane, input built: probes (a) and (b) on every scene with its paired user window in front; (d)'s cases; (e)'s
// matrix under both input sources with the owner's source saved and restored.
async function inputProbes(ctx) {
  const {js, row, emit, records, scenes, front, activate, operator, io, ops, dir} = ctx;
  for (const scene of scenes) {
    const user = USER_WINDOW[scene];
    if (!records[user]) { for (const action of ['click', 'key']) emit({op: `probe.a.${action}`, scene, user, sample: 1, ok: false, notRun: `the user window's scene (${user}) is not up`}); continue; }
    for (const action of ['click', 'key']) {
      await activate(user);
      const located = await js(spike.LOCATE(scene, SCENE_WINDOW[scene], ACTION_TARGET[scene]));
      if (!located.cell?.ok) { row(`probe.a.${action}`, 1, located, {scene, user}); continue; }
      const before = front();
      if (before.frontmost?.pid !== records[user].pid || before.topWindow?.ownerPid !== records[user].pid) { emit({op: `probe.a.${action}`, scene, user, sample: 1, ok: false, error: 'the user window was not in front; nothing was sent'}); continue; }
      const acted = await js(action === 'click' ? spike.ACT_CLICK(scene) : spike.ACT_KEY(scene, KEY_PROBE[scene]));
      const after = front();
      const unchanged = after.frontmost?.pid === before.frontmost?.pid && after.topWindow?.number === before.topWindow?.number;
      row(`probe.a.${action}`, 1, acted, {scene, user, frontmostUnchanged: after.frontmost?.pid === before.frontmost?.pid, topWindowUnchanged: after.topWindow?.number === before.topWindow?.number, ...(acted.cell?.ok && !unchanged ? {ok: false, invalid: 'the front application or window changed'} : {})});
      const back = await js(spike.READBACK(scene));
      row(`probe.b.${action}`, 1, acted, {scene, route: acted.meta?.['cua/inputRoute'] ?? null, treeChanged: back.cell?.value?.treeChanged ?? null});
    }
  }
  // (d) The engine's own effects never fire it: the TextEdit task rows above must carry no userIntervened.
  const taskRows = fs.readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(r => r.op?.startsWith('task.') && !r.notRun);
  const fired = taskRows.filter(r => /userIntervened|The user changed|still interacting/.test(r.error ?? ''));
  emit({op: 'probe.d.noFire', scene: 'textedit', sample: 1, ok: taskRows.length > 0 && !fired.length, taskRows: taskRows.length, fired: fired.length,
    note: 'the engine\'s own super+n, typing, super+w and sheet click in the task rows; none may fail as userIntervened'});
  if (operator && records.textedit) {
    for (const [op, instruction] of [['probe.d.operatorKeystroke', 'send ONE keystroke over Screen Sharing into the TextEdit scene document'], ['probe.d.backgroundClick', 'click ONCE into the TextEdit scene window while it is behind another window']]) {
      await activate('textedit');
      if (!await io.confirm(`Operator: press Enter, then within 2 s ${instruction} while the engine types (n to skip): `)) { emit({op, scene: 'textedit', sample: 1, ok: false, notRun: 'skipped by the operator'}); continue; }
      const r = await js(spike.ACT_TYPE('textedit', FINDER_TYPING_NAME));
      const intervened = /userIntervened|The user changed|still interacting/.test(r.cell?.error ?? '');
      emit({op, scene: 'textedit', sample: 1, ok: intervened, inCellMs: r.cell?.inCellMs ?? null, actionInterval: r.meta?.['cua/actionInterval'] ?? null, receivedAt: r.meta?.['cua/receivedAt'] ?? null, hidIdleMs: r.meta?.['cua/hidIdleMs'] ?? null,
        operatorConfirmedTiming: await io.confirm('Was your input made while the engine was typing? [Enter = yes, n = no] ')});
      await js(spike.TREE('textedit', SCENE_WINDOW.textedit));   // the fresh observation the post-intervention lock asks for
    }
  } else for (const op of ['probe.d.operatorKeystroke', 'probe.d.backgroundClick']) emit({op, scene: 'textedit', sample: 1, ok: false, notRun: 'operator steps not requested (--operator)'});
  // (e) Korean and Unicode, under both sources; the owner's source restored whatever happens.
  await withInputSource(ops, dir, async () => {
    for (const [source, id] of Object.entries(INPUT_SOURCES)) {
      const switched = ops.inputSource(id);
      if (!switched?.selected) { emit({op: 'probe.e.typeText', source, sample: 1, ok: false, error: `the ${source} source ${id} could not be selected`}); continue; }
      for (const scene of ['textedit', 'chrome'].filter(s => records[s])) {
        let sample = 0;
        for (const text of UNICODE_STRINGS) {
          sample++;
          const typed = await js(spike.ACT_TYPE(scene, text));
          const landed = await js(spike.TEXT_LANDED(scene, records[scene].app, text));
          row('probe.e.typeText', sample, typed, {scene, source, route: typed.meta?.['cua/inputRoute'] ?? null, landed: landed.cell?.value?.landed ?? null, expected: landed.cell?.value?.expected ?? null});
        }
      }
    }
  });
}

// The run's scenes down. Vendor lane (or input built): Finder's run window closed with super+w through the guard and
// TextEdit quit from its scene document with super+q through the key guard, as the baseline quits it; then every scene
// the run brought up is stopped. Cua lane without input: Finder's window stays up for the next run (recorded), and
// TextEdit is stopped by the recorded-pid SIGTERM. Nothing is sent after a stop (a prompt may be waiting).
async function teardown({lane, shell, client, records, scenes, sceneCli, sceneDir, stopped, inputBuilt, sleep}) {
  const out = {};
  const canType = client && !stopped && (lane === 'vendor' || inputBuilt);
  const cell = code => client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: CELL_MS}}, CELL_MS + 15_000);
  // Puts a scene's app in front (device-side open -a) and says whether it got there.
  const toFront = async scene => {
    shell(`/usr/bin/open -a ${quote(records[scene].app)}`);
    for (let i = 0; i < 20; i++) { if (parseFrontmost(shell(FRONTMOST_SCRIPT)) === records[scene].bundleId) return true; await sleep(250); }
    return false;
  };
  if (canType) {
    try {
      if (records.finder && await toFront('finder')) {
        const seen = sceneCli(['front']);
        out.finderClosed = seen.frontmost?.bundleId === 'com.apple.finder' && seen.topWindow?.number === records.finder.window.number;
        if (out.finderClosed) { await cell(spike.PRESS('finder', 'super+w')); await sleep(1000); }
      }
      if (records.textedit && await toFront('textedit')) {
        out.textEditQuit = parseCell(textOf(await cell(QUIT_TEXTEDIT)))?.ok === true;
      }
    } catch (error) { out.inputError = error.message; }
  }
  if (client) { try { await client.close(); } catch {} }
  const down = [];
  for (const scene of [...scenes].reverse()) {
    if (!records[scene]) continue;
    if (scene === 'finder' && !out.finderClosed) { out.finderLeftOpen = true; continue; }
    const result = sceneCli(['down', scene, '--run', sceneDir]);
    down.push({scene, down: result.down ?? false, ...(result.reason ? {reason: result.reason} : {})});
  }
  out.down = down;
  if (down.some(s => !s.down)) out.error = `scenes still up: ${down.filter(s => !s.down).map(s => s.scene).join(', ')}`;
  return out;
}

// All runs of a lane. -> 0 when every run is complete.
export async function measureLane(options, io) {
  let code = 0;
  for (let run = 1; run <= options.runs; run++) {
    const result = await runOnce({...options, run, dir: join(resolve(options.out), `run-${run}`)}, io);
    if (result !== 0) code = 1;
    if (result === REFUSED) break;   // the engine refused: no later run could do better
  }
  return code;
}
