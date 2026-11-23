// The engine-version rule (#117 M5, R4; scripts/engine-version-check.mjs, the `engine-version` gate): a change to cua's
// macOS engine program, native/engine/ less its Tests/, must raise engineVersion (Version.swift) above the base's, so a
// version names what an approved engine can do and the service's minimum can refuse an older one. The decision is
// tested on its inputs; the command once against a scratch repository, as a pull request's gate runs it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {countsAsEngineChange, versionMoveProblem} from '../scripts/engine-version-check.mjs';
import {engineVersion} from '../src/runtime/engine-bundle.mjs';
import {MIN_ENGINE_VERSION, belowMinimum} from '../src/services/engine/client.mjs';

const SOURCE = 'native/engine/Sources/Engine/Input.swift';

test('the engine\'s program is native/engine/ less its Tests/ and build products: what moves `build`', () => {
  for (const path of [SOURCE, 'native/engine/Package.swift', 'native/engine/Sources/Engine/Version.swift', 'native/engine/Sources/EngineMain/main.swift'])
    assert.equal(countsAsEngineChange(path), true, path);
  for (const path of ['native/engine/Tests/EngineTests/InputTests.swift', 'native/engine/.build/x', 'native/engine/.swiftpm/y', 'native/engine/Sources/.DS_Store',
    'native/linux-engine/src/main.rs', 'src/runtime/engine-bundle.mjs', 'native/engineering.md', 'docs/native/engine/Sources/x.swift'])
    assert.equal(countsAsEngineChange(path), false, path);
});

test('an engine change must raise engineVersion above the base\'s; anything else passes', () => {
  assert.equal(versionMoveProblem({changed: ['README.md', 'native/engine/Tests/EngineTests/A.swift'], base: '0.2.0', head: '0.2.0'}), null, 'no engine change');
  assert.equal(versionMoveProblem({changed: [SOURCE, 'native/engine/Sources/Engine/Version.swift'], base: '0.2.0', head: '0.2.1'}), null, 'raised');
  assert.equal(versionMoveProblem({changed: [SOURCE], base: '0.2.0', head: '0.3.0'}), null, 'raised by minor');
  assert.equal(versionMoveProblem({changed: [SOURCE], base: '0.2.9', head: '0.2.10'}), null, 'numerically, not as text');
  const unmoved = versionMoveProblem({changed: [SOURCE, 'README.md'], base: '0.2.0', head: '0.2.0'});
  assert.match(unmoved, /^native\/engine\/ changed \(native\/engine\/Sources\/Engine\/Input\.swift\), but engineVersion is still 0\.2\.0: raise it in native\/engine\/Sources\/Engine\/Version\.swift/);
  assert.doesNotMatch(unmoved, /README/);
  assert.match(versionMoveProblem({changed: [SOURCE], base: '0.3.0', head: '0.2.5'}), /engineVersion went from 0\.3\.0 to 0\.2\.5: raise it above 0\.3\.0/, 'lowered');
  assert.match(versionMoveProblem({changed: [SOURCE], base: '0.2.0', head: '0.2'}), /engineVersion "0\.2" in native\/engine\/Sources\/Engine\/Version\.swift is not major\.minor\.patch/);
  assert.match(versionMoveProblem({changed: [SOURCE], base: '0.2.0', head: null}), /no engineVersion in native\/engine\/Sources\/Engine\/Version\.swift/);
  // A base with no engine (the package's first commit) or no readable version has nothing to move from.
  assert.equal(versionMoveProblem({changed: [SOURCE], base: null, head: '0.2.0'}), null);
  const many = versionMoveProblem({changed: Array.from({length: 7}, (_, i) => `native/engine/Sources/Engine/F${i}.swift`), base: '0.2.0', head: '0.2.0'});
  assert.match(many, /F0\.swift, .*F4\.swift and 2 more\)/, 'names a few, counts the rest');
});

