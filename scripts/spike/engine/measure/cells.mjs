// The js cells of measure.mjs, beside the native baseline's (scripts/native-baseline/cells.mjs, whose envelope, marker,
// TextEdit task cells and observation cells are reused as they are, so the TextEdit rows mean what the baseline's mean).
// Every cell body runs in the baseline's timing envelope (performance.now() around the body, inside the REPL on the
// device). A cell returns counts, lengths, booleans, hashes, the engine's timings and file descriptors, never
// accessibility text; the goldens are the one exception, and they are written to a file in the session's own temp
// directory (scene windows only), which the harness reads over the device shell before the session ends.
//
// Bound apps live in globalThis.__apps[<scene>]; the TextEdit cells of the baseline use globalThis.app, which
// USE_TEXTEDIT points at the TextEdit scene, with globalThis.__scratch the scene document's title.
import {cell, SCREENSHOT} from '../../../native-baseline/cells.mjs';

const j = JSON.stringify;
// Shared helpers inside an observing cell: the front window's title (compared, never returned), element facts, the
// first element index whose line names `name`, and a SHA-256 prefix.
// The index of the first element line that names `name` as a whole part of the grammar: the bare title, or a label's
// text (`Value: <name>`), ended by the next part's comma or the line's end, whatever the role word (the vendor's are
// localized). A longer name that begins with it ("Scene options") or a window title that only begins with it ("cua scene
// page - Chrome for Testing") is not it. A longer bare title that ends with it ("My Scene option") can be: the role word
// before a bare title is localized and multi-word, so its boundary is only a space. The first matching line wins, so
// targets are names the scene owns. Embedded into the cells by its source, so the cells and the tests share it.
export function indexOfTarget(ax, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const part = new RegExp('(?:^| |: )' + escaped + '(?:,|$)');
  for (const line of String(ax).split('\n')) {
    const element = /^[~+-]?[\t ]*(\d+) (.*)$/.exec(line);
    if (element && part.test(element[2])) return Number(element[1]);
  }
  return null;
}

const HELPERS = `const __front = ax => ax?.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __facts = ax => ({chars: ax.length, textBytes: Buffer.byteLength(ax), lines: ax.split("\\n").length, elements: (ax.match(/^[\\t ]*\\d+ /gm) ?? []).length});
const __indexOf = ${indexOfTarget.toString()};
const __hash = async text => (await import("node:crypto")).createHash("sha256").update(text).digest("hex").slice(0, 16);
const __full = app => app.getAXState({emit: false, disableDiffing: true});`;

// The last observation's raw Skyshot from the spike service (scripts/spike/engine/service.mjs; cua lane only).
const SKYSHOT = `const __skyshot = async app => (await nodeRepl.rpc("sky", {type: "spike", op: "last_observation", app}))?.skyshot ?? null;
const __shotFacts = shot => shot === null ? {skyshot: null} : {skyshotBytes: Buffer.byteLength(JSON.stringify(shot)), nodes: shot.nodes.length, menuBarNodes: shot.menuBar?.length ?? 0, truncated: shot.truncated ?? null, timings: shot.timings ?? null};`;

// Binds a scene's app by path (the facade's one `app` string) and keeps it for later cells.
export const BIND = (scene, app) => cell(`globalThis.__apps ??= {}; globalThis.__apps[${j(scene)}] = await cua.getApp(${j(app)}); return {bound: true};`);

// The TextEdit scene as the baseline cells' `app` and `__scratch`: the scene document must be its front window.
export const USE_TEXTEDIT = prefix => cell(`${HELPERS}
globalThis.app = globalThis.__apps.textedit;
const front = __front(await __full(globalThis.app));
if (typeof front !== "string" || !front.startsWith(${j(prefix)})) throw new Error("the scene document is not TextEdit's front window");
globalThis.__scratch = front;
return {ready: true};`);

// One sample of a scene's tree through the facade, as the baseline's AX_FULL; a sample whose front window is not the
// scene's is `invalid`.
export const TREE = (scene, prefix) => cell(`${HELPERS}
const ax = await __full(globalThis.__apps[${j(scene)}]);
const front = __front(ax);
if (typeof front !== "string" || !front.startsWith(${j(prefix)})) return {invalid: "the scene window was not the app's front window"};
return __facts(ax);`);

