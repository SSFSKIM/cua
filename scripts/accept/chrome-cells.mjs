// The fixed agent script of the Chrome acceptance (C2): the JavaScript cells scripts/accept-chrome.mjs sends to
// `cua serve`'s js tool. Each cell reduces what it sees inside the REPL to a whitelist (booleans, counts, the page's
// digest text) and writes one marker line (cellCode, shared with the M9/M10 probe). The cells act only on the tab
// they create; ownership is verified by the page's document marker read through a Playwright locator, never through
// an AX snapshot (after the fill a snapshot could describe the field). The secret is named only by its reference.
import {cellCode} from '../probe/chrome/original/cells.mjs';
import {INPUT_LABEL, BUTTON_LABEL, DIGEST_HEX, FRAME_BUTTON_LABEL, FRAME_CLICKED} from './chrome-page.mjs';

const js = value => JSON.stringify(value);

export const selectBrowser = instanceId => cellCode(`const browser = await cua.getBrowser({extensionInstanceId: ${js(instanceId)}});
globalThis.__acc = {browserId: browser.browserId, verified: false};
__out.selected = typeof browser.browserId === "string";`);

export const CREATE_TAB = cellCode(`const m = globalThis.__acc;
if (!m?.browserId) throw new Error("accept: no selected browser");
const tab = await cua.createBrowserTab(m.browserId);
m.tab = tab;
m.tabId = String(tab.id);
__out.created = true;
__out.locators = typeof tab.playwright?.getByLabel === "function";`);

const created = `const m = globalThis.__acc;
if (!m?.tab) throw new Error("accept: no created tab");`;
const markerText = 'await m.tab.playwright.locator("#marker").textContent({timeoutMs: 5000})';
const owned = page => `${created}
if (!m.verified || (${markerText}) !== ${js(page.documentMarker)}) throw new Error("accept: the owned page is not verified; nothing sent");`;

export const gotoPage = page => cellCode(`${created}
const t0 = Date.now();
await m.tab.goto(${js(page.url)});
__out.gotoMs = Date.now() - t0;
m.verified = (${markerText}) === ${js(page.documentMarker)};
__out.markerFound = m.verified;`);

export const fillReference = (page, reference) => cellCode(`${owned(page)}
const field = m.tab.playwright.getByLabel(${js(INPUT_LABEL)}, {exact: true});
if ((await field.count()) !== 1) throw new Error("accept: the secret field's label does not resolve to exactly one element");
await field.fill(${js(reference)}, {timeoutMs: 10000});
__out.filled = true;`);

export const computeDigest = page => cellCode(`${owned(page)}
const button = m.tab.playwright.getByRole("button", {exact: true, name: ${js(BUTTON_LABEL)}});
if ((await button.count()) !== 1) throw new Error("accept: the button does not resolve to exactly one element");
await button.click({});
let text = "";
for (let i = 0; i < 20 && !/^done: /.test(text); i++) {
  text = String(await m.tab.playwright.locator("#out").textContent({timeoutMs: 2000}));
  if (!/^done: /.test(text)) await new Promise(r => setTimeout(r, 250));
}
const match = text.match(/^done: ([0-9a-f]{${DIGEST_HEX}})$/);
__out.digest = match ? match[1] : null;`);

// A substituted fill the vendor must fail (no such element): the error the cell sees is the wrapper's fixed
// classification. Only its code and classification leave the REPL.
export const inducedFailure = (page, reference) => cellCode(`${owned(page)}
try {
  await m.tab.playwright.locator("#cua-accept-absent").fill(${js(reference)}, {timeoutMs: 2000});
  __out.unexpectedSuccess = true;
} catch (e) {
  const message = String(e?.message ?? e);
  __out.code = (message.match(/\\[(secret_[a-z_]+|unsupported_[a-z_]+)\\]/) ?? [])[1] ?? null;
  __out.classification = (message.match(/failed \\(([a-z_:]+)\\) after the secret was read/) ?? [])[1] ?? null;
}`);

export const screenshot = page => cellCode(`${owned(page)}
const shot = await m.tab.getScreenshot({emit: false});
__out.bytes = shot?.byteLength ?? null;
nodeRepl.emitImage(shot);`);

export const CLOSE_TAB = cellCode(`${created}
if (String(m.tab.id) !== m.tabId) throw new Error("accept: the tab handle changed; not closing");
await m.tab.close();
__out.closed = true;`);

export const CONFIRM_CLOSED = cellCode(`${created}
const tabs = await cua.listTabs({browser: m.browserId, emit: false});
__out.stillListed = tabs.some(t => String(t.id) === m.tabId);`);

// ---- H3b: navigation latency and the cross-site frame (acceptance 1) -------------------------------------------------

