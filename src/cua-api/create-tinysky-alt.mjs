// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_tinysky_alt.js:14-165
// (the cua facade object for the enabled surfaces), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3,
// CuaBootstrap; Table 1's cua members). #120's clean-room rewrite replaces this port before distribution.
//
// create_tinysky_alt({browser, computer} = {}) -> the `cua` object; a surface is on unless its option is false. It sets
// the browser client up (./browser-client.mjs through ./browser-api.mjs; global `agent` is that client's agent) and
// imports the Sky facade (./sky.mjs) concurrently, then emits the core document (./bootstrap-emitter.mjs) before
// returning. Its members: getState and rewriteDocumentation always; the browser members with the browser surface; with
// the computer surface `computer`, listApps and, by Sky's target, getApp (macOS: an app name, path or bundle id; Linux:
// {windowId} of an open window, never launching) and on Linux listWindows. getApp emits the app's full initial state
// before returning the App. Dropped, per the spec's Table 2: the Windows target (an unknown target is an
// UnreachableCaseError, as the vendor's default branch).
import {bind_linux_app} from './bind-linux-app.mjs';
import {bind_mac_app} from './bind-mac-app.mjs';
import {create_bootstrap_emitter} from './bootstrap-emitter.mjs';
import {create_browser_api, setup_browser} from './browser-api.mjs';
import {create_documentation, read_documentation} from './documentation.mjs';
import {get_apps, get_state, UnreachableCaseError} from './get-state.mjs';

export async function create_tinysky_alt(options = {}) {
  const documentation = create_documentation(read_documentation);
  const [agent, computer] = await Promise.all([
    setupBrowser({browser: options.browser, exclude_browser_confirmations: documentation.exclude_browser_confirmations}),
    loadComputer(options),
  ]);
  const emitter = create_bootstrap_emitter(documentation);
  await emitter.emit();
  const cua = {
    rewriteDocumentation: emitter.rewrite_documentation,
    async getState(observation) {
      const state = await get_state({browsers: agent == null ? undefined : agent.browsers, computer});
      await emitter.emit(state, observation);
      return state;
    },
  };
  if (agent !== undefined) {
    Reflect.set(globalThis, 'agent', agent);
    Object.assign(cua, create_browser_api(agent.browsers, emitter));
  }
  if (computer !== undefined) {
    Object.assign(cua, {
      computer,
      async listApps(observation) {
        const apps = await get_apps(computer);
        await emitter.emit(apps, observation);
        return apps;
      },
    });
    const target = computer.target;
    const platform = (() => {
      switch (target) {
        case 'mac':
          return {
            async getApp(app) {
              if (typeof app != 'string') throw new Error('macOS getApp requires an app name, path, or bundle ID.');
              const appState = await computer.get_app_state({app, disableDiff: true});
              const bound = bind_mac_app(computer, appState.app);
              await emitter.emit(appState.text);
              return bound;
            },
          };
        case 'linux':
          return {
            async getApp(reference) {
              const windowId = requireWindowId(reference, 'linux');
              const window = (await computer.list_windows()).find(candidate => candidate.id === windowId);
              if (window === undefined) throw new Error(`Window ${windowId} is unavailable.`);
              const bound = bind_linux_app(computer, window);
              const state = await bound.getAXState({disableDiffing: true, emit: false});
              await emitter.emit(state);
              return bound;
            },
            async listWindows(observation) {
              const windows = await computer.list_windows();
              await emitter.emit(windows, observation);
              return windows;
            },
          };
        default:
          throw new UnreachableCaseError(target);
      }
    })();
    Object.assign(cua, platform);
  }
  return cua;
}

function requireWindowId(reference, platform) {
  if (typeof reference != 'object' || reference === null || !Number.isSafeInteger(reference.windowId) || reference.windowId <= 0)
    throw new Error(`${platform} getApp requires { windowId } from listApps() or listWindows().`);
  return reference.windowId;
}

async function setupBrowser({browser, exclude_browser_confirmations}) {
  if (browser === false) return;
  const {setupBrowserRuntime} = await import('./browser-client.mjs');
  return setup_browser({setupBrowserRuntime, exclude_browser_confirmations});
}

async function loadComputer(options) {
  if (options.computer === false) return;
  const {sky} = await import('./sky.mjs');
  return sky;
}
