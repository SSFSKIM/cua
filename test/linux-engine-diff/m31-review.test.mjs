// M3.1's task review, fix round 1: the speed judge's schedule and top-up planning, the re-judge's transport, the
// "within the bound" table, the in-front witness against a foreign popup crossing the frame, the device cases' audits,
// declared refusals that keep independent failures, and the drag-and-drop probes' disposal.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deviceSentence } from '../../scripts/linux-engine-diff/device.mjs';
import { declaredRefusal } from '../../scripts/linux-engine-diff/deviations.mjs';
import { withDropProbes } from '../../scripts/linux-engine-diff/dnd.mjs';
import { FIRST_ROUNDS, TOP_UP_TO, eventStage, settledSpeeds, topUpRoundsFor } from '../../scripts/linux-engine-diff/events.mjs';
import { rejudge } from '../../scripts/linux-engine-diff/rejudge.mjs';
import { renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { declaredRefusalVerdict, windowTopUp } from '../../scripts/linux-engine-diff/run.mjs';
import { judgeInFrontSpan } from '../../scripts/linux-engine-diff/witness.mjs';

const VENDORS = ['pinned', 'newest'];

test('the desktop groups follow the schedule: 20 an engine, then 40 for one undetermined, its outcome there final', () => {
  assert.equal(FIRST_ROUNDS, 20);
  assert.equal(TOP_UP_TO, 40);
  const g = (command, series, n, verdict) => ({ route: 'desktop', command, series, n, verdict });
  const open = [
    g('click', 'later', 40, 'undetermined'),
    g('move', 'later', 20, 'undetermined'),
    g('scroll', 'later', 20, 'faster'),
    g('drag', 'first', 12, 'too few samples, not judged'),
    g('click', 'later in a scenario', 3, 'too few samples, not judged'),
  ];
  const closed = open.map((s) => (s.verdict === 'undetermined' ? { ...s, verdict: 'fail', wide: true } : s));
  const first = eventStage(open, closed);
  // undetermined at 40 already: failed there, never sampled on
  assert.equal(first.frozen.get('desktop|click|later').verdict, 'fail');
  assert.equal(first.frozen.get('desktop|scroll|later').verdict, 'faster');
  assert.deepEqual(first.needs.map((s) => [s.command, s.series, s.target]), [['move', 'later', 40], ['drag', 'first', 20]]);
  // a scenario's own times are recorded, never topped up
  assert.equal(first.frozen.has('desktop|click|later in a scenario'), false);
  assert.equal(topUpRoundsFor(first.needs, 20), 20, '20 → 40 at one sample a round; 12 → 20 needs 14');
  // more samples from the top-up's shared sequences cannot reopen a group decided earlier, either way
  const later = [g('click', 'later', 80, 'faster'), g('move', 'later', 40, 'within the bound'), g('scroll', 'later', 40, 'fail'), g('drag', 'first', 20, 'faster')];
  const second = eventStage(later, later, first.frozen);
  assert.deepEqual(second.needs, []);
  const final = settledSpeeds(later, second.frozen);
  assert.deepEqual(final.map((s) => [s.command, s.verdict]), [['click', 'fail'], ['move', 'within the bound'], ['scroll', 'faster'], ['drag', 'faster']]);
});

test("the window route's top-up counts the samples the judge counts: no failed preparation, no vendor's failed text request", () => {
  const rows = (engine, n, ms, fields = {}) => Array.from({ length: n }, (_, i) => ({ engine, series: 'cold', ms: ms + (i % 3) * 0.01, ok: true, witness: true, block: i, i: 0, ...fields }));
  // 20 rows a side, but 5 of cua's preparations failed: 15 samples the judge times, so 5 more rounds
  const prepared = [...rows('pinned', 20, 40), ...rows('newest', 20, 45), ...rows('cua', 15, 30), ...rows('cua', 5, 30, { prepare_error: 'the caret did not move' })];
  const plan = windowTopUp(prepared, { vendors: VENDORS, candidates: ['cua'], level: 20, warmPerRound: 4 });
  assert.deepEqual([plan.series, plan.rounds, plan.warmRounds], [['cold'], 5, 0]);
  // a text command: the bar build's 8 unsuccessful requests set no bar sample, so its 12 successes call for 8 rounds
  const text = [...rows('pinned', 12, 40), ...rows('pinned', 8, 1, { ok: false }), ...rows('newest', 20, 60), ...rows('cua', 20, 30)];
  const textPlan = windowTopUp(text, { vendors: VENDORS, candidates: ['cua'], text: true, level: 20, warmPerRound: 4 });
  assert.deepEqual([textPlan.rounds, textPlan.open[0].against], [8, 'pinned']);
  // judged at 20 a side: nothing to top up
  assert.equal(windowTopUp([...rows('pinned', 20, 40), ...rows('newest', 20, 45), ...rows('cua', 20, 30)], { vendors: VENDORS, candidates: ['cua'], level: 20, warmPerRound: 4 }), null);
});

test("the re-judge honours the run's transport: through the vendor client nothing is judged on speed", () => {
  const sample = (engine, series, ms) => ({ run: 'r', kind: 'sample', scene: 'gedit', op: 'click', engine, series, ms, ok: true });
  const slow = [...['pinned', 'newest'].flatMap((e) => Array.from({ length: 24 }, (_, i) => sample(e, 'warm', 40 + (i % 3) * 0.01))), ...Array.from({ length: 24 }, (_, i) => sample('cua', 'warm', 90 + (i % 3) * 0.01))];
  const verdict = { run: 'r', kind: 'verdict', scene: 'gedit', op: 'click', candidate: 'cua', pass: true, verdict: 'pass', reasons: [] };
  const viaJs = rejudge([{ run: 'r', kind: 'meta', via: 'vendor-js' }, ...slow, verdict], 'r');
  assert.deepEqual([viaJs.via, viaJs.changed, viaJs.intervals, viaJs.under], ['vendor-js', [], [], []]);
  // over the wire the same rows fail on speed
  const wire = rejudge([{ run: 'r', kind: 'meta', via: 'wire' }, ...slow, verdict], 'r');
  assert.deepEqual(wire.changed.map((c) => [c.before, c.after]), [['pass', 'fail']]);
});

test("the \"within the bound\" table shows cua's median and the engine apart", () => {
  const lines = [
    { run: 'r', kind: 'meta', commit: 'abc', cua_version: 'cua-engine 0.3.0', occlusion: 'covered', blocks: 3, samples_tree: 7, samples_input: 5, engines: [] },
    { run: 'r', kind: 'sample', scene: 'gedit', op: 'click', engine: 'cua', series: 'warm', ms: 41.2, ok: true },
    {
      run: 'r',
      kind: 'verdict',
      scene: 'gedit',
      op: 'click',
      candidate: 'cua',
      pass: true,
      verdict: 'pass',
      reasons: [],
      labels: [{ series: 'warm', label: 'within the bound', candidate: 41.234, bar: 40, against: 'pinned', interval: [0.2, 0.9], bound: 2 }],
    },
  ];
  const md = renderSummary(lines);
  assert.ok(md.includes('| gedit | click | cua | warm | 41.23 | 40 | pinned | [0.2, 0.9] | 2 |'), md);
  assert.ok(!md.includes('NaN'));
});

test("the in-front witness fails a foreign popup raised across the target's frame and put back, coalesced", () => {
  const target = 0x0640_0003;
  const frame = 30;
  // bottom first: a managed window, a foreign popup just below the frame, the frame, the window manager's own
  const tree = [[10, 1, 0], [20, 1, 1], [frame, 1, 0], [40, 1, 1]];
  const crossed = { tree, restacks: [{ kind: 'configure', window: 20, above: frame, or: 1 }, { kind: 'configure', window: 20, above: 10, or: 1 }], focus: [], changes: [] };
  const judged = judgeInFrontSpan(crossed, { target, frame, root: 1 });
  assert.equal(judged.clean, false);
  assert.ok(judged.fields.includes('stacking'));
  // the target client's own drag window may cross its frame and go
  const own = 0x0640_0012;
  const drag = { tree: [[10, 1, 0], [own, 1, 1], [frame, 1, 0], [40, 1, 1]], restacks: [{ kind: 'configure', window: own, above: frame, or: 1 }, { kind: 'unmap', window: own }], focus: [], changes: [] };
  assert.equal(judgeInFrontSpan(drag, { target, frame, root: 1 }).clean, true);
});

test('a declared refusal excuses only its answer and effect: a dirty audit still fails it', () => {
  const refusal = declaredRefusal({ op: 'drag', scene: 'chrome-input' });
  const mine = [{ ok: false, error: deviceSentence('Google-chrome'), witness: true }];
  const excused = ['cua: a request failed', "cua: the output differs from the vendor's", 'cua: the effect was not verified on 3 samples (0/1, 0/2, 1/1)'];
  assert.deepEqual(declaredRefusalVerdict({ reasons: excused }, mine, refusal, 'cua'), { pass: false, verdict: 'declared refusal', reasons: [] });
  const dirty = declaredRefusalVerdict({ reasons: [...excused, 'cua: the audit found a forbidden request'] }, mine, refusal, 'cua');
  assert.deepEqual([dirty.verdict, dirty.reasons], ['fail', ['cua: the audit found a forbidden request']]);
  const moved = declaredRefusalVerdict({ reasons: excused }, [{ ...mine[0], witness: false }], refusal, 'cua');
  assert.equal(moved.verdict, 'fail');
});

test('the drop probes are stopped whatever happens, each stop tried on its own', async () => {
  const probes = (log, { failStop = null } = {}) => ({
    startXdnd: async () => ({ stop: async () => (log.push('xdnd'), failStop === 'xdnd' ? Promise.reject(new Error('xdnd stop failed')) : []) }),
    startGrabs: async () => ({ stop: async () => (log.push('grabs'), failStop === 'grabs' ? Promise.reject(new Error('grabs stop failed')) : []) }),
  });
  // the span throws: both stopped, the span's error kept
  let log = [];
  await assert.rejects(withDropProbes(async () => { throw new Error('the span failed'); }, probes(log)), /the span failed/);
  assert.deepEqual(log.sort(), ['grabs', 'xdnd']);
  // a stop that fails does not keep the other from stopping, and fails the drag
  log = [];
  await assert.rejects(withDropProbes(async () => 'done', probes(log, { failStop: 'grabs' })), /grabs stop failed/);
  assert.deepEqual(log.sort(), ['grabs', 'xdnd']);
  // a probe the body stopped is not stopped again; the body's result comes back
  log = [];
  assert.equal(await withDropProbes(async ({ grabs }) => (await grabs.stop(), 'read'), probes(log)), 'read');
  assert.deepEqual(log.sort(), ['grabs', 'xdnd']);
  // the grab sampler could not start: the watcher still goes
  log = [];
  const broken = { ...probes(log), startGrabs: async () => { throw new Error('no xprobe'); } };
  await assert.rejects(withDropProbes(async () => 'never', broken), /no xprobe/);
  assert.deepEqual(log, ['xdnd']);
});

test("an events run's desktop groups are judged again on its first 20 rounds, and at 40 where it recorded them", async () => {
  const { rejudgeEvents } = await import('../../scripts/linux-engine-diff/rejudge.mjs');
  // one sequence, a click then a click: 25 rounds, recorded before requests carried their round
  const records = (ms, spread = 0) =>
    Array.from({ length: 25 }, (_, r) => [0, 1].map((step) => ({ command: 'click', scenario: 's', step, first: step === 0, ms: ms + ((r * 7 + step) % 5) * spread, ok: true, answer: null }))).flat();
  const rows = [
    { run: 'e', kind: 'events-blocks', rounds: 25, records: { pinned: records(10), newest: records(12), cua: records(5) } },
    { run: 'e', kind: 'events-speed', route: 'desktop', command: 'click', series: 'first', n: 25, verdict: 'pass' },
  ];
  const { rounds, groups } = rejudgeEvents(rows, 'e');
  assert.equal(rounds, 25);
  const first = groups.find((g) => g.series === 'first');
  assert.deepEqual([first.n20, first.at20, first.recorded.verdict], [20, 'faster', 'pass']);
  // a wide group at 20 with fewer than 40 rounds recorded cannot be settled offline: short
  const wide = rejudgeEvents([{ run: 'w', kind: 'events-blocks', rounds: 25, records: { pinned: records(10), newest: records(12), cua: records(0, 6) } }], 'w');
  const g = wide.groups.find((x) => x.series === 'first');
  assert.deepEqual([g.at20, g.at40], ['undetermined', 'short']);
});
