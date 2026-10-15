// Drives the cua facade's modules (src/cua-api: the tab and platform binders, inventory, the browser facade, the
// bootstrap emitter, documentation and the Linux accessibility tree) at their seams with doubles: the `nodeRepl` the
// kernel gives a cell (write with its item name, emitImage, requestMeta, env), a Sky service object, browser and tab
// objects as the browser client hands them out. A run records everything that crosses those seams, in order, and the
// scenario's own outcome, so the same scenario can run against the vendor's readable facade and the records be compared
// (./facade-vendor.test.mjs).
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function ownFacade() {
  const load = name => import(new URL(`../../src/cua-api/${name}.mjs`, import.meta.url));
  const [tab, mac, linux, state, api, emitter, docs, tree] = await Promise.all(['bind-tab', 'bind-mac-app', 'bind-linux-app', 'get-state', 'browser-api',
    'bootstrap-emitter', 'documentation', 'linux-accessibility-tree'].map(load));
  return {
    bind_tab: tab.bind_tab, bind_mac_app: mac.bind_mac_app, bind_linux_app: linux.bind_linux_app, get_state: state.get_state, get_apps: state.get_apps,
    create_browser_api: api.create_browser_api, setup_browser: api.setup_browser, parse_tab_mention: api.parse_tab_mention,
    create_bootstrap_emitter: emitter.create_bootstrap_emitter, create_documentation: docs.create_documentation, accessibility_tree: tree.accessibility_tree,
  };
}

// `root`: the readable build's cua_node/@oai/cua directory.
export async function vendorFacade(root) {
  const load = path => import(pathToFileURL(join(root, path)).href);
  const alt = name => load(`dist/lib/js/oai_js_cua/src/tinysky_alt/${name}.js`);
  const [tab, mac, linux, state, apps, api, mention, setup, emitter, docs, tree] = await Promise.all([alt('bind_tab'), alt('bind_mac_app'), alt('bind_linux_app'),
    load('dist/lib/js/oai_js_cua/src/get_state.js'), load('dist/lib/js/oai_js_cua/src/get_apps.js'), alt('create_browser_api'), alt('tab_reference'), alt('setup_browser'),
    alt('create_bootstrap_emitter'), alt('create_documentation'), load('dist/project/cua/sky_js/src/targets/linux/accessibility_tree.js')]);
  return {
    bind_tab: tab.bind_tab, bind_mac_app: mac.bind_mac_app, bind_linux_app: linux.bind_linux_app, get_state: state.get_state, get_apps: apps.get_apps,
    create_browser_api: api.create_browser_api, setup_browser: setup.setup_browser, parse_tab_mention: mention.parse_tab_mention,
    create_bootstrap_emitter: emitter.create_bootstrap_emitter, create_documentation: docs.create_documentation, accessibility_tree: tree.accessibility_tree,
  };
}

// A value as a comparison can hold it: bytes as their numbers, functions by kind, errors by name and message.
export function plain(value, seen = new Set()) {
  if (value instanceof Uint8Array) return {uint8: Array.from(value)};
  if (typeof value === 'function') return '[function]';
  if (value instanceof Error) return {error: value.name, message: value.message};
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[cycle]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => plain(item, seen));
  return Object.fromEntries(Object.keys(value).map(key => [key, plain(value[key], seen)]));
}

// Runs `scenario` against `facade` -> {log, result?, error?}. `log` holds, in order, every write ({write, text}),
// image ({image}), console.error ({logged}) and double call ({call, ...}). scenario: {requestMeta, noWrite, run(facade,
// ctx)}; ctx: {log(entry), meta(value) (sets nodeRepl.requestMeta), settle(fn) (how fn ends: sync throw, rejection or
// value)}.
export async function runScenario(facade, scenario) {
  const log = [];
  const nodeRepl = {
    requestMeta: scenario.requestMeta ?? null,
    env: scenario.env ?? {},
    emitImage: async bytes => { log.push({image: Array.from(bytes)}); },
  };
  if (!scenario.noWrite) nodeRepl.write = (text, name) => { log.push({write: name ?? null, text: String(text)}); };
  const saved = {nodeRepl: globalThis.nodeRepl, error: console.error};
  globalThis.nodeRepl = nodeRepl;
  console.error = value => { log.push({logged: plain(value)}); };
  const record = {log};
  const ctx = {
    log: entry => log.push(plain(entry)),
    meta: value => { nodeRepl.requestMeta = value; },
    async settle(fn) {
      let pending;
      try { pending = fn(); } catch (error) { return {sync: plain(error)}; }
      try { return {value: plain(await pending)}; } catch (error) { return {rejected: plain(error)}; }
    },
  };
  try {
    record.result = plain(await scenario.run(facade, ctx));
  } catch (error) {
    record.error = plain(error);
  } finally {
    globalThis.nodeRepl = saved.nodeRepl;
    console.error = saved.error;
  }
  return record;
}

// A Sky service double: each call is logged as {call: method, args} and answered by `answers[method]` (a value or a
// function of the request), else undefined.
export function skyDouble(ctx, target, answers = {}) {
  return new Proxy({target}, {
    get(base, method) {
      if (method in base) return base[method];
      if (typeof method !== 'string' || method === 'then') return undefined;
      return async (...args) => {
        ctx.log({call: `sky.${method}`, args});
        const answer = answers[method];
        return typeof answer === 'function' ? answer(...args) : structuredClone(answer);
      };
    },
  });
}

// A browser-client tab double: an AX tab (`ax` answering get by mode), a DOM-only tab (playwright.domSnapshot and
// screenshot) or a bare one; every call is logged.
export function tabDouble(ctx, {id = 't1', kind = 'ax', state = 'STATE', shot = [1, 2, 3], both, extra = {}} = {}) {
  const tab = {id, ...extra};
  if (kind === 'ax') {
    tab.ax = {};
    tab.ax.get = async (mode, options) => {
      ctx.log({call: `${id}.ax.get`, args: options === undefined ? [mode] : [mode, options]});
      if (mode === 'screenshot') return Uint8Array.from(shot);
      if (mode === 'both') return both ?? {state, screenshot: Uint8Array.from(shot)};
      return state;
    };
    for (const method of ['click', 'drag', 'paste', 'performSecondaryAction', 'pressKey', 'scroll', 'selectText', 'setValue', 'typeText'])
      tab.ax[method] = async (...args) => { ctx.log({call: `${id}.ax.${method}`, args}); };
  } else if (kind === 'dom') {
    tab.playwright = {domSnapshot: async () => { ctx.log({call: `${id}.domSnapshot`}); return `DOM ${id}`; }};
    tab.screenshot = async () => { ctx.log({call: `${id}.screenshot`}); return Uint8Array.from(shot); };
  }
  return tab;
}
