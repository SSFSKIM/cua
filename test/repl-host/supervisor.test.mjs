// cua's own REPL host end to end below cua's proxy: a real supervisor and kernel over MCP, with a sandbox-launcher
// double (supervisor-harness.mjs). The sentences and orderings asserted are the pinned vendor host's (M0 control and
// the M1 probes of 2026-10-14). Needs Node 24 or later for the kernel (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {kernelNode} from './kernel-harness.mjs';
import {alive, descendants, launches, startHost, texts} from './supervisor-harness.mjs';
import {KERNEL, NO_SANDBOX_SENTENCE} from '../../src/repl-host/supervisor.mjs';
import {toolsFor} from '../../src/repl-host/tools.mjs';
import {REPL_HOST_META_KEY, REPL_HOST_NAME, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';

const {node, skip} = kernelNode();
const own = {skip};
const MARKER = {host: 'cua', version: REPL_HOST_VERSION};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const kernelOf = host => descendants(host.child.pid).find(p => p.command.includes(KERNEL) && p.command.startsWith(`${node} `));
const diagnosticOf = result => {
  const [sentence, json] = result.content[0].text.split('\n\nnode_repl diagnostics: ');
  return {sentence, info: JSON.parse(json), keys: Object.keys(JSON.parse(json))};
};

test('the handshake names cua-repl-host; every tool result carries the host marker', own, async t => {
  const host = await startHost(t, {node});
  assert.deepEqual(host.initialized.result.serverInfo, {name: REPL_HOST_NAME, version: REPL_HOST_VERSION});
  assert.deepEqual(host.initialized.result.capabilities, {experimental: {'codex/sandbox-state-meta': {}}, tools: {listChanged: true}});
  assert.deepEqual((await host.request('tools/list', {})).result, {tools: toolsFor({sandboxed: true})});
  assert.deepEqual((await host.request('ping', {})).result, {});
  assert.deepEqual((await host.request('resources/list', {})).result, {resources: []});
  assert.deepEqual((await host.request('foo/bar', {})).error, {code: -32601, message: 'foo/bar'});
  for (const result of [await host.js('nodeRepl.write(1)'), await host.call('js_reset', {}), await host.call('nope', {}),
    await host.call('turn_ended', {hook_event_name: 'Stop', session_id: 's', turn_id: 't'})])
    assert.deepEqual(result._meta[REPL_HOST_META_KEY], MARKER);
});

test('cells persist in one kernel launched lazily under the recovered sandbox argv, with the kernel\'s own argv and the vendor\'s result shape', own, async t => {
  const host = await startHost(t, {node});
  assert.deepEqual(launches(host.codexHome), [], 'nothing is launched before a cell');
  const first = await host.js('let parityValue=41;');
  assert.equal(typeof first._meta['codex/nodeReplExecutionDurationMs'], 'number', 'the submitted code\'s duration');
  assert.deepEqual(first, {content: [{type: 'text', text: ''}], isError: false, _meta: {'codex/nodeReplExecutionDurationMs': first._meta['codex/nodeReplExecutionDurationMs'], [REPL_HOST_META_KEY]: MARKER}});
  assert.deepEqual(texts(await host.js('nodeRepl.write(parityValue+1);')), ['42']);
  const [launch, ...more] = launches(host.codexHome);
  assert.equal(more.length, 0, 'one kernel for both cells');
  const sessionId = launch.argv[launch.argv.indexOf('--session-id') + 1];
  assert.match(sessionId, /^[0-9a-f]{32}$/);
  assert.deepEqual(launch.argv, ['sandbox', '-c', 'shell_environment_policy.inherit="all"', '-c', 'default_permissions="node_repl"', '-c',
    `permissions.node_repl={filesystem = {${[dirname(node), dirname(KERNEL)].sort().map(p => `"${p}" = "read"`).join(', ')}, ":root" = "read", ":tmpdir" = "write", ":workspace_roots" = {"." = "write"}}, network = {enabled = false}}`,
    '--', node, '--experimental-vm-modules', KERNEL, '--session-id', sessionId, '--working-dir', host.cwd]);
});

test('output assembly: named writes first, then unnamed output, then images; an error leads and drops images', own, async t => {
  const host = await startHost(t, {node});
  assert.deepEqual((await host.js('nodeRepl.write("A","same");nodeRepl.write("B","other");nodeRepl.write("C","same");')).content, [{type: 'text', text: 'AC'}, {type: 'text', text: 'B'}]);
  assert.deepEqual(texts(await host.js('nodeRepl.write("u1");nodeRepl.write("n","x");nodeRepl.write("u2");')), ['n', 'u1u2']);
  assert.deepEqual(texts(await host.js('console.log("line-one");nodeRepl.write("write");console.log("line-two");')), ['line-one\nwriteline-two']);
  const image = {type: 'image', data: PNG, mimeType: 'image/png', _meta: {'codex/imageDetail': 'original'}};
  for (const awaited of ['await ', '']) {
    const result = await host.js(`nodeRepl.write('before');${awaited}nodeRepl.emitImage("data:image/png;base64,${PNG}");nodeRepl.write('after');`);
    assert.deepEqual(result.content, [{type: 'text', text: 'beforeafter'}, image], `${awaited || 'un'}awaited`);
  }
  const thrown = await host.js(`nodeRepl.write("out");await nodeRepl.emitImage("data:image/png;base64,${PNG}");throw new Error("boom")`);
  assert.deepEqual({content: thrown.content, isError: thrown.isError}, {content: [{type: 'text', text: 'boom'}, {type: 'text', text: 'out'}], isError: true});
  const refused = await host.js('await nodeRepl.emitImage({bytes:new Uint8Array([1,2]),mimeType:"text/plain"})');
  assert.deepEqual({text: texts(refused), isError: refused.isError}, {text: ['nodeRepl.emitImage only accepts image/* data URLs'], isError: true});
  const staticImport = await host.js('import fs from "node:fs";');
  assert.deepEqual(texts(staticImport), ['Top-level static import "node:fs" is not supported in node_repl. Use await import("node:fs") instead.']);
  assert.equal(Object.hasOwn(staticImport._meta, 'codex/nodeReplExecutionDurationMs'), false, 'no submitted-code duration when the cell never ran');
});

test('the call\'s request meta reaches the cell sorted and without the sandbox state; the kernel\'s environment is allowlisted', own, async t => {
  const host = await startHost(t, {node, env: {SECRET_FIXTURE: 'nope', NODE_REPL_JS_BANNER: 'nodeRepl.write("vendor banner")', CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'VISIBLE_FIXTURE', VISIBLE_FIXTURE: 'yes'}});
  assert.deepEqual(texts(await host.js('nodeRepl.write(JSON.stringify(nodeRepl.requestMeta))', {extra: {threadId: 't', a: {z: 1, b: 2}, callId: 'c'}})), ['{"a":{"b":2,"z":1},"callId":"c","threadId":"t"}']);
  assert.deepEqual(texts(await host.js('nodeRepl.write(JSON.stringify(nodeRepl.env))')), ['{"VISIBLE_FIXTURE":"yes"}']);
  const keys = texts(await host.js('let cp=await import("node:child_process");nodeRepl.write(cp.execFileSync("/usr/bin/env",{encoding:"utf8"}).split("\\n").filter(Boolean).map(l=>l.split("=")[0]).sort().join(","))'))[0].split(',');
  for (const key of ['SECRET_FIXTURE', 'NODE_REPL_JS_BANNER', 'CUA_REPL_NODE_PATH', 'CODEX_CLI_PATH']) assert.ok(!keys.includes(key), `${key} must not reach the kernel`);
  assert.ok(keys.includes('VISIBLE_FIXTURE') && keys.includes('HOME') && keys.includes('TMPDIR'));
});

test('a timeout answers once, kills the kernel and its launcher, fences its late work and leaves a fresh heap', own, async t => {
  const host = await startHost(t, {node});
  const marker = join(host.tmp, 'stale');
  const started = Date.now();
  const timedOut = await host.js(`let oldBinding=1;let fs=await import('node:fs');setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marker)},'stale');nodeRepl.write('STALE');},1300);await new Promise(()=>{});`, {timeoutMs: 1000});
  assert.deepEqual(timedOut, {content: [{type: 'text', text: 'js execution timed out; kernel reset, rerun your request'}], isError: true, _meta: {[REPL_HOST_META_KEY]: MARKER}});
  assert.ok(Date.now() - started < 1000 + 800, `the timeout answers promptly after its budget (${Date.now() - started} ms)`);
  const [first] = launches(host.codexHome);
  assert.equal(alive(first.pid), false, 'the timed-out kernel\'s launcher is gone');
  await delay(600);
  assert.equal(existsSync(marker), false, 'the killed kernel ran nothing more');
  assert.deepEqual(texts(await host.js('nodeRepl.write(typeof oldBinding)')), ['undefined']);
  assert.equal(launches(host.codexHome).length, 2, 'a fresh kernel');
  const busy = await host.js('while(true){}', {timeoutMs: 200});
  assert.equal(busy.isError, true, 'a kernel spinning in synchronous code is killed too');
  assert.deepEqual(texts(await host.js('nodeRepl.write("usable")')), ['usable']);
});

test('js_reset stops the kernel and clears bindings, launched or not; a cancellation never stops a running cell', own, async t => {
  const host = await startHost(t, {node});
  assert.deepEqual(texts(await host.call('js_reset', {})), ['js kernel reset']);
  await host.js('let clearMe=1;');
  const reset = await host.call('js_reset', {});
  assert.deepEqual({content: reset.content, isError: reset.isError}, {content: [{type: 'text', text: 'js kernel reset'}], isError: false});
  assert.deepEqual(texts(await host.js('nodeRepl.write(typeof clearMe)')), ['undefined']);
  const running = host.request('tools/call', {name: 'js', arguments: {code: 'await new Promise(r=>setTimeout(r,300));nodeRepl.write("completed-after-cancel")'}, _meta: {}});
  host.send({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 99}});
  assert.deepEqual((await host.request('ping', {})).result, {}, 'control traffic is answered while a cell runs');
  assert.deepEqual(texts((await running).result), ['completed-after-cancel']);
});

