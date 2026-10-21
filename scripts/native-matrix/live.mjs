#!/usr/bin/env node
// The M2a.5 hold's checks (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2a.5 "Live on the mini"; the
// Decision Log's "M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.2" and "M2a.4" entries). Run from this checkout
// on the controller, inside a CI-opt hold on the mini; the device steps go over ssh to the harness checkout
// (scripts/native-baseline/remote.mjs's PARITY_CHECKOUT, placed at this checkout's commit), as the goldens recorder does
// (./goldens.mjs, whose device CLI wrapper and vendor lane this reuses). Comparison A is not here: it is
// scripts/native-baseline.mjs run/compare, whose rows now carry cua/serviceMs beside cua/engineMs.
//
//   live.mjs minimized    --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs menu         --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs paste        --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs input-source --device <alias> --out <dir> [--run <device dir>] [--dry-run]
//   live.mjs enablement   --device <alias> --out <dir> [--run <device dir>] [--dry-run]
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
//   menu          the run's TextEdit behind the run's Finder window: Edit > Select All, and Format > Font > Bold with the
//                 first line selected, each through the menu-bar click (the record) and an observation (its enabled
//                 state), an element click, and an observation (its effect); on cua's engine twice, M2a.2's
//                 spikeMenuActivation off then on (each item's route and activationGuardMs recorded), then on the
//                 vendor's, each lane on a fresh TextEdit in the same state, the frontmost process read after each
//                 vendor action and an activation watcher around every lane; the setting verdict names which switch
//                 setting works, so the default is set from the result.
//   paste         M2a.3 on the run's TextEdit behind the run's Finder window: a plain and a Markdown paste, each over a
//                 selected line, and type_text under Korean 2-Set (the paste route; the per-context input preference
//                 turned off for it when it read on), each read back; the user window in front throughout; a system
//                 alert (a pasteboard-privacy prompt) before or after any step aborts the section unclicked, its owner and
//                 text recorded; the owner's source and preference restored (the put-back verifies them) and the
//                 owner's clipboard's type list unchanged.
//   input-source  `--probe input-source` through the approved bundle: the owner's source and per-context preference
//                 saved, Korean 2-Set selected, read back by a second probe, both restored (and again by put-back).
//   enablement    the run's Chrome for Testing observed by one connection, which closes, then by a second: released when
//                 each connection's first observation reads the attribute false (timings.enablementPrior) and the
//                 first sets it.
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
import {EFFECT, MENU_BAR, MENU_ITEM, SELECT_FIRST_LINE} from './live-cells.mjs';
import {JOURNAL_FILE, MENU_ITEMS, menuComparison, menuSettingVerdict, putBackBoundMs, recoverBoundMs} from './live-checks.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REFUSED = 2;
export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-live';
export const COMMANDS = Object.freeze(['minimized', 'menu', 'paste', 'input-source', 'enablement', 'cleanup']);
const MENU_ACTIVATION = Object.freeze(['off', 'on']);
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
  'live-device.mjs enablement': 180_000, 'live-device.mjs input-source': 180_000, 'live-device.mjs watch': 60_000, 'live-device.mjs putback': putBackBoundMs() + BOUND_MARGIN_MS,
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
  const write = () => {
    if (dryRun || !dir) return;
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
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
  log(`${command}: the owner's front app (${begun.frontmost?.bundleId ?? 'none'}) is saved on the device and the engine stopped; if this command dies, run: node scripts/native-matrix/live.mjs cleanup --device ${device} --run ${quote(run)}${command === 'menu' && dir ? ` --preparation ${quote(join(dir, 'preparation.json'))}` : ''}`);

  // A step boundary: a macrotask turn (so a signal's handler has run), then stop if one came.
  const checkpoint = async () => {
    await new Promise(resolve => setImmediate(resolve));
    if (interrupt.signal) throw new Error(`interrupted by ${interrupt.signal}`);
  };
  const ctx = {ops, io, run, result, dir, dryRun, log, approvedRuntime, device, controller, checkpoint};
  try {
    await checkpoint();
    result.check = await CHECKS[command](ctx);
    result.pass = checkPassed(command, result.check);
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
  if (command === 'enablement') return check.verdict?.released === true;
  if (command === 'paste') return check.verdict?.pass === true;
  if (command === 'menu') {
    return MENU_ACTIVATION.every(setting => check.cua?.[setting] && !check.cua[setting].problem) && !check.vendor?.problem
      && ['off', 'on', 'neither'].includes(check.setting?.setting);
  }
  return false;
}

const up = (ctx, id) => {
  const record = ctx.ops.scenes(['up', id, '--run', ctx.run]);
  if (record?.error || record?.refusals?.length) throw new Error(`${id} did not come up: ${record.error ?? record.refusals.map(r => r.message).join('; ')}`);
  return record;
};
const activate = (ctx, id) => {
  const front = ctx.ops.scenes(['activate', id, '--run', ctx.run]);
  if (!front?.ok) throw new Error(`${id} did not come to the front (${front?.reason ?? 'no answer'})`);
};

export const CHECKS = {
  minimized: async ctx => { up(ctx, 'textedit'); await ctx.checkpoint(); return ctx.ops.live(['minimized', '--run', ctx.run]); },
  paste: async ctx => {
    up(ctx, 'textedit'); await ctx.checkpoint(); up(ctx, 'finder'); activate(ctx, 'finder'); await ctx.checkpoint();
    return ctx.ops.live(['paste', '--run', ctx.run]);
  },
  'input-source': async ctx => ctx.ops.live(['input-source', '--run', ctx.run]),
  enablement: async ctx => { up(ctx, 'chrome'); await ctx.checkpoint(); return ctx.ops.live(['enablement', '--run', ctx.run]); },
  menu: menuCheck,
};

// The menu check: the vendor home prepared and its serve checked first (so a refusal comes before any scene), cua's
// lane on the device, then the vendor's on a fresh TextEdit with the run's Finder window in front again.
async function menuCheck(ctx) {
  const {ops, io, run, result, dir, dryRun, controller} = ctx;
  if (!ctx.approvedRuntime) throw new Error('menu needs --approved-runtime <home> for the vendor lane');
  const prepared = ops.prepare(ctx.approvedRuntime);
  if (!dryRun && dir) fs.writeFileSync(join(dir, 'preparation.json'), `${JSON.stringify({device: ctx.device, prepared, run}, null, 2)}\n`, {mode: 0o600});
  const vendor = {};
  let client = null;
  try {
    const pre = ops.preflight(prepared);
    checkVendorPreflight(pre, prepared, {commit: controller.commit, why: 'the hold runs one reviewed commit on both sides'});
    result.vendor = {home: prepared.home, release: pre.release ?? null};
    let textedit = up(ctx, 'textedit');
    const finder = up(ctx, 'finder');
    // A fresh TextEdit (the run's document rewritten) before each lane after the first, so every lane starts alike.
    const fresh = why => {
      const down = ops.scenes(['down', 'textedit', '--run', run]);
      if (!down?.down) throw new Error(`the run's TextEdit did not come down for ${why}`);
      textedit = up(ctx, 'textedit');
    };
    // cua's lane twice: M2a.2's spikeMenuActivation off (the default), then on.
    const cua = {};
    for (const setting of MENU_ACTIVATION) {
      await ctx.checkpoint();
      if (setting !== MENU_ACTIVATION[0]) fresh(`cua's lane with the switch ${setting}`);
      activate(ctx, 'finder');
      cua[setting] = ops.live(['menu', '--run', run, '--menu-activation', setting]);
    }

    // The vendor's lane on the same scene state, Finder in front.
    await ctx.checkpoint();
    fresh('the vendor lane');
    const stderrFile = join(fs.mkdtempSync(join(tmpdir(), 'cua-live-serve-')), 'serve-stderr.txt');
    let js;
    ({client, js} = await connectVendorLane({ops, pre, prepared, connect: io.connect, bundleIds: [SCENES.textedit.bundleId], meta: result, stderrFile}));
    const bound = await js(BIND('textedit', textedit.app));
    if (!bound.ok) throw new Error(`the vendor could not bind the run's TextEdit: ${bound.error}`);
    const front = () => {
      const now = ops.scenes(['frontmost']);
      return {bundleId: now?.bundleId ?? null, user: now?.pid === finder.pid, textedit: now?.pid === textedit.pid};
    };
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
    return {cua, vendor, comparison: Object.fromEntries(MENU_ACTIVATION.map(setting => [setting, menuComparison(cua[setting]?.items, vendor.items, {setting})])),
      setting: menuSettingVerdict(cua.off?.items, cua.on?.items, vendor.problem ? null : vendor.items)};
  } finally {
    if (client) {
      try { await client.call('end_task'); } catch {}
      try { await client.close(); } catch {}
    }
    try { result.preparationCleanup = ops.cleanup(prepared); if (!dryRun && dir) fs.rmSync(join(dir, 'preparation.json'), {force: true}); }
    catch (error) { result.preparationCleanup = {removed: false, error: error.message}; result.problems.push(`the vendor home's cleanup failed: ${error.message}`); }
  }
}

// ---- the dry run ---------------------------------------------------------------------------------------------------

// The device's answers on the success path, by the CLI and its command, so a dry run walks the whole sequence.
const DRY_RELEASE = '26.928.40906-darwin-arm64';
export const DRY_ANSWERS = Object.freeze({
  'live-device.mjs begin': {refusals: [], checkout: {dirty: false}, engine: {build: '(the approved build)'}, frontmost: {bundleId: 'com.apple.Terminal'}, engineStop: {wasRunning: false}},
  'live-device.mjs minimized': {steps: {}, verdict: {pass: true}},
  'live-device.mjs menu': {menuActivation: false, items: Object.fromEntries(['selectAll', 'bold'].map(id => [id, {found: true, enabled: true, valid: true, clicked: true,
    click: {ok: true, route: 1, posted: true}, effect: true}])), activations: []},
  'live-device.mjs paste': {steps: {pasteAlert: false, precondition: {selected: true, readBack: 'com.apple.inputmethod.Korean.2SetKorean', perContextOff: true, met: true},
    inputSource: {perContext: {read: true, setOff: true, restored: true}, restored: true}, clipboard: {typesUnchanged: true},
    hidComposition: {emptied: true, activated: true, keys: {exitStatus: 0}, reading: {reading: '가'}}}, verdict: {pass: true, typeText: 'measured', finding: null}},
  'live-device.mjs enablement': {verdict: {released: true}},
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
    // The menu lane's setting is the one its flags asked for.
    if (match[1] === 'live-device.mjs' && match[2] === 'menu') answer = {...answer, menuActivation: /'--menu-activation'\W+'on'/.test(script)};
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

export const USAGE = 'usage: live.mjs minimized|paste|input-source|enablement --device <alias> --out <dir> [--run <device dir>] [--dry-run] | live.mjs menu --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run] | live.mjs cleanup --device <alias> [--run <device dir>] [--preparation <file>] [--out <dir>] [--dry-run]';
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
  if (command === 'menu' && !values['approved-runtime']) fail('menu needs --approved-runtime <the approved vendor home> for the vendor lane');
  return {command, device: values.device, out: values.out ? resolve(values.out) : null, run: absolute(values.run, 'run'),
    approvedRuntime: absolute(values['approved-runtime'], 'approved-runtime'), preparation: absolute(values.preparation, 'preparation'), dryRun};
}

export async function main(argv = process.argv.slice(2), {log = console.log} = {}) {
  const options = parseCommand(argv);
  const checkout = controllerCheckout(REPO_ROOT);
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
  const io = options.dryRun
    ? {ops: liveOps(options.device, {exec: dryExec({log, commit: checkout.commit})}), connect: dryConnect({log}), controllerCheckout: () => checkout, log, dryRun: true, interrupt}
    : {ops: liveOps(options.device), connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-native-live', ...handlers}), controllerCheckout: () => checkout,
      log, interrupt};
  if (options.dryRun) log(`# dry run of live.mjs ${options.command} on ${options.device}: every device command in order, none run`);
  try { return await runLive(options, io); } finally { process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
