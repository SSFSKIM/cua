// The mini's run rules (scripts/mini-rules.mjs) against doubles of ssh, gh and scp: every missing observation stops,
// a non-Terminal frontmost application stops at once, contention waits, a failed item stops the sequence after the
// frontmost check, incomplete evidence is never skipped, and remote evidence is removed only after a verified copy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observe, classify, gate, frontAfter, runState, sequence, verifyTz, verifyAcceptance, Stop, TERMINAL} from '../scripts/mini-rules.mjs';

// The device and GitHub as one double. `state` drives the answers; `calls` records them.
function world(over = {}) {
  const state = {front: TERMINAL, busy: 'false', workers: 0, load: '0.80', runs: {queued: [], in_progress: []}, jobs: {}, fail: new Set(), tz: {}, copies: {}, ...over};
  const calls = [];
  const exec = (cmd, args, options) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    const failing = [...state.fail].find(f => line.includes(f));
    if (failing) throw new Error(`double: ${failing} failed`);
    if (cmd === 'ssh' && line.includes('lsappinfo')) return state.front === null ? 'garbage\n' : `[ NULL ] ASN:0x0: (in front)\n    bundleID="${typeof state.front === 'function' ? state.front() : state.front}"\n`;
    if (cmd === 'gh' && line.includes('/runners')) return `${state.busy}\n`;
    // GitHub's paginated lists: 100 a page, with total_count (state.totals overrides it to model a truncated list).
    const page = Number(/[?&]page=(\d+)/.exec(line)?.[1] ?? 1), slice = list => list.slice((page - 1) * 100, page * 100);
    const runs = /runs\?status=(\w+)/.exec(line);
    if (cmd === 'gh' && runs) { const all = state.runs[runs[1]]; return JSON.stringify({total_count: state.totals?.[runs[1]] ?? all.length, workflow_runs: slice(all)}); }
    const jobs = /runs\/(\d+)\/jobs/.exec(line);
    if (cmd === 'gh' && jobs) { const all = state.jobs[jobs[1]] ?? []; return JSON.stringify({total_count: state.totals?.[`jobs${jobs[1]}`] ?? all.length, jobs: slice(all)}); }
    if (cmd === 'ssh' && line.includes('Runner.Worker')) return `pgrep_status=${state.pgrepStatus ?? (state.workers > 0 ? 0 : 1)}\nworkers=${state.workers}\n 19:00  up 8 days, 2 users, load averages: ${state.load} 1.0 1.0\n`;
    if (cmd === 'ssh' && line.includes('tz-probe.mjs')) { const role = /--role (\w+)/.exec(line)[1]; return state.tz[role] ?? `TZ 0 /tmp/cua-115-tz.R${role}\n`; }
    if (cmd === 'scp') { const copy = state.copies[args.at(-2)] ?? state.copies.default; if (copy) copy(args); return ''; }
    if (cmd === 'ssh' && line.includes('rm -rf')) return '';
    if (cmd === 'ssh' && line.includes('bash -s')) return state.accept ?? '';
    throw new Error(`double: unexpected ${line}`);
  };
  return {state, calls, exec};
}
const quiet = () => {};
const noSleep = async () => {};

test('every observation must be present: a failed or unparseable answer stops, never reads as idle', () => {
  for (const fail of ['lsappinfo', '/runners', 'status=queued', 'status=in_progress', 'Runner.Worker']) {
    const {exec} = world({fail: new Set([fail])});
    assert.throws(() => observe({exec}), error => error instanceof Stop && /missing observation/.test(error.message), fail);
  }
  assert.throws(() => observe({exec: world({front: null}).exec}), /missing observation: frontmost application/);
  assert.throws(() => observe({exec: world({busy: ''}).exec}), /missing observation: runner state/);
  const jobsFail = world({runs: {queued: [{id: 7}], in_progress: []}, fail: new Set(['runs/7/jobs'])});
  assert.throws(() => observe(jobsFail), /missing observation: jobs of run 7/);
  const {exec} = world({runs: {queued: [], in_progress: [{id: 9}]}, jobs: {9: [{status: 'queued', labels: ['self-hosted', 'macOS']}, {status: 'queued', labels: ['ubuntu-24.04']}, {status: 'in_progress', labels: ['macOS']}]}});
  assert.deepEqual(observe({exec}), {front: TERMINAL, busy: false, workers: 0, queued: 1, load: 0.8});
});

