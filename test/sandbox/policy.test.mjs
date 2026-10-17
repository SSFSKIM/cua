// The policy model (src/sandbox/policy.mjs): one permission profile per role for a call's sandbox state, the deny list
// buildLaunch resolves (secrets on and off, symlinked project tiers, the cua home), the creation of its targets, and the
// launch key both roles share. Everything runs in temporary directories; the store holds no secret.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SandboxStateError, assertDenyListShape, sandboxState} from '../../src/runtime/sandbox.mjs';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';
import {ROLES, denyListFor, parseDenyRead, prepareDenyTargets, roleProfile, stateKey} from '../../src/sandbox/policy.mjs';

const scratch = t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-policy-')));
  t.after(() => { chmodSync(root, 0o700); rmSync(root, {recursive: true, force: true}); });
  return root;
};
const special = kind => ({type: 'special', value: {kind}});
const path = p => ({type: 'path', path: p});
const CWD = '/cua/run/s';
const READS = ['/cua/node/24/bin', '/checkout/src/repl-host'];
const DENY = {deny: ['/home/.config/claude-secrets', '/home/.config/cua', '/cua'], reexpose: ['/cua/runtimes', '/cua/node', CWD, `${CWD}/tmp`], metadataOnly: ['/cua', '/cua/run']};

test('the roles', () => assert.deepEqual(ROLES, ['kernel', 'worker']));

test('scoped: the worker gets the state and the host\'s read paths; the kernel adds the deny list, re-exposed paths as reads, in the CLI\'s key order', () => {
  const state = sandboxState('scoped', CWD);
  const worker = roleProfile({state, role: 'worker', readPaths: READS, denyRead: DENY, network: 'restricted'});
  assert.equal(worker.cwd, CWD);
  assert.deepEqual(worker.profile, {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [
    {path: path('/checkout/src/repl-host'), access: 'read'}, {path: path('/cua/node/24/bin'), access: 'read'},
    {path: special('root'), access: 'read'}, {path: special('tmpdir'), access: 'write'}, {path: special('project_roots'), access: 'write'}]}});
  const kernel = roleProfile({state, role: 'kernel', readPaths: READS, denyRead: DENY, network: 'enabled'});
  assert.deepEqual(kernel.profile, {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [
    {path: path('/checkout/src/repl-host'), access: 'read'}, {path: path('/cua'), access: 'none'}, {path: path('/cua/node'), access: 'read'},
    {path: path('/cua/node/24/bin'), access: 'read'}, {path: path('/cua/run/s'), access: 'read'}, {path: path('/cua/run/s/tmp'), access: 'read'},
    {path: path('/cua/runtimes'), access: 'read'}, {path: path('/home/.config/claude-secrets'), access: 'none'}, {path: path('/home/.config/cua'), access: 'none'},
    {path: special('root'), access: 'read'}, {path: special('tmpdir'), access: 'write'}, {path: special('project_roots'), access: 'write'}]}},
  'the kernel\'s network is restricted whatever the worker\'s; its run directory stays writable through project_roots (write beats read at equal depth)');
  assert.equal(roleProfile({state, role: 'worker', readPaths: READS, denyRead: DENY, network: 'enabled'}).profile.network, 'enabled');
});

test('default (no state): both roles read everything they are allowed and write nothing; the kernel\'s run directory is re-exposed read-only', () => {
  const worker = roleProfile({state: undefined, role: 'worker', readPaths: READS, denyRead: DENY, network: 'restricted'});
  assert.equal(worker.cwd, null);
  assert.deepEqual(worker.profile.file_system.entries.map(e => [e.path.path ?? `:${e.path.value.kind}`, e.access]),
    [['/checkout/src/repl-host', 'read'], ['/cua/node/24/bin', 'read'], [':root', 'read']]);
  const kernel = roleProfile({state: undefined, role: 'kernel', readPaths: READS, denyRead: DENY, network: 'restricted'});
  assert.ok(!kernel.profile.file_system.entries.some(e => e.access === 'write'));
  assert.deepEqual(kernel.profile.file_system.entries.filter(e => e.path.path?.startsWith('/cua/run/')).map(e => [e.path.path, e.access]), [[CWD, 'read'], [`${CWD}/tmp`, 'read']]);
});

