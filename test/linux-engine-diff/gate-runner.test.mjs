// M4's gate as one runnable sequence (T18): the steps cover the verdict run exactly once, each lasts 45 minutes or
// less, each is a valid run of its own, the `:0` steps are only ever printed, a gate runs only from a clean checkout,
// and every step's directory carries its label. Display-free.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { GateRefused, checkCheckout, launchCommand, listText, parseGateArgs, printStep, runStep, stepDir } from '../../scripts/linux-engine-gate/gate.mjs';
import { FACADE_SCRIPT, GATE_SCENES, MAX_STEP_MINUTES, STEPS, stepArgs, stepNamed, stepScript, suiteEnv, totals, verdictOps } from '../../scripts/linux-engine-gate/steps.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { planOps } from '../../scripts/linux-engine-diff/run.mjs';
import { dropSignalsVerdict } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { PREDICATE_KINDS } from '../../scripts/linux-engine-diff/predicates.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-gate-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir);
  return dir;
};
const ROOT = '/checkout';
const PATHS = { vendor: '/v/pinned', newest: '/v/newest', vendorJs: '/v/sky', candidate: '/c/cua-engine-0.4.0-linux-x64' };
const verdicts = STEPS.filter((s) => s.kind === 'verdict');
const pairs = (plan) => plan.map((p) => `${p.scene}:${p.op}`);
/** A clean git at a commit, or one answering `status`. */
const cleanGit = (status = '') => (args) => (args[0] === 'rev-parse' ? 'cd4c929758caf90329fd5cfb0d5028f1ec1c92c2\n' : status);

test("the verdict steps run every scene and operation of M3's gate and M4's scenes exactly once, the desktop's in one step", () => {
  const all = pairs(planOps(GATE_SCENES, 'all'));
  const stepped = verdicts.flatMap((s) => pairs(planOps(s.scenes, verdictOps(s))));
  assert.deepEqual([...stepped].sort(), [...all].sort());
  assert.equal(new Set(stepped).size, stepped.length, 'no (scene, operation) runs twice');
  const desktop = verdicts.filter((s) => planOps(s.scenes, verdictOps(s)).some((p) => p.scene === 'desktop'));
  assert.deepEqual(desktop.map((s) => s.name), ['V2']);
});

test("M4's scenes are appended in the frozen order: identity's Chrome windows after device-chrome-dnd, and V5 under the gate's ballast", () => {
  assert.deepEqual(GATE_SCENES.slice(0, 16).at(-1), 'device-chrome-dnd');
  const v5 = stepNamed('V5');
  assert.ok(v5.scenes.indexOf('identity') > v5.scenes.indexOf('device-chrome-dnd'));
  const args = stepArgs(v5, { paths: PATHS, gate: true });
  assert.deepEqual(args.slice(args.indexOf('--ballast'), args.indexOf('--ballast') + 2), ['--ballast', 'gate']);
  assert.ok(verdicts.filter((s) => s !== v5).every((s) => !stepArgs(s, { paths: PATHS, gate: true }).includes('--ballast')));
});

test('every step is planned at 45 minutes or less, named once, on a known display and load; the :0 steps are the verdict steps and Z0', () => {
  assert.equal(new Set(STEPS.map((s) => s.name)).size, STEPS.length);
  for (const s of STEPS) {
    assert.ok(s.minutes > 0 && s.minutes <= MAX_STEP_MINUTES, `${s.name}: ${s.minutes} min`);
    assert.ok([':0', 'private', 'own'].includes(s.display), s.name);
    assert.ok(['idle', 'gate-windows', 'load2'].includes(s.load), s.name);
  }
  assert.deepEqual(STEPS.filter((s) => s.display === ':0').map((s) => s.name), ['V1', 'V2', 'V3', 'V4', 'V5', 'Z0']);
  const t = totals();
  assert.equal(t.all, t.display[':0'] + t.display.private);
  assert.equal(t.all, Object.values(t.load).reduce((a, b) => a + b, 0));
});

test('each verdict step is a valid run of its own: its own run name, explicit operations, three blocks, the vendor builds, parseable', () => {
  const names = new Set();
  for (const s of verdicts) {
    const args = stepArgs(s, { paths: PATHS, gate: true });
    const parsed = parseArgs([...args, '--out', '/o']);
    assert.equal(parsed.mode, 'run');
    assert.notEqual(parsed.ops, 'all', `${s.name}: an explicit --ops`);
    assert.equal(parsed.blocks, 3);
    assert.equal(parsed.dev, undefined, 'a gate verdict run is a gate: no --dev');
    assert.equal(parsed.cua, PATHS.candidate);
    names.add(parsed.run);
    assert.equal(stepArgs(s, { paths: PATHS, gate: false }).at(-1), '--dev', 'a development run says so');
  }
  assert.equal(names.size, verdicts.length);
});