// The C2 tab navigates to the framed page and drives a locator inside its cross-site iframe (an out-of-process frame
// the service reaches only through attachTarget): it reads the frame's marker and clicks the frame's button.
export const crossOriginFrame = page => cellCode(`${created}
const t0 = Date.now();
await m.tab.goto(${js(page.framedUrl)});
__out.gotoMs = Date.now() - t0;
m.verified = false;
__out.parentMarker = (await m.tab.playwright.locator("#marker").textContent({timeoutMs: 3000})) === ${js(page.framedMarker)};
const frame = m.tab.playwright.frameLocator("#cross");
let text = null;
for (const deadline = Date.now() + 15000; text !== ${js(page.frameMarker)} && Date.now() < deadline;) {
  try { text = await frame.locator("#frame-marker").textContent({timeoutMs: 2000}); } catch { await new Promise(r => setTimeout(r, 250)); }
}
__out.frameMarker = text === ${js(page.frameMarker)};
await frame.getByRole("button", {exact: true, name: ${js(FRAME_BUTTON_LABEL)}}).click({});
let out = null;
for (let i = 0; i < 20 && out !== ${js(FRAME_CLICKED)}; i++) {
  out = await frame.locator("#frame-out").textContent({timeoutMs: 2000});
  if (out !== ${js(FRAME_CLICKED)}) await new Promise(r => setTimeout(r, 250));
}
__out.frameClicked = out === ${js(FRAME_CLICKED)};`);

// ---- H3b: the cua route's scenario cells ----------------------------------------------------------------------------
// Each scenario keeps its REPL state in its own global, so the scenarios never read each other's handles. Tab ids the
// runner compares with the host's <name>.json are emitted as numbers (Chrome tab ids of tabs the runner created or
// opened; never a user tab's). A task boundary (end_task) may reset nothing or everything in the REPL, so every task
// selects its browser again and ids cross tasks only through the runner.
const at = ns => `globalThis[${js(ns)}]`;
const ID_OF = 'const idsOf = t => [t?.id, t?.providerTabId].filter(v => v != null).map(String);';

// cua.listBrowsers on the cua route: only cua's own hosts may be listed (the backend paths are set, so the vendor's
// /tmp/codex-browser-use scan is skipped), the selected instance among them. (The service's BrowserInfo keeps only two
// metadata fields, so whether getInfo asks for agent request headers is checked on the host's raw answer instead.)
export const discoverBackends = instanceId => cellCode(`const list = await cua.listBrowsers({emit: false});
__out.count = list.length;
__out.names = list.map(b => (b?.name === "cua" ? "cua" : "other"));
__out.types = list.map(b => (b?.type === "extension" ? "extension" : "other"));
__out.selectedListed = list.some(b => b?.metadata?.extensionInstanceId === ${js(instanceId)});`);

export const selectInto = (ns, instanceId) => cellCode(`const browser = await cua.getBrowser({extensionInstanceId: ${js(instanceId)}});
${at(ns)} = {browser, browserId: browser.browserId};
__out.selected = typeof browser.browserId === "string";
__out.userApi = typeof browser.user?.openTabs === "function" && typeof browser.user?.claimTab === "function";`);

// Acceptance 3. The user's tab is found by its exact per-run URL (only the runner's own page has it); nothing about any
// other user tab leaves the REPL.
export const findUserTab = (ns, page, waitMs = 20_000) => cellCode(`const m = ${at(ns)};
let matches = [];
for (const deadline = Date.now() + ${waitMs}; ;) {
  matches = (await m.browser.user.openTabs()).filter(t => t?.url === ${js(page.userUrl)});
  if (matches.length || Date.now() > deadline) break;
  await new Promise(r => setTimeout(r, 500));
}
m.userTab = matches[0];
__out.matches = matches.length;
__out.tabId = matches.length ? Number(matches[0].providerTabId ?? matches[0].id) : null;
__out.keys = matches.length ? Object.keys(matches[0]).sort() : [];`);

export const claimUserTab = (ns, page) => cellCode(`const m = ${at(ns)};
if (!m?.userTab) throw new Error("accept: no user tab was found to claim");
const tab = await m.browser.user.claimTab(m.userTab);
m.claimed = tab;
__out.tabId = Number(tab.id);
__out.markerRead = (await tab.playwright.locator("#marker").textContent({timeoutMs: 3000})) === ${js(page.userMarker)};`);

export const userTabOpen = (ns, page) => cellCode(`const m = ${at(ns)};
__out.open = (await m.browser.user.openTabs()).some(t => t?.url === ${js(page.userUrl)});`);

// The runner's own page in the user's tab is closed by the runner once checked: claimed again, then closed.
export const closeUserTab = (ns, page) => cellCode(`const m = ${at(ns)};
const match = (await m.browser.user.openTabs()).find(t => t?.url === ${js(page.userUrl)});
__out.listed = Boolean(match);
if (match) { const tab = await m.browser.user.claimTab(match); await tab.close(); __out.closed = true; }
__out.stillListed = (await m.browser.user.openTabs()).some(t => t?.url === ${js(page.userUrl)});`);

