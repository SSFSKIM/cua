// What the model sees of the server: the four-tool surface (five with the browser surface, which adds profiles_list),
// server instructions with host notes for the enabled surfaces, and the result rewrites the proxy applies (image MIME
// correction, token-bearing URL redaction). Pure functions; the server applies them to relayed messages.
import {fail} from '../runtime/errors.mjs';

const SURFACES = ['computer', 'browser'];

// CUA_SHIM_SURFACES: computer (the default), browser, or both (comma-separated, any order), in canonical order.
export function surfacesFrom(value = 'computer') {
  const named = value.split(',').map(s => s.trim());
  if (!named.length || !named.every(s => SURFACES.includes(s)) || new Set(named).size !== named.length)
    fail('invalid_setting', 'CUA_SHIM_SURFACES must be computer, browser or computer,browser');
  return SURFACES.filter(s => named.includes(s));
}

// Upstream tools passed through with their own description and schema. turn_ended (completion is server-owned) and
// js_add_node_module_dir (it would widen what model code can import) stay private. Their search hints name the
// platform the computer surface drives (`os`: macos, or linux on Linux).
const PASSED_THROUGH = new Map([
  ['js', os => `control ${os} apps through their gui (computer use): click, type, read the screen, screenshot`],
  ['js_reset', os => `reset the computer-use session for ${os} gui control`],
]);
// Search hints when the browser surface is on (alone, or with computer use).
const BROWSER_HINTS = {
  browser: {js: () => 'operate the user\'s chrome browser profiles: open tabs, read pages, fill forms, screenshot', js_reset: () => 'reset the browser-use session'},
  both: {js: os => `control ${os} apps and the user's chrome browser profiles: click, type, fill forms, read, screenshot`, js_reset: () => 'reset the computer-use and browser-use session'},
};
const hintOs = platform => platform === 'linux' ? 'linux' : 'macos';

const NO_ARGUMENTS = {type: 'object', properties: {}, additionalProperties: false};

export const END_TASK_TOOL = {
  name: 'end_task',
  description: 'Finish the current computer-use task on this connection. Call it once the GUI work is done: it waits '
    + 'up to 5 s for running JavaScript to settle, then has the runtime complete the task. Returns status "ended", or '
    + '"noop" when no task is open. An error means completion could not be confirmed: the runtime is stopped, native '
    + 'cleanup is unconfirmed, and this connection accepts no more work.',
  inputSchema: NO_ARGUMENTS,
  annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  _meta: {'anthropic/searchHint': 'finish end complete the current macos gui computer-use task'},
};
const LINUX_END_TASK_TOOL = {...END_TASK_TOOL, _meta: {'anthropic/searchHint': 'finish end complete the current linux gui computer-use task'}};

export const SECRETS_LIST_TOOL = {
  name: 'secrets_list',
  description: 'List the keys of the secrets the user stored for computer-use input (with /secret KEY in Claude Code or '
    + '`cua secrets set KEY`), never their values. Returns status "ok" with labels (the keys), or status "unavailable"/"error" '
    + 'with a code when secret storage cannot be used on this connection. To enter a secret the user has authorized, pass exactly "{{secret:<label>}}" '
    + 'as the whole text of typeText or paste, or the whole value of setValue: the stored value is substituted outside '
    + 'your code and never returned. Anywhere else the marker is not expanded.',
  inputSchema: NO_ARGUMENTS,
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  _meta: {'anthropic/searchHint': 'list stored secret credential labels for computer-use typing'},
};

// With the browser surface, secret references also work as the whole value of a Chrome tab's locator.fill.
const SECRETS_LIST_BROWSER_TOOL = {
  ...SECRETS_LIST_TOOL,
  description: SECRETS_LIST_TOOL.description.replace('or the whole value of setValue:', 'or the whole value of setValue or of a Chrome tab\'s locator.fill:'),
};

// On Linux setValue does not exist (the vendor's Linux client sends paste as type_text), so the reference is taught
// for typeText and paste only.
const withoutSetValue = tool => ({...tool, description: tool.description.replace('the whole value of setValue or of', 'the whole value of').replace(', or the whole value of setValue', '')});
const LINUX_SECRETS_LIST_TOOL = withoutSetValue(SECRETS_LIST_TOOL);
const LINUX_SECRETS_LIST_BROWSER_TOOL = withoutSetValue(SECRETS_LIST_BROWSER_TOOL);

