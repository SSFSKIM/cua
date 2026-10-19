#!/usr/bin/env node
// The own native engine spike's measurements (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M0 "Spike"
// and "Promote or discard"; Concrete Steps "M0 spike on the mini"). `--device` is a declared macOS device over ssh (the
// harness checkout placed by `native-baseline.mjs prepare --commit`) or `local`, this Mac.
//
//   measure.mjs stop    --device <d> [--dry-run]       shutdown to the approved engine; refuses while another connection
//                                                       is open, naming the count; nothing to do when none runs
//   measure.mjs status  --device <d>                   the engine's status, the bundle, approved.json, installed or not
//   measure.mjs approve --device <d> [--dry-run] [--out <dir>]  the approve loop (EngineInstall.approveEngine), OWNER at the
//                                                       console: approve (the grant prompts), the operator's keypress,
//                                                       shutdown, open -n -g -a, status, approve (the capture
//                                                       confirmation), then approved.json {build, identity, approvedAt};
//                                                       its answers go to <dir>/approve.json (default
//                                                       <OS temp dir>/measure-approve-<time>.json)
//   measure.mjs probe-f --device <d> --out <dir>       probe (f), operator-guided (./measure/probe-f.mjs)
//   measure.mjs cleanup --device <d> --preparation <run dir>/preparation.json
//                                                       resumes prepare.mjs's cleanup of a run that died (the approved
//                                                       home's state restored; a failure names the recovery directory)
//   measure.mjs --device <d> --lane vendor|cua --runs N --approved-runtime <home> --out <dir>
//         [--samples N] [--tasks N] [--scenes textedit,finder,chrome,electron] [--probes c|none] [--operator]
//         [--groups <list>] [--tap-modes listen,active] [--route-samples N] [--operator-seconds N]
//         [--scene-dir <device dir>] [--node <Node 24+ on the device, cua lane>] [--approved-engine <bundle>]
//     <dir>/run-<n>/results.jsonl, meta.json and goldens/ per run (./measure/lane.mjs)
//
// Phases (`--groups`, ./measure/groups.mjs; a comma list, run in this order whatever order it names them; default
// speed,ab,d,e, everything a run took before the groups existed):
//   speed    warm.listApps, golden.fixed and golden.action, the TextEdit series and task, tree.getAXState,
//            warm.getScreenshot, the switches (preflight.switch, probe c′) and equivalence.readSet (U9 on both lanes)
//   ab       probe.a.{click,key}, probe.b.{click,key}, probe.b.forced.<route> for routes 1, 2', 2, 3 (keys 2', 2, 3),
//            probe.b.watch
//   routes   routes.{elementClick,coordinateClick,key}, --route-samples per scene, family and route 2', 3, 2 (U12, U10)
//   effects  effects.activationPoint, effects.selection, effects.counters (U13)
//   coord    coord.click, coord.refusal.noScreenshot, coord.moved, coord.refusal.replaced (U2)
//   tap      tap.create per --tap-modes mode (default listen,active), then probe.d.tap and probe.d.hidReset for each
//            mode whose tap was created (U5; HID idle last)
//   d        probe.d.noFire (with speed), probe.d.tap, probe.d.hidReset, and with --operator probe.d.operatorKeystroke and
//            probe.d.backgroundClick (U6): the engine types for --operator-seconds (default 10) while the owner acts
//   e        probe.e.focus (Chrome), probe.e.typeText, probe.e.keyedLatin
// The vendor lane takes speed only; each other group named is one group.<name> not-run row. Every run of either lane
// also records check.sceneWindow for Chrome: its window's title as the front-window checks see it (U3).
//
// Every row is {lane, run, op, scene?, sample, ok, ...}; the new rows' fields:
//   check.sceneWindow   frontTitle, accepted, headerLine; cua lane windowTitle, windows [{index, subrole, title}],
//                       tabs [{title, selected, value}]
//   probe.b.forced.2'   as the other forced routes: action, forcedRoute "2'", route, activationGuardMs, failed,
//                       frontmostUnchanged, topWindowUnchanged
//   routes.<family>     user, family, forcedRoute, sent, route (the meta's cua/inputRoute), activationGuardMs, failed,
//                       point {x, y, scale} (coordinate clicks, screenshot pixels), frontmostUnchanged,
//                       topWindowUnchanged, activations, deactivations, watch, before, after (TextEdit {range, role,
//                       axError}; Finder {selected: [run row numbers], otherSelected}; Chrome {option, textChars,
//                       focused}; Electron {presses, textChars, focused}), outcomeHeld, counters (Electron: per counter
//                       after − before); TextEdit's clicks also aimed (screen point), activationPoint (route 3, its own
//                       click's point), targetLine, startLine, landedLine, lineError (the caret starts on line 0 and
//                       holds within one line of targetLine), activationLine, invalid (the aim off the visible lines,
//                       the start or route 3's activation click near the target line, the activation point unread; the
//                       row then fails)
//   effects.activationPoint  probe_spike activationPoint's answer: listed, axError, point, relative, windowFrame, hit,
//                       hitFrom; a refusal: error, errorName, code and its data's members
//   effects.selection   user, set, key, role, setError, before, afterActivate, afterKey ({role, range, axError}),
//                       preservedByActivate (null unless the activate report says activationRan), preservedByKey (null
//                       when the key failed), invalid (the selection read back is not `set`, or which of the two did
//                       not run; the row then fails), activate
//                       (probe_spike activate's answer, or its refusal {error, errorName, code, probe: the same report}),
//                       keyRoute, keyFailed, frontmostUnchanged, topWindowUnchanged, activations, deactivations, watch,
//                       counters {activate, key} (Electron)
//   effects.counters    Electron: action (activate | key), forcedRoute, route, failed, activate (as effects.selection's),
//                       counters, invalid (the activate row's activation did not run; the row then fails),
//                       frontmostUnchanged, topWindowUnchanged
//   coord.click         line (aimed at, 0-based), pixel, local (points in the window), scale, route, failed, start
//                       {line, location} (the caret set COORD_PREPARE_GAP lines away before the click), prepared (the
//                       range read back after it), preparedLine, moved, range, landedLine, lineError, exact, invalid
//                       (the caret was not prepared), lineHeight, lineHeightFrom, window, textView, screenshot,
//                       screenshotBytes; ok needs the caret moved off the prepared range to within a line of the target
//   coord.refusal.noScreenshot  expected, refused, errorName, sentence (a fresh engine connection holding no screenshot)
//   coord.moved         by, expected, refused, failed, route, start, prepared, preparedLine, moved, range, landedLine,
//                       lineError (ok on the target line exactly), or notRun: the window could not be moved (the shell
//                       is not trusted for Accessibility)
//   coord.refusal.replaced  expected, newWindow, refused, failed, closed
//   tap.create          mode, created, listenPreflight, postPreflight, start, stop {own, driven, other, hidIdleMs,
//                       listenPreflight, postPreflight}; a refusal: errorName, sentence, mode, listenPreflight,
//                       postPreflight
//   probe.d.tap, probe.d.hidReset  as before, plus mode (tap group) and listenPreflight, postPreflight
//   probe.d.operatorKeystroke, probe.d.backgroundClick  intervened, error, actionInterval, receivedAt, hidIdleMs,
//                       typedSeconds, tap {mode, created, errorName?, sentence?}, tapCounts, drivenTimes,
//                       drivenInsideAction {count, inside}, otherTimes and otherInsideAction (null: the engine's tap keeps
//                       events of any other origin as counts only), operatorConfirmedTiming. U6 reads drivenInsideAction
//                       with tapCounts.other: the owner's key and click in U6 target the driven app, so they count as
//                       driven
//   probe.e.focus       target, route
//
// The operator's answers (approve, probe-f, --operator) are read line by line from stdin for the whole command, so a
// coordinator can relay them through a fifo it holds open (`exec 3<>fifo; node measure.mjs ... --operator <fifo`):
// a line starting with n is no, any other line yes, the end of input no.
//   measure.mjs summary <dir>                          <dir>/summary.md from <dir>/vendor and <dir>/cua
//     (./measure/summary.mjs)
//
// `--approved-engine` defaults to the device's approved location (~/Library/Application Support/cua/engine/cua
// Engine.app). The scene directory (default ~/Library/Caches/cua-harness/spike-scenes on the device) is shared by the
// sitting's runs of both lanes: Finder keeps its view per folder, so the list view the vendor lane sets holds for the
// cua lane, which cannot send keys until its input methods exist.
import {parseArgs} from 'node:util';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClient} from '../../browser-parity/mcp.mjs';
import {deviceOf, shellOf, engineOps} from './measure/device.mjs';
import {approveEngine, stopEngine, engineStatus, EngineRefusal} from './measure/engine-control.mjs';
import {measureLane, cleanupPreparation, LANES, SCENE_ORDER, OPERATOR_SECONDS} from './measure/lane.mjs';
import {DEFAULT_GROUPS, TAP_MODES, parseGroups, parseTapModes} from './measure/groups.mjs';
import {writeSummary} from './measure/summary.mjs';
import {probeF} from './measure/probe-f.mjs';

