// S0 spike (docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md): the pinned vendor browser service
// against a backend whose getInfo has the shape cua's own host will send — type "extension", no
// agentRequestHeaderEnabled, no metadata.extensionId — with no Codex login (fresh CODEX_HOME per run) and the vendor's
// network either at its default (`--network default`, production) or switched off (`--network off`, M7's harness).
//
// Questions, judged per run of `node scripts/probe-chrome-contract.mjs --vendor --network <default|off>`:
//   (a)/(b) do session requests (getTabs, createTab, attach) REACH the backend without an identity error, and how long
//           after launch does the first one arrive? (a) under the default network, (b) with the switch off.
//   control the same backend with agentRequestHeaderEnabled:false: the header policy refuses before the backend, so
//           the check is live in this configuration and (a)'s outcome is the omission's doing.
//   (c)     BROWSER_USE_BACKEND_PATHS naming a live socket, an absent path and a stale socket file: listBrowsers returns
//           the live one within ~1 s, and finds listeners that appear at the dead paths on the next call. Observed too:
//           what a listener that accepts but never answers getInfo costs a listBrowsers call.
// Source (pinned 26.928.40906, browser-service.mjs): header policy 68061-68092 and wv() 17686-17692; identity
// initialization jm/DB 17655-17668, 17708-17735 (skipped when BROWSER_USE_DISABLE_AMBIENT_NETWORK=1, cn() 11331);
// backend paths Cte 67723-67742; refresh cL 67495-67560; getInfo bounded by $_ at 5000 ms 67475, 67627-67640;
// profile enrichment only with metadata.extensionId aL 67416-67418.
//
// The backend is a recording stub, not a browser: it answers getInfo/getTabs/createTab/attach/detach/turnEnded,
// refuses every CDP command, and answers everything else with the vendor's exact "No handler" string. A session
// request "reaches the backend" when its frame arrives at the stub; what the vendor does after the CDP refusal is not
// judged. No Chrome, no extension, no account.
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, realpathSync, rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {resolveRuntime} from '../../../src/runtime/manifest.mjs';
import {startBackend} from './backend-server.mjs';
import {NO_HANDLER} from './adapter.mjs';
import {AMBIENT_ALLOWLIST, vendorEnv, cell, launchVendor} from './vendor-layer.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SESSION_EXEMPT = new Set(['getInfo', 'turnEnded', 'ping']);
// What an identity or header-policy refusal says: wv()'s null-identity error, DB's "User unavailable", node_repl's
// authenticated-fetch failures (m9-original-chrome.md 55-73) and the header-capability refusal (BS:68078-68082).
const IDENTITY = /request-header|caller identity|auth token|User unavailable|agent request headers|app-server auth/i;
const DISCOVERY_BOUND_MS = 1500;   // "~1 s": NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000 plus slack
const MUTE_BOUND_MS = 6000;        // the vendor's 5000 ms getInfo bound plus slack

// The getInfo cua's host will answer (spec, "getInfo"), or the control's variant carrying the header field.
export function cuaInfo({instanceId, agentRequestHeaderEnabled}) {
  const info = {type: 'extension', family: 'chrome', name: 'cua', version: '0.0.0-s0', capabilities: {browser: [], tab: []}, metadata: {extensionInstanceId: instanceId}};
  if (agentRequestHeaderEnabled !== undefined) info.agentRequestHeaderEnabled = agentRequestHeaderEnabled;
  return info;
}

const backendError = (code, message) => Object.assign(new Error(message), {code});

// A recording stub in front of backend-server.mjs: `log` keeps each request's method and arrival time (`now()`).
export function createStubBackend({info, now = () => performance.now()}) {
  const log = [];
  const tabs = new Map([[101, {id: 101, title: 'S0 existing tab', url: 'https://s0.fixture.invalid/'}]]);
  let nextTab = 201;
  const handlers = {
    getInfo: () => info,
    getTabs: () => [...tabs.values()],
    createTab: () => { const tab = {id: nextTab++, title: 'S0 created tab', url: 'about:blank'}; tabs.set(tab.id, tab); return tab; },
    attach: () => ({}),
    detach: () => ({}),
    turnEnded: () => ({}),
    executeCdp: () => { throw backendError(1, 's0 stub serves no CDP'); },
  };
  return {
    log,
    async handleRequest(method, params) {
      log.push({method, at: now()});
      const handler = handlers[method];
      if (!handler) throw backendError(-1, NO_HANDLER(method));
      return handler(params);
    },
  };
}

