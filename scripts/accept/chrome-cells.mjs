// The fixed agent script of the Chrome acceptance (C2): the JavaScript cells scripts/accept-chrome.mjs sends to
// `cua serve`'s js tool. Each cell reduces what it sees inside the REPL to a whitelist (booleans, counts, the page's
// digest text) and writes one marker line (cellCode, shared with the M9/M10 probe). The cells act only on the tab
// they create; ownership is verified by the page's document marker read through a Playwright locator, never through
// an AX snapshot (after the fill a snapshot could describe the field). The secret is named only by its reference.
import {cellCode} from '../probe/chrome/original/cells.mjs';
import {INPUT_LABEL, BUTTON_LABEL, DIGEST_HEX} from './chrome-page.mjs';

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
await m.tab.goto(${js(page.url)});
m.verified = (${markerText}) === ${js(page.documentMarker)};
__out.markerFound = m.verified;`);

export const fillReference = (page, reference) => cellCode(`${owned(page)}
const field = m.tab.playwright.getByLabel(${js(INPUT_LABEL)}, {exact: true});
if ((await field.count()) !== 1) throw new Error("accept: the password label does not resolve to exactly one element");
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
