#!/usr/bin/env node
// #141/#168 Linux scroll probe: cua's browser service on this VM's Chrome (a harness Chrome for Testing on a private
// display, scratch HOME), through `cua serve` over MCP, running the corpus's own scroll cells verbatim
// (test/browser-parity/scenarios/input/coordinates.mjs and dom.mjs, `scroll`) on the fixture's input page.
//   node probe.mjs <tree> <label> <trials> <out.jsonl>
// <tree> a cua checkout (the gesture route or the wheel route); every trial's row is appended to <out.jsonl>.
// Conditions per trial: the coordinates and the dom cell with the agent's tab in front of its window, and the
// coordinates cell with the window's first tab (about:blank) in front, the agent's tab behind it. The front tab is set
// with the keyboard (xdotool, on this probe's own private display: ctrl+9 the last tab, ctrl+1 the first) and read
// back from the window's title, since the page's visibilityState reads visible either way under the service's focus
// emulation.
import {appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const [tree, label, trialsArg, out] = process.argv.slice(2);
const load = async rel => await import(pathToFileURL(`${tree}/${rel}`).href);
const {openSession, resultText} = await load('scripts/accept/mcp-session.mjs');
const coordinates = (await load('test/browser-parity/scenarios/input/coordinates.mjs')).default;
const dom = (await load('test/browser-parity/scenarios/input/dom.mjs')).default;
const {startFixture} = await load('test/browser-parity/fixture/serve.mjs');
const cellCode = scenario => scenario.cells.find(c => c.label === 'scroll').code;
const COORDS = cellCode(coordinates), DOM = cellCode(dom);

const fixture = await startFixture({port: 0});
const record = row => appendFileSync(out, JSON.stringify({label, at: new Date().toISOString(), ...row}) + '\n');
// cua's browser service asks no approvals; anything else is declined
const session = openSession({args: [`${tree}/bin/cua.mjs`, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'computer,browser'}, clientName: 'cua-scroll-probe'});
const value = reply => {
  const text = resultText(reply);
  const line = /PROBE (\{.*\})$/m.exec(text)?.[1];
  return line ? JSON.parse(line) : {ok: false, code: reply.timedOut ? 'mcp_timeout' : 'no_marker', message: text.slice(0, 300)};
};
// One trial: the scroll back at the top first, then the cell, timed; its value or its error's code and message.
const x = (...args) => spawnSync('xdotool', args, {encoding: 'utf8'}).stdout.trim();
const ROOT = /Window id: (0x[0-9a-f]+)/.exec(spawnSync('xwininfo', ['-root'], {encoding: 'utf8'}).stdout)?.[1];
const front = async (key, {unfocus = false} = {}) => {
  const id = x('search', '--onlyvisible', '--class', 'chrom').split('\n')[0];
  x('windowfocus', '--sync', id);
  x('key', '--window', id, key);
  // the X focus moved off Chrome's window to the root, as when another application is in front
  if (unfocus) x('windowfocus', ROOT);
  await new Promise(resolve => setTimeout(resolve, 700));
  return x('getwindowname', id);
};
const trial = code => `
await tab.playwright.evaluate('window.scrollTo(0,0)');
const visibility = await tab.playwright.evaluate('document.visibilityState');
const started = Date.now(); let result;
try { result = {ok: true, value: await (async () => { ${code}
})()}; } catch (e) { result = {ok: false, code: e.code ?? e.name, message: String(e.message ?? e).slice(0, 300)}; }
const ms = Date.now() - started;
nodeRepl.write('PROBE ' + JSON.stringify({...result, ms, visibility}));`;

try {
  await session.initialize();
  const listed = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent;
  const profile = listed?.profiles?.find(p => p.key === 'harness');
  if (profile?.ready !== true) throw new Error(`profile harness not ready: ${JSON.stringify(listed)}`);
  const opened = await session.js(`globalThis.browser = await cua.getBrowser({extensionInstanceId: ${JSON.stringify(profile.extensionInstanceId)}});
globalThis.fixtureURL = ${JSON.stringify(fixture.url)};
globalThis.tab = await cua.createBrowserTab(browser.browserId, fixtureURL + '/input.html');
await tab.playwright.locator('#drag').waitFor({state: 'attached', timeoutMs: 10000});
nodeRepl.write('PROBE ' + JSON.stringify({ok: true, value: await tab.playwright.evaluate('document.scrollingElement.scrollHeight')}));`, 120_000);
  record({step: 'open', ...value(opened)});
  const trials = Number(trialsArg);
  for (let i = 1; i <= trials; i++) {
    for (const [condition, code, key, unfocus] of [['coordinates-front', COORDS, 'ctrl+9'], ['dom-front', DOM, 'ctrl+9'], ['coordinates-behind', COORDS, 'ctrl+1'],
      ['coordinates-front-unfocused', COORDS, 'ctrl+9', true]]) {
      const title = await front(key, {unfocus});
      const reply = await session.js(trial(code), 60_000);
      record({step: 'trial', trial: i, condition, title, ...value(reply)});
    }
  }
  record({step: 'end', ...(await session.call('end_task')).result?.structuredContent});
} catch (error) {
  record({step: 'fatal', message: error.message});
} finally {
  const exit = await session.terminate();
  record({step: 'exit', ...exit, stderrTail: session.stderr.slice(-6000)});
  await fixture.close();
}
