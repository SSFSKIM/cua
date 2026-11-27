// The Linux native runtime fixture's sandbox helper double (test/fixtures/linux-native-runtime.mjs) runs the command it
// is given by that path alone: a path with shell syntax in it ($(...), backticks, quotes) is data, never a command.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {helperFor} from '../../src/sandbox/linux.mjs';
import {linuxNativeRuntime} from '../fixtures/linux-native-runtime.mjs';

test('the helper double runs a Node whose path holds shell syntax, and executes none of it', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-node-path-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const hostile = join(dir, 'a $(touch pwned-subst) `touch pwned-tick` "q" \'s\' b');
  mkdirSync(hostile);
  const node = join(hostile, 'node');
  symlinkSync(process.execPath, node);
  const fixture = linuxNativeRuntime(t);
  const ran = spawnSync(helperFor({home: fixture.home, arch: 'arm64'}).path, ['--sandbox-policy-cwd', dir, '--', node, '-e', 'process.exit(0)'],
    {cwd: dir, input: '', encoding: 'utf8', timeout: 20_000});
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(existsSync(join(dir, 'pwned-subst')), false, 'no command substitution ran');
  assert.equal(existsSync(join(dir, 'pwned-tick')), false, 'no backtick command ran');
  assert.deepEqual(fixture.launches(), [['--sandbox-policy-cwd', dir, '--', node, '-e', 'process.exit(0)']], 'its argv recorded as given');
});
