// The oracles' comparisons (#115 M0, scripts/sandbox-probe/compare.mjs): a captured sandbox-exec argv against the
// golden generator's for the same input, and two launchers' fingerprints, label by label, with what is per-run (the
// CLI's arg0 directory, the pid) normalized away and every remaining difference named.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareCapture, compareExperiments, compareFingerprints, envDiff, envObject, profileFromPolicy} from '../../scripts/sandbox-probe/compare.mjs';

test('profileFromPolicy turns cua\'s sorted -c table into the original\'s permission profile, in the same order', () => {
  const policy = {filesystem: [['/a', 'read'], ['/z', 'none'], [':root', 'read'], [':tmpdir', 'write'], [':workspace_roots', {'.': 'write'}]], cwd: '/run'};
  assert.deepEqual(profileFromPolicy(policy), {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [
    {path: {type: 'path', path: '/a'}, access: 'read'},
    {path: {type: 'path', path: '/z'}, access: 'none'},
    {path: {type: 'special', value: {kind: 'root'}}, access: 'read'},
    {path: {type: 'special', value: {kind: 'tmpdir'}}, access: 'write'},
    {path: {type: 'special', value: {kind: 'project_roots'}}, access: 'write'},
  ]}});
  assert.equal(profileFromPolicy(policy, {network: 'enabled'}).network, 'enabled');
  assert.throws(() => profileFromPolicy({filesystem: [[':workspace_roots', {'sub': 'write'}]]}), /workspace_roots/);
});

test('envObject reads KEY=VALUE lists (values may contain =) and objects alike', () => {
  assert.deepEqual(envObject(['A=1', 'B=x=y', 'C=']), {A: '1', B: 'x=y', C: ''});
  assert.deepEqual(envObject({B: '2', A: '1'}), {A: '1', B: '2'});
});

test('envDiff names the variables only one side has and those whose values differ', () => {
  assert.deepEqual(envDiff({A: '1', B: '2', C: '3'}, {B: '2', C: '4', D: '5'}), {onlyLeft: ['A'], onlyRight: ['D'], differing: [{name: 'C', left: '3', right: '4'}]});
  assert.deepEqual(envDiff({A: '1'}, {A: '1'}), {onlyLeft: [], onlyRight: [], differing: []});
});

const golden = {argsSymbolic: ['-p', '(version 1)\n(deny default)\n(deny file-ioctl (ioctl-command TIOCSTI))', '-DWRITABLE_ROOT_0=/run', '--', '/node', 'k.mjs'],
  argsNumeric: ['-p', '(version 1)\n(deny default)\n(deny file-ioctl (ioctl-command 2147578994))', '-DWRITABLE_ROOT_0=/run', '--', '/node', 'k.mjs'],
  env: {CODEX_SANDBOX: 'seatbelt', HOME: '/h', PATH: '/usr/bin'}};

test('compareCapture: an identical capture is equal, sandbox-exec\'s own argv[0] aside', () => {
  const captured = {captured: true, execPath: '/usr/bin/sandbox-exec', argv: ['/usr/bin/sandbox-exec', ...golden.argsSymbolic],
    env: ['CODEX_SANDBOX=seatbelt', 'HOME=/h', 'PATH=/usr/bin']};
  const result = compareCapture({captured, golden});
  assert.equal(result.argvEqual, true);
  assert.equal(result.profileEqual, true);
  assert.equal(result.argv0, '/usr/bin/sandbox-exec');
  assert.deepEqual(result.env, {onlyCaptured: [], onlyGolden: [], differing: []});
});

test('compareCapture locates the first differing profile line and parameter, and names the env differences', () => {
  const profile = '(version 1)\n(allow default)\n(deny file-ioctl (ioctl-command TIOCSTI))';
  const captured = {captured: true, execPath: '/usr/bin/sandbox-exec', argv: ['/usr/bin/sandbox-exec', '-p', profile, '-DWRITABLE_ROOT_0=/other', '--', '/node', 'k.mjs'],
    env: ['CODEX_SANDBOX=seatbelt', 'HOME=/h', 'PATH=/codex-home/tmp/arg0/codex-arg0AbC:/usr/bin', 'EXTRA=1']};
  const result = compareCapture({captured, golden});
  assert.equal(result.argvEqual, false);
  assert.equal(result.profileEqual, false);
  assert.deepEqual(result.firstProfileDifference, {line: 2, captured: '(allow default)', golden: '(deny default)'});
  assert.deepEqual(result.paramsDiffering, [{index: 0, captured: '-DWRITABLE_ROOT_0=/other', golden: '-DWRITABLE_ROOT_0=/run'}]);
  assert.equal(result.commandEqual, true);
  assert.deepEqual(result.env, {onlyCaptured: ['EXTRA'], onlyGolden: [], differing: [{name: 'PATH', captured: '/codex-home/tmp/arg0/codex-arg0AbC:/usr/bin', golden: '/usr/bin'}]});
});