// The pid of the process the bound app's last observation came from (cua lane): getApp observes as it binds.
export const BOUND_PID = app => cell(`${SKYSHOT}
const shot = await __skyshot(${j(app)});
return {pid: shot?.app?.pid ?? null};`);

// Whether a scene's window is its app's front window (the bracket around a screenshot series).
export const SCENE_GUARD = (scene, prefix) => cell(`${HELPERS}
const front = __front(await __full(globalThis.__apps[${j(scene)}]));
return {inFront: typeof front === "string" && front.startsWith(${j(prefix)})};`);

// The baseline's getScreenshot sample (its own body: the facade call, the image's format, size and hash) on a scene's
// bound app instead of TextEdit's.
export function SCENE_SCREENSHOT(scene) {
  const code = SCREENSHOT.replace('await app.getScreenshot(', `await globalThis.__apps[${j(scene)}].getScreenshot(`);
  if (code === SCREENSHOT) throw new Error('the baseline\'s SCREENSHOT cell no longer calls app.getScreenshot');
  return code;
}

// The raw Skyshot behind the observation the previous cell made (cua lane): its size on the wire, node count and the
// engine's per-phase timings. Not timed as a cell of its own (merged into the sample's row).
export const SKYSHOT_FACTS = app => cell(`${SKYSHOT}
return __shotFacts(await __skyshot(${j(app)}));`);

// One observation straight through the service with the spike's request switches (cua lane): `prefetch` (public |
// hierarchy, probe (c′)), `valueMarkdown` and `focusableSelectable` (false skips the Markdown fetch, the settability
// reads), `webAreaWait` (false skips the web-area wait), `settle` (true forces the settle wait, for the notification
// rate at rest). `forwarded` says whether the engine's timings agree with the switches (the route, no Markdown fetch,
// no settability read, no web-area wait, a settle report); the run's preflight (lane.mjs switchVerdict) is what proves
// the service forwards each one.
export const ENGINE_OBSERVE = (app, switches) => cell(`${SKYSHOT}
const switches = ${j(switches)};
const t0 = performance.now();
await nodeRepl.rpc("sky", {type: "execute", method: "get_app_state", args: [{app: ${j(app)}, disableDiff: true, ...switches}]});
const observeMs = performance.now() - t0;
const shot = await __skyshot(${j(app)});
const facts = __shotFacts(shot);
const t = facts.timings ?? {};
const forwarded = (switches.prefetch === undefined || t.route === switches.prefetch)
  && (switches.valueMarkdown !== false || !(t.markdownFetches > 0))
  && (switches.focusableSelectable !== false || !(t.focusableMs > 0 || t.selectableMs > 0))
  && (switches.webAreaWait !== false || t.webAreaFound === undefined)
  && (switches.settle !== true || t.settle !== undefined)
  && (switches.readSet === undefined || t.readSet === switches.readSet);
return {observeMs, forwarded, ...facts};`);

// Rendering equivalence of the read sets (cua lane): the scene observed with each read set in `order`, each observation
// timed in-cell and rendered by the service's stand-in renderer (the text the service returns). Returns whether the two
// texts are equal, their SHA-256s, the count of differing lines on a mismatch, each observation's time, and whether the
// engine labelled each with the read set asked for (`applied`); never the text.
export const READ_SET_EQUIVALENCE = (app, order) => cell(`${SKYSHOT}
const {createHash} = await import("node:crypto");
const sha = text => createHash("sha256").update(text).digest("hex");
const seen = {};
for (const readSet of ${j(order)}) {
  const t0 = performance.now();
  const result = await nodeRepl.rpc("sky", {type: "execute", method: "get_app_state", args: [{app: ${j(app)}, disableDiff: true, readSet}]});
  const ms = performance.now() - t0;
  const shot = await __skyshot(${j(app)});
  seen[readSet] = {text: String(result?.text ?? ""), ms, label: shot?.timings?.readSet ?? null};
}
const full = seen.full.text.split("\\n"), reduced = seen.reduced.text.split("\\n");
let differingLines = Math.abs(full.length - reduced.length);
for (let i = 0; i < Math.min(full.length, reduced.length); i++) if (full[i] !== reduced[i]) differingLines++;
return {equal: seen.full.text === seen.reduced.text, fullSha256: sha(seen.full.text), reducedSha256: sha(seen.reduced.text), differingLines,
  fullMs: seen.full.ms, reducedMs: seen.reduced.ms, applied: seen.full.label === "full" && seen.reduced.label === "reduced"};`);

