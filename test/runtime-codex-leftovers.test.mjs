// The Codex CLI's leftovers in a cua home (src/runtime/codex-leftovers.mjs, #115 M4): what `cua install` removes from
// the runtime's CODEX_HOME by name, the release-tree CLI component it removes under the Design's three conditions, the
// symbolic links it never follows, what node_repl still keeps there that it never touches, and doctor's report of
// both until install removes them. Every tree here is a scratch one; nothing reads the user's home or a real runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {CODEX_HOME_LEFTOVERS, findCodexLeftovers, removeCodexLeftovers} from '../src/runtime/codex-leftovers.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {loadPins, parsePin} from '../src/runtime/manifest.mjs';
import {sweepRun} from '../src/runtime/run-dir.mjs';
import {main} from '../src/cli.mjs';
import {fixturePin, shortScratch} from './fixtures/runtime-fixture.mjs';

// A value no output may carry: every leftover file holds it, and only names may be logged.
const SENTINEL = 'CODEX-LEFTOVER-CONTENT-7f3a';

function scratchHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = join(realpathSync(s.dir), 'home');
  mkdirSync(home);
  return {dir: realpathSync(s.dir), home};
}

function put(path, body = SENTINEL) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, body);
}

// What the signed Codex CLI left in CODEX_HOME when it ran there, and what node_repl keeps there for the macOS vendor
// host (which must survive).
const CLI_FILES = ['auth.json', 'installation_id', 'models_cache.json', 'state_5.sqlite', 'state_5.sqlite-wal', 'state_5.sqlite-shm', 'logs_1.sqlite',
  'cache/codex_apps_tools/x.json', 'plugins/p/manifest.json', 'skills/.system/s.md', 'log/codex-tui.log', 'tmp/arg0/codex-arg0abc/apply_patch',
  'browser/sessions/b1.json'];
const NODE_REPL_FILES = ['config.toml', 'computer-use/sessions/0000.toml', 'node_repl/active_execs/e1.json', 'tmp/other/keep.txt', 'browser/other/keep.txt',
  'notes.sqlite.bak', 'sqlite'];
const EXPECTED = ['auth.json', 'installation_id', 'models_cache.json', 'cache', 'plugins', 'skills', 'log', 'tmp/arg0', 'browser/sessions',
  'logs_1.sqlite', 'state_5.sqlite', 'state_5.sqlite-shm', 'state_5.sqlite-wal'];

const codexHomeOf = home => join(home, 'state', 'codex');
const noSessions = () => ({live: [], unowned: []});

test('the CODEX_HOME list is the Design\'s, by name', () => {
  assert.deepEqual(CODEX_HOME_LEFTOVERS, ['auth.json', 'installation_id', 'models_cache.json', 'cache', 'plugins', 'skills', 'log', 'tmp/arg0', 'browser/sessions']);
});

test('install removes the Codex CLI\'s leftovers in CODEX_HOME by name, keeps node_repl\'s own state, and reports names, never content', t => {
  const {home} = scratchHome(t);
  const codexHome = codexHomeOf(home);
  for (const rel of [...CLI_FILES, ...NODE_REPL_FILES]) put(join(codexHome, rel));
  const found = findCodexLeftovers({home, pins: []});
  assert.equal(found.codexHome, codexHome);
  assert.deepEqual(found.files, EXPECTED);
  assert.deepEqual(found.trees, []);

  const result = removeCodexLeftovers({home, pins: [], sweep: noSessions});
  assert.deepEqual(result.removed, EXPECTED.map(rel => join(codexHome, rel)));
  assert.deepEqual([result.deferred, result.failed], [[], []]);
  for (const rel of EXPECTED) assert.equal(existsSync(join(codexHome, rel)), false, rel);
  for (const rel of NODE_REPL_FILES) assert.equal(readFileSync(join(codexHome, rel), 'utf8'), SENTINEL, `${rel} is node_repl's or not on the list`);
  assert.ok(existsSync(join(codexHome, 'tmp')) && existsSync(join(codexHome, 'browser')), 'only the named entries go');
  assert.equal(JSON.stringify(result).includes(SENTINEL), false, 'no content in the result');

  assert.deepEqual(removeCodexLeftovers({home, pins: [], sweep: noSessions}).removed, [], 'a second install finds nothing');
});

