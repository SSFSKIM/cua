// The native engine's part of the baseline harness (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 1 and its opening paragraph): the lanes --host and --engine may form, the approved engine a
// run must serve (read on the device under the serve's own HOME, its build equal to the checkout's), the engine
// attestation every js result carries, the helper attestation over both engines' processes, and the engine's launch
// failure told apart from a timing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {approvedEngineFacts, assertEngineOptions, attestedBuild, attestEngine, checkApprovedEngine, engineProblem, launchFailureOf} from '../../scripts/native-baseline/engine.mjs';
import {nativeEnvironment} from '../../scripts/native-baseline/remote.mjs';

const BUILD = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const BUNDLE = '/Users/someone/Library/Application Support/cua/engine/cua Engine.app';
const REPO = fileURLToPath(new URL('../../', import.meta.url));

test('--engine and --approved-engine are a macOS computer run\'s, required there, and form only the three lanes', () => {
  const mac = {platform: 'darwin', surface: 'computer', approvedEngine: BUNDLE};
  for (const lane of [{host: 'vendor', engine: 'vendor'}, {host: 'vendor', engine: 'cua'}, {host: 'cua', engine: 'cua'}]) assertEngineOptions({...mac, ...lane});
  assert.throws(() => assertEngineOptions({...mac, host: 'cua', engine: 'vendor'}), /--host cua --engine vendor.*accepts only the vendor host/);
  assert.throws(() => assertEngineOptions({...mac, host: 'vendor'}), /needs --engine vendor\|cua/);
  assert.throws(() => assertEngineOptions({...mac, host: 'vendor', engine: 'sky'}), /needs --engine vendor\|cua/);
  assert.throws(() => assertEngineOptions({...mac, host: 'vendor', engine: 'cua', approvedEngine: undefined}), /needs --approved-engine.*never build/);
  assert.throws(() => assertEngineOptions({...mac, host: 'vendor', engine: 'cua', approvedEngine: 'cua Engine.app'}), /absolute path/);
  assertEngineOptions({platform: 'linux', surface: 'computer', host: 'cua'});
  assertEngineOptions({platform: 'darwin', surface: 'browser', host: 'cua'});
  assert.throws(() => assertEngineOptions({platform: 'linux', surface: 'computer', host: 'cua', engine: 'cua'}), /macOS native engine; a linux computer run has none/);
  assert.throws(() => assertEngineOptions({platform: 'darwin', surface: 'browser', host: 'cua', approvedEngine: BUNDLE}), /a darwin browser run has none/);
});

const facts = (extra = {}) => ({checkoutBuild: BUILD, installed: {bundlePath: BUNDLE, engineVersion: '0.1.0', build: BUILD}, installedReal: BUNDLE, approvedEngineReal: BUNDLE, approvedRecordBuild: BUILD, bundleBuild: BUILD, home: '/Users/someone', ...extra});

