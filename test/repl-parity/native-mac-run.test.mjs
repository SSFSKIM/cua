// The native-mac suite's run (scripts/repl-parity/native-mac.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 3, the M2b milestone, the Decision Log's whole-M1b review rule): one lane per run through the
// real facade on the host and engine it names, over the approved runtime and engine, on the four scenes; every text
// leaves the device only after cua's engine checked the scene's state; the engine attestation of every result decides,
// never the selection; the preparation, the scenes and the owner's front app are put back on every path. The device
// and the lane's MCP connection are doubles answering with the goldens' recorded texts; nothing is launched.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MARKER, parseCell} from '../../scripts/native-baseline/cells.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {SCENES, SCENE_IDS} from '../../scripts/repl-parity/scenes-mac.mjs';
import {laneAttestationProblem, nativeMacOps, runNativeMac} from '../../scripts/repl-parity/native-mac.mjs';
import {diffNativeMac, loadNativeMacRun, validateDeclarations, EXPECTED_FILE} from '../../scripts/repl-parity/native-mac-diff.mjs';
import {ACTION, FIXED, PRIME, laneFileName} from './scenarios/native-mac.mjs';
import {laneTexts, sha} from './native-mac-fixtures.mjs';

const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-native-mac-run-'))); scratches.push(dir); return dir; };
const BUILD = 'b'.repeat(64), COMMIT = 'c'.repeat(40), RELEASE = '26.928.40906-darwin-arm64';
const APPROVED_RUNTIME = '/h', APPROVED_ENGINE = '/Users/u/Library/Application Support/cua/engine/cua Engine.app';
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', token: 'secret-token', admission: 'secret-token',
  runtimeReuse: {approvedHome: '/h', release: RELEASE, runtimeRoot: `/h/runtimes/${RELEASE}`}, engineStop: {wasRunning: false}};
const ENGINE_FACTS = {checkoutBuild: BUILD, installed: {bundlePath: APPROVED_ENGINE, engineVersion: '0.1.0', build: BUILD, signature: {kind: 'identity', identityMatches: true}},
  installedReal: APPROVED_ENGINE, approvedEngineReal: APPROVED_ENGINE, approvedRecordBuild: BUILD, bundleBuild: BUILD, home: '/Users/u'};
const ATTEST = {vendor: {engine: 'vendor', version: '1.0.744', build: RELEASE}, cua: {engine: 'cua', version: '0.1.0', build: BUILD}};

// The device: the scenes' CLI, cua's side reads (goldens-device.mjs), preparation, the lane's preflight, the files.
// `teardown(scene, n)` and `down(scene, n)` (the n-th call for the scene) answer a failure: a message the teardown steps
// throw, or the down's answer.
function fakeDevice({verify = () => null, preflight = {}, frontmost = {pid: 321, bundleId: 'com.apple.Terminal'}, teardown = () => null, down = () => null} = {}) {
  const calls = [], files = new Map(), taken = [], discarded = [];
  let pid = 100;
  const ops = {
    goldens(args) {
      calls.push(['goldens', ...args]);
      const [command, scene] = args;
      if (command === 'steps') {
        const failure = args.at(-1) === 'teardown' && teardown(scene, calls.filter(c => c[1] === 'steps' && c[2] === scene && c.at(-1) === 'teardown').length);
        if (failure) throw new Error(failure);
        return {scene, phase: args.at(-1), steps: []};
      }
      if (command === 'observe' || command === 'verify') {
        const n = calls.filter(c => c[1] === command && c[2] === scene).length;
        return verify(scene, n, command) ?? {scene, build: BUILD, skyshot: {nodes: []}, timings: null, frame: null, problems: []};
      }
      throw new Error(`unexpected goldens ${command}`);
    },
    scenes(args) {
      calls.push(['scenes', ...args]);
      const [command, scene] = args;
      if (command === 'frontmost') return frontmost;
      if (command === 'place-chrome') return {appPath: '/c/Chrome for Testing.app', version: '155.0.0.0', reused: true};
      if (command === 'build-electron') return {appPath: '/f/cua Electron Fixture.app', electronVersion: '44.9.0', sourceHash: 'abc', reused: true};
      if (command === 'preflight') return {refusals: []};
      if (command === 'up') return {scene, app: `/Apps/${scene}.app`, bundleId: SCENES[scene].bundleId, pid: pid++, window: {number: 7}, setup: []};
      if (command === 'activate') return {scene, ok: true};
      if (command === 'down') return down(scene, calls.filter(c => c[1] === 'down' && c[2] === scene).length) ?? {scene, down: true};
      if (command === 'reactivate') return {reactivated: true, inFront: true};
      throw new Error(`unexpected scenes ${command}`);
    },
    prepare: home => { calls.push(['prepare', home]); return PREPARED; },
    cleanup: prepared => { calls.push(['cleanup', prepared.home]); return {removed: true, engineStop: {wasRunning: true}}; },
    preflight: (prepared, lane) => { calls.push(['preflight', lane.host, lane.engine, lane.approvedEngine]); return {commit: COMMIT, dirty: false, checkout: '/Users/u/Developer/GitHub/cua-parity', home: '/h', release: RELEASE,
      runtimeRoot: `/h/runtimes/${RELEASE}`, serves: 0, hardware: {model: 'Mac14,12'}, os: {name: 'macOS', version: '27.0'}, display: {scale: 2}, engine: ENGINE_FACTS, ...preflight}; },
    home: () => '/Users/u',
    take: path => { taken.push(path); const text = files.get(path); files.delete(path); return text; },
    discard: path => { discarded.push(path); files.delete(path); },
    serveSpec: lane => { calls.push(['serve', lane.host, lane.engine]); return {command: 'ssh', args: ['mini', 'serve']}; },
  };
  return {ops, calls, files, taken, discarded};
}

