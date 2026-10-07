#!/usr/bin/env node
// Live Linux Chrome fixture (Linux acceptance item 10's last step; the own-extension spec's acceptance 7): over
// `cua serve` with the browser surface it takes the instance id profiles_list reports for one registered profile key
// (default `me`), selects that browser, opens a tab on https://example.com/, reads its title, closes the tab, ends the
// task and checks the connection left nothing under $CUA_HOME/run. It also records the live Chrome host it drove: on
// the cua route (`cua chrome register`) the profile's own host serving at its pre-listed socket, and after end_task
// that host's status lists no tab still owned; on the vendor route (`--vendor`) OpenAI's hosts running from
// $CUA_HOME/runtimes. Its whole browser footprint is that one tab. Needs the profile bound (`cua profiles bind <key>`);
// the vendor route also needs the server's Codex login (`cua login`; without it createBrowserTab fails with "Codex
// auth token is unavailable"), the cua route needs none.
//   CUA_SHIM_SURFACES is set here; run in the X session's environment:
//   node scripts/accept/linux-chrome.mjs [<profile key>]      prints a JSON report; exit 0 when every step passes
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {chromeRoute, effectiveRoute} from '../../src/chrome/route.mjs';
import {backendDir, socketNameFor} from '../../src/chrome/extension.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {cuaHostStep, ownedTabs, vendorHostStep} from './linux-chrome-lib.mjs';
import {decideElicitation, answerFor, inventoryEntry} from '../probe/chrome/original/elicitation.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const key = process.argv[2] ?? 'me';
const home = process.env.CUA_HOME ?? defaultHome();
const route = effectiveRoute(chromeRoute(home));
const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
// The vendor asks for access to each new website origin; the fixture accepts that request for its one origin only
// (session scope), as the macOS live acceptance does for its page, and declines anything else.
const ORIGIN = 'https://example.com';
const elicitations = [];
const report = {home, key, route, steps, elicitations};
const answer = msg => { const decision = decideElicitation(msg, {origin: ORIGIN}); elicitations.push(inventoryEntry(msg, decision)); return answerFor(decision); };
const psLines = () => spawnSync('ps', ['-eo', 'pid=,args='], {encoding: 'utf8'}).stdout.split('\n').filter(Boolean);
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

if (route === 'vendor') {
  const {ok, detail} = vendorHostStep({home, psLines: psLines()});
  step('a live Chrome host runs from $CUA_HOME/runtimes', ok, detail);
}

let session = null;
try {
  const runBefore = runEntries();
  session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'computer,browser'}, clientName: 'cua-linux-chrome', onServerRequest: answer});
  await session.initialize();
  const listed = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent;
  const profile = listed?.profiles?.find(p => p.key === key);
  if (!step(`profiles_list reports ${key} ready`, profile?.ready === true && !!profile.extensionInstanceId, listed)) throw new Error('profile');
  if (route === 'cua') {
    const {ok, detail} = cuaHostStep({home, instanceId: profile.extensionInstanceId, psLines: psLines(), exists: existsSync, readJson});
    step(`${key}'s cua host serves at its pre-listed socket`, ok, detail);
  }

  const opened = await session.js(`const browser = await cua.getBrowser({extensionInstanceId: ${JSON.stringify(profile.extensionInstanceId)}});
    globalThis.fixtureTab = await cua.createBrowserTab(browser.browserId, 'https://example.com/');
    let title = ''; const deadline = Date.now() + 30000;
    for (;;) { title = await fixtureTab.playwright.evaluate(() => document.title).catch(() => ''); if (/Example Domain/.test(title) || Date.now() >= deadline) break; await new Promise(r => setTimeout(r, 500)); }
    nodeRepl.write(JSON.stringify({title}));`, 150_000);
  const seen = /\{"title".*\}$/m.exec(resultText(opened))?.[0];
  step('open a tab and read its title', !opened.result?.isError && seen && JSON.parse(seen).title === 'Example Domain', seen ? JSON.parse(seen) : resultText(opened).split('\n')[0]);

  const closed = await session.js('await fixtureTab.close(); nodeRepl.write("closed");', 60_000);
  step('close the tab', !closed.result?.isError && /closed/.test(resultText(closed)), resultText(closed).slice(-300));
  const ended = await session.call('end_task');
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
  if (route === 'cua') {
    const owned = ownedTabs(readJson(join(backendDir(home), `${socketNameFor(profile.extensionInstanceId)}.json`)));
    step('the host owns no tab after end_task', owned.length === 0, owned);
  }
  const exit = await session.terminate();
  session = null;
  step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
  step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
} finally {
  if (session) await session.terminate();
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