test('a home with no CODEX_HOME, or no home at all, has nothing to clean', t => {
  const {dir, home} = scratchHome(t);
  assert.deepEqual(findCodexLeftovers({home, pins: []}).files, []);
  assert.deepEqual(removeCodexLeftovers({home: join(dir, 'absent'), pins: [], sweep: noSessions}), {codexHome: join(dir, 'absent', 'state', 'codex'), removed: [], deferred: [], failed: []});
});

test('symbolic links are never followed out of CODEX_HOME: a leftover that is a link goes as the link, a linked parent or CODEX_HOME is left alone', t => {
  const {dir, home} = scratchHome(t);
  const outside = join(dir, 'outside');
  put(join(outside, 'cache', 'x.json'));
  put(join(outside, 'tmp', 'arg0', 'apply_patch'));
  put(join(outside, 'browser', 'sessions', 'b1.json'));
  put(join(outside, 'auth.json'));
  const codexHome = codexHomeOf(home);
  mkdirSync(codexHome, {recursive: true});
  symlinkSync(join(outside, 'cache'), join(codexHome, 'cache'));
  symlinkSync(join(outside, 'tmp'), join(codexHome, 'tmp'));
  symlinkSync(join(outside, 'browser'), join(codexHome, 'browser'));
  symlinkSync(join(outside, 'auth.json'), join(codexHome, 'installation_id'));

  assert.deepEqual(findCodexLeftovers({home, pins: []}).files, ['installation_id', 'cache'], 'tmp/arg0 and browser/sessions lie behind links');
  removeCodexLeftovers({home, pins: [], sweep: noSessions});
  assert.equal(existsSync(join(codexHome, 'cache')) || existsSync(join(codexHome, 'installation_id')), false, 'the links themselves are removed');
  for (const rel of ['cache/x.json', 'tmp/arg0/apply_patch', 'browser/sessions/b1.json', 'auth.json']) assert.equal(readFileSync(join(outside, rel), 'utf8'), SENTINEL, `${rel} outside is untouched`);
  assert.ok(lstatSync(join(codexHome, 'tmp')).isSymbolicLink() && lstatSync(join(codexHome, 'browser')).isSymbolicLink());

  // CODEX_HOME itself, or state/, as a link: nothing under it is cua's to remove.
  for (const linked of ['state/codex', 'state']) {
    const other = scratchHome(t);
    const target = join(other.dir, 'elsewhere');
    put(join(target, linked === 'state' ? 'codex/auth.json' : 'auth.json'));
    mkdirSync(dirname(join(other.home, linked)), {recursive: true});
    symlinkSync(target, join(other.home, linked));
    assert.deepEqual(findCodexLeftovers({home: other.home, pins: []}).files, [], linked);
    removeCodexLeftovers({home: other.home, pins: [], sweep: noSessions});
    assert.equal(readFileSync(join(target, linked === 'state' ? 'codex/auth.json' : 'auth.json'), 'utf8'), SENTINEL, linked);
  }
});

// ---- the release tree's CLI component ----

// A darwin pin that lists no CodexCLI.app (as since #115 M2), and the same release's tree as an install before M2 left it.
const darwinPin = (release = '0.0.1-darwin-arm64', components) => parsePin(fixturePin({release, sha256: 'a'.repeat(64), length: 1, ...(components ? {components} : {})}));
function installedTree(home, pin, {record = true, cli = 'dir'} = {}) {
  const root = join(home, 'runtimes', pin.release);
  put(join(root, 'cua_node', 'bin', 'node'), '');
  if (record) writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}}));
  if (cli === 'dir') put(join(root, 'CodexCLI.app', 'Contents', 'MacOS', 'codex'));
  return root;
}

test('the unused CodexCLI.app is removed from an installed darwin tree whose pin no longer lists it, while no session runs', t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  assert.deepEqual(findCodexLeftovers({home, pins: [pin]}).trees, [{release: pin.release, name: 'CodexCLI.app', path: join(root, 'CodexCLI.app')}]);
  const result = removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
  assert.deepEqual(result.removed, [join(root, 'CodexCLI.app')]);
  assert.equal(existsSync(join(root, 'CodexCLI.app')), false);
  assert.deepEqual(readdirSync(root).sort(), ['cua_node', 'install.json'], 'nothing else in the tree is touched');
});

