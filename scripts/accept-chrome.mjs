#!/usr/bin/env node
// Phase C acceptance runner (M11: C2's live round trip). Opt-in and live: it drives the user's existing Chrome through
// `cua serve` over MCP and touches exactly one Keychain item, a uniquely labelled disposable entry holding a generated
// sentinel, created through the test-owned pty seeding fixture and deleted in `finally`.
//
//   node scripts/accept-chrome.mjs --live --profile personal --report /tmp/cua-accept-chrome.json
//
// Path under test: a fixed agent script (not a model) -> MCP -> `cua serve` (CUA_SHIM_SURFACES=browser) -> vendor
// cua-repl -> node_repl -> cell -> nodeRepl.rpc("browser") -> trusted worker -> src/services/browser.mjs -> the
// connection's broker (Keychain) -> substitution -> the vendor @oai/browser-desktop service -> the original OpenAI
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
// 60 s limit; a tab that cannot be closed while authorized is reported for the user, never reconnected to. A Keychain
// prompt makes the seeding step time out: BLOCKED, never answered.
// Every observable channel is scanned for the sentinel (raw and base64 at every alignment): the MCP transport both
// ways, serve and runtime stderr, the screenshot bytes, every regular file under $CUA_HOME/state and run (read whole;
// the server's Codex credential file is excluded by name and never opened), and the report. Exit 0 PASS, 1 FAIL,
// 3 BLOCKED. The report holds metadata only; the screenshot path is printed, not reported.
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome, realHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {loginStatus, LOGIN_STATES} from '../src/runtime/login.mjs';
import {HELPER_PATH, locateHelper} from '../src/secrets/helper.mjs';
import {runCaptured} from '../src/secrets/commands.mjs';
import {chromeFacts, countLiveHosts} from '../src/profiles/chrome.mjs';
import {profileStatuses} from '../src/profiles/registry.mjs';
import {processTable} from '../src/profiles/checks.mjs';
import {PTY_DRIVER, setThroughTerminal} from '../native/keychain/fixtures/seed.mjs';
import {fingerprints, scanFiles, textLeaks} from './probe/leak-scan.mjs';
import {openSession} from './accept/mcp-session.mjs';
import {decideElicitation, answerFor, inventoryEntry} from './probe/chrome/original/elicitation.mjs';
import {cellOutcome, reportLeaks} from './probe/chrome/original/classify.mjs';
import {RESULT_MARKER} from './probe/chrome/original/cells.mjs';
import {startAcceptancePage, expectedDigest, PAGE_TITLE} from './accept/chrome-page.mjs';
import * as cells from './accept/chrome-cells.mjs';

const {values: options} = parseArgs({options: {live: {type: 'boolean'}, profile: {type: 'string'}, report: {type: 'string'}}, strict: true});
if (!options.live || !options.profile || !options.report) {
  process.stderr.write('usage: node scripts/accept-chrome.mjs --live --profile <key> --report <file>\n');
  process.exit(2);
}

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(REPO, 'bin', 'cua.mjs');
const SEED_MS = 15_000;
const PROMPT_ACTION = 'a Keychain prompt may be waiting: dismiss it (do not allow) and re-run when a human can answer it';
const LIMITS = {
  select: {cellMs: 30_000, callMs: 60_000}, create: {cellMs: 60_000, callMs: 90_000}, goto: {cellMs: 45_000, callMs: 75_000},
  default: {cellMs: 30_000, callMs: 60_000},
};

const home = realHome(defaultHome());
const label = `cua-m11-accept-${randomUUID()}`;
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
  if (!locateHelper().built || !locateHelper({path: PTY_DRIVER}).built) missing.push('Keychain helper or pty driver not built (npm run build:helper, npm run test:helper)');
  let profile;
  try { profile = profileStatuses({home, chrome: chromeFacts()}).find(p => p.key === options.profile); } catch (error) { missing.push(`profiles: ${error.code}`); }
  if (!profile) missing.push(`profile "${options.profile}" is not registered`);
  else if (!profile.ready) missing.push(`profile "${options.profile}" is not ready (${profile.reason})`);
  facts.liveHosts = countLiveHosts(processTable());
  if (!facts.liveHosts) missing.push('no OpenAI Chrome host is running');
  return {runtime, profile, missing};
}

