// The vendor debs' provenance records are unreachable by install, doctor and launch (#171 M6b; its pre-flight's §4.3,
// ruling 1193 (a)). The two records that were the vendor's Linux pins live in runtime/provenance/, where only
// scripts/modules-pin.mjs reads them, at pin time. Three layers show nothing else can:
//   1. static: nothing cua serves, installs or diagnoses from names the directory, a deb, or the comparator fixture, and
//      the npm package leaves the directory out; under scripts/, modules-pin.mjs alone names it, and its reader returns
//      no URL, so the directory is never a place to fetch from;
//   2. no pin, and no parser for one: a Linux host has no release pin, and each record, as it is and as it was before
//      the trim, is refused by the pin parser;
//   3. recorded: node:fs, fs.promises and node:child_process wrapped (./helpers/vendor-tree-recorder.mjs) and fetch
//      logged, install, doctor and launch run for a Linux host under no engine setting, `cua` and `vendor`. No path
//      under runtime/provenance/ is touched and no record's URL is asked for. Launch touches nothing under the home's
//      runtimes/; install and doctor touch there only what the vendor tree's report touches alone (§3.4). The negative
//      control is the script's own reader, which the same recorder sees opening both records.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLaunch, replHostFor, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {RELEASES_DIR, loadPins, parsePin, resolveRuntime, selectPin} from '../src/runtime/manifest.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {installLinuxEngine, installSandboxHelper} from '../src/runtime/install.mjs';
import {installLinux} from '../src/runtime/linux-install.mjs';
import {installModuleTree} from '../src/runtime/module-tree.mjs';
import {installNode} from '../src/runtime/node-install.mjs';
import {retiredTrees} from '../src/runtime/retired-tree.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {loadProvenanceRecords} from '../scripts/modules-pin.mjs';
import {scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';
import {RETIRED, plantRetiredRelease} from './fixtures/retired-release.mjs';
import {fakeInstalledEngine, fakeManagedNode, fakeModuleTree, moduleHostOf} from './fixtures/own-linux-runtime.mjs';
import {inVendorTree, startRecording, within} from './helpers/vendor-tree-recorder.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const PROVENANCE = join(REPO, 'runtime', 'provenance');
const RECORD_FILES = ['26.928.40906-linux-arm64.json', '26.928.40906-linux-x64.json'];
const recordJson = name => JSON.parse(fs.readFileSync(join(PROVENANCE, name), 'utf8'));
const RECORD_URLS = RECORD_FILES.map(name => recordJson(name).archive.url);
const LINUX = {platform: 'linux', arch: 'x64'};
const SESSION = '6f1c2d3e-0000-4000-8000-0000000006c4';
const SETTINGS = {'no setting': {}, '`cua`': {CUA_NATIVE_ENGINE: 'cua'}, '`vendor`': {CUA_NATIVE_ENGINE: 'vendor'}};

// ---- 1. static ----

// Every file under `dir`, relative to the repository.
const filesUnder = dir => fs.readdirSync(join(REPO, dir), {recursive: true, withFileTypes: true})
  .filter(entry => entry.isFile()).map(entry => relative(REPO, join(entry.parentPath ?? entry.path, entry.name)));
// The directory, spelled as a path or as join()'s segments.
const NAMES_PROVENANCE = /runtime(?:\/|['"`]\s*,\s*['"`])provenance\b/;
// A vendor deb by its file name (chatgpt_<version>_<arch>.deb) or its pool's path; not the `chatgpt_` codes and fields
// of the ChatGPT route's removal (src/chrome/route.mjs) or the app server's recorded answers.
const NAMES_DEB = /chatgpt_\d|\/linux\/deb\//;
// The comparator fixture's modules, manifest and directories (§4.4).
const NAMES_FIXTURE = /vendor-fixture|vendor-(?:x64|arm64)-pinned|vendor-fixtures/;

test('static: nothing serve, install or doctor reaches names the records\' directory, a vendor deb or the comparator fixture', () => {
  const product = [...filesUnder('src'), ...filesUnder('bin'), 'cua-shim.mjs'];
  assert.ok(product.length > 100 && product.includes('src/runtime/manifest.mjs') && product.includes('bin/cua.mjs'), 'the walk saw the product');
  const hits = product.flatMap(file => {
    const text = fs.readFileSync(join(REPO, file), 'utf8');
    return [[NAMES_PROVENANCE, 'the records\' directory'], [NAMES_DEB, 'a deb'], [NAMES_FIXTURE, 'the comparator fixture']]
      .filter(([pattern]) => pattern.test(text)).map(([, what]) => `${file} names ${what}`);
  });
  assert.deepEqual(hits, []);
  // the patterns find what they look for: the script that reads the records, the fixture's pin tool and the gate
  assert.match(fs.readFileSync(join(REPO, 'scripts/modules-pin.mjs'), 'utf8'), NAMES_PROVENANCE);
  assert.match(fs.readFileSync(join(REPO, 'scripts/linux-engine-gate/gate.mjs'), 'utf8'), NAMES_FIXTURE);
  assert.match(JSON.stringify(recordJson(RECORD_FILES[1])), NAMES_DEB);
});

test('static: the npm package leaves the records out', () => {
  const {files} = JSON.parse(fs.readFileSync(join(REPO, 'package.json'), 'utf8'));
  const covers = entry => { const dir = entry.replace(/\/?\*\*?$/, '').replace(/\/$/, ''); return dir === '' || dir === 'runtime' || dir === 'runtime/provenance' || 'runtime/provenance/'.startsWith(`${dir}/`); };
  assert.ok(files.includes('runtime/releases/'), 'the walk reads the list the package ships');
  assert.deepEqual(files.filter(covers), []);
  assert.deepEqual(files.filter(entry => entry.includes('provenance')), []);
});

test('static: under scripts/ only modules-pin.mjs names the directory, and its reader, the only way to a record, returns no URL', () => {
  const naming = filesUnder('scripts').filter(file => NAMES_PROVENANCE.test(fs.readFileSync(join(REPO, file), 'utf8')));
  assert.deepEqual(naming, ['scripts/modules-pin.mjs']);
  // whoever reads a record does so through the reader, which hands out no URL
  const records = loadProvenanceRecords();
  assert.deepEqual(records.map(record => Object.keys(record).sort()), [['length', 'lockfile', 'release', 'sha256'], ['length', 'lockfile', 'release', 'sha256']]);
  assert.ok(!JSON.stringify(records).includes('https:'), JSON.stringify(records));
  const readers = filesUnder('scripts').filter(file => /\bloadProvenanceRecords\b|\bmatchRecord\b/.test(fs.readFileSync(join(REPO, file), 'utf8')));
  assert.deepEqual(readers.sort(), ['scripts/linux-engine-gate/vendor-fixture-pin.mjs', 'scripts/modules-pin.mjs']);
});

// ---- 2. no pin, and no parser for one ----

// Each record as it was a pin, before the trim (fe09732c8's shape, by the fields the trim dropped).
function asPinBeforeTrim(name) {
  const {lockfile, ...record} = recordJson(name);
  assert.equal(lockfile, 'usr/lib/chatgpt/resources/cua_node/lib/node_modules/.pnpm/lock.yaml');
  return {...record, appVersion: '26.928.40906', components: {cua_node: 'usr/lib/chatgpt/resources/cua_node'},
    runtime: {version: '0.0.27/20260927214556-b77d38801cca', node: '24.21.0-cua.1'},
    layout: {node: 'cua_node/bin/node', nodeRepl: 'cua_node/bin/node_repl', moduleDir: 'cua_node/lib/node_modules', cuaRepl: 'cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs',
      skyLinuxBin: `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${record.arch}`, skyVendorService: 'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js',
      browserVendorService: 'cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs', vendorManifest: 'cua_node/manifest.json'}};
}

test('no pin, and no parser for one: a Linux host has no release pin, and each record, trimmed or as it was, is invalid_pin', () => {
  const pins = loadPins();
  assert.deepEqual(pins.filter(pin => pin.platform === 'linux'), []);
  assert.deepEqual(fs.readdirSync(RELEASES_DIR).filter(name => /linux/.test(name)), [], 'no Linux record is among the pins');
  for (const arch of ['x64', 'arm64']) assert.throws(() => selectPin(pins, {platform: 'linux', arch}), {code: 'unsupported_platform'}, arch);
  for (const name of RECORD_FILES) {
    for (const [shape, json] of [['as it is', recordJson(name)], ['as it was before the trim', asPinBeforeTrim(name)]])
      assert.throws(() => parsePin(json, {file: name}), err => err.code === 'invalid_pin' && /runtime\/linux-runtime\.json/.test(err.message), `${name}, ${shape}`);
  }
});

// ---- 3. recorded ----

// Runs `fn` under the recorder, with globalThis.fetch logging every URL and answering none -> {value, error, seen, urls}.
async function recordedRun(fn) {
  const urls = [];
  const fetch = globalThis.fetch;
  globalThis.fetch = async url => { urls.push(String(url)); return new Response('not served', {status: 404}); };
  const recording = startRecording();
  let value, error, seen;
  try { value = await fn(); } catch (caught) { error = caught; } finally {
    seen = recording.stop();
    globalThis.fetch = fetch;
  }
  return {value, error, seen, urls};
}
const touchesRecords = seen => seen.filter(({path, reached}) => [path, reached].some(p => within(p, PROVENANCE)));
const askedRecords = urls => urls.filter(url => RECORD_URLS.includes(url) || /oaistatic|\/linux\/deb\/|chatgpt_\d/.test(url));
const own = seen => seen.map(({call, path}) => `${call} ${path}`).sort();
// What the vendor tree's report itself touches in `home`, recorded alone: what install's and doctor's are held to.
async function reportsOwn(home) {
  const {seen} = await recordedRun(() => retiredTrees({home}));
  return own(inVendorTree(seen, home));
}

// A home as cua's install leaves it, every part placed, beside the vendor's release an older cua's install recorded.
function wholeHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = fs.realpathSync(s.dir);
  fakeModuleTree(home, LINUX);
  fakeManagedNode(home, LINUX);
  fakeInstalledEngine(home, MIN_ENGINE_VERSION);
  plantRetiredRelease(home);
  fs.writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: RETIRED.x64.release}));
  return {home, user: scratchUserHome(t)};
}
function emptyHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  return {home: fs.realpathSync(s.dir), user: scratchUserHome(t)};
}
function recordedHome(t) {
  const h = emptyHome(t);
  plantRetiredRelease(h.home);
  return h;
}

