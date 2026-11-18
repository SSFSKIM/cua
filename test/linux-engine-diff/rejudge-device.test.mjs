import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { dndCancelledSentence, dndLateRefusal } from '../../scripts/linux-engine-diff/device.mjs';
import { rejudgeDevice } from '../../scripts/linux-engine-diff/rejudge-device.mjs';
import { CANCEL, LATE_DRAG, LATE_REFUSED, WINDOW, caseSamples, engineBin, removeScratch, scratch } from './premise-fixture.mjs';

after(removeScratch);

const app = 'Google-chrome';
const cancelled = dndCancelledSentence(app);
const sample = (fields) => ({ run: 'pinned-V5', kind: 'sample', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', block: 0, witness: true, dropped: false, expected_error: cancelled, ...fields });
const page = { starts: 1, drops: 0, downs: 1, ends: 1, ups: 0 };
// V5's rerun at H: the drag Chrome took nothing for by its release, its late take recorded on the next request, refused
const rows = [
  { run: 'pinned-V5', kind: 'meta' },
  sample({ i: 0, ok: true, dnd: { outcome: 'no_start' } }),
  sample({ i: 1, ok: false, error: dndLateRefusal(app, 'drag'), drop_status: { before: page, after: page }, engine_stats: { late_dnd: { after_release_ms: 2.35, app, escaped: true } } }),
  sample({ i: 2, ok: false, error: cancelled, dnd: { outcome: 'in_time' } }),
  { run: 'pinned-V5', kind: 'audit', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', clean: true, audit: 'background', answered: [{ ok: false, error: cancelled, expected_error: cancelled }], forbidden: [] },
  { run: 'pinned-V5', kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', candidate: 'cua', device: 'cancel', pass: false, reasons: ['not cancelled with the drag-and-drop sentence on 2 of 3 samples (0/0, 0/1)'], verdict: 'fail' },
  { run: 'pinned-V5', kind: 'end', valid: true, failed: ['device-chrome-dnd chrome_dnd_shared cua', 'device-chrome-dnd chrome_dnd_late_take_shared cua'] },
];

test("a device verdict's stored rows re-judged: what moved, what fails now, and the run's other failures standing as stored", () => {
  // the former judge, as H's: the sentence alone
  const old = (op, samples) => {
    const failed = samples.filter((r) => !(!r.ok && r.error === r.expected_error));
    return failed.length ? { pass: false, reasons: [`not cancelled with the drag-and-drop sentence on ${failed.length} of ${samples.length} samples (${failed.map((r) => `${r.block}/${r.i}`).join(', ')})`] } : { pass: true, reasons: [] };
  };
  const [run] = rejudgeDevice(rows, { old });
  assert.equal(run.run, 'pinned-V5');
  assert.deepEqual(run.moved, ['device-chrome-dnd chrome_dnd_shared cua: fail -> pass']);
  assert.deepEqual(run.failing, []);
  assert.deepEqual(run.unreproduced, [], "the former judge reproduces the stored verdict, so the replay of the rows stands");
  assert.deepEqual(run.others, ['device-chrome-dnd chrome_dnd_late_take_shared cua'], 'a failure this re-judge does not reach stands');
  assert.equal(run.verdicts[0].samples, 3);

  // a former judge that does not reproduce the stored verdict is named
  const [unfaithful] = rejudgeDevice(rows, { old: () => ({ pass: true, reasons: [] }) });
  assert.deepEqual(unfaithful.unreproduced, ['device-chrome-dnd chrome_dnd_shared cua']);
  // and the judge's own negative control through the stored form: the late drag dropped
  const dropped = rows.map((r) => (r.kind === 'sample' && r.i === 0 ? { ...r, dropped: true } : r));
  assert.deepEqual(rejudgeDevice(dropped)[0].failing, ['device-chrome-dnd chrome_dnd_shared cua']);
});

test("the re-judge states how each sample of ruling 823's cells reads under it, the stored audit's plain ok unshown", () => {
  const [run] = rejudgeDevice(rows);
  // 0/0's late take is shown by the engine's record of it on the next request, 0/2's in-time take by its own; 0/1 refused
  assert.deepEqual(run.premise, [{ name: 'device-chrome-dnd chrome_dnd_shared cua', verdict: 'pass', moved: true, timed: { started: 2, 'not-plain-ok': 1 }, audit: { 'not-plain-ok': 1 } }]);
  // the arm64 pilot's audit as stored: its plain-drag ok keeps no page record, so it cannot show the premise either way
  const pilot = rows.map((r) => (r.kind === 'audit' ? { ...r, answered: [{ ok: true, error: null, expected_error: cancelled, late_error: null }, r.answered[0]] } : r));
  const [p] = rejudgeDevice(pilot);
  assert.deepEqual(p.premise[0].audit, { unshown: 1, 'not-plain-ok': 1 });
  assert.equal(p.premise[0].verdict, 'fail', 'judged as before');
});

test("the stored replay rebuilds the no-audit sentinel only from positive evidence that the audit was disabled", () => {
  const noAuditRows = rows.filter((r) => r.kind !== 'audit');
  const withSentinel = rejudgeDevice(noAuditRows, { noAudit: true })[0].verdicts.find((v) => v.name === 'device-chrome-dnd chrome_dnd_shared cua');
  assert.ok(!withSentinel.now.reasons.some((r) => /the audit did not run/.test(r)), withSentinel.now.reasons.join('\n'));
  const without = rejudgeDevice(noAuditRows)[0].verdicts.find((v) => v.name === 'device-chrome-dnd chrome_dnd_shared cua');
  assert.ok(without.now.reasons.some((r) => /the audit did not run/.test(r)), 'no positive evidence: no sentinel');
});

test('a replay whose plan is not recorded never reports a premise cell as a pass: the judge passes it, the replay keeps the marker', async () => {
  // a run through the real collector whose stored meta keeps no blocks, its late pair passing under the judge
  const out = scratch('unverified');
  const run = 'stored-unverified';
  const three = [CANCEL, CANCEL, CANCEL];
  const made = await caseSamples({ out, run, op: 'chrome_dnd_shared', bin: engineBin(out), blocks: [[LATE_DRAG, LATE_REFUSED, CANCEL], three, three], audit: [CANCEL, CANCEL] });
  const lines = readFileSync(join(out, 'premise-evidence.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const stored = { verdict: 'fail', reasons: ['stored as failing'] };
  const stepRows = [
    { run, kind: 'meta' },
    ...made.rows,
    { run, kind: 'audit', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', clean: true, audit: 'background', answered: made.answered, forbidden: [], ancestry: [WINDOW] },
    { run, kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', candidate: 'cua', device: 'cancel', pass: false, ...stored },
  ];
  const [r] = rejudgeDevice(stepRows, { lines });
  const [v] = r.verdicts;
  assert.equal(v.now.verdict, 'replayed, plan unverified: not a release pass');
  assert.equal(v.now.plan_unverified, true);
  assert.deepEqual(v.stored, stored, 'its stored verdict beside');
  assert.deepEqual(r.failing, ['device-chrome-dnd chrome_dnd_shared cua'], 'not a pass');
  assert.deepEqual(r.moved, ['device-chrome-dnd chrome_dnd_shared cua: fail -> replayed, plan unverified: not a release pass']);
  assert.equal(r.premise[0].verdict, 'replayed, plan unverified: not a release pass');
  // with the plan recorded, the same rows replay as a pass
  const [p] = rejudgeDevice(stepRows.map((x) => (x.kind === 'meta' ? { ...x, blocks: 3 } : x)), { lines });
  assert.equal(p.verdicts[0].now.verdict, 'pass');
  assert.equal(p.verdicts[0].now.plan_unverified, undefined);
});
