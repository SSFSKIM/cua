// Which native engine answered a Linux computer session (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// The facade suites; Decision Log M1b.2): the trusted worker's child, read through /proc/<pid>/exe, judged against the
// lane's requested engine. The device side reads a /proc tree; here it reads a fake one.
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {engineKind, engineProcesses, engineAnsweredProblem, mergeObservations} from '../../scripts/repl-parity/engine-answered.mjs';

const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
// A fake /proc: {pid: {ppid, exe, cmdline: [...]}}; stat's comm may hold spaces and parentheses, as the kernel's does.
function fakeProc(processes) {
  const root = fs.mkdtempSync(join(tmpdir(), 'cua-engine-answered-')); scratches.push(root);
  for (const [pid, p] of Object.entries(processes)) {
    const dir = join(root, pid); fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'stat'), `${pid} (${p.comm ?? 'a (b) c'}) S ${p.ppid} 1 1 0 -1`);
    fs.writeFileSync(join(dir, 'cmdline'), (p.cmdline ?? []).join('\0') + '\0');
    if (p.exe) fs.symlinkSync(p.exe, join(dir, 'exe'));
  }
  fs.mkdirSync(join(root, 'self'));
  return root;
}
const WORKER = ['/home/u/.local/share/cua/node/bin/node', '/c/src/repl-host/trusted-worker.mjs'];
const VENDOR = '/s/runtimes/r/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64';
const OWN = '/s/engine/linux/cua-engine';

test('engineKind names cua-engine and the vendor helper by their executable, nothing else', () => {
  assert.equal(engineKind(OWN), 'cua');
  assert.equal(engineKind(VENDOR), 'vendor');
  assert.equal(engineKind('/usr/bin/sky_linux_arm64'), 'vendor');
  assert.equal(engineKind('/usr/bin/node'), null);
  assert.equal(engineKind('/x/cua-engine.old'), null);
});

test('engineProcesses finds the engines among the descendants of the root, each with its parent\'s script', () => {
  const proc = fakeProc({
    100: {ppid: 1, exe: '/usr/bin/node', cmdline: ['node', 'serve-native.mjs']},
    101: {ppid: 100, exe: '/usr/bin/node', cmdline: ['node', 'anchor.mjs']},
    102: {ppid: 101, exe: WORKER[0], cmdline: WORKER},
    103: {ppid: 102, exe: OWN, cmdline: [OWN, 'server']},
    // Another session's engine, under another serve: never this root's.
    200: {ppid: 1, exe: '/usr/bin/node', cmdline: ['node', 'cua', 'serve']},
    201: {ppid: 200, exe: VENDOR, cmdline: [VENDOR, 'server']},
    // A descendant that is no engine, and one whose exe cannot be read.
    104: {ppid: 102, exe: '/usr/bin/gio', cmdline: ['gio', 'launch']},
    105: {ppid: 102, cmdline: []},
  });
  assert.deepEqual(engineProcesses(100, {proc}), [{pid: 103, exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'}]);
  assert.deepEqual(engineProcesses(200, {proc}), [{pid: 201, exe: VENDOR, kind: 'vendor', parent: 'cua'}]);
  assert.deepEqual(engineProcesses(999, {proc}), []);
});

test('mergeObservations keeps each distinct engine once, whatever the pid', () => {
  const a = {pid: 1, exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'};
  assert.deepEqual(mergeObservations([a], [{...a, pid: 2}, {...a, exe: VENDOR, kind: 'vendor'}]),
    [{exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'}, {exe: VENDOR, kind: 'vendor', parent: 'trusted-worker.mjs'}]);
});

test('engineAnsweredProblem: sound only when the requested engine, at the expected executable, answered alone as the trusted worker\'s child', () => {
  const own = {exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'}, vendor = {exe: VENDOR, kind: 'vendor', parent: 'trusted-worker.mjs'};
  assert.equal(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [own]}, 'run'), null);
  assert.equal(engineAnsweredProblem({requested: 'vendor', expected: VENDOR, observed: [vendor]}, 'run'), null);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: []}, 'run'), /^run: no engine process answered/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [vendor]}, 'run'), /sky_linux_x64 \(vendor\) answered, not the requested cua engine at .*cua-engine/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [own, vendor]}, 'run'), /answered, not the requested/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [{...own, exe: '/other/cua-engine'}]}, 'run'), /\/other\/cua-engine \(cua\) answered/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [{...own, parent: 'bash'}]}, 'run'), /a child of bash, not of the trusted worker/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: VENDOR, observed: [vendor]}, 'run'), /expected executable .* is not a cua engine/);
  assert.match(engineAnsweredProblem({requested: 'cua', expected: null, error: 'no engine installed', observed: []}, 'run'), /no expected cua engine \(no engine installed\)/);
  assert.match(engineAnsweredProblem({requested: 'sky', expected: OWN, observed: [own]}, 'run'), /requested engine sky/);
  assert.match(engineAnsweredProblem(undefined, 'run'), /records no engine observation/);
  // Review fix 3: an interval nobody observed is never covered by the observations around it.
  assert.match(engineAnsweredProblem({requested: 'cua', expected: OWN, observed: [own], sampleError: 'proc unreadable'}, 'run'), /^run: an engine observation failed \(proc unreadable\)/);
});

