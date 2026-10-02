// Layer (b) of the M7 spike: the relocated pinned vendor runtime with ONLY the browser surface, discovering only an
// owned fixture backend through an explicit BROWSER_USE_BACKEND_PATHS. No account, no browser process, no native
// helper, no Chrome profile. The probe assembles its own launch record here; the production launcher stays
// native-only and gains no public override.
//
// Launch facts used (pinned 26.928.40906):
//   @oai/cua-repl launch.js:11-77   CUA_REPL_ENABLED_SURFACES=browser registers {browser:"@oai/browser-desktop/service"}
//   browser-service.mjs:67722-67742 BROWSER_USE_BACKEND_PATHS lists absolute backend sockets explicitly
//   browser-service.mjs:9532-9551, 11059-11110  BROWSER_USE_SECURITY_MODE stays unset (default policy, no bypass);
//                                   BROWSER_USE_DISABLE_AMBIENT_NETWORK=1 suppresses telemetry and identity initialization
//   browser-service.mjs:17686-17735 the extension request-header policy reads the identity promise, which that switch
//                                   leaves unset (cn() stops jm); normal-network identity behaviour is NOT measured here
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, realpathSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {resolveRuntime} from '../../../src/runtime/manifest.mjs';
import {startFixture} from './fixture.mjs';
import {backendInfo, NO_HANDLER} from './adapter.mjs';

const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CONFIGS = [
  {label: 'extension', kind: 'extension', info: backendInfo('extension')},
  {label: 'extension-header-false', kind: 'extension', info: backendInfo('extension', {agentRequestHeaderEnabled: false})},
  {label: 'cdp', kind: 'cdp', info: backendInfo('cdp')},
  {label: 'extension-origin-approved', kind: 'extension', info: backendInfo('extension'), approveOrigin: 'work.fixture.invalid'},
];

// Built from an explicit allowlist: an inherited PLAYWRIGHT_MCP_EXTENSION_TOKEN, BROWSER_USE_*, NODE_REPL_* or SKY_*
// value can never reach the child, and nothing here reads one.
export function vendorEnv({ambient, paths, codexHome, backendPath}) {
  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  return Object.assign(env, {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CODEX_HOME: codexHome,
    CUA_REPL_NODE_REPL_PATH: paths.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'browser',
    NODE_REPL_NODE_PATH: paths.node,
    NODE_REPL_NODE_MODULE_DIRS: paths.moduleDir,
    NODE_REPL_TRUSTED_CODE_PATHS: paths.moduleDir,
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: paths.codexCli,
    BROWSER_USE_BACKEND_PATHS: backendPath,
    BROWSER_USE_DISABLE_AMBIENT_NETWORK: '1',
  });
}

// Elicitations are declined unless a run names the one synthetic fixture origin it may approve (probe harness only;
// production `serve` forwards every elicitation to the host unchanged).
function answerElicitation(params, approveOrigin, record) {
  const message = String(params?.message ?? '');
  const props = params?.requestedSchema?.properties ?? {};
  const approve = Boolean(approveOrigin) && message.includes(approveOrigin) && (params?.mode ?? 'form') === 'form';
  record.push({mode: params?.mode ?? null, message: message.slice(0, 300), schemaKeys: Object.keys(props).sort(), meta: Object.keys(params?._meta ?? {}).sort(), answered: approve ? 'accept' : 'decline'});
  return approve ? {action: 'accept', content: {}} : {action: 'decline'};
}

