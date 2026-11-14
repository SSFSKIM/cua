#!/usr/bin/env node
// M4's gate (T18, task 77): a verdict step's stored rows re-judged with the witness span's limit on a late take's drop
// (the design session, 2026-11-14, sminos 680). The late-take case (device.mjs `late-take`, `--dnd-defer-take`) checks
// that where Chrome's drop landed the witness saw the desktop change, since the notice says it may have. The witness
// watches until 20 ms after the engine's answer (witness.mjs `startWitness`, `tailMs` 20, run.mjs's own call), and a
// late take's drop goes on after the answer: Chrome activates its window 4 to 8 ms after the page's dragend. A drop
// whose dragend comes after the answer plus the tail lands its activation after the span closed, so the witness cannot
// record it (V5 on candidate 2, chrome_dnd_late_take_shared 2/0: the dragend 201 ms after the press, the answer at 165).
//
// Applied mechanically to the late-take case's cua samples. A sample the case's rule failed ("a drop the witness did not
// record": it dropped, the witness unchanged) counts as the span's limit only when all of these hold:
//   1. the drag answered as a plain drag (ok), the read after it ran and carried the late notice, and the next acting
//      request was refused with the expected notice (T14's contract);
//   2. the engine's after-release watch escaped the late take (`late_dnd.escaped`);
//   3. the page's pointer log is the sample's own press, and that press's dragend (`drop_status.after.dur`, ms after the
//      press) is at or past the answer (`ms`, from the request's send, before the press) plus the tail;
// Every other rule of the case is the candidate's own (device.mjs `judgeDevice`), run over the samples without the
// span-limited ones: it must pass, so the case still needs a drop the witness recorded. Every other verdict row keeps its
// stored verdict, and the run must be valid, its stub check failed by witness and audit. Read-only: it reads the stored
// rows and prints. usage: node rejudge-late-take-window.mjs <harness checkout (the candidate's commit)> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OP = 'chrome_dnd_late_take_shared';
const TAIL_MS = 20;
const RULE = 'a drop the witness did not record';
const RULING = 'the design session, 2026-11-14 (sminos 680)';

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node rejudge-late-take-window.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { judgeDevice } = await import(join(harness, 'scripts/linux-engine-diff/device.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
const end = rows.find((r) => r.kind === 'end');
const stub = rows.find((r) => r.kind === 'stub-check');

const problems = [];
if (!end?.valid) problems.push('the run is not valid');
if (!(stub?.witness_failed_it && stub?.audit_failed_it)) problems.push('the stub check was not failed by both the witness and the audit');

console.log(`# ${meta?.run} re-judged with the witness span's limit on a late take's drop (${RULING})`);
console.log(`label: ${meta?.label ?? (meta?.gate ? 'release gate' : 'development run, not a release gate')}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version}); ${file}`);

const verdictOf = (v) => v.verdict ?? (v.pass ? 'pass' : 'fail');
const out = [];
for (const v of rows.filter((r) => r.kind === 'verdict')) {
  const name = `${v.scene} ${v.op} ${v.candidate}`;
  if (v.op !== OP || v.candidate !== 'cua') {
    out.push({ name, stored: verdictOf(v), now: verdictOf(v), why: 'stored verdict' });
    continue;
  }
  const samples = rows.filter((r) => r.kind === 'sample' && r.scene === v.scene && r.op === OP && r.engine === 'cua');
  const a = rows.find((r) => r.kind === 'audit' && r.scene === v.scene && r.op === OP && r.engine === 'cua');
  const audit = a ? { clean: a.clean, kind: a.audit, answered: a.answered, forbidden: a.forbidden.map((f) => f.what) } : null;
  const why = [];
  // the candidate's own judge reproduces the stored verdict
  const replay = judgeDevice(OP, samples, audit);
  if (JSON.stringify(replay.reasons) !== JSON.stringify(v.reasons ?? [])) why.push(`the candidate's judge does not reproduce the stored reasons (${replay.reasons.join('; ')})`);
  const unrecorded = samples.filter((r) => r.dropped && r.witness !== false);
  const limited = [];
  for (const r of unrecorded) {
    const at = `${r.block}/${r.i}`;
    const after = r.drop_status?.after;
    const misses = [];
    if (r.ok !== true) misses.push('the drag did not answer as a plain drag');
    if (r.read_ok !== true || r.read_notice !== true) misses.push('the read did not run with the notice');
    if (!(r.next_ok === false && r.next_error === r.expected_notice)) misses.push('the next acting request was not refused with the notice');
    if (r.late_dnd?.escaped !== true) misses.push('the after-release watch did not escape the take');
    if (!(typeof after?.downs === 'number' && after.log?.seq === after.downs)) misses.push("the page's pointer log is not the sample's own press");
    else if (!(typeof after.dur === 'number' && typeof r.ms === 'number' && after.dur >= r.ms + TAIL_MS)) misses.push(`the dragend (${after.dur} ms after the press) came before the span closed (answer ${r.ms} + ${TAIL_MS} ms)`);
    if (misses.length) why.push(`${at}: not the span's limit: ${misses.join('; ')}`);
    else limited.push({ at, dur: after.dur, ms: r.ms });
  }
  // every other rule of the case, the candidate's own, without the span-limited samples
  const keys = new Set(limited.map((l) => l.at));
  const rest = judgeDevice(OP, samples.filter((r) => !keys.has(`${r.block}/${r.i}`)), audit);
  if (!rest.pass) why.push(`the case without them: ${rest.reasons.join('; ')}`);
  const note = limited.map((l) => `${l.at} (dragend ${l.dur} ms after the press, answer ${l.ms} ms + ${TAIL_MS})`).join(', ');
  out.push({ name, stored: verdictOf(v), now: why.length ? 'fail' : 'pass', why: why.length ? why.join('; ') : `${samples.length} samples; the witness span's limit: ${note || 'none'}; every other rule passes` });
}

console.log('\n| verdict row | stored | re-judged | why |');
console.log('|---|---|---|---|');
for (const o of out.filter((x) => x.now !== x.stored || x.now !== 'pass' || x.name.includes(OP))) console.log(`| ${o.name} | ${o.stored} | ${o.now} | ${o.why} |`);
const failed = out.filter((o) => !['pass', 'parity', 'declared refusal'].includes(o.now));
console.log(`\nrows: ${out.length}; failing: ${failed.map((f) => f.name).join(', ') || 'none'}`);
if (problems.length) console.log(`run problems: ${problems.join('; ')}`);
const pass = failed.length === 0 && problems.length === 0;
console.log(`VERDICT (the run's verdicts, ${OP} with the witness span's limit): ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
