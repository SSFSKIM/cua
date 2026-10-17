#!/usr/bin/env node
// M4's live MAWS client-mode run (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M4; acceptance 8's
// meaningful half): MAWS's e2e:browser-cua group drives MAWS's primitive server with a fake host and never runs cua, so
// this runs cua itself against a real MAWS. It starts MAWS from a MAWS worktree (launch.cjs: serve-plain.cjs, two app
// sessions, this process trusted as their engine would be), then, with the CUA_HOME of its own environment:
//   features   scripts/accept/maws-features.mjs's harness on session A's socket (--other session B's): profiles,
//              the service attestation, createTab (hello.profileName read back as the browser's profileName), locator,
//              viewport, popup (tabs.adopted), download, alert, confirm, chooser, cleanup, isolation
//   cursor     a locator click draws the agent's cursor: MAWS's cursor message count rises (moveMouse -> cursor.move)
//   caps       the browser's and the tab's announced capabilities (which of cdp, webmcp, browserAuth MAWS client mode offers)
//   history    browser.history's answer on this backend
//   takeover   the person clicks the agent's tab (the seam's sendInput), then the agent's locator click in the same
//              second, once at the default budget and once with {timeoutMs: 15000}: MAWS holds an acting command for at
//              most min(1.5 s, the timeoutMs the host passes in debugger.sendCommand - 0.1 s) and refuses it while the
//              person holds the tab; each run records how long the click took, its error head, and #state after
// The verdict (verdict.mjs) is written into the report and is the exit code: 0 only when every required check passed.
// A catchable termination signal (SIGINT, SIGTERM, SIGHUP) goes through the same shutdown as a normal end: the probe's
// own session terminated, MAWS stopped, the scratch profile and trigger directory removed, the report written.
// The run is cua's browser service's, the only one `cua serve` runs since #79; the vendor service's control runs recorded
// before that (report `service: 'vendor'`) are still read by verdict.mjs, and CUA_BROWSER_SERVICE=vendor is refused.
//   MAWS_CHECKOUT=<MAWS worktree> CUA_HOME=<scratch home with the runtime> node run.mjs --out <report.json>
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openSession} from '../../../../../scripts/accept/mcp-session.mjs';
import {parseFeatureResult} from '../../../../../scripts/accept/linux-chrome-features.mjs';
import {cell, featureDecision, runHarness} from '../../../../../scripts/accept/maws-features.mjs';
import {answerFor} from '../../../../../scripts/probe/chrome/original/elicitation.mjs';
import {startFeaturesPage} from '../../../../../scripts/accept/features-page.mjs';
import {verdict} from './verdict.mjs';

const {values} = parseArgs({options: {out: {type: 'string'}}});
const MAWS = process.env.MAWS_CHECKOUT;
if (!MAWS || !process.env.CUA_HOME) throw new Error('set MAWS_CHECKOUT to a MAWS worktree and CUA_HOME to a scratch home with the runtime');
if (process.env.CUA_BROWSER_SERVICE === 'vendor') throw new Error('cua serve runs only cua\'s browser service since #79: the vendor control cannot be run');
const CLI = fileURLToPath(new URL('../../../../../bin/cua.mjs', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const userData = mkdtempSync('/tmp/mcua-m4-');
const probeDir = mkdtempSync('/tmp/mcua-m4-probe-');
const report = {service: 'cua', started: new Date().toISOString()};

// MAWS, and the person's stand-in through the launcher's file trigger
const electron = join(MAWS, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const maws = spawn(electron, [fileURLToPath(new URL('./launch.cjs', import.meta.url)), userData, 'm4-A', 'm4-B'], {
  cwd: MAWS, stdio: ['ignore', 'pipe', 'pipe'],
  env: {...process.env, MAWS_CHECKOUT: MAWS, MAWS_PROBE_DIR: probeDir, MAWS_PROBE_TRUST_PID: String(process.pid)},
});
let stdout = '';
maws.stdout.on('data', chunk => { stdout += chunk; });
maws.stderr.on('data', () => {});
maws.on('error', error => { report.error ??= `MAWS did not start: ${error.message}`; });
const lines = () => stdout.split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return {}; } });
let n = 0;
const person = async (op, extra = {}) => {
  const k = ++n;
  writeFileSync(join(probeDir, 'cmd.json'), JSON.stringify({op, n: k, session: 'm4-A', ...extra}));
  for (const until = Date.now() + 10_000; Date.now() < until; await sleep(20)) {
    const ack = join(probeDir, `ack-${k}.json`);
    if (existsSync(ack)) return JSON.parse(readFileSync(ack, 'utf8'));
  }
  throw new Error(`no answer to the person's ${op}`);
};

