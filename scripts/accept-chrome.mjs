#!/usr/bin/env node
// Phase C acceptance runner (M11: C2's live round trip). Opt-in and live: it drives the user's existing Chrome through
// `cua serve` over MCP. Its secret lives in a store it owns: a temporary $HOME (scripts/accept/secret-seed.mjs) holding
// one generated key with a generated sentinel, stored through `cua secrets set` typed at a pseudo-terminal and removed
// with the temporary home in `finally`. The server resolves its store from that $HOME
// (scripts/accept/serve-with-store.mjs), so the account's own store (~/.config/claude-secrets) is never touched.
//
//   node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-accept-chrome.json
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
// by kind, and stops further input. User tabs are never bound, read, screenshotted or closed. createBrowserTab gets a
// 60 s limit; a tab that cannot be closed while authorized is reported for the user, never reconnected to.
// Every observable channel is scanned for the sentinel (raw and base64 at every alignment): the MCP transport both
// ways, serve and runtime stderr, the screenshot bytes, every regular file under $CUA_HOME/state and run (read whole;
// the server's Codex credential file is excluded by name and never opened), and the report. Exit 0 PASS, 1 FAIL,
// 3 BLOCKED. The report holds metadata only; the screenshot path is printed, not reported.
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome, realHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {loginStatus, LOGIN_STATES} from '../src/runtime/login.mjs';
import {chromeFacts, countLiveHosts} from '../src/profiles/chrome.mjs';
import {profileStatuses} from '../src/profiles/registry.mjs';
import {processTable} from '../src/profiles/checks.mjs';
import {createStoreHome, generatedKey, removeStoreHome, seedSecret} from './accept/secret-seed.mjs';
import {fingerprints, scanFiles, textLeaks} from './probe/leak-scan.mjs';
import {openSession} from './accept/mcp-session.mjs';
import {reportLeaks} from './probe/chrome/original/classify.mjs';
import {startAcceptancePage} from './accept/chrome-page.mjs';
import {createStopLatch, elicitationPolicy, newTabRecord, leftoverOf, profilePrecondition, runAgentScript} from './accept/chrome-run.mjs';

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

const {values: options} = parseArgs({options: {live: {type: 'boolean'}, profile: {type: 'string'}, report: {type: 'string'}}, strict: true});
if (!options.live || !options.profile || !options.report) {
  process.stderr.write('usage: node scripts/accept-chrome.mjs --live --profile <key> --report <file>\n');
  process.exit(2);
}

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVE = join(REPO, 'scripts', 'accept', 'serve-with-store.mjs');
const SEED_MS = 15_000;

const home = realHome(defaultHome());
const label = generatedKey('CUA_M11_ACCEPT');
const sentinel = `cua-m11-sentinel-${randomBytes(18).toString('base64url')}`;
const reference = `{{secret:${label}}}`;
const PRINTS = fingerprints(sentinel);
const steps = [];
const record = (name, status, detail) => { steps.push({name, status, ...(detail === undefined ? {} : {detail})}); return status === 'PASS'; };
const facts = {profile: options.profile, tabOperations: 0, elicitations: [], cellsSent: []};

// ---- preconditions -----------------------------------------------------------------------------------------------
function preconditions() {
  const missing = [];
  let runtime;
  try { runtime = resolveRuntime({home}); facts.release = runtime.release; } catch (error) { missing.push(`runtime: ${error.code}`); }
  let profile;
  try { profile = profileStatuses({home, chrome: chromeFacts()}).find(p => p.key === options.profile); } catch (error) { missing.push(`profiles: ${error.code}`); }
  const gate = profilePrecondition(profile, options.profile);
  if (gate.missing) missing.push(gate.missing);
  if (gate.chromeData) facts.chromeData = gate.chromeData;
  facts.liveHosts = countLiveHosts(processTable());
  if (!facts.liveHosts) missing.push('no OpenAI Chrome host is running');
  return {runtime, profile, missing};
}

