#!/usr/bin/env node
// Task 108 (ruling 867; fix wave 1, ruling 870): ruling 680's four case controls
// (m5/x64/scripts/rejudge-680/rejudge-late-take-controls.mjs, the same edits) and ruling 870's two (the previous drag's
// dragend timing left on the sample; its drop counter unread) on a stored V5 step's real rows, judged by the live judge
// with 680 encoded (this checkout's device.mjs, through rejudge-device.mjs `rejudgeDevice`). The stored rows must pass
// the late-take cell; each edit must fail it. Read-only: the edits are made in memory. The run-wide controls (a foreign
// change, preparation failures over the cap, a planned operation with no verdict) are not the cell's judge's:
// test/linux-engine-diff/late-take-span-680.test.mjs proves them through stats.mjs `runOutcome`.
//   node controls.mjs <checkout> <step dir>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [checkout, step] = process.argv.slice(2);
const { evidenceOf, judgedVerdict, rejudgeDevice } = await import(pathToFileURL(join(checkout, 'scripts/linux-engine-diff/rejudge-device.mjs')).href);
const file = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(step, p)).find(existsSync);
const bytes = readFileSync(file);
const lines = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sidecar = evidenceOf(step);

const OP = 'chrome_dnd_late_take_shared';
const isCase = (r) => r.kind === 'sample' && r.op === OP && r.engine === 'cua';
const limited = (r) => isCase(r) && r.dropped && r.witness !== false;
const edit = (fn) => lines.map((r) => fn(structuredClone(r)) ?? r);
const controls = [
  ['the stored rows', lines, 'pass'],
  ['the notice missing on the span-limited sample', edit((r) => (limited(r) ? ((r.read_notice = false), r) : r)), 'fail'],
  ['its next acting request not refused', edit((r) => (limited(r) ? ((r.next_ok = true), (r.next_error = null), r) : r)), 'fail'],
  ['its drop early: a clean witness on a drop that ended inside the span', edit((r) => (limited(r) ? ((r.drop_status.after.dur = Math.floor(r.ms)), r) : r)), 'fail'],
  // ruling 870's: the previous drag's dragend timing left on the sample (its own end never counted), and the counter unread
  ['stale end timing: the previous drag\'s dragend left on the span-limited sample', edit((r) => (limited(r) ? ((r.drop_status.after.ends = r.drop_status.before.ends), (r.drop_status.after.starts = r.drop_status.before.starts), (r.drop_status.after.dur = r.drop_status.before.dur), r) : r)), 'fail'],
  ['an unread drop counter on the span-limited sample', edit((r) => (limited(r) ? ((r.drop_status.after.drops = undefined), r) : r)), 'fail'],
  ['no drop in the case the witness recorded', edit((r) => (isCase(r) && r.dropped ? ((r.witness = true), (r.witness_fields = undefined), (r.witness_changes = undefined), (r.drop_status.after.dur = Math.ceil(r.ms + 20)), r) : r)), 'fail'],
];
let ok = true;
for (const [what, rows, want] of controls) {
  const [run] = rejudgeDevice(rows, { lines: sidecar });
  const v = run.verdicts.find((x) => x.name.includes(OP));
  const got = judgedVerdict(v.now);
  ok &&= got === want;
  console.log(`${got === want ? 'ok  ' : 'BAD '} ${what}: ${got} (expected ${want})${v.now.reasons.length ? `: ${v.now.reasons.join('; ')}` : ''}`);
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
