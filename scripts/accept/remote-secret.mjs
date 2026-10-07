#!/usr/bin/env node
// Live remote secret fixture (issue #66, acceptance 3): a Streamable HTTP MCP client that reaches an enrolled Mac's
// agent through the relay, binds TextEdit there, types `{{secret:<KEY>}}` into a document the caller opened on that Mac,
// and checks that the document holds exactly the stored value without the value crossing the MCP stream: the expected
// SHA-256 goes into the readback cell, which hashes the document's text and returns only the digest. The whole
// transcript (every request and SSE event) is scanned for the value afterwards.
//   node scripts/accept/remote-secret.mjs --config <mcp.json> --key <KEY> --value-file <0600 file> --doc <window title>
// The config is a Claude Code MCP config naming one HTTP server (url and Authorization header); the bearer is sent and
// never printed. The value file holds the value the caller stored on the target (`cua secrets set <KEY>` there); it is
// read only to hash and to scan for. TextEdit's app approval is accepted only when it is exactly the pinned request for
// TextEdit (scripts/accept/lib.mjs), for the session; anything else is declined. The cell types only while the named
// document is TextEdit's front window, and the caller closes the document and removes the key afterwards.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {fingerprints, textLeaks} from '../probe/leak-scan.mjs';
import {isTextEditApproval} from './lib.mjs';

const {values: options} = parseArgs({options: {config: {type: 'string'}, key: {type: 'string'}, 'value-file': {type: 'string'}, doc: {type: 'string'}}, strict: true});
for (const name of ['config', 'key', 'value-file', 'doc']) if (!options[name]) { console.error(`remote-secret: --${name} is required`); process.exit(2); }
const servers = JSON.parse(readFileSync(options.config, 'utf8')).mcpServers;
const server = Object.values(servers)[0];
const value = readFileSync(options['value-file'], 'utf8').replace(/\n$/, '');
const prints = fingerprints(value);
const transcript = [];
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const elicitations = [];
let sessionId = null;
let nextId = 0;

const headers = extra => ({...server.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
  ...(sessionId ? {'Mcp-Session-Id': sessionId} : {}), ...extra});

async function post(message) {
  transcript.push(JSON.stringify(message));
  return fetch(server.url, {method: 'POST', headers: headers(), body: JSON.stringify(message)});
}

// Answers a server request (an app approval) on its own POST.
async function answer(msg) {
  const accepted = isTextEditApproval(msg);
  elicitations.push({method: msg.method, message: String(msg.params?.message ?? '').slice(0, 120), answer: accepted ? 'accept (session)' : 'decline'});
  const reply = await post({jsonrpc: '2.0', id: msg.id, result: accepted ? {action: 'accept', content: {}} : {action: 'decline'}});
  await reply.text();
}

// One request; its answer from a JSON body or from the SSE stream, server requests on the stream answered as they come.
async function request(method, params = {}, timeoutMs = 120_000) {
  const id = ++nextId;
  const res = await post({jsonrpc: '2.0', id, method, params});
  if (!sessionId) sessionId = res.headers.get('mcp-session-id');
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) { const text = await res.text(); transcript.push(text); return JSON.parse(text); }
  if (!type.includes('text/event-stream')) { const text = await res.text(); transcript.push(text); return {httpStatus: res.status, body: text.slice(0, 300)}; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buffer = '';
  while (Date.now() < deadline) {
    const {value: chunk, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(chunk, {stream: true});
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      transcript.push(event);
      const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      let msg;
      try { msg = JSON.parse(data); } catch { continue; }
      if (msg.method && msg.id !== undefined) { await answer(msg); continue; }
      if (msg.id === id) { await reader.cancel().catch(() => {}); return msg; }
    }
  }
  await reader.cancel().catch(() => {});
  return {timedOut: true};
}
const text = reply => (reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
const js = (code, timeoutMs = 120_000) => request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs - 5000}}, timeoutMs);
const lastJson = (reply, key) => { const line = text(reply).split('\n').reverse().find(l => l.startsWith(`{"${key}"`)); try { return line ? JSON.parse(line) : null; } catch { return null; } };

const report = {url: server.url.replace(/\/d\/([^/]{4})[^/]*\//, '/d/$1…/'), key: options.key, doc: options.doc, steps, elicitations};
try {
  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-remote-secret', version: '0'}});
  if (!step('initialize through the relay', !!init.result && !!sessionId, {serverInfo: init.result?.serverInfo, session: !!sessionId})) throw new Error('initialize');
  await post({jsonrpc: '2.0', method: 'notifications/initialized'}).then(r => r.text());
  const listed = await request('tools/call', {name: 'secrets_list', arguments: {}});
  const keys = listed.result?.structuredContent?.labels ?? [];
  step('secrets_list on the target lists the key (keys only)', keys.includes(options.key), {status: listed.result?.structuredContent?.status, hasKey: keys.includes(options.key), count: keys.length});
  await js('1');
  const doc = JSON.stringify(options.doc);
  const bound = lastJson(await js(`globalThis.app = await cua.getApp("com.apple.TextEdit");
    const __ax = await app.getAXState({emit: false, disableDiffing: true});
    nodeRepl.write(JSON.stringify({front: __ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null}));`), 'front');
  if (!step('bind TextEdit on the target; the caller\'s document is in front', bound?.front === options.doc, bound)) throw new Error('bind');
  const typed = await js(`const __front = (await app.getAXState({emit: false, disableDiffing: true})).match(/^Window: "([^"]*)"/m)?.[1] ?? null;
    if (__front !== ${doc}) throw new Error('the fixture document is not in front');
    await app.typeText(${JSON.stringify(`{{secret:${options.key}}}`)}); nodeRepl.write('{"typed":true}');`);
  step('typeText({{secret:KEY}}) on the target through the trusted wrapper', /"typed":true/.test(text(typed)) && !typed.result?.isError,
    {isError: !!typed.result?.isError, text: text(typed).split(value).join('<value>').slice(-400)});
  const expected = createHash('sha256').update(value, 'utf8').digest('hex');
  const seen = lastJson(await js(`const __ax = await app.getAXState({emit: false, disableDiffing: true});
    const __value = __ax.match(/Value: (.*?), ID: First Text View/)?.[1] ?? "";
    const {createHash} = await import('node:crypto');
    nodeRepl.write(JSON.stringify({hash: createHash('sha256').update(__value, 'utf8').digest('hex'), chars: [...__value].length,
      front: __ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null}));`), 'hash');
  step('the document holds exactly the stored value (SHA-256 compared inside the cell)', seen?.hash === expected && seen?.front === options.doc,
    {exact: seen?.hash === expected, chars: seen?.chars ?? null, expectedChars: [...value].length, front: seen?.front ?? null});
  const ended = await request('tools/call', {name: 'end_task', arguments: {}});
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, String(error.message).split(value).join('<value>'));
} finally {
  if (sessionId) {
    const closed = await fetch(server.url, {method: 'DELETE', headers: headers()}).catch(error => ({status: error.message}));
    report.deleteStatus = closed.status;
  }
}
const leaks = textLeaks(transcript.join('\n'), prints);
step('the value appears nowhere in the MCP traffic through the relay (requests and SSE events, raw or base64)', leaks === 0, {fingerprints: prints.length, found: leaks, events: transcript.length});
report.status = steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
const out = JSON.stringify(report, null, 1);
const bearer = String(server.headers?.Authorization ?? '').replace(/^Bearer\s+/i, '');
console.log(out.split(value).join('<value>').split(bearer || '\u0000').join('<bearer>'));
process.exitCode = report.status === 'PASS' ? 0 : 1;
