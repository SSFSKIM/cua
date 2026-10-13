// Ported from readable chatgpt-26.928.40906 BS:65275-65286 (PN, the API members a backend type does not support); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Wu, ju, fC, hC and zg (BS:11025-11100, the disabled members and the capability list under the
// BROWSER_USE_DISABLE_* variables); the capability descriptions of Dp and Sp (BS:35453-35759: tI, iI, cI, Dk, Ek, jk,
// Yk, Cy).
//
// The API manifest and what of it a selected browser gets. The manifest itself is data (api-manifest.mjs, the vendor's
// codex-app manifest); setup answers it with the members the launch disabled (BROWSER_USE_DISABLE_API_MEMBERS, none
// under cua serve). A browser's capabilities are the ones its backend announced in getInfo, less those the launch
// disabled. Dropped from the vendor's discovery-time rewrites (Tte, xte, _te): the AX tree (Tab.ax through the
// accessibility WebAssembly, not ported), full CDP access granted by Codex config (M2 serves tab_cdp_* only for a
// backend that announces `cdp`) and WebMCP gated by Codex config (M3). None of them changes cua's host's announcement.
export {API_MANIFEST} from './api-manifest.mjs';

// What the first-use documentation says of each capability a browser may announce (the vendor's capability infos).
export const CAPABILITY_INFO = Object.freeze({
  browser: [
    {id: 'management', description: 'Organize windows, tabs, tab groups, and bookmarks. Use only for user-requested browser organization.'},
    {id: 'visibility', description: 'Use to show or hide the browser to the user, and to determine the browser\'s current visibility. Keep browser work in the background unless the user asks to see it or live viewing is useful. When the browser should be visible, call set(true).'},
    {id: 'viewport', description: 'Controls an explicit browser viewport override for responsive or device-size testing. Use it when a task calls for specific dimensions or breakpoint validation; otherwise leave it unset so the browser uses its normal viewport. Reset temporary overrides before finishing unless the user asked to keep them.'},
  ],
  tab: [
    {id: 'cdp', description: 'Send raw Chrome DevTools Protocol commands and read debugger events through a supported tab for developer use cases.'},
    {id: 'botDetection', description: 'Use when the current tab is blocked by bot detection, a failed CAPTCHA, a hard access denial, or a repeated challenge/login loop.'},
    {id: 'browserAuth', description: 'MUST read its documentation before the first interaction with any authentication or sign-in flow required for the task. Covers method selection, secure user-provided credentials, and post-authentication verification and recovery.'},
    {id: 'pageAssets', description: 'List assets already observed in the current page state and bundle selected assets into a temporary local artifact.'},
    {id: 'webmcp', description: 'Fetch page-defined WebMCP tools bound to the current document, then call them through the returned object.'},
  ],
});

// A comma-separated list in the environment, trimmed, empties dropped (zg over Ja).
const listIn = (env, name) => (typeof env?.[name] === 'string' ? env[name] : '').split(',').map(s => s.trim()).filter(Boolean);

// The member ids ("Interface.member") the launch disabled (Wu).
export function disabledMemberIds(env) {
  return new Set(listIn(env, 'BROWSER_USE_DISABLE_API_MEMBERS'));
}

// The member ids the browser does not get: the disabled ones, and every member its backend type does not support by
// default unless the backend's apiSupportOverrides grant it (PN).
export function unsupportedMembers({apiManifest, browserInfo, disabledMemberIds: disabled}) {
  const out = new Set(disabled);
  for (const [iface, members] of Object.entries(apiManifest.interfaces)) {
    for (const [member, definition] of Object.entries(members)) {
      const id = `${iface}.${member}`;
      if (!(browserInfo.apiSupportOverrides?.[id] ?? definition.unsupportedByDefaultIn?.includes(browserInfo.type) !== true)) out.add(id);
    }
  }
  return out;
}

// The capabilities a browser's backend announced, less those BROWSER_USE_DISABLE_BROWSER_CAPABILITIES and
// BROWSER_USE_DISABLE_TAB_CAPABILITIES name (ju, fC, hC).
export function browserCapabilities(env, capabilities) {
  const without = (list, name) => {
    const disabled = new Set(listIn(env, name));
    return disabled.size === 0 ? list : list.filter(c => !disabled.has(c.id));
  };
  return {
    browser: without(capabilities?.browser ?? [], 'BROWSER_USE_DISABLE_BROWSER_CAPABILITIES'),
    tab: without(capabilities?.tab ?? [], 'BROWSER_USE_DISABLE_TAB_CAPABILITIES'),
  };
}
