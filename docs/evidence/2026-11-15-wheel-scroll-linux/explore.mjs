#!/usr/bin/env node
// One-off: where cua's agent tab lands in the harness Chrome on the private display, and whether a keyboard tab switch
// (xdotool, on this probe's own display only) puts it in the background.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const [tree] = process.argv.slice(2);
const load = async rel => await import(pathToFileURL(`${tree}/${rel}`).href);
const {openSession, resultText} = await load('scripts/accept/mcp-session.mjs');
const {startFixture} = await load('test/browser-parity/fixture/serve.mjs');
const fixture = await startFixture({port: 0});
const x = (...args) => spawnSync('xdotool', args, {encoding: 'utf8'});
const windows = () => x('search', '--onlyvisible', '--class', 'chrom').stdout.trim().split('\n').filter(Boolean).map(id => ({id, name: x('getwindowname', id).stdout.trim()}));
const session = openSession({args: [`${tree}/bin/cua.mjs`, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'computer,browser'}, clientName: 'cua-scroll-explore'});
try {
  await session.initialize();
  const profile = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent?.profiles?.find(p => p.key === 'harness');
  const vis = async () => resultText(await session.js(`nodeRepl.write('VIS ' + await tab.playwright.evaluate('document.visibilityState'));`, 30_000)).match(/VIS (\w+)/)?.[1];
  await session.js(`globalThis.browser = await cua.getBrowser({extensionInstanceId: ${JSON.stringify(profile.extensionInstanceId)}});
globalThis.tab = await cua.createBrowserTab(browser.browserId, ${JSON.stringify(fixture.url + '/input.html')});
await tab.playwright.locator('#drag').waitFor({state: 'attached', timeoutMs: 10000}); nodeRepl.write('ok');`, 120_000);
  console.log('windows after the agent tab:', JSON.stringify(windows()), 'visibility:', await vis());
  for (const w of windows()) {
    x('windowfocus', '--sync', w.id);
    x('key', '--window', w.id, 'ctrl+1');
    await new Promise(r => setTimeout(r, 1000));
    console.log('after ctrl+1 in', w.id, JSON.stringify(windows()), 'visibility:', await vis());
  }
  for (const w of windows()) { x('windowfocus', '--sync', w.id); x('key', '--window', w.id, 'ctrl+9'); }
  await new Promise(r => setTimeout(r, 1000));
  console.log('after ctrl+9:', JSON.stringify(windows()), 'visibility:', await vis());
  await session.call('end_task');
} catch (error) {
  console.log('fatal', error.message);
} finally {
  await session.terminate();
  await fixture.close();
}
