// H1 (docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md): the pinned vendor browser service against
// cua's real host (src/chrome/host.mjs), spawned as Chrome spawns it (stdin/stdout are the native-messaging port,
// CUA_HOME in its environment), with the fake cua extension (test/helpers/fake-cua-extension.mjs) on that port.
//
//   vendor service (relocated runtime, browser surface, network default, no login)
//     ──BROWSER_USE_BACKEND_PATHS=$CUA_HOME/chrome/b/<name>.sock──▶ host.mjs ──stdio──▶ fake cua extension
//
// Judged per run of `node scripts/probe-chrome-contract.mjs --vendor --backend host`:
//   getInfo kept as chrome: listBrowsers lists the host once, as an extension backend with the fake's instance id
//     (kept under production's BROWSER_USE_AVAILABLE_BACKENDS=chrome);
//   createBrowserTab = createTab + attach reaching the host (the extension is asked for tabs.create in the session's
//     group, inactive, then debugger.attach of that tab);
//   a Runtime.evaluate the service issues is relayed to the extension and its answer reaches the agent's cell;
//   turnEnded closes the created tab (tabs.remove) and the host's status file then lists no tab;
//   the header policy is skipped: no cell failed on caller identity, no auth.json in the run's CODEX_HOME.
// No Chrome, no real extension, no account: tabs, debuggees and CDP answers are the fake's.
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../../src/runtime/manifest.mjs';
import {backendDir, logDir, socketNameFor} from '../../../src/chrome/extension.mjs';
import {createFakeCuaExtension} from '../../../test/helpers/fake-cua-extension.mjs';
import {AMBIENT_ALLOWLIST, vendorEnv, cell, launchVendor} from './vendor-layer.mjs';

