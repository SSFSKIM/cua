#!/usr/bin/env node
// Fixture stand-in for the relocated vendor runtime with the browser surface, for `--fixtures`. It speaks
// newline-delimited MCP on stdio (started through the same owned anchor as the real runtime) and runs each `js` cell
// for real, against a fake `cua` browser API and `nodeRepl`, so the probe's actual cells, elicitation handling,
// leftover accounting and report reduction are exercised. Nothing here is a real browser.
//
// FAKE_RUNTIME_SCENARIO (JSON):
//   browsers            [{id, tabs: [{id, providerTabId, title, url}]}]   pre-existing "user" tabs (sentinel data)
//   extraElicitations   [{label, params}]   sent, in order, during the first listTabs call
//   originRequest       "vendor" | "unstructured"   the shape of the access request goto sends for a new origin
//   originPersist       the vendor request's persist offer ("always" by default; null for none)
//   close               "ok" | "throw" | "linger"   what tab.close() does for a created tab
//   createFails         createBrowserTab throws instead of opening a tab
//   errorText           text (with sentinels) included in fake vendor error messages
// FAKE_RUNTIME_LOG: every elicitation answer, appended as JSON lines {label, answer}.
// The page itself is fetched from the probe's test server; its button semantics are mirrored from test-page.mjs.
import {appendFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {originAccessRequest} from './vendor-shapes.mjs';
import {doneText} from './test-page.mjs';

const scenario = JSON.parse(process.env.FAKE_RUNTIME_SCENARIO ?? '{}');
const logFile = process.env.FAKE_RUNTIME_LOG;
const log = entry => { if (logFile) appendFileSync(logFile, JSON.stringify(entry) + '\n'); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const waiting = new Map();
let nextRequest = 0;
function elicit(label, params) {
  const id = `fake-${++nextRequest}`;
  send({jsonrpc: '2.0', id, method: 'elicitation/create', params});
  return new Promise(resolve => waiting.set(id, answer => { log({label, answer}); resolve(answer); }));
}

const browsers = (scenario.browsers ?? []).map(b => ({id: String(b.id), tabs: b.tabs.map(t => ({...t}))}));
const approved = new Set();
let extrasSent = false;
let created = 0;

function render(tab) {
  if (!tab.page) return `Tab: New Tab\nURL: chrome://newtab/\n[1] text "New Tab"`;
  const p = tab.page;
  return [`Tab: ${p.title}`, `URL: ${tab.url}`, `[1] heading "${p.title}"`, `[2] text "${p.marker}"`,
    `[3] textbox "${p.inputLabel}" value="${p.value}"`, `[4] button "${p.buttonLabel}"`, `[5] status "${p.out}"`].join('\n');
}

function makeTab(browser, record) {
  return {
    id: record.id,
    async goto(url) {
      const origin = new URL(url).origin;
      if (!approved.has(origin)) {
        const params = scenario.originRequest === 'unstructured'
          ? {mode: 'form', requestedSchema: {type: 'object', properties: {}}, message: `Allow access to ${origin}?`, _meta: {}}
          : originAccessRequest(origin, {persist: scenario.originPersist === null ? undefined : scenario.originPersist ?? 'always'});
        const answer = await elicit('own-origin', params);
        if (answer?.action !== 'accept') throw new Error(`Browser use cannot access ${origin} because the request was declined. ${scenario.errorText ?? ''}`);
        approved.add(origin);
      }
      const html = await (await fetch(url)).text();
      const pick = re => html.match(re)?.[1] ?? '';
      record.url = url;
      record.title = pick(/<title>([^<]*)<\/title>/);
      record.page = {title: record.title, marker: pick(/id="marker">([^<]*)</), inputLabel: pick(/aria-label="([^"]*)"/), buttonLabel: pick(/<button[^>]*>([^<]*)<\/button>/), value: '', out: 'waiting'};
    },
    async getAXState() { return render(record); },
    async typeText(index, text) {
      if (!record.page || (index !== 3 && index !== null)) throw new Error(`no editable element at ${index}`);
      record.page.value += text;
    },
    async click(index) {
      if (!record.page || index !== 4) throw new Error(`no clickable element at ${index}`);
      record.page.out = doneText(record.page.value);
    },
    async getScreenshot() { return new Uint8Array(PNG); },
    async close() {
      if (scenario.close === 'throw') throw new Error(`extension disconnected while closing the tab. ${scenario.errorText ?? ''}`);
      if (scenario.close !== 'linger') browser.tabs.splice(browser.tabs.indexOf(record), 1);
    },
  };
}

function cuaFor(output) {
  const browser = id => {
    const b = browsers.find(x => x.id === String(id));
    if (!b) throw new Error(`unknown browser ${id}`);
    return b;
  };
  return {
    async listBrowsers() {
      return browsers.map(b => ({id: b.id, name: 'Google Chrome', type: 'extension', family: 'chrome', metadata: {extensionInstanceId: `instance-${b.id}`}}));
    },
    async listTabs({browser: id}) {
      if (!extrasSent) {
        extrasSent = true;
        for (const {label, params} of scenario.extraElicitations ?? []) await elicit(label, params);
      }
      return browser(id).tabs.map(t => ({id: t.id, providerTabId: t.providerTabId ?? t.id, browserId: id, title: t.title, url: t.url}));
    },
    async createBrowserTab(id) {
      if (scenario.createFails) throw new Error(`createBrowserTab was refused. ${scenario.errorText ?? ''}`);
      const b = browser(id);
      const record = {id: String(9000 + ++created), title: 'New Tab', url: 'chrome://newtab/'};
      b.tabs.push(record);
      output.push({type: 'text', text: render(record)});  // the vendor displays the new tab's state
      return makeTab(b, record);
    },
  };
}

const AsyncFunction = (async () => {}).constructor;
async function runCell(code) {
  const content = [];
  const nodeRepl = {
    write: text => content.push({type: 'text', text: String(text)}),
    emitImage: bytes => content.push({type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: 'image/png'}),
  };
  try {
    await new AsyncFunction('cua', 'nodeRepl', code)(cuaFor(content), nodeRepl);
    return {content, isError: false};
  } catch (error) {
    return {content: [{type: 'text', text: String(error?.message ?? error)}], isError: true};
  }
}

const TOOLS = [
  {name: 'js', description: 'Fake js. Browser: cua.createBrowserTab(browserId, url?).', inputSchema: {type: 'object', properties: {code: {type: 'string'}}, required: ['code']}},
  {name: 'js_reset', description: 'Fake reset.', inputSchema: {type: 'object', properties: {}}},
  {name: 'turn_ended', description: 'Fake turn_ended.', inputSchema: {type: 'object', properties: {}}},
];

createInterface({input: process.stdin}).on('line', async line => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id !== undefined && msg.method === undefined) { waiting.get(msg.id)?.(msg.result ?? {error: msg.error}); waiting.delete(msg.id); return; }
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') return send({jsonrpc: '2.0', id: msg.id, result: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'fake-runtime', version: '0'}}});
  if (msg.method === 'tools/list') return send({jsonrpc: '2.0', id: msg.id, result: {tools: TOOLS}});
  if (msg.method === 'tools/call' && msg.params?.name === 'js') return send({jsonrpc: '2.0', id: msg.id, result: await runCell(msg.params.arguments?.code ?? '')});
  send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'unsupported'}});
}).on('close', () => process.exit(0));
