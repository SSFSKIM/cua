// The js cells the agent cursor's sitting drives (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md,
// Acceptance; the kit's runbook docs/evidence/2026-10-30-macos-agent-cursor/README.md). They run on #117's harness
// scenes (scripts/repl-parity/scenes-mac.mjs: the run's own TextEdit document, Chrome for Testing on the loopback scene
// page, the Electron fixture), inside the native baseline's timing envelope (scripts/native-baseline/cells.mjs `cell`)
// and over the native matrix's prelude (scripts/native-matrix/matrix-cells.mjs: `__app`, `observe`, `inFront`, the
// observation-text helpers, `jpegSize`). Like the matrix's, a cell returns only what it judged (counts, values of the
// scene's own controls, times, refusal sentences), never accessibility text or screenshot bytes, except `SHOT`, which
// emits the scene window's screenshot on purpose (Acceptance 5: the cursor is not in the agent's screenshots).
//
// Points are fractions of the scene window, scaled into its screenshot's pixel space (the facade's coordinate space)
// by the size `BIND` reads once, so a later cell sends no observation of its own before it acts: an observation is a
// request, and every request of the session moves the cursor's state (it clears taken over, cancels a fade).
import {cell} from '../native-baseline/cells.mjs';
import {BIND as BIND_APP} from '../native-matrix/goldens-cells.mjs';
import {prelude} from '../native-matrix/matrix-cells.mjs';
import {pressed} from '../native-matrix/plan.mjs';
import {vendorMenuBarIndex} from '../native-matrix/live-checks.mjs';
import {SCENE_MARKER} from './target-guard.mjs';

const j = JSON.stringify;
// Every scene cell opens with the scene's marker, so the session's target guard knows what the cell acts on
// (./target-guard.mjs), then the matrix's prelude.
const head = scene => `${SCENE_MARKER(scene)}\n${prelude(scene)}`;

// The scene's app bound by path for the later cells, and its window's screenshot size kept in `globalThis.__size`.
export const BIND = (scene, app) => `${SCENE_MARKER(scene)}
${BIND_APP(scene, app)}
${cell(`${head(scene)}
const shot = await __app.getScreenshot({emit: false});
const size = jpegSize(shot);
if (!size) throw new Error("the ${scene} window's screenshot size could not be read");
(globalThis.__size ??= {})[${j(scene)}] = size;
return {size};`)}`;

// The point at fractions `f` of the bound scene window, in the screenshot's pixels.
const at = (scene, f) => `(() => { const s = globalThis.__size?.[${j(scene)}]; if (!s) throw new Error("bind ${scene} first"); return [Math.round(s.width * ${f[0]}), Math.round(s.height * ${f[1]})]; })()`;
// The call `act`, timed: {ms}.
const timed = act => `const __a0 = performance.now(); ${act}; const ms = performance.now() - __a0;`;

// A coordinate click at fractions `f`. -> {ms, point}.
export const CLICK_AT = (scene, f) => cell(`${head(scene)}
const point = ${at(scene, f)};
${timed('await __app.click(point)')}
return {ms, point};`);

// A drag from fractions `from` to `to`. -> {ms}.
export const DRAG = (scene, from, to) => cell(`${head(scene)}
${timed(`await __app.drag(${at(scene, from)}, ${at(scene, to)})`)}
return {ms};`);

// A scroll at fractions `f`, a page `direction`. -> {ms}.
export const SCROLL_AT = (scene, f, direction = 'down') => cell(`${head(scene)}
${timed(`await __app.scroll(${at(scene, f)}, ${j(direction)}, 1)`)}
return {ms};`);

// What finds each control the sitting clicks by its element, as an expression over `ax`: the scene page's checkbox,
// the fixture's button (TextEdit's alignment is ALIGN_TOGGLE's).
export const CONTROLS = Object.freeze({
  sceneOption: {scene: 'chrome', find: 'indexOfTarget(ax, "Scene option")'},
  fixtureButton: {scene: 'electron', find: 'indexOfTarget(ax, "Fixture button")'},
});

// An element click on `control`, and when the control was found, its value read back right after the click returns:
// the click lands at once, the cursor glides after it (O5). -> {ms, before, after, changedWithinMs}.
export const CLICK_CONTROL = control => {
  const {scene, find} = CONTROLS[control];
  return cell(`${head(scene)}
let ax = await observe();
const index = ${find};
if (index === null) throw new Error("${control} is not in the ${scene} window's text");
const before = valueOfIndex(ax, index);
${timed('await __app.click(index)')}
ax = await observe();
const changedWithinMs = performance.now() - __a0;
return {ms, before, after: valueOfIndex(ax, ${find}), changedWithinMs};`);
};

// TextEdit's alignment flipped: align center when it is off, else align left. -> {ms, clicked, after}.
export const ALIGN_TOGGLE = cell(`${head('textedit')}
let ax = await observe();
const center = indexOfPart(ax, "Description", "align center");
if (center === null) throw new Error("TextEdit's alignment control is not in its text");
const clicked = valueOfIndex(ax, center) === "1" ? "align left" : "align center";
const index = indexOfPart(ax, "Description", clicked);
${timed('await __app.click(index)')}
ax = await observe();
const changedWithinMs = performance.now() - __a0;
return {ms, clicked, after: valueOfIndex(ax, indexOfPart(ax, "Description", clicked)), changedWithinMs};`);

// The Electron fixture's press count, read by one observation. -> {pressed}.
export const PRESSED = cell(`${head('electron')}
const ax = await observe();
return {pressed: ${pressed}};`);

