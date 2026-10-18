// The js cells of the native baseline. Every cell body runs inside a timing envelope: performance.now() around the
// body, inside the REPL on the device, so the in-cell time excludes MCP, ssh and the REPL's own dispatch. A cell reports
// one marker line of JSON, and only what its body returns: counts, lengths, booleans and hashes. No cell returns
// accessibility text, window titles or screenshot bytes, and every observation passes {emit: false}, so nothing of the
// screen reaches the MCP result except what getApp displays by design (the harness never stores a cell's other output).
// A measured sample whose target was not the scratch document returns `invalid` (a reason) instead of failing: the
// harness keeps it out of the statistics and the summary lists it.
// The envelope, FIRST, NOOP, GET_STATE, LIST_APPS and SCREENSHOT serve every platform; the rest are TextEdit's (macOS,
// ./macos.mjs). Linux's gedit cells are in ./linux-cells.mjs.
export const MARKER = 'CUA_NATIVE_BASELINE ';
export const TEXTEDIT = 'com.apple.TextEdit';
// Typed into each scratch document: correctly spelled and capitalized, so TextEdit's autocorrection has nothing to change.
export const SENTENCE = 'The quick brown fox jumps over the lazy dog.';
// How long a cell waits for a window transition (a new document, the keep-or-delete sheet, the return to the scratch
// document) before it fails. A deadline, not a count of observations: an engine that observes faster polls more often
// in the same time and is not penalised for it.
export const TRANSITION_MS = 10_000;

export function cell(body) {
  return `{const __t0 = performance.now(); let __r;
try { __r = {ok: true, value: (await (async () => {${body}\n})()) ?? null}; }
catch (e) { __r = {ok: false, error: String(e?.message ?? e).slice(0, 300)}; }
__r.inCellMs = performance.now() - __t0;
nodeRepl.write(${JSON.stringify(MARKER)} + JSON.stringify(__r));}`;
}

// -> {ok, value|error, inCellMs} from a js tool result's text, or null when the cell printed no marker.
export function parseCell(text) {
  const line = String(text).split('\n').reverse().find(l => l.startsWith(MARKER));
  return line ? JSON.parse(line.slice(MARKER.length)) : null;
}

// Helpers over an accessibility text, defined in every cell that observes:
//   __front(ax)        the front window's title (compared, never returned)
//   __panel(ax)        the front window is TextEdit's Open panel (its window element carries ID open-panel)
//   __keepOrDelete(ax, title)  the front window is the keep-or-delete sheet of the document `title`: its window element
//                      is the save panel (ID save-panel), it has the Delete button (ID DontSaveButton) and its question
//                      names that document. Identifiers are not localized; the title is the document's own.
//   __facts(ax)        length, line count and element count (lines that start with an element index)
//   tree()             the bound app's full tree; null when the app has no window
//   frontOf(ax)        "(panel)", the front title, or null without a window
//   until(done)        observes until done(ax) holds or TRANSITION_MS pass (globalThis.__baselineTransitionMs overrides it,
//                      for the unit tests); counts observations in __observations
const HELPERS = `const __front = ax => ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __window0 = ax => ax.match(/^\\s*0 [^\\n]*/m)?.[0] ?? "";
const __panel = ax => /ID: open-panel\\b/.test(__window0(ax));
const __keepOrDelete = (ax, title) => ax !== null && /ID: save-panel\\b/.test(__window0(ax)) && /ID: DontSaveButton\\b/.test(ax) && typeof title === "string" && ax.includes(title);
const __facts = ax => ({chars: ax.length, lines: ax.split("\\n").length, elements: (ax.match(/^\\s*\\d+ /gm) ?? []).length});
const tree = async () => { try { return await app.getAXState({emit: false, disableDiffing: true}); } catch (e) { if (/noWindowsAvailable/.test(String(e?.message ?? e))) return null; throw e; } };
const frontOf = ax => ax === null ? null : __panel(ax) ? "(panel)" : __front(ax);
let __observations = 0;
const until = async done => { const end = performance.now() + (globalThis.__baselineTransitionMs ?? ${TRANSITION_MS}); let ax; do { ax = await tree(); __observations++; if (done(ax)) return ax; } while (performance.now() < end); return ax; };`;

