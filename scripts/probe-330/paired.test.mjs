import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseOptions, requireHosted, createDataset, observation, Wire} from './paired.mjs';
import {encodeFrame, FrameDecoder} from '../../src/services/engine/protocol.mjs';

const engines = ['control', 'branch', 'candidate'].map((head, i) => ({head, ref: String(i + 1).repeat(40), binary: `/engine/${head}`, sha256: String(i)}));

test('CLI requires a candidate identity and accepts ref flags or environment without borrowing kit HEAD', () => {
  const args = ['--control', '/c', '--branch', '/b', '--candidate', '/n', '--out', '/o'];
  assert.throws(() => parseOptions(args, {}), /candidate-ref/);
  const opts = parseOptions([...args, '--candidate-ref', 'candidate-head'], {P330_BRANCH_REF: 'old-head'});
  assert.equal(opts.engines[0].requestedRef, '3c669314e0a5f35aedf20f9b792604fc09628c45');
  assert.equal(opts.engines[1].requestedRef, 'old-head');
  assert.equal(opts.engines[2].requestedRef, 'candidate-head');
  assert.throws(() => parseOptions([...args, '--candidate-ref', 'new', '--reps', '1'], {}), /unknown/);
});

test('host guard refuses this Mac and non-macOS hosts before starting the benchmark', () => {
  assert.throws(() => requireHosted({}, 'darwin'), /GitHub-hosted/);
  assert.throws(() => requireHosted({RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_ACTIONS: 'true'}, 'linux'), /macOS/);
  assert.doesNotThrow(() => requireHosted({RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_ACTIONS: 'true'}, 'darwin'));
});

test('plan retains all 20 measured and 40 warm slots per engine/scene, rotating order every round', () => {
  const data = createDataset(engines);
  assert.equal(data.results.length, 300);
  assert.equal(data.warmups.length, 600);
  const firstScene = data.config.scenes[0].id;
  assert.deepEqual(data.results.filter(r => r.scene === firstScene && r.round <= 3).map(r => [r.round, r.head]), [
    [1, 'control'], [1, 'branch'], [1, 'candidate'],
    [2, 'branch'], [2, 'candidate'], [2, 'control'],
    [3, 'candidate'], [3, 'control'], [3, 'branch'],
  ]);
  for (const scene of data.config.scenes) for (const engine of engines) {
    const rows = data.results.filter(r => r.scene === scene.id && r.head === engine.head);
    assert.deepEqual(rows.map(r => r.round), Array.from({length: 20}, (_, i) => i + 1));
    assert.ok(rows.every(r => r.status === 'not-run' && r.ref === engine.ref));
    assert.equal(data.warmups.filter(r => r.scene === scene.id && r.head === engine.head).length, 40);
  }
  assert.equal(new Set([...data.results, ...data.warmups].map(r => r.label)).size, 900);
});

const sky = () => ({app: {displayName: 'Firefox', bundleIdentifier: 'org.mozilla.firefox'},
  window: {title: 'fixture', pid: 123, frame: {x: 100, y: 30, width: 620, height: 720}},
  nodes: [{role: 'AXWebArea', frame: {x: 100, y: 100, width: 620, height: 650}}, {role: 'AXStaticText', value: 'Paired long text'}],
  menuBar: [{role: 'AXMenuBarItem'}], truncated: {count: 3}, timings: {walkMs: 12, nodes: 3, budgetHit: true}});

test('observation keeps timings/counts/truncation and rejects absent walk timing or wrong/empty scene', () => {
  const scene = {app: 'firefox', marker: 'Paired long text'};
  const state = sky();
  const good = observation({result: state}, scene);
  assert.equal(good.status, 'ok');
  assert.equal(good.nodeCount, 2);
  assert.equal(good.menuBarCount, 1);
  assert.deepEqual(good.timings, state.timings);
  assert.deepEqual(good.truncated, {count: 3});
  delete state.timings.walkMs;
  assert.equal(observation({result: state}, scene).status, 'invalid');
  assert.equal(observation({result: sky()}, {...scene, marker: 'not this page'}).status, 'invalid');
  assert.equal(observation({result: {...sky(), nodes: []}}, scene).status, 'invalid');
  const error = {code: -10008, message: 'AX failed', errorName: 'accessibilityError'};
  assert.deepEqual(observation({error}, scene), {status: 'failed', error});
});

