#!/usr/bin/env node
// The terminal harness for MAWS's in-app browser (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md,
// M1; run by M2, M3 and M5 against a running MAWS session). It runs `cua serve` (this checkout, the browser surface,
// secrets off) with the CUA_BROWSER_BACKENDS of its own environment, serves the features page on loopback, and drives
// the configured backend through the browser API exactly as an agent inside MAWS would: cua.getBrowser() with no id.
//
//   CUA_BROWSER_BACKENDS=<socket> node scripts/accept/maws-features.mjs [--report FILE] [--other <second socket>]
//     [--chrome-key <profiles_list key>] [--steps <step,step,…>]
//
// --steps runs only the named steps (the others read SKIP, "not selected"); the #493 proof is
// --steps profiles,service,firstUse,mawsKey,chromeKey,keyMiss, which opens only loopback pages, closes every tab it
// opens and downloads nothing (only the download step writes to ~/Downloads, and it removes its own file).
//
// Steps, in order (each PASS, FAIL or SKIP; a step that needs an earlier one's tab is FAIL when that one failed):
//   profiles   profiles_list lists key maws first, ready, with a maws:… instance
//   service    the default browser's documentation shows cua's browser service marker (the only service since #79)
//   firstUse   #493's first-use path, literally: cua.getBrowser() is the maws instance and its documentation names it
//              "MAWS in-app browser (maws)"; createBrowserTab(<its id>, page, {visible: true}) opens the page, and the
//              result says visible was ignored; the tab is closed again
//   mawsKey    createBrowserTab("maws", page) (and getBrowser({id: "maws"})) on the same instance; closed again
//   chromeKey  with --chrome-key <key>: the same with that profiles_list key, on its Chrome profile (SKIP without)
//   keyMiss    getBrowser({id: "iab"}) fails naming the browser ids and the keys (maws, and the --chrome-key one)
//   createTab  cua.getBrowser() selects that instance; createBrowserTab(page) shows the page's document marker
//   locator    #name filled with "x", #submit clicked: #state reads submitted:x
//   viewport   the browser's viewport capability set to 800×600, then tab.screenshot() is an image of 800×600; reset
//              gives the pane's size back (reported)
//   popup      #popup (window.open('/popup')) adds exactly one tab, whose URL ends in /popup
//   download   waitForEvent('download') around #dl's click: download.path() is under ~/Downloads and its bytes are the
//              fixture's (sha256); the file is removed afterwards once the run proved it made it
//   alert      #alert's alert, read through getJsDialog() and dismissed: #state reads after-alert
//   confirm    #confirm's confirm, dismissed: #state reads confirm:false
//   chooser    waitForEvent('filechooser') around #file's click, setFiles([a 1234-byte temporary file]): #picked reads
//              cua-upload.txt:1234 (spike S2 promoted: the chooser passes through MAWS)
//   cleanup    end_task; afterwards neither the created tab nor the popup is listed
//   isolation  with --other: a second `cua serve` on the second socket; each lists exactly one maws browser, its own,
//              and cua.getBrowser({extensionInstanceId: <the other's>}) fails in each (SKIP without --other)
// The JSON report's `summary` is {<step>: status}; exit 0 when no step FAILed.
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {configuredBackends} from '../../src/chrome/client-mode.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {DOWNLOAD_CELL, deleteFixtureDownload, dialogCell, downloadEvidence, fileChooserCell, parseFeatureResult} from './linux-chrome-features.mjs';
import {decideElicitation, answerFor, inventoryEntry} from '../probe/chrome/original/elicitation.mjs';
import {REPORT_BODY, startFeaturesPage} from './features-page.mjs';
import {imageSize} from './chrome-cells.mjs';
import {DOCUMENTATION_CELL, serviceAttestation} from './service-attest.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const RESULT_TAG = 'CUA_FEATURES_RESULT ';
export const STEPS = ['profiles', 'service', 'firstUse', 'mawsKey', 'chromeKey', 'keyMiss', 'createTab', 'locator', 'viewport', 'popup', 'download', 'alert', 'confirm', 'chooser', 'cleanup', 'isolation'];
const js = value => JSON.stringify(value);

// One cell: its body runs in an async function; its return value is the step's detail, a throw its error.
export const cell = body => `
  nodeRepl.write(${js(RESULT_TAG)} + JSON.stringify(await (async () => {
    try { return {detail: await (async () => { ${body} })()}; }
    catch (error) { return {error: String(error?.message ?? error)}; }
  })()));`;

