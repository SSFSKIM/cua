#!/usr/bin/env node
// Live fixture: run ON the Linux browser machine in its X session, through cua's own Chrome host (not --vendor).
// Needs a ready bound profile and cua chrome register. This script opens only its own tab, accepts only its page's
// origin-access elicitation, and reports downloads, JavaScript dialogs, file chooser and connection cleanup.
//   node scripts/accept/linux-chrome-features.mjs [<profile key>]   JSON report; exit 0 when all required steps pass
// API citations below are BS = the pinned readable browser-service.mjs in
// /Users/new/codex-app-src/readable/chatgpt-26.928.40906/cua_node/@oai/browser-desktop/scripts/.
import {readFileSync, readdirSync, existsSync, lstatSync, unlinkSync, mkdtempSync, writeFileSync, rmdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {chromeRoute, effectiveRoute} from '../../src/chrome/route.mjs';
import {backendDir, socketNameFor} from '../../src/chrome/extension.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {cuaHostStep, ownedTabs} from './linux-chrome-lib.mjs';
import {decideElicitation, answerFor, inventoryEntry} from '../probe/chrome/original/elicitation.mjs';
import {startFeaturesPage, REPORT_BODY, REPORT_SHA256} from './features-page.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const RESULT_TAG = 'CUA_FEATURES_RESULT ';
const failedReply = reply => Boolean(reply.timedOut || reply.error || reply.result?.isError);

// The REPL can prepend documentation and diagnostics. Consume only our single tagged result, never arbitrary JSON.
export function parseFeatureResult(reply) {
  if (reply.timedOut) throw new Error('js call timed out');
  if (reply.error) throw new Error(reply.error.message);
  const text = resultText(reply);
  if (reply.result?.isError) throw new Error(text || 'js call failed');
  const lines = text.split('\n').filter(line => line.startsWith(RESULT_TAG));
  if (lines.length !== 1) throw new Error('missing or ambiguous feature result');
  const parsed = JSON.parse(lines[0].slice(RESULT_TAG.length));
  if (typeof parsed?.error === 'string') throw new Error(parsed.error);
  if (!parsed || !Object.hasOwn(parsed, 'detail')) throw new Error('missing feature result detail');
  return parsed.detail;
}

const js = async (session, code, timeoutMs = 60_000) => parseFeatureResult(await session.js(`
  nodeRepl.write(${JSON.stringify(RESULT_TAG)} + JSON.stringify(await (async () => {
    try { return {detail: await (async () => { ${code} })()}; }
    catch (error) { return {error: String(error?.message ?? error)}; }
  })()));`, timeoutMs));

// A completed-download path is on THIS machine (BS:1255-1265, 33753-33764, 49544-49551). Creation time is a
// conservative ownership check: if the filesystem cannot prove it was newly created, leave it in place. Never walk
// or clear ~/Downloads. Keep the full path/inode only internally; the report uses basename and the directory tail.
export function downloadEvidence(path, startedAt) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error('download path is not a regular file');
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  return {
    path, dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs,
    basename: basename(path), directory: basename(dirname(path)), size: stat.size, sha256,
    sha256Match: sha256 === REPORT_SHA256,
    createdByFixture: stat.birthtimeMs > 0 && stat.birthtimeMs >= startedAt,
  };
}

export function deleteFixtureDownload(evidence) {
  if (!evidence) return {deleted: false, reason: 'no saved path was verified'};
  if (!evidence.createdByFixture || !evidence.sha256Match) return {deleted: false, reason: 'creation and fixture bytes not proven'};
  if (!existsSync(evidence.path)) return {deleted: false, reason: 'already absent'};
  const current = downloadEvidence(evidence.path, 0);
  if (current.dev !== evidence.dev || current.ino !== evidence.ino || current.birthtimeMs !== evidence.birthtimeMs || !current.sha256Match) {
    return {deleted: false, reason: 'file changed; left untouched'};
  }
  unlinkSync(evidence.path);
  return {deleted: true};
}

