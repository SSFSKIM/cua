import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {reinstallCheck} from '../scripts/accept/reinstall.mjs';

// No runtime acquisition or engine process: the external CLI boundary returns its actual JSON contract.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'accept-reinstall-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'runtime'), 'unchanged runtime');
  return {runtimeRoot: root, cli: '/fixture/bin/cua.mjs', archivePath: '/must-not-read.zip', platform: 'darwin',
    env: {HOME: '/fixture/home', CUA_HOME: '/fixture/runtime', CUA_NATIVE_ENGINE: 'cua', CUA_SIGNING_IDENTITY: 'fixture identity'}};
}
const result = (extra = {}) => ({code: 0, stdout: JSON.stringify({ok: true, changed: false, engine: {skipped: 'not_selected'}, ...extra}), stderr: ''});

test('acceptance reinstall pins acquisition to vendor without changing the driven session environment', async t => {
  const options = fixture(t), env = {...options.env};
  const check = await reinstallCheck({...options, run: async (file, args, {env}) => {
    assert.equal(file, process.execPath);
    assert.deepEqual(args, [options.cli, 'install', '--json', '--archive', options.archivePath]);
    assert.equal(env.CUA_NATIVE_ENGINE, 'vendor');
    assert.equal(env.HOME, options.env.HOME);
    assert.equal(env.CUA_HOME, options.env.CUA_HOME);
    return result();
  }});
  assert.equal(check.status, 'PASS', check.detail);
  assert.match(check.detail, /engine.*not_selected/);
  assert.deepEqual(options.env, env);
});

test('an unchanged runtime cannot hide a missing engine skip, build, warning or failed command', async t => {
  const options = fixture(t);
  for (const answer of [
    result({engine: undefined}),
    result({engine: {status: 'pass', changed: true}}),
    result({engine: {status: 'pass', changed: false}}),
    result({engine: {status: 'warn'}}),
    result({ok: false}),
    {...result(), code: 1},
    {...result(), stdout: 'not JSON'},
  ]) {
    const check = await reinstallCheck({...options, run: async () => answer});
    assert.equal(check.status, 'FAIL', JSON.stringify(answer));
  }
});

test('reinstall still rejects mutations to the runtime tree even when the engine is skipped', async t => {
  const options = fixture(t);
  const check = await reinstallCheck({...options, run: async () => {
    writeFileSync(join(options.runtimeRoot, 'unexpected'), 'added');
    return result();
  }});
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /1 added/);
});

test('Linux reinstall has no macOS engine outcome to require', async t => {
  const check = await reinstallCheck({...fixture(t), platform: 'linux', run: async () => result({engine: undefined})});
  assert.equal(check.status, 'PASS', check.detail);
});
