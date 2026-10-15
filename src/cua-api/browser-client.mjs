// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js:1-517,4678-10313
// (the vendor's browser client: its command classes and schemas, the agent/browser/tab API objects, the
// FunctionAgentTransport, the manifest-aware runtime view and setupBrowserRuntime), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, interface BrowserClientRuntime; Design "Owned facade
// and first-call documentation"). #120's clean-room rewrite replaces this port before distribution.
//
// setupBrowserRuntime({environment, undocumentedApiMembers, excludedDocumentation, decorateTab} = {}) -> Promise<Agent>
// asks the trusted browser service (`nodeRepl.rpc("browser", {method: "setup", params})`) for its API manifest and
// disabled members, then returns the agent: every API object it hands out, the agent's included, is a view that hides
// the members a browser does not support (from get, `in`, Object.keys and property descriptors), wraps what methods
// return and unwraps API objects passed back in, and gives every Tab view to `decorateTab`. Commands cross as
// `nodeRepl.rpc("browser", {method: "execute", params: command.toJSON() + client_timeout_ms})`, or `executeWithRecovery`
// when setup answers credentialRecoveryErrorVersion 1; a service's side effects are displayed (images through
// nodeRepl.emitImage, values through console.log) and stripped from the result.
//
// The port is mechanical. The bundled Zod (browser-client.js:518-4677) is replaced by the vendored zod 3.25.76 v3
// module (./vendor/zod/, scripts/extract-zod.mjs), the same code, imported as `z`; the schemas and the client's own
// parse sites (tabs.content, DOM node ids, botDetection and browserAuth requests and results, user tab context, CDP,
// page-assets, WebMCP, management, visibility and viewport results, the side-effect envelope) are the vendor's, and a
// command's toJSON never parses. Top-level bindings carry the names the bundle exports them under (the `apiTypes` and
// `Commands` namespaces; a command module X's members are XPayloadSchema, XResultSchema, xCommandType, createX and
// XByType) or a descriptive name; local names are the bundle's. Every sentence a cell can observe is the vendor's.
// Dropped, per the spec's Table 2: the "iab" and "mcpapps" browser types and BrowserInfo.metadata.codexSessionId, and
// the Orbit-only rewriting of security sentences with the CUA_REPL_BROWSER_ENV read that selected it. The facade's
// share of the browser behaviour (the initial snapshot of a created or bound tab, emit options, inventory settlement,
// the DOM-only Tab's input wrappers) is src/cua-api's facade, not this module.
import * as z from "./vendor/zod/external.js";

var defineProperty = Object.defineProperty;
var defineExports = (t, r) => {
  for (var a in r) {
    defineProperty(t, a, {
      get: r[a],
      enumerable: true,
    });
  }
};
var SECURITY_REJECTED_PREFIX = "Browser Use rejected this action due to browser security policy. Reason:";
var SECURITY_UNAVAILABLE_PREFIX =
  "Browser Use could not complete this action because a browser security check was unavailable. Reason:";
var SECURITY_REJECTED_SUFFIX =
  " The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.";
