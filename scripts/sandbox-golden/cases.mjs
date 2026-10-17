// The seatbelt golden fixture matrix (#115 M0; spec Plan of Work, "Golden generator"). Each case is one input to the
// original's generator: a filesystem setup under the scratch root, the generator's TMPDIR, and the input
// {cwd, profile, command, env}. Paths use fixtures.mjs's placeholders.
//
// The layout mirrors a cua launch: `home` is HOME (the secret store and ~/.config/cua inside it), `cuahome` is
// CUA_HOME (runtimes/, node/, state/, remote/, chrome/, run/<id> with its session temp run/<id>/tmp, another session's
// run directory), `cua` is the checkout. Profiles are built through cua's own sandboxPolicy, so their entries carry the
// key order cua's `-c permissions.node_repl` table has today (absolute paths by bytes, then :root, :tmpdir,
// :workspace_roots), which is the order the original compiles them in. The kernel cases carry the spec's deny list
// (Design, "Policy") in one plausible rendering: denied directories as `none` entries, the re-exposed ones as `read`,
// the run directory and session temp kept as the write roots. M1's policy.mjs decides its own rendering; these cases
// are inputs the port must reproduce, not that decision.
import {pathToFileURL} from 'node:url';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';
import {sandboxPolicy} from '../../src/runtime/sandbox.mjs';
import {profileFromPolicy} from '../sandbox-probe/compare.mjs';

const SESSION = '7062c419-3288-4b60-970f-a808ecfcf291';
const RELEASE = '26.928.40906-darwin-arm64';
const R = '@ROOT@';
const HOME = `${R}/home`;
const STORE = `${HOME}/${STORE_RELATIVE}`;
const CONFIG = `${HOME}/.config/cua`;
const CUA_HOME = `${R}/cuahome`;
const RUN = `${CUA_HOME}/run/${SESSION}`;
const SESSION_TMP = `${RUN}/tmp`;
const RUNTIME = `${CUA_HOME}/runtimes/${RELEASE}`;
const OWN_NODE = `${CUA_HOME}/node/24.22.0/bin/node`;
const VENDOR_NODE_BIN = `${RUNTIME}/cua_node/bin`;
const MODULES = `${RUNTIME}/cua_node/lib/node_modules`;
const CHECKOUT = `${R}/cua`;
const SCRIPT_DIR = `${SESSION_TMP}/.tmp5yQpum`;

// The own host's read paths (src/repl-host/supervisor.mjs hostSettings): its Node's directory, its own code, cua's
// facade and documents, the module tree.
const OWN_READ = [`${CUA_HOME}/node/24.22.0/bin`, `${CHECKOUT}/src/repl-host`, `${CHECKOUT}/src/cua-api`, `${CHECKOUT}/docs/cua-api`, MODULES];
// What node_repl passes for its children (R/spike-helper/shim.log): the vendor Node, the module tree, the trusted
// services' directory and its own script directory under TMPDIR.
const VENDOR_READ = [VENDOR_NODE_BIN, MODULES, `${CHECKOUT}/src/services`, SCRIPT_DIR];
const DENY = [STORE, CONFIG, CUA_HOME];
const REEXPOSE = [`${CUA_HOME}/runtimes`, `${CUA_HOME}/node`];

const BASE_SETUP = [
  {dir: 'home/.config/cua'}, {dir: `home/${STORE_RELATIVE}/projects`},
  {dir: `cuahome/runtimes/${RELEASE}/cua_node/bin`}, {dir: `cuahome/runtimes/${RELEASE}/cua_node/lib/node_modules`},
  {file: 'cuahome/node/24.22.0/bin/node'}, {dir: 'cuahome/state/codex'}, {dir: 'cuahome/remote'}, {dir: 'cuahome/chrome'},
  {dir: `cuahome/run/${SESSION}/tmp`}, {dir: 'cuahome/run/0d3c9a51-7d3f-4c1e-9b8e-5a2f6c1d0e47'},
  {file: 'cua/src/repl-host/kernel.mjs'}, {file: 'cua/src/repl-host/trusted-worker.mjs'}, {dir: 'cua/src/cua-api'}, {dir: 'cua/docs/cua-api'},
  {dir: 'cua/src/services'},
];

