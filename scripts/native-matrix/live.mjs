#!/usr/bin/env node
// The M2a.5 hold's checks (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2a.5 "Live on the mini"; the
// Decision Log's "M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.2" and "M2a.4" entries). Run from this checkout
// on the controller, inside a CI-opt hold on the mini; the device steps go over ssh to the harness checkout
// (scripts/native-baseline/remote.mjs's PARITY_CHECKOUT, placed at this checkout's commit), as the goldens recorder does
// (./goldens.mjs, whose device CLI wrapper and vendor lane this reuses). Comparison A is not here: it is
// scripts/native-baseline.mjs run/compare, whose rows now carry cua/serviceMs beside cua/engineMs.
//
//   live.mjs minimized        --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs paste            --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs input-source     --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs route4           --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs minimized-select --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs enablement       --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs menu             --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs hscroll          --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs cleanup      --device <alias> [--run <device dir>] [--preparation <dir>/preparation.json] [--out <dir>] [--dry-run]
//
// Every command but cleanup:
//   - Refuses (exit 2), before anything on the device changes, on a dirty controller checkout, and on the device's
//     refusals (./live-device.mjs begin, ./live-checks.mjs liveRefusals): the scenes' (a TextEdit, Chrome for Testing
//     or fixture the run did not start, a Finder window not the run's, a hidden Finder), the harness checkout dirty or
//     at another commit, the approved engine missing or not this checkout's build, scenes a dead run left up.
//   - Otherwise saves the owner's front app on the device, stops the approved engine (`shutdown`; a busy engine fails),
//     runs its check, and always ends with the put-back (./live-device.mjs putback: Finder's teardown, every scene down
//     with Finder's keys, the saved input source and per-context preference, the engine stopped, no scene app or
//     Chrome for Testing left running, the owner's front app back, never the owner's Chrome or Claude), then reads the
//     front app again.
//   - Writes <out>/result.json: {schema, command, device, started, finished, controller, checkout, engine, check: <the
//     check's result>, putBack, frontApp, complete, pass, problems}. Exit 0 when complete and the check passed, 1
//     otherwise.
// `--dry-run` prints every device command the command would run, in order, and runs none (the device's answers are
// the success path's, ./live.mjs DRY_ANSWERS), writing nothing.
//
// The checks:
//   minimized     the run's TextEdit window minimized by its own button; the observation (tree, no screenshot, the
//                 reason), a refused synthesized click and element scroll, set_value and select_text acting with no
//                 click posted, then type_text and ⌘A recorded (did the value change, did the selection become the
//                 whole value), each outcome's consequence stated apart, the window restored.
//   menu          (a residue cell) the run's TextEdit behind the run's Finder window: Edit > Select All, and Format >
//                 Font > Bold with the first line selected, each through the menu-bar click (the record, under which
//                 the engine holds route 3's fake activation) and an observation (its enabled state), an element click,
//                 and an observation (its effect); on cua's engine as built, then on the vendor's on a fresh TextEdit
//                 in the same state, the frontmost process read after each vendor action and an activation watcher
//                 around both lanes; judged by enabled state and effect, compared item by item.
//   paste         M2a.3 on the run's TextEdit behind the run's Finder window: a plain and a Markdown paste, each over a
//                 selected line, and type_text under Korean 2-Set (the paste route; the per-context input preference
//                 turned off for it when it read on), each read back; the user window in front throughout; a system
//                 alert (a pasteboard-privacy prompt) before or after any step aborts the section unclicked, its owner and
//                 text recorded; the owner's source and preference restored (the put-back verifies them) and the
//                 owner's clipboard's type list unchanged. Inside the Korean window, the HID composition row (MAWS
//                 P4-B2, a measurement): with the run's TextEdit frontmost and key, r then k posted at the HID tap by
//                 `--probe keystroke`, once with each key's string, once `--key-codes-only` (the layout's key codes)
//                 and once `--ansi-keys` (the fixed physical keys, as the vendor's pressKey), each variant from an
//                 emptied document, its value read back and classified (가, rk, ㄱㅏ or other), its probe JSON, source
//                 and layout recorded; the log names each variant's reading (compositionSummary).
//   input-source  `--probe input-source` through the approved bundle: the owner's source and per-context preference
//                 saved, Korean 2-Set selected, read back by a second probe, both restored (and again by put-back).
//   enablement    (a residue cell) the run's Electron fixture observed by one connection, which closes, then by a
//                 second: released when the fixture's own record of Chromium's mode (app.isAccessibilitySupportEnabled)
//                 turns on after each observation and off after each close; Chrome for Testing not judged (the reason
//                 is in the result).
//   route4        (a residue cell) the approved engine launched under a prepared home whose engine.json gives TextEdit
//                 route 4 (the owner's file never written); a synthesized click into the run's TextEdit behind the
//                 run's Finder window, judged by outcome, route 4, Finder and its key window back in front.
//   minimized-select (a residue cell) select_text into the run's minimized TextEdit, the write (the text area's
//                 AXSelectedTextRange by `--probe text-view`) told from the read (the engine's observation).
//   hscroll       (a residue cell) the run's TextEdit on a page wider than its window behind the run's Finder window,
//                 its horizontal bar set mid-way by the probe, scrolled right one page by cua's engine, then the same by
//                 the vendor's on a fresh TextEdit, each read back by the bar's value: the direction each moved.
//   A residue cell's result.json is the native matrix's CellResult (./cell-result.mjs) with the fields below kept.
//   cleanup       the put-back alone (and the vendor home's cleanup from a preparation.json), for a command that died.
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient} from '../browser-parity/mcp.mjs';
import {quote} from '../browser-parity/topology.mjs';
import {MARKER} from '../native-baseline/cells.mjs';
import {checkoutCli, checkVendorPreflight, connectVendorLane, controllerCheckout, deviceOps} from './goldens.mjs';
import {BIND} from './goldens-cells.mjs';
import {REPO_ROOT} from './goldens-install.mjs';
import {counts} from './cell-result.mjs';
import {EFFECT, MENU_BAR, MENU_ITEM, SCROLL_RIGHT, SELECT_FIRST_LINE} from './live-cells.mjs';
import {JOURNAL_FILE, MENU_ITEMS, menuComparison, putBackBoundMs, recoverBoundMs} from './live-checks.mjs';
import {HSCROLL_START} from './residue-device.mjs';
import {CHROME_NOT_JUDGED, RESIDUE_CELLS, asCellResult, hscrollVerdict, isResidueCell, residueRows} from './residue-checks.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REFUSED = 2;
export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-live';
export const COMMANDS = Object.freeze(['minimized', 'paste', 'input-source', ...RESIDUE_CELLS, 'cleanup']);
// The commands with a vendor lane (they need --approved-runtime).
const VENDOR_LANE = Object.freeze(['menu', 'hscroll']);
const LIVE_DEVICE = 'scripts/native-matrix/live-device.mjs';

