// The pause for GUI-bound groups on the mini (scripts/mini-pause.mjs, MAWS DL 58), with doubles only: the watcher's
// readings, the pause file, the parity runner's cell boundary and timings, and the TextEdit sitting's sessions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NO_PAUSE, pauseGate, pauseReading, pausing, watchPause} from '../scripts/mini-pause.mjs';
import {runRawScenario} from '../scripts/repl-parity/runner.mjs';
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
  assert.deepEqual(pauseReading({exec: exec()}), {pause: false, reason: 'idle'});
  assert.deepEqual(pauseReading({exec: exec({busy: 'true'})}), {pause: true, reason: 'runner busy'});
  assert.deepEqual(pauseReading({exec: exec({workers: 1})}), {pause: true, reason: '1 Runner.Worker'});
  assert.deepEqual(pauseReading({exec: exec({queued: 2})}), {pause: true, reason: '2 queued macOS job(s)'});
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
  const sleeps = [], states = [], mirrored = [];
  const ended = await watchPause({file, read, now: clock(), maxReadings: script.length, apartMs: 45_000, pollMs: 15_000,
    sleep: async ms => { sleeps.push(ms); states.push(existsSync(file)); }, mirror: {write: text => mirrored.push(['write', JSON.parse(text).reason]), remove: () => mirrored.push(['remove'])}});
  assert.equal(ended.length, 1);
  assert.equal(ended[0].reason, 'runner busy');
  assert.ok(ended[0].since < ended[0].until);
  assert.equal(existsSync(file), false, 'off after two idle readings');
  assert.deepEqual(states.slice(0, 3), [true, true, true], 'on from the first busy reading, held through busy and a broken idle pair');
  assert.ok(sleeps.filter(ms => ms === 45_000).length >= 2, 'the idle readings are apartMs apart');
  assert.deepEqual(mirrored, [['write', 'runner busy'], ['remove']], 'the mini\'s copy follows the file');
});

test('the cell boundary waits while the pause file exists, records the pause, and never aborts', async t => {
  const file = join(scratch(t), 'pause.json');
  const recorded = [];
  const off = pauseGate({file, record: p => recorded.push(p)});
  assert.equal(await off.wait('cell-1'), null, 'no file: no wait');
  writeFileSync(file, JSON.stringify({since: 'x', reason: 'runner busy'}));
  let polls = 0;
  const gate = pauseGate({file, now: clock(), record: p => recorded.push(p), sleep: async () => { if (++polls === 500) rmSync(file); }});
  const pause = await gate.wait('cells/x cell-2');
  assert.equal(polls, 500, 'it waited as long as the file stayed, with no limit');
  assert.deepEqual({where: pause.where, reason: pause.reason}, {where: 'cells/x cell-2', reason: 'runner busy'});
  assert.ok(pause.startedAt < pause.endedAt);
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
    active: () => active, reason: () => 'runner busy', note: p => notes.push(p),
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