test('observation rejects a different window without dropping the measured walk', () => {
  const scene = {app: 'firefox', marker: 'Paired long text'};
  const before = sky().window;
  const after = sky(); after.window.frame.y++;
  const row = observation({result: after}, scene, before);
  assert.equal(row.status, 'invalid');
  assert.match(row.problem, /window/);
  assert.equal(row.timings.walkMs, 12);
});

test('CLI refuses a local execution before creating output or launching any app', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p330-guard-')), out = join(dir, 'out');
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./paired.mjs', import.meta.url)),
      '--control', '/not-an-engine', '--branch', '/not-an-engine', '--candidate', '/not-an-engine', '--out', out, '--candidate-ref', 'new'],
    {encoding: 'utf8', env: {...process.env, RUNNER_ENVIRONMENT: 'local', GITHUB_ACTIONS: 'false'}});
    assert.equal(run.status, 2);
    assert.match(run.stderr, /GitHub-hosted/);
    assert.equal(existsSync(out), false);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('offline CLI exposes a missing candidate slot in scene and app denominators and writes its report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p330-reader-'));
  try {
    const data = createDataset(engines);
    data.config.completed = true;
    for (const row of [...data.results, ...data.warmups]) Object.assign(row, {status: 'ok', requestSent: true, timings: {walkMs: row.head === 'control' ? 100 : 105}});
    const missing = data.results.find(r => r.head === 'candidate' && r.scene === 'firefox-body');
    data.results = data.results.filter(r => r !== missing);
    writeFileSync(join(dir, 'results.json'), JSON.stringify(data));
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./offline/paired-table.mjs', import.meta.url)), dir], {encoding: 'utf8'});
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(readFileSync(join(dir, 'paired-report.json'), 'utf8')).reports[0];
    const scene = report.scenes.find(s => s.scene === 'firefox-body');
    assert.equal(scene.engines.candidate.expected, 20);
    assert.equal(scene.engines.candidate.missing, 1);
    assert.equal(scene.engines.candidate.valid, 19);
    assert.equal(scene.comparisons.candidate.within10PctP50, null);
    assert.equal(scene.comparisons.branch.within10PctP50, true);
    assert.equal(report.apps.find(a => a.app === 'firefox').engines.candidate.expected, 60);
    assert.equal(report.issues[0].reason, 'missing');
    assert.ok(readFileSync(join(dir, 'paired-tables.txt'), 'utf8').includes('19/20'));
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('wire decodes fragmented replies and rejects a disconnected in-flight observation promptly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p330-test-'));
  const path = join(dir, 's');
  const peers = new Set();
  const server = createServer(socket => {
    peers.add(socket); socket.on('close', () => peers.delete(socket));
    const decoder = new FrameDecoder();
    socket.on('data', chunk => {
      for (const request of decoder.push(chunk)) {
        if (request.method === 'drop') {socket.destroy(); continue;}
        const bytes = encodeFrame({jsonrpc: '2.0', id: request.id, result: {echo: request.params}});
        socket.write(bytes.subarray(0, 2));
        setImmediate(() => socket.write(bytes.subarray(2)));
      }
    });
  });
  await new Promise(resolve => server.listen(path, resolve));
  let wire;
  try {
    wire = await Wire.connect(path);
    assert.deepEqual(await wire.call('ping', {desktop: 'shared'}, 1000), {jsonrpc: '2.0', id: 1, result: {echo: {desktop: 'shared'}}});
    await assert.rejects(wire.call('drop', {}, 1000), /closed/);
  } finally {
    wire?.close(); for (const peer of peers) peer.destroy();
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, {recursive: true, force: true});
  }
});