const HOST = fileURLToPath(new URL('../../../src/chrome/host.mjs', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IDENTITY = /request-header|caller identity|auth token|User unavailable|agent request headers|app-server auth/i;
const EVAL_MARKER = 'h1-roundtrip';

const check = (name, pass, detail) => ({name, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});
const scenario = (id, title, checks, sources) => ({id, title, status: checks.length && checks.every(c => c.pass) ? 'PASS' : 'FAIL', sources, checks});

// The fake's CDP for a blank page: enough for the service to finish createBrowserTab and read a value back.
// Runtime.enable announces one default execution context; Page.navigate answers a fresh loader id and then emits the
// load events a blank page fires (frameStartedLoading, frameNavigated, domContentEventFired, loadEventFired), which the
// service waits for (browser-service.mjs 48990-49110). Runtime.evaluate answers `h1-roundtrip:<expression>` and
// Runtime.callFunctionOn `h1-roundtrip:<function>`, so the agent's cell can tell a relayed answer from anything the
// service invents.
// The service's own page reads (browser-service.mjs): the location probe, the Playwright helper injection and the aria
// snapshot of document.body; the snapshot carries the marker, so the agent sees text that only the fake produced.
function evaluate({expression = '', returnByValue}) {
  if (expression.includes('window.location.href') && returnByValue) return {result: {type: 'object', value: {href: 'about:blank', readyState: 'complete'}}};
  if (expression.includes('incrementalAriaSnapshot')) return {result: {type: 'object', value: {full: `- document "${EVAL_MARKER}"`, iframeDepths: {}, iframeRefs: []}}};
  if (expression.includes('__codexPlaywrightInjected')) return {result: {type: 'undefined'}};
  return {result: {type: 'string', value: `${EVAL_MARKER}:${expression}`}};
}
const BLANK_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

export function blankPageCdp(ext) {
  let loader = 0;
  const frame = () => ({id: 'H1-FRAME', loaderId: `H1-LOADER-${loader}`, url: 'about:blank', domainAndRegistry: '', securityOrigin: '://', mimeType: 'text/html',
    secureContextType: 'InsecureScheme', crossOriginIsolatedContextType: 'NotIsolated', gatedAPIFeatures: []});
  const later = (debuggee, events) => setTimeout(() => { for (const [method, params] of events) ext.cdpEvent(debuggee, method, params); }, 10);
  return ({debuggee, method, params}) => {
    switch (method) {
      case 'Page.startScreencast':
        later(debuggee, [['Page.screencastFrame', {data: BLANK_JPEG, sessionId: 1, metadata: {offsetTop: 0, pageScaleFactor: 1, deviceWidth: 800, deviceHeight: 600, scrollOffsetX: 0, scrollOffsetY: 0, timestamp: 1}}]]);
        return {};
      case 'Page.getLayoutMetrics': {
        const viewport = {pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600};
        return {layoutViewport: viewport, visualViewport: {offsetX: 0, offsetY: 0, ...viewport, scale: 1, zoom: 1}, contentSize: {x: 0, y: 0, width: 800, height: 600},
          cssLayoutViewport: viewport, cssVisualViewport: {offsetX: 0, offsetY: 0, ...viewport, scale: 1, zoom: 1}, cssContentSize: {x: 0, y: 0, width: 800, height: 600}};
      }
      case 'Runtime.enable':
        later(debuggee, [['Runtime.executionContextCreated', {context: {id: 1, origin: '://', name: '', uniqueId: 'H1-CONTEXT', auxData: {isDefault: true, type: 'default', frameId: 'H1-FRAME'}}}]]);
        return {};
      case 'Runtime.evaluate': return evaluate(params ?? {});
      case 'Runtime.callFunctionOn': return {result: {type: 'string', value: `${EVAL_MARKER}:${params?.functionDeclaration ?? ''}`}};
      case 'Page.getFrameTree': return {frameTree: {frame: frame()}};
      case 'Page.navigate':
        loader++;
        later(debuggee, [['Page.frameStartedLoading', {frameId: 'H1-FRAME'}], ['Page.frameNavigated', {frame: frame(), type: 'Navigation'}],
          ['Page.domContentEventFired', {timestamp: 1}], ['Page.loadEventFired', {timestamp: 1}], ['Page.frameStoppedLoading', {frameId: 'H1-FRAME'}]]);
        return {frameId: 'H1-FRAME', loaderId: `H1-LOADER-${loader}`};
      case 'Page.getNavigationHistory': return {currentIndex: 0, entries: [{id: 1, url: 'about:blank', userTypedURL: 'about:blank', title: '', transitionType: 'typed'}]};
      case 'Target.getTargetInfo': return {targetInfo: {targetId: 'H1-TARGET', type: 'page', title: '', url: 'about:blank', attached: true, canAccessOpener: false}};
      default: return {};
    }
  };
}

const CELLS = [
  {name: 'listBrowsers', code: cell(`const list = await cua.listBrowsers({emit: false}); __m7.id = list[0]?.id;
__out.browsers = list.map(b => ({type: b.type, name: b.name, metadata: {extensionInstanceId: b.metadata?.extensionInstanceId}}));`)},
  {name: 'listTabsBefore', code: cell(`const tabs = await cua.listTabs({browser: __m7.id, emit: false}); __out.tabs = tabs.length;`)},
  {name: 'createBrowserTab', code: cell(`const tab = await cua.createBrowserTab(__m7.id); __m7.tab = tab; __out.created = tab.id; __out.keys = Object.keys(tab).sort();`)},
  {name: 'evaluate', code: cell(`const v = await __m7.tab.playwright.evaluate(${JSON.stringify(`"${EVAL_MARKER}-cell"`)}); __out.value = String(v).slice(0, 40);`)},
  {name: 'listTabsAfter', code: cell(`const tabs = await cua.listTabs({browser: __m7.id, emit: false}); __out.tabs = tabs.length;`)},
];

const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

async function waitFor(predicate, ms) {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() > deadline) return false; await sleep(20); }
  return true;
}