// ---- the fixed agent script --------------------------------------------------------------------------------------
async function agentScript(session, page, instanceId, shots) {
  const results = {};
  const declinedSoFar = () => facts.elicitations.filter(e => !e.answered.startsWith('accept')).length;
  const run = async (name, code, limits = LIMITS.default) => {
    facts.cellsSent.push(name);
    const started = Date.now();
    const reply = await session.request('tools/call', {name: 'js', arguments: {code, title: `cua accept ${name}`, timeout_ms: limits.cellMs}}, limits.callMs);
    const content = reply.result?.content ?? [];
    const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    const found = text.match(new RegExp(`${RESULT_MARKER} (\\{.*\\})`));
    const cell = reply.timedOut ? {probeError: `${name} timed out after ${limits.callMs} ms`, images: []}
      : {isError: reply.result?.isError === true, result: found ? JSON.parse(found[1]) : null, images: content.filter(c => c.type === 'image'), ...(found ? {} : {unmarked: text.slice(0, 600)})};
    results[name] = {...cellOutcome(cell), durationMs: Date.now() - started, result: cell.result ?? null, images: cell.images};
    return results[name];
  };

  const select = await run('selectBrowser', cells.selectBrowser(instanceId), LIMITS.select);
  if (!record('select-profile-backend', select.result?.selected === true ? 'PASS' : 'FAIL', {class: select.class, ...(select.text ? {text: select.text} : {})})) return results;

  const create = await run('createBrowserTab', cells.CREATE_TAB, LIMITS.create);
  facts.tabOperations++;
  results.created = create.result?.created === true;
  record('create-tab', results.created ? 'PASS' : 'FAIL', {class: create.class, durationMs: create.durationMs, limitMs: LIMITS.create.cellMs, ...(create.text ? {text: create.text} : {})});
  if (!results.created) { results.createFailed = true; return results; }

  const go = await run('gotoOwnedPage', cells.gotoPage(page), LIMITS.goto);
  facts.tabOperations++;
  const verified = go.result?.markerFound === true;
  record('owned-page', verified ? 'PASS' : 'FAIL', {class: go.class, markerFound: verified, ...(go.text ? {text: go.text} : {})});
  if (verified && !declinedSoFar()) {
    const fill = await run('fillSecretReference', cells.fillReference(page, reference));
    facts.tabOperations++;
    record('fill-secret-reference', fill.result?.filled === true ? 'PASS' : 'FAIL', {class: fill.class, ...(fill.text ? {text: fill.text} : {})});
    const digest = await run('computeDigest', cells.computeDigest(page));
    facts.tabOperations++;
    const matches = typeof digest.result?.digest === 'string' && digest.result.digest === expectedDigest(sentinel);
    record('page-digest-matches-sentinel', matches ? 'PASS' : 'FAIL', {class: digest.class, digestShown: typeof digest.result?.digest === 'string', digestMatches: matches, ...(digest.text ? {text: digest.text} : {})});
    const induced = await run('inducedFailure', cells.inducedFailure(page, reference));
    facts.tabOperations++;
    const r = induced.result ?? {};
    record('induced-failure-value-free', r.code === 'secret_input_failed' && typeof r.classification === 'string' && !r.unexpectedSuccess ? 'PASS' : 'FAIL',
      {class: induced.class, code: r.code ?? null, classification: r.classification ?? null, ...(r.unexpectedSuccess ? {unexpectedSuccess: true} : {})});
    const shot = await run('getScreenshot', cells.screenshot(page));
    facts.tabOperations++;
    if (shot.images.length === 1) {
      const bytes = Buffer.from(shot.images[0].data, 'base64');
      shots.bytes = bytes;
      const dir = mkdtempSync(join(tmpdir(), 'cua-m11-shot-'));
      shots.file = join(dir, `owned-tab.${bytes[0] === 0xff ? 'jpeg' : 'png'}`);
      writeFileSync(shots.file, bytes, {mode: 0o600});
      shots.meta = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sizeMatches: bytes.length === shot.result?.bytes};
    }
    record('screenshot', shots.meta?.sizeMatches ? 'PASS' : 'FAIL', {class: shot.class, ...(shots.meta ?? {images: shot.images.length})});
  } else {
    record('fill-secret-reference', 'BLOCKED', verified ? 'an elicitation was declined; no input was sent' : 'the owned page was not verified; no input was sent');
  }

  const close = await run('closeCreatedTab', cells.CLOSE_TAB);
  facts.tabOperations++;
  results.closed = close.result?.closed === true;
  if (results.closed) {
    const confirm = await run('confirmClosed', cells.CONFIRM_CLOSED);
    results.confirmed = confirm.class === 'ok' && confirm.result?.stillListed === false;
    results.stillListed = confirm.result?.stillListed === true;
  }
  return results;
}