// The screenshot's pixel size: the vendor's tab.screenshot() answers JPEG bytes on this route (as on Chrome's), so the
// size is read as chrome-cells.mjs reads it, PNG or JPEG (its source runs inside the cell).
const IMAGE_SIZE = `const imageSize = ${imageSize.toString()};`;
const poll = (expression, expected, ms = 5000) => `
  let value; const deadline = Date.now() + ${ms};
  for (;;) {
    value = await (async () => ${expression})().catch(() => null);
    if (value === ${js(expected)} || Date.now() >= deadline) break;
    await new Promise(r => setTimeout(r, 100));
  }`;

export const PROFILES_ENTRY = list => {
  const maws = list?.[0];
  return {ok: maws?.key === 'maws' && maws.ready === true && typeof maws.extensionInstanceId === 'string' && maws.extensionInstanceId.startsWith('maws:'), maws};
};

export const CREATE_TAB = page => cell(`
  const browser = await cua.getBrowser();
  const listed = (await cua.listBrowsers({emit: false})).find(b => b.id === browser.browserId);
  globalThis.__maws = {browserId: browser.browserId, instance: listed?.metadata?.extensionInstanceId ?? null};
  const m = globalThis.__maws;
  m.tab = await cua.createBrowserTab(browser.browserId, ${js(page.url)});
  m.tabId = String(m.tab.id);
  ${poll('m.tab.playwright.locator("#marker").textContent({timeoutMs: 1000})', page.documentMarker, 30000)}
  return {instance: m.instance, profileName: listed?.profileName ?? null, tabId: m.tabId, markerMatches: value === ${js(page.documentMarker)}};`);

// #493's first-use path, as the served instructions and the vendor's own text lead an agent there (each tab it opens is
// closed again, and listed no more): cua.getBrowser() with no id, its documentation's Name line, then
// createBrowserTab(<its id>, url, {visible: true}), which a browser without the visibility capability ignores and says
// so in the result (IGNORED_VISIBLE). `page` null (the fake peers of maws-selection.mjs) opens about:blank.
export const IGNORED_VISIBLE = 'createBrowserTab ignored visible: true';
const openAndClose = page => `async (id, options) => {
    const tab = await cua.createBrowserTab(id, ${page ? js(page.url) : 'undefined'}, options);
    const tabId = String(tab.id);
    const marker = ${page ? `await (async () => { ${poll('tab.playwright.locator("#marker").textContent({timeoutMs: 1000})', page.documentMarker, 30000)} return value; })()` : 'null'};
    await tab.close();
    const closed = !(await cua.listTabs({browser: id, emit: false})).some(t => String(t.id) === tabId);
    return {tabId, closed, markerMatches: ${page ? `marker === ${js(page.documentMarker)}` : 'null'}};
  }`;
const instanceOf = 'async id => (await cua.listBrowsers({emit: false})).find(b => b.id === id)?.metadata?.extensionInstanceId ?? null';
export const FIRST_USE = page => cell(`
  const instanceOf = ${instanceOf};
  const opened = ${openAndClose(page)};
  const browser = await cua.getBrowser();
  const named = (await browser.documentation()).split("\\n").find(line => line.startsWith("- Name: ")) ?? null;
  return {browserId: browser.browserId, instance: await instanceOf(browser.browserId), named, visible: await opened(browser.browserId, {visible: true})};`);
// A profiles_list key where a browser id goes: getBrowser({id: key}) and createBrowserTab(key, url).
export const KEY_TAB = (key, page) => cell(`
  const instanceOf = ${instanceOf};
  const opened = ${openAndClose(page)};
  const browser = await cua.getBrowser({id: ${js(key)}});
  return {key: ${js(key)}, browserId: browser.browserId, instance: await instanceOf(browser.browserId), tab: await opened(${js(key)})};`);
// A browser id nothing answers to: the miss names the ids and the keys.
export const KEY_MISS = cell(`
  try { await cua.getBrowser({id: "iab"}); return {selected: true}; } catch (error) { return {selected: false, error: String(error?.message ?? error).slice(0, 400)}; }`);
