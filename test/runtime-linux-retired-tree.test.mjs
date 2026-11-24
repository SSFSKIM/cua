import './helpers/scratch-home.mjs';
// The vendor's Linux tree, reported and never touched (#171 M6b; ruling 1216; the pre-flight's §3.1-3.3, §5.1): a
// release is named only when the install record an older cua's install wrote there says it placed that release's
// archive, with its path, its size by lstat (§3.2) and one sentence that claims no more than that record shows. A link
// at runtimes/ or at a release is never followed (N3), runtimes/ is never listed, and nothing is written, renamed,
// removed or run. `cua install` prints the sentence and reports `retired`; doctor's `runtime.retired` row carries it,
// informational. Every path is checked under the recorder M6a built.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Dir, chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RETIRED_RELEASES, retiredSentence, retiredTrees} from '../src/runtime/retired-tree.mjs';
import {installLinux} from '../src/runtime/linux-install.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {INSTALLED_AT, RETIRED, plantRetiredRelease, retiredRecord} from './fixtures/retired-release.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {recorded, within} from './helpers/vendor-tree-recorder.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LINUX = {platform: 'linux', arch: 'x64'};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hasMkfifo = !spawnSync('mkfifo', ['--help']).error;

function scratchHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  return realpathSync(s.dir);
}

// §3.3's sentence, written out.
const sentence = (path, size) => `cua 0.30.0 no longer uses the vendor's release at ${path} for sessions: ${size}. cua leaves it in place and has not checked `
  + 'what it holds. Before deleting it by hand, check that no older cua (another checkout on this home) still runs from it, and for files added to it';
const measured = (path, amount) => sentence(path, `${amount} as it is now, where a cua install recorded placing it on 2026-10-28`);

// Every entry under `root`: its type, size, mode, mtime, and its bytes' hash or its link's target.
function snapshot(root) {
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      const entry = {path: relative(root, path), mode: stat.mode, size: stat.size, mtime: stat.mtimeMs, ino: stat.ino};
      if (stat.isDirectory()) { out.push(entry); walk(path); } else if (stat.isSymbolicLink()) out.push({...entry, link: readlinkSync(path)});
      else if (stat.isFile()) out.push({...entry, sha256: sha256(readFileSync(path))});
      else out.push(entry);
    }
  };
  walk(root);
  return out;
}

// What the module touched: each call and path, and whether it lies under `runtimes` as spelled or as reached.
const under = (seen, runtimes) => seen.filter(({path, reached}) => within(path, runtimes) || within(reached, runtimes));

test('a recorded release, x64 and arm64, is named: its path, its bytes, its record\'s date, and the sentence; the tree is as before', t => {
  for (const arch of ['x64', 'arm64']) {
    const home = scratchHome(t);
    const {root, bytes} = plantRetiredRelease(home, {arch});
    const before = snapshot(root);
    const report = retiredTrees({home});
    assert.deepEqual(report.trees, [{release: RETIRED[arch].release, path: root, bytes, installedAt: INSTALLED_AT, source: 'download'}], arch);
    assert.deepEqual(report.lines, [measured(root, `${bytes} bytes`)], arch);
    assert.doesNotMatch(report.lines[0], /nothing reads|not read|unused/, 'it does not say that nothing reads the tree');
    assert.deepEqual(snapshot(root), before, arch);
  }
  // both in one home, in the order of the two names; an `archive` source is named as such
  const home = scratchHome(t);
  const x64 = plantRetiredRelease(home, {arch: 'x64'});
  const arm64 = plantRetiredRelease(home, {arch: 'arm64', record: retiredRecord('arm64', {source: 'archive'})});
  assert.deepEqual(retiredTrees({home}).trees.map(({release, path, source}) => ({release, path, source})),
    [{release: RETIRED.x64.release, path: x64.root, source: 'download'}, {release: RETIRED.arm64.release, path: arm64.root, source: 'archive'}]);
});

test('the sentence for a real tree\'s size is §3.3\'s, at 10^6 bytes to the MB', () => {
  const path = '/home/u/.local/share/cua/runtimes/26.928.40906-linux-x64';
  assert.equal(retiredSentence({path, installedAt: INSTALLED_AT, bytes: 211_063_820}), measured(path, '211.1 MB'));
  assert.equal(retiredSentence({path, installedAt: INSTALLED_AT, bytes: 100_000}), measured(path, '0.1 MB'));
  assert.equal(retiredSentence({path, installedAt: INSTALLED_AT, bytes: 99_999}), measured(path, '99999 bytes'));
});

