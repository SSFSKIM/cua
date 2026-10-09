// M5 probe: does an agent's tab.screenshot() through cua carry MAWS's agent cursor overlay? Click #submit, then take a
// screenshot (the vendor's moveMouse draws the cursor before the click), save the JPEG, then type one
// character into #name with pressSequentially and submit it (#state reads submitted:y).
import {writeFileSync} from 'node:fs';
import {openSession} from '../../../../scripts/accept/mcp-session.mjs';
import {parseFeatureResult} from '../../../../scripts/accept/linux-chrome-features.mjs';
import {cell, featureDecision} from '../../../../scripts/accept/maws-features.mjs';
import {answerFor} from '../../../../scripts/probe/chrome/original/elicitation.mjs';
import {startFeaturesPage} from '../../../../scripts/accept/features-page.mjs';
import {fileURLToPath} from 'node:url';
const CLI = fileURLToPath(new URL('../../../../bin/cua.mjs', import.meta.url));
const page = await startFeaturesPage();
const s = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off'}, clientName: 'cua-m5-cursor', onServerRequest: msg => answerFor(featureDecision(msg, page.origin))});
try {
  await s.initialize();
  const r = parseFeatureResult(await s.js(cell(`
    const b = await cua.getBrowser();
    const tab = await cua.createBrowserTab(b.browserId, ${JSON.stringify(page.url)});
    for (let i = 0; i < 50; i++) { if (await tab.playwright.locator("#submit").count().catch(() => 0)) break; await new Promise(r => setTimeout(r, 200)); }
    const box = null;
    await tab.playwright.locator("#submit").click();
    await new Promise(r => setTimeout(r, 300));
    const toB64 = (v) => typeof v === "string" ? v : Buffer.from(v?.data ?? v).toString("base64");
    const shot = await tab.screenshot({});
    // keyboard input: locator.pressSequentially sends key events per character; fill, locator.type and tab.cua.type
    // set the value by script (no Input.* in the census) and are no row
    await tab.playwright.locator("#name").pressSequentially("y");
    await tab.playwright.locator("#submit").click();
    let typed = null; for (let i = 0; i < 20; i++) { typed = await tab.playwright.locator("#state").textContent({timeoutMs: 1000}).catch(() => null); if (typed === "submitted:y") break; await new Promise(r => setTimeout(r, 100)); }
    return {typed, box, shot: toB64(shot), type: typeof shot, keys: shot && typeof shot === "object" ? Object.keys(shot).slice(0, 5) : null};`), 120_000));
  if (r.shot) { writeFileSync(process.env.MAWS_PROBE_SHOT ?? '/tmp/maws-probe-shot.jpg', Buffer.from(r.shot, 'base64')); delete r.shot; }
  console.log(JSON.stringify(r));
  await s.call('end_task', {}, 30_000);
} catch (e) { console.log("ERR", e?.stack ?? e, JSON.stringify(s.transcript.slice(-3)).slice(0, 3000)); } finally { await s.terminate(); page.close?.(); process.exit(0); }
