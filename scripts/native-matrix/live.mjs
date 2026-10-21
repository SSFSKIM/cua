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
//                 reason), a refused synthesized click, set_value and select_text acting, then type_text and ⌘A
//                 recorded (did the value change, did the selection become the whole value), the window restored.
//   menu          the run's TextEdit behind the run's Finder window: Edit > Select All, and Format > Font > Bold with the
//                 first line selected, each through the menu-bar click (the record) and an observation (its enabled
//                 state), an element click, and an observation (its effect); on cua's engine, then on the vendor's on a
//                 fresh TextEdit in the same state, the frontmost process read after each vendor action and an
//                 activation watcher around both lanes; the comparison decides whether the menu path takes activation.
//   input-source  `--probe input-source` through the approved bundle: the owner's source and per-context preference
//                 saved, Korean 2-Set selected, read back by a second probe, both restored (and again by put-back).
//   enablement    the run's Chrome for Testing observed by one connection, which closes, then by a second: the engine's
//                 diagnostics show whether the second found the attribute released (set again) or still set.
//   cleanup       the put-back alone (and the vendor home's cleanup from a preparation.json), for a command that died.
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
import {MENU_ITEMS, menuComparison} from './live-checks.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const REFUSED = 2;
export const DEFAULT_RUN = 'Library/Caches/cua-harness/native-live';
export const COMMANDS = Object.freeze(['minimized', 'menu', 'input-source', 'enablement', 'cleanup']);
const LIVE_DEVICE = 'scripts/native-matrix/live-device.mjs';

// ---- the device ---------------------------------------------------------------------------------------------------

// The goldens recorder's device steps (scenes, the vendor home, the vendor preflight and serve) plus this hold's device
// CLI, all through one exec.
export function liveOps(device, {exec} = {}) {
  const base = deviceOps(device, exec ? {exec} : {});
  const {cli} = checkoutCli(device, exec ? {exec} : {});
  return {...base, live: args => cli(LIVE_DEVICE, args, {answersOnFailure: true})};
}

// ---- the commands -----------------------------------------------------------------------------------------------------

// io: {ops (liveOps), connect(spec, handlers) -> MCP client, controllerCheckout() -> {commit, dirty}, log, dryRun}.
// -> 0 complete and passed, 1 otherwise, 2 refused before anything on the device changed.
export async function runLive(options, io) {
  const {command, device, out, approvedRuntime} = options;
  const {ops, log = console.log, dryRun = false} = io;
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

  if (command === 'cleanup') {
    if (options.preparation) {
      const preparation = JSON.parse(fs.readFileSync(options.preparation, 'utf8'));
      if (preparation.device !== device) throw new Error(`${options.preparation} is a preparation on ${preparation.device}, not ${device}`);
      try { result.preparationCleanup = ops.cleanup(preparation.prepared); if (!dryRun) fs.rmSync(options.preparation, {force: true}); }
      catch (error) { result.preparationCleanup = {removed: false, error: error.message}; }
    }
    finish(result, ops, run, null);
    result.complete = result.pass = result.putBack?.ok === true && !result.preparationCleanup?.error;
    write();
    log(`cleanup ${result.complete ? 'done' : `INCOMPLETE: ${JSON.stringify(result.putBack?.steps ?? result.putBack)}`}`);
    return result.complete ? 0 : 1;
  }

  const refusals = [];
  if (!controller.commit) refusals.push('this checkout\'s commit could not be read');
  if (controller.dirty) refusals.push('this checkout has uncommitted changes to tracked files: the hold runs a reviewed commit; commit or stash them');
  const begun = refusals.length ? null : ops.live(['begin', '--run', run, '--commit', controller.commit]);
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

  const ctx = {ops, io, run, result, dir, dryRun, log, approvedRuntime, device, controller};
  try {
    result.check = await CHECKS[command](ctx);
    result.pass = checkPassed(command, result.check);
  } catch (error) {
    result.problems.push(`the ${command} check stopped: ${error.message}`);
    log(`${command} stopped: ${error.message}`);
  } finally {
    finish(result, ops, run, begun.frontmost);
    result.complete = result.problems.length === 0 && result.putBack?.ok === true;
    result.pass = result.complete && result.pass;
    result.finished = new Date().toISOString();
    write();
  }
  log(`${command} ${result.complete ? (result.pass ? 'PASS' : 'complete, NOT PASSED') : 'INCOMPLETE'}${dryRun ? ' (dry run: the answers were made up, nothing ran)' : dir ? `: ${join(dir, 'result.json')}` : ''}`);
  return result.pass ? 0 : 1;
}

