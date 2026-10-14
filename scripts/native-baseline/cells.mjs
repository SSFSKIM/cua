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
const __facts = ax => ({chars: ax.length, lines: ax.split("\\n").length, elements: (ax.match(/^\\s*\\d+ /gm) ?? []).length});`;
// The full tree of the bound app; a window-less app is null rather than a failure.
const FULL_TREE = `async () => { try { return await app.getAXState({emit: false, disableDiffing: true}); } catch (e) { if (/noWindowsAvailable/.test(String(e?.message ?? e))) return null; throw e; } }`;

export const FIRST = cell('return {ready: true};');
export const NOOP = cell('return {value: 1 + 1};');
export const GET_STATE = cell(`const s = await cua.getState({emit: false});
if (s.errors?.length) throw new Error("getState inventory errors: " + s.errors.join("; "));
return {apps: s.apps.length, browsers: s.browsers.length};`);
export const LIST_APPS = cell(`const apps = await cua.listApps({emit: false});
return {apps: apps.length, running: apps.filter(a => a.isRunning).length};`);
// The first binding: approval (answered by the harness, timed apart) and, when TextEdit is not running, its launch.
export const BIND = cell(`globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT)}); return {bound: true};`);

// A new scratch document in front: super+n, then the front window must be a window that was not in front before.
// `globalThis.__scratch` keeps its title, compared by later cells.
export const NEW_DOCUMENT = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const before = await tree();
await app.pressKey("super+n");
const after = await tree();
const front = after === null ? null : __front(after);
if (front === null || (before !== null && __front(before) === front)) throw new Error("no new document came to the front");
globalThis.__scratch = front;
return {actions: 1, observations: 2};`);

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

// The observe -> act -> verify task, three cells per sample. Each acting cell first checks that the front window is
// the document this task created (`__task`), and does nothing otherwise.
export const TASK_ACT = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const before = await tree();
await app.pressKey("super+n");
const opened = await tree();
const front = opened === null ? null : __front(opened);
if (front === null || (before !== null && __front(before) === front)) throw new Error("no new document came to the front");
globalThis.__task = front;
await app.typeText(${JSON.stringify(SENTENCE)});
return {actions: 2, observations: 2};`);

export const TASK_VERIFY = cell(`${AX_HELPERS}
const ax = await app.getAXState({emit: false, disableDiffing: true});
const own = __front(ax) === globalThis.__task;
const present = own && ax.includes(${JSON.stringify(SENTENCE)});
if (!present) throw new Error(own ? "the typed sentence is not in the document" : "the task document is not in front");
return {observations: 1, present};`);

// super+w on an edited untitled document asks whether to keep it; super+BackSpace answers "Delete" (the sheet's
// destructive button, the same key in every language). The close is confirmed when the task document is no longer in
// front, observed a bounded number of times.
export const TASK_CLOSE = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const first = await tree();
if (first === null || __front(first) !== globalThis.__task) throw new Error("the task document is not in front; nothing was closed");
await app.pressKey("super+w");
let actions = 1, observations = 1, after = await tree(); observations++;
if (after !== null && __front(after) === globalThis.__task) { await app.pressKey("super+BackSpace"); actions++; }
for (let i = 0; i < 6 && after !== null && __front(after) === globalThis.__task; i++) { after = await tree(); observations++; }
if (after !== null && __front(after) === globalThis.__task) throw new Error("the task document is still in front after closing it");
globalThis.__task = null;
return {actions, observations, closed: true};`);

// The scratch document of the observation samples was never edited: super+w closes it without a question.
export const CLOSE_SCRATCH = cell(`${AX_HELPERS}
const tree = ${FULL_TREE};
const first = await tree();
if (first === null || __front(first) !== globalThis.__scratch) throw new Error("the scratch document is not in front; nothing was closed");
await app.pressKey("super+w");
let after = await tree();
for (let i = 0; i < 6 && after !== null && __front(after) === globalThis.__scratch; i++) after = await tree();
if (after !== null && __front(after) === globalThis.__scratch) throw new Error("the scratch document is still in front");
return {closed: true, windowsLeft: after !== null};`);

// TextEdit started by this run is quit once no window of it is left; one that was already running is left alone.
export const QUIT_TEXTEDIT = cell(`const tree = ${FULL_TREE};
if (await tree() !== null) throw new Error("TextEdit still has a window; not quitting it");
await app.pressKey("super+q");
return {quit: true};`);
