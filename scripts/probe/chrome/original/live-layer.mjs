// M9 live layer: does the relocated runtime's real @oai/browser-desktop service accept the user's already-running
// original OpenAI Chrome hosts, and what does its normal policy path require before a session request is honoured?
//
// Launch: the existing owned anchor (src/mcp/upstream.mjs) starts the relocated vendor node + cua-repl with the
// browser surface only and the vendor's own browser service (no trusted-service override), an owned EMPTY
// CODEX_HOME under a mkdtemp scratch, and the vendor's default network behaviour (no
// BROWSER_USE_DISABLE_AMBIENT_NETWORK, no BROWSER_USE_SECURITY_MODE), so identity/telemetry calls are part of what
// is observed. BROWSER_USE_BACKEND_PATHS is exactly the sockets selected by hosts.mjs.
//
// Cells: cua.listBrowsers({emit:false}), then cua.listTabs({browser, emit:false}) per listed browser. Nothing else.
// Each cell reduces its result inside the REPL to a whitelist (types, families, booleans, counts); vendor error text
// leaves the REPL only to be classified and sanitized here. Tab titles/URLs, profile names, instance ids, socket
// paths and auth material are never recorded. Every elicitation is declined.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {resolveRuntime} from '../../../../src/runtime/manifest.mjs';
import {spawnUpstream} from '../../../../src/mcp/upstream.mjs';
import {classifyError, sanitizeVendorText} from './classify.mjs';
import {desktopRunning, listProcesses, lsofUnix, selectBackends, verifiedVendor} from './hosts.mjs';

const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const MAX_SOCKETS = 4;
const TIMEOUTS = {initializeMs: 60_000, listMs: 30_000, cellMs: 30_000, callMs: 60_000, teardownMs: 5000, sampleMs: 300};
const CELLS_ALLOWED = ['listBrowsers', 'listTabs'];

export function liveEnv({ambient, paths, codexHome, sockets}) {
  if (ambient.HOME && realish(codexHome) === realish(join(ambient.HOME, '.codex'))) throw new Error('CODEX_HOME must be an owned scratch directory, never the user Codex home');
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
    // Same as the production launcher (src/runtime/launch.mjs): node_repl's own analytics only, not browser policy.
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: paths.codexCli,
    BROWSER_USE_BACKEND_PATHS: sockets.join(':'),
  });
}
const realish = p => p.replace(/\/+$/, '');

// One cell's outcome: ok, or the class and sanitized text of the vendor's error.
export function cellOutcome(cell) {
  const raw = cell.probeError ?? cell.result?.error ?? (cell.result ? null : cell.unmarked ?? 'no result marker');
  if (raw == null && !cell.isError) return {class: 'ok'};
  const text = String(raw ?? 'isError without message');
  return {class: cell.probeError ? (/timed out/.test(text) ? 'transport' : classifyError(text)) : classifyError(text), text: sanitizeVendorText(text)};
}

const status = (pass, blocked) => pass ? 'PASS' : blocked ? 'BLOCKED' : 'FAIL';