test('this checkout\'s engine is never below the minimum its service drives', () => {
  assert.equal(belowMinimum(engineVersion()), false, `engineVersion ${engineVersion()} against MIN_ENGINE_VERSION ${MIN_ENGINE_VERSION}`);
});

const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], {cwd, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
};
const write = (root, path, text) => { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), text); };
const commit = (root, files, message) => {
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
};
const versionFile = version => `let serverApiVersion = "cua-engine-1"\nlet engineVersion = "${version}"\n`;
const check = (root, env) => spawnSync(process.execPath, [join(REPO, 'scripts', 'engine-version-check.mjs')], {cwd: root, encoding: 'utf8', env: {...process.env, CI_KIT_BASE: '', CI_KIT_HEAD: '', ...env}});

test('the command diffs CI_KIT_BASE..CI_KIT_HEAD as a pull request\'s gate does, and has nothing to check without a base', t => {
  const s = scratch('cua-engine-version-');
  t.after(s.cleanup);
  const root = s.dir;
  git(root, 'init', '-q');
  const base = commit(root, {'native/engine/Sources/Engine/Version.swift': versionFile('0.2.0'), [SOURCE]: 'a\n', 'README.md': 'x\n'}, 'base');
  const unmoved = commit(root, {[SOURCE]: 'b\n'}, 'engine change, version kept');
  let run = check(root, {CI_KIT_BASE: base, CI_KIT_HEAD: unmoved});
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /native\/engine\/ changed \(native\/engine\/Sources\/Engine\/Input\.swift\), but engineVersion is still 0\.2\.0/);
  const moved = commit(root, {'native/engine/Sources/Engine/Version.swift': versionFile('0.2.1')}, 'version raised');
  run = check(root, {CI_KIT_BASE: base, CI_KIT_HEAD: moved});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /engineVersion 0\.2\.0 → 0\.2\.1 with 2 engine files changed/);
  const testsOnly = commit(root, {'native/engine/Tests/EngineTests/A.swift': 't\n', 'README.md': 'y\n'}, 'tests and docs');
  run = check(root, {CI_KIT_BASE: moved, CI_KIT_HEAD: testsOnly});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /no change to the engine's program/);
  // HEAD by default; --base and --head name revisions for a local run.
  run = spawnSync(process.execPath, [join(REPO, 'scripts', 'engine-version-check.mjs'), '--base', base, '--head', unmoved], {cwd: root, encoding: 'utf8', env: {...process.env, CI_KIT_BASE: '', CI_KIT_HEAD: ''}});
  assert.equal(run.status, 1);
  run = check(root, {CI_KIT_BASE: unmoved});
  assert.equal(run.status, 0, 'HEAD (testsOnly) against unmoved: the version was raised since');
  run = check(root, {});
  assert.equal(run.status, 0);
  assert.match(run.stdout, /no base to compare with/);
});

test('a file moved out of native/engine/ counts by its old path: renames are listed as a delete and an add', t => {
  const s = scratch('cua-engine-version-');
  t.after(s.cleanup);
  const root = s.dir;
  git(root, 'init', '-q');
  const moving = 'native/engine/Sources/Engine/Moving.swift';
  const base = commit(root, {'native/engine/Sources/Engine/Version.swift': versionFile('0.2.0'), [moving]: 'let moving = 1 // long enough for rename detection\n'}, 'base');
  mkdirSync(join(root, 'docs'));
  git(root, 'mv', moving, 'docs/Moving.swift');
  git(root, 'commit', '-q', '-m', 'moved out');
  const head = git(root, 'rev-parse', 'HEAD');
  assert.match(git(root, 'diff', '--name-status', base, head), /^R100/, 'git sees a rename');
  const run = check(root, {CI_KIT_BASE: base, CI_KIT_HEAD: head});
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /native\/engine\/ changed \(native\/engine\/Sources\/Engine\/Moving\.swift\), but engineVersion is still 0\.2\.0/);
});
