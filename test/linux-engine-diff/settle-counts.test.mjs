// Ruling 827's condition and rulings 832/834 (#171 M5, task 103): every cua engine's `--stats` settle counter
// (`drop_settles`) kept per step in `settle-counts.json`, from the stats lines the run already has, and `--stats` turned
// on for every cua lane only by the opt-in `--engine-stats`, which a counted run refuses. The checker
// (scripts/linux-engine-gate/settle-check.mjs) reads the record: taken, not taken, or unknown, never a missing record
// read as not taken.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { Engine, cuaBuild, isCuaVersion, recordEngines } from '../../scripts/linux-engine-diff/engine.mjs';
import { SETTLE_COUNTS, checkSteps, settleVerdict } from '../../scripts/linux-engine-diff/settle-counts.mjs';
import { GateRefused, parseGateArgs } from '../../scripts/linux-engine-gate/gate.mjs';
import { stepArgs, stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';

const CHECKER = fileURLToPath(new URL('../../scripts/linux-engine-gate/settle-check.mjs', import.meta.url));

// A stand-in engine speaking the wire. It keeps its argv beside itself, writes a log line to stderr for every request,
// and only under `--stats` writes the engine's lines: an untied one (`"id": null`) before request 2's answer, and each
// request's own after its answer, carrying `drop_settles` from FAKE_SETTLES (one record per request; none when unset).
// At its stdin's end (the engine's shutdown) it writes FAKE_EXIT's lines under `--stats`, then exits.
const FAKE = `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const { createInterface } = require('node:readline');
const args = process.argv.slice(2);
appendFileSync(__filename + '.argv.jsonl', JSON.stringify(args) + '\\n');
const stats = args.includes('--stats');
const settles = process.env.FAKE_SETTLES ? JSON.parse(process.env.FAKE_SETTLES) : null;
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, command } = JSON.parse(line);
  process.stderr.write('log: request ' + id + '\\n');
  if (stats && id === 2) process.stderr.write(JSON.stringify({ stats: { id: null, focus_out: [{ window: 7 }] } }) + '\\n');
  process.stdout.write(JSON.stringify({ id, ok: true, output: { command } }) + '\\n');
  if (stats) process.stderr.write(JSON.stringify({ stats: { id, command, ...(settles ? { drop_settles: settles[id - 1] } : {}) } }) + '\\n');
}).on('close', () => {
  const exit = stats && process.env.FAKE_EXIT ? JSON.parse(process.env.FAKE_EXIT) : [];
  process.stderr.write(exit.map((l) => JSON.stringify(l) + '\\n').join(''), () => process.exit(0));
});
`;

function fakeEngine(dir, name = 'fake-engine.cjs') {
  const bin = join(dir, name);
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o700);
  return bin;
}

