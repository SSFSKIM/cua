// The live extension backends, as the vendor browser service sees them, for `cua profiles bind`: one bounded,
// serve-less launch of the installed runtime with the browser surface only (the same launch `cua serve` makes, with
// secrets off), one MCP handshake and one read-only cell — cua.listBrowsers, then cua.listTabs per extension backend
// for a tab count — then teardown through the owned anchor. Every elicitation is declined. The cell reduces the
// inventory inside the REPL: only each extension backend's instance id, the vendor's profile label and a tab count
// leave it; tab titles and URLs never do. The label is the Chrome profile display name the vendor's own enrichment
// attached (browser-service.mjs `aL`); callers use it for the bind rule and never print or store it.
import {randomUUID} from 'node:crypto';
import {chmodSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';
import {buildLaunch, BROWSER_SERVICE} from '../runtime/launch.mjs';
import {homeLayout, realHome} from '../runtime/layout.mjs';
import {spawnUpstream} from '../mcp/upstream.mjs';

export const MARKER = 'CUABACKENDS';
export const LIMITS = {initializeMs: 60_000, cellMs: 45_000, callMs: 60_000, teardownMs: 5000};
const INSTANCE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const LIST_CELL = `const __out = {};
try {
  const list = await cua.listBrowsers({emit: false});
  __out.backends = [];
  for (const b of list) {
    if (b?.type !== "extension") continue;
    const entry = {instanceId: typeof b.metadata?.extensionInstanceId === "string" ? b.metadata.extensionInstanceId : null, profileName: typeof b.profileName === "string" && b.profileName ? b.profileName : null, tabCount: null};
    try { const tabs = await cua.listTabs({browser: b.id, emit: false}); entry.tabCount = Array.isArray(tabs) ? tabs.length : null; } catch {}
    __out.backends.push(entry);
  }
} catch { __out.error = "list_failed"; }
nodeRepl.write(${JSON.stringify(MARKER + ' ')} + JSON.stringify(__out));`;

function within(promise, ms, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(onTimeout()), ms); })]).finally(() => clearTimeout(timer));
}

const unresponsive = step => () => Object.assign(new Error(`the runtime did not answer ${step} in time`), {code: 'runtime_unresponsive'});
const listingFailed = why => fail('listing_failed', `the runtime could not list the Chrome extension backends (${why})`);

function parseBackends(result) {
  const text = (result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const line = text.split('\n').find(l => l.startsWith(`${MARKER} `));
  if (result?.isError || !line) listingFailed(result?.isError ? 'the listing cell failed' : 'no listing in the cell output');
  let payload;
  try { payload = JSON.parse(line.slice(MARKER.length + 1)); } catch { listingFailed('unreadable listing'); }
  if (payload?.error || !Array.isArray(payload?.backends)) listingFailed('the vendor listing failed');
  return payload.backends.map(b => {
    if (typeof b?.instanceId !== 'string' || !INSTANCE_ID.test(b.instanceId)) listingFailed('a backend without a usable extension instance id');
    return {instanceId: b.instanceId, ...(typeof b.profileName === 'string' ? {profileName: b.profileName} : {}), ...(Number.isInteger(b.tabCount) ? {tabCount: b.tabCount} : {})};
  });
}

// Talks to an already started runtime (an upstream as spawnUpstream returns it) and always terminates it.
export async function listBackendsWith(upstream, {limits = LIMITS} = {}) {
  const limit = {...LIMITS, ...limits};
  let next = 0;
  let elicitationsDeclined = 0;
  const pending = new Map();
  upstream.onMessage(msg => {
    if (msg.method !== undefined && msg.id !== undefined) {
      if (msg.method === 'elicitation/create') { elicitationsDeclined++; upstream.send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}}); }
      else upstream.send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported'}});
      return;
    }
    pending.get(msg.id)?.(msg);
  });
  const request = (method, params, ms) => within(new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, msg => { pending.delete(id); msg.error ? reject(Object.assign(new Error(`${method} failed`), {code: 'listing_failed'})) : resolve(msg.result); });
    if (upstream.send({jsonrpc: '2.0', id, method, params}) === false) reject(unresponsive(method)());
  }), ms, unresponsive(method));
  let backends;
  let failure;
  try {
    await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-profiles-bind', version: '0'}}, limit.initializeMs);
    upstream.send({jsonrpc: '2.0', method: 'notifications/initialized'});
    const sessionId = randomUUID();
    const meta = {'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: randomUUID(), call_id: randomUUID(), model: 'cua-profiles-bind'}};
    const result = await request('tools/call', {name: 'js', arguments: {code: LIST_CELL, title: 'cua profiles bind: list Chrome backends', timeout_ms: limit.cellMs}, _meta: meta}, limit.callMs);
    backends = parseBackends(result);
  } catch (error) {
    failure = error;
  }
  pending.clear();
  const teardown = await upstream.terminate({budgetMs: limit.teardownMs});
  if (!teardown?.confirmed) throw teardownUnconfirmed(teardown, failure);
  if (failure) throw failure;
  return {backends, elicitationsDeclined, teardown};
}

// The owned runtime could not be shown gone: that outranks the listing's own result (a bind must not be recorded on
// top of it), and a listing failure is kept in the same diagnostic.
export function teardownUnconfirmed(teardown, failure) {
  const listing = failure ? `; the listing itself also failed (${failure.code ?? 'error'}: ${failure.message})` : '';
  const error = new CuaError('runtime_teardown_unconfirmed', `the runtime launched to list the Chrome backends could not be confirmed stopped after ${(teardown?.steps ?? []).join(', ') || 'teardown'} (${teardown?.reason ?? 'no reason given'}); owned processes may remain${listing}`, {hint: 'nothing was bound; check for leftover cua runtime processes before retrying'});
  error.teardown = teardown;
  return error;
}

// One bounded launch of the installed runtime in this home, as `cua serve` would make it with the browser surface
// only and secrets off, in its own session directory (removed afterwards with the session's approval file).
export async function listLiveBackends({home, runtime, ambient = process.env, limits}) {
  const sessionId = randomUUID();
  const owned = homeLayout(realHome(home));
  mkdirSync(owned.run, {recursive: true, mode: 0o700});
  const launch = buildLaunch({runtime, home, sessionId, ambient, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}, secretsUnavailable: 'secrets_disabled'});
  mkdirSync(launch.env.CODEX_HOME, {recursive: true, mode: 0o700});
  mkdirSync(launch.cwd, {mode: 0o700});
  chmodSync(launch.cwd, 0o700);
  try {
    const result = await listBackendsWith(spawnUpstream(launch, {stderr: 'ignore'}), {limits});
    return {backends: result.backends, elicitationsDeclined: result.elicitationsDeclined, teardown: result.teardown};
  } finally {
    rmSync(launch.cwd, {recursive: true, force: true});
    rmSync(join(launch.env.CODEX_HOME, 'computer-use', 'sessions', `${sessionId}.toml`), {force: true});
  }
}
