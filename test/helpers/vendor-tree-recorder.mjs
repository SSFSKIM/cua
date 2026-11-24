// The recorder "no vendor tree read" is shown with (#171 M6a; the pre-flight's §3.5): every function of node:fs,
// fs.promises and node:child_process wrapped to note the paths it is given, the ESM bindings refreshed so the modules
// that call them get the wrappers. Each path is noted as written and as the call reaches it, since a link the kernel
// follows is a read the spelling hides: a command named bare is the file the caller's PATH gives it, as execvp finds
// it; a call that follows a link (open, stat, exec) reaches the path's real path, and one that does not (lstat,
// readlink, rename, unlink) its directory's real path and its own name. Used in process by the unit tests and, through
// ./vendor-tree-preload.mjs, by a real `cua serve` from its first line.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {basename, delimiter, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The originals, held before anything is wrapped: the recorder's own resolution must neither recurse nor be recorded.
const realpath = fs.realpathSync.native;
const access = fs.accessSync;
const statOf = fs.statSync;

// Every path a call names: strings, file URLs and buffers among its arguments, and the strings of an argument list.
const pathsOf = args => args.flatMap(arg => (typeof arg === 'string' ? [arg] : arg instanceof URL ? [fileURLToPath(arg)] : Buffer.isBuffer(arg) ? [arg.toString()]
  : Array.isArray(arg) ? arg.filter(item => typeof item === 'string') : []));
// The calls that act on a link itself rather than on what it leads to.
const ON_LINK = /^(?:promises\.)?(?:lstat|readlink|rename|unlink|symlink|rm|rmdir|lutimes|lchown|lchmod)(?:Sync)?$/;
const SPAWNS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);

const realOrNull = path => { try { return realpath(path); } catch { return null; } };
// Where a call reaches `path` (absolute): see the header.
function reached(path, onLink) {
  const whole = onLink ? null : realOrNull(path);
  if (whole) return whole;
  const parent = realOrNull(dirname(path));
  return parent ? join(parent, basename(path)) : path;
}
// The file execvp runs for a bare `command` under `pathVariable`, or null when none would run.
function onPath(command, pathVariable) {
  for (const dir of (pathVariable ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = resolve(dir, command);
    try { if (statOf(candidate).isFile()) { access(candidate, fs.constants.X_OK); return candidate; } } catch { /* the next entry */ }
  }
  return null;
}

// Starts recording -> {stop}: stop() restores every function and returns [{call, path, reached}], `path` absolute as
// written (relative to the process's directory) and `reached` where the call reaches it.
export function startRecording() {
  const seen = [];
  const restore = [];
  const note = (label, args) => {
    const paths = pathsOf(args);
    if (SPAWNS.has(label) && typeof args[0] === 'string' && !args[0].includes('/')) {
      const options = args.find(arg => arg !== null && typeof arg === 'object' && !Array.isArray(arg) && !Buffer.isBuffer(arg) && !(arg instanceof URL));
      const found = onPath(args[0], (options?.env ?? process.env).PATH);
      paths.shift();
      if (found) paths.unshift(found);
    }
    for (const path of paths) {
      const absolute = resolve(path);
      seen.push({call: label, path: absolute, reached: reached(absolute, ON_LINK.test(label))});
    }
  };
  const wrap = (owner, name, label = name) => {
    const original = owner[name];
    if (typeof original !== 'function' || /^[A-Z]/.test(name)) return;
    const wrapper = function (...args) {
      note(label, args);
      return original.apply(this, args);
    };
    Object.assign(wrapper, original);
    owner[name] = wrapper;
    restore.push(() => { owner[name] = original; });
  };
  for (const name of Object.keys(fs)) wrap(fs, name);
  wrap(fs.realpathSync, 'native', 'realpathSync.native');
  wrap(fs.realpath, 'native', 'realpath.native');
  for (const name of Object.keys(fs.promises)) wrap(fs.promises, name, `promises.${name}`);
  for (const name of Object.keys(childProcess)) wrap(childProcess, name);
  syncBuiltinESMExports();
  return {
    stop() {
      for (const undo of restore.reverse()) undo();
      syncBuiltinESMExports();
      return seen;
    },
  };
}

// Runs `fn` recorded -> what it touched.
export function recorded(fn) {
  const recording = startRecording();
  let seen;
  try { fn(); } finally { seen = recording.stop(); }
  return seen;
}

export const within = (path, root) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && !rel.startsWith('..')); };

// The roots of the vendor's tree for the cua home `home`: <home>/runtimes as spelled and, where it exists, as the
// kernel resolves it (a tree relocated to another volume behind a link).
export const treeRoots = home => [...new Set([join(home, 'runtimes'), realOrNull(join(home, 'runtimes'))].filter(Boolean))];

// What of `seen` touched the vendor's tree of `home`: a path under a root or the root itself, as written or as reached,
// as the live cell's judge counts them (scripts/accept/linux-trace.mjs). Only where <home>/runtimes is a link (a tree
// relocated to another volume) are the lstat and readlink of the roots let pass: the guard (src/runtime/vendor-tree.mjs)
// reads that link to find where the tree lies, and nothing inside it.
const isLink = path => { try { return fs.lstatSync(path).isSymbolicLink(); } catch { return false; } };
export function inVendorTree(seen, home) {
  const roots = treeRoots(home);
  const relocated = isLink(join(home, 'runtimes'));
  return seen.filter(({call, path, reached: at}) => [path, at].some(p => roots.some(root => within(p, root)
    && !(relocated && roots.includes(p) && /^(?:lstatSync|readlinkSync)$/.test(call)))));
}