// The put-back, then the front app read again against the one saved at begin (by bundle id; the device kept the pid).
function finish(result, ops, run, saved) {
  try { result.putBack = ops.live(['putback', '--run', run]); } catch (error) { result.putBack = {ok: false, error: error.message}; }
  try {
    const now = ops.scenes(['frontmost']);
    result.frontApp = {saved: saved?.bundleId ?? null, now: now?.bundleId ?? null, same: saved?.bundleId ? now?.bundleId === saved.bundleId : null};
  } catch (error) { result.frontApp = {error: error.message}; }
}

export function checkPassed(command, check) {
  if (!check || check.problem) return false;
  if (command === 'minimized' || command === 'input-source') return check.verdict?.pass === true;
  if (command === 'enablement') return check.verdict?.released === true;
  if (command === 'menu') return !check.cua?.problem && !check.vendor?.problem && typeof check.comparison?.decision === 'string' && !check.comparison.decision.startsWith('undecided');
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
  minimized: async ctx => { up(ctx, 'textedit'); return ctx.ops.live(['minimized', '--run', ctx.run]); },
  'input-source': async ctx => ctx.ops.live(['input-source']),
  enablement: async ctx => { up(ctx, 'chrome'); return ctx.ops.live(['enablement', '--run', ctx.run]); },
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
    activate(ctx, 'finder');
    const cua = ops.live(['menu', '--run', run]);

    // The vendor's lane on the same scene state: a fresh TextEdit (the run's document rewritten), Finder in front.
    const down = ops.scenes(['down', 'textedit', '--run', run]);
    if (!down?.down) throw new Error('the run\'s TextEdit did not come down for the vendor lane');
    textedit = up(ctx, 'textedit');
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
    return {cua, vendor, comparison: menuComparison(cua?.items, vendor.items)};
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
  'live-device.mjs menu': {items: {selectAll: {found: true, enabled: true, effect: true}, bold: {found: true, enabled: true, effect: true}}, activations: []},
  'live-device.mjs enablement': {verdict: {released: true}},
  'live-device.mjs input-source': {verdict: {pass: true}},
  'live-device.mjs putback': {plan: [], steps: {}, ok: true},
  'live-device.mjs watch': {watching: true, activations: []},
  'scenes-mac.mjs up': {pid: 1, window: {number: 1}},
  'scenes-mac.mjs activate': {ok: true},
  'scenes-mac.mjs down': {down: true},
  'scenes-mac.mjs frontmost': {pid: 1, bundleId: 'com.apple.Terminal'},
  'prepare.mjs prepare': {home: '/dry/approved-home', runtimeReuse: {approvedHome: '/dry/approved-home', runtimeRoot: `/dry/approved-home/runtimes/${DRY_RELEASE}`}},
  'prepare.mjs cleanup': {removed: true},
});

// An exec that prints each ssh command (the remote script after its PATH line) and answers it from DRY_ANSWERS.
export function dryExec({log, commit}) {
  return (command, args) => {
    const script = String(args.at(-1)).split('\n').slice(1).join('\n');
    const device = args.at(-2);
    if (/hostIdentity/.test(script)) {
      log(`ssh ${device} <the native baseline's vendor preflight: host vendor, engine vendor (${script.length} characters)>`);
      return `${JSON.stringify({commit, dirty: false, release: DRY_RELEASE, serves: false, home: '/dry/approved-home', runtimeRoot: `/dry/approved-home/runtimes/${DRY_RELEASE}`})}\n`;
    }
    log(`ssh ${device} ${quote(script)}`);
    if (/printf %s "\$HOME"/.test(script)) return '/Users/owner';
    const match = /(live-device\.mjs|scenes-mac\.mjs|prepare\.mjs) '?([\w-]+)'?/.exec(script);
    const answer = match ? DRY_ANSWERS[`${match[1]} ${match[2]}`] : null;
    if (!answer) throw new Error(`the dry run has no answer for: ${script.slice(0, 200)}`);
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

export const USAGE = 'usage: live.mjs minimized|input-source|enablement --device <alias> --out <dir> [--run <device dir>] [--dry-run] | live.mjs menu --device <alias> --approved-runtime <home> --out <dir> [--run <device dir>] [--dry-run] | live.mjs cleanup --device <alias> [--run <device dir>] [--preparation <file>] [--out <dir>] [--dry-run]';
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
  const io = options.dryRun
    ? {ops: liveOps(options.device, {exec: dryExec({log, commit: checkout.commit})}), connect: dryConnect({log}), controllerCheckout: () => checkout, log, dryRun: true}
    : {ops: liveOps(options.device), connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-native-live', ...handlers}), controllerCheckout: () => checkout, log};
  if (options.dryRun) log(`# dry run of live.mjs ${options.command} on ${options.device}: every device command in order, none run`);
  return runLive(options, io);
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
