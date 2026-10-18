// A whole native-baseline run on Linux, against doubles only: a scripted device (the shell side) and an MCP client
// whose js tool evaluates each cell against the gedit desktop of ./gedit-double.mjs. It checks what a run records
// (every operation in order, the method cases' outcomes, each connection's host attestation), that the requested host
// must be the one that answered, and that the run's own gedit processes are ended whatever happens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {run} from '../../scripts/native-baseline.mjs';
import {geditDesktop} from './gedit-double.mjs';
import {textEdit} from './textedit-double.mjs';

const AsyncFunction = (async () => {}).constructor;
const RELEASE = '26.928.40906-linux-arm64';
const HOME = '/home/admin/.local/share/cua-native-baseline/run-AbCdEf';
const prepared = {device:'cua-linux',home:HOME,userHome:HOME+'/home',token:'test-token',nodeMode:'managed',nodeOverride:null,xSession:{DISPLAY:':0',XAUTHORITY:'/home/admin/.Xauthority',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus'},ownNode:{path:HOME+'/node/24.22.0/bin/node',version:'v24.22.0'}};
globalThis.__baselineTransitionMs = 200;
globalThis.__baselineWindowMs = 200;

// The device: preflight facts, the handshake record (cleared on request), and the Linux operations over the desktop.
function fakeDevice({host = 'vendor', geditRunning = false, desktop = geditDesktop()} = {}) {
  Object.assign(desktop.cua, {
    async getState() { return {apps: [{}, {}], browsers: [], errors: []}; },
    async listApps() { return [{isRunning: true}, {isRunning: false}]; },
  });
  const state = {desktop, record: true, clears: 0, spawned: [], terminated: [], scripts: []};
  const record = `${HOME}/state/handshake/${RELEASE}/${host === 'cua' ? 'cua@0.1.0' : `vendor@${RELEASE}`}/computer@2025-06-18.json`;
  const pre = {arch:'arm64',hostname:'vm',cpu:{model:'test CPU',count:4},uptime:'device before',ownNode:prepared.ownNode,platform: 'linux', node: 'v22.23.3', commit: 'c0ffee1', dirty: false, checkout: '/home/admin/Developer/GitHub/cua-parity', home: HOME, release: RELEASE,
    handshakeRecord: record, runtimeRoot: `${HOME}/runtimes/${RELEASE}`, spikeRunning: false, serves: 0,
    hardware: {model: null, chip: 'arm64, 4 CPUs', memoryBytes: 8e9}, os: {name: 'Ubuntu', version: '24.04.5 LTS', build: '7.0.0-38-generic'},
    display: {pixels: '1024 x 768', resolution: '1024 x 768', scale: 1, depth: 24}, x: {display: ':0', xauthority: '~/.Xauthority', xauthorityPresent: true, bus: 'unix:path=/run/user/1000/bus'},
    gedit: 'gedit - Version 46.2', geditRunning, sandbox: {mode: 'disabled', explicit: false}};
  const remote = script => {
    state.scripts.push(script);
    if (script === 'uptime') return 'device after';
    if (/prepare.mjs prepare/.test(script)) return JSON.stringify(prepared);
    if (/prepare.mjs cleanup/.test(script)) return JSON.stringify({removed:true});
    if (script === 'true') return '';
    if (/hostIdentity/.test(script)) return JSON.stringify(pre);
    if (/cua-116-\[s\]pike/.test(script)) return 'idle';
    if (/^(rm -f|if \[ -f)/.test(script)) { if (script.startsWith('rm -f')) { state.record = false; state.clears++; } return state.record ? 'present' : 'absent'; }
    throw new Error(`unexpected script: ${script.slice(0, 80)}`);
  };
  let n = 0;
  const device = {
    spawnGedit(role) {
      const dir = `/tmp/cua-native-baseline-Run00${n}`, file = `${dir}/${role}-00000${n}.txt`, pid = 5000 + n++;
      const entry = {pid, dir, file, role, id: desktop.open(file)};
      state.spawned.push(entry);
      return {pid, dir, file, role};
    },
    targetState(entry) { const w = state.spawned.find(e => e.pid === entry.pid); return desktop.windows.get(w.id).crashed || desktop.windows.get(w.id).closed ? 'exited' : 'survived'; },
    terminate(entries) {
      const result = {terminated: [], notOwned: [], gone: [], removed: []};
      for (const entry of entries) {
        const w = desktop.windows.get(state.spawned.find(e => e.pid === entry.pid).id);
        if (w.crashed || w.closed) result.gone.push(entry.pid); else { w.closed = true; result.terminated.push(entry.pid); state.terminated.push(entry.pid); }
        result.removed.push(entry.dir);
      }
      return result;
    },
    helpers: () => [{path: '~/.local/share/cua/runtimes/r/sky_linux_arm64', origin: 'pinned runtime', ageSeconds: 3}],
    leftovers: () => ({serves: 0, geditRunning: [...desktop.windows.values()].filter(w => !w.crashed && !w.closed).length}),
    crashReports: () => ({files: 1, newest: '2026-10-07T02:00:00.000Z'}),
  };
  return {state, pre, io: {remote, controllerLoad:()=> 'controller load', device: () => device, connect: options => fakeClient(options, desktop.cua, state)}};
}

// The MCP client: initialize answers as the answering host does, js evaluates the cell, end_task acknowledges.
function fakeClient(options, cua, state) {
  const own = state.answeringHost === 'cua';
  const meta = own ? {'cua/nativeExecution': state.answeringNode ?? prepared.ownNode, 'cua/replHost': {host: 'cua', version: '0.1.0'}, 'cua/taskId': 't'} : {'cua/nativeExecution': {path:HOME+'/runtimes/'+RELEASE+'/node',version:'v24.21.0'},'cua/taskId': 't'};
  meta['cua/sandboxLaunch'] = {launcher: 'codex-cli', tmpdir: 'inherited'};
  state.serves = [...(state.serves ?? []), options.args.at(-1)];
  state.options = options;
  return {
    elicited: [],
    // A serve that launched its runtime records the handshake for the next connection.
    async initialize() { state.record = true; return {protocolVersion: '2025-06-18', serverInfo: own ? {name: 'cua-repl-host', version: '0.1.0'} : {name: 'node_repl', version: '0.1.0'}}; },
    async request(method, params) {
      if (method === 'tools/list') return {tools: []};
      assert.equal(method, 'tools/call');
      assert.equal(params.name, 'js');
      const written = [];
      Object.assign(globalThis, {cua, nodeRepl: {write: text => written.push(text)}});
      try { await new AsyncFunction(params.arguments.code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
      return {content: [{type: 'text', text: `# Native apps\n${written.join('\n')}`}], _meta: meta};
    },
    async call(name) { assert.equal(name, 'end_task'); return {content: [], structuredContent: {status: 'ended'}}; },
    async close() {},
  };
}

function outDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'native-run-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return join(dir, 'run-1');
}
const results = out => readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const metaOf = out => JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8'));
const plan = {experiment:'test-sitting',samples: 3, cold: 2, tasks: 2, log: () => {}};

test('a Linux vendor-host run records every operation, the method cases and one host attestation per connection', async t => {
  const {state, io} = fakeDevice();
  state.answeringHost = 'vendor';
  const out = outDir(t);
  assert.equal(await run({device: 'cua-linux', out, host: 'vendor', ...plan, io}), 0);
  const meta = metaOf(out), rows = results(out);
  assert.equal(meta.complete, true, meta.error);
  assert.equal(meta.platform, 'linux');
  assert.deepEqual(meta.gedit.locale,{LANG:'C.UTF-8'});
  assert.equal(meta.host, 'vendor');
  assert.equal(meta.connections, 3);
  assert.deepEqual(meta.sandbox, {mode: 'disabled', explicit: false});
  assert.deepEqual(meta.hostAttestations, Array.from({length: 3}, () => ({host: 'vendor', serverInfo: {name: 'node_repl', version: '0.1.0'}, _meta: {'cua/nativeExecution':{path:HOME+'/runtimes/'+RELEASE+'/node',version:'v24.21.0'},'cua/taskId': 't','cua/sandboxLaunch':{launcher:'codex-cli',tmpdir:'inherited'}}})));
  assert.deepEqual(meta.sandboxLaunch, {launcher: 'codex-cli', tmpdir: 'inherited'});
  assert.equal(meta.surface, 'computer');
  assert.deepEqual(meta.environment, {CUA_REPL_HOST: 'vendor', CUA_SHIM_SURFACES: 'computer', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off', ...prepared.xSession});
  // The cold plan: a planned miss clears the record first; each connection is labelled by the record it found.
  assert.equal(state.clears, 1);
  const ops = [...new Set(rows.map(r => r.op))];
  assert.deepEqual(ops, ['ssh.roundtrip', 'cold.miss.initialize', 'cold.miss.tools_list', 'cold.miss.first_js', 'cold.miss.total', 'cold.hit.initialize', 'cold.hit.tools_list', 'cold.hit.first_js', 'cold.hit.total',
    'warm.noop', 'warm.getState', 'warm.listApps', 'setup.findWindow', 'bind.getApp', 'warm.getAXState', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.clear', 'task.total',
    'setup.findTarget', 'method.typeText', 'method.paste', 'method.paste.format', 'method.setValue', 'method.selectText', 'method.scroll.pages', 'end_task']);
  assert.ok(rows.every(r => r.ok), JSON.stringify(rows.filter(r => !r.ok)));
  assert.equal(rows.filter(r => r.op === 'task.total').length, 2);
  assert.deepEqual(rows.find(r => r.op === 'task.total' && r.sample === 2).outcome, 'typed with pressKey, verified, cleared');
  const method = name => { const {outcome, methodError, target} = rows.find(r => r.op === name); return {outcome, methodError, target}; };
  assert.deepEqual(method('method.typeText'), {outcome: 'threw', methodError: 'Resource temporarily unavailable (os error 11)', target: 'exited'});
  assert.deepEqual(method('method.paste'), {outcome: 'threw', methodError: 'Resource temporarily unavailable (os error 11)', target: 'exited'});
  assert.deepEqual(method('method.setValue'), {outcome: 'threw', methodError: 'setValue is unavailable on Linux; use click, pressKey, and typeText.', target: 'survived'});
  // Nothing typed with typeText or paste reached the scratch window; the scratch window was ended at cleanup.
  const scratch = state.spawned.find(e => e.role === 'scratch');
  assert.ok(!state.desktop.calls.some(c => c.id === scratch.id && c.method === 'type_text'));
  assert.deepEqual(state.terminated, [scratch.pid]);
  assert.deepEqual(meta.gedit.owned.map(e => e.role), ['scratch', 'victim', 'victim']);
  // The method cases' own windows were taken down by the methods: found gone, their directories removed at once.
  assert.deepEqual(meta.gedit.targetCleanup.map(c => [c.op, c.terminated.length, c.gone.length, c.removed.length]), [['method.typeText', 0, 1, 1], ['method.paste', 0, 1, 1]]);
  assert.deepEqual(meta.leftovers, {serves: 0, geditRunning: 0});
  assert.equal(meta.service.helpers[0].origin, 'pinned runtime');
  // No row carries a window title or the typed text.
  assert.doesNotMatch(JSON.stringify(rows), /scratch-0|the quick brown fox|cuabaselinemarker/);
});

test('a run whose connections answer another host than the one requested is not complete', async t => {
  const {state, io} = fakeDevice({host: 'cua'});
  state.answeringHost = 'vendor';
  const out = outDir(t);
  assert.equal(await run({device: 'cua-linux', out, host: 'cua', ...plan, io}), 1);
  const meta = metaOf(out);
  assert.equal(meta.complete, false);
  assert.match(meta.attestationProblem, /host attestation missing or mismatched \(requested cua\)/);
  assert.ok(state.serves.every(s => /CUA_REPL_HOST=cua /.test(s)));
});

test('the run refuses to start while gedit runs on the device: no window is opened, nothing is typed', async t => {
  const {state, io} = fakeDevice({geditRunning: true});
  state.answeringHost = 'vendor';
  await assert.rejects(run({device: 'cua-linux', out: outDir(t), host: 'vendor', ...plan, io}), /gedit is running on the device/);
  assert.equal(state.spawned.length, 0);
});

test('a cell that times out stops all further input, and the run still ends its own gedit', async t => {
  const {state, io} = fakeDevice();
  state.answeringHost = 'vendor';
  const connect = io.connect;
  io.connect = options => {
    const client = connect(options);
    const request = client.request.bind(client);
    client.request = async (method, params) => (/__observations\+\+;\nif \(before\.includes/.test(params?.arguments?.code ?? '') ? Promise.reject(new Error('MCP tools/call timed out')) : request(method, params));
    return client;
  };
  const out = outDir(t);
  assert.equal(await run({device: 'cua-linux', out, host: 'vendor', ...plan, io}), 1);
  const meta = metaOf(out);
  assert.match(meta.stopped, /task 1 timed out/);
  assert.ok(!results(out).some(r => r.op === 'task.clear' || r.op.startsWith('method.')));
  assert.deepEqual(state.terminated, [state.spawned[0].pid]);
});

// The macOS path through the same loop: TextEdit's approval (accepted only for that exact request), its launch panel,
// the scratch document, the guarded series, the delete-without-saving task and quitting the TextEdit the run launched.
// The mini's native runs serve the approved runtime copy in place (prepare.mjs): the double prepares one.
const reuseOf = home => ({approvedHome: home, release: '26.928.40906-darwin-arm64', runtimeRoot: `${home}/runtimes/26.928.40906-darwin-arm64`,
  helper: `${home}/runtimes/26.928.40906-darwin-arm64/SkyComputerUseService.app`, reason: 'reused'});
// One macOS vendor-host run against the doubles; `frontmost(app)` is the device's frontmost-application reader (#162).
async function macRun(t, {frontmost = () => 'com.apple.TextEdit'} = {}) {
  const app = textEdit();
  const state = {record: true, scripts: [], answeringHost: 'vendor'};
  const approval = {method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?', mode: 'form', requestedSchema: {type: 'object', properties: {}},
    _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app: 'com.apple.TextEdit'}}}};
  let launched = false;
  const cua = {
    async getState() { return {apps: [{}], browsers: [], errors: []}; },
    async listApps() { return [{isRunning: true}]; },
    async getApp(bundle) {
      const answer = state.options.answer(approval);
      state.options.onElicitation({t: new Date().toISOString(), method: approval.method, action: answer.action}, approval);
      if (answer.action !== 'accept' || bundle !== 'com.apple.TextEdit') throw new Error('declined');
      launched = true;
      return app;
    },
  };
  const release = '26.928.40906-darwin-arm64', home = '/Users/someone/Library/Application Support/cua';
  const ownNode = {path: `${home}/node/24.22.0/bin/node`, version: 'v24.22.0'};
  const pre = {ownNode,arch:'arm64',hostname:'mini',cpu:{model:'Apple',count:10},uptime:'device before',platform: 'darwin', node: 'v24.18.0', commit: 'c0ffee1', dirty: false, checkout: '/Users/someone/Developer/GitHub/cua-parity', home, release,
    handshakeRecord: `${home}/state/handshake/${release}/vendor@${release}/computer@2025-06-18.json`, runtimeRoot: `${home}/runtimes/${release}`, spikeRunning: false, serves: 0,
    hardware: {model: 'Mac14,12', chip: 'Apple M2 Pro', memoryBytes: 17179869184}, os: {name: 'macOS', version: '27.0', build: '26A428'},
    display: {pixels: '5120 x 2880', resolution: '2560 x 1440', scale: 2, virtual: true}, textEditRunning: false, sandbox: {mode: 'scoped', explicit: false}};
  const remote = script => {
    if (script === 'uptime') return 'device after';
    if (/prepare.mjs prepare/.test(script)) { state.prepareScript = script; return JSON.stringify({...prepared,device:'mini',xSession:{},home,ownNode,userHome:'/Users/someone',configHome:'/Users/someone/.local/share/cua-native-baseline/run-1/config',scratch:'/Users/someone/.local/share/cua-native-baseline/run-1',runtimeReuse:reuseOf(home),stashed:['state']}); }
    if (/prepare.mjs cleanup/.test(script)) return JSON.stringify({removed:true,restored:['state']});
    if (script === 'true') return '';
    if (/hostIdentity/.test(script)) return JSON.stringify(pre);
    if (/cua-116-\[s\]pike/.test(script)) return 'idle';
    if (script.startsWith('rm -f')) state.record = false;
    return state.record ? 'present' : 'absent';
  };
  const frontmosts = [];
  const device = {helpers: () => [], leftovers: () => ({serves: 0, textEditRunning: launched && !app.quit}),
    frontmost: () => { const id = frontmost(app); frontmosts.push(id); return id; }};
  const out = outDir(t);
  const code = await run({device: 'mini', out, host: 'vendor', approvedRuntime: home, ...plan, io: {remote, controllerLoad:()=> 'controller load', device: () => device, connect: options => fakeClient(options, cua, state)}});
  const meta = metaOf(out), rows = results(out);
  return {code, meta, rows, app, state, frontmosts, home};
}

test('a macOS vendor-host run keeps the TextEdit baseline\'s sequence and attests its host', async t => {
  const {code, meta, rows, app, state, frontmosts, home} = await macRun(t);
  assert.equal(code, 0, meta.error);
  assert.match(state.prepareScript, /"approvedHome":"\/Users\/someone\/Library\/Application Support\/cua"/);
  assert.equal(meta.measurement.freshInstall, false);
  assert.deepEqual(meta.runtimeReuse, reuseOf(home));
  assert.equal(state.options.args.at(-1).includes("XDG_CONFIG_HOME='/Users/someone/.local/share/cua-native-baseline/run-1/config'"), true);
  assert.deepEqual(meta.preparationCleanup, {removed: true, restored: ['state']});
  assert.deepEqual([...new Set(rows.map(r => r.op))], ['ssh.roundtrip', 'cold.miss.initialize', 'cold.miss.tools_list', 'cold.miss.first_js', 'cold.miss.total', 'cold.hit.initialize', 'cold.hit.tools_list', 'cold.hit.first_js', 'cold.hit.total',
    'warm.noop', 'warm.getState', 'warm.listApps', 'bind.getApp', 'approval.elicitation', 'setup.newDocument', 'warm.getAXState', 'guard.scratch', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.close', 'task.total', 'end_task']);
  assert.ok(rows.every(r => r.ok), JSON.stringify(rows.filter(r => !r.ok)));
  assert.deepEqual(meta.textEdit, {runningBefore: false, launchedByRun: true, quitByRun: true});
  assert.deepEqual(meta.leftovers, {serves: 0, textEditRunning: false});
  assert.deepEqual(meta.environment, {CUA_REPL_HOST: 'vendor', CUA_SHIM_SURFACES: 'computer', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'});
  assert.equal(meta.hostAttestations.length, 3);
  assert.equal(app.windows.length, 1);
  assert.equal(frontmosts.length, plan.tasks * 2 + 1, 'the frontmost app is read before every key-sending cell: each task\'s act and close, and the quit');
});

// #162: a super+w or super+q (and the task's super+n and typing) is sent only while TextEdit, which the run launched, is
// the frontmost application. Otherwise the key is not sent, the skip is recorded with the frontmost app's bundle id,
// and the run fails with no further input.
test('a macOS run whose target is not frontmost sends no key, records key_skipped_not_frontmost and fails', async t => {
  let reads = 0;
  // TextEdit is frontmost for the first task's act, then Chrome is before its close.
  const {code, meta, rows, app} = await macRun(t, {frontmost: () => (++reads === 1 ? 'com.apple.TextEdit' : 'com.google.Chrome')});
  assert.equal(code, 1);
  assert.ok(!app.keys.includes('super+w') && !app.keys.includes('super+q'), JSON.stringify(app.keys));
  assert.deepEqual(meta.keySkipped, [{event: 'key_skipped_not_frontmost', keys: ['super+w'], target: 'com.apple.TextEdit', frontmost: 'com.google.Chrome'}]);
  assert.match(meta.stopped, /key_skipped_not_frontmost.*com\.google\.Chrome/);
  assert.ok(rows.some(r => r.op === 'key.skipped' && r.ok === false && r.frontmost === 'com.google.Chrome'));
  assert.equal(meta.complete, false);
});

test('a method case whose read-back fails is recorded as failed, never as text that went in', async t => {
  const {state, io} = fakeDevice({desktop: geditDesktop({typeTextWorks: true, readBackFails: true})});
  state.answeringHost = 'vendor';
  const out = outDir(t);
  await run({device: 'cua-linux', out, host: 'vendor', ...plan, io});
  const row = results(out).find(r => r.op === 'method.typeText');
  assert.deepEqual({ok: row.ok, outcome: row.outcome, target: row.target, inserted: row.inserted}, {ok: false, outcome: 'returned', target: 'survived', inserted: undefined});
  assert.match(row.error, /read-back failed: Computer Use server error: accessibility tree unavailable/);
});

test('a run refuses a device whose sandbox policy cannot be resolved', async t => {
  const {state, pre, io} = fakeDevice();
  state.answeringHost = 'vendor';
  pre.sandbox = {mode: null, error: 'CUA_SHIM_SANDBOX must be scoped, disabled or default'};
  await assert.rejects(run({device: 'cua-linux', out: outDir(t), host: 'vendor', ...plan, io}), /sandbox policy.*CUA_SHIM_SANDBOX must be/);
});

test('a cua-host run names the own host\'s Node in every serve and records it, keeping the proxy on the device\'s node', async t => {
  const NODE = '/home/admin/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node';
  const {state, pre, io} = fakeDevice({host: 'cua'});
  state.answeringHost = 'cua';
  pre.ownNode = {path: NODE, version: 'v24.18.0'};
  state.answeringNode=pre.ownNode;
  const out = outDir(t);
  assert.equal(await run({device: 'cua-linux', out, host: 'cua', node: NODE, ...plan, io}), 0);
  const meta = metaOf(out);
  assert.equal(meta.complete, true, meta.error);
  assert.equal(meta.environment.CUA_NODE, NODE);
  assert.deepEqual(meta.ownNode, {path: NODE, version: 'v24.18.0'});
  assert.equal(meta.node, 'v22.23.3');
  assert.ok(state.scripts.find(s => /hostIdentity/.test(s)).includes(NODE));
  assert.ok(state.serves.length > 0 && state.serves.every(s => s.includes(`CUA_NODE='${NODE}'`)), state.serves.join('\n'));
});

test('a cua-host run refuses an own-host Node the device cannot run, before any serve starts', async t => {
  const {state, pre, io} = fakeDevice({host: 'cua'});
  state.answeringHost = 'cua';
  pre.ownNode = {path: '/nowhere/node', version: null};
  await assert.rejects(run({device: 'cua-linux', out: outDir(t), host: 'cua', node: '/nowhere/node', ...plan, io}), /own host's Node \/nowhere\/node did not run on the device/);
  assert.equal(state.serves, undefined);
});


test('a cloud run records machine and both load snapshots, keeps its X env and owns a fresh install', async t => {
  const {state,pre,io}=fakeDevice({host:'cua'});state.answeringHost='cua';
  pre.hostname='cloud-bench';pre.cpu={model:'Ampere',count:8};
  const remote=io.remote;
  io.remote=script=> /prepare.mjs prepare/.test(script) ? JSON.stringify({...prepared,device:'cua-bench',xSession:{DISPLAY:':7',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/2000/bus'}}) : remote(script);
  const out=outDir(t);
  assert.equal(await run({device:'cua-bench',out,host:'cua',...plan,io}),0);
  const meta=metaOf(out);
  assert.deepEqual(meta.deviceIdentity,{alias:'cua-bench',arch:'arm64',hostname:'cloud-bench',os:pre.os,cpu:{model:'Ampere',count:8}});
  assert.deepEqual(meta.load,{device:{before:'device before',after:'device after'},controller:{before:'controller load',after:'controller load'}});
  assert.equal(meta.measurement.freshInstall,true);
  assert.equal(meta.nodeMode,'managed');
  assert.equal(meta.environment.CUA_NODE,undefined);
  assert.equal(meta.environment.DISPLAY,':7');
  assert.ok(state.serves.every(s=>!s.includes('XAUTHORITY=')&&!s.includes('CUA_NODE=')));
  assert.equal(meta.preparationCleanup.removed,true);
});
test('a cached handshake and host marker without the answering executable cannot complete a run', async t => {
  const {state,io}=fakeDevice({host:'cua'});state.answeringHost='cua';
  const connect=io.connect;io.connect=options=>{const c=connect(options),request=c.request;c.request=async(...args)=>{const r=await request(...args);if(r._meta)delete r._meta['cua/nativeExecution'];return r;};return c;};
  const out=outDir(t);
  assert.equal(await run({device:'cua-linux',out,host:'cua',...plan,io}),1);
  assert.match(metaOf(out).error,/answering Node/);
});

test('one cold connection without executable proof invalidates otherwise successful warm measurements', async t => {
  const {state,io}=fakeDevice({host:'cua'});state.answeringHost='cua';
  const connect=io.connect;let first=true;
  io.connect=options=>{const c=connect(options),request=c.request;c.request=async(...args)=>{const r=await request(...args);if(first&&r._meta){first=false;delete r._meta['cua/nativeExecution'];}return r;};return c;};
  const out=outDir(t);
  assert.equal(await run({device:'cua-linux',out,host:'cua',...plan,io}),1);
  assert.match(metaOf(out).error,/answering Node/);
});
test('a refusal before connecting still removes the run-owned fresh installation', async t => {
  const {state,io}=fakeDevice({geditRunning:true});
  await assert.rejects(run({device:'cua-linux',out:outDir(t),host:'vendor',...plan,io}),/gedit is running/);
  assert.ok(state.scripts.some(s=>s.includes('prepare.mjs cleanup')));
  assert.equal(state.serves,undefined);
});

test('a macOS computer run refuses to start without the approved runtime, and one whose serve resolves another runtime', async t => {
  const scripts = [];
  const remote = script => { scripts.push(script); throw new Error('no device'); };
  await assert.rejects(run({device: 'mini', out: outDir(t), host: 'vendor', experiment: 'x', ...plan, io: {remote, controllerLoad: () => 'l', connect: () => { throw new Error('no'); }}}),
    /--approved-runtime/);
  assert.equal(scripts.length, 0, 'nothing ran on the device');
  const home = '/Users/someone/cua-115/home', release = '26.928.40906-darwin-arm64';
  const ownNode = {path: `${home}/node/24.22.0/bin/node`, version: 'v24.22.0'};
  const pre = {platform: 'darwin', commit: 'c0ffee1', dirty: false, checkout: '/c', home, release, runtimeRoot: `/elsewhere/runtimes/${release}`, serves: 0, sandbox: {mode: 'scoped'}, textEditRunning: false, ownNode};
  const cleaned = [];
  const remote2 = script => {
    if (/prepare.mjs prepare/.test(script)) return JSON.stringify({...prepared, device: 'mini', xSession: {}, home, ownNode, runtimeReuse: reuseOf(home)});
    if (/prepare.mjs cleanup/.test(script)) { cleaned.push(script); return JSON.stringify({removed: true, restored: []}); }
    if (/hostIdentity/.test(script)) return JSON.stringify(pre);
    if (/cua-116-\[s\]pike/.test(script)) return 'idle';
    throw new Error(`unexpected script: ${script.slice(0, 60)}`);
  };
  await assert.rejects(run({device: 'mini', out: outDir(t), host: 'vendor', approvedRuntime: home, experiment: 'x', ...plan, io: {remote: remote2, controllerLoad: () => 'l', connect: () => { throw new Error('no'); }}}),
    /resolves the runtime \/elsewhere\/runtimes\/26\.928\.40906-darwin-arm64, not the approved/);
  assert.equal(cleaned.length, 1, 'the stash is restored');
});
