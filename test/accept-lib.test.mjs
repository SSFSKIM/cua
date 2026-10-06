// The acceptance runner's own rules (scripts/accept/lib.mjs): a status roll-up that never turns a skipped check into
// a pass, the suite summary it reads, the live TextEdit fixture's single permitted approval, the snapshot that proves
// a reinstall changed nothing, and the packaging/tracking policies.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  approvalObservation, doctorHealth, inventoryCheck, PROBE_SECRETS_PHASES, probePhasesFor, scenarioVerdict,
  diffSnapshots, forbiddenPaths, isTextEditApproval, missingFromPackage, PACKAGE_REQUIRED, rollup, snapshotTree, suiteVerdict, testReporterEnv, testSummary, tokenLike,
} from '../scripts/accept/lib.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {agentChecks} from '../src/runtime/doctor.mjs';
import {enrollDevice} from '../src/remote/device.mjs';
import {UID, fakeLaunchctl} from './fixtures/fake-launchctl.mjs';

test('an item passes only when every check passed; nothing evaluated is blocked, never a pass', () => {
  assert.equal(rollup([]), 'BLOCKED');
  assert.equal(rollup(['PASS', 'PASS']), 'PASS');
  assert.equal(rollup(['PASS', 'BLOCKED']), 'BLOCKED');
  assert.equal(rollup(['BLOCKED', 'FAIL', 'PASS']), 'FAIL');
});

test('an informational row is neutral: it never fails or blocks an item, and alone it stays informational', () => {
  assert.equal(rollup(['PASS', 'INFO']), 'PASS');
  assert.equal(rollup(['INFO', 'BLOCKED']), 'BLOCKED');
  assert.equal(rollup(['INFO', 'FAIL']), 'FAIL');
  assert.equal(rollup(['INFO']), 'INFO');
  assert.equal(rollup(['INFO', 'INFO']), 'INFO');
});

const totalsOf = text => testSummary(text).totals;
const verdictOf = text => suiteVerdict({code: 0, ...testSummary(text)});
const tapBlock = ({tests = 2, pass = 2, skipped = 0} = {}) => `# tests ${tests}\n# suites 0\n# pass ${pass}\n# fail 0\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n# duration_ms 5\n`;
const specBlock = ({tests = 2, pass = 2, skipped = 0} = {}) => tapBlock({tests, pass, skipped}).replaceAll('# ', 'ℹ ');

test('the node:test summary is read whole or not at all', () => {
  const summary = '1..3\n# tests 3\n# suites 0\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 5\n';
  assert.deepEqual(totalsOf(`ok 1 - a\n${summary}`), {tests: 3, pass: 2, fail: 1, cancelled: 0, skipped: 0, todo: 0});
  assert.deepEqual(testSummary('ok 1 - a\n# tests 3\n'), {totals: null, problem: 'incomplete test summary'});
  assert.deepEqual(testSummary(''), {totals: null, problem: 'no test summary'});
});

// Node 26.7.0's spec-reporter output with stdout piped (not a terminal), as `npm test` printed it on the second Mac.
const NODE26_SPEC = '✔ first (0.406334ms)\n﹣ second (0.060667ms) # SKIP\nℹ tests 2\nℹ suites 0\nℹ pass 1\n'
  + 'ℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\nℹ duration_ms 58.145083\n';
const SUMMARY_SUITE = fileURLToPath(new URL('./fixtures/summary-suite.mjs', import.meta.url));
// A child `node --test` must not see this runner's NODE_TEST_CONTEXT, or it reports to this runner instead of stdout.
const outsideRunner = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_OPTIONS' && key !== 'NODE_TEST_CONTEXT'));

test('the spec reporter\'s summary is read too, coloured or not, with the same coverage rule', () => {
  assert.deepEqual(totalsOf(NODE26_SPEC), {tests: 2, pass: 1, fail: 0, cancelled: 0, skipped: 1, todo: 0});
  assert.equal(verdictOf(NODE26_SPEC).status, 'BLOCKED', 'a skipped test is not coverage');
  const coloured = NODE26_SPEC.replace('pass 1', 'pass 2').replace('skipped 1', 'skipped 0').split('\n').map(line => line && `\x1b[34m${line}\x1b[39m`).join('\n');
  assert.equal(verdictOf(coloured).status, 'PASS');
});

