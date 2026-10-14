// Ported from readable chatgpt-26.928.40906 BS:77562-77606 (X2: setup, execute and executeWithRecovery, and the handleRpc export); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: VN, the runtime a setup makes and its command dispatch across zN and Rf (BS:66074-66548); _C, oj and Li, the
// extension-UI sentence (BS:18308-18340).
//
// cua's browser service, registered in node_repl's trusted worker in place of the vendor's @oai/browser-desktop service
// (src/services/browser.mjs selects it with CUA_BROWSER_SERVICE=cua). The REPL contract, exactly as the spec's "The REPL
// contract, exactly" states it:
//   setup {environment, undocumentedApiMembers?, excludedDocumentation?} -> {apiManifest, disabledMemberIds}, with no
//     credentialRecoveryErrorVersion, so the unchanged REPL client uses `execute`;
//   execute {type, ...payload} -> the command's result, or a rejection;
//   executeWithRecovery -> {ok: true, value}, or the same rejection as execute; never {ok: false}.
// Ordinary failures reject with the vendor's sentence; a failure that has a code in the kept vocabulary (errors.mjs) is a
// BrowserServiceError carrying it. Only the message crosses node_repl's trusted RPC boundary to the REPL client.
//
// A setup makes a fresh runtime and disposes the previous one (its backend connections close, its turn-ended hook is
// removed). Commands dispatch through COMMAND_HANDLERS, the map from wire type to the function execute runs (the
// inventory's handler gate reads it): the selection and documentation commands with the runtime, every other command
// with the BrowserSession of the backend its browser_id names. A type without a handler rejects unsupported_command.
// Dropped from VN: telemetry, Sentry, the identity fetch, site status and the security wrapper, the credential
// recovery and observation machinery, the response-meta and notification hooks (WebMCP's arrive with M3), and the
// executeUnhandledCommand fallback for any command without a handler (viewport.mjs registers the backend's
// capability commands by name).
import {ACTION_HANDLERS} from './actions.mjs';
import {BrowserContext, SELECTION_HANDLERS} from './browsers.mjs';
import {CHOOSER_HANDLERS} from './chooser.mjs';
import {CLIPBOARD_HANDLERS} from './clipboard.mjs';
import {DEVLOG_HANDLERS} from './devlogs.mjs';
import {DIALOG_HANDLERS} from './dialogs.mjs';
import {DOCUMENTATION_HANDLERS, Documentation, documentationAddendum} from './docs.mjs';
import {DOWNLOAD_HANDLERS} from './downloads.mjs';
import {serviceError} from './errors.mjs';
import {EVALUATE_HANDLERS} from './evaluate.mjs';
import {INPUT_HANDLERS} from './input.mjs';
import {API_MANIFEST, browserCapabilities, disabledMemberIds} from './manifest.mjs';
import {NAVIGATION_HANDLERS} from './navigation.mjs';
import {RAW_CDP_HANDLERS} from './rawcdp.mjs';
import {READ_HANDLERS} from './reads.mjs';
import {SCREENSHOT_HANDLERS} from './screenshot.mjs';
import {BrowserSession} from './session.mjs';
import {AX_HANDLERS, SNAPSHOT_HANDLERS} from './snapshot.mjs';
import {TAB_HANDLERS} from './tabs.mjs';
import {VIEWPORT_HANDLERS} from './viewport.mjs';
import {VISIBLE_DOM_HANDLERS} from './visible-dom.mjs';
import {WAIT_HANDLERS} from './waits.mjs';

export const SERVICE_VERSION = '0.1.0';            // also the content of src/browser-service/VERSION

const ENVIRONMENTS = ['codex-app', 'training', 'cloud', 'orbit'];
// The commands a tab acquired in an earlier turn is not claimed again for (they claim, or read the user's tab, themselves).
const RECLAIM_EXEMPT = new Set(['browser_user_claim_tab', 'browser_user_get_tab_context']);
const FAMILY_NAMES = {chrome: 'Google Chrome', edge: 'Microsoft Edge'};
const FOREIGN_EXTENSION_UI = 'Cannot access a chrome-extension:// URL of different extension';

const messageOf = error => (error instanceof Error ? error.message : typeof error?.message === 'string' ? error.message : String(error ?? ''));

// Chrome refusing the debugger for another extension's UI in the page, in words the person can act on (_C).
function blockedByExtensionUi(error, clientInfo) {
  if (messageOf(error).includes(FOREIGN_EXTENSION_UI)) {
    const name = FAMILY_NAMES[clientInfo?.family ?? 'chrome'] ?? FAMILY_NAMES.chrome;
    return new Error(`${name} is blocking automation because another extension UI is open on this page. Complete or dismiss that extension UI in ${name}, then ask me to continue.`, {cause: error instanceof Error ? error : undefined});
  }
  return error instanceof Error ? error : new Error(messageOf(error));
}