test('inner boundaries: lists are read to their total across pages, a truncated list or a failed pgrep is a missing observation', () => {
  // 151 queued runs across two pages, the last one carrying a waiting macOS job: counted, not truncated to idle.
  const many = Array.from({length: 151}, (_, i) => ({id: i + 1}));
  const paged = world({runs: {queued: many, in_progress: []}, jobs: {151: [{status: 'queued', labels: ['macOS']}]}});
  assert.equal(observe(paged).queued, 1);
  assert.ok(paged.calls.some(c => c.includes('status=queued&per_page=100&page=2')));
  // total_count 51 with only 50 records delivered: truncated.
  const truncated = world({runs: {queued: Array.from({length: 50}, (_, i) => ({id: i + 1})), in_progress: []}, totals: {queued: 51}});
  assert.throws(() => observe(truncated), /missing observation: queued workflow runs \(truncated: 50 of 51\)/);
  // A job list that claims more than it holds, and one without a total.
  const jobsShort = world({runs: {queued: [{id: 4}], in_progress: []}, jobs: {4: [{status: 'queued', labels: ['ubuntu']}]}, totals: {jobs4: 2}});
  assert.throws(() => observe(jobsShort), /missing observation: jobs of run 4 \(truncated/);
  const noTotal = world();
  const raw = noTotal.exec;
  assert.throws(() => observe({exec: (cmd, args) => (args.some(a => a.includes('status=in_progress')) ? JSON.stringify({workflow_runs: []}) : raw(cmd, args))}), /in_progress workflow runs \(no workflow_runs or total_count\)/);
  // pgrep: 1 is no match (zero workers), 0 with a count is workers, anything else is a failed observation.
  assert.equal(observe(world({workers: 0, pgrepStatus: 1})).workers, 0);
  assert.equal(observe(world({workers: 2, pgrepStatus: 0})).workers, 2);
  assert.throws(() => observe(world({workers: 0, pgrepStatus: 2})), /missing observation: mini workers \(pgrep exited 2\)/);
  assert.throws(() => observe(world({workers: 0, pgrepStatus: 0})), /status and count disagree/);
});

test('classification: with the runner idle any non-Terminal frontmost application is a stop; CI and load are contention', () => {
  const idle = {front: TERMINAL, busy: false, workers: 0, queued: 0, load: 1.2};
  assert.equal(classify(idle).state, 'idle');
  for (const front of ['com.apple.UserNotificationCenter', 'com.apple.TextEdit', 'com.google.Chrome']) assert.equal(classify({...idle, front}).state, 'stop');
  for (const o of [{busy: true}, {workers: 1}, {queued: 2}, {load: 2}, {load: NaN}]) assert.equal(classify({...idle, ...o}).state, 'contention');
});

test('the gate stops at once on a dialog, waits through contention, and needs two idle readings', async () => {
  const dialog = world({front: 'com.apple.UserNotificationCenter'});
  const slept = [];
  await assert.rejects(gate('x', {exec: dialog.exec, sleep: async ms => slept.push(ms), log: quiet}), /frontmost application is com.apple.UserNotificationCenter/);
  assert.deepEqual(slept, [], 'no retry under a dialog');
  // Busy twice, then idle on two readings.
  const busy = world();
  let looks = 0;
  busy.state.busy = 'true';
  const sleep = async () => { if (++looks === 2) busy.state.busy = 'false'; };
  await gate('y', {exec: busy.exec, sleep, log: quiet});
  assert.ok(busy.calls.filter(c => c.includes('/runners')).length >= 3);
  // A dialog that appears on the second reading stops too.
  let reading = 0;
  const late = world({front: () => (++reading > 1 ? 'com.apple.SecurityAgent' : TERMINAL)});
  await assert.rejects(gate('z', {exec: late.exec, sleep: noSleep, log: quiet}), /SecurityAgent/);
  // Contention that never clears stops after maxWaits.
  const stuck = world({load: '3.5'});
  await assert.rejects(gate('w', {exec: stuck.exec, sleep: noSleep, log: quiet, maxWaits: 2}), /did not become idle/);
});

test('after an item the frontmost application must be Terminal; a failed read is a stop', () => {
  assert.doesNotThrow(() => frontAfter('x', {exec: world().exec, log: quiet}));
  assert.throws(() => frontAfter('x', {exec: world({front: 'com.apple.coreservices.uiagent'}).exec, log: quiet}), /uiagent/);
  assert.throws(() => frontAfter('x', {exec: world({fail: new Set(['lsappinfo'])}).exec, log: quiet}), /missing observation/);
});

function evidenceDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mini-rules-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
const completeMeta = {complete: true, measurement: {experiment: '115-m0'}, preparationCleanup: {removed: true}};
const writeRun = (dir, meta) => { mkdirSync(dir, {recursive: true}); if (meta) writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta)); };

