// M5 scratch, acceptance 8 with the real vendor runtime against the dev MAWS: the person clicks the agent's tab (the
// seam's sendInput), then the agent's screenshot and locator click in the same second, then the click 3 s later.
import {writeFileSync, existsSync, readFileSync} from 'node:fs';
import {openSession} from '../../../../scripts/accept/mcp-session.mjs';
import {parseFeatureResult} from '../../../../scripts/accept/linux-chrome-features.mjs';
import {cell, featureDecision} from '../../../../scripts/accept/maws-features.mjs';
import {answerFor} from '../../../../scripts/probe/chrome/original/elicitation.mjs';
import {startFeaturesPage} from '../../../../scripts/accept/features-page.mjs';
import {fileURLToPath} from 'node:url';
const CLI = fileURLToPath(new URL('../../../../bin/cua.mjs', import.meta.url));
const DIR = process.env.MAWS_PROBE_DIR ?? '/tmp/maws-probe'; // the launcher's trigger directory (launch.cjs)
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const person = async op => { const k = ++n; writeFileSync(`${DIR}/cmd.json`, JSON.stringify({op, n: k})); for (;;) { if (existsSync(`${DIR}/ack-${k}.json`)) return JSON.parse(readFileSync(`${DIR}/ack-${k}.json`, 'utf8')); await sleep(20); } };
const page = await startFeaturesPage();
const s = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off'}, clientName: 'cua-m5-takeover', onServerRequest: msg => answerFor(featureDecision(msg, page.origin))});
const out = {};
const run = (body, ms = 60_000) => s.js(cell(body), ms).then(parseFeatureResult);
try {
  await s.initialize();
  out.created = await run(`const b = await cua.getBrowser(); globalThis.__t = await cua.createBrowserTab(b.browserId, ${JSON.stringify(page.url)});
    for (let i = 0; i < 50; i++) { if (await globalThis.__t.playwright.locator("#submit").count().catch(() => 0)) break; await new Promise(r => setTimeout(r, 200)); }
    await globalThis.__t.playwright.locator("#name").fill("x"); return {id: String(globalThis.__t.id)};`, 120_000);
  out.person = await person('click');
  const t0 = out.person.at;
  out.duringClick = await run(`const s0 = Date.now(); try { await globalThis.__t.playwright.locator("#submit").click(); return {ok: true, ms: Date.now() - s0}; } catch (e) { return {ok: false, ms: Date.now() - s0, error: String(e?.message ?? e).slice(0, 3000)}; }`);
  out.duringClick.sincePersonMs = Date.now() - t0;
  out.stateAfterRefusal = await run(`return await globalThis.__t.playwright.locator("#state").textContent({timeoutMs: 3000}).catch(e => "ERR " + String(e?.message ?? e).slice(0, 80));`);
  out.duringShot = await run(`const s0 = Date.now(); try { const img = await globalThis.__t.screenshot({}); return {ok: true, ms: Date.now() - s0}; } catch (e) { return {ok: false, ms: Date.now() - s0, error: String(e?.message ?? e).slice(0, 3000)}; }`);
  out.duringShot.sincePersonMs = Date.now() - t0;
  out.controlDuring = (await person('read')).control;
  const wait = t0 + 3300 - Date.now(); if (wait > 0) await sleep(wait);
  out.controlAfter3s = (await person('read')).control;
  out.afterClick = await run(`const s0 = Date.now(); try { await globalThis.__t.playwright.locator("#submit").click(); } catch (e) { return {ok: false, error: String(e?.message ?? e).slice(0, 3000)}; }
    let st = null; for (let i = 0; i < 25; i++) { st = await globalThis.__t.playwright.locator("#state").textContent({timeoutMs: 1000}).catch(() => null); if (st === "submitted:x") break; await new Promise(r => setTimeout(r, 100)); } return {ok: true, ms: Date.now() - s0, state: st};`);
  out.afterClick.sincePersonMs = Date.now() - t0;
  out.controlEnd = (await person('read')).control;
  await s.call('end_task', {}, 30_000);
} catch (e) { out.error = String(e?.stack ?? e); }
finally { console.log(JSON.stringify(out, null, 1)); await s.terminate(); await page.close(); process.exit(0); }