export const FIRST = cell('return {ready: true};');
export const NOOP = cell('return {computed: 1 + 1 === 2};');
export const GET_STATE = cell(`const s = await cua.getState({emit: false});
if (s.errors?.length) throw new Error("getState inventory errors: " + s.errors.join("; "));
return {apps: s.apps.length, browsers: s.browsers.length};`);
export const LIST_APPS = cell(`const apps = await cua.listApps({emit: false});
return {apps: apps.length, running: apps.filter(a => a.isRunning).length};`);
// The first binding: approval (answered by the harness, timed apart) and, when TextEdit is not running, its launch.
export const BIND = cell(`globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT)}); return {bound: true};`);

// A new scratch document in front, kept for the observation samples and as the window every task returns to
// (`globalThis.__scratch` keeps its title, compared by later cells). TextEdit launched with no document shows its Open
// panel, which is served out of process and takes no keys sent to TextEdit (measured on the mini: super+n, Escape and
// typing do not reach it), so from the panel the document comes from its New Document button (ID NewDocumentButton),
// a click with no modifier key. Otherwise (TextEdit already shows a window, no window at all, or no button) the cell
// sends nothing and returns `needsKeys`: the harness then checks that TextEdit is the frontmost application before it
// sends NEW_DOCUMENT_KEYS' super+n (#162, ./macos.mjs). The new front window must be one that was not in front before.
export const NEW_DOCUMENT = cell(`${HELPERS}
const before = await tree(); __observations++;
const button = before === null || !__panel(before) ? null : before.match(/^\\s*(\\d+) [^\\n]*ID: NewDocumentButton\\b/m)?.[1];
const previous = frontOf(before);
if (button === null || button === undefined) { globalThis.__beforeScratch = previous; return {needsKeys: true, observations: __observations}; }
await app.click(Number(button));
const after = await until(ax => { const f = frontOf(ax); return f !== null && f !== "(panel)" && f !== previous; });
const front = frontOf(after);
if (front === null || front === "(panel)" || front === previous) throw new Error("no new document came to the front");
globalThis.__scratch = front;
return {actions: 1, observations: __observations, via: "panel"};`);

// The scratch document from super+n, after NEW_DOCUMENT returned needsKeys and the harness found TextEdit frontmost.
// The front window must still be the one NEW_DOCUMENT saw, and the new one must differ from it.
export const NEW_DOCUMENT_KEYS = cell(`${HELPERS}
const previous = globalThis.__beforeScratch;
if (frontOf(await tree()) !== previous) throw new Error("TextEdit's front window changed since it was checked; nothing was sent");
__observations++;
await app.pressKey("super+n");
const after = await until(ax => { const f = frontOf(ax); return f !== null && f !== "(panel)" && f !== previous; });
const front = frontOf(after);
if (front === null || front === "(panel)" || front === previous) throw new Error("no new document came to the front");
globalThis.__scratch = front;
return {actions: 1, observations: __observations, via: "keys"};`);

// Whether the scratch document is in front: run before and after a series whose samples cannot check it themselves.
export const SCRATCH_GUARD = cell(`${HELPERS}
return {scratchInFront: frontOf(await tree()) === globalThis.__scratch};`);

// The full tree reads the front window, so each sample checks its own target in the text it already has.
export const AX_FULL = cell(`${HELPERS}
const ax = await app.getAXState({emit: false, disableDiffing: true});
if (__front(ax) !== globalThis.__scratch) return {invalid: "the scratch document was not in front"};
return __facts(ax);`);

