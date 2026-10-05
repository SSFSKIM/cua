// node_repl's per-call sandbox state: `_meta["codex/sandbox-state-meta"]` on a tools/call, the field Codex sends
// (issues #20, #33, #36). Without it node_repl applies its restrictive default to cells and trusted services: reads
// allowed, every write denied, temp directories included. CUA_SHIM_SANDBOX picks what cua sends on every call it makes
// to the runtime:
//   scoped    (default) a managed profile: reads everywhere, writes only to the launch's working directory (the run
//             directory, node_repl's `project_roots`, resolved against sandboxCwd) and $TMPDIR (`tmpdir`), no network.
//             node_repl denies every kernel connection under any managed profile, so `network` says `restricted`.
//             `slash_tmp` stays out: it would make any checkout or runtime under /tmp writable.
//   disabled  the disabled permission profile: cells may write wherever the user can, and reach the network
//   default   nothing, leaving node_repl's write-denying default
// node_repl refuses the field without `sandboxCwd`, an absolute file URI; cua gives the launch's working directory.
// Under a managed profile node_repl refuses to start a kernel when a write root covers a trusted code path
// ("Trusted RPC dependency must resolve within a configured trusted code path"); assertSandboxFits refuses that
// launch first, saying which root and which path, and also one whose write roots would cover CODEX_HOME.
import {lstatSync, readlinkSync, realpathSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fail} from './errors.mjs';

export const SANDBOX_META_KEY = 'codex/sandbox-state-meta';
const MODES = ['scoped', 'disabled', 'default'];

export function sandboxModeFrom(env) {
  const mode = env.CUA_SHIM_SANDBOX ?? 'scoped';
  if (!MODES.includes(mode)) fail('invalid_setting', 'CUA_SHIM_SANDBOX must be scoped, disabled or default');
  return mode;
}

const special = kind => ({type: 'special', value: {kind}});
const SCOPED_PROFILE = {type: 'managed', file_system: {type: 'restricted', entries: [
  {path: special('root'), access: 'read'},
  {path: special('project_roots'), access: 'write'},
  {path: special('tmpdir'), access: 'write'},
]}, network: 'restricted'};

// The value sent under SANDBOX_META_KEY for a launch working in `cwd`, or null to send none.
export function sandboxState(mode, cwd) {
  const sandboxCwd = pathToFileURL(cwd).href;
  if (mode === 'scoped') return {permissionProfile: structuredClone(SCOPED_PROFILE), sandboxCwd};
  return mode === 'disabled' ? {permissionProfile: {type: 'disabled'}, sandboxCwd} : null;
}

// `meta` with cua's sandbox state in place of any the caller supplied: the policy is the server's, never the client's.
export function withSandbox(meta, state) {
  const {[SANDBOX_META_KEY]: _ignored, ...rest} = meta ?? {};
  return state ? {...rest, [SANDBOX_META_KEY]: state} : rest;
}

// The real path of `path` in the volume's own spelling (realpathSync.native: APFS is case-insensitive, and the JS
// realpath keeps the caller's casing), or of its nearest existing ancestor with the rest appended (a session directory
// is checked before it is created; macOS temp directories sit below /var -> /private/var). A dangling symlink is
// followed to its target, resolved the same way: it may name a protected directory that is created right after.
function realish(path, depth = 0) {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (error.code !== 'ENOENT' || dirname(path) === path || depth > 40) throw error;
    const parent = realish(dirname(path), depth + 1);
    const here = join(parent, basename(path));
    let link = null;
    try { if (lstatSync(here).isSymbolicLink()) link = readlinkSync(here); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
    return link === null ? here : realish(resolve(parent, link), depth + 1);
  }
}

const within = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};