// A command addressed to a browser: its backend's session, the tab claimed again when an earlier turn acquired it
// (extension backends, as the vendor does), then the command.
function browserCommand(type, run) {
  return async (params, runtime) => {
    if (!('browser_id' in params)) throw new Error('Browser ID must be provided');
    const browser = await runtime.context.get(params.browser_id);
    if (runtime.disposed) throw new Error('Browser runtime is disposed');
    const session = runtime.sessionFor(browser);
    try {
      const tabId = Number(params.tab_id);
      const claimsUserTabs = session.clientInfo.apiSupportOverrides?.['Browser.user'] ?? session.clientInfo.type === 'extension';
      if (claimsUserTabs && !RECLAIM_EXEMPT.has(type) && Number.isSafeInteger(tabId) && tabId > 0 && session.tabs.needsReclaim(tabId)) {
        const tab = await session.tabs.claim(tabId);
        session.tabs.recordAcquired(tab.id);
      }
      return await run(params, session);
    } catch (error) {
      throw blockedByExtensionUi(error, session.clientInfo);
    }
  };
}

export const COMMAND_HANDLERS = new Map([
  ...Object.entries(SELECTION_HANDLERS),
  ...Object.entries(DOCUMENTATION_HANDLERS),
  ...Object.entries({...TAB_HANDLERS, ...AX_HANDLERS, ...NAVIGATION_HANDLERS, ...READ_HANDLERS, ...EVALUATE_HANDLERS, ...SNAPSHOT_HANDLERS,
    ...VISIBLE_DOM_HANDLERS, ...ACTION_HANDLERS, ...INPUT_HANDLERS, ...WAIT_HANDLERS, ...SCREENSHOT_HANDLERS, ...DIALOG_HANDLERS,
    ...CHOOSER_HANDLERS, ...DOWNLOAD_HANDLERS, ...CLIPBOARD_HANDLERS, ...DEVLOG_HANDLERS, ...VIEWPORT_HANDLERS, ...RAW_CDP_HANDLERS}).map(([type, run]) => [type, browserCommand(type, run)]),
]);

// What one setup made: the backends, the documentation and a session per backend connection.
class ServiceRuntime {
  constructor(runtime, {undocumentedApiMembers, excludedDocumentation}) {
    this.env = runtime.env ?? {};
    this.disabledMemberIds = disabledMemberIds(this.env);
    this.context = new BrowserContext(runtime);
    this.docs = new Documentation({
      apiManifest: API_MANIFEST, disabledMemberIds: this.disabledMemberIds, serviceVersion: SERVICE_VERSION,
      undocumentedApiMembers, excludedDocumentation, addendum: documentationAddendum(this.env),
    });
  }

  env;
  disabledMemberIds;
  context;
  docs;
  sessions = new Map();          // BackendApi -> BrowserSession
  disposed = false;
  disposing;

  sessionFor(browser) {
    let session = this.sessions.get(browser.api);
    if (session == null) {
      session = new BrowserSession(browser.api, browser.id, browser.info, {
        preferredWindowId: this.context.preferredWindowIdFor(browser.info), capabilities: browserCapabilities(this.env, browser.info.capabilities),
      });
      this.sessions.set(browser.api, session);
      browser.api.addCloseListener(() => { this.sessions.delete(browser.api); });
    }
    return session;
  }

  async executeAgentCommand(command) {
    if (this.disposed) throw new Error('Browser runtime is disposed');
    const {type, ...params} = command;
    // A command this service does not serve is refused as such, before asking for documentation it could not use.
    const handler = COMMAND_HANDLERS.get(type);
    if (typeof handler !== 'function') throw serviceError('unsupported_command', type);
    this.docs.assertRequiredDocumentationRead(type);
    return await handler(params, this);
  }

  async dispose() {
    this.disposed = true;
    this.disposing ??= (async () => {
      await Promise.all([...this.sessions.values()].map(session => session.dispose().catch(() => {})));
      await this.context.dispose();
    })();
    await this.disposing;
  }
}

// A service over `runtime`, the trusted worker's nodeRepl (env, requestMeta, nativePipe, addTurnEndedHandler); by
// default the global one, read at each setup.
export function createBrowserService({runtime} = {}) {
  let current = null;            // the promise of the last setup's ServiceRuntime (the vendor's ig)

  const methods = {
    async setup({environment, undocumentedApiMembers, excludedDocumentation} = {}) {
      if (!ENVIRONMENTS.includes(environment)) throw new Error('Invalid browser service environment');
      if (environment !== 'codex-app') throw new Error(`Browser service environment is not supported by the cua browser service: ${environment}`);
      const previous = current;
      current = (async () => {
        await (await previous?.catch(() => null))?.dispose();
        return new ServiceRuntime(runtime ?? globalThis.nodeRepl, {undocumentedApiMembers, excludedDocumentation});
      })();
      const made = await current;
      return {apiManifest: API_MANIFEST, disabledMemberIds: [...made.disabledMemberIds]};
    },
    async execute(command) {
      if (current == null) throw new Error('Browser runtime has not been initialized');
      return await (await current).executeAgentCommand(command);
    },
    async executeWithRecovery(command) {
      return {ok: true, value: await methods.execute(command)};
    },
  };

  return {
    async handleRpc(request) {
      const method = Object.getOwnPropertyDescriptor(methods, request?.method)?.value;
      if (typeof method !== 'function') throw new Error('Unsupported browser service request');
      return await method(request.params);
    },
    async dispose() {
      const last = current;
      current = null;
      await (await last?.catch(() => null))?.dispose();
    },
  };
}

const service = createBrowserService();

export async function handleRpc(request) {
  return await service.handleRpc(request);
}