test('CodexCLI.app stays when its pin still lists it, the tree is not one cua installed, the release has no pin, or a link stands at any step', t => {
  const {dir, home} = scratchHome(t);
  const listed = darwinPin('0.0.2-darwin-arm64', {cua_node: 'ChatGPT.app/Contents/Resources/cua_node', 'CodexCLI.app': 'ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app'});
  const unrecorded = darwinPin('0.0.3-darwin-arm64');
  const linkedApp = darwinPin('0.0.4-darwin-arm64');
  const linkedTree = darwinPin('0.0.5-darwin-arm64');
  const roots = [installedTree(home, listed), installedTree(home, unrecorded, {record: false}), installedTree(home, darwinPin('0.0.6-darwin-arm64'))];
  // 0.0.6 has a tree but no pin among those given.
  const appRoot = installedTree(home, linkedApp, {cli: 'none'});
  put(join(dir, 'real-app', 'Contents', 'MacOS', 'codex'));
  symlinkSync(join(dir, 'real-app'), join(appRoot, 'CodexCLI.app'));
  const realTree = installedTree(dir, linkedTree);   // a tree outside the home, linked in
  symlinkSync(realTree, join(home, 'runtimes', linkedTree.release));
  put(join(roots[0], '..', '0.0.7-darwin-arm64', 'CodexCLI.app.old', 'x'));

  const pins = [listed, unrecorded, linkedApp, linkedTree];
  assert.deepEqual(findCodexLeftovers({home, pins}).trees, []);
  const result = removeCodexLeftovers({home, pins, sweep: noSessions});
  assert.deepEqual([result.removed, result.deferred, result.failed], [[], [], []]);
  for (const root of roots) assert.ok(existsSync(join(root, 'CodexCLI.app', 'Contents', 'MacOS', 'codex')), root);
  assert.equal(readFileSync(join(dir, 'real-app', 'Contents', 'MacOS', 'codex'), 'utf8'), SENTINEL);
  assert.ok(lstatSync(join(appRoot, 'CodexCLI.app')).isSymbolicLink());
  assert.ok(existsSync(join(realTree, 'CodexCLI.app', 'Contents', 'MacOS', 'codex')), 'a linked release directory is not followed');
});

test('CodexCLI.app is left while any session may run from this home: a live owner, a record not yet readable, or an entry with no record', t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  const run = join(home, 'run');
  mkdirSync(join(run, 's1'), {recursive: true});
  writeFileSync(join(run, 's1.pid'), '4242\n');
  put(join(codexHomeOf(home), 'auth.json'));

  const live = removeCodexLeftovers({home, pins: [pin], sweep: h => sweepRun(h, {alive: () => true})});
  assert.deepEqual(live.removed, [join(codexHomeOf(home), 'auth.json')], 'CODEX_HOME\'s leftovers do not wait for sessions');
  assert.equal(live.deferred.length, 1);
  assert.equal(live.deferred[0].path, join(root, 'CodexCLI.app'));
  assert.match(live.deferred[0].reason, /session s1 \(pid 4242\)/);
  assert.ok(existsSync(join(root, 'CodexCLI.app')));

  writeFileSync(join(run, 's1.pid'), '');   // a claim still being written
  assert.match(removeCodexLeftovers({home, pins: [pin], sweep: sweepRun}).deferred[0]?.reason ?? '', /s1\.pid .*no owner record/);
  assert.ok(existsSync(join(root, 'CodexCLI.app')));

  const unreadable = removeCodexLeftovers({home, pins: [pin], sweep: () => { throw Object.assign(new Error('denied'), {code: 'EACCES'}); }});
  assert.match(unreadable.deferred[0].reason, /could not be read \(EACCES\)/);

  // The owner gone: the sweep removes its session, and the tree's CLI goes with nothing left running.
  writeFileSync(join(run, 's1.pid'), '4242\n');
  const after = removeCodexLeftovers({home, pins: [pin], sweep: h => sweepRun(h, {alive: () => false})});
  assert.deepEqual([after.removed, after.deferred], [[join(root, 'CodexCLI.app')], []]);
  assert.equal(existsSync(join(run, 's1')), false);
});