// ---- the device ---------------------------------------------------------------------------------------------------

// Every ssh the hold opens: a bounded connect and a dead peer noticed (ServerAlive), so a hung link fails the step
// instead of holding the hold.
export const SSH_OPTIONS = Object.freeze(['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4']);
// Each device step's bound, by its CLI and command (the remote script names them); a step past its bound is killed
// here (SIGKILL on the local ssh) and the controller's recovery then stops whatever still runs on the device before it
// restores anything. The put-back's and the recovery's outwait their own bounds on the device (live-checks.mjs
// RECOVERY_BOUNDS), so the controller never gives up on one that is still within them.
const BOUND_MARGIN_MS = 60_000;
const STEP_TIMEOUTS = Object.freeze({
  'live-device.mjs begin': 120_000, 'live-device.mjs minimized': 240_000, 'live-device.mjs menu': 240_000, 'live-device.mjs paste': 420_000,
  'live-device.mjs enablement': 180_000, 'live-device.mjs input-source': 180_000, 'live-device.mjs route4': 240_000,
  'live-device.mjs minimized-select': 240_000, 'live-device.mjs hscroll': 180_000, 'live-device.mjs hscroll-read': 120_000, 'live-device.mjs watch': 60_000, 'live-device.mjs putback': putBackBoundMs() + BOUND_MARGIN_MS,
  'live-device.mjs recover': recoverBoundMs() + BOUND_MARGIN_MS, 'scenes-mac.mjs up': 180_000, 'scenes-mac.mjs down': 180_000, 'scenes-mac.mjs activate': 60_000,
  'scenes-mac.mjs frontmost': 60_000, 'prepare.mjs prepare': 300_000, 'prepare.mjs cleanup': 300_000,
});
const DEFAULT_STEP_MS = 180_000, PREFLIGHT_MS = 300_000, HOME_MS = 30_000;
const stepOf = script => /(live-device\.mjs|scenes-mac\.mjs|prepare\.mjs) '?([\w-]+)'?/.exec(script);
export function stepTimeout(script) {
  if (/hostIdentity/.test(script)) return PREFLIGHT_MS;
  if (/printf %s "\$HOME"/.test(script)) return HOME_MS;
  const match = stepOf(script);
  return (match && STEP_TIMEOUTS[`${match[1]} ${match[2]}`]) ?? DEFAULT_STEP_MS;
}
// A device step's remote script with its process journaled in the run's journal (live-checks.mjs JOURNAL_FILE) before
// it starts: the remote shell writes its own pid and start time (ps's lstart, C locale), then execs the device CLI or
// the vendor serve in its place, so that pid and start time are the process's own and the recovery can tell it from
// another run's or a reused pid. A script that execs no node (a read of $HOME, the preflight) is left as it is.
const NODE_LAUNCH = /&& (exec env |node )/;
export function journaledScript(script, run) {
  if (!run || !NODE_LAUNCH.test(script)) return script;
  const step = stepOf(script);
  const label = step ? `${step[1]} ${step[2]}` : /serve\.mjs|cua\.mjs'? serve/.test(script) ? 'vendor serve' : 'device node';
  const record = `/bin/mkdir -p -m 700 ${quote(run)} && printf 'cli\\t%s\\t%s\\t%s\\n' "$$" "$(LC_ALL=C /bin/ps -o lstart= -p $$)" ${quote(label)} >> ${quote(`${run}/${JOURNAL_FILE}`)}`;
  return script.replace(NODE_LAUNCH, (_, launch) => `&& ${record} && exec ${launch === 'node ' ? 'node ' : 'env '}`);
}
// An exec whose every ssh carries SSH_OPTIONS and its step's timeout, its node launch journaled once `journal.run` is set.
export function boundedExec(exec, journal = {run: null}) {
  return (command, args, options = {}) => (command !== 'ssh' ? exec(command, args, options)
    : exec(command, [...SSH_OPTIONS, ...args.slice(0, -1), journaledScript(String(args.at(-1)), journal.run)],
      {...options, timeout: options.timeout ?? stepTimeout(String(args.at(-1))), killSignal: 'SIGKILL'}));
}

