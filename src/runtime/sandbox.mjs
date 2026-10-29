// The per-call sandbox state: `_meta["codex/sandbox-state-meta"]` on a tools/call, the field Codex sends (issues #20,
// #33, #36), which cua's proxy sets on every call it makes to the runtime and which both REPL hosts confine their
// children by (cua's own sandbox, src/sandbox: on macOS its seatbelt port, on Linux the pinned helper; the macOS vendor
// host through cua's compat executable). CUA_SHIM_SANDBOX picks it, the same on every platform and surface:
//   scoped    (the default) a managed profile: reads everywhere, writes only to the launch's working directory (the run
//             directory, `project_roots`, resolved against sandboxCwd) and $TMPDIR (`tmpdir`, the session's own temp),
//             no network for cells. `slash_tmp` stays out: it would make any checkout or runtime under /tmp writable.
//             On Linux with the computer surface the trusted worker alone gets the network, so the computer-use helper
//             (sky_linux, its child) reaches the X display and the session bus (src/runtime/launch.mjs).
//   disabled  the disabled permission profile: cells may write wherever the user can, and reach the network
//   default   nothing, leaving the write-denying default: reads everywhere, no writes, no network
// The vendor's node_repl refuses the field without `sandboxCwd`, an absolute file URI; cua gives the launch's working
// directory. Under a managed profile node_repl refuses to start a kernel when a write root covers a trusted code path
// ("Trusted RPC dependency must resolve within a configured trusted code path"); assertSandboxFits refuses that launch
// first, for either host, saying which root and which path, and also one whose write roots would cover what cua keeps
// private (the macOS vendor host's CODEX_HOME, the kernel's deny list, cua's Node and its sandbox helper).
import {accessSync, constants, lstatSync, readlinkSync, realpathSync, statSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fail} from './errors.mjs';
import {USERNS_REMEDY, bwrapUserns} from './linux-desktop.mjs';
import {homeLayout} from './layout.mjs';
import {verifyHelper as verifyLinuxHelper} from '../sandbox/linux.mjs';
import {xdgApplicationRoots} from '../repl-host/launch-services.mjs';

export const SANDBOX_META_KEY = 'codex/sandbox-state-meta';
const MODES = ['scoped', 'disabled', 'default'];

// The mode when CUA_SHIM_SANDBOX is unset: scoped, on every platform and surface. Linux computer sessions defaulted
// to disabled until #115 M3, because the vendor's sandbox refused every socket and sky_linux could not reach X11 or the
// bus; cua's own Linux sandbox gives the trusted worker the network instead, and the kernel none.
export const defaultSandboxMode = () => 'scoped';

