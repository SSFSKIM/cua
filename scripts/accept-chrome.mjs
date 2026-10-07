#!/usr/bin/env node
// Phase C acceptance runner (M11: C2's live round trip). Opt-in and live: it drives the user's existing Chrome through
// `cua serve` over MCP. Its secret lives in a store it owns: a temporary $HOME (scripts/accept/secret-seed.mjs) holding
// one generated key with a generated sentinel, stored through `cua secrets set` typed at a pseudo-terminal and removed
// with the temporary home in `finally`. The server resolves its store from that $HOME
// (scripts/accept/serve-with-store.mjs), so the account's own store (~/.config/claude-secrets) is never touched.
//
//   node scripts/accept-chrome.mjs --live [--route cua|vendor] --profile personal --report /tmp/cua-accept-chrome.json
//   node scripts/accept-chrome.mjs --live --route cua --chrome-restart --profile personal --report <file>
//
// Routes (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, H3b). `--route` defaults to the home's
// route (`vendor` for a home with no registration) and must match it. On the vendor route (the ChatGPT extension and
// OpenAI's host) the run is C2 as below and needs the server's Codex login. On the cua route (cua's own extension and
// host) there is no login gate (`codex.login` is not needed; the run records only whether a credential file exists),
// the live host is the profile's own socket in $CUA_HOME/chrome/b accepting a connection, and the run adds: a discovery
// cell (cua.listBrowsers lists cua's hosts only), a cross-site iframe cell after C2, goto latency per navigation, and the
// scenarios of scripts/accept/chrome-cua.mjs: the user-tab claim (with its exception to the user-tab rule below), turn
// end and handoff, and two `cua serve` clients. A declined elicitation stops the run's input as below: the scenarios not
// yet run are recorded BLOCKED. A home with a Codex credential file is refused on the cua route (the no-login control). `--chrome-restart` runs only acceptance 6, which needs the owner to
// quit and reopen Chrome while the runner waits (it prints an `OWNER STEP:` line; `--restart-wait-min`, default 15).
// `--only <names>` (comma-separated: c2, user-tab, turn-end, two-clients) narrows a cua-route run.
//
// Path under test: a fixed agent script (not a model) -> MCP -> `cua serve` (CUA_SHIM_SURFACES=browser) -> vendor
// cua-repl -> node_repl -> cell -> nodeRepl.rpc("browser") -> trusted worker -> src/services/browser.mjs -> the
// store file in the temporary $HOME -> substitution -> the vendor @oai/browser-desktop service -> the original OpenAI
// extension/host -> the profile's Chrome. The script selects the registered profile's backend by its stored instance
// id (cua.getBrowser({extensionInstanceId})), creates one tab, navigates it to the runner's own loopback page, fills
// its password field with `{{secret:<label>}}`, clicks; the page computes SHA-256 of what it received and shows only
// the first 16 hex digits, which the runner compares with the generated sentinel's digest. Then a substituted fill
// the vendor must fail (no such element) shows the value-free classification, one screenshot of the masked page is
// kept outside git, and the created tab is closed and confirmed gone.
//
// Boundaries (spec Decision Log, 2026-10-03 pre-flight): only the runner's own page in the one tab it creates; the
// backend is the registry's stored instance id, never a guess; the only accepted elicitation is the structured
// origin-access request for the page's exact origin, answered persist "session"; everything else is declined, recorded
// by kind, and stops further input. User tabs are never bound, read, screenshotted or closed (on the cua route the user-tab
// scenario makes the one exception scripts/accept/chrome-cua.mjs documents: the tab the runner itself opened on its own
// page, claimed, read and closed by the runner; the policy then also accepts the runner's cross-site frame origin).
// createBrowserTab gets a
// 60 s limit; a tab that cannot be closed while authorized is reported for the user, never reconnected to.
// Every observable channel is scanned for the sentinel (raw and base64 at every alignment): the MCP transport both
// ways, serve and runtime stderr, the screenshot bytes, every regular file under $CUA_HOME/state and run (read whole;
// the server's Codex credential file is excluded by name and never opened), and the report. Exit 0 PASS, 1 FAIL,
// 3 BLOCKED. The report holds metadata only; the screenshot path is printed, not reported.
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome, realHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {loginStatus, LOGIN_STATES} from '../src/runtime/login.mjs';
import {chromeFacts, countLiveHosts} from '../src/profiles/chrome.mjs';
import {profileStatuses} from '../src/profiles/registry.mjs';
import {chromeRoute, effectiveRoute, extensionIdFor} from '../src/chrome/route.mjs';
import {processTable} from '../src/profiles/checks.mjs';
import {createStoreHome, generatedKey, removeStoreHome, seedSecret} from './accept/secret-seed.mjs';
import {fingerprints, scanFiles, textLeaks} from './probe/leak-scan.mjs';
import {openSession} from './accept/mcp-session.mjs';
import {reportLeaks} from './probe/chrome/original/classify.mjs';
import {startAcceptancePage} from './accept/chrome-page.mjs';
import {cellRunner, createStopLatch, elicitationPolicy, newTabRecord, leftoverOf, profilePrecondition, runAgentScript} from './accept/chrome-run.mjs';
import {discoverBackends} from './accept/chrome-cells.mjs';
import {chromeRestartScenario, hostStatus, openAsUserArgs, rawGetInfo, rawSessionCall, routePreconditions, socketAccepts, socketPathOf, turnEndScenario, twoClientScenario,
  userTabScenario} from './accept/chrome-cua.mjs';

