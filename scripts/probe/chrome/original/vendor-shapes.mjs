// Request shapes the pinned vendor browser service sends, for the fake runtime and the tests. Cited to the pinned
// readable `@oai/browser-desktop/scripts/browser-service.mjs` (BS) of 26.928.40906; node_repl forwards them as MCP
// `elicitation/create` in form mode with an empty object schema (the shape M6 observed for computer-use approvals).
//
// Origin access (BS:36462-36502, `vI`): message "Allow <browserName> to access <origin>?", meta below. `persist` is
// "always" when persistent approval is allowed (the default, BS:62136) and absent otherwise: an offered option, not
// a demand. A reply's `_meta.persist` "session" scopes the grant to the conversation (BS:63063-63074, `nN`).
const FORM = {mode: 'form', requestedSchema: {type: 'object', properties: {}}};

export function originAccessRequest(origin, {browserName = 'Browser use', persist = 'always', meta = {}, params = {}} = {}) {
  return {
    ...FORM,
    message: `Allow ${browserName} to access ${origin}?`,
    _meta: {
      codex_approval_kind: 'mcp_tool_call', codex_sensitive_action: true, codex_request_type: 'approval_request',
      connector_id: 'browser-use', connector_name: browserName,
      ...(persist === undefined ? {} : {persist}),
      tool_name: 'access_browser_origin', tool_title: 'Access browser origin',
      tool_params: {origin}, tool_params_display: [], origin,
      ...meta,
    },
    ...params,
  };
}

// File transfer (BS:36558-36607, `Dy`).
export function downloadRequest(origin) {
  return {...FORM, message: `Allow download from ${origin}?`, _meta: {
    codex_approval_kind: 'mcp_tool_call', connector_id: 'browser-use', connector_name: 'Browser use', persist: ['session', 'always'],
    tool_name: 'download_browser_files', tool_title: 'Download browser files', tool_params: {origin}, file_transfer: 'download', origin,
  }};
}

// Raw CDP on an origin (BS:36611-36660, `PI`).
export function rawCdpRequest(origin) {
  return {...FORM, message: `Allow Browser use to use full Chrome Developer Tools access on ${origin}`, _meta: {
    codex_approval_kind: 'mcp_tool_call', connector_id: 'browser-use', connector_name: 'Browser use', persist: 'always', riskLevel: 'high',
    tool_name: 'access_browser_origin_with_raw_cdp', tool_title: 'Use raw CDP on browser origin', tool_params: {origin},
    tool_params_display: [], full_cdp_access: true, origin,
  }};
}

// Browsing history (BS:36332-36366, `xI`).
export function historyRequest() {
  return {...FORM, message: 'Allow Browser use to use your browsing history for this task?', _meta: {
    codex_approval_kind: 'mcp_tool_call', connector_id: 'browser-use', connector_name: 'Browser use', persist: 'always',
    subtitle: 'ChatGPT can use records of pages visited, including from earlier sessions, to help with this task.',
    tool_params: {}, sensitive_data: 'browsing_history',
  }};
}

// The all-sites persistent scope key (BS:62109-62110): a grant wider than one origin.
export const ALL_SITES_SCOPE_KEY = 'browser_use_persistent_approval_scope';