test('a run directory is skipped only when it holds a complete, cleaned-up run of this sitting', t => {
  const dir = evidenceDir(t);
  assert.equal(runState(join(dir, 'none')), 'absent');
  writeRun(join(dir, 'ok'), completeMeta);
  assert.equal(runState(join(dir, 'ok')), 'complete');
  for (const [name, meta] of [['partial', null], ['incomplete', {...completeMeta, complete: false}], ['foreign', {...completeMeta, measurement: {experiment: 'other'}}], ['dirty', {...completeMeta, preparationCleanup: {removed: false}}]]) {
    writeRun(join(dir, name), meta);
    assert.equal(runState(join(dir, name)), 'incomplete', name);
  }
});

test('the sequence stops after a failed native run (front checked first) and never runs over an incomplete run', async t => {
  const evidence = evidenceDir(t);
  writeRun(join(evidence, 'mini-vendor-computer', 'run-1'), completeMeta);
  const {exec, calls} = world();
  const runs = [];
  const run = (_cmd, args) => { runs.push(args.at(-1)); return 1; };
  const log = [];
  await assert.rejects(sequence(['vendor', 'browser'], {exec, run, log: l => log.push(l), evidence, now: Date.now, sleep: noSleep}), /vendor run-2 failed \(exit 1\)/);
  assert.deepEqual(runs, [join(evidence, 'mini-vendor-computer', 'run-2')], 'run-1 skipped, run-2 ran and failed, nothing after');
  assert.ok(log.some(l => /front after vendor run-2: com.apple.Terminal/.test(l)));
  assert.ok(calls.at(-1).includes('lsappinfo') || log.some(l => /front at the stop/.test(l)));
  // An existing incomplete run stops before any gate or run.
  writeRun(join(evidence, 'mini-cua-browser', 'run-1'), {...completeMeta, complete: false});
  const second = world(), ran = [];
  await assert.rejects(sequence(['browser'], {exec: second.exec, run: (_c, a) => { ran.push(a); return 0; }, log: quiet, evidence, now: Date.now, sleep: noSleep}), /incomplete or foreign run/);
  assert.deepEqual(ran, []);
});

test('a native run that exits 0 without a complete run record stops the sequence', async t => {
  const evidence = evidenceDir(t);
  const {exec} = world();
  const run = (_cmd, args) => { writeRun(args.at(-1), {...completeMeta, preparationCleanup: {removed: false}}); return 0; };
  await assert.rejects(sequence(['vendor'], {exec, run, log: quiet, evidence, now: Date.now, sleep: noSleep}), /not a complete, cleaned-up run/);
});

const tzResult = (role, started = new Date().toISOString(), runs = 80, home = {class: 'real'}) => JSON.stringify({role, runs, boundMs: 15000, started, home,
  counts: {completed: runs, hung: 0, launcherFailure: 0}, results: Array.from({length: runs}, (_, i) => ({run: i + 1, outcome: 'completed'}))});