test('compareCapture of a failed capture says so and compares nothing', () => {
  assert.deepEqual(compareCapture({captured: {captured: false, tries: 20}, golden}), {captured: false, tries: 20});
});

const fp = (results, env = {HOME: '/h', PATH: '/usr/bin'}) => ({pid: 1, cwd: '/run', sandboxed: true, env,
  checks: Object.entries(results).map(([key, result]) => { const [op, label] = key.split(' '); return {op, filter: 'path', label, target: `/t/${label}`, result}; })});

test('compareFingerprints: equal results by (op, label), whatever the targets\' run-specific paths', () => {
  const a = fp({'file-read-data home': 'allow', 'file-write-data cwd': 'allow'});
  const b = fp({'file-write-data cwd': 'allow', 'file-read-data home': 'allow'});
  b.checks[0].target = '/elsewhere/cwd';
  b.pid = 2;
  assert.deepEqual(compareFingerprints(a, b), {equal: true, sandboxed: [true, true], cwdEqual: true, checks: [], env: {onlyLeft: [], onlyRight: [], differing: []}});
});

test('compareFingerprints names differing checks, checks one side lacks, and env differences after the arg0 normalization', () => {
  const a = fp({'file-read-data home': 'allow', 'mach-lookup cfprefsd': 'allow'}, {PATH: '/c/tmp/arg0/codex-arg0Xy12:/usr/bin', X: '1'});
  const b = fp({'file-read-data home': 'deny', 'file-link cwd': 'deny'}, {PATH: '/c/tmp/arg0/codex-arg0Zz99:/usr/bin'});
  const result = compareFingerprints(a, b);
  assert.equal(result.equal, false);
  assert.deepEqual(result.checks, [
    {op: 'file-link', label: 'cwd', left: null, right: 'deny'},
    {op: 'file-read-data', label: 'home', left: 'allow', right: 'deny'},
    {op: 'mach-lookup', label: 'cfprefsd', left: 'allow', right: null},
  ]);
  assert.deepEqual(result.env, {onlyLeft: ['X'], onlyRight: [], differing: []});
});

test('compareFingerprints treats per-launch session ids (UUIDs in the run directory and its temp) as equal', () => {
  const a = fp({'file-read-data home': 'allow'}, {TMPDIR: '/h/run/0fa27729-814e-47fb-8f46-66727511dc72/tmp'});
  const b = fp({'file-read-data home': 'allow'}, {TMPDIR: '/h/run/d3455fc3-beff-4391-a734-7698251ad119/tmp'});
  a.cwd = '/h/run/0fa27729-814e-47fb-8f46-66727511dc72';
  b.cwd = '/h/run/d3455fc3-beff-4391-a734-7698251ad119';
  const result = compareFingerprints(a, b);
  assert.equal(result.equal, true);
  assert.equal(result.cwdEqual, true);
});

test('compareExperiments: the confinement outcomes key by key, and each side\'s cell outcomes, apart from timings', () => {
  const run = (confinement, natives) => ({label: 'x', results: {banner: {ok: true, wallMs: 5}, confinement: {ok: true, value: confinement, ms: 3},
    ...Object.fromEntries(natives.map(([name, ok]) => [name, {ok, value: {apps: 3}, ms: 9, wallMs: 10}]))}});
  const a = run({cwdWrite: 'ok', tcp: 'EPERM', scriptDirs: 1}, [['listApps#1', true]]);
  const b = run({cwdWrite: 'ok', tcp: 'ok', scriptDirs: 1}, [['listApps#1', false]]);
  assert.deepEqual(compareExperiments(a, b), {confinementEqual: false, confinementDiffering: [{key: 'tcp', left: 'EPERM', right: 'ok'}],
    cells: {banner: [true, true], 'listApps#1': [true, false]}, cellsEqual: false});
  assert.equal(compareExperiments(a, a).confinementEqual, true);
  assert.equal(compareExperiments(a, a).cellsEqual, true);
});
