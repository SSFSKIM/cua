// The browser-surface mode of the native baseline (#115 acceptance 11): a run with --surfaces browser makes the same
// cold connections as a native run, through cua's browser service and the browser surface alone, and makes no native
// call: no warm series, no app, no window. Every connection's answer carries the sandbox launch witness, which the
// same-host comparison reads. Doubles only: a scripted device and an MCP client that evaluates each cell.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {run} from '../../scripts/native-baseline.mjs';
import {readRuns, summarize} from '../../scripts/native-baseline/summary.mjs';

const AsyncFunction = (async () => {}).constructor;
const RELEASE = '26.928.40906-darwin-arm64';
const HOME = '/Users/someone/.local/share/cua-native-baseline/run-AbCdEf';
const OWN_NODE = {path: HOME + '/node/24.22.0/bin/node', version: 'v24.22.0'};
const LAUNCH = {launcher: 'codex-cli', tmpdir: 'inherited'};
const prepared = {device: 'mini', home: HOME, userHome: HOME + '/home', token: 'test-token', nodeMode: 'managed', nodeOverride: null, xSession: {}, ownNode: OWN_NODE};

function fakeDevice({textEditRunning = false, launch = () => LAUNCH} = {}) {
  const state = {record: true, scripts: [], serves: [], nativeTouched: [], calls: []};
  const pre = {ownNode: OWN_NODE, arch: 'arm64', hostname: 'mini', cpu: {model: 'Apple M2 Pro', count: 10}, uptime: 'device before', platform: 'darwin', node: 'v24.18.0',
    commit: 'c0ffee1', dirty: false, checkout: '/Users/someone/Developer/GitHub/cua-parity', home: HOME, release: RELEASE,
    handshakeRecord: `${HOME}/state/handshake/${RELEASE}/cua@0.1.0/browser@2025-06-18.json`, runtimeRoot: `${HOME}/runtimes/${RELEASE}`, spikeRunning: false, serves: 0,
    hardware: {model: 'Mac14,12', chip: 'Apple M2 Pro', memoryBytes: 17179869184}, os: {name: 'macOS', version: '27.0', build: '26A428'},
    display: {pixels: '5120 x 2880', resolution: '2560 x 1440', scale: 2}, textEditRunning, sandbox: {mode: 'scoped', explicit: false}};
  const remote = script => {
    state.scripts.push(script);
    if (script === 'uptime') return 'device after';
    if (/prepare.mjs prepare/.test(script)) return JSON.stringify(prepared);
    if (/prepare.mjs cleanup/.test(script)) return JSON.stringify({removed: true});
    if (script === 'true') return '';
    if (/hostIdentity/.test(script)) return JSON.stringify(pre);
    if (/cua-116-\[s\]pike/.test(script)) return 'idle';
    if (/^(rm -f|if \[ -f)/.test(script)) { if (script.startsWith('rm -f')) state.record = false; return state.record ? 'present' : 'absent'; }
    throw new Error(`unexpected script: ${script.slice(0, 80)}`);
  };
  // Any touch of the native API is recorded: the browser mode must make none.
  const cua = new Proxy({}, {get(_target, key) { state.nativeTouched.push(String(key)); return async () => { throw new Error('native call'); }; }});
  let connection = 0;
  const connect = options => {
    state.serves.push(options.args.at(-1));
    const n = ++connection;
    return {
      async initialize() { state.record = true; return {protocolVersion: '2025-06-18', serverInfo: {name: 'cua-repl-host', version: '0.1.0'}}; },
      async request(method, params) {
        state.calls.push(method);
        if (method === 'tools/list') return {tools: []};
        const written = [];
        Object.assign(globalThis, {cua, nodeRepl: {write: text => written.push(text)}});
        try { await new AsyncFunction(params.arguments.code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
        const witness = launch(n);
        return {content: [{type: 'text', text: written.join('\n')}],
          _meta: {'cua/nativeExecution': OWN_NODE, 'cua/replHost': {host: 'cua', version: '0.1.0'}, ...(witness ? {'cua/sandboxLaunch': witness} : {})}};
      },
      async call(name) { state.calls.push(name); return {content: [], structuredContent: {status: 'ended'}}; },
      async close() {},
    };
  };
  const device = {helpers: () => [], leftovers: () => ({serves: 0, textEditRunning})};
  return {state, pre, io: {remote, controllerLoad: () => 'controller load', device: () => device, connect}};
}

function outDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'native-browser-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return join(dir, 'run-1');
}
const results = out => readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const metaOf = out => JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8'));
const plan = {experiment: 'test-sitting', samples: 3, cold: 2, tasks: 2, log: () => {}};

test('a browser-surface run records the cold rows alone, through the browser surface and cua\'s browser service, with no native call', async t => {
  // TextEdit running is no reason to refuse: nothing of the run touches it.
  const {state, io} = fakeDevice({textEditRunning: true});
  const out = outDir(t);
  assert.equal(await run({device: 'mini', out, host: 'cua', surface: 'browser', ...plan, io}), 0);
  const meta = metaOf(out), rows = results(out);
  assert.equal(meta.complete, true, meta.error);
  assert.equal(meta.surface, 'browser');
  assert.deepEqual(meta.service, {surface: 'browser'});
  assert.deepEqual(meta.environment, {CUA_REPL_HOST: 'cua', CUA_SHIM_SURFACES: 'browser', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'});
  assert.deepEqual(meta.sandboxLaunch, LAUNCH);
  assert.equal(meta.connections, 2);
  assert.deepEqual([...new Set(rows.map(r => r.op))], ['ssh.roundtrip', 'cold.miss.initialize', 'cold.miss.tools_list', 'cold.miss.first_js', 'cold.miss.total',
    'cold.hit.initialize', 'cold.hit.tools_list', 'cold.hit.first_js', 'cold.hit.total']);
  assert.ok(rows.every(r => r.ok), JSON.stringify(rows.filter(r => !r.ok)));
  assert.deepEqual(state.nativeTouched, []);
  assert.ok(state.serves.every(s => /CUA_SHIM_SURFACES=browser CUA_BROWSER_SERVICE=cua /.test(s)), state.serves.join('\n'));
  // The preflight resolves the browser surface's handshake record and sandbox mode.
  const preflight = state.scripts.find(s => /hostIdentity/.test(s));
  assert.match(preflight, /browser@2025-06-18\.json/);
  assert.match(preflight, /surfaces: \[\\?"browser\\?"\]/);
  // The pooled summary finds the run whole for its plan.
  assert.deepEqual(summarize(readRuns(dirname(out))).problems, []);
});

test('a run refuses a surface set other than computer or browser, before preparing anything', async t => {
  const {state, io} = fakeDevice();
  await assert.rejects(run({device: 'mini', out: outDir(t), host: 'cua', surface: 'computer,browser', ...plan, io}), /--surfaces must be computer or browser/);
  assert.equal(state.scripts.length, 0);
});

test('a connection without the sandbox launch witness, or with another one, leaves the run incomplete', async t => {
  for (const [label, launch] of [['missing', n => (n === 2 ? null : LAUNCH)], ['inconsistent', n => (n === 2 ? {launcher: 'cua', tmpdir: 'session'} : LAUNCH)]]) {
    const {io} = fakeDevice({launch});
    const out = outDir(t);
    assert.equal(await run({device: 'mini', out, host: 'cua', surface: 'browser', ...plan, io}), 1, label);
    assert.match(metaOf(out).error, /sandbox launch witness/, label);
  }
});