// The goldens recorder's device steps (scenes, the vendor home, the vendor preflight and serve) plus this hold's device
// CLI, all through one bounded exec; the vendor serve's ssh carries the same options and is journaled as well.
// `journalTo(run)` names the run whose journal records each device process from then on.
export function liveOps(device, {exec = execFileSync} = {}) {
  const journal = {run: null};
  const bounded = boundedExec(exec, journal);
  const base = deviceOps(device, {exec: bounded});
  const {cli} = checkoutCli(device, {exec: bounded});
  return {...base, live: args => cli(LIVE_DEVICE, args, {answersOnFailure: true}), journalTo: run => { journal.run = run; },
    serveSpec: spec => {
      const serve = base.serveSpec(spec);
      return serve.command === 'ssh' ? {...serve, args: [...SSH_OPTIONS, ...serve.args.slice(0, -1), journaledScript(serve.args.at(-1), journal.run)]} : serve;
    }};
}

// ---- the commands -----------------------------------------------------------------------------------------------------

// io: {ops (liveOps), connect(spec, handlers) -> MCP client, controllerCheckout() -> {commit, dirty}, log, dryRun,
// interrupt: {signal} set by main's SIGINT/SIGTERM handler}. An interrupt is acted on at the next step boundary (a
// Ctrl-C reaches the running ssh too, which ends that step at once); the recovery then runs once and the command exits
// 130 (SIGINT) or 143 (SIGTERM).
// -> 0 complete and passed, 1 otherwise, 2 refused before anything on the device changed.
export async function runLive(options, io) {
  const {command, device, out, approvedRuntime} = options;
  const {ops, log = console.log, dryRun = false} = io;
  const interrupt = io.interrupt ?? {signal: null};
  const dir = out ? resolve(out) : null;
  if (!dryRun && dir && fs.existsSync(join(dir, 'result.json'))) throw new Error(`${dir} already holds a result: choose a new --out`);
  const result = {schema: 'native-live-1', command, device, started: new Date().toISOString(), problems: [], complete: false, pass: false};
  // A residue cell's result.json is the matrix's CellResult (./residue-checks.mjs asCellResult, the one adapter); the
  // other checks keep native-live-1.
  const write = () => {
    if (dryRun || !dir) return;
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(join(dir, 'result.json'), `${JSON.stringify(isResidueCell(command) ? asCellResult(command, result) : result, null, 2)}\n`);
  };
  const controller = io.controllerCheckout();
  result.controller = controller;
  const run = options.run ?? `${ops.home()}/${DEFAULT_RUN}`;
  result.runDir = run;
  ops.journalTo?.(run);
  const exitCode = code => (interrupt.signal ? (interrupt.signal === 'SIGINT' ? 130 : 143) : code);

  if (command === 'cleanup') {
    if (options.preparation) {
      const preparation = JSON.parse(fs.readFileSync(options.preparation, 'utf8'));
      if (preparation.device !== device) throw new Error(`${options.preparation} is a preparation on ${preparation.device}, not ${device}`);
      // The recovery first, so a vendor serve still running is stopped before its home goes.
      finish(result, ops, run, null);
      try { result.preparationCleanup = ops.cleanup(preparation.prepared); if (!dryRun) fs.rmSync(options.preparation, {force: true}); }
      catch (error) { result.preparationCleanup = {removed: false, error: error.message}; }
    } else finish(result, ops, run, null);
    result.complete = result.pass = result.recovery?.ok === true && !result.preparationCleanup?.error;
    write();
    log(`cleanup ${result.complete ? 'done' : `INCOMPLETE: ${result.recovery?.manual ?? JSON.stringify(result.putBack?.steps ?? result.recovery)}`}`);
    return result.complete ? 0 : 1;
  }

  const refusals = [];
  if (!controller.commit) refusals.push('this checkout\'s commit could not be read');
  if (controller.dirty) refusals.push('this checkout has uncommitted changes to tracked files: the hold runs a reviewed commit; commit or stash them');
  let begun = null;
  if (!refusals.length) {
    try { begun = ops.live(['begin', '--run', run, '--commit', controller.commit]); } catch (error) {
      // begin may have saved the front app or stopped the engine before it failed: recover.
      result.problems.push(`begin failed: ${error.message}`);
      finish(result, ops, run, null);
      Object.assign(result, {finished: new Date().toISOString()});
      write();
      log(`${command} INCOMPLETE: begin failed (${error.message}); the recovery ran`);
      return exitCode(1);
    }
  }
  if (begun) Object.assign(result, {checkout: begun.checkout, engine: begun.engine});
  refusals.push(...(begun?.refusals ?? []));
  if (refusals.length) {
    Object.assign(result, {refused: refusals, finished: new Date().toISOString()});
    write();
    log(`refused: ${refusals.join('; ')}`);
    return REFUSED;
  }
  Object.assign(result, {frontmost: begun.frontmost, engineStopAtStart: begun.engineStop});
  write();
  log(`${command}: the owner's front app (${begun.frontmost?.bundleId ?? 'none'}) is saved on the device and the engine stopped; if this command dies, run: node scripts/native-matrix/live.mjs cleanup --device ${device} --run ${quote(run)}${VENDOR_LANE.includes(command) && dir ? ` --preparation ${quote(join(dir, 'preparation.json'))}` : ''}`);

  // A step boundary: a macrotask turn (so a signal's handler has run), then stop if one came.
  const checkpoint = async () => {
    await new Promise(resolve => setImmediate(resolve));
    if (interrupt.signal) throw new Error(`interrupted by ${interrupt.signal}`);
  };
  const ctx = {command, ops, io, run, result, dir, dryRun, log, approvedRuntime, device, controller, checkpoint};
  try {
    await checkpoint();
    result.check = await CHECKS[command](ctx);
    // A residue cell's lane that stopped (cua's on the device, the vendor's through its serve) leaves the cell unfinished.
    if (isResidueCell(command)) for (const lane of ['cua', 'vendor']) if (result.check?.[lane]?.problem) result.problems.push(`the ${lane} lane stopped: ${result.check[lane].problem}`);
    result.pass = checkPassed(command, result.check);
    const composition = command === 'paste' ? compositionSummary(result.check) : null;
    if (composition) log(`paste ${composition}`);
  } catch (error) {
    result.problems.push(`the ${command} check stopped: ${error.message}`);
    log(`${command} stopped: ${error.message}`);
  } finally {
    finish(result, ops, run, begun.frontmost);
    if (interrupt.signal) result.interrupted = interrupt.signal;
    result.complete = result.problems.length === 0 && result.recovery?.ok === true;
    result.pass = result.complete && result.pass;
    result.finished = new Date().toISOString();
    write();
  }
  if (result.recovery?.manual) log(`the recovery needs you: ${result.recovery.manual}`);
  log(`${command} ${result.complete ? (result.pass ? 'PASS' : 'complete, NOT PASSED') : 'INCOMPLETE'}${dryRun ? ' (dry run: the answers were made up, nothing ran)' : dir ? `: ${join(dir, 'result.json')}` : ''}`);
  return exitCode(result.pass ? 0 : 1);
}