// The lane's MCP connection: each cell answered by its tag, the texts written into the device's files; every result
// carries `attest` (the lane's engine by default; a function of the cell count to change it mid-run).
function fakeLane(device, {engine, host = engine, texts = laneTexts(engine), attest = () => ATTEST[engine], fail = () => null} = {}) {
  const cells = [], elicitations = [];
  let handlers, closed = false;
  const answer = (value, n) => ({content: [{type: 'text', text: `${MARKER}${JSON.stringify(value)}`}], _meta: {...(attest(n) ? {'cua/nativeEngine': attest(n)} : {}), ...(host === 'cua' ? {'cua/replHost': {host: 'cua', version: '1'}} : {})}});
  const file = (scene, kind) => {
    const path = `/s/tmp/${laneFileName(scene, kind)}`, text = texts[scene][kind];
    device.files.set(path, text);
    return {kind, path, bytes: Buffer.byteLength(text), sha256: sha(text)};
  };
  const client = {
    async initialize() { return {serverInfo: host === 'cua' ? {name: 'cua-repl-host', version: '1'} : {name: 'node_repl', version: RELEASE}}; },
    async request(method, params) {
      if (method === 'tools/list') return {tools: []};
      const code = params.arguments.code, n = cells.length;
      const [, kind, scene] = /\/\* (?:goldens|native-mac):(\w+) (\w+) \*\//.exec(code) ?? [];
      cells.push(kind ? `${kind} ${scene}` : 'first');
      const failed = kind && fail(kind, scene);
      if (failed) return answer({ok: false, error: failed, inCellMs: 1}, n);
      if (kind === 'bind') elicitations.push(await handlers.answer({method: 'elicitation/create', params: {_meta: {connector_id: 'computer-use', tool_params: {app: SCENES[scene].bundleId}}}}));
      const value = kind === 'fixed' ? {reads: 2, files: [file(scene, 'full')]}
        : kind === 'action' ? {index: 2, files: ['before', 'diff', 'later'].map(k => file(scene, k))}
        : kind === 'bind' ? {bound: true} : kind === 'prime' ? {primed: true} : {ready: true};
      return answer({ok: true, value, inCellMs: 1}, n);
    },
    async call(name) { cells.push(name); return {}; },
    async close() { closed = true; },
  };
  return {connect: (spec, given) => { handlers = given; return client; }, cells, elicitations, get closed() { return closed; }};
}

const runLane = async ({engine, host = engine, device = fakeDevice(), lane, controller = {commit: 'd'.repeat(40), dirty: false}, ...options} = {}) => {
  const out = join(scratch(), engine);
  lane ??= fakeLane(device, {engine, host});
  const code = await runNativeMac({device: 'mini', host, engine, approvedRuntime: APPROVED_RUNTIME, approvedEngine: APPROVED_ENGINE, commit: COMMIT, out, ...options},
    {ops: device.ops, connect: lane.connect, controllerCheckout: () => controller, log: () => {}});
  const meta = fs.existsSync(join(out, 'meta.json')) ? JSON.parse(fs.readFileSync(join(out, 'meta.json'), 'utf8')) : null;
  return {code, out, meta, device, lane};
};

