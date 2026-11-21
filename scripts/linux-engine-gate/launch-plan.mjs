#!/usr/bin/env node
// The gate runner's launches, dry (#171 M5, task 121; the design session's ruling 929.2): for each step, what
// `gate.mjs run` would launch on the pinned release, without launching it. The runner itself is driven through its own
// seams (gate.mjs `runStep`'s injected display, spawn, pinned rule and checks), so the plan printed is the runner's own
// code path, not a copy of it: the step's `print` line (the command `--list` and `print` give), the script, its
// arguments, its working directory and the environment it is launched with, given as what it changes from this
// process's own. A `:0` step, which `run` never launches, prints its `print` line alone.
//
// Its use: run from one checkout at two commits, under one fixed environment and the same arguments, the two outputs
// compare byte for byte (ruling 929.2: a step whose launch differs between two heads reruns). It needs no display, no
// engine and no network: the pinned home's engine file need only exist.
//
//   node scripts/linux-engine-gate/launch-plan.mjs --pinned <home> --out <new dir> [--skip <regex>] [--arch x64|arm64]
//
// Each drop-signals step also prints its plan's contents on the architecture (ruling 954): every cell, its count and
// its freeze with its start rule (`planContents`), rendered from the arguments the runner would launch it with, through
// the harness's own parser and plan (the review of cf1ef10f, finding 5).
//
// The scratch names the runner makes afresh each time (a suite's log directory, `/tmp/cua171-gl-XXXXXX`) print as that
// pattern. `--skip` leaves out the steps whose names match (task 121: `^K`, the canary steps, whose launch ruling 930
// changes on purpose).

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchCommand, parseGateArgs, runStep } from './gate.mjs';
import { STEPS } from './steps.mjs';

/** The scratch names the runner makes afresh on each launch, printed as their pattern. */
export const normalize = (text) => text.replace(/\/tmp\/cua171-gl-[A-Za-z0-9]{6}/g, '/tmp/cua171-gl-XXXXXX');

/** What `env` changes from `base`: `KEY=value` set or changed, `-KEY` removed, sorted by name. */
export function envDelta(env, base) {
  const keys = [...new Set([...Object.keys(env), ...Object.keys(base)])].sort();
  return keys.flatMap((k) => (!(k in env) ? [`-${k}`] : env[k] !== base[k] ? [`${k}=${env[k]}`] : []));
}

/**
 * One step's launch on the pinned release, dry: `{step, print, launch}`, `launch` null for a `:0` step, else `{via,
 * command, args, cwd, env}` as the runner hands them to its display or its spawn. `out` is the step's own new out
 * directory. Nothing runs: the display and the spawn record what they were given and answer a clean exit.
 */
export async function dryLaunch(step, { pinned, out, base = process.env }) {
  const a = parseGateArgs(['run', step.name, '--pinned', pinned, '--out', out]);
  const print = launchCommand(step, a);
  if (step.display === ':0') return { step: step.name, print, launch: null };
  let launch = null;
  const privateDisplay = async ({ script, args, cwd, env }) => {
    launch = { via: 'private display', command: script, args, cwd, env };
    return { code: 0, signal: null, clean: true, reason: null };
  };
  const spawnChild = (command, args, { cwd, env }) => {
    launch = { via: 'spawn', command, args, cwd, env };
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('exit', 0, null));
    return child;
  };
  const clean = (args) => (args[0] === 'rev-parse' ? '0000000000000000000000000000000000000000\n' : '');
  await runStep(a, {
    git: clean,
    held: () => false,
    loadRunning: () => false,
    xprobe: a.candidate,
    prepare: async ({ source, gate }) => ({ path: source, record: { gate } }),
    pinned: (path) => ({ cua: path }),
    spawnChild,
    privateDisplay,
    leftovers: { roots: [], proc: null },
    start: () => ({ refused: [] }),
  });
  return { step: step.name, print, launch: launch && { ...launch, env: envDelta(launch.env, base) } };
}

/**
 * A drop-signals launch's plan as it runs on `arch` (ruling 954: the plan's contents, not only its name): `args` the
 * harness arguments the runner launches (`dryLaunch`), read by the harness's own parser (cli.mjs `parseArgs`) and sat as
 * its run sits them (drop-signals.mjs `runSpecs`: the plan or the default one, the ballast's cells, the lanes, the
 * `--trials` cap); each cell, its count and its freeze (`freezeOf`, the start rule included). Empty for any other launch.
 */
export async function planContents(args, arch) {
  if (!args.includes('--experiment') || args[args.indexOf('--experiment') + 1] !== 'drop-signals') return [];
  const [{ parseArgs }, signals] = await Promise.all([import('../linux-engine-diff/cli.mjs'), import('../linux-engine-diff/drop-signals.mjs')]);
  const run = parseArgs(args);
  return [`plan ${run.plan ?? 'main'} on ${arch}:`, ...signals.runSpecs(run).map((s) => `  ${s.lane} ${s.cell} x${s.n} freeze ${JSON.stringify(signals.freezeOf(s.cell.split('@')[0]))}`)];
}

/** The plan's text: every step not skipped, in the gate's order, on `arch` (this machine's unless given). */
export async function launchPlan({ pinned, out, skip = null, base = process.env, steps = STEPS, arch = process.arch }) {
  const lines = [];
  for (const step of steps.filter((s) => !skip || !skip.test(s.name))) {
    const { print, launch } = await dryLaunch(step, { pinned, out: join(out, step.name), base });
    lines.push(`## ${step.name}`, `print: ${print}`);
    if (!launch) lines.push('launch: none (a :0 step: run in the declared sitting with its print line)');
    else lines.push(`launch: ${launch.via}`, `command: ${launch.command}`, `cwd: ${launch.cwd}`, 'args:', ...launch.args.map((x) => `  ${x}`), 'env:', ...launch.env.map((x) => `  ${x}`));
    if (launch) lines.push(...(await planContents(launch.args, arch)));
    lines.push('');
  }
  return normalize(lines.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const pinned = flag('--pinned');
  const out = flag('--out');
  if (!pinned || !out) throw new Error('usage: launch-plan.mjs --pinned <home> --out <new dir> [--skip <regex>] [--arch x64|arm64]');
  // another architecture's plan, printed here: the runner and the steps read the architecture when they are called
  // (`parseGateArgs`, `stepArgs`), and the plan's contents are asked for it outright (`planContents`)
  const arch = flag('--arch');
  if (arch) Object.defineProperty(process, 'arch', { value: arch });
  if (existsSync(out) && readdirSync(out).length) throw new Error(`${out} is not empty: each plan writes its steps' directories afresh`);
  mkdirSync(out, { recursive: true });
  const skip = flag('--skip');
  process.stdout.write(await launchPlan({ pinned: resolve(pinned), out: resolve(out), skip: skip ? new RegExp(skip) : null, arch: process.arch }));
}
