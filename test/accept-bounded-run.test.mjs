// accept-native's subprocess runner (scripts/accept/bounded-run.mjs): the deadline bounds completion even when a
// descendant outside the child's process group keeps its pipes open, and incomplete output is reported, never waited on.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runBounded} from '../scripts/accept/bounded-run.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

// A child that starts a grandchild in its own process group (out of reach of the timeout's group kill) holding the
// child's stdout, prints, and exits; the grandchild prints its pid so the test can end it.
const HOLDER = `const {spawn} = require('node:child_process');
const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {stdio: ['ignore', 'inherit', 'inherit'], detached: true});
process.stdout.write('holder ' + g.pid + '\\n');
g.unref();`;
const holderPid = stdout => Number(/holder (\d+)/.exec(stdout)?.[1]);
const end = pid => { try { process.kill(pid, 'SIGKILL'); } catch {} };

test('a child that exits while a detached descendant holds its pipes resolves within the drain bound, marked incomplete', async t => {
  const started = Date.now();
  const r = await runBounded(process.execPath, ['-e', HOLDER], {timeoutMs: 10_000, drainMs: 300});
  t.after(() => end(holderPid(r.stdout)));
  assert.ok(Date.now() - started < 5_000, 'not held until the descendant exits');
  assert.equal(r.code, 0);
  assert.equal(r.streamsIncomplete, true);
  assert.match(r.stdout, /holder \d+/, 'what arrived is kept');
});

test('a timed-out child is killed with its group and resolves within the drain bound even when its pipes stay held', async t => {
  const started = Date.now();
  const r = await runBounded(process.execPath, ['-e', `${HOLDER}\nsetTimeout(() => {}, 30000);`], {timeoutMs: 500, drainMs: 300});
  t.after(() => end(holderPid(r.stdout)));
  assert.ok(Date.now() - started < 5_000);
  assert.equal(r.timedOut, true);
  assert.equal(r.streamsIncomplete, true);
});

test('an ordinary child resolves with its complete output', async () => {
  const r = await runBounded(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 3'], {timeoutMs: 10_000});
  assert.deepEqual({code: r.code, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut, streamsIncomplete: r.streamsIncomplete},
    {code: 3, stdout: 'out', stderr: 'err', timedOut: false, streamsIncomplete: false});
});

// At accept-native's own boundary: item 1's npm test (a stand-in on PATH) leaves a descendant holding its pipes, after
// printing `out`. The run still ends; the report is returned.
function acceptWithHeldNpm(t, items, out = '') {
  const {dir, cleanup} = scratch();
  t.after(cleanup);
  const bin = join(dir, 'bin');
  mkdirSync(bin); mkdirSync(join(dir, 'home')); mkdirSync(join(dir, 'cua'));
  const holder = join(dir, 'holder.cjs');
  const pidFile = join(dir, 'holder.pid');
  writeFileSync(holder, `${HOLDER}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));\nprocess.stdout.write(${JSON.stringify(out)});`);
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nexec '${process.execPath}' '${holder}'\n`);
  chmodSync(join(bin, 'npm'), 0o700);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'CUA_NATIVE_ENGINE'].includes(key) && !key.startsWith('CUA_SHIM_')));
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/accept-native.mjs'), '--items', items], {encoding: 'utf8', timeout: 60_000,
    env: {...env, PATH: `${bin}:${env.PATH}`, HOME: join(dir, 'home'), CUA_HOME: join(dir, 'cua'), CUA_SHIM_SURFACES: 'browser'}});
  try { end(Number(readFileSync(pidFile, 'utf8'))); } catch { /* never started */ }
  return JSON.parse(r.stdout);
}
const COMPLETE_LOOKING = ['tests 1', 'suites 0', 'pass 1', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0', 'warnings 0'].map(line => `# ${line}\n`).join('');

test('accept-native fails the item whose subprocess output did not complete', t => {
  const report = acceptWithHeldNpm(t, '1');
  const check = report.items[0].checks[0];
  assert.equal(check.name, 'npm test');
  assert.equal(check.status, 'FAIL', JSON.stringify(check));
  assert.match(check.detail, /did not complete/);
  assert.equal(report.items[0].status, 'FAIL');
});

// The reproduced case: a complete-looking summary while a descendant holds the pipes. The suite verdict itself fails,
// so item 7, which cites item 1's suites, cannot pass on it.
test('incomplete suite output proves nothing downstream: --items 1,7 fails both', t => {
  const report = acceptWithHeldNpm(t, '1,7', COMPLETE_LOOKING);
  assert.deepEqual(report.summary, {1: 'FAIL', 7: 'FAIL'}, JSON.stringify(report.items));
  assert.equal(report.items.find(i => i.id === 1).checks[0].status, 'FAIL');
  assert.ok(report.items.find(i => i.id === 7).checks.every(c => c.status === 'FAIL' && /npm test was FAIL/.test(c.detail)));
});

test('a command that cannot start resolves with its error', async () => {
  const r = await runBounded('/nonexistent/command', [], {timeoutMs: 1_000});
  assert.equal(r.code, null);
  assert.equal(r.error, 'ENOENT');
});