// A scene's fixed state as a golden: the text through the facade (the vendor's text on the vendor lane, the stand-in
// renderer's on the cua lane) and, on the cua lane, the raw Skyshot of the same observation, each written to the
// session's temp directory. -> {files: [{kind, path, bytes, sha256}]}.
// __written lists what the cell wrote, so a cell that throws deletes it before the error leaves (__discard).
const WRITE = `const __written = [];
const __discard = async () => { const fs = await import("node:fs"); for (const file of __written) { try { fs.rmSync(file, {force: true}); } catch {} } };
const __write = async (name, text) => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const file = path.join(fs.realpathSync(os.tmpdir()), "cua-spike-golden-" + name);
  __written.push(file);
  fs.writeFileSync(file, text, {mode: 0o600});
  return {path: file, bytes: Buffer.byteLength(text), sha256: (await import("node:crypto")).createHash("sha256").update(text).digest("hex")};
};`;
export const GOLDEN = (scene, app, prefix, {raw}) => cell(`${HELPERS}
${SKYSHOT}
${WRITE}
try {
  const ax = await __full(globalThis.__apps[${j(scene)}]);
  const front = __front(ax);
  if (typeof front !== "string" || !front.startsWith(${j(prefix)})) throw new Error("the scene window was not the app's front window; no golden written");
  const files = [{kind: "text", ...await __write(${j(`${scene}.text.txt`)}, ax)}];
  if (${j(raw)}) { const shot = await __skyshot(${j(app)}); if (shot === null) throw new Error("no raw Skyshot for the observation"); files.push({kind: "skyshot", ...await __write(${j(`${scene}.skyshot.json`)}, JSON.stringify(shot, null, 1))}); }
  return {files};
} catch (error) { await __discard(); throw error; }`);

// The action-sequence golden of a scene (input): the full text before (and the raw Skyshot), one click on the element
// whose line names `target`, the next observation in the default mode (the vendor's diff text), then the full text after
// (and the raw Skyshot).
export const ACTION_GOLDEN = (scene, app, prefix, target, {raw}) => cell(`${HELPERS}
${SKYSHOT}
${WRITE}
try {
  const bound = globalThis.__apps[${j(scene)}];
  const files = [];
  const keep = async (name, text) => files.push({kind: name, ...await __write(${j(`${scene}.action.`)} + name, text)});
  // The target may come late (a web area appears after enablement): up to three observations a second apart.
  let before = null, index = null;
  for (let attempt = 1; attempt <= 3 && index === null; attempt++) {
    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, globalThis.__spikeRetryMs ?? 1000));   // the tests shorten it
    before = await __full(bound);
    const front = __front(before);
    if (typeof front !== "string" || !front.startsWith(${j(prefix)})) throw new Error("the scene window was not the app's front window; nothing was clicked");
    index = __indexOf(before, ${j(target)});
  }
  if (index === null) throw new Error("the action's target is not exposed in the scene's tree (" + __facts(before).elements + " elements after 3 observations a second apart); nothing was clicked");
  await keep("before.txt", before);
  if (${j(raw)}) await keep("before.skyshot.json", JSON.stringify(await __skyshot(${j(app)}), null, 1));
  await bound.click(index);
  await keep("diff.txt", await bound.getAXState({emit: false}));
  if (${j(raw)}) await keep("after-diff.skyshot.json", JSON.stringify(await __skyshot(${j(app)}), null, 1));
  await keep("after.txt", await __full(bound));
  if (${j(raw)}) await keep("after.skyshot.json", JSON.stringify(await __skyshot(${j(app)}), null, 1));
  return {actions: 1, observations: 3, files};
} catch (error) { await __discard(); throw error; }`);

