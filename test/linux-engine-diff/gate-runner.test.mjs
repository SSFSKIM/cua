// M4's gate as one runnable sequence (T18): the steps cover the verdict run exactly once, each lasts 45 minutes or
// less, each is a valid run of its own, the `:0` steps are only ever printed, a gate runs only from a clean checkout,
// and every step's directory carries its label. Display-free.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
// its runs' start and end checks read a fixture, never the real roots or /proc (fixture-scope.mjs)
import './fixture-scope.mjs';

import { GateRefused, RUN71_TMPDIR, checkCheckout, gateSummary, launchCommand, listText, parseGateArgs, printStep, runStep, stepDir, zeroStepProblems } from '../../scripts/linux-engine-gate/gate.mjs';
import { GATE_SCENES, MAX_STEP_MINUTES, STEPS, SUITES_SCRIPT, runName, stepArgs, stepLabel, stepNamed, stepScript, suiteEnv, totals, verdictOps } from '../../scripts/linux-engine-gate/steps.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { planOps } from '../../scripts/linux-engine-diff/run.mjs';
import { scratchRoot } from '../../scripts/linux-engine-diff/scenes.mjs';
import { dropSignalsVerdict } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { PREDICATE_KINDS } from '../../scripts/linux-engine-diff/predicates.mjs';
import { controlRootRefusal } from '../../scripts/linux-engine-diff/engine-stop.mjs';

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
    assert.ok(stepArgs(s, { paths: PATHS, gate: false }).includes('--dev'), 'a development run says so');
  }
  assert.equal(names.size, verdicts.length);
});