// --- judging -------------------------------------------------------------------------------------------------------

const check = (name, pass, detail) => ({name, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});
const scenario = (id, title, checks, sources) => ({id, title, status: checks.length && checks.every(c => c.pass) ? 'PASS' : 'FAIL', sources, checks});
const sessionRequests = run => (run?.backendLog ?? []).filter(l => !SESSION_EXEMPT.has(l.method));
const cellErrors = run => Object.entries(run?.cells ?? {}).map(([name, c]) => [name, c.result?.error ?? c.probeError ?? null]).filter(([, e]) => e);
const listedIds = result => (result?.browsers ?? []).map(b => b.metadata?.extensionInstanceId).filter(Boolean).sort();
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// When the first session request arrived, after launch and after the call that caused it.
function firstArrival(run) {
  const first = sessionRequests(run)[0];
  if (!first) return null;
  const started = Object.entries(run.cells ?? {}).map(([name, c]) => ({name, at: c.startedAt})).filter(c => Number.isFinite(c.at) && c.at <= first.at).sort((x, y) => y.at - x.at)[0];
  return {method: first.method, spawnToFirstSessionRequestMs: first.at, ...(started ? {cell: started.name, callToFirstSessionRequestMs: first.at - started.at} : {}), spawnToHandshakeMs: run.timing?.spawnToHandshakeMs ?? null};
}

export function judgeNoHeader({network, runs}) {
  const noHeader = runs['no-header'], control = runs['header-control'], discovery = runs.discovery;
  const question = network === 'default' ? 'a' : 'b';
  const scenarios = [];

  const methods = sessionRequests(noHeader).map(l => l.method);
  const listed = noHeader?.cells?.listBrowsers?.result?.browsers ?? [];
  const identityErrors = cellErrors(noHeader).filter(([, e]) => IDENTITY.test(e));
  scenarios.push(scenario(`s0-${question}-no-header-${network === 'default' ? 'default-network' : 'network-off'}`,
    `(${question}) getInfo without agentRequestHeaderEnabled, no Codex login, network ${network}: session requests reach the backend`, [
      check('listBrowsers lists the backend as an extension backend (kept under BROWSER_USE_AVAILABLE_BACKENDS=chrome)', listed.length === 1 && listed[0].type === 'extension', listed),
      ...['getTabs', 'createTab', 'attach'].map(m => check(`${m} reached the backend`, methods.includes(m))),
      check('no cell failed on caller identity or request headers', identityErrors.length === 0, identityErrors),
      check('turnEnded reached the backend', (noHeader?.backendLog ?? []).some(l => l.method === 'turnEnded')),
      check('first session request arrival measured', firstArrival(noHeader) !== null, firstArrival(noHeader) ?? noHeader?.error),
    ], ['browser-service.mjs:68061-68092', 'browser-service.mjs:17686-17692']));

  const leaked = sessionRequests(control).map(l => l.method);
  const refusal = control?.cells?.listTabs?.result?.error ?? control?.cells?.listTabs?.probeError ?? null;
  scenarios.push(scenario('s0-control-header-field-present',
    `control: the same backend with agentRequestHeaderEnabled:false, network ${network}: the header policy refuses before the backend`, [
      check('no session request reached the backend', leaked.length === 0, leaked),
      check('listTabs failed with an identity error', typeof refusal === 'string' && IDENTITY.test(refusal), refusal),
    ], ['browser-service.mjs:68066-68092', 'browser-service.mjs:17655-17668', 'docs/evidence/m9-original-chrome.md:55-73']));

  const ids = discovery?.instanceIds ?? {};
  const before = discovery?.cells?.listBeforeListeners?.result;
  const after = discovery?.cells?.listAfterListeners?.result;
  const mute = discovery?.cells?.listWithMuteListener?.result;
  const answering = [ids.live, ids.absent, ids.stale];
  scenarios.push(scenario('s0-c-backend-paths-live-and-dead',
    '(c) BROWSER_USE_BACKEND_PATHS with one live socket, an absent path and a stale socket file', [
      check('the first listBrowsers lists exactly the live backend', sameSet(listedIds(before), [ids.live]), {listed: listedIds(before).length, error: before?.error}),
      check(`the first listBrowsers returns within ${DISCOVERY_BOUND_MS} ms`, Number.isFinite(before?.elapsedMs) && before.elapsedMs <= DISCOVERY_BOUND_MS, before?.elapsedMs),
      check('after listeners appear at both dead paths, the next listBrowsers lists all three', sameSet(listedIds(after), answering), {listed: listedIds(after).length, elapsedMs: after?.elapsedMs, error: after?.error}),
    ], ['browser-service.mjs:67723-67742', 'browser-service.mjs:67495-67560', 'src/runtime/launch.mjs (NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000)']));
  scenarios.push(scenario('s0-c-mute-listener-cost',
    'observation: a listed path whose listener accepts but never answers getInfo', [
      check(`listBrowsers still returns within ${MUTE_BOUND_MS} ms (vendor getInfo bound 5000 ms)`, Number.isFinite(mute?.elapsedMs) && mute.elapsedMs <= MUTE_BOUND_MS, mute?.elapsedMs),
      check('and still lists the three answering backends', sameSet(listedIds(mute), answering), {listed: listedIds(mute).length, error: mute?.error}),
    ], ['browser-service.mjs:67475', 'browser-service.mjs:67627-67640']));
  return scenarios;
}