export function judgeHost(run) {
  const calls = run.extensionCalls ?? [];
  const created = run.cells?.createBrowserTab?.result?.created;
  const createdId = Number(created);
  const createCall = calls.find(c => c.method === 'tabs.create');
  const createIndex = calls.indexOf(createCall);
  const attachIndex = calls.findIndex(c => c.method === 'debugger.attach' && c.params?.tabId === createdId);
  const evaluations = calls.filter(c => c.method === 'debugger.sendCommand' && c.params?.method === 'Runtime.evaluate');
  const listed = run.cells?.listBrowsers?.result?.browsers ?? [];
  const identityErrors = Object.entries(run.cells ?? {}).map(([n, c]) => [n, c.result?.error ?? c.probeError ?? null]).filter(([, e]) => e && IDENTITY.test(e));
  const removed = calls.some(c => c.method === 'tabs.remove' && c.params?.tabId === createdId);
  return [
    scenario('h1-launch', 'vendor launch against the host: browser surface, fresh CODEX_HOME, no login, network default, no bypass switch', [
      check('the host listened at $CUA_HOME/chrome/b/<name>.sock after hello', run.hostListening, run.socketPath),
      check('no token, security-mode or ambient-network override reached the vendor child', !run.envKeys?.some(k => ['PLAYWRIGHT_MCP_EXTENSION_TOKEN', 'BROWSER_USE_SECURITY_MODE', 'BROWSER_USE_DISABLE_AMBIENT_NETWORK'].includes(k)), run.envKeys),
      check('BROWSER_USE_AVAILABLE_BACKENDS=chrome as production sets it', run.envKeys?.includes('BROWSER_USE_AVAILABLE_BACKENDS')),
      check('the host process got CUA_HOME and nothing else', JSON.stringify(run.hostEnvKeys) === '["CUA_HOME"]', run.hostEnvKeys),
      check('no auth.json in the run\'s CODEX_HOME before or after (existence only)', run.authJsonPresent === false && run.authJsonPresentAfter === false),
    ], ['src/chrome/host.mjs runHost', 'scripts/probe/chrome/vendor-layer.mjs vendorEnv']),
    scenario('h1-getinfo-kept-as-chrome', 'getInfo from the host keeps it as a chrome extension backend', [
      check('listBrowsers lists exactly the host', listed.length === 1, listed),
      check('as type extension, family chrome, named cua, with the fake extension\'s instance id', listed[0]?.type === 'extension' && listed[0]?.metadata?.extensionInstanceId === run.instanceId, listed[0]),
    ], ['browser-service.mjs:67599-67640', 'browser-service.mjs:68272-68276']),
    scenario('h1-create-and-attach', 'createBrowserTab reaches the host as createTab then attach', [
      check('createBrowserTab returned a tab', Number.isInteger(createdId), run.cells?.createBrowserTab?.result ?? run.cells?.createBrowserTab),
      check('the host asked the extension for an inactive about:blank tab in the session\'s group', createCall?.params?.url === 'about:blank' && createCall?.params?.group?.key === run.sessionId && createCall?.params?.group?.title === 'cua', createCall?.params),
      check('then attached the debugger to that tab', createIndex >= 0 && attachIndex > createIndex, {createIndex, attachIndex}),
    ], ['browser-service.mjs:68000-68008', 'src/chrome/host.mjs createTab/attach']),
    scenario('h1-cdp-roundtrip', 'a Runtime.evaluate the service issues is answered by the extension and the answer reaches the cell', [
      check('Runtime.evaluate reached the extension through the host', evaluations.length > 0, evaluations.length),
      check('the cell received the extension\'s answer', typeof run.cells?.evaluate?.result?.value === 'string' && run.cells.evaluate.result.value.startsWith(EVAL_MARKER), run.cells?.evaluate?.result ?? run.cells?.evaluate),
    ], ['src/chrome/host.mjs executeCdp']),
    scenario('h1-turn-end', 'turnEnded closes the created tab and the status file lists no tab', [
      check('turn_ended completed', run.turnEnded && !run.turnEnded.isError && !run.turnEnded.probeError, run.turnEnded),
      check('the host closed the created tab', removed && run.fakeTabsAfter?.includes(createdId) === false),
      check('<name>.json after the turn: the session lists no tab', Array.isArray(run.statusAfterTurn?.sessions) && run.statusAfterTurn.sessions.every(s => s.tabs.length === 0), run.statusAfterTurn?.sessions),
    ], ['src/chrome/host.mjs turnEnded', 'browser-service.mjs:68041-68054']),
    scenario('h1-header-policy-skipped', 'no identity check stood between the service and the host', [
      check('no cell failed on caller identity or request headers', identityErrors.length === 0, identityErrors),
      check('session requests reached the host (getTabs as tabs.query, createTab, attach)', ['tabs.query', 'tabs.create', 'debugger.attach'].every(m => calls.some(c => c.method === m))),
    ], ['browser-service.mjs:68061-68092']),
    scenario('h1-host-exit', 'the host exits when the native port closes and removes its socket and status file', [
      check('exit code 0', run.hostExit?.code === 0, run.hostExit),
      check('socket and status file removed', run.socketRemoved && run.statusRemoved),
    ], ['src/chrome/host.mjs runHost']),
  ];
}

