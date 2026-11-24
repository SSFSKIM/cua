import './helpers/scratch-home.mjs'; // first: the engine setting is read from this file's own scratch HOME
// `cua install` on Linux (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md §4.1, §4.3, F4;
// M6b's pre-flight, §2.2 and §3.5): the record first, then the common parts (the module tree, the sandbox helper, Node),
// the pointer to the derived release once they are in place, then cua's engine, every step attempted whatever happened
// before, and the exit status set by a failed common part, a failed engine the home asks for, or a vendor selection,
// which cua 0.30.0 retired on Linux (engine_retired, once every step ran). Nothing of the vendor's is installed, and
// --archive and --release are usage errors. Each installer is a stub that lays its part in a scratch home (or fails as a
// download would); the sessions that open afterwards are planned by the real `openConnection` over that home. Also
// `cua runtime use` on Linux, and macOS's install, which is the vendor's release and then Node, as before.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {main} from '../src/cli.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {RELEASES_DIR, linuxRelease, loadLinuxRuntime, loadPins, ownInstaller, selectPin} from '../src/runtime/manifest.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {guardedLinuxHelper} from '../src/runtime/sandbox.mjs';
import {SCRATCH_HOME} from './helpers/scratch-home.mjs';
import {fakeManagedNode, fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const RELEASE = linuxRelease(loadLinuxRuntime({host: LINUX}), 'x64');
const VENDOR = selectPin(loadPins(), LINUX);
const INSTALLER = ownInstaller().command;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pointer = home => existsSync(join(home, 'current.json')) ? JSON.parse(readFileSync(join(home, 'current.json'), 'utf8')).release : null;
const HELPER = home => join(home, 'sandbox', 'rust-v0.163.0', 'codex-linux-sandbox');
// What the report says opens: browser-only sessions, and computer sessions on the engine the home selects.
const opened = ({sessions: s}) => ({browser: s.browser, computer: s.computer});
const SAID = 'sessions here, by what is installed and set: ';
// engine_retired's sentence as install ends it (§2.2): each source's prerequisite, then that the install otherwise
// completed, and nothing about the next open.
const RETIRED = 'which cua 0.30.0 removed from Linux, where cua\'s own engine (CUA_NATIVE_ENGINE=cua, the default) is the only one';
const settingsOf = user => join(user, '.config', 'cua', 'engine.json');
const lastLine = run => run.stdout.trimEnd().split('\n').at(-1);
const RELEASE_HINT = ownInstaller({release: RELEASE}).hint;
const unreachable = what => new CuaError('download_failed', `could not fetch ${what}: ENOTFOUND`);

function scratchHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  return realpathSync(s.dir);
}

// The vendor's tree for the checked-in pin, as an older cua's install left it (placeholder files; no vendor code).
function layVendorTree(home) {
  const root = join(home, 'runtimes', VENDOR.release);
  for (const [key, rel] of Object.entries(VENDOR.layout)) {
    const path = join(root, rel);
    if (key === 'moduleDir' || key === 'skyServiceApp') { mkdirSync(path, {recursive: true}); continue; }
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, '');
  }
  writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: VENDOR.release, archive: {sha256: VENDOR.archive.sha256, length: VENDOR.archive.length}, source: 'download'}));
  return root;
}

