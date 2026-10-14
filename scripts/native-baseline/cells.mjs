// The js cells of the native baseline. Every cell body runs inside a timing envelope: performance.now() around the
// body, inside the REPL on the device, so the in-cell time excludes MCP, ssh and the REPL's own dispatch. A cell reports
// one marker line of JSON, and only what its body returns: counts, lengths, booleans and hashes. No cell returns
// accessibility text, window titles or screenshot bytes, and every observation passes {emit: false}, so nothing of the
// screen reaches the MCP result except what getApp displays by design (the harness never stores a cell's other output).
export const MARKER = 'CUA_NATIVE_BASELINE ';
export const TEXTEDIT = 'com.apple.TextEdit';
// Typed into each scratch document: correctly spelled and capitalized, so TextEdit's autocorrection has nothing to change.
export const SENTENCE = 'The quick brown fox jumps over the lazy dog.';

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

// Facts about an accessibility text, computed in the cell: its front window title (compared, never returned), its
// length, its line count and its element count (lines that start with an element index).
const AX_HELPERS = `const __front = ax => ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __panel = ax => /ID: open-panel/.test(ax.split("\\n").slice(0, 3).join("\\n"));
const __facts = ax => ({chars: ax.length, lines: ax.split("\\n").length, elements: (ax.match(/^\\s*\\d+ /gm) ?? []).length});`;
// The full tree of the bound app; a window-less app is null rather than a failure.
const FULL_TREE = `async () => { try { return await app.getAXState({emit: false, disableDiffing: true}); } catch (e) { if (/noWindowsAvailable/.test(String(e?.message ?? e))) return null; throw e; } }`;

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
// typing do not reach it), so from the panel the document comes from its New Document button (ID NewDocumentButton);
// otherwise from super+n. The new front window must be one that was not in front before.
export const NEW_DOCUMENT = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const before = await tree();
let via = "keys";
const button = before === null || !__panel(before) ? null : before.match(/^\\s*(\\d+) [^\\n]*ID: NewDocumentButton/m)?.[1];
if (button !== null && button !== undefined) { await app.click(Number(button)); via = "panel"; } else await app.pressKey("super+n");
const after = await tree();
const front = after === null || __panel(after) ? null : __front(after);
if (front === null || (before !== null && __front(before) === front)) throw new Error("no new document came to the front");
globalThis.__scratch = front;
return {actions: 1, observations: 2, via};`);

export const AX_FULL = cell(`${AX_HELPERS}
const ax = await app.getAXState({emit: false, disableDiffing: true});
return {...__facts(ax), scratchInFront: __front(ax) === globalThis.__scratch};`);

// Dimensions from the PNG IHDR or the JPEG SOF marker; the bytes are hashed inside the cell and never leave it.
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

// The observe -> act -> verify task, three cells per sample, each starting from the scratch document in front. Each
// acting cell first checks that the front window is the one it expects, and does nothing otherwise.
export const TASK_ACT = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const before = await tree();
if (before === null || __front(before) !== globalThis.__scratch) throw new Error("the scratch document is not in front; nothing was done");
await app.pressKey("super+n");
const opened = await tree();
const front = opened === null || __panel(opened) ? null : __front(opened);
if (front === null || front === globalThis.__scratch) throw new Error("no new document came to the front");
globalThis.__task = front;
await app.typeText(${JSON.stringify(SENTENCE)});
return {actions: 2, observations: 2};`);

export const TASK_VERIFY = cell(`${AX_HELPERS}
const ax = await app.getAXState({emit: false, disableDiffing: true});
const own = __front(ax) === globalThis.__task;
const present = own && ax.includes(${JSON.stringify(SENTENCE)});
if (!present) throw new Error(own ? "the typed sentence is not in the document" : "the task document is not in front");
return {observations: 1, present};`);

// super+w on an edited untitled document opens the keep-or-delete sheet, which becomes the front window (its own
// title); super+BackSpace answers it with Delete (the sheet's destructive button, the same key in every language).
// The close is confirmed when the scratch document is in front again, observed a bounded number of times.
export const TASK_CLOSE = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const frontOf = async () => { const ax = await tree(); return ax === null ? null : __panel(ax) ? "(panel)" : __front(ax); };
if (await frontOf() !== globalThis.__task) throw new Error("the task document is not in front; nothing was closed");
await app.pressKey("super+w");
let actions = 1, observations = 1, front = await frontOf(); observations++;
for (let i = 0; i < 6 && front === globalThis.__task; i++) { front = await frontOf(); observations++; }
const sheet = front !== globalThis.__task && front !== globalThis.__scratch;
if (sheet) {
  await app.pressKey("super+BackSpace"); actions++;
  for (let i = 0; i < 7 && front !== globalThis.__scratch; i++) { front = await frontOf(); observations++; }
}
if (front !== globalThis.__scratch) throw new Error("the scratch document did not come back to the front after closing the task document");
globalThis.__task = null;
return {actions, observations, sheet, closed: true};`);

// TextEdit started by this run is quit from its unedited scratch document (closing that last document would bring the
// Open panel back, which takes no keys): super+q, with nothing edited left to ask about.
export const QUIT_TEXTEDIT = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const ax = await tree();
if (ax === null || __front(ax) !== globalThis.__scratch) throw new Error("the scratch document is not in front; not quitting TextEdit");
await app.pressKey("super+q");
return {quit: true};`);