test('only coherent summary blocks count: a partial, mixed or contradictory summary is no evidence', () => {
  // Half a TAP summary and half a spec one: two incomplete blocks.
  assert.deepEqual(verdictOf('# tests 2\n# suites 0\n# pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n'), {status: 'FAIL', reason: 'incomplete test summary'});
  // A complete passing spec summary followed by a partial TAP one that shows a skip.
  assert.deepEqual(verdictOf(`${specBlock()}# tests 2\n# pass 1\n# skipped 1\n`), {status: 'FAIL', reason: 'incomplete test summary'});
  // Counters are never combined across blocks: a truncated passing block, then a complete one with a skip.
  assert.deepEqual(verdictOf(`ℹ tests 2\nℹ pass 2\nℹ fail 0\nsomething else\n${specBlock({pass: 1, skipped: 1})}`), {status: 'FAIL', reason: 'incomplete test summary'});
  // Two complete blocks that disagree.
  assert.deepEqual(verdictOf(`${specBlock()}${tapBlock({pass: 1, skipped: 1})}`), {status: 'FAIL', reason: 'conflicting test summaries'});
  assert.deepEqual(verdictOf(`${tapBlock({pass: 1, skipped: 1})}\n${tapBlock()}`), {status: 'FAIL', reason: 'conflicting test summaries'});
  // Agreeing blocks are one summary; the last is the run's.
  assert.deepEqual(verdictOf(`${tapBlock()}ok\n${specBlock()}`), {status: 'PASS', reason: '2/2 passed'});
  assert.equal(verdictOf('# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo x\n').reason, 'incomplete test summary');
});

test('a real spec-reporter run reaches the same verdict as a TAP run', () => {
  for (const [skip, status] of [['0', 'PASS'], ['1', 'BLOCKED']]) {
    for (const reporter of ['spec', 'tap']) {
      const r = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, SUMMARY_SUITE], {encoding: 'utf8', env: {...outsideRunner(), SUMMARY_SUITE_SKIP: skip}});
      const summary = testSummary(r.stdout);
      assert.equal(summary.totals?.tests, 2, `${reporter}: ${r.stdout}`);
      assert.equal(suiteVerdict({code: r.status, ...summary}).status, status, `${reporter}, skip=${skip}`);
    }
  }
});

test('the runners\' reporter options replace any reporter in NODE_OPTIONS and keep everything else as written', () => {
  const rewrite = options => testReporterEnv({NODE_OPTIONS: options}).NODE_OPTIONS;
  const TAP = '--test-reporter=tap --test-reporter-destination=stdout';
  assert.equal(testReporterEnv({}).NODE_OPTIONS, TAP);
  assert.equal(rewrite('--max-old-space-size=512 --test-reporter=spec --test-reporter-destination=stderr'), `--max-old-space-size=512 ${TAP}`);
  // A separate-argument value goes with its option.
  assert.equal(rewrite('--test-reporter spec --max-old-space-size=512'), `--max-old-space-size=512 ${TAP}`);
  assert.equal(rewrite('--test-reporter-destination stderr --trace-warnings'), `--trace-warnings ${TAP}`);
  // Node accepts underscores in option names.
  assert.equal(rewrite('--test_reporter=spec --test_reporter_destination stderr'), TAP);
  // Quoted arguments stay whole, quotes included, even when they mention a reporter option.
  assert.equal(rewrite('--title="cua --test-reporter=spec" --test-reporter "my reporter" --require "./a \\"b\\".js"'), `--title="cua --test-reporter=spec" --require "./a \\"b\\".js" ${TAP}`);
  // Node itself starts with the rewritten options and a nested test run reports TAP once.
  const env = {...outsideRunner(), ...testReporterEnv({NODE_OPTIONS: '--title="cua accept" --test_reporter spec --test-reporter-destination=stderr --max-old-space-size=512'})};
  const nested = `if (process.title !== 'cua accept') process.exit(9); require('node:child_process').spawnSync(process.execPath, ['--test', ${JSON.stringify(SUMMARY_SUITE)}], {stdio: 'inherit'})`;
  const r = spawnSync(process.execPath, ['-e', nested], {encoding: 'utf8', env});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.match(/^# tests 2$/gm)?.length, 1, r.stdout);
});

test('the runners\' test environment makes nested node:test runs report TAP on stdout', () => {
  // As scripts/test-helper.mjs does: a node process that starts `node --test` with the environment it inherited.
  const nested = `require('node:child_process').spawnSync(process.execPath, ['--test', ${JSON.stringify(SUMMARY_SUITE)}], {stdio: 'inherit'})`;
  const r = spawnSync(process.execPath, ['-e', nested], {encoding: 'utf8', env: {...outsideRunner(), ...testReporterEnv({}), FORCE_COLOR: '1'}});
  assert.match(r.stdout, /^# tests 2$/m);
  assert.equal(suiteVerdict({code: r.status, ...testSummary(r.stdout)}).status, 'PASS');
});

test('a required suite passes only with positive executed coverage: nothing run, skipped or TODO is never a pass', () => {
  const totals = over => ({tests: 10, pass: 10, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...over});
  assert.equal(suiteVerdict({code: 0, totals: totals()}).status, 'PASS');
  assert.equal(suiteVerdict({code: 0, totals: totals({tests: 0, pass: 0})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, skipped: 1})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, todo: 1})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, fail: 1})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, cancelled: 1})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 1, totals: totals()}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: null}).status, 'FAIL');
});