// Stub installers: each records its call and lays its part, or throws as an unreachable server would while its name is
// in `down`. `calls` is the order the steps ran in.
function installers(home, {down = new Set()} = {}) {
  const calls = [];
  const step = (name, lay) => async options => {
    calls.push(name);
    if (down.has(name)) throw unreachable(name);
    return lay(options);
  };
  const deps = {
    home, platform: 'linux', host: LINUX, env: {HOME: SCRATCH_HOME},
    installModules: step('modules', () => {
      const lock = loadLinuxRuntime({host: LINUX}).modules.lock;
      const root = join(home, 'modules', lock);
      const fresh = !existsSync(root);
      if (fresh) fakeModuleTree(home, LINUX);
      return {root, moduleDir: join(root, 'node_modules'), lock, changed: fresh};
    }),
    installHelper: step('helper', () => {
      mkdirSync(dirname(HELPER(home)), {recursive: true});
      writeFileSync(HELPER(home), 'helper');
      return {path: HELPER(home), sha256: 'e'.repeat(64), changed: false};
    }),
    installNode: step('node', ({pin}) => { fakeManagedNode(home, LINUX, {version: pin.version}); return {version: pin.version, root: join(home, 'node', pin.version), changed: false}; }),
    linuxHelper: () => {
      if (!existsSync(HELPER(home))) throw new CuaError('sandbox_unavailable', `cua's Linux sandbox helper ${HELPER(home)} is not installed (ENOENT)`, {hint: 'run `cua install` to fetch and verify it, or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly'});
      return {path: HELPER(home), sha256: 'e'.repeat(64)};
    },
    installEngine: step('engine', ({pin}) => {
      // An engine of the pinned version, recorded as cua install records it (its bytes are not the release's).
      const dir = join(home, 'engine', 'linux');
      const fresh = !existsSync(join(dir, 'cua-engine'));
      const bytes = `#!/bin/sh\necho "cua-engine ${pin.version} (fixture0)"\n`;
      mkdirSync(dir, {recursive: true});
      writeFileSync(join(dir, 'cua-engine'), bytes, {mode: 0o755});
      writeFileSync(join(dir, 'install.json'), JSON.stringify({schema: 1, build: 'pinned', version: pin.version, release: pin.release, sha256: sha256(bytes), source: 'test'}));
      return {path: join(dir, 'cua-engine'), version: pin.version, release: pin.release, sha256: sha256(bytes), changed: fresh};
    }),
    installRuntime: async () => assert.fail('nothing of the vendor\'s is installed on Linux'),
  };
  return {calls, deps, down};
}

async function cli(args, deps) {
  const out = [], err = [];
  const write = {stdout: process.stdout.write, stderr: process.stderr.write};
  process.stdout.write = chunk => { out.push(String(chunk)); return true; };
  process.stderr.write = chunk => { err.push(String(chunk)); return true; };
  try {
    const status = await main(args, deps);
    return {status, stdout: out.join(''), stderr: err.join('')};
  } finally { Object.assign(process.stdout, {write: write.stdout}); Object.assign(process.stderr, {write: write.stderr}); }
}
const installJson = async (deps, args = []) => {
  const run = await cli(['install', '--json', ...args], deps);
  return {status: run.status, report: JSON.parse(run.stdout), stderr: run.stderr};
};

// A session over `home` as `cua serve` would open it: the real resolution, selection and launch plan; the Node, the
// helper's check and the user namespace are stubs (no session is launched: the input ends at once).
async function session(home, {surfaces, engine, env: extra = {}} = {}) {
  const input = new PassThrough(), output = new PassThrough();
  output.resume();
  const env = {PATH: process.env.PATH, HOME: SCRATCH_HOME, TMPDIR: process.env.TMPDIR, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: surfaces, DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000',
    ...(engine ? {CUA_NATIVE_ENGINE: engine} : {}), ...extra};
  let connection;
  try {
    connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output, diagnostics: () => {},
      resolveOwnNode: () => process.execPath, verifyHelper: helper => helper, probeUserns: async () => ({status: 'pass'})});
  } catch (error) {
    input.end();
    if (!(error instanceof CuaError)) throw error;
    return {refused: error};
  }
  input.end();
  await connection.closed;
  return {opened: true};
}
const opens = async (home, options) => {
  const outcome = await session(home, options);
  assert.equal(outcome.opened, true, `${JSON.stringify(options)} should open: ${outcome.refused?.code} ${outcome.refused?.message}`);
};
const refused = async (home, options, code) => {
  const outcome = await session(home, options);
  assert.ok(outcome.refused, `${JSON.stringify(options)} should be refused`);
  if (code) assert.equal(outcome.refused.code, code, outcome.refused.message);
  return outcome.refused;
};

test('cua install in an empty home: the record, the module tree, the helper and Node, the pointer to the derived release, then cua\'s engine; nothing of the vendor\'s', async t => {
  const home = scratchHome(t);
  const {calls, deps} = installers(home);
  const {status, report} = await installJson(deps);
  assert.equal(status, 0);
  assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine']);
  assert.equal(pointer(home), RELEASE);
  assert.equal(report.ok, true);
  assert.equal(report.release, RELEASE);
  assert.equal(report.changed, true);
  assert.deepEqual(report.pointer, {previous: null, current: RELEASE, changed: true});
  assert.equal(report.modules.root, join(home, 'modules', loadLinuxRuntime({host: LINUX}).modules.lock));
  assert.equal('vendor' in report, false, 'no vendor lane');
  assert.equal(existsSync(join(home, 'runtimes')), false, 'no runtimes/ is made');
  assert.deepEqual(report.sessions, {browser: true, computer: true, engine: 'cua', why: {}}, 'no other engine is offered');
  assert.equal(report.error, undefined);
  await opens(home, {surfaces: 'browser'});
  await opens(home, {surfaces: 'computer'});
  await refused(home, {surfaces: 'computer', engine: 'vendor'}, 'engine_retired');

  // Again: nothing changes, and the pointer is not rewritten.
  const again = await installJson(installers(home).deps);
  assert.equal(again.status, 0);
  assert.equal(again.report.changed, false);
  assert.deepEqual(again.report.pointer, {previous: RELEASE, current: RELEASE, changed: false});
});

