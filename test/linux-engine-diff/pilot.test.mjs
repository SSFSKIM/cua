// A pilot takes no top-up (#171 M5, T4's second round; the design session's ruling 722, on task 87's finding 3). The
// pilot form (`gate.mjs --pilot`) ran each step's smallest form, and the harness then topped every series up to 20 a side,
// so V3's pilot took about as long as the full step. A pilot (`--pilot`, a development run only) now skips every top-up,
// and a series it could not decide is reported **unjudged**: apart from the passes and the failures, never a pass, in
// every record the run writes. Everything else a run judges (answers, witness, audit, effect, a decided loss) is judged as
// before. And a pilot can run with the pinned rule (task 87's finding 1): `--pinned --pilot`, a development run on the
// pinned release, never counted. Display-free.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { DEVELOPMENT_ON_PINNED, PINNED_DEVELOPMENT, gateLabel, isPinnedRule } from '../../scripts/linux-engine-diff/candidate.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { dragVerdict, laneFailures } from '../../scripts/linux-engine-diff/drag-judge.mjs';
import { eventsPass, medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { PILOT_UNDECIDED, closeOpenSeries, judgeWithDecisions, pilotVerdict, speedDecisions } from '../../scripts/linux-engine-diff/run.mjs';
import { runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';

const VENDORS = ['pinned', 'newest'];
const PILOT_V3 = join(dirname(fileURLToPath(import.meta.url)), '../../docs/evidence/2026-10-28-own-linux-engine/m5/x64/pilot/out/V3.development-run.pilot/run/results.jsonl.gz');

/** The x64 pilot's V3 (task 87) as a pilot now runs it: its one block's samples, none of the top-ups' rows. */
const pilotBlock = () => gunzipSync(readFileSync(PILOT_V3)).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'sample' && r.block === 0);

/** One operation of that block judged as a pilot's verdict run judges it: no top-up, its open series closed unjudged. */
function judgePilot(rows, scene, op) {
  const opRows = rows.filter((r) => r.scene === scene && r.op === op && [...VENDORS, 'cua'].includes(r.engine));
  const looked = speedDecisions(opRows, { vendors: VENDORS, candidates: ['cua'], decided: new Map() });
  const decided = new Map(looked.decided);
  for (const d of closeOpenSeries(looked.open, opRows, { vendors: VENDORS, pilot: true })) decided.set(`${d.candidate}|${d.series}`, d);
  const verdict = judgeWithDecisions(opRows, { vendors: VENDORS, candidate: 'cua', judgeSpeed: true, noise: medianDifferenceInterval, parity: [] }, decided);
  return { decided, verdict: { ...verdict, ...(pilotVerdict(verdict) ?? {}) } };
}

test("a pilot step's undecided series is reported unjudged: the x64 pilot's V3 block, with no top-up", () => {
  const rows = pilotBlock();
  const { decided, verdict } = judgePilot(rows, 'chrome-input', 'move');
  assert.deepEqual([...decided.values()].map((d) => [d.series, d.verdict]), [['cold', PILOT_UNDECIDED], ['warm', PILOT_UNDECIDED]], 'one block is too few samples to decide either series');
  assert.equal(verdict.verdict, 'unjudged');
  assert.equal(verdict.pass, false, 'never a pass');
  assert.deepEqual(verdict.reasons, [], 'nothing else of the operation failed');
  assert.equal(verdict.unjudged.length, 2);
  for (const reason of verdict.unjudged) assert.match(reason, /^cua: (cold|warm) .*undetermined: \d+ samples a side, fewer than 20/);
  // the run: listed apart, failing nothing, and its line never reads every verdict PASS
  const outcome = runOutcome([{ kind: 'verdict', scene: 'chrome-input', op: 'move', candidate: 'cua', ...verdict }], { valid: true });
  assert.deepEqual(outcome.failed, []);
  assert.deepEqual(outcome.unjudged, ['chrome-input move cua']);
  assert.equal(outcome.code, 0);
  const line = verdictLine(outcome);
  assert.equal(line, 'no verdict FAIL; unjudged (a pilot takes no top-up; not a pass): chrome-input move cua');
  // the summary reads it from the end row as run.mjs writes it
  const end = { kind: 'end', run: 'r', gate: false, valid: true, pass: outcome.pass, failed: outcome.failed, parity: [], refused: [], unjudged: outcome.unjudged };
  assert.match(renderSummary([{ kind: 'meta', run: 'r', gate: false, engines: [] }, end]), /no verdict FAIL; \*\*unjudged\*\* \(a pilot takes no top-up; not a pass\): chrome-input move cua/);
});

test('a pilot still fails what it can judge: a missed effect beside the unjudged speed, and an operation of no series', () => {
  const rows = pilotBlock();
  const mine = rows.filter((r) => r.scene === 'chrome-input' && r.op === 'move' && r.engine === 'cua');
  mine[0].effect = false;
  const { verdict } = judgePilot(rows, 'chrome-input', 'move');
  assert.equal(verdict.verdict, 'fail');
  assert.match(verdict.reasons.join('; '), /the effect was not verified/);
  assert.equal(verdict.unjudged.length, 2, 'the speed stays unjudged, apart from the failure');
  const outcome = runOutcome([{ kind: 'verdict', scene: 'chrome-input', op: 'move', candidate: 'cua', ...verdict }], { valid: true });
  assert.deepEqual(outcome.failed, ['chrome-input move cua']);
  assert.match(verdictLine(outcome), /^FAIL: chrome-input move cua; unjudged/);
  // a verdict with no undetermined speed is no pilot's business
  assert.equal(pilotVerdict({ verdict: 'fail', pass: false, reasons: ['cua: the witness changed'], undetermined: [] }), null);
  // a decided loss (an interval above 0) is a failure in a pilot too: only an undetermined series is unjudged
  const loss = { verdict: 'fail', pass: false, reasons: ['cua: warm 9 ms > bar 1 ms, the interval [6, 10] above 0', 'cua: cold 3 ms against the bar 1 ms, undetermined: 1 samples a side, fewer than 20; not judged on medians'], undetermined: [{ series: 'cold', samples: 1 }] };
  assert.deepEqual(pilotVerdict(loss), { pass: false, verdict: 'fail', reasons: [loss.reasons[0]], unjudged: [loss.reasons[1]] });
});

test('without --pilot nothing changes: an open series at the top-ups\' end is decided undetermined, a failure', () => {
  const rows = pilotBlock().filter((r) => r.scene === 'chrome-input' && r.op === 'move');
  const looked = speedDecisions(rows, { vendors: VENDORS, candidates: ['cua'], decided: new Map() });
  assert.deepEqual(closeOpenSeries(looked.open, rows, { vendors: VENDORS, pilot: false }).map((d) => d.verdict), ['undetermined, the top-ups spent', 'undetermined, the top-ups spent']);
});

test("a pilot's drag: a long path's speed undecided without its top-ups is unjudged, never a pass; a full run's still fails", () => {
  const cell = {
    family: 'chrome',
    drag: 'canvas',
    route: 'background',
    reference: true,
    pinned_took: 2,
    pinned_witness: false,
    lanes: { cua: { took: 2, n: 2, misses: [], witness: false, pass: true } },
    speed: { cua: { verdict: 'undetermined', interval: null, candidate: 470, against: 'newest', bar: 510, reasons: ['cua: 2 usable samples, fewer than 20'] } },
  };
  assert.match(laneFailures(cell, 'cua').join(), /speed undetermined after the top-ups/, 'a full run: a failure');
  assert.deepEqual(laneFailures(cell, 'cua', { pilot: true }), []);
  const v = dragVerdict([cell], { pilot: true });
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.unjudged, ['chrome canvas: cua speed unjudged (a pilot takes no top-up): cua: 2 usable samples, fewer than 20']);
  assert.equal(dragVerdict([cell]).pass, false);
  // a missed run still fails a pilot
  const missed = { ...cell, lanes: { cua: { took: 1, n: 2, misses: [1], witness: false, pass: false } } };
  assert.equal(dragVerdict([missed], { pilot: true }).pass, false);
});