const approval = (overrides = {}, meta = {}) => ({
  jsonrpc: '2.0', id: 0, method: 'elicitation/create',
  params: {
    message: 'Allow Computer Use to use "TextEdit"?', mode: 'form', requestedSchema: {type: 'object', properties: {}},
    _meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', persist: ['session', 'always'],
      tool_name: 'get_app_state', tool_params: {app: 'com.apple.TextEdit'},
      tool_params_display: [{name: 'app', display_name: 'App', value: 'TextEdit'}], ...meta,
    },
    ...overrides,
  },
});

test('the live fixture accepts the vendor\'s TextEdit approval and nothing else', () => {
  assert.equal(isTextEditApproval(approval()), true);
  // Another app, by name or by bundle identifier, or a lookalike.
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "Notes"?'}, {tool_params: {app: 'com.apple.Notes'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.Notes'}})), false);
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "TextEdit Pro"?'})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.TextEdit.evil'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.TextEdit', extra: 1}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: undefined})), false);
  // A message that merely contains the right text, a request asking for input, another connector, another method.
  assert.equal(isTextEditApproval(approval({message: 'Please: Allow Computer Use to use "TextEdit"?'})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'object', properties: {password: {type: 'string'}}}})), false);
  assert.equal(isTextEditApproval(approval({}, {connector_id: 'something-else'})), false);
  assert.equal(isTextEditApproval({...approval(), method: 'sampling/createMessage'}), false);
  // Only the pinned form shape: not URL mode, not a missing, null or non-object schema.
  assert.equal(isTextEditApproval(approval({mode: 'url', url: 'https://example.com/approve'})), false);
  assert.equal(isTextEditApproval(approval({mode: undefined})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: null})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: undefined})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'string', properties: {}}})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'object'}})), false);
  // Near-miss app names and bundle identifiers.
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "Textedit"?'})), false);
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "TextEdit" ?'})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.textedit'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'TextEdit'}})), false);
  assert.equal(isTextEditApproval(null), false);
});

test('a tree snapshot notices added, removed and rewritten entries, and an untouched tree compares equal', async t => {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(join(s.dir, 'a', 'b'), {recursive: true});
  writeFileSync(join(s.dir, 'a', 'b', 'file'), 'one');
  symlinkSync('b/file', join(s.dir, 'a', 'link'));
  const before = snapshotTree(s.dir);
  assert.equal(diffSnapshots(before, snapshotTree(s.dir)).same, true);
  writeFileSync(join(s.dir, 'a', 'b', 'file'), 'two');
  utimesSync(join(s.dir, 'a', 'b', 'file'), 1, 1);
  writeFileSync(join(s.dir, 'a', 'new'), '');
  const diff = diffSnapshots(before, snapshotTree(s.dir));
  assert.deepEqual(diff.changed.sort(), ['a', 'a/b/file']);
  assert.deepEqual(diff.added, ['a/new']);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.same, false);
});

test('archives, runtime trees, build output, credentials, logs, sockets and pointers are never tracked or packed', () => {
  const bad = ['ChatGPT-darwin-arm64.zip', 'runtimes/x/node', 'native/keychain/.build/release/cua-keychain', 'node_modules/x/index.js',
    'state/codex/auth.json', '.env', 'server.log', 'run/abc.sock', 'current.json'];
  assert.equal(forbiddenPaths(bad).length, bad.length);
  assert.deepEqual(forbiddenPaths(['src/runtime/install.mjs', 'runtime/releases/26.928.40906-darwin-arm64.json', 'README.md']), []);
});

test('the package must carry what runs, diagnoses and builds the helper', () => {
  const complete = [...PACKAGE_REQUIRED, 'runtime/releases/26.928.40906-darwin-arm64.json'];
  assert.deepEqual(missingFromPackage(complete), []);
  assert.deepEqual(missingFromPackage(complete.filter(p => p !== 'native/keychain/Package.swift')), ['native/keychain/Package.swift']);
  assert.deepEqual(missingFromPackage(PACKAGE_REQUIRED), ['runtime/releases/<release>.json']);
});