// `--all` (M13) evaluates C1-C7 as a whole and never drives a browser; see scripts/accept/chrome-all.mjs:
//   node scripts/accept-chrome.mjs --all --report <file> [--profile <key>] [--c2-report <file>] [--c6-report <file>]
// `--c6-slots` prints the browsers' native-messaging slots (the desktop-absent C6 gate's snapshots; read only).
if (process.argv.includes('--c6-slots')) {
  const {printSlots} = await import('./accept/chrome-all.mjs');
  process.exit(printSlots());
}
if (process.argv.includes('--all')) {
  const {runAll} = await import('./accept/chrome-all.mjs');
  process.exit(await runAll(process.argv.slice(2)));
}

const {values: options} = parseArgs({options: {live: {type: 'boolean'}, profile: {type: 'string'}, report: {type: 'string'}, route: {type: 'string'},
  'chrome-restart': {type: 'boolean'}, 'restart-wait-min': {type: 'string'}, only: {type: 'string'}}, strict: true});
const SCENARIOS = ['c2', 'user-tab', 'turn-end', 'two-clients'];
const only = options.only ? options.only.split(',').map(s => s.trim()) : SCENARIOS;
if (!options.live || !options.profile || !options.report || (options.route && !['cua', 'vendor'].includes(options.route)) || only.some(s => !SCENARIOS.includes(s))
  || ((options['chrome-restart'] || options.only) && options.route !== 'cua')) {
  process.stderr.write('usage: node scripts/accept-chrome.mjs --live [--route cua|vendor] --profile <key> --report <file>\n'
    + '       [--route cua] [--only c2,user-tab,turn-end,two-clients] | --route cua --chrome-restart [--restart-wait-min <n>]\n');
  process.exit(2);
}

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVE = join(REPO, 'scripts', 'accept', 'serve-with-store.mjs');
const SEED_MS = 15_000;

const home = realHome(defaultHome());
const homeRoute = chromeRoute(home);
const route = options.route ?? effectiveRoute(homeRoute);
const restartOnly = options['chrome-restart'] === true;
const runs = name => route === 'cua' && !restartOnly && only.includes(name);
const label = generatedKey('CUA_M11_ACCEPT');
const sentinel = `cua-m11-sentinel-${randomBytes(18).toString('base64url')}`;
const reference = `{{secret:${label}}}`;
const PRINTS = fingerprints(sentinel);
const steps = [];
const record = (name, status, detail) => { steps.push({name, status, ...(detail === undefined ? {} : {detail})}); return status === 'PASS'; };
const facts = {profile: options.profile, route, tabOperations: 0, elicitations: [], cellsSent: []};

// ---- preconditions -----------------------------------------------------------------------------------------------
async function preconditions() {
  const missing = [];
  let runtime;
  try { runtime = resolveRuntime({home}); facts.release = runtime.release; } catch (error) { missing.push(`runtime: ${error.code}`); }
  let profile;
  // The route's extension decides presence (cua's own id on the cua route; chromeFacts defaults to the OpenAI one).
  try { profile = profileStatuses({home, chrome: chromeFacts({extensionId: extensionIdFor(route)})}).find(p => p.key === options.profile); } catch (error) { missing.push(`profiles: ${error.code}`); }
  const gate = profilePrecondition(profile, options.profile);
  if (gate.missing) missing.push(gate.missing);
  if (gate.chromeData) facts.chromeData = gate.chromeData;
  const instanceId = profile?.extensionInstanceId;
  const checks = routePreconditions(route === 'cua'
    ? {route, homeRoute, socketLive: Boolean(instanceId) && await socketAccepts(socketPathOf(home, instanceId)),
      authPresent: existsSync(join(home, 'state', 'codex', 'auth.json'))}           // existence only; never opened
    : {route, homeRoute, liveHosts: countLiveHosts(processTable())});
  missing.push(...checks.missing);
  facts.liveHosts = checks.liveHosts;
  if (route === 'cua') facts.codexAuthPresent = checks.codexAuthPresent;
  return {runtime, profile, missing, loginGate: checks.loginGate};
}