test('the text output says each step, and its last line what opens now, with no other engine', async t => {
  const home = scratchHome(t);
  const all = await cli(['install'], installers(home).deps);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stderr, new RegExp(`^installing cua's Linux runtime ${RELEASE}$`, 'm'));
  assert.match(all.stdout, new RegExp(`^installed cua's module tree at ${home}/modules/[0-9a-f]{64}$`, 'm'));
  assert.match(all.stdout, new RegExp(`^current\\.json now names ${RELEASE}, cua's own runtime$`, 'm'));
  assert.doesNotMatch(all.stdout + all.stderr, /vendor/);
  assert.equal(lastLine(all), `${SAID}browser-only sessions open; computer sessions open on cua's engine, which this home selects`);
});

// F10 (§2.2): under a vendor selection install runs every step, then exits nonzero with engine_retired, naming what to
// undo and that the install otherwise completed, and nothing about the next open. One test per source.
for (const [label, env, file] of [['CUA_NATIVE_ENGINE=vendor', true, false], ['"engine": "vendor" in engine.json', false, true], ['both', true, true]]) {
  test(`cua install under ${label}: every part placed, then exit 1 engine_retired, its sentence ending with what the install did`, async t => {
    const home = scratchHome(t);
    const user = scratchUserHome(t);
    const settings = settingsOf(user);
    if (file) { mkdirSync(dirname(settings), {recursive: true}); writeFileSync(settings, JSON.stringify({engine: 'vendor'})); }
    const named = [...(env ? ['CUA_NATIVE_ENGINE=vendor'] : []), ...(file ? [`"engine": "vendor" in ${settings}`] : [])].join(' and ');
    const undo = [...(env ? ['unset CUA_NATIVE_ENGINE'] : []), ...(file ? [`remove "engine" from ${settings}`] : [])].join(' and ');
    const message = `${named} ${env && file ? 'select' : 'selects'} the vendor's engine, ${RETIRED}: ${undo}; the install otherwise completed`;
    const setting = {HOME: user, ...(env ? {CUA_NATIVE_ENGINE: 'vendor'} : {})};
    const {calls, deps} = installers(home);
    deps.env = setting;
    const {status, report} = await installJson(deps);
    assert.equal(status, 1);
    assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine'], 'every step ran');
    for (const part of ['modules', 'sandboxHelper', 'node', 'engine']) assert.equal(report[part].failed, undefined, part);
    assert.equal(pointer(home), RELEASE);
    assert.deepEqual(report.error, {code: 'engine_retired', message});
    assert.equal(report.sessions.engine, 'vendor');
    assert.deepEqual(opened(report), {browser: true, computer: false});
    assert.equal(report.sessions.why.computer.code, 'engine_retired');
    // The text: the last line says what opens, naming the setting; the command's error, last, is §2.2's sentence.
    const text = await cli(['install'], {...installers(home).deps, env: setting});
    assert.equal(text.status, 1);
    assert.ok(lastLine(text).startsWith(`${SAID}browser-only sessions open; computer sessions on the vendor's engine, which this home selects, do not open: ${named} ${env && file ? 'select' : 'selects'} the vendor's engine`), lastLine(text));
    assert.ok(text.stderr.endsWith(`cua: ${message} [engine_retired]\n`), text.stderr);
    assert.doesNotMatch(message, /session|open/, 'nothing promised about the next open');
    // In this clean home, with the setting gone, a session opens with no further install.
    await refused(home, {surfaces: 'computer', env: setting}, 'engine_retired');
    await opens(home, {surfaces: 'browser', env: setting});
    if (file) writeFileSync(settings, JSON.stringify({}));
    await opens(home, {surfaces: 'computer', env: {HOME: user}});
  });
}

