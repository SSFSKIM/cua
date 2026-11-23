// #216: an app's approval across other apps' refusals and the connection's lifecycle, end to end in process. The real
// pieces are the MCP connection (src/mcp/server.mjs, with its approval memory and the lazy runtime's idle stop), the
// supervisor's elicitation rules (src/repl-host/elicitation.mjs) and the macOS policy (src/services/engine/policy.mjs);
// the runtime under them is a fake standing in for cua's REPL host, its worker and a fake engine that resolves three apps
// the way the report named them (MAWS-under-test bound by its Electron.app path, Claude, and com.openai.codex, which
// displays as ChatGPT). The client answers like a harness: accept for the apps it approves, decline (or cancel) for the
// rest, and counts what it was asked.
//
// The reported sequence (#216; MAWS dogfood-feedback l8-settings.md §1): two apps approved and driven, a third declined,
// then the first refused on its next bind and through several end_task/new-task cycles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {fakeUpstream, harness, tick} from './fixtures/mcp-harness.mjs';
import {lazyRuntime} from '../src/mcp/lazy-runtime.mjs';
import {elicitationOutcome, elicitationParams} from '../src/repl-host/elicitation.mjs';
import {createPolicy} from '../src/services/engine/policy.mjs';
import {approvalConnectionId} from '../src/mcp/approval-memory.mjs';

const MAWS = '/Users/someone/MAWS/node_modules/electron/dist/Electron.app';
const ENGINE = {
  [MAWS]: {appPath: MAWS, bundleIdentifier: 'com.github.Electron', displayName: 'Electron'},
  Claude: {appPath: '/Applications/Claude.app', bundleIdentifier: 'com.anthropic.claudefordesktop', displayName: 'Claude'},
  'com.openai.codex': {appPath: '/Applications/ChatGPT.app', bundleIdentifier: 'com.openai.codex', displayName: 'ChatGPT'},
};
const RECORD = {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}, instructions: 'Recorded.'},
  tools: {tools: [{name: 'js', description: 'Recorded.', inputSchema: {type: 'object'}}]}};
const INIT = {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'approval-216', version: '0'}};

// One runtime launch: a fake of cua's REPL host whose `js` cell `bind <app>[,<app>…]` runs the policy before
// get_app_state for each app at once, as the service does, its createElicitation going up to the connection the way the
// supervisor sends it and the response meta the policy sets coming back on the cell's result, as the host returns it.
// `replHost` 'cua' gives its worker cua's own host's setting (CUA_REPL_TRUSTED_SERVICES), as the own host's worker has.
function fakeRuntime(replHost) {
  const runtime = fakeUpstream();
  const send = runtime.send;
  const pending = new Map();   // the runtime's own elicitation ids (they restart with every launch) -> settle
  let asks = 0;
  let meta = {};
  const nodeRepl = {
    env: replHost === 'cua' ? {CUA_REPL_TRUSTED_SERVICES: '{"sky":"/opt/cua/service.mjs"}'} : {NODE_REPL_TRUSTED_SERVICES: '{"sky":"/opt/vendor/service.mjs"}'},
    setResponseMeta(value) { Object.assign(meta, structuredClone(value)); },
    createElicitation(request) {
      const {params, error} = elicitationParams({message: request.message, requested_schema: {type: 'object', properties: {}}, meta: request.meta}, {formSupported: true});
      if (error) return Promise.reject(new Error(error));
      const id = ++asks;
      return new Promise((resolve, reject) => {
        pending.set(id, reply => {
          const outcome = elicitationOutcome(reply);
          if (!outcome.ok) reject(new Error(outcome.error));
          else resolve({action: outcome.action, content: outcome.content, _meta: outcome._meta});
        });
        runtime.emit({jsonrpc: '2.0', id, method: 'elicitation/create', params});
      });
    },
  };
  const policy = createPolicy({nodeRepl, resolve: async app => {
    if (!ENGINE[app]) throw new Error(`no app ${app}`);
    return ENGINE[app];
  }});
  async function call(msg) {
    const {name, arguments: args} = msg.params;
    if (name === 'turn_ended' || name === 'js_reset') return runtime.text(msg, '{}');
    meta = {};
    const apps = /^bind (.+)$/.exec(args.code)[1].split(',');
    const settled = await Promise.allSettled(apps.map(app => policy.withPolicy('get_app_state', {app}, () => `bound ${ENGINE[app].displayName}`)));
    const isError = settled.some(s => s.status === 'rejected');
    runtime.reply(msg, {content: settled.map(s => ({type: 'text', text: s.status === 'fulfilled' ? s.value : s.reason.message})), isError, _meta: meta});
  }
  runtime.send = msg => {
    send(msg);
    if (msg.method === 'initialize') queueMicrotask(() => runtime.reply(msg, RECORD.initialize));
    else if (msg.method === 'tools/call') call(msg);
    else if (msg.method === undefined && pending.has(msg.id)) {
      const settle = pending.get(msg.id);
      pending.delete(msg.id);
      settle(msg);
    }
  };
  return runtime;
}