// The environment the CLI hands on, with the names the original strips (case-insensitively) and the one it keeps
// that cua's port strips (CODEX_GUARDIAN_DECISIONS_API_KEY, upstream 9552906b2b). Synthetic values only.
const env = tmpdir => ({
  HOME, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', ...(tmpdir === null ? {} : {TMPDIR: tmpdir}),
  NODE_REPL_AUTH_TOKEN: 'synthetic', node_repl_auth_token: 'synthetic-lowercase', OPENAI_FEDERATION_RULE_ID: 'synthetic',
  OPENAI_IDENTITY_TOKEN_FILE: 'synthetic', OPENAI_WORKLOAD_IDENTITY_CONTEXT: 'synthetic', CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN: 'synthetic',
  CODEX_GUARDIAN_DECISIONS_API_KEY: 'synthetic',
});

const kernelCommand = (node = OWN_NODE) => [node, '--experimental-vm-modules', `${CHECKOUT}/src/repl-host/kernel.mjs`, '--session-id', '3f0b6c2ad9e84f1b8a7c5e4d3b2a1908', '--working-dir', RUN];
const workerCommand = () => [OWN_NODE, '--experimental-vm-modules', `${CHECKOUT}/src/repl-host/trusted-worker.mjs`, RUN];

// sandboxPolicy takes absolute paths; the placeholder root is carried as `/@ROOT@` through it and restored after.
const ABS = '/@ROOT@';
const abs = path => path.replaceAll(R, ABS);
const unabs = path => path.replaceAll(ABS, R);
const special = kind => ({type: 'special', value: {kind}});

// A managed permission profile: `base` entries ([[special kind, access]]), `paths` ([[absolute path, access]]) and the
// read paths, in cua's key order.
function profile({base, paths = [], readPaths = [], network = 'restricted'}) {
  const entries = [...base.map(([kind, access]) => ({path: special(kind), access})),
    ...paths.map(([path, access]) => ({path: {type: 'path', path: abs(path)}, access}))];
  const state = {permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries}, network}, sandboxCwd: pathToFileURL(abs(RUN)).href};
  const {filesystem} = sandboxPolicy(state, {readPaths: readPaths.map(abs)});
  return profileFromPolicy({filesystem: filesystem.map(([key, access]) => [unabs(key), access])}, {network});
}

const SCOPED = [['root', 'read'], ['project_roots', 'write'], ['tmpdir', 'write']];
const DEFAULT = [['root', 'read']];
const denied = (paths = DENY) => paths.map(path => [path, 'none']);
const read = paths => paths.map(path => [path, 'read']);

const make = ({name, description, setup = [], tmpdir = SESSION_TMP, cwd = RUN, command = kernelCommand(), ...spec}) =>
  ({name, description, setup: [...BASE_SETUP, ...setup], tmpdir, input: {cwd, profile: profile(spec), command, env: env(tmpdir)}});

