// The live goldens recorder's controller (scripts/native-matrix/goldens.mjs, ./goldens-install.mjs, ./goldens-cells.mjs):
// the refusals before anything is prepared, one sitting's recording of both lanes per scene on the same fixed state, the
// vendor's text read only after cua's engine checked the same state, the install into PROVENANCE's layout, and the
// vendor cells themselves. The device and the vendor host are doubles answering with the committed goldens' recorded
// files; nothing is launched, no ssh is run.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {MARKER, parseCell} from '../../scripts/native-baseline/cells.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';
import {ACTION, BIND, FIXED, isSessionFile} from '../../scripts/native-matrix/goldens-cells.mjs';
import {SCENE_ORDER, cleanupRecording, controllerCheckout, deviceOps, main, parseCommand, record, startDiagnostic} from '../../scripts/native-matrix/goldens.mjs';
import {stateDigest} from '../../scripts/native-matrix/goldens-device.mjs';
import {audit, auditClean, rerender} from '../native-goldens/audit.mjs';
import {install} from '../../scripts/native-matrix/goldens-install.mjs';

const GOLDENS = new URL('../native-goldens/', import.meta.url);
const read = (scene, name) => fs.readFileSync(new URL(`${scene}/${name}`, GOLDENS), 'utf8');
const shot = (scene, name) => JSON.parse(read(scene, name));
const sha = text => createHash('sha256').update(text).digest('hex');
const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-goldens-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const BUILD = 'b'.repeat(64);
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', token: 'secret-token', admission: 'secret-token', runtimeReuse: {approvedHome: '/h', release: '26.928.40906-darwin-arm64', runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64'}};

// A device double: the scenes' CLI, the device side of the recorder, preparation and the files the vendor cells wrote.
function fakeDevice({observe = () => null, action = () => null, up = () => null, steps = () => [], preflight = {}, engineProblems = [], approvedBuild = BUILD} = {}) {
  const calls = [], files = new Map(), taken = [], discarded = [];
  const records = {};
  let pid = 100;
  const recordFor = scene => ({scene, app: `/Apps/${scene}.app`, bundleId: SCENES[scene].bundleId, pid: pid++, window: {number: 7, bounds: {x: 1, y: 2, width: 3, height: 4}}, setup: []});
  const ops = {
    goldens(args) {
      calls.push(['goldens', ...args]);
      const [command, scene] = args;
      if (command === 'engine-check') return {ok: !engineProblems.length, engine: {bundlePath: '/e/cua Engine.app', build: approvedBuild, engineVersion: '0.1.0', approvedAt: '2026-10-20T00:00:00Z'}, checkout: {build: approvedBuild, engineVersion: '0.1.0'}, problems: engineProblems};
      if (command === 'engine-stop') return {wasRunning: false};
      if (command === 'steps') return {scene, phase: args.at(-1), steps: steps(scene, args.at(-1))};
      // `observe` (the settled read) and `verify` (the same, guarding captures already written) count as one sequence.
      if (command === 'observe' || command === 'verify') {
        const n = calls.filter(c => (c[1] === 'observe' || c[1] === 'verify') && c[2] === scene).length;
        const given = observe(scene, n, command);
        if (given) return given;
        const skyshot = shot(scene, 'skyshot.json');
        return {scene, build: BUILD, skyshot, timings: {focusRead: null}, frame: skyshot.window.frame, problems: []};
      }
      if (command === 'action') {
        const n = calls.filter(c => c[1] === 'action' && c[2] === scene).length;
        const given = action(scene, n, args);
        if (given) return given;
        // By default cua's action starts from the fixed state the fixed sandwich kept.
        const before = shot(scene, 'skyshot.json'), after = shot(scene, 'action.after.skyshot.json');
        return {scene, build: BUILD, before, after, click: {index: 2, route: 3}, timings: {before: null, after: null}, frames: [before.window.frame, after.window.frame], problems: []};
      }
      throw new Error(`unexpected ${command}`);
    },
    scenes(args) {
      calls.push(['scenes', ...args]);
      const [command, scene] = args;
      if (command === 'place-chrome') return {appPath: '/c/Chrome for Testing.app', version: '155.0.0.0', reused: true};
      if (command === 'build-electron') return {appPath: '/f/cua Electron Fixture.app', electronVersion: '44.9.0', sourceHash: 'abc', reused: false};
      if (command === 'preflight') return {refusals: []};
      if (command === 'up') { up(scene); records[scene] = recordFor(scene); return records[scene]; }
      if (command === 'activate') return {scene, ok: true};
      if (command === 'down') return {scene, down: true};
      throw new Error(`unexpected scenes ${command}`);
    },
    prepare: home => { calls.push(['prepare', home]); return PREPARED; },
    cleanup: prepared => { calls.push(['cleanup', prepared.home]); return {removed: true}; },
    preflight: () => ({commit: 'c'.repeat(40), dirty: false, checkout: '/Users/u/Developer/GitHub/cua-parity', home: '/h', release: '26.928.40906-darwin-arm64',
      runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64', serves: false, hardware: {model: 'Mac14,12'}, os: {name: 'macOS', version: '27.0', build: '26A428'}, display: {scale: 2}, ...preflight}),
    home: () => '/Users/u',
    sizingConfig: () => 'plist mtime 2026-10-19T20:30:43Z\n0 fetched 2026-10-19T20:30:09Z rule default legacy absent (false) value {}\n',
    take: path => { taken.push(path); const text = files.get(path); files.delete(path); return text; },
    discard: path => { discarded.push(path); files.delete(path); },
    serveSpec: () => ({command: 'ssh', args: ['mini', 'serve']}),
  };
  return {ops, calls, files, taken, discarded, records};
}

// A vendor host double: answers each cell by its tag, writing the vendor's recorded text into the device's files.
// `engine` is the launcher's attestation every js result carries (the vendor engine at the runtime release by default).
const VENDOR_ENGINE = {engine: 'vendor', version: '1.0.744', build: '26.928.40906-darwin-arm64'};
function fakeVendor(device, {fixedPath = scene => `/h/run/s1/tmp/cua-goldens-${scene}.vendor.txt`, actionKinds = ['action.vendor.before.txt', 'action.vendor.diff.txt'], engine = VENDOR_ENGINE} = {}) {
  const cells = [], elicitations = [];
  const answer = value => ({content: [{type: 'text', text: `${MARKER}${JSON.stringify({ok: true, value, inCellMs: 1})}`}], ...(engine ? {_meta: {'cua/nativeEngine': engine}} : {})});
  const file = (kind, path, text) => { device.files.set(path, text); return {kind, path, bytes: Buffer.byteLength(text), sha256: sha(text)}; };
  let closed = false, handlers;
  const client = {
    async initialize() { return {serverInfo: {name: 'node_repl'}}; },
    async request(method, params) {
      if (method === 'tools/list') return {tools: []};
      const code = params.arguments.code;
      const [, kind, scene] = /\/\* goldens:(\w+) (\w+) \*\//.exec(code) ?? [];
      cells.push(kind ? `${kind} ${scene}` : 'first');
      if (kind === 'bind') {
        const app = SCENES[scene].bundleId;
        elicitations.push(await handlers.answer({method: 'elicitation/create', params: {message: `Allow Computer Use to use "${scene}"?`, requestedSchema: {type: 'object', properties: {}}, _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app}}}}));
        return answer({bound: true});
      }
      if (kind === 'fixed') return answer({files: [file('vendor.txt', fixedPath(scene), read(scene, 'vendor.txt'))]});
      if (kind === 'action') return answer({index: 2, files: [file(actionKinds[0], `/s/tmp/cua-goldens-${scene}.action.vendor.before.txt`, read(scene, 'action.vendor.before.txt')),
        file(actionKinds[1], `/s/tmp/cua-goldens-${scene}.action.vendor.diff.txt`, read(scene, 'action.vendor.diff.txt'))]});
      return answer({ready: true});
    },
    async call(name) { cells.push(name); return {}; },
    async close() { closed = true; },
  };
  return {connect: (spec, given) => { handlers = given; return client; }, cells, elicitations, get closed() { return closed; }};
}