var SECURITY_UNAVAILABLE_SUFFIX = ", but must not bypass browser security controls or use an indirect workaround.";
var SECURITY_REASONS = {
  approval_cancelled: {
    decisionSource: "approval",
    message: "The permission request was dismissed before a decision was made.",
    retryable: true,
  },
  approval_failed_closed: {
    decisionSource: "approval",
    message: "The permission request could not complete, so access was not granted.",
    retryable: true,
  },
  approval_unavailable: {
    decisionSource: "approval",
    message: "Browser Use could not request permission.",
    retryable: true,
  },
  browser_capability_blocked: {
    decisionSource: "browser",
    message: "The browser capability policy blocks this action.",
    retryable: false,
  },
  browser_capability_unavailable: {
    decisionSource: "browser",
    message: "The browser capability policy could not be verified, so access was not granted.",
    retryable: true,
  },
  browser_context_unavailable: {
    decisionSource: "browser",
    message: "The browser context needed for this action is unavailable.",
    retryable: true,
  },
  browser_navigation_blocked: {
    decisionSource: "browser",
    message:
      "The browser blocked this navigation; this was not a site-status decision or a user rejection.",
    retryable: false,
  },
  enterprise_policy_blocked: {
    decisionSource: "enterprise",
    message: "The admin-enforced policy blocks this action.",
    retryable: false,
  },
  enterprise_policy_unavailable: {
    decisionSource: "enterprise",
    message: "The admin-enforced policy could not be verified, so access was not granted.",
    retryable: true,
  },
  guardian_denied: {
    decisionSource: "guardian",
    message: "Auto-review denied this action; this was not a manual user rejection.",
    retryable: false,
  },
  guardian_timed_out: {
    decisionSource: "guardian",
    message:
      "Auto-review timed out without an approval decision; this was not a determination that the action was unsafe. You may retry once.",
    retryable: true,
  },
  navigation_url_policy_blocked: {
    decisionSource: "browser",
    message: "The browser URL policy blocks this action.",
    retryable: false,
  },
  persisted_user_denied: {
    decisionSource: "user_persisted_setting",
    message: "A saved user permission setting blocks this action.",
    retryable: false,
  },
  site_status_blocked: {
    decisionSource: "site_status",
    message:
      "The site-safety policy blocks this action; no user permission prompt or Auto-review was attempted.",
    retryable: false,
  },
  site_status_unavailable: {
    decisionSource: "site_status",
    message: "The site-safety check was unavailable.",
    retryable: true,
  },
  user_declined: {
    decisionSource: "user_decision",
    message: "The user declined permission for this action.",
    retryable: false,
  },
};
var BrowserUseSecurityError = class extends Error {
  decisionSource;
  reason;
  retryable;
  constructor(e, t, n) {
    super(
      (function (e, t) {
        let n = SECURITY_REASONS[e];
        let c = `${n.message} ${t}`;
        if (n.retryable) {
          return `${SECURITY_UNAVAILABLE_PREFIX} ${c} This failure may be temporary. The agent may retry after the issue is resolved${SECURITY_UNAVAILABLE_SUFFIX}`;
        } else {
          return (function (e) {
            return `${SECURITY_REJECTED_PREFIX} ${e}${SECURITY_REJECTED_SUFFIX}`;
          })(c);
        }
      })(e, t),
      n,
    );
    let c = SECURITY_REASONS[e];
    this.name = "BrowserUseSecurityError";
    this.decisionSource = c.decisionSource;
    this.reason = e;
    this.retryable = c.retryable;
  }
};
var BrowserCredentialRecoveryError = class extends Error {
  details;
  constructor(e) {
    super(
      (function (e) {
        let t;
        switch (e.reason) {
          case "credential_delivery_in_progress":
            t = "Browser observation is unavailable while credential delivery is in progress.";
            break;
          case "credential_observation_restricted":
            t =
              "Browser observation is unavailable because credential protection restricts this observation.";
            break;
          case "retained_data_restricted":
            t =
              "Browser observation is unavailable because retained browser data remains restricted after native credential delivery.";
            break;
          case "credential_state_unavailable":
            t =
              "Browser observation is unavailable because native credential state cannot be safely resumed.";
            break;
          case "protected_command_failed":
            t =
              "Browser observation is unavailable because the browser command failed while credential protection was active. The underlying error was withheld because it may contain protected data; this does not establish a credential-policy denial.";
            break;
          case "browser_security_restricted":
          case "browser_security_unavailable":
            t =
              e.security_reason == null
                ? "A browser security check prevented this command from completing."
                : new BrowserUseSecurityError(e.security_reason, "").message;
        }
        let r = {
          retry_after_credential_delivery:
            "Wait for credential delivery to finish, then retry the command.",
          navigate_to_new_document:
            "Navigate to a new document to continue. If observation remains blocked, use Tab.requestManualHandoff() to let the user take over.",
          create_new_tab:
            "Select a browser by ID and create a new tab with cua.createBrowserTab(), or use Browser.tabs.new() followed by Tab.goto(), to continue on a new document.",
          request_manual_handoff: "Use Tab.requestManualHandoff() to let the user take over.",
          restart_browser_runtime: "Start a new browser runtime to continue.",
          retry_after_resolution: "Retry after the reported check is available.",
          stop: "Stop this browser action and report the failure.",
        }[e.next_action];
        return `${t} ${r} Recovery v1: command=${e.command}, phase=${e.phase}, reason=${e.reason}, next_action=${e.next_action}.`;
      })(e),
    );
    this.name = "BrowserCredentialRecoveryError";
    this.details = Object.freeze({
      schema_version: 1,
      command: e.command,
      phase: e.phase,
      reason: e.reason,
      next_action: e.next_action,
      security_reason: e.security_reason,
    });
  }
};
function credentialRecoveryDetails(e) {
  if (e == null || typeof e != "object") {
    return;
  }
  let t = e;
  if (
    t.schema_version !== 1 ||
    typeof t.command != "string" ||
    !/^[a-z_]{1,64}$/.test(t.command) ||
    typeof t.phase != "string" ||
    !["before_command", "command", "after_command", "error_recheck"].includes(t.phase)
  ) {
    return;
  }
  let r = {
    credential_delivery_in_progress: ["retry_after_credential_delivery"],
    credential_observation_restricted: ["navigate_to_new_document"],
    retained_data_restricted: ["create_new_tab", "stop"],
    credential_state_unavailable: ["restart_browser_runtime"],
    protected_command_failed: ["request_manual_handoff", "stop"],
    browser_security_restricted: ["stop"],
    browser_security_unavailable: ["retry_after_resolution"],
  };
  if (
    typeof t.reason != "string" ||
    typeof t.next_action != "string" ||
    !Object.hasOwn(r, t.reason) ||
    !r[t.reason].includes(t.next_action)
  ) {
    return;
  }
  let a = t.security_reason;
  if (t.reason.startsWith("browser_security_")) {
    if (
      !(function (e) {
        return typeof e == "string" && Object.hasOwn(SECURITY_REASONS, e);
      })(a) ||
      new BrowserUseSecurityError(a, "").retryable !== (t.reason === "browser_security_unavailable")
    ) {
      return;
    }
  } else if (a !== undefined) {
    return;
  }
  return {
    schema_version: 1,
    command: t.command,
    phase: t.phase,
    reason: t.reason,
    next_action: t.next_action,
    security_reason: a,
  };
}
var truncateDisplay = (e, t) => {
  if (!((e) => Number.isInteger(e) && e > 0)(t)) {
    return e;
  }
  let r = t;
  if (e.length <= r) {
    return e;
  }
  let a = e.length - r;
  return `${e.slice(0, r)}[truncated ${a} chars]`;
};
var displaySideEffectValue = async (e, t, r) => {
  let { displayImage: a, displayValue: i } = e;
  let s = null;
  try {
    if (t instanceof Uint8Array) {
      await a(t);
      return;
    }
    if (t === undefined) {
      s = {
        type: "value",
        value: undefined,
      };
    } else if (typeof t == "function") {
      s = {
        type: "function",
        value: undefined,
      };
    } else {
      let e = ((e) => {
        if (e === null) {
          return null;
        }
        if (typeof e == "string" || typeof e == "boolean") {
          return e;
        }
        if (typeof e == "number") {
          if (Number.isFinite(e)) {
            return e;
          } else {
            return undefined;
          }
        }
        if (e instanceof String || e instanceof Boolean) {
          return e.valueOf();
        }
        if (e instanceof Number) {
          let t = e.valueOf();
          if (Number.isFinite(t)) {
            return t;
          } else {
            return undefined;
          }
        }
      })(t);
      if (e !== undefined) {
        s = {
          type: "value",
          value: e,
        };
      }
    }
    if (s === null) {
      let e = JSON.stringify(t);
      if (e === undefined) {
        e = String(t);
      }
      s = {
        type: "object",
        value: e,
      };
    }
  } catch (e) {
    s = {
      type: "error",
      value: String(e),
    };
  }
  if (s) {
    await i(
      ((e, t) => {
        switch (e.type) {
          case "function":
            return e;
          case "error":
          case "object":
            return {
              ...e,
              value: truncateDisplay(e.value, t),
            };
          case "value":
            if (typeof e.value != "string") {
              return e;
            } else {
              return {
                ...e,
                value: truncateDisplay(e.value, t),
              };
            }
        }
      })(s, r),
    );
  }
};
function createSideEffectDisplay({ displayBridge: e, displayTruncateMaxChars: t }) {
  return (r) => displaySideEffectValue(e, r, t);
}
var apiTypes = {};
defineExports(apiTypes, {
  AXAPI: () => AXAPI,
  Agent: () => Agent,
  AlertDialog: () => AlertDialog,
  AtlasCommand: () => AtlasCommand,
  BeforeUnloadDialog: () => BeforeUnloadDialog,
  BotDetectionTabCapability: () => BotDetectionTabCapability,
  Browser: () => Browser,
  BrowserAuthTabCapability: () => BrowserAuthTabCapability,
  BrowserManagementCommands: () => BrowserManagementCommands,
  BrowserUser: () => BrowserUser,
  BrowserViewportCommands: () => BrowserViewportCommands,
  BrowserVisibilityCommands: () => BrowserVisibilityCommands,
  Browsers: () => Browsers,
  CUAAPI: () => CUAAPI,
  CdpTabCapability: () => CdpTabCapability,
  Commands: () => Commands,
  ConfirmDialog: () => ConfirmDialog,
  ContentAPI: () => ContentAPI,
  Documentation: () => Documentation,
  DomCUAAPI: () => DomCUAAPI,
  FunctionAgentTransport: () => FunctionAgentTransport,
  ManagementBrowserCapability: () => ManagementBrowserCapability,
  PageAssetsTabCapability: () => PageAssetsTabCapability,
  PlaywrightAPI: () => PlaywrightAPI,
  PlaywrightDownload: () => PlaywrightDownload,
  PlaywrightFileChooser: () => PlaywrightFileChooser,
  PlaywrightFrameLocator: () => PlaywrightFrameLocator,
  PlaywrightLocator: () => PlaywrightLocator,
  PromptDialog: () => PromptDialog,
  Tab: () => Tab,
  TabBotDetectionCommands: () => TabBotDetectionCommands,
  TabBrowserAuthCommands: () => TabBrowserAuthCommands,
  TabCdpCommands: () => TabCdpCommands,
  TabClipboardAPI: () => TabClipboardAPI,
  TabDevAPI: () => TabDevAPI,
  TabPageAssetsCommands: () => TabPageAssetsCommands,
  TabWebMcpCapability: () => TabWebMcpCapability,
  Tabs: () => Tabs,
  ViewportBrowserCapability: () => ViewportBrowserCapability,
  VisibilityBrowserCapability: () => VisibilityBrowserCapability,
  botDetectionTabCapabilityDefinition: () => botDetectionTabCapabilityDefinition,
  browserAuthTabCapabilityDefinition: () => browserAuthTabCapabilityDefinition,
  browserCapabilityDefinitions: () => browserCapabilityDefinitions,
  cdpTabCapabilityDefinition: () => cdpTabCapabilityDefinition,
  generateRequestId: () => generateRequestId,
  hasErrorMessage: () => hasErrorMessage,
  isPlainObject: () => isPlainObject,
  isRegExp: () => isRegExp,
  managementBrowserCapabilityDefinition: () => managementBrowserCapabilityDefinition,
  pageAssetsTabCapabilityDefinition: () => pageAssetsTabCapabilityDefinition,
  tabCapabilityDefinitions: () => tabCapabilityDefinitions,
  toWebMcpToolDescriptor: () => toWebMcpToolDescriptor,
  viewportBrowserCapabilityDefinition: () => viewportBrowserCapabilityDefinition,
  visibilityBrowserCapabilityDefinition: () => visibilityBrowserCapabilityDefinition,
  webMcpTabCapabilityDefinition: () => webMcpTabCapabilityDefinition,
  webMcpTabCapabilityInfo: () => webMcpTabCapabilityInfo,
});
var Commands = {};
defineExports(Commands, {
  AtlasCommand: () => AtlasCommand,
  BrowserUserClaimTab: () => BrowserUserClaimTab,
  BrowserUserGetTabContext: () => BrowserUserGetTabContext,
  BrowserUserHistory: () => BrowserUserHistory,
  BrowserUserOpenTabs: () => BrowserUserOpenTabs,
  CloseTab: () => CloseTab,
  CreateTab: () => CreateTab,
  CuaClick: () => CuaClick,
  CuaDoubleClick: () => CuaDoubleClick,
  CuaDownloadMedia: () => CuaDownloadMedia,
  CuaDrag: () => CuaDrag,
  CuaKeypress: () => CuaKeypress,
  CuaMove: () => CuaMove,
  CuaScroll: () => CuaScroll,
  CuaType: () => CuaType,
  DomCuaClick: () => DomCuaClick,
  DomCuaDoubleClick: () => DomCuaDoubleClick,
  DomCuaDownloadMedia: () => DomCuaDownloadMedia,
  DomCuaGetVisibleDom: () => DomCuaGetVisibleDom,
  DomCuaKeypress: () => DomCuaKeypress,
  DomCuaScroll: () => DomCuaScroll,
  DomCuaType: () => DomCuaType,
  GetBrowser: () => GetBrowser,
  GetBrowserDocumentation: () => GetBrowserDocumentation,
  GetBrowserForUrl: () => GetBrowserForUrl,
  GetDefaultBrowser: () => GetDefaultBrowser,
  GetDocumentation: () => GetDocumentation,
  GetTab: () => GetTab,
  ListBrowsers: () => ListBrowsers,
  ListTabs: () => ListTabs,
  ManualHandoff: () => ManualHandoff,
  MarkTab: () => MarkTab,
  NameSession: () => NameSession,
  NavigateTab: () => NavigateTab,
  NavigateTabBack: () => NavigateTabBack,
  NavigateTabForward: () => NavigateTabForward,
  NavigateTabReload: () => NavigateTabReload,
  PlaywrightDomSnapshot: () => PlaywrightDomSnapshot,
  PlaywrightDownloadPath: () => PlaywrightDownloadPath,
  PlaywrightElementInfo: () => PlaywrightElementInfo,
  PlaywrightElementScreenshot: () => PlaywrightElementScreenshot,
  PlaywrightEvaluate: () => PlaywrightEvaluate,
  PlaywrightFileChooserSetFiles: () => PlaywrightFileChooserSetFiles,
  PlaywrightLocatorAllTextContents: () => PlaywrightLocatorAllTextContents,
  PlaywrightLocatorClick: () => PlaywrightLocatorClick,
  PlaywrightLocatorCount: () => PlaywrightLocatorCount,
  PlaywrightLocatorDblclick: () => PlaywrightLocatorDblclick,
  PlaywrightLocatorDownloadMedia: () => PlaywrightLocatorDownloadMedia,
  PlaywrightLocatorFill: () => PlaywrightLocatorFill,
  PlaywrightLocatorGetAttribute: () => PlaywrightLocatorGetAttribute,
  PlaywrightLocatorInnerText: () => PlaywrightLocatorInnerText,
  PlaywrightLocatorIsEnabled: () => PlaywrightLocatorIsEnabled,
  PlaywrightLocatorIsVisible: () => PlaywrightLocatorIsVisible,
  PlaywrightLocatorPress: () => PlaywrightLocatorPress,
  PlaywrightLocatorPressSequentially: () => PlaywrightLocatorPressSequentially,
  PlaywrightLocatorReadAll: () => PlaywrightLocatorReadAll,
  PlaywrightLocatorSelectOption: () => PlaywrightLocatorSelectOption,
  PlaywrightLocatorSetChecked: () => PlaywrightLocatorSetChecked,
  PlaywrightLocatorTextContent: () => PlaywrightLocatorTextContent,
  PlaywrightLocatorWaitFor: () => PlaywrightLocatorWaitFor,
  PlaywrightWaitForDownload: () => PlaywrightWaitForDownload,
  PlaywrightWaitForFileChooser: () => PlaywrightWaitForFileChooser,
  PlaywrightWaitForLoadState: () => PlaywrightWaitForLoadState,
  PlaywrightWaitForTimeout: () => PlaywrightWaitForTimeout,
  PlaywrightWaitForURL: () => PlaywrightWaitForURL,
  RuntimeConfig: () => RuntimeConfig,
  SelectedTab: () => SelectedTab,
  TabAxAction: () => TabAxAction,
  TabAxGetState: () => TabAxGetState,
  TabClipboardRead: () => TabClipboardRead,
  TabClipboardReadText: () => TabClipboardReadText,
  TabClipboardWrite: () => TabClipboardWrite,
  TabClipboardWriteText: () => TabClipboardWriteText,
  TabContentExport: () => TabContentExport,
  TabContentExportGSuite: () => TabContentExportGSuite,
  TabContentExportYouTubeTranscript: () => TabContentExportYouTubeTranscript,
  TabDevLogs: () => TabDevLogs,
  TabGetJsDialog: () => TabGetJsDialog,
  TabHandleJsDialog: () => TabHandleJsDialog,
  TabScreenshot: () => TabScreenshot,
  TabsContent: () => TabsContent,
  WebMcpInvokeTool: () => WebMcpInvokeTool,
  WebMcpListTools: () => WebMcpListTools,
});
var AtlasCommand = class {
  constructor(e, t, r) {
    this.type = e;
    this.schema = t;
    this.payload = r;
  }
  parse() {
    return this.schema.parse(this.payload);
  }
  toJSON() {
    return {
      type: this.type,
      ...this.payload,
    };
  }
};
var ListBrowsers = {};
defineExports(ListBrowsers, {
  PayloadSchema: () => ListBrowsersPayloadSchema,
  ResultSchema: () => ListBrowsersResultSchema,
  commandType: () => listBrowsersCommandType,
  create: () => createListBrowsers,
});
var capabilityInfoSchema = z.object({
  id: z.string(),
  description: z.string(),
});
var capabilityInfoListsSchema = z.object({
  browser: z.array(capabilityInfoSchema).optional(),
  tab: z.array(capabilityInfoSchema).optional(),
});
// Table 2: the "iab" and "mcpapps" provider types are dropped (browser-client.js:4686).
var browserTypeSchema = z.enum(["extension", "cdp"]);
var nonEmptyTrimmedStringSchema = z.string().trim().min(1);
var browserInfoSchema = z.object({
  family: nonEmptyTrimmedStringSchema.optional(),
  id: z.string(),
  name: z.string(),
  type: browserTypeSchema,
  profileName: z.string().optional(),
  // Table 2: BrowserInfo.metadata.codexSessionId (desktop session discovery) is dropped (browser-client.js:4697).
  metadata: z
    .object({
      extensionInstanceId: z.string().optional(),
    })
    .optional(),
});
var browserDetailsSchema = browserInfoSchema.extend({
  apiSupportOverrides: z.record(z.boolean()).optional(),
  capabilities: capabilityInfoListsSchema,
});
var ListBrowsersPayloadSchema = z.object({});
var ListBrowsersResultSchema = z.array(browserInfoSchema);
var listBrowsersCommandType = "list_browsers";
function createListBrowsers(e = {}) {
  return new AtlasCommand(listBrowsersCommandType, ListBrowsersPayloadSchema, e);
}
var GetBrowser = {};
defineExports(GetBrowser, {
  PayloadSchema: () => GetBrowserPayloadSchema,
  ResultSchema: () => GetBrowserResultSchema,
  commandType: () => getBrowserCommandType,
  create: () => createGetBrowser,
});
var GetBrowserPayloadSchema = z.object({
  id: z.string(),
});
var GetBrowserResultSchema = browserDetailsSchema;
var getBrowserCommandType = "get_browser";
function createGetBrowser(e) {
  return new AtlasCommand(getBrowserCommandType, GetBrowserPayloadSchema, e);
}
var GetDefaultBrowser = {};
defineExports(GetDefaultBrowser, {
  PayloadSchema: () => GetDefaultBrowserPayloadSchema,
  ResultSchema: () => GetDefaultBrowserResultSchema,
  commandType: () => getDefaultBrowserCommandType,
  create: () => createGetDefaultBrowser,
});
var GetDefaultBrowserPayloadSchema = z.object({});
var GetDefaultBrowserResultSchema = browserDetailsSchema;
var getDefaultBrowserCommandType = "get_default_browser";
function createGetDefaultBrowser(e = {}) {
  return new AtlasCommand(getDefaultBrowserCommandType, GetDefaultBrowserPayloadSchema, e);
}
var GetDocumentation = {};
defineExports(GetDocumentation, {
  PayloadSchema: () => GetDocumentationPayloadSchema,
  ResultSchema: () => GetDocumentationResultSchema,
  commandType: () => getDocumentationCommandType,
  create: () => createGetDocumentation,
});
var GetDocumentationPayloadSchema = z.object({
  name: z.string(),
});
var GetDocumentationResultSchema = z.string();
var getDocumentationCommandType = "get_documentation";
function createGetDocumentation(e) {
  return new AtlasCommand(getDocumentationCommandType, GetDocumentationPayloadSchema, e);
}
var GetBrowserDocumentation = {};
defineExports(GetBrowserDocumentation, {
  PayloadSchema: () => GetBrowserDocumentationPayloadSchema,
  ResultSchema: () => GetBrowserDocumentationResultSchema,
  commandType: () => getBrowserDocumentationCommandType,
  create: () => createGetBrowserDocumentation,
});
var GetBrowserDocumentationPayloadSchema = z.object({
  browser_id: z.string(),
});
var GetBrowserDocumentationResultSchema = z.string();
var getBrowserDocumentationCommandType = "get_browser_documentation";
function createGetBrowserDocumentation(e) {
  return new AtlasCommand(getBrowserDocumentationCommandType, GetBrowserDocumentationPayloadSchema, e);
}
var GetBrowserForUrl = {};
defineExports(GetBrowserForUrl, {
  PayloadSchema: () => GetBrowserForUrlPayloadSchema,
  ResultSchema: () => GetBrowserForUrlResultSchema,
  commandType: () => getBrowserForUrlCommandType,
  create: () => createGetBrowserForUrl,
});
var GetBrowserForUrlPayloadSchema = z.object({
  url: z.string().url(),
});
var GetBrowserForUrlResultSchema = browserDetailsSchema;
var getBrowserForUrlCommandType = "get_browser_for_url";
function createGetBrowserForUrl(e) {
  return new AtlasCommand(getBrowserForUrlCommandType, GetBrowserForUrlPayloadSchema, e);
}
var CreateTab = {};
defineExports(CreateTab, {
  PayloadSchema: () => CreateTabPayloadSchema,
  ResultSchema: () => CreateTabResultSchema,
  commandType: () => createTabCommandType,
  create: () => createCreateTab,
});
var CreateTabPayloadSchema = z.object({
  browser_id: z.string(),
});
var CreateTabResultSchema = z.object({
  id: z.string(),
});
var createTabCommandType = "create_tab";
function createCreateTab(e) {
  return new AtlasCommand(createTabCommandType, CreateTabPayloadSchema, e);
}
var GetTab = {};
defineExports(GetTab, {
  PayloadSchema: () => GetTabPayloadSchema,
  ResultSchema: () => GetTabResultSchema,
  commandType: () => getTabCommandType,
  create: () => createGetTab,
});
var GetTabPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var GetTabResultSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
});
var getTabCommandType = "get_tab";
function createGetTab(e) {
  return new AtlasCommand(getTabCommandType, GetTabPayloadSchema, e);
}
var CloseTab = {};
defineExports(CloseTab, {
  PayloadSchema: () => CloseTabPayloadSchema,
  ResultSchema: () => CloseTabResultSchema,
  commandType: () => closeTabCommandType,
  create: () => createCloseTab,
});
var CloseTabPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var CloseTabResultSchema = z.object({});
var closeTabCommandType = "close_tab";
function createCloseTab(e) {
  return new AtlasCommand(closeTabCommandType, CloseTabPayloadSchema, e);
}
var MarkTab = {};
defineExports(MarkTab, {
  MarkTabStatusSchema: () => MarkTabMarkTabStatusSchema,
  PayloadSchema: () => MarkTabPayloadSchema,
  ResultSchema: () => MarkTabResultSchema,
  commandType: () => markTabCommandType,
  create: () => createMarkTab,
});
var MarkTabMarkTabStatusSchema = z.enum(["handoff", "deliverable"]);
var MarkTabPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  status: MarkTabMarkTabStatusSchema,
});
var MarkTabResultSchema = z.object({});
var markTabCommandType = "mark_tab";
function createMarkTab(e) {
  return new AtlasCommand(markTabCommandType, MarkTabPayloadSchema, e);
}
var ManualHandoff = {};
defineExports(ManualHandoff, {
  PayloadSchema: () => ManualHandoffPayloadSchema,
  ResultSchema: () => ManualHandoffResultSchema,
  commandType: () => manualHandoffCommandType,
  create: () => createManualHandoff,
});
var manualHandoffCommandType = "tab_manual_handoff_request";
var ManualHandoffPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var ManualHandoffResultSchema = z.object({});
function createManualHandoff(e) {
  return new AtlasCommand(manualHandoffCommandType, ManualHandoffPayloadSchema, e);
}
var RuntimeConfig = {};
defineExports(RuntimeConfig, {
  PayloadSchema: () => RuntimeConfigPayloadSchema,
  ResultSchema: () => RuntimeConfigResultSchema,
  commandType: () => runtimeConfigCommandType,
  create: () => createRuntimeConfig,
});
var RuntimeConfigPayloadSchema = z.object({
  browser_id: z.string(),
});
var RuntimeConfigResultSchema = z.object({
  display_truncate_max_chars: z.number().int().positive().optional(),
});
var runtimeConfigCommandType = "runtime_config";
function createRuntimeConfig(e) {
  return new AtlasCommand(runtimeConfigCommandType, RuntimeConfigPayloadSchema, e);
}
var NameSession = {};
defineExports(NameSession, {
  PayloadSchema: () => NameSessionPayloadSchema,
  ResultSchema: () => NameSessionResultSchema,
  commandType: () => nameSessionCommandType,
  create: () => createNameSession,
});
var NameSessionPayloadSchema = z.object({
  browser_id: z.string(),
  name: z.string(),
});
var NameSessionResultSchema = z.object({});
var nameSessionCommandType = "name_session";
function createNameSession(e) {
  return new AtlasCommand(nameSessionCommandType, NameSessionPayloadSchema, e);
}
var SelectedTab = {};
defineExports(SelectedTab, {
  PayloadSchema: () => SelectedTabPayloadSchema,
  ResultSchema: () => SelectedTabResultSchema,
  commandType: () => selectedTabCommandType,
  create: () => createSelectedTab,
});
var SelectedTabPayloadSchema = z.object({
  browser_id: z.string(),
});
var SelectedTabResultSchema = z.object({
  id: z.string().optional(),
});
var selectedTabCommandType = "selected_tab";
function createSelectedTab(e) {
  return new AtlasCommand(selectedTabCommandType, SelectedTabPayloadSchema, e);
}
var ListTabs = {};
defineExports(ListTabs, {
  PayloadSchema: () => ListTabsPayloadSchema,
  ResultSchema: () => ListTabsResultSchema,
  commandType: () => listTabsCommandType,
  create: () => createListTabs,
});
var ListTabsPayloadSchema = z.object({
  browser_id: z.string(),
});
var ListTabsResultSchema = z.object({
  tabs: z.array(
    z.object({
      id: z.string(),
      providerTabId: z.string().optional(),
      url: z.string().optional(),
      title: z.string().optional(),
    }),
  ),
});
var listTabsCommandType = "list_tabs";
function createListTabs(e) {
  return new AtlasCommand(listTabsCommandType, ListTabsPayloadSchema, e);
}
var TabsContent = {};
defineExports(TabsContent, {
  ContentTypeSchema: () => TabsContentContentTypeSchema,
  PayloadSchema: () => TabsContentPayloadSchema,
  ResultSchema: () => TabsContentResultSchema,
  commandType: () => tabsContentCommandType,
  create: () => createTabsContent,
});
var TabsContentContentTypeSchema = z.enum(["html", "text", "domSnapshot"]);
var TabsContentPayloadSchema = z.object({
  browser_id: z.string(),
  urls: z.array(z.string()),
  content_type: TabsContentContentTypeSchema,
  timeout_ms: z.number().int().positive().optional(),
});
var TabsContentResultSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      content: z.string().nullable(),
    }),
  ),
});
var tabsContentCommandType = "tabs_content";
function createTabsContent(e) {
  return new AtlasCommand(tabsContentCommandType, TabsContentPayloadSchema, e);
}
var WebMcpListTools = {};
defineExports(WebMcpListTools, {
  PayloadSchema: () => WebMcpListToolsPayloadSchema,
  ResultSchema: () => WebMcpListToolsResultSchema,
  commandType: () => webMcpListToolsCommandType,
  create: () => createWebMcpListTools,
});
var webMcpToolAnnotationsSchema = z.object({
  readOnlyHint: z.boolean().optional(),
  untrustedContentHint: z.boolean().optional(),
  consequentialHint: z.boolean().optional(),
});
var webMcpToolSchema = z.object({
  name: z.string(),
  call_name: z.string(),
  registration_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  input_schema: z.unknown(),
  annotations: webMcpToolAnnotationsSchema.optional(),
  origin: z.string().optional(),
  pageUrl: z.string().optional(),
});
var WebMcpListToolsPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var WebMcpListToolsResultSchema = z.object({
  tools: z.array(webMcpToolSchema),
});
var webMcpListToolsCommandType = "webmcp_list_tools";
function createWebMcpListTools(e) {
  return new AtlasCommand(webMcpListToolsCommandType, WebMcpListToolsPayloadSchema, e);
}
var WebMcpInvokeTool = {};
defineExports(WebMcpInvokeTool, {
  PayloadSchema: () => WebMcpInvokeToolPayloadSchema,
  ResultSchema: () => WebMcpInvokeToolResultSchema,
  commandType: () => webMcpInvokeToolCommandType,
  create: () => createWebMcpInvokeTool,
});
var WebMcpInvokeToolPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  tool_name: z.string(),
  tool_description: z.string().optional(),
  tool_origin: z.string().optional(),
  tool_title: z.string().optional(),
  registration_id: z.string(),
  input: z.unknown(),
  timeout_ms: z.number().int().positive().optional(),
});
var WebMcpInvokeToolResultSchema = z.object({
  result: z.unknown(),
});
var webMcpInvokeToolCommandType = "webmcp_invoke_tool";
function createWebMcpInvokeTool(e) {
  return new AtlasCommand(webMcpInvokeToolCommandType, WebMcpInvokeToolPayloadSchema, e);
}
var NavigateTab = {};
defineExports(NavigateTab, {
  PayloadSchema: () => NavigateTabPayloadSchema,
  ResultSchema: () => NavigateTabResultSchema,
  commandType: () => navigateTabCommandType,
  create: () => createNavigateTab,
});
var NavigateTabPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  url: z.string(),
});
var NavigateTabResultSchema = z.object({});
var navigateTabCommandType = "navigate_tab_url";
function createNavigateTab(e) {
  return new AtlasCommand(navigateTabCommandType, NavigateTabPayloadSchema, e);
}
var NavigateTabBack = {};
defineExports(NavigateTabBack, {
  PayloadSchema: () => NavigateTabBackPayloadSchema,
  ResultSchema: () => NavigateTabBackResultSchema,
  commandType: () => navigateTabBackCommandType,
  create: () => createNavigateTabBack,
});
var NavigateTabBackPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var NavigateTabBackResultSchema = z.object({});
var navigateTabBackCommandType = "navigate_tab_back";
function createNavigateTabBack(e) {
  return new AtlasCommand(navigateTabBackCommandType, NavigateTabBackPayloadSchema, e);
}
var NavigateTabForward = {};
defineExports(NavigateTabForward, {
  PayloadSchema: () => NavigateTabForwardPayloadSchema,
  ResultSchema: () => NavigateTabForwardResultSchema,
  commandType: () => navigateTabForwardCommandType,
  create: () => createNavigateTabForward,
});
var NavigateTabForwardPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var NavigateTabForwardResultSchema = z.object({});
var navigateTabForwardCommandType = "navigate_tab_forward";
function createNavigateTabForward(e) {
  return new AtlasCommand(navigateTabForwardCommandType, NavigateTabForwardPayloadSchema, e);
}
var NavigateTabReload = {};
defineExports(NavigateTabReload, {
  PayloadSchema: () => NavigateTabReloadPayloadSchema,
  ResultSchema: () => NavigateTabReloadResultSchema,
  commandType: () => navigateTabReloadCommandType,
  create: () => createNavigateTabReload,
});
var NavigateTabReloadPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var NavigateTabReloadResultSchema = z.object({});
var navigateTabReloadCommandType = "navigate_tab_reload";
function createNavigateTabReload(e) {
  return new AtlasCommand(navigateTabReloadCommandType, NavigateTabReloadPayloadSchema, e);
}
var BrowserUserClaimTab = {};
defineExports(BrowserUserClaimTab, {
  PayloadSchema: () => BrowserUserClaimTabPayloadSchema,
  ResultSchema: () => BrowserUserClaimTabResultSchema,
  commandType: () => browserUserClaimTabCommandType,
  create: () => createBrowserUserClaimTab,
});
var BrowserUserClaimTabPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var BrowserUserClaimTabResultSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
});
var browserUserClaimTabCommandType = "browser_user_claim_tab";
function createBrowserUserClaimTab(e) {
  return new AtlasCommand(browserUserClaimTabCommandType, BrowserUserClaimTabPayloadSchema, e);
}
var BrowserUserGetTabContext = {};
defineExports(BrowserUserGetTabContext, {
  PayloadSchema: () => BrowserUserGetTabContextPayloadSchema,
  ResultSchema: () => BrowserUserGetTabContextResultSchema,
  commandType: () => browserUserGetTabContextCommandType,
  create: () => createBrowserUserGetTabContext,
});
var BrowserUserGetTabContextPayloadSchema = z.object({
  browser_id: z.string(),
  expected_url: z.string().optional(),
  tab_id: z.string(),
});
var BrowserUserGetTabContextResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("library_file"),
    libraryFileId: z.string().min(1),
    fileId: z.string().min(1),
    fileName: z.string(),
    mimeType: z.string(),
    title: z.string(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string(),
    title: z.string(),
    truncated: z.boolean(),
    url: z.string(),
  }),
  z.object({
    dataBase64: z.string(),
    fileName: z.string(),
    kind: z.literal("document"),
    mimeType: z.string(),
    title: z.string(),
    url: z.string(),
  }),
]);
var browserUserGetTabContextCommandType = "browser_user_get_tab_context";
function createBrowserUserGetTabContext(e) {
  return new AtlasCommand(browserUserGetTabContextCommandType, BrowserUserGetTabContextPayloadSchema, e);
}
var BrowserUserOpenTabs = {};
defineExports(BrowserUserOpenTabs, {
  PayloadSchema: () => BrowserUserOpenTabsPayloadSchema,
  ResultSchema: () => BrowserUserOpenTabsResultSchema,
  commandType: () => browserUserOpenTabsCommandType,
  create: () => createBrowserUserOpenTabs,
});
var BrowserUserOpenTabsPayloadSchema = z.object({
  browser_id: z.string(),
});
var BrowserUserOpenTabsResultSchema = z.object({
  tabs: z.array(
    z.object({
      id: z.string(),
      providerTabId: z.string().optional(),
      title: z.string().optional(),
      url: z.string().optional(),
      lastOpened: z.string().optional(),
      tabGroup: z.string().optional(),
    }),
  ),
});
var browserUserOpenTabsCommandType = "browser_user_open_tabs";
function createBrowserUserOpenTabs(e) {
  return new AtlasCommand(browserUserOpenTabsCommandType, BrowserUserOpenTabsPayloadSchema, e);
}
var BrowserUserHistory = {};
defineExports(BrowserUserHistory, {
  PayloadSchema: () => BrowserUserHistoryPayloadSchema,
  ResultSchema: () => BrowserUserHistoryResultSchema,
  commandType: () => browserUserHistoryCommandType,
  create: () => createBrowserUserHistory,
});
var BrowserUserHistoryPayloadSchema = z.object({
  browser_id: z.string(),
  queries: z.array(z.string()).min(1).optional(),
  limit: z.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
var BrowserUserHistoryResultSchema = z.object({
  items: z.array(
    z.object({
      url: z.string(),
      title: z.string().optional(),
      dateVisited: z.string(),
    }),
  ),
});
var browserUserHistoryCommandType = "browser_user_history";
function createBrowserUserHistory(e) {
  return new AtlasCommand(browserUserHistoryCommandType, BrowserUserHistoryPayloadSchema, e);
}
var TabDevLogs = {};
defineExports(TabDevLogs, {
  LogLevelSchema: () => TabDevLogsLogLevelSchema,
  PayloadSchema: () => TabDevLogsPayloadSchema,
  ResultSchema: () => TabDevLogsResultSchema,
  commandType: () => tabDevLogsCommandType,
  create: () => createTabDevLogs,
});
var TabDevLogsLogLevelSchema = z.enum(["debug", "info", "log", "warn", "error"]);
var TabDevLogsPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  filter: z.string().optional(),
  levels: z.array(TabDevLogsLogLevelSchema).optional(),
  limit: z.number().int().positive().optional(),
});
var TabDevLogsResultSchema = z.object({
  logs: z.array(
    z.object({
      level: TabDevLogsLogLevelSchema,
      message: z.string(),
      timestamp: z.string(),
      url: z.string().optional(),
    }),
  ),
});
var tabDevLogsCommandType = "tab_dev_logs";
function createTabDevLogs(e) {
  return new AtlasCommand(tabDevLogsCommandType, TabDevLogsPayloadSchema, e);
}
var TabGetJsDialog = {};
defineExports(TabGetJsDialog, {
  JsDialogTypeSchema: () => TabGetJsDialogJsDialogTypeSchema,
  PayloadSchema: () => TabGetJsDialogPayloadSchema,
  ResultDialogSchema: () => TabGetJsDialogResultDialogSchema,
  ResultSchema: () => TabGetJsDialogResultSchema,
  commandType: () => tabGetJsDialogCommandType,
  create: () => createTabGetJsDialog,
});
var TabGetJsDialogJsDialogTypeSchema = z.enum(["alert", "beforeunload", "confirm", "prompt"]);
var TabGetJsDialogResultDialogSchema = z.object({
  id: z.string(),
  type: TabGetJsDialogJsDialogTypeSchema,
});
var TabGetJsDialogPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabGetJsDialogResultSchema = z.object({
  dialog: TabGetJsDialogResultDialogSchema.nullable(),
});
var tabGetJsDialogCommandType = "tab_get_js_dialog";
function createTabGetJsDialog(e) {
  return new AtlasCommand(tabGetJsDialogCommandType, TabGetJsDialogPayloadSchema, e);
}
var TabHandleJsDialog = {};
defineExports(TabHandleJsDialog, {
  PayloadSchema: () => TabHandleJsDialogPayloadSchema,
  ResultSchema: () => TabHandleJsDialogResultSchema,
  commandType: () => tabHandleJsDialogCommandType,
  create: () => createTabHandleJsDialog,
});
var TabHandleJsDialogPayloadSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  browser_id: z.string(),
  dialog_id: z.string(),
  prompt_text: z.string().optional(),
  tab_id: z.string(),
});
var TabHandleJsDialogResultSchema = z.object({});
var tabHandleJsDialogCommandType = "tab_handle_js_dialog";
function createTabHandleJsDialog(e) {
  return new AtlasCommand(tabHandleJsDialogCommandType, TabHandleJsDialogPayloadSchema, e);
}
var TabContentExport = {};
defineExports(TabContentExport, {
  PayloadSchema: () => TabContentExportPayloadSchema,
  ResultSchema: () => TabContentExportResultSchema,
  commandType: () => tabContentExportCommandType,
  create: () => createTabContentExport,
});
var TabContentExportPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabContentExportResultSchema = z.object({
  path: z.string(),
});
var tabContentExportCommandType = "tab_content_export";
function createTabContentExport(e) {
  return new AtlasCommand(tabContentExportCommandType, TabContentExportPayloadSchema, e);
}
var TabContentExportGSuite = {};
defineExports(TabContentExportGSuite, {
  GSuiteExportTypeSchema: () => TabContentExportGSuiteGSuiteExportTypeSchema,
  PayloadSchema: () => TabContentExportGSuitePayloadSchema,
  ResultSchema: () => TabContentExportGSuiteResultSchema,
  commandType: () => tabContentExportGSuiteCommandType,
  create: () => createTabContentExportGSuite,
});
var TabContentExportGSuiteGSuiteExportTypeSchema = z.enum(["pdf", "md", "xlsx", "csv", "docx", "pptx"]);
var TabContentExportGSuitePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  format: TabContentExportGSuiteGSuiteExportTypeSchema,
});
var TabContentExportGSuiteResultSchema = z.object({
  path: z.string(),
});
var tabContentExportGSuiteCommandType = "tab_content_export_gsuite";
function createTabContentExportGSuite(e) {
  return new AtlasCommand(tabContentExportGSuiteCommandType, TabContentExportGSuitePayloadSchema, e);
}
var TabContentExportYouTubeTranscript = {};
defineExports(TabContentExportYouTubeTranscript, {
  PayloadSchema: () => TabContentExportYouTubeTranscriptPayloadSchema,
  ResultSchema: () => TabContentExportYouTubeTranscriptResultSchema,
  commandType: () => tabContentExportYouTubeTranscriptCommandType,
  create: () => createTabContentExportYouTubeTranscript,
});
var TabContentExportYouTubeTranscriptPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabContentExportYouTubeTranscriptResultSchema = z.object({
  path: z.string(),
});
var tabContentExportYouTubeTranscriptCommandType = "tab_content_export_youtube_transcript";
function createTabContentExportYouTubeTranscript(e) {
  return new AtlasCommand(tabContentExportYouTubeTranscriptCommandType, TabContentExportYouTubeTranscriptPayloadSchema, e);
}
var TabClipboardReadText = {};
defineExports(TabClipboardReadText, {
  PayloadSchema: () => TabClipboardReadTextPayloadSchema,
  ResultSchema: () => TabClipboardReadTextResultSchema,
  commandType: () => tabClipboardReadTextCommandType,
  create: () => createTabClipboardReadText,
});
var TabClipboardReadTextPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabClipboardReadTextResultSchema = z.object({
  text: z.string(),
});
var tabClipboardReadTextCommandType = "tab_clipboard_read_text";
function createTabClipboardReadText(e) {
  return new AtlasCommand(tabClipboardReadTextCommandType, TabClipboardReadTextPayloadSchema, e);
}
var TabClipboardWriteText = {};
defineExports(TabClipboardWriteText, {
  PayloadSchema: () => TabClipboardWriteTextPayloadSchema,
  ResultSchema: () => TabClipboardWriteTextResultSchema,
  commandType: () => tabClipboardWriteTextCommandType,
  create: () => createTabClipboardWriteText,
});
var TabClipboardWriteTextPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  text: z.string(),
});
var TabClipboardWriteTextResultSchema = z.object({});
var tabClipboardWriteTextCommandType = "tab_clipboard_write_text";
function createTabClipboardWriteText(e) {
  return new AtlasCommand(tabClipboardWriteTextCommandType, TabClipboardWriteTextPayloadSchema, e);
}
var TabClipboardRead = {};
defineExports(TabClipboardRead, {
  PayloadSchema: () => TabClipboardReadPayloadSchema,
  ResultSchema: () => TabClipboardReadResultSchema,
  commandType: () => tabClipboardReadCommandType,
  create: () => createTabClipboardRead,
});
var clipboardReadEntrySchema = z
  .object({
    mime_type: z.string(),
    text: z.string().optional(),
    base64: z.string().optional(),
  })
  .superRefine((e, t) => {
    if ((e.text !== undefined) === (e.base64 !== undefined)) {
      t.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Clipboard entries must set exactly one of text or base64",
      });
    }
  });
