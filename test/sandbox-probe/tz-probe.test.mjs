// The time-zone probe (#115 acceptance 13, #138): fresh plain-Node children, each started under a sandbox launcher,
// each reproducing the demonstrated trigger (200 vm.createContext calls, then the first host-local-time use about 2.5 s
// into the process, no TZ), each bounded and classified as completed, hung or launcher failure. Doubles only: the Codex
// CLI is a scripted stand-in, never the installed runtime's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {tmpdir, userInfo} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {childScript, classify, codexLaunch, MARKER, main, probe, tzVerdict} from '../../scripts/sandbox-probe/tz-probe.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/sandbox-probe/tz-probe.mjs', import.meta.url));
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-tz-test-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };

test('the child reproduces the demonstrated trigger: 200 contexts, then its first local-time use about 2.5 s in, with no TZ', t => {
  const source = childScript();
  assert.match(source, /for \(let i = 0; i < 200; i\+\+\) vm\.createContext\(\{\}\)/);
  assert.match(source, /2500 - performance\.now\(\)/);
  assert.match(source, /new Date\(2026, 9, 17, 12\)\.toISOString\(\)/);
  assert.doesNotMatch(source, /\bTZ\b|getTimezoneOffset|Intl\./);
  const dir = scratch(t), file = join(dir, 'child.mjs');
  writeFileSync(file, source);
  const {TZ: _tz, ...env} = process.env;
  const result = spawnSync(process.execPath, [file, 'cua-tz-probe-test-1'], {encoding: 'utf8', env, timeout: 15_000});
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split('\n').find(l => l.startsWith(MARKER));
  const report = JSON.parse(line.slice(MARKER.length));
  assert.equal(report.contexts, 200);
  assert.ok(report.localTimeAtMs >= 2490 && report.localTimeAtMs < 5000, String(report.localTimeAtMs));
});

test('the codex launcher is the signed CLI\'s `codex sandbox` with cua\'s scoped policy, today\'s argv, and the only role profile it has', () => {
  const launch = codexLaunch({codex: '/rt/CodexCLI.app/Contents/MacOS/codex', node: '/rt/node/bin/node', script: '/w/child.mjs', tag: 'cua-tz-probe-ab12-1',
    cwd: '/w', home: '/Users/someone', role: 'worker', notificationCenter: 'deny'});
  assert.equal(launch.command, '/rt/CodexCLI.app/Contents/MacOS/codex');
  assert.deepEqual(launch.args.slice(0, 5), ['sandbox', '-c', 'shell_environment_policy.inherit="all"', '-c', 'default_permissions="node_repl"']);
  assert.equal(launch.args[5], '-c');
  assert.equal(launch.args[6], 'permissions.node_repl={filesystem = {"/rt/node/bin" = "read", ":root" = "read", ":tmpdir" = "write", ":workspace_roots" = {"." = "write"}}, network = {enabled = false}}');
  assert.deepEqual(launch.args.slice(7), ['--', '/rt/node/bin/node', '/w/child.mjs', 'cua-tz-probe-ab12-1']);
  assert.equal(launch.cwd, '/w');
  assert.deepEqual(launch.env, {HOME: '/Users/someone', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: '/w/tmp', CODEX_HOME: '/w/codex-home'});
  assert.match(launch.profile, /both roles/);
  assert.throws(() => codexLaunch({codex: '/c', node: '/n', script: '/s', tag: 't', cwd: '/w', home: '/h', role: 'kernel', notificationCenter: 'allow'}), /cannot carry the notification_center grant/);
});

test('each run is classified: completed with the child\'s report, hung at the bound, otherwise a launcher failure', () => {
  const ok = `${MARKER}{"contexts":200,"localTimeAtMs":2500.4}\n`;
  assert.deepEqual(classify({code: 0, signal: null, stdout: ok, timedOut: false}), {outcome: 'completed', localTimeAtMs: 2500.4});
  assert.deepEqual(classify({code: null, signal: 'SIGKILL', stdout: '', timedOut: true}), {outcome: 'hung'});
  assert.deepEqual(classify({code: 0, signal: null, stdout: ok, timedOut: true}), {outcome: 'hung'});
  assert.deepEqual(classify({code: 71, signal: null, stdout: '', timedOut: false}), {outcome: 'launcher-failure'});
  assert.deepEqual(classify({code: 0, signal: null, stdout: 'no marker\n', timedOut: false}), {outcome: 'launcher-failure'});
  assert.deepEqual(classify({code: 1, signal: null, stdout: ok, timedOut: false}), {outcome: 'launcher-failure'});
  assert.deepEqual(classify({error: 'spawn ENOENT', timedOut: false}), {outcome: 'launcher-failure'});
});