// A repository double holding the goldens directory the install writes.
function fakeRepo() {
  const root = scratch(), goldens = join(root, 'test', 'native-goldens');
  fs.mkdirSync(goldens, {recursive: true});
  for (const name of ['PROVENANCE.md', 'source.json']) fs.copyFileSync(new URL(name, GOLDENS), join(goldens, name));
  return {root, goldens};
}

const run = async ({device = fakeDevice(), vendor = fakeVendor(device), repo = fakeRepo(), controllerBuild = BUILD, controllerCheckout = {commit: 'c'.repeat(40), dirty: false}, out, ...options} = {}) => {
  const dir = out ?? join(repo.root, 'docs', 'goldens-run');
  const code = await record({device: 'mini', approvedRuntime: '/h', out: dir, goldensDir: repo.goldens, repoRoot: repo.root, ...options},
    {ops: device.ops, connect: vendor.connect, controllerBuild: () => ({build: controllerBuild, engineVersion: '0.1.0'}), controllerCheckout: () => controllerCheckout, log: () => {}, sleep: async () => {}});
  const meta = JSON.parse(fs.readFileSync(join(dir, 'meta.json'), 'utf8'));
  return {code, meta, dir, device, vendor, repo};
};

test('parseCommand: record needs a declared device, the approved runtime and an output directory', () => {
  assert.deepEqual(parseCommand(['record', '--device', 'mini', '--approved-runtime', '/h', '--out', 'docs/x']).command, 'record');
  assert.throws(() => parseCommand(['record', '--approved-runtime', '/h', '--out', 'x']), /--device/);
  assert.throws(() => parseCommand(['record', '--device', 'mini', '--out', 'x']), /--approved-runtime/);
  assert.throws(() => parseCommand(['record', '--device', 'mini', '--approved-runtime', 'h', '--out', 'x']), /absolute/);
  assert.deepEqual(parseCommand(['check', '--write']), {command: 'check', write: true, json: false});
  assert.equal(parseCommand(['install', 'docs/x']).command, 'install');
  // A recording of some scenes cannot be installed, so it is refused before the sitting unless it says --no-install.
  assert.throws(() => parseCommand(['record', '--device', 'mini', '--approved-runtime', '/h', '--out', 'x', '--scenes', 'finder']), /--no-install/);
  assert.deepEqual(parseCommand(['record', '--device', 'mini', '--approved-runtime', '/h', '--out', 'x', '--scenes', 'finder', '--no-install']).scenes, ['finder']);
});