var clipboardReadItemSchema = z.object({
  entries: z.array(clipboardReadEntrySchema),
  presentation_style: z.enum(["unspecified", "inline", "attachment"]).optional(),
});
var TabClipboardReadPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabClipboardReadResultSchema = z.object({
  items: z.array(clipboardReadItemSchema),
});
var tabClipboardReadCommandType = "tab_clipboard_read";
function createTabClipboardRead(e) {
  return new AtlasCommand(tabClipboardReadCommandType, TabClipboardReadPayloadSchema, e);
}
var TabClipboardWrite = {};
defineExports(TabClipboardWrite, {
  PayloadSchema: () => TabClipboardWritePayloadSchema,
  ResultSchema: () => TabClipboardWriteResultSchema,
  commandType: () => tabClipboardWriteCommandType,
  create: () => createTabClipboardWrite,
});
var clipboardWriteEntrySchema = z
  .object({
    mime_type: z.string(),
    text: z.string().optional(),
    base64: z.string().optional(),
  })
  .superRefine((e, t) => {
    if ((e.text !== undefined) === (e.base64 !== undefined)) {
      t.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Clipboard entries must set exactly one of text or base64",
      });
    }
  });
var clipboardWriteItemSchema = z.object({
  entries: z.array(clipboardWriteEntrySchema),
  presentation_style: z.enum(["unspecified", "inline", "attachment"]).optional(),
});
var TabClipboardWritePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  items: z.array(clipboardWriteItemSchema),
});
var TabClipboardWriteResultSchema = z.object({});
var tabClipboardWriteCommandType = "tab_clipboard_write";
function createTabClipboardWrite(e) {
  return new AtlasCommand(tabClipboardWriteCommandType, TabClipboardWritePayloadSchema, e);
}
var TabScreenshot = {};
defineExports(TabScreenshot, {
  PayloadSchema: () => TabScreenshotPayloadSchema,
  ResultSchema: () => TabScreenshotResultSchema,
  commandType: () => tabScreenshotCommandType,
  create: () => createTabScreenshot,
});
var TabScreenshotPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  fullPage: z.boolean().optional(),
  cropX: z.number().optional(),
  cropY: z.number().optional(),
  cropWidth: z.number().optional(),
  cropHeight: z.number().optional(),
});
var TabScreenshotResultSchema = z.object({
  data: z.string(),
});
var tabScreenshotCommandType = "tab_screenshot";
function createTabScreenshot(e) {
  return new AtlasCommand(tabScreenshotCommandType, TabScreenshotPayloadSchema, e);
}
var TabAxGetState = {};
defineExports(TabAxGetState, {
  PayloadSchema: () => TabAxGetStatePayloadSchema,
  ResultSchema: () => TabAxGetStateResultSchema,
  commandType: () => tabAxGetStateCommandType,
  create: () => createTabAxGetState,
});
var TabAxGetStatePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  content: z.enum(["axState", "screenshot", "axStateAndScreenshot"]),
  disable_diffing: z.boolean().optional(),
});
var TabAxGetStateResultSchema = z.object({
  state: z.string().optional(),
  data: z.string().optional(),
  screenshot_unavailable: z.string().optional(),
});
var tabAxGetStateCommandType = "tab_ax_get_state";
function createTabAxGetState(e) {
  return new AtlasCommand(tabAxGetStateCommandType, TabAxGetStatePayloadSchema, e);
}
var TabAxAction = {};
defineExports(TabAxAction, {
  ActionSchema: () => TabAxActionActionSchema,
  PayloadSchema: () => TabAxActionPayloadSchema,
  ResultSchema: () => TabAxActionResultSchema,
  commandType: () => tabAxActionCommandType,
  create: () => createTabAxAction,
});
var axPointSchema = z.tuple([z.number(), z.number()]);
var axElementIndexSchema = z.number().int().nonnegative();
var axTargetSchema = z.union([axElementIndexSchema, axPointSchema]);
var TabAxActionActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paste"),
    element_index: axElementIndexSchema.nullable(),
    text: z.string(),
    format: z.enum(["text", "md", "html"]).optional(),
  }),
  z.object({
    kind: z.literal("click"),
    target: axTargetSchema,
    mouse_button: z.enum(["left", "right", "middle", "l", "r", "m"]).optional(),
    click_count: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("drag"),
    from: axPointSchema,
    to: axPointSchema,
  }),
  z.object({
    kind: z.literal("perform_secondary_action"),
    element_index: axElementIndexSchema,
    action: z.string(),
  }),
  z.object({
    kind: z.literal("press_key"),
    element_index: axElementIndexSchema.nullable(),
    key: z.string(),
  }),
  z.object({
    kind: z.literal("scroll"),
    target: axTargetSchema,
    direction: z.enum(["up", "down", "left", "right", "u", "d", "l", "r"]),
    pages: z.number().optional(),
  }),
  z.object({
    kind: z.literal("select_text"),
    element_index: axElementIndexSchema,
    text: z.string(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    selection_type: z.enum(["text", "cursor_before", "cursor_after"]).optional(),
  }),
  z.object({
    kind: z.literal("set_value"),
    element_index: axElementIndexSchema,
    value: z.string(),
  }),
  z.object({
    kind: z.literal("type_text"),
    element_index: axElementIndexSchema.nullable(),
    text: z.string(),
  }),
]);
var TabAxActionPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  action: TabAxActionActionSchema,
});
var TabAxActionResultSchema = z.object({});
var tabAxActionCommandType = "tab_ax_action";
function createTabAxAction(e) {
  return new AtlasCommand(tabAxActionCommandType, TabAxActionPayloadSchema, e);
}
var PlaywrightEvaluate = {};
defineExports(PlaywrightEvaluate, {
  PayloadSchema: () => PlaywrightEvaluatePayloadSchema,
  ResultSchema: () => PlaywrightEvaluateResultSchema,
  commandType: () => playwrightEvaluateCommandType,
  create: () => createPlaywrightEvaluate,
});
var PlaywrightEvaluatePayloadSchema = z.object({
  browser_id: z.string(),
  selector: z.string().optional(),
  selector_mode: z.literal("all").optional(),
  tab_id: z.string(),
  script: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightEvaluateResultSchema = z.object({
  value: z.unknown().optional(),
});
var playwrightEvaluateCommandType = "playwright_evaluate";
function createPlaywrightEvaluate(e) {
  return new AtlasCommand(playwrightEvaluateCommandType, PlaywrightEvaluatePayloadSchema, e);
}
var CuaClick = {};
defineExports(CuaClick, {
  PayloadSchema: () => CuaClickPayloadSchema,
  ResultSchema: () => CuaClickResultSchema,
  commandType: () => cuaClickCommandType,
  create: () => createCuaClick,
});
var CuaClickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  button: z.number().optional(),
  keys: z.array(z.string()).optional(),
});
var CuaClickResultSchema = z.object({});
var cuaClickCommandType = "cua_click";
function createCuaClick(e) {
  return new AtlasCommand(cuaClickCommandType, CuaClickPayloadSchema, e);
}
var CuaDownloadMedia = {};
defineExports(CuaDownloadMedia, {
  PayloadSchema: () => CuaDownloadMediaPayloadSchema,
  ResultSchema: () => CuaDownloadMediaResultSchema,
  commandType: () => cuaDownloadMediaCommandType,
  create: () => createCuaDownloadMedia,
});
var CuaDownloadMediaPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  timeout_ms: z.number().int().positive().optional(),
});
var CuaDownloadMediaResultSchema = z.object({});
var cuaDownloadMediaCommandType = "cua_download_media";
function createCuaDownloadMedia(e) {
  return new AtlasCommand(cuaDownloadMediaCommandType, CuaDownloadMediaPayloadSchema, e);
}
var CuaDoubleClick = {};
defineExports(CuaDoubleClick, {
  PayloadSchema: () => CuaDoubleClickPayloadSchema,
  ResultSchema: () => CuaDoubleClickResultSchema,
  commandType: () => cuaDoubleClickCommandType,
  create: () => createCuaDoubleClick,
});
var CuaDoubleClickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  keys: z.array(z.string()).optional(),
});
var CuaDoubleClickResultSchema = z.object({});
var cuaDoubleClickCommandType = "cua_double_click";
function createCuaDoubleClick(e) {
  return new AtlasCommand(cuaDoubleClickCommandType, CuaDoubleClickPayloadSchema, e);
}
var CuaKeypress = {};
defineExports(CuaKeypress, {
  PayloadSchema: () => CuaKeypressPayloadSchema,
  ResultSchema: () => CuaKeypressResultSchema,
  commandType: () => cuaKeypressCommandType,
  create: () => createCuaKeypress,
});
var CuaKeypressPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  keys: z.array(z.string()),
});
var CuaKeypressResultSchema = z.object({});
var cuaKeypressCommandType = "cua_keypress";
function createCuaKeypress(e) {
  return new AtlasCommand(cuaKeypressCommandType, CuaKeypressPayloadSchema, e);
}
var CuaDrag = {};
defineExports(CuaDrag, {
  PayloadSchema: () => CuaDragPayloadSchema,
  ResultSchema: () => CuaDragResultSchema,
  commandType: () => cuaDragCommandType,
  create: () => createCuaDrag,
});
var CuaDragPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  path: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
    }),
  ),
  keys: z.array(z.string()).optional(),
});
var CuaDragResultSchema = z.object({});
var cuaDragCommandType = "cua_drag";
function createCuaDrag(e) {
  return new AtlasCommand(cuaDragCommandType, CuaDragPayloadSchema, e);
}
var CuaMove = {};
defineExports(CuaMove, {
  PayloadSchema: () => CuaMovePayloadSchema,
  ResultSchema: () => CuaMoveResultSchema,
  commandType: () => cuaMoveCommandType,
  create: () => createCuaMove,
});
var CuaMovePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  keys: z.array(z.string()).optional(),
});
var CuaMoveResultSchema = z.object({});
var cuaMoveCommandType = "cua_move";
function createCuaMove(e) {
  return new AtlasCommand(cuaMoveCommandType, CuaMovePayloadSchema, e);
}
var CuaScroll = {};
defineExports(CuaScroll, {
  PayloadSchema: () => CuaScrollPayloadSchema,
  ResultSchema: () => CuaScrollResultSchema,
  commandType: () => cuaScrollCommandType,
  create: () => createCuaScroll,
});
var CuaScrollPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  scroll_x: z.number(),
  scroll_y: z.number(),
  keys: z.array(z.string()).optional(),
});
var CuaScrollResultSchema = z.object({});
var cuaScrollCommandType = "cua_scroll";
function createCuaScroll(e) {
  return new AtlasCommand(cuaScrollCommandType, CuaScrollPayloadSchema, e);
}
var CuaType = {};
defineExports(CuaType, {
  PayloadSchema: () => CuaTypePayloadSchema,
  ResultSchema: () => CuaTypeResultSchema,
  commandType: () => cuaTypeCommandType,
  create: () => createCuaType,
});
var CuaTypePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  text: z.string(),
});
var CuaTypeResultSchema = z.object({});
var cuaTypeCommandType = "cua_type";
function createCuaType(e) {
  return new AtlasCommand(cuaTypeCommandType, CuaTypePayloadSchema, e);
}
var DomCuaClick = {};
defineExports(DomCuaClick, {
  DomNodeIdSchema: () => DomCuaClickDomNodeIdSchema,
  PayloadSchema: () => DomCuaClickPayloadSchema,
  ResultSchema: () => DomCuaClickResultSchema,
  commandType: () => domCuaClickCommandType,
  create: () => createDomCuaClick,
});
var DomCuaClickDomNodeIdSchema = z
  .string({
    required_error: "node_id is required",
    invalid_type_error: "node_id must be a string",
  })
  .min(1, "node_id must not be empty");
var DomCuaClickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  node_id: DomCuaClickDomNodeIdSchema,
});
var DomCuaClickResultSchema = z.object({});
var domCuaClickCommandType = "dom_cua_click";
function createDomCuaClick(e) {
  return new AtlasCommand(domCuaClickCommandType, DomCuaClickPayloadSchema, e);
}
var DomCuaDownloadMedia = {};
defineExports(DomCuaDownloadMedia, {
  PayloadSchema: () => DomCuaDownloadMediaPayloadSchema,
  ResultSchema: () => DomCuaDownloadMediaResultSchema,
  commandType: () => domCuaDownloadMediaCommandType,
  create: () => createDomCuaDownloadMedia,
});
var DomCuaDownloadMediaPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  node_id: DomCuaClickDomNodeIdSchema,
  timeout_ms: z.number().int().positive().optional(),
});
var DomCuaDownloadMediaResultSchema = z.object({});
var domCuaDownloadMediaCommandType = "dom_cua_download_media";
function createDomCuaDownloadMedia(e) {
  return new AtlasCommand(domCuaDownloadMediaCommandType, DomCuaDownloadMediaPayloadSchema, e);
}
var DomCuaDoubleClick = {};
defineExports(DomCuaDoubleClick, {
  PayloadSchema: () => DomCuaDoubleClickPayloadSchema,
  ResultSchema: () => DomCuaDoubleClickResultSchema,
  commandType: () => domCuaDoubleClickCommandType,
  create: () => createDomCuaDoubleClick,
});
var DomCuaDoubleClickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  node_id: DomCuaClickDomNodeIdSchema,
});
var DomCuaDoubleClickResultSchema = z.object({});
var domCuaDoubleClickCommandType = "dom_cua_double_click";
function createDomCuaDoubleClick(e) {
  return new AtlasCommand(domCuaDoubleClickCommandType, DomCuaDoubleClickPayloadSchema, e);
}
var DomCuaGetVisibleDom = {};
defineExports(DomCuaGetVisibleDom, {
  PayloadSchema: () => DomCuaGetVisibleDomPayloadSchema,
  ResultSchema: () => DomCuaGetVisibleDomResultSchema,
  commandType: () => domCuaGetVisibleDomCommandType,
  create: () => createDomCuaGetVisibleDom,
});
var DomCuaGetVisibleDomPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var DomCuaGetVisibleDomResultSchema = z.unknown();
var domCuaGetVisibleDomCommandType = "dom_cua_get_visible_dom";
function createDomCuaGetVisibleDom(e) {
  return new AtlasCommand(domCuaGetVisibleDomCommandType, DomCuaGetVisibleDomPayloadSchema, e);
}
var DomCuaKeypress = {};
defineExports(DomCuaKeypress, {
  PayloadSchema: () => DomCuaKeypressPayloadSchema,
  ResultSchema: () => DomCuaKeypressResultSchema,
  commandType: () => domCuaKeypressCommandType,
  create: () => createDomCuaKeypress,
});
var DomCuaKeypressPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  keys: z.array(z.string()),
});
var DomCuaKeypressResultSchema = z.object({});
var domCuaKeypressCommandType = "dom_cua_keypress";
function createDomCuaKeypress(e) {
  return new AtlasCommand(domCuaKeypressCommandType, DomCuaKeypressPayloadSchema, e);
}
var DomCuaScroll = {};
defineExports(DomCuaScroll, {
  PayloadSchema: () => DomCuaScrollPayloadSchema,
  ResultSchema: () => DomCuaScrollResultSchema,
  commandType: () => domCuaScrollCommandType,
  create: () => createDomCuaScroll,
});
var DomCuaScrollPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  scroll_x: z.number(),
  scroll_y: z.number(),
  node_id: DomCuaClickDomNodeIdSchema.optional(),
});
var DomCuaScrollResultSchema = z.object({});
var domCuaScrollCommandType = "dom_cua_scroll";
function createDomCuaScroll(e) {
  return new AtlasCommand(domCuaScrollCommandType, DomCuaScrollPayloadSchema, e);
}
var DomCuaType = {};
defineExports(DomCuaType, {
  PayloadSchema: () => DomCuaTypePayloadSchema,
  ResultSchema: () => DomCuaTypeResultSchema,
  commandType: () => domCuaTypeCommandType,
  create: () => createDomCuaType,
});
var DomCuaTypePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  text: z.string(),
});
var DomCuaTypeResultSchema = z.object({});
var domCuaTypeCommandType = "dom_cua_type";
function createDomCuaType(e) {
  return new AtlasCommand(domCuaTypeCommandType, DomCuaTypePayloadSchema, e);
}
var PlaywrightLocatorClick = {};
defineExports(PlaywrightLocatorClick, {
  PayloadSchema: () => PlaywrightLocatorClickPayloadSchema,
  ResultSchema: () => PlaywrightLocatorClickResultSchema,
  commandType: () => playwrightLocatorClickCommandType,
  create: () => createPlaywrightLocatorClick,
});
var PlaywrightLocatorClickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  modifiers: z.array(z.enum(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"])).optional(),
  button: z.enum(["left", "right", "middle"]).optional(),
  force: z.boolean().optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorClickResultSchema = z.object({});
var playwrightLocatorClickCommandType = "playwright_locator_click";
function createPlaywrightLocatorClick(e) {
  return new AtlasCommand(playwrightLocatorClickCommandType, PlaywrightLocatorClickPayloadSchema, e);
}
var PlaywrightLocatorDblclick = {};
defineExports(PlaywrightLocatorDblclick, {
  PayloadSchema: () => PlaywrightLocatorDblclickPayloadSchema,
  ResultSchema: () => PlaywrightLocatorDblclickResultSchema,
  commandType: () => playwrightLocatorDblclickCommandType,
  create: () => createPlaywrightLocatorDblclick,
});
var PlaywrightLocatorDblclickPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  modifiers: z.array(z.enum(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"])).optional(),
  button: z.enum(["left", "right", "middle"]).optional(),
  force: z.boolean().optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorDblclickResultSchema = z.object({});
var playwrightLocatorDblclickCommandType = "playwright_locator_dblclick";
function createPlaywrightLocatorDblclick(e) {
  return new AtlasCommand(playwrightLocatorDblclickCommandType, PlaywrightLocatorDblclickPayloadSchema, e);
}
var PlaywrightLocatorDownloadMedia = {};
defineExports(PlaywrightLocatorDownloadMedia, {
  PayloadSchema: () => PlaywrightLocatorDownloadMediaPayloadSchema,
  ResultSchema: () => PlaywrightLocatorDownloadMediaResultSchema,
  commandType: () => playwrightLocatorDownloadMediaCommandType,
  create: () => createPlaywrightLocatorDownloadMedia,
});
var PlaywrightLocatorDownloadMediaPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorDownloadMediaResultSchema = z.object({
  path: z.string(),
});
var playwrightLocatorDownloadMediaCommandType = "playwright_locator_download_media";
function createPlaywrightLocatorDownloadMedia(e) {
  return new AtlasCommand(playwrightLocatorDownloadMediaCommandType, PlaywrightLocatorDownloadMediaPayloadSchema, e);
}
var PlaywrightLocatorFill = {};
defineExports(PlaywrightLocatorFill, {
  PayloadSchema: () => PlaywrightLocatorFillPayloadSchema,
  ResultSchema: () => PlaywrightLocatorFillResultSchema,
  commandType: () => playwrightLocatorFillCommandType,
  create: () => createPlaywrightLocatorFill,
});
var PlaywrightLocatorFillPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  value: z.string(),
  replace: z.boolean(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorFillResultSchema = z.object({});
var playwrightLocatorFillCommandType = "playwright_locator_fill";
function createPlaywrightLocatorFill(e) {
  return new AtlasCommand(playwrightLocatorFillCommandType, PlaywrightLocatorFillPayloadSchema, e);
}
var PlaywrightLocatorPress = {};
defineExports(PlaywrightLocatorPress, {
  PayloadSchema: () => PlaywrightLocatorPressPayloadSchema,
  ResultSchema: () => PlaywrightLocatorPressResultSchema,
  commandType: () => playwrightLocatorPressCommandType,
  create: () => createPlaywrightLocatorPress,
});
var PlaywrightLocatorPressPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  value: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorPressResultSchema = z.object({});
var playwrightLocatorPressCommandType = "playwright_locator_press";
function createPlaywrightLocatorPress(e) {
  return new AtlasCommand(playwrightLocatorPressCommandType, PlaywrightLocatorPressPayloadSchema, e);
}
var PlaywrightLocatorPressSequentially = {};
defineExports(PlaywrightLocatorPressSequentially, {
  PayloadSchema: () => PlaywrightLocatorPressSequentiallyPayloadSchema,
  ResultSchema: () => PlaywrightLocatorPressSequentiallyResultSchema,
  commandType: () => playwrightLocatorPressSequentiallyCommandType,
  create: () => createPlaywrightLocatorPressSequentially,
});
var PlaywrightLocatorPressSequentiallyPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  value: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorPressSequentiallyResultSchema = z.object({});
var playwrightLocatorPressSequentiallyCommandType = "playwright_locator_press_sequentially";
function createPlaywrightLocatorPressSequentially(e) {
  return new AtlasCommand(playwrightLocatorPressSequentiallyCommandType, PlaywrightLocatorPressSequentiallyPayloadSchema, e);
}
var PlaywrightLocatorWaitFor = {};
defineExports(PlaywrightLocatorWaitFor, {
  PayloadSchema: () => PlaywrightLocatorWaitForPayloadSchema,
  ResultSchema: () => PlaywrightLocatorWaitForResultSchema,
  commandType: () => playwrightLocatorWaitForCommandType,
  create: () => createPlaywrightLocatorWaitFor,
});
var PlaywrightLocatorWaitForPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  state: z.enum(["attached", "detached", "visible", "hidden"]),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorWaitForResultSchema = z.object({});
var playwrightLocatorWaitForCommandType = "playwright_locator_wait_for";
function createPlaywrightLocatorWaitFor(e) {
  return new AtlasCommand(playwrightLocatorWaitForCommandType, PlaywrightLocatorWaitForPayloadSchema, e);
}
var PlaywrightLocatorCount = {};
defineExports(PlaywrightLocatorCount, {
  PayloadSchema: () => PlaywrightLocatorCountPayloadSchema,
  ResultSchema: () => PlaywrightLocatorCountResultSchema,
  commandType: () => playwrightLocatorCountCommandType,
  create: () => createPlaywrightLocatorCount,
});
var PlaywrightLocatorCountPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
});
var PlaywrightLocatorCountResultSchema = z.object({
  count: z.number().int(),
});
var playwrightLocatorCountCommandType = "playwright_locator_count";
function createPlaywrightLocatorCount(e) {
  return new AtlasCommand(playwrightLocatorCountCommandType, PlaywrightLocatorCountPayloadSchema, e);
}
var PlaywrightLocatorSelectOption = {};
defineExports(PlaywrightLocatorSelectOption, {
  PayloadSchema: () => PlaywrightLocatorSelectOptionPayloadSchema,
  ResultSchema: () => PlaywrightLocatorSelectOptionResultSchema,
  SelectOptionSchema: () => PlaywrightLocatorSelectOptionSelectOptionSchema,
  commandType: () => playwrightLocatorSelectOptionCommandType,
  create: () => createPlaywrightLocatorSelectOption,
});
var PlaywrightLocatorSelectOptionSelectOptionSchema = z
  .object({
    value: z.string().optional(),
    label: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .superRefine((e, t) => {
    if (e.value === undefined && e.label === undefined && e.index === undefined) {
      t.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select option requires value, label, or index",
      });
    }
  });
var PlaywrightLocatorSelectOptionPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  selections: z.array(PlaywrightLocatorSelectOptionSelectOptionSchema).min(1),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorSelectOptionResultSchema = z.object({});
var playwrightLocatorSelectOptionCommandType = "playwright_locator_select_option";
function createPlaywrightLocatorSelectOption(e) {
  return new AtlasCommand(playwrightLocatorSelectOptionCommandType, PlaywrightLocatorSelectOptionPayloadSchema, e);
}
var PlaywrightLocatorSetChecked = {};
defineExports(PlaywrightLocatorSetChecked, {
  PayloadSchema: () => PlaywrightLocatorSetCheckedPayloadSchema,
  ResultSchema: () => PlaywrightLocatorSetCheckedResultSchema,
  commandType: () => playwrightLocatorSetCheckedCommandType,
  create: () => createPlaywrightLocatorSetChecked,
});
var PlaywrightLocatorSetCheckedPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  checked: z.boolean(),
  force: z.boolean().optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorSetCheckedResultSchema = z.object({});
var playwrightLocatorSetCheckedCommandType = "playwright_locator_set_checked";
function createPlaywrightLocatorSetChecked(e) {
  return new AtlasCommand(playwrightLocatorSetCheckedCommandType, PlaywrightLocatorSetCheckedPayloadSchema, e);
}
var PlaywrightLocatorIsVisible = {};
defineExports(PlaywrightLocatorIsVisible, {
  PayloadSchema: () => PlaywrightLocatorIsVisiblePayloadSchema,
  ResultSchema: () => PlaywrightLocatorIsVisibleResultSchema,
  commandType: () => playwrightLocatorIsVisibleCommandType,
  create: () => createPlaywrightLocatorIsVisible,
});
var PlaywrightLocatorIsVisiblePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
});
var PlaywrightLocatorIsVisibleResultSchema = z.object({
  value: z.boolean(),
});
var playwrightLocatorIsVisibleCommandType = "playwright_locator_is_visible";
function createPlaywrightLocatorIsVisible(e) {
  return new AtlasCommand(playwrightLocatorIsVisibleCommandType, PlaywrightLocatorIsVisiblePayloadSchema, e);
}
var PlaywrightLocatorIsEnabled = {};
defineExports(PlaywrightLocatorIsEnabled, {
  PayloadSchema: () => PlaywrightLocatorIsEnabledPayloadSchema,
  ResultSchema: () => PlaywrightLocatorIsEnabledResultSchema,
  commandType: () => playwrightLocatorIsEnabledCommandType,
  create: () => createPlaywrightLocatorIsEnabled,
});
var PlaywrightLocatorIsEnabledPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
});
var PlaywrightLocatorIsEnabledResultSchema = z.object({
  value: z.boolean(),
});
var playwrightLocatorIsEnabledCommandType = "playwright_locator_is_enabled";
function createPlaywrightLocatorIsEnabled(e) {
  return new AtlasCommand(playwrightLocatorIsEnabledCommandType, PlaywrightLocatorIsEnabledPayloadSchema, e);
}
var PlaywrightLocatorAllTextContents = {};
defineExports(PlaywrightLocatorAllTextContents, {
  PayloadSchema: () => PlaywrightLocatorAllTextContentsPayloadSchema,
  ResultSchema: () => PlaywrightLocatorAllTextContentsResultSchema,
  commandType: () => playwrightLocatorAllTextContentsCommandType,
  create: () => createPlaywrightLocatorAllTextContents,
});
var PlaywrightLocatorAllTextContentsPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorAllTextContentsResultSchema = z.object({
  values: z.array(z.string()),
});
var playwrightLocatorAllTextContentsCommandType = "playwright_locator_all_text_contents";
function createPlaywrightLocatorAllTextContents(e) {
  return new AtlasCommand(playwrightLocatorAllTextContentsCommandType, PlaywrightLocatorAllTextContentsPayloadSchema, e);
}
var PlaywrightLocatorTextContent = {};
defineExports(PlaywrightLocatorTextContent, {
  PayloadSchema: () => PlaywrightLocatorTextContentPayloadSchema,
  ResultSchema: () => PlaywrightLocatorTextContentResultSchema,
  commandType: () => playwrightLocatorTextContentCommandType,
  create: () => createPlaywrightLocatorTextContent,
});
var PlaywrightLocatorTextContentPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorTextContentResultSchema = z.object({
  value: z.string().nullable(),
});
var playwrightLocatorTextContentCommandType = "playwright_locator_text_content";
function createPlaywrightLocatorTextContent(e) {
  return new AtlasCommand(playwrightLocatorTextContentCommandType, PlaywrightLocatorTextContentPayloadSchema, e);
}
var PlaywrightLocatorInnerText = {};
defineExports(PlaywrightLocatorInnerText, {
  PayloadSchema: () => PlaywrightLocatorInnerTextPayloadSchema,
  ResultSchema: () => PlaywrightLocatorInnerTextResultSchema,
  commandType: () => playwrightLocatorInnerTextCommandType,
  create: () => createPlaywrightLocatorInnerText,
});
var PlaywrightLocatorInnerTextPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorInnerTextResultSchema = z.object({
  value: z.string(),
});
var playwrightLocatorInnerTextCommandType = "playwright_locator_inner_text";
function createPlaywrightLocatorInnerText(e) {
  return new AtlasCommand(playwrightLocatorInnerTextCommandType, PlaywrightLocatorInnerTextPayloadSchema, e);
}
var PlaywrightLocatorGetAttribute = {};
defineExports(PlaywrightLocatorGetAttribute, {
  PayloadSchema: () => PlaywrightLocatorGetAttributePayloadSchema,
  ResultSchema: () => PlaywrightLocatorGetAttributeResultSchema,
  commandType: () => playwrightLocatorGetAttributeCommandType,
  create: () => createPlaywrightLocatorGetAttribute,
});
var PlaywrightLocatorGetAttributePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  name: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightLocatorGetAttributeResultSchema = z.object({
  value: z.string().nullable(),
});
var playwrightLocatorGetAttributeCommandType = "playwright_locator_get_attribute";
function createPlaywrightLocatorGetAttribute(e) {
  return new AtlasCommand(playwrightLocatorGetAttributeCommandType, PlaywrightLocatorGetAttributePayloadSchema, e);
}
var PlaywrightLocatorReadAll = {};
defineExports(PlaywrightLocatorReadAll, {
  PayloadSchema: () => PlaywrightLocatorReadAllPayloadSchema,
  ResultSchema: () => PlaywrightLocatorReadAllResultSchema,
  commandType: () => playwrightLocatorReadAllCommandType,
  create: () => createPlaywrightLocatorReadAll,
});
var PlaywrightLocatorReadAllPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  selector: z.string(),
  relative_selector: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var locatorReadAllValueSchema = z.object({
  attributes: z.record(z.string()),
  inner_text: z.string(),
  text_content: z.string().nullable(),
});
var PlaywrightLocatorReadAllResultSchema = z.object({
  values: z.array(locatorReadAllValueSchema.nullable()),
});
var playwrightLocatorReadAllCommandType = "playwright_locator_read_all";
function createPlaywrightLocatorReadAll(e) {
  return new AtlasCommand(playwrightLocatorReadAllCommandType, PlaywrightLocatorReadAllPayloadSchema, e);
}
var PlaywrightWaitForURL = {};
defineExports(PlaywrightWaitForURL, {
  PayloadSchema: () => PlaywrightWaitForURLPayloadSchema,
  ResultSchema: () => PlaywrightWaitForURLResultSchema,
  commandType: () => playwrightWaitForURLCommandType,
  create: () => createPlaywrightWaitForURL,
});
var waitUntilSchema = z.enum(["load", "domcontentloaded", "networkidle", "commit"]);
var PlaywrightWaitForURLPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  url: z.string(),
  wait_until: waitUntilSchema.optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightWaitForURLResultSchema = z.object({
  url: z.string().optional(),
});
var playwrightWaitForURLCommandType = "playwright_wait_for_url";
function createPlaywrightWaitForURL(e) {
  return new AtlasCommand(playwrightWaitForURLCommandType, PlaywrightWaitForURLPayloadSchema, e);
}
var PlaywrightWaitForLoadState = {};
defineExports(PlaywrightWaitForLoadState, {
  LoadStateSchema: () => PlaywrightWaitForLoadStateLoadStateSchema,
  PayloadSchema: () => PlaywrightWaitForLoadStatePayloadSchema,
  ResultSchema: () => PlaywrightWaitForLoadStateResultSchema,
  commandType: () => playwrightWaitForLoadStateCommandType,
  create: () => createPlaywrightWaitForLoadState,
});
var PlaywrightWaitForLoadStateLoadStateSchema = z.enum(["load", "domcontentloaded", "networkidle"]);
var PlaywrightWaitForLoadStatePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  state: PlaywrightWaitForLoadStateLoadStateSchema.optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightWaitForLoadStateResultSchema = z.object({});
var playwrightWaitForLoadStateCommandType = "playwright_wait_for_load_state";
function createPlaywrightWaitForLoadState(e) {
  return new AtlasCommand(playwrightWaitForLoadStateCommandType, PlaywrightWaitForLoadStatePayloadSchema, e);
}
var PlaywrightWaitForTimeout = {};
defineExports(PlaywrightWaitForTimeout, {
  PayloadSchema: () => PlaywrightWaitForTimeoutPayloadSchema,
  ResultSchema: () => PlaywrightWaitForTimeoutResultSchema,
  commandType: () => playwrightWaitForTimeoutCommandType,
  create: () => createPlaywrightWaitForTimeout,
});
var PlaywrightWaitForTimeoutPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  timeout_ms: z.number().int().nonnegative(),
});
var PlaywrightWaitForTimeoutResultSchema = z.object({});
var playwrightWaitForTimeoutCommandType = "playwright_wait_for_timeout";
function createPlaywrightWaitForTimeout(e) {
  return new AtlasCommand(playwrightWaitForTimeoutCommandType, PlaywrightWaitForTimeoutPayloadSchema, e);
}
var PlaywrightDomSnapshot = {};
defineExports(PlaywrightDomSnapshot, {
  PayloadSchema: () => PlaywrightDomSnapshotPayloadSchema,
  ResultSchema: () => PlaywrightDomSnapshotResultSchema,
  commandType: () => playwrightDomSnapshotCommandType,
  create: () => createPlaywrightDomSnapshot,
});
var PlaywrightDomSnapshotPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var PlaywrightDomSnapshotResultSchema = z.object({
  dom_snapshot: z.string(),
});
var playwrightDomSnapshotCommandType = "playwright_dom_snapshot";
function createPlaywrightDomSnapshot(e) {
  return new AtlasCommand(playwrightDomSnapshotCommandType, PlaywrightDomSnapshotPayloadSchema, e);
}
var PlaywrightElementInfo = {};
defineExports(PlaywrightElementInfo, {
  PayloadSchema: () => PlaywrightElementInfoPayloadSchema,
  ResultSchema: () => PlaywrightElementInfoResultSchema,
  commandType: () => playwrightElementInfoCommandType,
  create: () => createPlaywrightElementInfo,
});
var elementBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
var elementSelectorsSchema = z.object({
  primary: z.string().nullable().optional(),
  candidates: z.array(z.string()),
  frameSelectors: z.array(z.string()).optional(),
});
var elementInfoSchema = z.object({
  nodeId: z.number().int().positive().nullable().optional(),
  tagName: z.string(),
  role: z.string().nullable().optional(),
  visibleText: z.string().nullable().optional(),
  ariaName: z.string().nullable().optional(),
  testId: z.string().nullable().optional(),
  boundingBox: elementBoundsSchema.nullable().optional(),
  preview: z.string(),
  selector: elementSelectorsSchema,
});
var PlaywrightElementInfoPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  include_non_interactable: z.boolean().optional(),
});
var PlaywrightElementInfoResultSchema = z.array(elementInfoSchema);
var playwrightElementInfoCommandType = "playwright_element_info";
function createPlaywrightElementInfo(e) {
  return new AtlasCommand(playwrightElementInfoCommandType, PlaywrightElementInfoPayloadSchema, e);
}
var PlaywrightElementScreenshot = {};
defineExports(PlaywrightElementScreenshot, {
  PayloadSchema: () => PlaywrightElementScreenshotPayloadSchema,
  ResultSchema: () => PlaywrightElementScreenshotResultSchema,
  commandType: () => playwrightElementScreenshotCommandType,
  create: () => createPlaywrightElementScreenshot,
});
var PlaywrightElementScreenshotPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  x: z.number(),
  y: z.number(),
  include_non_interactable: z.boolean().optional(),
});
var PlaywrightElementScreenshotResultSchema = z.object({
  data: z.string(),
});
var playwrightElementScreenshotCommandType = "playwright_element_screenshot";
function createPlaywrightElementScreenshot(e) {
  return new AtlasCommand(playwrightElementScreenshotCommandType, PlaywrightElementScreenshotPayloadSchema, e);
}
var PlaywrightWaitForDownload = {};
defineExports(PlaywrightWaitForDownload, {
  PayloadSchema: () => PlaywrightWaitForDownloadPayloadSchema,
  ResultSchema: () => PlaywrightWaitForDownloadResultSchema,
  commandType: () => playwrightWaitForDownloadCommandType,
  create: () => createPlaywrightWaitForDownload,
});
var PlaywrightWaitForDownloadPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightWaitForDownloadResultSchema = z.object({
  download_id: z.string(),
});
var playwrightWaitForDownloadCommandType = "playwright_wait_for_download";
function createPlaywrightWaitForDownload(e) {
  return new AtlasCommand(playwrightWaitForDownloadCommandType, PlaywrightWaitForDownloadPayloadSchema, e);
}
var PlaywrightDownloadPath = {};
defineExports(PlaywrightDownloadPath, {
  PayloadSchema: () => PlaywrightDownloadPathPayloadSchema,
  ResultSchema: () => PlaywrightDownloadPathResultSchema,
  commandType: () => playwrightDownloadPathCommandType,
  create: () => createPlaywrightDownloadPath,
});
var PlaywrightDownloadPathPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  download_id: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightDownloadPathResultSchema = z.object({
  path: z.string().nullable(),
});
var playwrightDownloadPathCommandType = "playwright_download_path";
function createPlaywrightDownloadPath(e) {
  return new AtlasCommand(playwrightDownloadPathCommandType, PlaywrightDownloadPathPayloadSchema, e);
}
var PlaywrightWaitForFileChooser = {};
defineExports(PlaywrightWaitForFileChooser, {
  PayloadSchema: () => PlaywrightWaitForFileChooserPayloadSchema,
  ResultSchema: () => PlaywrightWaitForFileChooserResultSchema,
  commandType: () => playwrightWaitForFileChooserCommandType,
  create: () => createPlaywrightWaitForFileChooser,
});
var PlaywrightWaitForFileChooserPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightWaitForFileChooserResultSchema = z.object({
  file_chooser_id: z.string(),
  is_multiple: z.boolean(),
});
var playwrightWaitForFileChooserCommandType = "playwright_wait_for_file_chooser";
function createPlaywrightWaitForFileChooser(e) {
  return new AtlasCommand(playwrightWaitForFileChooserCommandType, PlaywrightWaitForFileChooserPayloadSchema, e);
}
var PlaywrightFileChooserSetFiles = {};
defineExports(PlaywrightFileChooserSetFiles, {
  PayloadSchema: () => PlaywrightFileChooserSetFilesPayloadSchema,
  ResultSchema: () => PlaywrightFileChooserSetFilesResultSchema,
  commandType: () => playwrightFileChooserSetFilesCommandType,
  create: () => createPlaywrightFileChooserSetFiles,
});
var PlaywrightFileChooserSetFilesPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  file_chooser_id: z.string(),
  files: z.array(z.string()),
  timeout_ms: z.number().int().positive().optional(),
});
var PlaywrightFileChooserSetFilesResultSchema = z.object({});
var playwrightFileChooserSetFilesCommandType = "playwright_file_chooser_set_files";
function createPlaywrightFileChooserSetFiles(e) {
  return new AtlasCommand(playwrightFileChooserSetFilesCommandType, PlaywrightFileChooserSetFilesPayloadSchema, e);
}
var Browsers = class {
  #e;
  #t;
  #r;
  constructor({ createBrowser: e, onBrowserUsed: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async list() {
    return await this.#r.send({
      command: ListBrowsers.create(),
    });
  }
  async get(e) {
    if (!e) {
      throw new Error("browsers.get requires a browser id");
    }
    let t = await this.#r.send({
      command: GetBrowser.create({
        id: e,
      }),
    });
    return this.#a(t);
  }
  async getDefault() {
    let e = await this.#r.send({
      command: GetDefaultBrowser.create(),
    });
    return this.#a(e);
  }
  async getForUrl(e) {
    let t = await this.#r.send({
      command: GetBrowserForUrl.create({
        url: e,
      }),
    });
    return this.#a(t);
  }
  #a(e) {
    this.#t?.(e);
    return this.#e({
      browserInfo: e,
      onBrowserUsed: () => this.#t?.(e),
      transport: this.#r,
    });
  }
};
var Documentation = class {
  #e;
  constructor(e) {
    this.#e = e;
  }
  async get(e) {
    return await this.#e.send({
      command: GetDocumentation.create({
        name: e,
      }),
    });
  }
};
var Agent = class {
  constructor({ createBrowser: e, onBrowserUsed: t, transport: r }) {
    if (!r) {
      throw new Error("Agent requires a transport instance");
    }
    this.documentation = new Documentation(r);
    this.browsers = new Browsers({
      createBrowser: e,
      onBrowserUsed: t,
      transport: r,
    });
  }
};
var Tabs = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, createTab: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async new() {
    let e = await this.#r.send({
      command: CreateTab.create({
        browser_id: this.#e,
      }),
    });
    return this.#t(e);
  }
  async selected() {
    let e = await this.#r.send({
      command: SelectedTab.create({
        browser_id: this.#e,
      }),
    });
    if (e.id) {
      return this.#t(e);
    }
  }
  async list() {
    return (
      await this.#r.send({
        command: ListTabs.create({
          browser_id: this.#e,
        }),
      })
    ).tabs;
  }
  async content(e) {
    let t = TabsContent.create({
      browser_id: this.#e,
      urls: e.urls,
      content_type: e.contentType,
      ...(e.timeoutMs === undefined
        ? {}
        : {
            timeout_ms: e.timeoutMs,
          }),
    });
    t.parse();
    if (e.urls.length === 0) {
      return [];
    } else {
      return (
        await this.#r.send({
          command: t,
        })
      ).results;
    }
  }
  async get(e) {
    if (!e) {
      throw new Error("tabs.get requires a tab id");
    }
    let t = await this.#r.send({
      command: GetTab.create({
        browser_id: this.#e,
        tab_id: e,
      }),
    });
    return this.#t(t);
  }
};
var generateRequestId = () => `req-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
var base64ToBytes = (e) => {
  let t = atob(e);
  let r = new Uint8Array(t.length);
  for (let e = 0; e < t.length; e += 1) {
    r[e] = t.charCodeAt(e);
  }
  return r;
};
var BrowserUser = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, createTab: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async openTabs() {
    return (
      await this.#r.send({
        command: BrowserUserOpenTabs.create({
          browser_id: this.#e,
        }),
      })
    ).tabs;
  }
  async getTabContext(e) {
    let t = await this.#r.send({
      command: BrowserUserGetTabContext.create({
        browser_id: this.#e,
        tab_id: userTabIdOf(e, "getTabContext"),
      }),
    });
    let r = BrowserUserGetTabContext.ResultSchema.parse(t);
    if (r.kind !== "document") {
      return r;
    } else {
      return {
        data: base64ToBytes(r.dataBase64),
        fileName: r.fileName,
        kind: r.kind,
        mimeType: r.mimeType,
        title: r.title,
        url: r.url,
      };
    }
  }
  async claimTab(e) {
    let t = userTabIdOf(e, "claimTab");
    let r = await this.#r.send({
      command: BrowserUserClaimTab.create({
        browser_id: this.#e,
        tab_id: t,
      }),
    });
    return this.#t(r);
  }
};
var userTabIdOf = (e, t) => {
  if (typeof e == "string") {
    if (e.length === 0) {
      throw new Error(`browser.user.${t} received an empty tab id`);
    }
    return e;
  }
  if (e && typeof e == "object" && typeof e.id == "string") {
    return e.id;
  }
  throw new Error(
    `browser.user.${t} expects a tab returned by browser.user.openTabs() or a tab id`,
  );
};
var regExpSourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get;
function isRegExp(e) {
  if (e == null || typeof e != "object" || !regExpSourceGetter) {
    return false;
  }
  try {
    Reflect.apply(regExpSourceGetter, e, []);
    return true;
  } catch {
    return false;
  }
}
function isPlainObject(e) {
  if (e == null || typeof e != "object") {
    return false;
  }
  let t = Object.getPrototypeOf(e);
  return t === null || Object.getPrototypeOf(t) === null;
}
function hasErrorMessage(e, t) {
  if (e == null || typeof e != "object") {
    return false;
  }
  try {
    return "message" in e && e.message === t;
  } catch {
    return false;
  }
}
function withErrorContext(e, t) {
  let r = e instanceof Error ? e.message : String(e);
  let a = new Error(`${r}\n${t}`);
  if (e instanceof Error && e.stack) {
    a.stack = `${a.name}: ${a.message}\n${e.stack}`;
  }
  return a;
}
function locatorFailureKind(e, t) {
  let r = e instanceof Error ? e.message : String(e);
  if (/strict mode violation/i.test(r)) {
    return "multiple_matches";
  } else if (/intercept|receives pointer events/i.test(r)) {
    return "intercepted";
  } else if (t.matchCount === 0) {
    return "no_matches";
  } else if (t.visibleCount === 0) {
    return "no_visible_match";
  } else {
    return "action_failed";
  }
}
function pageEvaluateScript(e, t) {
  let r = serializeEvaluateArg(t);
  if (typeof e == "string") {
    if (e.length === 0) {
      throw new Error("playwright.evaluate requires a pageFunction");
    }
    return `const arg = ${r};\nreturn (${e});`;
  }
  if (typeof e == "function") {
    return [
      `const arg = ${r};`,
      `const __playwrightEvaluate = (${e.toString()});`,
      "return await __playwrightEvaluate(arg);",
    ].join("\n");
  }
  throw new Error("playwright.evaluate requires a string or function");
}
function locatorEvaluateScript(e, t, r) {
  let a = serializeEvaluateArg(t);
  let i = r === "all" ? "locator.evaluateAll" : "locator.evaluate";
  if (typeof e == "string") {
    if (e.length === 0) {
      throw new Error(`${i} requires a pageFunction`);
    }
    return `const arg = ${a};\nreturn (${e});`;
  }
  if (typeof e == "function") {
    return [
      `const arg = ${a};`,
      `const __playwrightEvaluate = (${e.toString()});`,
      `return await __playwrightEvaluate(${r === "all" ? "elements" : "element"}, arg);`,
    ].join("\n");
  }
  throw new Error(`${i} requires a string or function`);
}
function serializeEvaluateArg(e) {
  if (e === undefined) {
    return "undefined";
  }
  try {
    let t = JSON.stringify(e);
    if (t !== undefined) {
      return t;
    }
  } catch (e) {
    throw withErrorContext(e, "playwright.evaluate arg must be JSON-serializable");
  }
  throw new Error("playwright.evaluate arg must be JSON-serializable");
}
function pointOf(e, t) {
  let { x: r, y: a } = t;
  if (!Number.isFinite(r) || !Number.isFinite(a)) {
    throw new Error(`${e} requires numeric x and y coordinates`);
  }
  return {
    x: r,
    y: a,
  };
}
var browserAuthSelectorDetails = Symbol("browserAuthSelectorDetails");
var PlaywrightLocator = class e {
  #e;
  #t;
  #r;
  #a;
  #i;
  #s;
  #n;
  constructor({
    browserId: e,
    tabId: t,
    selector: r,
    transport: a,
    collectionReadCache: i,
    collectionReadIndex: s,
    collectionRelativeSelector: n,
  }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
    this.#a = a;
    this.#i = i;
    this.#s = s;
    this.#n = n;
  }
  static browserAuthSelector(e) {
    return e[browserAuthSelectorDetails]();
  }
  [browserAuthSelectorDetails]() {
    return {
      browserId: this.#e,
      selector: this.#r,
      tabId: this.#t,
    };
  }
  async click(e = {}) {
    try {
      await this.#a.send({
        command: PlaywrightLocatorClick.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          modifiers: e.modifiers,
          button: e.button,
          force: e.force,
          timeout_ms: e.timeoutMs,
        }),
        timeoutMs: e.timeoutMs,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(e, "click", `waiting on click for selector ${this.#r}`);
    }
  }
  async dblclick(e = {}) {
    try {
      await this.#a.send({
        command: PlaywrightLocatorDblclick.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          modifiers: e.modifiers,
          button: e.button,
          force: e.force,
          timeout_ms: e.timeoutMs,
        }),
        timeoutMs: e.timeoutMs,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(e, "dblclick", `waiting on dblclick for selector ${this.#r}`);
    }
  }
  async selectOption(e, { timeoutMs: t } = {}) {
    let r = (function (e) {
      let t = Array.isArray(e) ? e : [e];
      if (!t.length) {
        throw new Error("locator.selectOption requires at least one value");
      }
      return t.map((e) => {
        if (typeof e == "string") {
          return {
            value: e,
          };
        }
        if (!e || typeof e != "object") {
          throw new Error("locator.selectOption requires a string or { value?, label?, index? }");
        }
        let t = {};
        if (e.value !== undefined) {
          if (typeof e.value != "string") {
            throw new Error("locator.selectOption value must be a string");
          }
          t.value = e.value;
        }
        if (e.label !== undefined) {
          if (typeof e.label != "string") {
            throw new Error("locator.selectOption label must be a string");
          }
          t.label = e.label;
        }
        if (e.index !== undefined) {
          if (!Number.isInteger(e.index) || e.index < 0) {
            throw new Error("locator.selectOption index must be a non-negative integer");
          }
          t.index = e.index;
        }
        if (t.value === undefined && t.label === undefined && t.index === undefined) {
          throw new Error(
            "locator.selectOption requires value, label, or index for each selection",
          );
        }
        return t;
      });
    })(e);
    try {
      await this.#a.send({
        command: PlaywrightLocatorSelectOption.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          selections: r,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(
        e,
        "selectOption",
        `locator.selectOption failed for selector ${this.#r}`,
      );
    }
  }
  async fill(e, { timeoutMs: t } = {}) {
    if (e == null) {
      throw new Error("locator.fill requires a value");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorFill.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          value: e,
          replace: true,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(e, "fill", `locator.fill failed for selector ${this.#r}`);
    }
  }
  async type(e, { timeoutMs: t } = {}) {
    if (e == null) {
      throw new Error("locator.type requires a value");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorFill.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          value: e,
          replace: false,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(e, "type", `locator.type failed for selector ${this.#r}`);
    }
  }
  async pressSequentially(e, t = {}) {
    if (e == null) {
      throw new Error("locator.pressSequentially requires a value");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorPressSequentially.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          value: e,
          ...(t.timeoutMs == null
            ? {}
            : {
                timeout_ms: t.timeoutMs,
              }),
        }),
        timeoutMs: t.timeoutMs,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(
        e,
        "pressSequentially",
        `locator.pressSequentially failed for selector ${this.#r}`,
      );
    }
  }
  async press(e, { timeoutMs: t } = {}) {
    if (e == null) {
      throw new Error("locator.press requires a value");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorPress.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          value: e,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
      this.#i?.clear();
    } catch (e) {
      throw await this.actionError(e, "press", `locator.press failed for selector ${this.#r}`);
    }
  }
  async setChecked(e, t = {}) {
    if (typeof e != "boolean") {
      throw new Error("locator.setChecked requires a boolean");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorSetChecked.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          checked: e,
          force: t.force,
          timeout_ms: t.timeoutMs,
        }),
        timeoutMs: t.timeoutMs,
      });
      this.#i?.clear();
    } catch (t) {
      throw await this.actionError(
        t,
        "setChecked",
        `locator.setChecked(${e}) failed for selector ${this.#r}`,
      );
    }
  }
  async check(e = {}) {
    await this.setChecked(true, e);
  }
  async uncheck(e = {}) {
    await this.setChecked(false, e);
  }
  async waitFor({ state: e, timeoutMs: t }) {
    if (!e) {
      throw new Error("locator.waitFor requires a state");
    }
    try {
      await this.#a.send({
        command: PlaywrightLocatorWaitFor.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          state: e,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
    } catch (t) {
      throw await this.actionError(
        t,
        "waitFor",
        `locator.waitFor(${e}) timed out for selector ${this.#r}`,
      );
    }
  }
  async count() {
    return (
      await this.#a.send({
        command: PlaywrightLocatorCount.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
        }),
      })
    ).count;
  }
  async all() {
    let t = await this.count();
    let r = new LocatorCollectionReadCache({
      browserId: this.#e,
      tabId: this.#t,
      selector: this.#r,
      transport: this.#a,
    });
    return Array.from(
      {
        length: t,
      },
      (t, a) =>
        new e({
          browserId: this.#e,
          tabId: this.#t,
          selector: `${this.#r} >> nth=${a}`,
          transport: this.#a,
          collectionReadCache: r,
          collectionReadIndex: a,
        }),
    );
  }
  async textContent({ timeoutMs: e } = {}) {
    let t = await this.cachedRead(e);
    if (t) {
      return t.text_content;
    } else {
      return (
        await this.#a.send({
          command: PlaywrightLocatorTextContent.create({
            browser_id: this.#e,
            tab_id: this.#t,
            selector: this.#r,
            timeout_ms: e,
          }),
          timeoutMs: e,
        })
      ).value;
    }
  }
  async innerText({ timeoutMs: e } = {}) {
    let t = await this.cachedRead(e);
    if (t) {
      return t.inner_text;
    } else {
      return (
        await this.#a.send({
          command: PlaywrightLocatorInnerText.create({
            browser_id: this.#e,
            tab_id: this.#t,
            selector: this.#r,
            timeout_ms: e,
          }),
          timeoutMs: e,
        })
      ).value;
    }
  }
  async getAttribute(e, { timeoutMs: t } = {}) {
    if (!e) {
      throw new Error("locator.getAttribute requires a name");
    }
    let r = await this.cachedRead(t);
    if (r) {
      if (Object.prototype.hasOwnProperty.call(r.attributes, e)) {
        return r.attributes[e] ?? null;
      } else {
        return null;
      }
    } else {
      return (
        await this.#a.send({
          command: PlaywrightLocatorGetAttribute.create({
            browser_id: this.#e,
            tab_id: this.#t,
            selector: this.#r,
            name: e,
            timeout_ms: t,
          }),
          timeoutMs: t,
        })
      ).value;
    }
  }
  async isVisible() {
    return (
      await this.#a.send({
        command: PlaywrightLocatorIsVisible.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
        }),
      })
    ).value;
  }
  async isEnabled() {
    return (
      await this.#a.send({
        command: PlaywrightLocatorIsEnabled.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
        }),
      })
    ).value;
  }
  async allTextContents({ timeoutMs: e } = {}) {
    return (
      await this.#a.send({
        command: PlaywrightLocatorAllTextContents.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          timeout_ms: e,
        }),
        timeoutMs: e,
      })
    ).values;
  }
  async evaluate(e, t, r) {
    return (
      await this.#a.send({
        command: PlaywrightEvaluate.create({
          browser_id: this.#e,
          script: locatorEvaluateScript(e, t),
          selector: this.#r,
          tab_id: this.#t,
          timeout_ms: r?.timeoutMs,
        }),
        timeoutMs: r?.timeoutMs,
      })
    ).value;
  }
  async evaluateAll(e, t, r) {
    return (
      await this.#a.send({
        command: PlaywrightEvaluate.create({
          browser_id: this.#e,
          script: locatorEvaluateScript(e, t, "all"),
          selector: this.#r,
          selector_mode: "all",
          tab_id: this.#t,
          timeout_ms: r?.timeoutMs,
        }),
        timeoutMs: r?.timeoutMs,
      })
    ).value;
  }
  async actionError(e, t, r) {
    try {
      let a = await this.evaluateAll(
        (e) => ({
          matchCount: e.length,
          visibleCount: e.reduce((e, t) => e + +(t.getClientRects().length > 0), 0),
          matches: e.slice(0, 5).map((e) => ({
            tag: e.tagName.toLowerCase(),
            role: e.getAttribute("role"),
            type: e.getAttribute("type"),
            ariaLabel: e.getAttribute("aria-label"),
            text: e.textContent?.trim().slice(0, 120) ?? "",
            visible: e.getClientRects().length > 0,
            disabled: "disabled" in e && !!e.disabled,
          })),
        }),
        undefined,
        {
          timeoutMs: 1000,
        },
      );
      return withErrorContext(
        e,
        `${r}\nLocator diagnostics: ${JSON.stringify({
          kind: locatorFailureKind(e, a),
          action: t,
          locator: this.#r,
          ...a,
          truncated: a.matchCount > a.matches.length,
        })}`,
      );
    } catch {
      return withErrorContext(e, r);
    }
  }
  async downloadMedia({ timeoutMs: e = 120000 } = {}) {
    try {
      let t = await this.#a.send({
        command: PlaywrightLocatorDownloadMedia.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          timeout_ms: e,
        }),
        timeoutMs: e,
      });
      this.#i?.clear();
      return t.path;
    } catch (e) {
      throw await this.actionError(
        e,
        "downloadMedia",
        `locator.downloadMedia failed for selector ${this.#r}`,
      );
    }
  }
  locator(t, r = {}) {
    if (!t) {
      throw new Error("locator.locator requires a selector");
    }
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${t}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, t) : undefined,
    }).filter(r);
  }
  first() {
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> nth=0`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector:
        this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, "nth=0") : undefined,
    });
  }
  last() {
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> nth=-1`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector:
        this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, "nth=-1") : undefined,
    });
  }
  nth(t) {
    if (typeof t != "number") {
      throw new Error("locator.nth requires a numeric index");
    }
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> nth=${t}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector:
        this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, `nth=${t}`) : undefined,
    });
  }
  and(t) {
    if (!(t instanceof e)) {
      throw new Error("locator.and requires a PlaywrightLocator");
    }
    if (t.#e !== this.#e || t.#t !== this.#t) {
      throw new Error("Locators must belong to the same tab");
    }
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> internal:and=${JSON.stringify(t.#r)}`,
      transport: this.#a,
    });
  }
  or(t) {
    if (!(t instanceof e)) {
      throw new Error("locator.or requires a PlaywrightLocator");
    }
    if (t.#e !== this.#e || t.#t !== this.#t) {
      throw new Error("Locators must belong to the same tab");
    }
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> internal:or=${JSON.stringify(t.#r)}`,
      transport: this.#a,
    });
  }
  filter(t = {}) {
    let r = [this.#r];
    if (t.hasText !== undefined) {
      r.push(`internal:has-text=${textSelectorArg(t.hasText, false)}`);
    }
    if (t.hasNotText !== undefined) {
      r.push(`internal:has-not-text=${textSelectorArg(t.hasNotText, false)}`);
    }
    if (t.has !== undefined) {
      this.assertCompatibleLocator(t.has, "locator.filter has");
      r.push(`internal:has=${JSON.stringify(t.has.#r)}`);
    }
    if (t.hasNot !== undefined) {
      this.assertCompatibleLocator(t.hasNot, "locator.filter hasNot");
      r.push(`internal:has-not=${JSON.stringify(t.hasNot.#r)}`);
    }
    if (t.visible !== undefined) {
      if (typeof t.visible != "boolean") {
        throw new Error("locator.filter visible must be a boolean");
      }
      r.push(`visible=${t.visible}`);
    }
    let a = r.slice(1).join(" >> ");
    let i = this.#i && this.#s !== undefined && (!a || this.#n !== undefined);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: r.join(" >> "),
      transport: this.#a,
      collectionReadCache: i ? this.#i : undefined,
      collectionReadIndex: i ? this.#s : undefined,
      collectionRelativeSelector: i ? joinRelativeSelector(this.#n, a) : undefined,
    });
  }
  getByRole(t, r = {}) {
    let a = roleSelector(t, r);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${a}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, a) : undefined,
    });
  }
  getByText(t, r = {}) {
    let a = textSelector(t, r);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${a}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, a) : undefined,
    });
  }
  getByLabel(t, r = {}) {
    let a = labelSelector(t, r);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${a}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, a) : undefined,
    });
  }
  getByPlaceholder(t, r = {}) {
    let a = placeholderSelector(t, r);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${a}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, a) : undefined,
    });
  }
  getByTestId(t) {
    let r = testIdSelector(t);
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      selector: `${this.#r} >> ${r}`,
      transport: this.#a,
      collectionReadCache: this.#i,
      collectionReadIndex: this.#s,
      collectionRelativeSelector: this.#i && this.#s !== undefined ? joinRelativeSelector(this.#n, r) : undefined,
    });
  }
  async cachedRead(e) {
    if (this.#i && this.#s !== undefined) {
      return await this.#i.read({
        index: this.#s,
        relativeSelector: this.#n,
        timeoutMs: e,
      });
    } else {
      return null;
    }
  }
  assertCompatibleLocator(t, r) {
    if (!(t instanceof e)) {
      throw new Error(`${r} requires a PlaywrightLocator`);
    }
    if (t.#e !== this.#e || t.#t !== this.#t) {
      throw new Error("Locators must belong to the same tab");
    }
  }
};
var LocatorCollectionReadCache = class {
  #e;
  #t;
  #r;
  #a;
  #i = new Map();
  constructor({ browserId: e, tabId: t, selector: r, transport: a }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
    this.#a = a;
  }
  clear() {
    this.#i.clear();
  }
  async read({ index: e, relativeSelector: t, timeoutMs: r }) {
    let a = t ?? "";
    let i = this.#i.get(a);
    if (!i) {
      i = this.#s(t, r).catch((e) => {
        this.#i.delete(a);
        throw e;
      });
      this.#i.set(a, i);
    }
    return (await i)[e] ?? null;
  }
  async #s(e, t) {
    return (
      await this.#a.send({
        command: PlaywrightLocatorReadAll.create({
          browser_id: this.#e,
          tab_id: this.#t,
          selector: this.#r,
          relative_selector: e,
          timeout_ms: t,
        }),
        timeoutMs: t,
      })
    ).values;
  }
};
function joinRelativeSelector(e, t) {
  if (e) {
    if (t) {
      return `${e} >> ${t}`;
    } else {
      return e;
    }
  } else {
    return t || undefined;
  }
}
function regExpSelectorSource(e) {
  let t = e;
  if (e.unicode || t.unicodeSets) {
    return String(e);
  } else {
    return String(e)
      .replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\\\$3")
      .replace(/>>/g, "\\>\\>");
  }
}
function textSelectorArg(e, t) {
  if (typeof e != "string") {
    return regExpSelectorSource(e);
  } else {
    return `${JSON.stringify(e)}${t ? "s" : "i"}`;
  }
}
function attributeSelectorArg(e, t) {
  if (typeof e != "string") {
    return regExpSelectorSource(e);
  } else {
    return `"${e.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${t ? "s" : "i"}`;
  }
}
function roleSelector(e, t) {
  if (!e) {
    throw new Error("getByRole requires a role");
  }
  let r = [];
  if (t.name !== undefined) {
    r.push(`[name=${attributeSelectorArg(t.name, !!t.exact)}]`);
  }
  return `internal:role=${e}${r.join("")}`;
}
function textSelector(e, t) {
  if (typeof e != "string" && !isRegExp(e)) {
    throw new Error("getByText requires a string or RegExp");
  }
  return `internal:text=${textSelectorArg(e, !!t.exact)}`;
}
function labelSelector(e, t) {
  if (typeof e != "string" && !isRegExp(e)) {
    throw new Error("getByLabel requires a string or RegExp");
  }
  return `internal:label=${textSelectorArg(e, !!t.exact)}`;
}
function placeholderSelector(e, t) {
  if (typeof e != "string" && !isRegExp(e)) {
    throw new Error("getByPlaceholder requires a string or RegExp");
  }
  return `internal:attr=[placeholder=${attributeSelectorArg(e, !!t.exact)}]`;
}
function testIdSelector(e) {
  if (!e) {
    throw new Error("getByTestId requires a testId");
  }
  return `internal:testid=[data-testid=${attributeSelectorArg(e, true)}]`;
}
var PlaywrightFrameLocator = class e {
  #e;
  #t;
  #r;
  #a;
  constructor({ browserId: e, tabId: t, frameSelector: r, transport: a }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
    this.#a = a;
  }
  locator(e) {
    if (!e) {
      throw new Error("frameLocator.locator requires a selector");
    }
    let t = `${this.#r} >> internal:control=enter-frame >> ${e}`;
    return new PlaywrightLocator({
      browserId: this.#e,
      tabId: this.#t,
      selector: t,
      transport: this.#a,
    });
  }
  frameLocator(t) {
    if (!t) {
      throw new Error("frameLocator.frameLocator requires a selector");
    }
    return new e({
      browserId: this.#e,
      tabId: this.#t,
      frameSelector: `${this.#r} >> internal:control=enter-frame >> ${t}`,
      transport: this.#a,
    });
  }
  getByRole(e, t = {}) {
    return this.locator(roleSelector(e, t));
  }
  getByText(e, t = {}) {
    return this.locator(textSelector(e, t));
  }
  getByLabel(e, t = {}) {
    return this.locator(labelSelector(e, t));
  }
  getByPlaceholder(e, t = {}) {
    return this.locator(placeholderSelector(e, t));
  }
  getByTestId(e) {
    return this.locator(testIdSelector(e));
  }
};
var PlaywrightDownload = class {
  #e;
  #t;
  #r;
  #a;
  constructor({ browserId: e, tabId: t, downloadId: r, transport: a }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
    this.#a = a;
  }
  async path({ timeoutMs: e } = {}) {
    return (
      (
        await this.#a.send({
          command: PlaywrightDownloadPath.create({
            browser_id: this.#e,
            tab_id: this.#t,
            download_id: this.#r,
            timeout_ms: e,
          }),
          timeoutMs: e,
        })
      ).path ?? null
    );
  }
};
var PlaywrightFileChooser = class {
  #e;
  #t;
  #r;
  #a;
  #i;
  constructor({ browserId: e, tabId: t, fileChooserId: r, isMultiple: a, transport: i }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
    this.#a = a;
    this.#i = i;
  }
  isMultiple() {
    return this.#a;
  }
  async setFiles(e, { timeoutMs: t } = {}) {
    if (e == null) {
      throw new Error("fileChooser.setFiles requires files");
    }
    let r = Array.isArray(e) ? e : [e];
    if (!r.length) {
      throw new Error("fileChooser.setFiles requires at least one file");
    }
    try {
      await this.#i.send({
        command: PlaywrightFileChooserSetFiles.create({
          browser_id: this.#e,
          tab_id: this.#t,
          file_chooser_id: this.#r,
          files: r,
          timeout_ms: t,
        }),
        timeoutMs: t,
      });
    } catch (e) {
      throw withErrorContext(e, "fileChooser.setFiles failed");
    }
  }
};
var PlaywrightAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async goBack() {
    await this.#r.send({
      command: NavigateTabBack.create({
        browser_id: this.#e,
        tab_id: this.#t,
      }),
    });
  }
  async goForward() {
    await this.#r.send({
      command: NavigateTabForward.create({
        browser_id: this.#e,
        tab_id: this.#t,
      }),
    });
  }
  async evaluate(e, t, r) {
    return (
      await this.#r.send({
        command: PlaywrightEvaluate.create({
          browser_id: this.#e,
          script: pageEvaluateScript(e, t),
          tab_id: this.#t,
          timeout_ms: r?.timeoutMs,
        }),
        timeoutMs: r?.timeoutMs,
      })
    ).value;
  }
  locator(e) {
    if (!e) {
      throw new Error("playwright.locator requires a selector");
    }
    return new PlaywrightLocator({
      browserId: this.#e,
      tabId: this.#t,
      selector: e,
      transport: this.#r,
    });
  }
  getByRole(e, t = {}) {
    return this.locator(roleSelector(e, t));
  }
  getByText(e, t = {}) {
    return this.locator(textSelector(e, t));
  }
  getByLabel(e, t = {}) {
    return this.locator(labelSelector(e, t));
  }
  getByPlaceholder(e, t = {}) {
    return this.locator(placeholderSelector(e, t));
  }
  getByTestId(e) {
    return this.locator(testIdSelector(e));
  }
  frameLocator(e) {
    if (!e) {
      throw new Error("playwright.frameLocator requires a selector");
    }
    return new PlaywrightFrameLocator({
      browserId: this.#e,
      tabId: this.#t,
      frameSelector: e,
      transport: this.#r,
    });
  }
  async waitForURL(e, t = {}) {
    if (!e) {
      throw new Error("playwright.waitForURL requires a url");
    }
    await this.#r.send({
      command: PlaywrightWaitForURL.create({
        browser_id: this.#e,
        tab_id: this.#t,
        url: e,
        wait_until: t.waitUntil,
        timeout_ms: t.timeoutMs,
      }),
      timeoutMs: t.timeoutMs,
    });
  }
  async waitForLoadState(e = {}) {
    await this.#r.send({
      command: PlaywrightWaitForLoadState.create({
        browser_id: this.#e,
        tab_id: this.#t,
        state: e.state,
        timeout_ms: e.timeoutMs,
      }),
      timeoutMs: e.timeoutMs,
    });
  }
  async waitForTimeout(e) {
    if (!Number.isInteger(e) || e < 0) {
      throw new Error("playwright.waitForTimeout requires a non-negative integer");
    }
    await this.#r.send({
      command: PlaywrightWaitForTimeout.create({
        browser_id: this.#e,
        tab_id: this.#t,
        timeout_ms: e,
      }),
      timeoutMs: e + 2000,
    });
  }
  waitForEvent(e, t = {}) {
    let r = this.#a(e, t);
    r.catch(() => {});
    return r;
  }
  async #a(e, t) {
    if (e === "download") {
      let e = t.timeoutMs ?? 120000;
      let r = await this.#r.send({
        command: PlaywrightWaitForDownload.create({
          browser_id: this.#e,
          tab_id: this.#t,
          timeout_ms: e,
        }),
        timeoutMs: e,
      });
      return new PlaywrightDownload({
        browserId: this.#e,
        tabId: this.#t,
        downloadId: r.download_id,
        transport: this.#r,
      });
    }
    if (e === "filechooser") {
      let e = await this.#r.send({
        command: PlaywrightWaitForFileChooser.create({
          browser_id: this.#e,
          tab_id: this.#t,
          timeout_ms: t.timeoutMs,
        }),
        timeoutMs: t.timeoutMs,
      });
      return new PlaywrightFileChooser({
        browserId: this.#e,
        tabId: this.#t,
        fileChooserId: e.file_chooser_id,
        isMultiple: e.is_multiple,
        transport: this.#r,
      });
    }
    throw new Error("playwright.waitForEvent only supports 'download' and 'filechooser'");
  }
  async expectNavigation(e, t = {}) {
    let r = t.url
      ? this.waitForURL(t.url, {
          timeoutMs: t.timeoutMs,
          waitUntil: t.waitUntil,
        })
      : this.waitForLoadState({
          timeoutMs: t.timeoutMs,
          state: t.waitUntil,
        });
    let a = Promise.resolve().then(e);
    let [i] = await Promise.all([a, r]);
    return i;
  }
  async elementInfo(e) {
    let t = pointOf("playwright.elementInfo", e);
    return await this.#r.send({
      command: PlaywrightElementInfo.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: t.x,
        y: t.y,
        include_non_interactable: e.includeNonInteractable,
      }),
    });
  }
  async elementScreenshot(e) {
    let t = pointOf("playwright.elementScreenshot", e);
    let r = await this.#r.send({
      command: PlaywrightElementScreenshot.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: t.x,
        y: t.y,
        include_non_interactable: e.includeNonInteractable,
      }),
    });
    return base64ToBytes(r.data);
  }
  async domSnapshot() {
    return (
      await this.#r.send({
        command: PlaywrightDomSnapshot.create({
          browser_id: this.#e,
          tab_id: this.#t,
        }),
      })
    ).dom_snapshot;
  }
};
var DomCUAAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async get_visible_dom() {
    return this.#r.send({
      command: DomCuaGetVisibleDom.create({
        browser_id: this.#e,
        tab_id: this.#t,
      }),
    });
  }
  async click(e) {
    let t = requiredDomNodeId(e?.node_id, "dom_cua.click");
    await this.#r.send({
      command: DomCuaClick.create({
        browser_id: this.#e,
        tab_id: this.#t,
        node_id: t,
      }),
    });
  }
  async double_click(e) {
    let t = requiredDomNodeId(e?.node_id, "dom_cua.double_click");
    await this.#r.send({
      command: DomCuaDoubleClick.create({
        browser_id: this.#e,
        tab_id: this.#t,
        node_id: t,
      }),
    });
  }
  async scroll({ node_id: e, x: t, y: r }) {
    if (typeof t != "number" || typeof r != "number") {
      throw new Error("dom_cua.scroll requires x and y numbers");
    }
    let a = e === undefined ? undefined : domNodeIdOf(e, "dom_cua.scroll");
    await this.#r.send({
      command: DomCuaScroll.create({
        browser_id: this.#e,
        tab_id: this.#t,
        node_id: a,
        scroll_x: t,
        scroll_y: r,
      }),
    });
  }
  async type({ text: e }) {
    if (typeof e != "string") {
      throw new Error("dom_cua.type requires text");
    }
    await this.#r.send({
      command: DomCuaType.create({
        browser_id: this.#e,
        tab_id: this.#t,
        text: e,
      }),
    });
  }
  async keypress(e) {
    if (!Array.isArray(e?.keys) || e.keys.length === 0) {
      throw new Error("dom_cua.keypress requires a non-empty keys array");
    }
    await this.#r.send({
      command: DomCuaKeypress.create({
        browser_id: this.#e,
        tab_id: this.#t,
        keys: e.keys,
      }),
    });
  }
  async downloadMedia(e) {
    let t = requiredDomNodeId(e?.node_id, "dom_cua.downloadMedia");
    await this.#r.send({
      command: DomCuaDownloadMedia.create({
        browser_id: this.#e,
        tab_id: this.#t,
        node_id: t,
        timeout_ms: e.timeoutMs,
      }),
      timeoutMs: e.timeoutMs,
    });
  }
};
function requiredDomNodeId(e, t) {
  if (e === undefined) {
    throw new Error(`${t} requires a node_id`);
  }
  return domNodeIdOf(e, t);
}
function domNodeIdOf(e, t) {
  let r = DomCuaClick.DomNodeIdSchema.safeParse(e);
  if (!r.success) {
    throw new Error(`${t} ${r.error.issues[0]?.message ?? "has an invalid node_id"}`);
  }
  return r.data;
}
var CUAAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async click(e) {
    if (typeof e?.x != "number" || typeof e?.y != "number") {
      throw new Error("cua.click requires x and y");
    }
    await this.#r.send({
      command: CuaClick.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: e.x,
        y: e.y,
        button: e.button,
        keys: e.keypress,
      }),
    });
  }
  async scroll(e) {
    if (
      typeof e?.x != "number" ||
      typeof e?.y != "number" ||
      typeof e?.scrollX != "number" ||
      typeof e?.scrollY != "number"
    ) {
      throw new Error("cua.scroll requires x, y, scrollX, and scrollY");
    }
    await this.#r.send({
      command: CuaScroll.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: e.x,
        y: e.y,
        scroll_x: e.scrollX,
        scroll_y: e.scrollY,
        keys: e.keypress,
      }),
    });
  }
  async double_click(e) {
    if (typeof e?.x != "number" || typeof e?.y != "number") {
      throw new Error("cua.double_click requires x and y");
    }
    await this.#r.send({
      command: CuaDoubleClick.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: e.x,
        y: e.y,
        keys: e.keypress,
      }),
    });
  }
  async type(e) {
    if (typeof e?.text != "string") {
      throw new Error("cua.type requires text");
    }
    await this.#r.send({
      command: CuaType.create({
        browser_id: this.#e,
        tab_id: this.#t,
        text: e.text,
      }),
    });
  }
  async keypress(e) {
    if (!Array.isArray(e?.keys) || e.keys.length === 0) {
      throw new Error("cua.keypress requires a non-empty keys array");
    }
    await this.#r.send({
      command: CuaKeypress.create({
        browser_id: this.#e,
        tab_id: this.#t,
        keys: e.keys,
      }),
    });
  }
  async drag(e) {
    if (
      !Array.isArray(e?.path) ||
      e.path.length === 0 ||
      e.path.some((e) => typeof e?.x != "number" || typeof e?.y != "number")
    ) {
      throw new Error("cua.drag requires a non-empty path of {x, y} points");
    }
    await this.#r.send({
      command: CuaDrag.create({
        browser_id: this.#e,
        tab_id: this.#t,
        path: e.path,
        keys: e.keys,
      }),
    });
  }
  async move(e) {
    if (typeof e?.x != "number" || typeof e?.y != "number") {
      throw new Error("cua.move requires x and y");
    }
    await this.#r.send({
      command: CuaMove.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: e.x,
        y: e.y,
        keys: e.keys,
      }),
    });
  }
  async downloadMedia(e) {
    if (typeof e?.x != "number" || typeof e?.y != "number") {
      throw new Error("cua.downloadMedia requires x and y");
    }
    await this.#r.send({
      command: CuaDownloadMedia.create({
        browser_id: this.#e,
        tab_id: this.#t,
        x: e.x,
        y: e.y,
        timeout_ms: e.timeoutMs,
      }),
      timeoutMs: e.timeoutMs,
    });
  }
};
var AXAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async get(e = "state", t) {
    let r = await this.#a(e, t);
    switch (r.mode) {
      case "state":
        return r.state;
      case "screenshot":
        return r.screenshot;
      case "both":
        if (r.screenshot === undefined) {
          return {
            state: r.state,
          };
        } else {
          return {
            state: r.state,
            screenshot: r.screenshot,
          };
        }
    }
  }
  async write(e = "state", t) {
    let r = await this.#a(e, t);
    if (r.mode !== "screenshot") {
      await this.#r.display(r.state);
    }
    if (r.mode !== "state" && r.screenshot !== undefined) {
      await this.#r.display(r.screenshot);
    }
  }
  async click(e, t) {
    await this.#i({
      kind: "click",
      target: e,
      ...(t?.mouseButton === undefined
        ? {}
        : {
            mouse_button: t.mouseButton,
          }),
      ...(t?.clickCount === undefined
        ? {}
        : {
            click_count: t.clickCount,
          }),
    });
  }
  async drag(e, t) {
    await this.#i({
      kind: "drag",
      from: e,
      to: t,
    });
  }
  async paste(e, t, r) {
    await this.#i({
      kind: "paste",
      element_index: e,
      text: t,
      format: r?.format,
    });
  }
  async performSecondaryAction(e, t) {
    await this.#i({
      kind: "perform_secondary_action",
      element_index: e,
      action: t,
    });
  }
  async pressKey(e, t) {
    await this.#i({
      kind: "press_key",
      element_index: e,
      key: t,
    });
  }
  async scroll(e, t, r) {
    await this.#i({
      kind: "scroll",
      target: e,
      direction: t,
      ...(r === undefined
        ? {}
        : {
            pages: r,
          }),
    });
  }
  async selectText(e, t, r) {
    await this.#i({
      kind: "select_text",
      element_index: e,
      text: t,
      ...(r?.prefix === undefined
        ? {}
        : {
            prefix: r.prefix,
          }),
      ...(r?.suffix === undefined
        ? {}
        : {
            suffix: r.suffix,
          }),
      ...(r?.selectionType === undefined
        ? {}
        : {
            selection_type: r.selectionType,
          }),
    });
  }
  async setValue(e, t) {
    await this.#i({
      kind: "set_value",
      element_index: e,
      value: t,
    });
  }
  async typeText(e, t) {
    await this.#i({
      kind: "type_text",
      element_index: e,
      text: t,
    });
  }
  async #a(e, t) {
    let r = await this.#r.send({
      command: TabAxGetState.create({
        browser_id: this.#e,
        tab_id: this.#t,
        content:
          e === "state" ? "axState" : e === "screenshot" ? "screenshot" : "axStateAndScreenshot",
        ...(t?.disableDiffing === undefined
          ? {}
          : {
              disable_diffing: t.disableDiffing,
            }),
      }),
    });
    if (e === "state") {
      if (typeof r.state != "string") {
        throw new Error("ax capture returned no accessibility state");
      }
      return {
        mode: e,
        state: r.state,
      };
    }
    if (typeof r.data != "string") {
      if (
        e === "both" &&
        typeof r.screenshot_unavailable == "string" &&
        typeof r.state == "string"
      ) {
        return {
          mode: e,
          state: r.state,
        };
      }
      throw new Error("ax capture returned no screenshot data");
    }
    let a = base64ToBytes(r.data);
    if (e === "screenshot") {
      return {
        mode: e,
        screenshot: a,
      };
    }
    if (typeof r.state != "string") {
      throw new Error("ax capture returned no accessibility state");
    }
    return {
      mode: e,
      state: r.state,
      screenshot: a,
    };
  }
  async #i(e) {
    await this.#r.send({
      command: TabAxAction.create({
        browser_id: this.#e,
        tab_id: this.#t,
        action: e,
      }),
    });
  }
};
var ContentAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async export() {
    return (
      await this.#r.send({
        command: TabContentExport.create({
          browser_id: this.#e,
          tab_id: this.#t,
        }),
      })
    ).path;
  }
  async exportGsuite(e) {
    return (
      await this.#r.send({
        command: TabContentExportGSuite.create({
          browser_id: this.#e,
          tab_id: this.#t,
          format: e,
        }),
      })
    ).path;
  }
  async exportYouTubeTranscript() {
    return (
      await this.#r.send({
        command: TabContentExportYouTubeTranscript.create({
          browser_id: this.#e,
          tab_id: this.#t,
        }),
      })
    ).path;
  }
};
var TabClipboardAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async readText() {
    return (
      await this.#r.send({
        command: TabClipboardReadText.create({
          browser_id: this.#e,
          tab_id: this.#t,
        }),
      })
    ).text;
  }
  async writeText(e) {
    if (e == null) {
      throw new Error("tab.clipboard.writeText requires text");
    }
    await this.#r.send({
      command: TabClipboardWriteText.create({
        browser_id: this.#e,
        tab_id: this.#t,
        text: e,
      }),
    });
  }
  async read() {
    return (
      await this.#r.send({
        command: TabClipboardRead.create({
          browser_id: this.#e,
          tab_id: this.#t,
        }),
      })
    ).items.map((e) => ({
      entries: e.entries.map((e) => ({
        mimeType: e.mime_type,
        text: e.text,
        base64: e.base64,
      })),
      presentationStyle: e.presentation_style,
    }));
  }
  async write(e) {
    if (!Array.isArray(e) || e.length === 0) {
      throw new Error("tab.clipboard.write requires at least one clipboard item");
    }
    await this.#r.send({
      command: TabClipboardWrite.create({
        browser_id: this.#e,
        tab_id: this.#t,
        items: e.map((e) => ({
          presentation_style: e.presentationStyle,
          entries: e.entries.map((e) => ({
            mime_type: e.mimeType,
            text: e.text,
            base64: e.base64,
          })),
        })),
      }),
    });
  }
};
var TabDevAPI = class {
  #e;
  #t;
  #r;
  constructor({ browserId: e, tabId: t, transport: r }) {
    this.#e = e;
    this.#t = t;
    this.#r = r;
  }
  async logs(e = {}) {
    let t = devLogsFilterOf(e.filter);
    let r = devLogsLevelsOf(e.levels);
    let a = devLogsLimitOf(e.limit);
    let i = {
      browser_id: this.#e,
      tab_id: this.#t,
      ...(t !== undefined
        ? {
            filter: t,
          }
        : {}),
      ...(r !== undefined
        ? {
            levels: r,
          }
        : {}),
      ...(a !== undefined
        ? {
            limit: a,
          }
        : {}),
    };
    return (
      await this.#r.send({
        command: TabDevLogs.create(i),
      })
    ).logs;
  }
};
var devLogsFilterOf = (e) => {
  if (e != null) {
    if (typeof e != "string") {
      throw new Error("tab.dev.logs received an invalid filter");
    }
    return e;
  }
};
var devLogsLevelsOf = (e) => {
  if (e != null) {
    if (!Array.isArray(e) || e.length === 0) {
      throw new Error("tab.dev.logs received invalid levels");
    }
    return e.map((e) => {
      if (e === "warning") {
        return "warn";
      }
      if (TabDevLogs.LogLevelSchema.options.includes(e)) {
        return e;
      }
      throw new Error(`tab.dev.logs received invalid level "${String(e)}"`);
    });
  }
};
var devLogsLimitOf = (e) => {
  if (e != null) {
    if (!Number.isInteger(e) || e <= 0) {
      throw new Error("tab.dev.logs received an invalid limit");
    }
    return e;
  }
};
var BrowserCapabilityBase = class {
  constructor(e, t, r, a) {
    this.transport = e;
    this.browserId = t;
    this.documentationApi = r;
    this.info = a;
  }
  get id() {
    return this.info.id;
  }
  async documentation() {
    return await this.documentationApi.get(`capabilities/browser/${this.id}`);
  }
};
var TabCapabilityBase = class {
  constructor(e, t, r, a, i) {
    this.transport = e;
    this.browserId = t;
    this.tabId = r;
    this.documentationApi = a;
    this.info = i;
  }
  get id() {
    return this.info.id;
  }
  async documentation() {
    return await this.documentationApi.get(`capabilities/tab/${this.id}`);
  }
};
function browserCapabilityDefinition({ capability: e, info: t, internalOnly: r }) {
  return {
    capability: e,
    create: (r) =>
      new e({
        ...r,
        info: t,
      }),
    id: t.id,
    info: t,
    ...(r == null
      ? {}
      : {
          internalOnly: r,
        }),
  };
}
function tabCapabilityDefinition({ capability: e, info: t, internalOnly: r }) {
  return {
    capability: e,
    create: (r) =>
      new e({
        ...r,
        info: t,
      }),
    id: t.id,
    info: t,
    ...(r == null
      ? {}
      : {
          internalOnly: r,
        }),
  };
}
var Capabilities = class {
  #e;
  constructor(e) {
    this.#e = e;
  }
  async get(e) {
    let t = this.#e[e];
    if (!t) {
      throw new Error(`Capability is not available: ${e}`);
    }
    return t;
  }
  async list() {
    return Object.values(this.#e).map((e) => e.info);
  }
};
var TabBotDetectionCommands = {};
defineExports(TabBotDetectionCommands, {
  Report: () => TabBotDetectionCommandsReport,
});
var TabBotDetectionCommandsReport = {};
defineExports(TabBotDetectionCommandsReport, {
  PayloadSchema: () => TabBotDetectionCommandsReportPayloadSchema,
  ResultSchema: () => TabBotDetectionCommandsReportResultSchema,
  commandType: () => tabBotDetectionCommandsReportCommandType,
  create: () => createTabBotDetectionCommandsReport,
});
var botDetectionReasonSchema = z.enum(["captcha_failed", "access_denied", "challenge_loop", "unexpected_bot_error"]);
var botDetectionReportSchema = z.object({
  reason: botDetectionReasonSchema,
});
var tabBotDetectionCommandsReportCommandType = "tab_bot_detection_report";
var TabBotDetectionCommandsReportPayloadSchema = botDetectionReportSchema.extend({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabBotDetectionCommandsReportResultSchema = z.object({
  status: z.literal("reported"),
  hostname: z.string().nullable(),
});
function createTabBotDetectionCommandsReport(e) {
  return new AtlasCommand(tabBotDetectionCommandsReportCommandType, TabBotDetectionCommandsReportPayloadSchema, e);
}
var BotDetectionTabCapability = class extends TabCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, tabId: a, transport: i }) {
    super(i, e, a, t, r);
  }
  async report(e) {
    let t = TabBotDetectionCommandsReport.PayloadSchema.parse({
      ...e,
      browser_id: this.browserId,
      tab_id: this.tabId,
    });
    let r = await this.transport.send({
      command: TabBotDetectionCommandsReport.create(t),
    });
    return TabBotDetectionCommandsReport.ResultSchema.parse(r);
  }
};
var botDetectionTabCapabilityDefinition = tabCapabilityDefinition({
  capability: BotDetectionTabCapability,
  info: {
    id: "botDetection",
    description:
      "Use when the current tab is blocked by bot detection, a failed CAPTCHA, a hard access denial, or a repeated challenge/login loop.",
  },
});
var TabCdpCommands = {};
defineExports(TabCdpCommands, {
  Call: () => TabCdpCommandsCall,
  Events: () => TabCdpCommandsEvents,
});
var TabCdpCommandsCall = {};
defineExports(TabCdpCommandsCall, {
  PayloadSchema: () => TabCdpCommandsCallPayloadSchema,
  ResultSchema: () => TabCdpCommandsCallResultSchema,
  commandType: () => tabCdpCommandsCallCommandType,
  create: () => createTabCdpCommandsCall,
});
var cdpTargetSchema = z
  .object({
    session_id: z.string().min(1).optional(),
    target_id: z.string().min(1).optional(),
  })
  .refine(
    (e) => (e.session_id == null) != (e.target_id == null),
    "CDP target must provide exactly one of session_id or target_id.",
  );
