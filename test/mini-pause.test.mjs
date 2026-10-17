// The pause for GUI-bound groups on the mini (scripts/mini-pause.mjs, MAWS DL 58), with doubles only: the watcher's
// readings, the pause file, the parity runner's cell boundary and timings, and the TextEdit sitting's sessions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NO_PAUSE, PauseLost, heartbeatOf, pauseGate, pauseReading, pausing, watchPause} from '../scripts/mini-pause.mjs';
import {AttestedConnections, runRawScenario, usePauseGate} from '../scripts/repl-parity/runner.mjs';
import {REPO} from './fixtures/runtime-fixture.mjs';
import {timed} from './repl-parity/scenarios/timing.mjs';

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-pause-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
const clock = () => { let n = 0; return () => new Date(Date.UTC(2026, 9, 17, 12, 0, n++)); };

// The live observation behind a reading: gh for the runner and its queue, ssh for the mini's workers.
function exec({busy = 'false', queued = 0, workers = 0, ghFails = false} = {}) {
  return (cmd, args) => {
    if (cmd === 'gh') {
      if (ghFails) throw new Error('HTTP 502');
      const path = args[1];
      if (path.endsWith('/runners')) return `${busy}\n`;
      if (path.includes('/runs?status=queued')) return JSON.stringify({workflow_runs: queued ? [{id: 7}] : [], total_count: queued ? 1 : 0});
      if (path.includes('/runs?status=in_progress')) return JSON.stringify({workflow_runs: [], total_count: 0});
      if (path.includes('/runs/7/jobs')) return JSON.stringify({jobs: Array.from({length: queued}, () => ({status: 'queued', labels: ['macOS']})), total_count: queued});
    }
    if (cmd === 'ssh') return `pgrep_status=${workers ? 0 : 1}\nworkers=${workers}\n 12:00 up 1 day, load averages: 1.10 1.20 1.30\n`;
    throw new Error(`unexpected ${cmd}`);
  };
}

