// cua's sandbox policy model (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "Policy: roles and the
// deny list"): one permission profile per role for a call's sandbox state, and the deny list that keeps the kernel (the
// model's cells) out of cua's private state while the trusted worker keeps reading the secret store.
//
// A profile is the original's JSON shape ({type: 'managed', file_system: {type: 'restricted', entries}, network}), with
// entries in the order the Codex CLI compiled node_repl's `-c permissions.node_repl` table (policyTable: the vendor's
// validation and key order): absolute paths by bytes, then the special paths. So the port (./seatbelt.mjs) renders what
// the signed CLI renders for the same input, and the Linux helper (./linux.mjs) gets the same entries.
//
// Both roles start from the state (scoped: `:root` read, project roots and `:tmpdir` write; default: `:root` read;
// disabled: no profile) plus the host's read paths. The kernel adds the deny list: each denied directory as a `none`
// entry, each re-exposed path as a read entry (where the state also makes one writable, the original's precedence keeps
// it writable: write beats read at equal depth). The kernel's network is always restricted.
import {chmodSync, lstatSync, mkdirSync, readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SandboxStateError, assertDenyListShape, realish} from '../runtime/sandbox.mjs';
import {fail} from '../runtime/errors.mjs';
import {homeLayout} from '../runtime/layout.mjs';
import {storeDir} from '../secrets/store.mjs';
import {PROJECTS_FOLDER} from '../secrets/label.mjs';

export const ROLES = ['kernel', 'worker'];

const within = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};
const exists = path => { try { lstatSync(path); return true; } catch { return false; } };

// Discovering the secret store's tiers fails closed for a confined launch (a disabled one never discovers them):
// - Absent (ENOENT, a fresh install with no secrets, a store without projects/): nothing there to deny; proceed.
// - A symlinked tier whose target is absent: the target is denied by its path and created (0700) with the other
//   missing deny targets at launch (prepareDenyTargets), so a tier made there later is already denied.
// - Any other failure to establish the tier set (EACCES on the store or projects/, whatever its mode; ELOOP; EIO...)
//   refuses: a hidden tier's target outside the store stays readable to the kernel by its own real path, since the
//   store follows a symlinked tier (src/secrets/store.mjs:52 joins projects/<slug>/<KEY>; its O_NOFOLLOW at :93 guards
//   the key file only).
// The refusal names the directory's role and the store's path, never a tier or key name (the store's own errors name
// at most a key and its file), and gives the remedy.
const discoveryFailed = (role, store, error) => fail('sandbox_state_invalid',
  `${role} (secret store ${store}) could not be read (${error.code ?? 'error'}), so the kernel's deny list cannot be established; this confined launch is refused`,
  {hint: 'fix that directory\'s permissions for your account (chmod u+rwx), or run the connection with CUA_SHIM_SANDBOX=disabled'});
const ROLE = {store: 'the secret store', projects: 'the secret store\'s projects/ directory', tier: 'a project tier in the secret store\'s projects/ directory',
  project: 'this connection\'s project tier'};
// Whether `path` is a symlink; a failure is its parent directory's (`role`).
function isSymlink(path, role, store) {
  try { return lstatSync(path).isSymbolicLink(); } catch (error) { if (error.code === 'ENOENT') return false; return discoveryFailed(role, store, error); }
}
function tiersIn(projects, store) {
  try { return readdirSync(projects).sort(); } catch (error) { if (error.code === 'ENOENT') return []; return discoveryFailed(ROLE.projects, store, error); }
}
// realish (a dangling link followed to its target), its failure classified as `role`'s.
function realOf(path, role, store) {
  try { return realish(path); } catch (error) { return discoveryFailed(role, store, error); }
}

// The real targets of the cua home's top-level entries that are symlinks, except `reexposed` (entry names): a denied
// home (macOS) or home directory (Linux) does not cover what a symlink inside it leads to, since seatbelt and
// bubblewrap match by real path. Discovered at launch as the store's tiers are: an absent home has none; any other
// failure to list or inspect it refuses.
const homeDiscoveryFailed = (home, error) => fail('sandbox_state_invalid',
  `the cua home ${home} could not be read (${error.code ?? 'error'}), so the kernel's deny list cannot be established; this confined launch is refused`,
  {hint: 'fix that directory\'s permissions for your account (chmod u+rwx), or run the connection with CUA_SHIM_SANDBOX=disabled'});
function linkedOutOf(home, reexposed) {
  let names;
  try { names = readdirSync(home).sort(); } catch (error) { if (error.code === 'ENOENT') return []; return homeDiscoveryFailed(home, error); }
  return names.filter(name => !reexposed.includes(name)).flatMap(name => {
    const path = join(home, name);
    try { return lstatSync(path).isSymbolicLink() ? [realish(path)] : []; } catch (error) { if (error.code === 'ENOENT') return []; return homeDiscoveryFailed(home, error); }
  });
}