// A stand-in for the Codex CLI: by the run number in the child's tag it runs the command after `--` (ok), keeps a
// grandchild alive and never exits (hang), or refuses as a launcher would (fail).
function fakeCodex(dir, plan) {
  const file = join(dir, 'codex');
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  writeFileSync(file, `#!${process.execPath}
const {spawn} = require('node:child_process'); const {readFileSync} = require('node:fs'); const {join} = require('node:path');
const args = process.argv.slice(2), command = args.slice(args.indexOf('--') + 1), tag = command.at(-1);
const plan = JSON.parse(readFileSync(join(__dirname, 'plan.json'), 'utf8')), mode = plan[(Number(tag.split('-').at(-1)) - 1) % plan.length];
require('node:fs').appendFileSync(join(__dirname, 'homes'), process.env.HOME + '\\n');
if (mode === 'fail') { process.stderr.write('sandbox-exec: profile refused\\n'); process.exit(71); }
if (mode === 'hang') { spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', tag], {stdio: 'ignore'}); setInterval(() => {}, 1000); }
else spawn(command[0], command.slice(1), {stdio: 'inherit'}).on('exit', code => process.exit(code ?? 1));
`);
  chmodSync(file, 0o755);
  return file;
}
const running = tag => { try { return execFileSync('pgrep', ['-f', tag], {encoding: 'utf8'}).trim().split('\n').filter(Boolean).length; } catch { return 0; } };

test('a probe runs fresh children under the launcher, kills a hung one at the bound with its whole tree, and leaves nothing', async t => {
  const dir = scratch(t), codex = fakeCodex(dir, ['ok', 'hang', 'fail']);
  const result = await probe({launcher: 'codex', role: 'kernel', runs: 3, boundMs: 1500, notificationCenter: 'deny', codex, node: process.execPath, targetMs: 0});
  assert.deepEqual(result.counts, {completed: 1, hung: 1, launcherFailure: 1});
  assert.deepEqual(result.results.map(r => r.outcome), ['completed', 'hung', 'launcher-failure']);
  assert.ok(result.results[1].ms >= 1500);
  assert.equal(result.results[1].leftover, 0);
  assert.match(result.results[2].stderr, /profile refused/);
  assert.equal(result.leftovers, 0);
  assert.equal(running(result.tag), 0, 'no process of the probe survives it');
  assert.equal(existsSync(result.scratch), false, 'the scratch directory is removed');
  assert.deepEqual({launcher: result.launcher, role: result.role, notificationCenter: result.notificationCenter, runs: result.runs, boundMs: result.boundMs, contexts: result.contexts, targetMs: result.targetMs},
    {launcher: 'codex', role: 'kernel', notificationCenter: 'deny', runs: 3, boundMs: 1500, contexts: 200, targetMs: 0});
  assert.equal(result.node.path, process.execPath);
});

test('the cua launcher is a slot M1 wires to src/sandbox; until then it is refused before any child starts', async () => {
  await assert.rejects(probe({launcher: 'cua', role: 'kernel', runs: 1, boundMs: 15_000, notificationCenter: 'deny', node: process.execPath}), /src\/sandbox.*M1/);
});

test('the CLI accepts the documented options, writes its result and refuses anything else', async t => {
  const dir = scratch(t), codex = fakeCodex(dir, ['ok']), out = join(dir, 'result.json');
  const ok = spawnSync(process.execPath, [SCRIPT, '--launcher', 'codex', '--codex', codex, '--role', 'worker', '--runs', '1', '--bound-ms', '15000', '--notification-center', 'deny', '--out', out], {encoding: 'utf8', timeout: 30_000});
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).counts, {completed: 1, hung: 0, launcherFailure: 0});
  assert.match(ok.stdout, /"completed":1/);
  for (const [args, error] of [
    [['--launcher', 'bwrap', '--role', 'kernel'], /--launcher must be codex or cua/],
    [['--launcher', 'codex', '--role', 'both'], /--role must be kernel or worker/],
    [['--launcher', 'codex', '--role', 'kernel', '--notification-center', 'maybe'], /--notification-center must be deny or allow/],
    [['--launcher', 'codex', '--role', 'kernel', '--runs', '0'], /--runs must be a positive integer/],
    [['--launcher', 'codex', '--role', 'kernel', '--bound-ms', 'x'], /--bound-ms must be a positive integer/],
    [['--launcher', 'codex', '--codex', codex, '--role', 'kernel', '--notification-center', 'allow'], /cannot carry the notification_center grant/],
  ]) await assert.rejects(main(args), error, args.join(' '));
});