test('a kernel that dies under a running cell answers it with the vendor\'s exit diagnostic; the next cell gets a fresh kernel', own, async t => {
  const host = await startHost(t, {node});
  await host.js('nodeRepl.write("warm")');
  const running = host.js('let fs=await import("node:fs");fs.writeSync(2,"fixture stderr line\\n");await new Promise(r=>setTimeout(r,5000));');
  await delay(300);
  const kernel = kernelOf(host);
  process.kill(kernel.pid, 'SIGKILL');
  const result = await running;
  assert.equal(result.isError, true);
  const {sentence, info, keys} = diagnosticOf(result);
  assert.equal(sentence, 'node_repl kernel exited unexpectedly');
  assert.deepEqual(keys, ['kernel_pid', 'kernel_status', 'kernel_stderr_tail', 'reason', 'stream_error']);
  assert.equal(info.kernel_pid, launches(host.codexHome)[0].pid, 'the launcher\'s pid, as the vendor reports it');
  assert.equal(info.kernel_status, 'exited(code=137)');
  assert.match(info.kernel_stderr_tail, /ExperimentalWarning: VM Modules is an experimental feature/);
  assert.match(info.kernel_stderr_tail, / \| fixture stderr line$|fixture stderr line \| /);
  assert.deepEqual([info.reason, info.stream_error], ['stdout_eof', null]);
  assert.deepEqual(texts(await host.js('nodeRepl.write("after")')), ['after']);
});

