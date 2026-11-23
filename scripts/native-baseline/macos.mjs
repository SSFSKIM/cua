// The native baseline on macOS: TextEdit, driven by the vendor's computer-use helper (SkyComputerUseService), as the
// 2026-10-14 Mac baseline recorded it (docs/evidence/2026-10-14-native-baseline). The run loop in
// scripts/native-baseline.mjs calls this adapter for what is TextEdit's: the first getApp (approval and launch, with
// one retry on the launch's timeoutReached), bringing the TextEdit it launched to the front (setup.activate), a scratch
// document, the guarded observation series, the new-document -> typeText -> verify -> delete task, and quitting the
// TextEdit it launched. Every cell guards the window it acts on (./cells.mjs). The engine is the run's (--engine,
// ./engine.mjs): the vendor's helper or cua's engine; the service attestation names the one that answered and both
// engines' processes.
//
// The alert guard (rulings 1154, 1160, 1164; ../hosted-sittings/alert-guard.mjs, the module every sitting calls), on
// both engines alike: before each cell that may click (the scratch document's New Document button, a task's close and
// its sheet's Delete button) a fresh reading of the screen (../hosted-sittings/guard-device.mjs read on the device)
// refuses it when an alert window overlaps one of the run's TextEdit's windows or the Open panel's, or the alert holds
// the front or the key; before each key cell, when the alert holds the key (the key-cell premise: route 3's activation
// click goes to TextEdit's pid only, and the key guard checks the front); before each screenshot sample, when the alert
// overlaps TextEdit's windows (the vendor may crop a display capture to the window). A refusal sends nothing, writes
// the sample's row with its cause (NO VERDICT `alert` or `unread`; a held screenshot series' samples already taken are
// written first, invalid), keeps it in meta.alertGuards (per cell, with meta.alertGuardCounts) and stops the run
// (meta.alertGuardStop, the first), which the hosted record check reads as NO VERDICT; nothing is retried. The cleanup
// after it still quits TextEdit as after any failure: from its scratch document by ⌘Q, under the key guard (refused
// too while the alert holds the key), only with TextEdit in front and its scratch document in front of it; or, with no
// scratch document made, by SIGTERM to the pid the run launched. A TextEdit it cannot quit is left running, and the
// sitting's next run would refuse it, so the hosted plan chains A's runs (../hosted-sittings/plan.mjs): that run is
// SKIP, never a FAIL of its own. The run's windows are placed clear of the alerts from fresh readings, once TextEdit is
// up (the Open panel) and once its scratch document is (meta.placement: from, to and the read-back), and never again
// mid-run.
import {isTextEditApproval, TEXTEDIT_BUNDLE} from '../accept/lib.mjs';
import {FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess, sendIfFrontmost} from '../accept/key-guard.mjs';
import {quote} from '../browser-parity/topology.mjs';
import {captureCause, guardCause, keyCause, placeWindows, recordKeyUnread, recordRefusal} from '../hosted-sittings/alert-guard.mjs';
import {CAPTURE_ALERT_PROCESS} from '../native-matrix/live-checks.mjs';
import * as cells from './cells.mjs';
import {classifyHelpers, etimeSeconds, HELPER_SCRIPT, leftoverScript} from './remote.mjs';

const BIND_MS = 120_000;
// How long setup.activate waits for TextEdit to be the frontmost application after `open -a TextEdit`, and how often it
// reads it meanwhile.
const ACTIVATE_MS = 5_000;
const ACTIVATE_POLL_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = ms => Math.round(ms * 1000) / 1000;

