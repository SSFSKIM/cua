import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { Engine } from '../../scripts/linux-engine-diff/engine.mjs';
import { openSeriesTrace, statsFields } from '../../scripts/linux-engine-diff/run.mjs';

// A stand-in engine speaking the wire: it answers every request ok and writes, for request 1, a `--stats` line that
// does not parse, and for every later request a well-formed one.
const FAKE = `#!${process.execPath}
const { createInterface } = require('node:readline');
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  process.stdout.write(JSON.stringify({ id, ok: true, output: null }) + '\\n');
  process.stderr.write(id === 1 ? '{"stats": {"id": 1, "tree": \\n' : JSON.stringify({ stats: { id, tree: { source: 'at_spi' } } }) + '\\n');
});
`;

test("an unparseable --stats line leaves its request without stats, and the engine's later lines still count", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-engine-stats-'));
  const bin = join(dir, 'fake-engine.cjs');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o700);
  const engine = new Engine({ label: 'cua', bin, stats: true }).start();
  try {
    const first = await engine.request('get_window_state', {});
    assert.equal(first.response.ok, true);
    assert.equal(first.stats, null, 'no stats for a line that does not parse');
    const second = await engine.request('get_window_state', {});
    assert.deepEqual(second.stats, { id: 2, tree: { source: 'at_spi' } });
    assert.match(engine.stderrTail, /unparsable --stats line/);
  } finally {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// A stand-in that, between requests, writes the lines the engine writes on its own (`{"stats": {"id": null, …}}`: an
// after-release watch run out with no request come, engine.rs `tick`) before the next request's answer.
const UNTIED = `#!${process.execPath}
const { createInterface } = require('node:readline');
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  if (id === 2) process.stderr.write(JSON.stringify({ stats: { id: null, focus_out: [{ window: 7 }] } }) + '\\n');
  process.stderr.write(JSON.stringify({ stats: { id, command: 'drag' } }) + '\\n', () => process.stdout.write(JSON.stringify({ id, ok: true, output: null }) + '\\n'));
});
`;

test("each answer carries its request's id, and the engine's own --stats lines between requests are kept with the next answer", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-engine-untied-'));
  const bin = join(dir, 'fake-engine.cjs');
  writeFileSync(bin, UNTIED);
  chmodSync(bin, 0o700);
  const engine = new Engine({ label: 'cua', bin, stats: true }).start();
  try {
    const first = await engine.request('drag', {});
    assert.equal(first.id, 1);
    assert.deepEqual(first.untied, []);
    const second = await engine.request('get_window_state', {});
    assert.equal(second.id, 2);
    assert.deepEqual(second.stats, { id: 2, command: 'drag' });
    assert.deepEqual(second.untied, [{ id: null, focus_out: [{ window: 7 }] }], 'not dropped, and not taken for a request');
    assert.deepEqual((await engine.request('preflight', {})).untied, [], 'each line kept once');
  } finally {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a sample keeps the engine's whole --stats record of its request, with the request's id, beside the fields it is judged on", () => {
  // V5's cold short drop (results.jsonl line 256), the record as the engine wrote it
  const record = {
    id: 1,
    command: 'drag',
    ok: true,
    elapsed_ms: 258.9,
    variant: { settle_ms: 0 },
    bus: { calls: 0, waits: 0, waits_alone: 0, max_in_flight: 0, reply_bytes: 0, peak_staged_bytes: 0, connections: 0, by_member: {} },
    route: 'background',
    dnd: { in_front: true },
    hold: { bound_ms: 250, held: true, taken: false, waited_ms: 201.4 },
    press: { crossed: true, samples: 5, taken: false },
    event_time: { event: 1439356175, server: 1439356176, ahead_ms: -1 },
    focus_ack: { waited_ms: 0.4 },
  };
  const fields = statsFields(record, [{ id: null, focus_out: [{ window: 7 }] }]);
  assert.deepEqual(fields.stats, { calls: 0, waits_alone: 0, max_in_flight: 0, connections: 0 });
  assert.equal(fields.route, 'background');
  assert.deepEqual(fields.hold, record.hold);
  assert.deepEqual(fields.press, record.press);
  assert.deepEqual(fields.engine_stats, record, 'the whole record, fields the judges do not read included');
  assert.equal(fields.engine_stats.id, 1);
  assert.deepEqual(fields.untied_stats, [{ id: null, focus_out: [{ window: 7 }] }]);
  assert.equal('untied_stats' in statsFields(record, []), false, 'none written: none kept');
  assert.deepEqual(statsFields(null, []), {}, 'an engine without --stats');
});

test("a development run's engine X trace: a proxy a series, the engine's display its, each sample's span marked, the trace kept", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-series-trace-'));
  try {
    let bytes = 0;
    const marks = [];
    const proxy = {
      env: { DISPLAY: ':41', XAUTHORITY: '/p/Xauthority', HOME: '/home/x' },
      marks,
      mark: async (tag) => {
        bytes += 100;
        marks.push({ tag, at: bytes });
        return bytes;
      },
      stop: async () => 'Request(25): SendEvent ...\n',
    };
    const trace = await openSeriesTrace({ dir, name: 'device-chrome-dnd.chrome_dnd_short_in_front_shared.cua.0', open: async () => proxy });
    assert.deepEqual(trace.env, { DISPLAY: ':41', XAUTHORITY: '/p/Xauthority' }, "the engine reaches the display through the proxy, nothing else of the harness's");
    assert.deepEqual(await trace.span(0, async () => 'row'), { value: 'row', xtrace: { file: 'device-chrome-dnd.chrome_dnd_short_in_front_shared.cua.0.xtrace', from: 100, to: 200 } });
    await trace.close();
    assert.equal(readFileSync(join(dir, 'device-chrome-dnd.chrome_dnd_short_in_front_shared.cua.0.xtrace'), 'utf8'), 'Request(25): SendEvent ...\n');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'device-chrome-dnd.chrome_dnd_short_in_front_shared.cua.0.marks.json'), 'utf8')), [{ tag: 'sample 0 start', at: 100 }, { tag: 'sample 0 end', at: 200 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // a development run's alone: never a release gate's, never an experiment's
  const run = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'device-chrome-dnd', '--ops', 'chrome_dnd_short_in_front_shared', '--out', '/o'];
  assert.equal(parseArgs([...run, '--dev', '--trace-engine']).traceEngine, true);
  assert.throws(() => parseArgs([...run, '--trace-engine']), /--trace-engine is a development run's/);
  assert.throws(() => parseArgs(['--experiment', 'dnd', '--vendor', '/v', '--cua', '/c', '--out', '/o', '--trace-engine']), /--trace-engine is a development run's/);
});
