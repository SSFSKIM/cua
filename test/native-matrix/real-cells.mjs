// A cell's own code run for real in this process (#526, ruling 1179): what the REPL on the device would run, with its
// `__apps` faked, so a test reaches the runners through the cells themselves rather than a canned answer. -> the line the
// cell wrote (its `CUA_NATIVE_BASELINE` result), for the run doubles' `cell` (`{cellOutput}`).
import {MARKER} from '../../scripts/native-baseline/cells.mjs';

// An ambiguous read-back: a multi-line value (cua's rendering, its break escaped) followed by another part.
export const ambiguousText = ({title, line}) => `Window: "${title}", App: A.\n0 standard window ${title}\n\t1 ${line}\n`;

export async function realCell(code, {apps = {}, m = undefined, rendering = 'cua', globals = {}} = {}) {
  // A case's state (`__m`) is the REPL's across its prepare, act and check, so it is kept unless `m` is given.
  const keys = ['__apps', '__axRendering', 'nodeRepl', ...Object.keys(globals), ...(m === undefined ? [] : ['__m'])];
  const saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  const writes = [];
  Object.assign(globalThis, {__apps: apps, __axRendering: rendering, nodeRepl: {write: text => { writes.push(String(text)); }}, ...globals}, m === undefined ? {} : {__m: m});
  try { await new (async () => {}).constructor(code)(); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
  }
  return writes.flatMap(w => w.split('\n')).find(line => line.startsWith(MARKER)) ?? null;
}
