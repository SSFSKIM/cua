import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveEnv, judgeLive, cellOutcome} from '../live-layer.mjs';

const paths = {node: '/r/node', nodeRepl: '/r/node_repl', moduleDir: '/r/mods', codexCli: '/r/codex', cuaRepl: '/r/cua-repl.mjs'};

test('liveEnv uses the vendor browser service with default network policy and exactly the selected sockets', () => {
  const ambient = {HOME: '/Users/u', TMPDIR: '/tmp/x', CODEX_HOME: '/Users/u/.codex', BROWSER_USE_DISABLE_AMBIENT_NETWORK: '1',
    BROWSER_USE_SECURITY_MODE: 'disabled-for-local-testing', NODE_REPL_TRUSTED_SERVICES: '{}', BROWSER_USE_BACKEND_PATHS: '/evil.sock', OPENAI_API_KEY: 'k'};
  const env = liveEnv({ambient, paths, codexHome: '/s/codex', sockets: ['/tmp/codex-browser-use/a.sock', '/tmp/codex-browser-use/b.sock']});
  assert.equal(env.BROWSER_USE_BACKEND_PATHS, '/tmp/codex-browser-use/a.sock:/tmp/codex-browser-use/b.sock');
  assert.equal(env.CODEX_HOME, '/s/codex');
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser');
  assert.equal(env.HOME, '/Users/u');
  for (const k of ['BROWSER_USE_DISABLE_AMBIENT_NETWORK', 'BROWSER_USE_SECURITY_MODE', 'NODE_REPL_TRUSTED_SERVICES', 'OPENAI_API_KEY', 'NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS']) assert.equal(k in env, false, k);
  assert.equal(env.NODE_REPL_TRUSTED_CODE_PATHS, '/r/mods');
});

test('liveEnv refuses an owned CODEX_HOME that is the user Codex home', () => {
  assert.throws(() => liveEnv({ambient: {HOME: '/Users/u'}, paths, codexHome: '/Users/u/.codex', sockets: ['/tmp/codex-browser-use/a.sock']}), /owned/);
});

test('cellOutcome classifies marker results and missing markers', () => {
  assert.deepEqual(cellOutcome({isError: false, result: {count: 3}}), {class: 'ok'});
  const refused = cellOutcome({isError: false, result: {error: 'Codex auth token is unavailable'}});
  assert.equal(refused.class, 'identity-or-auth');
  assert.equal(refused.text, 'Codex auth token is unavailable');
  assert.equal(cellOutcome({probeError: 'tools/call timed out after 60000 ms'}).class, 'transport');
});

const base = () => ({
  prerequisites: {runtime: true, signatures: {node: true, nodeRepl: true, codexCli: true, hosts: [true]}, socketCount: 2, hostCount: 2},
  handshake: {tools: ['js', 'js_reset'], browserSurfaceDocumented: true, computerSurfaceDocumented: false},
  listBrowsers: {class: 'ok', browsers: [{type: 'extension', family: 'chrome'}, {type: 'extension', family: 'chrome'}]},
  listTabs: [{class: 'identity-or-auth', text: 'x'}, {class: 'identity-or-auth', text: 'x'}],
  elicitations: [],
  cellsSent: ['listBrowsers', 'listTabs', 'listTabs'],
  teardown: {confirmed: true, leftovers: 0, hostsStillRunning: true},
});
const status = (scenarios, id) => scenarios.find(s => s.id === id).status;

test('judgeLive: identity refusal of listTabs is a PASS for the measurement', () => {
  const s = judgeLive(base());
  assert.equal(status(s, 'list-browsers'), 'PASS');
  assert.equal(status(s, 'list-tabs-policy'), 'PASS');
  assert.equal(status(s, 'read-only-cells'), 'PASS');
  assert.equal(status(s, 'owned-teardown'), 'PASS');
});

test('judgeLive: a non-extension or non-chrome browser fails listBrowsers; transport failure of listTabs fails', () => {
  const o = base();
  o.listBrowsers.browsers[1] = {type: 'cdp', family: 'chrome'};
  o.listTabs[0] = {class: 'transport', text: 'timed out'};
  const s = judgeLive(o);
  assert.equal(status(s, 'list-browsers'), 'FAIL');
  assert.equal(status(s, 'list-tabs-policy'), 'FAIL');
});

test('judgeLive: missing prerequisites block the live scenarios; an accepted elicitation or extra cell fails', () => {
  const o = base();
  o.prerequisites.signatures.hosts = [false];
  assert.equal(status(judgeLive(o), 'live-prerequisites'), 'BLOCKED');
  const p = base();
  p.elicitations = [{answered: 'accept'}];
  p.cellsSent.push('getTab');
  const s = judgeLive(p);
  assert.equal(status(s, 'elicitations-declined'), 'FAIL');
  assert.equal(status(s, 'read-only-cells'), 'FAIL');
});

test('judgeLive: unconfirmed teardown or a stopped host fails teardown', () => {
  const o = base();
  o.teardown = {confirmed: false, leftovers: 0, hostsStillRunning: true};
  assert.equal(status(judgeLive(o), 'owned-teardown'), 'FAIL');
  o.teardown = {confirmed: true, leftovers: 0, hostsStillRunning: false};
  assert.equal(status(judgeLive(o), 'owned-teardown'), 'FAIL');
});
