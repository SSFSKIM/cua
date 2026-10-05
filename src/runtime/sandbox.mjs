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
// launch first, saying which root and which path.
import {realpathSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative} from 'node:path';
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

// The real path of `path`, or of its nearest existing ancestor with the rest appended (a session directory is checked
// before it is created; macOS temp directories sit below /var -> /private/var).
function realish(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT' || dirname(path) === path) throw error;
    return join(realish(dirname(path)), basename(path));
  }
}

const within = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};

// Every overlap between the scoped profile's write roots ([{label, path}]) and the trusted code paths, by real path:
// `inside: 'trusted'` when the trusted path lies in the write root (cells could replace trusted code), `'root'` when the
// write root lies in a trusted path (cells could add modules there).
export function sandboxConflicts({trustedPaths, writeRoots}) {
  const trusted = trustedPaths.filter(Boolean).map(realish);
  const conflicts = [];
  for (const root of writeRoots.filter(r => r.path)) {
    const path = realish(root.path);
    for (const t of trusted) {
      if (within(t, path)) conflicts.push({root: {label: root.label, path}, trusted: t, inside: 'trusted'});
      else if (within(path, t)) conflicts.push({root: {label: root.label, path}, trusted: t, inside: 'root'});
    }
  }
  return conflicts;
}

// The write roots node_repl derives under the scoped profile for a launch: its working directory (project_roots) and
// the TMPDIR it hands the runtime (tmpdir; none when unset or empty, as in Codex's resolution).
export const scopedWriteRoots = ({cwd, cwdLabel = 'the run directory', tmpdir}) => [
  {label: cwdLabel, path: cwd},
  ...(tmpdir ? [{label: '$TMPDIR', path: tmpdir}] : []),
];

export function describeConflict({root, trusted, inside}) {
  return inside === 'trusted'
    ? `${root.label} (${root.path}) contains the trusted code path ${trusted}`
    : `${root.label} (${root.path}) lies inside the trusted code path ${trusted}`;
}

export const SANDBOX_CONFLICT_HINT = 'keep CUA_HOME and the cua checkout outside $TMPDIR, and nothing of cua\'s under $CUA_HOME/run '
  + '(the default CUA_HOME, ~/Library/Application Support/cua, and a directory under /tmp both work), or set CUA_SHIM_SANDBOX=disabled';

// Throws `sandbox_conflict` when `mode` is scoped and a write root of `launch` (src/runtime/launch.mjs) overlaps one of
// its NODE_REPL_TRUSTED_CODE_PATHS: node_repl would otherwise fail every cell with "kernel exited unexpectedly".
export function assertSandboxFits(mode, launch) {
  if (mode !== 'scoped') return;
  const conflicts = sandboxConflicts({
    trustedPaths: (launch.env.NODE_REPL_TRUSTED_CODE_PATHS ?? '').split(':'),
    writeRoots: scopedWriteRoots({cwd: launch.cwd, tmpdir: launch.env.TMPDIR}),
  });
  if (!conflicts.length) return;
  fail('sandbox_conflict', `CUA_SHIM_SANDBOX=scoped lets JavaScript cells write ${conflicts.map(describeConflict).join('; ')}; node_repl would refuse to start the kernel`, {hint: SANDBOX_CONFLICT_HINT});
}