var cdpEventSourceSchema = z.object({
  extensionId: z.string().optional(),
  sessionId: z.string().optional(),
  tabId: z.number().int().optional(),
  targetId: z.string().optional(),
});
var cdpEventSchema = z.object({
  sequence: z.number().int().positive(),
  source: cdpEventSourceSchema,
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
var tabCdpCommandsCallCommandType = "tab_cdp_call";
var TabCdpCommandsCallPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  target: cdpTargetSchema.optional(),
  timeout_ms: z.number().int().positive().optional(),
});
var TabCdpCommandsCallResultSchema = z.unknown();
function createTabCdpCommandsCall(e) {
  return new AtlasCommand(tabCdpCommandsCallCommandType, TabCdpCommandsCallPayloadSchema, e);
}
var TabCdpCommandsEvents = {};
defineExports(TabCdpCommandsEvents, {
  PayloadSchema: () => TabCdpCommandsEventsPayloadSchema,
  ResultSchema: () => TabCdpCommandsEventsResultSchema,
  commandType: () => tabCdpCommandsEventsCommandType,
  create: () => createTabCdpCommandsEvents,
});
var tabCdpCommandsEventsCommandType = "tab_cdp_events";
var TabCdpCommandsEventsPayloadSchema = z.object({
  after_sequence: z.number().int().nonnegative().optional(),
  browser_id: z.string(),
  limit: z.number().int().positive().max(1000).optional(),
  methods: z.array(z.string().min(1)).min(1).optional(),
  tab_id: z.string(),
  target: cdpTargetSchema.optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
});
var TabCdpCommandsEventsResultSchema = z.object({
  cursor: z.number().int().nonnegative(),
  events: z.array(cdpEventSchema),
  hasMore: z.boolean(),
  truncated: z.boolean(),
});
function createTabCdpCommandsEvents(e) {
  return new AtlasCommand(tabCdpCommandsEventsCommandType, TabCdpCommandsEventsPayloadSchema, e);
}
var CdpTabCapability = class extends TabCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, tabId: a, transport: i }) {
    super(i, e, a, t, r);
  }
  async send(e, t, r) {
    let a = await this.transport.send({
      command: TabCdpCommandsCall.create({
        browser_id: this.browserId,
        method: e,
        params: t,
        tab_id: this.tabId,
        target: cdpTargetOf(r?.target),
        timeout_ms: r?.timeoutMs,
      }),
      timeoutMs: r?.timeoutMs,
    });
    return TabCdpCommandsCall.ResultSchema.parse(a);
  }
  async readEvents(e) {
    let t = await this.transport.send({
      command: TabCdpCommandsEvents.create({
        after_sequence: e?.afterSequence,
        browser_id: this.browserId,
        limit: e?.limit,
        methods: e?.methods,
        tab_id: this.tabId,
        target: cdpTargetOf(e?.target),
        timeout_ms: e?.timeoutMs,
      }),
      timeoutMs: cdpEventsClientTimeoutMs(e?.timeoutMs),
    });
    return TabCdpCommandsEvents.ResultSchema.parse(t);
  }
};
var cdpTabCapabilityDefinition = tabCapabilityDefinition({
  capability: CdpTabCapability,
  info: {
    id: "cdp",
    description:
      "Send raw Chrome DevTools Protocol commands and read debugger events through a supported tab for developer use cases.",
  },
});
function cdpTargetOf(e) {
  if (e != null) {
    return {
      session_id: e.sessionId,
      target_id: e.targetId,
    };
  }
}
function cdpEventsClientTimeoutMs(e) {
  if (e != null && e > 0) {
    return e + 2000;
  } else {
    return undefined;
  }
}
var TabBrowserAuthCommands = {};
defineExports(TabBrowserAuthCommands, {
  Handoff: () => TabBrowserAuthCommandsHandoff,
});
var TabBrowserAuthCommandsHandoff = {};
defineExports(TabBrowserAuthCommandsHandoff, {
  PayloadSchema: () => TabBrowserAuthCommandsHandoffPayloadSchema,
  ResultSchema: () => TabBrowserAuthCommandsHandoffResultSchema,
  SubmissionAttemptEventSchema: () => TabBrowserAuthCommandsHandoffSubmissionAttemptEventSchema,
  SubmissionDiagnosticsSchema: () => TabBrowserAuthCommandsHandoffSubmissionDiagnosticsSchema,
  SubmissionRejectionSchema: () => TabBrowserAuthCommandsHandoffSubmissionRejectionSchema,
  commandType: () => tabBrowserAuthCommandsHandoffCommandType,
  create: () => createTabBrowserAuthCommandsHandoff,
});
var BROWSER_AUTH_ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
var RESERVED_BROWSER_AUTH_IDS = new Set(["__proto__", "constructor", "prototype"]);
var browserAuthFieldSchema = z.object({
  id: z
    .string()
    .regex(BROWSER_AUTH_ID_PATTERN)
    .refine((e) => !RESERVED_BROWSER_AUTH_IDS.has(e)),
  label: z.string(),
  type: z.string().min(1),
  autocomplete: z.string().nullable().optional(),
  required: z.boolean(),
  selector: z.string(),
});
var browserAuthSubmitSchema = z.object({
  selector: z.string(),
  action: z.enum(["click", "press_enter"]),
});
var browserAuthOptionSchema = z
  .object({
    id: z
      .string()
      .regex(BROWSER_AUTH_ID_PATTERN)
      .refine((e) => !RESERVED_BROWSER_AUTH_IDS.has(e)),
    label: z.string().trim().min(1).max(120),
    selector: z.string().optional(),
    field_ids: z.array(z.string()).max(6).optional(),
  })
  .refine(
    (e) => (e.selector != null) != (e.field_ids?.length ?? 0) > 0,
    "browser auth options require either a selector or credential fields",
  );
