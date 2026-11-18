import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { dndCancelledSentence, dndLateRefusal, dndMayHaveDroppedSentence, deviceSentence } from '../../scripts/linux-engine-diff/device.mjs';
import { rejudgeDevice } from '../../scripts/linux-engine-diff/rejudge-device.mjs';
import { APP, CANCEL, LATE, LATE_DRAG, LATE_REFUSED, UNMET, WINDOW, caseSamples, engineBin, removeScratch, scratch } from './premise-fixture.mjs';

after(removeScratch);

/** How a current replay reports a premise cell its judge passes (wave 8): never a release pass. */
const DIAGNOSTIC = "replayed pass: diagnostic only; V5's premise cells pass only in a live run";

const app = 'Google-chrome';
const cancelled = dndCancelledSentence(app);
const sample = (fields) => ({ run: 'pinned-V5', kind: 'sample', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', block: 0, witness: true, dropped: false, expected_error: cancelled, ...fields });
const page = { starts: 1, drops: 0, downs: 1, ends: 1, ups: 0 };
// V5's rerun at H: the drag Chrome took nothing for by its release, its late take recorded on the next request, refused;
// its run's recorded plan one block, the audit's two requests
const auditAnswer = { ok: false, error: cancelled, expected_error: cancelled };
const rows = [
  { run: 'pinned-V5', kind: 'meta', blocks: 1 },
  sample({ i: 0, series: 'cold', ok: true, dnd: { outcome: 'no_start' } }),
  sample({ i: 1, series: 'warm', ok: false, error: dndLateRefusal(app, 'drag'), drop_status: { before: page, after: page }, engine_stats: { late_dnd: { after_release_ms: 2.35, app, escaped: true } } }),
  sample({ i: 2, series: 'warm', ok: false, error: cancelled, dnd: { outcome: 'in_time' } }),
  { run: 'pinned-V5', kind: 'audit', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', clean: true, audit: 'background', answered: [auditAnswer, auditAnswer], forbidden: [] },
  { run: 'pinned-V5', kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', candidate: 'cua', device: 'cancel', pass: false, reasons: ['not cancelled with the drag-and-drop sentence on 2 of 3 samples (0/0, 0/1)'], verdict: 'fail' },
  { run: 'pinned-V5', kind: 'end', valid: true, failed: ['device-chrome-dnd chrome_dnd_shared cua', 'device-chrome-dnd chrome_dnd_late_take_shared cua'] },
];

/** A stored step of `rows` in a scratch directory (`sidecar`: a premise-evidence.jsonl to keep beside them), through the real CLI. */
function cli(stepRows, { sidecar = null, flags = [] } = {}) {
  const dir = scratch('cli-step');
  writeFileSync(join(dir, 'results.jsonl'), stepRows.map((r) => `${JSON.stringify(r)}\n`).join(''));
  if (sidecar) copyFileSync(sidecar, join(dir, 'premise-evidence.jsonl'));
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/linux-engine-diff/rejudge-device.mjs', import.meta.url)), ...flags, dir], { encoding: 'utf8' });
  const out = run.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: run.status, stderr: run.stderr, verdicts: out.filter((l) => l.name), summary: out.find((l) => !l.name) };
}

test("a device verdict's stored rows re-judged: what moved, what fails now, and the run's other failures standing as stored", () => {
  // the former judge, as H's: the sentence alone
  const old = (op, samples) => {
    const failed = samples.filter((r) => !(!r.ok && r.error === r.expected_error));
    return failed.length ? { pass: false, reasons: [`not cancelled with the drag-and-drop sentence on ${failed.length} of ${samples.length} samples (${failed.map((r) => `${r.block}/${r.i}`).join(', ')})`] } : { pass: true, reasons: [] };
  };
  const [run] = rejudgeDevice(rows, { old });
  assert.equal(run.run, 'pinned-V5');
  assert.deepEqual(run.moved, [`device-chrome-dnd chrome_dnd_shared cua: fail -> ${DIAGNOSTIC}`]);
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
  assert.deepEqual(run.premise, [{ name: 'device-chrome-dnd chrome_dnd_shared cua', verdict: DIAGNOSTIC, moved: true, timed: { started: 2, 'not-plain-ok': 1 }, audit: { 'not-plain-ok': 2 } }]);
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

test('a replay of a premise cell is never a release pass, its plan recorded or not; a run that recorded none keeps the marker', async () => {
  // a run through the real collector, its late pair passing under the judge
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
  assert.equal(v.now.verdict, DIAGNOSTIC);
  assert.equal(v.now.plan_unverified, true, 'its meta keeps no blocks');
  assert.deepEqual(v.stored, stored, 'its stored verdict beside');
  assert.deepEqual(r.moved, [`device-chrome-dnd chrome_dnd_shared cua: fail -> ${DIAGNOSTIC}`]);
  assert.equal(r.premise[0].verdict, DIAGNOSTIC);
  // with the plan recorded: still diagnostic only, with no marker
  const [p] = rejudgeDevice(stepRows.map((x) => (x.kind === 'meta' ? { ...x, blocks: 3 } : x)), { lines });
  assert.equal(p.verdicts[0].now.verdict, DIAGNOSTIC);
  assert.equal(p.verdicts[0].now.plan_unverified, undefined);
});

test('the CLI never replays a premise cell as a release pass where its run recorded no plan, evidence or none (wave 7)', () => {
  // the reviewer's probe, as stored: one block of a V5 cell, its two audit replies valid, no premise evidence, and its
  // stored verdict failing for the missing blocks
  const run = 'probe-V5';
  const at = (i) => ({ ...sample({ i, series: i === 0 ? 'cold' : 'warm', ok: false, error: cancelled, dnd: { outcome: 'in_time' } }), run });
  const stored = { verdict: 'fail', reasons: ["the run's rows do not fit its recorded plan (ruling 823, never excluded on): no row for 1/0"] };
  const step = (meta) => [
    { run, kind: 'meta', ...meta },
    at(0),
    at(1),
    at(2),
    { run, kind: 'audit', engine: 'cua', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', clean: true, audit: 'background', answered: [auditAnswer, auditAnswer], forbidden: [] },
    { run, kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', candidate: 'cua', device: 'cancel', pass: false, ...stored },
  ];
  // its plan recorded: the missing blocks fail it, as stored
  const planned = cli(step({ blocks: 3 }));
  assert.equal(planned.verdicts[0].now.verdict, 'fail');
  assert.equal(planned.status, 1);
  // only the plan's blocks removed: the judge passes it, and the replay never reports that as a pass
  const unplanned = cli(step({}));
  assert.equal(unplanned.stderr, '');
  assert.equal(unplanned.verdicts[0].now.verdict, DIAGNOSTIC);
  assert.equal(unplanned.verdicts[0].now.plan_unverified, true);
  assert.deepEqual(unplanned.verdicts[0].stored, stored);
  assert.equal(unplanned.status, 1, 'the CLI exits 1');
});

test("the CLI's replay is diagnostic only for V5's premise cells, whatever its plan or evidence; --diagnostic exits on agreement alone (wave 8)", async () => {
  // the reviewer's probe: a current run, its plan recorded, its audit's first request a false claim (it answered that
  // the drop may have happened where the page proves Chrome never started one), its sidecar omitted from the step
  const OP = 'chrome_dnd_late_shared';
  const out = scratch('false-claim');
  const run = 'probe-false-claim';
  const block = [LATE, LATE, LATE];
  const made = await caseSamples({ out, run, op: OP, bin: engineBin(out), blocks: [block, block, block], audit: [{ ...UNMET, reply: { ok: false, error: dndMayHaveDroppedSentence(APP) } }, LATE] });
  const sidecar = join(out, 'premise-evidence.jsonl');
  const step = (stored) => [
    { run, kind: 'meta', blocks: 3 },
    ...made.rows,
    { run, kind: 'audit', engine: 'cua', scene: 'device-chrome-dnd', op: OP, clean: true, audit: 'background', answered: made.answered, forbidden: [], ancestry: [WINDOW] },
    { run, kind: 'verdict', scene: 'device-chrome-dnd', op: OP, candidate: 'cua', device: 'late', ...stored },
  ];
  // the step as recorded, its sidecar beside it: the false claim fails, as stored
  const withSidecar = cli(step({ pass: false, verdict: 'fail', reasons: [] }), { sidecar });
  assert.equal(withSidecar.verdicts[0].now.verdict, 'fail');
  assert.match(withSidecar.verdicts[0].now.reasons.join('\n'), /answered as if it dropped where the page shows Chrome never started a drag and drop/);
  const storedFail = { pass: false, verdict: 'fail', reasons: withSidecar.verdicts[0].now.reasons };
  assert.equal(cli(step(storedFail), { sidecar }).status, 1, 'a fail exits 1');
  assert.equal(cli(step(storedFail), { sidecar, flags: ['--diagnostic'] }).status, 0, '--diagnostic: the replay agrees with the stored fail');

  // the probe: the sidecar omitted, so the audit's replies are bare and the judge passes the cell
  const probe = cli(step(storedFail));
  assert.equal(probe.stderr, '');
  assert.equal(probe.verdicts[0].now.verdict, DIAGNOSTIC);
  assert.deepEqual(probe.summary.moved, [`device-chrome-dnd ${OP} cua: fail -> ${DIAGNOSTIC}`]);
  assert.equal(probe.status, 1, 'never a release pass: exit 1');
  assert.equal(cli(step(storedFail), { flags: ['--diagnostic'] }).status, 1, '--diagnostic: the replay disagrees with the stored fail');
  // a stored pass the replay agrees with: still diagnostic only, exit 1 unless --diagnostic
  const storedPass = { pass: true, verdict: 'pass', reasons: [] };
  const agreeing = cli(step(storedPass));
  assert.equal(agreeing.verdicts.length, 0, 'nothing moved or failing: no verdict line');
  assert.deepEqual(agreeing.summary.premise.map((p) => p.verdict), [DIAGNOSTIC]);
  assert.equal(agreeing.status, 1);
  assert.equal(cli(step(storedPass), { flags: ['--diagnostic'] }).status, 0);
});

test("V4's device cells are replayed as before: a release pass, exit 0", () => {
  const run = 'pinned-V4';
  const expected = deviceSentence('org.gnome.TextEditor');
  const refused = (i) => ({ run, kind: 'sample', engine: 'cua', scene: 'device-gtk4', op: 'gtk4_click_shared', block: 0, i, ok: false, error: expected, expected_error: expected, unchanged: true, witness: true });
  const stepRows = [
    { run, kind: 'meta', blocks: 1 },
    refused(0),
    refused(1),
    { run, kind: 'audit', engine: 'cua', scene: 'device-gtk4', op: 'gtk4_click_shared', clean: true, audit: 'background', answered: [{ ok: false, error: expected, expected_error: expected }], forbidden: [] },
    { run, kind: 'verdict', scene: 'device-gtk4', op: 'gtk4_click_shared', candidate: 'cua', device: 'refusal', pass: true, verdict: 'pass', reasons: [] },
  ];
  const [r] = rejudgeDevice(stepRows);
  assert.deepEqual(r.verdicts[0].now, { verdict: 'pass', reasons: [] });
  assert.deepEqual(r.moved, []);
  const replayed = cli(stepRows);
  assert.equal(replayed.status, 0);
  assert.deepEqual(replayed.summary.premise, []);
});