test('laneEngineProblem: a run that names its engine has a sound observation for every native case', async () => {
  const {laneEngineProblem} = await import('../../scripts/repl-parity/engine-answered.mjs');
  const own = {exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'};
  const entry = id => ({case: id, connection: 'connection-2', requested: 'cua', expected: OWN, observed: [own]});
  const meta = {engine: 'cua', caseIds: ['native/a', 'native/b', 'cells/x'], engineAnswered: [entry('native/a'), entry('native/b')]};
  assert.equal(laneEngineProblem(meta), null);
  assert.equal(laneEngineProblem({caseIds: ['native/a']}), null, 'a run from before the engine lanes names no engine');
  assert.match(laneEngineProblem({...meta, engineAnswered: [entry('native/a')]}), /native\/b: records no engine observation/);
  assert.match(laneEngineProblem({...meta, engineAnswered: [entry('native/a'), {...entry('native/b'), observed: []}]}), /native\/b: no engine process answered/);
  assert.match(laneEngineProblem({...meta, engineAnswered: [entry('native/a'), {...entry('native/b'), requested: 'vendor'}]}), /native\/b: the lane requested cua, the observation vendor/);
  assert.match(laneEngineProblem({...meta, engineAnswered: [entry('native/a'), entry('native/a'), entry('native/b')]}), /native\/a: observed twice/);
});

test('engineWitness: before every tool result it writes what answered, and forwards every line unchanged', async () => {
  const {engineWitness, ENGINE_NOTIFICATION} = await import('../../scripts/repl-parity/engine-answered.mjs');
  const lines = [];let n = 0;
  const sink = {write: chunk => { lines.push(...String(chunk).split('\n').filter(Boolean)); return true; }};
  const witness = engineWitness(sink, {record: {requested: 'cua', expected: OWN, error: null}, sample: () => [{pid: ++n, exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'}]});
  const init = JSON.stringify({jsonrpc: '2.0', id: 1, result: {serverInfo: {name: 'x'}}});
  const tool = JSON.stringify({jsonrpc: '2.0', id: 2, result: {content: [{type: 'text', text: 'ok'}]}});
  const note = JSON.stringify({jsonrpc: '2.0', method: 'notifications/message', params: {}});
  await new Promise((resolve, reject) => witness.write(init + '\n' + tool.slice(0, 10), e => (e ? reject(e) : resolve())));
  await new Promise((resolve, reject) => witness.write(tool.slice(10) + '\n' + note + '\n', e => (e ? reject(e) : resolve())));
  assert.equal(lines.length, 4);
  assert.equal(lines[0], init);
  assert.deepEqual(JSON.parse(lines[1]), {jsonrpc: '2.0', method: ENGINE_NOTIFICATION, params: {requested: 'cua', expected: OWN, error: null, observed: [{pid: 1, exe: OWN, kind: 'cua', parent: 'trusted-worker.mjs'}]}});
  assert.equal(lines[2], tool);
  assert.equal(lines[3], note);
  const failing = engineWitness(sink, {record: {requested: 'cua', expected: OWN, error: null}, sample: () => { throw new Error('proc unreadable'); }});
  await new Promise(resolve => failing.write(tool + '\n', () => resolve()));
  assert.deepEqual(JSON.parse(lines.at(-2)).params.observed, [], 'a failed sample observes nothing, which the judge refuses');
  assert.equal(JSON.parse(lines.at(-2)).params.sampleError, 'proc unreadable');
});

test('expectedEngine: the vendor lane names the runtime\'s helper, the cua lane the named or the installed engine, each by its real path', async () => {
  const {expectedEngine} = await import('../../scripts/repl-parity/engine-answered.mjs');
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-engine-expected-'))); scratches.push(home);
  const bin = join(home, 'build', 'cua-engine'); fs.mkdirSync(join(home, 'build')); fs.writeFileSync(bin, '', {mode: 0o755});
  fs.symlinkSync(bin, join(home, 'linked-engine'));
  const sky = join(home, 'sky_linux_x64'); fs.writeFileSync(sky, '', {mode: 0o755});
  const runtime = () => ({paths: {skyLinuxBin: sky}});
  assert.deepEqual(expectedEngine({engine: 'vendor', home, runtime}), {requested: 'vendor', expected: sky, error: null});
  assert.deepEqual(expectedEngine({engine: 'cua', home, engineBin: join(home, 'linked-engine'), runtime}), {requested: 'cua', expected: bin, error: null});
  const missing = expectedEngine({engine: 'cua', home, runtime});
  assert.equal(missing.expected, null);
  assert.match(missing.error, /no engine is installed at .*engine\/linux\/cua-engine/);
  fs.mkdirSync(join(home, 'engine', 'linux'), {recursive: true}); fs.copyFileSync(bin, join(home, 'engine', 'linux', 'cua-engine'));
  assert.equal(expectedEngine({engine: 'cua', home, runtime}).expected, join(home, 'engine', 'linux', 'cua-engine'));
  assert.match(expectedEngine({engine: 'vendor', home, runtime: () => { throw new Error('no runtime'); }}).error, /no runtime/);
});