test('credential-looking strings are recognized, ordinary text is not', () => {
  // Assembled at run time so this file does not itself hold a token-shaped string the tracked-file scan would flag.
  const join = (...parts) => parts.join('');
  assert.equal(tokenLike(join('key = sk', '-proj-', 'abcdefghijklmnopqrstuvwxyz012345')), true);
  assert.equal(tokenLike(join('-----BEGIN OPENSSH ', 'PRIVATE KEY-----')), true);
  assert.equal(tokenLike(join('token gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789')), true);
  assert.equal(tokenLike('capability-token-for-test; sk-short; the sky service'), false);
});

const allProbeSteps = () => PROBE_SECRETS_PHASES.flatMap(p => p.steps).map(name => ({name, status: 'PASS', detail: ''}));

test('a live phase passes only when every expected step ran and passed; a step that never ran is blocked', () => {
  const steps = allProbeSteps();
  const phase = PROBE_SECRETS_PHASES.find(p => p.name.includes('every connection closed'));
  assert.equal(inventoryCheck(phase.name, steps, phase.steps).status, 'PASS');
  assert.equal(inventoryCheck(phase.name, steps.filter(s => s.name !== 'real serve: close'), phase.steps).status, 'BLOCKED');
  assert.match(inventoryCheck(phase.name, steps.filter(s => s.name !== 'real serve: close'), phase.steps).detail, /not executed: real serve: close/);
  assert.equal(inventoryCheck('one', [{name: 'cleanup', status: 'PASS', detail: 'removed'}], ['cleanup']).detail, 'cleanup: PASS (removed)', 'a single step keeps its own detail');
  const failed = steps.map(s => s.name === 'replaced value: close' ? {...s, status: 'FAIL'} : s);
  assert.equal(inventoryCheck(phase.name, failed, phase.steps).status, 'FAIL');
});

test('a child scenario\'s own verdict keeps every failure, even of a step no phase expects, and a missing report fails', () => {
  const expected = PROBE_SECRETS_PHASES.flatMap(p => p.steps);
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: allProbeSteps()}, expected).status, 'PASS');
  const extra = {status: 'FAIL', steps: [...allProbeSteps(), {name: 'unexpected', status: 'FAIL', detail: 'boom'}]};
  const verdict = scenarioVerdict('v', extra, expected);
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.detail, /steps no phase expects: unexpected: FAIL/);
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: [...allProbeSteps(), {name: 'x', status: 'FAIL'}]}, expected).status, 'FAIL', 'a step failure is not hidden by a PASS status');
  assert.equal(scenarioVerdict('v', null, expected).status, 'FAIL');
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: []}, expected).status, 'FAIL');
  assert.equal(scenarioVerdict('v', {status: 'BLOCKED', steps: allProbeSteps()}, expected).status, 'BLOCKED');
});

test('the trusted-root rows: a guarantee under the scoped default and an informational row for an explicit disabled, both in item 7 only', () => {
  const on = PROBE_SECRETS_PHASES.find(p => p.name.includes('sandbox scoped (default): trusted roots unwritable'));
  const off = PROBE_SECRETS_PHASES.find(p => p.name.includes('sandbox disabled (CUA_SHIM_SANDBOX=disabled)'));
  assert.ok(on && off);
  assert.doesNotMatch(on.name, /informational/);
  assert.match(off.name, /informational/);
  assert.match(off.name, /accepted/);
  for (const phase of [on, off]) {
    assert.ok(probePhasesFor(7).includes(phase));
    assert.ok(!probePhasesFor(6).includes(phase));
  }
  assert.ok(PROBE_SECRETS_PHASES.find(p => p.name.includes('every connection closed')).steps.includes('real serve (sandbox disabled): close'));
  const steps = allProbeSteps().map(s => off.steps.includes(s.name) ? {...s, status: 'INFO', detail: 'writable: src/services'} : s);
  const row = inventoryCheck(off.name, steps, off.steps);
  assert.equal(row.status, 'INFO');
  assert.match(row.detail, /INFO \(writable: src\/services\)/);
  assert.equal(inventoryCheck(off.name, steps.filter(s => !off.steps.includes(s.name)), off.steps).status, 'BLOCKED', 'an informational step that never ran is not quietly informational');
  const verdict = scenarioVerdict('v', {status: 'PASS', steps}, PROBE_SECRETS_PHASES.flatMap(p => p.steps));
  assert.equal(verdict.status, 'PASS');
  assert.doesNotMatch(verdict.detail, /not passed/);
  assert.match(verdict.detail, /informational: sandbox disabled/);
});

