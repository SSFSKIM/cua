#!/usr/bin/env node
// M4's gate (T18, task 76): a verdict step's stored rows re-judged with activate_window's raise-wait cost declared as a
// speed gap with no closing route (the design session, 2026-11-13, sminos 666; #373). Task 63 (2026-11-06) made
// activate_window answer only once its window is on top, so the next input cannot reach the window it covered; the wait
// is the safety, and it costs about the window manager's raise time against the vendor builds, which answer before the
// raise. The ruling came after M3's gate, and no verdict run measured activate_window on :0 until this gate's V3.
//
// Applied mechanically: every verdict row's stored verdict stands, but a cua activate_window row (any scene) is judged
// again with the candidate's own verdict function (run.mjs judgeWithDecisions over the stored samples, speed decisions
// and audits, exactly as the run called it). It reads **declared gap**, listed apart and never counted as a pass, only
// when its every failing reason is a speed reason (cold or warm) and its effect, witness and audit are clean:
//   - effect: every cua sample answered ok with its effect, as many samples as the run timed;
//   - audit: cua's audit answered ok, and its forbidden requests are only those the vendor builds' audits show for the
//     same operation (the activation itself: _NET_ACTIVE_WINDOW, the raise, the focus), with no foreign change;
//   - witness: every field a cua sample's witness saw change is one the vendor builds' samples saw change too.
// Anything else fails. The run itself must be valid, its stub check failed by witness and audit, and its trace clean.
// Read-only. usage: node rejudge-speed-gap.mjs <harness checkout (the candidate's commit)> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAP = {
  op: 'activate_window',
  issue: '#373',
  wording: "activate_window waits for its window's raise so the next input can't reach the window it covered (task 63, 2026-11-06); the wait is the safety; tracked by #373",
  ruling: 'the design session, 2026-11-13 (sminos 666)',
};
const VENDORS = ['pinned', 'newest'];
// the run's own split of a verdict's reasons (run.mjs and rejudge.mjs SPEED_REASON): the candidate's cold or warm series
const SPEED_REASON = /^\S+: (cold|warm)[ :]/;

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node rejudge-speed-gap.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { judgeWithDecisions } = await import(join(harness, 'scripts/linux-engine-diff/run.mjs'));
const { medianDifferenceInterval } = await import(join(harness, 'scripts/linux-engine-diff/events.mjs'));
const { declaredParity } = await import(join(harness, 'scripts/linux-engine-diff/deviations.mjs'));
const { OPS } = await import(join(harness, 'scripts/linux-engine-diff/ops.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
const end = rows.find((r) => r.kind === 'end');
const stub = rows.find((r) => r.kind === 'stub-check');
const samples = rows.filter((r) => r.kind === 'sample');
const auditRows = rows.filter((r) => r.kind === 'audit');
const decisions = rows.filter((r) => r.kind === 'speed-decision');

const problems = [];
if (!end?.valid) problems.push('the run is not valid');
if (!(stub?.witness_failed_it && stub?.audit_failed_it)) problems.push("the stub check was not failed by both the witness and the audit");
if (!end?.desktop?.trace?.clean || end.desktop.trace.foreign?.length) problems.push("the run's trace is not clean");

console.log(`# ${meta?.run} re-judged with ${GAP.op}'s declared speed gap (${GAP.issue}; ${GAP.ruling})`);
console.log(`label: ${meta?.label ?? (meta?.gate ? 'release gate' : 'development run, not a release gate')}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version}); ${file}`);
console.log(`gap: ${GAP.wording}`);

const verdictOf = (v) => v.verdict ?? (v.pass ? 'pass' : 'fail');
const STANDING = new Set(['pass', 'parity', 'declared refusal']);
const out = [];
for (const v of rows.filter((r) => r.kind === 'verdict')) {
  const name = `${v.scene} ${v.op} ${v.device ? '(device)' : v.candidate}`;
  if (v.op !== GAP.op || v.device || v.candidate !== 'cua') {
    out.push({ name, stored: verdictOf(v), now: verdictOf(v), why: 'stored verdict' });
    continue;
  }
  // the candidate's own verdict function, as run.mjs called it
  const opRows = samples.filter((r) => r.scene === v.scene && r.op === v.op && [...VENDORS, 'cua'].includes(r.engine));
  const audits = Object.fromEntries(auditRows.filter((a) => a.scene === v.scene && a.op === v.op).map((a) => [a.engine, { clean: a.clean, oks: a.oks, answered: a.answered, forbidden: a.forbidden.map((f) => f.what) }]));
  const parity = ['cold', 'warm'].map((series) => declaredParity({ op: v.op, scene: v.scene, series })).filter(Boolean);
  const decided = new Map(decisions.filter((d) => d.scene === v.scene && d.op === v.op && d.candidate === 'cua').map((d) => [`${d.candidate}|${d.series}`, d]));
  const now = judgeWithDecisions(opRows, { vendors: VENDORS, candidate: 'cua', audits, judgeSpeed: (meta?.via ?? 'wire') === 'wire', text: OPS[v.op]?.kind === 'text', noise: medianDifferenceInterval, parity }, decided);
  const speed = now.reasons.filter((x) => SPEED_REASON.test(x));
  const other = [...new Set([...now.reasons, ...(v.reasons ?? [])].filter((x) => !SPEED_REASON.test(x)))];
  const why = [...other];
  // effect: every cua sample ok with its effect, as many as the run timed
  const mine = opRows.filter((r) => r.engine === 'cua');
  const timed = (v.engines?.cua?.n_cold ?? 0) + (v.engines?.cua?.n_warm ?? 0);
  const effectOk = mine.filter((r) => r.ok === true && r.effect === true).length;
  if (effectOk !== mine.length || mine.length < timed) why.push(`effect ${effectOk} of ${mine.length} samples (${timed} timed)`);
  // audit: ok, only the vendor builds' own forbidden requests for this operation, no foreign change
  const cuaAudit = auditRows.find((a) => a.scene === v.scene && a.op === v.op && a.engine === 'cua');
  const vendorWhats = new Set(auditRows.filter((a) => a.scene === v.scene && a.op === v.op && VENDORS.includes(a.engine)).flatMap((a) => a.forbidden.map((f) => f.what)));
  if (!cuaAudit) why.push('no audit of cua');
  else {
    if (!cuaAudit.ok) why.push("cua's audit did not answer ok");
    const extra = [...new Set(cuaAudit.forbidden.map((f) => f.what))].filter((w) => !vendorWhats.has(w));
    if (extra.length) why.push(`cua's audit shows requests the vendor builds' do not: ${extra.join(', ')}`);
    if (cuaAudit.foreign?.length) why.push(`cua's audit shows ${cuaAudit.foreign.length} foreign change(s)`);
  }
  // witness: only fields the vendor builds' samples saw change too
  const fields = (rs) => new Set(rs.flatMap((r) => (r.witness_changes ?? []).map((c) => c.field)));
  const vendorFields = fields(opRows.filter((r) => VENDORS.includes(r.engine)));
  const extraFields = [...fields(mine)].filter((f) => !vendorFields.has(f));
  if (extraFields.length) why.push(`cua's witness saw ${extraFields.join(', ')} change, which the vendor builds' did not`);
  const verdict = why.length ? 'fail' : speed.length ? 'declared gap' : 'pass';
  out.push({ name, stored: verdictOf(v), now: verdict, why: why.length ? why.join('; ') : speed.length ? `speed only: ${speed.join('; ')}; effect ${effectOk}/${mine.length}, audit and witness as the vendor builds'` : 'clean' });
}

console.log('\n| verdict row | stored | re-judged | why |');
console.log('|---|---|---|---|');
for (const o of out.filter((x) => x.now !== x.stored || x.now === 'declared gap' || !STANDING.has(x.now))) console.log(`| ${o.name} | ${o.stored} | ${o.now} | ${o.why} |`);
const tally = out.reduce((m, o) => ({ ...m, [o.now]: (m[o.now] ?? 0) + 1 }), {});
const failed = out.filter((o) => !STANDING.has(o.now) && o.now !== 'declared gap');
const gaps = out.filter((o) => o.now === 'declared gap');
console.log(`\nrows: ${out.length} (${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(', ')}); declared gap (listed apart, never a pass): ${gaps.map((g) => g.name).join(', ') || 'none'}`);
if (problems.length) console.log(`run problems: ${problems.join('; ')}`);
const pass = failed.length === 0 && problems.length === 0;
console.log(`VERDICT (the run's verdicts, ${GAP.op} by its declared gap ${GAP.issue}): ${pass ? 'PASS' : 'FAIL'}${failed.length ? `; failing: ${failed.map((f) => f.name).join(', ')}` : ''}`);
process.exit(pass ? 0 : 1);