test('a vendor selection with a step that failed: that step\'s error is the install\'s, and the last line names the setting', async t => {
  const home = scratchHome(t);
  const {calls, deps} = installers(home, {down: new Set(['engine'])});
  deps.env = {...deps.env, CUA_NATIVE_ENGINE: 'vendor'};
  const {status, report} = await installJson(deps);
  assert.equal(status, 1);
  assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine']);
  assert.equal(report.error.code, 'download_failed', 'cua\'s engine is what the home needs once the setting is gone');
  assert.match(report.error.message, /^cua's Linux engine was not installed: could not fetch engine: ENOTFOUND$/);
  assert.equal(report.sessions.why.computer.code, 'engine_retired');
  const text = await cli(['install'], deps);
  assert.match(lastLine(text), /computer sessions on the vendor's engine, which this home selects, do not open: CUA_NATIVE_ENGINE=vendor selects the vendor's engine/);
  assert.doesNotMatch(text.stderr, /otherwise completed/);
});

test('--archive and --release are usage errors on Linux, before anything is installed', async t => {
  for (const args of [['--archive', '/srv/chatgpt.deb'], ['--release', VENDOR.release]]) {
    const home = scratchHome(t);
    const {calls, deps} = installers(home);
    const run = await cli(['install', ...args], deps);
    assert.equal(run.status, 2, args[0]);
    assert.ok(run.stderr.startsWith('cua: install takes --archive and --release on macOS only: on Linux cua installs its own runtime and, since cua 0.30.0, no ChatGPT package\n'), run.stderr);
    assert.deepEqual(calls, []);
    assert.deepEqual(readdirSync(home), []);
  }
});

// The failure table of §4.1: what fails, the setting, the exit, and what opens afterwards. Each opens the surviving
// sessions and is refused the blocked one.
test('the engine fails under the default (cua\'s): nonzero; browser-only opens; cua\'s engine is refused, naming the one command', async t => {
  const home = scratchHome(t);
  const {calls, deps} = installers(home, {down: new Set(['engine'])});
  const {status, report} = await installJson(deps);
  assert.equal(status, 1);
  assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine']);
  assert.equal(report.ok, false);
  assert.deepEqual(report.engine, {failed: {code: 'download_failed', message: 'could not fetch engine: ENOTFOUND'}});
  assert.equal(report.error.code, 'download_failed');
  assert.match(report.error.message, /^cua's Linux engine was not installed: could not fetch engine: ENOTFOUND$/);
  assert.ok(report.error.hint.includes(`\`${INSTALLER} --engine\``), report.error.hint);
  assert.equal(pointer(home), RELEASE, 'the common parts are in place, so the pointer is written');
  assert.deepEqual(opened(report), {browser: true, computer: false});
  await opens(home, {surfaces: 'browser'});
  for (const engine of [undefined, 'cua']) {
    const why = await refused(home, {surfaces: 'computer', engine}, 'engine_not_installed');
    assert.ok(why.message.endsWith(`: run \`${INSTALLER} --engine\``), why.message);
    assert.equal(why.hint, 'a `cua` from another checkout installs that checkout\'s engine, not this one\'s');
  }
});

test('a common part fails: nonzero; the helper, Node and the engine are still attempted; the pointer is as it was; every session is refused, naming the installer', async t => {
  const home = scratchHome(t);
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: VENDOR.release}));
  const {calls, deps} = installers(home, {down: new Set(['modules'])});
  const {status, report} = await installJson(deps);
  assert.equal(status, 1);
  assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine']);
  assert.deepEqual(report.modules, {failed: {code: 'download_failed', message: 'could not fetch modules: ENOTFOUND'}});
  assert.match(report.error.message, /^cua's module tree was not installed: could not fetch modules: ENOTFOUND$/);
  assert.ok(report.error.hint.includes(`\`${INSTALLER}\``), report.error.hint);
  assert.deepEqual(report.pointer, {previous: VENDOR.release, current: VENDOR.release, changed: false});
  assert.equal(pointer(home), VENDOR.release);
  assert.deepEqual(opened(report), {browser: false, computer: false});
  assert.equal(report.sessions.why.browser.code, 'runtime_not_installed');
  for (const options of [{surfaces: 'browser'}, {surfaces: 'computer'}, {surfaces: 'computer', engine: 'vendor'}]) {
    const why = await refused(home, options, 'runtime_not_installed');
    assert.ok(why.hint.includes(`\`${INSTALLER}\``), why.hint);
  }
});

