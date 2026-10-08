#!/usr/bin/env node
// The default selection inside MAWS, against fake peers and the real vendor runtime (docs/doperpowers/specs/2026-10-08-
// maws-in-app-browser-design.md, M1's pins on acceptance 13 and 14): this process hosts a fake MAWS peer and a
// Chrome-shaped fake peer (test/helpers/fake-maws-peer.mjs: the cua extension's hello, no profileName, a non-maws
// instance), configures both in CUA_BROWSER_BACKENDS (MAWS first, so it is the default) and runs `cua serve` (this
// checkout, browser surface, secrets off) in the CUA_HOME of its environment, which needs the pinned runtime installed.
// No Chrome is driven: the Chrome-shaped peer stands in for a Chrome profile.
//
//   CUA_HOME=<scratch home with the runtime> node scripts/accept/maws-selection.mjs [--report FILE]
//
// Steps: default-is-maws (cua.getBrowser() with no id selects the MAWS instance); maws-down-unreachable (the MAWS peer
// stopped: profiles_list reads maws_unreachable); default-fails-closed (cua.getBrowser() then fails with the vendor's
// "Browser is not available", never selecting the Chrome-shaped peer); explicit-chrome (getBrowser({extensionInstanceId:
// <the Chrome-shaped peer's>}) still works: one tab created and closed there); reconnect-ready (the MAWS peer started
// again: profiles_list reads maws ready within 10 s); default-restored (cua.getBrowser() selects MAWS again in the same
// REPL heap, so the runtime was never restarted). Exit 0 when every step passed.
import {randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openSession} from './mcp-session.mjs';
import {parseFeatureResult} from './linux-chrome-features.mjs';
import {cell} from './maws-features.mjs';
import {startFakeMawsPeer} from '../../test/helpers/fake-maws-peer.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const js = value => JSON.stringify(value);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const SELECT_DEFAULT = cell(`
  globalThis.__selection ??= {heap: ${js(randomUUID())}};
  let selected = null, error = null;
  try {
    const browser = await cua.getBrowser();
    selected = (await cua.listBrowsers({emit: false})).find(b => b.id === browser.browserId)?.metadata?.extensionInstanceId ?? null;
  } catch (e) { error = String(e?.message ?? e).slice(0, 200); }
  return {selected, error, heap: globalThis.__selection.heap};`);

export const EXPLICIT = instance => cell(`
  const browser = await cua.getBrowser({extensionInstanceId: ${js(instance)}});
  const tab = await cua.createBrowserTab(browser.browserId);
  const id = String(tab.id);
  await tab.close();
  const listed = (await cua.listTabs({browser: browser.browserId, emit: false})).some(t => String(t.id) === id);
  return {tabId: id, closed: !listed};`);

export async function runSelection() {
  const dir = mkdtempSync('/tmp/cua-sel-');
  const mawsPath = join(dir, 'app-sel.sock'), chromePath = join(dir, 'chrome.sock');
  let maws = await startFakeMawsPeer({path: mawsPath});
  const chrome = await startFakeMawsPeer({path: chromePath, chrome: true, instanceId: randomUUID()});
  const steps = [];
  const record = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', detail}); return ok; };
  const session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', CUA_BROWSER_BACKENDS: `${mawsPath}:${chromePath}`}, clientName: 'cua-maws-selection'});
  const run = code => session.js(code, 90_000).then(parseFeatureResult);
  const mawsEntry = async () => (await session.call('profiles_list', {}, 60_000)).result?.structuredContent?.profiles?.find(p => p.key === 'maws');
  try {
    await session.initialize();
    const first = await run(SELECT_DEFAULT);
    record('default-is-maws', first.selected === maws.instanceId, first);
    await session.call('end_task', {}, 30_000);
    await maws.stop();
    let down;
    for (const stopped = Date.now(); Date.now() - stopped < 5000; await sleep(100)) { down = await mawsEntry(); if (!down?.ready) break; }
    record('maws-down-unreachable', down?.ready === false && down.reason === 'maws_unreachable', down);
    const failed = await run(SELECT_DEFAULT);
    record('default-fails-closed', failed.selected === null && /^Browser is not available: maws:/.test(failed.error ?? '') && failed.heap === first.heap, failed);
    const explicit = await run(EXPLICIT(chrome.instanceId));
    const ext = chrome.connections.at(-1)?.ext;
    const created = ext?.calls.filter(c => c.method === 'tabs.create').length ?? 0;
    const gone = ext ? !ext.state.tabs.has(Number(explicit.tabId)) : false;
    record('explicit-chrome', explicit.closed === true && created === 1 && gone, {...explicit, chromePeer: {created, gone}});
    await session.call('end_task', {}, 30_000);
    maws = await startFakeMawsPeer({path: mawsPath});
    const restarted = Date.now();
    let back;
    while (Date.now() - restarted < 10_000) { back = await mawsEntry(); if (back?.ready) break; await sleep(250); }
    record('reconnect-ready', back?.ready === true && back.extensionInstanceId === maws.instanceId, {...back, afterMs: Date.now() - restarted});
    const again = await run(SELECT_DEFAULT);
    record('default-restored', again.selected === maws.instanceId && again.heap === first.heap, again);
    await session.call('end_task', {}, 30_000);
  } catch (error) {
    record('harness', false, String(error?.message ?? error));
  } finally {
    const serve = await session.terminate();
    record('serve-exited-cleanly', serve.code === 0 && !serve.forced, serve);
    await maws.stop();
    await chrome.stop();
    rmSync(dir, {recursive: true, force: true});
  }
  return {status: steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL', steps};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {report: {type: 'string'}}});
  const report = await runSelection();
  if (values.report) writeFileSync(values.report, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