export const FIRST_USE_CHECKS = {
  firstUse: (detail, text, instance) => detail.instance === instance && detail.named === '- Name: MAWS in-app browser (maws)' && detail.visible?.closed === true
    && detail.visible.markerMatches !== false && text.includes(IGNORED_VISIBLE),
  key: (detail, instance) => detail.instance === instance && detail.tab?.closed === true && detail.tab.markerMatches !== false,
  miss: (detail, keys) => detail.selected === false && detail.error.startsWith('Browser is not available: iab. Browser ids: ')
    && keys.every(key => detail.error.includes(`${js(key)}`)),
};

const created = 'const m = globalThis.__maws; if (!m?.tab) throw new Error("no created tab");';

export const LOCATOR = cell(`${created}
  await m.tab.playwright.locator("#name").fill("x");
  await m.tab.playwright.locator("#submit").click();
  ${poll('m.tab.playwright.locator("#state").textContent({timeoutMs: 1000})', 'submitted:x')}
  return {state: value};`);

export const VIEWPORT = cell(`${created} ${IMAGE_SIZE}
  const browser = await cua.getBrowser({id: m.browserId});
  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({width: 800, height: 600});
  let during;
  try { during = imageSize(await m.tab.screenshot({})); } finally { await viewport.reset(); }
  const after = imageSize(await m.tab.screenshot({}));
  return {during, after};`);

export const POPUP = cell(`${created}
  const listed = async () => (await cua.listTabs({browser: m.browserId, emit: false})).map(t => ({id: String(t.id), url: String(t.url ?? "")}));
  const before = new Set((await listed()).map(t => t.id));
  await m.tab.playwright.locator("#popup").click();
  let added = []; const deadline = Date.now() + 10000;
  for (;;) {
    added = (await listed()).filter(t => !before.has(t.id));
    if (added.some(t => t.url.endsWith("/popup")) || Date.now() >= deadline) break;
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 1000));
  added = (await listed()).filter(t => !before.has(t.id));
  m.popupId = added.find(t => t.url.endsWith("/popup"))?.id ?? null;
  return {added};`);

export const AFTER_END = cell(`const m = globalThis.__maws; if (!m) throw new Error("nothing was created");
  const ids = (await cua.listTabs({browser: m.browserId, emit: false})).map(t => String(t.id));
  return {createdListed: ids.includes(m.tabId), popupListed: m.popupId != null && ids.includes(m.popupId)};`);

export const ISOLATION = otherInstance => cell(`
  const maws = (await cua.listBrowsers({emit: false})).filter(b => b.type === "extension" && String(b.metadata?.extensionInstanceId ?? "").startsWith("maws:"));
  let otherSelected = false, otherError = null;
  try { await cua.getBrowser({extensionInstanceId: ${js(otherInstance)}}); otherSelected = true; } catch (error) { otherError = String(error?.message ?? error).slice(0, 200); }
  return {mawsInstances: maws.map(b => b.metadata.extensionInstanceId), otherSelected, otherError};`);

// The Chrome route's feature cells (linux-chrome-features.mjs) read the tab as `fixtureTab`: here it is the created tab.
const onTab = body => cell(`${created} const fixtureTab = m.tab; ${body}`);
export const DOWNLOAD = onTab(DOWNLOAD_CELL);
export const ALERT = onTab(dialogCell('#alert', 'after-alert'));
export const CONFIRM = onTab(dialogCell('#confirm', 'confirm:false'));
export const CHOOSER = path => onTab(fileChooserCell(path));
export const UPLOAD_BYTES = 1234;