// ---- run -----------------------------------------------------------------------------------------------------------
const channels = [];
const shots = {};
const latch = createStopLatch();
const tab = newTabRecord();
let storeHome = null;      // the run's own temporary $HOME, whose store the server reads
let page;
try {
  const {runtime, profile, missing} = preconditions();
  if (missing.length) {
    record('preconditions', 'BLOCKED', missing);
  } else {
    let login;
    try { login = await loginStatus({home, runtime}); } catch (error) { login = {state: `refused: ${error.code}`}; }
    if (login.state !== LOGIN_STATES.loggedIn) record('preconditions', 'BLOCKED', `the server has no Codex login (${login.state}); run cua login`);
    else {
      record('preconditions', 'PASS', {release: runtime.release, liveHosts: facts.liveHosts, login: login.state, ...(profile.ready ? {profileReady: true}
        : {profileReady: 'pending the live check', chromeData: facts.chromeData, why: 'this process may not read Chrome\'s data directory; the profile is bound, so profiles_list decides on live evidence'})});
      storeHome = createStoreHome('cua-accept-chrome-');
      const seed = await seedSecret({home: storeHome, key: label, value: sentinel, timeoutMs: SEED_MS});
      if (seed.echoed) record('seed-disposable-secret', 'FAIL', 'the value appeared in terminal output');
      else if (seed.timedOut) record('seed-disposable-secret', 'FAIL', `cua secrets set did not finish within ${SEED_MS} ms (${seed.prompts} prompt(s) answered)`);
      else if (seed.exit !== 0 || !seed.stored) record('seed-disposable-secret', 'FAIL', `cua secrets set exited ${seed.exit ?? seed.signal}, key stored: ${seed.stored}`);
      else {
        record('seed-disposable-secret', 'PASS', 'a generated sentinel stored under a disposable key by cua secrets set at a pty, in a temporary $HOME');
        page = await startAcceptancePage();
        const session = openSession({
          args: [SERVE], env: {...process.env, CUA_HOME: home, HOME: storeHome, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-accept-chrome',
          onServerRequest: elicitationPolicy({origin: page.origin, latch, inventory: facts.elicitations}),
        });
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
            try {
              await runAgentScript({session, page, instanceId: entry.extensionInstanceId, reference, sentinel, latch, tab, record, facts, shots});
            } finally {
              if (tab.createAttempted) record('close-created-tab', leftoverOf(tab).status === 'none' ? 'PASS' : 'FAIL', {leftover: leftoverOf(tab).status, closeAttempted: tab.closeAttempted});
            }
          }
          const ended = (await session.call('end_task', {}, 15_000)).result?.structuredContent;
          record('end-task', ended?.status === 'ended' || ended?.status === 'noop' ? 'PASS' : 'FAIL', {status: ended?.status ?? null});
        } finally {
          const exit = await session.terminate();
          record('serve-exit', exit.code === 0 ? 'PASS' : 'FAIL', {code: exit.code, signal: exit.signal ?? null, ...(exit.forced ? {forced: true} : {})});
          channels.push({name: 'MCP transport (both directions)', text: session.transcript.join('\n')}, {name: 'serve and runtime stderr', text: session.stderr});
          facts.serveStderrBytes = Buffer.byteLength(session.stderr);
        }
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
if (storeHome) {
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
const report = {scenario: 'C2-live-browser-secret-round-trip', status, at: new Date().toISOString(), label, ...facts, leftover: left.status, steps};
const text = JSON.stringify(report, null, 1);
// The disposable label is not secret and stays in the report (a failed cleanup names it); the generic guard against
// URLs, paths and token-like runs judges everything else.
const reportProblems = [...(leaks(text) ? ['the sentinel'] : []), ...reportLeaks(text.split(label).join('<label>'), page ? [page.url, page.origin, page.documentMarker] : [])];
if (reportProblems.length) {
  process.stderr.write(`accept-chrome: refusing to write a report that would disclose ${[...new Set(reportProblems)].join(', ')}\n`);
  process.exit(1);
}
writeFileSync(options.report, text + '\n', {mode: 0o600});
process.stdout.write(`${report.scenario}: ${status}\nreport: ${options.report}\n`);
for (const s of steps) process.stdout.write(`  ${s.status.padEnd(7)} ${s.name}\n`);
if (shots.file) process.stdout.write(`screenshot of the runner's own tab (outside git): ${shots.file}\n`);
if (left.note) process.stdout.write(`ACTION FOR THE USER: ${left.note}\n`);
process.exit(status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 3);