test('disabled has no profile at all; a state the host cannot render is refused; the kernel never renders without a deny list', () => {
  assert.equal(roleProfile({state: sandboxState('disabled', CWD), role: 'kernel', readPaths: READS, denyRead: DENY, network: 'restricted'}), null);
  assert.throws(() => roleProfile({state: null, role: 'worker', readPaths: READS, denyRead: DENY}), SandboxStateError);
  assert.throws(() => roleProfile({state: sandboxState('scoped', CWD), role: 'kernel', readPaths: READS, denyRead: null}), SandboxStateError);
  assert.throws(() => roleProfile({state: sandboxState('scoped', CWD), role: 'nobody', readPaths: READS, denyRead: DENY}), TypeError);
});

test('the launch key is the policy state\'s, never the role\'s: equal for both roles, different for another state or read paths', () => {
  const state = sandboxState('scoped', CWD);
  assert.equal(stateKey({state, readPaths: READS}), stateKey({state: structuredClone(state), readPaths: [...READS]}));
  assert.notEqual(stateKey({state, readPaths: READS}), stateKey({state: undefined, readPaths: READS}));
  assert.notEqual(stateKey({state, readPaths: READS}), stateKey({state, readPaths: [READS[0]]}));
  assert.notEqual(stateKey({state, readPaths: READS}), stateKey({state: sandboxState('scoped', '/cua/run/other'), readPaths: READS}));
  assert.equal(stateKey({state: sandboxState('disabled', CWD), readPaths: READS}), 'disabled');
});

function layout(t) {
  const root = scratch(t);
  const home = join(root, 'home'), cua = join(root, 'cua'), elsewhere = join(root, 'elsewhere');
  mkdirSync(join(home, STORE_RELATIVE, 'projects'), {recursive: true});
  mkdirSync(join(elsewhere, 'tier'), {recursive: true});
  mkdirSync(cua);
  return {root, home, cua, elsewhere, store: join(home, STORE_RELATIVE), sessionTmp: join(cua, 'run', 's', 'tmp')};
}

test('secrets off: the default store is denied (it exists whatever this connection\'s setting), with ~/.config/cua and the whole cua home on macOS', t => {
  const l = layout(t);
  const list = denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'});
  assert.deepEqual(list, {deny: [l.store, join(l.home, '.config', 'cua'), l.cua],
    reexpose: [join(l.cua, 'runtimes'), join(l.cua, 'node'), join(l.cua, 'run', 's'), l.sessionTmp], metadataOnly: [l.cua, join(l.cua, 'run')]});
});