test('every experiment step parses; a gate\'s takes --gate, a development run\'s does not; loads are as the plan says', () => {
  for (const s of STEPS.filter((x) => x.kind === 'experiment')) {
    const gate = parseArgs([...stepArgs(s, { paths: PATHS, gate: true }), '--out', '/o']);
    assert.equal(gate.mode, 'experiment', s.name);
    assert.equal(gate.gate, true, s.name);
    assert.equal(gate.run, `m4-gate-${s.name}`);
    assert.equal(parseArgs([...stepArgs(s, { paths: PATHS, gate: false }), '--out', '/o']).gate, undefined, s.name);
    assert.equal(gate.loadFactor === 2, s.load === 'load2', `${s.name}: twice the load exactly when planned so`);
    assert.equal(gate.ballast === 'gate', s.load === 'gate-windows', `${s.name}: the gate's window load`);
    assert.equal(gate.requireBurstCut, undefined, 'the service\'s stop paths are not held to the burst cut');
  }
});

test("the coverage the gate names: T7 revised's shipped lane and stops, the settle as shipped, T17's cells at three loads, never t17-moved", () => {
  const parsed = (name) => parseArgs([...stepArgs(stepNamed(name), { paths: PATHS, gate: true }), '--out', '/o']);
  // the key scenarios and the click scenarios in sittings of their own: a click series leaves the focus in the other field
  for (const name of ['F1a', 'F3a']) assert.deepEqual([parsed(name).scenarios, parsed(name).lanes], [['burst', 'aba', 'paste'], ['shipped']]);
  for (const name of ['F1b', 'F3b']) assert.deepEqual([parsed(name).scenarios, parsed(name).lanes], [['click-paste', 'click-field'], ['shipped']]);
  // the stops are Chromium's alone: every other family would go unmeasured
  for (const name of ['F2', 'F4']) assert.deepEqual([parsed(name).stopsOnly, parsed(name).families], [true, ['chrome', 'electron']]);
  for (const s of STEPS.filter((x) => x.args?.includes('settle'))) assert.deepEqual(parsed(s.name).lanes, ['shipped'], s.name);
  const t17 = STEPS.filter((s) => s.args?.includes('t17-fix3')).map((s) => s.load);
  assert.deepEqual(t17.sort(), ['gate-windows', 'idle', 'load2']);
  assert.ok(STEPS.every((s) => !s.args?.includes('t17-moved')));
  assert.ok(STEPS.some((s) => s.args?.includes('t14-late') && s.load === 'idle'));
  const z0 = parsed('Z0');
  assert.deepEqual([z0.families, z0.ops], [['firefox', 'writer'], ['dnd', 'select']]);
});

test("every drop-signals step is judged: T17's Electron cells by electronDropVerdict, Chrome's t14 and t14-late by chromeDropVerdict", () => {
  const judges = Object.fromEntries(STEPS.filter((s) => s.args?.includes('drop-signals')).map((s) => {
    const parsed = parseArgs([...stepArgs(s, { paths: PATHS, gate: true }), '--out', '/o']);
    return [s.name, dropSignalsVerdict(parsed, [])?.judge ?? null];
  }));
  assert.deepEqual(judges, { H1: 'electronDropVerdict', H2: 'electronDropVerdict', C1: 'chromeDropVerdict', L4a: 'electronDropVerdict', L4b: 'chromeDropVerdict', L4c: 'chromeDropVerdict' });
});

test("T19's predicates manifest is measured whole: every kind in a step of its own, the leave cases of every kind in P5, Firefox's drag and drop in P6", () => {
  const ops = (name) => parseArgs([...stepArgs(stepNamed(name), { paths: PATHS, gate: true }), '--out', '/o']).ops;
  const steps = ['P1', 'P2', 'P3', 'P4', 'P6'];
  const kinds = PREDICATE_KINDS.map((k) => k.kind);
  for (const kind of kinds) assert.equal(steps.filter((s) => ops(s).includes(kind)).length, 1, `${kind}: in exactly one step`);
  assert.deepEqual(ops('P6'), ['dnd']);
  assert.deepEqual(ops('P5'), ['click', 'scroll', 'move', 'select', 'dnd']);
  for (const kind of kinds) assert.ok(ops('P5').includes(kind), `${kind}: its leave cases in P5`);
  assert.equal(stepNamed('P6').display, 'private');
  assert.ok(stepNamed('P6').minutes <= MAX_STEP_MINUTES);
});