// M3's steps (download, alert, confirm, chooser): each `step({run})` -> {ok, detail}.
export const FEATURE_STEPS = {
  async download({run, downloads = join(homedir(), 'Downloads')}) {
    const startedAt = Date.now();
    const result = await run(DOWNLOAD, 90_000);
    if (typeof result.path !== 'string') return {ok: false, detail: result};
    const evidence = downloadEvidence(result.path, startedAt);
    const inDownloads = dirname(result.path) === downloads;
    const removed = deleteFixtureDownload(evidence); // the fixture's file only, proven by its birth time and bytes
    const {path, dev, ino, birthtimeMs, ...detail} = evidence;
    return {
      ok: result.clickError === undefined && evidence.sha256Match && evidence.size === REPORT_BODY.length && inDownloads,
      detail: {...detail, inDownloads, elapsedMs: result.elapsedMs, removed, ...(result.clickError !== undefined && {clickError: result.clickError})},
    };
  },
  async alert({run}) {
    const detail = await run(ALERT);
    return {ok: detail.type === 'alert' && detail.closed === true && detail.state === 'after-alert', detail};
  },
  async confirm({run}) {
    const detail = await run(CONFIRM);
    return {ok: detail.type === 'confirm' && detail.closed === true && detail.state === 'confirm:false', detail};
  },
  async chooser({run}) {
    const directory = mkdtempSync(join(tmpdir(), 'cua-maws-chooser-'));
    try {
      const path = join(directory, 'cua-upload.txt');
      writeFileSync(path, Buffer.alloc(UPLOAD_BYTES, 0x61), {flag: 'wx'});
      const detail = await run(CHOOSER(path));
      return {ok: detail.picked === `cua-upload.txt:${UPLOAD_BYTES}`, detail};
    } finally { rmSync(directory, {recursive: true, force: true}); }
  },
};

// The served page's own file transfers (the vendor's download and upload approvals) are accepted for it, as the Chrome
// route's features run does; every other elicitation keeps the shared policy.
export function featureDecision(msg, origin) {
  const strict = decideElicitation(msg, {origin});
  return !strict.accept && strict.kind === 'file-transfer' && strict.ownOrigin && msg?.params?._meta?.origin === origin
    ? {...strict, accept: true, reason: 'file transfer with the served page'} : strict;
}

function startServe(env, page, elicitations) {
  const answer = msg => {
    const decision = featureDecision(msg, page.origin);
    elicitations.push(inventoryEntry(msg, decision));
    return answerFor(decision);
  };
  return openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', ...env}, clientName: 'cua-maws-features', onServerRequest: answer});
}

const failed = reply => Boolean(reply.timedOut || reply.error || reply.result?.isError);

