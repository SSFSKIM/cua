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
import {join} from 'node:path';
import {MARKER, parseCell} from '../../scripts/native-baseline/cells.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';
import {ACTION, BIND, FIXED, isSessionFile} from '../../scripts/native-matrix/goldens-cells.mjs';
import {SCENE_ORDER, deviceOps, main, parseCommand, record} from '../../scripts/native-matrix/goldens.mjs';
import {install} from '../../scripts/native-matrix/goldens-install.mjs';

const GOLDENS = new URL('../native-goldens/', import.meta.url);
const read = (scene, name) => fs.readFileSync(new URL(`${scene}/${name}`, GOLDENS), 'utf8');
const shot = (scene, name) => JSON.parse(read(scene, name));
const sha = text => createHash('sha256').update(text).digest('hex');
const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-goldens-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const BUILD = 'b'.repeat(64);
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', token: 'secret-token', admission: 'secret-token', runtimeReuse: {release: '26.928.40906-darwin-arm64'}};

// A device double: the scenes' CLI, the device side of the recorder, preparation and the files the vendor cells wrote.
function fakeDevice({observe = () => null, engineProblems = [], approvedBuild = BUILD} = {}) {
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
      if (command === 'steps') return {scene, phase: args.at(-1), steps: []};
      if (command === 'observe') {
        const n = calls.filter(c => c[1] === 'observe' && c[2] === scene).length;
        const given = observe(scene, n);
        if (given) return given;
        const skyshot = shot(scene, 'skyshot.json');
        return {scene, build: BUILD, skyshot, timings: {focusRead: null}, frame: skyshot.window.frame, problems: []};
      }
      if (command === 'action') {
        const before = shot(scene, 'action.before.skyshot.json'), after = shot(scene, 'action.after.skyshot.json');
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
      if (command === 'up') { records[scene] = recordFor(scene); return records[scene]; }
      if (command === 'activate') return {scene, ok: true};
      if (command === 'down') return {scene, down: true};
      throw new Error(`unexpected scenes ${command}`);
    },
    prepare: home => { calls.push(['prepare', home]); return PREPARED; },
    cleanup: prepared => { calls.push(['cleanup', prepared.home]); return {removed: true}; },
    preflight: () => ({commit: 'c'.repeat(40), dirty: false, checkout: '/Users/u/Developer/GitHub/cua-parity', home: '/h', release: '26.928.40906-darwin-arm64',
      hardware: {model: 'Mac14,12'}, os: {name: 'macOS', version: '27.0', build: '26A428'}, display: {scale: 2}}),
    home: () => '/Users/u',
    sizingConfig: () => 'plist mtime 2026-10-19T20:30:43Z\n0 fetched 2026-10-19T20:30:09Z rule default legacy absent (false) value {}\n',
    take: path => { taken.push(path); const text = files.get(path); files.delete(path); return text; },
    discard: path => { discarded.push(path); files.delete(path); },
    serveSpec: () => ({command: 'ssh', args: ['mini', 'serve']}),
  };
  return {ops, calls, files, taken, discarded, records};
}

// A vendor host double: answers each cell by its tag, writing the vendor's recorded text into the device's files.
function fakeVendor(device, {fixedPath = scene => `/h/run/s1/tmp/cua-goldens-${scene}.vendor.txt`} = {}) {
  const cells = [], elicitations = [];
  const answer = value => ({content: [{type: 'text', text: `${MARKER}${JSON.stringify({ok: true, value, inCellMs: 1})}`}]});
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
      if (kind === 'action') return answer({index: 2, files: [file('action.vendor.before.txt', `/s/tmp/cua-goldens-${scene}.action.vendor.before.txt`, read(scene, 'action.vendor.before.txt')),
        file('action.vendor.diff.txt', `/s/tmp/cua-goldens-${scene}.action.vendor.diff.txt`, read(scene, 'action.vendor.diff.txt'))]});
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

const run = async ({device = fakeDevice(), vendor = fakeVendor(device), repo = fakeRepo(), controllerBuild = BUILD, out, ...options} = {}) => {
  const dir = out ?? join(repo.root, 'docs', 'goldens-run');
  const code = await record({device: 'mini', approvedRuntime: '/h', out: dir, goldensDir: repo.goldens, repoRoot: repo.root, ...options},
    {ops: device.ops, connect: vendor.connect, controllerBuild: () => ({build: controllerBuild, engineVersion: '0.1.0'}), controllerCommit: () => 'd'.repeat(40), log: () => {}, sleep: async () => {}});
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
});

test('refuses before anything is prepared when the approved engine is not the checkout\'s build', async () => {
  const device = fakeDevice({engineProblems: ['the approved engine\'s build aaaa is not this checkout\'s cccc']});
  const out = await run({device});
  assert.equal(out.code, 2);
  assert.deepEqual(device.calls.map(c => c[1]), ['engine-check']);
  assert.match(out.meta.refused.join(' '), /not this checkout's/);
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
  assert.deepEqual(textedit, ['scenes up', 'goldens steps setup', 'scenes activate', 'goldens observe', 'goldens observe', 'scenes activate', 'goldens observe',
    'goldens steps teardown', 'scenes down', 'scenes up', 'goldens steps setup', 'scenes activate', 'goldens action', 'goldens steps teardown', 'scenes down']);
  assert.deepEqual(out.device.calls.filter(c => c.includes('finder') && c[1] === 'steps').map(c => c.at(-1)), ['setup', 'reset', 'teardown']);
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

test('the vendor\'s text is removed unread when cua\'s check of the state right after it fails; three failures leave the scene unrecorded', async () => {
  const device = fakeDevice({observe: (scene, n) => (scene === 'chrome' && n % 2 === 0 ? {scene, build: BUILD, skyshot: null, problems: [{code: 'other_window', message: 'x'}]} : null)});
  const out = await run({device});
  assert.equal(out.code, 1);
  assert.equal(out.meta.complete, false);
  assert.equal(device.discarded.filter(p => p.includes('chrome')).length, 3);
  assert.equal(device.taken.some(p => p.includes('chrome')), false);
  assert.equal(fs.existsSync(join(out.dir, 'goldens', 'chrome', 'vendor.txt')), false);
  assert.match(out.meta.problems.join(' '), /chrome: .*other_window/);
  // The other scenes recorded; nothing installed.
  assert.ok(fs.existsSync(join(out.dir, 'goldens', 'electron', 'vendor.txt')));
  assert.equal(JSON.parse(fs.readFileSync(join(out.repo.goldens, 'source.json'), 'utf8')).kind, 'm0');
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

test('check on the committed goldens: nothing pinned changed, every declaration needed, the audit printed', async () => {
  const lines = [];
  assert.equal(await main(['check'], {log: line => lines.push(line)}), 0);
  assert.match(lines.join('\n'), /Pinned renderings: none changed/);
  assert.match(lines.join('\n'), /Goldens audit/);
});