test("a pilot's events: a group too short or undetermined without its top-ups is unjudged, apart; a loss and a wrong answer still fail", () => {
  const group = (command, series, verdict, extra = {}) => ({ route: 'desktop', command, series, verdict, n: 2, medians: { pinned: 2, newest: 2, cua: 1 }, bar: 2, interval: null, ...extra });
  const required = [{ route: 'desktop', command: 'click', series: 'first' }, { route: 'desktop', command: 'click', series: 'later' }];
  const speeds = [group('click', 'first', 'too few samples, not judged'), group('click', 'later', 'undetermined', { n: 20, interval: [-1, 3] })];
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire', required }), false, 'a full run: not a pass');
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire', required, pilot: true }), true, 'a pilot: nothing failed');
  assert.equal(eventsPass({ answers: false, speeds, via: 'wire', required, pilot: true }), false, "an answer unlike the pinned build's");
  assert.equal(eventsPass({ answers: true, speeds: [...speeds, group('click', 'later', 'fail', { n: 20, interval: [2, 3] })], via: 'wire', required, pilot: true }), false, 'a decided loss');
});

test('the pilot flag: a development run only; with --pinned, a development run on the pinned release that runs the pinned rule', () => {
  const run = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'tree', '--out', '/o'];
  const exp = ['--experiment', 'drag', '--vendor', '/v', '--newest', '/n', '--family', 'chrome', '--cua', '/c', '--out', '/o'];
  assert.equal(parseArgs([...run, '--dev', '--pilot']).pilot, true);
  assert.equal(parseArgs([...run, '--dev']).pilot, undefined);
  assert.throws(() => parseArgs([...run, '--pilot']), /--pilot is a development run's: give --dev or --pinned/);
  assert.equal(parseArgs([...exp, '--pilot']).pilot, true);
  assert.throws(() => parseArgs([...exp, '--gate', '--pilot']), /--pilot is a development run's/);
  for (const argv of [[...run, '--pinned', '--pilot'], [...exp, '--pinned', '--pilot']]) {
    const a = parseArgs(argv);
    assert.equal(a.gate, PINNED_DEVELOPMENT);
    assert.equal(isPinnedRule(a.gate), true, 'the pinned rule runs');
    assert.equal(a.pilot, true);
  }
  assert.equal(parseArgs([...exp, '--pinned']).gate, 'pinned', 'acceptance, as before');
  assert.throws(() => parseArgs([...run, '--pinned', '--dev']), /--pinned is a rule of its own/);
  assert.equal(gateLabel(PINNED_DEVELOPMENT), DEVELOPMENT_ON_PINNED);
  assert.match(DEVELOPMENT_ON_PINNED, /^development run on the pinned release, not acceptance/);
  assert.doesNotMatch(DEVELOPMENT_ON_PINNED, /acceptance on the pinned release/, 'never read as acceptance');
  assert.equal(isPinnedRule('pinned'), true);
  assert.equal(isPinnedRule(true), false);
  assert.equal(isPinnedRule(false), false);
});