test('a pilot is a development run in its smallest form: --trials, the leave cases, a drag at load without the load', () => {
  assert.throws(() => parseGateArgs(['run', 'D1', '--candidate', '/c', '--out', '/o', '--pilot', '2']), (e) => e instanceof GateRefused && /never a release gate/.test(e.message));
  const pilot = (name) => parseArgs([...stepArgs(stepNamed(name), { paths: PATHS, gate: false, pilot: 2 }), '--out', '/o']);
  assert.equal(pilot('D1').samplesTrials, 2);
  assert.equal(pilot('D1').run, 'm4-dev-D1-pilot');
  assert.equal(pilot('L1').load, false, 'the drag at load refuses fewer than 40 a side, so its pilot drops the load');
  assert.equal(pilot('L1').samplesTrials, 2);
  assert.equal(pilot('L3a').loadFactor, 2, 'other load steps keep their load');
  assert.equal(pilot('P1').plan, 'leave');
  assert.equal(pilot('E1').firstRounds, 2);
});

test('a gate runs only from a clean checkout whose commit reads, writing outside it; a development run is recorded, not refused', () => {
  assert.deepEqual(checkCheckout({ root: ROOT, out: '/elsewhere', gate: true, git: cleanGit() }), { commit: 'cd4c929758caf90329fd5cfb0d5028f1ec1c92c2', clean: true });
  assert.throws(() => checkCheckout({ root: ROOT, out: '/elsewhere', gate: true, git: cleanGit('?? node_modules\n') }), /has 1 changes \(node_modules\)/);
  assert.throws(() => checkCheckout({ root: ROOT, out: '/elsewhere', gate: true, git: () => { throw new Error('fatal: not a git repository'); } }), /clean git checkout .* could not be read: fatal: not a git repository/);
  assert.throws(() => checkCheckout({ root: ROOT, out: '/checkout/docs/evidence/gate', gate: true, git: cleanGit() }), /inside the checkout/);
  assert.deepEqual(checkCheckout({ root: ROOT, out: '/checkout/x', gate: false, git: cleanGit(' M a\n') }), { commit: 'cd4c929758caf90329fd5cfb0d5028f1ec1c92c2', clean: false });
});