export async function runHostLayer({home, sentinels}) {
  const blockedAll = reason => ({layer: 'vendor-host', scenarios: [{id: 'h1-prerequisites', title: 'pinned runtime installed in an explicit scratch CUA_HOME', status: 'BLOCKED', checks: [{name: 'prerequisite', pass: false, detail: reason}]}]});
  if (!home) return blockedAll('CUA_HOME (or --home) must name a scratch home holding the pinned runtime');
  let runtime;
  try { runtime = resolveRuntime({home: realpathSync(home)}); } catch (e) { return blockedAll(`runtime unavailable: ${e.code ?? ''} ${e.message}`.trim()); }
  const realHome = realpathSync(home);
  const codexHome = join(realHome, 'state', 'h1-codex');
  const cwd = join(realHome, 'run', 'h1-cwd');
  for (const dir of [codexHome, cwd]) { rmSync(dir, {recursive: true, force: true}); mkdirSync(dir, {recursive: true, mode: 0o700}); }
  // Inherited overrides stand in for a careless shell: none may reach the vendor child.
  const ambient = {...Object.fromEntries(AMBIENT_ALLOWLIST.filter(k => typeof process.env[k] === 'string').map(k => [k, process.env[k]])),
    PLAYWRIGHT_MCP_EXTENSION_TOKEN: sentinels.token, BROWSER_USE_SECURITY_MODE: 'disabled-for-local-testing', BROWSER_USE_DISABLE_AMBIENT_NETWORK: '1'};

  let page = () => ({});
  const ext = createFakeCuaExtension({version: '0.0.0-h1', cdp: x => page(x), tabs: [{url: 'https://user.fixture.invalid/', title: 'H1 user tab'}]});
  page = blankPageCdp(ext);
  const name = socketNameFor(ext.instanceId);
  const socketPath = join(backendDir(realHome), `${name}.sock`);
  const statusPath = join(backendDir(realHome), `${name}.json`);
  const hostEnv = {CUA_HOME: realHome};
  const hostChild = spawn(process.execPath, [HOST], {env: hostEnv, stdio: ['pipe', 'pipe', 'pipe']});
  let hostStderr = '';
  hostChild.stderr.on('data', d => { hostStderr += d; });
  let hostExit = null;
  const hostExited = new Promise(resolve => hostChild.on('exit', (code, signal) => { hostExit = {code, signal}; resolve(hostExit); }));
  const port = ext.connect({toHost: hostChild.stdin, fromHost: hostChild.stdout});

  const env = vendorEnv({ambient, paths: runtime.paths, codexHome, backendPath: socketPath, network: 'default', availableBackends: 'chrome'});
  const run = {instanceId: ext.instanceId, socketPath: socketPath.split(realHome).join('$CUA_HOME'), envKeys: Object.keys(env).sort(), hostEnvKeys: Object.keys(hostEnv),
    authJsonPresent: existsSync(join(codexHome, 'auth.json')), cells: {}, elicitations: []};
  run.hostListening = await waitFor(() => existsSync(socketPath), 5000);
  const vendor = launchVendor({runtime, env, cwd, label: 'h1', elicitations: run.elicitations});
  run.sessionId = vendor.sessionId;
  try {
    await vendor.handshake();
    for (const {name: cellName, code} of CELLS) {
      try { run.cells[cellName] = await vendor.callCell(code); } catch (e) { run.cells[cellName] = {probeError: e.message}; }
    }
    try { run.turnEnded = await vendor.endTurn(); } catch (e) { run.turnEnded = {probeError: e.message}; }
    await sleep(300);
    run.statusAfterTurn = readJson(statusPath);
    run.fakeTabsAfter = [...ext.state.tabs.keys()];
  } catch (e) {
    run.error = e.message;
  } finally {
    Object.assign(run, {vendorStop: await vendor.stop()});
    run.authJsonPresentAfter = existsSync(join(codexHome, 'auth.json'));
    port.disconnect();
    if (!(await Promise.race([hostExited, sleep(5000).then(() => null)]))) { hostChild.kill('SIGTERM'); await hostExited; run.hostKilled = true; }
    run.hostExit = hostExit;
    run.socketRemoved = !existsSync(socketPath);
    run.statusRemoved = !existsSync(statusPath);
    let logText = '';
    try { logText = readFileSync(join(logDir(realHome), `${name}.log`), 'utf8'); } catch (e) { run.hostLogError = e.code; }
    run.hostLog = logText.split('\n').filter(Boolean).map(l => l.split(realHome).join('$CUA_HOME'));
    run.hostStderrBytes = Buffer.byteLength(hostStderr);
    run.extensionCalls = ext.calls.map(c => ({method: c.method, params: c.method === 'debugger.sendCommand' ? {debuggee: c.params.debuggee, method: c.params.method, ...(c.params.sessionId ? {sessionId: c.params.sessionId} : {})} : c.params}));
  }
  const scenarios = judgeHost(run);
  return {layer: 'vendor-host', release: runtime.release ?? null, runs: {host: run}, scenarios,
    scanTexts: [vendor.stderr(), vendor.transcript.join('\n'), hostStderr, run.hostLog.join('\n')], scanRoots: [codexHome, cwd],
    async cleanup() { for (const root of [codexHome, cwd]) rmSync(root, {recursive: true, force: true}); }};
}