// What no scoped write root may contain or lie inside, labelled: the trusted code paths (node_repl refuses to start a
// kernel when one is writable, and a write root inside one would let cells add modules there) and CODEX_HOME, the
// runtime's configuration and approvals (writable, it would let cells grant themselves approvals; node_repl does not
// refuse that on its own: measured, issue #36).
export const protectedPaths = ({trustedCodePaths, codexHome}) => [
  ...trustedCodePaths.filter(Boolean).map(path => ({label: 'the trusted code path', path})),
  ...(codexHome ? [{label: 'the runtime\'s configuration and approvals', path: codexHome}] : []),
];

// Every overlap between the scoped profile's write roots and the protected paths ([{label, path}] each), by real path:
// `inside: 'protected'` when the protected path lies in the write root, `'root'` when the write root lies in it.
export function sandboxConflicts({protectedPaths: guarded, writeRoots}) {
  const targets = [];
  for (const p of guarded) {
    const path = realish(p.path);
    if (!targets.some(t => t.path === path)) targets.push({label: p.label, path});
  }
  const conflicts = [];
  for (const root of writeRoots.filter(r => r.path)) {
    const path = realish(root.path);
    for (const target of targets) {
      if (within(target.path, path)) conflicts.push({root: {label: root.label, path}, protected: target, inside: 'protected'});
      else if (within(path, target.path)) conflicts.push({root: {label: root.label, path}, protected: target, inside: 'root'});
    }
  }
  return conflicts;
}

// The `tmpdir` write root node_repl derives from the TMPDIR it is given: the value when non-empty and absolute, else
// none (Codex's resolution: AbsolutePathBuf::from_absolute_path).
export const tmpdirRoot = value => (typeof value === 'string' && value !== '' && isAbsolute(value) ? value : null);

// The write roots node_repl derives under the scoped profile for a launch: its working directory (project_roots) and
// the TMPDIR it hands the runtime (tmpdir).
export const scopedWriteRoots = ({cwd, cwdLabel = 'the run directory', tmpdir}) => [
  {label: cwdLabel, path: cwd},
  ...(tmpdirRoot(tmpdir) ? [{label: '$TMPDIR', path: tmpdir}] : []),
];

export function describeConflicts(conflicts) {
  const roots = [...new Set(conflicts.map(c => c.root.path))].map(path => {
    const mine = conflicts.filter(c => c.root.path === path);
    const list = (inside, verb) => {
      const items = mine.filter(c => c.inside === inside).map(c => `${c.protected.label} ${c.protected.path}`);
      return items.length ? `${verb} ${items.join(', ')}` : null;
    };
    return `${mine[0].root.label} (${path}), which ${[list('protected', 'contains'), list('root', 'lies inside')].filter(Boolean).join(' and ')}`;
  });
  return `CUA_SHIM_SANDBOX=scoped lets JavaScript cells write ${roots.join('; and ')}. Under scoped, cua's trusted code and the `
    + 'runtime\'s configuration must stay outside every writable directory (node_repl refuses to start a kernel over writable trusted code)';
}

export const SANDBOX_CONFLICT_HINT = 'keep CUA_HOME and the cua checkout outside $TMPDIR, and nothing of cua\'s under $CUA_HOME/run '
  + '(the default CUA_HOME, ~/Library/Application Support/cua, and a directory under /tmp both work), or set CUA_SHIM_SANDBOX=disabled';

// Throws `sandbox_conflict` when `mode` is scoped and a write root of `launch` (src/runtime/launch.mjs) overlaps one of
// its NODE_REPL_TRUSTED_CODE_PATHS or its CODEX_HOME.
export function assertSandboxFits(mode, launch) {
  if (mode !== 'scoped') return;
  const conflicts = sandboxConflicts({
    protectedPaths: protectedPaths({trustedCodePaths: (launch.env.NODE_REPL_TRUSTED_CODE_PATHS ?? '').split(':'), codexHome: launch.env.CODEX_HOME}),
    writeRoots: scopedWriteRoots({cwd: launch.cwd, tmpdir: launch.env.TMPDIR}),
  });
  if (conflicts.length) fail('sandbox_conflict', describeConflicts(conflicts), {hint: SANDBOX_CONFLICT_HINT});
}