// An action after the person's click, with no observation first: refused with the engine's userIntervened sentence
// when the intervention ledger attributed the click to this app (the person still interacting, or the app changed
// since the agent's last look). -> {refused, sentence}.
export const INTERVENTION_PROBE = (scene, f) => cell(`${head(scene)}
try { await __app.scroll(${at(scene, f)}, "down", 1); return {refused: false, sentence: null}; }
catch (e) { const s = String(e?.message ?? e); return {refused: /The user (?:is still interacting with|changed) /.test(s), sentence: s.slice(0, 200)}; }`);

// A press_key right after the person's own input: the engine may refuse it with its userIntervened sentence, which the
// cursor still counts as the session's request (it clears taken over). -> {refused, sentence}.
export const KEY_AFTER_INPUT = (scene, key) => cell(`${head(scene)}
try { await __app.pressKey(${j(key)}); return {refused: false, sentence: null}; }
catch (e) { const s = String(e?.message ?? e); if (!/The user (?:is still interacting with|changed) /.test(s)) throw e; return {refused: true, sentence: s.slice(0, 200)}; }`);

// Opens the scene app's menu `title` by its menu-bar item (the engine's menu route). -> {ms}.
export const OPEN_MENU = (scene, title) => cell(`${head(scene)}
const vendorMenuBarIndex = ${vendorMenuBarIndex.toString()};
const ax = await observe();
const index = vendorMenuBarIndex(ax, ${j(title)});
if (index === null) throw new Error("the menu bar item ${title} is not in the text");
${timed('await __app.click(index)')}
return {ms};`);

// One get_app_state. -> {inFront}.
export const OBSERVE = scene => cell(`${head(scene)}
const ax = await observe();
return {inFront: inFront(ax)};`);

// A type_text of `chars` characters from a fixed alphabet (one unbroken lower-case run: no word for autocorrect to take).
export const TYPE_RUN = (scene, chars) => cell(`${head(scene)}
const text = "abcdefghij".repeat(Math.ceil(${chars} / 10)).slice(0, ${chars});
${timed('await __app.typeText(text)')}
return {ms, chars: ${chars}};`);

// `count` single press_key calls of `key`, each timed. -> {ms: total, each: [ms]}.
export const PRESS_KEYS = (scene, key, count) => cell(`${head(scene)}
const each = [];
for (let i = 0; i < ${count}; i++) { const t = performance.now(); await __app.pressKey(${j(key)}); each.push(performance.now() - t); }
return {ms: each.reduce((a, b) => a + b, 0), each};`);

// The scene window's screenshot, emitted into the result (the one cell whose output carries an image). -> {size}.
export const SHOT = scene => cell(`${head(scene)}
const shot = await __app.getScreenshot({emit: false});
nodeRepl.emitImage(shot);
return {size: jpegSize(shot)};`);

// What makes the cursor-on session's cursor visible before a sample, outside the timed calls: after the 6 s gap it has
// faded, and an action on a hidden cursor fades it in at its target with no glide, so the sample's first click would
// otherwise time a snap. The prime is a click at `f`, then a pause for the fade-in. The cursor-off session sends the
// same calls.
export const PRIME_MS = 400;
const prime = (scene, f) => `await __app.click(${at(scene, f)}); await new Promise(resolve => setTimeout(resolve, ${PRIME_MS}));`;

// A prime at `f` alone, for the click sample (Acceptance 13). -> {primed}.
export const PRIME = (scene, f) => cell(`${head(scene)}
${prime(scene, f)}
return {primed: true};`);

// The typing sample of Acceptance 12: primed at `to`, a click at `from` (a long glide where the cursor is on), then a
// timed type_text of 200 characters while it glides; a click back at `to` (another long glide), then 30 timed
// press_key calls. -> {type_text, press_key, each}.
export const TYPING_SAMPLE = (scene, from, to) => cell(`${head(scene)}
const text = "abcdefghij".repeat(20);
${prime(scene, to)}
await __app.click(${at(scene, from)});
let t = performance.now(); await __app.typeText(text); const typed = performance.now() - t;
await __app.click(${at(scene, to)});
const each = [];
for (let i = 0; i < 30; i++) { t = performance.now(); await __app.pressKey("x"); each.push(performance.now() - t); }
return {type_text: typed, press_key: each.reduce((a, b) => a + b, 0), each};`);

// An element click on `control` alone, timed, with nothing after it, so the result's `cua/inputRoute` is the click's
// (Acceptance 13: route 3 is the engine's route for the fixture's button in the background). -> {ms}.
export const CLICK_CONTROL_TIMED = control => {
  const {scene, find} = CONTROLS[control];
  return cell(`${head(scene)}
const ax = await observe();
const index = ${find};
if (index === null) throw new Error("${control} is not in the ${scene} window's text");
${timed('await __app.click(index)')}
return {ms};`);
};

// The timing diagnosis's typing arm (./diagnose.mjs): clicks at the fractions `clicks` in order (untimed; the cursor
// glides to each where it is on), a pause of `waitMs` (0: the keys start while the last glide plays; 2500: after it has
// settled), then `count` timed press_key calls ("x"). -> {press_key: total, each}.
export const KEYS_AFTER = (scene, {clicks = [], waitMs = 0, count = 30} = {}) => cell(`${head(scene)}
${clicks.map(f => `await __app.click(${at(scene, f)});`).join('\n')}
${waitMs ? `await new Promise(resolve => setTimeout(resolve, ${waitMs}));` : ''}
const each = [];
for (let i = 0; i < ${count}; i++) { const t = performance.now(); await __app.pressKey("x"); each.push(performance.now() - t); }
return {press_key: each.reduce((a, b) => a + b, 0), each};`);