test('a release whose record is not exactly the one cua\'s install wrote is not named', t => {
  const big = JSON.stringify({...retiredRecord(), pad: 'x'.repeat(70 * 1024)});
  const cases = {
    'no record': null,
    'a wrong hash': retiredRecord('x64', {archive: {sha256: `0${RETIRED.x64.sha256.slice(1)}`, length: RETIRED.x64.length}}),
    'a wrong length': retiredRecord('x64', {archive: {sha256: RETIRED.x64.sha256, length: RETIRED.x64.length + 1}}),
    'the other release\'s archive': retiredRecord('x64', {archive: {sha256: RETIRED.arm64.sha256, length: RETIRED.arm64.length}}),
    'a wrong release': retiredRecord('x64', {release: RETIRED.arm64.release}),
    'schema 2': retiredRecord('x64', {schema: 2}),
    'an extra key': retiredRecord('x64', {extra: true}),
    'an extra archive key': retiredRecord('x64', {archive: {sha256: RETIRED.x64.sha256, length: RETIRED.x64.length, format: 'deb'}}),
    'no installedAt': retiredRecord('x64', {installedAt: undefined}),
    'installedAt no date': retiredRecord('x64', {installedAt: 'yesterday'}),
    'installedAt an impossible date': retiredRecord('x64', {installedAt: '2026-02-30T09:12:33.123Z'}),
    'installedAt not in the writer\'s form': retiredRecord('x64', {installedAt: '2026-10-28T09:12:33Z'}),
    'another source': retiredRecord('x64', {source: 'mirror'}),
    'not JSON': '{"schema": 1,',
    'over 64 KiB': big,
  };
  for (const [name, record] of Object.entries(cases)) {
    const home = scratchHome(t);
    plantRetiredRelease(home, {record});
    assert.deepEqual(retiredTrees({home}), {trees: [], lines: []}, name);
  }
  // the record a link (to a valid record), or a directory
  for (const kind of ['link', 'directory']) {
    const home = scratchHome(t);
    const {root} = plantRetiredRelease(home, {record: null});
    const valid = join(home, 'valid.json');
    writeFileSync(valid, JSON.stringify(retiredRecord()));
    if (kind === 'link') symlinkSync(valid, join(root, 'install.json'));
    else mkdirSync(join(root, 'install.json'));
    const seen = recorded(() => assert.deepEqual(retiredTrees({home}), {trees: [], lines: []}, kind));
    assert.ok(!seen.some(({path, reached}) => path === valid || reached === valid), `${kind}: the link was not followed`);
  }
});

test('anything but a real release directory of the two names is not named: no link followed, runtimes/ never listed', t => {
  const darwin = '26.928.40906-darwin-arm64';
  const layouts = {
    'runtimes/ absent': () => {},
    'runtimes/ a file': home => writeFileSync(join(home, 'runtimes'), ''),
    'a directory of another name': home => { plantRetiredRelease(home, {name: '26.928.40906-linux-x64.old'}); },
    'a file at the release\'s name': home => { mkdirSync(join(home, 'runtimes')); writeFileSync(join(home, 'runtimes', RETIRED.x64.release), JSON.stringify(retiredRecord())); },
    'a darwin release': home => plantRetiredRelease(home, {name: darwin, record: {...retiredRecord(), release: darwin}}),
    'runtimes/ a link': (home, elsewhere) => { plantRetiredRelease(elsewhere); symlinkSync(join(elsewhere, 'runtimes'), join(home, 'runtimes')); return {followed: join(elsewhere, 'runtimes')}; },
    'the release a link': (home, elsewhere) => { const {root} = plantRetiredRelease(elsewhere); mkdirSync(join(home, 'runtimes')); symlinkSync(root, join(home, 'runtimes', RETIRED.x64.release)); return {followed: root}; },
  };
  for (const [name, lay] of Object.entries(layouts)) {
    const home = scratchHome(t);
    const elsewhere = scratchHome(t);
    const laid = lay(home, elsewhere) ?? {};
    let report;
    const seen = recorded(() => { report = retiredTrees({home}); });
    assert.deepEqual(report, {trees: [], lines: []}, name);
    assert.ok(!seen.some(({call, path}) => /^(readdirSync|opendirSync)$/.test(call) && path === join(home, 'runtimes')), `${name}: runtimes/ listed`);
    if (laid.followed) assert.deepEqual(under(seen, laid.followed), [], `${name}: a link followed`);
  }
});