// Acceptance 4. Three tabs on the runner's page; ids are emitted as each is created, so a failure later still leaves
// the runner able to clean up.
export const createMarkedTabs = (ns, page) => cellCode(`const m = ${at(ns)};
m.tabs = {};
__out.ids = {};
__out.gotoMs = [];
for (const role of ["unmarked", "deliverable", "handoff"]) {
  const tab = await cua.createBrowserTab(m.browserId);
  m.tabs[role] = tab;
  __out.ids[role] = Number(tab.id);
  const t0 = Date.now();
  await tab.goto(${js(page.url)});
  __out.gotoMs.push(Date.now() - t0);
}
await m.tabs.deliverable.markDeliverable();
await m.tabs.handoff.markHandoff();
__out.marked = true;`);

export const listAfterTurn = (ns, ids) => cellCode(`const m = ${at(ns)};
${ID_OF}
const agent = (await m.browser.tabs.list()).flatMap(idsOf);
const user = (await m.browser.user.openTabs()).flatMap(idsOf);
const ids = ${js(ids)};
__out.agent = Object.fromEntries(Object.entries(ids).map(([role, id]) => [role, agent.includes(String(id))]));
__out.user = Object.fromEntries(Object.entries(ids).map(([role, id]) => [role, user.includes(String(id))]));`);

// Closes whatever of the three is still open: the handoff tab (owned again this turn) and the deliverable (claimed
// back, then closed); each step on its own, so one failure does not strand the others.
export const closeMarkedTabs = (ns, ids) => cellCode(`const m = ${at(ns)};
${ID_OF}
const ids = ${js(ids)};
const errors = [];
for (const [role, id] of Object.entries(ids)) {
  try {
    if ((await m.browser.tabs.list()).flatMap(idsOf).includes(String(id))) { await (await m.browser.tabs.get(String(id))).close(); continue; }
    const user = (await m.browser.user.openTabs()).find(t => idsOf(t).includes(String(id)));
    if (user) await (await m.browser.user.claimTab(user)).close();
  } catch (e) { errors.push(role + ": " + String(e?.message ?? e).slice(0, 120)); }
}
const open = [...(await m.browser.tabs.list()).flatMap(idsOf), ...(await m.browser.user.openTabs()).flatMap(idsOf)];
__out.leftover = Object.entries(ids).filter(([, id]) => open.includes(String(id))).map(([role]) => role);
if (errors.length) __out.closeErrors = errors;`);

// Acceptances 5 and 6: one tab of the session's own on the runner's page.
export const createOwnTab = (ns, page) => cellCode(`const m = ${at(ns)};
const tab = await cua.createBrowserTab(m.browserId);
m.own = tab;
__out.tabId = Number(tab.id);
const t0 = Date.now();
await tab.goto(${js(page.url)});
__out.gotoMs = Date.now() - t0;
__out.markerRead = (await tab.playwright.locator("#marker").textContent({timeoutMs: 3000})) === ${js(page.documentMarker)};`);

// The session's own listing, and an attempt on the other session's tab through the agent API (whatever the service
// does with it is recorded; the host's refusal is checked directly by the runner).
export const listOwnAndOther = (ns, otherId) => cellCode(`const m = ${at(ns)};
${ID_OF}
const listed = (await m.browser.tabs.list()).flatMap(idsOf);
__out.ownListed = listed.includes(String(m.own?.id));
__out.otherListed = listed.includes(${js(String(otherId))});
try {
  const other = await m.browser.tabs.get(${js(String(otherId))});
  await other.playwright.locator("body").textContent({timeoutMs: 2000});
  __out.otherReachable = true;
} catch (e) { __out.otherError = String(e?.message ?? e).slice(0, 300); }`);

// close() returns when Chrome accepts Target.closeTarget, before the tab leaves Chrome's tab list (H3b live: one of two
// concurrent closes was still listed right after), so the listing is polled for up to 2 s.
export const closeOwnTab = ns => cellCode(`const m = ${at(ns)};
${ID_OF}
if (!m?.own) throw new Error("accept: no own tab");
const id = String(m.own.id);
await m.own.close();
__out.closed = true;
for (let i = 0; i < 10; i++) {
  __out.stillListed = (await m.browser.tabs.list()).flatMap(idsOf).includes(id);
  if (!__out.stillListed) break;
  await new Promise(r => setTimeout(r, 200));
}`);

// Acceptance 6: the open task's next call after Chrome went away. A failure is the expected outcome; its text is
// classified by the runner and the time it took is the point.
export const afterRestart = ns => cellCode(`const m = ${at(ns)};
const t0 = Date.now();
try {
  await m.own.playwright.locator("#marker").textContent({timeoutMs: 3000});
  __out.reached = true;
} catch (e) { __out.failure = String(e?.message ?? e).slice(0, 400); }
__out.ms = Date.now() - t0;`);
