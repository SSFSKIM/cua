// cua's own Node processes start with --disable-sigusr1 (docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-
// design.md, Purpose (a); Acceptance 7): without it a same-user `kill -USR1` opens Node's inspector inside the process,
// which lets the sender run code as the root of the relay's tree or as one of its descendants. The plugin starts the
// shim (`cua serve`) with the flag, and spawnUpstream starts the runtime's anchor with it. The vendor runtime's own
// processes are not cua's to start and stay as they are.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {closeSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnUpstream} from '../src/mcp/upstream.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const FAKE = join(REPO, 'test', 'fixtures', 'fake-upstream-process.mjs');
const INSPECTOR = /Debugger listening|inspector/i;
// How long a process is given to open its inspector after the signal (it takes a few milliseconds when it does).
const SIGNAL_SETTLE_MS = 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Starts `node <flags> <idle script>`; resolves once its startup is done (Node's signal handling installed), with the
// stderr it writes from then on.
async function idleNode(t, flags) {
  const s = scratch();
  t.after(s.cleanup);
  const script = join(s.dir, 'idle.mjs');
  writeFileSync(script, "process.stdout.write('ready\\n'); setTimeout(() => process.exit(0), 20000);\n");
  const child = spawn(process.execPath, [...flags, script], {stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => child.kill('SIGKILL'));
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  await new Promise(resolve => child.stdout.once('data', resolve));
  return {pid: child.pid, stderr: () => stderr};
}

test('the plugin starts the shim with --disable-sigusr1, before the shim path', () => {
  const {mcpServers: {cua_repl: server}} = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(server.command, 'node');
  assert.deepEqual(server.args, ['--disable-sigusr1', '${CLAUDE_PLUGIN_ROOT}/cua-shim.mjs']);
});

test('a stock Node process answers SIGUSR1 with an inspector (what the flag prevents; the probe below sees it)', async t => {
  const child = await idleNode(t, ['--inspect-port=0']);
  process.kill(child.pid, 'SIGUSR1');
  const deadline = Date.now() + 5000;
  while (!INSPECTOR.test(child.stderr()) && Date.now() < deadline) await sleep(10);
  assert.match(child.stderr(), /Debugger listening on ws:\/\/127\.0\.0\.1:/);
});

test('started with the plugin\'s flags, a Node process ignores SIGUSR1: no inspector, still running', async t => {
  const {mcpServers: {cua_repl: server}} = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const flags = server.args.filter(arg => arg.startsWith('--'));
  const child = await idleNode(t, flags);
  process.kill(child.pid, 'SIGUSR1');
  await sleep(SIGNAL_SETTLE_MS);
  assert.doesNotMatch(child.stderr(), INSPECTOR);
  assert.equal(alive(child.pid), true);
});

test('spawnUpstream\'s anchor ignores SIGUSR1: no inspector, the runtime still served', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const stderrPath = join(s.dir, 'stderr');
  const stderr = openSync(stderrPath, 'w');
  const upstream = spawnUpstream({command: process.execPath, args: [FAKE, 'echo'], env: {PATH: process.env.PATH}, cwd: process.cwd()}, {stderr});
  closeSync(stderr);
  t.after(() => upstream.terminate({budgetMs: 3000}));
  const replies = [];
  upstream.onMessage(message => replies.push(message));
  const ping = async id => {
    upstream.send({jsonrpc: '2.0', id, method: 'ping'});
    for (let i = 0; i < 300 && !replies.some(m => m.id === id); i++) await sleep(10);
    return replies.some(m => m.id === id);
  };
  assert.equal(await ping(1), true, 'the runtime answers before the signal');
  process.kill(upstream.pid, 'SIGUSR1');
  await sleep(SIGNAL_SETTLE_MS);
  assert.doesNotMatch(readFileSync(stderrPath, 'utf8'), INSPECTOR);
  assert.equal(alive(upstream.pid), true, 'the anchor still holds the group');
  assert.equal(await ping(2), true, 'and the runtime still answers');
});
