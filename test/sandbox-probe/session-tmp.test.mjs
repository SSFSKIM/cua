// #115 M2's helper check (scripts/sandbox-probe/session-tmp.mjs): does the native helper write under the session temp
// it inherits through node_repl's environment? What appears there besides node_repl's own script directories, and what
// a run's own helper holds open under it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openUnder, sessionTmpEntries, sessionTmpVerdict} from '../../scripts/sandbox-probe/session-tmp.mjs';

test('the entries under the session temp, without node_repl\'s script directories', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-stmp-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  mkdirSync(join(dir, '.tmpAbC123'));
  writeFileSync(join(dir, '.tmpAbC123', 'kernel.js'), '');
  mkdirSync(join(dir, '.tmpZz9999'));
  writeFileSync(join(dir, '.tmpZz9999', 'trusted-worker.js'), '');
  mkdirSync(join(dir, 'com.openai.sky', 'shots'), {recursive: true});
  writeFileSync(join(dir, 'com.openai.sky', 'shots', 'a.png'), 'x');
  mkdirSync(join(dir, '.tmpEmpty1'));
  assert.deepEqual(sessionTmpEntries(dir), ['.tmpEmpty1', 'com.openai.sky', 'com.openai.sky/shots', 'com.openai.sky/shots/a.png']);
  assert.deepEqual(sessionTmpEntries(join(dir, 'absent')), null, 'a session temp already removed');
});

test('what a helper holds open under the session temp, from lsof\'s name lines', () => {
  const exec = (cmd, args) => {
    assert.equal(cmd, '/usr/sbin/lsof');
    assert.deepEqual(args, ['-nP', '-p', '42', '-Fn']);
    return 'p42\nfcwd\nn/\nf3\nn/h/run/s1/tmp/sky/frame.bin\nf4\nn/h/run/s1/tmpx/other\nf5\nn/h/run/s1/tmp\n';
  };
  assert.deepEqual(openUnder(42, '/h/run/s1/tmp', {exec}), ['/h/run/s1/tmp', '/h/run/s1/tmp/sky/frame.bin']);
  assert.deepEqual(openUnder(43, '/h/run/s1/tmp', {exec: () => { throw Object.assign(new Error('exit 1'), {status: 1}); }}), [], 'a helper gone');
});

test('the verdict: the helper writes there when it holds something open there or anything but node_repl\'s scripts appears', () => {
  assert.deepEqual(sessionTmpVerdict([{label: 'a', entries: [], helperOpen: []}, {label: 'b', entries: [], helperOpen: []}]),
    {helperOpen: [], entries: [], writes: false, observations: 2});
  assert.deepEqual(sessionTmpVerdict([{label: 'a', entries: ['x'], helperOpen: []}, {label: 'b', entries: ['x', 'y'], helperOpen: ['/t/y']}]),
    {helperOpen: ['/t/y'], entries: ['x', 'y'], writes: true, observations: 2});
  assert.equal(sessionTmpVerdict([]).writes, null, 'nothing observed decides nothing');
});