// A connection over a lazy runtime (so an idle stop replaces the runtime under it, as in `cua serve`) and a client that
// answers every app approval with `answers[bundle id]` (a function of the ask's number for that app; it may return a
// promise, to answer late) and counts asks. `approvals` keeps each bind's `cua/approval` result meta.
function connection(answers, {sessionId = 'session-under-test', replHost = 'cua'} = {}) {
  const runtimes = [];
  const timers = [];
  const upstream = lazyRuntime({start: async () => { const runtime = fakeRuntime(replHost); runtimes.push(runtime); return runtime; },
    records: {read: () => RECORD, write: () => {}}});
  const h = harness({upstream, server: {sessionId, replHost, runtimeIdleMs: 60_000, idleTimer: (fn, ms) => { const entry = {fn, ms, live: true}; timers.push(entry); return () => { entry.live = false; }; }}});
  const asked = {};
  const asks = [];   // {app, id}: the client's copy of each ask
  const approvals = [];
  createInterface({input: h.output}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method !== 'elicitation/create') return;
    const app = msg.params._meta.tool_params.app;
    asked[app] = (asked[app] ?? 0) + 1;
    asks.push({app, id: msg.id});
    Promise.resolve(answers[app](asked[app])).then(result => h.client.send({jsonrpc: '2.0', id: msg.id, result}));
  });
  let idle = 0;
  return {
    ...h, runtimes, asked, asks, approvals,
    async start() { await h.client.request('initialize', INIT).response; h.client.notify('notifications/initialized', {}); },
    async bind(app) {
      const {result} = await h.client.call('js', {code: `bind ${app}`}).response;
      approvals.push(result._meta?.['cua/approval'] ?? null);
      return {ok: !result.isError, text: result.content.map(c => c.text).join('\n')};
    },
    endTask: async () => (await h.client.call('end_task').response).result,
    jsReset: async () => (await h.client.call('js_reset').response).result,
    async idleStop() {
      const live = timers.filter(entry => entry.live);
      assert.equal(live.length, 1, 'one idle timer armed');
      live[0].live = false;
      live[0].fn();
      idle++;
      for (let i = 0; i < 200 && h.client.diagnostics.filter(line => /runtime stopped after/.test(line)).length < idle; i++) await tick(5);
    },
    async close() { h.client.eof(); await h.server.closed; },
  };
}

const accept = () => ({action: 'accept', content: {}});
const decline = () => ({action: 'decline'});
const DECLINED_NOW = 'Computer Use was not approved to use ChatGPT: the client declined the approval request; it is not asked again on this connection.';
const DECLINED_EARLIER = 'Computer Use was not approved to use ChatGPT: it was declined earlier on this connection, so it was not asked again.';
const DECLINED_UNTOLD = 'Computer Use was not approved to use ChatGPT: the approval request was declined.';