const ENGINE_COMMANDS = ['stop', 'status', 'approve', 'probe-f', 'cleanup'];
export const USAGE = 'usage: measure.mjs stop|status|approve|probe-f --device <alias|local> [--dry-run] [--approved-engine <bundle>] [--out <dir>] | measure.mjs cleanup --device <alias|local> --preparation <file> | measure.mjs --device <alias|local> --lane vendor|cua --runs N --approved-runtime <home> --out <dir> [--samples N] [--tasks N] [--scenes list] [--probes c|none] [--operator] [--groups list] [--tap-modes list] [--route-samples N] [--operator-seconds N] [--scene-dir <dir>] [--node <path>] | measure.mjs summary <dir>';
const OPTIONS = {
  device: {type: 'string'}, lane: {type: 'string'}, runs: {type: 'string'}, 'approved-runtime': {type: 'string'}, out: {type: 'string'},
  samples: {type: 'string', default: '30'}, tasks: {type: 'string', default: '10'}, scenes: {type: 'string', default: SCENE_ORDER.join(',')},
  probes: {type: 'string', default: 'c'}, operator: {type: 'boolean', default: false}, 'scene-dir': {type: 'string'}, node: {type: 'string'},
  'approved-engine': {type: 'string'}, 'dry-run': {type: 'boolean', default: false}, preparation: {type: 'string'},
  groups: {type: 'string', default: DEFAULT_GROUPS.join(',')}, 'tap-modes': {type: 'string', default: TAP_MODES.join(',')},
  'route-samples': {type: 'string', default: '3'}, 'operator-seconds': {type: 'string', default: String(OPERATOR_SECONDS)},
};

