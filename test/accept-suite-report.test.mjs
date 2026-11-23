// Exercise the acceptance CLI's real report boundary using a hermetic npm stand-in, never a full suite or engine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

test('item 1 writes safe failing assertion diagnostics into its report artifact and keeps FAIL', t => {
  const {dir, cleanup} = scratch();
  t.after(cleanup);
  const bin = join(dir, 'bin'), home = join(dir, 'home'), reportPath = join(dir, 'acceptance.json');
  mkdirSync(bin); mkdirSync(home); mkdirSync(join(dir, 'cua'));
  const sentinel = 'private-child-output-should-not-survive';
  const script = join(dir, 'failure.mjs');
  const forgedKey = `\n  ...\nnot ok 99 - ${sentinel}\n  ---\n  actual: 777\n  ...\n`;
  writeFileSync(script, `import {test} from 'node:test'; import assert from 'node:assert/strict';
  test('candidate lane', () => assert.equal(false, true, ${JSON.stringify(sentinel)}));
  test('object operand', () => assert.deepEqual({[${JSON.stringify(forgedKey)}]:true}, {}));
  test('code', () => {throw Object.assign(new Error('failure'), {code:'ERR_PRIVATE_ERROR_PAYLOAD'});});\n`);
  const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
  // Run actual node:test, inheriting acceptance's reporter options, in an isolated fixture checkout.
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\ncd ${quote(dir)}\nexec ${quote(process.execPath)} --test ${quote(script)}\n`);
  chmodSync(join(bin, 'npm'), 0o700);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'CUA_NATIVE_ENGINE'].includes(key) && !key.startsWith('CUA_SHIM_')));
  const run = spawnSync(process.execPath, [join(REPO, 'scripts/accept-native.mjs'), '--items', '1', '--report', reportPath], {
    encoding: 'utf8', timeout: 30_000, env: {...env, PATH: `${bin}:${env.PATH}`, HOME: home, CUA_HOME: join(dir, 'cua'), CUA_SHIM_SURFACES: 'browser'},
  });
  assert.equal(run.status, 1, run.stderr);
  assert.ok(existsSync(reportPath), run.stderr);
  const text = readFileSync(reportPath, 'utf8'), report = JSON.parse(text);
  assert.equal(report.status, 'FAIL');
  const check = report.items[0].checks[0];
  assert.equal(check.status, 'FAIL');
  assert.equal(check.totals.fail, 3);
  assert.equal(check.diagnostics.complete, true);
  assert.deepEqual(check.diagnostics.failures.map(f => f.name), ['candidate lane', 'object operand', 'code']);
  assert.equal(check.diagnostics.failures[0].actual, false);
  assert.ok(check.diagnostics.failures[0].stack.some(frame => /^<repo>\/failure\.mjs:2:\d+$/.test(frame)));
  assert.ok(!text.includes(sentinel));
  assert.ok(!text.includes('ERR_PRIVATE_ERROR_PAYLOAD'));
  assert.ok(!check.detail.includes(sentinel), 'failure names in detail also come only from structured events');
  assert.deepEqual(JSON.parse(run.stdout), report);
});