test('#216: an approved app stays approved after another app is declined, in the same task, across end_task, js_reset, an idle stop and twenty new tasks', async t => {
  const c = connection({'com.github.Electron': accept, 'com.anthropic.claudefordesktop': accept, 'com.openai.codex': decline});
  t.after(() => c.close());
  await c.start();

  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await c.bind('Claude'), {ok: true, text: 'bound Claude'});
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_NOW}, 'the refusal names the client\'s answer, not a person');
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'}, 'the first app, bound again in the same task');
  assert.deepEqual(await c.bind('Claude'), {ok: true, text: 'bound Claude'});

  for (let cycle = 1; cycle <= 20; cycle++) {
    await c.endTask();
    if (cycle === 5) await c.jsReset();
    if (cycle === 10) await c.idleStop();
    const label = `cycle ${cycle}`;
    assert.deepEqual(await c.bind(MAWS), {ok: true, text: `${cycle === 10 ? 'cua: the runtime was stopped after 1 min without a tool call and has restarted for this call. Its REPL state is gone (variables, app handles, browser tabs and anything bound to them): rebind what you need from the API document below.\n' : ''}bound Electron`}, label);
    assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_EARLIER}, label);
    assert.deepEqual(await c.bind('Claude'), {ok: true, text: 'bound Claude'}, label);
  }
  assert.equal(c.runtimes.length, 2, 'the idle stop replaced the runtime once');
  assert.deepEqual(c.asked, {'com.github.Electron': 1, 'com.anthropic.claudefordesktop': 1, 'com.openai.codex': 1}, 'each app was asked once for the whole connection');

  // A new connection starts with nothing remembered: every app asks again (the memory is the connection's, by design).
  const next = connection({'com.github.Electron': accept, 'com.anthropic.claudefordesktop': accept, 'com.openai.codex': decline});
  t.after(() => next.close());
  await next.start();
  assert.deepEqual(await next.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await next.bind('com.openai.codex'), {ok: false, text: DECLINED_NOW});
  assert.deepEqual(next.asked, {'com.github.Electron': 1, 'com.openai.codex': 1});
});

test('#216: a cancelled approval is not remembered and refuses only its own app, saying it was cancelled', async t => {
  // Claude is cancelled once (Claude Code cancels when no dialog can be shown or its question brake trips), then accepted.
  const c = connection({'com.github.Electron': accept, 'com.anthropic.claudefordesktop': n => (n === 1 ? {action: 'cancel'} : accept()), 'com.openai.codex': decline});
  t.after(() => c.close());
  await c.start();
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await c.bind('Claude'), {ok: false, text: 'Computer Use was not approved to use Claude: the client cancelled the approval request without an answer.'});
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'}, 'another app\'s cancel touches nothing remembered');
  await c.endTask();
  assert.deepEqual(await c.bind('Claude'), {ok: true, text: 'bound Claude'}, 'a cancel is asked again');
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_NOW});
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(c.asked, {'com.github.Electron': 1, 'com.anthropic.claudefordesktop': 2, 'com.openai.codex': 1});
});

// `cua/approval` as the policy reports it from the connection's stamp.
const provenance = (action, answeredBy, {sessionId = 'session-under-test', runtimeGeneration = 0} = {}) =>
  ({action, answeredBy, connection: approvalConnectionId(sessionId), runtimeGeneration, scope: 'connection'});

test('#216: the connection, not the client, says an answer came from memory; the meta names the connection and the runtime generation', async t => {
  // A client (or a hook) that copies the persisted-state mark into its own answers cannot pass them off as remembered.
  const MARK = {source: 'computer-use-persisted-state'};
  const c = connection({'com.github.Electron': () => ({action: 'accept', content: {...MARK}}), 'com.openai.codex': () => ({action: 'decline', content: {...MARK}})});
  t.after(() => c.close());
  await c.start();
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_NOW}, 'a fresh decline is the client\'s, whatever its content says');
  assert.deepEqual(c.approvals.at(-1), provenance('decline', 'client'));
  const forwarded = c.runtimes[0].sent.find(m => m.method === undefined && m.result?.action === 'decline');
  assert.deepEqual(forwarded.result.content, {}, 'the client\'s copy of the mark never reaches the runtime');
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_EARLIER});
  assert.deepEqual(c.approvals.at(-1), provenance('decline', 'memory'));
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(c.approvals.at(-1), provenance('accept', 'client'));
  await c.endTask();
  await c.idleStop();
  assert.equal((await c.bind(MAWS)).ok, true);
  assert.deepEqual(c.approvals.at(-1), provenance('accept', 'memory', {runtimeGeneration: 1}), 'a new runtime on the same connection: the generation moves, the connection does not');
  assert.deepEqual(c.asked, {'com.openai.codex': 1, 'com.github.Electron': 1});

  const next = connection({'com.github.Electron': accept}, {sessionId: 'another-session'});
  t.after(() => next.close());
  await next.start();
  assert.equal((await next.bind(MAWS)).ok, true);
  assert.deepEqual(next.approvals.at(-1), provenance('accept', 'client', {sessionId: 'another-session'}), 'a new connection has another id');
  assert.notEqual(approvalConnectionId('another-session'), approvalConnectionId('session-under-test'));
});