// The deny list for one launch -> {deny, reexpose, metadataOnly}, absolute paths. Denied (the kernel role only):
// - the secret store: `secretsDir` when secrets are on, else the default store for `env` (it exists whatever this
//   connection's setting); the real target of projects/ when it is a symlink, and of every symlinked tier inside it (the
//   store follows intermediate symlinks, so containment holds by real path only); and the real path of this connection's
//   project tier (`secretsProjectDir`) when it lies outside the store;
// - $HOME/.config/cua (device directory, extension key);
// - on macOS the whole cua home (`home`), which covers state/, remote/, chrome/, profiles, staging/, bin/ and every
//   other session's run/<id>, with runtimes/ and node/ (what the kernel's Node and packages load from), the launch's
//   run/<sessionId> and its session temp re-exposed; on Linux the home's private directories and run/ one by one
//   (state/, remote/, chrome/, run/), with run/<sessionId> and its session temp re-exposed: there the original does not
//   re-bind a read entry inside a denied directory (#115 M0c), so runtimes/ and node/ are not denied at all. The list
//   is the same under `default`, where nothing is writable and so nothing would be re-bound inside run/: the
//   default-mode kernel works in its own directory outside run/ instead (src/runtime/launch.mjs kernelDir, #115 M3);
// - on macOS, the real target of every top-level entry of the home that is a symlink, but runtimes/ and node/ (re-exposed
//   at their real paths): a symlinked state/, remote/, chrome/, run/... leads out of the denied home (linkedOutOf). On
//   Linux the listed directories are denied at their real paths (realDenyList), which is the same rule there.
// `tiers`: the deny targets that are tier targets outside the store (their creation rule differs, prepareDenyTargets);
// every other deny target is one of cua's fixed ones (the store, ~/.config/cua, the cua home or its directories).
// `metadataOnly`: the denied directories above the re-exposed paths whose metadata the kernel may read so those paths
// resolve (the seatbelt port's one widening, src/sandbox/seatbelt.mjs header): on macOS exactly the cua home and its
// run/; none on Linux. The port refuses to grant anything outside it.
// The store's family (the store, its tier targets, the project tier, ~/.config/cua) and the home are independent
// targets: a layout that nests one inside another, or re-exposes a path that overlaps one of the family, is refused
// (src/runtime/sandbox.mjs assertDenyListShape).
export function denyListFor({home, env, secretsDir, secretsProjectDir, sessionId, sessionTmp, platform}) {
  const layout = homeLayout(home);
  const store = secretsDir ?? storeDir(env);
  const deny = [store];
  // A tier inside a denied member of the store's family adds nothing (the deny covers it by real path), and a tier that
  // holds earlier tiers replaces them; the store itself always stays.
  const addSecret = path => {
    const real = realish(path);
    if (deny.some(member => within(real, realish(member)))) return;
    for (let i = deny.length - 1; i > 0; i--) if (within(realish(deny[i]), real)) deny.splice(i, 1);
    deny.push(path);
  };
  const projects = join(store, PROJECTS_FOLDER);
  if (isSymlink(projects, ROLE.store, store)) addSecret(realOf(projects, ROLE.projects, store));
  for (const name of tiersIn(projects, store)) if (isSymlink(join(projects, name), ROLE.projects, store)) addSecret(realOf(join(projects, name), ROLE.tier, store));
  if (secretsProjectDir) addSecret(realOf(secretsProjectDir, ROLE.project, store));
  // The tier targets (projects/'s own target, each symlinked tier's, this connection's project tier): every deny target
  // added after the store and before ~/.config/cua.
  const tiers = deny.slice(1);
  const add = path => { if (!deny.includes(path)) deny.push(path); };
  add(join(env.HOME || homedir(), '.config', 'cua'));
  const run = join(layout.run, sessionId);
  if (platform === 'linux') {
    for (const dir of ['state', 'remote', 'chrome', 'run']) add(join(layout.home, dir));
    return {deny, reexpose: [run, sessionTmp], metadataOnly: [], tiers};
  }
  add(layout.home);
  for (const target of linkedOutOf(layout.home, ['runtimes', 'node'])) if (!deny.some(member => within(target, realish(member)))) add(target);
  return {deny, reexpose: [layout.runtimes, layout.node, run, sessionTmp], metadataOnly: [layout.home, layout.run], tiers};
}

// `list` with every path at its real location (src/runtime/sandbox.mjs realish: a missing tail is kept as spelled under
// its nearest existing ancestor's real path), nothing created: what buildLaunch records in CUA_SANDBOX_DENY_READ.
export const realDenyList = list => ({deny: list.deny.map(realish), reexpose: list.reexpose.map(realish), metadataOnly: list.metadataOnly.map(realish), tiers: list.tiers.map(realish)});

