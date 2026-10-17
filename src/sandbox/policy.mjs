// cua's sandbox policy model (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "Policy: roles and the
// deny list"): one permission profile per role for a call's sandbox state, and the deny list that keeps the kernel (the
// model's cells) out of cua's private state while the trusted worker keeps reading the secret store.
//
// A profile is the original's JSON shape ({type: 'managed', file_system: {type: 'restricted', entries}, network}), with
// entries in the order the Codex CLI compiles cua's `-c permissions.node_repl` table (src/runtime/sandbox.mjs
// sandboxPolicy, whose validation and key order it reuses): absolute paths by bytes, then the special paths. So the
// port (./seatbelt.mjs) renders what the signed CLI renders for the same input.
//
// Both roles start from the state (scoped: `:root` read, project roots and `:tmpdir` write; default: `:root` read;
// disabled: no profile) plus the host's read paths. The kernel adds the deny list: each denied directory as a `none`
// entry, each re-exposed path as a read entry (where the state also makes one writable, the original's precedence keeps
// it writable: write beats read at equal depth). The kernel's network is always restricted.
import {lstatSync, mkdirSync, readdirSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join, relative} from 'node:path';
import {SandboxStateError, assertDenyListShape, realish, sandboxPolicy} from '../runtime/sandbox.mjs';
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

// Discovering the secret store's tiers fails closed: a path that is absent (ENOENT) has nothing to deny, and any other
// failure to look (EACCES on a search-only projects/, ELOOP, EIO...) refuses the launch, since a tier it hides would
// stay readable to the kernel.
const DISCOVERY_HINT = 'make the secret store and its projects/ readable by your account (chmod u+rx), or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly';
const discoveryFailed = (path, error) => fail('sandbox_state_invalid',
  `the secret store's tiers could not be listed at ${path} (${error.code ?? error.message}), so the kernel's deny list would miss any tier there; the launch is refused`, {hint: DISCOVERY_HINT});
function isSymlink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch (error) { if (error.code === 'ENOENT') return false; return discoveryFailed(path, error); }
}
function tiersIn(projects) {
  try { return readdirSync(projects).sort(); } catch (error) { if (error.code === 'ENOENT') return []; return discoveryFailed(projects, error); }
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
//   re-bind a read entry inside a denied directory (#115 M0c), so runtimes/ and node/ are not denied at all.
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
  if (isSymlink(projects)) addSecret(realish(projects));
  for (const name of tiersIn(projects)) if (isSymlink(join(projects, name))) addSecret(realish(join(projects, name)));
  if (secretsProjectDir) addSecret(realish(secretsProjectDir));
  const add = path => { if (!deny.includes(path)) deny.push(path); };
  add(join(env.HOME || homedir(), '.config', 'cua'));
  const run = join(layout.run, sessionId);
  if (platform === 'linux') {
    for (const dir of ['state', 'remote', 'chrome', 'run']) add(join(layout.home, dir));
    return {deny, reexpose: [run, sessionTmp], metadataOnly: []};
  }
  add(layout.home);
  return {deny, reexpose: [layout.runtimes, layout.node, run, sessionTmp], metadataOnly: [layout.home, layout.run]};
}

// `list` with every path at its real location (src/runtime/sandbox.mjs realish: a missing tail is kept as spelled under
// its nearest existing ancestor's real path), nothing created: what buildLaunch records in CUA_SANDBOX_DENY_READ.
export const realDenyList = list => ({deny: list.deny.map(realish), reexpose: list.reexpose.map(realish), metadataOnly: list.metadataOnly.map(realish)});

// Creates each deny target that does not exist, as a directory with mode 0700 at its real location (idempotent; an
// existing target, whatever it is, is left as it is), and returns the list with real paths. A target that cannot be
// created throws SandboxStateError: the launch is refused. Before any kernel profile is rendered: on Linux a mask is
// only made for a root that exists, and on macOS a logical path is all the original falls back to.
export function prepareDenyTargets(list) {
  assertDenyListShape(list);
  const deny = list.deny.map(path => {
    const real = realish(path);
    try {
      if (!exists(real)) mkdirSync(real, {recursive: true, mode: 0o700});
      return realpathSync.native(real);
    } catch (error) {
      throw new SandboxStateError(`the deny target ${path} could not be created (${error.code ?? error.message})`);
    }
  });
  return {deny, reexpose: list.reexpose.map(realish), metadataOnly: list.metadataOnly.map(realish)};
}

// CUA_SANDBOX_DENY_READ's value -> {deny, reexpose, metadataOnly}, or null when it is missing or not that JSON of
// absolute paths.
export function parseDenyRead(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  const paths = list => Array.isArray(list) && list.every(path => typeof path === 'string' && isAbsolute(path));
  return parsed && typeof parsed === 'object' && paths(parsed.deny) && paths(parsed.reexpose) && paths(parsed.metadataOnly)
    ? {deny: parsed.deny, reexpose: parsed.reexpose, metadataOnly: parsed.metadataOnly} : null;
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
  const table = sandboxPolicy(state, {readPaths});
  if (table.disabled) return null;
  const filesystem = new Map(table.filesystem);
  if (role === 'kernel') {
    if (!denyRead) throw new SandboxStateError('the kernel\'s deny list is missing (sandbox_state_invalid)');
    for (const path of denyRead.reexpose) if (!filesystem.has(path)) filesystem.set(path, 'read');
    for (const path of denyRead.deny) filesystem.set(path, 'none');
  }
  return {cwd: table.cwd, profile: {type: 'managed', network: role === 'kernel' ? 'restricted' : network,
    file_system: {type: 'restricted', entries: sortedEntries(filesystem).map(entryOf)}}};
}

// The launch key: the call's sandbox state, its cwd and the read paths, never the role-rendered profile, so the kernel
// and the trusted worker of one state share it (the supervisor stops the worker whenever its key differs from the
// kernel launch's). Throws SandboxStateError for a state that cannot be rendered. `tableKey` is the same key for a state
// already validated (sandboxPolicy's result).
export const tableKey = table => (table.disabled ? 'disabled' : JSON.stringify([table.cwd, table.filesystem]));
export const stateKey = ({state, readPaths = []}) => tableKey(sandboxPolicy(state, {readPaths}));