// The recovery (./live-device.mjs recover: the harness's work still running on the device stopped, then the put-back),
// then the front app read again against the one saved at begin, with lsappinfo (by bundle id; the device kept the pid).
function finish(result, ops, run, saved) {
  try {
    const recovery = ops.live(['recover', '--run', run]);
    result.recovery = {ok: recovery?.ok === true, killed: recovery?.killed ?? [], survivors: recovery?.survivors ?? [], awaited: recovery?.awaited ?? [],
      probeWait: recovery?.probeWait ?? null, untouched: recovery?.untouched ?? [], ...(recovery?.manual ? {manual: recovery.manual} : {})};
    result.putBack = recovery?.putBack ?? null;
  } catch (error) { result.recovery = {ok: false, error: error.message}; result.putBack = null; }
  try {
    const now = ops.scenes(['frontmost']);
    result.frontApp = {saved: saved?.bundleId ?? null, now: now?.bundleId ?? null, same: saved?.bundleId ? now?.bundleId === saved.bundleId : null};
  } catch (error) { result.frontApp = {error: error.message}; }
}

export function checkPassed(command, check) {
  if (!check || check.problem) return false;
  if (command === 'minimized' || command === 'input-source') return check.verdict?.pass === true;
  if (command === 'paste') return check.verdict?.pass === true;
  // A residue cell passes when its rows count (./residue-checks.mjs; the CellResult's verdict rule, ./cell-result.mjs,
  // where a declared row counts).
  if (isResidueCell(command)) {
    const rows = residueRows(command, check), valid = rows.filter(row => !row.invalid);
    return valid.length > 0 && valid.every(counts);
  }
  return false;
}

// The residue cells' one implementation, by registry name (./residue-checks.mjs RESIDUE_CELLS), for
// `native-matrix.mjs cell <name>`: the live command of that name, which writes the CellResult into `out`.
// -> the command's exit code.
export function runCell(name, options, io) {
  if (!isResidueCell(name)) throw new Error(`${name} is not a residue cell; one of ${RESIDUE_CELLS.join(', ')}`);
  return runLive({...options, command: name}, io);
}