// The deny list with every target at its real location, ready for the kernel's profile, and each missing target dealt
// with by platform (an existing target, whatever it is, is left as it is):
// - macOS: nothing is created. A missing target is denied at its realish path (the missing tail under its nearest
//   existing ancestor's real path), which seatbelt matches whenever the path appears later, through a symlinked
//   ~/.config too.
// - Linux (bubblewrap masks only a path that exists): one of cua's fixed targets (the store, ~/.config/cua, the cua
//   home's directories) is created 0700, with any missing parents, which must all lie inside `home` (the user's
//   HOME); an external tier target (`list.tiers`) is created as a leaf only, 0700, when its parent exists.
// Anything else, or a creation that fails, refuses the launch (sandbox_state_invalid); the sentence names a fixed
// target's path but never a tier's (a tier's path names a project). Runs before any kernel profile is rendered.
export function prepareDenyTargets(list, {platform = process.platform, home} = {}) {
  assertDenyListShape(list);
  const tiers = list.tiers.map(realish);
  const deny = list.deny.map(path => {
    const real = realish(path);
    if (platform === 'darwin' || exists(real)) return real;
    const tier = tiers.includes(real);
    const what = tier ? 'a project tier\'s target outside the secret store' : `the deny target ${real}`;
    const refuse = why => fail('sandbox_state_invalid', `${what} does not exist and ${why}, so the kernel cannot be denied it; this confined launch is refused`,
      {hint: 'create that directory yourself (mode 0700), or run the connection with CUA_SHIM_SANDBOX=disabled'});
    const missing = [];
    for (let dir = dirname(real); !exists(dir); dir = dirname(dir)) missing.push(dir);
    if (tier && missing.length) refuse('its parent directory is missing');
    if (missing.length && !(home && missing.every(dir => within(dir, realish(home)) && dir !== realish(home)))) refuse('a missing parent directory lies outside your HOME');
    try {
      mkdirSync(real, {recursive: true, mode: 0o700});
      chmodSync(real, 0o700);
    } catch (error) {
      refuse(`could not be created (${error.code ?? 'error'})`);
    }
    return real;
  });
  return {deny, reexpose: list.reexpose.map(realish), metadataOnly: list.metadataOnly.map(realish), tiers};
}

// CUA_SANDBOX_DENY_READ's value -> {deny, reexpose, metadataOnly, tiers}, or null when it is missing or not that JSON of
// absolute paths.
export function parseDenyRead(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  const paths = list => Array.isArray(list) && list.every(path => typeof path === 'string' && isAbsolute(path));
  return parsed && typeof parsed === 'object' && paths(parsed.deny) && paths(parsed.reexpose) && paths(parsed.metadataOnly) && paths(parsed.tiers)
    ? {deny: parsed.deny, reexpose: parsed.reexpose, metadataOnly: parsed.metadataOnly, tiers: parsed.tiers} : null;
}

// Every host read path is a kernel read grant, so one inside a deny target (and outside every re-exposed path) would
// reopen it: a Node under the home's state/ reopens all of state/, one under run/<other> another session. Refused
// (sandbox_conflict), by real path.
function assertReadPathsOutsideDenied(readPaths, denyRead) {
  const deny = denyRead.deny.map(realish), reexposed = denyRead.reexpose.map(realish);
  for (const path of readPaths.filter(Boolean)) {
    const real = realish(path), target = deny.find(member => within(real, member));
    if (target && !reexposed.some(root => within(real, root)))
      fail('sandbox_conflict', `the host read path ${path} lies inside ${target}, which JavaScript cells may not read, outside what is re-exposed there; the kernel's read grant would reopen it, so this kernel launch is refused`,
        {hint: 'keep the Node and module directories cua\'s own host reads outside the cua home\'s private directories, other sessions\' run directories, the secret store and ~/.config/cua'});
  }
}