test('on Linux the release\'s `codex` file goes under the same conditions; a directory by that name is not it', t => {
  const {home} = scratchHome(t);
  const pin = loadPins().find(p => p.platform === 'linux');
  assert.equal(Object.hasOwn(pin.components, 'codex'), false, 'the Linux pins list no codex since #115 M3');
  const root = installedTree(home, pin, {cli: 'none'});
  put(join(root, 'codex'));
  assert.deepEqual(findCodexLeftovers({home, pins: [pin]}).trees, [{release: pin.release, name: 'codex', path: join(root, 'codex')}]);
  assert.deepEqual(removeCodexLeftovers({home, pins: [pin], sweep: noSessions}).removed, [join(root, 'codex')]);
  mkdirSync(join(root, 'codex'));
  assert.deepEqual(findCodexLeftovers({home, pins: [pin]}).trees, []);
});

// ---- doctor and the CLI ----

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const passive = {host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/nonexistent', exists: false}),
  inspectAgent: async () => [], inspectChrome: async () => [], verifySignatures: async () => [], resolveOwnNode: () => process.execPath};
const leftoverRow = report => report.checks.find(c => c.name === 'runtime.leftovers');

test('doctor reports both kinds of leftover by name until install removes them, and passes once nothing is left', async t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  put(join(codexHomeOf(home), 'auth.json'));
  put(join(codexHomeOf(home), 'cache', 'x'));
  put(join(codexHomeOf(home), 'config.toml'));
  const env = {HOME: home};
  const before = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
  assert.equal(before.status, 'warn');
  assert.ok(before.detail.includes(`${codexHomeOf(home)}: auth.json, cache`), before.detail);
  assert.ok(before.detail.includes(join(root, 'CodexCLI.app')), before.detail);
  assert.match(before.detail, /`cua install` removes them/);
  assert.equal(before.detail.includes('config.toml') || before.detail.includes(SENTINEL), false);

  mkdirSync(join(home, 'run', 's1'), {recursive: true});
  writeFileSync(join(home, 'run', 's1.pid'), `${process.pid}\n`);
  const busy = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
  assert.match(busy.detail, /once no session runs from this home \(now: session s1 \(pid \d+\)\)/);

  removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
  const after = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
  assert.equal(after.status, 'pass', after.detail);
});

test('cua install removes the leftovers after the runtime step and logs each by name, in text and JSON', async t => {
  const {home} = scratchHome(t);
  const host = {platform: process.platform, arch: process.arch};
  const runtimePin = {release: '0.0.1-fixture', platform: host.platform, arch: host.arch, appVersion: '0.0.1', archive: {url: 'https://example.invalid/runtime'}};
  const deps = {home, platform: 'darwin', installRuntime: async () => ({release: '0.0.1-fixture', root: '/fixture/runtime', changed: false, record: {source: 'archive'}}),
    pins: () => [runtimePin], nodePins: () => []};
  const run = async args => {
    const out = [], write = process.stdout.write, err = process.stderr.write;
    process.stdout.write = chunk => { out.push(String(chunk)); return true; };
    process.stderr.write = () => true;
    try { return {status: await main(['install', '--no-node', ...args], deps), stdout: out.join('')}; } finally { process.stdout.write = write; process.stderr.write = err; }
  };
  put(join(codexHomeOf(home), 'auth.json'));
  put(join(codexHomeOf(home), 'models_cache.json'));
  const text = await run([]);
  assert.equal(text.status, 0);
  assert.ok(text.stdout.includes(`removed the Codex CLI's leftovers from ${codexHomeOf(home)}: auth.json, models_cache.json\n`), text.stdout);
  assert.equal(text.stdout.includes(SENTINEL), false);
  assert.equal(existsSync(join(codexHomeOf(home), 'auth.json')), false);

  put(join(codexHomeOf(home), 'installation_id'));
  const json = JSON.parse((await run(['--json'])).stdout);
  assert.deepEqual(json.codexLeftovers, {codexHome: codexHomeOf(home), removed: [join(codexHomeOf(home), 'installation_id')], deferred: [], failed: []});
  const quiet = await run([]);
  assert.doesNotMatch(quiet.stdout, /leftover/, 'nothing to say when nothing is left');
});