// BS:878-889 puts waitForEvent on tab.playwright, NOT tab. It resolves at completion, not download start.
// BS:1595-1597 / 33733-33764 specify timeoutMs, download id, and nullable local path. Attach a rejection handler
// immediately, and settle the waiter even if the click fails, so one failed step leaves no pending REPL work.
export const DOWNLOAD_CELL = `
  const started = Date.now();
  const pending = fixtureTab.playwright.waitForEvent('download', {timeoutMs: 30000})
    .then(download => ({download}), error => ({error}));
  let clickError;
  try { await fixtureTab.playwright.locator('#dl').click(); }
  catch (error) { clickError = error; }
  const event = await pending;
  if (event.error) throw clickError ?? event.error;
  let path;
  try { path = await event.download.path({timeoutMs: 10000}); }
  catch (error) { throw clickError ?? error; }
  return {path, elapsedMs: Date.now() - started,
    ...(clickError !== undefined ? {clickError: String(clickError?.message ?? clickError)} : {})};`;

// BS:313-320, 1902-1903: raw CDP is an optional tab capability, not tab.cdp/sendCdp. BS:53874-53902 and
// 53981-53985 exclude the Browser domain; this probe still records the live refusal verbatim as informational
// evidence for the design's alternative. No raw surface -> SKIP; a completed send or caught refusal -> PASS.
export const RAW_CDP_CELL = `
  if (!fixtureTab.capabilities) return {skipped: true, reason: 'tab exposes no capabilities collection'};
  const offered = await fixtureTab.capabilities.list();
  if (!offered.some(capability => capability.id === 'cdp')) return {skipped: true, reason: 'tab does not advertise the cdp capability'};
  const cdp = await fixtureTab.capabilities.get('cdp');
  if (typeof cdp?.send !== 'function') return {skipped: true, reason: 'cdp capability exposes no send method'};
  try {
    const result = await cdp.send('Browser.setDownloadBehavior', {behavior: 'default', eventsEnabled: true}, {timeoutMs: 10000});
    return {outcome: 'result', result: result ?? null};
  } catch (error) { return {outcome: 'error', message: String(error?.message ?? error)}; }`;

// BS:410-417 / 32552-32586: getJsDialog's wire result is null or {id,type}; its API returns a dialog handle (or
// undefined). BS:1335-1442: alert has ONLY dismiss(), confirm has accept()/dismiss(), prompt accept requires text.
// BS:50431-50457 makes alert.dismiss() send accept:true; alert.accept() is rejected. Confirm.dismiss() is false.
export const dialogCell = (selector, expectedState) => `
  const waitForDialog = async open => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const dialog = await fixtureTab.getJsDialog();
      if (Boolean(dialog) === open) return dialog;
      if (Date.now() >= deadline) throw new Error(open ? 'no JavaScript dialog within 5 s' : 'JavaScript dialog did not close within 5 s');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  // Clear only a preceding fixture dialog, so a failed alert does not unnecessarily block the independent confirm.
  const previous = await fixtureTab.getJsDialog();
  if (previous) { await previous.dismiss(); await waitForDialog(false); }
  await fixtureTab.playwright.locator(${JSON.stringify(selector)}).click();
  const dialog = await waitForDialog(true);
  const type = dialog.type;
  await dialog.dismiss();
  await waitForDialog(false);
  let state; const deadline = Date.now() + 5000;
  for (;;) {
    state = await fixtureTab.playwright.locator('#state').textContent({timeoutMs: 1000});
    if (state === ${JSON.stringify(expectedState)} || Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return {type, closed: true, state, clearedPreviousType: previous?.type ?? null};`;

// BS:1276-1283, 1914-1915 and 33773-33805: arm first, click the actual input, then setFiles with absolute paths
// visible to Chrome. BS:1908-1909 / 49554-49583 document "Allow access to file URLs"; never hide or work around its
// failure. The outer js wrapper preserves that error verbatim as this step's detail.
export const fileChooserCell = path => `
  const pending = fixtureTab.playwright.waitForEvent('filechooser', {timeoutMs: 10000})
    .then(chooser => ({chooser}), error => ({error}));
  try { await fixtureTab.playwright.locator('#file').click(); }
  catch (error) { await pending; throw error; }
  const event = await pending;
  if (event.error) throw event.error;
  await event.chooser.setFiles([${JSON.stringify(path)}], {timeoutMs: 10000});
  let picked; const deadline = Date.now() + 5000;
  for (;;) {
    picked = await fixtureTab.playwright.locator('#picked').textContent({timeoutMs: 1000});
    if (picked === ${JSON.stringify(`${basename(path)}:1234`)} || Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return {picked, expected: ${JSON.stringify(`${basename(path)}:1234`)}};`;