var browserAuthRequestSchema = z
  .object({
    origin: z.string(),
    fields: z.array(browserAuthFieldSchema).max(6),
    options: z.array(browserAuthOptionSchema).min(2).max(10).optional(),
    qr_code: z.literal(true).optional(),
    submit: browserAuthSubmitSchema.optional(),
    otpHandle: z.string().min(1).max(16384).optional(),
  })
  .refine(
    (e) => e.fields.length > 0 || e.options != null || e.qr_code === true,
    "browser auth requests require credential fields, sign-in options, or a QR code",
  );
var tabBrowserAuthCommandsHandoffCommandType = "tab_browser_auth_handoff";
var TabBrowserAuthCommandsHandoffPayloadSchema = browserAuthRequestSchema.and(
  z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  }),
);
var TabBrowserAuthCommandsHandoffSubmissionRejectionSchema = z.object({
  outcome: z.enum(["origin_changed", "submission_failed"]),
  reason: z.enum([
    "request_url_invalid",
    "request_scheme",
    "request_origin",
    "paused_iframe",
    "iframe_origin",
    "child_frame_origin",
    "other",
  ]),
  request_class: z.enum(["main_document", "background", "other"]),
  submission_phase: z.enum(["pending", "settled", "not_applicable"]),
});
var TabBrowserAuthCommandsHandoffSubmissionAttemptEventSchema = z.object({
  sequence: z.number().int().min(0).max(65535),
  kind: z.enum([
    "prompt_completed",
    "field_fill_started",
    "field_fill_completed",
    "field_fill_uncertain",
    "url_changed",
    "document_changed",
    "frame_changed",
    "reinspection_started",
    "reinspection_succeeded",
    "reinspection_failed",
    "site_request",
    "site_navigation",
    "site_submission_verified",
    "submit_started",
    "attempt_completed",
  ]),
  phase: z.enum(["prompt", "filling", "before_submit", "submitting", "settled"]),
  field_index: z.number().int().min(0).max(63).optional(),
  reinspection: z.number().int().min(1).max(3).optional(),
  outcome: z
    .enum([
      "submitted",
      "unavailable",
      "origin_changed",
      "page_changed",
      "locator_invalid",
      "submission_failed",
      "prompt_changed",
    ])
    .optional(),
  request_class: z.enum(["main_document", "background"]).optional(),
  method: z.enum(["get", "post", "other"]).optional(),
  origin_relation: z.enum(["same", "cross", "other"]).optional(),
});
var TabBrowserAuthCommandsHandoffSubmissionDiagnosticsSchema = z.object({
  schema_version: z.literal(1),
  request_id: z.string().uuid(),
  submission_mode: z.enum(["ordinary", "private"]),
  first_rejection: TabBrowserAuthCommandsHandoffSubmissionRejectionSchema.optional(),
  terminal_rejection: TabBrowserAuthCommandsHandoffSubmissionRejectionSchema.optional(),
  attempt_events: z.array(TabBrowserAuthCommandsHandoffSubmissionAttemptEventSchema).max(64).optional(),
  dropped_attempt_events: z.number().int().min(0).max(65535).optional(),
});
var TabBrowserAuthCommandsHandoffResultSchema = z.object({
  status: z.enum([
    "submitted",
    "declined",
    "cancelled",
    "unavailable",
    "expired",
    "origin_changed",
    "page_changed",
    "locator_invalid",
    "submission_failed",
  ]),
  locator_error: z
    .object({
      field_id: z.string(),
      reason: z.literal("not_user_visible"),
    })
    .optional(),
  selected_option: z.string().optional(),
  reason: z.literal("user_took_over").optional(),
  submission_diagnostics: TabBrowserAuthCommandsHandoffSubmissionDiagnosticsSchema.optional(),
});
function createTabBrowserAuthCommandsHandoff(e) {
  return new AtlasCommand(tabBrowserAuthCommandsHandoffCommandType, TabBrowserAuthCommandsHandoffPayloadSchema, e);
}
var BrowserAuthTabCapability = class extends TabCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, tabId: a, transport: i }) {
    super(i, e, a, t, r);
  }
  async request(e) {
    let t = (function (e, t) {
      let r = {
        origin: e.origin,
        otpHandle: e.otpHandle,
        fields: e.fields.map((e) => {
          let r = {
            id: e.id,
            label: e.label,
            type: e.type,
            required: e.required,
            selector: browserAuthSelectorOf(e.selector, t),
          };
          if (e.autocomplete !== undefined) {
            r.autocomplete = e.autocomplete;
          }
          return r;
        }),
        ...(e.qr_code === true
          ? {
              qr_code: true,
            }
          : {}),
      };
      if (e.options != null) {
        r.options = e.options.map((e) => ({
          id: e.id,
          label: e.label,
          ...(e.field_ids == null
            ? {}
            : {
                field_ids: e.field_ids,
              }),
          ...(e.selector == null
            ? {}
            : {
                selector: browserAuthSelectorOf(e.selector, t),
              }),
        }));
      }
      if (e.submit != null) {
        r.submit = {
          action: e.submit.action,
          selector: browserAuthSelectorOf(e.submit.selector, t),
        };
      }
      return r;
    })(e, {
      browserId: this.browserId,
      tabId: this.tabId,
    });
    let r = TabBrowserAuthCommandsHandoff.create({
      ...t,
      browser_id: this.browserId,
      tab_id: this.tabId,
    });
    r.parse();
    let a = await this.transport.send({
      command: r,
    });
    return TabBrowserAuthCommandsHandoff.ResultSchema.parse(a);
  }
};
var browserAuthTabCapabilityDefinition = tabCapabilityDefinition({
  capability: BrowserAuthTabCapability,
  info: {
    id: "browserAuth",
    description:
      "MUST read its documentation before the first interaction with any authentication or sign-in flow required for the task. Covers method selection, secure user-provided credentials, and post-authentication verification and recovery.",
  },
});
function browserAuthSelectorOf(e, t) {
  if (typeof e == "string") {
    return e;
  }
  if (!(e instanceof PlaywrightLocator)) {
    throw new Error("browserAuth selector must be a string or PlaywrightLocator");
  }
  let r = PlaywrightLocator.browserAuthSelector(e);
  if (r.browserId !== t.browserId || r.tabId !== t.tabId) {
    throw new Error("browserAuth selector locator must belong to this tab");
  }
  return r.selector;
}
var TabPageAssetsCommands = {};
defineExports(TabPageAssetsCommands, {
  Bundle: () => TabPageAssetsCommandsBundle,
  List: () => TabPageAssetsCommandsList,
});
var TabPageAssetsCommandsBundle = {};
defineExports(TabPageAssetsCommandsBundle, {
  PayloadSchema: () => TabPageAssetsCommandsBundlePayloadSchema,
  ResultSchema: () => TabPageAssetsCommandsBundleResultSchema,
  commandType: () => tabPageAssetsCommandsBundleCommandType,
  create: () => createTabPageAssetsCommandsBundle,
});
var pageAssetKindSchema = z.enum(["font", "image", "script", "stylesheet", "video", "other"]);
var bundledAssetKindSchema = z.enum(["font", "image", "stylesheet", "video"]);
var pageAssetSourceSchema = z.object({
  kind: z.enum(["attribute", "computedStyle", "resource"]),
  nodeId: z.number().int().positive().optional(),
  property: z.string().optional(),
});
var pageAssetSchema = z.object({
  id: z.string(),
  kind: pageAssetKindSchema,
  name: z.string(),
  sources: z.array(pageAssetSourceSchema),
  url: z.string(),
});
var inlineSvgSchema = z.object({
  id: z.string(),
  markup: z.string(),
  name: z.string(),
});
var pageAssetInventorySchema = z.object({
  assets: z.array(pageAssetSchema),
  id: z.string(),
  inlineSvgs: z.array(inlineSvgSchema),
  pageUrl: z.string().nullable(),
  summary: z.object({
    byKind: z.record(pageAssetKindSchema, z.number().int().nonnegative()),
    inlineSvgCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  }),
});
var pageAssetBundleRequestSchema = z.object({
  assetIds: z.array(z.string()).optional(),
  inventoryId: z.string(),
  kinds: z.array(bundledAssetKindSchema).optional(),
});
var bundledAssetSchema = z.object({
  contentType: z.string().nullable(),
  id: z.string(),
  kind: bundledAssetKindSchema,
  name: z.string(),
  path: z.string(),
  url: z.string(),
});
var bundleFailureSchema = z.object({
  contentType: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  reason: z.string(),
  url: z.string(),
});
var pageAssetBundleSchema = z.object({
  assets: z.array(bundledAssetSchema),
  directoryPath: z.string(),
  failures: z.array(bundleFailureSchema),
  manifestPath: z.string(),
  summary: z.object({
    downloadedCount: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    requestedCount: z.number().int().nonnegative(),
  }),
});
var tabPageAssetsCommandsBundleCommandType = "tab_page_assets_bundle";
var TabPageAssetsCommandsBundlePayloadSchema = pageAssetBundleRequestSchema.extend({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabPageAssetsCommandsBundleResultSchema = pageAssetBundleSchema;
function createTabPageAssetsCommandsBundle(e) {
  return new AtlasCommand(tabPageAssetsCommandsBundleCommandType, TabPageAssetsCommandsBundlePayloadSchema, e);
}
var TabPageAssetsCommandsList = {};
defineExports(TabPageAssetsCommandsList, {
  PayloadSchema: () => TabPageAssetsCommandsListPayloadSchema,
  ResultSchema: () => TabPageAssetsCommandsListResultSchema,
  commandType: () => tabPageAssetsCommandsListCommandType,
  create: () => createTabPageAssetsCommandsList,
});
var tabPageAssetsCommandsListCommandType = "tab_page_assets_list";
var TabPageAssetsCommandsListPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
});
var TabPageAssetsCommandsListResultSchema = pageAssetInventorySchema;
function createTabPageAssetsCommandsList(e) {
  return new AtlasCommand(tabPageAssetsCommandsListCommandType, TabPageAssetsCommandsListPayloadSchema, e);
}
var PageAssetsTabCapability = class extends TabCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, tabId: a, transport: i }) {
    super(i, e, a, t, r);
  }
  async list() {
    let e = await this.transport.send({
      command: TabPageAssetsCommandsList.create({
        browser_id: this.browserId,
        tab_id: this.tabId,
      }),
    });
    return TabPageAssetsCommandsList.ResultSchema.parse(e);
  }
  async bundle(e) {
    let t = await this.transport.send({
      command: TabPageAssetsCommandsBundle.create({
        ...e,
        browser_id: this.browserId,
        tab_id: this.tabId,
      }),
    });
    return TabPageAssetsCommandsBundle.ResultSchema.parse(t);
  }
};
var pageAssetsTabCapabilityDefinition = tabCapabilityDefinition({
  capability: PageAssetsTabCapability,
  info: {
    id: "pageAssets",
    description:
      "List assets already observed in the current page state and bundle selected assets into a temporary local artifact.",
  },
});
var webMcpTabCapabilityInfo = {
  id: "webmcp",
  description:
    "Fetch page-defined WebMCP tools bound to the current document, then call them through the returned object.",
};
function toWebMcpToolDescriptor(e) {
  return {
    name: e.name,
    call_name: e.call_name,
    ...(e.title == null
      ? {}
      : {
          title: e.title,
        }),
    ...(e.description == null
      ? {}
      : {
          description: e.description,
        }),
    inputSchema: e.input_schema,
    ...(e.annotations == null
      ? {}
      : {
          annotations: e.annotations,
        }),
    ...(e.origin == null
      ? {}
      : {
          origin: e.origin,
        }),
    ...(e.pageUrl == null
      ? {}
      : {
          pageUrl: e.pageUrl,
        }),
  };
}
var TabWebMcpCapability = class extends TabCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, tabId: a, transport: i }) {
    super(i, e, a, t, r);
  }
  async fetchTools() {
    let e = WebMcpListTools.ResultSchema.parse(
      await this.transport.send({
        command: WebMcpListTools.create({
          browser_id: this.browserId,
          tab_id: this.tabId,
        }),
      }),
    );
    let t = e.tools.map(toWebMcpToolDescriptor);
    let r = new Map(e.tools.map((e) => [e.call_name, e]));
    let a = (function (e) {
      if (e.length === 0) {
        return "No WebMCP tools are available in this document.";
      } else {
        return [
          "WebMCP tools available in this document:",
          JSON.stringify(
            e.map(({ call_name: e, ...t }) => ({
              ...t,
              name: e,
            })),
            null,
            2,
          ),
          "Call tools.call(name, input) to invoke one.",
        ].join("\n");
      }
    })(t);
    return Object.freeze({
      description: () => a,
      call: async (e, t, a) => {
        let i = e.trim();
        let s = r.get(i);
        if (s == null) {
          throw new Error(
            `WebMCP tool ${JSON.stringify(i)} is not available in this snapshot. Call fetchTools() again.`,
          );
        }
        return (
          await this.transport.send({
            command: WebMcpInvokeTool.create({
              browser_id: this.browserId,
              tab_id: this.tabId,
              tool_name: s.name,
              tool_description: s.description,
              tool_title: s.title,
              registration_id: s.registration_id,
              input: t,
              ...(a?.timeoutMs == null
                ? {}
                : {
                    timeout_ms: a.timeoutMs,
                  }),
            }),
          })
        ).result;
      },
    });
  }
};
var webMcpTabCapabilityDefinition = tabCapabilityDefinition({
  capability: TabWebMcpCapability,
  info: webMcpTabCapabilityInfo,
});
var tabCapabilityDefinitions = [cdpTabCapabilityDefinition, botDetectionTabCapabilityDefinition, browserAuthTabCapabilityDefinition, pageAssetsTabCapabilityDefinition, webMcpTabCapabilityDefinition];
var tabCapabilityFactories = (function (e) {
  return new Map(e.map((e) => [e.id, e.create]));
})(tabCapabilityDefinitions);
var JsDialog = class {
  constructor({ browserId: e, dialogId: t, tabId: r, transport: a, type: i }) {
    this.browserId = e;
    this.dialogId = t;
    this.tabId = r;
    this.transport = a;
    this.type = i;
  }
  async dismiss() {
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "dismiss",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        tab_id: this.tabId,
      }),
    });
  }
};
var AlertDialog = class extends JsDialog {
  constructor(e) {
    super({
      ...e,
      type: "alert",
    });
  }
};
var BeforeUnloadDialog = class extends JsDialog {
  constructor(e) {
    super({
      ...e,
      type: "beforeunload",
    });
  }
};
var ConfirmDialog = class extends JsDialog {
  constructor(e) {
    super({
      ...e,
      type: "confirm",
    });
  }
  async accept() {
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "accept",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        tab_id: this.tabId,
      }),
    });
  }
};
var PromptDialog = class extends JsDialog {
  constructor(e) {
    super({
      ...e,
      type: "prompt",
    });
  }
  async accept(e) {
    if (typeof e != "string") {
      throw new Error("prompt.accept requires text");
    }
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "accept",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        prompt_text: e,
        tab_id: this.tabId,
      }),
    });
  }
};
var Tab = class {
  #e;
  #t;
  constructor({
    browserId: e,
    capabilities: t,
    documentation: r,
    transport: a,
    tabPayload: i = {},
  }) {
    if (!i.id) {
      throw new Error("Tab requires an id");
    }
    this.#e = e;
    this.#t = a;
    this.id = i.id;
    this.playwright = new PlaywrightAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.dom_cua = new DomCUAAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.cua = new CUAAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.ax = new AXAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.content = new ContentAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.clipboard = new TabClipboardAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.dev = new TabDevAPI({
      browserId: e,
      tabId: this.id,
      transport: this.#t,
    });
    this.capabilities = (({
      browserId: e,
      capabilities: t,
      documentation: r,
      tabId: a,
      transport: i,
    }) => {
      let s = {};
      for (let n of t ?? []) {
        let t = tabCapabilityFactories.get(n.id);
        if (t != null) {
          Object.assign(s, {
            [n.id]: t({
              browserId: e,
              documentation: r,
              info: n,
              tabId: a,
              transport: i,
            }),
          });
        }
      }
      return new Capabilities(s);
    })({
      browserId: this.#e,
      capabilities: t,
      documentation: r,
      tabId: this.id,
      transport: this.#t,
    });
  }
  async goto(e) {
    if (!e) {
      throw new Error("tab.goto requires a url");
    }
    this.#a();
    if (!this.id) {
      throw new Error("tab.goto requires a tab id");
    }
    await this.#t.send({
      command: NavigateTab.create({
        browser_id: this.#e,
        tab_id: this.id,
        url: e,
      }),
    });
  }
  async markHandoff() {
    await this.#r("handoff");
  }
  async markDeliverable() {
    await this.#r("deliverable");
  }
  async requestManualHandoff() {
    await this.#t.send({
      command: ManualHandoff.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
  async back() {
    this.#a();
    await this.#t.send({
      command: NavigateTabBack.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
  async forward() {
    this.#a();
    await this.#t.send({
      command: NavigateTabForward.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
  async reload() {
    this.#a();
    await this.#t.send({
      command: NavigateTabReload.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
  async close() {
    this.#a();
    await this.#t.send({
      command: CloseTab.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
  async screenshot(e = {}) {
    this.#a();
    let t = {
      browser_id: this.#e,
      tab_id: this.id,
      fullPage: e.fullPage,
    };
    if (e.clip) {
      let { x: r, y: a, width: i, height: s } = e.clip;
      if (
        typeof r != "number" ||
        typeof a != "number" ||
        typeof i != "number" ||
        typeof s != "number"
      ) {
        throw new Error("tab.screenshot clip requires x, y, width, and height");
      }
      t.cropX = r;
      t.cropY = a;
      t.cropWidth = i;
      t.cropHeight = s;
    }
    let r = await this.#t.send({
      command: TabScreenshot.create(t),
    });
    return base64ToBytes(r.data);
  }
  async title() {
    return (await this.#i()).title;
  }
  async url() {
    return (await this.#i()).url;
  }
  async getJsDialog() {
    this.#a();
    let e = (
      await this.#t.send({
        command: TabGetJsDialog.create({
          browser_id: this.#e,
          tab_id: this.id,
        }),
      })
    ).dialog;
    if (e != null) {
      return (function ({ browserId: e, dialogId: t, tabId: r, transport: a, type: i }) {
        switch (i) {
          case "alert":
            return new AlertDialog({
              browserId: e,
              dialogId: t,
              tabId: r,
              transport: a,
            });
          case "beforeunload":
            return new BeforeUnloadDialog({
              browserId: e,
              dialogId: t,
              tabId: r,
              transport: a,
            });
          case "confirm":
            return new ConfirmDialog({
              browserId: e,
              dialogId: t,
              tabId: r,
              transport: a,
            });
          case "prompt":
            return new PromptDialog({
              browserId: e,
              dialogId: t,
              tabId: r,
              transport: a,
            });
        }
      })({
        browserId: this.#e,
        dialogId: e.id,
        tabId: this.id,
        transport: this.#t,
        type: e.type,
      });
    }
  }
  async #r(e) {
    this.#a();
    await this.#t.send({
      command: MarkTab.create({
        browser_id: this.#e,
        tab_id: this.id,
        status: e,
      }),
    });
  }
  #a() {
    if (!this.#t) {
      throw new Error("Tab is not bound to a transport");
    }
  }
  async #i() {
    this.#a();
    return await this.#t.send({
      command: GetTab.create({
        browser_id: this.#e,
        tab_id: this.id,
      }),
    });
  }
};
var BrowserManagementCommands = {};
defineExports(BrowserManagementCommands, {
  Call: () => BrowserManagementCommandsCall,
  GetAuditTrail: () => BrowserManagementCommandsGetAuditTrail,
  commands: () => BrowserManagementCommandsByType,
});
var BrowserManagementCommandsCall = {};
defineExports(BrowserManagementCommandsCall, {
  PayloadSchema: () => BrowserManagementCommandsCallPayloadSchema,
  ResultSchema: () => BrowserManagementCommandsCallResultSchema,
  commandType: () => browserManagementCommandsCallCommandType,
  create: () => createBrowserManagementCommandsCall,
});
var browserManagementCommandsCallCommandType = "browser_management_call";
var BrowserManagementCommandsCallPayloadSchema = z.object({
  args: z.array(z.unknown()),
  browser_id: z.string(),
  method: z.string(),
  namespace: z.string(),
});
var BrowserManagementCommandsCallResultSchema = z.object({
  value: z.unknown(),
});
function createBrowserManagementCommandsCall(e) {
  return new AtlasCommand(browserManagementCommandsCallCommandType, BrowserManagementCommandsCallPayloadSchema, e);
}
var BrowserManagementCommandsGetAuditTrail = {};
defineExports(BrowserManagementCommandsGetAuditTrail, {
  AuditChangeSchema: () => BrowserManagementCommandsGetAuditTrailAuditChangeSchema,
  PayloadSchema: () => BrowserManagementCommandsGetAuditTrailPayloadSchema,
  ResultSchema: () => BrowserManagementCommandsGetAuditTrailResultSchema,
  commandType: () => browserManagementCommandsGetAuditTrailCommandType,
  create: () => createBrowserManagementCommandsGetAuditTrail,
});
var browserManagementCommandsGetAuditTrailCommandType = "browser_management_get_audit_trail";
var BrowserManagementCommandsGetAuditTrailPayloadSchema = BrowserManagementCommandsCallPayloadSchema.pick({
  browser_id: true,
});
var BrowserManagementCommandsGetAuditTrailAuditChangeSchema = BrowserManagementCommandsCallPayloadSchema.omit({
  browser_id: true,
}).extend({
  before: z
    .object({
      bookmarks: z.array(
        z.object({
          id: z.string(),
          index: z.number().optional(),
          parentId: z.string().optional(),
          title: z.string(),
          url: z.string().optional(),
        }),
      ),
      tabLayout: z.object({
        groups: z.array(
          z.object({
            collapsed: z.boolean(),
            color: z.string(),
            id: z.number(),
            title: z.string().optional(),
            windowId: z.number(),
          }),
        ),
        tabs: z.array(
          z.object({
            autoDiscardable: z.boolean(),
            groupId: z.number(),
            id: z.number(),
            index: z.number(),
            pinned: z.boolean(),
            url: z.string().optional(),
            windowId: z.number(),
          }),
        ),
      }),
      windows: z.array(
        z.object({
          focused: z.boolean(),
          height: z.number().optional(),
          id: z.number(),
          left: z.number().optional(),
          state: z.string().optional(),
          top: z.number().optional(),
          width: z.number().optional(),
        }),
      ),
    })
    .partial(),
  createdAt: z.number(),
  result: z
    .union([
      z.number(),
      z.object({
        id: z.string(),
      }),
    ])
    .optional(),
});
var BrowserManagementCommandsGetAuditTrailResultSchema = z.object({
  changes: z.array(BrowserManagementCommandsGetAuditTrailAuditChangeSchema),
});
function createBrowserManagementCommandsGetAuditTrail(e) {
  return new AtlasCommand(browserManagementCommandsGetAuditTrailCommandType, BrowserManagementCommandsGetAuditTrailPayloadSchema, e);
}
var BrowserManagementCommandsByType = {
  [browserManagementCommandsCallCommandType]: BrowserManagementCommandsCall,
  [browserManagementCommandsGetAuditTrailCommandType]: BrowserManagementCommandsGetAuditTrail,
};
var ManagementBrowserCapability = class extends BrowserCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, transport: a }) {
    super(a, e, t, r);
    this.windows = this.createNamespace("windows");
    this.tabs = this.createNamespace("tabs");
    this.tabGroups = this.createNamespace("tabGroups");
    this.bookmarks = this.createNamespace("bookmarks");
  }
  async getAuditTrail() {
    let e = await this.transport.send({
      command: BrowserManagementCommandsGetAuditTrail.create({
        browser_id: this.browserId,
      }),
    });
    return BrowserManagementCommandsGetAuditTrail.ResultSchema.parse(e);
  }
  async invoke(e, t, ...r) {
    let a = await this.transport.send({
      command: BrowserManagementCommandsCall.create({
        args: r,
        browser_id: this.browserId,
        method: t,
        namespace: e,
      }),
    });
    return BrowserManagementCommandsCall.ResultSchema.parse(a).value;
  }
  createNamespace(e) {
    return new Proxy(
      {},
      {
        get: (t, r) => {
          if (typeof r == "string" && r !== "then" && r !== "toJSON" && !(r in Object.prototype)) {
            return (...t) => this.invoke(e, r, ...t);
          }
        },
      },
    );
  }
};
var managementBrowserCapabilityDefinition = browserCapabilityDefinition({
  capability: ManagementBrowserCapability,
  info: {
    id: "management",
    description:
      "Organize windows, tabs, tab groups, and bookmarks. Use only for user-requested browser organization.",
  },
});
var BrowserVisibilityCommands = {};
defineExports(BrowserVisibilityCommands, {
  Get: () => BrowserVisibilityCommandsGet,
  Set: () => BrowserVisibilityCommandsSet,
  commands: () => BrowserVisibilityCommandsByType,
});
var BrowserVisibilityCommandsGet = {};
defineExports(BrowserVisibilityCommandsGet, {
  PayloadSchema: () => BrowserVisibilityCommandsGetPayloadSchema,
  ResultSchema: () => BrowserVisibilityCommandsGetResultSchema,
  commandType: () => browserVisibilityCommandsGetCommandType,
  create: () => createBrowserVisibilityCommandsGet,
});
var browserVisibilityCommandsGetCommandType = "browser_visibility_get";
var BrowserVisibilityCommandsGetPayloadSchema = z.object({
  browser_id: z.string(),
});
var BrowserVisibilityCommandsGetResultSchema = z.object({
  visible: z.boolean(),
});
function createBrowserVisibilityCommandsGet(e) {
  return new AtlasCommand(browserVisibilityCommandsGetCommandType, BrowserVisibilityCommandsGetPayloadSchema, e);
}
var BrowserVisibilityCommandsSet = {};
defineExports(BrowserVisibilityCommandsSet, {
  PayloadSchema: () => BrowserVisibilityCommandsSetPayloadSchema,
  ResultSchema: () => BrowserVisibilityCommandsSetResultSchema,
  commandType: () => browserVisibilityCommandsSetCommandType,
  create: () => createBrowserVisibilityCommandsSet,
});
var browserVisibilityCommandsSetCommandType = "browser_visibility_set";
var BrowserVisibilityCommandsSetPayloadSchema = z.object({
  browser_id: z.string(),
  visible: z.boolean(),
});
var BrowserVisibilityCommandsSetResultSchema = z.object({});
function createBrowserVisibilityCommandsSet(e) {
  return new AtlasCommand(browserVisibilityCommandsSetCommandType, BrowserVisibilityCommandsSetPayloadSchema, e);
}
var BrowserVisibilityCommandsByType = {
  [browserVisibilityCommandsGetCommandType]: BrowserVisibilityCommandsGet,
  [browserVisibilityCommandsSetCommandType]: BrowserVisibilityCommandsSet,
};
var VisibilityBrowserCapability = class extends BrowserCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, transport: a }) {
    super(a, e, t, r);
  }
  async set(e) {
    let t = await this.transport.send({
      command: BrowserVisibilityCommandsSet.create({
        browser_id: this.browserId,
        visible: e,
      }),
    });
    BrowserVisibilityCommandsSet.ResultSchema.parse(t);
  }
  async get() {
    let e = await this.transport.send({
      command: BrowserVisibilityCommandsGet.create({
        browser_id: this.browserId,
      }),
    });
    return BrowserVisibilityCommandsGet.ResultSchema.parse(e).visible;
  }
};
var visibilityBrowserCapabilityDefinition = browserCapabilityDefinition({
  capability: VisibilityBrowserCapability,
  info: {
    id: "visibility",
    description:
      "Use to show or hide the browser to the user, and to determine the browser's current visibility. Keep browser work in the background unless the user asks to see it or live viewing is useful. When the browser should be visible, call set(true).",
  },
});
var BrowserViewportCommands = {};
defineExports(BrowserViewportCommands, {
  Reset: () => BrowserViewportCommandsReset,
  Set: () => BrowserViewportCommandsSet,
  commands: () => BrowserViewportCommandsByType,
});
var BrowserViewportCommandsReset = {};
defineExports(BrowserViewportCommandsReset, {
  PayloadSchema: () => BrowserViewportCommandsResetPayloadSchema,
  ResultSchema: () => BrowserViewportCommandsResetResultSchema,
  commandType: () => browserViewportCommandsResetCommandType,
  create: () => createBrowserViewportCommandsReset,
});
var browserViewportCommandsResetCommandType = "browser_viewport_reset";
var BrowserViewportCommandsResetPayloadSchema = z.object({
  browser_id: z.string(),
});
var BrowserViewportCommandsResetResultSchema = z.object({});
function createBrowserViewportCommandsReset(e) {
  return new AtlasCommand(browserViewportCommandsResetCommandType, BrowserViewportCommandsResetPayloadSchema, e);
}
var BrowserViewportCommandsSet = {};
defineExports(BrowserViewportCommandsSet, {
  PayloadSchema: () => BrowserViewportCommandsSetPayloadSchema,
  ResultSchema: () => BrowserViewportCommandsSetResultSchema,
  commandType: () => browserViewportCommandsSetCommandType,
  create: () => createBrowserViewportCommandsSet,
});
var browserViewportCommandsSetCommandType = "browser_viewport_set";
var BrowserViewportCommandsSetPayloadSchema = z.object({
  browser_id: z.string(),
  height: z.number().int().positive(),
  width: z.number().int().positive(),
});
var BrowserViewportCommandsSetResultSchema = z.object({});
function createBrowserViewportCommandsSet(e) {
  return new AtlasCommand(browserViewportCommandsSetCommandType, BrowserViewportCommandsSetPayloadSchema, e);
}
var BrowserViewportCommandsByType = {
  [browserViewportCommandsResetCommandType]: BrowserViewportCommandsReset,
  [browserViewportCommandsSetCommandType]: BrowserViewportCommandsSet,
};
var ViewportBrowserCapability = class extends BrowserCapabilityBase {
  constructor({ browserId: e, documentation: t, info: r, transport: a }) {
    super(a, e, t, r);
  }
  async set(e) {
    let t = await this.transport.send({
      command: BrowserViewportCommandsSet.create({
        browser_id: this.browserId,
        ...e,
      }),
    });
    BrowserViewportCommandsSet.ResultSchema.parse(t);
  }
  async reset() {
    let e = await this.transport.send({
      command: BrowserViewportCommandsReset.create({
        browser_id: this.browserId,
      }),
    });
    BrowserViewportCommandsReset.ResultSchema.parse(e);
  }
};
var viewportBrowserCapabilityDefinition = browserCapabilityDefinition({
  capability: ViewportBrowserCapability,
  info: {
    id: "viewport",
    description:
      "Controls an explicit browser viewport override for responsive or device-size testing. Use it when a task calls for specific dimensions or breakpoint validation; otherwise leave it unset so the browser uses its normal viewport. Reset temporary overrides before finishing unless the user asked to keep them.",
  },
});
var browserCapabilityDefinitions = [managementBrowserCapabilityDefinition, visibilityBrowserCapabilityDefinition, viewportBrowserCapabilityDefinition];
var browserCapabilityFactories = (function (e) {
  return new Map(e.map((e) => [e.id, e.create]));
})(browserCapabilityDefinitions);
var Browser = class {
  #e;
  #t;
  #r;
  constructor({ capabilities: e, onBrowserUsed: t, transport: r, browserId: a }) {
    this.#e = a;
    this.#t = t;
    this.#r = r;
    this.browserId = a;
    let i = new Documentation(r);
    this.capabilities = (({ browserId: e, capabilities: t, documentation: r, transport: a }) => {
      let i = {};
      for (let s of t ?? []) {
        let t = browserCapabilityFactories.get(s.id);
        if (t != null) {
          i[s.id] = t({
            browserId: e,
            documentation: r,
            info: s,
            transport: a,
          });
        }
      }
      return new Capabilities(i);
    })({
      browserId: a,
      capabilities: e?.browser,
      documentation: i,
      transport: r,
    });
    let s = (t) =>
      new Tab({
        browserId: a,
        capabilities: e?.tab,
        documentation: i,
        transport: r,
        tabPayload: t,
      });
    this.tabs = new Tabs({
      browserId: a,
      createTab: s,
      transport: r,
    });
    this.user = new BrowserUser({
      browserId: a,
      createTab: s,
      transport: r,
    });
  }
  async documentation() {
    this.#t?.();
    return await this.#r.send({
      command: GetBrowserDocumentation.create({
        browser_id: this.browserId,
      }),
    });
  }
  async history(e = {}) {
    if (e === null || Array.isArray(e) || typeof e != "object") {
      throw new Error("browser.history expects an options object");
    }
    let t = {
      browser_id: this.#e,
    };
    let r = historyQueriesOf(e.queries);
    let a = historyLimitOf(e.limit);
    let i = historyDateOf(e.from, "from");
    let s = historyDateOf(e.to, "to");
    if (r !== undefined) {
      t.queries = r;
    }
    if (a !== undefined) {
      t.limit = a;
    }
    if (i !== undefined) {
      t.from = i;
    }
    if (s !== undefined) {
      t.to = s;
    }
    return (
      await this.#r.send({
        command: BrowserUserHistory.create(t),
      })
    ).items;
  }
  async nameSession(e) {
    let t = e.trim();
    if (!t) {
      throw new Error("browser.nameSession requires a name");
    }
    await this.#r.send({
      command: NameSession.create({
        browser_id: this.browserId,
        name: t,
      }),
    });
  }
};
var historyDateOf = (e, t) => {
  if (e == null) {
    return;
  }
  let r = e instanceof Date ? e : new Date(e);
  if (Number.isNaN(r.getTime())) {
    throw new Error(`browser.history received an invalid ${t} date`);
  }
  return r.toISOString();
};
var historyQueriesOf = (e) => {
  if (e == null) {
    return;
  }
  if (!Array.isArray(e) || e.length === 0) {
    throw new Error("browser.history received invalid queries");
  }
  let t = [];
  for (let r of e) {
    if (typeof r != "string") {
      throw new Error("browser.history received invalid queries");
    }
    t.push(r);
  }
  return t;
};
var historyLimitOf = (e) => {
  if (e != null) {
    if (!Number.isInteger(e) || e <= 0) {
      throw new Error("browser.history received an invalid limit");
    }
    return e;
  }
};
var FunctionAgentTransport = class {
  constructor({ executeAgentCommand: e, displaySideEffect: t } = {}) {
    if (typeof e != "function") {
      throw new Error("FunctionAgentTransport requires an executeAgentCommand function");
    }
    this.executeAgentCommand = e;
    this.displaySideEffect = t ?? defaultDisplaySideEffect;
  }
  async display(e) {
    await this.displaySideEffect(e);
  }
  async send({ command: e, timeoutMs: t }) {
    let r = e.toJSON();
    let a = await this.executeAgentCommand({
      ...r,
      client_timeout_ms: typeof t == "number" && t > 0 ? t : undefined,
    });
    let i = await displaySideEffects(a, this.displaySideEffect);
    if (i == null) {
      throw new Error("transport send returned empty response");
    }
    return i;
  }
};
var displaySideEffects = async (e, t) => {
  let r = sideEffectEnvelopeSchema.safeParse(e);
  if (!r.success) {
    return e;
  }
  for (let e of r.data.side_effects) {
    await t(e);
  }
  let { side_effects: a, ...i } = r.data;
  return i;
};
var sideEffectEnvelopeSchema = z
  .object({
    side_effects: z.array(z.string()),
  })
  .passthrough();
