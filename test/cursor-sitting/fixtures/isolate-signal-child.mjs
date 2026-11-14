// A child process for item-187-isolate.test.mjs: the isolating drive on a fake engine, composed as the CLI composes it
// (signalGuard, driveItems' abort, abortableIo for every item but the end's, driveThenCleanup), with a BEFORE repetition
// that waits in its first step until a signal comes. It prints IN-BEFORE when it waits there and CLEANING when the
// cleanup's restore starts (which takes a while, so a second signal lands during it), then one JSON line of what
// happened, and exits as the CLI does after a signal: 128 + its number.
// argv: <out dir> <slow restore ms> [timer|helper|inline]. `helper`: the restore runs a real subprocess
// (fixtures/sleep-helper.mjs, standing in for `cua engine stop`) in its own process group, as the kit's cleanup does
// (./detached.mjs); `inline`: the same helper with execFileSync, in this process's group, which a group signal kills
// (the cleanup's retry then recovers).
import {driveThenCleanup, isolatePlan, isolateTasks, ITEMS, SAVED, signalGuard, abortableIo} from '../../../scripts/cursor-sitting/item-187-isolate.mjs';
import {driveItems} from '../../../scripts/cursor-sitting/item-187.mjs';
import {runSteps} from '../../../scripts/cursor-sitting/runner.mjs';
import {runDetached} from '../../../scripts/cursor-sitting/detached.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const [out, slow = '300', mode = 'timer'] = process.argv.slice(2);
const HELPER = fileURLToPath(new URL('./sleep-helper.mjs', import.meta.url));
const BUILDS = {after: 'a'.repeat(64), before: 'c'.repeat(64), owner: 'f'.repeat(64)};
const world = {installed: 'owner', restores: [], ranAfterSignal: [], helpers: []};
// The restore's stand-in for `cua engine stop`: a timer, a detached helper, or an inline one.
async function stopEngine() {
  if (mode === 'timer') return sleep(Number(slow));
  if (mode === 'helper') {
    const r = await runDetached(process.execPath, [HELPER, slow]);
    world.helpers.push({code: r.code, signal: r.signal});
    if (r.code !== 0) throw new Error(`the engine did not stop (${r.signal ?? r.code})`);
    return;
  }
  try { execFileSync(process.execPath, [HELPER, slow], {stdio: 'ignore'}); world.helpers.push({code: 0, signal: null}); } catch (error) {
    world.helpers.push({code: error.status ?? null, signal: error.signal ?? null});
    throw new Error(`the engine did not stop (${error.signal ?? error.status})`);
  }
}
const halfOf = dir => Object.entries(SAVED).find(([, d]) => dir.endsWith(d))[0];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const guard = signalGuard();
const tasks = {
  ...isolateTasks({halves: '/halves', now: () => 1, start: {ok: true, pair: {shippingBuild: BUILDS.after, controlBuild: BUILDS.before}, end: 'restore-owner', ownerBuild: BUILDS.owner},
    savedRecord: dir => ({status: {build: BUILDS[halfOf(dir)]}}),
    restore: async ({from}) => { process.stdout.write('CLEANING\n'); await sleep(10); await stopEngine(); world.installed = halfOf(from); world.restores.push(world.installed); return {ok: true, status: {}}; },
    approve: async () => ({ok: true, approved: true, build: BUILDS[world.installed], captureConfirmation: 'none'})}),
  // The BEFORE repetition's first step: it ends once a signal came, as a real step ends within its bound.
  wait: async () => { process.stdout.write('IN-BEFORE\n'); while (!guard.signal()) await sleep(20); return {ok: true}; },
  next: async () => { if (guard.signal()) world.ranAfterSignal.push('next'); return {ok: true}; },
};
const ping = () => ({engine: 'cua', version: '0.1.0', build: BUILDS[world.installed], ...(world.installed === 'before' ? {variant: 'control-no-inert-click'} : {})});
const io = {scene: id => ({id, app: `/Apps/${id}.app`, pid: 202, at: 1, window: {number: 12}}), tasks,
  open: async () => ({run: async () => ({ok: true, value: {inFront: true}, route: null, meta: {}, images: [], nativeEngine: ping()}), close: async () => 0})};
const stoppable = abortableIo(io, guard.signal);
const plan = isolatePlan({blocks: [1, 2]});
const outcome = await driveThenCleanup({end: 'restore-owner', guard,
  drive: () => driveItems(plan, {abort: guard.signal, evidenceOf: () => ({rows: [], activations: []}),
    runItem: async entry => {
      if (guard.signal() && entry.stage !== 'end') world.ranAfterSignal.push(entry.item);
      if (entry.stage === 'swap') { world.installed = entry.half; return null; }
      const steps = entry.stage === 'end' ? [] : entry.stage === 'cell' && entry.half === 'before' ? [{task: 'wait'}, {task: 'next'}] : [{task: 'next'}];
      try { await runSteps(steps, {item: entry.item, out, io: entry.stage === 'end' ? io : stoppable, log: () => {}}); return null; } catch (error) { return error; }
    }}),
  cleanup: steps => runSteps(steps, {item: ITEMS.cleanup, out, io, log: () => {}})});
process.stdout.write(`${JSON.stringify({installed: world.installed, restores: world.restores, ranAfterSignal: world.ranAfterSignal, stopped: outcome.stopped, signal: outcome.signal,
  cleanupError: outcome.cleanupError?.message ?? null, cleanupAttempts: outcome.cleanupAttempts, helpers: world.helpers})}\n`);
guard.dispose();
process.exitCode = guard.exitCode() ?? 0;