// `engineBundle`: the approved cua engine the run serves, whose process the helper attestation names as its own.
// One process as `LC_ALL=C ps -o etime=,lstart=,comm=` prints it -> {ageSeconds, started (its lstart), path}, or null for
// no output (no such process) or a line that is not that.
export function parseProcess(output) {
  const match = /^\s*(\d+-)?(\d+(?::\d+){1,2})\s+([A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(\S.*?)\s*$/.exec(String(output).split('\n')[0] ?? '');
  return match ? {ageSeconds: etimeSeconds(`${match[1] ?? ''}${match[2]}`), started: match[3], path: match[4]} : null;
}
// ps's etime can read up to this much more than a process's age (whole seconds subtracted).
const ETIME_SLACK_MS = 1_000;
const isTextEdit = process => process !== null && /\/TextEdit$/.test(process.path);

export function macosDevice(remote, {checkout, runtimeRoot, engineBundle = null}) {
  return {
    helpers: () => classifyHelpers(remote(HELPER_SCRIPT), runtimeRoot, engineBundle),
    leftovers() { const [serves, textEdit] = remote(leftoverScript(checkout)).split(' ').map(Number); return {serves, textEditRunning: textEdit > 0}; },
    // The frontmost application's process, {pid, bundleId} or null (scripts/accept/key-guard.mjs).
    frontmost: () => parseFrontmostProcess(remote(FRONTMOST_PROCESS_SCRIPT)),
    // The run's TextEdit: the one TextEdit process (the run refuses to start while TextEdit runs, so it is the one the
    // bind launched).
    textEditPid() {
      const pids = remote('/usr/bin/pgrep -x TextEdit || true').split('\n').filter(Boolean).map(Number);
      if (pids.length !== 1 || !Number.isSafeInteger(pids[0])) throw new Error(`expected the run's one TextEdit process, found ${pids.length}`);
      return pids[0];
    },
    // Brings TextEdit to the front from the device side (LaunchServices activates the running instance).
    activate: () => remote('/usr/bin/open -a TextEdit'),
    // A process's age, start time and executable (parseProcess), or null when it is not running.
    processOf: pid => parseProcess(remote(`LC_ALL=C /bin/ps -o etime=,lstart=,comm= -p ${Number(pid)} || true`)),
    // Ends the TextEdit the run launched, by its pid, when it has no document (no scratch document was ever made).
    terminateTextEdit: pid => remote(`/bin/kill -TERM ${Number(pid)}`),
    // The alert guard's fresh reading of the run's TextEdit's windows (and the Open panel's), with the key when asked
    // (../hosted-sittings/guard-device.mjs read), and a window of it placed (place).
    guard: ({pid, key = false}) => lastJson(remote(guardDevice(checkout, ['read', '--target', `textedit:${Number(pid)}`, ...(key ? ['--key'] : [])]))),
    place: ({pid = null, panel = false, window, frame}) => lastJson(remote(guardDevice(checkout, ['place', ...(panel ? ['--panel'] : ['--pid', String(Number(pid))]),
      '--window', String(Number(window)), '--frame', [frame.x, frame.y, frame.width, frame.height].join(',')]))),
  };
}
const guardDevice = (checkout, args) => `cd ${quote(checkout)} && node scripts/hosted-sittings/guard-device.mjs ${args.map(quote).join(' ')}`;
const lastJson = text => JSON.parse(String(text).trim().split('\n').at(-1));

// ---- the alert guard (see the header) ----------------------------------------------------------------------------------

// The device's fresh reading, or null when it could not be read. The pointer and capture guards read null as unread,
// never as clear. The key guard refuses nothing on a key reading not taken (the key-cell premise,
// ../hosted-sittings/alert-guard.mjs keyCause): the cell goes unguarded against the alert holding the key, which the
// front check cannot see, and is counted in meta.keyUnread (recordKeyUnread).
function reading(ctx, {key = false} = {}) {
  try { return ctx.device.guard({pid: ctx.meta.textEdit?.pid, key}) ?? null; } catch { return null; }
}
// A refused sample: its row with the cause, the per-cell record, the run's stop (recordRefusal). Nothing of the cell
// was sent. `held`: a held series' samples already taken (measure's hold), written first, each invalid since the
// scratch guard after the series, which vouches for them, never runs.
const SERIES_STOPPED = 'the alert guard stopped the series before the scratch guard after it could confirm this sample';
function refuse(ctx, op, sample, cause, held = []) {
  for (const row of held) ctx.emit(row.ok ? {...row, ok: false, invalid: SERIES_STOPPED} : row);
  ctx.emit({op, sample, ok: false, ...recordRefusal(ctx.meta, op, cause, {sample})});
  throw new Error(`${op} sample ${sample}: nothing sent: ${cause.detail} (the alert guard, ruling 1154)`);
}
// Before a cell that may click: the run's TextEdit's windows and the Open panel's clear of every alert, the alert
// holding neither front nor key. `keyCell`: the cell sends keys as well (a task's close), so its key reading not taken
// is counted as a key cell's. -> the reading.
function pointerGuard(ctx, op, sample, {keyCell = false} = {}) {
  const r = reading(ctx, {key: true});
  const cause = guardCause(r?.bounds ?? null, {front: r?.front ?? null, key: r?.key ?? null}, {scenes: ['textedit']});
  if (cause) refuse(ctx, op, sample, cause);
  if (keyCell && !r?.key) recordKeyUnread(ctx.meta, op);
  return r;
}
// Before a key cell: the alert does not hold the key; a key reading not taken is counted (see reading).
function keyGuard(ctx, op, sample) {
  const r = reading(ctx, {key: true});
  if (!r?.key) { recordKeyUnread(ctx.meta, op); return; }
  const cause = keyCause({key: r.key});
  if (cause) refuse(ctx, op, sample, cause);
}
// Before a screenshot sample: the window it captures clear of every alert. `held`: the series' samples taken so far.
function captureGuard(ctx, op, sample, held) {
  const cause = captureCause(reading(ctx)?.bounds ?? null, {scenes: ['textedit']});
  if (cause) refuse(ctx, op, sample, cause, held);
}
// The run's windows placed clear of the alerts from a fresh reading (../hosted-sittings/alert-guard.mjs placeWindows),
// kept in meta.placement with the step it followed (`at`).
async function place(ctx, at) {
  const pid = ctx.meta.textEdit?.pid;
  const placed = await placeWindows(reading(ctx)?.bounds ?? null, {move: ({scene, number, frame}) => {
    try { return ctx.device.place({...(scene === 'openPanel' ? {panel: true} : {pid}), window: number, frame}); } catch (error) { return {error: error.message}; }
  }});
  (ctx.meta.placement ??= []).push({at, ...placed});
}

// The Open and Save panels are served out of process: a TextEdit fresh from its launch may show only that panel, and
// the frontmost reader may then name the panel's service rather than TextEdit.
const PANEL_SERVICE = /^com\.apple\.appkit\.xpc\.openAndSavePanelService\b/;
const describeFront = front => (front && typeof front === 'object' ? `${front.bundleId ?? 'an app with no bundle id'} (pid ${front.pid})${PANEL_SERVICE.test(front.bundleId ?? '') ? ': TextEdit\'s Open panel, served out of process, is in front' : ''}` : 'unreadable');

// The run stops where it needs TextEdit in front (setup.activate, a key cell): when replayd's capture alert holds the
// front instead (UserNotificationCenter; H0 (ii)), the stop is the alert's, which no verdict may read as a failure
// (rulings 1136, 1141), so the record names it for the hosted check (meta.incompleteCause) rather than leaving it to
// the message. The first such stop is the run's cause.
function alertCause(meta, at, front) {
  if (front?.bundleId === CAPTURE_ALERT_PROCESS) meta.incompleteCause ??= {cause: 'alert', at, front};
}

// A cell that sends keys to TextEdit runs only while the run's TextEdit process is the device's frontmost application
// (#162, scripts/accept/key-guard.mjs, by pid since M1b: another TextEdit process is not the target); otherwise it is not
// sent, the skip is recorded (meta.keySkipped and a key.skipped row), and the run stops with no further input. The
// scratch document's click on the Open panel's New Document button (a fresh launch; the panel is served out of process,
// so it may be what is frontmost then, and a click sends no modifier) is not key-guarded, only alert-guarded
// (pointerGuard); its super+n path is key-guarded, as its own cell (NEW_DOCUMENT_KEYS). A task's new document and its typing are separate cells, each checked right before it is
// sent, since the first waits up to TRANSITION_MS for the document.
// Each key cell is first checked by the alert guard (keyGuard), unless the cell's own pointer guard already read the key
// (`guarded`); `at` names the sample a refusal is written for.
async function keyCell(ctx, code, keys, {op = 'key', sample = 1, guarded = false} = {}) {
  if (!guarded) keyGuard(ctx, op, sample);
  const target = {pid: ctx.meta.textEdit?.pid, bundleId: TEXTEDIT_BUNDLE};
  const out = await sendIfFrontmost({target, keys, frontmost: () => ctx.device.frontmost(), send: () => ctx.js(code)});
  if (out.sent) return out.result;
  alertCause(ctx.meta, 'key.skipped', out.skipped.frontmost);
  (ctx.meta.keySkipped ??= []).push(out.skipped);
  ctx.emit({op: 'key.skipped', sample: ctx.meta.keySkipped.length, ok: false, ...out.skipped});
  return ctx.stop(`${out.skipped.event}: ${keys.join(', ')} not sent, the frontmost application is ${describeFront(out.skipped.frontmost)}, not the run's TextEdit (pid ${target.pid}) (#162)`);
}

// setup.activate (the own native engine spec, Verification system part 1): the run's TextEdit brought to the front from
// the device (`open -a TextEdit`) right after the bind, verified by its pid as the frontmost application. The vendor's
// launch and click paths activate TextEdit and cua's engine never does, so without it the key guard would stop cua's
// lane at its first key: the baseline measures the driven-app-frontmost regime on both engines. Not judged (setup.*);
// a TextEdit that does not come to the front stops the run before any key or click.
async function activate(ctx) {
  const {meta, device, emit} = ctx, pid = meta.textEdit.pid, limit = ctx.activateMs ?? ACTIVATE_MS;
  const started = performance.now();
  device.activate();
  let front = null, attempts = 0;
  const seen = [];
  for (;;) {
    try { front = await device.frontmost(); } catch { front = null; }
    attempts++;
    if (!seen.some(s => JSON.stringify(s) === JSON.stringify(front ?? 'unreadable'))) seen.push(front ?? 'unreadable');
    if (front?.pid === pid || performance.now() - started >= limit) break;
    await sleep(ACTIVATE_POLL_MS);
  }
  const ok = front?.pid === pid;
  emit({op: 'setup.activate', sample: 1, ok, wallMs: round(performance.now() - started), attempts, frontmost: front ?? 'unreadable', seen,
    note: 'open -a TextEdit from the device, then the frontmost application read until it is the run\'s TextEdit; harness setup, not judged'});
  if (!ok) {
    alertCause(meta, 'setup.activate', front);
    throw new Error(`setup.activate: TextEdit (pid ${pid}) is not the frontmost application after open -a TextEdit; the frontmost is ${describeFront(front)}`);
  }
}

// TextEdit this run launched is quit from its scratch document (the cell refuses when that is not in front). A run that
// failed before it made one (a failed bind or activation) has no window it can quit from, and nobody's document in that
// TextEdit: it is ended by the pid the run read when it saw it come up, so the sitting's next run is not refused. Only a
// process the run started is signalled: the pid was accepted as the run's only when it started after the bind began
// (gui), and right before the signal it must still be TextEdit with that start time; otherwise nothing is signalled and
// quitError says why.
async function quitTextEdit(ctx) {
  const {meta, device} = ctx;
  if (meta.textEdit?.launchedByRun && !meta.textEdit.scratchDocument && !meta.textEdit.quitByRun && Number.isSafeInteger(meta.textEdit.pid)) {
    const {pid, started} = meta.textEdit, now = device.processOf(pid);
    meta.textEdit.quitByRun = false;
    if (!now) { meta.textEdit.quitError = `not signalled: pid ${pid} is no longer running`; return; }
    if (!isTextEdit(now) || now.started !== started) { meta.textEdit.quitError = `not signalled: pid ${pid} is now ${now.path} started ${now.started}, not the run's TextEdit (started ${started})`; return; }
    try { device.terminateTextEdit(pid); } catch (error) { meta.textEdit.quitError = `SIGTERM to TextEdit (pid ${pid}) failed: ${error.message}`; return; }
    let running = true;
    for (let i = 0; i < 10 && running; i++) { await sleep(500); running = device.leftovers().textEditRunning; }
    meta.textEdit.quitByRun = !running;
    meta.textEdit.quitHow = 'SIGTERM to the pid the run launched: no scratch document existed';
    if (running) meta.textEdit.quitError = `TextEdit (pid ${meta.textEdit.pid}) still running after SIGTERM`;
    return;
  }
  return quitFromScratch(ctx);
}
async function quitFromScratch(ctx) {
  const {meta, device} = ctx;
  if (!meta.textEdit?.launchedByRun || meta.textEdit.quitByRun || !ctx.warmOpen()) return;
  const quit = await keyCell(ctx, cells.QUIT_TEXTEDIT, ['super+q'], {op: 'quit'});
  let running = true;
  for (let i = 0; i < 10 && running; i++) { await sleep(500); running = device.leftovers().textEditRunning; }
  meta.textEdit.quitByRun = Boolean(quit.cell?.ok) && !running;
  if (!meta.textEdit.quitByRun) meta.textEdit.quitError = quit.cell?.error ?? quit.failure ?? 'TextEdit still running after super+q';
}

// The task's act as one result (its task.act row): the two cells' times and counts added, the second's outcome.
function joined(first, second) {
  const inCellMs = (first.cell?.inCellMs ?? 0) + (second.cell?.inCellMs ?? 0);
  const cell = second.cell && (second.cell.ok
    ? {ok: true, inCellMs, value: {actions: first.cell.value.actions + second.cell.value.actions, observations: first.cell.value.observations + second.cell.value.observations}}
    : {...second.cell, inCellMs});
  return {...second, wallMs: first.wallMs + second.wallMs, started: first.started, cell};
}

export const macosAdapter = {
  platform: 'darwin',
  target: 'TextEdit',
  device: (remote, {pre}) => macosDevice(remote, {checkout: pre.checkout, runtimeRoot: pre.runtimeRoot, engineBundle: pre.engine?.installed?.bundlePath ?? null}),
  answer: msg => (isTextEditApproval(msg) ? {action: 'accept', content: {}} : {action: 'decline'}),
  refuse: pre => (pre.textEditRunning ? 'TextEdit is running on the device: its windows may be the owner\'s; quit it (or wait) and re-run' : null),
  start(meta, pre) { meta.textEdit = {runningBefore: pre.textEditRunning}; },

  async gui(ctx) {
    const {meta, pre, device, guard, js, row, emit, measure} = ctx;
    // The first getApp of a TextEdit that is not running launches it; on the mini that call fails with timeoutReached
    // after about 5 s (TextEdit comes up with only its out-of-process Open panel) and the next one binds. Both are
    // recorded: the first as bind.getApp, the retry as bind.getApp.retry.
    // Preflight may be stale: never bind or claim a TextEdit the owner opened since then, even within ps's rounding.
    meta.textEdit.launchedByRun = false;
    if (device.leftovers().textEditRunning) {
      const pid = device.textEditPid();
      throw new Error(`TextEdit (pid ${pid}) started before this run's bind: it is not the run's; refusing to drive it`);
    }
    const bindStarted = Date.now();
    const bind = guard(await js(cells.BIND, BIND_MS), 'cua.getApp(TextEdit)');
    const approvals = ctx.elicited();
    row('bind.getApp', 1, bind, {approvals: approvals.length, textEditLaunched: !pre.textEditRunning});
    approvals.forEach((a, i) => emit({op: 'approval.elicitation', sample: i + 1, ok: a.action === 'accept', wallMs: round(a.at - bind.started), app: a.app, action: a.action,
      note: 'wallMs: from the start of the getApp call to the approval request; the harness answers at once'}));
    let bound = bind;
    if (!bind.cell?.ok && /timeoutReached/.test(bind.cell?.error ?? '')) {
      bound = guard(await js(cells.BIND, BIND_MS), 'cua.getApp(TextEdit), retried');
      row('bind.getApp.retry', 1, bound, {approvals: ctx.elicited().length});
    }
    // The engine requested and the one the results attested so far (every one must agree, ./engine.mjs engineProblem;
    // 'unattested' before any did), with both engines' processes running now.
    meta.service = {surface: 'computer', engine: meta.nativeEngine?.requested ?? 'vendor', answered: meta.nativeEngine ? meta.nativeEngine.attested[0]?.engine ?? 'unattested' : 'vendor', ...ctx.helperAttestation()};
    // Whether the bind launched TextEdit, and its pid whenever it did, bound or not: the key guard's target and, should
    // the run fail before its scratch document, what cleanup ends. TextEdit must appear only after the pre-bind read
    // above. Its age is a secondary guard: etime subtracts whole seconds, so it can read up to 1 s more than the
    // process's age (the mini, 2026-10-21: a run refused the TextEdit its own bind launched).
    if (!pre.textEditRunning && device.leftovers().textEditRunning) {
      const pid = device.textEditPid(), process = device.processOf(pid);
      if (!isTextEdit(process)) throw new Error(`TextEdit (pid ${pid}) could not be read as TextEdit by ps (${process ? process.path : 'no such process'}); refusing to drive it`);
      if (!(process.ageSeconds * 1000 - ETIME_SLACK_MS <= Date.now() - bindStarted)) throw new Error(`TextEdit (pid ${pid}) started before this run's bind (${process.ageSeconds} s ago): it is not the run's; refusing to drive it`);
      Object.assign(meta.textEdit, {launchedByRun: true, pid, started: process.started});
    }
    if (!bound.cell?.ok) throw new Error(`cua.getApp(TextEdit) failed: ${bound.cell?.error ?? bound.failure}`);
    meta.textEdit.pid ??= device.textEditPid();
    await activate(ctx);

    // The Open panel a fresh TextEdit shows placed clear of the alerts; then the cell that may click its New Document
    // button only under the alert guard.
    await place(ctx, 'setup.activate');
    pointerGuard(ctx, 'setup.newDocument', 1);
    let scratch = guard(await js(cells.NEW_DOCUMENT), 'the scratch document');
    if (scratch.cell?.ok && scratch.cell.value?.needsKeys) scratch = guard(await keyCell(ctx, cells.NEW_DOCUMENT_KEYS, ['super+n'], {op: 'setup.newDocument'}), 'the scratch document');
    row('setup.newDocument', 1, scratch);
    if (!scratch.cell?.ok) throw new Error(`no scratch document: ${scratch.cell?.error ?? scratch.failure}`);
    meta.textEdit.scratchDocument = true;
    // The scratch document, which every task's document cascades from, placed clear of the alerts: the last placement.
    await place(ctx, 'setup.newDocument');
    // The scratch document in front, checked between series (op guard.scratch, not charged to any sample).
    const scratchGuard = async sample => {
      const r = row('guard.scratch', sample, guard(await js(cells.SCRATCH_GUARD), 'the scratch guard'));
      return r.ok && r.scratchInFront === true;
    };
    // Each full-tree sample checks its own target. Screenshot samples cannot without paying for a tree read, so the
    // series is bracketed by the scratch guard: run only with the scratch document in front, and every sample is
    // invalidated when it is no longer in front afterwards.
    await measure('warm.getAXState', ctx.samples, cells.AX_FULL);
    if (!await scratchGuard(1)) throw new Error('the scratch document is not in front before the screenshot series');
    const shots = await measure('warm.getScreenshot', ctx.samples, cells.SCREENSHOT, {hold: true, before: (sample, held) => captureGuard(ctx, 'warm.getScreenshot', sample, held)});
    const stillInFront = await scratchGuard(2);
    for (const shot of shots) emit(stillInFront || !shot.ok ? shot : {...shot, ok: false, invalid: 'the scratch document was not in front after the screenshot series'});
    if (!stillInFront) throw new Error('the scratch document is not in front after the screenshot series');

    for (let sample = 1; sample <= ctx.tasks; sample++) {
      const steps = [];
      const opened = guard(await keyCell(ctx, cells.TASK_NEW, ['super+n'], {op: 'task.act', sample}), `task ${sample}`);
      const act = opened.cell?.ok ? joined(opened, guard(await keyCell(ctx, cells.TASK_TYPE, ['typeText'], {op: 'task.act', sample}), `task ${sample}`)) : opened;
      steps.push(row('task.act', sample, act));
      if (act.cell?.ok) steps.push(row('task.verify', sample, guard(await js(cells.TASK_VERIFY), `task ${sample}`)));
      // The close may click its sheet's Delete button: the pointer guard, whose reading holds the key too.
      pointerGuard(ctx, 'task.close', sample, {keyCell: true});
      const close = guard(await keyCell(ctx, cells.TASK_CLOSE, ['super+w'], {op: 'task.close', sample, guarded: true}), `task ${sample}`);
      steps.push(row('task.close', sample, close));
      const ok = steps.length === 3 && steps.every(s => s.ok);
      const sum = key => round(steps.reduce((total, s) => total + (s[key] ?? 0), 0));
      // `cells` counts the task's rows (act, verify, close); since 9173dbf the act row joins two cells (TASK_NEW and
      // TASK_TYPE), so a successful task dispatches four.
      emit({op: 'task.total', sample, ok, wallMs: sum('wallMs'), inCellMs: sum('inCellMs'), cells: steps.length, actions: sum('actions'), observations: sum('observations'),
        outcome: ok ? 'typed text verified, document closed without saving' : steps.find(s => !s.ok)?.error ?? 'failed'});
      ctx.log(`task ${sample}: ${ok ? 'ok' : 'FAIL'}`);
      if (!close.cell?.ok && act.cell?.ok) ctx.stop(`task ${sample}'s document could not be confirmed closed: ${close.cell?.error ?? close.failure}`);
    }
  },
  beforeEnd: quitTextEdit,
  // After a failure TextEdit is quit only from the scratch document, never from a window the run cannot vouch for, and
  // not at all after a stop (a prompt may be waiting).
  async cleanup(ctx) {
    if (!ctx.stopped() && !ctx.meta.complete) { try { await quitTextEdit(ctx); } catch (error) { if (ctx.meta.textEdit) ctx.meta.textEdit.quitError ??= error.message; } }
  },
  leftovers: device => device.leftovers(),
  leftBehind: (leftovers, pre) => leftovers.serves > 0 || (leftovers.textEditRunning && !pre.textEditRunning),
};