export async function runAcceptance(key = 'me') {
  const home = process.env.CUA_HOME ?? defaultHome();
  const route = effectiveRoute(chromeRoute(home));
  const runEntries = () => existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : [];
  const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
  const psLines = () => spawnSync('ps', ['-eo', 'pid=,args='], {encoding: 'utf8'}).stdout.split('\n').filter(Boolean);
  const steps = [], elicitations = [];
  const report = {home, key, route, steps, elicitations, cleanup: {download: {deleted: false}, input: {deleted: false}}};
  const step = (name, ok, detail, extra = {}) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', detail: detail ?? null, ...extra}); return ok; };
  const check = async (name, action, informational = false) => {
    try {
      const result = await action();
      return step(name, result.ok, result.detail, {...(informational ? {informational: true} : {}), ...(result.skipped ? {status: 'SKIP'} : {})});
    } catch (error) { return step(name, false, String(error?.message ?? error), informational ? {informational: true} : {}); }
  };
  const runBefore = runEntries();
  let session = null, page = null, profile = null, download = null, inputPath = null, inputDirectory = null, inputStat = null;
  try {
    if (!step('the browser uses the cua route', route === 'cua', route)) throw new Error('requires cua chrome register (not --vendor)');
    page = await startFeaturesPage();
    const ORIGIN = page.origin;
    const answer = msg => {
      const decision = decideElicitation(msg, {origin: ORIGIN});
      elicitations.push(inventoryEntry(msg, decision));
      return answerFor(decision);
    };
    session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'computer,browser'}, clientName: 'cua-linux-chrome-features', onServerRequest: answer});
    await session.initialize();
    const profilesReply = await session.call('profiles_list', {}, 150_000);
    const listed = failedReply(profilesReply) ? null : profilesReply.result?.structuredContent;
    profile = listed?.profiles?.find(p => p.key === key);
    if (!step(`profiles_list reports ${key} ready`, profile?.ready === true && !!profile.extensionInstanceId, failedReply(profilesReply) ? profilesReply : listed)) throw new Error('profile is not ready');
    await check(`${key}'s cua host serves at its pre-listed socket`, async () => cuaHostStep({home, instanceId: profile.extensionInstanceId, psLines: psLines(), exists: existsSync, readJson}));

    const documentVerified = await check('open a tab and verify its document marker', async () => {
      const detail = await js(session, `
        const browser = await cua.getBrowser({extensionInstanceId: ${JSON.stringify(profile.extensionInstanceId)}});
        globalThis.fixtureTab = await cua.createBrowserTab(browser.browserId, ${JSON.stringify(page.url)});
        let marker; const deadline = Date.now() + 30000;
        for (;;) {
          marker = await fixtureTab.playwright.locator('#marker').textContent({timeoutMs: 1000}).catch(() => null);
          if (marker === ${JSON.stringify(page.documentMarker)} || Date.now() >= deadline) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return {markerMatches: marker === ${JSON.stringify(page.documentMarker)}};`, 150_000);
      return {ok: detail.markerMatches === true, detail};
    });
    const checkFeature = (name, action, informational = false) => check(name, () => {
      if (!documentVerified) throw new Error('fixture document was not verified; feature actions were not attempted');
      return action();
    }, informational);
    await checkFeature('download completes and its saved bytes match', async () => {
      const startedAt = Date.now();
      const result = await js(session, DOWNLOAD_CELL);
      if (typeof result.path !== 'string') throw new Error(result.clickError ?? 'download.path() returned no local path');
      download = downloadEvidence(result.path, startedAt);
      const {path, dev, ino, birthtimeMs, ...detail} = download;
      return {ok: result.clickError === undefined && download.sha256Match && download.size === REPORT_BODY.length,
        detail: {...detail, elapsedMs: result.elapsedMs, ...(result.clickError !== undefined ? {clickError: result.clickError} : {})}};
    });
    await checkFeature('download raw-CDP alternative (informational)', async () => {
      const detail = await js(session, RAW_CDP_CELL);
      return {ok: detail.outcome === 'result' || detail.outcome === 'error', detail, skipped: detail.skipped === true};
    }, true);
    for (const [name, selector, type, state] of [
      ['alert is accepted and the page resumes', '#alert', 'alert', 'after-alert'],
      ['confirm is dismissed and returns false', '#confirm', 'confirm', 'confirm:false'],
    ]) await checkFeature(name, async () => {
      const detail = await js(session, dialogCell(selector, state));
      return {ok: detail.type === type && detail.closed === true && detail.state === state, detail};
    });
    await checkFeature('file chooser selects a local 1234-byte file', async () => {
      inputDirectory = mkdtempSync(join(tmpdir(), 'cua-features-'));
      const path = join(inputDirectory, 'cua-upload.txt');
      writeFileSync(path, Buffer.alloc(1234, 0x61), {flag: 'wx'});
      inputPath = path; // Own it only after exclusive creation succeeds.
      inputStat = lstatSync(path);
      const detail = await js(session, fileChooserCell(path));
      return {ok: detail.picked === `${basename(path)}:1234`, detail};
    });
  } catch (error) {
    if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, String(error?.message ?? error));
  } finally {
    // Cleanup remains independent of the feature verdicts, including an open/marker failure.
    if (session) {
      await check('close the tab', async () => {
        const detail = await js(session, `
          if (!globalThis.fixtureTab) return {closed: false, notCreated: true};
          await fixtureTab.close(); return {closed: true};`);
        return {ok: detail.closed === true || detail.notCreated === true, detail};
      });
      await check('end_task', async () => {
        const reply = await session.call('end_task');
        const detail = failedReply(reply) ? reply : reply.result?.structuredContent;
        return {ok: !failedReply(reply) && detail?.status === 'ended', detail};
      });
      if (profile?.extensionInstanceId) await check('the host owns no tab after end_task', async () => {
        const status = readJson(join(backendDir(home), `${socketNameFor(profile.extensionInstanceId)}.json`));
        const owned = ownedTabs(status);
        return {ok: status !== null && owned.length === 0, detail: status ? owned : 'host status is missing or unreadable'};
      });
      await check('cua serve exited cleanly', async () => {
        const detail = await session.terminate();
        return {ok: detail.code === 0 && !detail.forced, detail};
      });
    }
    await check('no run entry left for the connection', async () => {
      const after = runEntries();
      return {ok: JSON.stringify(after) === JSON.stringify(runBefore), detail: {before: runBefore, after}};
    });
    await check('remove the download only if fixture creation is proven', async () => {
      report.cleanup.download = deleteFixtureDownload(download);
      return {ok: !download?.createdByFixture || !download.sha256Match || report.cleanup.download.deleted || report.cleanup.download.reason === 'already absent', detail: report.cleanup.download};
    });
    await check('remove the fixture-created temporary input', async () => {
      if (inputPath && existsSync(inputPath)) {
        const current = lstatSync(inputPath);
        if (!current.isFile() || current.dev !== inputStat?.dev || current.ino !== inputStat?.ino || current.birthtimeMs !== inputStat?.birthtimeMs) {
          report.cleanup.input = {deleted: false, reason: 'file changed; left untouched'};
          return {ok: false, detail: report.cleanup.input};
        }
        unlinkSync(inputPath);
        report.cleanup.input = {deleted: true, basename: basename(inputPath)};
      } else report.cleanup.input = {deleted: false, reason: inputPath ? 'already absent' : 'no input file was created'};
      if (inputDirectory) rmdirSync(inputDirectory);
      return {ok: true, detail: report.cleanup.input};
    });
    if (page) {
      report.pageRequests = page.requests();
      await check('stop the loopback page server', async () => { await page.close(); return {ok: true, detail: 'closed'}; });
    }
  }
  report.status = steps.length && steps.every(s => s.status === 'PASS' || (s.status === 'SKIP' && s.informational)) ? 'PASS' : 'FAIL';
  return report;
}

// Imports for local unit tests never start cua serve or contact a browser.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runAcceptance(process.argv[2] ?? 'me');
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