// Install whole, with the real installers held to a Linux host (the suite also runs on macOS) and fetch the logging one.
const installOf = ({home, user}, setting) => installLinux({values: {}, home, env: {HOME: user, ...setting}, host: LINUX,
  installModules: options => installModuleTree({...options, host: moduleHostOf(LINUX)}),
  installHelper: options => installSandboxHelper({...options, host: LINUX}),
  installNode: options => installNode({...options, host: LINUX}),
  installEngine: options => installLinuxEngine({...options, host: LINUX})});
const doctorOf = ({home, user}, setting) => inspectRuntime({home, env: {HOME: user, DISPLAY: ':9', ...setting}, host: LINUX, verifySignatures: () => assert.fail('codesign'),
  inspectHelper: () => assert.fail('the native socket helper'), inspectSecrets: async () => ({dir: '/nowhere', exists: false}),
  inspectLinux: async () => [], inspectChrome: async () => [], inspectAgent: async () => [], readLinuxCapabilities: async () => null});

test('recorded: install, in an empty home and over a recorded release, under each setting, reads no record and asks for no record\'s URL', async t => {
  for (const [label, setting] of Object.entries(SETTINGS)) {
    for (const [kind, make] of [['an empty home', emptyHome], ['a recorded release', recordedHome]]) {
      const h = make(t);
      const yardstick = await reportsOwn(h.home);
      const {error, seen, urls} = await recordedRun(() => installOf(h, setting));
      const what = `${kind}, ${label}`;
      assert.equal(error, undefined, `${what}: ${error?.stack}`);
      assert.ok(seen.length > 0 && urls.length > 0, `${what}: the recorder saw the install's own reads and fetches`);
      assert.deepEqual(touchesRecords(seen), [], what);
      assert.deepEqual(askedRecords(urls), [], what);
      assert.deepEqual(own(inVendorTree(seen, h.home)), yardstick, `${what}: under runtimes/, only the report's own`);
    }
  }
});

