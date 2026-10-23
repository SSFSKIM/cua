// Acceptance keeps failing assertion coordinates and safe operands, never arbitrary child output.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {tapDiagnostics} from '../scripts/accept/lib.mjs';

const root = '/checkout';
const block = (fields, name = 'assertion') => `not ok 1 - ${name}\n  ---\n  ${fields.join('\n  ')}\n  ...\n`;

test('retains nested failures and safe assertion operands with repository-relative coordinates', () => {
  const text = 'ok 1 - pass\n' + block([
    "location: '/checkout/test/case.test.mjs:5:1'", "failureType: 'testCodeFailure'", "code: 'ERR_ASSERTION'",
    'expected: true', 'actual: false', "operator: 'strictEqual'", 'stack: |-',
    '  TestContext.<anonymous> (file:///checkout/test/case.test.mjs:9:10)',
    '  Test.run (node:internal/test_runner/test:1103:25)',
  ]).split('\n').map(line => line ? `    ${line}` : line).join('\n');
  const report = tapDiagnostics(text, {root});
  assert.equal(report.truncated, false);
  assert.deepEqual(report.failures, [{name: 'assertion', location: '<repo>/test/case.test.mjs:5:1',
    failureType: 'testCodeFailure', code: 'ERR_ASSERTION', operator: 'strictEqual',
    expected: true, actual: false, stack: ['<repo>/test/case.test.mjs:9:10', 'node:internal/test_runner/test:1103:25']}]);
});

test('real failing TAP keeps the assertion line and numbers but withholds strings, error prose and objects', t => {
  const {dir, cleanup} = scratch();
  t.after(cleanup);
  const file = join(dir, 'fail.mjs');
  const sentinel = 'private-value-for-diagnostic-test';
  writeFileSync(file, `import {test} from 'node:test'; import assert from 'node:assert/strict';
test('counts', () => assert.equal(60, 58));
test('string', () => assert.equal(${JSON.stringify(sentinel)}, 'different'));
test('object', () => assert.deepEqual({password:${JSON.stringify(sentinel)}}, {}));
test('error', () => { throw new Error(${JSON.stringify(sentinel)}); });\n`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_TEST_CONTEXT'].includes(key)));
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {encoding: 'utf8', env});
  assert.equal(run.status, 1);
  assert.ok(run.stdout.includes(sentinel), 'the actual child output contains the unsafe operand');
  const report = tapDiagnostics(run.stdout, {root: dir});
  assert.equal(report.failures.length, 4);
  const counts = report.failures[0];
  assert.equal(counts.expected, 58);
  assert.equal(counts.actual, 60);
  assert.ok(counts.stack.some(frame => frame.startsWith('<repo>/fail.mjs:2:')));
  assert.equal(report.failures[1].actual.withheld, true);
  assert.equal(report.failures[2].actual.withheld, true);
  assert.equal(report.failures[3].error.withheld, true);
  assert.ok(!JSON.stringify(report).includes(sentinel));
  assert.ok(!JSON.stringify(report).includes(dir));
});

test('never retains untrusted path, stack labels, free-text fields or token-bearing names', () => {
  const token = ['sk', '-proj-', 'a'.repeat(32)].join('');
  const text = block(["location: '/private/owner/account/file.mjs:4:2'", "expected: 'secret'", 'actual:',
    '  password: unknown-value', 'error: |-', '  arbitrary private text', 'stack: |-',
    '  secretFunction (file:///checkout/test/case.test.mjs:8:3)',
    '  privateFunction (/private/owner/account/file.mjs:9:2)', 'custom: secret'], `failure ${token}`);
  const report = tapDiagnostics(text, {root});
  assert.deepEqual(report.failures[0].stack, ['<repo>/test/case.test.mjs:8:3']);
  assert.equal(report.failures[0].location, '<withheld>');
  for (const value of [token, 'unknown-value', 'secretFunction', 'privateFunction', 'arbitrary private text'])
    assert.ok(!JSON.stringify(report).includes(value), value);
});

test('TAP-looking lines inside an operand cannot forge a failure name or assertion fields', () => {
  const text = block(['error: |-', '  not ok 99 - private operand', '  ---', "  code: 'ERR_PRIVATE'", '  ...',
    "code: 'ERR_ASSERTION'", 'actual: false']);
  const report = tapDiagnostics(text, {root});
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].actual, false);
  assert.equal(report.failures[0].code, 'ERR_ASSERTION');
  assert.ok(!JSON.stringify(report).includes('private operand'));
});

test('missing diagnostics, unfinished blocks and limits remain explicit rather than losing failures silently', () => {
  assert.deepEqual(tapDiagnostics('not ok 1 - died\n', {root}).failures, [{name: 'died', diagnosticMissing: true}]);
  const unfinished = tapDiagnostics('not ok 1 - crashed\n  ---\n  actual: false\n', {root});
  assert.equal(unfinished.failures[0].diagnosticIncomplete, true);
  const limited = tapDiagnostics(block(['actual: false']) + block(['actual: true']), {root, maxFailures: 1});
  assert.equal(limited.failures.length, 1);
  assert.equal(limited.truncated, true);
  const long = tapDiagnostics(block([`error: '${'x'.repeat(200)}'`]), {root, maxBlockChars: 100});
  assert.equal(long.failures[0].diagnosticTruncated, true);
  assert.equal(long.truncated, true);
});