// Whether Finder's run window shows list view: the vendor's (and the stand-in's) role word for AXRow is `row`.
export const FINDER_VIEW = prefix => cell(`${HELPERS}
const ax = await __full(globalThis.__apps.finder);
const front = __front(ax);
if (typeof front !== "string" || !front.startsWith(${j(prefix)})) throw new Error("the run's Finder window is not Finder's front window");
return {listView: /^[\\t ]*\\d+ row\\b/m.test(ax), rows: (ax.match(/^[\\t ]*\\d+ row\\b/gm) ?? []).length};`);

// One key to a scene's app, the cell's only call (so the result's meta is the key's). The harness guards it first.
export const PRESS = (scene, key) => cell(`await globalThis.__apps[${j(scene)}].pressKey(${j(key)}); return {actions: 1};`);

// Probe (a)/(b), in three cells so the act cell's result meta is the action's own (cua/inputRoute, cua/actionInterval):
// LOCATE finds the target's index and hashes the tree, ACT makes the one call, READBACK says whether the tree changed.
export const LOCATE = (scene, prefix, target) => cell(`${HELPERS}
const ax = await __full(globalThis.__apps[${j(scene)}]);
const front = __front(ax);
if (typeof front !== "string" || !front.startsWith(${j(prefix)})) throw new Error("the scene window was not the app's front window");
const index = __indexOf(ax, ${j(target)});
if (index === null) throw new Error("the probe's target is not in the scene's tree");
globalThis.__probe = {index, before: await __hash(ax)};
return {index};`);
export const ACT_CLICK = scene => cell(`await globalThis.__apps[${j(scene)}].click(globalThis.__probe.index); return {actions: 1};`);
export const ACT_KEY = (scene, key) => cell(`await globalThis.__apps[${j(scene)}].pressKey(${j(key)}); return {actions: 1};`);
export const ACT_TYPE = (scene, text) => cell(`await globalThis.__apps[${j(scene)}].typeText(${j(text)}); return {actions: 1};`);

// One input method with the spike-only arguments the facade cannot carry (probe (b)'s forced route, probe (d)'s private
// event source, probe (e)'s keyed bypass), straight through the service the facade uses. The response meta carries the
// route, the interval and the guard's duration; an engine error lands in the row as the failure it is.
export const SPIKE_INPUT = (app, method, extra) => cell(`const t0 = performance.now();
const outcome = {inCellMs: performance.now() - t0};
try {
  await nodeRepl.rpc("sky", {type: "execute", method: ${j(method)}, args: [{app: ${j(app)}, ...${j(extra)}}]});
} catch (error) { outcome.failed = String(error?.message ?? error).slice(0, 200); }
outcome.inCellMs = performance.now() - t0;
return outcome;`);

// The forced-route click: the element index is the located one, read in the cell where LOCATE stashed it.
export const SPIKE_CLICK = (app, route) => cell(`const t0 = performance.now();
const outcome = {inCellMs: 0};
try {
  await nodeRepl.rpc("sky", {type: "execute", method: "click", args: [{app: ${j(app)}, element_index: globalThis.__probe.index, spikeRoute: ${j(String(route))}]});
} catch (error) { outcome.failed = String(error?.message ?? error).slice(0, 200); }
outcome.inCellMs = performance.now() - t0;
return outcome;`);
export const READBACK = scene => cell(`${HELPERS}
const ax = await __full(globalThis.__apps[${j(scene)}]);
return {treeChanged: (await __hash(ax)) !== globalThis.__probe?.before};`);

// Probe (e): whether the sample's text landed exactly, from the raw Skyshot (cua lane): the text between the sample's
// markers `#<id>#` and `#/<id>#` in some node's value equals what was typed. Returns booleans and a hash only.
export const TEXT_LANDED = (scene, app, id, text) => cell(`${HELPERS}
${SKYSHOT}
await __full(globalThis.__apps[${j(scene)}]);
const shot = await __skyshot(${j(app)});
const start = ${j(`#${id}#`)}, end = ${j(`#/${id}#`)}, expected = ${j(text)};
const found = (shot?.nodes ?? []).map(n => typeof n.value === "string" ? n.value : "").find(v => v.includes(start) && v.includes(end, v.indexOf(start)));
const between = found === undefined ? null : found.slice(found.indexOf(start) + start.length, found.indexOf(end, found.indexOf(start)));
return {landed: between !== null, exact: between === expected, expected: await __hash(expected)};`);