test('recorded: doctor, over a recorded release, under each setting, reads no record and asks for no URL', async t => {
  for (const [label, setting] of Object.entries(SETTINGS)) {
    const h = wholeHome(t);
    const yardstick = await reportsOwn(h.home);
    assert.ok(yardstick.some(entry => entry.startsWith('openSync ')), 'the report names the release');
    const {error, seen, urls} = await recordedRun(() => doctorOf(h, setting));
    assert.equal(error, undefined, `${label}: ${error?.stack}`);
    assert.deepEqual(touchesRecords(seen), [], label);
    assert.deepEqual(urls, [], label);
    assert.deepEqual(own(inVendorTree(seen, h.home)), yardstick, `${label}: under runtimes/, only the report's own`);
  }
});

// A session's open and launch, as a connection makes them (src/mcp/connection.mjs).
function session({home, user}, setting, surfaces) {
  const ambient = {HOME: user, USER: 'u', PATH: '/usr/bin:/bin', DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000', ...setting};
  const runtime = resolveRuntime({home, host: LINUX});
  const replHost = replHostFor({platform: 'linux', arch: LINUX.arch, surfaces, ambient, home});
  const services = Object.assign({}, ...surfaces.map(s => (s === 'computer' ? {sky: SKY_SERVICE} : {browser: BROWSER_SERVICE})));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces, replHost, services, sandbox: 'scoped'});
  assertSandboxFits('scoped', launch);
  return launch;
}