// What a result records about the conditions it ran under, beside the tested permission (schema 2).
const CONDITIONS = {contexts: 200, targetMs: 2500, platform: 'darwin', arch: 'arm64', node: {path: '/h/node/24.22.0/bin/node', version: 'v24.22.0'},
  home: {class: 'real'}, launcherIdentity: {launcher: 'cua', source: 'src/sandbox'}};
test('the #138 verdict keeps the grant only when the denying control hangs and the grant neither hangs nor fails to launch', () => {
  const run = (notificationCenter, counts, {runs = 80, boundMs = 15000} = {}) => ({...CONDITIONS, launcher: 'cua', role: 'kernel', runs, boundMs, notificationCenter,
    counts: {completed: runs - counts.hung - counts.launcherFailure, ...counts}, results: Array.from({length: runs}, (_, i) => ({run: i + 1}))});
  assert.equal(tzVerdict(run('deny', {hung: 3, launcherFailure: 0}), run('allow', {hung: 0, launcherFailure: 0})).verdict, 'keep');
  assert.equal(tzVerdict(run('deny', {hung: 0, launcherFailure: 0}), run('allow', {hung: 0, launcherFailure: 0})).verdict, 'inconclusive');
  assert.equal(tzVerdict(run('deny', {hung: 3, launcherFailure: 0}), run('allow', {hung: 1, launcherFailure: 0})).verdict, 'remove');
  assert.equal(tzVerdict(run('deny', {hung: 3, launcherFailure: 0}), run('allow', {hung: 0, launcherFailure: 2})).verdict, 'remove');
  assert.throws(() => tzVerdict(run('allow', {hung: 3, launcherFailure: 0}), run('allow', {hung: 0, launcherFailure: 0})), /control.*deny/);
  assert.throws(() => tzVerdict(run('deny', {hung: 3, launcherFailure: 0}), {...run('allow', {hung: 0, launcherFailure: 0}), role: 'worker'}), /differ in role/);
});