function mcpClient(child, transcript, {approveOrigin, elicitations}) {
  let nextId = 0;
  const pending = new Map();
  const send = msg => child.stdin.write(JSON.stringify(msg) + '\n');
  createInterface({input: child.stdout}).on('line', line => {
    transcript.push(line);
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg.method !== undefined && msg.id !== undefined) {
      // Elicitations and other server requests are declined, never accepted.
      send(msg.method === 'elicitation/create' ? {jsonrpc: '2.0', id: msg.id, result: answerElicitation(msg.params, approveOrigin, elicitations)} : {jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by probe'}});
    } else if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  });
  return {
    notify: (method, params) => send({jsonrpc: '2.0', method, params}),
    request: (method, params, timeoutMs) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs} ms`)); }, timeoutMs);
      pending.set(id, {resolve, reject, timer});
      send({jsonrpc: '2.0', id, method, params});
    }),
  };
}

// Each cell writes one "M7RESULT <json>" line; vendor output (documentation, banners) is never stored.
const cell = body => `globalThis.__m7 ??= {};
const __out = {};
try { ${body} } catch (e) { __out.error = String(e?.message ?? e).slice(0, 400); }
nodeRepl.write("M7RESULT " + JSON.stringify(__out));`;

const CELLS = [
  ['listBrowsers', cell(`const list = await cua.listBrowsers({emit: false}); __out.browsers = list; __m7.id = list[0]?.id;`)],
  ['getBrowser', cell(`const b = await cua.getBrowser({id: __m7.id}); const doc = await b.documentation();
__out.objectKeys = Object.keys(b).sort(); __out.docChars = doc.length; __out.headings = (doc.match(/^#+ /gm) ?? []).length;
__out.members = [...new Set(doc.match(/\\b(?:browser|tab|cua)\\.[A-Za-z_]+(?=\\()/g) ?? [])].sort();`)],
  ['listTabs', cell(`const tabs = await cua.listTabs({browser: __m7.id, emit: false}); __out.tabs = tabs; __m7.tabs = tabs;`)],
  ['getTab', cell(`const info = __m7.tabs?.find(t => t.title === "M7 work tab") ?? __m7.tabs?.[0]; if (!info) throw new Error("no listed tab");
const tab = await cua.getTab(info.id, {browser: __m7.id}); __out.tabKeys = Object.keys(tab).sort();
try { await tab.getAXState({emit: false}); __out.ax = "ok"; } catch (e) { __out.axError = String(e?.message ?? e).slice(0, 400); }`)],
  ['createBrowserTab', cell(`const tab = await cua.createBrowserTab(__m7.id); __out.created = {id: tab.id, keys: Object.keys(tab).sort()};`)],
];

async function runConfig({runtime, home, config, sentinels, ambient}) {
  const runDir = join(home, 'run');
  mkdirSync(runDir, {recursive: true, mode: 0o700});
  const socketPath = join(runDir, `m7-${config.label}.sock`);
  const codexHome = join(home, 'state', `m7-codex-${config.label}`);
  const cwd = join(runDir, `m7-cwd-${config.label}`);
  for (const dir of [codexHome, cwd]) { rmSync(dir, {recursive: true, force: true}); mkdirSync(dir, {recursive: true, mode: 0o700}); }
  const fixture = await startFixture({kind: config.kind, info: config.info, socketPath, sentinels, label: config.label});
  const work = fixture.extension.addTab({url: 'https://work.fixture.invalid/', title: 'M7 work tab', childFrames: 1});
  fixture.extension.connect(fixture.connectTab.id);
  fixture.extension.offer(work.id);
  await sleep(10);

  const env = vendorEnv({ambient, paths: runtime.paths, codexHome, backendPath: socketPath});
  const out = {label: config.label, rawInfo: config.info, envKeys: Object.keys(env).sort(), cells: {}, elicitations: [], stderrBytes: 0, ...(config.approveOrigin ? {approveOrigin: config.approveOrigin} : {})};
  const transcript = [];
  let stderr = '';
  const child = spawn(runtime.paths.node, [runtime.paths.cuaRepl], {env, cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: true});
  child.stderr.on('data', d => { stderr += d; if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 20)); });
  let exitInfo = null;
  const exited = new Promise(resolve => child.on('exit', (code, signal) => { exitInfo = {code, signal}; resolve(exitInfo); }));
  const client = mcpClient(child, transcript, {approveOrigin: config.approveOrigin, elicitations: out.elicitations});
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const meta = () => {
    const callId = randomUUID();
    return {callId, threadId: sessionId, sessionId, 'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: turnId, call_id: callId, model: 'm7-probe'}};
  };
  try {
    const init = await client.request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-m7-probe', version: '0'}}, 120_000);
    client.notify('notifications/initialized', {});
    const tools = await client.request('tools/list', {}, 30_000);
    const js = tools.tools.find(t => t.name === 'js');
    out.handshake = {serverName: init.serverInfo?.name ?? null, tools: tools.tools.map(t => t.name).sort(), jsDescriptionChars: js?.description?.length ?? 0,
      browserSurfaceDocumented: /createBrowserTab/.test(js?.description ?? ''), computerSurfaceDocumented: /getApp\(/.test(js?.description ?? '')};
    for (const [name, code] of CELLS) {
      const started = fixture.backend.frames.length;
      try {
        const result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: 45_000}, _meta: meta()}, 90_000);
        const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
        const marker = text.match(/M7RESULT (\{.*\})/);
        out.cells[name] = {isError: result.isError === true, result: marker ? JSON.parse(marker[1]) : null, ...(marker ? {} : {unmarkedChars: text.length})};
      } catch (e) { out.cells[name] = {probeError: e.message}; }
      out.cells[name].backendMethods = fixture.backend.frames.slice(started).filter(f => f.direction === 'client->backend').map(f => f.method ?? (f.decodeError ? 'decode-error' : 'reply'));
    }
    const before = fixture.backend.frames.length;
    try {
      const ended = await client.request('tools/call', {name: 'turn_ended', arguments: {hook_event_name: 'Stop', session_id: sessionId, turn_id: turnId}, _meta: meta()}, 30_000);
      out.turnEnded = {isError: ended.isError === true};
    } catch (e) { out.turnEnded = {probeError: e.message}; }
    await sleep(200);
    const turnFrame = fixture.backend.frames.slice(before).find(f => f.method === 'turnEnded');
    out.turnEnded.backendFrame = turnFrame ?? null;
  } catch (e) {
    out.error = e.message;
  } finally {
    child.stdin.end();
    if (!(await Promise.race([exited, sleep(5000).then(() => null)]))) {
      if (!exitInfo) { try { process.kill(-child.pid, 'SIGTERM'); out.teardownSignal = 'SIGTERM'; } catch {} }
      if (!(await Promise.race([exited, sleep(5000).then(() => null)])) && !exitInfo) { try { process.kill(-child.pid, 'SIGKILL'); out.teardownSignal = 'SIGKILL'; } catch {} await exited; }
    }
    // Group members can outlive the launcher; signal the group we created only while a member remains.
    if (spawnSync('pgrep', ['-g', String(child.pid)]).status === 0) { try { process.kill(-child.pid, 'SIGTERM'); out.groupStragglersSignalled = true; } catch {} }
    out.exit = exitInfo;
    out.stderrBytes = Buffer.byteLength(stderr);
    out.frames = fixture.backend.frames;
    out.extensionCommands = fixture.extension.commands.map(c => ({method: c.method, ...(c.cdp ? {cdp: c.cdp} : {}), ...(c.debuggee ? {debuggee: Object.keys(c.debuggee).sort()} : {})}));
    out.adapterState = fixture.adapter.state();
    await fixture.close();
  }
  return {out, scanTexts: [stderr, transcript.join('\n'), JSON.stringify(fixture.backend.frames), JSON.stringify(fixture.adapter.events)], scanRoots: [codexHome, cwd]};
}

const status = (pass, blocked) => pass ? 'PASS' : blocked ? 'BLOCKED' : 'FAIL';

export async function runVendorLayer({home, sentinels}) {
  const blockedAll = reason => ({layer: 'vendor', scenarios: [{id: 'vendor-prerequisites', title: 'pinned runtime installed in an explicit scratch CUA_HOME', status: 'BLOCKED', checks: [{name: 'prerequisite', pass: false, detail: reason}]}]});
  if (!home) return blockedAll('CUA_HOME (or --home) must name a scratch home holding the pinned runtime');
  let runtime;
  try { runtime = resolveRuntime({home: realpathSync(home)}); } catch (e) { return blockedAll(`runtime unavailable: ${e.code ?? ''} ${e.message}`.trim()); }
  const realHome = realpathSync(home);
  const signatures = ['node', 'nodeRepl', 'codexCli'].map(key => {
    const r = spawnSync('codesign', ['--verify', '--strict', runtime.paths[key]]);
    return {component: key, valid: r.status === 0};
  });
  // A fake token stands in for an inherited one: it must not reach the child environment.
  const ambient = {...Object.fromEntries(AMBIENT_ALLOWLIST.filter(k => typeof process.env[k] === 'string').map(k => [k, process.env[k]])), PLAYWRIGHT_MCP_EXTENSION_TOKEN: sentinels.token, BROWSER_USE_SECURITY_MODE: 'disabled-for-local-testing'};

  const runs = {};
  const scanTexts = [];
  const scanRoots = [];
  for (const config of CONFIGS) {
    const r = await runConfig({runtime, home: realHome, config, sentinels, ambient});
    runs[config.label] = r.out;
    scanTexts.push(...r.scanTexts);
    scanRoots.push(...r.scanRoots);
  }
  return {layer: 'vendor', release: runtime.release ?? null, runs, scenarios: judge(runs, signatures), scanTexts, scanRoots,
    async cleanup() { for (const root of scanRoots) rmSync(root, {recursive: true, force: true}); }};
}

// turnEnded is a plain request carrying {session_id, turn_id} (browser-service.mjs:68041-68054); getInfo carries none.
const sessionRequests = run => run.frames.filter(f => f.direction === 'client->backend' && f.method && !['getInfo', 'turnEnded'].includes(f.method));

function judge(runs, signatures) {
  const ext = runs.extension, hdr = runs['extension-header-false'], cdp = runs.cdp;
  const all = [ext, hdr, cdp, runs['extension-origin-approved']];
  const scenarios = [];
  const add = (id, title, checks, sources, blockedReason) => {
    const pass = checks.length > 0 && checks.every(c => c.pass);
    scenarios.push({id, title, status: status(pass, blockedReason && !pass), sources, checks, ...(blockedReason && !pass ? {blocked: blockedReason} : {})});
  };
  const c = (name, pass, detail) => ({name, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});

  add('vendor-launch', 'relocated runtime, browser surface only, verified signatures, allowlisted environment', [
    c('vendor component signatures verify', signatures.every(s => s.valid), signatures),
    ...all.map(r => c(`${r.label}: MCP handshake exposes js and documents only the browser surface`, r.handshake?.tools?.includes('js') && r.handshake.browserSurfaceDocumented && !r.handshake.computerSurfaceDocumented, r.handshake ?? r.error)),
    ...all.map(r => c(`${r.label}: no token, security-mode, trusted-service or SKY override reached the child`, !r.envKeys.some(k => k === 'PLAYWRIGHT_MCP_EXTENSION_TOKEN' || k === 'BROWSER_USE_SECURITY_MODE' || k === 'NODE_REPL_TRUSTED_SERVICES' || k.startsWith('SKY_')))),
  ], ['@oai/cua-repl launch.js:11-77']);

  add('vendor-framing', 'the vendor client speaks u32-length JSON-RPC 2.0 to the owned socket', all.map(r => {
    const first = r.frames.find(f => f.direction === 'client->backend');
    return c(`${r.label}: first client frame decoded as JSON-RPC getInfo with integer id`, first?.method === 'getInfo' && first.jsonrpc === '2.0' && Number.isInteger(first.id) && !r.frames.some(f => f.decodeError), first);
  }), ['browser-service.mjs:66712-66841', 'browser-service.mjs:10352-10416']);

  add('getinfo-raw-vs-normalized', 'raw getInfo at the wire versus the normalized BrowserInfo the model sees', all.map(r => {
    const listed = r.cells.listBrowsers?.result?.browsers?.[0];
    return c(`${r.label}: normalized entry has a vendor-assigned id, keeps type/name and drops raw capabilities`, listed && typeof listed.id === 'string' && listed.type === r.rawInfo.type && !('capabilities' in listed), {raw: Object.keys(r.rawInfo).sort(), normalized: listed ?? r.cells.listBrowsers});
  }), ['browser-service.mjs:31960-31976 (zod dy/rs: agent-command results)', 'browser-service.mjs:66007-66033 (A_/po normalization)', 'browser-service.mjs:67599-67613 (discovery: no schema parse)']);

  add('documented-surface', 'browser documentation and API members per truthful kind', all.map(r => {
    const g = r.cells.getBrowser?.result;
    return c(`${r.label}: documentation read (metadata only)`, g && !g.error && g.docChars > 0, g ?? r.cells.getBrowser);
  }), ['browser-service.mjs:66038-66043 (get_browser_documentation)']);

  add('session-parameters', 'every session request carries session_id, turn_id and session_context', [ext, cdp].map(r => {
    const reqs = sessionRequests(r);
    return c(`${r.label}: ${reqs.length} session requests all carry the triple`, reqs.length > 0 && reqs.every(f => f.params?.session_id === 'string' && f.params?.turn_id === 'string' && typeof f.params?.session_context === 'string'), [...new Set(reqs.map(f => `${f.method}:${f.params?.session_context}`))]);
  }), ['browser-service.mjs:68061-68110']);

  const approved = runs['extension-origin-approved'];
  const requests = run => run.frames.filter(f => f.direction === 'client->backend' && f.method);
  const nextAfter = (run, method) => { const list = requests(run); const i = list.findIndex(f => f.method === method); return i < 0 ? null : list[i + 1] ?? null; };
  const optional = [ext, cdp, approved].flatMap(r => r.frames.filter(f => f.direction === 'backend->client' && f.error?.code === -1).map(f => ({label: r.label, message: f.error.message})));
  const cached = nextAfter(approved, 'executeCdpWithCachedExpression');
  add('optional-method-fallback', 'unimplemented optional backend methods: exact "No handler" answers and the vendor fallbacks they select', [
    c('every optional-method answer used the exact vendor wording and code -1', optional.length > 0 && optional.every(o => o.message.startsWith('No handler registered for method: ')), optional),
    c('extension: getCommittedTabUrl falls back to getTabs', nextAfter(ext, 'getCommittedTabUrl')?.method === 'getTabs'),
    c('cdp: getCommittedTabUrl falls back to executeCdp Page.getFrameTree', nextAfter(cdp, 'getCommittedTabUrl')?.method === 'executeCdp' && nextAfter(cdp, 'getCommittedTabUrl')?.params?.method === 'Page.getFrameTree'),
    c('executeCdpWithCachedExpression falls back to plain executeCdp of the same CDP method', cached?.method === 'executeCdp' && cached.params?.method === 'Runtime.evaluate', cached && {method: cached.method, cdp: cached.params?.method}),
    c('extension: getUserTabs falls back without failing listTabs', optional.some(o => o.label === 'extension' && o.message.endsWith('getUserTabs')) && Array.isArray(ext.cells.listTabs?.result?.tabs)),
  ], ['browser-service.mjs:67810-67890', 'browser-service.mjs:67942-67983', 'browser-service.mjs:68316-68328']);

  add('attach-and-child-routes', 'tab attach, flattened auto-attach and the child-session announcement as the vendor drives them', [approved, cdp].flatMap(r => {
    const reqs = requests(r);
    const attachedEvent = r.frames.find(f => f.direction === 'backend->client' && f.method === 'onCDPEvent' && f.params?.method === 'Target.attachedToTarget');
    return [
      c(`${r.label}: attach precedes the first CDP command on that tab`, reqs.findIndex(f => f.method === 'attach') >= 0 && reqs.findIndex(f => f.method === 'attach') < reqs.findIndex(f => f.method === 'executeCdp' && f.params?.target?.tabId === reqs.find(g => g.method === 'attach')?.params?.tabId)),
      c(`${r.label}: Target.setAutoAttach sent on the tab target`, reqs.some(f => f.method === 'executeCdp' && f.params?.method === 'Target.setAutoAttach' && JSON.stringify(Object.keys(f.params.target)) === '["tabId"]')),
      ...(r === approved ? [c(`${r.label}: the fixture's Target.attachedToTarget reached the vendor as onCDPEvent {source:{tabId}}`, attachedEvent && Object.keys(attachedEvent.params.source).join() === 'tabId')] : []),
    ];
  }), ['browser-service.mjs:47617-47660', 'browser-service.mjs:48068-48110', 'browser-service.mjs:47189-47215']);

  const childCommands = [ext, cdp, approved].flatMap(r => requests(r).filter(f => f.method?.startsWith('executeCdp') && (f.params?.target?.sessionId !== undefined || f.params?.target?.targetId !== undefined)));
  add('vendor-child-session-commands', 'the vendor addresses a child session ({tabId, sessionId|targetId}) over the wire', [
    c('a child-targeted executeCdp was observed', childCommands.length > 0, childCommands.length),
  ], ['browser-service.mjs:48392-48410', 'browser-service.mjs:48485-48517'], 'the vendor stopped at the first refused page-state CDP call (Runtime.enable/Runtime.evaluate) before addressing the announced child session; the adapter route is proven only by the fixture layer');

  const members = r => r.cells.getBrowser?.result?.members ?? [];
  add('kind-comparison', 'what each truthful kind exposes and requires (observations; production kind is chosen by implemented capability)', [
    c('extension documents nameSession/markDeliverable/markHandoff and a user-tabs object; cdp does not', ['browser.nameSession', 'tab.markDeliverable', 'tab.markHandoff'].every(m => members(ext).includes(m) && !members(cdp).includes(m)) && ext.cells.getBrowser?.result?.objectKeys?.includes('user') && !cdp.cells.getBrowser?.result?.objectKeys?.includes('user'), {extension: members(ext), cdp: members(cdp)}),
    c('extension: binding an existing offered tab asks the user for origin access (elicitation), declined -> refused', ext.elicitations.length === 1 && ext.elicitations[0].answered === 'decline' && /security policy/.test(ext.cells.getTab?.result?.error ?? ''), ext.elicitations.map(e => e.message)),
    c('extension: with that synthetic origin approved, the vendor attaches the offered tab', approved.elicitations.some(e => e.answered === 'accept') && requests(approved).some(f => f.method === 'attach' && f.params?.tabId === 1002)),
    c('cdp: binding an existing tab issues CDP before any attach and fails there on an attach-gated transport (origin check not reached)', cdp.elicitations.length === 0 && /Debugger is not attached/.test(cdp.cells.getTab?.result?.error ?? '') && !requests(cdp).slice(0, requests(cdp).findIndex(f => f.method === 'createTab')).some(f => f.method === 'attach')),
    c('both kinds: createBrowserTab = createTab, attach, then page-state CDP (refused here)', [ext, cdp].every(r => requests(r).some(f => f.method === 'createTab') && /fixture refuses CDP/.test(r.cells.createBrowserTab?.result?.error ?? ''))),
  ], ['browser-service.mjs:67942-67983', 'browser-service.mjs:66007-66033', 'browser-service.mjs:36462-36507 (origin-access elicitation)']);

  const identity = hdr.cells.listTabs?.result?.error ?? hdr.cells.getTab?.result?.error ?? null;
  // Every vendor run sets BROWSER_USE_DISABLE_AMBIENT_NETWORK=1, so cn() keeps jm from starting identity initialization
  // and wv() finds no identity promise at all. This measures "identity initialization disabled", not a normal-network
  // run whose identity fetch was attempted and failed (unmeasured).
  add('identity-policy', 'extension kind with agentRequestHeaderEnabled:false, default security mode, identity initialization disabled by the ambient-network switch', [
    c('session requests are refused by the vendor before reaching the backend', sessionRequests(hdr).length === 0, sessionRequests(hdr).map(f => f.method)),
    c('the refusal is wv()\'s "no identity initialized" error (not an attempted identity fetch that failed)', typeof identity === 'string' && identity === 'Browser request-header policy requires caller identity.', identity),
    c('omitting the field (plain extension run) does reach the backend', sessionRequests(ext).length > 0),
  ], ['browser-service.mjs:68066-68092', 'browser-service.mjs:17686-17692 (wv)', 'browser-service.mjs:17727-17735 (jm skipped when cn())', 'browser-service.mjs:11331 (cn)']);

  add('turn-completion', 'hidden turn_ended reaches the backend as turnEnded with the task ids', [ext, cdp].map(r =>
    c(`${r.label}: turnEnded frame with session_id/turn_id`, r.turnEnded?.backendFrame?.params?.session_id === 'string' && r.turnEnded.backendFrame.params.turn_id === 'string', r.turnEnded)),
  ['browser-service.mjs:68041-68054', 'browser-service.mjs:68154-68213']);

  add('synthetic-only', 'only neutral CDP was answered; everything else was refused, no page state invented', all.map(r => {
    const answered = r.frames.filter(f => f.direction === 'backend->client' && f.result !== undefined).length;
    const refused = [...new Set(r.frames.filter(f => f.direction === 'backend->client' && f.error?.message?.startsWith('fixture refuses CDP')).map(f => f.error.message.split(':')[0]))];
    return c(`${r.label}: answered ${answered}, refused CDP ${refused.length}`, true, {refused});
  }), ['scripts/probe/chrome/fake-extension.mjs NEUTRAL_CDP']);
  return scenarios;
}

export {NO_HANDLER};
