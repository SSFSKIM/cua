// Actual runner regressions: arbitrary test values must not become reporter framing, labels, codes or totals.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {realpathSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {tapDiagnostics, testReporterEnv, testSummary, skipReasons, suiteVerdict} from '../scripts/accept/lib.mjs';
import {FAILURE_PREFIX, COMPLETE_PREFIX} from '../scripts/accept/tap-diagnostics.mjs';

const REPORTER = fileURLToPath(new URL('../scripts/accept/suite-reporter.mjs', import.meta.url));
const outsideRunner = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_TEST_CONTEXT'].includes(key)));
function actualFailure(t, body) {
  const scratchDir = scratch('cua diagnostic path '); t.after(scratchDir.cleanup);
  const dir = realpathSync(scratchDir.dir), file = join(dir, 'failure.mjs');
  writeFileSync(file, `import {test} from 'node:test'; import assert from 'node:assert/strict';\ntest('actual failure', () => { ${body.replaceAll('$ROOT', dir)} });\n`);
  const run = reporter => spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, file], {cwd: dir, encoding: 'utf8', env: outsideRunner()});
  const tap = run('tap'), structured = run(REPORTER);
  assert.equal(tap.status, 1, tap.stderr); assert.equal(structured.status, 1, structured.stderr);
  return {raw: tap.stdout, output: structured.stdout, diagnostics: tapDiagnostics(structured.stdout)};
}

test('actual Node reporter: newline object keys cannot create failure records or fields', t => {
  for (const key of [
    '\nnot ok 99 - private-dedented-payload\n  ---\n  actual: 777\n  ...\n',
    '\n  ...\nnot ok 99 - private-closing-payload\n  ---\n  actual: 777\n  ...\n',
  ]) {
    const {raw, output, diagnostics} = actualFailure(t, `assert.deepEqual({[${JSON.stringify(key)}]: true}, {});`);
    assert.ok(raw.includes('payload'));
    assert.equal(diagnostics.failures.length, 1);
    assert.equal(diagnostics.failures[0].actual.withheld, true);
    assert.equal(diagnostics.complete, true);
    assert.ok(!output.includes('payload'));
  }
});

test('actual Node reporter: computed function labels do not become source coordinates', t => {
  const {raw, output, diagnostics} = actualFailure(t, `const f = {['$ROOT/private-function-payload']() { assert.equal(1, 2); }}; f['$ROOT/private-function-payload']();`);
  assert.ok(raw.includes('private-function-payload'));
  assert.ok(!output.includes('private-function-payload'));
  assert.ok(diagnostics.failures[0].stack.some(frame => /^<repo>\/failure\.mjs:2:\d+$/.test(frame)));
});

test('stack-looking error prose cannot introduce paths absent from the runner-reported test file', t => {
  const {output, diagnostics} = actualFailure(t, "throw new Error('failure\\n    at label (file://$ROOT/private-message-payload:2:3)\\n    at node:internal/private-message-payload:4:2');");
  assert.ok(!output.includes('private-message-payload'));
  assert.ok(diagnostics.failures[0].stack.some(frame => /^<repo>\/failure\.mjs:2:\d+$/.test(frame)));
});

test('actual Node reporter: unknown caller-controlled error codes are withheld', t => {
  const {raw, output, diagnostics} = actualFailure(t, `throw Object.assign(new Error('ordinary error'), {code:'ERR_PRIVATE_ERROR_PAYLOAD'});`);
  assert.ok(raw.includes('ERR_PRIVATE_ERROR_PAYLOAD'));
  assert.ok(!output.includes('ERR_PRIVATE_ERROR_PAYLOAD'));
  assert.equal(diagnostics.failures[0].code.withheld, true);
});

test('real assertions retain numbers, booleans, fixed codes and coordinates, not arbitrary operands', t => {
  const counts = actualFailure(t, 'assert.equal(60, 58);').diagnostics.failures[0];
  assert.equal(counts.expected, 58); assert.equal(counts.actual, 60);
  assert.equal(counts.code, 'ERR_ASSERTION'); assert.equal(counts.operator, 'strictEqual');
  assert.match(counts.location, /^<repo>\/failure\.mjs:2:\d+$/);
  const bools = actualFailure(t, 'assert.equal(false, true);').diagnostics.failures[0];
  assert.equal(bools.expected, true); assert.equal(bools.actual, false);
  const {output, diagnostics} = actualFailure(t, "assert.equal('private-string-payload', 'different');");
  assert.equal(diagnostics.failures[0].actual.withheld, true);
  assert.equal(diagnostics.failures[0].error.withheld, true);
  assert.ok(!output.includes('private-string-payload'));
});