test('--engine makes cua\'s lane required where the setting cannot say', async t => {
  const engineDown = installers(scratchHome(t), {down: new Set(['engine'])});
  engineDown.deps.env = {...engineDown.deps.env, CUA_NATIVE_ENGINE: 'sky'};
  assert.equal((await installJson(engineDown.deps)).status, 0, 'a setting that cannot be read asks for no engine');
  assert.equal((await installJson(engineDown.deps, ['--engine'])).status, 1);
});

test('a failure a step does not classify is normalized at its boundary, and the text output ends with the error and its remedy', async t => {
  const {deps} = installers(scratchHome(t));
  deps.installEngine = async () => { throw Object.assign(new Error('EIO: i/o error'), {code: 'EIO'}); };
  const run = await cli(['install', '--engine'], deps);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^cua's Linux engine was not installed: EIO: EIO: i\/o error \(linux_engine_install_failed\)$/m);
  assert.ok(run.stderr.includes(`cua: cua's Linux engine was not installed: EIO: EIO: i/o error [linux_engine_install_failed]\n  run \`${INSTALLER} --engine\` again\n`), run.stderr);
});

test('cua install over a vendor pointer: the pointer moves to the derived release, both recorded; the vendor\'s tree is left as it was', async t => {
  const home = scratchHome(t);
  const root = layVendorTree(home);
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: VENDOR.release}));
  const record = readFileSync(join(root, 'install.json'));
  const listing = readdirSync(root, {recursive: true}).sort();
  const {status, report} = await installJson(installers(home).deps);
  assert.equal(status, 0);
  assert.deepEqual(report.pointer, {previous: VENDOR.release, current: RELEASE, changed: true});
  assert.equal(pointer(home), RELEASE);
  assert.deepEqual(readFileSync(join(root, 'install.json')), record);
  assert.deepEqual(readdirSync(root, {recursive: true}).sort(), listing);
});

// Fix wave 1: what opens is resolved as a session resolves it (the Node lookup, the helper, the engine selection), not
// read off the steps that succeeded.
test('--no-node completes the home as asked; with no CUA_NODE nothing opens, with a usable one sessions open on it', async t => {
  const home = scratchHome(t);
  const {calls, deps} = installers(home);
  const run = await installJson(deps, ['--no-node']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(calls, ['modules', 'helper', 'engine']);
  assert.equal(pointer(home), RELEASE);
  assert.deepEqual(opened(run.report), {browser: false, computer: false});
  assert.equal(run.report.sessions.why.browser.code, 'runtime_not_installed');
  assert.match(run.report.sessions.why.browser.message, /its Node is not installed/);
  const text = await cli(['install', '--no-node'], deps);
  assert.ok(lastLine(text).startsWith(`${SAID}no session opens: cua's Linux runtime is not installed in ${home}: its Node is not installed (not installed) (runtime_not_installed); `), lastLine(text));
  const withNode = installers(home);
  withNode.deps.env = {...withNode.deps.env, CUA_NODE: process.execPath};
  const onNode = await cli(['install', '--no-node'], withNode.deps);
  assert.ok(lastLine(onNode).startsWith(`${SAID}browser-only sessions open on CUA_NODE=${process.execPath}; computer sessions open on cua's engine`), lastLine(onNode));
});

test('a helper step that failed fails the install; with CUA_SHIM_SANDBOX=disabled sessions still open, needing no helper', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home, {down: new Set(['helper'])});
  const confined = await installJson(deps);
  assert.equal(confined.status, 1);
  assert.equal(confined.report.sessions.browser, false);
  assert.equal(confined.report.sessions.why.browser.code, 'sandbox_unavailable');
  deps.env = {...deps.env, CUA_SHIM_SANDBOX: 'disabled'};
  const open = await installJson(deps);
  assert.equal(open.status, 1, 'the helper is a common part all the same');
  assert.deepEqual(opened(open.report), {browser: true, computer: true});
});

