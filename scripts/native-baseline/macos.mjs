// The native baseline on macOS: TextEdit, driven by the vendor's computer-use helper (SkyComputerUseService), as the
// 2026-10-14 Mac baseline recorded it (docs/evidence/2026-10-14-native-baseline). The run loop in
// scripts/native-baseline.mjs calls this adapter for what is TextEdit's: the first getApp (approval and launch, with
// one retry on the launch's timeoutReached), a scratch document, the guarded observation series, the
// new-document -> typeText -> verify -> delete task, and quitting the TextEdit it launched. Every cell guards the window
// it acts on (./cells.mjs).
import {isTextEditApproval} from '../accept/lib.mjs';
import * as cells from './cells.mjs';
import {classifyHelpers, HELPER_SCRIPT, leftoverScript} from './remote.mjs';

const BIND_MS = 120_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = ms => Math.round(ms * 1000) / 1000;

export function macosDevice(remote, {checkout, runtimeRoot}) {
  return {
    helpers: () => classifyHelpers(remote(HELPER_SCRIPT), runtimeRoot),
    leftovers() { const [serves, textEdit] = remote(leftoverScript(checkout)).split(' ').map(Number); return {serves, textEditRunning: textEdit > 0}; },
  };
}

// TextEdit this run launched is quit from its scratch document (the cell refuses when that is not in front).
async function quitTextEdit(ctx) {
  const {meta, device} = ctx;
  if (!meta.textEdit?.launchedByRun || meta.textEdit.quitByRun || !ctx.warmOpen()) return;
  const quit = await ctx.js(cells.QUIT_TEXTEDIT);
  let running = true;
  for (let i = 0; i < 10 && running; i++) { await sleep(500); running = device.leftovers().textEditRunning; }
  meta.textEdit.quitByRun = Boolean(quit.cell?.ok) && !running;
  if (!meta.textEdit.quitByRun) meta.textEdit.quitError = quit.cell?.error ?? quit.failure ?? 'TextEdit still running after super+q';
}

export const macosAdapter = {
  platform: 'darwin',
  target: 'TextEdit',
  device: (remote, {pre}) => macosDevice(remote, {checkout: pre.checkout, runtimeRoot: pre.runtimeRoot}),
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
    meta.service = {surface: 'computer', engine: 'sky', answered: 'vendor', ...ctx.helperAttestation()};
    if (!bound.cell?.ok) throw new Error(`cua.getApp(TextEdit) failed: ${bound.cell?.error ?? bound.failure}`);

    const scratch = guard(await js(cells.NEW_DOCUMENT), 'the scratch document');
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
      const act = guard(await js(cells.TASK_ACT), `task ${sample}`);
      steps.push(row('task.act', sample, act));
      if (act.cell?.ok) steps.push(row('task.verify', sample, guard(await js(cells.TASK_VERIFY), `task ${sample}`)));
      const close = guard(await js(cells.TASK_CLOSE), `task ${sample}`);
      steps.push(row('task.close', sample, close));
      const ok = steps.length === 3 && steps.every(s => s.ok);
      const sum = key => round(steps.reduce((total, s) => total + (s[key] ?? 0), 0));
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
