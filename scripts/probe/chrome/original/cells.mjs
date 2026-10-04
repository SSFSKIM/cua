// The JavaScript cells the probe sends to the vendor runtime's `js` tool. Each cell reduces what it sees inside the
// REPL to a whitelist (types, booleans, counts, index numbers, format shapes) and writes one marker line; vendor
// error text leaves only to be classified and sanitized by the caller. Tab titles and URLs, profile names, instance
// ids and the page markers never leave the REPL. Tab ids stay in REPL globals, used only to compare and to confirm.
//
// M9 cells: listBrowsers, listTabs(i). M10 (--with-tabs) cells act only on the tab the probe created, and every
// input/observation cell first re-reads that tab and requires the probe page's document marker.
export const RESULT_MARKER = 'PROBERESULT';

// Vendor error text can quote user data (a tab title, a URL, a profile name). Every value the listing cells saw is
// kept in a REPL-only scrub list and replaced in error text before it leaves the REPL; the caller then removes URLs,
// paths, hosts and token-like runs (classify.mjs).
export const cellCode = body => `const __out = {};
try { ${body} } catch (e) {
  let __msg = String(e?.message ?? e);
  for (const __s of globalThis.__probeScrub ?? []) if (typeof __s === "string" && __s.length >= 3) __msg = __msg.split(__s).join("<user-data>");
  __out.error = __msg.slice(0, 600);
}
nodeRepl.write(${JSON.stringify(RESULT_MARKER + ' ')} + JSON.stringify(__out));`;

const js = value => JSON.stringify(value);

// The normalized BrowserInfo is reduced in the REPL: no name, profile name, instance or session id leaves it.
export const LIST_BROWSERS = cellCode(`const list = await cua.listBrowsers({emit: false});
globalThis.__m9ids = list.map(b => String(b.id));
(globalThis.__probeScrub ??= []).push(...list.map(b => b.profileName).filter(Boolean));
__out.browsers = list.map(b => ({
  idShape: /^[0-9]{1,6}$/.test(String(b.id)) ? "numeric" : "other",
  type: ["extension", "cdp", "iab", "mcpapps"].includes(b.type) ? b.type : "other",
  family: typeof b.family === "string" && /^[a-z]{1,20}$/.test(b.family) ? b.family : (b.family == null ? null : "other"),
  nameIsGenericChrome: typeof b.name === "string" && /^(google )?chrome$/i.test(b.name.trim()),
  nameVersions: typeof b.name === "string" ? [...new Set(b.name.match(/\\b\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?\\b/g) ?? [])] : [],
  profileNamePresent: typeof b.profileName === "string" && b.profileName.length > 0,
  extensionInstanceIdPresent: typeof b.metadata?.extensionInstanceId === "string",
  codexSessionIdPresent: typeof b.metadata?.codexSessionId === "string",
  keys: Object.keys(b).sort(),
}));`);

// A count only. The provider tab ids stay in the REPL so compareProfiles can tell one profile from several.
export const listTabs = index => cellCode(`const id = globalThis.__m9ids?.[${index}];
if (id === undefined) throw new Error("probe: no listed browser at index ${index}");
const tabs = await cua.listTabs({browser: id, emit: false});
__out.count = Array.isArray(tabs) ? tabs.length : null;
if (Array.isArray(tabs)) (globalThis.__probeScrub ??= []).push(...tabs.flatMap(t => [t.title, t.url]).filter(Boolean));
(globalThis.__m10tabIds ??= [])[${index}] = Array.isArray(tabs) ? tabs.map(t => String(t.providerTabId ?? t.id)).sort() : null;`);

// True only when every listed browser lists the same non-empty set of tabs: several connections to one profile.
export const COMPARE_PROFILES = cellCode(`const sets = (globalThis.__m10tabIds ?? []).map(ids => Array.isArray(ids) ? ids.join("\\n") : null);
__out.sameProfile = sets.length > 1 && sets[0] !== null && sets[0].length > 0 && sets.every(s => s === sets[0]);`);

// In-cell helpers, injected as source: they must not reference anything outside themselves.
// The element index on the first line naming `label`: a leading number ("12 ...", "[7] ...", "3: ..."), a bracketed
// one ("... [5]") or a ref ("[ref=e31]"); null when that line carries none.
export function findIndex(ax, label) {
  for (const line of String(ax).split('\n')) {
    if (!line.includes(label)) continue;
    const m = line.match(/^\s*\[?(\d+)\]?[\s:.)\]]/) ?? line.match(/\[(\d+)\]/) ?? line.match(/\bref=e?(\d+)\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}