// The rules: what the vendor's API document leaves out, in rules an agent can follow. Several come from the first
// real-use run (docs/evidence/2026-10-05-homework-1b-dogfooding.md, issue #23): end_task was never called, calls ran in
// parallel, inputs were repeated against an unchanged state, and fixed waits stood in for readiness checks. Claude Code
// caps the server instructions, the vendor's own included, at 2,048 characters, so they carry only the rules for every
// call on every surface (issue #73). A surface's own rules live in the description of the tool they govern: the Chrome
// rules in profiles_list's (the call before any Chrome work), the computer rules in js's, the device rule in
// devices_use's. Claude Code caps each description at 2,048 characters too, keeping the head, so cua's go first.

// The Chrome rules. A failed selection sends the agent back to profiles_list: the vendor's own error for an id that is
// not live ("The Chrome instance is unavailable.") is raised inside the REPL, where cua cannot see it, while
// profiles_list names a stale binding. Which profile is meant stays the user's call (the dogfood agent bound one
// itself from tab contents). The 3 s line is spike #25's finding: the vendor browser service caps locator actions,
// waits and playwright.evaluate at 3 s (a per-call timeoutMs can only shorten it), and a cell timeout resets the
// kernel, losing the tab handle.
const BROWSER_RULES = [
  '- Give cua.getBrowser({extensionInstanceId}) only an id profiles_list returned for the profile the user means; if that fails, call profiles_list again. Never pick or bind a profile for the user.',
  '- Chrome tabs are DOM-only: tab.playwright locators, not native input; press keys on a focusable element, never a frame body; tab.cua.type pastes.',
  '- Locator actions, waits and evaluate stop at 3 s (timeoutMs can only shorten it); to wait longer, loop short waits to your own deadline under a larger js timeout_ms.',
  '- evaluate is read-only: no fetch, no require, objects are non-extensible.',
  '- createBrowserTab can take 60 s (js timeout_ms of at least 60000); after a timeout a tab may still have opened: tell the user, don\'t retry. In a one-window profile, closing your tab or end_task unloads it; mark a tab handoff to keep it.',
];

export const PROFILES_LIST_TOOL = {
  name: 'profiles_list',
  description: ['List the Chrome profiles the user registered for browser use, by key, with whether each is ready and, '
    + 'when ready, its extensionInstanceId; a profile that is not ready says why, and no other profile stands in for it. '
    + 'Call it before any Chrome work, and drive Chrome by these rules:', ...BROWSER_RULES].join('\n'),
  inputSchema: NO_ARGUMENTS,
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  _meta: {'anthropic/searchHint': 'list registered chrome browser profiles for browser use'},
};

// The device tools (Phase G, stdio connections only): the connection's target, `local` or a registered device
// (src/remote/devices.mjs), which every other tool then drives (src/mcp/target.mjs).
export const DEVICES_LIST_TOOL = {
  name: 'devices_list',
  description: 'List the machines this server can drive: "local" (this one) and each registered remote device, with its '
    + 'status (online, offline, locked or unauthorized; a code says more) and which one the tools drive now (current). '
    + 'Asking never opens a session on a device.',
  inputSchema: NO_ARGUMENTS,
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true},
  _meta: {'anthropic/searchHint': 'list remote devices: other macs or linux machines this computer use can control'},
};

// A device's surface rules are in its own tool descriptions, which the client never lists (it lists this server's), so
// switching returns them beside the device's host notes.
export const DEVICES_USE_TOOL = {
  name: 'devices_use',
  description: 'Switch every tool of this server (js, js_reset, end_task, secrets_list, profiles_list) to another machine: '
    + 'a device name from devices_list, or "local" for this one. Refused with task_open while a task is open: call '
    + 'end_task first. Switching to a device opens a session there and returns that machine\'s host notes (hostNotes) '
    + 'and its own js and profiles_list descriptions (tools): while it is the target, follow those instead of this '
    + 'server\'s. Its REPL starts empty. Switching away ends the device\'s session.',
  inputSchema: {type: 'object', properties: {device: {type: 'string', description: 'A device name from devices_list, or "local".'}}, required: ['device'], additionalProperties: false},
  annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
  _meta: {'anthropic/searchHint': 'switch computer use to a remote device: another mac or linux machine'},
};