test('tz: the remote result is removed only after its copy verifies; a failed or stale copy keeps it on the mini', async t => {
  const evidence = evidenceDir(t);
  const target = join(evidence, 'tz-probe', 'real-home');
  const ok = world();
  ok.state.copies.default = args => { const role = /(kernel|worker)\.json$/.exec(args[1])[1]; writeFileSync(join(target, `${role}.json`), tzResult(role)); writeFileSync(join(target, `${role}.log`), ''); };
  await sequence(['tz-real-home'], {exec: ok.exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep});
  assert.equal(ok.calls.filter(c => c.startsWith('ssh') && c.includes('rm -rf /tmp/cua-115-tz.R')).length, 2);
  assert.ok(ok.calls.some(c => c.includes('HOME="$HOME"')), 'the real HOME');
  assert.equal(ok.calls.filter(c => c.includes('tz-probe.mjs') && c.includes('--home real ')).length, 2, 'the probe gives its children the real HOME');
  // A transfer that fails: nothing removed on the mini, nothing half-archived here.
  const evidence2 = evidenceDir(t);
  const broken = world({fail: new Set(['scp'])});
  await assert.rejects(sequence(['tz-real-home'], {exec: broken.exec, run: () => 0, log: quiet, evidence: evidence2, now: Date.now, sleep: noSleep}), /did not verify .* stays on the mini in \/tmp\/cua-115-tz.Rkernel/);
  assert.equal(broken.calls.some(c => c.includes('rm -rf')), false);
  // A stale or short result: refused the same way.
  const evidence3 = evidenceDir(t);
  const stale = world();
  stale.state.copies.default = args => { const dir = args.at(-1); mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'kernel.json'), tzResult('kernel', '2026-01-01T00:00:00Z')); };
  await assert.rejects(sequence(['tz-real-home'], {exec: stale.exec, run: () => 0, log: quiet, evidence: evidence3, now: Date.now, sleep: noSleep}), /predates this item/);
  assert.equal(stale.calls.some(c => c.includes('rm -rf')), false);
  assert.equal(existsSync(join(evidence3, 'tz-probe', 'real-home', 'kernel.json')), false);
  // A probe that failed on the mini stops, its output left there.
  const evidence4 = evidenceDir(t);
  const failed = world({tz: {kernel: 'TZ 1 /tmp/cua-115-tz.Rk\n'}});
  await assert.rejects(sequence(['tz'], {exec: failed.exec, run: () => 0, log: quiet, evidence: evidence4, now: Date.now, sleep: noSleep}), /exited 1; its output stays on the mini/);
  assert.throws(() => verifyTz(join(evidence, 'tz-probe', 'real-home', 'kernel.json'), {role: 'worker', startedAt: 0}), /not this role/);
});

test('tz: the scratch item gives the children the probe\'s own scratch HOME, and a copy under the other HOME class is refused', async t => {
  const evidence = evidenceDir(t);
  const target = join(evidence, 'tz-probe', 'scratch-home');
  const ok = world();
  ok.state.copies.default = args => { const role = /(kernel|worker)\.json$/.exec(args[1])[1]; writeFileSync(join(target, `${role}.json`), tzResult(role, undefined, 80, {class: 'scratch', path: '/private/tmp/cua-tz-home-x'})); writeFileSync(join(target, `${role}.log`), ''); };
  await sequence(['tz'], {exec: ok.exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep});
  assert.equal(ok.calls.filter(c => c.includes('tz-probe.mjs') && c.includes('--home scratch ')).length, 2);
  assert.equal(ok.calls.some(c => c.includes('HOME="$HOME"')), false, 'the probe itself does not run under the real HOME either');
  const file = join(target, 'kernel.json');
  assert.equal(verifyTz(file, {role: 'kernel', startedAt: 0, home: 'scratch'}).home.class, 'scratch');
  assert.throws(() => verifyTz(file, {role: 'kernel', startedAt: 0, home: 'real'}), /HOME class scratch, not real/);
  writeFileSync(file, JSON.stringify({...JSON.parse(readFileSync(file, 'utf8')), home: undefined}));
  assert.throws(() => verifyTz(file, {role: 'kernel', startedAt: 0, home: 'scratch'}), /HOME class none, not scratch/);
});

test('accept-native: cleanup and acceptance statuses are both reported, the report comes only from this run\'s directory and verifies', async t => {
  const evidence = evidenceDir(t);
  const target = join(evidence, 'accept-native-main');
  const report = status => ({scenario: 'accept-native', status, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), summary: {1: 'PASS', 9: 'BLOCKED'}, items: [{id: 1, status: 'PASS'}, {id: 9, status: 'BLOCKED'}]});
  const copyReport = args => { mkdirSync(target, {recursive: true}); writeFileSync(args.at(-1), JSON.stringify(report('BLOCKED'))); };
  // BLOCKED acceptance (3) with a clean cleanup completes; the report is archived and the remote directory removed.
  const ok = world({accept: 'ACCEPT 3 CLEANUP 0 OUT /tmp/cua-115-accept.A1\n'});
  ok.state.copies.default = copyReport;
  await sequence(['accept'], {exec: ok.exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep});
  assert.equal(JSON.parse(readFileSync(join(target, 'acceptance.json'), 'utf8')).status, 'BLOCKED');
  assert.ok(ok.calls.some(c => c.includes('mini:/tmp/cua-115-accept.A1/acceptance.json')));
  assert.ok(ok.calls.some(c => c === 'ssh -o BatchMode=yes mini rm -rf /tmp/cua-115-accept.A1'));
  // A failed cleanup is not masked by a passing acceptance.
  const e2 = evidenceDir(t);
  const cleanupFailed = world({accept: 'ACCEPT 0 CLEANUP 1 OUT /tmp/cua-115-accept.A2\n'});
  cleanupFailed.state.copies.default = args => { mkdirSync(join(e2, 'accept-native-main'), {recursive: true}); writeFileSync(args.at(-1), JSON.stringify(report('PASS'))); };
  await assert.rejects(sequence(['accept'], {exec: cleanupFailed.exec, run: () => 0, log: quiet, evidence: e2, now: Date.now, sleep: noSleep}), /cleanup failed \(exit 1\)/);
  // A report that fails to copy keeps the remote one and archives nothing.
  const e3 = evidenceDir(t);
  const noCopy = world({accept: 'ACCEPT 3 CLEANUP 0 OUT /tmp/cua-115-accept.A3\n', fail: new Set(['scp'])});
  await assert.rejects(sequence(['accept'], {exec: noCopy.exec, run: () => 0, log: quiet, evidence: e3, now: Date.now, sleep: noSleep}), /did not copy and verify .* stays on the mini in \/tmp\/cua-115-accept.A3/);
  assert.equal(noCopy.calls.some(c => c.includes('rm -rf')), false);
  // No result line (the run stopped before acceptance) is a stop, and an existing report is never overwritten.
  const e4 = evidenceDir(t);
  await assert.rejects(sequence(['accept'], {exec: world({accept: 'exit 84\n'}).exec, run: () => 0, log: quiet, evidence: e4, now: Date.now, sleep: noSleep}), /printed no result line/);
  await assert.rejects(sequence(['accept'], {exec: world().exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep}), /already exists/);
});

