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
  const tap = `TAP version 13\nnot ok 1 - candidate lane\n  ---\n  location: '${REPO}/test/native-baseline/run.test.mjs:438:1'\n  failureType: 'testCodeFailure'\n  error: '${sentinel}'\n  code: 'ERR_ASSERTION'\n  expected: true\n  actual: false\n  operator: 'strictEqual'\n  stack: |-\n    TestContext.<anonymous> (file://${REPO}/test/native-baseline/run.test.mjs:451:10)\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  const script = join(dir, 'npm.mjs');
  writeFileSync(script, `process.stdout.write(${JSON.stringify(tap)}); process.exitCode = 1;\n`);
  const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)}\n`);
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
  assert.equal(check.totals.fail, 1);
  assert.equal(check.diagnostics.failures[0].actual, false);
  assert.deepEqual(check.diagnostics.failures[0].stack, ['<repo>/test/native-baseline/run.test.mjs:451:10']);
  assert.ok(!text.includes(sentinel));
  assert.deepEqual(JSON.parse(run.stdout), report);
});