export const LOCAL_TOOLS = new Set([END_TASK_TOOL.name, SECRETS_LIST_TOOL.name, PROFILES_LIST_TOOL.name]);
export const WORK_TOOLS = new Set(PASSED_THROUGH.keys());
export const DEVICE_TOOLS = new Set([DEVICES_LIST_TOOL.name, DEVICES_USE_TOOL.name]);

// The server instructions' notes: the rules for every call on every surface.
const TITLE = 'Host notes:';
const COMPUTER_HEAD = '- Use when a macOS app\'s GUI is the only way; the first js call returns the API docs.';
const LINUX_COMPUTER_HEAD = '- Use when a Linux app\'s GUI is the only way; the first js call returns the API docs.';
const BROWSER_HEAD = '- Use for the user\'s existing Chrome profiles when no API or skill fits; the first js call returns the API docs.';
// The store is a plain directory any cell can read under every sandbox mode (the vendor's read-deny would bind the
// trusted worker too); the rule keeps the agent on the reference.
const SECRETS_NOTE = '- Never read ~/.config/claude-secrets; type secrets as {{secret:KEY}}.';
const GENERAL_NOTES = [
  '- Call end_task as soon as the task is done, before your final reply. An error spends the connection: report it.',
  '- One controller per task, one js call at a time. Only timeout_ms stops a running cell, not cancelling.',
  '- Observe, act, verify: a call returning is not success. If the state is unchanged, stop and find out why rather than repeat.',
  '- Batch deterministic steps. Wait for a visible readiness condition in a bounded poll, not a fixed delay.',
  SECRETS_NOTE,
  '- Each tool\'s description carries the rules for its surface: follow them as these.',
];
// macOS asks per app; on Linux nothing asks (the Linux js rules say so).
const APPROVAL_NOTE = '- Apps ask for approval once per connection; report a declined app, don\'t retry.';
// With the device tools (a stdio connection), last.
const DEVICES_NOTE = '- devices_use moves every tool to that machine, under the notes and descriptions it returns; end_task first.';

export const DEFAULT_HOST_NOTES = [TITLE, COMPUTER_HEAD, ...GENERAL_NOTES, APPROVAL_NOTE].join('\n');
export const LINUX_HOST_NOTES = [TITLE, LINUX_COMPUTER_HEAD, ...GENERAL_NOTES].join('\n');

// The notes for the enabled surfaces on `platform` (the host's by default), with the devices rule where the device
// tools exist.
export function hostNotesFor(surfaces, {platform = process.platform, devices = false} = {}) {
  const notes = !surfaces.includes('computer') ? [TITLE, BROWSER_HEAD, ...GENERAL_NOTES].join('\n')
    : platform === 'linux' ? LINUX_HOST_NOTES : DEFAULT_HOST_NOTES;
  return [notes, ...(devices ? [DEVICES_NOTE] : [])].join('\n');
}

// cua's rules for js, ahead of the vendor's description (whose tail Claude Code may cut at 2,048 characters): the
// computer rules by platform and, with the browser surface, a pointer to profiles_list's rules, which the agent has
// read by then (only that tool hands out a profile's id).
//
// On Linux (Phase F) they differ where the vendor's Linux target does: apps are bound by X11 window, key names are X
// keysyms, setValue and selectText do not exist and paste types, and nothing asks the user per app (the owner's
// allow-all decision; cua adds no allowlist). DISPLAY and XAUTHORITY reach the runtime, so a model cell can talk to X
// directly: the trusted wrapper is not a boundary there. Text input is F2's measurement on Ubuntu 24.04 arm64
// (docs/evidence/2026-10-06-linux-acceptance.md): the helper's typeText and paste insert through AT-SPI and crashed the
// GTK3 editors gedit and mousepad (SIGSEGV in gtk_text_buffer_get_iter_at_offset), while pressKey typed into gedit; in
// GTK4's gnome-text-editor they inserted the text and then threw (Text.SetCaretOffset unsupported), which the general
// "observe, act, verify" rule covers. On x64 (#58, Ubuntu 24.04, the same gedit and GTK builds) typeText did not crash
// gedit but threw "editable Paste did not insert text"; pressKey typed on both, so the rule holds on both architectures.
const JS_TITLE = 'Host rules (cua), before the documentation below:';
const COMPUTER_RULES = [
  '- Prefer accessibility element indexes; coordinates are screenshot pixels (apply the host\'s downscale); role names are in the system language.',
  '- Drop a quit app\'s handle: getAXState() relaunches it.',
  '- typeText drops characters the layout cannot key (emoji); paste those and multiline text.',
  '- If REPL state is confused, js_reset and rebind; never also use osascript.',
];
const LINUX_COMPUTER_RULES = [
  '- Bind by window: cua.getApp({windowId}) with an id from listWindows(); if REPL state is confused, js_reset and rebind.',
  '- setValue and selectText do not exist; paste types like typeText.',
  '- typeText and paste crash GTK3 text views: type there with pressKey, one X keysym per call (minus, space).',
  '- Prefer accessibility element indexes; coordinates are screenshot pixels (apply the host\'s downscale).',
  '- No app asks for approval: this connection drives every window of the session; the trusted wrapper is not a boundary on Linux.',
];
const BROWSER_POINTER = '- Chrome: follow the rules in profiles_list\'s description (DOM-only tabs, the 3 s cap, read-only evaluate, slow createBrowserTab).';