test('secrets on: the connection\'s store, the real target of every symlinked tier (and of projects/ itself), and a project tier outside the store', t => {
  const l = layout(t);
  const store = join(l.root, 'store');
  mkdirSync(join(l.root, 'projects-real', 'plain'), {recursive: true});
  mkdirSync(store);
  symlinkSync(join(l.root, 'projects-real'), join(store, 'projects'));
  symlinkSync(join(l.elsewhere, 'tier'), join(l.root, 'projects-real', '-linked-project'));
  symlinkSync(join(l.elsewhere, 'not-yet'), join(l.root, 'projects-real', '-dangling-project'));
  writeFileSync(join(l.root, 'projects-real', 'stray-file'), '');
  const outside = join(l.root, 'own-tier');
  mkdirSync(outside);
  const list = denyListFor({home: l.cua, env: {HOME: l.home}, secretsDir: store, secretsProjectDir: outside, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'});
  assert.deepEqual(list.deny, [store, join(l.root, 'projects-real'), join(l.elsewhere, 'not-yet'), join(l.elsewhere, 'tier'), outside, join(l.home, '.config', 'cua'), l.cua]);
  const inside = denyListFor({home: l.cua, env: {HOME: l.home}, secretsDir: l.store, secretsProjectDir: join(l.store, 'projects', 'x'), sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'});
  assert.deepEqual(inside.deny, [l.store, join(l.home, '.config', 'cua'), l.cua], 'a project tier inside the store is covered by it');
});

test('Linux: the home\'s private directories and run/ one by one (M0\'s nesting verdict), the session re-exposed', t => {
  const l = layout(t);
  const list = denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'linux'});
  assert.deepEqual(list, {deny: [l.store, join(l.home, '.config', 'cua'), ...['state', 'remote', 'chrome', 'run'].map(d => join(l.cua, d))],
    reexpose: [join(l.cua, 'run', 's'), l.sessionTmp], metadataOnly: []});
});

test('deny targets: each missing one is created 0700 at its real location, an existing one left as it is, and the real paths returned', t => {
  const l = layout(t);
  symlinkSync(join(l.elsewhere, 'config'), join(l.root, 'config-link'));
  const existing = join(l.root, 'existing-file');
  writeFileSync(existing, '');
  const list = {deny: [join(l.home, '.config', 'cua'), join(l.root, 'config-link'), existing], reexpose: [join(l.cua, 'runtimes'), l.sessionTmp], metadataOnly: []};
  const prepared = prepareDenyTargets(list);
  assert.deepEqual(prepared, {deny: [join(l.home, '.config', 'cua'), join(l.elsewhere, 'config'), existing], reexpose: list.reexpose, metadataOnly: []});
  for (const dir of [join(l.home, '.config', 'cua'), join(l.elsewhere, 'config')]) {
    assert.ok(statSync(dir).isDirectory());
    assert.equal(statSync(dir).mode & 0o777, 0o700, dir);
  }
  assert.ok(lstatSync(existing).isFile(), 'an existing target is never replaced');
  assert.deepEqual(prepareDenyTargets(list), prepared, 'idempotent');
});

test('a deny target that cannot be created refuses the launch', t => {
  const l = layout(t);
  const locked = join(l.root, 'locked');
  mkdirSync(locked, {mode: 0o500});
  assert.throws(() => prepareDenyTargets({deny: [join(locked, 'store')], reexpose: [], metadataOnly: []}),
    error => error instanceof SandboxStateError && error.message.includes(join(locked, 'store')) && /could not be created/.test(error.message));
});

test('CUA_SANDBOX_DENY_READ: only the well-formed JSON of absolute paths is accepted', () => {
  assert.deepEqual(parseDenyRead(JSON.stringify(DENY)), DENY);
  for (const value of [undefined, '', 'nope', '[]', '{"deny":[]}', '{"deny":["relative"],"reexpose":[],"metadataOnly":[]}', '{"deny":[1],"reexpose":[],"metadataOnly":[]}', '{"deny":[],"reexpose":"/x","metadataOnly":[]}',
    '{"deny":[],"reexpose":[]}', '{"deny":[],"reexpose":[],"metadataOnly":["relative"]}'])
    assert.equal(parseDenyRead(value), null, String(value));
});

test('the kernel profile denies by the deny list\'s paths as given (buildLaunch resolves them once)', () => {
  const state = {permissionProfile: sandboxState('scoped', CWD).permissionProfile, sandboxCwd: pathToFileURL(CWD).href};
  const {profile} = roleProfile({state, role: 'kernel', readPaths: [], denyRead: {deny: ['/a'], reexpose: []}, network: 'restricted'});
  assert.deepEqual(profile.file_system.entries[0], {path: path('/a'), access: 'none'});
});

// Discovery fails closed (review finding, M1): only an absent path means "nothing to deny there".
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
test('a projects/ the account cannot list refuses the launch rather than miss a symlinked tier; an absent one proceeds', {skip: asRoot && 'root lists any directory'}, t => {
  const l = layout(t);
  const tier = join(l.elsewhere, 'tier');
  symlinkSync(tier, join(l.store, 'projects', '-linked-project'));
  assert.ok(denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}).deny.includes(tier), 'listable: the tier is denied');
  const withMode = (path, mode, check) => { chmodSync(path, mode); try { check(); } finally { chmodSync(path, 0o700); } };
  withMode(join(l.store, 'projects'), 0o111, () => assert.throws(() => denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}),
    error => error.code === 'sandbox_state_invalid' && error.message.includes(join(l.store, 'projects')) && /EACCES/.test(error.message)));
  // A store the account cannot search: projects/ itself cannot be inspected.
  withMode(l.store, 0o600, () => assert.throws(() => denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'linux'}), {code: 'sandbox_state_invalid'}));
  // Absent: no store, or a store without projects/, has no tiers to deny.
  rmSync(join(l.store, 'projects'), {recursive: true});
  assert.deepEqual(denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}).deny, [l.store, join(l.home, '.config', 'cua'), l.cua]);
  assert.deepEqual(denyListFor({home: l.cua, env: {HOME: l.home}, secretsDir: join(l.root, 'no-store'), sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}).deny,
    [join(l.root, 'no-store'), join(l.home, '.config', 'cua'), l.cua]);
});

