// cua's macOS sandbox: the seatbelt profile and `/usr/bin/sandbox-exec` argv the original `codex sandbox` renders for a
// permission profile (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "macOS: the seatbelt port").
//
// Ported from openai/codex@ff6aec96948b70d94983af2641a6b67c94faeff5 (tag rust-v0.159.2, Apache-2.0; ./LICENSE, ./NOTICE):
//   codex-rs/sandboxing/src/seatbelt.rs:21-28,217-231,386-626,882-1109 (the sections, the access policies, the carve-out
//     regexes, write-root normalization, the protected ancestors, the network section for cua's two values)
//   codex-rs/sandboxing/src/seatbelt_daemon.rs:7-23 (daemon-socket protection), seatbelt_scratch.rs:13-69 (`:minimal`)
//   codex-rs/protocol/src/permissions.rs:46-51,120-135,913-1088,1239-1330,1455-1480,1549-1797,1957-2012,2068-2101,
//     2137-2147,2222-2230,2250-2346,2348-2398,2506-2536,2568-2630 (permission resolution: most-specific entry, the
//     readable, writable and unreadable roots, the protected metadata names, default carve-outs, gitdir pointers)
//   codex-rs/protocol/src/permissions/local_aliases.rs:57-130 (alias-normalized matching)
//   codex-rs/utils/absolute-path/src/lib.rs:59-63,191-223, system_aliases.rs:12-30, codex-rs/uds/src/daemon_directory.rs:13-18
//   codex-rs/cli/src/debug_sandbox.rs:414-419 (the TIOCSTI line)
//   seatbelt/*.sbpl: byte copies of codex-rs/sandboxing/src/seatbelt_{base_policy,network_policy,preferences_policy,
//     read_only_platform_defaults}.sbpl
//
// Scoped to cua's input set: a managed, restricted profile whose entries are the special paths `root` (read only),
// `project_roots` (no subpath), `tmpdir`, `slash_tmp` and `minimal`, or absolute paths; access read, write or none
// (the original's alias for deny); network restricted or enabled; no globs, no proxy, no Unix-socket grants. Anything
// else is refused (SandboxStateError), never rendered. Byte parity with the original for these inputs is pinned by
// test/fixtures/sandbox/seatbelt (rendered by the original's own crates, scripts/sandbox-golden).
//
// Deviations from the original, each strictly tighter or a fix but the last, a bounded widening:
// - No Codex config: no config stack, MDM preferences, /etc/codex or $CODEX_HOME/.env is read, and no arg0 PATH entry
//   is added. The profile is exactly the input, the same on every machine.
// - The TIOCSTI line is `(deny file-ioctl (ioctl-command 2147578994))`, the number upstream adopted after the tag
//   (openai/codex f817e16905): older policy compilers reject the symbol.
// - CODEX_GUARDIAN_DECISIONS_API_KEY joins the stripped environment names (./env.mjs; upstream 9552906b2b).
// - A relative TMPDIR is refused. The original resolves it against its own working directory, a write root the scoped
//   preflight (src/runtime/sandbox.mjs tmpdirRoot) never sees; cua's launches always name an absolute one.
// - Re-exposed paths inside a denied directory get the metadata of the denied directories above them, and nothing
//   else of them: `(allow file-read-metadata (literal …))` for each such ancestor no readable root already covers, last
//   in the profile. Without it a path inside is readable but unresolvable: realpath(3) and Node's module resolution
//   lstat every component, and the denied ancestor's lstat fails with EPERM (measured on macOS 26 with the original's
//   own rendering of "deny the cua home, read runtimes/": a module import under runtimes/ failed). Its contents and
//   its listing stay denied. The ancestors are taken from the rendered (real-path) roots, never as a subpath; for cua's
//   macOS layout they are exactly the cua home and its run/ (test/sandbox/reexposed.test.mjs), and the caller names the
//   directories it allows (`metadataGrants`): any other ancestor refuses the rendering. The one deviation that
//   widens what the original grants, accepted as a recorded deviation (#115 M1).
// - #138's switch, off (NOTIFICATION_CENTER_GRANT): on, both roles' profiles end with
//   `(allow mach-lookup (global-name "com.apple.system.notification_center"))`, the lookup notify_register_tz makes on a
//   process's first host-local-time use, which the original grants only in its `:minimal` platform defaults. A denied
//   lookup there fits #138's hang, but #138 has not reproduced since (#115 M0: none in 80 runs per role under the real
//   HOME, nor in 160 under a scratch one), so nothing measures what the grant fixes and it ships off (cua 0.15.0); a
//   widening needs evidence. scripts/sandbox-probe/tz-probe.mjs renders the profiles with it and without it, so a
//   reproduction can decide it by acceptance 13's rule. The own host's time-zone warm-up
//   (src/repl-host/worker-runtime.mjs) stays either way.
import {lstatSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {posix} from 'node:path';
import {SandboxStateError} from '../runtime/sandbox.mjs';

export const SEATBELT_EXEC = '/usr/bin/sandbox-exec';
const SBPL = name => readFileSync(new URL(`./seatbelt/seatbelt_${name}.sbpl`, import.meta.url), 'utf8');
const BASE_POLICY = SBPL('base_policy');
const NETWORK_POLICY = SBPL('network_policy');
const PREFERENCES_POLICY = SBPL('preferences_policy');
const PLATFORM_DEFAULTS = SBPL('read_only_platform_defaults');
const TLS_TRUST_POLICY = '(allow mach-lookup (global-name "com.apple.TrustEvaluationAgent"))\n';
const TIOCSTI_LINE = '(deny file-ioctl (ioctl-command 2147578994))';
// #138's switch (header): off.
export const NOTIFICATION_CENTER_LINE = '(allow mach-lookup (global-name "com.apple.system.notification_center"))';
export const NOTIFICATION_CENTER_GRANT = false;
const PROTECTED_NAMES = ['.git', '.agents', '.codex', '.aws'];
const SPECIAL_KINDS = ['root', 'project_roots', 'tmpdir', 'slash_tmp', 'minimal'];
// The original's access precedence at equal specificity: deny beats write, write beats read.
const RANK = {read: 0, write: 1, deny: 2};

const NODE_FS = {lstat: lstatSync, stat: statSync, realpath: realpathSync.native, readFile: path => readFileSync(path, 'utf8')};

// ---- paths (Rust's Path semantics: component-wise prefixes and ordering) ----
const parts = path => path.split('/').filter(Boolean);
const absolutize = path => posix.resolve('/', path);
const depth = path => parts(path).length;
const parentOf = path => (path === '/' ? null : posix.dirname(path));
const joinPath = (base, rest) => (rest ? posix.join(base, rest) : base);
const within = (path, root) => {
  const a = parts(path), b = parts(root);
  return b.length <= a.length && b.every((part, i) => part === a[i]);
};
const suffixOf = (path, root) => parts(path).slice(depth(root)).join('/');
const ancestorsOf = path => {
  const out = [];
  for (let current = path; current !== null; current = parentOf(current)) out.push(current);
  return out;
};
const byteCompare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const comparePaths = (a, b) => {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = byteCompare(x[i], y[i]); if (c) return c; }
  return x.length - y.length;
};
const dedup = paths => [...new Map(paths.map(path => [path, path])).values()];
// regex-lite's escape: its meta characters, each behind a backslash.
const regexEscape = text => text.replace(/[\\.+*?()|[\]{}^$#&\-~]/g, '\\$&');

// ---- the filesystem as the original reads it ----
function fsOps(fs) {
  const tryOr = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const lstat = path => tryOr(() => fs.lstat(path), null);
  const isSymlink = path => lstat(path)?.isSymbolicLink() ?? false;
  const stat = path => tryOr(() => fs.stat(path), null);
  const canonicalize = path => tryOr(() => fs.realpath(path), null);
  // A symlink at depth two or more: the user-controlled components (top-level aliases such as /tmp are trusted).
  const mutableSymlink = path => ancestorsOf(path).find(a => depth(a) >= 2 && isSymlink(a)) ?? null;
  // normalize_system_aliases: a top-level symlink resolved, every other component kept as spelled.
  const normalizeAliases = path => {
    if (path === '/') return path;
    const top = `/${parts(path)[0]}`;
    let info;
    try { info = fs.lstat(top); } catch (error) {
      if (error.code === 'ENOENT') return path;
      throw new SandboxStateError(`failed to normalize top-level alias for path ${path}: ${error.message}`);
    }
    if (!info.isSymbolicLink()) return path;
    let real;
    try { real = fs.realpath(top); } catch (error) { throw new SandboxStateError(`failed to normalize top-level alias for path ${path}: ${error.message}`); }
    return joinPath(real, suffixOf(path, top));
  };
  // normalize_path_for_sandbox: canonical when it resolves, else the logical absolute path.
  const forSandbox = path => canonicalize(absolutize(path)) ?? absolutize(path);
  // canonicalize_preserving_symlinks: the logical path when a mutable symlink would rewrite it.
  const preservingSymlinks = path => {
    const canonical = canonicalize(path);
    if (canonical === null) return path;
    return mutableSymlink(path) !== null && canonical !== path ? path : canonical;
  };
  // normalize_effective_absolute_path: the nearest existing ancestor normalized, the rest appended.
  const effective = path => {
    for (const ancestor of ancestorsOf(path)) {
      if (lstat(ancestor) === null) continue;
      return joinPath(preservingSymlinks(ancestor), suffixOf(path, ancestor));
    }
    return path;
  };
  const tryAliases = path => { try { return normalizeAliases(path); } catch { return path; } };
  return {lstat, lstatStrict: fs.lstat, stat, canonicalize, mutableSymlink, normalizeAliases, tryAliases, forSandbox, effective, readFile: fs.readFile};
}

// ---- the profile as cua gives it ----
// -> {entries: [{path: absolute path | {special}, access}], network}, project roots materialized to `cwd`.
function parseProfile(profile, cwd) {
  if (profile?.type !== 'managed') throw new SandboxStateError('only a managed permission profile can be rendered');
  if (profile.file_system?.type !== 'restricted' || !Array.isArray(profile.file_system.entries))
    throw new SandboxStateError('only a restricted filesystem with entries can be rendered');
  if (!['restricted', 'enabled'].includes(profile.network)) throw new SandboxStateError(`unsupported network ${JSON.stringify(profile.network)}`);
  const entries = profile.file_system.entries.map(entry => {
    const access = entry?.access === 'none' ? 'deny' : entry?.access;
    if (!Object.hasOwn(RANK, access)) throw new SandboxStateError(`unsupported filesystem access ${JSON.stringify(entry?.access)}`);
    const {path} = entry;
    if (path?.type === 'path') {
      if (typeof path.path !== 'string' || !path.path.startsWith('/')) throw new SandboxStateError(`filesystem path ${JSON.stringify(path.path)} is not absolute`);
      return {path: absolutize(path.path), access};
    }
    const kind = path?.type === 'special' ? path.value?.kind : undefined;
    if (!SPECIAL_KINDS.includes(kind) || Object.keys(path.value).some(key => key !== 'kind' && key !== 'subpath'))
      throw new SandboxStateError(`unsupported filesystem path ${JSON.stringify(path)}`);
    if (path.value.subpath != null) throw new SandboxStateError(`unsupported filesystem path ${JSON.stringify(path)}: a subpath of the project roots`);
    if (kind === 'root' && access !== 'read') throw new SandboxStateError(`unsupported filesystem entry: :root is rendered only with read access, not ${entry.access}`);
    return kind === 'project_roots' ? {path: cwd, access} : {path: {special: kind}, access};
  });
  return {entries, network: profile.network};
}

// ---- permission resolution (protocol/src/permissions.rs, local_aliases.rs) ----
function policyOf({entries, cwd, tmpdir, ops}) {
  const special = (entry, kind) => typeof entry.path === 'object' && entry.path.special === kind;
  const fullRead = entries.some(e => special(e, 'root')) && !entries.some(e => e.access === 'deny');
  const platformDefaults = !fullRead && entries.some(e => special(e, 'minimal') && e.access !== 'deny');
  // resolved_entries_with_cwd: what each entry names for this cwd and TMPDIR (`:minimal` names nothing).
  const resolve = entry => {
    if (typeof entry.path === 'string') return entry.path;
    switch (entry.path.special) {
      case 'root': return '/';
      case 'tmpdir': return tmpdir;
      case 'slash_tmp': return ops.stat('/tmp')?.isDirectory() ? '/tmp' : null;
      default: return null;
    }
  };
  const resolved = entries.map(entry => ({path: resolve(entry), access: entry.access})).filter(entry => entry.path !== null);
  // The matcher's entries (prepare_local_matching on macOS): the same targets in the alias-normalized namespace; its
  // `:slash_tmp` is /tmp whether or not it exists.
  const matcherEntries = entries.map(entry => {
    if (special(entry, 'slash_tmp')) return {path: '/tmp', access: entry.access};
    const path = resolve(entry);
    return path === null ? null : {path, access: entry.access};
  }).filter(Boolean).map(entry => ({path: ops.normalizeAliases(entry.path), access: entry.access}));
  const resolveAccess = target => {
    const path = ops.normalizeAliases(target);
    let best = null;
    for (const entry of matcherEntries) {
      if (!within(path, entry.path)) continue;
      const key = [depth(entry.path), RANK[entry.access]];
      if (!best || key[0] > best[0] || (key[0] === best[0] && key[1] > best[1])) best = [...key, entry.access];
    }
    return best ? best[2] : 'deny';
  };
  // metadata_write_denial: a protected name below a writable entry stays unwritable unless a write entry at or below it
  // grants it explicitly.
  const metadataDenied = target => {
    const path = ops.normalizeAliases(target);
    for (const entry of matcherEntries.filter(e => e.access === 'write')) {
      const name = PROTECTED_NAMES.find(n => within(path, joinPath(entry.path, n)));
      if (name === undefined) continue;
      const protectedPath = joinPath(entry.path, name);
      return !matcherEntries.some(e => e.access === 'write' && within(path, e.path) && within(e.path, protectedPath));
    }
    return false;
  };
  const canRead = target => resolveAccess(target) !== 'deny';
  const canWrite = target => resolveAccess(target) === 'write' && !metadataDenied(target);

  const readableRoots = () => (fullRead ? [] : dedup(resolved.filter(e => e.access !== 'deny' && canRead(e.path)).map(e => ops.effective(e.path))));
  const unreadableRoots = () => dedup(resolved.filter(e => e.access === 'deny' && !canRead(e.path) && e.path !== '/').map(e => ops.effective(e.path)));
  const writableRoots = () => writableRootsOf({resolved, cwd, ops, canWrite});
  return {fullRead, platformDefaults, canWrite, readableRoots, unreadableRoots, writableRoots};
}

// default_read_only_subpaths_for_writable_root.
function defaultReadOnlySubpaths(root, protectMissingDotCodex, ops) {
  const subpaths = [];
  const git = joinPath(root, '.git');
  const gitInfo = ops.stat(git);
  if (gitInfo?.isFile() || gitInfo?.isDirectory()) {
    if (gitInfo.isFile()) {
      const gitdir = gitdirOf(git, ops);
      if (gitdir !== null) subpaths.push(gitdir);
    }
    subpaths.push(git);
  }
  const agents = joinPath(root, '.agents');
  if (ops.stat(agents)?.isDirectory()) subpaths.push(agents);
  const codex = joinPath(root, '.codex');
  if (protectMissingDotCodex || ops.stat(codex)?.isDirectory()) subpaths.push(codex);
  const aws = joinPath(root, '.aws');
  if (ops.stat(aws)?.isDirectory()) subpaths.push(aws);
  return dedup(subpaths);
}

// resolve_gitdir_from_file: the target of a `gitdir: <path>` pointer, when it exists.
function gitdirOf(dotGit, ops) {
  let text;
  try { text = ops.readFile(dotGit); } catch { return null; }
  const trimmed = text.trim();
  const colon = trimmed.indexOf(':');
  if (colon === -1 || trimmed.slice(0, colon).trim() !== 'gitdir') return null;
  const raw = trimmed.slice(colon + 1).trim();
  if (!raw) return null;
  const path = posix.resolve(posix.dirname(dotGit), raw);
  return ops.stat(path) ? path : null;
}

// get_writable_roots_with_cwd_preserving_mutable_paths -> [{root, readOnly, names}], in entry order.
function writableRootsOf({resolved, cwd, ops, canWrite}) {
  if (!resolved.some(e => e.access === 'write')) return [];
  const effective = resolved.filter(e => (e.access === 'write') === canWrite(e.path));
  if (!effective.some(e => e.access === 'write')) return [];
  const explicit = path => resolved.some(e => e.path === path);
  const gitdirs = effective.filter(e => e.access === 'write').map(e => {
    const dotGit = joinPath(ops.tryAliases(e.path), '.git');
    return ops.stat(dotGit)?.isFile() ? gitdirOf(dotGit, ops) : null;
  }).filter(path => path !== null && !explicit(path))
    .map(path => ({entry: {path, access: 'read'}, effectivePath: ops.canonicalize(path) ?? ops.effective(path)}));
  const prepared = [...effective.map(entry => ({entry, effectivePath: ops.tryAliases(entry.path)})), ...gitdirs];
  const writable = prepared.filter(p => p.entry.access === 'write');
  const effectiveCwd = ops.tryAliases(cwd);
  return dedup(writable.map(p => p.effectivePath)).map(root => {
    const preserveRaw = root !== '/';
    const rawRoots = writable.filter(p => p.effectivePath === root).map(p => p.entry.path);
    const names = PROTECTED_NAMES.filter(name => [joinPath(root, name), ...rawRoots.map(raw => joinPath(raw, name))].every(path => !canWrite(path)));
    const readOnly = defaultReadOnlySubpaths(root, effectiveCwd === root, ops).filter(path => !explicit(path));
    for (const {entry, effectivePath} of prepared.filter(p => p.entry.access !== 'write')) {
      let raw = null;
      if (preserveRaw && entry.path !== root) {
        if (within(entry.path, root)) raw = entry.path;
        else for (const rawRoot of rawRoots) {
          if (within(entry.path, rawRoot) && depth(entry.path) > depth(rawRoot)) { raw = joinPath(root, suffixOf(entry.path, rawRoot)); break; }
        }
      }
      if (raw !== null) readOnly.push(raw);
      else if (effectivePath !== root && within(effectivePath, root)) readOnly.push(effectivePath);
    }
    return {root, readOnly: dedup(readOnly), names};
  });
}

// seatbelt.rs protected_metadata_names_for_writable_root: the root's protected names, then any other name not writable.
const seatbeltNames = (root, canWrite) => [...root.names, ...PROTECTED_NAMES.filter(name => !root.names.includes(name) && !canWrite(joinPath(root.root, name)))];

function metadataNameRegex(root, name) {
  const base = root.replace(/(?<=.)\/+$/, '');
  return base === '/' ? `^/${regexEscape(name)}(/.*)?$` : `^${regexEscape(base)}/${regexEscape(name)}(/.*)?$`;
}

// normalize_writable_root_for_sandbox -> {root, literal}.
function normalizeWritableRoot(root, ops) {
  const symlink = ops.mutableSymlink(root);
  if (symlink !== null) throw new SandboxStateError(`writable root ${root} contains symlink component ${symlink}; symlinked writable roots are not supported.`);
  const normalized = ops.normalizeAliases(root);
  let info;
  try { info = ops.lstatStrict(normalized); } catch (error) {
    if (error.code === 'ENOENT') return {root: normalized, literal: false};
    throw new SandboxStateError(`failed to inspect Seatbelt writable root ${normalized}: ${error.message}`);
  }
  return {root: normalized, literal: !info.isDirectory()};
}

// build_seatbelt_access_policy -> {policy, params, rendered: [{root, excluded}] as the params name them}.
function accessPolicy(kind, roots, ops) {
  const [action, prefix] = kind === 'read' ? ['file-read*', 'READABLE_ROOT'] : ['file-write*', 'WRITABLE_ROOT'];
  const components = [], anchorDenies = [], params = [], rendered = [];
  roots.forEach((accessRoot, index) => {
    const {root, literal} = kind === 'read' ? {root: ops.forSandbox(accessRoot.root), literal: false} : normalizeWritableRoot(accessRoot.root, ops);
    const rootParam = `${prefix}_${index}`;
    params.push([rootParam, root]);
    const record = {root, excluded: []};
    rendered.push(record);
    if (kind === 'write') anchorDenies.push(`(deny file-write-unlink (require-all (literal (param "${rootParam}")) (vnode-type DIRECTORY)))`);
    const filter = `(${literal ? 'literal' : 'subpath'} (param "${rootParam}"))`;
    const names = accessRoot.names ?? [];
    if (!accessRoot.excluded.length && !names.length) return void components.push(filter);
    const require = [filter];
    accessRoot.excluded.forEach((excluded, excludedIndex) => {
      const param = `${prefix}_${index}_EXCLUDED_${excludedIndex}`;
      let paths;
      if (kind === 'read') paths = [[param, ops.forSandbox(excluded)]];
      else {
        const logical = ops.normalizeAliases(excluded);
        const resolved = ops.forSandbox(logical);
        paths = [[param, logical], ...(resolved !== logical ? [[`${param}_RESOLVED`, resolved]] : [])];
      }
      for (const [key, path] of paths) {
        params.push([key, path]);
        record.excluded.push(path);
        require.push(`(require-not (literal (param "${key}")))`, `(require-not (subpath (param "${key}")))`);
      }
    });
    for (const name of names) require.push(`(require-not (regex #"${metadataNameRegex(root, name).replaceAll('"', '\\"')}"))`);
    components.push(`(require-all ${require.join(' ')} )`);
  });
  if (!components.length) return {policy: '', params: [], rendered: []};
  return {policy: [`(allow ${action}\n${components.join(' ')}\n)`, ...anchorDenies].join('\n'), params, rendered};
}

// seatbelt_scratch.rs scratch_access_roots: `:minimal`'s implicit /private/tmp and /private/var/tmp, writable under the
// same policy with two more write entries, minus everything the policy keeps read-only or unreadable.
function scratchRoots({policy, entries, writableRoots, scratchPolicy}) {
  const unreadable = policy.unreadableRoots();
  const readOnly = [...policy.readableRoots().filter(path => !policy.canWrite(path)), ...unreadable];
  for (const root of writableRoots) readOnly.push(...root.readOnly, ...seatbeltNames(root, policy.canWrite).map(name => joinPath(root.root, name)));
  const scratch = ['/private/tmp', '/private/var/tmp'];
  const writes = scratchPolicy([...entries, ...scratch.map(path => ({path, access: 'write'}))]).writableRoots()
    .filter(root => scratch.includes(root.root)).map(root => ({...root, readOnly: [...root.readOnly, ...readOnly]}));
  return {reads: scratch.map(root => ({root, excluded: unreadable})), writes};
}

// seatbelt_daemon.rs protection_policy for /private/tmp/codex-daemon-<euid> (/tmp's real path).
function daemonProtection(ops, euid) {
  const directory = `${ops.canonicalize('/tmp') ?? '/tmp'}/codex-daemon-${euid}`;
  const quoted = JSON.stringify(directory);
  return [`(deny file-read* file-write* (literal ${quoted}) (subpath ${quoted}))\n(deny network-outbound (remote unix-socket (subpath ${quoted})))`,
    ...ancestorsOf(directory).slice(1).map(a => `(deny file-write-unlink (require-all (vnode-type DIRECTORY) (literal ${JSON.stringify(a)})))`)].join('\n');
}

// cua's deviation (header): the denied directories above each readable root that no readable root covers.
function reexposedAncestors(readRoots) {
  const readable = path => readRoots.some(r => within(path, r.root) && !r.excluded.some(x => within(path, x)));
  const out = [];
  for (const {root} of readRoots) {
    for (const ancestor of ancestorsOf(root).slice(1)) {
      if (!readRoots.some(r => r.excluded.some(x => within(ancestor, x)))) continue;
      if (!readable(ancestor) && !out.includes(ancestor)) out.push(ancestor);
    }
  }
  return out.sort(comparePaths);
}

// The sandbox-exec invocation for `command` ([file, ...args]) under `profile` (the permission profile) in `cwd`, with
// `:tmpdir` naming `tmpdir` (the child's TMPDIR; unset or empty: no entry). `fs` is the filesystem seam ({lstat, stat,
// realpath, readFile}; node:fs by default) and `euid` the user whose daemon directory is protected. `metadataGrants`:
// the denied directories whose metadata the launch allows (the deny list's metadataOnly); a profile that would need the
// grant anywhere else is refused, never rendered. `notificationCenter`: whether the profile ends with #138's line
// (header; NOTIFICATION_CENTER_GRANT, off, unless the caller says).
// -> {file: '/usr/bin/sandbox-exec', args}. Throws SandboxStateError for an input outside cua's set or one the original
// refuses (a write root through a symlinked component).
export function seatbeltCommand({profile, cwd, command, tmpdir, fs = NODE_FS, euid = process.geteuid(), metadataGrants = [], notificationCenter = NOTIFICATION_CENTER_GRANT}) {
  if (typeof cwd !== 'string' || !cwd.startsWith('/')) throw new SandboxStateError(`the sandbox working directory ${JSON.stringify(cwd)} is not an absolute path`);
  if (tmpdir !== undefined && tmpdir !== '' && !String(tmpdir).startsWith('/')) throw new SandboxStateError(`TMPDIR ${tmpdir} is not an absolute path`);
  const ops = fsOps(fs);
  const sandboxCwd = absolutize(cwd);
  const {entries, network} = parseProfile(profile, sandboxCwd);
  const resolvedTmpdir = tmpdir ? absolutize(tmpdir) : null;
  const policy = policyOf({entries, cwd: sandboxCwd, tmpdir: resolvedTmpdir, ops});
  const unreadable = policy.unreadableRoots();
  const writableRoots = policy.writableRoots();
  let scratchReads = [];
  if (policy.platformDefaults) {
    const scratch = scratchRoots({policy, entries, writableRoots, scratchPolicy: more => policyOf({entries: more, cwd: sandboxCwd, tmpdir: resolvedTmpdir, ops})});
    writableRoots.push(...scratch.writes);
    scratchReads = scratch.reads;
  }

  // Ancestors of every read-only carve-out inside its write root (the root included), so that renaming a writable
  // directory cannot carry a carve-out out of its rule.
  const ancestors = [];
  for (const root of writableRoots) {
    const anchor = ops.forSandbox(root.root);
    for (const path of root.readOnly) {
      const logical = ops.normalizeAliases(path);
      const resolved = ops.forSandbox(logical);
      for (const protectedPath of resolved !== logical ? [logical, resolved] : [logical]) {
        for (const ancestor of ancestorsOf(protectedPath).slice(1)) {
          if (!within(ancestor, anchor)) break;
          if (!ancestors.includes(ancestor)) ancestors.push(ancestor);
        }
      }
    }
  }
  const ancestorParams = ancestors.sort(comparePaths).map((path, index) => [`PROTECTED_ANCESTOR_${index}`, path]);

  const write = accessPolicy('write', writableRoots.map(root => ({root: root.root, excluded: root.readOnly, names: seatbeltNames(root, policy.canWrite)})), ops);
  let read;
  if (policy.fullRead) read = {policy: '; allow read-only file operations\n(allow file-read*)', params: [], rendered: []};
  else {
    const built = accessPolicy('read', [...policy.readableRoots().map(root => ({root, excluded: unreadable.filter(path => within(path, root))})), ...scratchReads], ops);
    read = {...built, policy: built.policy ? `; allow read-only file operations\n${built.policy}` : ''};
  }
  const networkPolicy = network === 'enabled' ? `(allow network-outbound)\n(allow network-inbound)\n${NETWORK_POLICY}${TLS_TRUST_POLICY}` : '';

  const sections = [BASE_POLICY, read.policy, write.policy, networkPolicy];
  if (policy.fullRead) sections.push(PREFERENCES_POLICY);
  if (policy.platformDefaults) sections.push(PLATFORM_DEFAULTS, '(allow file-read* (subpath "/Applications"))');
  sections.push(daemonProtection(ops, euid), '(deny mach-lookup (xpc-service-name-prefix ""))', '');
  sections.push(...ancestorParams.map(([key]) => `(deny file-write-unlink (require-all (vnode-type DIRECTORY) (literal (param "${key}"))))`));
  sections.push('(deny system-fcntl (fcntl-command 80 110))', TIOCSTI_LINE);

  // cua's deviation (header): metadata of the denied directories above re-exposed paths, in the read params' namespace.
  const grantable = metadataGrants.map(path => ops.forSandbox(path));
  const ungranted = reexposedAncestors(read.rendered).filter(path => !grantable.includes(path));
  if (ungranted.length) throw new SandboxStateError(`the profile would let the kernel read the metadata of ${ungranted.join(', ')}, which the launch does not allow (only ${metadataGrants.join(', ') || 'none'})`);
  const reexposed = reexposedAncestors(read.rendered).map((path, index) => [`REEXPOSED_ANCESTOR_${index}`, path]);
  if (reexposed.length) sections.push(`(allow file-read-metadata ${reexposed.map(([key]) => `(literal (param "${key}"))`).join(' ')})`);
  if (notificationCenter) sections.push(NOTIFICATION_CENTER_LINE);

  const params = [...read.params, ...write.params, ...ancestorParams, ...reexposed];
  return {file: SEATBELT_EXEC, args: ['-p', sections.join('\n'), ...params.map(([key, value]) => `-D${key}=${value}`), '--', ...command]};
}