export function judgeLive(o) {
  const scenarios = [];
  const add = (id, title, st, detail) => scenarios.push({id, title, status: st, ...(detail === undefined ? {} : {detail})});
  const p = o.prerequisites;
  const sigs = p.signatures ?? {};
  const prereqOk = p.runtime && sigs.node && sigs.nodeRepl && sigs.codexCli && sigs.hosts?.length > 0 && sigs.hosts.every(Boolean) && p.socketCount > 0 && p.socketCount <= MAX_SOCKETS;
  add('live-prerequisites', 'pinned runtime resolved; vendor node/node_repl/codex and every host binary pass the Apple-anchor team 2DC432GLL2 requirement; 1-4 live host sockets selected via lsof from Chrome-parented hosts', status(prereqOk, true), p);
  if (!prereqOk) {
    for (const [id, title] of [['live-launch', 'relocated runtime launched with the browser surface only'], ['list-browsers', 'listBrowsers lists the existing hosts as extension/chrome backends'], ['list-tabs-policy', 'listTabs outcome class under an empty owned CODEX_HOME']]) add(id, title, 'BLOCKED', 'prerequisites not met; nothing was launched');
    return scenarios;
  }
  const h = o.handshake;
  add('live-launch', 'relocated runtime launched through the owned anchor; MCP handshake exposes js and documents only the browser surface', status(h?.tools?.includes('js') && h.browserSurfaceDocumented && !h.computerSurfaceDocumented), h ?? o.launchError);
  const lb = o.listBrowsers;
  const browsers = lb?.browsers ?? [];
  add('list-browsers', 'the real browser service lists the existing hosts as extension backends with Chrome family', status(lb?.class === 'ok' && browsers.length > 0 && browsers.every(b => b.type === 'extension' && b.family === 'chrome'), !h), {class: lb?.class, ...(lb?.text ? {text: lb.text} : {}), listed: browsers.length, selectedSockets: p.socketCount});
  const tabs = o.listTabs ?? [];
  const measured = tabs.length > 0 && tabs.length === browsers.length && tabs.every(t => ['identity-or-auth', 'policy', 'ok'].includes(t.class));
  add('list-tabs-policy', 'listTabs per listed browser: outcome class identified (identity-or-auth / policy are the expected refusals under an empty owned CODEX_HOME; ok means the read-only getTabs reached a host)', status(measured, !browsers.length), {outcomes: tabs, unexpectedBackendReach: tabs.some(t => t.class === 'ok')});
  add('elicitations-declined', 'every elicitation was declined (none accepted)', status(o.elicitations.every(e => e.answered === 'decline')), {count: o.elicitations.length, elicitations: o.elicitations});
  add('read-only-cells', 'only listBrowsers and listTabs cells were sent (tabOperations: 0)', status(o.cellsSent.every(c => CELLS_ALLOWED.includes(c))), {cellsSent: o.cellsSent});
  const t = o.teardown;
  add('owned-teardown', 'owned runtime torn down through the anchor; no owned process left; the user hosts were not stopped', status(t.confirmed && t.leftovers === 0 && t.hostsStillRunning), t);
  return scenarios;
}

// ---- I/O below -------------------------------------------------------------------------------------------------

const cellCode = body => `const __out = {};
try { ${body} } catch (e) { __out.error = String(e?.message ?? e).slice(0, 600); }
nodeRepl.write("M9RESULT " + JSON.stringify(__out));`;

// The normalized BrowserInfo is reduced in the REPL: no name, profile name, instance or session id leaves it.
const LIST_BROWSERS = cellCode(`const list = await cua.listBrowsers({emit: false});
globalThis.__m9ids = list.map(b => String(b.id));
__out.browsers = list.map(b => ({
  idShape: /^[0-9]{1,6}$/.test(String(b.id)) ? "numeric" : "other",
  type: ["extension", "cdp", "iab", "mcpapps"].includes(b.type) ? b.type : "other",
  family: typeof b.family === "string" && /^[a-z]{1,20}$/.test(b.family) ? b.family : (b.family == null ? null : "other"),
  nameIsGenericChrome: typeof b.name === "string" && /^(google )?chrome$/i.test(b.name.trim()),
  nameVersions: typeof b.name === "string" ? [...new Set(b.name.match(/\\b\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?\\b/g) ?? [])] : [],
  profileNamePresent: typeof b.profileName === "string" && b.profileName.length > 0,
  extensionInstanceIdPresent: typeof b.metadata?.extensionInstanceId === "string",
  codexSessionIdPresent: typeof b.metadata?.codexSessionId === "string",
  keys: Object.keys(b).sort(),
}));`);
const listTabs = index => cellCode(`const id = globalThis.__m9ids?.[${index}];
if (id === undefined) throw new Error("probe: no listed browser at index ${index}");
const tabs = await cua.listTabs({browser: id, emit: false});
__out.count = Array.isArray(tabs) ? tabs.length : null;`);

