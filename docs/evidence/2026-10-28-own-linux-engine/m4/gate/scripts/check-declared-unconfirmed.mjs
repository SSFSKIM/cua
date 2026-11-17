#!/usr/bin/env node
// M4's gate (T18, task 79): V3's two chrome-input cells that candidate 3 declares unconfirmed (deviations.mjs REFUSALS,
// `unconfirmed` and `effect`; the design session's rulings 688 and 691), checked row by row over the stored samples,
// beside the harness's own verdict. The declaration holds only while every cua sample of the cell meets all three parts:
//   1. it answers menuUnconfirmed (not ok, its error the harness's MENU_UNCONFIRMED sentence);
//   2. the page's context counter rose on the element the request named (the operation's effect, read for that answer);
//   3. the witness is unchanged (the sample's `witness` true).
// It also requires the samples the run timed, the harness's stored verdict to be "declared unconfirmed", and cua's audit
// of the cell to be clean (its X requests the background route's, no foreign change), its own requests answered
// menuUnconfirmed too. Prints one row per cell and exits 0 only when both cells hold.
// Read-only. usage: node check-declared-unconfirmed.mjs <harness checkout (the candidate's commit)> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OPS = ['right_click_fallback', 'secondary_action'];
const SCENE = 'chrome-input';
const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node check-declared-unconfirmed.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { MENU_UNCONFIRMED } = await import(join(harness, 'scripts/linux-engine-diff/deviations.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
console.log(`# ${meta?.run}: chrome-input's declared unconfirmed cells, checked row by row (rulings 688, 691)`);
console.log(`label: ${meta?.label ?? (meta?.gate ? 'release gate' : 'development run, not a release gate')}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version}); ${file}`);
console.log('\n| cell | samples (timed) | 1. menuUnconfirmed | 2. context rose | 3. witness unchanged | all three | audit | stored verdict | holds |');
console.log('|---|---|---|---|---|---|---|---|---|');
let held = 0;
for (const op of OPS) {
  const mine = rows.filter((r) => r.kind === 'sample' && r.scene === SCENE && r.op === op && r.engine === 'cua');
  const v = rows.find((r) => r.kind === 'verdict' && r.scene === SCENE && r.op === op && r.candidate === 'cua' && !r.device);
  const timed = (v?.engines?.cua?.n_cold ?? 0) + (v?.engines?.cua?.n_warm ?? 0);
  const answer = mine.filter((r) => r.ok === false && MENU_UNCONFIRMED.test(String(r.error ?? '')));
  const rose = mine.filter((r) => r.effect === true);
  const witness = mine.filter((r) => r.witness === true);
  const all = mine.filter((r) => answer.includes(r) && rose.includes(r) && witness.includes(r));
  const audit = rows.find((r) => r.kind === 'audit' && r.scene === SCENE && r.op === op && r.engine === 'cua');
  const auditOk = Boolean(audit?.clean && !audit.foreign?.length && audit.answered?.length && audit.answered.every((a) => a.ok === false && MENU_UNCONFIRMED.test(String(a.error ?? ''))));
  const stored = v?.verdict ?? (v?.pass ? 'pass' : 'fail');
  const holds = mine.length > 0 && mine.length >= timed && all.length === mine.length && auditOk && stored === 'declared unconfirmed';
  if (holds) held += 1;
  const n = (xs) => `${xs.length}/${mine.length}`;
  console.log(`| ${SCENE} ${op} cua | ${mine.length} (${timed}) | ${n(answer)} | ${n(rose)} | ${n(witness)} | ${n(all)} | ${audit ? (auditOk ? `clean, ${audit.answered.length} menuUnconfirmed` : 'NOT as declared') : 'none'} | ${stored} | ${holds ? 'yes' : 'NO'} |`);
  for (const r of mine.filter((x) => !all.includes(x))) console.log(`  not all three: block ${r.block} ${r.series} ${r.i}: ok ${r.ok}, error ${JSON.stringify(r.error ?? null)}, effect ${r.effect}, witness ${r.witness}`);
}
const pass = held === OPS.length;
console.log(`\nVERDICT (declared unconfirmed, listed apart, never a pass): ${pass ? 'HOLDS' : 'DOES NOT HOLD'} for ${held} of ${OPS.length} cells`);
process.exit(pass ? 0 : 1);
