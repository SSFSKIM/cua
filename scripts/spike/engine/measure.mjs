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
//                                                       ./measure-approve-<time>.json)
//   measure.mjs probe-f --device <d> --out <dir>       probe (f), operator-guided (./measure/probe-f.mjs)
//   measure.mjs --device <d> --lane vendor|cua --runs N --approved-runtime <home> --out <dir>
//         [--samples N] [--tasks N] [--scenes textedit,finder,chrome,electron] [--probes c|none] [--operator]
//         [--scene-dir <device dir>] [--node <Node 24+ on the device, cua lane>] [--approved-engine <bundle>]
//     <dir>/run-<n>/results.jsonl, meta.json and goldens/ per run (./measure/lane.mjs)
//   measure.mjs summary <dir>                          <dir>/summary.md from <dir>/vendor and <dir>/cua
//     (./measure/summary.mjs)
//
// `--approved-engine` defaults to the device's approved location (~/Library/Application Support/cua/engine/cua
// Engine.app). The scene directory (default ~/Library/Caches/cua-harness/spike-scenes on the device) is shared by the
// sitting's runs of both lanes: Finder keeps its view per folder, so the list view the vendor lane sets holds for the
// cua lane, which cannot send keys until its input methods exist.
import {parseArgs} from 'node:util';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClient} from '../../browser-parity/mcp.mjs';
import {deviceOf, shellOf, engineOps} from './measure/device.mjs';
import {approveEngine, stopEngine, engineStatus, EngineRefusal} from './measure/engine-control.mjs';
import {measureLane, LANES, SCENE_ORDER} from './measure/lane.mjs';
import {writeSummary} from './measure/summary.mjs';
import {probeF} from './measure/probe-f.mjs';

const ENGINE_COMMANDS = ['stop', 'status', 'approve', 'probe-f'];
export const USAGE = 'usage: measure.mjs stop|status|approve|probe-f --device <alias|local> [--dry-run] [--approved-engine <bundle>] [--out <dir>] | measure.mjs --device <alias|local> --lane vendor|cua --runs N --approved-runtime <home> --out <dir> [--samples N] [--tasks N] [--scenes list] [--probes c|none] [--operator] [--scene-dir <dir>] [--node <path>] | measure.mjs summary <dir>';
const OPTIONS = {
  device: {type: 'string'}, lane: {type: 'string'}, runs: {type: 'string'}, 'approved-runtime': {type: 'string'}, out: {type: 'string'},
  samples: {type: 'string', default: '30'}, tasks: {type: 'string', default: '10'}, scenes: {type: 'string', default: SCENE_ORDER.join(',')},
  probes: {type: 'string', default: 'c'}, operator: {type: 'boolean', default: false}, 'scene-dir': {type: 'string'}, node: {type: 'string'},
  'approved-engine': {type: 'string'}, 'dry-run': {type: 'boolean', default: false},
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
  return {command: 'run', device: values.device, lane: values.lane, runs: count(values.runs, 'runs'), approvedRuntime: absolute(values['approved-runtime'], 'approved-runtime') ?? fail('--approved-runtime is required'),
    out: resolve(values.out), samples: count(values.samples, 'samples'), tasks: count(values.tasks, 'tasks'), scenes: SCENE_ORDER.filter(s => scenes.includes(s)), probes,
    operator: values.operator, sceneDir: absolute(values['scene-dir'], 'scene-dir'), node: absolute(values.node, 'node'), engine};
}

// The operator's console answer: Enter (or anything but n) is yes; end of input is no.
export function consoleConfirm(message) {
  return new Promise(done => {
    const rl = createInterface({input: process.stdin, output: process.stderr});
    let answered = false;
    rl.question(message, answer => { answered = true; rl.close(); done(!/^\s*n/i.test(answer)); });
    rl.on('close', () => { if (!answered) done(false); });
  });
}

export async function main(argv = process.argv.slice(2), {log = console.log, confirm = consoleConfirm} = {}) {
  const command = parseCommand(argv);
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
    case 'stop': print(await stopEngine(ops, {dryRun: command.dryRun})); return 0;
    case 'approve': {
      const out = await approveEngine(ops, {confirm, log, dryRun: command.dryRun});
      print(out);
      // The loop's evidence, kept: the grants each approve reported and what the running engine saw before the
      // relaunch (probe (f)'s first question).
      if (!out.dryRun) {
        const file = command.out ? join(command.out, 'approve.json') : resolve(`measure-approve-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
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