test('a :0 step is printed as task 50\'s guarded sitting under the host lock, and the runner refuses to run it', async () => {
  const a = parseGateArgs(['print', 'V1', '--candidate', PATHS.candidate, '--out', '/gate']);
  const command = launchCommand(stepNamed('V1'), a, ROOT);
  assert.match(command, /locked\.sh t18-gate env WRAP=\/checkout\/docs\/evidence\/.*\/pointer-route\/scripts\/wrap71\.py \/checkout\/docs\/evidence\/.*\/pointer-route\/scripts\/run71\.sh \/gate\/V1\.release-gate \/checkout --vendor /);
  assert.doesNotMatch(command, / --out /, 'run71.sh gives the harness its --out');
  const run = parseGateArgs(['run', 'Z0', '--candidate', PATHS.candidate, '--out', '/gate']);
  await assert.rejects(runStep(run, { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false }), /runs on :0.*never runs on the person's display/);
});

test('the runner starts nothing without the harness\'s X client, while the host is held, under a running load, into an existing step directory, or from an unclean checkout', async () => {
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const a = parseGateArgs(['run', 'D1', '--candidate', candidate, '--out', out]);
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate };
  await assert.rejects(runStep(a, { ...deps, xprobe: '/nowhere/xprobe' }), /the harness's X client is not built: cargo build --release/);
  await assert.rejects(runStep(a, { ...deps, held: () => true }), /held for sittings/);
  await assert.rejects(runStep(a, { ...deps, loadRunning: () => true }), /stress-ng is running/);
  await assert.rejects(runStep(a, { ...deps, git: cleanGit(' M scripts/x.mjs\n') }), /has 1 changes/);
  mkdirSync(stepDir(stepNamed('D1'), a));
  await assert.rejects(runStep(a, deps), /exists: each execution of a step writes a directory of its own/);
  assert.deepEqual(readdirSync(out), ['D1.release-gate'], 'nothing else was written');
});

test('a step\'s directory carries its label: its name, its README and its step.json, release gate or development run', () => {
  const out = fresh('out');
  const gate = parseGateArgs(['print', 'V3', '--candidate', PATHS.candidate, '--out', out]);
  printStep(gate, { root: ROOT, git: cleanGit() });
  const gateDir = join(out, 'V3.release-gate');
  assert.match(readFileSync(join(gateDir, 'README.md'), 'utf8'), /^# V3 \(release gate\)\n\n\*\*release gate\.\*\*/);
  assert.equal(JSON.parse(readFileSync(join(gateDir, 'step.json'), 'utf8')).label, 'release gate');
  const dev = parseGateArgs(['print', 'D2', '--candidate', PATHS.candidate, '--out', out, '--dev', '--pilot', '2']);
  const command = printStep(dev, { root: ROOT, git: cleanGit(' M x\n') });
  const devDir = join(out, 'D2.development-run.pilot');
  const readme = readFileSync(join(devDir, 'README.md'), 'utf8');
  assert.match(readme, /^# D2 \(development run, not a release gate, pilot\)/);
  assert.doesNotMatch(readme.replace(/not a release gate/g, ''), /release gate/, 'a development run never reads as a gate');
  assert.match(readme, /\*\*not clean\*\*/);
  assert.match(command, /gate\.mjs run D2 --candidate \S+ --out \S+ --dev --pilot 2$/);
  assert.equal(existsSync(join(devDir, 'run')), false, 'print runs nothing');
});

test('--list prints every step\'s minutes, display and command, and the totals per display and per load', () => {
  const text = listText(parseGateArgs(['--list']), ROOT);
  for (const s of STEPS) assert.match(text, new RegExp(`^${s.name}\\s+${s.minutes} min\\s+${s.display.replace(':', '\\:')}`, 'm'));
  assert.equal(text.split('\n').filter((l) => /locked\.sh t18-gate /.test(l)).length, STEPS.length);
  const t = totals();
  assert.match(text, new RegExp(`total ${t.all} min .*per display: :0 ${t.display[':0']} min, private ${t.display.private} min; per load: idle ${t.load.idle} min, gate-windows ${t.load['gate-windows']} min, load2 ${t.load.load2} min`));
});

test('the facade suites join the gate after the private drag steps: parity, baseline, linux-native and linux-device-mode, each listed', () => {
  const names = STEPS.map((s) => s.name);
  const suites = STEPS.filter((s) => s.kind === 'suite');
  assert.deepEqual(suites.map((s) => [s.name, s.args[0]]), [['R1', 'parity'], ['R2', 'baseline'], ['R3', 'accept'], ['R4', 'device']]);
  assert.ok(suites.every((s) => s.display === 'own' && s.load === 'idle' && names.indexOf(s.name) > names.indexOf('D5')));
  const text = listText(parseGateArgs(['--list']), ROOT);
  for (const s of suites) assert.match(text, new RegExp(`^${s.name}\\s+${s.minutes} min\\s+own\\s+idle\\s+.*\\n\\s+.*gate\\.mjs run ${s.name} `, 'm'));
  assert.deepEqual(suiteEnv({ candidate: '/s/cua-engine', dir: '/o/R1.release-gate', gate: true, logs: '/tmp/l' }), { ENGINE_BIN: '/s/cua-engine', OUT: '/o/R1.release-gate/run', LOGS: '/tmp/l', LABEL: 'counted' });
  assert.equal(suiteEnv({ candidate: '/c', dir: '/d', gate: false, logs: '/tmp/l' }).LABEL, 'pilot');
  assert.equal(stepScript(stepNamed('R2')), FACADE_SCRIPT);
});

test("a suite step runs facade.sh's part with the candidate as ENGINE_BIN, its out and logs labelled in the step's directory", async () => {
  const root = fresh('root');
  mkdirSync(join(root, FACADE_SCRIPT, '..'), { recursive: true });
  // facade.sh's stand-in: records its part and environment
  writeFileSync(join(root, FACADE_SCRIPT), '#!/bin/bash\necho "part=$1 engine=$ENGINE_BIN out=$OUT label=$LABEL" > "$OUT/seen"\necho "$LOGS" > "$OUT/logs-path"\nmkdir -p "$LOGS/accept" && echo kept > "$LOGS/accept/facade.log"\n');
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const a = parseGateArgs(['run', 'R3', '--candidate', candidate, '--out', out, '--dev', '--pilot', '2']);
  const exit = await runStep(a, { root, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate });
  assert.equal(exit, 0);
  const dir = join(out, 'R3.development-run.pilot');
  assert.equal(readFileSync(join(dir, 'run', 'seen'), 'utf8').trim(), `part=accept engine=${candidate} out=${dir}/run label=pilot`);
  // the logs went to a short scratch directory (a session bus's socket lies under it: 108 bytes), then into the step's
  const logs = readFileSync(join(dir, 'run', 'logs-path'), 'utf8').trim();
  assert.ok(logs.length < 60 && !logs.startsWith(dir), `a short log directory, not ${logs}`);
  assert.equal(existsSync(logs), false, 'the scratch is removed');
  assert.equal(readFileSync(join(dir, 'logs', 'accept', 'facade.log'), 'utf8'), 'kept\n');
  for (const sub of ['run', 'logs']) assert.equal(readFileSync(join(dir, sub, 'LABEL'), 'utf8'), 'development run, not a release gate\n');
  const record = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8'));
  assert.equal(record.exit, 0);
  assert.equal(record.env.LABEL, 'pilot');
  assert.equal(record.run_name, null);
});