// The composition row in one line: each variant's reading, the source and layout it was keyed under and whether its
// keys went unmodified, or why it did not read; null when the paste check did not reach the row.
export function compositionSummary(check) {
  const row = check?.steps?.hidComposition;
  if (!row) return null;
  if (!row.variants) return `hidComposition: skipped (${row.skipped ?? 'no variants'})`;
  const status = post => (!post ? 'not sent' : post.skipped ? `skipped: ${post.skipped}` : `exit ${post.exitStatus ?? 'unknown'}`);
  const incomplete = v => (v?.complete === true ? '' : ` INCOMPLETE (keys ${status(v?.keys)}, commit ${status(v?.commit)})`);
  const one = (name, v) => (v?.skipped ? `${name} skipped (${v.skipped}${v.emptyError ? `: ${v.emptyError.errorName ?? v.emptyError.message}` : ''})`
    : `${name} ${v?.reading?.reading ?? 'unread'}${incomplete(v)} (${v?.source ?? 'source unread'}, layout ${v?.layout?.keyboardLayoutId ?? 'unread'}, keys ${v?.keysUnmodified === true ? 'unmodified' : v?.keysUnmodified === false ? 'under a modifier' : 'unreported'})`);
  return `hidComposition: ${Object.entries(row.variants).map(([name, v]) => one(name, v)).join('; ')}`;
}

const up = (ctx, id, args = []) => {
  const record = ctx.ops.scenes(['up', id, '--run', ctx.run, ...args]);
  if (record?.error || record?.refusals?.length) throw new Error(`${id} did not come up: ${record.error ?? record.refusals.map(r => r.message).join('; ')}`);
  return record;
};
const activate = (ctx, id) => {
  const front = ctx.ops.scenes(['activate', id, '--run', ctx.run]);
  if (!front?.ok) throw new Error(`${id} did not come to the front (${front?.reason ?? 'no answer'})`);
};

// A cell on the run's TextEdit behind the run's Finder window, run on the device as `command`.
const behindFinder = command => async ctx => {
  up(ctx, 'textedit'); await ctx.checkpoint(); up(ctx, 'finder'); activate(ctx, 'finder'); await ctx.checkpoint();
  return ctx.ops.live([command, '--run', ctx.run]);
};

export const CHECKS = {
  minimized: async ctx => { up(ctx, 'textedit'); await ctx.checkpoint(); return ctx.ops.live(['minimized', '--run', ctx.run]); },
  'minimized-select': async ctx => { up(ctx, 'textedit'); await ctx.checkpoint(); return ctx.ops.live(['minimized-select', '--run', ctx.run]); },
  route4: behindFinder('route4'),
  hscroll: hscrollCheck,
  paste: behindFinder('paste'),
  'input-source': async ctx => ctx.ops.live(['input-source', '--run', ctx.run]),
  enablement: async ctx => {
    up(ctx, 'electron'); await ctx.checkpoint();
    return {...ctx.ops.live(['enablement', '--run', ctx.run]), chrome: {judged: false, reason: CHROME_NOT_JUDGED}};
  },
  menu: menuCheck,
};

// A cell with a vendor lane (menu, hscroll): the vendor home prepared and its serve checked first (so a refusal comes
// before any scene), then `body({lane, scenes})` with `lane()` connecting the vendor serve once and binding the run's
// TextEdit (-> js), and the serve and the vendor home cleaned up whatever happened.
async function withVendorLane(ctx, body) {
  const {ops, io, result, dir, dryRun, controller} = ctx;
  if (!ctx.approvedRuntime) throw new Error(`${ctx.command} needs --approved-runtime <home> for the vendor lane`);
  const prepared = ops.prepare(ctx.approvedRuntime);
  if (!dryRun && dir) fs.writeFileSync(join(dir, 'preparation.json'), `${JSON.stringify({device: ctx.device, prepared, run: ctx.run}, null, 2)}\n`, {mode: 0o600});
  let client = null;
  try {
    const pre = ops.preflight(prepared);
    checkVendorPreflight(pre, prepared, {commit: controller.commit, why: 'the hold runs one reviewed commit on both sides'});
    result.vendor = {home: prepared.home, release: pre.release ?? null};
    const lane = async textedit => {
      const stderrFile = join(fs.mkdtempSync(join(tmpdir(), 'cua-live-serve-')), 'serve-stderr.txt');
      let js;
      ({client, js} = await connectVendorLane({ops, pre, prepared, connect: io.connect, bundleIds: [SCENES.textedit.bundleId], meta: result, stderrFile}));
      const bound = await js(BIND('textedit', textedit.app));
      if (!bound.ok) throw new Error(`the vendor could not bind the run's TextEdit: ${bound.error}`);
      return js;
    };
    return await body(lane);
  } finally {
    if (client) {
      try { await client.call('end_task'); } catch {}
      try { await client.close(); } catch {}
    }
    try { result.preparationCleanup = ops.cleanup(prepared); if (!dryRun && dir) fs.rmSync(join(dir, 'preparation.json'), {force: true}); }
    catch (error) { result.preparationCleanup = {removed: false, error: error.message}; result.problems.push(`the vendor home's cleanup failed: ${error.message}`); }
  }
}
// The run's TextEdit brought down and up again (its document rewritten), so the vendor's lane starts as cua's did.
const freshTextEdit = (ctx, why, args = []) => {
  const down = ctx.ops.scenes(['down', 'textedit', '--run', ctx.run]);
  if (!down?.down) throw new Error(`the run's TextEdit did not come down for ${why}`);
  return up(ctx, 'textedit', args);
};

