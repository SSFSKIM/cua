#!/usr/bin/env node
// Live Linux Chrome fixture for acceptance 10's last step: over `cua serve` with the browser surface it takes the
// instance id profiles_list reports for one registered profile key (default `me`), selects that browser, opens a tab on
// https://example.com/, reads its title, closes the tab, ends the task and checks the connection left nothing under
// $CUA_HOME/run. It also records the live Chrome hosts and that each runs from $CUA_HOME/runtimes. Its whole browser
// footprint is that one tab. Needs the profile bound (`cua profiles bind <key>`) and the server's Codex login
// (`cua login`); without the login createBrowserTab fails with "Codex auth token is unavailable".
//   CUA_SHIM_SURFACES is set here; run in the X session's environment:
//   node scripts/accept/linux-chrome.mjs [<profile key>]      prints a JSON report; exit 0 when every step passes
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const key = process.argv[2] ?? 'me';
const home = process.env.CUA_HOME ?? defaultHome();
const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {home, key, steps};

const hosts = spawnSync('ps', ['-eo', 'pid=,args='], {encoding: 'utf8'}).stdout.split('\n')
  .filter(line => /extension-host\/linux\/[^/]+\/extension-host/.test(line)).map(line => line.trim());
step('a live Chrome host runs from $CUA_HOME/runtimes', hosts.length > 0 && hosts.every(line => line.includes(join(home, 'runtimes') + '/')), hosts);

let session = null;
try {
  const runBefore = runEntries();
  session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'computer,browser'}, clientName: 'cua-linux-chrome'});
  await session.initialize();
  const listed = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent;
  const profile = listed?.profiles?.find(p => p.key === key);
  if (!step(`profiles_list reports ${key} ready`, profile?.ready === true && !!profile.extensionInstanceId, listed)) throw new Error('profile');

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
