// The gate runner's launches, dry (task 121, ruling 929.2): launch-plan.mjs drives gate.mjs `runStep` through its own
// seams, so what it prints is what the runner would hand its display or its spawn, launching nothing. Display-free.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import './fixture-scope.mjs';

import { dryLaunch, envDelta, launchPlan, normalize } from '../../scripts/linux-engine-gate/launch-plan.mjs';
import { launchCommand, parseGateArgs } from '../../scripts/linux-engine-gate/gate.mjs';
import { STEPS, stepArgs, stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-launch-plan-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const home = join(scratch, 'home');
mkdirSync(join(home, 'engine', 'linux'), { recursive: true });
writeFileSync(join(home, 'engine', 'linux', 'cua-engine'), 'x');
let n = 0;
const fresh = () => join(scratch, `out-${n++}`);

test('an experiment on a private display: the harness, its pinned arguments and --out, and CUA_HOME the run home', async () => {
  const out = fresh();
  const base = { ...process.env, CUA_HOME: '/elsewhere' };
  const { print, launch } = await dryLaunch(stepNamed('C1'), { pinned: home, out, base });
  const a = parseGateArgs(['run', 'C1', '--pinned', home, '--out', out]);
  assert.equal(print, launchCommand(stepNamed('C1'), a));
  assert.equal(launch.via, 'private display');
  assert.match(launch.command, /scripts\/linux-engine-diff\.mjs$/);
  assert.deepEqual(launch.args, [...stepArgs(stepNamed('C1'), { paths: a, gate: 'pinned' }), '--out', join(out, 'C1.pinned-release', 'run')]);
  assert.ok(launch.env.includes(`CUA_HOME=${home}`), launch.env.join('\n'));
});

test('a step on its own display is spawned, without DISPLAY; a :0 step is never launched, only printed', async () => {
  const base = { ...process.env, DISPLAY: ':42', XAUTHORITY: '/x' };
  const own = await dryLaunch(stepNamed('F2'), { pinned: home, out: fresh(), base });
  assert.equal(own.launch.via, 'spawn');
  assert.equal(own.launch.command, process.execPath);
  assert.ok(own.launch.env.includes('-DISPLAY') && own.launch.env.includes('-XAUTHORITY'), own.launch.env.join('\n'));
  const zero = await dryLaunch(stepNamed('V5'), { pinned: home, out: fresh(), base });
  assert.equal(zero.launch, null);
  assert.match(zero.print, /sitting\.mjs/);
});

test("the plan's text: every step not skipped, the suites' fresh log directory as its pattern", async () => {
  const text = await launchPlan({ pinned: home, out: fresh(), skip: /^K/ });
  const names = [...text.matchAll(/^## (\S+)$/gm)].map((m) => m[1]);
  assert.deepEqual(names, STEPS.map((s) => s.name).filter((s) => !s.startsWith('K')));
  assert.match(text, /LOGS=\/tmp\/cua171-gl-XXXXXX/);
  assert.doesNotMatch(text, /cua171-gl-(?!XXXXXX)/);
});

test('envDelta and normalize', () => {
  assert.deepEqual(envDelta({ A: '1', B: '3', D: '4' }, { A: '1', B: '2', C: '0' }), ['B=3', '-C', 'D=4']);
  assert.equal(normalize('LOGS=/tmp/cua171-gl-aB3dE9 and /tmp/cua171-gl-XXXXXX'), 'LOGS=/tmp/cua171-gl-XXXXXX and /tmp/cua171-gl-XXXXXX');
});