// The menu cell: cua's lane (the held activation, on the device), then the vendor's on a fresh TextEdit in the same
// state, the run's Finder window in front for both; the vendor's frontmost process read after each of its actions and
// the activation watcher around its lane.
async function menuCheck(ctx) {
  const {ops, run} = ctx;
  return withVendorLane(ctx, async lane => {
    up(ctx, 'textedit');
    const finder = up(ctx, 'finder');
    await ctx.checkpoint();
    activate(ctx, 'finder');
    const cua = ops.live(['menu', '--run', run]);
    await ctx.checkpoint();
    const textedit = freshTextEdit(ctx, 'the vendor lane');
    const js = await lane(textedit);
    const front = () => {
      const now = ops.scenes(['frontmost']);
      return {bundleId: now?.bundleId ?? null, user: now?.pid === finder.pid, textedit: now?.pid === textedit.pid};
    };
    const vendor = {};
    ops.live(['watch', 'start', '--run', run]);
    try {
      vendor.items = {};
      for (const id of Object.keys(MENU_ITEMS)) {
        await ctx.checkpoint();
        activate(ctx, 'finder');
        const item = vendor.items[id] = {front: [front()]};
        const cellOf = async code => { const out = await js(code); if (!out.ok) throw new Error(`the vendor's ${id} cell failed: ${out.error}`); return out.value; };
        if (id === 'bold') { item.prepared = (await cellOf(SELECT_FIRST_LINE)).prepared; item.front.push(front()); }
        Object.assign(item, await cellOf(MENU_BAR(id)));
        item.front.push(front());
        if (item.barFound) {
          Object.assign(item, await cellOf(MENU_ITEM(id)));
          item.front.push(front());
          if (item.found) Object.assign(item, await cellOf(EFFECT(id)));
        } else item.found = false;
      }
    } catch (error) { vendor.problem = error.message; }
    finally { vendor.activations = ops.live(['watch', 'stop', '--run', run]).activations ?? []; }
    return {cua, vendor, comparison: menuComparison(cua?.problem ? null : cua?.items, vendor.problem ? null : vendor.items)};
  });
}

// The hscroll cell (the M2a vendor reading's item 6): the run's TextEdit opened on a page wider than its window
// (scenes-mac.mjs's `wide-page` layout), behind the run's Finder window; cua's lane scrolls its text area right by one
// page on the device, then on a fresh TextEdit the vendor's lane does through its facade, each read back by position
// (the horizontal scroll bar's value, `--probe text-view`) before and after.
async function hscrollCheck(ctx) {
  const {ops, run} = ctx;
  const wide = ['--layout', 'wide-page'];
  return withVendorLane(ctx, async lane => {
    up(ctx, 'textedit', wide);
    const finder = up(ctx, 'finder');
    await ctx.checkpoint();
    activate(ctx, 'finder');
    const cua = ops.live(['hscroll', '--run', run]);
    await ctx.checkpoint();
    const textedit = freshTextEdit(ctx, 'the vendor lane', wide);
    const js = await lane(textedit);
    activate(ctx, 'finder');
    const vendor = {before: ops.live(['hscroll-read', '--run', run, '--start', String(HSCROLL_START)])};
    try {
      const out = await js(SCROLL_RIGHT);
      if (!out.ok) throw new Error(`the vendor's scroll cell failed: ${out.error}`);
      vendor.scroll = out.value;
      vendor.after = ops.live(['hscroll-read', '--run', run, '--settle-ms', '1000']);
      const now = ops.scenes(['frontmost']);
      vendor.userInFront = now?.pid === finder.pid;
    } catch (error) { vendor.problem = error.message; }
    return {cua, vendor, verdict: hscrollVerdict(cua, vendor).verdict};
  });
}

// ---- the dry run ---------------------------------------------------------------------------------------------------

