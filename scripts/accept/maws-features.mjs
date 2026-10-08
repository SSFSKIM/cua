#!/usr/bin/env node
// The terminal harness for MAWS's in-app browser (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md,
// M1; run by M2, M3 and M5 against a running MAWS session). It runs `cua serve` (this checkout, the browser surface,
// secrets off) with the CUA_BROWSER_BACKENDS of its own environment, serves the features page on loopback, and drives
// the configured backend through the vendor API exactly as an agent inside MAWS would: cua.getBrowser() with no id.
//
//   CUA_BROWSER_BACKENDS=<socket> node scripts/accept/maws-features.mjs [--report FILE] [--other <second socket>]
//
// Steps, in order (each PASS, FAIL or SKIP; a step that needs an earlier one's tab is FAIL when that one failed):
//   profiles   profiles_list lists key maws first, ready, with a maws:… instance
//   createTab  cua.getBrowser() selects that instance; createBrowserTab(page) shows the page's document marker
//   locator    #name filled with "x", #submit clicked: #state reads submitted:x
//   viewport   the browser's viewport capability set to 800×600, then tab.screenshot() is an image of 800×600; reset
//              gives the pane's size back (reported)
//   popup      #popup (window.open('/popup')) adds exactly one tab, whose URL ends in /popup
//   download, alert, confirm, chooser   M3's (SKIP until then: FEATURE_STEPS below)
//   cleanup    end_task; afterwards neither the created tab nor the popup is listed
//   isolation  with --other: a second `cua serve` on the second socket; each lists exactly one maws browser, its own,
//              and cua.getBrowser({extensionInstanceId: <the other's>}) fails in each (SKIP without --other)
// The JSON report's `summary` is {<step>: status}; exit 0 when no step FAILed.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {configuredBackends} from '../../src/chrome/client-mode.mjs';
import {openSession} from './mcp-session.mjs';
import {parseFeatureResult} from './linux-chrome-features.mjs';
import {decideElicitation, answerFor, inventoryEntry} from '../probe/chrome/original/elicitation.mjs';
import {startFeaturesPage} from './features-page.mjs';
import {imageSize} from './chrome-cells.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const RESULT_TAG = 'CUA_FEATURES_RESULT ';
export const STEPS = ['profiles', 'createTab', 'locator', 'viewport', 'popup', 'download', 'alert', 'confirm', 'chooser', 'cleanup', 'isolation'];
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

// What M3 adds (download, alert, confirm, chooser): each `run({session, page, js})` -> {ok, detail}; null is SKIP.
export const FEATURE_STEPS = {download: null, alert: null, confirm: null, chooser: null};

function startServe(env, page, elicitations) {
  const answer = msg => {
    const decision = decideElicitation(msg, {origin: page.origin});
    elicitations.push(inventoryEntry(msg, decision));
    return answerFor(decision);
  };
  return openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', ...env}, clientName: 'cua-maws-features', onServerRequest: answer});
}

const failed = reply => Boolean(reply.timedOut || reply.error || reply.result?.isError);

export async function runHarness({other = null} = {}) {
  const paths = configuredBackends(process.env);
  if (!paths.length) throw new Error('CUA_BROWSER_BACKENDS names no MAWS socket');
  const steps = {}, details = {}, elicitations = [];
  const record = (name, status, detail) => { steps[name] = status; details[name] = detail ?? null; return status === 'PASS'; };
  const check = async (name, action) => {
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
    for (const [name, step] of Object.entries(FEATURE_STEPS))
      await check(name, async () => (step ? (tabOk ? step({session, page, run}) : {ok: false, detail: 'no tab: createTab failed'}) : {skip: true, detail: 'M3 adds this step'}));
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
  return {summary, status: Object.values(summary).includes('FAIL') ? 'FAIL' : 'PASS', backends: paths, other, details, elicitations, pageRequests: page.requests()};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {report: {type: 'string'}, other: {type: 'string'}}});
  const report = await runHarness({other: values.other ?? null});
  if (values.report) writeFileSync(values.report, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report.summary));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