export async function runHarness({other = null, chromeKey = null, only = null} = {}) {
  const paths = configuredBackends(process.env);
  if (!paths.length) throw new Error('CUA_BROWSER_BACKENDS names no MAWS socket');
  const steps = {}, details = {}, elicitations = [];
  const record = (name, status, detail) => { steps[name] = status; details[name] = detail ?? null; return status === 'PASS'; };
  const check = async (name, action) => {
    if (only && !only.includes(name)) return record(name, 'SKIP', 'not selected');
    try { const {ok, detail, skip} = await action(); return record(name, skip ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail); }
    catch (error) { return record(name, 'FAIL', String(error?.message ?? error)); }
  };
  const page = await startFeaturesPage();
  const session = startServe({}, page, elicitations);
  const run = (code, timeoutMs = 60_000) => session.js(code, timeoutMs).then(parseFeatureResult);
  let maws = null, otherSession = null;
  try {
    await session.initialize();
    await check('profiles', async () => {
      const reply = await session.call('profiles_list', {}, 60_000);
      if (failed(reply)) return {ok: false, detail: reply};
      const entry = PROFILES_ENTRY(reply.result.structuredContent?.profiles);
      maws = entry.ok ? entry.maws : null;
      return {ok: entry.ok, detail: reply.result.structuredContent};
    });
    await check('service', async () => {
      const reply = await session.js(DOCUMENTATION_CELL(), 60_000);
      return failed(reply) ? {ok: false, detail: reply} : serviceAttestation(resultText(reply));
    });
    await check('firstUse', async () => {
      const reply = await session.js(FIRST_USE(page), 120_000);
      const detail = parseFeatureResult(reply);
      return {ok: maws !== null && FIRST_USE_CHECKS.firstUse(detail, resultText(reply), maws.extensionInstanceId), detail};
    });
    await check('mawsKey', async () => {
      const detail = await run(KEY_TAB('maws', page), 120_000);
      return {ok: maws !== null && FIRST_USE_CHECKS.key(detail, maws.extensionInstanceId), detail};
    });
    let chromeInstance = null;
    await check('chromeKey', async () => {
      if (!chromeKey) return {skip: true, detail: 'no --chrome-key'};
      const reply = await session.call('profiles_list', {}, 60_000);
      chromeInstance = reply.result?.structuredContent?.profiles?.find(p => p.key === chromeKey && p.ready)?.extensionInstanceId ?? null;
      if (!chromeInstance) return {ok: false, detail: {notReady: chromeKey, profiles: reply.result?.structuredContent ?? reply}};
      const detail = await run(KEY_TAB(chromeKey, page), 120_000);
      return {ok: FIRST_USE_CHECKS.key(detail, chromeInstance), detail};
    });
    await check('keyMiss', async () => {
      const detail = await run(KEY_MISS);
      return {ok: FIRST_USE_CHECKS.miss(detail, ['maws', ...(chromeInstance ? [chromeKey] : [])]), detail};
    });
    let createdTab = false;
    const tabOk = await check('createTab', async () => {
      const detail = await run(CREATE_TAB(page), 120_000);
      createdTab = typeof detail.tabId === 'string';
      return {ok: detail.markerMatches === true && maws !== null && detail.instance === maws.extensionInstanceId, detail};
    });
    const needsTab = (name, action) => check(name, () => (tabOk ? action() : {ok: false, detail: 'no tab: createTab failed'}));
    await needsTab('locator', async () => { const detail = await run(LOCATOR); return {ok: detail.state === 'submitted:x', detail}; });
    await needsTab('viewport', async () => {
      const detail = await run(VIEWPORT);
      return {ok: detail.during?.width === 800 && detail.during?.height === 600 && detail.after !== null, detail};
    });
    await needsTab('popup', async () => {
      const detail = await run(POPUP);
      return {ok: detail.added.length === 1 && detail.added[0].url.endsWith('/popup'), detail};
    });
    for (const [name, step] of Object.entries(FEATURE_STEPS)) await needsTab(name, () => step({run}));
    await check('cleanup', async () => {
      const ended = await session.call('end_task', {}, 30_000);
      if (failed(ended)) return {ok: false, detail: ended};
      if (!createdTab) return {ok: false, detail: 'no tab was created'};
      const detail = await run(AFTER_END);
      return {ok: !detail.createdListed && !detail.popupListed, detail};
    });
    await check('isolation', async () => {
      if (!other) return {skip: true, detail: 'no --other socket'};
      otherSession = startServe({CUA_BROWSER_BACKENDS: other}, page, elicitations);
      await otherSession.initialize();
      const reply = await otherSession.call('profiles_list', {}, 60_000);
      const theirs = failed(reply) ? {ok: false} : PROFILES_ENTRY(reply.result.structuredContent?.profiles);
      if (!theirs.ok || !maws) return {ok: false, detail: {ours: maws, theirs: reply.result?.structuredContent ?? reply}};
      const ours = await run(ISOLATION(theirs.maws.extensionInstanceId));
      const their = parseFeatureResult(await otherSession.js(ISOLATION(maws.extensionInstanceId), 60_000));
      await session.call('end_task', {}, 30_000);
      await otherSession.call('end_task', {}, 30_000);
      const alone = (side, id) => side.mawsInstances.length === 1 && side.mawsInstances[0] === id && side.otherSelected === false;
      return {ok: alone(ours, maws.extensionInstanceId) && alone(their, theirs.maws.extensionInstanceId), detail: {ours, theirs: their}};
    });
  } catch (error) {
    if (!Object.values(steps).includes('FAIL')) record('harness', 'FAIL', String(error?.message ?? error));
  } finally {
    for (const s of [session, otherSession]) if (s) details[s === session ? 'serve' : 'serveOther'] = await s.terminate();
    await page.close();
  }
  for (const name of STEPS) steps[name] ??= 'FAIL';
  const summary = Object.fromEntries([...STEPS, ...Object.keys(steps).filter(n => !STEPS.includes(n))].map(n => [n, steps[n]]));
  return {summary, status: Object.values(summary).includes('FAIL') ? 'FAIL' : 'PASS', backends: paths, other, chromeKey, only, details, elicitations, pageRequests: page.requests()};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {report: {type: 'string'}, other: {type: 'string'}, 'chrome-key': {type: 'string'}, steps: {type: 'string'}}});
  const only = values.steps ? values.steps.split(',').map(step => step.trim()).filter(Boolean) : null;
  const unknown = only?.filter(step => !STEPS.includes(step)) ?? [];
  if (unknown.length) throw new Error(`unknown --steps: ${unknown.join(', ')} (the steps are ${STEPS.join(', ')})`);
  const report = await runHarness({other: values.other ?? null, chromeKey: values['chrome-key'] ?? null, only});
  if (values.report) writeFileSync(values.report, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report.summary));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