export function sandboxModeFrom(env) {
  const mode = env.CUA_SHIM_SANDBOX ?? defaultSandboxMode();
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
export function realish(path, depth = 0) {
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
// kernel when one is writable, and a write root inside one would let cells add modules there), CODEX_HOME, the
// runtime's configuration and approvals (writable, it would let cells grant themselves approvals; node_repl does not
// refuse that on its own: measured, issue #36), and $CUA_HOME/node, the Node `cua install` places for cua's own host
// with its records and pointer (src/runtime/managed-node.mjs: writable, it would let cells choose what the next
// connection runs outside the sandbox), and $CUA_HOME/staging, where `cua install` verifies the runtime and that Node
// before placing them (writable, it would let cells swap a verified file before it is placed or run), and the kernel's
// deny list (`denied`, src/sandbox/policy.mjs: the secret store, ~/.config/cua, the cua home; writable, a cell could
// plant what the worker reads or reach what the kernel may not read). The one exception is the launch's own run
// directory and its session temp (`ownRoots`): they lie inside the denied home by design (macOS: the home; Linux: its
// run/), re-exposed to that launch's kernel only, so a write root equal to one of them may lie inside the deny target
// that is one of `ownHolders` (the run directory's home and run/), and inside no other: not the secret store, its tiers
// or ~/.config/cua, wherever the home is placed.
// A macOS vendor-host launch adds its compat settings directory (`compatSettings`, src/sandbox/compat-settings.mjs: what
// the compat executable confines both children by; writable, a worker could rewrite the kernel's deny list), and every
// launch $CUA_HOME/sandbox (`sandboxHelper`: the Linux helper, which runs outside every sandbox; writable, a cell could
// swap what confines the next child, or plant a bubblewrap beside it). A Linux launch adds cua's engine (`engines`,
// #171: $CUA_HOME/engine, and the engine CUA_LINUX_ENGINE_BIN names when a session runs that one; the trusted worker
// runs it as its child; writable, a cell could swap what reads every window and types into it). A Linux own-host launch adds the XDG
// applications directories of its environment (`applications`, src/repl-host/launch-services.mjs: launch_app starts
// their desktop entries outside the sandbox; writable, a cell could plant one), whether they exist yet or not.
export const protectedPaths = ({trustedCodePaths, codexHome, compatSettings, managedNode, staging, sandboxHelper, engines = [], applications = [], denied = [], ownRoots = [], ownHolders = []}) => [
  ...trustedCodePaths.filter(Boolean).map(path => ({label: 'the trusted code path', path})),
  ...(codexHome ? [{label: 'the runtime\'s configuration and approvals', path: codexHome}] : []),
  ...(compatSettings ? [{label: 'the vendor host\'s compat settings', path: compatSettings}] : []),
  ...(managedNode ? [{label: 'the Node cua installed for its own REPL host', path: managedNode}] : []),
  ...(sandboxHelper ? [{label: 'cua\'s sandbox helper', path: sandboxHelper}] : []),
  ...engines.filter(Boolean).map(path => ({label: 'cua\'s Linux engine', path})),
  ...(staging ? [{label: 'cua install\'s staging directory', path: staging}] : []),
  ...applications.map(path => ({label: 'the XDG applications directory launch_app starts entries from', path})),
  ...denied.map(path => ({label: 'what JavaScript cells may not read', path, except: ownHolders.filter(Boolean).map(realish).includes(realish(path)) ? ownRoots.filter(Boolean) : []})),
];

// Every overlap between the scoped profile's write roots and the protected paths ([{label, path, except?}] each), by
// real path: `inside: 'protected'` when the protected path lies in the write root, `'root'` when the write root lies in
// it, unless the write root is one of the target's `except` paths.
export function sandboxConflicts({protectedPaths: guarded, writeRoots}) {
  const targets = [];
  for (const p of guarded) {
    const path = realish(p.path);
    if (!targets.some(t => t.path === path)) targets.push({label: p.label, path, except: (p.except ?? []).map(realish)});
  }
  const conflicts = [];
  for (const root of writeRoots.filter(r => r.path)) {
    const path = realish(root.path);
    for (const {except, ...target} of targets) {
      if (within(target.path, path)) conflicts.push({root: {label: root.label, path}, protected: target, inside: 'protected'});
      else if (within(path, target.path) && !except.includes(path)) conflicts.push({root: {label: root.label, path}, protected: target, inside: 'root'});
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

// The remedy names this platform's default CUA_HOME (src/runtime/layout.mjs defaultHome).
const DEFAULT_HOME_TEXT = {darwin: '~/Library/Application Support/cua', linux: '~/.local/share/cua'};
export const sandboxConflictHint = platform => 'keep CUA_HOME outside cua\'s checkout, ~/.config/cua and the secret store, and nothing of cua\'s under '
  + `$CUA_HOME/run (the default CUA_HOME, ${DEFAULT_HOME_TEXT[platform] ?? DEFAULT_HOME_TEXT.darwin}, and a directory under /tmp both work), or set CUA_SHIM_SANDBOX=disabled`;
export const SANDBOX_CONFLICT_HINT = sandboxConflictHint(process.platform);

// The trusted code roots of `launch` (src/runtime/launch.mjs), by the host it runs: cua's own host names them
// CUA_REPL_TRUSTED_CODE_PATHS (its own code among them), the vendor's NODE_REPL_TRUSTED_CODE_PATHS. Each host's launch
// carries only its own name, and the other is never read for it.
export function trustedCodePathsOf(launch) {
  const key = launch.replHost?.host === 'cua' ? 'CUA_REPL_TRUSTED_CODE_PATHS' : 'NODE_REPL_TRUSTED_CODE_PATHS';
  return (launch.env[key] ?? '').split(':').filter(Boolean);
}

// The trusted services of an own-host `launch` ({name: absolute path}, CUA_REPL_TRUSTED_SERVICES), or {} for none.
export function trustedServicesOf(launch) {
  const value = launch.env.CUA_REPL_TRUSTED_SERVICES;
  if (value === undefined || value === '') return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* refused below */ }
  fail('trusted_service_untrusted', 'CUA_REPL_TRUSTED_SERVICES must be a JSON object of service names and module paths');
}

// Throws `trusted_service_untrusted` unless every trusted root of an own-host `launch` (trustedCodePathsOf) is absolute
// and every trusted service (trustedServicesOf) is an absolute module whose real path lies inside the real path of a
// root that exists (a root that does not, the worker ignores too). The trusted worker
// (src/repl-host/trusted-worker.mjs) enforces the same containment on every import it makes, through a symlink or not;
// this refuses a launch that could never load its services, naming the service and the roots, before anything starts.
export function assertTrustedServicesContained(launch) {
  const roots = trustedCodePathsOf(launch).flatMap(root => {
    if (!isAbsolute(root)) fail('trusted_service_untrusted', `the trusted code path ${root} is not absolute`);
    try { return [realpathSync.native(root)]; } catch { return []; }
  });
  for (const [name, path] of Object.entries(trustedServicesOf(launch))) {
    if (typeof path !== 'string' || !isAbsolute(path)) fail('trusted_service_untrusted', `trusted service ${name} must be an absolute module path`);
    let real;
    try { real = realpathSync.native(path); } catch { fail('trusted_service_untrusted', `trusted service ${name} module ${path} does not exist`); }
    if (!roots.some(root => within(real, root)))
      fail('trusted_service_untrusted', `trusted service ${name} resolves to ${real}, outside every trusted code path (${roots.join(', ') || 'none'})`);
  }
}

// Refuses (sandbox_conflict) a deny list whose targets overlap: one inside another (the home under the store, the store
// or ~/.config/cua under the home...), or a re-exposed path that lies in more than one target or holds one, since either
// would give the kernel what an independent target denies (or the port a metadata grant on it). Every list
// src/sandbox/policy.mjs denyListFor builds for disjoint locations passes. By real path. The preflight runs it for
// scoped and default alike (assertSandboxFits), and the own host again before each kernel profile (prepareDenyTargets).
export function assertDenyListShape(list) {
  const deny = list.deny.map(realish), reexpose = list.reexpose.map(realish);
  const overlaps = [];
  deny.forEach((a, i) => deny.forEach((b, j) => { if (i < j && (within(a, b) || within(b, a))) overlaps.push(`${list.deny[i]} and ${list.deny[j]}`); }));
  reexpose.forEach((path, i) => {
    const holders = deny.filter(target => within(path, target));
    if (holders.length > 1) overlaps.push(`${list.reexpose[i]}, re-exposed, lies in ${holders.join(' and ')}`);
    for (const target of deny) if (within(target, path)) overlaps.push(`${list.reexpose[i]}, re-exposed, holds ${target}`);
  });
  if (overlaps.length) fail('sandbox_conflict', `what JavaScript cells may not read overlaps: ${overlaps.join('; ')}. The cua home, the secret store and its tiers, and ~/.config/cua must not lie inside one another`,
    {hint: 'keep CUA_HOME outside the secret store and ~/.config/cua, and the store and ~/.config/cua outside CUA_HOME'});
}

// Throws `sandbox_conflict` when `mode` is not disabled and the deny list's targets overlap (assertDenyListShape), or
// when `mode` is scoped and a write root of `launch` (src/runtime/launch.mjs) overlaps one of its trusted code paths
// (trustedCodePathsOf), its CODEX_HOME, its home's managed Node (`launch.managedNodeRoot`), its home's install staging
// (`launch.stagingRoot`), its home's sandbox helper (`launch.sandboxHelperRoot`), cua's Linux engine (`launch.engineRoot`,
// and `launch.linuxEngine` when CUA_LINUX_ENGINE_BIN names it) or its deny list (`launch.denyRead`,
// except for its own run directory and session temp), whichever host it runs: a vendor session's cells must not choose
// a later own host's Node, or what an install places, either.
//
// And on the macOS vendor host (a launch carrying `compat`), under scoped and default, it throws `sandbox_unavailable`
// unless CODEX_CLI_PATH names an executable file by an absolute path: node_repl runs its children with no sandbox at
// all when it is unset (#115 spike), so a launch without its launcher is refused rather than run unconfined. Under
// disabled node_repl calls no launcher (#115 M2's probe).
export function assertSandboxFits(mode, launch) {
  if (mode === 'disabled') return;
  if (launch.compat) assertVendorLauncher(launch.env.CODEX_CLI_PATH);
  if (launch.denyRead) assertDenyListShape(launch.denyRead);
  if (mode !== 'scoped') return;
  const conflicts = sandboxConflicts({
    protectedPaths: protectedPaths({trustedCodePaths: trustedCodePathsOf(launch), codexHome: launch.env.CODEX_HOME, compatSettings: launch.compat && homeLayout(launch.compat.home).compat,
      managedNode: launch.managedNodeRoot, staging: launch.stagingRoot, sandboxHelper: launch.sandboxHelperRoot,
      engines: [launch.engineRoot, launch.linuxEngine?.source === 'override' ? launch.linuxEngine.path : null],
      applications: launch.env.CUA_REPL_SANDBOX_HELPER ? xdgApplicationRoots(launch.env) : [],
      denied: launch.denyRead?.deny, ownRoots: [launch.cwd, launch.sessionTmp], ownHolders: launch.cwd ? [dirname(dirname(launch.cwd)), dirname(launch.cwd)] : []}),
    writeRoots: scopedWriteRoots({cwd: launch.cwd, tmpdir: launch.env.TMPDIR}),
  });
  if (conflicts.length) fail('sandbox_conflict', describeConflicts(conflicts), {hint: SANDBOX_CONFLICT_HINT});
}

function assertVendorLauncher(path) {
  let ok = false;
  try { ok = typeof path === 'string' && isAbsolute(path) && statSync(path).isFile() && (accessSync(path, constants.X_OK), true); } catch { ok = false; }
  if (!ok) fail('sandbox_unavailable', `the vendor host's sandbox launcher (CODEX_CLI_PATH ${path === undefined ? 'unset' : JSON.stringify(path)}) is not an executable file, and node_repl would then run JavaScript cells with no sandbox at all; nothing was started`,
    {hint: 'restore cua\'s checkout (bin/cua-codex-compat), or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly'});
}

// Linux: cua's sandbox helper (src/sandbox/linux.mjs) confines both children of a scoped or default launch, so before
// anything starts the launch's helper must be the pinned one (the bytes `cua install` placed, checked against the pin
// again: `verifyHelper`), and bubblewrap must be able to create an unprivileged user namespace (`probe`, doctor's
// sandbox.userns probe, bwrapUserns). The helper itself fails closed without them, so every cell would fail; this
// refuses the connection instead (sandbox_unavailable), with the remedy. Each runs once per launch, on Linux only, and
// never for disabled. Both seams are injectable for tests.
export const SANDBOX_UNAVAILABLE_HINT = `${USERNS_REMEDY}; install bubblewrap if it is missing; or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly`;
export async function assertSandboxConfines(mode, {platform, launch, probe = bwrapUserns, verifyHelper = verifyLinuxHelper}) {
  if (mode === 'disabled' || platform !== 'linux') return;
  verifyHelper({path: launch.env.CUA_REPL_SANDBOX_HELPER, sha256: launch.env.CUA_REPL_SANDBOX_HELPER_SHA256});
  const found = await probe();
  if (found.status === 'pass') return;
  const why = found.status === 'missing' ? 'bubblewrap (bwrap) is not installed'
    : `bubblewrap cannot create an unprivileged user namespace here (bwrap --ro-bind / / true: ${found.detail})`;
  fail('sandbox_unavailable', `CUA_SHIM_SANDBOX=${mode}, but ${why}, so cua's sandbox helper cannot confine JavaScript cells, and none would run; nothing was started`, {hint: SANDBOX_UNAVAILABLE_HINT});
}

// A per-call sandbox state the sandbox cannot render (src/sandbox/policy.mjs policyTable), or a kernel launch without its
// deny list: refused, never run unconfined.
export class SandboxStateError extends Error {}
