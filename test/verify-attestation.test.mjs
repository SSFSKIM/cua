// Any attestation mismatch refuses the run at once (#117 M3.3 review): verify.mjs and scripts/probe-lifecycle.mjs driven
// through the real `cua serve` on a fake installed home, whose upstream attests a foreign engine on a chosen js call
// after earlier ones attested the pinned vendor engine correctly. Nothing after the mismatch may be dispatched: no bind,
// no later scenario. The fake upstream records every message it receives.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';

const VERIFY = fileURLToPath(new URL('../verify.mjs', import.meta.url));
const LIFECYCLE = fileURLToPath(new URL('../scripts/probe-lifecycle.mjs', import.meta.url));
const skip = process.platform !== 'darwin' ? 'macOS only: an engine is pinned only for the macOS computer surface'
  : !installedHomeSupported && 'no checked-in pin for this host';
const FOREIGN = {engine: 'cua', version: '0.0.0', build: 'not-the-pinned-engine'};

function homeAttesting(t, {code, from}) {
  const home = fakeInstalledHome(t);
  const codexHome = join(home, 'state', 'codex');
  mkdirSync(codexHome, {recursive: true});
  writeFileSync(join(codexHome, 'fake-attestation.json'), JSON.stringify({code, from, attestation: FOREIGN}));
  return home;
}
const jsCodes = home => readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  .filter(entry => entry.received?.params?.name === 'js').map(entry => entry.received.params.arguments.code);
const run = (script, args, home) => new Promise(resolve => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CUA_')));
  const child = spawn(process.execPath, [script, ...args], {env: {...env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off'}, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  child.on('close', code => resolve({code, stdout, stderr}));
});

test('verify stops at a mismatch on its second result: the bind is never dispatched', {skip, timeout: 120_000}, async t => {
  const home = homeAttesting(t, {code: 'nodeRepl.write("cua-verify again")', from: 1});
  const r = await run(VERIFY, ['--engine', 'vendor', '--bind', 'com.apple.finder'], home);
  assert.equal(r.code, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.engine.attested, 2, 'the first result matched, the second was checked');
  assert.ok(report.problems.some(p => p.startsWith('verify failed: refused on the attestation: the result attested engine cua')), report.problems.join('\n'));
  assert.equal(report.bind, undefined, 'no bind began');
  assert.deepEqual(jsCodes(home), ['nodeRepl.write("cua-verify")', 'nodeRepl.write("cua-verify again")'], 'nothing was sent after the mismatch');
  assert.deepEqual(report.exit, {code: 0, signal: null}, 'the serve was closed through the cleanup');
});

test('probe-lifecycle stops at a mismatch on a later connection: no later scenario is dispatched', {skip, timeout: 180_000}, async t => {
  // The first connection's first result attests the vendor engine; the second connection's does not.
  const home = homeAttesting(t, {code: 'nodeRepl.write("ready")', from: 2});
  const r = await run(LIFECYCLE, ['--engine', 'vendor'], home);
  assert.equal(r.code, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.match(report.refused, /^refused on the attestation: the result attested engine cua/);
  assert.ok(report.cancelDuringJs, 'the first scenario ran');
  assert.equal(report.endTaskWithWorkInFlight, undefined);
  const codes = jsCodes(home);
  assert.equal(codes.filter(code => code === 'nodeRepl.write("ready")').length, 2);
  assert.equal(codes.at(-1), 'nodeRepl.write("ready")', 'nothing was sent after the mismatch');
  assert.ok(!codes.some(code => code.includes('inflight') || code.includes('stuck')));
  assert.equal(report.refusedServeExit.code, 0, 'the refused connection\'s serve was closed through EOF');
});