const SPECIAL_KEYS = {root: ':root', minimal: ':minimal', tmpdir: ':tmpdir', slash_tmp: ':slash_tmp'};
const ACCESS = ['read', 'write', 'none'];
// The policy table of a call's sandbox state, validated as the vendor's node_repl validated it and keyed as it rendered
// its `-c permissions.node_repl` table (the recovered launch template, docs/doperpowers/research/2026-10-14-own-repl-host/
// node-repl-embedded-INDEX.md "Default timeout and launch templates"): the host's read paths as `read`, the profile's
// entries keyed `:root`, `:workspace_roots` ({'.': access}), `:tmpdir`, ... or by absolute path, in byte order.
// `state`: the call's `codex/sandbox-state-meta` value, or undefined when the call sent none. -> {disabled: true, cwd}
// or {filesystem: [[key, access]...], cwd}; `cwd` is the sandboxCwd path (null without a state). A state that is
// absent (the default mode) reads everything and writes nothing. Throws SandboxStateError for a value the vendor's
// would refuse or this sandbox cannot render.
export function policyTable(state, {readPaths = []} = {}) {
  const filesystem = new Map(readPaths.filter(Boolean).map(path => [path, 'read']));
  if (state === undefined) return {filesystem: sortedEntries(filesystem.set(':root', 'read')), cwd: null};
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new SandboxStateError(`invalid type: ${state === null ? 'null' : Array.isArray(state) ? 'sequence' : typeof state}, expected struct SandboxState`);
  const {permissionProfile: profile, sandboxCwd} = state;
  if (typeof sandboxCwd !== 'string') throw new SandboxStateError('missing field `sandboxCwd`');
  let cwd;
  try { cwd = fileURLToPath(sandboxCwd); } catch { throw new SandboxStateError('sandboxCwd must be an absolute file URI'); }
  if (profile?.type === 'disabled') return {disabled: true, cwd};
  if (profile?.type !== 'managed' || profile.file_system?.type !== 'restricted' || !Array.isArray(profile.file_system.entries))
    throw new SandboxStateError('unsupported permission profile: only managed restricted and disabled profiles are supported');
  for (const entry of profile.file_system.entries) {
    if (!ACCESS.includes(entry?.access)) throw new SandboxStateError(`unsupported filesystem access ${JSON.stringify(entry?.access)}`);
    const path = entry.path;
    if (path?.type === 'special' && path.value?.kind === 'project_roots' && path.value.subpath == null) filesystem.set(':workspace_roots', {'.': entry.access});
    else if (path?.type === 'special' && Object.hasOwn(SPECIAL_KEYS, path.value?.kind)) filesystem.set(SPECIAL_KEYS[path.value.kind], entry.access);
    else if (path?.type === 'path' && typeof path.path === 'string' && isAbsolute(path.path)) filesystem.set(path.path, entry.access);
    else throw new SandboxStateError(`unsupported filesystem path ${JSON.stringify(path)}`);
  }
  return {filesystem: sortedEntries(filesystem), cwd};
}

const PROFILE_SPECIALS = {':root': 'root', ':minimal': 'minimal', ':tmpdir': 'tmpdir', ':slash_tmp': 'slash_tmp'};
const sortedEntries = map => [...map].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const entryOf = ([key, access]) => {
  if (key === ':workspace_roots') return {path: {type: 'special', value: {kind: 'project_roots'}}, access: access['.']};
  if (Object.hasOwn(PROFILE_SPECIALS, key)) return {path: {type: 'special', value: {kind: PROFILE_SPECIALS[key]}}, access};
  return {path: {type: 'path', path: key}, access};
};

// One child's permission profile for a call's sandbox state -> {profile, cwd} (cwd: the state's sandboxCwd, null for
// the default state), or null for disabled. `state`: the call's sandbox-state value, or undefined (the default mode);
// `readPaths`: what both roles read; `denyRead`: prepareDenyTargets' result, which the kernel needs (SandboxStateError
// without it); `network`: the worker's ('restricted' | 'enabled'). Throws SandboxStateError for a state that cannot
// be rendered.
export function roleProfile({state, role, readPaths = [], denyRead, network = 'restricted'}) {
  if (!ROLES.includes(role)) throw new TypeError(`roleProfile: unknown role ${role}`);
  const table = policyTable(state, {readPaths});
  if (table.disabled) return null;
  const filesystem = new Map(table.filesystem);
  if (role === 'kernel') {
    if (!denyRead) throw new SandboxStateError('the kernel\'s deny list is missing (sandbox_state_invalid)');
    assertReadPathsOutsideDenied(readPaths, denyRead);
    for (const path of denyRead.reexpose) if (!filesystem.has(path)) filesystem.set(path, 'read');
    for (const path of denyRead.deny) filesystem.set(path, 'none');
  }
  return {cwd: table.cwd, profile: {type: 'managed', network: role === 'kernel' ? 'restricted' : network,
    file_system: {type: 'restricted', entries: sortedEntries(filesystem).map(entryOf)}}};
}

// The launch key: the call's sandbox state, its cwd and the read paths, never the role-rendered profile, so the kernel
// and the trusted worker of one state share it (the supervisor stops the worker whenever its key differs from the
// kernel launch's). Throws SandboxStateError for a state that cannot be rendered. `tableKey` is the same key for a state
// already validated (policyTable's result).
export const tableKey = table => (table.disabled ? 'disabled' : JSON.stringify([table.cwd, table.filesystem]));
export const stateKey = ({state, readPaths = []}) => tableKey(policyTable(state, {readPaths}));