function mcpClient(upstream, elicitations) {
  let next = 0;
  const pending = new Map();
  upstream.onMessage(msg => {
    if (msg.method !== undefined && msg.id !== undefined) {
      if (msg.method === 'elicitation/create') {
        const message = String(msg.params?.message ?? '');
        elicitations.push({mode: msg.params?.mode ?? 'form', class: classifyError(message), text: sanitizeVendorText(message, 200), answered: 'decline'});
        upstream.send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}});
      } else upstream.send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by probe'}});
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

// While the runtime runs: which executables are in the owned group, and what TCP endpoints it holds (counts only).
function startSampler(pgid) {
  const commands = new Set();
  const endpoints = new Set();
  const ports = {};
  let samples = 0;
  const tick = () => {
    samples++;
    try {
      const rows = execFileSync('/bin/ps', ['-axo', 'pgid=,comm='], {encoding: 'utf8', timeout: 2000}).split('\n');
      for (const r of rows) { const m = r.match(/^\s*(\d+)\s+(.*?)\s*$/); if (m && Number(m[1]) === pgid) commands.add(m[2].split('/').pop()); }
    } catch {}
    try {
      const out = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-g', String(pgid), '-i', 'TCP', '-F', 'cn'], {encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']});
      for (const line of out.split('\n')) {
        const m = line.match(/^n.*->(.*):(\d+)$/);
        if (m && !endpoints.has(`${m[1]}:${m[2]}`)) { endpoints.add(`${m[1]}:${m[2]}`); ports[m[2]] = (ports[m[2]] ?? 0) + 1; }
      }
    } catch {}
  };
  const timer = setInterval(tick, TIMEOUTS.sampleMs);
  tick();
  return {stop() { clearInterval(timer); return {samples, groupExecutables: [...commands].sort(), remoteTcpEndpoints: endpoints.size, remotePorts: ports}; }};
}

function entryNames(dir) { try { return readdirSync(dir).sort(); } catch { return null; } }
function findCodexTempLeftovers(dir, depth = 4) {
  let n = 0;
  const walk = (d, k) => { let es; try { es = readdirSync(d, {withFileTypes: true}); } catch { return; }
    for (const e of es) if (e.isDirectory()) { if (/^codex[A-Za-z0-9]{6}$/.test(e.name)) n++; if (k > 0) walk(join(d, e.name), k - 1); } };
  walk(dir, depth);
  return n;
}