test('recorded: launch, a computer session and a browser-only one, under each setting, reads no record, asks for no URL and touches nothing under runtimes/', async t => {
  for (const [label, setting] of Object.entries(SETTINGS)) {
    for (const surfaces of [['computer'], ['browser']]) {
      const h = wholeHome(t);
      const what = `${surfaces[0]}, ${label}`;
      const {error, seen, urls} = await recordedRun(() => session(h, setting, surfaces));
      if (label === '`vendor`' && surfaces[0] === 'computer') assert.equal(error?.code, 'engine_retired', what);
      else assert.equal(error, undefined, `${what}: ${error?.stack}`);
      assert.ok(seen.some(({path}) => within(path, join(h.home, 'modules'))), `${what}: the recorder saw the open's own reads`);
      assert.deepEqual(touchesRecords(seen), [], what);
      assert.deepEqual(urls, [], what);
      assert.deepEqual(inVendorTree(seen, h.home), [], what);
    }
  }
});

test('the negative control: the script\'s own reader, under the same recorder, is seen opening both records', async () => {
  const {value, error, seen} = await recordedRun(() => loadProvenanceRecords());
  assert.equal(error, undefined);
  assert.equal(value.length, 2);
  const read = touchesRecords(seen).filter(({call}) => call === 'readFileSync').map(({path}) => relative(PROVENANCE, path)).sort();
  assert.deepEqual(read, RECORD_FILES);
});
