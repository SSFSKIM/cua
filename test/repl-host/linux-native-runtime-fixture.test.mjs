// The Linux native runtime fixture's sky_linux double (test/fixtures/linux-native-runtime.mjs) runs the Node it is
// given by that path alone: a path with shell syntax in it ($(...), backticks, quotes) is data, never a command.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {linuxNativeRuntime} from '../fixtures/linux-native-runtime.mjs';

test('the helper double runs a Node whose path holds shell syntax, and executes none of it', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-node-path-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const hostile = join(dir, 'a $(touch pwned-subst) `touch pwned-tick` "q" \'s\' b');
  mkdirSync(hostile);
  const node = join(hostile, 'node');
  symlinkSync(process.execPath, node);
  const {runtime} = linuxNativeRuntime(t, {node});
  const ran = spawnSync(runtime.paths.skyLinuxBin, [], {cwd: dir, input: '', encoding: 'utf8', timeout: 20_000});
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(existsSync(join(dir, 'pwned-subst')), false, 'no command substitution ran');
  assert.equal(existsSync(join(dir, 'pwned-tick')), false, 'no backtick command ran');
});