// serve refuses a CUA_BROWSER_BACKENDS that is not a list of absolute socket paths when its surfaces include the browser
// (src/chrome/client-mode.mjs configuredBackends), so a browser-only session does not open; a computer-only one does.
test('a CUA_BROWSER_BACKENDS serve refuses: the browser-only session does not open, naming it; computer sessions still do', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home);
  deps.env = {...deps.env, CUA_BROWSER_BACKENDS: 'relative.sock'};
  const {status, report} = await installJson(deps);
  assert.equal(status, 0, 'every part is installed');
  assert.deepEqual(opened(report), {browser: false, computer: true});
  assert.equal(report.sessions.why.browser.code, 'invalid_setting');
  assert.match(report.sessions.why.browser.message, /CUA_BROWSER_BACKENDS must list absolute socket paths/);
  // and the text's last line says so, naming the computer sessions that open (task 156, fix wave 2)
  const text = lastLine(await cli(['install'], deps));
  assert.ok(text.startsWith(`${SAID}browser-only sessions do not open: CUA_BROWSER_BACKENDS must list absolute socket paths`), text);
  assert.match(text, /; computer sessions open on cua's engine, which this home selects$/);
  assert.doesNotMatch(text, /no session opens/);
});

test('an engine setting that cannot be read is reported, and no computer session opens; the install itself succeeds', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home);
  deps.env = {...deps.env, CUA_NATIVE_ENGINE: 'sky'};
  const {status, report} = await installJson(deps);
  assert.equal(status, 0);
  const why = 'CUA_NATIVE_ENGINE must be cua (cua 0.30.0 removed the vendor\'s engine from Linux)';
  assert.deepEqual(report.sessions, {browser: true, computer: false, engine: null, why: {computer: {code: 'invalid_setting', message: why}}});
  const text = await cli(['install'], deps);
  assert.equal(lastLine(text), `${SAID}browser-only sessions open; no computer session opens: ${why} (invalid_setting)`);
});

test('vendor pins this checkout cannot load or read change nothing of the install: the leftovers scan goes on without them', async t => {
  for (const pins of [() => { throw new CuaError('invalid_pin', 'release pin x.json: unknown field "y"'); },
    () => { throw Object.assign(new Error(`ENOENT: no such file or directory, scandir '${RELEASES_DIR}'`), {code: 'ENOENT', syscall: 'scandir', path: RELEASES_DIR}); }]) {
    const home = scratchHome(t);
    const {deps} = installers(home);
    deps.pins = pins;
    const {status, report} = await installJson(deps);
    assert.equal(status, 0);
    assert.equal(report.modules.changed, true);
    assert.deepEqual(opened(report), {browser: true, computer: true});
    const text = await cli(['install'], deps);
    assert.equal(text.status, 0, text.stderr);
  }
});

test('a current.json that is not a file is named to be moved aside; the parts are installed all the same', async t => {
  const home = scratchHome(t);
  mkdirSync(join(home, 'current.json'));
  const {calls, deps} = installers(home);
  const {status, report} = await installJson(deps);
  assert.equal(status, 1);
  assert.deepEqual(calls, ['modules', 'helper', 'node', 'engine']);
  assert.equal(report.error.code, 'target_occupied');
  assert.equal(report.error.message, `current.json could not be written: ${join(home, 'current.json')} is a directory, not a file cua wrote, and no install replaces it`);
  assert.equal(report.error.hint, `move ${join(home, 'current.json')} aside, then ${RELEASE_HINT}`);
  assert.equal(report.sessions.browser, true, 'the pointer selects nothing');
});

// Fix wave 2: what opens is what `cua serve` would open: its settings, the REPL host's selection with the engine's, and
// the device mode cua's engine runs in, each refusing as the session refuses.
test('what opens is the session\'s own selection: CUA_REPL_HOST=vendor or a refused setting opens nothing; an invalid device mode refuses cua\'s engine alone', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home);
  await installJson(deps);
  for (const [extra, code] of [[{CUA_REPL_HOST: 'vendor'}, 'repl_host_refused'], [{CUA_SHIM_PERSIST: 'always'}, 'invalid_setting']]) {
    const {status, report} = await installJson({...deps, env: {...deps.env, ...extra}});
    assert.equal(status, 0, 'the parts are installed');
    assert.deepEqual(opened(report), {browser: false, computer: false}, JSON.stringify(extra));
    assert.equal(report.sessions.why.browser.code, code);
    for (const surfaces of ['browser', 'computer']) await refused(home, {surfaces, env: extra}, code);
    const text = await cli(['install'], {...deps, env: {...deps.env, ...extra}});
    assert.ok(lastLine(text).startsWith(`${SAID}no session opens: ${report.sessions.why.browser.message} (${code})`), lastLine(text));
  }
  const sideways = {CUA_DESKTOP_MODE: 'sideways'};
  const {report} = await installJson({...deps, env: {...deps.env, ...sideways}});
  assert.deepEqual(opened(report), {browser: true, computer: false});
  assert.deepEqual(report.sessions.why, {computer: {code: 'invalid_setting', message: 'CUA_DESKTOP_MODE must be shared or dedicated'}});
  await opens(home, {surfaces: 'browser', env: sideways});
  await refused(home, {surfaces: 'computer', env: sideways}, 'invalid_setting');
  const text = await cli(['install'], {...deps, env: {...deps.env, ...sideways}});
  assert.equal(lastLine(text), `${SAID}browser-only sessions open; computer sessions on cua's engine, which this home selects, do not open: CUA_DESKTOP_MODE must be shared or dedicated (invalid_setting)`);
});

