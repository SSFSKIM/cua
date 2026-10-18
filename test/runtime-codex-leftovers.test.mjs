// The Codex CLI's leftovers in a cua home (src/runtime/codex-leftovers.mjs, #115 M4): what `cua install
// --prune-leftovers` removes from cua's own CODEX_HOME by name (never the environment's CODEX_HOME), the release-tree
// CLI component it removes under the Design's three conditions, the symbolic links it never follows, what node_repl
// still keeps there that it never touches, that a plain `cua install` removes nothing, and doctor's report of both with
// the command that removes them. Every tree here is a scratch one; nothing reads the user's home or a real runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {CODEX_HOME_LEFTOVERS, describeRemoval, findCodexLeftovers, removeCodexLeftovers} from '../src/runtime/codex-leftovers.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {loadPins, parsePin} from '../src/runtime/manifest.mjs';
import {sweepRun} from '../src/runtime/run-dir.mjs';
import {main, usageFor} from '../src/cli.mjs';
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

test('symbolic links are never followed out of CODEX_HOME: a leftover that is a link is unlinked and its target kept; a linked parent, CODEX_HOME or state/ is skipped', t => {
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
  assert.deepEqual(findCodexLeftovers({home, pins: []}).uninspected, [join(codexHome, 'tmp'), join(codexHome, 'browser')], 'and are reported as not inspected');
  const pruned = removeCodexLeftovers({home, pins: [], sweep: noSessions});
  assert.deepEqual(pruned.failed, [join(codexHome, 'tmp'), join(codexHome, 'browser')].map(path => ({path, code: 'symlink_not_inspected'})));
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
    assert.deepEqual(findCodexLeftovers({home: other.home, pins: []}).uninspected, [join(other.home, linked)], `${linked} is reported as not inspected`);
    // state/ is also where a session's compat settings live, so a link there refuses the prune outright.
    if (linked === 'state') assert.throws(() => removeCodexLeftovers({home: other.home, pins: [], sweep: noSessions}), error => error.code === 'prune_refused');
    else removeCodexLeftovers({home: other.home, pins: [], sweep: noSessions});
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
  const linked = [join(appRoot, 'CodexCLI.app'), join(home, 'runtimes', linkedTree.release)];
  assert.deepEqual(findCodexLeftovers({home, pins}).uninspected, linked, 'the links are not followed, and are reported');
  const result = removeCodexLeftovers({home, pins, sweep: noSessions});
  assert.deepEqual([result.removed, result.deferred, result.failed], [[], [], linked.map(path => ({path, code: 'symlink_not_inspected'}))]);
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

test('doctor reports both kinds of leftover by name, with the command that removes them, and passes once nothing is left', async t => {
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
  assert.match(before.detail, /once every cua using this home is updated \(an older one may still launch the Codex CLI\), `cua install --prune-leftovers` removes them/);
  assert.equal(before.detail.includes('config.toml') || before.detail.includes(SENTINEL), false);

  mkdirSync(join(home, 'run', 's1'), {recursive: true});
  writeFileSync(join(home, 'run', 's1.pid'), `${process.pid}\n`);
  const busy = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
  assert.match(busy.detail, /once no session runs from this home \(now: session s1 \(pid \d+\)\)/);

  removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
  const after = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
  assert.equal(after.status, 'pass', after.detail);
});

// `cua install` through the CLI's own handler, the runtime installer stubbed (its archive is OpenAI's), with a home
// holding a release tree of `pin` that still has its CodexCLI.app and CODEX_HOME leftovers.
function cliHome(t) {
  const {dir, home} = scratchHome(t);
  const host = {platform: process.platform, arch: process.arch};
  const runtimePin = {release: '0.0.1-fixture', platform: host.platform, arch: host.arch, appVersion: '0.0.1', archive: {url: 'https://example.invalid/runtime'}};
  const pin = darwinPin();
  const root = installedTree(home, pin);
  const deps = {home, platform: 'darwin', installRuntime: async () => ({release: '0.0.1-fixture', root: '/fixture/runtime', changed: false, record: {source: 'archive'}}),
    pins: () => [runtimePin, pin], nodePins: () => []};
  const run = async args => {
    const out = [], write = process.stdout.write, err = process.stderr.write;
    process.stdout.write = chunk => { out.push(String(chunk)); return true; };
    process.stderr.write = () => true;
    try { return {status: await main(['install', '--no-node', ...args], deps), stdout: out.join('')}; } finally { process.stdout.write = write; process.stderr.write = err; }
  };
  return {dir, home, root, run};
}

test('cua install alone removes nothing: the release\'s CodexCLI.app and CODEX_HOME\'s leftovers stay, and it says how to prune them', async t => {
  const {home, root, run} = cliHome(t);
  for (const rel of CLI_FILES) put(join(codexHomeOf(home), rel));
  const text = await run([]);
  assert.equal(text.status, 0);
  assert.ok(existsSync(join(root, 'CodexCLI.app', 'Contents', 'MacOS', 'codex')), 'an older cua sharing the home may still launch it');
  for (const rel of CLI_FILES) assert.equal(readFileSync(join(codexHomeOf(home), rel), 'utf8'), SENTINEL, rel);
  assert.doesNotMatch(text.stdout, /^removed/m);
  assert.match(text.stdout, /the Codex CLI's leftovers are still here .*once every cua using this home is updated, run `cua install --prune-leftovers`/);
  const json = JSON.parse((await run(['--json'])).stdout);
  assert.equal('codexLeftovers' in json, false, 'nothing was pruned');
  assert.ok(existsSync(join(root, 'CodexCLI.app')));
});

test('cua install --prune-leftovers removes them after the runtime step and logs each by name, in text and JSON', async t => {
  const {home, root, run} = cliHome(t);
  put(join(codexHomeOf(home), 'auth.json'));
  put(join(codexHomeOf(home), 'models_cache.json'));
  const text = await run(['--prune-leftovers']);
  assert.equal(text.status, 0);
  assert.ok(text.stdout.includes(`removed the Codex CLI's leftovers from ${codexHomeOf(home)}: auth.json, models_cache.json\n`), text.stdout);
  assert.ok(text.stdout.includes(`removed the Codex CLI's unused ${join(root, 'CodexCLI.app')}\n`), text.stdout);
  assert.equal(text.stdout.includes(SENTINEL), false);
  assert.equal(existsSync(join(codexHomeOf(home), 'auth.json')) || existsSync(join(root, 'CodexCLI.app')), false);

  put(join(codexHomeOf(home), 'installation_id'));
  const json = JSON.parse((await run(['--prune-leftovers', '--json'])).stdout);
  assert.deepEqual(json.codexLeftovers, {codexHome: codexHomeOf(home), removed: [join(codexHomeOf(home), 'installation_id')], deferred: [], failed: []});
  const quiet = await run(['--prune-leftovers']);
  assert.doesNotMatch(quiet.stdout, /leftover/, 'nothing to say when nothing is left');
});

// The guard on whose CODEX_HOME is cleaned: only cua's own, $CUA_HOME/state/codex. The environment's CODEX_HOME (the
// Codex CLI's own setting, which may name the user's real ~/.codex) is never read: a planted directory holding every
// leftover name survives the prune, the plain install and the module, untouched.
test('the environment\'s CODEX_HOME is never touched, by the prune, by install or by the module', async t => {
  const {dir, home, run} = cliHome(t);
  const planted = join(dir, 'users-real-codex');
  for (const rel of CLI_FILES) put(join(planted, rel));
  const saved = process.env.CODEX_HOME;
  process.env.CODEX_HOME = planted;
  t.after(() => { if (saved === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = saved; });
  assert.equal(findCodexLeftovers({home, pins: []}).codexHome, codexHomeOf(home));
  assert.deepEqual(findCodexLeftovers({home, pins: []}).files, [], 'cua\'s own CODEX_HOME holds nothing');
  removeCodexLeftovers({home, pins: [], sweep: noSessions});
  assert.equal((await run([])).status, 0);
  assert.equal((await run(['--prune-leftovers'])).status, 0);
  for (const rel of CLI_FILES) assert.equal(readFileSync(join(planted, rel), 'utf8'), SENTINEL, rel);
  // And with the environment's CODEX_HOME set to cua's own path's sibling spelling, only cua's own is cleaned.
  put(join(codexHomeOf(home), 'auth.json'));
  removeCodexLeftovers({home, pins: [], sweep: noSessions});
  assert.equal(existsSync(join(codexHomeOf(home), 'auth.json')), false);
  assert.equal(readFileSync(join(planted, 'auth.json'), 'utf8'), SENTINEL);
});

test('the usage names the prune and why it waits for every cua using the home', () => {
  for (const platform of ['darwin', 'linux']) assert.match(usageFor(platform), /\[--prune-leftovers\][^]*an older cua sharing the home may still need it/, platform);
});

// ---- review regressions ----

test('a run/ that is a symbolic link refuses the prune with a sentence, and nothing is removed anywhere', t => {
  const {dir, home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  put(join(codexHomeOf(home), 'auth.json'));
  const outside = join(dir, 'elsewhere');
  put(join(outside, 's1', 'kept.txt'));
  writeFileSync(join(outside, 's1.pid'), '999999\n');
  symlinkSync(outside, join(home, 'run'));
  assert.throws(() => removeCodexLeftovers({home, pins: [pin], sweep: h => sweepRun(h, {alive: () => false})}),
    error => error.code === 'prune_refused' && error.message.includes(`${join(home, 'run')} is not a directory`));
  assert.ok(existsSync(join(codexHomeOf(home), 'auth.json')) && existsSync(join(root, 'CodexCLI.app')), 'nothing removed');
  assert.equal(readFileSync(join(outside, 's1', 'kept.txt'), 'utf8'), SENTINEL);
  assert.ok(existsSync(join(outside, 's1.pid')));
});

test('a session that appears between the check and the removal defers it: the tree is renamed aside, re-checked, and renamed back', t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  let calls = 0;
  // Clean when first asked, a live session when asked again after the rename.
  const sweep = () => (++calls === 1 ? {live: [], unowned: []} : {live: [{session: 'late', pid: 4242}], unowned: []});
  const result = removeCodexLeftovers({home, pins: [pin], sweep});
  assert.equal(calls, 2, 'checked before the rename and again after it');
  assert.deepEqual(result.removed, []);
  assert.equal(result.deferred[0].path, join(root, 'CodexCLI.app'));
  assert.match(result.deferred[0].reason, /session late \(pid 4242\)/);
  assert.equal(readFileSync(join(root, 'CodexCLI.app', 'Contents', 'MacOS', 'codex'), 'utf8'), SENTINEL, 'renamed back, whole');
  assert.deepEqual(readdirSync(root).sort(), ['CodexCLI.app', 'cua_node', 'install.json'], 'no tombstone left');

  // Clean both times: removed through its tombstone, which goes too.
  const done = removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
  assert.deepEqual(done.removed, [join(root, 'CodexCLI.app')]);
  assert.deepEqual(readdirSync(root).sort(), ['cua_node', 'install.json']);
});

test('an unreadable CODEX_HOME, runtimes/ or release tree never reads as clean: doctor warns with the path and errno, the prune reports a failure', {skip: process.getuid?.() === 0}, async t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  put(join(codexHomeOf(home), 'auth.json'));
  const env = {HOME: home};
  for (const [label, path] of [['CODEX_HOME', codexHomeOf(home)], ['runtimes/', join(home, 'runtimes')], ['the release tree', root]]) {
    chmodSync(path, 0o000);
    try {
      const found = findCodexLeftovers({home, pins: [pin]});
      assert.ok(found.errors.some(e => e.path.startsWith(path) && e.code === 'EACCES'), `${label}: ${JSON.stringify(found.errors)}`);
      const row = leftoverRow(await inspectRuntime({home, env, pins: [pin], ...passive}));
      assert.equal(row.status, 'warn', `${label}: ${row.detail}`);
      assert.match(row.detail, new RegExp(`could not be read: ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^ ]* \\(EACCES\\)`), label);
      const pruned = removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
      assert.ok(pruned.failed.some(f => f.path.startsWith(path) && f.code === 'EACCES'), `${label}: ${JSON.stringify(pruned.failed)}`);
    } finally { chmodSync(path, 0o755); }
  }
});

test('an unreadable install.json is a scan error, not a stranger\'s tree: doctor warns and the prune reports it; readable invalid content is still skipped', {skip: process.getuid?.() === 0}, async t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  const record = join(root, 'install.json');
  chmodSync(record, 0o000);
  try {
    const found = findCodexLeftovers({home, pins: [pin]});
    assert.deepEqual(found.errors, [{path: record, code: 'EACCES'}]);
    const row = leftoverRow(await inspectRuntime({home, env: {HOME: home}, pins: [pin], ...passive}));
    assert.equal(row.status, 'warn');
    assert.ok(row.detail.includes(`${record} (EACCES)`), row.detail);
    assert.deepEqual(removeCodexLeftovers({home, pins: [pin], sweep: noSessions}).failed, [{path: record, code: 'EACCES'}]);
    assert.ok(existsSync(join(root, 'CodexCLI.app')));
  } finally { chmodSync(record, 0o644); }
  writeFileSync(record, '{"not": "a record"}');
  assert.deepEqual(findCodexLeftovers({home, pins: [pin]}), {codexHome: codexHomeOf(home), files: [], trees: [], errors: [], uninspected: []}, 'readable but invalid: not cua\'s, left alone');
});

test('a tombstone left by a failed prune is a leftover: doctor names it, and the next prune removes it without waiting for sessions', {skip: process.getuid?.() === 0}, async t => {
  const {home} = scratchHome(t);
  const pin = darwinPin();
  const root = installedTree(home, pin);
  chmodSync(join(root, 'CodexCLI.app', 'Contents'), 0o000);
  const first = removeCodexLeftovers({home, pins: [pin], sweep: noSessions});
  const tombstone = readdirSync(root).find(name => /^\.CodexCLI\.app\.pruning-[0-9a-f]+$/.test(name));
  assert.ok(tombstone, readdirSync(root).join(', '));
  t.after(() => { try { chmodSync(join(root, tombstone, 'Contents'), 0o755); } catch {} });
  assert.deepEqual(first.failed.map(f => [f.path, f.code]), [[join(root, tombstone), 'EACCES']]);
  assert.equal(existsSync(join(root, 'CodexCLI.app')), false, 'never renamed back');

  const found = findCodexLeftovers({home, pins: [pin]});
  assert.deepEqual(found.trees, [{release: pin.release, name: 'CodexCLI.app', path: join(root, tombstone), tombstone: true}]);
  const row = leftoverRow(await inspectRuntime({home, env: {HOME: home}, pins: [pin], ...passive}));
  assert.equal(row.status, 'warn');
  assert.ok(row.detail.includes(join(root, tombstone)), row.detail);

  chmodSync(join(root, tombstone, 'Contents'), 0o755);
  const busy = () => ({live: [{session: 's1', pid: 4242}], unowned: []});
  const second = removeCodexLeftovers({home, pins: [pin], sweep: busy});
  assert.deepEqual([second.removed, second.deferred, second.failed], [[join(root, tombstone)], [], []], 'no session condition for a name no cua launches');
  assert.deepEqual(readdirSync(root).sort(), ['cua_node', 'install.json']);
  // Only the exact shape counts: other names beside it are not cua's to remove.
  for (const name of ['.CodexCLI.app.pruning-', '.CodexCLI.app.pruning-xyz', '.codexcli.pruning-ab12', 'CodexCLI.app.pruning-ab12']) mkdirSync(join(root, name));
  assert.deepEqual(findCodexLeftovers({home, pins: [pin]}).trees, []);
});

// Links on the way to a leftover are never followed, and never read as clean either (#161 review): a linked
// state/codex, a linked tmp/ or browser/ inside it (the reviewer's case: tmp/ linked to another directory of the same
// home holding arg0/), a linked runtimes/ and a linked release directory are each named as not inspected, by doctor
// (warn), the prune (failed) and a plain install's notice.
// Each setup returns the link and a file behind it that must survive.
for (const [label, setup] of [
  ['state/codex', ({dir, home}) => { put(join(dir, 'x', 'auth.json')); mkdirSync(join(home, 'state'), {recursive: true}); symlinkSync(join(dir, 'x'), codexHomeOf(home)); return [codexHomeOf(home), join(dir, 'x', 'auth.json')]; }],
  ['tmp/ inside state/codex', ({home}) => { put(join(home, 'other', 'arg0', 'marker')); mkdirSync(codexHomeOf(home), {recursive: true}); symlinkSync(join(home, 'other'), join(codexHomeOf(home), 'tmp')); return [join(codexHomeOf(home), 'tmp'), join(home, 'other', 'arg0', 'marker')]; }],
  ['runtimes/', ({dir, home}) => { const real = installedTree(dir, darwinPin()); symlinkSync(join(dir, 'runtimes'), join(home, 'runtimes')); return [join(home, 'runtimes'), join(real, 'CodexCLI.app', 'Contents', 'MacOS', 'codex')]; }],
  ['release directory', ({dir, home}) => { const pin = darwinPin(); const real = installedTree(dir, pin); mkdirSync(join(home, 'runtimes')); symlinkSync(real, join(home, 'runtimes', pin.release)); return [join(home, 'runtimes', pin.release), join(real, 'CodexCLI.app', 'Contents', 'MacOS', 'codex')]; }],
]) {
  test(`a linked ${label} is reported as not inspected by doctor, the prune and a plain install, and nothing behind it is touched`, async t => {
    const ctx = cliHome(t);
    rmSync(join(ctx.home, 'runtimes'), {recursive: true, force: true});   // cliHome's own tree, out of the way
    const [link, behind] = setup(ctx);
    const pins = [darwinPin()];
    assert.deepEqual(findCodexLeftovers({home: ctx.home, pins}).uninspected, [link]);
    const row = leftoverRow(await inspectRuntime({home: ctx.home, env: {HOME: ctx.home}, pins, ...passive}));
    assert.equal(row.status, 'warn', row.detail);
    assert.ok(row.detail.includes(`${link} is a symbolic link and was not inspected`), row.detail);
    const pruned = removeCodexLeftovers({home: ctx.home, pins, sweep: noSessions});
    assert.deepEqual(pruned.failed, [{path: link, code: 'symlink_not_inspected'}]);
    assert.ok(describeRemoval(pruned).some(line => line.includes(`${link} is a symbolic link and was not inspected`)));
    assert.match((await ctx.run([])).stdout, new RegExp(`${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is a symbolic link and was not inspected`));
    assert.ok(lstatSync(link).isSymbolicLink(), 'the link stays');
    assert.equal(readFileSync(behind, 'utf8'), SENTINEL, 'what lies behind it is untouched');
  });
}