// The device's answers on the success path, by the CLI and its command, so a dry run walks the whole sequence.
const DRY_RELEASE = '26.928.40906-darwin-arm64';
export const DRY_ANSWERS = Object.freeze({
  'live-device.mjs begin': {refusals: [], checkout: {dirty: false}, engine: {build: '(the approved build)'}, frontmost: {bundleId: 'com.apple.Terminal'}, engineStop: {wasRunning: false}},
  'live-device.mjs minimized': {steps: {}, verdict: {pass: true}},
  'live-device.mjs menu': {items: Object.fromEntries(['selectAll', 'bold'].map(id => [id, {found: true, enabled: true, valid: true, clicked: true,
    click: {ok: true, route: 1, posted: true}, effect: true}])), activations: []},
  'live-device.mjs route4': {steps: {override: {read: true, routes: 1}, prepared: true, userInFrontBefore: true, topBeforeIsUser: true,
    click: {ok: true, route: 4, posted: true, keyWindowRestored: true}, after: {frontRestored: true, topWindowRestored: true}, landed: true, activations: []}},
  'live-device.mjs minimized-select': {steps: {expected: {before: {location: 34, length: 7}, minimized: {location: 106, length: 7}},
    prior: {ok: true, range: {location: 34, length: 7}}, minimize: {ok: true, minimized: true},
    select: {ok: true, route: 1, minimizedBefore: true, minimizedAfter: true}, probeMinimized: {range: {location: 106, length: 7}, minimizedBefore: true, minimizedAfter: true},
    engineMinimized: {selectedText: 'Line 10', minimizedBefore: true, minimizedAfter: true}, restore: {ok: true, onScreen: true}, restored: {range: {location: 106, length: 7}, selectedText: 'Line 10'}}},
  'live-device.mjs hscroll': {before: {horizontal: 0.5, vertical: 0, set: {requested: 0.5, written: true, error: null}}, scroll: {ok: true, route: "2'", posted: true},
    after: {horizontal: 0.9, vertical: 0}, userInFront: true},
  'live-device.mjs hscroll-read': {horizontal: 0.9, vertical: 0},
  'live-device.mjs paste': {steps: {pasteAlert: false, precondition: {selected: true, readBack: 'com.apple.inputmethod.Korean.2SetKorean', perContextOff: true, met: true},
    inputSource: {perContext: {read: true, setOff: true, restored: true}, restored: true}, clipboard: {typesUnchanged: true},
    hidComposition: {variants: Object.fromEntries(['unicode', 'keyCodesOnly', 'ansiKeys'].map(variant => [variant, {emptied: true, activated: true, source: 'com.apple.inputmethod.Korean.2SetKorean',
      layout: {inputSourceId: 'com.apple.inputmethod.Korean.2SetKorean', keyboardLayoutId: '(the layout)'}, keys: {exitStatus: 0, output: {mode: variant === 'unicode' ? 'typed' : variant}}, commit: {exitStatus: 0}, complete: true,
      keysUnmodified: true, reading: {reading: '(a reading)'}}]))}}, verdict: {pass: true, typeText: 'measured', finding: null}},
  'live-device.mjs enablement': {steps: {initial: false, cycles: [1, 2].map(i => ({engine: {prior: 'false', set: true}, enabledAt: i * 1000 + 10, closedAt: i * 1000 + 20, releasedAt: i * 1000 + 30}))}},
  'live-device.mjs input-source': {verdict: {pass: true}},
  'live-device.mjs putback': {plan: [], steps: {}, ok: true},
  'live-device.mjs recover': {killed: [], survivors: [], awaited: [], probeWait: null, untouched: [], putBack: {plan: ['scenes-down', 'engine-stop', 'apps-check', 'finder-check', 'front-app'], steps: {}, ok: true}, ok: true},
  'live-device.mjs watch': {watching: true, activations: []},
  'scenes-mac.mjs up': {pid: 1, window: {number: 1}},
  'scenes-mac.mjs activate': {ok: true},
  'scenes-mac.mjs down': {down: true},
  'scenes-mac.mjs frontmost': {pid: 1, bundleId: 'com.apple.Terminal'},
  'prepare.mjs prepare': {home: '/dry/approved-home', runtimeReuse: {approvedHome: '/dry/approved-home', runtimeRoot: `/dry/approved-home/runtimes/${DRY_RELEASE}`}},
  'prepare.mjs cleanup': {removed: true},
});

// An exec that prints each ssh command (the remote script after its PATH line, the journal's record shown as
// <journaled>: journaledScript) and answers it from DRY_ANSWERS.
const JOURNAL_RECORD = /\/bin\/mkdir -p -m 700 .*? >> '[^']*live-journal\.tsv' && /;
export function dryExec({log, commit}) {
  return (command, args) => {
    const script = String(args.at(-1)).split('\n').slice(1).join('\n').replace(JOURNAL_RECORD, '<journaled> && ');
    const device = args.at(-2);
    if (/hostIdentity/.test(script)) {
      log(`ssh ${device} <the native baseline's vendor preflight: host vendor, engine vendor (${script.length} characters)>`);
      return `${JSON.stringify({commit, dirty: false, release: DRY_RELEASE, serves: false, home: '/dry/approved-home', runtimeRoot: `/dry/approved-home/runtimes/${DRY_RELEASE}`})}\n`;
    }
    log(`ssh ${device} ${quote(script)}`);
    if (/printf %s "\$HOME"/.test(script)) return '/Users/owner';
    const match = /(live-device\.mjs|scenes-mac\.mjs|prepare\.mjs) '?([\w-]+)'?/.exec(script);
    let answer = match ? DRY_ANSWERS[`${match[1]} ${match[2]}`] : null;
    if (!answer) throw new Error(`the dry run has no answer for: ${script.slice(0, 200)}`);
    // The vendor's hscroll reads: before its scroll the bar set mid-way, after it moved right.
    if (match[2] === 'hscroll-read' && /'--start'/.test(script)) answer = {...answer, horizontal: 0.5, set: {requested: 0.5, written: true, error: null}};
    return `${JSON.stringify(answer)}\n`;
  };
}