export function jsRulesFor(surfaces, {platform = process.platform} = {}) {
  const computer = !surfaces.includes('computer') ? [] : platform === 'linux' ? LINUX_COMPUTER_RULES : COMPUTER_RULES;
  return [JS_TITLE, ...computer, ...(surfaces.includes('browser') ? [BROWSER_POINTER] : [])].join('\n');
}

// A model-visible profile entry: key and readiness, the instance id when bound, the reason when not ready. Never the
// Chrome directory (the text guidance names it where the user has to act in that profile).
export const profileView = ({key, ready, reason, extensionInstanceId}) => ({key, ready, ...(extensionInstanceId && ready ? {extensionInstanceId} : {}), ...(reason ? {reason} : {})});

export function withHostNotes(instructions, hostNotes) {
  return [instructions, hostNotes].filter(Boolean).join('\n\n');
}

const hintFor = (name, surfaces, platform) => (!surfaces.includes('browser') ? PASSED_THROUGH.get(name)
  : BROWSER_HINTS[surfaces.includes('computer') ? 'both' : 'browser'][name])(hintOs(platform));

export function modelTools(upstreamTools, {surfaces = ['computer'], platform = process.platform, devices = false} = {}) {
  const jsRules = jsRulesFor(surfaces, {platform});
  const passed = (Array.isArray(upstreamTools) ? upstreamTools : [])
    .filter(tool => PASSED_THROUGH.has(tool.name))
    .map(tool => ({
      ...tool,
      ...(tool.name === 'js' ? {description: [jsRules, tool.description].filter(Boolean).join('\n\n')} : {}),
      _meta: {...(tool._meta ?? {}), 'anthropic/searchHint': hintFor(tool.name, surfaces, platform)},
    }));
  const linux = platform === 'linux';
  const endTask = linux ? LINUX_END_TASK_TOOL : END_TASK_TOOL;
  const local = surfaces.includes('browser')
    ? [...passed, endTask, linux ? LINUX_SECRETS_LIST_BROWSER_TOOL : SECRETS_LIST_BROWSER_TOOL, PROFILES_LIST_TOOL]
    : [...passed, endTask, linux ? LINUX_SECRETS_LIST_TOOL : SECRETS_LIST_TOOL];
  return devices ? [...local, DEVICES_LIST_TOOL, DEVICES_USE_TOOL] : local;
}

// node_repl labels JPEG screenshots image/png; the bytes say what they are.
const MAGIC = [['/9j/', 'image/jpeg'], ['iVBOR', 'image/png'], ['R0lGOD', 'image/gif'], ['UklGR', 'image/webp']];
function sniff(item) {
  if (item?.type !== 'image' || typeof item.data !== 'string') return item;
  const hit = MAGIC.find(([magic]) => item.data.startsWith(magic));
  return hit && hit[1] !== item.mimeType ? {...item, mimeType: hit[1]} : item;
}

export function correctImages(result) {
  return Array.isArray(result?.content) ? {...result, content: result.content.map(sniff)} : result;
}