test('refuses before anything is prepared when the approved engine is not the checkout\'s build', async () => {
  const device = fakeDevice({engineProblems: ['the approved engine\'s build aaaa is not this checkout\'s cccc']});
  const out = await run({device});
  assert.equal(out.code, 2);
  assert.deepEqual(device.calls.map(c => c[1]), ['engine-check']);
  assert.match(out.meta.refused.join(' '), /not this checkout's/);
});

test('refuses a dirty controller checkout before anything is prepared, and a harness checkout on another commit after its preflight', async () => {
  const dirty = fakeDevice();
  const refused = await run({device: dirty, controllerCheckout: {commit: 'c'.repeat(40), dirty: true}});
  assert.equal(refused.code, 2);
  assert.equal(dirty.calls.some(c => c[0] === 'prepare'), false);
  assert.match(refused.meta.refused.join(' '), /uncommitted changes to tracked files: the start-state digest/);
  const other = fakeDevice();
  const stopped = await run({device: other, controllerCheckout: {commit: 'd'.repeat(40), dirty: false}});
  assert.equal(stopped.code, 1);
  assert.match(stopped.meta.error, /harness checkout is at c{40}, this checkout at d{40}: the start-state digest needs both on one commit/);
  assert.equal(other.calls.some(c => c[1] === 'up'), false);
  assert.ok(other.calls.some(c => c[0] === 'cleanup'));
});

test('controllerCheckout: the commit, and dirty only for tracked changes', () => {
  const answers = {'rev-parse': 'abc\n', status: ''};
  const exec = (_, args) => answers[args[0]];
  assert.deepEqual(controllerCheckout('/r', {exec}), {commit: 'abc', dirty: false});
  answers.status = ' M src/services/engine/render.mjs\n';
  assert.deepEqual(controllerCheckout('/r', {exec}), {commit: 'abc', dirty: true});
  const calls = [];
  controllerCheckout('/r', {exec: (cmd, args) => { calls.push(args.join(' ')); return ''; }});
  assert.deepEqual(calls, ['rev-parse HEAD', 'status --porcelain --untracked-files=no']);
  assert.deepEqual(controllerCheckout('/r', {exec: () => { throw new Error('not a git repository'); }}), {commit: null, dirty: true});
});

test('refuses when the controller\'s checkout builds another engine than the approved one', async () => {
  const device = fakeDevice();
  const out = await run({device, controllerBuild: 'e'.repeat(64)});
  assert.equal(out.code, 2);
  assert.equal(device.calls.some(c => c[0] === 'prepare'), false);
  assert.match(out.meta.refused.join(' '), /eeeeeeeeeeee/);
});

test('one sitting: both lanes per scene on the same state, in PROVENANCE\'s layout, then installed with the provenance refreshed', async () => {
  const out = await run();
  assert.equal(out.code, 0, JSON.stringify(out.meta.problems ?? out.meta.error));
  assert.equal(out.meta.complete, true);
  for (const scene of SCENE_ORDER) {
    assert.equal(fs.readFileSync(join(out.dir, 'goldens', scene, 'vendor.txt'), 'utf8'), read(scene, 'vendor.txt'), scene);
    assert.equal(fs.readFileSync(join(out.dir, 'goldens', scene, 'action.vendor.diff.txt'), 'utf8'), read(scene, 'action.vendor.diff.txt'), scene);
    assert.deepEqual(JSON.parse(fs.readFileSync(join(out.dir, 'goldens', scene, 'skyshot.json'), 'utf8')), shot(scene, 'skyshot.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(join(out.dir, 'goldens', scene, 'action.after.skyshot.json'), 'utf8')), shot(scene, 'action.after.skyshot.json'));
    // The install copied the files byte for byte.
    for (const name of ['skyshot.json', 'vendor.txt', 'action.before.skyshot.json', 'action.after.skyshot.json', 'action.vendor.before.txt', 'action.vendor.diff.txt'])
      assert.equal(fs.readFileSync(join(out.repo.goldens, scene, name), 'utf8'), fs.readFileSync(join(out.dir, 'goldens', scene, name), 'utf8'), `${scene}/${name}`);
  }
  // Every vendor file was read once (and removed on the device), none left behind.
  assert.equal(out.device.taken.length, 12);
  assert.equal(out.device.files.size, 0);
  // Each scene: up, setup, front, bind, cua around the vendor's fixed text, the vendor's action, the reset, cua's action.
  const textedit = out.device.calls.filter(c => c.includes('textedit')).map(c => `${c[0]} ${c[1]}${c[1] === 'steps' ? ` ${c.at(-1)}` : ''}`);
  // The reads after a vendor capture are `verify`: a wrong window there refuses what was captured, never waited out.
  assert.deepEqual(textedit, ['scenes up', 'goldens steps setup', 'scenes activate', 'goldens observe', 'goldens verify', 'scenes activate', 'goldens verify',
    'goldens steps teardown', 'scenes down', 'scenes up', 'goldens steps setup', 'scenes activate', 'goldens action', 'goldens steps teardown', 'scenes down']);
  assert.deepEqual(out.device.calls.filter(c => c.includes('finder') && c[1] === 'steps').map(c => c.at(-1)), ['setup', 'reset', 'teardown']);
  // cua's action is asked to start from the kept fixed state, by its digest.
  const actionCall = out.device.calls.find(c => c[1] === 'action' && c[2] === 'finder');
  assert.equal(actionCall.at(-1), stateDigest(shot('finder', 'skyshot.json')));
  assert.equal(out.meta.scenes.finder.startAttempts, 1);
  assert.deepEqual(out.vendor.cells.filter(c => c.endsWith('textedit')), ['bind textedit', 'fixed textedit', 'action textedit']);
  assert.deepEqual(out.vendor.elicitations.map(e => e.action), ['accept', 'accept', 'accept', 'accept']);
  // The stop discipline around the run, the preparation cleaned up, its record gone, the vendor connection closed.
  assert.deepEqual(out.device.calls.filter(c => c[1] === 'engine-stop').length, 2);
  assert.ok(out.device.calls.some(c => c[0] === 'cleanup'));
  assert.equal(fs.existsSync(join(out.dir, 'preparation.json')), false);
  assert.equal(out.vendor.closed, true);
  // The fixtures placed, the frames and the sizing config recorded; no token or identity in the meta.
  assert.equal(out.meta.fixtures.electron.reused, false);
  assert.equal(out.meta.scenes.finder.frames.same, true);
  assert.deepEqual([out.meta.sizingConfig.before.lines.length, out.meta.sizingConfig.after.lines.length], [2, 2]);
  assert.doesNotMatch(JSON.stringify(out.meta), /secret-token/);
  // The vendor's runtime as the device resolved it; the serve's stderr kept out of the committed recording.
  assert.equal(out.meta.vendor.release, '26.928.40906-darwin-arm64');
  assert.equal(fs.existsSync(join(out.dir, 'serve-stderr.txt')), false);
  assert.equal('serveStderr' in out.meta, false);
  assert.deepEqual(out.meta.controller, {build: BUILD, commit: 'c'.repeat(40), dirty: false});
  // The install: the goldens' source is the recording, compared as full text, and PROVENANCE names it.
  const source = JSON.parse(fs.readFileSync(join(out.repo.goldens, 'source.json'), 'utf8'));
  assert.deepEqual({kind: source.kind, dir: source.dir, redacted: source.redacted}, {kind: 'live', dir: 'docs/goldens-run/goldens', redacted: []});
  const provenance = fs.readFileSync(join(out.repo.goldens, 'PROVENANCE.md'), 'utf8');
  assert.match(provenance, /docs\/goldens-run/);
  assert.match(provenance, new RegExp(BUILD));
  assert.doesNotMatch(provenance, /sit2\/u9/);
  assert.match(provenance, /## Expected differences/);
  assert.match(provenance, /2026-10-19T20:30:09Z/);
});

test('Finder\'s chrome is recorded in meta.json from the device\'s steps: the owner\'s visible state, each phase\'s toggles and whether it was restored', async () => {
  const visible = {sidebar: true, statusBar: true, pathBar: false};
  const chrome = (shown, counts) => Object.entries(counts).map(([part, toggles]) => ({chrome: part, part, shown, toggles}));
  const device = fakeDevice({steps: (scene, phase) => (scene !== 'finder' ? [] : phase === 'setup'
    ? [{activate: 'finder'}, {pressKey: 'super+2', route: 3}, {visibleState: 'record', visible, kept: false}, ...chrome(false, {sidebar: 1, statusBar: 2, pathBar: 0})]
    : phase === 'teardown' ? [{activate: 'finder'}, ...chrome(true, {sidebar: 1, statusBar: 1, pathBar: 0}), {visibleState: 'restored'}, {pressKey: 'super+w', route: 3}] : [])});
  const out = await run({device});
  assert.equal(out.code, 0, JSON.stringify(out.meta.problems ?? out.meta.error));
  assert.deepEqual(out.meta.scenes.finder.chrome, {visible, setupToggles: {sidebar: 1, statusBar: 2, pathBar: 0}, teardownToggles: {sidebar: 1, statusBar: 1, pathBar: 0}, restored: true});
  for (const id of ['textedit', 'chrome', 'electron']) assert.equal('chrome' in out.meta.scenes[id], false, id);
  // A teardown that did not restore the visible state says so.
  const unrestored = fakeDevice({steps: (scene, phase) => (scene === 'finder' && phase === 'setup' ? [{visibleState: 'record', visible, kept: true}, ...chrome(false, {sidebar: 1, statusBar: 0, pathBar: 0})] : [])});
  const again = await run({device: unrestored});
  assert.deepEqual(again.meta.scenes.finder.chrome, {visible, setupToggles: {sidebar: 1, statusBar: 0, pathBar: 0}, teardownToggles: {}, restored: false});
});

test('the vendor\'s text is removed unread when cua\'s check of the state right after it fails; three failures leave the scene unrecorded', async () => {
  const device = fakeDevice({observe: (scene, n) => (scene === 'chrome' && n % 2 === 0 ? {scene, build: BUILD, skyshot: null, problems: [{code: 'other_window', message: 'x'}]} : null)});
  const out = await run({device});
  assert.equal(out.code, 1);
  assert.equal(out.meta.complete, false);
  assert.equal(device.discarded.filter(p => p.includes('chrome')).length, 3);
  assert.equal(device.taken.some(p => p.includes('chrome')), false);
  assert.equal(fs.existsSync(join(out.dir, 'goldens', 'chrome', 'vendor.txt')), false);
  assert.match(out.meta.problems.join(' '), /chrome: .*other_window/);
  // The other scenes recorded; nothing installed: the repository's source record is the one it had.
  assert.ok(fs.existsSync(join(out.dir, 'goldens', 'electron', 'vendor.txt')));
  assert.equal(fs.readFileSync(join(out.repo.goldens, 'source.json'), 'utf8'), fs.readFileSync(new URL('source.json', GOLDENS), 'utf8'));
});

test('a state that moved between cua\'s two observations is taken again', async () => {
  const drifted = shot('textedit', 'skyshot.json');
  drifted.nodes = drifted.nodes.slice(0, -1);
  const device = fakeDevice({observe: (scene, n) => (scene === 'textedit' && n === 2 ? {scene, build: BUILD, skyshot: drifted, timings: null, frame: drifted.window.frame, problems: []} : null)});
  const out = await run({device});
  assert.equal(out.code, 0, JSON.stringify(out.meta.problems));
  assert.equal(device.discarded.filter(p => p.includes('textedit')).length, 1);
  assert.equal(out.meta.scenes.textedit.fixedAttempts, 2);
});

test('a file the vendor cell names outside the session\'s temp directory is never read', async () => {
  const device = fakeDevice();
  const out = await run({device, vendor: fakeVendor(device, {fixedPath: scene => `/Users/u/elsewhere/cua-goldens-${scene}.vendor.txt`})});
  assert.equal(out.code, 1);
  assert.equal(device.taken.some(p => p.includes('elsewhere')), false);
  assert.match(out.meta.problems.join(' '), /outside the session's temp directory/);
});

test('cua\'s action from a start that is not the kept fixed state is not kept: the scene is reset and the action taken again', async () => {
  const elsewhere = shot('textedit', 'skyshot.json');
  elsewhere.nodes = elsewhere.nodes.slice(0, -1);
  const moved = (scene, n) => (n === 1 ? {scene, build: BUILD, before: elsewhere, after: elsewhere, click: {index: 2, route: 3}, timings: {}, frames: [null, null], problems: []} : null);
  const startState = (scene, n) => (n === 1 ? {scene, build: BUILD, before: null, after: null, click: null, timings: null, frames: null, problems: [{code: 'start_state', message: 'not the fixed state'}], observed: elsewhere} : null);
  const device = fakeDevice({action: (scene, n) => (scene === 'textedit' ? moved(scene, n) : scene === 'finder' ? startState(scene, n) : null)});
  const out = await run({device});
  assert.equal(out.code, 0, JSON.stringify(out.meta.problems ?? out.meta.error));
  assert.deepEqual([out.meta.scenes.textedit.startAttempts, out.meta.scenes.finder.startAttempts, out.meta.scenes.chrome.startAttempts], [2, 2, 1]);
  // TextEdit restarted once per attempt; Finder reset twice in its one window.
  assert.equal(device.calls.filter(c => c[0] === 'scenes' && c[1] === 'up' && c[2] === 'textedit').length, 3);
  assert.deepEqual(device.calls.filter(c => c[1] === 'steps' && c[2] === 'finder').map(c => c.at(-1)), ['setup', 'reset', 'reset', 'teardown']);
  assert.deepEqual(JSON.parse(fs.readFileSync(join(out.dir, 'goldens', 'textedit', 'action.before.skyshot.json'), 'utf8')), shot('textedit', 'skyshot.json'));
  // Each failed start leaves a bounded diagnostic in meta.json: how many rendered lines differ and the first pair.
  const [diagnostic] = out.meta.scenes.textedit.startMismatches;
  assert.equal(diagnostic.attempt, 1);
  assert.ok(diagnostic.differingLines >= 1);
  assert.ok(diagnostic.lines.kept > diagnostic.lines.observed);
  assert.notEqual(diagnostic.first.kept, diagnostic.first.observed);
  assert.equal(out.meta.scenes.finder.startMismatches.length, 1);
  assert.ok(out.meta.scenes.finder.startMismatches[0].first.kept.length <= 200);

  // A start that never comes back to the fixed state leaves the scene unrecorded.
  const stuck = fakeDevice({action: (scene, n) => (scene === 'electron' ? moved(scene, 1) : null)});
  const failed = await run({device: stuck});
  assert.equal(failed.code, 1);
  assert.match(failed.meta.problems.join(' '), /electron: cua's action could not start from the fixed state in 3 resets/);
  assert.equal(fs.existsSync(join(failed.dir, 'goldens', 'electron', 'action.before.skyshot.json')), false);
});

test('cua\'s action that found the page still filling or never settled is reset and taken again; any other refusal ends the scene', async () => {
  const refusal = (scene, code, extra = {}) => ({scene, build: BUILD, before: null, after: null, click: null, timings: null, frames: null, problems: [{code, message: code}], ...extra});
  const elsewhere = shot('chrome', 'skyshot.json');
  elsewhere.nodes = elsewhere.nodes.slice(0, -1);
  const device = fakeDevice({action: (scene, n) => (scene !== 'chrome' ? null : n === 1 ? refusal(scene, 'page_filling') : n === 2 ? refusal(scene, 'unstable', {observed: elsewhere}) : null)});
  const out = await run({device});
  assert.equal(out.code, 0, JSON.stringify(out.meta.problems ?? out.meta.error));
  assert.equal(out.meta.scenes.chrome.startAttempts, 3);
  assert.equal(device.calls.filter(c => c[0] === 'scenes' && c[1] === 'up' && c[2] === 'chrome').length, 4, 'the first up, then a restart before each attempt');
  assert.deepEqual(out.meta.scenes.chrome.startMismatches.map(m => m.attempt), [2], 'the unsettled start\'s last read is diagnosed');
  const other = fakeDevice({action: (scene, n) => (scene === 'chrome' && n === 1 ? refusal(scene, 'other_process') : null)});
  const failed = await run({device: other});
  assert.equal(failed.code, 1);
  assert.match(failed.meta.problems.join(' '), /chrome: cua's action did not record: other_process/);
  assert.equal(other.calls.filter(c => c[1] === 'action' && c[2] === 'chrome').length, 1);
});

test('the vendor\'s action texts are removed unread when the state after its click is not the scene\'s', async () => {
  // Observations 1-2 are the fixed sandwich; the third is the check after the vendor's action.
  const device = fakeDevice({observe: (scene, n) => (scene === 'finder' && n === 3 ? {scene, build: BUILD, skyshot: null, problems: [{code: 'finder_sidebar', message: 'x'}]} : null)});
  const out = await run({device});
  assert.equal(out.code, 1);
  assert.deepEqual(device.discarded.filter(p => p.includes('finder')).map(p => p.split('cua-goldens-')[1]), ['finder.action.vendor.before.txt', 'finder.action.vendor.diff.txt']);
  assert.equal(device.taken.some(p => p.includes('finder.action')), false);
  assert.match(out.meta.problems.join(' '), /finder: the state after the vendor's action is not the scene's .*finder_sidebar.*removed unread/);
  assert.equal(device.calls.some(c => c[1] === 'action' && c[2] === 'finder'), false);
});

test('a vendor file named as anything but the expected golden is removed unread', async () => {
  const device = fakeDevice();
  const out = await run({device, vendor: fakeVendor(device, {actionKinds: ['../../escape.txt', 'action.vendor.diff.txt']})});
  assert.equal(out.code, 1);
  assert.equal(device.taken.some(p => p.includes('.action.')), false);
  assert.equal(device.discarded.filter(p => p.includes('.action.')).length, 8);
  assert.match(out.meta.problems.join(' '), /named the files \["\.\.\/\.\.\/escape\.txt","action\.vendor\.diff\.txt"\]/);
});

test('a scene that does not come up is the scene\'s problem; the others are recorded', async () => {
  const device = fakeDevice({up: scene => { if (scene === 'chrome') throw new Error('scenes-mac.mjs up chrome: Chrome for Testing is already running'); }});
  const out = await run({device});
  assert.equal(out.code, 1);
  assert.match(out.meta.problems.join(' '), /chrome: it did not come up: .*already running/);
  assert.ok(fs.existsSync(join(out.dir, 'goldens', 'electron', 'action.vendor.diff.txt')));
});

test('the vendor serve is refused as the native baseline refuses it: no runtime, a serve already running, another runtime root', async () => {
  for (const [preflight, pattern] of [[{release: null}, /no runtime installed/], [{serves: true}, /already running/], [{runtimeRoot: '/elsewhere/runtime'}, /resolves the runtime \/elsewhere\/runtime, not the approved/]]) {
    const device = fakeDevice({preflight});
    const out = await run({device});
    assert.equal(out.code, 1);
    assert.match(out.meta.error, pattern);
    assert.equal(device.calls.some(c => c[1] === 'up'), false);
    assert.ok(device.calls.some(c => c[0] === 'cleanup'), 'the approved home is cleaned up');
  }
});

test('the vendor lane is refused unless the vendor engine at the runtime release answered it: never cua\'s engine in the vendor host', async () => {
  for (const [engine, pattern] of [[{...VENDOR_ENGINE, engine: 'cua', build: BUILD}, /the cua engine answered the vendor lane/],
    [{...VENDOR_ENGINE, build: '26.900.1-darwin-arm64'}, /attests the runtime 26\.900\.1-darwin-arm64, not the prepared 26\.928\.40906-darwin-arm64/],
    [null, /carries no cua\/nativeEngine attestation/]]) {
    const device = fakeDevice();
    const out = await run({device, vendor: fakeVendor(device, {engine})});
    assert.equal(out.code, 1);
    assert.match(out.meta.error, pattern);
    assert.equal(device.calls.some(c => c[1] === 'up'), false, 'no scene comes up');
    assert.equal(fs.existsSync(join(out.dir, 'goldens', 'finder', 'vendor.txt')), false);
    assert.ok(device.calls.some(c => c[0] === 'cleanup'), 'the approved home is cleaned up');
  }
  const out = await run();
  assert.equal(out.code, 0);
  assert.deepEqual(out.meta.vendor.engineAttestation, VENDOR_ENGINE);
});

test('the vendor serve and its preflight select the vendor engine explicitly, so the account\'s engine.json never chooses it', () => {
  const scripts = [];
  const ops = deviceOps('mini', {exec: (command, args) => { scripts.push(args.join(' ')); return '{"commit":"c"}\n'; }});
  ops.preflight(PREPARED);
  assert.match(scripts[0], /CUA_REPL_HOST=vendor CUA_NATIVE_ENGINE=vendor /);
  const serve = ops.serveSpec({pre: {checkout: '/Users/u/Developer/GitHub/cua-parity', home: '/h'}, prepared: PREPARED});
  assert.match(serve.args.join(' '), /CUA_REPL_HOST=vendor CUA_NATIVE_ENGINE=vendor /);
});

test('a recording directory already used is refused with the way on; a dead recording\'s cleanup undoes each step in order', async () => {
  const first = await run({device: fakeDevice({engineProblems: ['no approved engine']})});
  await assert.rejects(run({out: first.dir, repo: first.repo}), /already holds a recording .*choose a new --out/);
  const calls = [];
  const ops = {goldens: args => { calls.push(args.join(' ')); if (args[0] === 'steps') throw new Error('scene finder is not up'); return {ok: true}; },
    scenes: args => { calls.push(args.join(' ')); return {down: true}; }, cleanup: prepared => { calls.push(`cleanup ${prepared.home}`); return {removed: true}; }};
  const out = cleanupRecording({device: 'mini', prepared: PREPARED, run: '/r'}, ops);
  assert.deepEqual(calls, ['steps finder --run /r --phase teardown', 'down all --run /r', 'engine-stop', 'cleanup /h']);
  assert.match(out.finderTeardown.error, /not up/);
  assert.deepEqual(out.preparationCleanup, {removed: true});
});

test('install refuses an incomplete recording, a missing file, and a recording outside the repository', () => {
  const repo = fakeRepo(), dir = join(repo.root, 'docs', 'r');
  fs.mkdirSync(join(dir, 'goldens'), {recursive: true});
  fs.writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: false}));
  assert.throws(() => install(dir, {goldensDir: repo.goldens, repoRoot: repo.root}), /not complete/);
  fs.writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: true}));
  assert.throws(() => install(dir, {goldensDir: repo.goldens, repoRoot: repo.root}), /textedit\/skyshot\.json/);
  const outside = scratch();
  fs.writeFileSync(join(outside, 'meta.json'), JSON.stringify({complete: true}));
  assert.throws(() => install(outside, {goldensDir: repo.goldens, repoRoot: repo.root}), /under the repository/);
});

test('the vendor cells: the fixed text and the action written to the session\'s temp directory, removed when the cell fails', async () => {
  const temp = scratch(), previous = process.env.TMPDIR;
  const written = [];
  const runCell = async code => { const output = []; await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', 'cua', code)({write: text => output.push(text)}, {}); return parseCell(output.join('\n')); };
  process.env.TMPDIR = temp;
  try {
    const vendor = read('textedit', 'action.vendor.before.txt');
    const clicks = [];
    globalThis.__apps = {textedit: {getAXState: async ({disableDiffing}) => (disableDiffing ? vendor : 'diff text'), click: async index => { clicks.push(index); }}};
    const fixed = await runCell(FIXED('textedit', 'cua-scene'));
    assert.equal(fixed.ok, true, fixed.error);
    written.push(...fixed.value.files.map(f => f.path));
    assert.equal(fs.readFileSync(fixed.value.files[0].path, 'utf8'), vendor);
    assert.equal(fixed.value.files[0].sha256, sha(vendor));
    const action = await runCell(ACTION('textedit', 'cua-scene', SCENES.textedit.action));
    assert.equal(action.ok, true, action.error);
    assert.deepEqual(clicks, [2]);
    assert.deepEqual(action.value.files.map(f => fs.readFileSync(f.path, 'utf8')), [vendor, 'diff text']);
    written.push(...action.value.files.map(f => f.path));
    // Another window in front: nothing written, nothing clicked.
    globalThis.__apps.textedit.getAXState = async () => 'Window: "Untitled", App: TextEdit.\n0 window';
    const refused = await runCell(ACTION('textedit', 'cua-scene', SCENES.textedit.action));
    assert.equal(refused.ok, false);
    assert.deepEqual(clicks, [2]);
    assert.deepEqual(fs.readdirSync(temp).sort(), written.map(p => p.split('/').at(-1)).sort());
    assert.equal(isSessionFile({home: '/h', tmpdir: temp}, written[0]), true);
    assert.equal(isSessionFile({home: '/h', tmpdir: temp}, `${temp}/../x/cua-goldens-a`), false);
    assert.match(BIND('electron', '/f/cua Electron Fixture.app'), /cua\.getApp\("\/f\/cua Electron Fixture\.app"\)/);
  } finally {
    if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous;
    delete globalThis.__apps;
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('the device steps run in the harness checkout over ssh; a scene CLI\'s exit-1 answer is an answer, an {error} throws', () => {
  const calls = [];
  const answers = [
    () => '{"ok":true}\n',
    () => { throw Object.assign(new Error('exit 1'), {stdout: 'noise\n{"refusals":["chrome is running"]}\n'}); },
    () => { throw Object.assign(new Error('exit 1'), {stdout: '{"error":"no such scene"}\n'}); },
    () => 'contents',
  ];
  const ops = deviceOps('mini', {exec: (command, args) => { calls.push([command, ...args].join(' ')); return answers[calls.length - 1](); }});
  assert.deepEqual(ops.goldens(['observe', 'finder', '--run', '/tmp/x y']), {ok: true});
  assert.deepEqual(ops.scenes(['preflight', 'chrome']), {refusals: ['chrome is running']});
  assert.throws(() => ops.goldens(['observe', 'nope', '--run', '/r']), /goldens-device\.mjs observe nope: no such scene/);
  assert.equal(ops.take('/tmp/cua-goldens-a.txt'), 'contents');
  assert.match(calls[0], /^ssh .*mini/);
  assert.match(calls[0], /cd \$HOME\/Developer\/GitHub\/cua-parity && node scripts\/native-matrix\/goldens-device\.mjs 'observe' 'finder' '--run' '\/tmp\/x y'/);
  assert.match(calls[3], /cat '?\/tmp\/cua-goldens-a\.txt'? && rm -f/);
  assert.throws(() => deviceOps('cua-gce'), /not a macOS device/);
});

test('check prints the pinned renderings and the audit, and exits 0 only when the audit leaves nothing to act on', async () => {
  const lines = [];
  const pending = rerender({write: false}).filter(r => r.changed);
  const code = await main(['check'], {log: line => lines.push(line)});
  assert.equal(code, auditClean(audit()) && !pending.length ? 0 : 1);
  assert.match(lines.join('\n'), pending.length ? /--write rewrites them/ : /Pinned renderings: none changed/);
  assert.match(lines.join('\n'), /Goldens audit \(test\/native-goldens, source (m0|live)\)/);
});

test('startDiagnostic: the count of differing lines, port drift aside, and the first pair clipped', () => {
  const kept = shot('chrome', 'skyshot.json');
  const moved = JSON.parse(JSON.stringify(kept).replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:1'));
  assert.deepEqual(startDiagnostic(kept, moved), {differingLines: 0, lines: {kept: startDiagnostic(kept, kept).lines.kept, observed: startDiagnostic(kept, kept).lines.kept}, first: null});
  const renamed = structuredClone(kept);
  renamed.window.title = `${'x'.repeat(400)}`;
  const out = startDiagnostic(kept, renamed);
  assert.ok(out.differingLines >= 1);
  assert.equal(out.first.line, 1);
  assert.equal(out.first.observed.length, 200);
});

test('a recording leaves no empty serve stderr directory behind', async () => {
  const listing = () => fs.readdirSync(tmpdir()).filter(name => name.startsWith('cua-goldens-serve-')).sort();
  const before = listing();
  await run();
  assert.deepEqual(listing(), before);
});

test('a frame is the same frame whatever order its keys come in, and a moved or missing one is not', async () => {
  const {sameFrame} = await import('../../scripts/native-matrix/goldens.mjs');
  assert.equal(sameFrame({x: 820, y: 261, width: 920, height: 464}, {height: 464, width: 920, x: 820, y: 261}), true);
  assert.equal(sameFrame({x: 820, y: 261, width: 920, height: 464}, {x: 821, y: 261, width: 920, height: 464}), false);
  assert.equal(sameFrame({x: 820, y: 261, width: 920, height: 464}, null), false);
  assert.equal(sameFrame(null, null), true);
});
