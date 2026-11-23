// Step L4d (the design session's ruling 962, task 128): the stale-position drops at twice the load on the shipped
// lane, as one counted step: Chrome's t14-long and t14-floor, each its own plan, and Electron's long path that leaves
// the zone, sat in turn in one run (a plan of parts) and each judged by its own plan's judge. Display-free.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { PART_CELLS, PART_PLANS, ZONE, dropSignalsVerdict, judgedPartsPlan, partsVerdict } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { CELLS, planSpecs, runSittings } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { rejudge } from '../../scripts/linux-engine-diff/rejudge-drops.mjs';
import { planContents } from '../../scripts/linux-engine-gate/launch-plan.mjs';
import { MAX_STEP_MINUTES, stepArgs, stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';
import { dropRow } from './drop-rows.mjs';

const PATHS = { vendor: '/v', newest: '/n', candidate: '/c', vendorJs: '/j' };
const l4dArgs = () => parseArgs([...stepArgs(stepNamed('L4d'), { paths: PATHS, gate: 'pinned' }), '--out', '/o']);
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('L4d is a counted step of the twice-load block on a private display, within the step limit, its plan the three parts', () => {
  const step = stepNamed('L4d');
  assert.equal(step.display, 'private');
  assert.equal(step.load, 'load2');
  assert.ok(step.minutes >= 23 && step.minutes <= MAX_STEP_MINUTES, `${step.minutes} min`);
  const a = l4dArgs();
  assert.equal(a.experiment, 'drop-signals');
  assert.deepEqual(a.families, ['chrome', 'electron']);
  assert.equal(a.plan, 't14-stale');
  assert.equal(a.loadFactor, 2);
  assert.equal(a.lanes, undefined, 'the shipped lane, no measurement flag');
  assert.ok(judgedPartsPlan(a), 'a gate judge holds every part');
  assert.deepEqual(PART_PLANS['t14-stale'], [{ family: 'chrome', plan: 't14-long' }, { family: 'chrome', plan: 't14-floor' }, { family: 'electron', plan: 't17-long' }]);
  const sittings = runSittings(a);
  assert.deepEqual(sittings.map((s) => [s.family, s.plan, s.part]), [['chrome', 't14-long', 0], ['chrome', 't14-floor', 1], ['electron', 't17-long', 2]]);
  assert.deepEqual(sittings[0].specs, planSpecs({ plan: 't14-long' }));
  assert.deepEqual(sittings[1].specs, planSpecs({ plan: 't14-floor' }));
  assert.deepEqual(sittings[2].specs, [{ lane: 'cua', cell: 'long-left', n: 30 }]);
  assert.ok(sittings.every((s) => s.specs.every((c) => c.lane === 'cua')), 'the shipped lane only');
  // a run whose --family does not name the parts' families is refused before it sits anything
  assert.throws(() => runSittings({ ...a, families: ['chrome'] }), /runs --family chrome,electron/);
  // any other plan is one sitting, with no part
  assert.deepEqual(runSittings(parseArgs(['--experiment', 'drop-signals', '--family', 'electron', '--plan', 't17-fix3', '--cua', '/c', '--out', '/o'])).map((s) => [s.family, s.plan, s.part]), [['electron', 't17-fix3', undefined]]);
});

test("L4d's Electron cell in Electron's window: it crosses the zone, ends outside it, is long enough to outlast the floor, and stays in the window clear of the run's other windows", () => {
  const path = CELLS['long-left'](0);
  const inZone = ([x, y]) => x >= ZONE.left && x < ZONE.right && y >= ZONE.top && y < ZONE.bottom;
  const samples = path.slice(1).flatMap(([x, y], k) => {
    const [ax, ay] = path[k];
    const n = Math.max(1, Math.floor(Math.hypot(x - ax, y - ay)));
    return many(n + 1, (i) => [ax + Math.trunc((i * (x - ax)) / n), ay + Math.trunc((i * (y - ay)) / n)]);
  });
  assert.ok(samples.some(inZone) && !inZone(path.at(-1)), 'across the zone, ending outside it');
  const length = path.slice(1).reduce((n, [x, y], k) => n + Math.hypot(x - path[k][0], y - path[k][1]), 0);
  assert.ok(length > 900, `${length} px, Chrome's long control's own (its steps after the take outlast the floor)`);
  // Electron's window (pages/electron-page/main.js) at the origin, 1050 by 780, the page at its origin; the front
  // xterm in the corner (scenes.mjs `arrangeFront`, 1070, 640, 200 by 150); no other window or sink opens for the plan
  const inWindow = ([x, y]) => x >= 0 && x < 1050 && y >= 0 && y < 780;
  const underFront = ([x, y]) => x >= 1070 && x < 1270 && y >= 640 && y < 790;
  assert.ok(samples.every(inWindow) && !samples.some(underFront));
  assert.ok(!PART_PLANS['t14-stale'][2].plan.includes('fix'), 'a plan with no other window nor sink');
});

test("a plan of parts is judged part by part, each by its own plan's judge, its fails named by the part", () => {
  const scene = (part, family, plan) => ({ kind: 'drop-signal-scene', part, family, plan, specs: planSpecs({ plan }) });
  const chromeRow = (o) => ({ ...dropRow({ family: 'chrome', pending: 'unconfirmed', ...o }) });
  const rows = [
    scene(0, 'chrome', 't14-long'),
    ...many(100, (i) => ({ ...chromeRow({ cell: 'long-left', i }), part: 0 })),
    scene(1, 'chrome', 't14-floor'),
    ...many(300, (i) => ({ ...dropRow({ family: 'chrome', cell: 'plain-long', i }), part: 1 })),
    ...many(30, (i) => ({ ...chromeRow({ cell: 'left', i }), part: 1 })),
    ...many(30, (i) => ({ ...chromeRow({ cell: 'inzone-out', i }), part: 1 })),
    scene(2, 'electron', 't17-long'),
    // each took, its motion after the take past the floor (ruling 972)
    ...many(30, (i) => ({ ...dropRow({ family: 'electron', cell: 'long-left', i, pending: 'unconfirmed' }), signals: { take_after_press_ms: 20, late_take: false }, hold: { taken: true, path_ms: 1000, take_after_press_ms: 20 }, part: 2 })),
  ];
  const args = l4dArgs();
  const v = dropSignalsVerdict(args, rows);
  assert.equal(v.judge, 'partsVerdict');
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.parts.map((p) => [p.plan, p.judge, p.pass]), [['t14-long', 'chromeDropVerdict', true], ['t14-floor', 'chromeDropVerdict', true], ['t17-long', 'electronDropVerdict', true]]);
  // a drop at a stale position in Chrome's long control, and a false ok in Electron's part: each named by its part
  const landed = (r) => ({ ...r, notice: null, next: { ok: true, error: null, late_dnd: null }, outcome: { started: true, landed: true, effect: null }, after: { ...r.after, dnd: { plain: { starts: 10, drops: 8 } } } });
  const bad = rows.map((r) => (r.part === 0 && r.i === 3 && r.kind === 'drop-signal' ? landed(r) : r.part === 2 && r.i === 7 && r.kind === 'drop-signal' ? { ...r, notice: null, next: { ok: true, error: null, late_dnd: null } } : r));
  const b = partsVerdict(args, bad);
  assert.deepEqual(b.failed, [
    'part 1 (chrome t14-long): cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 100 (#3)',
    'part 3 (electron t17-long): cua long-left: answered ok with no drop and nothing pending on 1 of 30 (#7)',
  ]);
  // a part that never sat (no scene row, no rows) fails, never passes vacuously
  const missing = partsVerdict(args, rows.filter((r) => r.part !== 2));
  assert.ok(missing.failed.includes('part 3 (electron t17-long): its scene row is missing: which cells ran is unknown'), missing.failed.join('\n'));
});

