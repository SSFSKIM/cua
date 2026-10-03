// One probe session against a runtime speaking newline-delimited MCP (the relocated vendor runtime in --live, the
// fake runtime in --fixtures): handshake, the M9 cells (listBrowsers, listTabs per browser) and, with tabs, the M10
// owned-page sequence. The caller launches and tears down the runtime; this module only talks to it.
//
// Server requests (elicitations) are answered by `policy` (elicitation.mjs) and recorded in the inventory; any other
// server request gets a JSON-RPC error. A cell's result is the marker line it wrote, plus any images it emitted.
import {randomUUID} from 'node:crypto';
import {cellOutcome, sanitizeVendorText} from './classify.mjs';
import {answerFor, inventoryEntry} from './elicitation.mjs';
import {LIST_BROWSERS, listTabs, RESULT_MARKER} from './cells.mjs';
import {runTabSequence} from './tabs.mjs';

export const TIMEOUTS = {initializeMs: 60_000, listMs: 30_000, cellMs: 30_000, callMs: 60_000, teardownMs: 5000, sampleMs: 300};

export function mcpClient(upstream, {policy, elicitations}) {
  let next = 0;
  const pending = new Map();
  upstream.onMessage(msg => {
    if (msg.method !== undefined && msg.id !== undefined) {
      const decision = policy(msg);
      elicitations.push(inventoryEntry(msg, decision));
      if (msg.method === 'elicitation/create') upstream.send({jsonrpc: '2.0', id: msg.id, result: answerFor(decision)});
      else upstream.send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by probe'}});
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id); clearTimeout(p.timer);
    msg.error ? p.reject(new Error(`MCP error: ${msg.error.message ?? ''}`)) : p.resolve(msg.result);
  });
  return {
    notify: (method, params) => upstream.send({jsonrpc: '2.0', method, params}),
    request: (method, params, ms) => new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${ms} ms`)); }, ms);
      pending.set(id, {resolve, reject, timer});
      if (!upstream.send({jsonrpc: '2.0', id, method, params})) { pending.delete(id); clearTimeout(timer); reject(new Error(`${method}: runtime transport closed`)); }
    }),
    abandon() { for (const p of pending.values()) clearTimeout(p.timer); pending.clear(); },
  };
}

export function cellRunner(client, {cellsSent, label}) {
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const meta = () => ({'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: turnId, call_id: randomUUID(), model: `${label}-probe`}});
  const marker = new RegExp(`${RESULT_MARKER} (\\{.*\\})`);
  return async (name, code, {cellMs = TIMEOUTS.cellMs, callMs = TIMEOUTS.callMs} = {}) => {
    cellsSent.push(name);
    try {
      const result = await client.request('tools/call', {name: 'js', arguments: {code, title: `${label} probe ${name}`, timeout_ms: cellMs}, _meta: meta()}, callMs);
      const content = result.content ?? [];
      const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const found = text.match(marker);
      const images = content.filter(c => c.type === 'image' && typeof c.data === 'string').map(c => ({data: c.data, mimeType: c.mimeType}));
      return {isError: result.isError === true, result: found ? JSON.parse(found[1]) : null, images, ...(found ? {} : {unmarked: text.slice(0, 600)})};
    } catch (e) { return {probeError: e.message, images: []}; }
  };
}

// Handshake, M9 cells and (withTabs) the owned-page sequence. Never throws for vendor behaviour: failures are
// recorded as outcomes; a failed handshake is `launchError`.
export async function runBrowserSession({upstream, policy, withTabs = false, page, browserIndex, label = 'M9', clientName = 'cua-m9-probe', screenshotDir}) {
  const o = {elicitations: [], cellsSent: [], listTabs: []};
  const client = mcpClient(upstream, {policy, elicitations: o.elicitations});
  const runCell = cellRunner(client, {cellsSent: o.cellsSent, label});
  try {
    const init = await client.request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: clientName, version: '0'}}, TIMEOUTS.initializeMs);
    client.notify('notifications/initialized', {});
    const tools = await client.request('tools/list', {}, TIMEOUTS.listMs);
    const jsTool = tools.tools.find(t => t.name === 'js');
    o.handshake = {serverName: init.serverInfo?.name ?? null, tools: tools.tools.map(t => t.name).sort(), browserSurfaceDocumented: /createBrowserTab/.test(jsTool?.description ?? ''), computerSurfaceDocumented: /getApp\(/.test(jsTool?.description ?? '')};
    const lb = await runCell('listBrowsers', LIST_BROWSERS);
    o.listBrowsers = {...cellOutcome(lb), browsers: lb.result?.browsers ?? []};
    for (let i = 0; i < o.listBrowsers.browsers.length; i++) {
      const lt = await runCell('listTabs', listTabs(i));
      o.listTabs.push({browserIndex: i, ...cellOutcome(lt), ...(typeof lt.result?.count === 'number' ? {tabCount: lt.result.count} : {})});
    }
    if (withTabs) {
      const {tabs, screenshotFile} = await runTabSequence({runCell, page, browserCount: o.listBrowsers.browsers.length, listTabs: o.listTabs, browserIndex, screenshotDir});
      o.tabs = tabs;
      o.screenshotFile = screenshotFile;
    }
  } catch (e) {
    o.launchError = sanitizeVendorText(e.message);
  } finally {
    client.abandon();
  }
  return o;
}