export const CASES = [
  make({name: 'scoped-worker', description: 'scoped, worker role: the own host\'s read paths, run directory and session temp writable',
    base: SCOPED, readPaths: OWN_READ, command: workerCommand()}),
  make({name: 'scoped-kernel', description: 'scoped, kernel role: the worker\'s profile plus the deny list (store, ~/.config/cua, the cua home) with runtimes/ and node/ re-exposed',
    base: SCOPED, readPaths: OWN_READ, paths: [...denied(), ...read(REEXPOSE)]}),
  make({name: 'default-worker', description: 'default (no sandbox state), worker role: read everywhere, nothing writable',
    base: DEFAULT, readPaths: OWN_READ, command: workerCommand()}),
  make({name: 'default-kernel', description: 'default, kernel role: the deny list, with runtimes/, node/, the run directory and the session temp re-exposed read-only',
    base: DEFAULT, readPaths: OWN_READ, paths: [...denied(), ...read([...REEXPOSE, RUN, SESSION_TMP])]}),
  make({name: 'scoped-worker-network-enabled', description: 'scoped worker with the network enabled (the Linux computer worker\'s shape, rendered for macOS)',
    base: SCOPED, readPaths: OWN_READ, network: 'enabled', command: workerCommand()}),
  make({name: 'carve-outs-present', description: '.git, .agents and .aws in the run directory, .codex and .git in the session temp: the protected names become read-only carve-outs',
    base: SCOPED, readPaths: OWN_READ, setup: [{dir: `cuahome/run/${SESSION}/.git`}, {dir: `cuahome/run/${SESSION}/.agents`}, {dir: `cuahome/run/${SESSION}/.aws`},
      {dir: `cuahome/run/${SESSION}/tmp/.codex`}, {dir: `cuahome/run/${SESSION}/tmp/.git`}]}),
  make({name: 'carve-outs-gitdir-pointer', description: 'the run directory\'s .git is a gitdir pointer file: its target is protected too',
    base: SCOPED, readPaths: OWN_READ, setup: [{dir: 'gitdirs/worktree'}, {file: `cuahome/run/${SESSION}/.git`, content: 'gitdir: @ROOT@/gitdirs/worktree\n'}]}),
  make({name: 'tmpdir-unset', description: 'TMPDIR unset: no :tmpdir write root', base: SCOPED, readPaths: OWN_READ, tmpdir: null}),
  make({name: 'tmpdir-relative', description: 'TMPDIR relative: not absolute, so no :tmpdir write root', base: SCOPED, readPaths: OWN_READ, tmpdir: 'relative/tmp'}),
  make({name: 'tmpdir-var-alias', description: 'TMPDIR spelled through /var: the write root is normalized to /private/var',
    base: SCOPED, readPaths: OWN_READ, tmpdir: `@VAR_ROOT@/cuahome/run/${SESSION}/tmp`}),
  make({name: 'symlinked-write-root', description: 'the run directory reached through a symlink below the top level: the original refuses it',
    base: SCOPED, readPaths: OWN_READ, setup: [{symlink: 'cuahome/runlink', target: 'run'}], cwd: `${CUA_HOME}/runlink/${SESSION}`}),
  make({name: 'symlinked-read-root', description: 'kernel profile (readable roots listed) with a read path that is a symlink: it is canonicalized',
    base: SCOPED, readPaths: [...OWN_READ, `${R}/nodelink`], paths: [...denied(), ...read(REEXPOSE)], setup: [{symlink: 'nodelink', target: '@ROOT@/cuahome/node/24.22.0/bin'}]}),
  make({name: 'vendor-script-dir-in-tmpdir', description: 'the vendor host\'s shape: node_repl\'s script directory, a read entry nested in the TMPDIR write root, becomes a read-only subpath',
    base: SCOPED, readPaths: VENDOR_READ, command: [`${VENDOR_NODE_BIN}/node`, '--experimental-vm-modules', `${SCRIPT_DIR}/kernel.js`],
    setup: [{file: `cuahome/run/${SESSION}/tmp/.tmp5yQpum/kernel.js`}, {file: `cuahome/run/${SESSION}/tmp/.tmp5yQpum/trusted-worker.js`}]}),
  make({name: 'deny-one', description: 'one deny entry (the secret store): full-disk read becomes readable roots with the store excluded, and the preferences policy drops',
    base: SCOPED, readPaths: OWN_READ, paths: denied([STORE])}),
  make({name: 'deny-several', description: 'several deny entries: the store, ~/.config/cua and the real target of a symlinked project tier',
    base: SCOPED, readPaths: OWN_READ, paths: denied([STORE, CONFIG, `${R}/elsewhere/tier`]),
    setup: [{dir: 'elsewhere/tier'}, {symlink: `home/${STORE_RELATIVE}/projects/-Users-someone-project`, target: '@ROOT@/elsewhere/tier'}]}),
  make({name: 'deny-through-symlink', description: 'a deny entry whose path is a symlink: the excluded subpath is its target',
    base: SCOPED, readPaths: OWN_READ, paths: denied([`${R}/home/.config/linked`]), setup: [{dir: 'elsewhere/config'}, {symlink: 'home/.config/linked', target: '@ROOT@/elsewhere/config'}]}),
  make({name: 'deny-missing-target', description: 'a deny entry that does not exist: the original keeps the logical path (cua creates every target first)',
    base: SCOPED, readPaths: OWN_READ, paths: denied([`${R}/home/.config/absent`])}),
  make({name: 'home-nesting', description: 'deny the cua home, read runtimes/ and node/, write run/<id> and its session temp: the nesting the deny list relies on',
    base: SCOPED, paths: [...denied([CUA_HOME]), ...read(REEXPOSE)]}),
  make({name: 'minimal-platform-defaults', description: ':minimal read instead of :root: the platform-defaults policy, /Applications and the scratch roots',
    base: [['minimal', 'read'], ['project_roots', 'write'], ['tmpdir', 'write']], readPaths: OWN_READ}),
  make({name: 'slash-tmp-write', description: ':slash_tmp writable: /tmp normalized to /private/tmp', base: [['root', 'read'], ['slash_tmp', 'write']], readPaths: OWN_READ}),
];
