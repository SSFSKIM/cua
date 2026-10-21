// The native matrix's js cells (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system parts 4
// and 5): each runs inside the REPL on the device, in the baseline's timing envelope (scripts/native-baseline/cells.mjs
// `cell`), and returns only what it judged: booleans, counts, indexes, bounded refusal sentences. No cell returns
// accessibility text, titles or screenshot bytes, and every observation passes {emit: false, disableDiffing: true}.
//
// A method case (./plan.mjs) is three cells, because the facade's response meta carries only its last call's
// `cua/inputRoute` (src/services/engine/service.mjs resets the per-call keys at each call):
//   prepare  resets `globalThis.__m`, observes, finds the case's element by name and returns {ready} or {ready: false, reason}
//   act      exactly one facade call, so the act's `_meta` carries that call's route; the device clock around it
//            (`at`, attributing the activations watcher's events to the row) and the call's own time (`actMs`)
//   check    observes and returns {ok, outcome}, or {invalid} when the case was not prepared
// The cells reach the scene through `globalThis.__apps[<scene>]`, bound by path by the run (./goldens-cells.mjs BIND).
import {cell} from '../native-baseline/cells.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {indexOfRowCell} from '../repl-parity/scenes-mac-text.mjs';
import {EMBEDDED} from './matrix-text.mjs';
import {SCENE_OF} from './plan.mjs';

const j = JSON.stringify;
// The secondary action no element advertises: performing it resolves the element's index on either engine and does
// nothing (the finding scorer's action step).
export const NO_SUCH_ACTION = 'cua-matrix-no-such-action';
export const NOT_AN_ACTION = /is not a valid secondary action/i;

// What every matrix cell defines over the bound scene `scene` (null: no scene, the windowless app's case):
//   __app        the scene's app; observe() its full tree
//   inFront(ax)  the scene's window is the app's front window (its header's title begins with the scene's)
//   panel(ax)    the front window is TextEdit's Open panel (its window element carries ID open-panel)
//   count, plain the occurrences of a string; a value without the grammar's bold markers
//   jpegSize     a screenshot's dimensions from its JPEG SOF or PNG IHDR (the bytes never leave the cell)
//   nonce()      a fresh token, so a value a case writes was never there before
//   refusedAs(s) the act threw, and its message carries the sentence `s` (a regular expression's source)
//   __m          the case's state, from prepare to check
const sceneHead = scene => (scene === null ? '' : `const __app = globalThis.__apps?.[${j(scene)}];
if (!__app) throw new Error(${j(`the ${scene} scene is not bound`)});
const observe = () => __app.getAXState({emit: false, disableDiffing: true});
const inFront = ax => (windowTitleOf(ax) ?? "").startsWith(${j(SCENES[scene].window.title)});`);
const prelude = scene => `${EMBEDDED}
const indexOfRowCell = ${indexOfRowCell.toString()};
${sceneHead(scene)}
const panel = ax => /ID: open-panel\\b/.test(lineOfIndex(ax, 0) ?? "");
const count = (text, part) => String(text ?? "").split(part).length - 1;
const plain = text => String(text ?? "").replace(/\\*\\*/g, "");
const nonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const refusedAs = sentence => typeof globalThis.__m?.threw === "string" && new RegExp(sentence).test(globalThis.__m.threw);
const jpegSize = shot => {
  if (shot?.[0] === 0x89 && shot[1] === 0x50) { const v = new DataView(shot.buffer, shot.byteOffset, shot.byteLength); return {width: v.getUint32(16), height: v.getUint32(20)}; }
  if (shot?.[0] !== 0xff || shot[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < shot.length;) {
    if (shot[i] !== 0xff) { i++; continue; }
    const marker = shot[i + 1], length = (shot[i + 2] << 8) | shot[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {width: (shot[i + 7] << 8) | shot[i + 8], height: (shot[i + 5] << 8) | shot[i + 6]};
    i += 2 + length;
  }
  return null;
};`;

// The three cells of a case on the target `target` (a scene, 'openPanel' or 'windowless'). -> {prepare, act, check}.
export function caseCells(target, c) {
  const head = prelude(SCENE_OF[target]);
  return {
    prepare: cell(`${head}
const __m = globalThis.__m = {ready: false, threw: null};
const __r = await (async () => {${c.prepare}\n})();
__m.ready = __r?.ready === true;
return __m.ready ? {ready: true} : {ready: false, reason: String(__r?.reason ?? "not ready").slice(0, 200)};`),
    act: cell(`${head}
const __m = globalThis.__m;
if (!__m?.ready) throw new Error("the case was not prepared; nothing was sent");
__m.threw = null;
const __from = Date.now(), __t = performance.now();
__m.errorName = null;
try {${c.act}\n} catch (e) { __m.threw = String(e?.message ?? e).slice(0, 300); __m.errorName = String(e?.errorName ?? e?.name ?? "").slice(0, 80) || null; }
const actMs = performance.now() - __t;
return {actMs, at: [__from, Date.now()], threw: __m.threw !== null};`),
    check: cell(`${head}
const __m = globalThis.__m;
if (!__m?.ready) return {invalid: "the case was not prepared"};
const __r = await (async () => {${c.check}\n})();
${c.expect === 'outcome' ? `// An outcome case whose action threw fails, whatever the state reads.
if (__m.threw !== null) return {ok: false, outcome: {...(__r?.outcome ?? {}), threw: __m.threw, errorName: __m.errorName}};` : ''}
return __r;`),
  };
}