test('the acceptance report is validated by its own fields: scenario, status matching the exit code, times inside this run, an item inventory', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const good = {scenario: 'accept-native', status: 'BLOCKED', startedAt: '2026-10-17T12:01:00Z', finishedAt: '2026-10-17T12:20:00Z', summary: {1: 'PASS', 9: 'BLOCKED'}, items: [{id: 1, status: 'PASS'}, {id: 9, status: 'BLOCKED'}]};
  const window = {startedAt: now, finishedBy: now + 30 * 60_000, exitCode: '3'};
  assert.equal(verifyAcceptance(good, window), good);
  for (const [bad, reason] of [
    [{...good, scenario: 'other'}, /not an accept-native report/],
    [{...good, status: 'OK'}, /no status/],
    [{...good, startedAt: '2026-10-16T12:00:00Z'}, /outside this run/],
    [{...good, finishedAt: '2026-10-17T13:00:00Z'}, /outside this run/],
    [{...good, finishedAt: 'never'}, /no valid startedAt/],
    [{...good, items: []}, /no item inventory/],
    [{...good, items: [{id: '1', status: 'PASS'}]}, /no item inventory/],
    [{...good, summary: {1: 'PASS'}}, /summary does not match/],
  ]) assert.throws(() => verifyAcceptance(bad, window), reason);
  assert.throws(() => verifyAcceptance(good, {...window, exitCode: '0'}), /does not match exit 0/);
});

