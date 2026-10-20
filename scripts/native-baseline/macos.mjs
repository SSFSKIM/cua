// The native baseline on macOS: TextEdit, driven by the vendor's computer-use helper (SkyComputerUseService), as the
// 2026-10-14 Mac baseline recorded it (docs/evidence/2026-10-14-native-baseline). The run loop in
// scripts/native-baseline.mjs calls this adapter for what is TextEdit's: the first getApp (approval and launch, with
// one retry on the launch's timeoutReached), bringing the TextEdit it launched to the front (setup.activate), a scratch
// document, the guarded observation series, the new-document -> typeText -> verify -> delete task, and quitting the
// TextEdit it launched. Every cell guards the window it acts on (./cells.mjs). The engine is the run's (--engine,
// ./engine.mjs): the vendor's helper or cua's engine; the service attestation names the one that answered and both
// engines' processes.
import {isTextEditApproval, TEXTEDIT_BUNDLE} from '../accept/lib.mjs';
import {FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess, sendIfFrontmost} from '../accept/key-guard.mjs';
import * as cells from './cells.mjs';
import {classifyHelpers, HELPER_SCRIPT, leftoverScript} from './remote.mjs';

const BIND_MS = 120_000;
// How long setup.activate waits for TextEdit to be the frontmost application after `open -a TextEdit`, and how often it
// reads it meanwhile.
const ACTIVATE_MS = 5_000;
const ACTIVATE_POLL_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = ms => Math.round(ms * 1000) / 1000;

// `engineBundle`: the approved cua engine the run serves, whose process the helper attestation names as its own.
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
  };
}

const describeFront = front => (front && typeof front === 'object' ? `${front.bundleId ?? 'an app with no bundle id'} (pid ${front.pid})` : 'unreadable');

// A cell that sends keys to TextEdit runs only while the run's TextEdit process is the device's frontmost application
// (#162, scripts/accept/key-guard.mjs, by pid since M1b: another TextEdit process is not the target); otherwise it is not
// sent, the skip is recorded (meta.keySkipped and a key.skipped row), and the run stops with no further input. The
// scratch document's click on the Open panel's New Document button (a fresh launch; the panel is served out of process,
// so it may be what is frontmost then, and a click sends no modifier) is not guarded; its super+n path is, as its own
// cell (NEW_DOCUMENT_KEYS). A task's new document and its typing are separate cells, each checked right before it is
// sent, since the first waits up to TRANSITION_MS for the document.
async function keyCell(ctx, code, keys) {
  const target = {pid: ctx.meta.textEdit?.pid, bundleId: TEXTEDIT_BUNDLE};
  const out = await sendIfFrontmost({target, keys, frontmost: () => ctx.device.frontmost(), send: () => ctx.js(code)});
  if (out.sent) return out.result;
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
  for (;;) {
    try { front = await device.frontmost(); } catch { front = null; }
    attempts++;
    if (front?.pid === pid || performance.now() - started >= limit) break;
    await sleep(ACTIVATE_POLL_MS);
  }
  const ok = front?.pid === pid;
  emit({op: 'setup.activate', sample: 1, ok, wallMs: round(performance.now() - started), attempts, frontmost: front ?? 'unreadable',
    note: 'open -a TextEdit from the device, then the frontmost application read until it is the run\'s TextEdit; harness setup, not judged'});
  if (!ok) throw new Error(`setup.activate: TextEdit (pid ${pid}) is not the frontmost application after open -a TextEdit; the frontmost is ${describeFront(front)}`);
}

// TextEdit this run launched is quit from its scratch document (the cell refuses when that is not in front).
async function quitTextEdit(ctx) {
  const {meta, device} = ctx;
  if (!meta.textEdit?.launchedByRun || meta.textEdit.quitByRun || !ctx.warmOpen()) return;
  const quit = await keyCell(ctx, cells.QUIT_TEXTEDIT, ['super+q']);
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
    const bind = guard(await js(cells.BIND, BIND_MS), 'cua.getApp(TextEdit)');
    const approvals = ctx.elicited();
    row('bind.getApp', 1, bind, {approvals: approvals.length, textEditLaunched: !pre.textEditRunning});
    approvals.forEach((a, i) => emit({op: 'approval.elicitation', sample: i + 1, ok: a.action === 'accept', wallMs: round(a.at - bind.started), app: a.app, action: a.action,
      note: 'wallMs: from the start of the getApp call to the approval request; the harness answers at once'}));
    meta.textEdit.launchedByRun = !pre.textEditRunning && device.leftovers().textEditRunning;
    let bound = bind;
    if (!bind.cell?.ok && /timeoutReached/.test(bind.cell?.error ?? '')) {
      bound = guard(await js(cells.BIND, BIND_MS), 'cua.getApp(TextEdit), retried');
      row('bind.getApp.retry', 1, bound, {approvals: ctx.elicited().length});
    }
    // The engine requested and the one the results attested so far (every one must agree, ./engine.mjs engineProblem),
    // with both engines' processes running now.
    meta.service = {surface: 'computer', engine: meta.nativeEngine?.requested ?? 'vendor', answered: meta.nativeEngine?.attested?.[0]?.engine ?? 'vendor', ...ctx.helperAttestation()};
    if (!bound.cell?.ok) throw new Error(`cua.getApp(TextEdit) failed: ${bound.cell?.error ?? bound.failure}`);
    meta.textEdit.pid = device.textEditPid();
    await activate(ctx);

    let scratch = guard(await js(cells.NEW_DOCUMENT), 'the scratch document');
    if (scratch.cell?.ok && scratch.cell.value?.needsKeys) scratch = guard(await keyCell(ctx, cells.NEW_DOCUMENT_KEYS, ['super+n']), 'the scratch document');
    row('setup.newDocument', 1, scratch);
    if (!scratch.cell?.ok) throw new Error(`no scratch document: ${scratch.cell?.error ?? scratch.failure}`);
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
    const shots = await measure('warm.getScreenshot', ctx.samples, cells.SCREENSHOT, {hold: true});
    const stillInFront = await scratchGuard(2);
    for (const shot of shots) emit(stillInFront || !shot.ok ? shot : {...shot, ok: false, invalid: 'the scratch document was not in front after the screenshot series'});
    if (!stillInFront) throw new Error('the scratch document is not in front after the screenshot series');

    for (let sample = 1; sample <= ctx.tasks; sample++) {
      const steps = [];
      const opened = guard(await keyCell(ctx, cells.TASK_NEW, ['super+n']), `task ${sample}`);
      const act = opened.cell?.ok ? joined(opened, guard(await keyCell(ctx, cells.TASK_TYPE, ['typeText']), `task ${sample}`)) : opened;
      steps.push(row('task.act', sample, act));
      if (act.cell?.ok) steps.push(row('task.verify', sample, guard(await js(cells.TASK_VERIFY), `task ${sample}`)));
      const close = guard(await keyCell(ctx, cells.TASK_CLOSE, ['super+w']), `task ${sample}`);
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
    if (!ctx.stopped() && !ctx.meta.complete) { try { await quitTextEdit(ctx); } catch {} }
  },
  leftovers: device => device.leftovers(),
  leftBehind: (leftovers, pre) => leftovers.serves > 0 || (leftovers.textEditRunning && !pre.textEditRunning),
};