test('every experiment step parses; a gate\'s takes --gate, a development run\'s does not; loads are as the plan says', () => {
  for (const s of STEPS.filter((x) => x.kind === 'experiment')) {
    const gate = parseArgs([...stepArgs(s, { paths: PATHS, gate: true }), '--out', '/o']);
    assert.equal(gate.mode, 'experiment', s.name);
    assert.equal(gate.gate, true, s.name);
    assert.equal(gate.run, `m5-gate-${s.name}`, 'M5\'s run names (task 87\'s finding 6)');
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
  assert.deepEqual(judges, { H1: 'electronDropVerdict', H2: 'electronDropVerdict', C1: 'chromeDropVerdict', K3: 'holdRegressionVerdict', L4a: 'electronDropVerdict', L4b: 'chromeDropVerdict', L4c: 'chromeDropVerdict' });
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
  assert.equal(pilot('D1').run, 'm5-dev-D1-pilot');
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

test('a :0 step is printed as task 50\'s guarded sitting under the host lock, M5\'s guard (ruling 773) around M4\'s run71.sh, and the runner refuses to run it', async () => {
  const a = parseGateArgs(['print', 'V1', '--candidate', PATHS.candidate, '--out', '/gate']);
  const command = launchCommand(stepNamed('V1'), a, ROOT);
  assert.match(command, /locked\.sh m5-gate \S+ \/checkout\/scripts\/linux-engine-gate\/sitting\.mjs --dir \/gate\/V1\.release-gate --hold \S+ --terminal end -- env WRAP=\/checkout\/docs\/evidence\/2026-10-28-own-linux-engine\/m5\/guards\/wrap71\.py \/checkout\/docs\/evidence\/2026-10-28-own-linux-engine\/m4\/pointer-route\/scripts\/run71\.sh \/gate\/V1\.release-gate \/checkout --vendor /);
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
  assert.equal(text.split('\n').filter((l) => /locked\.sh m5-gate /.test(l)).length, STEPS.length, 'M5\'s default holder, unless --holder names one');
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
  assert.deepEqual(suiteEnv({ candidate: '/s/cua-engine', dir: '/o/R1.release-gate', gate: true, logs: '/tmp/l', device: 'cua-171' }), { ENGINE: 'candidate', ENGINE_BIN: '/s/cua-engine', OUT: '/o/R1.release-gate/run', LOGS: '/tmp/l', LABEL: 'counted', DEVICE: 'cua-171' });
  assert.equal(suiteEnv({ candidate: '/c', dir: '/d', gate: false, logs: '/tmp/l', device: 'cua-171' }).LABEL, 'pilot');
  assert.equal(stepScript(stepNamed('R2')), SUITES_SCRIPT);
});

test("a suite step runs the suites runner's part with the candidate as ENGINE_BIN, its out and logs labelled in the step's directory", async () => {
  const root = fresh('root');
  mkdirSync(join(root, SUITES_SCRIPT, '..'), { recursive: true });
  // the runner's stand-in: records its part and environment
  writeFileSync(join(root, SUITES_SCRIPT), '#!/bin/bash\necho "part=$1 engine=$ENGINE $ENGINE_BIN out=$OUT label=$LABEL" > "$OUT/seen"\necho "$LOGS" > "$OUT/logs-path"\nmkdir -p "$LOGS/accept" && echo kept > "$LOGS/accept/facade.log"\n');
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const a = parseGateArgs(['run', 'R3', '--candidate', candidate, '--out', out, '--dev', '--pilot', '2']);
  const exit = await runStep(a, { root, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate });
  assert.equal(exit, 0);
  const dir = join(out, 'R3.development-run.pilot');
  assert.equal(readFileSync(join(dir, 'run', 'seen'), 'utf8').trim(), `part=accept engine=candidate ${candidate} out=${dir}/run label=pilot`);
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

// ---------------------------------------------------------------------------------------------------------------
// #171 M5, T1: acceptance on the pinned release. `--pinned <cua home>` names the run home whose `cua install` placed the
// engine; every step takes that engine by candidate.mjs's pinned rule, the vendor paths follow the architecture, and the
// facade suites run on their own homes' installed engines with no --engine-bin and no CUA_LINUX_ENGINE_BIN

const ACC = '/runs/m5/home-x64';
const ACC_ENGINE = `${ACC}/engine/linux/cua-engine`;

test('--pinned <home> takes the engine its cua install placed, as acceptance on the pinned release unless --dev; never beside --candidate', () => {
  const a = parseGateArgs(['run', 'D1', '--pinned', ACC, '--out', '/o'], { arch: 'x64', env: {} });
  assert.deepEqual([a.gate, a.pinned, a.candidate], ['pinned', ACC, ACC_ENGINE]);
  assert.equal(parseGateArgs(['run', 'D1', '--pinned', ACC, '--out', '/o', '--dev', '--pilot', '1'], { arch: 'x64', env: {} }).gate, false);
  assert.throws(() => parseGateArgs(['run', 'D1', '--pinned', ACC, '--candidate', '/c', '--out', '/o']), /--pinned or --candidate, not both/);
  // a pilot on the pinned rule is a development run on the pinned release (task 87's finding 1): see below
  assert.equal(parseGateArgs(['run', 'D1', '--pinned', ACC, '--out', '/o', '--pilot', '1']).gate, 'pinned-dev');
  assert.throws(() => parseGateArgs(['run', 'D1', '--out', '/o']), /needs --pinned <home> or --candidate <file>/);
  assert.deepEqual([parseGateArgs(['check', '--pinned', ACC]).mode, parseGateArgs(['check', '--pinned', ACC]).candidate], ['check', ACC_ENGINE]);
  assert.throws(() => parseGateArgs(['check', '--candidate', '/c']), /check needs --pinned <home>/);
  assert.throws(() => parseGateArgs(['check', '--pinned', ACC, '--dev']), /check is the pinned rule/);
});

test("the vendor paths follow the architecture, the pinned home's runtime when one is named; the device too, unless the environment names it", () => {
  const arm = parseGateArgs(['print', 'V1', '--pinned', '/runs/m5/home-arm64', '--out', '/o'], { arch: 'arm64', env: {} });
  for (const key of ['vendor', 'newest', 'vendorJs']) assert.doesNotMatch(arm[key], /x64/, `${key}: ${arm[key]}`);
  assert.equal(arm.vendor, '/runs/m5/home-arm64/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64');
  assert.equal(arm.vendorJs, '/runs/m5/home-arm64/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky');
  assert.match(arm.newest, /deb-26\.1023\/extracted\/.*\/sky_linux_arm64$/);
  assert.equal(arm.device, 'cua-171-arm64');
  const x64 = parseGateArgs(['print', 'V1', '--candidate', '/c', '--out', '/o'], { arch: 'x64', env: { DEVICE: 'cua-bench' } });
  assert.match(x64.vendor, /\/\.local\/share\/cua\/runtimes\/26\.928\.40906-linux-x64\/.*\/sky_linux_x64$/, 'without a pinned home, the default home\'s runtime, as M4 ran');
  assert.equal(x64.device, 'cua-bench');
  assert.equal(parseGateArgs(['print', 'V1', '--candidate', '/c', '--out', '/o', '--vendor', '/v/mine'], { arch: 'arm64', env: {} }).vendor, '/v/mine', 'a flag still wins');
});

test('a pinned step passes the home\'s engine with --pinned to every harness step, and runs under its own run name and label', () => {
  const a = parseGateArgs(['print', 'V1', '--pinned', ACC, '--out', '/o'], { arch: 'x64', env: {} });
  const names = new Set();
  for (const s of STEPS.filter((x) => ['verdict', 'experiment'].includes(x.kind))) {
    const parsed = parseArgs([...stepArgs(s, { paths: a, gate: 'pinned' }), '--out', '/o']);
    assert.equal(parsed.gate, 'pinned', s.name);
    assert.equal(parsed.cua, ACC_ENGINE, s.name);
    assert.equal(parsed.dev, undefined, s.name);
    assert.equal(parsed.run, `pinned-${s.name}`);
    names.add(parsed.run);
  }
  assert.equal(names.size, STEPS.filter((x) => ['verdict', 'experiment'].includes(x.kind)).length);
  assert.deepEqual(stepLabel({ gate: 'pinned' }), { label: 'acceptance on the pinned release', slug: 'pinned-release', pilot: false });
  assert.equal(stepDir(stepNamed('V1'), a), '/o/V1.pinned-release');
  // the :0 step's printed command carries it into the sitting
  assert.match(launchCommand(stepNamed('V1'), a, ROOT), new RegExp(`--cua ${ACC_ENGINE} .*--run pinned-V1 --pinned$`));
  assert.match(launchCommand(stepNamed('D1'), a, ROOT), new RegExp(`gate\\.mjs run D1 --pinned ${ACC} --out /o$`));
});

test('the facade suites on the pinned release: one runner, the installed engine, no ENGINE_BIN, the device named', () => {
  assert.equal(stepScript(stepNamed('R1')), SUITES_SCRIPT, 'one runner, whatever the engine: no step runs M4\'s facade.sh');
  const env = suiteEnv({ candidate: ACC_ENGINE, dir: '/o/R3.pinned-release', gate: 'pinned', logs: '/tmp/l', pinned: true, device: 'cua-171' });
  assert.deepEqual(env, { ENGINE: 'installed', OUT: '/o/R3.pinned-release/run', LOGS: '/tmp/l', LABEL: 'counted', PINNED_RULE: 'enforce', DEVICE: 'cua-171' });
  assert.equal(suiteEnv({ candidate: ACC_ENGINE, dir: '/d', gate: false, logs: '/tmp/l', pinned: true, device: 'cua-171' }).LABEL, 'pilot');
});

test('the suites runner names an engine only on a candidate, refuses an ambient override, and checks each home by the pinned rule', () => {
  const text = readFileSync(new URL(`../../${SUITES_SCRIPT}`, import.meta.url), 'utf8');
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  // --engine-bin and CUA_LINUX_ENGINE_BIN=<path> are given on one line alone: the candidate's
  const naming = code.split('\n').filter((l) => /--engine-bin|CUA_LINUX_ENGINE_BIN=\S/.test(l));
  assert.deepEqual(naming.map((l) => l.trim().split(')')[0]), ['candidate']);
  assert.match(code, /CUA_LINUX_ENGINE_BIN:-/, 'an ambient one is refused');
  assert.match(code, /DEVICE:\?/, 'the device is the environment\'s');
  assert.match(code, /pinned_check\(\) \{[\s\S]{0,300}?gate\.mjs" check --pinned "\$1"/);
  assert.deepEqual(code.match(/pinned_check "\$\w+"/g), ['pinned_check "$PHOME"', 'pinned_check "$CUA_HOME"'], 'the parity home and each fixture\'s home are checked');
  assert.match(code, /engine-watch\.mjs/, 'the fixtures\' samples are judged');
  // the script parses
  const { status, stderr } = spawnSync('bash', ['-n', fileURLToPath(new URL(`../../${SUITES_SCRIPT}`, import.meta.url))], { encoding: 'utf8' });
  assert.equal(status, 0, stderr);
});

test("a pinned suite step runs the M5 runner's part with no engine in its environment, only the device", async () => {
  const root = fresh('root');
  mkdirSync(join(root, SUITES_SCRIPT, '..'), { recursive: true });
  writeFileSync(join(root, SUITES_SCRIPT), '#!/bin/bash\necho "part=$1 engine=$ENGINE ${ENGINE_BIN-unset} override=${CUA_LINUX_ENGINE_BIN-unset} device=$DEVICE label=$LABEL" > "$OUT/seen"\n');
  const home = fresh('home');
  mkdirSync(join(home, 'engine', 'linux'), { recursive: true });
  writeFileSync(join(home, 'engine', 'linux', 'cua-engine'), 'x');
  const out = fresh('out');
  const a = parseGateArgs(['run', 'R4', '--pinned', home, '--out', out, '--dev', '--pilot', '1'], { arch: 'x64', env: {} });
  const before = process.env.CUA_LINUX_ENGINE_BIN;
  delete process.env.CUA_LINUX_ENGINE_BIN;
  try {
    const exit = await runStep(a, { root, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: join(home, 'engine', 'linux', 'cua-engine') });
    assert.equal(exit, 0);
  } finally {
    if (before !== undefined) process.env.CUA_LINUX_ENGINE_BIN = before;
  }
  const dir = join(out, 'R4.development-run.pilot');
  assert.equal(readFileSync(join(dir, 'run', 'seen'), 'utf8').trim(), 'part=device engine=installed unset override=unset device=cua-171 label=pilot');
  assert.equal(JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8')).pinned_home, home);
});

test('a pinned step refuses a home with no engine, naming the install, and refuses before anything when the rule refuses', async () => {
  const out = fresh('out');
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: '/' };
  const a = parseGateArgs(['run', 'FB', '--pinned', '/nowhere/home', '--out', out], { arch: 'x64', env: {} });
  await assert.rejects(runStep(a, deps), /no engine at \/nowhere\/home\/engine\/linux\/cua-engine: .*CUA_HOME=\/nowhere\/home node bin\/cua\.mjs install --engine/);
  assert.deepEqual(readdirSync(out), []);
});

// T1's fix wave (the design session's ruling 708): a pinned step's children get the run home as CUA_HOME and the
// installed engine itself, never the check's copy; an R2 step's unproved series are its record

/** A run home with an engine, and a fake pinned rule that stores a copy as candidate.mjs does. */
function pinnedFixture() {
  const home = fresh('home');
  mkdirSync(join(home, 'engine', 'linux'), { recursive: true });
  const engine = join(home, 'engine', 'linux', 'cua-engine');
  writeFileSync(engine, 'x');
  const seen = {};
  const prepare = async ({ source, gate, dir }) => {
    seen.prepared = { source, gate };
    const copy = join(dir, 'cua-engine');
    writeFileSync(copy, 'x');
    seen.copy = copy;
    return { path: copy, record: { gate, sha256: 'ab'.repeat(32) } };
  };
  const pinned = (path) => ({ cua: path, cuaHome: home });
  return { home, engine, seen, prepare, pinned };
}

test("a pinned facade step runs the installed engine itself, with CUA_HOME the run home: the child's environment", async () => {
  const { home, engine, seen, prepare, pinned } = pinnedFixture();
  const out = fresh('out');
  const a = parseGateArgs(['run', 'FB', '--pinned', home, '--out', out], { arch: 'x64', env: {} });
  const privateDisplay = async ({ args, env }) => {
    Object.assign(seen, { args, env });
    return { code: 0, clean: true };
  };
  const exit = await runStep(a, { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: engine, prepare, pinned, privateDisplay });
  assert.equal(exit, 0);
  assert.deepEqual(seen.prepared, { source: engine, gate: 'pinned' }, 'the rule checked the home\'s engine');
  assert.equal(seen.args[seen.args.indexOf('--engine') + 1], engine, 'the installed engine, not the copy');
  assert.notEqual(seen.args[seen.args.indexOf('--engine') + 1], seen.copy);
  assert.equal(seen.env.CUA_HOME, home);
});

test("a pinned suite step: the installed engine, no ENGINE_BIN, CUA_HOME the run home; R2's unproved series in its README and step.json", async () => {
  const { home, engine, prepare, pinned } = pinnedFixture();
  const root = fresh('root');
  mkdirSync(join(root, SUITES_SCRIPT, '..'), { recursive: true });
  writeFileSync(join(root, SUITES_SCRIPT), '#!/bin/bash\necho "engine=$ENGINE ${ENGINE_BIN-unset} home=$CUA_HOME" > "$OUT/seen"\nmkdir -p "$OUT/baseline" && echo "UNPROVED (a declared gap, not a pass; ruling 9): click [-1, 3] ms, bound 1 ms, 40 / 40 samples" > "$OUT/baseline/unproved.txt"\n');
  const out = fresh('out');
  const a = parseGateArgs(['run', 'R2', '--pinned', home, '--out', out], { arch: 'x64', env: {} });
  const exit = await runStep(a, { root, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: engine, prepare, pinned });
  assert.equal(exit, 0);
  const dir = join(out, 'R2.pinned-release');
  assert.equal(readFileSync(join(dir, 'run', 'seen'), 'utf8').trim(), `engine=installed unset home=${home}`);
  const record = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8'));
  assert.deepEqual(record.unproved, ['UNPROVED (a declared gap, not a pass; ruling 9): click [-1, 3] ms, bound 1 ms, 40 / 40 samples']);
  assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /- unproved \(declared gaps, not passes\): 1\n  - UNPROVED \(a declared gap, not a pass; ruling 9\): click/);
});

// ---------------------------------------------------------------------------------------------------------------
// #171 M5, T4's second round: a pilot takes no top-up (ruling 722), and a pilot can run the pinned rule (task 87's
// finding 1): `--pinned <home> --pilot <n>`, a development run on the pinned release, never counted, every record saying so

test('--pinned with --pilot is a development run on the pinned release: the rule runs, labelled apart, never counted', () => {
  const a = parseGateArgs(['run', 'D1', '--pinned', ACC, '--out', '/o', '--pilot', '1'], { arch: 'x64', env: {} });
  assert.deepEqual([a.gate, a.candidate, a.pilot], ['pinned-dev', ACC_ENGINE, 1]);
  assert.throws(() => parseGateArgs(['run', 'D1', '--candidate', '/c', '--out', '/o', '--pilot', '1']), /never a release gate/, 'a candidate pilot still needs --dev');
  assert.equal(parseGateArgs(['run', 'D1', '--pinned', ACC, '--out', '/o', '--dev', '--pilot', '1']).gate, false, '--dev still takes the engine unchecked');
  assert.deepEqual(stepLabel({ gate: 'pinned-dev', pilot: 1 }), { label: 'development run on the pinned release, not acceptance, never counted', slug: 'development-run.pinned.pilot', pilot: true });
  assert.equal(stepDir(stepNamed('D1'), a), '/o/D1.development-run.pinned.pilot');
  assert.match(launchCommand(stepNamed('D1'), a, ROOT), new RegExp(`gate\\.mjs run D1 --pinned ${ACC} --out /o --pilot 1$`));
  assert.match(launchCommand(stepNamed('V3'), a, ROOT), new RegExp(`--blocks 1 --run m5-pdev-V3-pilot --pinned --pilot$`), "the :0 step's printed command too");
  for (const s of STEPS.filter((x) => ['verdict', 'experiment'].includes(x.kind))) {
    const parsed = parseArgs([...stepArgs(s, { paths: a, gate: 'pinned-dev', pilot: 1 }), '--out', '/o']);
    assert.equal(parsed.gate, 'pinned-dev', s.name);
    assert.equal(parsed.pilot, true, s.name);
    assert.equal(parsed.cua, ACC_ENGINE, s.name);
    assert.equal(parsed.run, `m5-pdev-${s.name}-pilot`);
  }
  const env = suiteEnv({ candidate: ACC_ENGINE, dir: '/d', gate: 'pinned-dev', logs: '/tmp/l', pinned: true, device: 'cua-171' });
  assert.deepEqual([env.ENGINE, env.LABEL, env.ENGINE_BIN, env.PINNED_RULE], ['installed', 'pilot', undefined, 'enforce'], 'never counted, the rule enforced in its own homes');
  assert.equal(suiteEnv({ candidate: ACC_ENGINE, dir: '/d', gate: 'pinned', logs: '/tmp/l', pinned: true, device: 'cua-171' }).PINNED_RULE, 'enforce');
  assert.equal(suiteEnv({ candidate: ACC_ENGINE, dir: '/d', gate: false, logs: '/tmp/l', pinned: true, device: 'cua-171' }).PINNED_RULE, undefined, '--pinned --dev: unchecked');
  assert.match(listText(a, ROOT), /^The gate: .*development run on the pinned release, not acceptance, never counted, pilot \(1\)/);
});

test('every pilot step tells the harness it is a pilot; no gate or acceptance step does', () => {
  for (const s of STEPS.filter((x) => ['verdict', 'experiment'].includes(x.kind))) {
    assert.equal(parseArgs([...stepArgs(s, { paths: PATHS, gate: false, pilot: 2 }), '--out', '/o']).pilot, true, s.name);
    for (const gate of [true, 'pinned', false]) assert.equal(parseArgs([...stepArgs(s, { paths: PATHS, gate }), '--out', '/o']).pilot, undefined, `${s.name} ${gate}`);
  }
});

test("a pinned pilot's facade step: the rule runs on the home's engine, the installed engine runs, the record says what it is", async () => {
  const { home, engine, seen, prepare, pinned } = pinnedFixture();
  const out = fresh('out');
  const a = parseGateArgs(['run', 'FB', '--pinned', home, '--out', out, '--pilot', '1'], { arch: 'x64', env: {} });
  const privateDisplay = async ({ args, env }) => {
    Object.assign(seen, { args, env });
    return { code: 0, clean: true };
  };
  const exit = await runStep(a, { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: engine, prepare, pinned, privateDisplay });
  assert.equal(exit, 0);
  assert.deepEqual(seen.prepared, { source: engine, gate: 'pinned-dev' }, 'the pinned rule, inside the step');
  assert.equal(seen.args[seen.args.indexOf('--engine') + 1], engine, 'the installed engine, not the copy');
  const dir = join(out, 'FB.development-run.pinned.pilot');
  const record = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8'));
  assert.equal(record.label, 'development run on the pinned release, not acceptance, never counted');
  assert.equal(record.pilot, true);
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  assert.match(readme, /^# FB \(development run on the pinned release, not acceptance, never counted, pilot\)/);
  assert.doesNotMatch(readme, /acceptance on the pinned release|release gate/, 'never read as acceptance or a gate');
  assert.equal(readFileSync(join(dir, 'stdout.log'), 'utf8').split('\n')[0], 'development run on the pinned release, not acceptance, never counted');
});

test("a pilot step's record lists what it left unjudged, from the harness's end row or summary row, and from R2's list", async () => {
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const rows = (dir, row) => {
    mkdirSync(join(dir, 'run'), { recursive: true });
    writeFileSync(join(dir, 'run', 'results.jsonl'), `${JSON.stringify({ run: 'r', kind: 'meta' })}\n${JSON.stringify(row)}\n`);
  };
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate };
  // the harness writes its rows; the display wrapper's stand-in writes the row the run would end with
  const a = parseGateArgs(['run', 'D1', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']);
  const exit = await runStep(a, { ...deps, privateDisplay: async ({ dir }) => {
    rows(dir, { run: 'r', kind: 'experiment-summary', complete: true, failed: [], unjudged: ['chrome canvas: cua speed unjudged (a pilot takes no top-up)'] });
    return { code: 0, clean: true };
  } });
  assert.equal(exit, 0);
  const dir = join(out, 'D1.development-run.pilot');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8')).unjudged, ['chrome canvas: cua speed unjudged (a pilot takes no top-up)']);
  assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /- unjudged \(a pilot takes no top-up; not passes\): 1\n  - chrome canvas: cua speed unjudged/);
  const v = parseGateArgs(['run', 'FB', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']);
  await runStep(v, { ...deps, privateDisplay: async ({ dir: d }) => {
    rows(d, { run: 'r', kind: 'end', pass: true, failed: [], unjudged: ['chrome-input move cua'] });
    return { code: 0, clean: true };
  } });
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'FB.development-run.pilot', 'step.json'), 'utf8')).unjudged, ['chrome-input move cua']);
  // R2's pilot: the suites runner lists the series only a top-up could decide, and takes none
  const root = fresh('root');
  mkdirSync(join(root, SUITES_SCRIPT, '..'), { recursive: true });
  writeFileSync(join(root, SUITES_SCRIPT), '#!/bin/bash\nmkdir -p "$OUT/baseline" && echo "UNJUDGED (a pilot takes no top-up; not a pass): click" > "$OUT/baseline/unjudged.txt"\n');
  await runStep(parseGateArgs(['run', 'R2', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']), { ...deps, root });
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'R2.development-run.pilot', 'step.json'), 'utf8')).unjudged, ['UNJUDGED (a pilot takes no top-up; not a pass): click']);
  const text = readFileSync(new URL(`../../${SUITES_SCRIPT}`, import.meta.url), 'utf8');
  assert.match(text, /if \[ "\$c" -ne 0 \] && \[ -n "\$need" \] && \[ "\$LABEL" = pilot \]; then\n(.*\n){1,3}\s+exit 0\n\s+fi\n\s+if \[ "\$c" -ne 0 \] && \[ -n "\$need" \]; then\n\s+log "top-up for/, "a pilot's R2 ends before its top-up");
});

// #171 M5, T4's second round (rulings 721, 724): the end check runs where it always runs, after every step whatever
// ended the step's process, and its findings are the step's all-clear record: the scratch a step left, and every other
// run's, each with its session buses, named and left alone

test("every step's record carries the end check, made after its process ended however it ended: what it left, what others left", async () => {
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const root = fresh('tmp');
  const earlier = join(root, 'cua171-run-AdXsUJ');
  mkdirSync(earlier);
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate, leftovers: { roots: [root], proc: fresh('proc') } };
  // the step's harness died past its cleanup: its scratch stays, and so does another run's (one the start check let be,
  // its own test's: here a check that refuses nothing, as when that run had been running beside it under no lock)
  const a = parseGateArgs(['run', 'D2', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']);
  const exit = await runStep(a, { ...deps, start: () => ({ refused: [] }), privateDisplay: async () => {
    mkdirSync(join(root, 'cua171-run-7nTGZK'));
    return { code: null, signal: 'SIGKILL', clean: true };
  } });
  assert.equal(exit, 1);
  const dir = join(out, 'D2.development-run.pilot');
  const record = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8'));
  assert.deepEqual(record.end_check.left_by_step.map((d) => d.dir), [join(root, 'cua171-run-7nTGZK')]);
  assert.deepEqual(record.end_check.foreign.map((d) => d.dir), [earlier]);
  assert.equal(record.end_check.clear, false);
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  assert.match(readme, /- end check \(findings, left alone\): 2\n  - left by this step: .*cua171-run-7nTGZK.*\n  - a cua171-run-\* directory not this run's, left alone: .*cua171-run-AdXsUJ/);
  assert.equal(existsSync(earlier), true, 'named, never removed');
  // a step that left nothing, with nothing else there: its record says the all-clear
  rmSync(join(root, 'cua171-run-7nTGZK'), { recursive: true });
  rmSync(earlier, { recursive: true });
  const b = parseGateArgs(['run', 'D4', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']);
  await runStep(b, { ...deps, privateDisplay: async () => ({ code: 0, clean: true }) });
  const clear = JSON.parse(readFileSync(join(out, 'D4.development-run.pilot', 'step.json'), 'utf8')).end_check;
  assert.equal(clear.clear, true);
  assert.match(readFileSync(join(out, 'D4.development-run.pilot', 'README.md'), 'utf8'), /- end check: clear \(no cua171-run-\* directory or session bus of one\)/);
});

test('`gate.mjs leftovers` runs the end check on its own, for a :0 sitting\'s all-clear', () => {
  assert.equal(parseGateArgs(['leftovers']).mode, 'leftovers');
  const { status, stdout } = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/linux-engine-gate/gate.mjs', import.meta.url)), 'leftovers'], { encoding: 'utf8', env: { ...process.env, TMPDIR: fresh('tmp') } });
  assert.ok([0, 1].includes(status), stdout);
  assert.match(stdout, /^end check: (clear|\d+ findings?, left alone)/);
});

// #171 M5, T4's second round (task 87's finding 2, ruling 728): engine-stop's `cua serve` on the pinned release is a gate
// step of its own, so the frozen list backs the Decision Log's claim that it selects the run home's installed engine

test("ES runs engine-stop's drain lane through cua serve on every production path and case, on a private server of its own", () => {
  const es = stepNamed('ES');
  assert.deepEqual([es.kind, es.display, es.load], ['experiment', 'own', 'idle']);
  assert.ok(es.minutes <= MAX_STEP_MINUTES);
  const names = STEPS.map((s) => s.name);
  assert.equal(names.indexOf('ES'), names.indexOf('F2') + 1, "beside T7 revised's stops, the private idle steps' own");
  const parsed = parseArgs([...stepArgs(es, { paths: PATHS, gate: true }), '--out', '/o']);
  assert.deepEqual([parsed.experiment, parsed.lanes, parsed.paths, parsed.cases, parsed.controlRoot], ['engine-stop', ['drain'], undefined, undefined, undefined], 'every path and case, the drain lane alone: no control checkout');
  assert.equal(parsed.samplesTrials, undefined, 'its 10 runs a cell');
  const a = parseGateArgs(['print', 'ES', '--pinned', ACC, '--out', '/o'], { arch: 'x64', env: {} });
  const pinned = parseArgs([...stepArgs(es, { paths: a, gate: 'pinned' }), '--out', '/o']);
  assert.deepEqual([pinned.gate, pinned.cua, pinned.run], ['pinned', ACC_ENGINE, 'pinned-ES']);
  assert.equal(parseArgs([...stepArgs(es, { paths: a, gate: 'pinned-dev', pilot: 1 }), '--out', '/o']).samplesTrials, 1, 'its pilot: one run a cell');
  assert.match(listText(a, ROOT), /^ES\s+\d+ min\s+own\s+idle\s+.*cua serve.*\n\s+.*gate\.mjs run ES --pinned /m);
  assert.match(launchCommand(es, a, ROOT), new RegExp(`gate\\.mjs run ES --pinned ${ACC} --out /o$`));
});

test('engine-stop needs a control checkout only for its kill lane', () => {
  assert.equal(controlRootRefusal({ lanes: ['drain'] }), null);
  assert.match(controlRootRefusal({ lanes: ['drain', 'kill'] }), /--control-root names the checkout whose REPL host is the control/);
  assert.match(controlRootRefusal({}), /--control-root/, 'both lanes by default');
  assert.equal(controlRootRefusal({ controlRoot: '/c' }), null);
});

// ruling 730, part (a): a step's unclean end (what its run left on its own side) is named in its record and README and
// listed by the gate's summary, and a step starts only once the start check found nothing (fix wave 3: it removes nothing)

test("a step refuses to start while the start check refuses what earlier runs left, naming it, and leaves it there", async () => {
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const root = fresh('tmp');
  mkdirSync(join(root, 'cua171-run-NoMark'), { mode: 0o700 });
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate, leftovers: { roots: [root], proc: fresh('proc') }, privateDisplay: async () => ({ code: 0, clean: true }) };
  const a = parseGateArgs(['run', 'D2', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']);
  await assert.rejects(runStep(a, deps), (e) => e instanceof GateRefused && /the start check refuses to run: .*cua171-run-NoMark: .*no marker of the harness's/.test(e.message));
  assert.deepEqual(readdirSync(out), [], 'nothing of the step was written');
  assert.equal(existsSync(join(root, 'cua171-run-NoMark')), true, 'the leftover is left as it was');
});

test("a step's record names its unclean end, from its run's end row and from what the step left; the gate's summary lists every one", async () => {
  const candidate = join(fresh('c'), 'cua-engine');
  writeFileSync(candidate, 'x');
  const out = fresh('out');
  const root = fresh('tmp');
  const deps = { root: ROOT, git: cleanGit(), held: () => false, loadRunning: () => false, xprobe: candidate, leftovers: { roots: [root], proc: fresh('proc') } };
  const rows = (dir, row) => {
    mkdirSync(join(dir, 'run'), { recursive: true });
    writeFileSync(join(dir, 'run', 'results.jsonl'), `${JSON.stringify(row)}\n`);
  };
  await runStep(parseGateArgs(['run', 'D2', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']), { ...deps, privateDisplay: async ({ dir }) => {
    rows(dir, { run: 'r', kind: 'experiment-summary', complete: true, failed: [], desktop: { unclean: ['its Chrome left 1 process running'] } });
    mkdirSync(join(root, 'cua171-run-Left01'));
    return { code: 0, clean: true };
  } });
  const record = JSON.parse(readFileSync(join(out, 'D2.development-run.pilot', 'step.json'), 'utf8'));
  assert.equal(record.exit, 0, 'never a verdict failure');
  assert.deepEqual(record.unclean, ['its Chrome left 1 process running', `its scratch left behind: ${join(root, 'cua171-run-Left01')}`]);
  assert.match(readFileSync(join(out, 'D2.development-run.pilot', 'README.md'), 'utf8'), /- unclean end \(the run's own side, not a verdict failure\): 2\n  - its Chrome left 1 process running\n/);
  rmSync(join(root, 'cua171-run-Left01'), { recursive: true });
  await runStep(parseGateArgs(['run', 'D4', '--candidate', candidate, '--out', out, '--dev', '--pilot', '1']), { ...deps, privateDisplay: async () => ({ code: 0, clean: true }) });
  const summary = gateSummary(out);
  assert.match(summary, /^\| step \| label \| exit \| unclean end \| :0 all-clear \|/m);
  assert.match(summary, /^\| D2 \| development run, not a release gate \(pilot\) \| 0 \| \*\*2\*\*: its Chrome left 1 process running; its scratch left behind: .*cua171-run-Left01 \| – \|$/m);
  assert.match(summary, /^\| D4 \| development run, not a release gate \(pilot\) \| 0 \| clean \| – \|$/m);
  assert.match(summary, /Unclean ends: 1 of 2 steps/);
});

// ---------------------------------------------------------------------------------------------------------------
// #171 M5, T4's arm64 round, items (b) and (d): a `:0` step's command is refused before launch when the sitting's guard
// would stop it mid-step for what the command alone decides. (b) The arm64 pilot's V1 (2026-11-18 04:35Z): the pinned
// pilot's run name `m5-pinned-dev-V1-pilot` made scenes.mjs `scratchRoot` put the run's scratch under /tmp, outside the
// TMPDIR run71.sh gives the run, so the run's Chrome lived outside it and wrap71 stopped the sitting. (d) Its decoy
// buses under `<step dir>/decoy/` could not bind (AF_UNIX path too long) under a deep out root, and wrap71 ran on.

test("every :0 step's run name keeps the run's scratch under run71's TMPDIR, the pinned pilot's shortened", () => {
  const template = readFileSync(new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts/run71.sh', import.meta.url), 'utf8').match(/mktemp -d (\S+)\)/)[1];
  assert.equal(RUN71_TMPDIR, template, "the TMPDIR is run71.sh's own template, whose length every one has");
  for (const s of STEPS.filter((x) => x.display === ':0')) {
    for (const [gate, pilot] of [[true, null], [false, null], [false, 2], ['pinned', null], ['pinned-dev', null], ['pinned-dev', 2]]) {
      const run = runName(s, { gate, pilot });
      assert.equal(scratchRoot(run, RUN71_TMPDIR), RUN71_TMPDIR, `${s.name} ${gate} ${pilot}: ${run}`);
      assert.deepEqual(zeroStepProblems({ run, dir: `/Users/new/.local/share/cua-171/m5/x64/out/${s.name}.development-run.pinned.pilot` }), []);
    }
  }
  assert.equal(runName(stepNamed('V1'), { gate: 'pinned-dev', pilot: 2 }), 'm5-pdev-V1-pilot');
  assert.equal(runName(stepNamed('V1'), { gate: 'pinned-dev', pilot: null }), 'm5-pinned-dev-V1', 'only the pilot is shortened');
});

test('a :0 command whose scratch would leave its TMPDIR, or whose decoy bus could not bind, is refused before anything is written', () => {
  // (b) the pilot's name before the fix: the scratch falls back to /tmp
  assert.match(zeroStepProblems({ run: 'm5-pinned-dev-V1-pilot', dir: '/o/V1' }).join('\n'), /scratch would leave the TMPDIR run71\.sh gives it/);
  // (d) every decoy path at most 107 bytes: 108 is sun_path's size, and a client that adds its NUL could not connect
  const dirFor = (bytes) => `/${'d'.repeat(bytes - '/decoy/session.sock'.length - 1)}`;
  assert.equal(`${dirFor(107)}/decoy/session.sock`.length, 107);
  assert.deepEqual(zeroStepProblems({ run: 'm5-gate-V1', dir: dirFor(107) }), []);
  assert.match(zeroStepProblems({ run: 'm5-gate-V1', dir: dirFor(108) }).join('\n'), /decoy bus .*session\.sock is 108 bytes/);
  // a path's bytes, not its characters
  assert.match(zeroStepProblems({ run: 'm5-gate-V1', dir: `${dirFor(106)}é` }).join('\n'), /session\.sock is 108 bytes/);
  // the printed command: refused, nothing written, under an out root as deep as the arm64 pilot's
  const deep = join(fresh('deep'), 'm5/pilot-arm64/out-zero-r1/and-deeper-than-that-for-the-test-of-the-decoys');
  const a = parseGateArgs(['print', 'V5', '--candidate', PATHS.candidate, '--out', deep, '--dev']);
  assert.throws(() => printStep(a, { root: ROOT, git: cleanGit() }), (e) => e instanceof GateRefused && /decoy bus/.test(e.message));
  assert.equal(existsSync(deep), false, 'the refused print wrote nothing');
  // a private step takes no such check
  assert.doesNotThrow(() => printStep(parseGateArgs(['print', 'D1', '--candidate', PATHS.candidate, '--out', deep, '--dev']), { root: ROOT, git: cleanGit() }));
});

// Fix wave 1, minor: run71.sh takes the step directory through `realpath -m`, so the decoys lie under the resolved path.
// A short symlink to a long out root passes a lexical check and is then refused by the wrapper mid-sitting: print reads
// the path run71 will use.
test("a :0 step's decoy paths are measured where run71.sh puts them: through the out root's symlinks", async () => {
  const { symlinkSync } = await import('node:fs');
  const base = fresh('link');
  const long = join(base, 'a-long-out-root-for-the-decoys-of-the-sitting-to-pass-their-limit-after-resolution');
  mkdirSync(long, { recursive: true });
  const short = join(base, 's');
  symlinkSync(long, short);
  const a = parseGateArgs(['print', 'V5', '--candidate', PATHS.candidate, '--out', short, '--dev']);
  assert.ok(Buffer.byteLength(join(short, 'V5.development-run', 'decoy', 'session.sock')) <= 107, 'the lexical path fits');
  assert.throws(() => printStep(a, { root: ROOT, git: cleanGit() }), (e) => e instanceof GateRefused && /decoy bus/.test(e.message) && e.message.includes(long));
});

// The hold canary and its regression cells in every release gate (task 117; rulings 897.3, 898.4, 899, 900): K1 on the
// gate's Chrome and K2 on the current stable one run V5's in-front short drop and its select control on a private
// display under the gate's ballast, every cua engine sandboxed as the service runs it; K3 the late-started drops, also
// sandboxed, judged by holdRegressionVerdict.
test('the hold canary runs on both Chromes, sandboxed, beside its regression cells; the current stable one is required', async () => {
  const [k1, k2, k3] = ['K1', 'K2', 'K3'].map(stepNamed);
  for (const k of [k1, k2]) {
    assert.deepEqual([k.kind, k.display, k.scenes, verdictOps(k)], ['canary', 'private', ['device-chrome-dnd'], ['chrome_dnd_short_in_front_shared', 'chrome_select_nudged_shared']]);
    const args = stepArgs(k, { paths: PATHS, gate: true });
    assert.ok(args.includes('--engine-sandbox') && args.includes('--ballast'), k.name);
    assert.equal(parseArgs([...args, '--out', '/o']).engineSandbox, true, k.name);
  }
  assert.deepEqual([k1.chrome, k2.chrome], ['installed', 'current-stable']);
  const parsed = parseArgs([...stepArgs(k3, { paths: PATHS, gate: true }), '--out', '/o']);
  assert.deepEqual([parsed.plan, parsed.engineSandbox], ['hold-regression', true]);
  assert.ok(verdicts.every((s) => !stepArgs(s, { paths: PATHS, gate: true }).includes('--engine-sandbox')), "V1-V5 keep their engines as they ran");
  const { currentStableChrome } = await import('../../scripts/linux-engine-gate/gate.mjs');
  const root = mkdtempSync(join(tmpdir(), 'cua171-chrome-stable-'));
  try {
    assert.throws(() => currentStableChrome(root), GateRefused, 'no current stable Chrome: refused');
    writeFileSync(join(root, 'current'), '158.0.8127.36-1\n');
    assert.throws(() => currentStableChrome(root), GateRefused, 'its wrapper missing: refused');
    mkdirSync(join(root, '158.0.8127.36-1', 'bin'), { recursive: true });
    writeFileSync(join(root, '158.0.8127.36-1', 'bin', 'google-chrome'), '#!/bin/sh\n');
    assert.equal(currentStableChrome(root), join(root, '158.0.8127.36-1', 'bin'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The re-review of wave 3, I5: a canary step proves itself beside its harness's verdicts: both cells carry the canary's
// record, and every browser the run's Chrome ran, read from its running process, is the Chrome the step meant (on the
// current stable one, named to the harness outright, its version and its own tree).
test('a canary step runs the Chrome it means and passes only with its evidence there and that Chrome read running', async () => {
  const { canaryCheck, intendedChrome } = await import('../../scripts/linux-engine-gate/gate.mjs');
  const root = mkdtempSync(join(tmpdir(), 'cua171-chrome-stable-'));
  try {
    writeFileSync(join(root, 'current'), '158.0.8127.36-1\n');
    mkdirSync(join(root, '158.0.8127.36-1', 'bin'), { recursive: true });
    writeFileSync(join(root, '158.0.8127.36-1', 'bin', 'google-chrome'), '#!/bin/sh\n');
    const k2 = intendedChrome(stepNamed('K2'), { chromeStable: root, installed: 'Google Chrome 156.0.8078.73' });
    assert.deepEqual(k2, { command: join(root, '158.0.8127.36-1', 'bin', 'google-chrome'), version: '158.0.8127.36', under: `${join(root, '158.0.8127.36-1')}/` });
    const k1 = intendedChrome(stepNamed('K1'), { chromeStable: root, installed: 'Google Chrome 156.0.8078.73 ' });
    assert.deepEqual(k1, { command: null, version: '156.0.8078.73', under: null });
    const verdicts = ['chrome_dnd_short_in_front_shared', 'chrome_select_nudged_shared'].map((op) => ({ kind: 'verdict', op, candidate: 'cua', verdict: 'pass', hold_canary: { kind: 'x' } }));
    const exe = join(root, '158.0.8127.36-1', 'root', 'opt', 'google', 'chrome', 'chrome');
    const end = (browsers) => ({ kind: 'end', desktop: { chrome: { browsers } } });
    const ran158 = [{ pid: 7, exe, version: 'Google Chrome 158.0.8127.36' }];
    assert.deepEqual(canaryCheck([...verdicts, end(ran158)], k2), { pass: true, reasons: [], browsers: ran158 });
    // the installed Chrome ran instead of the named one
    const ran156 = [{ pid: 7, exe: '/opt/google/chrome/chrome', version: 'Google Chrome 156.0.8078.73' }];
    assert.match(canaryCheck([...verdicts, end(ran156)], k2).reasons.join('; '), /ran \/opt\/google\/chrome\/chrome at Google Chrome 156.0.8078.73, not Chrome 158.0.8127.36/);
    assert.equal(canaryCheck([...verdicts, end(ran156)], k1).pass, true, 'K1 on the gate\'s Chrome');
    // a 158 outside the named tree, no browser read, a verdict with no canary record, a cell with no verdict
    assert.match(canaryCheck([...verdicts, end([{ ...ran158[0], exe: '/opt/other/chrome' }])], k2).reasons.join('; '), /outside/);
    assert.match(canaryCheck([...verdicts, end([])], k2).reasons.join('; '), /no browser process of the run's Chrome was read/);
    assert.match(canaryCheck([{ ...verdicts[0], hold_canary: undefined }, verdicts[1], end(ran158)], k2).reasons.join('; '), /chrome_dnd_short_in_front_shared's verdict carries no hold canary/);
    assert.match(canaryCheck([verdicts[0], end(ran158)], k2).reasons.join('; '), /no verdict for chrome_select_nudged_shared/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the hold's regression cells fail on any drop that did not land inside B, any hold not the fixed one, and any Chrome not identified", async () => {
  const { HOLD_REGRESSION_CELLS, dropSignalsVerdict, holdRegressionVerdict } = await import('../../scripts/linux-engine-diff/drop-signals-judge.mjs');
  const specs = [{ lane: 'cua', cell: 'dragstart-150', n: 2 }, { lane: 'cua', cell: 'dragstart-400', n: 2 }];
  const required = specs;
  const drag = (cell, i, over = {}) => ({ kind: 'drop-signal', lane: 'cua', cell, i, outcome: { started: true, landed: true }, hold: { taken: true, adaptive: { way: 'fixed', source: { identified: true } } }, ...over });
  const good = ['dragstart-150', 'dragstart-400'].flatMap((cell) => [drag(cell, 0), drag(cell, 1)]);
  assert.deepEqual(holdRegressionVerdict(good, { specs, required }).failed, []);
  const lost = [...good.slice(0, 3), drag('dragstart-400', 1, { outcome: { started: true, landed: false }, hold: { taken: false, adaptive: { way: 'fixed', source: { identified: true } } } })];
  assert.deepEqual(holdRegressionVerdict(lost, { specs, required }).failed, ['dragstart-400: not landed on 1 of 2 (0/1)', 'dragstart-400: no take seen inside the hold on 1 of 2 (0/1)']);
  const unknown = [...good.slice(0, 3), drag('dragstart-400', 1, { hold: { taken: true, adaptive: { way: 'fixed', source: { identified: false } } } })];
  assert.deepEqual(holdRegressionVerdict(unknown, { specs, required }).failed, ['dragstart-400: Chrome not identified as a browser on 1 of 2 (0/1)']);
  assert.deepEqual(holdRegressionVerdict(good.slice(0, 3), { specs, required }).failed, ['dragstart-400: 1 of its 2 drags ran']);
  // the re-review of wave 4, I2: the required cells and counts are the plan's own, whatever the run's rows say. A run
  // with no manifest, or one whose manifest and rows lack a cell, fails; and by default each cell needs its 10 drags
  assert.deepEqual(HOLD_REGRESSION_CELLS, [['cua', 'dragstart-150', 10], ['cua', 'dragstart-400', 10]]);
  assert.deepEqual(holdRegressionVerdict([], { specs: null, required }).failed, ["the run's manifest (its drop-signal-scene row) is missing: which cells ran is unknown", 'dragstart-150: 0 of its 2 drags ran', 'dragstart-400: 0 of its 2 drags ran']);
  assert.deepEqual(holdRegressionVerdict(good.slice(0, 2), { specs: specs.slice(0, 1), required }).failed, ["dragstart-400: not in the run's manifest with its 2 drags", 'dragstart-400: 0 of its 2 drags ran']);
  assert.match(holdRegressionVerdict(good, { specs }).failed.join('; '), /dragstart-150: not in the run's manifest with its 10 drags; dragstart-150: 2 of its 10 drags ran/);
  const { PLANS } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  assert.deepEqual(PLANS['hold-regression'], HOLD_REGRESSION_CELLS, "the plan runs the judge's cells");
  assert.match(dropSignalsVerdict({ plan: 'hold-regression', families: ['chrome'] }, good).failed.join('; '), /manifest .* is missing/, 'rows with no scene row');
});