// Dimensions from the PNG IHDR or the JPEG SOF marker; the bytes are hashed inside the cell and never leave it. The
// series is bracketed by SCRATCH_GUARD (the harness), so no guard is charged to these samples.
export const SCREENSHOT = cell(`const shot = await app.getScreenshot({emit: false});
const {createHash} = await import("node:crypto");
let format = "unknown", width = null, height = null;
if (shot[0] === 0x89 && shot[1] === 0x50) { format = "png"; const v = new DataView(shot.buffer, shot.byteOffset, shot.byteLength); width = v.getUint32(16); height = v.getUint32(20); }
else if (shot[0] === 0xff && shot[1] === 0xd8) {
  format = "jpeg";
  for (let i = 2; i + 9 < shot.length;) {
    if (shot[i] !== 0xff) { i++; continue; }
    const marker = shot[i + 1], length = (shot[i + 2] << 8) | shot[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { height = (shot[i + 5] << 8) | shot[i + 6]; width = (shot[i + 7] << 8) | shot[i + 8]; break; }
    i += 2 + length;
  }
}
return {bytes: shot.length, width, height, format, sha256: createHash("sha256").update(shot).digest("hex").slice(0, 16)};`);

// The observe -> act -> verify task, each sample starting from the scratch document in front. Each acting cell first
// checks that the front window is the one it expects, and does nothing otherwise. The act is two cells, so that the
// harness checks TextEdit is the frontmost application right before each sends keys (#162): TASK_NEW opens the task
// document (super+n, then a wait of up to TRANSITION_MS for it), and TASK_TYPE types into it. Their row is one
// (task.act, ./macos.mjs).
export const TASK_NEW = cell(`${HELPERS}
const before = await tree(); __observations++;
if (frontOf(before) !== globalThis.__scratch) throw new Error("the scratch document is not in front; nothing was done");
await app.pressKey("super+n");
const opened = await until(ax => { const f = frontOf(ax); return f !== null && f !== "(panel)" && f !== globalThis.__scratch; });
const front = frontOf(opened);
if (front === null || front === "(panel)" || front === globalThis.__scratch) throw new Error("no new document came to the front");
globalThis.__task = front;
return {actions: 1, observations: __observations};`);

export const TASK_TYPE = cell(`${HELPERS}
if (frontOf(await tree()) !== globalThis.__task) throw new Error("the task document is not in front; nothing was typed");
__observations++;
await app.typeText(${JSON.stringify(SENTENCE)});
return {actions: 1, observations: __observations};`);

export const TASK_VERIFY = cell(`${HELPERS}
const ax = await app.getAXState({emit: false, disableDiffing: true});
const own = __front(ax) === globalThis.__task;
const present = own && ax.includes(${JSON.stringify(SENTENCE)});
if (!present) throw new Error(own ? "the typed sentence is not in the document" : "the task document is not in front");
return {observations: 1, present};`);

// super+w on the edited task document brings up its keep-or-delete sheet; the cell clicks that sheet's Delete button
// (ID DontSaveButton) and nothing else: any other window in front after super+w stops the cell before further input.
// The close is confirmed when the scratch document is back in front.
export const TASK_CLOSE = cell(`${HELPERS}
const task = globalThis.__task;
if (frontOf(await tree()) !== task) throw new Error("the task document is not in front; nothing was closed");
__observations++;
await app.pressKey("super+w");
let actions = 1;
let ax = await until(ax => frontOf(ax) !== task);
const sheet = __keepOrDelete(ax, task);
if (sheet) {
  await app.click(Number(ax.match(/^\\s*(\\d+) [^\\n]*ID: DontSaveButton\\b/m)[1])); actions++;
  ax = await until(ax => frontOf(ax) === globalThis.__scratch);
} else if (frontOf(ax) !== globalThis.__scratch) {
  throw new Error(frontOf(ax) === task ? "the task document is still in front after super+w" : "after super+w the front window is neither the task document's keep-or-delete sheet nor the scratch document; no further input was sent");
}
if (frontOf(ax) !== globalThis.__scratch) throw new Error("the scratch document did not come back to the front after the task document was deleted");
globalThis.__task = null;
return {actions, observations: __observations, sheet, closed: true};`);

// TextEdit started by this run is quit from its unedited scratch document (closing that last document would bring the
// Open panel back, which takes no keys): super+q, with nothing edited left to ask about.
export const QUIT_TEXTEDIT = cell(`${HELPERS}
if (frontOf(await tree()) !== globalThis.__scratch) throw new Error("the scratch document is not in front; not quitting TextEdit");
await app.pressKey("super+q");
return {quit: true};`);
