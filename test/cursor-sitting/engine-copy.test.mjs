// M3's save and restore of the Mac's approved engine around the attended sitting (docs/doperpowers/specs/2026-10-30-
// macos-agent-cursor-design.md, M3 Decisions), on a scratch tree under a fake HOME only: never the real
// ~/Library/Application Support/cua/engine/.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import {ENGINE_DIRECTORY_IN_HOME} from '../../src/runtime/layout.mjs';
import {restoreEngine, saveEngine, SKIPPED, treeManifest} from '../../scripts/cursor-sitting/engine-copy.mjs';

const BUNDLE = 'cua Engine.app';

// A fake HOME holding an engine directory shaped as the installer leaves it, and engine.json.
function fakeHome(t, {engineJson = '{"engine": "vendor"}\n'} = {}) {
  const home = mkdtempSync(join(tmpdir(), 'cua-235-sitting-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  assert.notEqual(home, homedir());
  const dir = join(home, ENGINE_DIRECTORY_IN_HOME);
  const put = (path, text, mode = 0o644) => { mkdirSync(join(dir, path, '..'), {recursive: true}); writeFileSync(join(dir, path), text); chmodSync(join(dir, path), mode); };
  put(`${BUNDLE}/Contents/MacOS/cua-engine`, 'saved build binary', 0o755);
  put(`${BUNDLE}/Contents/Info.plist`, '<plist>saved</plist>');
  put(`${BUNDLE}/Contents/_CodeSignature/CodeResources`, 'signature');
  mkdirSync(join(dir, BUNDLE, 'Contents/Frameworks/A'), {recursive: true});
  symlinkSync('A', join(dir, BUNDLE, 'Contents/Frameworks/Current'));
  put('approved.json', '{"build": "saved-build"}\n', 0o600);
  put('pending.json', '{"build": "saved-build"}\n', 0o600);
  put('usage.json', '{"sessions": 3}\n', 0o600);
  put(`previous/${BUNDLE}/Contents/MacOS/cua-engine`, 'older build', 0o755);
  put('build/release/huge.o', 'build scratch');
  put('staging/partial', 'staging');
  put('engine.lock', '');
  put('engine.sock', '');
  if (engineJson !== null) {
    mkdirSync(join(home, '.config/cua'), {recursive: true});
    writeFileSync(join(home, '.config/cua/engine.json'), engineJson, {mode: 0o600});
  }
  return {home, dir, savedTo: join(home, '.local/share/cua-235/engine-before-2026-10-30')};
}

const STATUS = {build: 'saved-build', approved: true, running: false, cursor: 'on'};

test('the save copies the whole engine directory but its socket, lock and build scratch, and records engine.json and the status', async t => {
  const {home, dir, savedTo} = fakeHome(t);
  const saved = await saveEngine({home, to: savedTo, status: async () => STATUS});
  assert.deepEqual(SKIPPED, ['engine.sock', 'engine.lock', 'build', 'staging']);
  for (const name of [BUNDLE, 'approved.json', 'pending.json', 'usage.json', 'previous']) assert.ok(existsSync(join(savedTo, 'engine', name)), name);
  for (const name of SKIPPED) assert.ok(!existsSync(join(savedTo, 'engine', name)), name);
  assert.deepEqual(treeManifest(join(savedTo, 'engine')), treeManifest(dir));
  assert.equal(statSync(join(savedTo, 'engine', BUNDLE, 'Contents/MacOS/cua-engine')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(savedTo, 'engine.json'), 'utf8'), '{"engine": "vendor"}\n');
  const record = JSON.parse(readFileSync(join(savedTo, 'saved.json'), 'utf8'));
  assert.equal(record.status.build, 'saved-build');
  assert.equal(record.engineJson.present, true);
  assert.deepEqual(record.skipped, ['engine.sock', 'engine.lock', 'build', 'staging']);
  assert.deepEqual(record.manifest, treeManifest(dir));
  assert.equal(saved.files, record.manifest.length);
});

test('the save refuses a destination that exists, and a home with no engine', async t => {
  const {home, savedTo} = fakeHome(t);
  mkdirSync(savedTo, {recursive: true});
  await assert.rejects(saveEngine({home, to: savedTo, status: async () => STATUS}), /already exists/);
  const empty = mkdtempSync(join(tmpdir(), 'cua-235-empty-'));
  t.after(() => rmSync(empty, {recursive: true, force: true}));
  await assert.rejects(saveEngine({home: empty, to: join(empty, 'saved'), status: async () => STATUS}), /no engine/);
});

// What the sitting leaves: the branch's build approved in place, engine.json edited (Acceptance 10).
function sitOn(dir, home) {
  writeFileSync(join(dir, BUNDLE, 'Contents/MacOS/cua-engine'), 'branch build binary');
  writeFileSync(join(dir, BUNDLE, 'Contents/NewResource'), 'only in the branch build');
  writeFileSync(join(dir, 'approved.json'), '{"build": "branch-build"}\n');
  rmSync(join(dir, 'previous'), {recursive: true});
  writeFileSync(join(home, '.config/cua/engine.json'), '{"engine": "vendor", "cursor": false}\n');
}

test('the restore stops the engine, puts the saved directory in place of the current one, and checks the status', async t => {
  const {home, dir, savedTo} = fakeHome(t);
  await saveEngine({home, to: savedTo, status: async () => STATUS});
  const before = treeManifest(dir);
  sitOn(dir, home);
  const calls = [];
  const aside = join(home, '.local/share/cua-235/engine-sitting');
  const out = await restoreEngine({home, from: savedTo, aside,
    stop: async () => { calls.push('stop'); return {ok: true}; },
    status: async () => { calls.push('status'); return STATUS; }});
  assert.deepEqual(calls, ['stop', 'status']);
  assert.equal(out.ok, true);
  assert.deepEqual(treeManifest(dir), before);
  assert.equal(readFileSync(join(home, '.config/cua/engine.json'), 'utf8'), '{"engine": "vendor"}\n');
  // The sitting's build is kept aside, not deleted (the owner may still keep it), with its engine.json.
  assert.equal(readFileSync(join(aside, 'engine', BUNDLE, 'Contents/MacOS/cua-engine'), 'utf8'), 'branch build binary');
  assert.ok(existsSync(join(aside, 'engine', 'build/release/huge.o')), 'the build scratch moved aside with the rest');
  assert.equal(readFileSync(join(aside, 'engine.json'), 'utf8'), '{"engine": "vendor", "cursor": false}\n');
  assert.deepEqual(out.status, {build: 'saved-build', approved: true, matches: true});
});

test('the restore changes nothing when the saved copy no longer matches its record, or the engine will not stop', async t => {
  const {home, dir, savedTo} = fakeHome(t);
  await saveEngine({home, to: savedTo, status: async () => STATUS});
  sitOn(dir, home);
  const sat = treeManifest(dir);
  let stopped = 0;
  writeFileSync(join(savedTo, 'engine', 'approved.json'), '{"build": "tampered"}\n');
  await assert.rejects(restoreEngine({home, from: savedTo, aside: join(home, 'aside-1'), stop: async () => { stopped++; return {ok: true}; }, status: async () => STATUS}),
    /no longer matches/);
  assert.equal(stopped, 0);
  assert.deepEqual(treeManifest(dir), sat);
  writeFileSync(join(savedTo, 'engine', 'approved.json'), '{"build": "saved-build"}\n');
  await assert.rejects(restoreEngine({home, from: savedTo, aside: join(home, 'aside-2'), stop: async () => ({ok: false, detail: 'refused: 1 other connection'}), status: async () => STATUS}),
    /did not stop.*1 other connection/);
  assert.deepEqual(treeManifest(dir), sat);
  assert.ok(!existsSync(join(home, 'aside-2')));
});

test('a restored engine whose status is not the saved build, approved, is reported with the step that follows', async t => {
  const {home, dir, savedTo} = fakeHome(t);
  await saveEngine({home, to: savedTo, status: async () => STATUS});
  sitOn(dir, home);
  const out = await restoreEngine({home, from: savedTo, aside: join(home, 'aside'), stop: async () => ({ok: true}),
    status: async () => ({...STATUS, approved: false})});
  assert.equal(out.ok, false);
  assert.deepEqual(out.status, {build: 'saved-build', approved: false, matches: false});
  assert.match(out.next, /cua engine approve/);
});

test('an engine.json the save did not find is moved aside at the restore', async t => {
  const {home, dir, savedTo} = fakeHome(t, {engineJson: null});
  await saveEngine({home, to: savedTo, status: async () => STATUS});
  mkdirSync(join(home, '.config/cua'), {recursive: true});
  writeFileSync(join(home, '.config/cua/engine.json'), '{"cursor": false}\n');
  const out = await restoreEngine({home, from: savedTo, aside: join(home, 'aside'), stop: async () => ({ok: true}), status: async () => STATUS});
  assert.equal(out.ok, true);
  assert.ok(!existsSync(join(home, '.config/cua/engine.json')));
  assert.equal(readFileSync(join(home, 'aside', 'engine.json'), 'utf8'), '{"cursor": false}\n');
  assert.ok(existsSync(join(dir, BUNDLE)));
});