test('a run serves the approved engine only when it is the one named and its build is the checkout\'s', () => {
  assert.deepEqual(checkApprovedEngine(facts(), BUNDLE), {approved: {bundlePath: BUNDLE, engineVersion: '0.1.0', build: BUILD}, checkoutBuild: BUILD});
  assert.throws(() => checkApprovedEngine(facts({checkoutBuild: OTHER}), BUNDLE), /the checkout's engine build bbbbbbbbbbbb is not the approved build aaaaaaaaaaaa.*harnesses never build/);
  assert.throws(() => checkApprovedEngine(facts({approvedEngineReal: '/elsewhere/cua Engine.app'}), '/elsewhere/cua Engine.app'), /--approved-engine \/elsewhere\/cua Engine\.app is not the approved engine the serve resolves/);
  assert.throws(() => checkApprovedEngine(facts({approvedEngineReal: null}), BUNDLE.replace('cua/', 'gone/')), /is not the approved engine the serve resolves/);
  // Not installed: the reason is named (pending, unapproved, absent).
  assert.throws(() => checkApprovedEngine(facts({installed: null, installedReal: null, approvedRecordBuild: BUILD, bundleBuild: OTHER}), BUNDLE), /no approved engine.*bundle's build bbbbbbbbbbbb is pending: approved\.json names aaaaaaaaaaaa/);
  assert.throws(() => checkApprovedEngine(facts({installed: null, installedReal: null, approvedRecordBuild: null}), BUNDLE), /no approved engine.*no approved\.json/);
  assert.throws(() => checkApprovedEngine(facts({installed: null, installedReal: null, bundleBuild: null, approvedRecordBuild: null}), BUNDLE), /no approved engine.*no engine bundle/);
  assert.throws(() => checkApprovedEngine(facts({installed: null, installedReal: null}), BUNDLE), /no approved engine.*signature is not approved\.json's/);
  assert.throws(() => checkApprovedEngine({error: 'boom'}, BUNDLE), /could not read the approved engine.*boom/);
  assert.throws(() => checkApprovedEngine(undefined, BUNDLE), /could not read the approved engine/);
});

test('the engine attestation of each js result is collected: distinct values, and results without one counted', () => {
  const record = {requested: 'cua', attested: [], unattested: 0};
  const a = {engine: 'cua', version: '0.1.0', build: BUILD};
  attestEngine(record, {_meta: {'cua/nativeEngine': a}});
  attestEngine(record, {_meta: {'cua/nativeEngine': {...a}, other: 1}});
  attestEngine(record, {_meta: {}});
  attestEngine(record, {});
  attestEngine(record, {_meta: {'cua/nativeEngine': {...a, build: OTHER, extra: 'kept out'}}});
  assert.deepEqual(record, {requested: 'cua', attested: [a, {...a, build: OTHER}], unattested: 2});
  attestEngine(null, {_meta: {'cua/nativeEngine': a}});   // a run with no engine record collects nothing
});

const helper = (kind, origin, startedDuringRun = true) => ({kind, origin, startedDuringRun, path: kind === 'cua' ? '~/Library/Application Support/cua/engine/cua Engine.app/Contents/MacOS/cua-engine' : '~/home/runtimes/r/SkyComputerUseService', ageSeconds: 3});
const engineMeta = (requested, extra = {}) => ({
  runtime: {release: '26.928.40906-darwin-arm64'},
  nativeEngine: {requested, approved: {bundlePath: BUNDLE, engineVersion: '0.1.0', build: BUILD}, checkoutBuild: BUILD, unattested: 0,
    attested: [requested === 'cua' ? {engine: 'cua', version: '0.1.0', build: BUILD} : {engine: 'vendor', version: '26.924.1001281', build: '26.928.40906-darwin-arm64'}]},
  service: {surface: 'computer', helpers: [requested === 'cua' ? helper('cua', 'approved engine') : helper('vendor', 'pinned runtime')]},
  ...extra,
});

test('an engine attestation is sound only when one value answered every result, the requested engine, from the approved build', () => {
  assert.equal(engineProblem(engineMeta('cua'), 'run-1'), null);
  assert.equal(engineProblem(engineMeta('vendor'), 'run-1'), null);
  assert.equal(engineProblem({runtime: {}}, 'run-1'), null, 'a run recorded before engine attestation (or with no native engine) has nothing to judge');
  const cua = engineMeta('cua');
  const with_ = patch => ({...cua, nativeEngine: {...cua.nativeEngine, ...patch}});
  assert.match(engineProblem(with_({unattested: 2}), 'run-1'), /run-1: 2 js results carry no cua\/nativeEngine attestation/);
  assert.match(engineProblem(with_({attested: []}), 'run-1'), /run-1: 0 distinct engine attestations/);
  assert.match(engineProblem(with_({attested: [cua.nativeEngine.attested[0], {engine: 'cua', version: '0.1.0', build: OTHER}]}), 'run-1'), /2 distinct engine attestations/);
  assert.match(engineProblem(with_({attested: [{engine: 'vendor', version: 'x', build: 'y'}]}), 'run-1'), /the vendor engine answered, not the requested cua/);
  assert.match(engineProblem(with_({attested: [{engine: 'cua', version: '0.1.0', build: OTHER}]}), 'run-1'), /attested build bbbbbbbbbbbb is not the checkout's and approved build aaaaaaaaaaaa/);
  assert.match(engineProblem(with_({attested: [{engine: 'cua', version: '0.2.0', build: BUILD}]}), 'run-1'), /attested version 0\.2\.0 is not the approved engine's 0\.1\.0/);
  assert.match(engineProblem(with_({checkoutBuild: OTHER}), 'run-1'), /checkout's build bbbbbbbbbbbb is not the approved build aaaaaaaaaaaa/);
  const vendor = engineMeta('vendor');
  assert.match(engineProblem({...vendor, runtime: {release: 'other'}}, 'run-1'), /attests the runtime 26\.928\.40906-darwin-arm64, not the run's other/);
});

test('the helper attestation classifies both engines\' processes: the requested one started by the run, the other one not', () => {
  const cua = engineMeta('cua');
  const helpers = list => ({...cua, service: {...cua.service, helpers: list}});
  assert.equal(engineProblem(helpers([helper('cua', 'approved engine'), helper('vendor', 'another installation')]), 'r'), null, 'another installation\'s vendor helper (the ChatGPT app\'s own) is not the run\'s');
  assert.match(engineProblem(helpers([]), 'r'), /r: no approved engine process \(cua-engine\) started during the run/);
  assert.match(engineProblem(helpers([helper('cua', 'approved engine', false)]), 'r'), /no approved engine process \(cua-engine\) started during the run/);
  assert.match(engineProblem(helpers([helper('cua', 'another engine copy')]), 'r'), /no approved engine process/);
  assert.match(engineProblem(helpers([helper('cua', 'approved engine'), helper('vendor', 'pinned runtime')]), 'r'), /the pinned runtime's helper \(SkyComputerUseService\) started during a cua-engine run/);
  assert.equal(engineProblem(helpers([helper('cua', 'approved engine'), helper('vendor', 'pinned runtime', false)]), 'r'), null);
  const vendor = engineMeta('vendor');
  assert.match(engineProblem({...vendor, service: {helpers: [helper('vendor', 'pinned runtime'), helper('cua', 'approved engine')]}}, 'r'), /the approved engine's process \(cua-engine\) started during a vendor-engine run/);
  assert.match(engineProblem({...vendor, service: undefined}, 'r'), /records no helper attestation/);
});

test('a launch failure of cua\'s engine is told apart from any other failure of a cell', () => {
  const failure = text => ({cell: {ok: false, error: text}});
  for (const text of [
    'getState inventory errors: Native apps: SkyComputerUseTransportError: cua engine did not start: nothing answered at /x/engine.sock within 5000 ms of launching /x/cua Engine.app.',
    'cua engine launch request failed for /x/cua Engine.app: open failed',
    'cua engine API version mismatch: client=cua-engine-1 server=undefined',
    'cua engine mismatch: the engine answering /x/engine.sock is version 0.1.0 build b, but /x is version 0.1.0 build a',
    'cua engine native pipe is unavailable: the trusted nodeRepl has no nativePipe',
    "cua engine: cannot read the bundle's Info.plist at /x/Contents/Info.plist (ENOENT)",
    "cua engine: the bundle's Info.plist at /x/Contents/Info.plist names no CFBundleShortVersionString or CUAEngineBuild",
  ]) assert.equal(launchFailureOf(failure(text)), text, text);
  assert.equal(launchFailureOf({failure: 'cua engine did not start: nothing answered'}), 'cua engine did not start: nothing answered');
  for (const other of [failure('Computer Use server error -10005: timeoutReached'), failure('Computer Use was not approved to use TextEdit'), {cell: {ok: true, value: {}}}, {failure: 'MCP request timed out'}, {}])
    assert.equal(launchFailureOf(other), null);
});

// The approved engine is looked up under the account's HOME on the device (src/runtime/engine.mjs engineDirectory): the
// harness keeps that HOME for an approved-runtime run (prepare.mjs), and the facts are read in the serve's own
// environment, so the engine they find is the one the serve's selection (src/runtime/launch.mjs nativeEngineFor) resolves.
test('the approved engine the harness reads is the one the serve\'s selection resolves, under the serve\'s own environment', {skip: process.platform !== 'darwin' && 'codesign is macOS-only'}, async t => {
  const {placeFixtureEngine} = await import('../../scripts/probe/fixture-engine.mjs');
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'cua-m1b4-home-')));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const installed = placeFixtureEngine(scratch);
  // The serve's environment as an approved-runtime run builds it: HOME is the account's (here the scratch one).
  const env = nativeEnvironment({home: join(scratch, 'cua-home'), userHome: scratch, configHome: join(scratch, 'config'), host: 'vendor', engine: 'cua', platform: 'darwin'});
  assert.match(env, new RegExp(`HOME='${scratch}' `));
  assert.match(env, /CUA_NATIVE_ENGINE=cua/);
  const script = `
    const {approvedEngineFacts} = await import(${JSON.stringify(join(REPO, 'scripts/native-baseline/engine.mjs'))});
    const {nativeEngineFor} = await import(${JSON.stringify(join(REPO, 'src/runtime/launch.mjs'))});
    const facts = approvedEngineFacts({approvedEngine: ${JSON.stringify(installed.bundlePath)}, checkoutBuild: () => 'checkout'});
    const selected = nativeEngineFor({env: process.env, requestedHost: process.env.CUA_REPL_HOST});
    console.log(JSON.stringify({facts, selected}));`;
  const file = join(scratch, 'probe.mjs');
  writeFileSync(file, script);
  const out = JSON.parse(execFileSync('/bin/sh', ['-c', `exec env ${env} ${JSON.stringify(process.execPath)} ${JSON.stringify(file)}`], {encoding: 'utf8', env: {PATH: process.env.PATH, HOME: '/nonexistent-ambient-home'}}));
  // The fixture is signed ad hoc, and the scratch HOME configures no identity to match: the signature as evidence carries it.
  assert.deepEqual(out.facts.installed, {bundlePath: installed.bundlePath, engineVersion: installed.engineVersion, build: installed.build, signature: {kind: 'adhoc', identityMatches: null}});
  assert.equal(out.facts.installedReal, realpathSync(installed.bundlePath));
  assert.equal(out.facts.approvedEngineReal, realpathSync(installed.bundlePath));
  assert.equal(out.facts.home, scratch);
  assert.equal(out.selected.engine, 'cua');
  assert.deepEqual(out.selected.app, {bundlePath: installed.bundlePath, engineVersion: installed.engineVersion, build: installed.build});
  const {signature: _signature, ...approved} = checkApprovedEngine({...out.facts, checkoutBuild: installed.build}, installed.bundlePath).approved;
  assert.deepEqual(approved, out.selected.app);
});

test('the checkout\'s build is the one src/runtime/engine-bundle.mjs computes', async () => {
  const {engineBuild} = await import('../../src/runtime/engine-bundle.mjs');
  const facts = approvedEngineFacts({approvedEngine: null, installed: () => null, env: {HOME: '/nonexistent'}});
  assert.equal(facts.checkoutBuild, engineBuild());
  assert.equal(facts.installed, null);
  assert.equal(facts.approvedEngineReal, null);
});

// The approved engine's signature is recorded as the spec's pre-flight item 2 allows: its kind and whether it matches the
// configured identity, never the identity (no name, no hash).
test('the approved engine\'s facts carry its signature as {kind, identityMatches} only', () => {
  const installed = () => ({bundlePath: '/A/cua Engine.app', engineVersion: '0.1.0', build: BUILD});
  const read = approvedEngineFacts({approvedEngine: '/A/cua Engine.app', env: {HOME: '/nowhere'}, installed, checkoutBuild: () => BUILD,
    signatureOf: bundle => (assert.equal(bundle, '/A/cua Engine.app'), {kind: 'identity', identityMatches: true, sha1: 'F'.repeat(40), authority: 'Apple Development: Someone (TEAMID)'})});
  assert.deepEqual(read.installed, {bundlePath: '/A/cua Engine.app', engineVersion: '0.1.0', build: BUILD, signature: {kind: 'identity', identityMatches: true}});
  assert.doesNotMatch(JSON.stringify(read), /FFFFFFFF|Apple Development|TEAMID/);
  const unreadable = approvedEngineFacts({approvedEngine: '/A/cua Engine.app', env: {HOME: '/nowhere'}, installed, checkoutBuild: () => BUILD, signatureOf: () => { throw new Error('codesign failed'); }});
  assert.deepEqual(unreadable.installed.signature, {kind: null, identityMatches: null});
  assert.equal(attestedBuild(BUILD), BUILD.slice(0, 12));
  assert.equal(attestedBuild('26.928.40906-darwin-arm64'), '26.928.40906-darwin-arm64');
});