test('a helper the sessions refuse is remedied by this cua\'s installer with its release, never a bare `cua install`; one that is not the pinned helper is named to be moved aside', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home, {down: new Set(['helper'])});
  const {report} = await installJson(deps);
  assert.equal(report.sessions.why.browser.code, 'sandbox_unavailable');
  assert.equal(report.sessions.why.browser.hint, `${RELEASE_HINT}, or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly`);
  const text = await cli(['install'], deps);
  assert.doesNotMatch(lastLine(text), /`cua install`/);

  const other = scratchHome(t);
  const placed = installers(other);
  placed.deps.linuxHelper = () => { throw new CuaError('sandbox_unavailable', `cua's Linux sandbox helper ${HELPER(other)} has SHA-256 x, not the pinned y; it is not run, and nothing was started`, {hint: `remove ${dirname(HELPER(other))} and run \`cua install\` to place the pinned helper again`}); };
  const foreign = await installJson(placed.deps);
  assert.equal(foreign.report.sessions.why.browser.hint, `stop any \`cua serve\` using it, move ${dirname(HELPER(other))} aside, then ${RELEASE_HINT}`);
});

test('a helper path that is a link into the vendor\'s tree: the readiness refuses it as a session does, naming the link to move aside, and reads nothing it leads to', async t => {
  const home = scratchHome(t);
  const planted = join(home, 'runtimes', 'codex-linux-sandbox');
  mkdirSync(dirname(planted), {recursive: true});
  writeFileSync(planted, 'helper');
  mkdirSync(dirname(HELPER(home)), {recursive: true});
  symlinkSync(planted, HELPER(home));
  const {deps} = installers(home, {down: new Set(['helper'])});
  deps.linuxHelper = ({home: real}) => guardedLinuxHelper({home: real, path: HELPER(real), sha256: 'e'.repeat(64), verifyHelper: () => assert.fail('nothing in the tree is verified')});
  const {report} = await installJson(deps);
  assert.equal(report.sessions.browser, false);
  assert.equal(report.sessions.why.browser.code, 'sandbox_unavailable');
  assert.match(report.sessions.why.browser.message, /vendor's tree/);
  assert.equal(report.sessions.why.browser.hint, `stop any \`cua serve\` using it, move ${HELPER(home)} aside, then ${RELEASE_HINT}`);
});

test('a current.json that is a link, to a pointer or to nothing, is named to be moved aside as doctor names it', async t => {
  for (const target of ['pointer.json', 'gone.json']) {
    const home = scratchHome(t);
    if (target === 'pointer.json') writeFileSync(join(home, target), JSON.stringify({schema: 1, release: RELEASE}));
    symlinkSync(join(home, target), join(home, 'current.json'));
    const {status, report} = await installJson(installers(home).deps);
    assert.equal(status, 1, target);
    assert.equal(report.error.code, 'target_occupied');
    assert.equal(report.error.message, `current.json could not be written: ${join(home, 'current.json')} is a link, not a file cua wrote, and no install replaces it`);
    assert.equal(report.error.hint, `move ${join(home, 'current.json')} aside, then ${RELEASE_HINT}`);
  }
});

test('a retry that only places a lane reports a change', async t => {
  const home = scratchHome(t);
  const first = installers(home, {down: new Set(['engine'])});
  assert.equal((await installJson(first.deps)).report.changed, true);
  const second = await installJson(installers(home).deps);
  assert.equal(second.report.modules.changed, false);
  assert.equal(second.report.engine.changed, true);
  assert.equal(second.report.changed, true);
  assert.equal((await installJson(installers(home).deps)).report.changed, false);
});

test('a checkout whose record and pins disagree refuses before anything is fetched', async t => {
  const home = scratchHome(t);
  const {calls, deps} = installers(home);
  deps.linuxRuntime = () => { throw new CuaError('invalid_pin', 'the Linux runtime record runtime/linux-runtime.json has engine.version 0.0.1, and its pin has version 0.4.3'); };
  const run = await cli(['install', '--json'], deps);
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).error.code, 'invalid_pin');
  assert.deepEqual(calls, []);
  assert.equal(existsSync(join(home, 'current.json')), false);
});