// Token-bearing URLs in js/js_reset results (issue #24): a page or tab inventory can carry a credential the agent has
// no use for, and a tool result stays in the client's transcript. The value of a query or fragment parameter named
// like a token, key or secret (its decoded name's last word is token, key, secret or apikey, so access_token, apiKey,
// client_secret, X-Refresh-Token; not monkey, keyword or tokens_left) becomes <redacted>, raw or URL-encoded, also
// inside a redirect parameter: a parameter start is recognized at the start of a string or after a non-space character
// (so `int &key=v;` in source text is not one), and a non-secret value is scanned on rather than skipped. A value runs
// to the next delimiter of its URL or a closing bracket it did not open, less trailing `}`, `,` or `.`. Every parameter
// value of the Playwright MCP extension's connect URL (chrome-extension://<id>/connect.html?mcpRelayUrl=…&token=…) and
// the path of its loopback relay URL are redacted too. Text content and structured content only; images, _meta and
// requests are untouched. This is the only output filtering cua does.
const REDACTED = '<redacted>';
const SECRET_WORDS = new Set(['token', 'key', 'secret', 'apikey']);
const decodeOnce = name => { try { return decodeURIComponent(name); } catch { return name; } };
// Twice: a name inside an encoded redirect carries its own escapes encoded again (%2574oken is token).
const decoded = name => decodeOnce(decodeOnce(name));
const secretName = name => SECRET_WORDS.has(decoded(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).at(-1));
// A parameter start: a raw or encoded ?, & or # at the start of a string or after a non-space character, a name (percent escapes allowed, except the
// encoded delimiters themselves), then a raw or encoded =.
const PARAM = /(?<!\s)(?:[?&#]|%3F|%26|%23)((?:[\w.-]|%(?!3[DF]|2[36])[0-9A-F]{2})+)(=|%3D)/gi;
const DELIMITER = /[&#\s"'<>]/;
const TRAILING = /[},.]/;
const CONNECT_URL = /(chrome-extension:\/\/[a-p]{32}\/connect\.html\?)([^\s"'<>#]*)/g;
const RELAY_URL = /(wss?:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?\/extension\/)[^\s"'<>]+/g;

// Where a value ends, in one forward scan: at a URL delimiter (also %26 or %23 inside an encoded URL) or at a closing
// bracket it did not open (the `)` of a Markdown link, the `]` of a citation). One pass keeps the scanner linear.
function valueEnd(text, start, encoded) {
  const depth = {'(': 0, '[': 0};
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (DELIMITER.test(c)) return i;
    if (encoded && c === '%' && /^%(?:26|23)$/.test(text.slice(i, i + 3))) return i;
    if (c === '(' || c === '[') depth[c]++;
    else if (c === ')' || c === ']') {
      const open = c === ')' ? '(' : '[';
      if (!depth[open]) return i;
      depth[open]--;
    }
  }
  return text.length;
}

function redactParams(text) {
  let out = '';
  let last = 0;
  PARAM.lastIndex = 0;
  for (let match; (match = PARAM.exec(text));) {
    if (!secretName(match[1])) continue;
    const start = PARAM.lastIndex;
    let end = valueEnd(text, start, match[2] !== '=');
    while (end > start && TRAILING.test(text[end - 1])) end--;
    if (end === start) continue;
    out += text.slice(last, start) + REDACTED;
    last = PARAM.lastIndex = end;
  }
  return out + text.slice(last);
}

function redactText(text) {
  return redactParams(text
    .replace(CONNECT_URL, (_, head, query) => head + query.split('&').map(part => part.replace(/=.*/s, `=${REDACTED}`)).join('&'))
    .replace(RELAY_URL, `$1${REDACTED}`));
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)]));
  return value;
}

export function redactTokens(result) {
  if (!result || typeof result !== 'object') return result;
  const out = {...result};
  if (Array.isArray(result.content)) out.content = result.content.map(item => item?.type === 'text' && typeof item.text === 'string' ? {...item, text: redactText(item.text)} : item);
  if (result.structuredContent !== undefined) out.structuredContent = redactValue(result.structuredContent);
  return out;
}

// An accepted app-approval elicitation gets `_meta.persist`, which node_repl uses to remember the approval.
export function persistAccepted(result, persist) {
  if (result?.action !== 'accept') return result;
  const out = {...result};
  if (out.content == null) out.content = {};
  if (persist !== 'none' && out._meta == null) out._meta = {persist};
  return out;
}

// A model-visible tool result carrying a value-free structured status.
export function statusResult(structured, {isError = false, message} = {}) {
  const text = message ? `${message}\n${JSON.stringify(structured)}` : JSON.stringify(structured);
  return {content: [{type: 'text', text}], structuredContent: structured, isError};
}