test('a sandbox launcher that fails is a refusal on every platform: no cell runs unconfined in its place', own, async t => {
  const host = await startHost(t, {node, sandbox: 'refusing'});
  const marker = join(host.tmp, 'must-not-run');
  const result = await host.js(`(await import('node:fs')).writeFileSync(${JSON.stringify(marker)},'executed');`);
  assert.equal(result.isError, true);
  const {sentence, info} = diagnosticOf(result);
  assert.equal(sentence, 'node_repl kernel exited unexpectedly');
  assert.deepEqual({status: info.kernel_status, tail: info.kernel_stderr_tail}, {status: 'exited(code=73)', tail: 'fixture sandbox launcher refused'});
  assert.equal(existsSync(marker), false);
  assert.equal((await host.js(`(await import('node:fs')).writeFileSync(${JSON.stringify(marker)},'executed');`)).isError, true, 'and again on the next call');
  assert.equal(existsSync(marker), false);
});

test('without a sandbox launcher the host advertises no sandbox and refuses sandboxed calls; disabled runs unconfined only when asked', own, async t => {
  const host = await startHost(t, {node, sandbox: null});
  assert.deepEqual(host.initialized.result.capabilities, {tools: {listChanged: true}});
  assert.equal(Object.hasOwn((await host.request('tools/list', {})).result.tools[0], 'annotations'), false);
  for (const mode of ['scoped', 'default']) assert.deepEqual(texts(await host.js('nodeRepl.write(1)', {mode})), [NO_SANDBOX_SENTENCE], mode);
  assert.deepEqual(texts(await host.js('nodeRepl.write("unconfined")', {mode: 'disabled'})), ['unconfined']);
});