test('a symlinked tier inside the store or inside another tier adds nothing: the outer deny covers it', t => {
  const l = layout(t);
  mkdirSync(join(l.store, 'kept'));
  symlinkSync(join(l.store, 'kept'), join(l.store, 'projects', '-inner'));
  assert.deepEqual(denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}).deny, [l.store, join(l.home, '.config', 'cua'), l.cua]);
  // Tiers nested in one another: the outer one alone, whichever is listed first.
  mkdirSync(join(l.elsewhere, 'outer', 'inner'), {recursive: true});
  symlinkSync(join(l.elsewhere, 'outer', 'inner'), join(l.store, 'projects', '-a-inner'));
  symlinkSync(join(l.elsewhere, 'outer'), join(l.store, 'projects', '-b-outer'));
  assert.deepEqual(denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform: 'darwin'}).deny, [l.store, join(l.elsewhere, 'outer'), join(l.home, '.config', 'cua'), l.cua]);
});

// Overlapping layouts (review finding, M1): the home, the store's family and ~/.config/cua are independent targets.
test('a deny list whose targets lie inside one another is refused before any target is created, on either platform', t => {
  const l = layout(t);
  const cases = {
    'the cua home under the store': {home: join(l.store, 'cua'), env: {HOME: l.home}},
    'the store under the cua home': {home: l.cua, env: {HOME: l.home}, secretsDir: join(l.cua, 'state', 'secrets')},
    '~/.config/cua under the cua home': {home: l.cua, env: {HOME: join(l.cua, 'run', 'user')}},
    'a tier target under the cua home': {home: l.cua, env: {HOME: l.home}, secretsProjectDir: join(l.cua, 'run', 'tier')},
  };
  for (const [label, input] of Object.entries(cases)) for (const platform of ['darwin', 'linux']) {
    const list = denyListFor({...input, sessionId: 's', sessionTmp: join(input.home, 'run', 's', 'tmp'), platform});
    assert.throws(() => assertDenyListShape(list), {code: 'sandbox_conflict'}, `${label} (${platform})`);
    assert.throws(() => prepareDenyTargets(list), {code: 'sandbox_conflict'}, `${label} (${platform}): prepare refuses too`);
  }
  assert.equal(existsSync(join(l.cua, 'state', 'secrets')), false, 'nothing was created for a refused list');
  // On Linux the home itself is not denied, only its private directories and run/: ~/.config/cua elsewhere in the
  // home overlaps no target there (on macOS it lies in the denied home).
  const configInHome = platform => denyListFor({home: l.cua, env: {HOME: join(l.cua, 'user')}, sessionId: 's', sessionTmp: l.sessionTmp, platform});
  assert.throws(() => assertDenyListShape(configInHome('darwin')), {code: 'sandbox_conflict'});
  assertDenyListShape(configInHome('linux'));
  for (const platform of ['darwin', 'linux']) assertDenyListShape(denyListFor({home: l.cua, env: {HOME: l.home}, sessionId: 's', sessionTmp: l.sessionTmp, platform}));
  // A re-exposed path that holds a target, or lies in two.
  assert.throws(() => assertDenyListShape({deny: ['/a', '/b'], reexpose: ['/'], metadataOnly: []}), {code: 'sandbox_conflict'});
  assert.throws(() => assertDenyListShape({deny: ['/a'], reexpose: ['/a/x', '/a'], metadataOnly: []}), {code: 'sandbox_conflict'});
});