test('the size is a lstat walk: a hard-linked pair once, a link by its own length, directories and a fifo nothing', {skip: !hasMkfifo && 'no mkfifo'}, t => {
  const home = scratchHome(t);
  const {root, bytes: planted} = plantRetiredRelease(home);
  mkdirSync(join(root, 'deep', 'er'), {recursive: true});
  writeFileSync(join(root, 'deep', 'er', 'pair'), 'x'.repeat(1000));
  linkSync(join(root, 'deep', 'er', 'pair'), join(root, 'deep', 'pair-again'));
  const target = join(home, 'outside-target');
  writeFileSync(target, 'y'.repeat(5000));
  symlinkSync(target, join(root, 'deep', 'link'));
  assert.equal(spawnSync('mkfifo', [join(root, 'deep', 'fifo')]).status, 0);
  const report = retiredTrees({home});
  assert.equal(report.trees[0].bytes, planted + 1000 + Buffer.byteLength(target), 'the pair once, the link by its own length, nothing for the fifo or a directory');
  assert.deepEqual(report.lines, [measured(root, `${planted + 1000 + Buffer.byteLength(target)} bytes`)]);
});

// The bound stops the enumeration, not only the measuring: a directory's entries are read one at a time, and no more
// are read once the walk is past it.
test('a directory over the walk\'s bound is not enumerated past it', t => {
  const home = scratchHome(t);
  const {root} = plantRetiredRelease(home);
  mkdirSync(join(root, 'many'));
  for (let i = 0; i < 300; i++) writeFileSync(join(root, 'many', `f${i}`), '');
  const read = Dir.prototype.readSync;
  let reads = 0;
  Dir.prototype.readSync = function (...args) { reads++; return read.apply(this, args); };
  let report;
  try { report = retiredTrees({home, maxEntries: 20}); } finally { Dir.prototype.readSync = read; }
  assert.equal(report.trees[0].bytes, null);
  // the 21st entry stops it; the other reads are the end of the few directories walked before 'many'
  assert.ok(reads > 0 && reads <= 30, `entries read one at a time: ${reads}, of more than 300`);
  assert.match(report.lines[0], /its size could not be measured \(too_many_entries\)/);
});

test('a walk past its bound, or one that fails, says its size could not be measured and still names the release', t => {
  const home = scratchHome(t);
  const {root} = plantRetiredRelease(home);
  const bounded = retiredTrees({home, maxEntries: 3});
  assert.equal(bounded.trees[0].bytes, null);
  assert.deepEqual(bounded.lines, [sentence(root, 'its size could not be measured (too_many_entries); a cua install recorded placing it on 2026-10-28')]);
  if (process.getuid?.() === 0) return;   // root reads any directory
  chmodSync(join(root, 'cua_node', 'lib'), 0o000);
  try {
    const failed = retiredTrees({home});
    assert.equal(failed.trees[0].bytes, null);
    assert.equal(failed.trees[0].release, RETIRED.x64.release);
    assert.deepEqual(failed.lines, [sentence(root, 'its size could not be measured (EACCES); a cua install recorded placing it on 2026-10-28')]);
  } finally { chmodSync(join(root, 'cua_node', 'lib'), 0o755); }
});

test('what the module does, under the recorder: lstat of runtimes/ and the two names; inside a release, lstat, readdir and one open of install.json; nothing written, renamed, removed or run', t => {
  const home = scratchHome(t);
  const {root} = plantRetiredRelease(home);
  writeFileSync(join(home, 'runtimes', 'added-file'), 'a file of the person\'s');
  mkdirSync(join(home, 'runtimes', 'added-dir'));
  const before = snapshot(join(home, 'runtimes'));
  const seen = recorded(() => retiredTrees({home}));
  const runtimes = join(home, 'runtimes');
  const there = under(seen, runtimes);
  const calls = new Set(seen.map(({call}) => call));
  // readSync is addressed by the descriptor the one open gave (the recorder notes its buffer, not a path)
  assert.deepEqual([...calls].filter(call => !['lstatSync', 'opendirSync', 'openSync', 'readSync', 'realpathSync'].includes(call)), [], 'no other kind of call');
  assert.deepEqual(seen.filter(({call}) => call === 'realpathSync').map(({path}) => path), [home], 'the home resolved, nothing else');
  const inside = ({call, path}) => within(path, root) && !(path === root && call === 'lstatSync');
  const atTop = there.filter(entry => !inside(entry)).map(({call, path}) => `${call} ${relative(home, path)}`);
  assert.deepEqual(atTop, ['lstatSync runtimes', `lstatSync runtimes/${RETIRED.x64.release}`, `lstatSync runtimes/${RETIRED.arm64.release}`], 'runtimes/ and the two names, by lstat');
  assert.deepEqual([...new Set(there.filter(inside).map(({call}) => call))].sort(), ['lstatSync', 'openSync', 'opendirSync'].sort(), 'inside the release');
  const opened = there.filter(({call}) => call === 'openSync');
  assert.deepEqual(opened.map(({path}) => path), [join(root, 'install.json')], 'one open, of install.json');
  assert.ok(there.some(({call}) => call === 'opendirSync'), 'the walk reads the release');
  assert.ok(!there.some(({path}) => path.includes('added-')), 'the added entries are touched by nothing');
  assert.deepEqual(snapshot(join(home, 'runtimes')), before);
});