// The format of our own label's line (label, URLs and digits replaced), so the report can show the AX line format.
export function lineShape(ax, label) {
  const line = String(ax).split('\n').find(l => l.includes(label));
  if (line === undefined) return null;
  return line.split(label).join('<label>').replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>').replace(/\d+/g, 'N').trim().slice(0, 80);
}

export const createTab = index => cellCode(`const id = globalThis.__m9ids?.[${index}];
if (id === undefined) throw new Error("probe: no listed browser at index ${index}");
const tab = await cua.createBrowserTab(id);
globalThis.__m10 = {tab, tabId: String(tab.id), browserId: id, verified: false};
__out.created = true;
__out.methods = Object.fromEntries(["goto", "close", "getAXState", "typeText", "click", "getScreenshot"].map(m => [m, typeof tab[m] === "function"]));`);

const created = `const m = globalThis.__m10;
if (!m) throw new Error("probe: no created tab");`;

// Before any input or observation: the created tab must still show the probe page's document marker.
const owned = page => `${created}
if (!m.verified) throw new Error("probe: the owned page was never verified; nothing sent");
const __ax = await m.tab.getAXState({emit: false, disableDiffing: true});
if (!__ax.includes(${js(page.documentMarker)})) throw new Error("probe: the owned page marker is gone; nothing sent");`;

export const gotoOwnedPage = (page, labels) => cellCode(`${created}
${findIndex.toString()}
${lineShape.toString()}
await m.tab.goto(${js(page.url)});
const ax = await m.tab.getAXState({emit: false, disableDiffing: true});
m.verified = ax.includes(${js(page.documentMarker)});
__out.markerFound = m.verified;
__out.axInput = m.tab.ax !== undefined;
__out.playwrightLocators = typeof m.tab.playwright?.getByLabel === "function" && typeof m.tab.playwright?.getByRole === "function";
__out.originShown = ax.includes(${js(page.origin)});
m.inputIndex = findIndex(ax, ${js(labels.input)});
m.buttonIndex = findIndex(ax, ${js(labels.button)});
__out.inputIndex = m.inputIndex;
__out.buttonIndex = m.buttonIndex;
__out.lineShapes = {input: lineShape(ax, ${js(labels.input)}), button: lineShape(ax, ${js(labels.button)})};`);

// Input through the vendor's documented Playwright locators (BS:833-1225): tabs the original extension creates have
// no `tab.ax`, so the native typeText/click wrappers refuse before input (bind_tab.js) and getAXState is a DOM
// snapshot without element indices. Each locator must resolve to exactly one element of the probe page.
export const fillInput = (page, labels) => cellCode(`${owned(page)}
const field = m.tab.playwright.getByLabel(${js(labels.input)}, {exact: true});
if (typeof field.count === "function" && (await field.count()) !== 1) throw new Error("probe: the input label does not resolve to exactly one element");
await field.fill(${js(page.typedMarker)}, {timeoutMs: 10000});
__out.filled = true;`);

export const clickAndVerify = (page, labels, expected) => cellCode(`${owned(page)}
const button = m.tab.playwright.getByRole("button", {exact: true, name: ${js(labels.button)}});
if (typeof button.count === "function" && (await button.count()) !== 1) throw new Error("probe: the button does not resolve to exactly one element");
await button.click({});
const after = await m.tab.getAXState({emit: false, disableDiffing: true});
__out.domChanged = after.includes(${js(expected)});
__out.statusText = (await m.tab.playwright.locator("#out").textContent({timeoutMs: 5000})) === ${js(expected)};`);

export const screenshot = page => cellCode(`${owned(page)}
const shot = await m.tab.getScreenshot({emit: false});
__out.bytes = shot?.byteLength ?? null;
nodeRepl.emitImage(shot);`);

// Only the exact tab this run created, by the id createBrowserTab returned.
export const CLOSE_CREATED_TAB = cellCode(`${created}
if (String(m.tab.id) !== m.tabId) throw new Error("probe: the tab handle changed; not closing");
if (typeof m.tab.close !== "function") throw new Error("probe: close() is not available for this tab");
await m.tab.close();
__out.closed = true;`);

export const CONFIRM_CLOSED = cellCode(`${created}
const tabs = await cua.listTabs({browser: m.browserId, emit: false});
__out.stillListed = tabs.some(t => String(t.id) === m.tabId);
__out.count = tabs.length;`);