// The remote launch body itself (ACCEPT_REMOTE), run by bash here with stand-ins for git, npm and node on PATH: the
// acceptance run must get the preparation's own TMPDIR and XDG_CONFIG_HOME, never the ssh login's TMPDIR, and a
// preparation result without a TMPDIR must stop before acceptance (and before any cleanup it would then confuse).
test('accept-native is launched with the preparation\'s TMPDIR and XDG_CONFIG_HOME, not the login\'s', async t => {
  const {ACCEPT_REMOTE} = await import('../scripts/mini-rules.mjs');
  const {spawnSync} = await import('node:child_process');
  const {chmodSync, readdirSync} = await import('node:fs');
  const root = evidenceDir(t), home = join(root, 'home'), bin = join(root, 'bin'), seen = join(root, 'seen');
  mkdirSync(join(home, 'cua-115-accept-main', '.git'), {recursive: true});
  mkdirSync(join(home, 'Developer', 'GitHub', 'cua-parity'), {recursive: true});
  mkdirSync(bin);
  const realNode = process.execPath;
  const before = new Set(readdirSync('/tmp').filter(d => d.startsWith('cua-115-accept.')));
  t.after(() => { for (const dir of readdirSync('/tmp').filter(d => d.startsWith('cua-115-accept.') && !before.has(d))) rmSync(join('/tmp', dir), {recursive: true, force: true}); });
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('git', 'exit 0');
  stub('npm', 'exit 0');
  stub('node', `case "$*" in
  *"prepare.mjs prepare"*) printf '%s\\n' "$PREPARED"; exit 0 ;;
  *"prepare.mjs cleanup"*) echo cleanup >> "${seen}.cleanup"; exit 0 ;;
  *accept-native.mjs*) printf 'TMPDIR=%s\\nXDG_CONFIG_HOME=%s\\nCUA_HOME=%s\\n' "$TMPDIR" "$XDG_CONFIG_HOME" "$CUA_HOME" > "${seen}"; exit 3 ;;
  *) exec "${realNode}" "$@" ;;
esac`);
  const launch = prepared => spawnSync('/bin/bash', ['-s'], {input: ACCEPT_REMOTE, encoding: 'utf8',
    env: {PATH: `${bin}:/usr/bin:/bin`, HOME: home, USER: 'u', LOGNAME: 'u', TMPDIR: '/ssh-login-tmp', PREPARED: JSON.stringify(prepared)}});
  const prepared = {configHome: '/scratch/run-1/config', tmpdir: '/scratch/run-1/tmp'};
  const ok = launch(prepared);
  assert.match(ok.stdout, /ACCEPT 3 CLEANUP 0 OUT \/tmp\/cua-115-accept\./);
  assert.equal(readFileSync(seen, 'utf8'), 'TMPDIR=/scratch/run-1/tmp\nXDG_CONFIG_HOME=/scratch/run-1/config\nCUA_HOME=/Users/new/cua-115/home\n');
  assert.equal(readFileSync(`${seen}.cleanup`, 'utf8'), 'cleanup\n');
  // No TMPDIR in the preparation result: stop before acceptance; nothing is launched.
  rmSync(seen); rmSync(`${seen}.cleanup`);
  const missingTmp = launch({configHome: '/scratch/run-2/config'});
  assert.equal(missingTmp.status, 86);
  assert.equal(existsSync(seen), false);
});

// The refined frontmost rule (approved 2026-10-17 after the residue's first attempt stopped on MAWS CI's Chrome window).
test('frontmost rule: a system prompt always stops; another app waits while the runner is busy and stops once it is idle', async () => {
  const base = {front: TERMINAL, busy: false, workers: 0, queued: 0, load: 1.2};
  for (const prompt of ['com.apple.UserNotificationCenter', 'com.apple.SecurityAgent', 'com.apple.coreservices.uiagent']) {
    for (const runner of [{busy: true, workers: 1}, {busy: false, workers: 0}]) assert.equal(classify({...base, ...runner, front: prompt}).state, 'stop', `${prompt} ${JSON.stringify(runner)}`);
  }
  assert.equal(classify({...base, busy: true, workers: 1, front: 'com.google.Chrome'}).state, 'contention');
  assert.equal(classify({...base, busy: false, workers: 1, front: 'com.google.Chrome'}).state, 'contention', 'a Runner.Worker alone is a busy runner');
  assert.match(classify({...base, front: 'com.google.Chrome'}).reason, /not Terminal, with the runner idle/);
  assert.equal(classify({...base, front: 'com.google.Chrome', queued: 3}).state, 'stop', 'an idle runner with a queued job does not excuse a window');
  // The gate: busy with the CI job's Chrome in front waits; when the runner turns idle with Chrome still in front, it stops.
  const transition = world({busy: 'true', workers: 1, pgrepStatus: 0, front: 'com.google.Chrome'});
  let sleeps = 0;
  const sleep = async () => { if (++sleeps === 2) Object.assign(transition.state, {busy: 'false', workers: 0, pgrepStatus: 1}); };
  await assert.rejects(gate('x', {exec: transition.exec, sleep, log: quiet}), /com.google.Chrome, not Terminal, with the runner idle/);
  assert.equal(sleeps, 2, 'it waited through the busy readings, then stopped on the first idle one');
  // The same transition with Terminal back in front proceeds.
  const clears = world({busy: 'true', workers: 1, pgrepStatus: 0, front: 'com.google.Chrome'});
  let n = 0;
  await gate('y', {exec: clears.exec, sleep: async () => { if (++n === 2) Object.assign(clears.state, {busy: 'false', workers: 0, pgrepStatus: 1, front: TERMINAL}); }, log: quiet});
  // A prompt during a busy runner stops at once, with no wait.
  const prompt = world({busy: 'true', workers: 1, pgrepStatus: 0, front: 'com.apple.SecurityAgent'});
  let waited = 0;
  await assert.rejects(gate('z', {exec: prompt.exec, sleep: async () => { waited++; }, log: quiet}), /SecurityAgent, a system prompt/);
  assert.equal(waited, 0);
});