test('a reading is a pause when the runner is busy, a Runner.Worker runs or a macOS job is queued, or when it cannot be read', () => {
  assert.deepEqual(pauseReading({exec: exec()}), {pause: false, reason: 'idle', seen: []});
  assert.deepEqual(pauseReading({exec: exec({busy: 'true'})}), {pause: true, reason: 'runner busy', seen: []});
  assert.deepEqual(pauseReading({exec: exec({workers: 1})}), {pause: true, reason: '1 Runner.Worker', seen: []});
  assert.deepEqual(pauseReading({exec: exec({queued: 2})}), {pause: true, reason: '2 queued macOS job(s)', seen: []});
  const unread = pauseReading({exec: exec({ghFails: true})});
  assert.equal(unread.pause, true);
  assert.match(unread.reason, /^unread \(missing observation: runner state/);
});

test('the watcher turns the pause on at a busy reading and off only after two idle readings, apartMs apart', async t => {
  const file = join(scratch(t), 'pause.json');
  // busy, busy, idle then busy again (holds), idle, idle (off), idle.
  const script = ['runner busy', 'runner busy', 'idle', '1 queued macOS job(s)', 'idle', 'idle', 'idle'];
  let i = 0;
  const read = () => { const reason = script[i++]; return {pause: reason !== 'idle', reason}; };
  const sleeps = [], states = [], mirrored = [], beats = [];
  const ended = await watchPause({file, read, now: clock(), maxReadings: script.length, apartMs: 45_000, pollMs: 15_000,
    sleep: async ms => { sleeps.push(ms); states.push(existsSync(file)); },
    mirror: {path: '/m/pause.json', write: (text, target = '/m/pause.json') => { if (target === '/m/pause.json') mirrored.push(['write', JSON.parse(text).reason]); else beats.push(JSON.parse(text)); },
      remove: (target = '/m/pause.json') => mirrored.push(['remove', target])}});
  assert.equal(ended.length, 1);
  assert.equal(ended[0].reason, 'runner busy');
  assert.ok(ended[0].since < ended[0].until);
  assert.equal(existsSync(file), false, 'off after two idle readings');
  assert.deepEqual(states.slice(0, 3), [true, true, true], 'on from the first busy reading, held through busy and a broken idle pair');
  assert.ok(sleeps.filter(ms => ms === 45_000).length >= 2, 'the idle readings are apartMs apart');
  assert.deepEqual(mirrored, [['write', 'runner busy'], ['remove', '/m/pause.json']], 'the mini\'s copy follows the file');
  assert.ok(beats.length >= script.length, 'a heartbeat with every reading, on the mini too');
  assert.deepEqual([beats[0].generation, beats.at(-1).generation, beats.at(-1).paused], [0, 1, false], 'one pause started: generation 1');
});

test('the cell boundary waits while the pause file exists, records the pause, and never aborts', async t => {
  const file = join(scratch(t), 'pause.json');
  const recorded = [];
  writeFileSync(heartbeatOf(file), JSON.stringify({generation: 0}));
  const off = pauseGate({file, record: p => recorded.push(p)});
  assert.equal(await off.wait('cell-1'), null, 'no file: no wait');
  writeFileSync(file, JSON.stringify({since: 'x', reason: 'runner busy'}));
  writeFileSync(heartbeatOf(file), JSON.stringify({generation: 1}));
  let polls = 0;
  const gate = pauseGate({file, record: p => recorded.push(p), sleep: async () => { if (++polls === 500) rmSync(file); }});
  const pause = await gate.wait('cells/x cell-2');
  assert.equal(polls, 500, 'it waited as long as the file stayed, with no limit');
  assert.deepEqual({where: pause.where, reason: pause.reason}, {where: 'cells/x cell-2', reason: 'runner busy'});
  assert.ok(pause.startedAt <= pause.endedAt);
  assert.deepEqual(recorded, [pause], 'the pause is evidence');
  assert.deepEqual(pauseGate({}), NO_PAUSE, 'no pause file configured: never a pause');
});

// A client double for runRawScenario: each js call answers with its code's text.
const client = log => ({
  setElicitationAnswer() {},
  call: async (tool, args) => { log.push(['call', tool, args?.code?.includes('cell-') ? args.code.match(/cell-\d/)[0] : null]); return {content: [{type: 'text', text: 'ok'}], isError: false}; },
});
const scenario = check => ({id: 'cells/fixture', cells: [{label: 'cell-1', code: 'nodeRepl.write("cell-1")'}, {label: 'cell-2', code: 'nodeRepl.write("cell-2")'}, {label: 'cell-3', code: 'nodeRepl.write("cell-3")'}],
  assert: check});

test('the parity runner waits at each cell boundary, marks the cells a pause touched, and drops their timing', async () => {
  const log = [], rows = [], notes = [];
  let active = false;
  // The pause turns on while cell-1 runs (so cell-1 is touched and cell-2 waits), and is off from then on.
  const gate = {
    wait: async where => { log.push(['wait', where]); if (!active) return null; active = false; return {where, reason: 'runner busy', startedAt: 'a', endedAt: 'b'}; },
    begin: () => ({generation: 0}),
    overlapped: (token, where) => { if (!active) return null; const p = {where, reason: 'runner busy', during: true}; notes.push(p); return p; },
  };
  const c = client(log), call = c.call;
  c.call = async (tool, args) => { const out = await call(tool, args); if (args?.code?.includes('cell-1')) active = true; return out; };
  let seen;
  const assertion = await runRawScenario(scenario(input => { seen = input; return {ok: timed(input.timings[0], ms => ms > 1e9) && timed(input.timings[1], ms => ms > 1e9) && input.timings[2] >= 0}; }),
    {client: c, emit: row => rows.push(row), checkout: '/c', reset: false, pause: gate});
  assert.deepEqual(log.filter(e => e[0] === 'wait').map(e => e[1]), ['cells/fixture cell-1', 'cells/fixture cell-2', 'cells/fixture cell-3']);
  assert.ok(log.findIndex(e => e[0] === 'wait' && e[1].endsWith('cell-2')) < log.findIndex(e => e[2] === 'cell-2'), 'the boundary comes before the cell');
  assert.deepEqual(seen.pausedCells, [0, 1]);
  assert.deepEqual(seen.timings.slice(0, 2), [undefined, undefined], 'a paused cell\'s timing is dropped, not judged');
  assert.ok(Number.isFinite(seen.timings[2]));
  assert.equal(assertion.ok, true, 'a timing judgement on a dropped timing holds vacuously');
  assert.deepEqual(rows.filter(r => r.cell).map(r => [r.cell, r.pause?.during ?? (r.pause ? 'waited' : null), Number.isFinite(r.ms)]),
    [['cell-1', true, true], ['cell-2', 'waited', true], ['cell-3', null, true]], 'each row keeps its raw ms and says how a pause touched it');
  assert.equal(notes.length, 1, 'the cell during which the pause turned on is evidence too');
});

test('the TextEdit sitting\'s cells wait out a pause rather than abort', async t => {
  const file = join(scratch(t), 'pause.json');
  writeFileSync(file, JSON.stringify({reason: '1 queued macOS job(s)'}));
  writeFileSync(heartbeatOf(file), JSON.stringify({generation: 1}));
  const recorded = [];
  let polls = 0;
  const gate = pauseGate({file, record: p => recorded.push(p), sleep: async () => { if (++polls === 1000) rmSync(file); }});
  const calls = [];
  const session = pausing({tag: 'session', js(code) { calls.push([code, polls]); return Promise.resolve({result: {content: []}, self: this.tag}); }}, gate, 'the TextEdit sitting\'s a cell');
  const reply = await session.js('typeText');
  assert.deepEqual(calls, [['typeText', 1000]], 'the cell ran once, after the pause ended');
  assert.equal(reply.self, 'session', 'the session\'s own method, bound');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].where, 'the TextEdit sitting\'s a cell');
  const source = readFileSync(new URL('../scripts/accept/textedit.mjs', import.meta.url), 'utf8');
  assert.match(source, /const session = pausing\(openSession\(/, 'the sitting opens every session through the pause');
  assert.match(source, /pauseFile = process\.env\.CUA_PAUSE_FILE/);
});

// Review fixes (#115 M1 harness review).
test('a watcher that fails keeps a pause in place and exits non-zero; it never removes the pause on its way out', async t => {
  const dir = scratch(t);
  mkdirSync(join(dir, 'bin'));
  // gh reads a busy runner; ssh (the mirror's write) fails.
  writeFileSync(join(dir, 'bin', 'gh'), '#!/bin/sh\ncase "$*" in *runners*) echo true ;; *jobs*) echo \'{"jobs":[],"total_count":0}\' ;; *) echo \'{"workflow_runs":[],"total_count":0}\' ;; esac\n');
  writeFileSync(join(dir, 'bin', 'ssh'), '#!/bin/sh\ncase "$*" in *pgrep*) printf "pgrep_status=1\\nworkers=0\\n load averages: 0.5\\n" ;; *) exit 255 ;; esac\n');
  for (const name of ['gh', 'ssh']) chmodSync(join(dir, 'bin', name), 0o755);
  const file = join(dir, 'pause.json');
  const child = spawn(process.execPath, ['scripts/mini-pause.mjs', 'watch', '--file', file, '--mirror', '/remote/pause.json'], {cwd: REPO, stdio: 'ignore', env: {PATH: `${join(dir, 'bin')}:/usr/bin:/bin`, HOME: dir}});
  const code = await Promise.race([new Promise(r => child.on('exit', r)), new Promise(r => setTimeout(() => { child.kill('SIGKILL'); r('hung'); }, 20_000))]);
  assert.equal(code, 1, 'the failure is the watcher\'s exit status');
  assert.equal(existsSync(file), true, 'fail closed: the pause stays for the group to see');
  assert.match(JSON.parse(readFileSync(file, 'utf8')).reason, /runner busy|the pause watcher failed/);
});

test('a watcher whose heartbeat goes stale is lost: a stopping group stops, a waiting one stays paused until it beats again', async t => {
  const file = join(scratch(t), 'pause.json');
  const stop = pauseGate({file, sleep: async () => {}});
  await assert.rejects(stop.wait('cell-1'), PauseLost, 'no heartbeat at all: lost');
  writeFileSync(heartbeatOf(file), '{"generation":0}');
  assert.equal(await stop.wait('cell-1'), null, 'a fresh heartbeat and no pause file: go');
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(heartbeatOf(file), old, old);
  await assert.rejects(stop.wait('cell-2'), /the pause watcher is gone/);
  let polls = 0;
  const wait = pauseGate({file, onLost: 'wait', sleep: async () => { if (++polls === 50) writeFileSync(heartbeatOf(file), '{"generation":0}'); }});
  const pause = await wait.wait('the TextEdit sitting\'s a cell');
  assert.equal(polls, 50, 'it stayed paused until the watcher beat again');
  assert.equal(pause.reason, 'the pause watcher has no heartbeat');
});

test('a pause that began and ended while a cell ran still overlaps it, by the watcher\'s pause generation', t => {
  const file = join(scratch(t), 'pause.json');
  writeFileSync(heartbeatOf(file), '{"generation":3}');
  const recorded = [];
  const gate = pauseGate({file, record: p => recorded.push(p)});
  const quiet = gate.begin();
  assert.equal(gate.overlapped(quiet, 'cell-1'), null, 'no pause in between');
  const token = gate.begin();
  writeFileSync(heartbeatOf(file), '{"generation":4}');   // a pause came and went: the file is gone again
  const overlap = gate.overlapped(token, 'cell-2');
  assert.deepEqual(overlap, {where: 'cell-2', reason: 'a pause that began and ended while the cell ran', during: true});
  assert.deepEqual(recorded, [overlap]);
  writeFileSync(file, '{"reason":"runner busy"}');
  assert.equal(gate.overlapped(gate.begin(), 'cell-3').reason, 'runner busy', 'a pause holding at the end overlaps too');
});

test('every js call a parity connection makes waits at the run\'s pause, a lane\'s setup cell included', async t => {
  const dir = scratch(t);
  const server = join(dir, 'server.mjs');
  writeFileSync(server, `import {createInterface} from 'node:readline';
createInterface({input: process.stdin}).on('line', line => { const m = JSON.parse(line); if (m.id === undefined) return;
  const result = m.method === 'initialize' ? {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'fake', version: '0'}} : {content: [{type: 'text', text: 'ran'}], isError: false};
  process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: m.id, result}) + '\\n'); });`);
  const events = [];
  let release;
  const held = new Promise(r => { release = r; });
  usePauseGate({wait: async where => { events.push(['wait', where]); await held; return null; }, begin: () => ({generation: null}), overlapped: () => null});
  t.after(() => usePauseGate(null));
  const pool = new AttestedConnections('vendor');
  const client = await pool.open({command: process.execPath, args: [server]});
  t.after(() => pool.close());
  const setup = client.call('js', {code: 'globalThis.tab = await browser.tabs.new()'}).then(r => { events.push(['answered']); return r; });
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(events, [['wait', 'a js call on connection-1']], 'the setup cell is held at the boundary, not sent');
  release();
  const result = await setup;
  assert.equal(result.content[0].text, 'ran');
  assert.deepEqual(events.map(e => e[0]), ['wait', 'answered']);
  assert.equal(typeof setup.requestId === 'undefined' || typeof setup.requestId === 'number', true);
});

// Runner.Worker readings and long pauses (#115 M1, from CI-opt's evidence).
test('a reading that sees a Runner.Worker logs it, and a pause over 20 minutes is recorded once, in the log and the heartbeat', async t => {
  const file = join(scratch(t), 'pause.json');
  const worker = {pid: 4242, etime: '01:02', command: '/Users/new/actions-runner-maws/bin/Runner.Worker spawnclient 1 2', ppid: 4200, parent: '/Users/new/actions-runner-maws/bin/Runner.Listener run'};
  let ms = Date.UTC(2026, 9, 17, 12), readings = 0;
  const lines = [], beats = [];
  await watchPause({file, exec: null, now: () => new Date(ms), sleep: async wait => { ms += wait; beats.push(JSON.parse(readFileSync(heartbeatOf(file), 'utf8'))); },
    log: line => lines.push(line), maxReadings: 100,
    read: () => ++readings <= 90 ? {pause: true, reason: '1 Runner.Worker', seen: [worker]} : {pause: false, reason: 'idle', seen: []}});
  assert.equal(lines.filter(line => line === 'Runner.Worker seen: pid 4242 (elapsed 01:02) /Users/new/actions-runner-maws/bin/Runner.Worker spawnclient 1 2; parent 4200 /Users/new/actions-runner-maws/bin/Runner.Listener run').length, 90,
    'every worker reading says what it saw');
  const long = lines.filter(line => line.startsWith('pause over 20 minutes'));
  assert.equal(long.length, 1, lines.join('\n'));
  assert.match(long[0], /since 2026-10-17T12:00:00\.000Z \(1 Runner\.Worker\); report it to the runner's operator/);
  assert.deepEqual(beats.find(b => b.longPause)?.longPause, {since: '2026-10-17T12:00:00.000Z', reason: '1 Runner.Worker'});
  assert.equal(beats.at(-1).longPause, undefined, 'it ends with the pause');
});

test('the harness surfaces a pause the watcher marked as over 20 minutes on stderr, once', async t => {
  const file = join(scratch(t), 'pause.json');
  writeFileSync(file, JSON.stringify({since: '2026-10-17T12:00:00.000Z', reason: 'runner busy'}));
  writeFileSync(heartbeatOf(file), JSON.stringify({generation: 1, paused: true, longPause: {since: '2026-10-17T12:00:00.000Z', reason: 'runner busy'}}));
  const warned = [];
  let polls = 0;
  const gate = pauseGate({file, warn: line => warned.push(line), sleep: async () => { if (++polls === 5) rmSync(file); }});
  await gate.wait('cell-1');
  assert.equal(warned.length, 1);
  assert.match(warned[0], /pause over 20 minutes since 2026-10-17T12:00:00\.000Z \(runner busy\), held at cell-1: report it to the runner's operator/);
  assert.match(readFileSync(new URL('../scripts/mini-pause.mjs', import.meta.url), 'utf8'), /warn = line => console\.error\(/, 'stderr by default');
});