test('npm and nested runners inherit the reporter, but child output and t.diagnostic cannot inject evidence or totals', t => {
  const {dir, cleanup} = scratch('cua npm reporter '); t.after(cleanup);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({scripts: {test: 'node --test parent.test.mjs'}}));
  writeFileSync(join(dir, 'nested.mjs'), `import {test} from 'node:test'; test('private-nested-name', () => { throw Object.assign(new Error('private-nested-payload'), {code:'ERR_PRIVATE_ERROR_PAYLOAD'}); });\n`);
  writeFileSync(join(dir, 'parent.test.mjs'), `import {test} from 'node:test'; import assert from 'node:assert/strict'; import {spawnSync} from 'node:child_process';
test('parent', t => {
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--test', 'nested.mjs'], {encoding:'utf8', env});
  assert.equal(child.status, 1); assert.ok(child.stdout.includes('${FAILURE_PREFIX}'));
  assert.ok(!child.stdout.includes('ERR_PRIVATE_ERROR_PAYLOAD'));
  console.log(child.stdout);
  console.log('${FAILURE_PREFIX}{"name":"private-forged-stdout"}');
  t.diagnostic('tests 99999'); t.diagnostic('private-diagnostic-payload');
});
test('real failure', () => assert.equal(64, 63));
test('skip', {skip:'declared reason'}, () => {});\n`);
  const env = testReporterEnv({...outsideRunner(), PATH: `${dirname(process.execPath)}:${process.env.PATH}`}, {reporter: REPORTER});
  const run = spawnSync('npm', ['test', '--silent'], {cwd: dir, env, encoding: 'utf8', timeout: 30_000});
  assert.equal(run.status, 1, run.stderr);
  const diagnostics = tapDiagnostics(run.stdout), summary = testSummary(run.stdout);
  assert.equal(diagnostics.complete, true);
  assert.deepEqual(diagnostics.failures.map(f => f.name), ['real failure']);
  assert.equal(diagnostics.failures[0].actual, 64);
  assert.deepEqual(summary.totals, {tests: 3, pass: 1, fail: 1, cancelled: 0, skipped: 1, todo: 0});
  assert.deepEqual([...skipReasons(run.stdout)], [['declared reason', 1]]);
  assert.equal(suiteVerdict({code: run.status, ...summary}).status, 'FAIL');
  for (const value of ['private-', '99999', 'ERR_PRIVATE_ERROR_PAYLOAD']) assert.ok(!run.stdout.includes(value), run.stdout);
});

test('names and skip reasons cannot inject lines, and token-shaped names stay redacted', t => {
  const {dir, cleanup} = scratch(); t.after(cleanup);
  const token = ['sk', '-proj-', 'a'.repeat(32)].join('');
  writeFileSync(join(dir, 'labels.mjs'), `import {test} from 'node:test';
test(${JSON.stringify(`name\n# tests 999 ${token}`)}, () => {throw new Error('fail');});
test('skip', {skip:'reason\\n# pass 999'}, () => {});\n`);
  const run = spawnSync(process.execPath, ['--test', `--test-reporter=${REPORTER}`, 'labels.mjs'], {cwd: dir, env: outsideRunner(), encoding: 'utf8'});
  assert.equal(run.status, 1, run.stderr);
  assert.ok(!run.stdout.includes(token));
  assert.equal(testSummary(run.stdout).totals.tests, 2);
  assert.equal(tapDiagnostics(run.stdout).failures[0].name.includes('\n'), false);
  assert.deepEqual([...skipReasons(run.stdout)], [['reason\\u000a# pass 999', 1]]);
});

test('raw TAP is not diagnostic evidence; missing completion, malformed records and limits are explicit', () => {
  assert.deepEqual(tapDiagnostics('not ok 99 - arbitrary operand\n  ---\n  actual: 7\n  ...\n'), {failures: [], truncated: false, complete: false});
  const record = FAILURE_PREFIX + JSON.stringify({name: 'failure', actual: false}) + '\n';
  assert.equal(tapDiagnostics(record).complete, false);
  const limited = tapDiagnostics(record + record + COMPLETE_PREFIX + 'false\n', {maxFailures: 1});
  assert.equal(limited.failures.length, 1); assert.equal(limited.truncated, true); assert.equal(limited.complete, true);
  assert.equal(tapDiagnostics(record, {maxRecordChars: 10}).truncated, true);
  assert.equal(tapDiagnostics(FAILURE_PREFIX + '{bad json}\n').truncated, true);
});