test('--modules-dir is passed to the module tree step; --sandbox-helper and --engine are Linux\'s, --modules-dir too', async t => {
  const home = scratchHome(t);
  const {deps} = installers(home);
  let dir;
  const lay = deps.installModules;
  deps.installModules = options => { dir = options.dir; return lay(options); };
  assert.equal((await installJson(deps, ['--modules-dir', '/srv/tarballs'])).status, 0);
  assert.equal(dir, '/srv/tarballs');
  const darwin = await cli(['install', '--modules-dir', '/srv/tarballs'], {platform: 'darwin'});
  assert.equal(darwin.status, 2);
  assert.match(darwin.stderr, /install takes --modules-dir on Linux only/);
});

// ---- cua runtime use on Linux (§4.3) ----

test('cua runtime use on Linux: the derived release verifies its tree again and takes the pointer; any other name, a vendor release\'s too, is unknown_release, its hint naming no engine', async t => {
  const home = scratchHome(t);
  const {root} = fakeModuleTree(home, LINUX);
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: VENDOR.release}));
  const deps = {home, host: LINUX};
  const used = await cli(['runtime', 'use', RELEASE, '--json'], deps);
  assert.equal(used.status, 0, used.stderr);
  assert.deepEqual(JSON.parse(used.stdout), {ok: true, release: RELEASE, root});
  assert.equal(pointer(home), RELEASE);

  for (const name of [VENDOR.release, 'cua-linux-x64-e9.9.9-n24.0.0-s0.0.0-m000000000000']) {
    const other = await cli(['runtime', 'use', name, '--json'], deps);
    assert.equal(other.status, 1);
    assert.deepEqual(JSON.parse(other.stdout).error, {code: 'unknown_release', message: `release ${name} is not this cua's Linux runtime, ${RELEASE}`,
      hint: 'on Linux this cua resolves only its own runtime'}, name);
  }

  // A tree whose files are not the ones installed is refused, and the remedy names the release this cua installs.
  writeFileSync(join(root, 'node_modules', 'sharp', 'package.json'), '{"tampered": true}\n');
  const damaged = JSON.parse((await cli(['runtime', 'use', RELEASE, '--json'], deps)).stdout);
  assert.equal(damaged.error.code, 'module_tree_invalid');
  assert.ok(damaged.error.hint.includes(RELEASE), damaged.error.hint);
});

// ---- macOS ----

test('on macOS cua install is the vendor\'s release, then Node, then the macOS engine step, as on main: no module tree, no lanes', async () => {
  const calls = [];
  const pin = selectPin(loadPins(), {platform: 'darwin', arch: 'arm64'});
  const deps = {home: '/fixture/home', platform: 'darwin', pins: () => [pin], nodePins: () => [],
    installRuntime: async ({manifest}) => { calls.push(['runtime', manifest.release]); return {release: manifest.release, root: '/fixture/runtime', changed: false, record: {source: 'download'}}; },
    installModules: async () => assert.fail('no module tree on macOS'), installEngine: async () => assert.fail('no Linux engine on macOS'),
    installHelper: async () => assert.fail('no Linux helper on macOS'), installMacosEngine: async () => ({skipped: 'not_selected'})};
  // The darwin pin is selected for the process's own host; a host without one has nothing to install.
  if (process.platform !== 'darwin' || process.arch !== 'arm64') deps.pins = () => [{...pin, platform: process.platform, arch: process.arch}];
  const run = await cli(['install', '--no-node', '--json'], deps);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(calls, [['runtime', pin.release]]);
  assert.deepEqual(JSON.parse(run.stdout), {ok: true, release: pin.release, root: '/fixture/runtime', changed: false, source: 'download', engine: {skipped: 'not_selected'}, node: {skipped: 'no_node'}});
});