test("a part's manifest is held to its plan's declared cells: one a lane filter emptied or shortened fails (the final review's P2)", () => {
  const args = l4dArgs();
  // the plans' cells are the judge's, and drop-signals.mjs runs them as declared
  for (const part of PART_PLANS['t14-stale']) assert.deepEqual(planSpecs({ plan: part.plan }), PART_CELLS[part.plan].map(([lane, cell, n]) => ({ lane, cell, n })), part.plan);
  // `--lanes cua:handle` on t14-stale: every part's scene row with an empty manifest, and no drags
  const emptied = PART_PLANS['t14-stale'].map((p, part) => ({ kind: 'drop-signal-scene', part, family: p.family, plan: p.plan, specs: [] }));
  const v = partsVerdict(args, emptied);
  for (const f of [
    "part 1 (chrome t14-long): the manifest leaves out the plan's cua long-left x100",
    "part 2 (chrome t14-floor): the manifest leaves out the plan's cua plain-long x300, cua left x30, cua inzone-out x30",
    "part 3 (electron t17-long): the manifest leaves out the plan's cua long-left x30",
    // and each part's own judge counts the declared drags that never ran as a missing case
    "part 1 (chrome t14-long): cua long-left: 0 of the plan's 100 drags ran (a missing case)",
    "part 2 (chrome t14-floor): cua plain-long: 0 of the plan's 300 drags ran (a missing case)",
  ]) assert.ok(v.failed.includes(f), `${f}\n${v.failed.join('\n')}`);
  // each part's status and summary agree with the run's verdict (the re-review's P3): none passes, none says every cell ran
  assert.deepEqual(v.counts.parts.map((p) => p.pass), [false, false, false]);
  assert.equal(v.md.filter((l) => /every cell of the plan ran/.test(l)).length, 0, v.md.join('\n'));
  assert.equal(v.md.filter((l) => /^\*\*The part fails:\*\* the manifest leaves out/.test(l)).length, 3);
  // a short cell, its drags all run, fails as well
  const short = [{ kind: 'drop-signal-scene', part: 2, family: 'electron', plan: 't17-long', specs: [{ lane: 'cua', cell: 'long-left', n: 10 }] }];
  assert.ok(partsVerdict(args, short).failed.includes("part 3 (electron t17-long): the manifest leaves out the plan's cua long-left x30 (10 in the manifest)"));
  // a sitting capped by --trials (a development pilot; a counted run refuses it) is held to its cap
  const capped = partsVerdict({ ...args, samplesTrials: 10 }, short);
  assert.ok(!capped.failed.some((f) => /part 3 .*manifest/.test(f)), capped.failed.join('\n'));
});