// --- running -------------------------------------------------------------------------------------------------------

const SESSION_CELLS = [
  {name: 'listBrowsers', code: cell(`const list = await cua.listBrowsers({emit: false}); __out.browsers = list; __m7.id = list[0]?.id;`)},
  {name: 'getBrowser', code: cell(`const b = await cua.getBrowser({id: __m7.id}); const doc = await b.documentation(); __out.docChars = doc.length;
__out.members = [...new Set(doc.match(/\\b(?:browser|tab|cua)\\.[A-Za-z_.]+(?=\\()/g) ?? [])].sort();`)},
  {name: 'listTabs', code: cell(`const tabs = await cua.listTabs({browser: __m7.id, emit: false}); __out.tabs = tabs.length;`)},
  {name: 'createBrowserTab', code: cell(`const tab = await cua.createBrowserTab(__m7.id); __out.created = tab.id;`)},
];
const timedList = cell(`const t = Date.now(); const list = await cua.listBrowsers({emit: false}); __out.elapsedMs = Date.now() - t;
__out.browsers = list.map(b => ({type: b.type, metadata: {extensionInstanceId: b.metadata?.extensionInstanceId}}));`);

// A socket file with no listener behind it: a listener in a child process that is then SIGKILLed (as a crashed host).
async function staleSocket(path) {
  rmSync(path, {force: true});
  const child = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(path)}, () => process.stdout.write('ok'))`], {stdio: ['ignore', 'pipe', 'ignore']});
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('exit', () => reject(new Error('stale-socket helper exited early'))); });
  const gone = new Promise(r => child.once('exit', r));
  child.kill('SIGKILL');
  await gone;
  if (!existsSync(path)) throw new Error('stale socket file was not left behind');
}

function muteListener(path) {
  const sockets = new Set();
  const server = createServer(s => { sockets.add(s); s.on('error', () => {}); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => resolve({async close() { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); rmSync(path, {force: true}); }}));
  });
}

function groupSnapshot(pgid) {
  const ps = spawnSync('pgrep', ['-g', String(pgid), '-l']);
  const names = String(ps.stdout).trim().split('\n').filter(Boolean).map(l => l.split(' ').slice(1).join(' ').split('/').pop());
  const lsof = spawnSync('lsof', ['-nP', '-a', '-g', String(pgid), '-iTCP', '-sTCP:ESTABLISHED', '-Fn']);
  const remotes = new Set(String(lsof.stdout).split('\n').filter(l => l.startsWith('n') && l.includes('->')).map(l => l.split('->')[1]));
  return {processNames: [...new Set(names)].sort(), establishedTcpRemotes: remotes.size};
}

async function runConfig({runtime, home, label, network, ambient, backends, cells}) {
  const codexHome = join(home, 'state', `s0-codex-${label}`);
  const cwd = join(home, 'run', `s0-cwd-${label}`);
  for (const dir of [codexHome, cwd]) { rmSync(dir, {recursive: true, force: true}); mkdirSync(dir, {recursive: true, mode: 0o700}); }
  let t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const started = [];
  const stubs = {};
  for (const b of backends.filter(b => b.listen)) {
    stubs[b.key] = createStubBackend({info: b.info, now});
    started.push(await startBackend({socketPath: b.path, adapter: stubs[b.key], label: `${label}-${b.key}`}));
  }
  const env = vendorEnv({ambient, paths: runtime.paths, codexHome, backendPath: backends.map(b => b.path).join(':'), network, availableBackends: 'chrome'});
  const out = {label, network, envKeys: Object.keys(env).sort(), authJsonPresent: existsSync(join(codexHome, 'auth.json')), authJsonPresentAfter: null, cells: {}, elicitations: [], timing: {}};
  t0 = performance.now();
  const vendor = launchVendor({runtime, env, cwd, label: 's0', elicitations: out.elicitations});
  const extra = [];
  try {
    await vendor.handshake();
    out.timing.spawnToHandshakeMs = now();
    for (const {name, code, before} of cells) {
      if (before) extra.push(...(await before()));
      const startedAt = now();
      try { out.cells[name] = {startedAt, ...(await vendor.callCell(code))}; } catch (e) { out.cells[name] = {startedAt, probeError: e.message}; }
      out.cells[name].endedAt = now();
    }
    try { out.turnEnded = await vendor.endTurn(); } catch (e) { out.turnEnded = {probeError: e.message}; }
    await sleep(300);
    out.group = groupSnapshot(vendor.child.pid);
  } catch (e) {
    out.error = e.message;
  } finally {
    Object.assign(out, await vendor.stop());
    const stderr = vendor.stderr();
    out.stderrBytes = Buffer.byteLength(stderr);
    out.stderrIdentityMarkers = (stderr.match(new RegExp(IDENTITY.source, 'gi')) ?? []).map(s => s.toLowerCase()).filter((s, i, a) => a.indexOf(s) === i);
    out.authJsonPresentAfter = existsSync(join(codexHome, 'auth.json'));
    out.backendLogs = Object.fromEntries(Object.entries(stubs).map(([k, s]) => [k, s.log]));
    out.backendLog = stubs.live?.log ?? [];
    for (const s of [...started, ...extra]) await s.close();
  }
  return {out, scanTexts: [vendor.stderr(), vendor.transcript.join('\n')], scanRoots: [codexHome, cwd]};
}

export async function runNoHeaderLayer({home, network, sentinels}) {
  const blockedAll = reason => ({layer: 'vendor-s0', network, scenarios: [{id: 's0-prerequisites', title: 'pinned runtime installed in an explicit scratch CUA_HOME', status: 'BLOCKED', checks: [{name: 'prerequisite', pass: false, detail: reason}]}]});
  if (!home) return blockedAll('CUA_HOME (or --home) must name a scratch home holding the pinned runtime');
  let runtime;
  try { runtime = resolveRuntime({home: realpathSync(home)}); } catch (e) { return blockedAll(`runtime unavailable: ${e.code ?? ''} ${e.message}`.trim()); }
  const realHome = realpathSync(home);
  const runDir = join(realHome, 'run');
  mkdirSync(runDir, {recursive: true, mode: 0o700});
  // Inherited overrides stand in for a careless shell: none may reach the child (the network one only through `network`).
  const ambient = {...Object.fromEntries(AMBIENT_ALLOWLIST.filter(k => typeof process.env[k] === 'string').map(k => [k, process.env[k]])),
    PLAYWRIGHT_MCP_EXTENSION_TOKEN: sentinels.token, BROWSER_USE_SECURITY_MODE: 'disabled-for-local-testing', BROWSER_USE_DISABLE_AMBIENT_NETWORK: '1'};
  const sock = name => join(runDir, `s0-${name}.sock`);
  const ids = {live: randomUUID(), absent: randomUUID(), stale: randomUUID()};

  const configs = [
    {label: 'no-header', backends: [{key: 'live', path: sock('nh'), listen: true, info: cuaInfo({instanceId: randomUUID()})}], cells: SESSION_CELLS},
    {label: 'header-control', backends: [{key: 'live', path: sock('hc'), listen: true, info: cuaInfo({instanceId: randomUUID(), agentRequestHeaderEnabled: false})}], cells: SESSION_CELLS},
  ];
  const deadPaths = {absent: sock('absent'), stale: sock('stale'), mute: sock('mute')};
  // Every socket path this run may create, removed however the run ends (a throwing runConfig included).
  const socketPaths = [...Object.values(deadPaths), sock('nh'), sock('hc'), sock('live')];
  const removeSockets = () => { for (const p of socketPaths) rmSync(p, {force: true}); };
  removeSockets();
  const late = key => async () => { rmSync(deadPaths[key], {force: true}); const stub = createStubBackend({info: cuaInfo({instanceId: ids[key]})}); return [await startBackend({socketPath: deadPaths[key], adapter: stub, label: `discovery-${key}`})]; };
  configs.push({label: 'discovery', instanceIds: ids,
    // Dead paths first, so a slow dead path would delay the live one's listing.
    backends: [{key: 'absent', path: deadPaths.absent}, {key: 'stale', path: deadPaths.stale}, {key: 'mute', path: deadPaths.mute}, {key: 'live', path: sock('live'), listen: true, info: cuaInfo({instanceId: ids.live})}],
    cells: [
      {name: 'listBeforeListeners', code: timedList},
      {name: 'listAfterListeners', code: timedList, before: async () => [...(await late('absent')()), ...(await late('stale')())]},
      {name: 'listWithMuteListener', code: timedList, before: async () => [await muteListener(deadPaths.mute)]},
    ]});

  const runs = {};
  const scanTexts = [], scanRoots = [];
  try {
    await staleSocket(deadPaths.stale);
    for (const config of configs) {
      const r = await runConfig({runtime, home: realHome, label: config.label, network, ambient, backends: config.backends, cells: config.cells});
      runs[config.label] = {...r.out, ...(config.instanceIds ? {instanceIds: config.instanceIds} : {}), firstArrival: firstArrival(r.out)};
      scanTexts.push(...r.scanTexts);
      scanRoots.push(...r.scanRoots);
    }
  } finally {
    removeSockets();
  }

  const launchChecks = Object.values(runs).flatMap(r => [
    check(`${r.label}: no token or security-mode override reached the child`, !r.envKeys.some(k => k === 'PLAYWRIGHT_MCP_EXTENSION_TOKEN' || k === 'BROWSER_USE_SECURITY_MODE')),
    check(`${r.label}: the ambient-network switch is present exactly when network is off`, r.envKeys.includes('BROWSER_USE_DISABLE_AMBIENT_NETWORK') === (network === 'off')),
    check(`${r.label}: BROWSER_USE_AVAILABLE_BACKENDS=chrome as production sets it`, r.envKeys.includes('BROWSER_USE_AVAILABLE_BACKENDS')),
    check(`${r.label}: no auth.json in the run's CODEX_HOME before or after (existence only)`, !r.authJsonPresent && !r.authJsonPresentAfter),
  ]);
  const scenarios = [scenario('s0-launch', `vendor launch: browser surface, fresh CODEX_HOME, no login, network ${network}`, launchChecks, ['scripts/probe/chrome/vendor-layer.mjs vendorEnv']), ...judgeNoHeader({network, runs})];
  return {layer: 'vendor-s0', network, release: runtime.release ?? null, runs, scenarios, scanTexts, scanRoots,
    async cleanup() { for (const root of scanRoots) rmSync(root, {recursive: true, force: true}); }};
}