// ---- run -----------------------------------------------------------------------------------------------------------
const channels = [];
const shots = {};
const latch = createStopLatch();
const tab = newTabRecord();
let storeHome = null;      // the run's own temporary $HOME, whose store the server reads
let seeded = false;
let page;
const openServe = () => openSession({
  args: [SERVE], env: {...process.env, CUA_HOME: home, HOME: storeHome, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-accept-chrome',
  onServerRequest: elicitationPolicy({origins: route === 'cua' ? page.origins : [page.origin], latch, inventory: facts.elicitations}),
});
// Each server's transcript and stderr join the scanned channels, whatever happened.
async function closeServe(session, label) {
  const exit = await session.terminate();
  record(`serve-exit${label}`, exit.code === 0 ? 'PASS' : 'FAIL', {code: exit.code, signal: exit.signal ?? null, ...(exit.forced ? {forced: true} : {})});
  channels.push({name: `MCP transport${label} (both directions)`, text: session.transcript.join('\n')}, {name: `serve and runtime stderr${label}`, text: session.stderr});
  facts.serveStderrBytes = (facts.serveStderrBytes ?? 0) + Buffer.byteLength(session.stderr);
}
// Every scenario runs whatever an earlier one did; an exception is that scenario's FAIL, not the run's end. A stop the
// elicitation policy latched (a declined request) stops further input: the later scenarios are not run (BLOCKED).
async function scenario(name, body) {
  if (latch.stopped) { record(`${name}-not-run`, 'BLOCKED', {reason: `the run stopped earlier (${latch.reason})`}); return; }
  try { await body(); } catch (error) { record(`${name}-unexpected`, 'FAIL', `${error.code ?? 'error'}: ${String(error.message).slice(0, 200)}`); }
}
try {
  const {runtime, profile, missing, loginGate} = await preconditions();
  let login = {state: 'not needed on the cua route'};
  if (!missing.length && loginGate) {
    try { login = await loginStatus({home, runtime}); } catch (error) { login = {state: `refused: ${error.code}`}; }
  }
  if (missing.length) record('preconditions', 'BLOCKED', missing);
  else if (loginGate && login.state !== LOGIN_STATES.loggedIn) record('preconditions', 'BLOCKED', `the server has no Codex login (${login.state}); run cua login`);
  else {
    record('preconditions', 'PASS', {release: runtime.release, route, liveHosts: facts.liveHosts, login: login.state, ...(route === 'cua' ? {codexAuthPresent: facts.codexAuthPresent} : {}),
      ...(profile.ready ? {profileReady: true}
        : {profileReady: 'pending the live check', chromeData: facts.chromeData, why: 'this process may not read Chrome\'s data directory; the profile is bound, so profiles_list decides on live evidence'})});
    storeHome = createStoreHome('cua-accept-chrome-');
    const wantsSecret = route === 'vendor' || runs('c2');
    const seed = wantsSecret ? await seedSecret({home: storeHome, key: label, value: sentinel, timeoutMs: SEED_MS}) : null;
    if (seed?.echoed) record('seed-disposable-secret', 'FAIL', 'the value appeared in terminal output');
    else if (seed?.timedOut) record('seed-disposable-secret', 'FAIL', `cua secrets set did not finish within ${SEED_MS} ms (${seed.prompts} prompt(s) answered)`);
    else if (seed && (seed.exit !== 0 || !seed.stored)) record('seed-disposable-secret', 'FAIL', `cua secrets set exited ${seed.exit ?? seed.signal}, key stored: ${seed.stored}`);
    else {
      if (seed) { seeded = true; record('seed-disposable-secret', 'PASS', 'a generated sentinel stored under a disposable key by cua secrets set at a pty, in a temporary $HOME'); }
      page = await startAcceptancePage();
      const session = openServe();
      const extra = [];
      try {
        const init = await session.initialize();
        const {result: list} = await session.request('tools/list', {});
        const tools = (list?.tools ?? []).map(t => t.name);
        record('browser-surface', tools.includes('profiles_list') && /createBrowserTab/.test(list.tools.find(t => t.name === 'js')?.description ?? '') && /extensionInstanceId/.test(init.instructions ?? '') ? 'PASS' : 'FAIL', {tools});
        const profiles = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent;
        const entry = profiles?.profiles?.find(p => p.key === options.profile);
        const sameId = entry?.ready === true && entry.extensionInstanceId === profile.extensionInstanceId;
        if (record('profiles-list', sameId ? 'PASS' : 'FAIL', {status: profiles?.status, keys: profiles?.profiles?.map(p => p.key), readyWithStoredId: sameId,
          ...(entry?.reason ? {reason: entry.reason} : {}), ...(entry?.reason === 'binding_stale' ? {action: `rebind: node bin/cua.mjs profiles bind ${options.profile}`} : {})})) {
          const instanceId = entry.extensionInstanceId;
          const statusOf = async () => hostStatus(home, instanceId);
          if (route === 'cua' && !restartOnly) {
            const found = await cellRunner({session, facts})('discoverBackends', discoverBackends(instanceId));
            const r = found.result ?? {};
            record('discovery-cua-hosts-only', r.count >= 1 && r.selectedListed === true && r.names?.every(n => n === 'cua') && r.types?.every(t => t === 'extension') ? 'PASS' : 'FAIL',
              {class: found.class, count: r.count ?? null, names: r.names ?? null, selectedListed: r.selectedListed ?? null});
            // The login is removed by what getInfo omits; read the host's own answer, as the service receives it.
            const info = await rawGetInfo(socketPathOf(home, instanceId)).catch(error => ({ok: false, error: error.code ?? error.message}));
            const i = info.result ?? {};
            record('host-getinfo-no-header', info.ok && i.type === 'extension' && i.name === 'cua' && !('agentRequestHeaderEnabled' in i) && !('extensionId' in (i.metadata ?? {}))
              && i.metadata?.extensionInstanceId === instanceId ? 'PASS' : 'FAIL',
              info.ok ? {type: i.type ?? null, name: i.name ?? null, agentRequestHeaderEnabled: 'agentRequestHeaderEnabled' in i, metadataKeys: Object.keys(i.metadata ?? {}).sort()} : {error: String(info.error).slice(0, 120)});
          }
          if (restartOnly) {
            await scenario('restart', () => chromeRestartScenario({session, page, instanceId, record, facts, statusOf,
              hostLive: () => socketAccepts(socketPathOf(home, instanceId)), waitMs: Number(options['restart-wait-min'] ?? 15) * 60_000,
              announce: line => process.stdout.write(`OWNER STEP: ${line}\n`)}));
          } else {
            if (route === 'vendor' || runs('c2')) {
              try {
                await runAgentScript({session, page, instanceId, reference, sentinel, latch, tab, record, facts, shots, crossOriginFrame: route === 'cua'});
              } finally {
                if (tab.createAttempted) record('close-created-tab', leftoverOf(tab).status === 'none' ? 'PASS' : 'FAIL', {leftover: leftoverOf(tab).status, closeAttempted: tab.closeAttempted});
              }
            }
            const ended = (await session.call('end_task', {}, 15_000)).result?.structuredContent;
            record('end-task', ended?.status === 'ended' || ended?.status === 'noop' ? 'PASS' : 'FAIL', {status: ended?.status ?? null});
            if (runs('user-tab')) await scenario('user-tab', () => userTabScenario({session, page, instanceId, record, facts, statusOf,
              openAsUser: url => ({code: spawnSync('open', openAsUserArgs(url, profile.chromeProfileDirectory), {stdio: 'ignore'}).status})}));
            if (runs('turn-end')) await scenario('turn-end', () => turnEndScenario({session, page, instanceId, record, facts, statusOf}));
            if (runs('two-clients')) await scenario('two-clients', async () => {
              const other = openServe();
              extra.push(other);
              await other.initialize();
              const socketPath = socketPathOf(home, instanceId);
              await twoClientScenario({sessions: [session, other], page, instanceId, record, facts, statusOf,
                rawCall: ({sessionId, method, params}) => rawSessionCall({socketPath, sessionId, method, params})});
            });
          }
        }
      } finally {
        await closeServe(session, '');
        for (const [i, other] of extra.entries()) await closeServe(other, ` (client ${i + 2})`);
      }
    }
  }
} catch (error) {
  record('unexpected', 'FAIL', `${error.code ?? 'error'}: ${String(error.message).slice(0, 200)}`);
} finally {
  if (page) { facts.testPage = page.requests(); await page.close(); }
  if (storeHome) {
    const removed = await removeStoreHome({home: storeHome, key: label});
    record('cleanup-disposable-secret', removed.keyGone && removed.homeGone ? 'PASS' : 'FAIL',
      removed.keyGone && removed.homeGone ? 'the run-owned key file and its temporary home were removed' : `CLEANUP FAILED: remove the temporary home ${basename(storeHome)} in the system temporary directory by hand`);
  }
}

// ---- elicitations and the sentinel scan --------------------------------------------------------------------------
const els = facts.elicitations;
const accepted = els.filter(e => e.answered.startsWith('accept'));
if (els.length || facts.cellsSent.length) {
  const stray = accepted.some(e => !(e.kind === 'origin-access' && e.ownOrigin === true));
  const declined = els.filter(e => !e.answered.startsWith('accept'));
  record('elicitations-own-origin-only', stray ? 'FAIL' : declined.length ? 'BLOCKED' : 'PASS', {count: els.length, accepted: accepted.length, declinedByKind: Object.fromEntries([...new Set(declined.map(e => e.kind))].map(k => [k, declined.filter(e => e.kind === k).length]))});
}
const leaks = text => textLeaks(text, PRINTS);
if (seeded) {
  const authFile = join(home, 'state', 'codex', 'auth.json');
  const files = await scanFiles([join(home, 'state'), join(home, 'run')], PRINTS, {exclude: path => path === authFile});
  const leaked = [...channels.filter(c => leaks(c.text)).map(c => c.name), ...(shots.bytes && leaks(shots.bytes.toString('latin1')) ? ['screenshot bytes'] : []), ...files.leaked.map(f => `file ${f.replace(home, '$CUA_HOME')}`)];
  const unread = files.unread.map(f => f.replace(home, '$CUA_HOME'));
  record('sentinel-scan', leaked.length || unread.length ? 'FAIL' : 'PASS', leaked.length ? {leakedIn: leaked} : unread.length ? {incomplete: unread}
    : {channels: channels.map(c => ({name: c.name, bytes: Buffer.byteLength(c.text), containsReference: c.text.includes(reference)})), screenshotBytes: shots.bytes?.length ?? 0,
      runtimeFiles: {scanned: files.scanned, excludedByPolicy: files.excluded.map(f => f.replace(home, '$CUA_HOME')), symbolicLinks: files.links}});
}

// Read from the tab record, whatever path the run took: only a confirmed close is no leftover.
const left = leftoverOf(tab);
if (latch.stopped) facts.stoppedBy = latch.reason;
const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
const scenarioName = route === 'vendor' ? 'C2-live-browser-secret-round-trip' : restartOnly ? 'H3b-cua-chrome-after-serve' : 'H3b-cua-route-live';
const report = {scenario: scenarioName, status, at: new Date().toISOString(), label, ...facts, leftover: left.status, steps};
const text = JSON.stringify(report, null, 1);
// The disposable label is not secret and stays in the report (a failed cleanup names it); the generic guard against
// URLs, paths and token-like runs judges everything else.
const reportProblems = [...(leaks(text) ? ['the sentinel'] : []), ...reportLeaks(text.split(label).join('<label>'),
  page ? [page.url, page.origin, page.documentMarker, page.frameOrigin, page.userOrigin, page.framedMarker, page.frameMarker, page.userMarker] : [])];
if (reportProblems.length) {
  process.stderr.write(`accept-chrome: refusing to write a report that would disclose ${[...new Set(reportProblems)].join(', ')}\n`);
  process.exit(1);
}
writeFileSync(options.report, text + '\n', {mode: 0o600});
process.stdout.write(`${report.scenario}: ${status}\nreport: ${options.report}\n`);
for (const s of steps) process.stdout.write(`  ${s.status.padEnd(7)} ${s.name}\n`);
if (shots.file) process.stdout.write(`screenshot of the runner's own tab (outside git): ${shots.file}\n`);
if (left.note) process.stdout.write(`ACTION FOR THE USER: ${left.note}\n`);
for (const note of facts.leftoverNotes ?? []) process.stdout.write(`ACTION FOR THE USER: ${note}\n`);
if (facts.restartNote) process.stdout.write(`NOTE: ${facts.restartNote}\n`);
process.exit(status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 3);