test("launch-plan.mjs prints L4d's plan part by part", async () => {
  const lines = await planContents([...stepArgs(stepNamed('L4d'), { paths: PATHS, gate: 'pinned' }), '--out', '/o'], 'arm64');
  assert.deepEqual(lines, [
    'plan t14-stale on arm64, in 3 parts:',
    '  part 1: chrome t14-long',
    '    cua long-left x100 freeze null',
    '  part 2: chrome t14-floor',
    '    cua plain-long x300 freeze null',
    '    cua left x30 freeze null',
    '    cua inzone-out x30 freeze null',
    '  part 3: electron t17-long',
    '    cua long-left x30 freeze null',
  ]);
});

test("a plan of parts opens the run's front window once, before its first sitting, and sits every part (the x64 L4d development run: the second sitting's front xterm was a second window of the same name)", async () => {
  const { runDropSignals } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const fronts = [];
  const desktop = { openFront: async (occlusion) => fronts.push(occlusion) };
  const sat = [];
  const sit = async (args, ctx, one) => {
    sat.push(`${one.family} ${one.plan} ${one.part}`);
    return [`part ${one.part}`];
  };
  const result = await runDropSignals(l4dArgs(), { desktop, emit: () => {} }, { sit });
  assert.deepEqual(fronts, ['visible']);
  assert.deepEqual(sat, ['chrome t14-long 0', 'chrome t14-floor 1', 'electron t17-long 2']);
  assert.deepEqual(result, { md: ['part 0', 'part 1', 'part 2'], complete: true, failed: [] });
});

test('the rejudge of stored sittings reports each run beside its stored verdict: an emptied part the run stored as passing moves', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-rejudge-'));
  try {
    const meta = { run: 'r', kind: 'meta', experiment: 'drop-signals', families: ['chrome', 'electron'], plan: 't14-stale', lanes: ['cua:handle'], trials: null, gate: 'pinned' };
    const scenes = PART_PLANS['t14-stale'].map((p, part) => ({ run: 'r', kind: 'drop-signal-scene', part, family: p.family, plan: p.plan, specs: [] }));
    writeFileSync(join(dir, 'results.jsonl'), [meta, ...scenes, { run: 'r', kind: 'drop-parts-verdict', pass: true, failed: [] }].map((r) => JSON.stringify(r)).join('\n'));
    const [line] = await rejudge([dir]);
    assert.deepEqual([line.judge, line.gate, line.lanes, line.trials, line.stored, line.moved], ['partsVerdict', 'pinned', ['cua:handle'], null, { pass: true, failed: [] }, true]);
    assert.equal(line.failed.filter((f) => /the manifest leaves out/.test(f)).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