test('the module\'s two archives are the provenance records\' and provenance.json\'s', () => {
  // T4 moves the records to runtime/provenance/; until then they are runtime/releases/'s.
  const recordOf = release => [join(REPO, 'runtime', 'provenance', `${release}.json`), join(REPO, 'runtime', 'releases', `${release}.json`)].find(existsSync);
  const {vendor} = JSON.parse(readFileSync(join(REPO, 'runtime', 'modules', 'provenance.json'), 'utf8'));
  assert.deepEqual(Object.keys(RETIRED_RELEASES).sort(), vendor.map(v => v.release).sort());
  for (const [release, {sha256: hash, length}] of Object.entries(RETIRED_RELEASES)) {
    const record = JSON.parse(readFileSync(recordOf(release), 'utf8'));
    assert.deepEqual({release: record.release, sha256: record.archive.sha256, length: record.archive.length}, {release, sha256: hash, length});
    assert.equal(vendor.find(v => v.release === release).archiveSha256, hash);
    assert.ok(!JSON.stringify(RETIRED_RELEASES[release]).includes('http'), 'no URL');
  }
});

// ---- install and doctor ----

const down = what => async () => { throw new CuaError('download_failed', `could not fetch ${what}: ENOTFOUND`); };
async function install(home, values = {}) {
  const said = [];
  const result = await installLinux({values, home, env: {HOME: home}, host: LINUX, say: line => said.push(line),
    installModules: down('modules'), installHelper: down('helper'), installNode: down('node'), installEngine: down('engine'),
    resolveOwnNode: () => process.execPath, linuxHelper: () => { throw new CuaError('sandbox_unavailable', 'no helper'); }});
  return {said, report: result.report};
}

test('cua install names a recorded release after the engine\'s line and reports it as `retired`, which sets no `changed`; an empty home reports none', async t => {
  const home = scratchHome(t);
  const {root, bytes} = plantRetiredRelease(home);
  const before = snapshot(root);
  const {said, report} = await install(home);
  const line = measured(root, `${bytes} bytes`);
  const engineLine = said.findIndex(l => l.startsWith('cua\'s Linux engine was not installed'));
  assert.equal(said[engineLine + 1], line, said.join('\n'));
  assert.equal(said.filter(l => l === line).length, 1);
  assert.deepEqual(report.retired, [{release: RETIRED.x64.release, path: root, bytes, installedAt: INSTALLED_AT, source: 'download'}]);
  assert.equal(report.changed, false);
  assert.deepEqual(snapshot(root), before);

  const empty = scratchHome(t);
  const bare = await install(empty);
  assert.deepEqual(bare.report.retired, []);
  assert.ok(!bare.said.some(l => /vendor's release/.test(l)), bare.said.join('\n'));
  assert.equal(existsSync(join(empty, 'runtimes')), false, 'no runtimes/ made');
});

const doctor = (home, over = {}) => inspectRuntime({home, env: {DISPLAY: ':9', HOME: home}, host: LINUX, verifySignatures: () => assert.fail('codesign'),
  inspectHelper: () => assert.fail('the native socket helper'), inspectSecrets: async () => ({dir: '/nowhere', exists: false}),
  inspectLinux: async () => [], inspectChrome: async () => [], inspectAgent: async () => [], readLinuxCapabilities: async () => null, ...over});

test('doctor\'s runtime.retired row: present only for a recorded release, `skip` with the sentence, after runtime.leftovers; report.retired lists it', async t => {
  const home = scratchHome(t);
  const {root, bytes} = plantRetiredRelease(home);
  const report = await doctor(home);
  const names = report.checks.map(c => c.name);
  const row = report.checks.find(c => c.name === 'runtime.retired');
  assert.deepEqual(row, {name: 'runtime.retired', status: 'skip', detail: measured(root, `${bytes} bytes`)});
  assert.equal(names.indexOf('runtime.retired'), names.indexOf('runtime.leftovers') + 1);
  assert.deepEqual(report.retired, [{release: RETIRED.x64.release, path: root, bytes, installedAt: INSTALLED_AT, source: 'download'}]);

  for (const record of [null, retiredRecord('x64', {schema: 2})]) {
    const other = scratchHome(t);
    plantRetiredRelease(other, {record});
    const plain = await doctor(other);
    assert.equal(plain.checks.find(c => c.name === 'runtime.retired'), undefined);
    assert.deepEqual(plain.retired, []);
  }
});