test('a pair smaller than 80 runs at 15 s is a diagnostic: what the rule gives is reported, never a keep', () => {
  const run = (notificationCenter, hung, {runs, boundMs}) => ({...CONDITIONS, launcher: 'cua', role: 'kernel', runs, boundMs, notificationCenter,
    counts: {completed: runs - hung, hung, launcherFailure: 0}, results: Array.from({length: runs}, (_, i) => ({run: i + 1}))});
  for (const size of [{runs: 1, boundMs: 15000}, {runs: 80, boundMs: 1500}, {runs: 79, boundMs: 15000}]) {
    const verdict = tzVerdict(run('deny', 1, size), run('allow', 0, size));
    assert.equal(verdict.verdict, 'diagnostic', JSON.stringify(size));
    assert.equal(verdict.rule, 'keep');
    assert.match(verdict.reason, /diagnostic, not acceptance 13's 80 runs at 15000 ms/);
  }
  // Counts that do not account for every run are refused.
  const short = run('allow', 0, {runs: 80, boundMs: 15000});
  short.results.pop();
  assert.throws(() => tzVerdict(run('deny', 1, {runs: 80, boundMs: 15000}), short), /does not account for each of its 80 runs/);
});

test('the CLI verdict exits 0 only for an acceptance keep', t => {
  const dir = scratch(t);
  const write = (name, notificationCenter, hung, runs) => { const file = join(dir, name); writeFileSync(file, JSON.stringify({...CONDITIONS, launcher: 'cua', role: 'kernel', runs, boundMs: 15000, notificationCenter,
    counts: {completed: runs - hung, hung, launcherFailure: 0}, results: Array.from({length: runs}, (_, i) => ({run: i + 1}))})); return file; };
  const verdict = (...files) => spawnSync(process.execPath, [SCRIPT, 'verdict', ...files], {encoding: 'utf8'});
  const keep = verdict(write('c80.json', 'deny', 2, 80), write('g80.json', 'allow', 0, 80));
  assert.equal(keep.status, 0, keep.stderr);
  assert.match(keep.stdout, /"verdict":"keep"/);
  const small = verdict(write('c1.json', 'deny', 1, 1), write('g1.json', 'allow', 0, 1));
  assert.equal(small.status, 1);
  assert.match(small.stdout, /"verdict":"diagnostic"/);
});

// Review finding (M0 PR, P2): a control and a grant are compared only when they ran under the same conditions; HOME is a
// demonstrated confounder (0 of 160 hung under a scratch HOME against 15 of 80 under the real one).
test('the verdict refuses a pair that differs in anything but the tested permission, or does not record its conditions', () => {
  const run = (notificationCenter, hung, over = {}) => ({...CONDITIONS, launcher: 'cua', role: 'kernel', runs: 80, boundMs: 15000, notificationCenter,
    counts: {completed: 80 - hung, hung, launcherFailure: 0}, results: Array.from({length: 80}, (_, i) => ({run: i + 1})), ...over});
  const control = run('deny', 3);
  // What legitimately differs between two probes: the permission, and each probe's own tag, scratch, times, runs, profile text.
  const grant = run('allow', 0, {tag: 'other', scratch: '/tmp/x', started: '2026-10-18T00:00:00Z', profile: 'with the notification_center line'});
  assert.equal(tzVerdict(control, grant).verdict, 'keep');
  assert.equal(tzVerdict(run('deny', 3, {home: {class: 'scratch', path: '/tmp/cua-tz-home-a'}}), run('allow', 0, {home: {class: 'scratch', path: '/tmp/cua-tz-home-b'}})).verdict, 'keep',
    'two scratch HOMEs are the same condition');
  for (const [field, value] of [
    ['home', {class: 'scratch', path: '/tmp/cua-tz-home-a'}],
    ['node', {...CONDITIONS.node, version: 'v24.18.0'}],
    ['node', {...CONDITIONS.node, path: '/usr/local/bin/node'}],
    ['platform', 'linux'],
    ['arch', 'x64'],
    ['launcherIdentity', {launcher: 'cua', source: 'src/sandbox', build: 'other'}],
    ['contexts', 100],
    ['targetMs', 0],
    ['launcher', 'codex'],
  ]) {
    const label = {home: 'home class', launcherIdentity: 'launcher identity'}[field] ?? field;
    assert.throws(() => tzVerdict(control, run('allow', 0, {[field]: value})), new RegExp(`differ in ${label}`), `${field} differs`);
  }
  // Results written before the conditions were recorded (schema 1: no HOME class, no launcher identity) are refused.
  const {home: _home, launcherIdentity: _identity, ...schema1} = control;
  assert.throws(() => tzVerdict(schema1, grant), /the control does not record its home class, launcher identity/);
});

test('a probe records its HOME class, its own scratch HOME\'s path, the Node, the platform and the launcher\'s identity', async t => {
  const dir = scratch(t), codex = fakeCodex(dir, ['ok']);
  const result = await probe({launcher: 'codex', role: 'kernel', runs: 1, boundMs: 15_000, notificationCenter: 'deny', codex, node: process.execPath, targetMs: 0});
  assert.equal(result.schema, 2);
  assert.equal(result.home.class, 'scratch');
  assert.match(result.home.path, /cua-tz-home-/);
  assert.equal(existsSync(result.home.path), false, 'the probe\'s scratch HOME is removed');
  assert.deepEqual(readFileSync(join(dir, 'homes'), 'utf8').trim().split('\n'), [result.home.path], 'the launcher and its child ran under it');
  assert.deepEqual(result.node, {path: process.execPath, version: process.version});
  assert.equal(result.platform, process.platform);
  assert.deepEqual(result.launcherIdentity, {launcher: 'codex', path: codex, sha256: createHash('sha256').update(readFileSync(codex)).digest('hex')});
});

test('under --home real the child gets the account\'s HOME and the result records only the class', async t => {
  const dir = scratch(t), codex = fakeCodex(dir, ['ok']);
  const result = await probe({launcher: 'codex', role: 'kernel', runs: 1, boundMs: 15_000, notificationCenter: 'deny', home: 'real', codex, node: process.execPath, targetMs: 0});
  assert.deepEqual(result.home, {class: 'real'});
  assert.deepEqual(readFileSync(join(dir, 'homes'), 'utf8').trim().split('\n'), [userInfo().homedir]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`"${userInfo().homedir}"`), 'the real HOME\'s path is not recorded');
  await assert.rejects(probe({launcher: 'codex', role: 'kernel', runs: 1, home: 'mine', codex, node: process.execPath}), /--home must be real or scratch/);
});