// The one shutdown path, for a normal end, an error and a termination signal alike (idempotent: the first caller
// runs it, later callers wait for it): the probe's own session and page, then MAWS (SIGTERM, then SIGKILL after 15 s),
// then the scratch state, then the report and its verdict. maws-features' sessions are its own: their `cua serve`
// children end with this process's pipes.
const owned = {session: null, page: null};
let shutdown = null;
function finish(cause) {
  shutdown ??= (async () => {
    if (cause) report.error ??= cause;
    if (owned.session) { report.serve = await owned.session.terminate().catch(error => ({error: String(error)})); delete report.serve?.stderr; }
    if (owned.page) await owned.page.close().catch(() => {});
    if (maws.exitCode === null && maws.signalCode === null) {
      maws.kill('SIGTERM');
      for (const until = Date.now() + 15_000; maws.exitCode === null && maws.signalCode === null && Date.now() < until;) await sleep(100);
      if (maws.exitCode === null && maws.signalCode === null) maws.kill('SIGKILL');
    }
    report.mawsInspectAtQuit = lines().find(l => 'inspect' in l)?.inspect ?? null;
    rmSync(userData, {recursive: true, force: true});
    rmSync(probeDir, {recursive: true, force: true});
    report.finished = new Date().toISOString();
    report.verdict = verdict(report);
    const text = `${JSON.stringify(report, null, 1)}\n`;
    if (values.out) writeFileSync(values.out, text); else process.stdout.write(text);
    console.error(JSON.stringify({verdict: report.verdict, features: report.features?.summary, cursor: report.cursor?.ok, takeover: Object.fromEntries(Object.entries(report.takeover ?? {}).map(([k, v]) => [k, {ok: v.click?.ok, ms: v.click?.ms, state: v.state}])), error: report.error?.split('\n')[0]}));
    return report.verdict.status === 'PASS' ? 0 : 1;
  })();
  return shutdown;
}
for (const [signal, number] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
  process.on(signal, () => { finish(`interrupted by ${signal}`).then(() => process.exit(128 + number)); });
}

try {
  let sockets = null, trusted = null;
  for (const until = Date.now() + 60_000; Date.now() < until && !(sockets && trusted !== null) && !report.error; await sleep(100)) {
    for (const line of lines()) { if (line.sockets) sockets = line.sockets; if ('trusted' in line) trusted = line.trusted; }
  }
  report.maws = {sockets, trusted};
  if (!sockets || trusted !== true) throw new Error('MAWS did not open the sockets or trust this process');

  process.env.CUA_BROWSER_BACKENDS = sockets['m4-A'];
  report.features = await runHarness({other: sockets['m4-B']});
  for (const step of ['serve', 'serveOther']) delete report.features.details?.[step]?.stderr;

  const page = owned.page = await startFeaturesPage();
  const s = owned.session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off'}, clientName: 'cua-m4-maws-live', onServerRequest: msg => answerFor(featureDecision(msg, page.origin))});
  const run = (body, ms = 60_000) => s.js(cell(body), ms).then(parseFeatureResult);
  const ready = `for (let i = 0; i < 50; i++) { if (await globalThis.__t.playwright.locator("#submit").count().catch(() => 0)) break; await new Promise(r => setTimeout(r, 200)); }
    await globalThis.__t.playwright.locator("#name").fill("x");`;
  const timedClick = options => `const s0 = Date.now();
    try { await globalThis.__t.playwright.locator("#submit").click(${options}); return {ok: true, ms: Date.now() - s0}; }
    catch (e) { return {ok: false, ms: Date.now() - s0, error: String(e?.message ?? e).split("\\n")[0].slice(0, 200)}; }`;
  const state = `return await globalThis.__t.playwright.locator("#state").textContent({timeoutMs: 3000}).catch(e => "ERR " + String(e?.message ?? e).slice(0, 80));`;
  await s.initialize();
  report.created = await run(`const b = await cua.getBrowser(); globalThis.__b = b; globalThis.__t = await cua.createBrowserTab(b.browserId, ${JSON.stringify(page.url)}); ${ready}
    const listed = (await cua.listBrowsers({emit: false})).find(x => x.id === b.browserId);
    return {id: String(globalThis.__t.id), profileName: listed?.profileName ?? null, instance: listed?.metadata?.extensionInstanceId ?? null};`, 120_000);

  const before = await person('read');
  report.cursor = {before: before.cursorMessages, click: await run(timedClick(''))};
  report.cursor.after = (await person('read')).cursorMessages;
  report.cursor.ok = report.cursor.click.ok && report.cursor.after > report.cursor.before;

  report.caps = await run(`const names = async c => { try { return (await c.list()).map(x => x?.id ?? x?.name ?? String(x)); } catch (e) { return "ERR " + String(e?.message ?? e).slice(0, 120); } };
    return {browser: await names(globalThis.__b.capabilities), tab: await names(globalThis.__t.capabilities)};`);
  report.history = await run(`try { const r = await globalThis.__b.history({limit: 1}); return {ok: true, entries: Array.isArray(r) ? r.length : typeof r}; }
    catch (e) { return {ok: false, error: String(e?.message ?? e).split("\\n")[0].slice(0, 200)}; }`);

  report.takeover = {};
  for (const [name, options] of [['defaultBudget', ''], ['timeoutMs15000', '{timeoutMs: 15000}']]) {
    await run(`await globalThis.__t.reload(); ${ready} return true;`, 60_000);
    await sleep(3_500); // any earlier hand-back grace over
    const t = {person: await person('click')};
    const t0 = t.person.at;
    t.click = await run(timedClick(options), 60_000);
    t.click.sincePersonMs = Date.now() - t0;
    t.state = await run(state);
    t.controlAfter = (await person('read')).control;
    report.takeover[name] = t;
  }
  await s.call('end_task', {}, 30_000);
} catch (error) {
  report.error ??= String(error?.stack ?? error);
}
process.exitCode = await finish();