test('a call under another sandbox policy gets a fresh kernel; disabled runs the kernel\'s Node directly', own, async t => {
  const host = await startHost(t, {node});
  await host.js('let sb=1;');
  assert.deepEqual(texts(await host.js('nodeRepl.write(typeof sb)', {mode: 'disabled'})), ['undefined']);
  assert.equal(launches(host.codexHome).length, 1, 'the disabled kernel has no launcher');
  assert.equal(kernelOf(host).ppid, host.child.pid);
  await host.js('let sb2=1;', {mode: 'default'});
  const last = launches(host.codexHome).at(-1).argv;
  assert.match(last[6], /":root" = "read"}, network = \{enabled = false\}\}$/, 'the default mode writes nowhere');
  assert.equal((await host.request('tools/call', {name: 'js', arguments: {code: '1'}, _meta: {'codex/sandbox-state-meta': null}})).error.message,
    'js: codex/sandbox-state-meta: invalid type: null, expected struct SandboxState');
});

test('arguments are checked as the vendor checks them; empty code, unknown tools and turn_ended answer as the vendor does', own, async t => {
  const host = await startHost(t, {node});
  assert.deepEqual((await host.request('tools/call', {name: 'js', arguments: {code: '1', timeout_ms: 0}})).error, {code: -32602, message: 'js: invalid value: integer `0`, expected a nonzero u64'});
  assert.deepEqual((await host.request('tools/call', {arguments: {}})).error, {code: -32601, message: 'tools/call'});
  assert.deepEqual(texts(await host.js('   ')), ['js expects non-empty JavaScript source']);
  assert.deepEqual(launches(host.codexHome), [], 'refused calls launch nothing');
  const unknown = await host.call('nope', {});
  assert.deepEqual({content: unknown.content, isError: unknown.isError}, {content: [{type: 'text', text: 'unknown tool: nope'}], isError: true});
  const args = {hook_event_name: 'Stop', session_id: 's1', turn_id: 't1'};
  for (const result of [await host.call('turn_ended', args), await host.call('turn_ended', args)])
    assert.deepEqual({content: result.content, isError: result.isError}, {content: [{type: 'text', text: '{}'}], isError: false});
  assert.equal((await host.request('tools/call', {name: 'turn_ended', arguments: {...args, turn_id: ''}})).error.message, 'turn_ended requires non-empty event, session, and turn IDs');
});

test('EOF: the running cell settles and is answered, then the kernel goes and the host exits 0', own, async t => {
  const host = await startHost(t, {node});
  const counter = join(host.tmp, 'counter');
  const running = host.js(`let fs=await import('node:fs');fs.appendFileSync(${JSON.stringify(counter)},'x');await new Promise(r=>setTimeout(r,400));nodeRepl.write('released');`);
  for (let i = 0; i < 200 && !existsSync(counter); i++) await delay(10);
  const kernels = descendants(host.child.pid);
  host.child.stdin.end();
  assert.deepEqual(texts(await running), ['released']);
  assert.deepEqual(await host.exited, {code: 0, signal: null});
  assert.equal(readFileSync(counter, 'utf8'), 'x', 'executed once, never replayed');
  for (let i = 0; i < 100 && kernels.some(p => alive(p.pid)); i++) await delay(20);
  assert.deepEqual(kernels.filter(p => alive(p.pid)), [], 'no kernel process outlives the host');
});

