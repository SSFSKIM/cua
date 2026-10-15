// Drives a browser client's setupBrowserRuntime (src/cua-api/browser-client.mjs, BrowserClientRuntime) at its seam, the
// trusted `nodeRepl` the kernel gives a cell: `rpc("browser", {method, params})`, `emitImage` and `env`. A scenario's
// double answers the service's side; the run records everything that crosses the seam (each request as JSON would
// carry it, every displayed value and emitted image) and the scenario's own outcome, so the same scenario can be run
// against another client and the records compared.
import {API_MANIFEST} from '../../src/browser-service/api-manifest.mjs';

export const BROWSER = Object.freeze({id: 'b1', name: 'Chrome', type: 'extension', capabilities: {browser: [], tab: []}});

// `overrides` maps a command type to its result (or a function of the command's params); the rest answer as a plain
// browser would: get_browser the scenario's browser, get_tab/create_tab a tab, anything else {}.
export function browserDouble(overrides = {}, browser = BROWSER) {
  return params => {
    const custom = overrides[params.type];
    if (custom !== undefined) return typeof custom === 'function' ? custom(params) : custom;
    switch (params.type) {
      case 'get_browser': return {...browser, id: params.id};
      case 'get_tab': return {id: params.tab_id, title: 'Title', url: 'https://example.test/'};
      case 'create_tab': return {id: 't1'};
      default: return {};
    }
  };
}

// A value as a comparison can hold it: bytes as their numbers, functions and API objects by kind.
function plain(value, seen = new Set()) {
  if (value instanceof Uint8Array) return {uint8: Array.from(value)};
  if (typeof value === 'function') return '[function]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[cycle]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => plain(item, seen));
  return Object.fromEntries(Object.keys(value).map(key => [key, plain(value[key], seen)]));
}

// Runs `scenario` against `setupBrowserRuntime` -> {requests, displayed, images, decorated, result?, error?}.
// scenario: {setup (added to the service's setup answer), options (setupBrowserRuntime's), env (nodeRepl.env),
// noRpc (no trusted rpc), browser, handle (browserDouble overrides, or a function of (params, method)), makeHandle (a
// stateful handle made afresh for each run), run(agent, ctx)}.
export async function runScenario(setupBrowserRuntime, scenario) {
  const record = {requests: [], displayed: [], images: [], decorated: 0};
  const handle = scenario.makeHandle ? scenario.makeHandle() : typeof scenario.handle === 'function' ? scenario.handle : browserDouble(scenario.handle, scenario.browser);
  const nodeRepl = {
    env: scenario.env ?? {},
    emitImage: async bytes => { record.images.push(Array.from(bytes)); },
    rpc: scenario.noRpc ? undefined : async (service, request) => {
      record.requests.push(JSON.parse(JSON.stringify({service, ...request})));
      if (request.method === 'setup') return {apiManifest: API_MANIFEST, disabledMemberIds: [], ...scenario.setup};
      const answer = await handle(request.params, request.method);
      return answer === undefined ? undefined : structuredClone(answer);
    },
  };
  const saved = {nodeRepl: globalThis.nodeRepl, log: console.log};
  globalThis.nodeRepl = nodeRepl;
  console.log = value => { record.displayed.push(plain(value)); };
  const decorated = [];
  const options = {...scenario.options, decorateTab: tab => { record.decorated++; decorated.push(tab); }};
  if (scenario.options?.decorateTab === null) delete options.decorateTab;
  try {
    const agent = await setupBrowserRuntime(options);
    const ctx = {
      decorated,
      browser: (id = 'b1') => agent.browsers.get(id),
      tab: async (id = 't1', browserId = 'b1') => (await agent.browsers.get(browserId)).tabs.get(id),
    };
    record.result = plain(await scenario.run(agent, ctx));
  } catch (error) {
    record.error = {name: error?.name, message: error?.message};
  } finally {
    globalThis.nodeRepl = saved.nodeRepl;
    console.log = saved.log;
  }
  return record;
}

// The requests after setup, as the service received them.
export const commands = record => record.requests.filter(r => r.method !== 'setup').map(r => r.params);
