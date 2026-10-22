// The native-mac suite's scripted cells (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system part 3 and part 7's settle cell): the same js cells on both engines, through the facade, on each of the four
// scenes (scripts/repl-parity/scenes-mac.mjs), in the renderer goldens' sequence (scripts/native-matrix/goldens-cells.mjs)
// so the suite's texts and the goldens' are the same comparisons:
//   bind    the scene's app bound by its path (the goldens' own BIND)
//   prime   one full observation whose text never leaves the REPL: the lane's engine reads (and, for a web scene, enables)
//           the app before cua's side read of the state, so that read never owns, nor at its close releases, the
//           Chromium enablement attribute under the lane (src/services/engine's release, M2a.4)
//   fixed   the fixed state's full text, read until two reads an interval apart are alike (a web page's tree can still be
//           filling when its window is there; the goldens' settled read, here on the lane's own engine)
//   action  the action's first full observation, one click on the scene's action target found in it, the default-mode
//           observation right after it (the diff), and the default-mode observation SETTLE_DELAY_MS later: the settle
//           cell, "the observation right after an action equals the observation two seconds later", holds exactly when
//           that one is the no-change answer
// A cell returns file descriptors, never accessibility text: each text is written to a file in the session's own temp
// directory, which the controller copies off the device only after cua's engine has checked the scene's state
// (goldens-device.mjs verify); a cell that fails removes what it wrote. Every text is checked to be of the scene's window
// before it is written. Each cell opens with a `/* native-mac:<kind> <scene> */` tag naming it (BIND keeps the goldens').
import {cell} from '../../../scripts/native-baseline/cells.mjs';
import {BIND, FILE_PREFIX} from '../../../scripts/native-matrix/goldens-cells.mjs';
import {actionIndex, indexOfRowCell, indexOfTarget, windowTitleOf} from '../../../scripts/repl-parity/scenes-mac-text.mjs';

export {BIND};
export const NATIVE_MAC_CELLS = Object.freeze(['bind', 'fixed', 'action', 'settle']);
export const SETTLE_DELAY_MS = 2000;
export const STABLE_INTERVAL_MS = 500, STABLE_BOUND_MS = 10_000;
// The goldens' prefix, so the controller reads a lane's file under the goldens' own rule (isSessionFile).
export const laneFileName = (scene, kind) => `${FILE_PREFIX}native-mac-${scene}.${kind}.txt`;

const j = JSON.stringify;
// The scenes' text helpers, embedded by their source; __aboutScene reads the window a full text, a diff or the no-change
// answer names on its first line.
const HELPERS = `const windowTitleOf = ${windowTitleOf.toString()};
${indexOfTarget.toString()}
${indexOfRowCell.toString()}
const actionIndex = ${actionIndex.toString()};
const __inFront = (ax, title) => { const front = windowTitleOf(ax); return typeof front === "string" && front.startsWith(title); };
const __aboutScene = (ax, title) => { const named = /Window: "([^"]*)"/.exec(String(ax).split("\\n")[0])?.[1]; return typeof named === "string" && named.startsWith(title); };
const __sleep = ms => new Promise(resolve => setTimeout(resolve, ms));`;
const WRITE = `const __written = [];
const __discard = async () => { const fs = await import("node:fs"); for (const file of __written) { try { fs.rmSync(file, {force: true}); } catch {} } };
const __write = async (kind, name, text) => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const file = path.join(fs.realpathSync(os.tmpdir()), name);
  __written.push(file);
  fs.writeFileSync(file, text, {mode: 0o600});
  return {kind, path: file, bytes: Buffer.byteLength(text), sha256: (await import("node:crypto")).createHash("sha256").update(text).digest("hex")};
};`;

export const PRIME = scene => cell(`/* native-mac:prime ${scene} */
await globalThis.__apps[${j(scene)}].getAXState({emit: false, disableDiffing: true});
return {primed: true};`);

// -> {reads, files: [{kind: "full"}]}.
export const FIXED = (scene, title, {intervalMs = STABLE_INTERVAL_MS, boundMs = STABLE_BOUND_MS} = {}) => cell(`/* native-mac:fixed ${scene} */
${HELPERS}
${WRITE}
try {
  const bound = globalThis.__apps[${j(scene)}];
  const read = async () => {
    const ax = await bound.getAXState({emit: false, disableDiffing: true});
    if (!__inFront(ax, ${j(title)})) throw new Error("the scene window was not the app's front window; nothing was written");
    return ax;
  };
  const end = performance.now() + ${boundMs};
  let previous = await read(), reads = 1;
  for (;;) {
    if (performance.now() + ${intervalMs} > end) throw new Error("the scene's text did not hold still: no two reads ${intervalMs} ms apart were alike within ${boundMs} ms; nothing was written");
    await __sleep(${intervalMs});
    const ax = await read();
    reads++;
    if (ax === previous) return {reads, files: [await __write("full", ${j(laneFileName(scene, 'full'))}, ax)]};
    previous = ax;
  }
} catch (error) { await __discard(); throw error; }`);

// -> {index, files: [{kind: "before"}, {kind: "diff"}, {kind: "later"}]}.
export const ACTION = (scene, title, action, {settleMs = SETTLE_DELAY_MS} = {}) => cell(`/* native-mac:action ${scene} */
${HELPERS}
${WRITE}
try {
  const bound = globalThis.__apps[${j(scene)}];
  let before = null, index = null;
  for (let attempt = 1; attempt <= 3 && index === null; attempt++) {
    if (attempt > 1) await __sleep(1000);
    before = await bound.getAXState({emit: false, disableDiffing: true});
    if (!__inFront(before, ${j(title)})) throw new Error("the scene window was not the app's front window; nothing was clicked");
    index = actionIndex(before, ${j(action)});
  }
  if (index === null) throw new Error("the action's target is not in the observation after 3 tries; nothing was clicked");
  const files = [await __write("before", ${j(laneFileName(scene, 'before'))}, before)];
  await bound.click(index);
  const diff = await bound.getAXState({emit: false});
  if (!__aboutScene(diff, ${j(title)})) throw new Error("the observation right after the click is not of the scene window; nothing was kept");
  files.push(await __write("diff", ${j(laneFileName(scene, 'diff'))}, diff));
  await __sleep(${settleMs});
  const later = await bound.getAXState({emit: false});
  if (!__aboutScene(later, ${j(title)})) throw new Error("the observation after the settle delay is not of the scene window; nothing was kept");
  files.push(await __write("later", ${j(laneFileName(scene, 'later'))}, later));
  return {index, files};
} catch (error) { await __discard(); throw error; }`);
