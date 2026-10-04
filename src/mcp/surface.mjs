// What the model sees of the server: the four-tool surface (five with the browser surface, which adds profiles_list),
// server instructions with host notes for the enabled surfaces, and the result rewrites the proxy applies (image MIME
// correction). Pure functions; the server applies them to relayed messages.

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

export const DEFAULT_HOST_NOTES = `Host notes (cua serve):
- Use this when a task needs a macOS app's GUI and no CLI, API or skill covers it. The first js call returns the API document; read it before writing more code.
- js and js_reset calls on this connection form one task until end_task. Call end_task when the GUI work is finished. If end_task reports an error, this connection takes no more work: report it rather than retrying.
- Each app asks the user for approval once per connection, in a dialog. Do not retry an app the user declined; report it instead.
- Address elements by index from the latest accessibility text. Coordinates are screenshot pixels; if the host says it downscaled an image, apply the multiplier it gives. Role names follow the system language.
- After quitting an app, stop using its handle: getAXState() on it relaunches the app. Verify with cua.listApps({emit:false}), which can lag a moment behind cmd+q.
- typeText goes through the keyboard layout and silently drops characters it cannot key, such as emoji; use paste for those and for multiline text.
- Batch deterministic actions with one observation per call, and pass timeout_ms for long waits. If the REPL state is confused, call js_reset and bind the app again.
- Cancelling a js call does not stop a running cell, and js_reset waits for it, so timeout_ms is what bounds runaway code. If the runtime has to be stopped, native cleanup is unconfirmed.
- Do not drive the same app through osascript or other tools while a cua session is open.`;

// Browser-surface notes: the three Chrome rules (pick a registered profile by instance id, DOM-only input through
// Playwright locators, a long createBrowserTab limit and a possible leftover tab after its timeout).
const BROWSER_NOTES = [
  '- Chrome: call profiles_list, then select the profile the user means with cua.getBrowser({extensionInstanceId}). Never choose between profiles yourself.',
  '- Chrome tabs are DOM-only: fill and click with tab.playwright locators; native typeText/click throw there.',
  '- createBrowserTab can take over 30 s: give that js call timeout_ms of at least 60000. If it times out, a tab may still have opened: tell the user, do not retry blindly.',
];
// The surface-independent native notes a browser-only connection keeps.
const BROWSER_ONLY_HEAD = '- Use this to operate the user\'s existing Chrome profiles when no API or skill covers the task. The first js call returns the API document; read it before writing more code.';
const GENERAL = line => /^- (js and js_reset calls|Cancelling a js call)/.test(line);

export function hostNotesFor(surfaces) {
  if (!surfaces.includes('browser')) return DEFAULT_HOST_NOTES;
  if (surfaces.includes('computer')) return [DEFAULT_HOST_NOTES, ...BROWSER_NOTES].join('\n');
  const [title, ...lines] = DEFAULT_HOST_NOTES.split('\n');
  return [title, BROWSER_ONLY_HEAD, ...lines.filter(GENERAL), ...BROWSER_NOTES].join('\n');
}

// A model-visible profile entry: key and readiness, the instance id when bound, the reason when not ready. Never the
// Chrome directory.
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