// The speed cells' selection: the scene's app as `app` and its exact front title as `__scratch`, so the baseline's
// AX_FULL, SCREENSHOT and SCRATCH_GUARD cells (scripts/native-baseline/cells.mjs) measure the scene unchanged.
export const selectCell = scene => cell(`${prelude(scene)}
const ax = await observe();
globalThis.app = __app;
globalThis.__scratch = windowTitleOf(ax);
return {inFront: inFront(ax)};`);

// The finding-elements scorer (part 5) on one scene: its ten targets (scripts/repl-parity/scenes-mac.mjs, fixed from the
// fixtures' ground truth before either engine's text was seen) each searched by name in one observation's text, its
// index then resolved by an action that does nothing (NO_SUCH_ACTION: the engine refuses it by the index's element, so
// the refusal proves the index named one), and the text's line measures. -> {inFront, targets: [{id, found, resolved}],
// lines, named, unclassified, ids}.
export const findingCell = scene => cell(`${prelude(scene)}
const ax = await observe();
if (!inFront(ax)) return {invalid: "the scene window was not the app's front window"};
const targets = [];
for (const target of ${j(SCENES[scene].targets)}) {
  const index = findTarget(ax, target);
  let resolved = false;
  if (index !== null) {
    try { await __app.performSecondaryAction(index, ${j(NO_SUCH_ACTION)}); }
    catch (e) { resolved = ${NOT_AN_ACTION.toString()}.test(String(e?.message ?? e)); }
  }
  targets.push({id: target.id, found: index !== null, resolved});
}
const {lines, named, unclassified} = namedLines(ax);
return {inFront: true, targets, lines, named, unclassified, ids: idCount(ax)};`);

// Whether the Open panel is TextEdit's front window, observed until `open` holds or the deadline passes (the panel opens
// and closes asynchronously). -> {panel, documentInFront}.
export const panelCell = (open, ms = 10_000) => cell(`${prelude('textedit')}
let ax = await observe();
for (const end = Date.now() + ${ms}; panel(ax) !== ${open} && Date.now() < end;) ax = await observe();
return {panel: panel(ax), documentInFront: inFront(ax)};`);

// TextEdit's Open panel opened by ⌘O from its document (a key cell: the run sends it only under the key guard, with
// TextEdit's process in front), then awaited. -> {opened, reason?}.
export const OPEN_PANEL = cell(`${prelude('textedit')}
let ax = await observe();
if (panel(ax)) return {opened: true};
if (!inFront(ax)) return {opened: false, reason: "the scene document is not TextEdit's front window"};
await __app.pressKey("super+o");
for (const end = Date.now() + 10000; !panel(ax) && Date.now() < end;) ax = await observe();
return {opened: panel(ax)};`);

// The panel closed by the harness when its case did not close it (a click on Cancel: the panel, served out of process,
// takes no keys sent to TextEdit). -> {closed}.
export const CLOSE_PANEL = cell(`${prelude('textedit')}
let ax = await observe();
if (!panel(ax)) return {closed: true};
const index = indexOfTarget(ax, "Cancel") ?? indexOfTarget(ax, "취소");
if (index !== null) await __app.click(index);
for (const end = Date.now() + 5000; panel(ax) && Date.now() < end;) ax = await observe();
return {closed: !panel(ax)};`);

// The launch path's act (part 4): the scene's app, not running, observed by its path through the engine's own call
// (`cua.computer.get_app_state`, what getApp makes, without getApp's emission of the text), which must bring it up
// without the engine activating it. A freshly launched TextEdit opens its Open panel, which lists the owner's files:
// its text stays in this cell, and only booleans leave it (the state came back, whether the panel or the scene's own
// window is in front). -> {actMs, at, threw, error?, state, panel, scene}.
export const launchCell = (scene, app) => cell(`${EMBEDDED}
const __from = Date.now(), __t = performance.now();
let threw = null, text = "";
try { text = String((await cua.computer.get_app_state({app: ${j(app)}, disableDiff: true}))?.text ?? ""); } catch (e) { threw = String(e?.message ?? e).slice(0, 300); }
const actMs = performance.now() - __t, at = [__from, Date.now()];
const facts = {state: text.length > 0, panel: /ID: open-panel\\b/.test(lineOfIndex(text, 0) ?? ""), scene: (windowTitleOf(text) ?? "").startsWith(${j(SCENES[scene].window.title)})};
text = "";
return {actMs, at, threw: threw !== null, ...(threw === null ? {} : {error: threw}), ...facts};`);

// The launch path's outcome, once the harness has put the run's own state in place (TextEdit: the run's document opened
// into the launched process): the app listed as running and its front window the scene's own, never the Open panel. The
// observation again stays in the cell. -> {ok, outcome: {listed, running, scene, panel}}.
export const launchCheckCell = (scene, app) => cell(`${EMBEDDED}
const apps = await cua.listApps({emit: false});
const hit = (Array.isArray(apps) ? apps : []).find(a => [a?.id, a?.bundleId, a?.bundleIdentifier].includes(${j(SCENES[scene].bundleId)}));
let text = "";
for (const end = Date.now() + 10000; Date.now() < end;) {
  try { text = String((await cua.computer.get_app_state({app: ${j(app)}, disableDiff: true}))?.text ?? ""); } catch { text = ""; }
  if ((windowTitleOf(text) ?? "").startsWith(${j(SCENES[scene].window.title)})) break;
}
const own = (windowTitleOf(text) ?? "").startsWith(${j(SCENES[scene].window.title)}), panel = /ID: open-panel\\b/.test(lineOfIndex(text, 0) ?? "");
text = "";
const running = Boolean(hit) && hit.isRunning !== false;
return {ok: running && own && !panel, outcome: {listed: Boolean(hit), running, scene: own, panel}};`);
