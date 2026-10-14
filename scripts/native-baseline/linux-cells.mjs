// The js cells of the native baseline on Linux (gedit on an X11 session, the vendor's sky_linux helper). They share the
// timing envelope and marker of ./cells.mjs, and its rule: a cell returns counts, lengths, booleans, ids and the vendor's
// error sentences, never accessibility text, window titles or screenshot bytes, and every observation passes
// {emit: false}.
//
// On Linux an app is bound by X11 window (cua.getApp({windowId})), so the target of every observation and action is the
// run's own gedit window by construction: no front-window guard is needed, unlike TextEdit's documents on macOS. The run
// finds that window by the unique file name it opened (compared inside the cell, never returned).
//
// The task types with pressKey, one X keysym per character: the helper's typeText and paste insert through AT-SPI and
// crash GTK3 text views such as gedit's (docs/evidence/2026-10-06-linux-acceptance.md). That failure is a fact of the
// baseline, not something to hide, so typeText and paste are measured too, as method cases on windows of their own
// (METHOD_CASES), next to the Linux binder's explicit refusals (setValue, selectText, scroll by pages, paste formats).
import {keysymsFor} from '../accept/linux-native-lib.mjs';
import {cell} from './cells.mjs';

// Typed into the scratch window by each task: lowercase letters and spaces, so every key is one plain keysym.
export const SENTENCE = 'the quick brown fox jumps over the lazy dog';
export const KEYS = keysymsFor(SENTENCE);
// Select all, then delete: what clears the scratch window after each task.
export const CLEAR_KEYS = ['ctrl+a', 'BackSpace'];
// Typed by the typeText and paste method cases, read back (by inclusion) where the method returns.
export const METHOD_TEXT = 'cuabaselinemarker';
// How long a cell waits for its window to appear or its text to change (globalThis overrides, for the unit tests).
export const TRANSITION_MS = 10_000;
export const WINDOW_MS = 20_000;

const HELPERS = `const __facts = ax => ({chars: ax.length, lines: ax.split("\\n").length, elements: (ax.match(/^\\s*\\d+ /gm) ?? []).length});
const tree = () => app.getAXState({emit: false});
let __observations = 0;
const until = async done => { const end = performance.now() + (globalThis.__baselineTransitionMs ?? ${TRANSITION_MS}); let ax; do { ax = await tree(); __observations++; if (done(ax)) return ax; } while (performance.now() < end); return ax; };`;

// The run's own window, by the file name it opened: polled until it appears, so this times the window's start as much
// as listWindows. -> {windowId, app, windows} (the app id, and how many windows the session lists, as a count).
export function findWindow(fileName) {
  if (!/^[A-Za-z0-9._-]+\.txt$/.test(fileName)) throw new Error('findWindow needs the scratch file name');
  return cell(`const end = performance.now() + (globalThis.__baselineWindowMs ?? ${WINDOW_MS});
let windows, win;
for (;;) {
  windows = await cua.listWindows({emit: false});
  win = windows.find(w => typeof w.title === "string" && w.title.includes(${JSON.stringify(fileName)}));
  if (win || performance.now() >= end) break;
  await new Promise(r => setTimeout(r, 250));
}
if (!win) throw new Error("the scratch window did not appear");
return {windowId: win.id, app: typeof win.app === "string" ? win.app : null, windows: windows.length};`);
}

// Binds the window `windowId` to the global `name` (`app` for the scratch window, `__target` for a method case's own).
export function bind(windowId, name = 'app') {
  if (!Number.isSafeInteger(windowId) || windowId <= 0) throw new Error('bind needs an X11 window id');
  if (!/^(app|__target)$/.test(name)) throw new Error('bind needs a binding name: app or __target');
  return cell(`globalThis.${name} = await cua.getApp({windowId: ${windowId}}); return {bound: true};`);
}

// The bound window's full tree: its accessibility source (at_spi, or x11 when AT-SPI does not reach the app) and counts.
// The Linux binder always reads the full tree, so there is no diffing to disable.
export const AX_FULL = cell(`${HELPERS}
const ax = await tree();
return {source: /^Accessibility source: (\\S+)/.exec(ax)?.[1] ?? null, ...__facts(ax)};`);

// The observe -> act -> verify -> clear task, three cells per sample, on the scratch window.
export const TASK_ACT = cell(`${HELPERS}
const before = await tree(); __observations++;
if (before.includes(${JSON.stringify(SENTENCE)})) throw new Error("the scratch window already holds the sentence; nothing was typed");
for (const key of ${JSON.stringify(KEYS)}) await app.pressKey(key);
return {actions: ${KEYS.length}, observations: __observations};`);

export const TASK_VERIFY = cell(`${HELPERS}
const ax = await until(ax => ax.includes(${JSON.stringify(SENTENCE)}));
if (!ax.includes(${JSON.stringify(SENTENCE)})) throw new Error("the typed sentence is not in the scratch window");
return {observations: __observations, present: true};`);

export const TASK_CLEAR = cell(`${HELPERS}
for (const key of ${JSON.stringify(CLEAR_KEYS)}) await app.pressKey(key);
const ax = await until(ax => !ax.includes(${JSON.stringify(SENTENCE)}));
if (ax.includes(${JSON.stringify(SENTENCE)})) throw new Error("the sentence is still in the scratch window after select-all and BackSpace");
return {actions: ${CLEAR_KEYS.length}, observations: __observations, cleared: true};`);

// A method case: what the call did ("returned" or "threw", with the vendor's sentence). The cell itself succeeds either
// way: the outcome is the measurement. `ownWindow`: the case runs on a window of its own (bound as __target), because
// on a GTK3 text view the method takes the window's process down; the others are refused before any input is sent.
const methodCell = call => cell(`let outcome = "returned", methodError;
try { await ${call}; } catch (e) { outcome = "threw"; methodError = String(e?.message ?? e).slice(0, 300); }
return methodError === undefined ? {outcome} : {outcome, methodError};`);
export const METHOD_CASES = {
  'method.typeText': {ownWindow: true, code: methodCell(`__target.typeText(${JSON.stringify(METHOD_TEXT)})`)},
  'method.paste': {ownWindow: true, code: methodCell(`__target.paste(${JSON.stringify(METHOD_TEXT)})`)},
  'method.paste.format': {ownWindow: false, code: methodCell(`app.paste(${JSON.stringify(METHOD_TEXT)}, {format: "html"})`)},
  'method.setValue': {ownWindow: false, code: methodCell(`app.setValue(0, ${JSON.stringify(METHOD_TEXT)})`)},
  'method.selectText': {ownWindow: false, code: methodCell('app.selectText(0)')},
  'method.scroll.pages': {ownWindow: false, code: methodCell('app.scroll([1, 1], "down", 1)')},
};

// Whether a method case's text reached its own window (run only when the window survived the method).
export const INSERTED = cell(`return {inserted: (await __target.getAXState({emit: false})).includes(${JSON.stringify(METHOD_TEXT)})};`);