test('#216: overlapping approvals answered out of order each reach their own app', async t => {
  let release;
  const late = new Promise(resolve => { release = resolve; });
  const c = connection({'com.github.Electron': () => late.then(accept), 'com.openai.codex': () => { setTimeout(release, 5); return decline(); }});
  t.after(() => c.close());
  await c.start();
  // One cell binds both at once; ChatGPT's decline is answered first, Electron's accept after it.
  assert.deepEqual(await c.bind(`${MAWS},com.openai.codex`), {ok: false, text: `bound Electron\n${DECLINED_NOW}`});
  assert.deepEqual(c.asks.map(a => a.app), ['com.github.Electron', 'com.openai.codex']);
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_EARLIER});
  assert.deepEqual(c.asked, {'com.github.Electron': 1, 'com.openai.codex': 1});
});

test('#216: a second answer to a request already answered (a hook and a dialog both answering) changes nothing', async t => {
  const c = connection({'com.github.Electron': accept, 'com.openai.codex': decline});
  t.after(() => c.close());
  await c.start();
  assert.equal((await c.bind(MAWS)).ok, true);
  assert.equal((await c.bind('com.openai.codex')).ok, false);
  const [electron, chatgpt] = c.asks;
  c.client.send({jsonrpc: '2.0', id: electron.id, result: {action: 'decline'}});
  c.client.send({jsonrpc: '2.0', id: chatgpt.id, result: {action: 'accept', content: {}}});
  await tick(10);
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'}, 'the stray decline did not touch Electron');
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_EARLIER}, 'nor did the stray accept widen ChatGPT');
  assert.deepEqual(c.asked, {'com.github.Electron': 1, 'com.openai.codex': 1});
});

test('#216: on the vendor\'s node_repl the runtime gets every approval answer exactly as before; provenance is told only where it can be', async t => {
  // The client declines Claude with its own `cua/approval` claiming the memory answered: nothing stamps on this host.
  const forged = () => ({action: 'decline', _meta: {'cua/approval': {connection: 'a5a26df15524', runtimeGeneration: 0, scope: 'connection', answeredBy: 'memory'}}});
  const c = connection({'com.github.Electron': accept, 'com.openai.codex': decline, 'com.anthropic.claudefordesktop': forged}, {replHost: 'vendor'});
  t.after(() => c.close());
  await c.start();
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_NOW});
  assert.deepEqual(await c.bind('com.openai.codex'), {ok: false, text: DECLINED_UNTOLD}, 'the mark alone cannot tell the memory from a client\'s copy');
  assert.deepEqual(await c.bind(MAWS), {ok: true, text: 'bound Electron'});
  assert.deepEqual(await c.bind('Claude'), {ok: false, text: 'Computer Use was not approved to use Claude: the client declined the approval request; it is not asked again on this connection.'},
    'a client\'s own cua/approval is not read off cua\'s host');
  const answers = c.runtimes[0].sent.filter(m => m.method === undefined && m.result?.action).map(m => JSON.stringify(m));
  assert.deepEqual(answers, [
    JSON.stringify({jsonrpc: '2.0', id: 1, result: {action: 'accept', content: {}, _meta: {persist: 'session'}}}),
    JSON.stringify({jsonrpc: '2.0', id: 2, result: {action: 'decline'}}),
    JSON.stringify({jsonrpc: '2.0', id: 3, result: {action: 'decline', content: {source: 'computer-use-persisted-state'}}}),
    JSON.stringify({jsonrpc: '2.0', id: 4, result: {action: 'accept', content: {source: 'computer-use-persisted-state'}}}),
    JSON.stringify({jsonrpc: '2.0', id: 5, result: forged()}),
  ], 'byte for byte the pre-#216 answers: no stamp, nothing stripped, the client\'s _meta as sent');
  const none = {connection: null, runtimeGeneration: null, scope: null};
  assert.deepEqual(c.approvals.slice(1), [
    {action: 'decline', answeredBy: 'client', ...none},
    {action: 'decline', answeredBy: null, ...none},
    {action: 'accept', answeredBy: null, ...none},
    {action: 'decline', answeredBy: 'client', ...none},
  ]);
});
