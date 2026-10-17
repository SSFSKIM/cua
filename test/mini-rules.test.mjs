// The mini's run rules (scripts/mini-rules.mjs) against doubles of ssh, gh and scp: every missing observation stops,
// a non-Terminal frontmost application stops at once, contention waits, a failed item stops the sequence after the
// frontmost check, incomplete evidence is never skipped, and remote evidence is removed only after a verified copy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observe, classify, gate, frontAfter, runState, sequence, verifyTz, Stop, TERMINAL} from '../scripts/mini-rules.mjs';

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
    const runs = /runs\?status=(\w+)/.exec(line);
    if (cmd === 'gh' && runs) return JSON.stringify({workflow_runs: state.runs[runs[1]]});
    const jobs = /runs\/(\d+)\/jobs/.exec(line);
    if (cmd === 'gh' && jobs) return JSON.stringify({jobs: state.jobs[jobs[1]] ?? []});
    if (cmd === 'ssh' && line.includes('Runner.Worker')) return `workers=${state.workers}\n 19:00  up 8 days, 2 users, load averages: ${state.load} 1.0 1.0\n`;
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

test('classification: any non-Terminal frontmost application is a stop; CI and load are contention', () => {
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

const tzResult = (role, started = new Date().toISOString(), runs = 80) => JSON.stringify({role, runs, boundMs: 15000, started,
  counts: {completed: runs, hung: 0, launcherFailure: 0}, results: Array.from({length: runs}, (_, i) => ({run: i + 1, outcome: 'completed'}))});

test('tz: the remote result is removed only after its copy verifies; a failed or stale copy keeps it on the mini', async t => {
  const evidence = evidenceDir(t);
  const target = join(evidence, 'tz-probe', 'real-home');
  const ok = world();
  ok.state.copies.default = args => { const role = /(kernel|worker)\.json$/.exec(args[1])[1]; writeFileSync(join(target, `${role}.json`), tzResult(role)); writeFileSync(join(target, `${role}.log`), ''); };
  await sequence(['tz-real-home'], {exec: ok.exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep});
  assert.equal(ok.calls.filter(c => c.startsWith('ssh') && c.includes('rm -rf /tmp/cua-115-tz.R')).length, 2);
  assert.ok(ok.calls.some(c => c.includes('HOME="$HOME"')), 'the real HOME');
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

test('accept-native: cleanup and acceptance statuses are both reported, the report comes only from this run\'s directory and verifies', async t => {
  const evidence = evidenceDir(t);
  const target = join(evidence, 'accept-native-main');
  const copyReport = args => { mkdirSync(target, {recursive: true}); writeFileSync(args.at(-1), JSON.stringify({items: []})); };
  // BLOCKED acceptance (3) with a clean cleanup completes; the report is archived and the remote directory removed.
  const ok = world({accept: 'ACCEPT 3 CLEANUP 0 OUT /tmp/cua-115-accept.A1\n'});
  ok.state.copies.default = copyReport;
  await sequence(['accept'], {exec: ok.exec, run: () => 0, log: quiet, evidence, now: Date.now, sleep: noSleep});
  assert.deepEqual(JSON.parse(readFileSync(join(target, 'acceptance.json'), 'utf8')), {items: []});
  assert.ok(ok.calls.some(c => c.includes('mini:/tmp/cua-115-accept.A1/acceptance.json')));
  assert.ok(ok.calls.some(c => c === 'ssh -o BatchMode=yes mini rm -rf /tmp/cua-115-accept.A1'));
  // A failed cleanup is not masked by a passing acceptance.
  const e2 = evidenceDir(t);
  const cleanupFailed = world({accept: 'ACCEPT 0 CLEANUP 1 OUT /tmp/cua-115-accept.A2\n'});
  cleanupFailed.state.copies.default = args => { mkdirSync(join(e2, 'accept-native-main'), {recursive: true}); writeFileSync(args.at(-1), '{}'); };
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