function leftover(results) {
  if (!results.created) return results.createFailed ? {status: 'unknown', note: `createBrowserTab failed without returning a tab; if a new tab appeared in Chrome, close it by hand. The runner did not reconnect or retry.`} : {status: 'none'};
  if (!results.closed) return {status: 'possibly-open', note: `close() of the runner's own tab ("${PAGE_TITLE}" on 127.0.0.1) failed; close it by hand. The runner did not reconnect or retry.`};
  if (results.stillListed) return {status: 'open', note: `The runner's own tab ("${PAGE_TITLE}" on 127.0.0.1) is still listed after close(); close it by hand.`};
  if (!results.confirmed) return {status: 'unconfirmed', note: `The runner's own tab was closed but its absence could not be confirmed; if it is still open, close it by hand.`};
  return {status: 'none'};
}

// ---- run -----------------------------------------------------------------------------------------------------------
const channels = [];
const shots = {};
let seeded = false;
let page;
let left = {status: 'none'};
try {
  const {runtime, profile, missing} = preconditions();
  if (missing.length) {
    record('preconditions', 'BLOCKED', missing);
  } else {
    let login;
    try { login = await loginStatus({home, runtime}); } catch (error) { login = {state: `refused: ${error.code}`}; }
    if (login.state !== LOGIN_STATES.loggedIn) record('preconditions', 'BLOCKED', `the server has no Codex login (${login.state}); run cua login`);
    else {
      record('preconditions', 'PASS', {release: runtime.release, profileReady: true, liveHosts: facts.liveHosts, login: login.state});
      const seed = await setThroughTerminal({helper: HELPER_PATH, label, value: sentinel, timeoutMs: SEED_MS});
      seeded = true;
      if (seed.echoed) record('seed-disposable-secret', 'FAIL', 'the value appeared in terminal output');
      else if (seed.timedOut) record('seed-disposable-secret', 'BLOCKED', `set did not finish within ${SEED_MS} ms; ${PROMPT_ACTION}`);
      else if (seed.exit !== 0 || !seed.terminalRestored) record('seed-disposable-secret', 'FAIL', `set exited ${seed.exit ?? seed.signal}; terminal restored: ${seed.terminalRestored}`);
      else {
        record('seed-disposable-secret', 'PASS', 'a generated sentinel stored under a disposable label through the test-owned pty fixture');
        page = await startAcceptancePage();
        const session = openSession({
          args: [CLI, 'serve'], env: {...process.env, CUA_HOME: home, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-accept-chrome',
          onServerRequest: msg => {
            const decision = decideElicitation(msg, {origin: page.origin});
            facts.elicitations.push(inventoryEntry(msg, decision));
            return answerFor(decision);
          },
        });
        try {
          const init = await session.initialize();
          const {result: list} = await session.request('tools/list', {});
          const tools = (list?.tools ?? []).map(t => t.name);
          record('browser-surface', tools.includes('profiles_list') && /createBrowserTab/.test(list.tools.find(t => t.name === 'js')?.description ?? '') && /extensionInstanceId/.test(init.instructions ?? '') ? 'PASS' : 'FAIL', {tools});
          const profiles = (await session.call('profiles_list')).result?.structuredContent;
          const entry = profiles?.profiles?.find(p => p.key === options.profile);
          const sameId = entry?.ready === true && entry.extensionInstanceId === profile.extensionInstanceId;
          if (record('profiles-list', sameId ? 'PASS' : 'FAIL', {status: profiles?.status, keys: profiles?.profiles?.map(p => p.key), readyWithStoredId: sameId})) {
            const results = await agentScript(session, page, entry.extensionInstanceId, shots);
            left = leftover(results);
            if (results.created) record('close-created-tab', left.status === 'none' ? 'PASS' : 'FAIL', {leftover: left.status});
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
  if (seeded) {
    const removed = await runCaptured(HELPER_PATH, ['remove', label, '--yes']);
    const after = await runCaptured(HELPER_PATH, ['list']);
    let gone = false;
    try { gone = !JSON.parse(after.stdout).labels.includes(label); } catch {}
    record('cleanup-disposable-secret', gone && (removed.code === 0 || /\[not_found\]/.test(removed.stderr ?? '')) ? 'PASS' : 'FAIL',
      gone ? 'the run-owned item was removed' : `CLEANUP FAILED for ${label}: remove it with node bin/cua.mjs secrets remove ${label}`);
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
