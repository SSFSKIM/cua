// The vendor lane's js cells of the live goldens recorder (./goldens.mjs), sent through the vendor host's facade in the
// native baseline's envelope (scripts/native-baseline/cells.mjs). A cell returns file descriptors, never accessibility
// text: the text is written to a file in the session's own temp directory, which the controller copies over the
// device shell (and removes) only after cua's engine has checked the same state (./goldens-device.mjs). A cell that
// fails removes what it wrote. Each cell opens with a `/* goldens:<kind> <scene> */` tag naming it.
import {cell} from '../native-baseline/cells.mjs';
import {actionIndex, indexOfRowCell, indexOfTarget, windowTitleOf} from '../repl-parity/scenes-mac-text.mjs';

const j = JSON.stringify;
export const FILE_PREFIX = 'cua-goldens-';

// The scenes' text helpers, embedded by their source (scenes-mac-text.mjs keeps them self-contained for this).
const HELPERS = `const windowTitleOf = ${windowTitleOf.toString()};
${indexOfTarget.toString()}
${indexOfRowCell.toString()}
const actionIndex = ${actionIndex.toString()};
const __inFront = (ax, title) => { const front = windowTitleOf(ax); return typeof front === "string" && front.startsWith(title); };`;
const WRITE = `const __written = [];
const __discard = async () => { const fs = await import("node:fs"); for (const file of __written) { try { fs.rmSync(file, {force: true}); } catch {} } };
const __write = async (kind, name, text) => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const file = path.join(fs.realpathSync(os.tmpdir()), ${j(FILE_PREFIX)} + name);
  __written.push(file);
  fs.writeFileSync(file, text, {mode: 0o600});
  return {kind, path: file, bytes: Buffer.byteLength(text), sha256: (await import("node:crypto")).createHash("sha256").update(text).digest("hex")};
};`;

// Binds a scene's app by its path (the facade's one `app` string) for the later cells.
export const BIND = (scene, app) => cell(`/* goldens:bind ${scene} */
globalThis.__apps ??= {}; globalThis.__apps[${j(scene)}] = await cua.getApp(${j(app)}); return {bound: true};`);

// The fixed state's full text. -> {files: [{kind: "vendor.txt", path, bytes, sha256}]}.
export const FIXED = (scene, title) => cell(`/* goldens:fixed ${scene} */
${HELPERS}
${WRITE}
try {
  const ax = await globalThis.__apps[${j(scene)}].getAXState({emit: false, disableDiffing: true});
  if (!__inFront(ax, ${j(title)})) throw new Error("the scene window was not the app's front window; no golden written");
  return {files: [await __write("vendor.txt", ${j(`${scene}.vendor.txt`)}, ax)]};
} catch (error) { await __discard(); throw error; }`);

// The scene's action sequence: the full text, one click on the scene's action target found in it (up to three
// observations a second apart: a web area may appear late), then the next observation in the default mode, the diff.
// -> {index, files: [{kind: "action.vendor.before.txt"}, {kind: "action.vendor.diff.txt"}]}.
export const ACTION = (scene, title, action) => cell(`/* goldens:action ${scene} */
${HELPERS}
${WRITE}
try {
  const bound = globalThis.__apps[${j(scene)}];
  let before = null, index = null;
  for (let attempt = 1; attempt <= 3 && index === null; attempt++) {
    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 1000));
    before = await bound.getAXState({emit: false, disableDiffing: true});
    if (!__inFront(before, ${j(title)})) throw new Error("the scene window was not the app's front window; nothing was clicked");
    index = actionIndex(before, ${j(action)});
  }
  if (index === null) throw new Error("the action's target is not in the vendor's tree after 3 observations; nothing was clicked");
  const files = [await __write("action.vendor.before.txt", ${j(`${scene}.action.vendor.before.txt`)}, before)];
  await bound.click(index);
  files.push(await __write("action.vendor.diff.txt", ${j(`${scene}.action.vendor.diff.txt`)}, await bound.getAXState({emit: false})));
  return {index, files};
} catch (error) { await __discard(); throw error; }`);

// Whether the controller may read a file a cell names: one of the recorder's, in the session's own temp directory (the
// served home's run/, or the run's TMPDIR, prepare.mjs).
export const isSessionFile = ({home, tmpdir: runTmp}, path) => typeof path === 'string' && !path.includes('/../')
  && new RegExp(`/${FILE_PREFIX}[A-Za-z0-9.+-]+$`).test(path)
  && [`${home}/run/`, ...(runTmp ? [`${runTmp}/`] : [])].some(prefix => path.startsWith(prefix));