test('a lane through the facade on the four scenes: texts kept only after cua\'s check, in the run layout the diff reads; both lanes diff clean', async () => {
  const vendor = await runLane({engine: 'vendor'});
  assert.equal(vendor.code, 0, vendor.meta.error ?? vendor.meta.problems.join('; '));
  assert.equal(vendor.meta.complete, true);
  assert.deepEqual({engine: vendor.meta.engine, host: vendor.meta.host, suite: vendor.meta.suite, commit: vendor.meta.commit, release: vendor.meta.runtimeRelease}, {engine: 'vendor', host: 'vendor', suite: 'native-mac', commit: COMMIT, release: RELEASE});
  assert.deepEqual(vendor.meta.engineAttestation, {attested: [ATTEST.vendor], unattested: 0});
  assert.equal(vendor.meta.approved.build, BUILD);
  // The serve's lane pins the engine; only the scenes' approvals were accepted.
  assert.deepEqual(vendor.device.calls.find(c => c[0] === 'serve'), ['serve', 'vendor', 'vendor']);
  assert.deepEqual(vendor.lane.elicitations.map(e => e.action), ['accept', 'accept', 'accept', 'accept']);
  // The order on the device: the front app first, the preparation, then per scene the sandwich, the cleanup, the front app back.
  const order = vendor.device.calls.map(c => c.slice(0, 3).join(' '));
  assert.equal(order[0], 'scenes frontmost');
  assert.ok(order.indexOf('prepare /h') < order.indexOf('preflight vendor vendor'));
  const textedit = order.filter(c => / textedit|verify textedit|observe textedit/.test(c));
  assert.deepEqual(textedit, ['scenes up textedit', 'goldens steps textedit', 'scenes activate textedit', 'goldens observe textedit', 'goldens verify textedit', 'scenes activate textedit', 'goldens verify textedit', 'goldens steps textedit', 'scenes down textedit']);
  assert.deepEqual(vendor.lane.cells.slice(0, 5), ['first', 'bind textedit', 'prime textedit', 'fixed textedit', 'action textedit']);
  assert.deepEqual(order.slice(-2), ['cleanup /h', 'scenes reactivate --bundle-id']);
  assert.equal(vendor.device.discarded.length, 0);
  assert.equal(vendor.device.files.size, 0);
  // Nothing of a preparation's token, nor any text, in meta.json; the texts under texts/, each row hashing its file.
  const metaText = fs.readFileSync(join(vendor.out, 'meta.json'), 'utf8');
  assert.doesNotMatch(metaText, /secret-token|Line 01|cua scene document/);
  assert.equal(fs.existsSync(join(vendor.out, 'preparation.json')), false);
  const rows = fs.readFileSync(join(vendor.out, 'results.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.filter(r => r.scene === 'chrome').map(r => r.cell), ['bind', 'fixed', 'action', 'settle']);
  assert.equal(fs.readFileSync(join(vendor.out, 'texts', 'chrome', 'full.txt'), 'utf8'), laneTexts('vendor').chrome.full);
  assert.equal(rows.find(r => r.scene === 'finder' && r.cell === 'settle').settled, true);

  const cua = await runLane({engine: 'cua'});
  assert.equal(cua.code, 0, cua.meta.error ?? cua.meta.problems.join('; '));
  assert.deepEqual(cua.device.calls.find(c => c[0] === 'serve'), ['serve', 'cua', 'cua']);
  const report = diffNativeMac(loadNativeMacRun(vendor.out), loadNativeMacRun(cua.out), {declarations: validateDeclarations(JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8')))});
  assert.equal(report.summary, '0 unexpected differences', JSON.stringify(report.differences));
});

test('every lane writes its settle rows as the matrix\'s settle cell (result.json), the one shape summary reads; a refused lane a refused one', async () => {
  const run = await runLane({engine: 'cua'});
  const result = JSON.parse(fs.readFileSync(join(run.out, 'result.json'), 'utf8'));
  assert.deepEqual(validateCellResult(result), []);
  assert.deepEqual([result.cell, result.verdict, result.complete], ['settle', 'pass', true]);
  assert.deepEqual(result.rows.map(r => [r.id, r.engine, r.ok]), SCENE_IDS.map(scene => [`${scene}/settle`, 'cua', true]));
  assert.deepEqual(result.lanes, [{host: 'cua', engine: 'cua', build: BUILD, version: '0.1.0'}]);
  const refused = await runLane({engine: 'cua', controller: {commit: 'd'.repeat(40), dirty: true}});
  assert.equal(refused.code, 2);
  assert.equal(JSON.parse(fs.readFileSync(join(refused.out, 'result.json'), 'utf8')).verdict, 'refused');
});

test('comparison A\'s lane: cua\'s service in the vendor host is judged by the attestation, cua\'s engine at the approved build', async () => {
  const run = await runLane({engine: 'cua', host: 'vendor'});
  assert.equal(run.code, 0, run.meta.error);
  assert.deepEqual(run.meta.hostAttestation.host, 'vendor');
  assert.deepEqual(run.meta.engineAttestation.attested, [ATTEST.cua]);
});

test('refused on the attestation, never on the selection: the first result names another engine and nothing is brought up', async () => {
  const device = fakeDevice();
  const lane = fakeLane(device, {engine: 'vendor', attest: () => ATTEST.cua});
  const run = await runLane({engine: 'vendor', device, lane});
  assert.equal(run.code, 1);
  assert.match(run.meta.error, /the cua engine answered, not the requested vendor/);
  assert.equal(run.device.calls.some(c => c[1] === 'up'), false);
  assert.deepEqual(run.device.calls.slice(-2).map(c => c[0]), ['cleanup', 'scenes']);
  assert.equal(lane.closed, true);
  // A result without the attestation, or a cua engine at another build, is refused as well.
  assert.match(laneAttestationProblem({attested: [], unattested: 1}, {engine: 'cua'}), /no cua\/nativeEngine attestation/);
  assert.match(laneAttestationProblem({attested: [{...ATTEST.cua, build: 'e'.repeat(64)}], unattested: 0}, {engine: 'cua', approved: {engineVersion: '0.1.0'}, checkoutBuild: BUILD}), /not the checkout's and approved build/);
  assert.match(laneAttestationProblem({attested: [{...ATTEST.vendor, build: '26.1.0'}], unattested: 0}, {engine: 'vendor', release: RELEASE}), /not the run's/);
  assert.equal(laneAttestationProblem({attested: [ATTEST.vendor], unattested: 0}, {engine: 'vendor', release: RELEASE}), null);
});

test('an engine that changes mid-run stops the run at that result, incomplete, with the scenes put back', async () => {
  const device = fakeDevice();
  const lane = fakeLane(device, {engine: 'cua', attest: n => (n > 6 ? {...ATTEST.cua, build: 'e'.repeat(64)} : ATTEST.cua)});
  const run = await runLane({engine: 'cua', device, lane});
  assert.equal(run.code, 1);
  assert.match(run.meta.error, /2 distinct engine attestations/);
  assert.equal(run.meta.complete, false);
  assert.equal(lane.cells.includes('action finder'), false, 'nothing more is sent once an attestation changed');
  const ups = run.device.calls.filter(c => c[1] === 'up').map(c => c[2]), downs = run.device.calls.filter(c => c[1] === 'down').map(c => c[2]);
  assert.deepEqual(downs, ups);
});

test('a scene that would not come down: its down is tried whatever its teardown answered, once more at the end, and a scene still up keeps the approved home held', async () => {
  // A transient failure: Finder's teardown steps stop once, so its down refuses (the run's window still open); the final
  // recovery brings it down and the run ends as usual.
  const transient = await runLane({engine: 'vendor', device: fakeDevice({
    teardown: (scene, n) => (scene === 'finder' && n === 1 ? 'the key guard found another window in front' : null),
    down: (scene, n) => (scene === 'finder' && n === 1 ? {scene, down: false, windowOpen: true, reason: 'the run\'s Finder window is still open'} : null)})});
  assert.equal(transient.code, 0, transient.meta.error ?? transient.meta.problems.join('; '));
  assert.deepEqual(transient.meta.scenes.finder.takeDown, {attempts: 2, failures: ['its teardown steps stopped: the key guard found another window in front', 'the run\'s Finder window is still open'], down: true});
  const order = transient.device.calls.map(c => c.slice(0, 3).join(' '));
  assert.deepEqual(order.filter(c => c.startsWith('scenes down')), ['scenes down textedit', 'scenes down finder', 'scenes down chrome', 'scenes down electron', 'scenes down finder']);
  assert.ok(order.lastIndexOf('scenes down finder') < order.indexOf('cleanup /h'), 'the recovery comes before the approved home is given back');
  assert.equal(fs.existsSync(join(transient.out, 'preparation.json')), false);

  // Teardown steps that fail do not keep a scene's processes up: its down is still sent, and answers.
  const stepsOnly = await runLane({engine: 'vendor', device: fakeDevice({teardown: scene => (scene === 'chrome' ? 'the steps stopped' : null)})});
  assert.equal(stepsOnly.code, 0);
  assert.deepEqual(stepsOnly.meta.scenes.chrome.takeDown, {attempts: 1, failures: ['its teardown steps stopped: the steps stopped'], down: true});

  // A scene still up after the recovery: the run is incomplete, the approved home stays held and preparation.json stays,
  // the input of goldens.mjs cleanup; the lane is closed and the owner's front app put back all the same.
  const stuck = await runLane({engine: 'vendor', device: fakeDevice({down: scene => (scene === 'textedit' ? {scene, down: false, reason: 'TextEdit 101 still running'} : null)})});
  assert.equal(stuck.code, 1);
  assert.deepEqual(stuck.meta.problems, ['textedit: could not be brought down (TextEdit 101 still running)']);
  assert.equal(stuck.meta.scenes.textedit.takeDown.attempts, 2);
  assert.equal(stuck.device.calls.some(c => c[0] === 'cleanup'), false);
  assert.match(stuck.meta.preparationCleanup.deferred, /textedit/);
  const journal = JSON.parse(fs.readFileSync(join(stuck.out, 'preparation.json'), 'utf8'));
  assert.deepEqual([journal.device, journal.prepared.home, journal.frontmost.bundleId], ['mini', '/h', 'com.apple.Terminal']);
  assert.equal(stuck.lane.closed, true);
  assert.deepEqual(stuck.device.calls.at(-1).slice(0, 2), ['scenes', 'reactivate']);
});

test('an engine that will not stop when the run ends: the run is incomplete and its journal stays, the home recorded as given back', async () => {
  const device = fakeDevice();
  device.ops.cleanup = prepared => { device.calls.push(['cleanup', prepared.home]); return {removed: true, engineStop: {error: 'busy: connections 1'}}; };
  const run = await runLane({engine: 'vendor', device});
  assert.equal(run.code, 1);
  assert.match(run.meta.error, /did not stop when the run ended: busy/);
  const journal = JSON.parse(fs.readFileSync(join(run.out, 'preparation.json'), 'utf8'));
  assert.deepEqual([journal.device, journal.prepared.home, journal.preparationCleaned], ['mini', '/h', true]);
});

test('a scene whose up failed part way is still brought down', async () => {
  const device = fakeDevice();
  const scenes = device.ops.scenes;
  device.ops.scenes = args => { if (args[0] === 'up' && args[1] === 'chrome') { device.calls.push(['scenes', ...args]); throw new Error('the scene page did not start within 10000 ms'); } return scenes(args); };
  const run = await runLane({engine: 'vendor', device});
  assert.equal(run.code, 1);
  assert.ok(run.device.calls.some(c => c[1] === 'down' && c[2] === 'chrome'));
  assert.equal(run.meta.scenes.chrome.takeDown.down, true);
  assert.equal(fs.existsSync(join(run.out, 'preparation.json')), false);
});

test('refusals before any scene: the approved engine is not the checkout\'s build, the harness checkout is elsewhere, the controller is dirty', async () => {
  const notBuilt = await runLane({engine: 'cua', device: fakeDevice({preflight: {engine: {...ENGINE_FACTS, checkoutBuild: 'e'.repeat(64)}}})});
  assert.equal(notBuilt.code, 1);
  assert.match(notBuilt.meta.error, /not the approved build/);
  assert.equal(notBuilt.device.calls.some(c => c[0] === 'serve'), false);
  assert.ok(notBuilt.device.calls.some(c => c[0] === 'cleanup'), 'the preparation is undone');
  const elsewhere = await runLane({engine: 'vendor', device: fakeDevice({preflight: {commit: 'e'.repeat(40)}})});
  assert.match(elsewhere.meta.error, /harness checkout is at e{40}/);
  const otherEngine = await runLane({engine: 'vendor', device: fakeDevice({preflight: {engine: {...ENGINE_FACTS, approvedEngineReal: '/elsewhere.app'}}})});
  assert.match(otherEngine.meta.error, /is not the approved engine the serve resolves/);
  const dirty = await runLane({engine: 'vendor', controller: {commit: 'd'.repeat(40), dirty: true}});
  assert.equal(dirty.code, 2);
  assert.match(dirty.meta.refused.join(' '), /uncommitted changes/);
  assert.equal(dirty.device.calls.length, 0);
});

test('a text whose state cua\'s check refuses is removed unread: the fixed text is taken again, the action\'s texts end the scene', async () => {
  const device = fakeDevice({verify: (scene, n, command) => (scene === 'chrome' && command === 'verify' && n === 1 ? {scene, build: BUILD, skyshot: null, problems: [{code: 'page_filling', message: 'filling'}]} : null)});
  const run = await runLane({engine: 'vendor', device});
  assert.equal(run.code, 0, run.meta.error);
  assert.deepEqual(device.discarded, [`/s/tmp/${laneFileName('chrome', 'full')}`]);
  assert.equal(run.meta.scenes.chrome.fixedAttempts, 2);
  assert.equal(device.taken.includes(`/s/tmp/${laneFileName('chrome', 'full')}`), true);

  const after = fakeDevice({verify: (scene, n, command) => (scene === 'finder' && command === 'verify' && n === 2 ? {scene, build: BUILD, skyshot: null, problems: [{code: 'other_window', message: 'not the run\'s window'}]} : null)});
  const stopped = await runLane({engine: 'vendor', device: after});
  assert.equal(stopped.code, 1);
  assert.match(stopped.meta.problems.join(' '), /finder: the state after the action is not the scene's \(other_window/);
  assert.deepEqual(after.discarded.sort(), ['before', 'diff', 'later'].map(k => `/s/tmp/${laneFileName('finder', k)}`).sort());
  assert.equal(after.taken.some(p => p.includes('finder.before')), false);
  assert.equal(fs.existsSync(join(stopped.out, 'texts', 'finder', 'before.txt')), false);
  assert.equal(after.calls.filter(c => c[1] === 'down').length, 4, 'every scene is brought down');
});

test('a lane cell that fails is the lane\'s outcome, recorded for the diff; the run stays complete', async () => {
  const device = fakeDevice();
  const lane = fakeLane(device, {engine: 'cua', fail: (kind, scene) => (kind === 'action' && scene === 'electron' ? 'activationFailed: the user\'s app lost frontmost' : null)});
  const run = await runLane({engine: 'cua', device, lane});
  assert.equal(run.code, 0, run.meta.error);
  const rows = fs.readFileSync(join(run.out, 'results.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.scene === 'electron');
  assert.deepEqual(rows.map(r => [r.cell, r.ok]), [['bind', true], ['fixed', true], ['action', false]]);
  assert.match(rows[2].error, /activationFailed/);
});

test('a file a lane cell names outside the session\'s temp directory is never read', async () => {
  const device = fakeDevice();
  const lane = fakeLane(device, {engine: 'vendor'});
  const connect = lane.connect;
  lane.connect = (spec, handlers) => {
    const client = connect(spec, handlers), request = client.request.bind(client);
    client.request = async (method, params) => {
      const result = await request(method, params);
      if (/native-mac:fixed textedit/.test(params?.arguments?.code ?? '')) {
        const cell = parseCell(result.content[0].text);
        cell.value.files[0].path = '/Users/u/Documents/cua-goldens-native-mac-textedit.full.txt';
        result.content[0].text = `${MARKER}${JSON.stringify(cell)}`;
      }
      return result;
    };
    return client;
  };
  const run = await runLane({engine: 'vendor', device, lane});
  assert.equal(run.code, 1);
  assert.match(run.meta.problems.join(' '), /textedit: full was written outside the session's temp directory/);
  assert.equal(device.taken.some(p => p.startsWith('/Users/u/Documents')), false);
});

test('nativeMacOps: the lane\'s preflight and serve name its host and engine over ssh to the harness checkout', () => {
  const commands = [];
  const ops = nativeMacOps('mini', {exec: (command, args) => { commands.push(args.at(-1)); return '{"ok":true}\n'; }});
  ops.preflight(PREPARED, {host: 'vendor', engine: 'cua', approvedEngine: APPROVED_ENGINE});
  assert.match(commands[0], /CUA_REPL_HOST=vendor CUA_NATIVE_ENGINE=cua /);
  assert.match(commands[0], /approvedEngineFacts/);
  const spec = ops.serveSpec({pre: {checkout: '/c', home: '/h'}, prepared: PREPARED, host: 'cua', engine: 'cua', approvedEngine: APPROVED_ENGINE});
  assert.match(spec.args.at(-1), /CUA_REPL_HOST=cua CUA_NATIVE_ENGINE=cua /);
  assert.throws(() => nativeMacOps('cua-gce'), /macOS device/);
});

// The cells themselves, run as the REPL runs them, against a bound app double.
const runCell = async code => { const output = []; await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', 'cua', code)({write: text => output.push(text)}, {}); return parseCell(output.join('\n')); };
async function withTemp(fn) {
  const temp = scratch(), previous = process.env.TMPDIR;
  process.env.TMPDIR = temp;
  try { return await fn(temp); } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; delete globalThis.__apps; }
}

test('FIXED keeps the text once two reads an interval apart are alike; a scene that never holds still or another window writes nothing', async () => {
  await withTemp(async temp => {
    const texts = laneTexts('vendor').textedit;
    const reads = [texts.full.replace('Line 01', 'Line 0'), texts.full, texts.full];
    globalThis.__apps = {textedit: {getAXState: async ({disableDiffing}) => { assert.equal(disableDiffing, true); return reads.shift(); }}};
    const fixed = await runCell(FIXED('textedit', 'cua-scene', {intervalMs: 1, boundMs: 1000}));
    assert.equal(fixed.ok, true, fixed.error);
    assert.equal(fixed.value.reads, 3);
    assert.equal(fs.readFileSync(fixed.value.files[0].path, 'utf8'), texts.full);
    assert.equal(fixed.value.files[0].sha256, sha(texts.full));
    fs.rmSync(fixed.value.files[0].path);
    let n = 0;
    globalThis.__apps.textedit.getAXState = async () => `${texts.full}${n++}`;
    const moving = await runCell(FIXED('textedit', 'cua-scene', {intervalMs: 1, boundMs: 20}));
    assert.equal(moving.ok, false);
    assert.match(moving.error, /did not hold still/);
    globalThis.__apps.textedit.getAXState = async () => 'Window: "Untitled", App: TextEdit.\n0 window';
    assert.match((await runCell(FIXED('textedit', 'cua-scene', {intervalMs: 1, boundMs: 20}))).error, /not the app's front window/);
    assert.deepEqual(fs.readdirSync(temp), []);
    assert.match(PRIME('textedit'), /disableDiffing: true/);
  });
});

test('ACTION clicks the scene\'s target, keeps the diff right after and the observation the settle delay later; another window discards all', async () => {
  await withTemp(async temp => {
    const texts = laneTexts('vendor').electron;
    const clicks = [], observed = [];
    const answers = [texts.before, texts.diff, texts.later];
    globalThis.__apps = {electron: {getAXState: async options => { observed.push(options.disableDiffing === true); return answers.shift(); }, click: async index => { clicks.push(index); }}};
    const action = await runCell(ACTION('electron', 'cua Electron fixture', SCENES.electron.action, {settleMs: 1}));
    assert.equal(action.ok, true, action.error);
    assert.deepEqual(observed, [true, false, false]);
    assert.equal(clicks.length, 1);
    assert.deepEqual(action.value.files.map(f => [f.kind, fs.readFileSync(f.path, 'utf8')]), [['before', texts.before], ['diff', texts.diff], ['later', texts.later]]);
    for (const f of action.value.files) fs.rmSync(f.path);
    answers.push(texts.before, texts.diff, 'Window: "Settings", App: cua Electron Fixture.\n0 window');
    const refused = await runCell(ACTION('electron', 'cua Electron fixture', SCENES.electron.action, {settleMs: 1}));
    assert.equal(refused.ok, false);
    assert.match(refused.error, /not of the scene window/);
    assert.deepEqual(fs.readdirSync(temp), []);
  });
});