class UsageError extends Error {}
const fail = message => { throw new UsageError(`${message}\n${USAGE}`); };
const absolute = (value, name) => { if (value !== undefined && (!isAbsolute(value) || value.includes('\n'))) fail(`--${name} needs an absolute path`); return value; };
const count = (value, name) => { const n = Number(value); if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive integer`); return n; };

// argv -> {command, ...options}; throws UsageError with the usage line.
export function parseCommand(argv) {
  let parsed;
  try { parsed = parseArgs({args: argv, allowPositionals: true, options: OPTIONS}); } catch (error) { fail(error.message); }
  const {values, positionals} = parsed;
  const [first, ...rest] = positionals;
  if (first === 'summary') {
    if (rest.length !== 1) fail('summary takes the spike directory');
    return {command: 'summary', dir: resolve(rest[0])};
  }
  if (!values.device) fail('--device is required');
  const engine = absolute(values['approved-engine'], 'approved-engine');
  if (ENGINE_COMMANDS.includes(first)) {
    if (rest.length) fail(`${first} takes no positional arguments`);
    if (values['dry-run'] && !['stop', 'approve'].includes(first)) fail('--dry-run is for stop and approve');
    if (first === 'probe-f' && !values.out) fail('probe-f needs --out <dir>');
    if (first === 'cleanup') return {command: first, device: values.device, preparation: absolute(values.preparation, 'preparation') ?? fail('cleanup needs --preparation <run dir>/preparation.json')};
    return {command: first, device: values.device, engine, dryRun: values['dry-run'], ...(values.out ? {out: resolve(values.out)} : {})};
  }
  if (first !== undefined) fail(`unknown command ${first}`);
  if (!LANES.includes(values.lane)) fail('--lane must be vendor or cua');
  if (!values.out) fail('--out is required');
  const scenes = values.scenes.split(',').filter(Boolean);
  if (!scenes.length || scenes.some(s => !SCENE_ORDER.includes(s)) || new Set(scenes).size !== scenes.length) fail(`--scenes is a list of ${SCENE_ORDER.join(', ')}`);
  const probes = values.probes === 'none' ? [] : values.probes.split(',');
  if (probes.some(p => p !== 'c')) fail('--probes is c or none (the other probes need input or the operator)');
  if (values.node !== undefined && values.lane !== 'cua') fail('--node names the own host\'s Node; the vendor lane uses its pinned one');
  let groups, tapModes;
  try { groups = parseGroups(values.groups); tapModes = parseTapModes(values['tap-modes']); } catch (error) { fail(error.message); }
  if (values.operator && !groups.includes('d')) fail('--operator runs probe (d)\'s operator steps: --groups must name d');
  return {command: 'run', device: values.device, lane: values.lane, runs: count(values.runs, 'runs'), approvedRuntime: absolute(values['approved-runtime'], 'approved-runtime') ?? fail('--approved-runtime is required'),
    out: resolve(values.out), samples: count(values.samples, 'samples'), tasks: count(values.tasks, 'tasks'), scenes: SCENE_ORDER.filter(s => scenes.includes(s)), probes,
    operator: values.operator, sceneDir: absolute(values['scene-dir'], 'scene-dir'), node: absolute(values.node, 'node'), engine,
    groups, tapModes, routeSamples: count(values['route-samples'], 'route-samples'), operatorSeconds: count(values['operator-seconds'], 'operator-seconds')};
}

// The operator's answers, one line each from `input` (stdin, a terminal or a fifo a coordinator relays into) over the
// whole command: one reader, so lines that arrive together are each an answer rather than lost with a closed reader.
// Enter (or any line but one starting with n) is yes; the end of input is no for this and every later question.
// -> {confirm(message) -> Promise<boolean>, close()}.
export function operatorConsole({input = process.stdin, output = process.stderr} = {}) {
  let rl = null, ended = false;
  const lines = [], waiting = [];
  const open = () => {
    if (rl || ended) return;
    rl = createInterface({input, terminal: false});
    rl.on('line', line => { const next = waiting.shift(); if (next) next(line); else lines.push(line); });
    rl.on('close', () => { ended = true; for (const next of waiting.splice(0)) next(null); });
  };
  return {
    confirm(message) {
      output.write(message);
      open();
      if (lines.length) return Promise.resolve(!/^\s*n/i.test(lines.shift()));
      if (ended) return Promise.resolve(false);
      return new Promise(done => waiting.push(line => done(line !== null && !/^\s*n/i.test(line))));
    },
    // Releases stdin so the command can exit while a coordinator still holds the fifo open.
    close() { if (rl) { rl.close(); if (input === process.stdin) input.destroy(); } rl = null; ended = true; },
  };
}

export async function main(argv = process.argv.slice(2), {log = console.log, confirm} = {}) {
  const command = parseCommand(argv);
  if (confirm) return run(command, {log, confirm});
  const operator = operatorConsole();
  try { return await run(command, {log, confirm: message => operator.confirm(message)}); }
  finally { operator.close(); }
}

async function run(command, {log, confirm}) {
  if (command.command === 'summary') {
    const s = writeSummary(command.dir);
    log(`${join(command.dir, 'summary.md')}: ${s.verdict}`);
    for (const problem of s.problems) console.error(`problem: ${problem}`);
    return s.problems.length ? 1 : 0;
  }
  const d = deviceOf(command.device), shell = shellOf(d), ops = engineOps(d, shell, {engine: command.engine});
  const print = value => log(JSON.stringify(value, null, 2));
  switch (command.command) {
    case 'status': print(await engineStatus(ops)); return 0;
    case 'cleanup': {
      // Resumes prepare.mjs's cleanup of a run that died: moves the run's state/ and run/ out of the approved home and
      // the owner's back, stopping only a helper proven the run's; a failure names the recovery directory again.
      const {device, prepared} = JSON.parse(readFileSync(command.preparation, 'utf8'));
      if (device !== command.device) throw new Error(`${command.preparation} is a preparation on ${device}, not ${command.device}`);
      print(cleanupPreparation(d, shell, prepared));
      return 0;
    }
    case 'stop': print(await stopEngine(ops, {dryRun: command.dryRun})); return 0;
    case 'approve': {
      const out = await approveEngine(ops, {confirm, log, dryRun: command.dryRun});
      print(out);
      // The loop's evidence, kept: the grants each approve reported and what the running engine saw before the
      // relaunch (probe (f)'s first question).
      if (!out.dryRun) {
        const file = join(command.out ?? tmpdir(), command.out ? 'approve.json' : `measure-approve-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        mkdirSync(dirname(file), {recursive: true});
        writeFileSync(file, JSON.stringify({device: command.device, at: new Date().toISOString(), ...out}, null, 2) + '\n');
        log(`approve's answers: ${file}`);
      }
      return out.dryRun || out.approved ? 0 : 1;
    }
    case 'probe-f': {
      const copy = join(dirname(dirname(ops.bundle().bundle)), 'engine-probe-f', 'cua Engine.app');
      print(await probeF({ops, copyOps: engineOps(d, shell, {engine: copy}), out: command.out, confirm, log}));
      return 0;
    }
    default: {
      const sceneDir = command.sceneDir ?? `${shell('printf %s "$HOME"').trim()}/Library/Caches/cua-harness/spike-scenes`;
      return measureLane({...command, d, sceneDir}, {shell, ops, confirm, log,
        connect: (spec, handlers) => new StdioClient({...spec, clientName: 'cua-spike-measure', ...handlers})});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof EngineRefusal ? `refused: ${error.message}` : error.message);
    process.exitCode = 1;
  });
}