const argvOf = (bin) => readFileSync(`${bin}.argv.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const counts = (entered, second_rest = 0, skipped = 0, unsettled = 0) => ({ entered, second_rest, skipped, unsettled });

/** Three requests on one engine, then closed: every answer whole, as a runner sees it. */
async function drive(engine) {
  engine.start();
  const answers = [];
  try {
    for (const command of ['drag', 'get_window_state', 'drag']) {
      const { ms, sinceSpawnMs, ...rest } = await engine.request(command, {});
      answers.push(rest);
    }
  } finally {
    await engine.close();
  }
  return { answers, tail: engine.stderrTail };
}

const withDir = async (prefix, fn) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('without --engine-stats every engine starts as it does today: --stats only where the runner asks, and no build probed', async () => {
  await withDir('cua171-settle-off-', async (dir) => {
    const bin = fakeEngine(dir);
    const out = join(dir, 'out');
    let probed = 0;
    const finish = recordEngines({ out, run: 'r', vendors: [], optIn: false, isCuaBuild: () => (probed += 1) > 0 });
    try {
      const plain = await drive(new Engine({ label: 'cua', bin, args: ['--drag-step-ms', '0'] }));
      const asked = await drive(new Engine({ label: 'cua:stats', bin, stats: true }));
      assert.deepEqual(argvOf(bin), [['server', '--drag-step-ms', '0'], ['server', '--stats']], "today's argv, byte for byte");
      assert.equal(probed, 0, 'no build is probed when the run did not opt in');
      assert.deepEqual(plain.answers.map((a) => [a.stats, a.untied]), [[null, []], [null, []], [null, []]]);
      assert.deepEqual(asked.answers[1].untied, [{ id: null, focus_out: [{ window: 7 }] }], "the runner's own --stats lines reach it as before");
      assert.equal(plain.tail, 'log: request 1\nlog: request 2\nlog: request 3\n');
    } finally {
      finish();
    }
    assert.equal(existsSync(join(out, 'engine-stats')), false, 'no stats file is written without the opt-in');
  });
});

test('with --engine-stats a cua lane gets --stats once, a vendor lane none, and the runner sees exactly what it saw without it', async () => {
  await withDir('cua171-settle-on-', async (dir) => {
    const cua = fakeEngine(dir, 'cua-engine.cjs');
    const vendor = fakeEngine(dir, 'sky.cjs');
    const run = async (optIn) => {
      const finish = recordEngines({ out: join(dir, optIn ? 'on' : 'off'), run: 'r', vendors: [vendor], optIn, isCuaBuild: (bin) => bin === cua });
      try {
        return {
          cua: await drive(new Engine({ label: 'cua', bin: cua })),
          vendor: await drive(new Engine({ label: 'pinned', bin: vendor })),
          asked: await drive(new Engine({ label: 'cua:asked', bin: cua, stats: true })),
        };
      } finally {
        finish();
      }
    };
    const off = await run(false);
    const on = await run(true);
    assert.deepEqual(argvOf(cua), [['server'], ['server', '--stats'], ['server', '--stats'], ['server', '--stats']], 'off: cua, asked; on: cua, asked (never twice)');
    assert.deepEqual(argvOf(vendor), [['server'], ['server']], 'a vendor lane never gets --stats');
    // the parsed stream: every answer, its stats and untied lines, and the stderr tail an exit's error quotes
    assert.deepEqual(on, off, 'the opt-in changes nothing a runner reads');
    assert.equal(on.cua.answers.every((a) => a.stats === null && a.untied.length === 0), true);
    const files = readdirSync(join(dir, 'on', 'engine-stats'));
    assert.equal(files.length, 2, "one stats file per engine with --stats: the cua lane's and the asked lane's");
    const lane = readFileSync(join(dir, 'on', 'engine-stats', files.find((f) => f.includes('.cua.'))), 'utf8').trim().split('\n');
    assert.equal(lane.length, 4, "the cua lane's stats lines, the untied one included, in its own file");
    assert.equal(lane.every((l) => l.startsWith('{"stats"')), true);
  });
});

test("settle-counts.json keeps each engine's last drop_settles by lane and pid, and a lane with no stats as not recorded", async () => {
  await withDir('cua171-settle-record-', async (dir) => {
    const cua = fakeEngine(dir, 'cua-engine.cjs');
    const vendor = fakeEngine(dir, 'sky.cjs');
    const out = join(dir, 'out');
    const finish = recordEngines({ out, run: 'm5-dev-D1', vendors: [vendor], optIn: false });
    let pid;
    try {
      // the counter is cumulative per engine process: 1, then 2, then 2
      const engine = new Engine({ label: 'cua', bin: cua, stats: true, env: { ...process.env, FAKE_SETTLES: JSON.stringify([counts(1), counts(2, 1), counts(2, 1)]) } });
      await drive(engine);
      pid = engine.pid;
      await drive(new Engine({ label: 'cua:0ms', bin: cua }));
      await drive(new Engine({ label: 'pinned', bin: vendor }));
      // a run's candidate copy is removed before the harness ends (runDiff): the engines are identified at launch
      rmSync(cua);
      rmSync(vendor);
    } finally {
      finish();
    }
    const record = JSON.parse(readFileSync(join(out, SETTLE_COUNTS), 'utf8'));
    const [proc] = record.processes;
    assert.equal(proc.run, 'm5-dev-D1');
    const byLane = Object.fromEntries(proc.engines.map((e) => [e.lane, e]));
    assert.equal(byLane.cua.pid, pid);
    assert.equal(byLane.cua.build, 'cua');
    assert.equal(byLane.cua.final, false, 'this stand-in writes no snapshot after its shutdown');
    assert.deepEqual(byLane.cua.drop_settles, counts(2, 1), 'the last line of the engine, not a sum of its lines');
    assert.equal(byLane['cua:0ms'].drop_settles, null);
    assert.equal(byLane['cua:0ms'].build, 'unidentified', 'an engine with no stats that is no vendor build the run named may be a cua lane');
    assert.equal(byLane['cua:0ms'].recorded, 'no stats: not recorded');
    assert.deepEqual(byLane['cua:0ms'].sent, { drag: 2, get_window_state: 1 }, 'what the harness sent it, by command');
    assert.equal(byLane.pinned.build, 'vendor');
    const verdict = settleVerdict(record);
    assert.equal(verdict.state, 'taken', "the cua lane's counter shows the branch run");
    assert.deepEqual(verdict.counts, counts(2, 1));
    assert.match(verdict.unknown.join('\n'), /cua:0ms \d+: no stats: not recorded/, 'the lane with no stats listed as not recorded, never as zero');
  });
});

test('the checker: not taken only when every cua engine recorded zeros; a taken branch flagged; anything missing unknown', () => {
  const engine = (lane, pid, dropSettles, extra = {}) => ({ lane, pid, build: 'cua', drop_settles: dropSettles, recorded: dropSettles ? 'recorded' : 'no stats: not recorded', ended: true, final: Boolean(dropSettles), unparsable: 0, ...extra });
  const record = (...engines) => ({ processes: [{ run: 'r', engines }] });
  const vendorOnly = { lane: 'pinned', pid: 9, build: 'vendor', drop_settles: null, recorded: 'no stats: not recorded', ended: true, final: false, unparsable: 0 };
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0)), engine('cua:0ms', 2, counts(0)), vendorOnly)).state, 'not taken', 'a vendor lane has no counter and asks for none');
  const taken = settleVerdict(record(engine('cua', 1, counts(0)), engine('cua', 2, counts(3, 1, 0, 1))));
  assert.equal(taken.state, 'taken');
  assert.deepEqual(taken.counts, counts(3, 1, 0, 1));
  assert.equal(settleVerdict(record(engine('cua', 1, { entered: 0, second_rest: 1, skipped: 0, unsettled: 0 }))).state, 'taken', 'a second rest taken is the branch run');
  // a counter that resets per engine: each engine's last value, summed over the engines (3 + 1), never its lines' sum
  assert.deepEqual(settleVerdict(record(engine('cua', 1, counts(3)), engine('cua', 2, counts(1)))).counts, counts(4));
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0)), engine('reset', 2, null))).state, 'unknown', 'one cua engine without stats makes the step unknown');
  assert.equal(settleVerdict(record(engine('cua', 1, null, { recorded: 'stats without drop_settles: not recorded' }))).state, 'unknown', 'an engine before 0.4.1 prints no counter');
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0), { ended: false }))).state, 'unknown', 'an engine still running when the harness ended may have lines unread');
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0), { unparsable: 1 }))).state, 'unknown', 'a line that did not parse may have been the last');
  assert.equal(settleVerdict(record(vendorOnly)).state, 'unknown', 'no cua engine recorded at all');
  assert.equal(settleVerdict(null).state, 'unknown', 'no record');
  // the settle runs only inside a `drag` or a `drag_handle` (0.4.1's engine.rs dispatch, pointer.rs and handle.rs): an
  // engine without a counter that was sent neither cannot have run it, and one that was sent a drag stays unknown
  const reader = engine('reader', 3, null, { sent: { list_windows: 4, get_window_state: 2 } });
  const helper = settleVerdict(record(engine('cua', 1, counts(0)), reader));
  assert.equal(helper.state, 'not taken');
  assert.equal(helper.undragged, 1);
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0)), engine('restore', 4, null, { sent: { drag_handle: 1 } }))).state, 'unknown');
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0)), engine('old', 5, null))).state, 'unknown', 'a record without what was sent is never read as no drag');
  assert.equal(settleVerdict(record(reader)).state, 'unknown', 'no cua engine recorded its counter');
  // fix wave 1, finding 1: a zero is final only when the engine's own post-shutdown snapshot carried it (its exit can
  // end a held handle, which can settle); a positive count always wins
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0), { final: false }))).state, 'unknown', 'a zero read before the shutdown');
  assert.match(settleVerdict(record(engine('cua', 1, counts(0), { final: false }))).unknown[0], /no post-shutdown snapshot/);
  assert.equal(settleVerdict(record(engine('cua', 1, counts(1), { final: false }))).state, 'taken');
  // finding 2: an engine the run could not identify as a vendor build is held to the counter as a cua lane is
  assert.equal(settleVerdict(record(engine('cua', 1, counts(0)), engine('lane', 6, null, { build: 'unidentified', sent: { drag: 1 } }))).state, 'unknown');
  // finding 5: the whole snapshot is kept and summed; reach is still entered and second_rest
  const whole = settleVerdict(record(engine('cua', 1, { ...counts(0), settle_failed_activation_confirmed: 1 }), engine('cua', 2, { ...counts(0), settle_failed_activation_confirmed: 2 })));
  assert.equal(whole.state, 'not taken');
  assert.equal(whole.counts.settle_failed_activation_confirmed, 3);
  // a taken branch wins over an unknown one: the step reruns as class A whatever else it left unrecorded
  assert.equal(settleVerdict(record(engine('cua', 1, counts(1)), engine('reset', 2, null))).state, 'taken');
});

test('settle-check.mjs prints each step and exits 0 only when every named step shows the branch not taken', async () => {
  await withDir('cua171-settle-check-', async (dir) => {
    const step = (name, engines) => {
      const run = join(dir, name, 'run');
      mkdirSync(run, { recursive: true });
      if (engines) writeFileSync(join(run, SETTLE_COUNTS), JSON.stringify({ processes: [{ run: name, engines }] }));
      return join(dir, name);
    };
    const cua = (pid, c) => ({ lane: 'cua', pid, build: 'cua', drop_settles: c, recorded: c ? 'recorded' : 'no stats: not recorded', ended: true, final: Boolean(c), unparsable: 0 });
    const clear = step('D1.development-run.pilot', [cua(1, counts(0)), cua(2, counts(0))]);
    const taken = step('D2.development-run.pilot', [cua(3, counts(2, 1))]);
    const missing = step('D3.development-run.pilot', null);
    const check = (...dirs) => spawnSync(process.execPath, [CHECKER, ...dirs], { encoding: 'utf8' });
    const ok = check(clear);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /D1\.development-run\.pilot: not taken \(entered 0, second_rest 0, skipped 0, unsettled 0; 2 cua engines\)/);
    const all = check(clear, taken, missing);
    assert.equal(all.status, 1);
    assert.match(all.stdout, /D2\.development-run\.pilot: TAKEN \(entered 2, second_rest 1, skipped 0, unsettled 0; 1 cua engine\)/);
    assert.match(all.stdout, /D3\.development-run\.pilot: unknown: no settle-counts\.json/);
    assert.equal(check().status, 2, 'no step named');
  });
});

test('--engine-stats is a development run\'s: a counted run refuses it, before anything starts', () => {
  const verdict = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'type_text', '--out', '/o'];
  const experiment = ['--experiment', 'drag', '--vendor', '/v', '--cua', '/c', '--out', '/o'];
  assert.equal(parseArgs([...verdict, '--dev', '--engine-stats']).engineStats, true);
  assert.equal(parseArgs([...experiment, '--engine-stats']).engineStats, true);
  assert.equal(parseArgs([...experiment, '--pinned', '--pilot', '--engine-stats']).engineStats, true, 'a pilot on the pinned release is never counted');
  assert.equal(parseArgs(experiment).engineStats, undefined);
  for (const counted of [[...verdict, '--engine-stats'], [...verdict, '--pinned', '--engine-stats'], [...experiment, '--gate', '--engine-stats'], [...experiment, '--pinned', '--engine-stats']]) {
    assert.throws(() => parseArgs(counted), /--engine-stats is a development run's/, counted.join(' '));
  }
  // the gate runner passes it to a development step, refuses it on a counted one and on a step that does not start its
  // engines through engine.mjs
  const gate = (...extra) => parseGateArgs(['run', 'D1', '--candidate', '/c', '--out', '/o', ...extra]);
  assert.equal(gate('--dev', '--pilot', '2', '--engine-stats').engineStats, true);
  assert.throws(() => gate('--engine-stats'), (e) => e instanceof GateRefused && /--engine-stats is a development run's/.test(e.message));
  assert.throws(() => parseGateArgs(['run', 'D1', '--pinned', '/h', '--out', '/o', '--engine-stats']), (e) => e instanceof GateRefused && /--engine-stats/.test(e.message));
  assert.equal(parseGateArgs(['run', 'D1', '--pinned', '/h', '--out', '/o', '--pilot', '2', '--engine-stats']).engineStats, true);
  for (const name of ['S2', 'ES', 'FB', 'R1']) {
    assert.throws(() => parseGateArgs(['run', name, '--candidate', '/c', '--out', '/o', '--dev', '--engine-stats']), (e) => e instanceof GateRefused && /does not start its engines through engine\.mjs/.test(e.message), name);
  }
  const paths = { vendor: '/v', newest: '/n', candidate: '/c', vendorJs: '/js' };
  assert.equal(stepArgs(stepNamed('D1'), { paths, gate: false, pilot: 2, engineStats: true }).includes('--engine-stats'), true);
  assert.equal(stepArgs(stepNamed('V5'), { paths, gate: false, pilot: 2, engineStats: true }).includes('--engine-stats'), true);
  assert.equal(stepArgs(stepNamed('D1'), { paths, gate: false, pilot: 2 }).includes('--engine-stats'), false);
});

test("a cua build is told by its --version; a file that is no ELF executable is never run to ask", async () => {
  assert.equal(isCuaVersion('cua-engine 0.4.1 (64479931aaaa)\n'), true);
  assert.equal(isCuaVersion("error: unexpected argument '--version' found\n"), false);
  assert.equal(isCuaVersion(''), false);
  await withDir('cua171-settle-probe-', async (dir) => {
    const bin = fakeEngine(dir);
    assert.equal(cuaBuild(bin), false);
    assert.equal(existsSync(`${bin}.argv.jsonl`), false, 'the script was never started');
    assert.equal(cuaBuild(join(dir, 'absent')), false);
  });
});

test('checkSteps reads a step directory or the harness out inside it', async () => {
  await withDir('cua171-settle-dirs-', async (dir) => {
    const run = join(dir, 'D1', 'run');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, SETTLE_COUNTS), JSON.stringify({ processes: [{ run: 'r', engines: [{ lane: 'cua', pid: 1, build: 'cua', drop_settles: counts(0), recorded: 'recorded', ended: true, final: true, unparsable: 0 }] }] }));
    assert.equal(checkSteps([join(dir, 'D1')]).code, 0);
    assert.equal(checkSteps([run]).code, 0);
  });
});

test('a zero counts only from the post-shutdown snapshot the engine writes last; its whole record is kept', async () => {
  await withDir('cua171-settle-final-', async (dir) => {
    const bin = fakeEngine(dir, 'cua-engine.cjs');
    const out = join(dir, 'out');
    const zeros = [counts(0), counts(0), counts(0)];
    const run = async (label, exit) => {
      const engine = new Engine({ label, bin, stats: true, env: { ...process.env, FAKE_SETTLES: JSON.stringify(zeros), FAKE_EXIT: JSON.stringify(exit) } });
      await drive(engine);
      return engine.pid;
    };
    const finish = recordEngines({ out, run: 'r', vendors: [], optIn: false });
    try {
      // 0.4.1 today: its exit's line carries no counter, and a held handle the exit ends can settle after the last one
      await run('no-snapshot', [{ stats: { id: null, exit_settle: { waited_ms: 1 } } }]);
      await run('snapshot', [{ stats: { id: null, focus_out: [] } }, { stats: { id: null, exit: true, drop_settles: { ...counts(0), settle_failed_activation_confirmed: 0 } } }]);
      await run('settled-at-exit', [{ stats: { id: null, exit: true, drop_settles: { ...counts(1), settle_failed_activation_confirmed: 0 } } }]);
    } finally {
      finish();
    }
    const record = JSON.parse(readFileSync(join(out, SETTLE_COUNTS), 'utf8'));
    const byLane = Object.fromEntries(record.processes[0].engines.map((e) => [e.lane, e]));
    assert.equal(byLane['no-snapshot'].final, false);
    assert.equal(byLane.snapshot.final, true);
    assert.deepEqual(byLane.snapshot.drop_settles, { ...counts(0), settle_failed_activation_confirmed: 0 }, 'the whole snapshot');
    assert.equal(settleVerdict({ processes: [{ engines: [byLane['no-snapshot']] }] }).state, 'unknown');
    assert.equal(settleVerdict({ processes: [{ engines: [byLane.snapshot] }] }).state, 'not taken');
    assert.equal(settleVerdict({ processes: [{ engines: [byLane['settled-at-exit']] }] }).state, 'taken', 'the handle the exit ended settled');
  });
});

test("a --stats a lane's own args carry is parsed as today, opt-in or not, and never given twice", async () => {
  await withDir('cua171-settle-args-', async (dir) => {
    const bin = fakeEngine(dir, 'cua-engine.cjs');
    const run = async (optIn) => {
      const finish = recordEngines({ out: join(dir, optIn ? 'on' : 'off'), run: 'r', vendors: [], optIn, isCuaBuild: () => true });
      try {
        return await drive(new Engine({ label: 'cua:variant', bin, args: ['--stats'] }));
      } finally {
        finish();
      }
    };
    const off = await run(false);
    const on = await run(true);
    assert.deepEqual(argvOf(bin), [['server', '--stats'], ['server', '--stats']]);
    assert.deepEqual(on, off);
    assert.deepEqual(off.answers[1].untied, [{ id: null, focus_out: [{ window: 7 }] }], "today's parsing: the lane's lines reach its runner");
  });
});

test('--engine-stats is refused where it cannot reach the measured engine: the vendor client and the service-backed experiments', () => {
  const run = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'type_text', '--out', '/o', '--dev'];
  assert.throws(() => parseArgs([...run, '--via', 'vendor-js', '--vendor-js', '/js', '--engine-stats']), /--engine-stats cannot reach/);
  assert.throws(() => parseArgs(['--experiment', 'events', '--vendor', '/v', '--newest', '/n', '--cua', '/c', '--out', '/o', '--via', 'vendor-js', '--vendor-js', '/js', '--engine-stats']), /--engine-stats cannot reach/);
  for (const experiment of ['settle', 'engine-stop']) {
    assert.throws(() => parseArgs(['--experiment', experiment, '--cua', '/c', '--out', '/o', '--engine-stats']), /--engine-stats cannot reach/, experiment);
  }
});
