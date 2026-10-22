// verify.mjs's arguments (#117 M3.3): every usage error exits 2 before a runtime is resolved or anything is served.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const VERIFY = fileURLToPath(new URL('../verify.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CUA_')));
const verify = (args, extra = {}) => spawnSync(process.execPath, [VERIFY, ...args], {encoding: 'utf8', env: {...env, CUA_HOME: '/nonexistent/cua-verify-cli', ...extra}, timeout: 20_000});

test('usage errors exit 2 with a sentence and serve nothing', () => {
  for (const [args, extra, pattern] of [
    [['--nope'], {}, /verify: Unknown option '--nope'/],
    [['--engine', 'sky'], {}, process.platform === 'darwin' ? /--engine must be vendor or cua/ : /--engine applies only to the computer surface on macOS/],
    [['--engine', 'cua'], {CUA_SHIM_SURFACES: 'browser'}, /--engine applies only to the computer surface on macOS/],
    [['--bind', 'TextEdit'], {}, process.platform === 'darwin' ? /--bind takes the bundle id of an app running with its window open/ : /--bind applies only to the computer surface on macOS/],
    [['--bind', 'com.apple.TextEdit'], {CUA_SHIM_SURFACES: 'browser'}, /--bind applies only to the computer surface on macOS/],
  ]) {
    const r = verify(args, extra);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, pattern);
    assert.equal(r.stdout, '', 'no report: nothing ran');
  }
});

test('an unknown CUA_NATIVE_ENGINE is a usage error where an engine is driven', {skip: process.platform !== 'darwin' && 'macOS only: no engine is driven elsewhere'}, () => {
  const r = verify([], {CUA_NATIVE_ENGINE: 'sky'});
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CUA_NATIVE_ENGINE must be vendor or cua/);
});
