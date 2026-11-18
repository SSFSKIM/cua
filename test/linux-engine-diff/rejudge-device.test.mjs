import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dndCancelledSentence, dndLateRefusal } from '../../scripts/linux-engine-diff/device.mjs';
import { rejudgeDevice } from '../../scripts/linux-engine-diff/rejudge-device.mjs';

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
  // 0/0's late take is shown by the refusal after it; the rest answered refusals
  assert.deepEqual(run.premise, [{ name: 'device-chrome-dnd chrome_dnd_shared cua', verdict: 'pass', moved: true, timed: { started: 1, 'not-plain-ok': 2 }, audit: { 'not-plain-ok': 1 } }]);
  // the arm64 pilot's audit as stored: its plain-drag ok keeps no page record, so it cannot show the premise either way
  const pilot = rows.map((r) => (r.kind === 'audit' ? { ...r, answered: [{ ok: true, error: null, expected_error: cancelled, late_error: null }, r.answered[0]] } : r));
  const [p] = rejudgeDevice(pilot);
  assert.deepEqual(p.premise[0].audit, { unshown: 1, 'not-plain-ok': 1 });
  assert.equal(p.premise[0].verdict, 'fail', 'judged as before');
});
