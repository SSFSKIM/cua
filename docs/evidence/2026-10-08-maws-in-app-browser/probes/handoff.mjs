// M5 scratch, acceptance 11's first half against the dev MAWS: three agent tabs (unmarked, deliverable, handoff),
// end_task, then the next task lists them: the unmarked one closed, the deliverable the person's, the handoff the agent's.
import {openSession} from '../../../../scripts/accept/mcp-session.mjs';
import {parseFeatureResult} from '../../../../scripts/accept/linux-chrome-features.mjs';
import {cell, featureDecision} from '../../../../scripts/accept/maws-features.mjs';
import {answerFor} from '../../../../scripts/probe/chrome/original/elicitation.mjs';
import {startFeaturesPage} from '../../../../scripts/accept/features-page.mjs';
import {fileURLToPath} from 'node:url';
const CLI = fileURLToPath(new URL('../../../../bin/cua.mjs', import.meta.url));
const page = await startFeaturesPage();
const s = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off'}, clientName: 'cua-m5-handoff', onServerRequest: msg => answerFor(featureDecision(msg, page.origin))});
const idsOf = 'const idsOf = t => [t?.id, t?.providerTabId].filter(v => v != null).map(String);';
const out = {};
try {
  await s.initialize();
  out.made = parseFeatureResult(await s.js(cell(`
    const b = await cua.getBrowser(); globalThis.__h = {b, ids: {}};
    for (const role of ["unmarked", "deliverable", "handoff"]) { const t = await cua.createBrowserTab(b.browserId, ${JSON.stringify(page.url)}); globalThis.__h[role] = t; globalThis.__h.ids[role] = String(t.id); }
    await globalThis.__h.deliverable.markDeliverable(); await globalThis.__h.handoff.markHandoff();
    return globalThis.__h.ids;`), 120_000));
  out.end1 = (await s.call('end_task', {}, 30_000)).result?.isError ?? null;
  await new Promise(r => setTimeout(r, 2000));
  out.next = parseFeatureResult(await s.js(cell(`${idsOf}
    const b = await cua.getBrowser(); const ids = ${JSON.stringify(out.made)};
    const agent = (await b.tabs.list()).flatMap(idsOf); const user = (await b.user.openTabs()).flatMap(idsOf);
    const res = {agent: Object.fromEntries(Object.entries(ids).map(([r, id]) => [r, agent.includes(id)])), user: Object.fromEntries(Object.entries(ids).map(([r, id]) => [r, user.includes(id)]))};
    const errors = [];
    for (const [role, id] of Object.entries(ids)) {
      try {
        if ((await b.tabs.list()).flatMap(idsOf).includes(id)) { await (await b.tabs.get(id)).close(); continue; }
        const u = (await b.user.openTabs()).find(t => idsOf(t).includes(id));
        if (u) await (await b.user.claimTab(u)).close();
      } catch (e) { errors.push(role + ": " + String(e?.message ?? e).slice(0, 160)); }
    }
    const open = [...(await b.tabs.list()).flatMap(idsOf), ...(await b.user.openTabs()).flatMap(idsOf)];
    return {...res, closeErrors: errors, leftover: Object.entries(ids).filter(([, id]) => open.includes(id)).map(([r]) => r)};`), 120_000));
  out.end2 = (await s.call('end_task', {}, 30_000)).result?.isError ?? null;
} catch (e) { out.error = String(e?.message ?? e); }
finally { console.log(JSON.stringify(out)); await s.terminate(); await page.close(); process.exit(0); }
