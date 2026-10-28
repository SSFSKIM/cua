import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attributeCalls, parseMonitor } from '../../scripts/linux-engine-diff/busmon.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { compareStates, normalizeState, retainedIds } from '../../scripts/linux-engine-diff/normalize.mjs';
import { analyzeTrial } from '../../scripts/linux-engine-diff/readiness.mjs';
import { blockOrder, median, judgeOperation } from '../../scripts/linux-engine-diff/stats.mjs';
import { judgeSpan } from '../../scripts/linux-engine-diff/witness.mjs';

// ---------------------------------------------------------------------------------------------------------------
// statistics, rotation and the verdict

test('median of odd and even series, and of nothing', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('blocks rotate the engine order so every engine takes every position', () => {
  const engines = ['pinned', 'newest', 'cua'];
  assert.deepEqual(blockOrder(engines, 0), ['pinned', 'newest', 'cua']);
  assert.deepEqual(blockOrder(engines, 1), ['newest', 'cua', 'pinned']);
  assert.deepEqual(blockOrder(engines, 2), ['cua', 'pinned', 'newest']);
  assert.deepEqual(blockOrder(engines, 3), ['pinned', 'newest', 'cua']);
});

function samples(engine, cold, warm, extra = {}) {
  return [
    { engine, series: 'cold', ms: cold, ok: true, ...extra },
    ...warm.map((ms) => ({ engine, series: 'warm', ms, ok: true, ...extra })),
  ];
}

test('the bar is the faster vendor build per series, judged cold against cold and warm against warm', () => {
  const rows = [
    ...samples('pinned', 300, [200, 210, 220]),
    ...samples('newest', 250, [230, 240, 250]),
    ...samples('cua', 240, [100, 110, 120]),
  ];
  const verdict = judgeOperation(rows, { vendors: ['pinned', 'newest'], candidate: 'cua' });
  assert.equal(verdict.bar.cold, 250);
  assert.equal(verdict.bar.warm, 210);
  assert.equal(verdict.speed, true);
  assert.equal(verdict.pass, true);

  const slowCold = [...rows.filter((r) => r.engine !== 'cua'), ...samples('cua', 260, [100, 110, 120])];
  const v2 = judgeOperation(slowCold, { vendors: ['pinned', 'newest'], candidate: 'cua' });
  assert.equal(v2.speed, false);
  assert.match(v2.reasons.join(), /cold 260.* > bar 250/);
});

test('the verdict needs equal output, a clean witness where a vendor is clean, and the effect where a vendor has it', () => {
  const base = [
    ...samples('pinned', 300, [200], { witness: true, effect: true, equal: true }),
    ...samples('newest', 250, [230], { witness: true, effect: false, equal: true }),
  ];
  const dirty = [...base, ...samples('cua', 100, [100], { witness: false, effect: true, equal: true })];
  assert.match(judgeOperation(dirty, { vendors: ['pinned', 'newest'], candidate: 'cua' }).reasons.join(), /witness/);
  const noEffect = [...base, ...samples('cua', 100, [100], { witness: true, effect: false, equal: true })];
  assert.match(judgeOperation(noEffect, { vendors: ['pinned', 'newest'], candidate: 'cua' }).reasons.join(), /effect/);
  const differs = [...base, ...samples('cua', 100, [100], { witness: true, effect: true, equal: false })];
  assert.match(judgeOperation(differs, { vendors: ['pinned', 'newest'], candidate: 'cua' }).reasons.join(), /output/);
  const good = [...base, ...samples('cua', 100, [100], { witness: true, effect: true, equal: true })];
  assert.equal(judgeOperation(good, { vendors: ['pinned', 'newest'], candidate: 'cua' }).pass, true);
  // where no vendor build verifies the effect or keeps the witness clean, neither is required of cua
  const vendorsDirty = [
    ...samples('pinned', 300, [200], { witness: false, effect: false, equal: true }),
    ...samples('newest', 250, [230], { witness: false, effect: false, equal: true }),
    ...samples('cua', 100, [100], { witness: false, effect: false, equal: true }),
  ];
  assert.equal(judgeOperation(vendorsDirty, { vendors: ['pinned', 'newest'], candidate: 'cua' }).pass, true);
});

test('a failed request fails the verdict', () => {
  const rows = [...samples('pinned', 300, [200]), ...samples('newest', 250, [230]), { engine: 'cua', series: 'cold', ms: 5, ok: false }];
  assert.match(judgeOperation(rows, { vendors: ['pinned', 'newest'], candidate: 'cua' }).reasons.join(), /failed/);
});

// ---------------------------------------------------------------------------------------------------------------
// output normalization

const state = (title, ids, shot = '/tmp/1_2.jpg') => ({
  ax_tree: {
    id: ids[0],
    role: 'frame',
    name: `${title} - gedit`,
    children: [{ id: ids[1], role: 'text', value: `hello ${title}`, children: [] }],
  },
  ax_tree_source: 'at_spi',
  screenshots: shot ? [{ filepath: shot }] : [],
  window: { id: 5, title: `${title} - gedit`, x: 1, y: 2 },
});

test('normalization maps native ids by position, drops file paths and replaces the window label', () => {
  const a = normalizeState(state('scene-a', [':1.2/a', ':1.2/b']), { label: 'scene-a' });
  const b = normalizeState(state('scene-b', [':1.9/x', ':1.9/y'], '/tmp/cua-engine-1/3.jpg'), { label: 'scene-b' });
  assert.deepEqual(a, b);
  assert.equal(a.ax_tree.id, 0);
  assert.equal(a.ax_tree.children[0].id, 1);
  assert.deepEqual(a.screenshots, [{}]);
  assert.equal(a.window.id, undefined);
});

test('comparison reports equality, node counts and the first difference by preorder position', () => {
  const same = compareStates(state('s', ['a', 'b']), state('s', ['a', 'b']));
  assert.equal(same.equal, true);
  assert.equal(same.nodes, 2);
  const other = state('s', ['a', 'b']);
  other.ax_tree.children[0].value = 'changed';
  const diff = compareStates(state('s', ['a', 'b']), other);
  assert.equal(diff.equal, false);
  assert.equal(diff.first_difference.position, 1);
  assert.equal(diff.first_difference.field, 'value');
  // exact comparison keeps native ids
  const ids = compareStates(state('s', ['a', 'b']), state('s', ['a', 'c']), { exactIds: true });
  assert.equal(ids.equal, false);
  assert.equal(ids.first_difference.field, 'id');
});

test('a run-wide label pattern and the volatile Chrome memory text are replaced', () => {
  const pattern = /cua171-diff-r1-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/g;
  const a = state('cua171-diff-r1-gedit-pinned', ['a', 'b']);
  a.ax_tree.children[0].value = "Open 'cua171-diff-r1-gedit-cua.txt' - Memory usage - 23.8 MB";
  const b = state('cua171-diff-r1-gedit-cua', ['x', 'y']);
  b.ax_tree.children[0].value = "Open 'cua171-diff-r1-gedit-newest.txt' - Memory usage - 24.3 MB";
  assert.equal(compareStates(a, b, { labelA: pattern, labelB: pattern }).equal, true);
  assert.equal(normalizeState(a, { label: pattern }).ax_tree.children[0].value, "Open '<label>.txt' - Memory usage - <n>");
});

test('retained native ids in preorder', () => {
  assert.deepEqual(retainedIds(state('s', ['a', 'b'])), ['a', 'b']);
});

// ---------------------------------------------------------------------------------------------------------------
// accessibility-bus call counts

const MONITOR = [
  'signal time=1.000 sender=org.freedesktop.DBus -> destination=:1.460 serial=2 path=/org/freedesktop/DBus; interface=org.freedesktop.DBus; member=NameAcquired',
  '   string ":1.460"',
  'method call time=1.001 sender=:1.379 -> destination=org.a11y.atspi.Registry serial=90 path=/org/a11y/atspi/registry; interface=org.a11y.atspi.Registry; member=GetRegisteredEvents',
  'method call time=1.100 sender=:1.461 -> destination=org.freedesktop.DBus serial=1 path=/org/freedesktop/DBus; interface=org.freedesktop.DBus; member=Hello',
  'method return time=1.101 sender=org.freedesktop.DBus -> destination=:1.461 serial=1 reply_serial=1',
  'signal time=1.102 sender=org.freedesktop.DBus -> destination=:1.461 serial=2 path=/org/freedesktop/DBus; interface=org.freedesktop.DBus; member=NameAcquired',
  'method call time=1.103 sender=:1.461 -> destination=:1.20 serial=2 path=/a; interface=org.a11y.atspi.Accessible; member=GetChildren',
  'method return time=1.104 sender=:1.20 -> destination=:1.461 serial=7 reply_serial=2',
  'method call time=1.105 sender=:1.461 -> destination=:1.20 serial=3 path=/b; interface=org.a11y.atspi.Accessible; member=GetRoleName',
  'method call time=1.105 sender=:1.461 -> destination=:1.20 serial=4 path=/c; interface=org.a11y.atspi.Accessible; member=GetRoleName',
  'error time=1.106 sender=:1.20 -> destination=:1.461 error_name=org.freedesktop.DBus.Error.UnknownMethod reply_serial=3',
  '   string "no"',
  'method return time=1.107 sender=:1.20 -> destination=:1.461 serial=9 reply_serial=4',
  'method call time=1.150 sender=:1.462 -> destination=org.freedesktop.DBus serial=1 path=/org/freedesktop/DBus; interface=org.freedesktop.DBus; member=Hello',
  'method call time=1.200 sender=:1.462 -> destination=:1.20 serial=2 path=/d; interface=org.a11y.atspi.Accessible; member=GetState',
  'method call time=1.201 sender=:1.379 -> destination=:1.20 serial=91 path=/d; interface=org.a11y.atspi.Accessible; member=GetState',
].join('\n');

test('the monitor parser keeps headers and skips argument lines', () => {
  const messages = parseMonitor(MONITOR);
  assert.equal(messages.length, 14);
  assert.equal(messages[2].type, 'method call');
  assert.equal(messages[2].member, 'Hello');
  assert.equal(messages[2].sender, ':1.461');
  assert.equal(messages[9].type, 'error');
  assert.equal(messages[9].reply_serial, 3);
});

test('calls are attributed to connections that appeared during the pass, with what was awaited alone', () => {
  const calls = attributeCalls(parseMonitor(MONITOR));
  // :1.379 existed before the pass (its calls are not counted); :1.460 is the monitor (no calls); :1.461 and :1.462
  // said Hello during it
  assert.deepEqual(Object.keys(calls.by_connection).sort(), [':1.461', ':1.462']);
  const c = calls.by_connection[':1.461'];
  assert.equal(c.calls, 4);
  assert.deepEqual(c.by_member, { Hello: 1, GetChildren: 1, GetRoleName: 2 });
  assert.equal(c.max_in_flight, 2);
  assert.equal(c.serial_calls, 3); // Hello, GetChildren and the first GetRoleName were issued with nothing outstanding
  assert.equal(calls.calls, 6);
  assert.equal(calls.connections, 2);
});

test('a persistent connection from an earlier pass is attributed by name', () => {
  const calls = attributeCalls(parseMonitor(MONITOR), { names: [':1.379'] });
  assert.equal(calls.by_connection[':1.379'].calls, 2);
  assert.equal(calls.connections, 3);
});

// ---------------------------------------------------------------------------------------------------------------
// the witness

test('a span is clean only when no watched field changed', () => {
  assert.deepEqual(judgeSpan({ tag: 't', samples: 40, max_gap_ms: 6, notifies: { active: 0, stacking: 0 }, changes: [] }), {
    clean: true,
    fields: [],
    samples: 40,
    max_gap_ms: 6,
  });
  const dirty = judgeSpan({ tag: 't', samples: 40, max_gap_ms: 6, notifies: { active: 2, stacking: 1 }, changes: [{ field: 'active' }, { field: 'focus' }, { field: 'active' }] });
  assert.equal(dirty.clean, false);
  assert.deepEqual(dirty.fields, ['active', 'focus']);
  assert.equal(judgeSpan({ tag: 't', error: 'no span' }).clean, false);
});

// ---------------------------------------------------------------------------------------------------------------
// capture readiness after RedirectWindow

test('readiness: when the contents first equal the final contents for good, and what a poll for two equal captures sees', () => {
  // contents: garbage A until 3 ms, black B until 12 ms, then the real C (final)
  const trial = { before: 'A', span_ms: 100, samples: 200, changes: [[0.5, 'A'], [3, 'B'], [12, 'C']] };
  const r = analyzeTrial(trial, { pollMs: [1, 5, 20] });
  assert.equal(r.ready_ms, 12);
  assert.equal(r.final, 'C');
  assert.equal(r.equal_before, false); // the unredirected capture (A) was not the real contents
  // a 1 ms poll sees two equal captures at 1 ms (A, A) — a false readiness, before the contents are real
  assert.equal(r.polls[1].consecutive_equal_ms, 1);
  assert.equal(r.polls[1].premature, true);
  // a 5 ms poll samples 0:A 5:B 10:B -> equal at 10, still premature
  assert.equal(r.polls[5].consecutive_equal_ms, 10);
  assert.equal(r.polls[5].premature, true);
  // a 20 ms poll samples 0:A 20:C 40:C -> equal at 40, real
  assert.equal(r.polls[20].consecutive_equal_ms, 40);
  assert.equal(r.polls[20].premature, false);
});

test('readiness when the contents never change is immediate', () => {
  const r = analyzeTrial({ before: 'C', span_ms: 50, samples: 100, changes: [[0.4, 'C']] }, { pollMs: [5] });
  assert.equal(r.ready_ms, 0.4);
  assert.equal(r.polls[5].consecutive_equal_ms, 5);
  assert.equal(r.polls[5].premature, false);
});

// ---------------------------------------------------------------------------------------------------------------
// the command line

test('the Interfaces command line parses, with M0 variants', () => {
  const a = parseArgs([
    '--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit,chrome', '--ops', 'all', '--out', 'o',
    '--variant', 'W16=--window-calls 16', '--variant', 'seq=--tree sequential --bus per-request',
  ]);
  assert.equal(a.mode, 'run');
  assert.deepEqual(a.scenes, ['gedit', 'chrome']);
  assert.equal(a.ops, 'all');
  assert.equal(a.blocks, 3);
  assert.equal(a.samplesTree, 7);
  assert.equal(a.samplesInput, 5);
  assert.deepEqual(a.variants, [
    { label: 'cua:W16', args: ['--window-calls', '16'] },
    { label: 'cua:seq', args: ['--tree', 'sequential', '--bus', 'per-request'] },
  ]);
  assert.equal(parseArgs(['--check-wire', '--vendor-js', '/sky']).mode, 'check-wire');
  assert.throws(() => parseArgs(['--check-wire']), /--vendor-js/);
  assert.throws(() => parseArgs(['--vendor', '/v', '--scene', 'gedit', '--ops', 'all', '--out', 'o']), /--newest/);
  assert.throws(() => parseArgs(['--bogus']), /unknown/);
});

// ---------------------------------------------------------------------------------------------------------------
// the key-pace bursts

test('the text a burst typed is read at the caret, ahead of the original text', async () => {
  const { typedByBurst } = await import('../../scripts/linux-engine-diff/experiments.mjs');
  const original = 'cua171 key pace';
  // two bursts of the same repeated pattern: a prefix/suffix diff would misplace the second one by a letter
  const first = `cBcB${original}`;
  const second = `cBcBcBcB${original}`;
  assert.equal(typedByBurst(original, first, original.length), 'cBcB');
  assert.equal(typedByBurst(first, second, original.length), 'cBcB');
  assert.equal(typedByBurst(first, `cBcBcB${original}`, original.length), 'cB');
});

// ---------------------------------------------------------------------------------------------------------------
// the summary

test('the summary has a row per engine with its medians, calls and verdict, and the bar', async () => {
  const { renderSummary } = await import('../../scripts/linux-engine-diff/report.mjs');
  const lines = [
    { run: 'r', kind: 'meta', commit: 'abc', cua_version: 'cua-engine 0.0.1 (abc)', occlusion: 'covered', blocks: 1, samples_tree: 1, samples_input: 1, engines: [{ label: 'cua:W16', args: ['--window-calls', '16'] }] },
    { run: 'r', kind: 'stub-check', witness_failed_it: true, witness: { fields: ['active'] } },
    { run: 'r', kind: 'sample', engine: 'pinned', scene: 'gedit', op: 'tree', series: 'cold', ms: 500, ok: true, witness: true },
    { run: 'r', kind: 'sample', engine: 'cua', scene: 'gedit', op: 'tree', series: 'cold', ms: 60, ok: true, witness: true, stats: { tree: { wasted_calls: 0 } } },
    { run: 'r', kind: 'counts', engine: 'cua', scene: 'gedit', op: 'tree', pass: 'cold', calls: 3040, serial_calls: 20 },
    { run: 'r', kind: 'verdict', scene: 'gedit', op: 'tree', candidate: 'cua', pass: true, reasons: [], bar: { cold: 500, warm: null } },
    { run: 'r', kind: 'end', valid: true, finished: 'now' },
  ];
  const text = renderSummary(lines);
  assert.match(text, /variants: `cua:W16` = `--window-calls 16`/);
  assert.match(text, /the witness failed the activating stub \(active\)/);
  assert.match(text, /\| gedit \| tree \| cua \| 60 \| – \| 0 \| 3040 \/ – \| 20 \/ – \| 0 \| 1\/1 \| – \| – \| PASS \|/);
  assert.match(text, /\| gedit \| tree \| \*\*bar\*\* \| 500 \|/);
  assert.match(text, /run valid/);
});
