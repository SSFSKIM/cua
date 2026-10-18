// A serve refused before its handshake exits nonzero, so an MCP client sees the failure: `cua serve` itself and the
// probe's serve wrapper (scripts/probe/serve-fake-sky-target.mjs, which probe-secrets' refused launch runs). Both run as
// children on the real code path against a secret store this user cannot enter (mode 0000) in a scratch HOME, with a
// forged active runtime in a scratch cua home.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {storeDir} from '../src/secrets/store.mjs';
import {REPO, forgeActiveRuntime} from './fixtures/runtime-fixture.mjs';

function unreadableStore(t) {
  const root = mkdtempSync(join(tmpdir(), 'cua-refused-serve-'));
  const home = join(root, 'cuahome'), user = join(root, 'user'), store = storeDir({HOME: user});
  mkdirSync(home);
  mkdirSync(store, {recursive: true});
  chmodSync(store, 0o000);
  t.after(() => { chmodSync(store, 0o700); rmSync(root, {recursive: true, force: true}); });
  forgeActiveRuntime(home);
  return {home, user};
}

// -> {code, signal, stdout, stderr} once the child exits, after one initialize request.
function serveOnce(args, {home, user}) {
  const child = spawn(process.execPath, args, {cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'],
    env: {PATH: process.env.PATH, HOME: user, CUA_HOME: home, CUA_REPL_HOST: 'vendor', TMPDIR: tmpdir()}});
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '0'}}})}\n`);
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
  return new Promise(resolve => child.on('exit', (code, signal) => { clearTimeout(timer); resolve({code, signal, stdout, stderr}); }));
}

for (const [label, args] of [
  ['cua serve', ['bin/cua.mjs', 'serve']],
  ['the probe\'s serve wrapper', ['scripts/probe/serve-fake-sky-target.mjs', join(REPO, 'scripts', 'probe', 'serve-fake-sky-target.mjs')]],
]) {
  test(`${label}, refused before its handshake by an unreadable store, exits 1 without answering`, async t => {
    const run = await serveOnce(args, unreadableStore(t));
    assert.match(run.stderr, /\[sandbox_state_invalid\]/);
    assert.equal(run.stdout, '', 'initialize is never answered');
    assert.deepEqual([run.code, run.signal], [1, null], run.stderr);
  });
}
