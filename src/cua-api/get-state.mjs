// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/get_state.js:5-45,
// get_apps.js:4-27, get_browsers.js:4-40 and get_browser_tabs.js:3-23 (the facade's app and browser inventory), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap; Table 1 cua.getState, cua.listApps,
// cua.listTabs). #120's clean-room rewrite replaces this port before distribution.
//
// get_state settles both inventories independently: a failed one contributes nothing and its reason joins `errors`,
// which is omitted when empty; one browser's failure leaves it listed with no tabs and an error naming it. A browser's
// tabs are its user's open tabs (an inventory failure is logged and counts as none), then its managed tabs, by id.
// Dropped, per the spec's Table 2: the Windows inventory branch.

// The vendor's oai_js_core UnreachableCaseError (src/UnreachableCaseError.js:2-7): an unknown computer target.
export class UnreachableCaseError extends Error {
  constructor(value) {
    super(value);
    this.name = 'UnreachableCaseError';
  }
}

export async function get_apps(computer) {
  const target = computer.target;
  switch (target) {
    case 'mac':
      return computer.list_apps();
    case 'linux':
      return (await computer.list_apps()).map(app => {
        const {id, name, windows} = app;
        return {id, displayName: name, isRunning: windows.length > 0, windows};
      });
    default:
      throw new UnreachableCaseError(target);
  }
}

export async function get_browser_tabs(browser) {
  let userTabs = Promise.resolve([]);
  if (browser.user?.openTabs) {
    userTabs = browser.user.openTabs().catch(error => {
      console.error(error);
      return [];
    });
  }
  const managedTabs = browser.tabs.list();
  const [user, managed] = await Promise.all([userTabs, managedTabs]);
  const byId = new Map();
  for (const tab of user) byId.set(tab.id, tab);
  for (const tab of managed) byId.set(tab.id, tab);
  return Array.from(byId.values());
}

export async function get_browsers(browsers) {
  const settled = await Promise.all((await browsers.list()).map(async info => {
    try {
      const browser = await browsers.get(info.id);
      const tabs = await get_browser_tabs(browser);
      return {browser: Object.assign(Object.assign({}, info), {tabs}), error: undefined};
    } catch (error) {
      return {browser: Object.assign(Object.assign({}, info), {tabs: []}), error: `Browser ${info.id}: ${String(error)}`};
    }
  }));
  const errors = [];
  for (const entry of settled) if (entry.error !== undefined) errors.push(entry.error);
  return {browsers: settled.map(entry => entry.browser), errors};
}

export async function get_state({computer, browsers}) {
  let apps = Promise.resolve([]);
  if (computer) apps = get_apps(computer);
  let browserInventory = Promise.resolve({browsers: [], errors: []});
  if (browsers !== undefined) browserInventory = get_browsers(browsers);
  const [appsSettled, browsersSettled] = await Promise.allSettled([apps, browserInventory]);
  const errors = [];
  for (const [label, settled] of Object.entries({'Native apps': appsSettled, Browsers: browsersSettled})) {
    if (settled.status === 'rejected') errors.push(`${label}: ${String(settled.reason)}`);
  }
  const appList = appsSettled.status === 'fulfilled' ? appsSettled.value : [];
  const browserList = browsersSettled.status === 'fulfilled' ? browsersSettled.value.browsers : [];
  if (browsersSettled.status === 'fulfilled') errors.push(...browsersSettled.value.errors);
  return Object.assign({apps: appList, browsers: browserList}, errors.length > 0 ? {errors} : {});
}