var defaultDisplaySideEffect = async (e) => {
  let t = globalThis.display;
  if (typeof t != "function") {
    console.log(e);
  } else {
    await t(e);
  }
};
var BrowserApiRuntime = class {
  apiManifest;
  disabledMemberIds;
  view;
  constructor({ apiManifest: e, decorateTab: t, disabledMemberIds: r }) {
    this.apiManifest = e;
    this.disabledMemberIds = r;
    this.view = (function (e, t) {
      let r = new WeakMap();
      let a = Object.keys(e.interfaces).map((e) => {
        let t = Reflect.get(apiTypes, e);
        if (
          !(function (e) {
            return typeof e == "function" && e.prototype != null;
          })(t)
        ) {
          throw new Error(`Browser API interface has no runtime type: ${e}`);
        }
        return [t, e];
      });
      return (e, i) => {
        let s = new WeakMap();
        let n = (e) => {
          if (e == null || typeof e != "object") {
            return e;
          }
          return (
            r.get(e) ??
            (Array.isArray(e)
              ? e.map(n)
              : isPlainObject(e)
                ? Object.fromEntries(Object.entries(e).map(([e, t]) => [e, n(t)]))
                : e)
          );
        };
        let o = (e) => {
          if (e == null || typeof e != "object" || r.has(e)) {
            return e;
          }
          if (e instanceof Promise) {
            return e.then(o);
          }
          if (Array.isArray(e)) {
            return e.map(o);
          }
          let c = a.find(([t]) => e instanceof t)?.[1];
          if (c == null) {
            return e;
          }
          let d = s.get(e);
          if (d != null) {
            return d;
          }
          let l = (e) => typeof e != "string" || !i.has(`${c}.${e}`);
          let u = new Map();
          let h = new Proxy(e, {
            get(e, t) {
              if (!l(t)) {
                return;
              }
              let r = Reflect.get(e, t, e);
              if (t === "constructor") {
                return r;
              }
              if (typeof r != "function") {
                return o(r);
              }
              let a = u.get(t);
              if (a != null) {
                return a;
              }
              let i = (...t) =>
                o(
                  Reflect.apply(
                    r,
                    e,
                    t.map((e) => n(e)),
                  ),
                );
              u.set(t, i);
              return i;
            },
            getOwnPropertyDescriptor(e, t) {
              if (!l(t)) {
                return;
              }
              let r = Reflect.getOwnPropertyDescriptor(e, t);
              if (r != null && "value" in r) {
                return {
                  ...r,
                  value: o(r.value),
                };
              } else {
                return r;
              }
            },
            has: (e, t) => l(t) && Reflect.has(e, t),
            ownKeys: (e) => Reflect.ownKeys(e).filter(l),
          });
          s.set(e, h);
          r.set(h, e);
          if (h instanceof Tab) {
            t?.(h);
          }
          return h;
        };
        return o(e);
      };
    })(e, t);
  }
  createBrowser = ({ browserInfo: e, onBrowserUsed: t, transport: r }) => {
    let a = (function ({ apiManifest: e, browserInfo: t, disabledMemberIds: r }) {
      let a = new Set(r);
      for (let [r, i] of Object.entries(e.interfaces)) {
        for (let [e, s] of Object.entries(i)) {
          let i = `${r}.${e}`;
          if (!(
            t.apiSupportOverrides?.[i] ?? s.unsupportedByDefaultIn?.includes(t.type) !== true
          )) {
            a.add(i);
          }
        }
      }
      return a;
    })({
      apiManifest: this.apiManifest,
      browserInfo: e,
      disabledMemberIds: this.disabledMemberIds,
    });
    return this.view(
      new Browser({
        browserId: e.id,
        capabilities: e.capabilities,
        onBrowserUsed: t,
        transport: r,
      }),
      a,
    );
  };
  wrapAgent(e) {
    return this.view(e, this.disabledMemberIds);
  }
  createAgent({ displaySideEffect: e, executeAgentCommand: t }) {
    return this.wrapAgent(
      new Agent({
        createBrowser: this.createBrowser,
        transport: new FunctionAgentTransport({
          displaySideEffect: e,
          executeAgentCommand: t,
        }),
      }),
    );
  }
};
async function setupBrowserRuntime(e = {}) {
  let t = globalThis.nodeRepl;
  if (t == null || typeof t.rpc != "function") {
    throw new Error("Browser use requires a trusted Node REPL browser service");
  }
  let o = t.rpc;
  let u = (e) =>
    o("browser", {
      method: "setup",
      params: e,
    });
  let h = (e) =>
    o("browser", {
      method: "execute",
      params: e,
    });
  let p = (e) =>
    o("browser", {
      method: "executeWithRecovery",
      params: e,
    });
  let {
    apiManifest: b,
    disabledMemberIds: _,
    credentialRecoveryErrorVersion: y,
  } = await u({
    environment: e.environment ?? "codex-app",
    undocumentedApiMembers: e.undocumentedApiMembers,
    excludedDocumentation: e.excludedDocumentation,
  });
  return (function ({
    apiManifest: e,
    decorateTab: t,
    disabledMemberIds: r,
    displayBridge: a,
    executeAgentCommand: i,
  }) {
    return new BrowserApiRuntime({
      apiManifest: e,
      decorateTab: t,
      disabledMemberIds: r,
    }).createAgent({
      displaySideEffect: createSideEffectDisplay({
        displayBridge: a,
        displayTruncateMaxChars: 100000,
      }),
      executeAgentCommand: i,
    });
  })({
    apiManifest: b,
    decorateTab: e.decorateTab,
    disabledMemberIds: new Set(_),
    displayBridge: {
      displayImage: (e) => t.emitImage(e),
      displayValue: (e) => console.log(e),
    },
    async executeAgentCommand(e) {
      if (y !== 1) {
        return await h(e);
      }
      let t = await p(e);
      if (t?.ok === true) {
        return t.value;
      }
      let r = credentialRecoveryDetails(t?.ok === false ? t.error : undefined);
      throw r == null
        ? new Error("Browser service returned an invalid recovery response")
        : new BrowserCredentialRecoveryError(r);
    },
  });
}
export { setupBrowserRuntime };