// A supervisor under the proxy's anchor (src/mcp/upstream.mjs), as buildLaunch runs it, sandbox disabled so a cell can
// start a process. -> {call(name, args), terminate()}.
async function anchoredHost(t, {ownedGroup = true} = {}) {
  const {spawnUpstream} = await import('../../src/mcp/upstream.mjs');
  const {mkdtempSync, realpathSync, rmSync, mkdirSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {pathToFileURL} = await import('node:url');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-anchored $(touch pwned) ')));
  const cwd = join(root, 'run');
  mkdirSync(cwd);
  const upstream = spawnUpstream({command: node, args: ['--disable-sigusr1', fileURLToPathSafe('../../src/repl-host/supervisor.mjs')], cwd,
    env: {PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, CUA_REPL_NODE_PATH: node, ...(ownedGroup ? {CUA_REPL_OWNED_GROUP: '1'} : {})}}, {stderr: 'ignore'});
  const pending = new Map();
  upstream.onMessage(msg => { pending.get(msg.id)?.(msg); pending.delete(msg.id); });
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); upstream.send({jsonrpc: '2.0', id: n, method, params}); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}});
  const disabled = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(cwd).href}};
  t.after(async () => { await upstream.terminate({budgetMs: 3000}); rmSync(root, {recursive: true, force: true}); });
  return {root, call: async (name, args) => (await request('tools/call', {name, arguments: args, _meta: disabled})).result, terminate: () => upstream.terminate({budgetMs: 3000})};
}
const fileURLToPathSafe = relative => new URL(relative, import.meta.url).pathname;
// A cell that starts a process which writes `marker` after 800 ms, outliving the cell.
// The marker path is data: JSON in the cell's source, a separate argument ($1) to the shell.
const leaveWriter = marker => `let cp=await import("node:child_process");cp.spawn("/bin/sh",["-c","sleep 0.8; echo late > \\"$1\\"","writer",${JSON.stringify(marker)}],{stdio:"ignore"}).unref();nodeRepl.write("started");`;

test('what a kernel leaves in the owned group dies with its generation: on an unexpected end and on reset', own, async t => {
  const host = await anchoredHost(t);
  const crashed = join(host.root, 'after-crash');
  assert.deepEqual(texts(await host.call('js', {code: leaveWriter(crashed)})), ['started']);
  const fatal = await host.call('js', {code: 'setTimeout(()=>{throw new Error("late")},10);await new Promise(r=>setTimeout(r,300));'});
  assert.match(fatal.content[0].text, /^node_repl kernel uncaught exception: late/);
  await delay(500);   // the dying kernel's exit is seen; the next call starts a fresh one (a call sent at once gets its exit)
  const reset = join(host.root, 'after-reset');
  assert.deepEqual(texts(await host.call('js', {code: leaveWriter(reset)})), ['started']);
  assert.deepEqual(texts(await host.call('js_reset', {})), ['js kernel reset']);
  await delay(1500);
  assert.equal(existsSync(crashed), false, 'the process a crashed kernel left wrote nothing');
  assert.equal(existsSync(reset), false, 'the process a reset kernel left wrote nothing');
  assert.equal((await host.terminate()).confirmed, true);
});

test('outside the owned group a crashed kernel\'s stray is not reaped (the regression above is real): it writes', own, async t => {
  const host = await anchoredHost(t, {ownedGroup: false});
  const marker = join(host.root, 'stray');
  await host.call('js', {code: leaveWriter(marker)});
  await host.call('js', {code: 'setTimeout(()=>{throw new Error("late")},10);await new Promise(r=>setTimeout(r,300));'});
  for (let i = 0; i < 100 && !existsSync(marker); i++) await delay(30);
  assert.equal(existsSync(marker), true);
});

test('a signal during an EOF drain forces the shutdown: the waiting cell is answered, the kernel goes, the host exits', own, async t => {
  const host = await startHost(t, {node});
  await host.js('nodeRepl.write("warm")');
  const running = host.js('await new Promise(r=>setTimeout(r,20000));nodeRepl.write("never")');
  await delay(300);
  const kernels = descendants(host.child.pid);
  host.child.stdin.end();
  await delay(200);
  const started = Date.now();
  host.child.kill('SIGTERM');
  assert.deepEqual(texts(await running), ['js execution unavailable because the runtime manager is shutting down']);
  assert.deepEqual(await host.exited, {code: 0, signal: null});
  assert.ok(Date.now() - started < 5000, `forced shutdown took ${Date.now() - started} ms`);
  for (let i = 0; i < 100 && kernels.some(p => alive(p.pid)); i++) await delay(20);
  assert.deepEqual(kernels.filter(p => alive(p.pid)), []);
});

