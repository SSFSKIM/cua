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

const MAWS = '/Users/someone/MAWS/node_modules/electron/dist/Electron.app';
const ENGINE = {
  [MAWS]: {appPath: MAWS, bundleIdentifier: 'com.github.Electron', displayName: 'Electron'},
  Claude: {appPath: '/Applications/Claude.app', bundleIdentifier: 'com.anthropic.claudefordesktop', displayName: 'Claude'},
  'com.openai.codex': {appPath: '/Applications/ChatGPT.app', bundleIdentifier: 'com.openai.codex', displayName: 'ChatGPT'},
};
const RECORD = {initialize: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'recorded', version: '0'}, instructions: 'Recorded.'},
  tools: {tools: [{name: 'js', description: 'Recorded.', inputSchema: {type: 'object'}}]}};
const INIT = {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'approval-216', version: '0'}};

// One runtime launch: a fake of cua's REPL host whose `js` cell `bind <app>` runs the policy before get_app_state, as the
// service does, its createElicitation going up to the connection the way the supervisor sends it.
function fakeRuntime() {
  const runtime = fakeUpstream();
  const send = runtime.send;
  const pending = new Map();   // the runtime's own elicitation ids (they restart with every launch) -> settle
  let asks = 0;
  const nodeRepl = {
    setResponseMeta() {},
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
    const app = /^bind (.+)$/.exec(args.code)?.[1];
    try {
      await policy.withPolicy('get_app_state', {app}, () => undefined);
      runtime.text(msg, `bound ${ENGINE[app].displayName}`);
    } catch (error) {
      runtime.reply(msg, {content: [{type: 'text', text: error.message}], isError: true});
    }
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
// answers every app approval with `answers[bundle id]` (a function of the ask's number for that app) and counts asks.
function connection(answers) {
  const runtimes = [];
  const timers = [];
  const upstream = lazyRuntime({start: async () => { const runtime = fakeRuntime(); runtimes.push(runtime); return runtime; },
    records: {read: () => RECORD, write: () => {}}});
  const h = harness({upstream, server: {runtimeIdleMs: 60_000, idleTimer: (fn, ms) => { const entry = {fn, ms, live: true}; timers.push(entry); return () => { entry.live = false; }; }}});
  const asked = {};
  createInterface({input: h.output}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method !== 'elicitation/create') return;
    const app = msg.params._meta.tool_params.app;
    asked[app] = (asked[app] ?? 0) + 1;
    h.client.send({jsonrpc: '2.0', id: msg.id, result: answers[app](asked[app])});
  });
  let idle = 0;
  return {
    ...h, runtimes, asked,
    async start() { await h.client.request('initialize', INIT).response; h.client.notify('notifications/initialized', {}); },
    async bind(app) {
      const {result} = await h.client.call('js', {code: `bind ${app}`}).response;
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