export async function runLiveLayer({home}) {
  const o = {prerequisites: {runtime: false}, elicitations: [], cellsSent: [], listTabs: [], teardown: {confirmed: false, leftovers: null, hostsStillRunning: null}};
  const facts = {desktopRunning: null, tabOperations: 0, hosts: {count: 0, socketCount: 0, rejectedHosts: 0}, extensionVersions: [], extensionVersionSource: 'normalized listBrowsers entry name only (raw getInfo is not visible to cells)'};
  let forbidden = [];
  const finish = () => ({layer: 'live', ...facts, observations: publicObservations(o), scenarios: judgeLive(o), forbidden});

  let runtime;
  if (!home) { o.prerequisites.error = 'CUA_HOME (or --home) must name a scratch home holding the pinned runtime'; return finish(); }
  try { runtime = resolveRuntime({home: realpathSync(home)}); o.prerequisites.runtime = true; o.prerequisites.release = runtime.release; } catch (e) { o.prerequisites.error = `runtime unavailable: ${e.code ?? 'error'}`; return finish(); }

  const before = listProcesses();
  facts.desktopRunning = desktopRunning(before);
  const selection = selectBackends({processes: before, lsof: lsofUnix});
  forbidden = [...selection.sockets, ...selection.sockets.map(s => s.split('/').pop())];
  facts.hosts = {count: selection.hosts.length, socketCount: selection.sockets.length, rejectedHosts: selection.rejectedHosts, lsofFailures: selection.hosts.filter(h => h.lsofFailed).length};
  o.prerequisites.hostCount = selection.hosts.length;
  o.prerequisites.socketCount = selection.sockets.length;
  o.prerequisites.signatures = {node: verifiedVendor(runtime.paths.node), nodeRepl: verifiedVendor(runtime.paths.nodeRepl), codexCli: verifiedVendor(runtime.paths.codexCli), hosts: selection.hostExecutables.map(verifiedVendor)};
  if (judgeLive(o)[0].status !== 'PASS') return finish();

  const scratch = realpathSync(mkdtempSync('/tmp/cua-m9-live-'));
  const codexHome = join(scratch, 'codex');
  const cwd = join(scratch, 'cwd');
  for (const d of [codexHome, cwd]) mkdirSync(d, {mode: 0o700});
  const stderrPath = join(scratch, 'stderr');
  const stderrFd = openSync(stderrPath, 'w', 0o600);
  const hostPids = selection.hosts.map(h => h.pid);
  const runtimePidsBefore = new Set(pgrepF(runtime.root));
  const env = liveEnv({ambient: process.env, paths: runtime.paths, codexHome, sockets: selection.sockets});
  o.envKeys = Object.keys(env).sort();
  const upstream = spawnUpstream({command: runtime.paths.node, args: [runtime.paths.cuaRepl], env, cwd}, {stderr: stderrFd, diagnostics: () => {}});
  closeSync(stderrFd);
  const sampler = startSampler(upstream.pid);
  const client = mcpClient(upstream, o.elicitations);
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const meta = () => {
    const callId = randomUUID();
    return {'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: turnId, call_id: callId, model: 'm9-probe'}};
  };
  const runCell = async (name, code) => {
    o.cellsSent.push(name);
    try {
      const result = await client.request('tools/call', {name: 'js', arguments: {code, title: `M9 read-only ${name}`, timeout_ms: TIMEOUTS.cellMs}, _meta: meta()}, TIMEOUTS.callMs);
      const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      const marker = text.match(/M9RESULT (\{.*\})/);
      return {isError: result.isError === true, result: marker ? JSON.parse(marker[1]) : null, ...(marker ? {} : {unmarked: text.slice(0, 600)})};
    } catch (e) { return {probeError: e.message}; }
  };
  try {
    const init = await client.request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-m9-probe', version: '0'}}, TIMEOUTS.initializeMs);
    client.notify('notifications/initialized', {});
    const tools = await client.request('tools/list', {}, TIMEOUTS.listMs);
    const js = tools.tools.find(t => t.name === 'js');
    o.handshake = {serverName: init.serverInfo?.name ?? null, tools: tools.tools.map(t => t.name).sort(), browserSurfaceDocumented: /createBrowserTab/.test(js?.description ?? ''), computerSurfaceDocumented: /getApp\(/.test(js?.description ?? '')};
    const lb = await runCell('listBrowsers', LIST_BROWSERS);
    o.listBrowsers = {...cellOutcome(lb), browsers: lb.result?.browsers ?? []};
    facts.extensionVersions = [...new Set(o.listBrowsers.browsers.flatMap(b => b.nameVersions ?? []))];
    for (let i = 0; i < o.listBrowsers.browsers.length; i++) {
      const lt = await runCell('listTabs', listTabs(i));
      o.listTabs.push({browserIndex: i, ...cellOutcome(lt), ...(typeof lt.result?.count === 'number' ? {tabCount: lt.result.count} : {})});
    }
  } catch (e) {
    o.launchError = sanitizeVendorText(e.message);
  } finally {
    client.abandon();
    const cleanup = await upstream.terminate({budgetMs: TIMEOUTS.teardownMs});
    o.network = sampler.stop();
    const after = listProcesses();
    const leftovers = pgrepF(runtime.root).filter(pid => !runtimePidsBefore.has(pid));
    o.teardown = {confirmed: cleanup.confirmed, steps: cleanup.steps, ...(cleanup.reason ? {reason: sanitizeVendorText(cleanup.reason)} : {}), leftovers: leftovers.length, hostsStillRunning: hostPids.every(pid => after.some(p => p.pid === pid))};
    o.stderrBytes = existsSync(stderrPath) ? statSync(stderrPath).size : null;
    const names = entryNames(codexHome);
    o.ownedCodexHome = {entriesAfterRun: names, authFilePresent: Boolean(names?.includes('auth.json'))};
    o.enrichmentTempLeftovers = findCodexTempLeftovers(scratch);
    rmSync(scratch, {recursive: true, force: true});
    o.scratchRemoved = !existsSync(scratch);
  }
  return finish();
}

function pgrepF(pattern) {
  try { return execFileSync('/usr/bin/pgrep', ['-f', pattern], {encoding: 'utf8', timeout: 3000}).split('\n').filter(Boolean).map(Number); } catch { return []; }
}

// Everything the report may carry: whitelisted shapes, counts, sanitized vendor text.
function publicObservations(o) {
  const {prerequisites, handshake, launchError, listBrowsers, listTabs, elicitations, cellsSent, teardown, network, stderrBytes, ownedCodexHome, enrichmentTempLeftovers, scratchRemoved, envKeys} = o;
  const enrichment = listBrowsers?.browsers?.map(b => ({
    attempted: b.profileNamePresent ? 'yes (profileName present)' : 'unknown (needs metadata.extensionId in raw getInfo; not visible to cells)',
    profileNamePresent: b.profileNamePresent,
  }));
  return {prerequisites, envKeys, handshake, launchError, listBrowsers, enrichment, listTabs, elicitations, cellsSent, network, stderrBytes, ownedCodexHome, enrichmentTempLeftovers, teardown, scratchRemoved};
}