test('closed resolves only after every kernel stop in flight has finished, however shutdown was reached', async () => {
  const {PassThrough} = await import('node:stream');
  const {createSupervisor} = await import('../../src/repl-host/supervisor.mjs');
  let finishStop;
  const stopDone = new Promise(resolve => { finishStop = resolve; });
  let stopFinished = false;
  // A kernel that never answers and whose stop (its tree kill and reaping) completes only when the test says so.
  const startKernel = (launch, {onMessage}) => { setImmediate(() => onMessage({type: 'runtime_ready'})); return {send: () => true, stop: () => stopDone.then(() => { stopFinished = true; })}; };
  const input = new PassThrough(), output = new PassThrough();
  output.resume();
  const supervisor = createSupervisor({input, output, env: {CUA_REPL_NODE_PATH: '/fixture/node', PATH: '/usr/bin:/bin'}, cwd: '/fixture/run', startKernel, log: () => {}});
  let closedAt = null;
  supervisor.closed.then(() => { closedAt = stopFinished; });
  const send = msg => input.write(`${JSON.stringify(msg)}\n`);
  send({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}}});
  send({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'js', arguments: {code: 'await new Promise(()=>{})'},
    _meta: {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: 'file:///fixture/run'}}}});
  await delay(50);
  input.end();                    // EOF: a drain begins, waiting on the running cell
  await delay(20);
  supervisor.shutdown();          // a signal: forced; it answers the cell, which releases the drain too
  await delay(100);
  assert.equal(closedAt, null, 'not closed while the forced stop is still running');
  finishStop();
  await supervisor.closed;
  await delay(0);
  assert.equal(closedAt, true, 'closed after the stop finished');
});

test('a forced shutdown that arrives while a policy change stops the old kernel launches nothing more', async () => {
  const {PassThrough} = await import('node:stream');
  const {createSupervisor} = await import('../../src/repl-host/supervisor.mjs');
  let releaseStop;
  const stopHeld = new Promise(resolve => { releaseStop = resolve; });
  const launched = [];
  const startKernel = (launch, {onMessage}) => {
    launched.push(launch.key);
    setImmediate(() => onMessage({type: 'runtime_ready'}));
    return {send: message => { if (message.type === 'exec') setImmediate(() => onMessage({type: 'exec_result', id: message.id, ok: true, output: 'ran', named_outputs: []})); return true; },
      stop: () => stopHeld};
  };
  const input = new PassThrough(), output = new PassThrough();
  const replies = new Map();
  output.setEncoding('utf8').on('data', chunk => { for (const line of chunk.split('\n').filter(Boolean)) { const msg = JSON.parse(line); replies.get(msg.id)?.(msg); } });
  const supervisor = createSupervisor({input, output, env: {CUA_REPL_NODE_PATH: '/fixture/node', CODEX_CLI_PATH: '/fixture/codex', PATH: '/usr/bin:/bin'}, cwd: '/fixture/run', startKernel, log: () => {}});
  const request = (id, method, params) => new Promise(resolve => { replies.set(id, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id, method, params})}\n`); });
  await request(1, 'initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}});
  const disabled = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: 'file:///fixture/run'}};
  assert.equal((await request(2, 'tools/call', {name: 'js', arguments: {code: '1'}, _meta: disabled})).result.content[0].text, 'ran');
  // Another policy (the default, no sandbox state): the disabled kernel must stop first, and its stop is held.
  const second = request(3, 'tools/call', {name: 'js', arguments: {code: '2'}, _meta: {}});
  await delay(30);
  const shutdown = supervisor.shutdown();
  await delay(30);
  releaseStop();
  assert.deepEqual((await second).result.content, [{type: 'text', text: 'js execution unavailable because the runtime manager is shutting down'}]);
  await shutdown;
  await supervisor.closed;
  assert.deepEqual(launched, ['disabled'], 'no kernel was launched after the shutdown began');
});