test('items 6 and 7 split the probe\'s phases as before: 6 the roundtrip, 7 substitution and its boundaries', () => {
  const names = item => probePhasesFor(item).map(p => p.name);
  assert.ok(names(6).some(n => n.includes('preconditions')) && names(6).some(n => n.includes('finally cleanup')));
  assert.ok(!names(6).some(n => n.includes('ordinary input')));
  assert.deepEqual(names(7).filter(n => !/trusted roots/.test(n)).map(n => n.split(':')[1].trim().split(' ')[0]), ['first', 'ordinary', 'fail']);
  assert.ok(names(6).some(n => n.includes('first substitution')) && names(6).some(n => n.includes('fail closed')));
  for (const phase of PROBE_SECRETS_PHASES) assert.ok(probePhasesFor(6).includes(phase) || probePhasesFor(7).includes(phase), phase.name);
});

test('per-connection approval is observed only with both connections bound, asked, answered and their files handled', () => {
  const conn = (name, over = {}) => ({name, bound: true, approvalRequests: 1, approvalsAccepted: 1, sessionFileWhileOpen: true, sessionFileAfterClose: false, ...over});
  const both = (a = {}, b = {}) => [conn('connection A', a), conn('connection B', b)];
  assert.equal(approvalObservation(both()).status, 'PASS');
  assert.equal(approvalObservation([conn('connection A')]).status, 'BLOCKED');
  assert.equal(approvalObservation(both({}, {bound: false})).status, 'BLOCKED');
  assert.equal(approvalObservation(both({approvalRequests: 0, approvalsAccepted: 0})).status, 'BLOCKED');
  assert.equal(approvalObservation(both({}, {sessionFileAfterClose: true})).status, 'FAIL');
  assert.equal(approvalObservation(both({}, {sessionFileAfterClose: null})).status, 'FAIL');
  assert.equal(approvalObservation(both({sessionFileWhileOpen: false})).status, 'FAIL');
  assert.equal(approvalObservation(both({approvalRequests: 2, approvalsAccepted: 1})).status, 'FAIL');
  assert.equal(approvalObservation(undefined).status, 'BLOCKED');
});

test('doctor health for acceptance: the remote-control rows are reported but never gate it; every other failure does (#56)', async t => {
  // The agent rows doctor really produces on an enrolled Mac with no launchd agent, whose screen is locked (temp homes,
  // a fake launchd domain and an injected console: nothing real is read).
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const userHome = join(s.dir, 'user');
  mkdirSync(userHome);
  enrollDevice({home});
  const agent = await agentChecks({home, env: {}, host: {platform: 'darwin', arch: 'arm64'}, launchd: {userHome, uid: UID, launchctl: fakeLaunchctl().run, settleMs: 1},
    checkConsole: async () => ({onConsole: true, locked: true})});
  assert.equal(agent.find(c => c.name === 'agent.console').status, 'fail', 'the fixture reproduces the locked console');
  const runtime = ['platform', 'runtime.installed', 'runtime.files', 'sandbox', 'helper.live', 'secrets.helper'].map(name => ({name, status: name === 'helper.live' ? 'blocked' : 'pass', detail: ''}));
  const report = (rows, ok = !rows.some(c => c.status === 'fail')) => ({ok, checks: rows});

  const locked = doctorHealth({code: 1, doctor: report([...runtime, ...agent])});
  assert.equal(locked.healthy, true, locked.detail);
  assert.match(locked.detail, /^exit 1; ok false; informational, not gating: .*agent\.console fail/);
  assert.doesNotMatch(locked.detail, /failing:/);

  const plain = doctorHealth({code: 0, doctor: report(runtime)});
  assert.deepEqual(plain, {healthy: true, detail: 'exit 0; ok true'}, 'nothing informational to print when no agent row applies');

  const broken = runtime.map(c => (c.name === 'runtime.files' ? {...c, status: 'fail'} : c));
  const both = doctorHealth({code: 1, doctor: report([...broken, ...agent])});
  assert.equal(both.healthy, false);
  assert.match(both.detail, /failing: runtime\.files;/);

  assert.equal(doctorHealth({code: 0, doctor: report([...runtime, ...agent], true)}).healthy, false, 'ok that contradicts its rows');
  assert.equal(doctorHealth({code: 0, doctor: report([...runtime, ...agent])}).healthy, false, 'an exit code that contradicts ok');
  assert.equal(doctorHealth({code: 1, doctor: report(runtime)}).healthy, false, 'nonzero exit from a healthy report');
  assert.deepEqual(doctorHealth({code: 1, doctor: null}), {healthy: false, detail: 'exit 1; no report'});
});
