// What the model sees of the server: the four-tool surface (five with the browser surface, which adds profiles_list),
// server instructions with host notes for the enabled surfaces, and the result rewrites the proxy applies (image MIME
// correction, token-bearing URL redaction). Pure functions; the server applies them to relayed messages.

// Upstream tools passed through with their own description and schema. turn_ended (completion is server-owned) and
// js_add_node_module_dir (it would widen what model code can import) stay private.
const PASSED_THROUGH = new Map([
  ['js', 'control macos apps through their gui (computer use): click, type, read the screen, screenshot'],
  ['js_reset', 'reset the computer-use session for macos gui control'],
]);
// Search hints when the browser surface is on (alone, or with computer use).
const BROWSER_HINTS = {
  browser: {js: 'operate the user\'s chrome browser profiles: open tabs, read pages, fill forms, screenshot', js_reset: 'reset the browser-use session'},
  both: {js: 'control macos apps and the user\'s chrome browser profiles: click, type, fill forms, read, screenshot', js_reset: 'reset the computer-use and browser-use session'},
};

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

export const SECRETS_LIST_TOOL = {
  name: 'secrets_list',
  description: 'List the labels of the secrets the user stored for computer-use input (with `cua secrets set`), never '
    + 'their values. Returns status "ok" with labels, or status "unavailable"/"error" with a code when secret storage '
    + 'cannot be used on this connection. To enter a secret the user has authorized, pass exactly "{{secret:<label>}}" '
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

export const PROFILES_LIST_TOOL = {
  name: 'profiles_list',
  description: 'List the Chrome profiles the user registered for browser use, by key, with whether each is ready and, '
    + 'when ready, its extensionInstanceId. Select the profile the user means with '
    + 'cua.getBrowser({extensionInstanceId}); a profile that is not ready says why, and no other profile stands in for it.',
  inputSchema: NO_ARGUMENTS,
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  _meta: {'anthropic/searchHint': 'list registered chrome browser profiles for browser use'},
};

export const LOCAL_TOOLS = new Set([END_TASK_TOOL.name, SECRETS_LIST_TOOL.name, PROFILES_LIST_TOOL.name]);
export const WORK_TOOLS = new Set(PASSED_THROUGH.keys());

// Host notes: what the vendor's API document leaves out, in rules an agent can follow. The general rules apply to every
// surface; several come from the first real-use run (docs/evidence/2026-10-05-homework-1b-dogfooding.md, issue #23):
// end_task was never called, calls ran in parallel, inputs were repeated against an unchanged state, and fixed waits
// stood in for readiness checks. Claude Code caps the server instructions, the vendor's own included, at 2,048
// characters, so every line has to earn its place.
const TITLE = 'Host notes (cua serve):';
const COMPUTER_HEAD = '- Use this when a macOS app\'s GUI is the only way; read the API document the first js call returns.';
const BROWSER_HEAD = '- Use this for the user\'s existing Chrome profiles when no API or skill covers the task; read the API document the first js call returns.';
const GENERAL_NOTES = [
  '- Call end_task as soon as the task is done, before your final reply. If it errors, report it; the connection is spent.',
  '- One controller per task, one js call at a time.',
  '- Observe, act, verify: a call returning is not success. If the state is unchanged, stop and find out why rather than repeat.',
  '- Batch deterministic steps between observations. Wait for a visible readiness condition in a bounded poll, not a fixed delay.',
  '- Cancelling does not stop a running cell; its timeout_ms does.',
];
const COMPUTER_NOTES = [
  '- Each app asks the user for approval once per connection; do not retry a declined app, report it.',
  '- Prefer element indexes from the latest accessibility text; coordinates are screenshot pixels (apply the host\'s downscale multiplier). Role names follow the system language.',
  '- After quitting an app, drop its handle: getAXState() on it relaunches the app.',
  '- typeText silently drops characters the keyboard layout cannot key (emoji); paste those and multiline text.',
  '- If REPL state is confused, js_reset and rebind the app. Do not also drive the app through osascript.',
];
// The Chrome rules. A failed selection sends the agent back to profiles_list: the vendor's own error for an id that is
// not live ("The Chrome instance is unavailable.") is raised inside the REPL, where cua cannot see it, while
// profiles_list names a stale binding. Which profile is meant stays the user's call (the dogfood agent bound one
// itself from tab contents). The 3 s line is spike #25's finding: the vendor browser service caps locator actions,
// waits and playwright.evaluate at 3 s (a per-call timeoutMs can only shorten it), and a cell timeout resets the
// kernel, losing the tab handle.
const BROWSER_NOTES = [
  '- Chrome: give cua.getBrowser({extensionInstanceId}) only an id profiles_list returned for the profile the user means; if that fails, call profiles_list again. Never pick or bind a profile for the user: ask.',
  '- Chrome tabs are DOM-only: act through tab.playwright locators, not native typeText/click. Press keys on a focusable element, never a frame body; tab.cua.type pastes, sending no keys.',
  '- Browser locator actions, waits and evaluate stop at 3 s (timeoutMs can only shorten it); to wait longer, loop short waits to your own deadline under a larger js timeout_ms.',
  '- evaluate is read-only: no fetch, no require, objects are non-extensible.',
  '- createBrowserTab can take over 30 s: give that js call timeout_ms of at least 60000. After a timeout a tab may still have opened: tell the user; do not retry.',
];

export const DEFAULT_HOST_NOTES = [TITLE, COMPUTER_HEAD, ...GENERAL_NOTES, ...COMPUTER_NOTES].join('\n');

export function hostNotesFor(surfaces) {
  if (!surfaces.includes('browser')) return DEFAULT_HOST_NOTES;
  if (surfaces.includes('computer')) return [DEFAULT_HOST_NOTES, ...BROWSER_NOTES].join('\n');
  return [TITLE, BROWSER_HEAD, ...GENERAL_NOTES, ...BROWSER_NOTES].join('\n');
}

// A model-visible profile entry: key and readiness, the instance id when bound, the reason when not ready. Never the
// Chrome directory (the text guidance names it where the user has to act in that profile).
export const profileView = ({key, ready, reason, extensionInstanceId}) => ({key, ready, ...(extensionInstanceId && ready ? {extensionInstanceId} : {}), ...(reason ? {reason} : {})});

export function withHostNotes(instructions, hostNotes) {
  return [instructions, hostNotes].filter(Boolean).join('\n\n');
}

const hintFor = (name, surfaces) => !surfaces.includes('browser') ? PASSED_THROUGH.get(name)
  : BROWSER_HINTS[surfaces.includes('computer') ? 'both' : 'browser'][name];

export function modelTools(upstreamTools, {surfaces = ['computer']} = {}) {
  const passed = (Array.isArray(upstreamTools) ? upstreamTools : [])
    .filter(tool => PASSED_THROUGH.has(tool.name))
    .map(tool => ({...tool, _meta: {...(tool._meta ?? {}), 'anthropic/searchHint': hintFor(tool.name, surfaces)}}));
  return surfaces.includes('browser')
    ? [...passed, END_TASK_TOOL, SECRETS_LIST_BROWSER_TOOL, PROFILES_LIST_TOOL]
    : [...passed, END_TASK_TOOL, SECRETS_LIST_TOOL];
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