// A vendor serve that prints its command and answers each cell by its tag from the success path.
export function dryConnect({log}) {
  return (spec, handlers) => {
    log(`${spec.command} ${spec.args.slice(0, -1).join(' ')} <the vendor serve: CUA_REPL_HOST=vendor CUA_NATIVE_ENGINE=vendor, the prepared home>`);
    const answer = value => ({content: [{type: 'text', text: `${MARKER}${JSON.stringify({ok: true, value, inCellMs: 0})}`}], _meta: {'cua/nativeEngine': {engine: 'vendor', version: 'dry', build: DRY_RELEASE}}});
    return {
      async initialize() { return {serverInfo: {name: 'node_repl'}}; },
      async request(method, params) {
        if (method !== 'tools/call') return {};
        const [, tag] = /\/\* ((?:goldens|live):\w+ \w+) \*\//.exec(params.arguments.code) ?? [null, 'first'];
        log(`  vendor cell: ${tag}`);
        if (/:bind /.test(tag)) { await handlers.answer({method: 'elicitation/create', params: {_meta: {connector_id: 'computer-use', tool_params: {app: 'com.apple.TextEdit'}}}}); return answer({bound: true}); }
        return answer({ready: true, prepared: true, barFound: true, recorded: true, found: true, enabled: true, clicked: true, effect: true});
      },
      async call(name) { log(`  vendor: ${name}`); return {}; },
      async close() {},
    };
  };
}

// ---- the CLI ------------------------------------------------------------------------------------------------------

export const USAGE = 'usage: live.mjs minimized|paste|input-source|enablement|route4|minimized-select --device <alias> --out <dir> [--run <device dir>] [--dry-run] | live.mjs menu|hscroll --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run] | live.mjs cleanup --device <alias> [--run <device dir>] [--preparation <file>] [--out <dir>] [--dry-run]';
const OPTIONS = {device: {type: 'string'}, out: {type: 'string'}, run: {type: 'string'}, 'approved-runtime': {type: 'string'}, preparation: {type: 'string'},
  'dry-run': {type: 'boolean', default: false}};
const fail = message => { throw new Error(`${message}\n${USAGE}`); };
const absolute = (value, name) => { if (value !== undefined && (!isAbsolute(value) || value.includes('\n'))) fail(`--${name} needs an absolute path`); return value; };

export function parseCommand(argv) {
  let parsed;
  try { parsed = parseArgs({args: argv, allowPositionals: true, options: OPTIONS}); } catch (error) { fail(error.message); }
  const {values, positionals: [command, ...rest]} = parsed;
  if (!COMMANDS.includes(command)) fail(`unknown command ${command}`);
  if (rest.length) fail(`unexpected ${rest.join(' ')}`);
  if (!values.device) fail('--device is required');
  const dryRun = values['dry-run'];
  if (command !== 'cleanup' && !values.out && !dryRun) fail('--out is required');
  if (VENDOR_LANE.includes(command) && !values['approved-runtime']) fail(`${command} needs --approved-runtime <the approved vendor home> for the vendor lane`);
  return {command, device: values.device, out: values.out ? resolve(values.out) : null, run: absolute(values.run, 'run'),
    approvedRuntime: absolute(values['approved-runtime'], 'approved-runtime'), preparation: absolute(values.preparation, 'preparation'), dryRun};
}

// The io a live command (and so a residue cell, through runCell) runs with: the device's ops, the engine connection and
// the controller's checkout, made-up answers in a dry run. main builds it here, as native-matrix.mjs's registry does.
// -> {ops, connect, controllerCheckout, log, dryRun?, interrupt}.
export function cellIo(options, {log = console.log, interrupt = {signal: null}, dryRun = false} = {}) {
  const checkout = controllerCheckout(REPO_ROOT);
  return dryRun
    ? {ops: liveOps(options.device, {exec: dryExec({log, commit: checkout.commit})}), connect: dryConnect({log}), controllerCheckout: () => checkout, log, dryRun: true, interrupt}
    : {ops: liveOps(options.device), connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-native-live', ...handlers}), controllerCheckout: () => checkout,
      log, interrupt};
}

export async function main(argv = process.argv.slice(2), {log = console.log} = {}) {
  const options = parseCommand(argv);
  // SIGINT and SIGTERM: recorded, acted on at the next step boundary; the recovery runs once and the command exits. A
  // second signal while it runs is told to wait (the recovery is bounded).
  const interrupt = {signal: null};
  const onSignal = signal => {
    if (interrupt.signal) { log(`${signal}: the recovery is already running; it is bounded, let it finish`); return; }
    interrupt.signal = signal;
    log(`${signal}: stopping at the next step, then the recovery runs once`);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const io = cellIo(options, {log, interrupt, dryRun: options.dryRun});
  if (options.dryRun) log(`# dry run of live.mjs ${options.command} on ${options.device}: every device command in order, none run`);
  try { return await runLive(options, io); } finally { process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
