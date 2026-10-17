#!/usr/bin/env node
// #115 M1's cfprefs item (m1-mini.sh): one #116 suite run on cua's own host before M1 (the kernel under the Codex CLI's
// profile) and after (under cua's), judged. Both runs must be complete; their results must be equal but for the one
// fact M1 changes in a result, the kernel's exit status after SIGKILL on cells/lifecycle/child-exit-settles (the
// Codex CLI's exited(code=137) before, Node's own exited(signal=9) after, with the kernel then the stderr's Node:
// repl-parity's kernel-exit-status, which compares only across hosts).
//
//   node scripts/sandbox-probe/m1-judge.mjs before-after <diff.json> <before-run-dir> <after-run-dir>
//
// <diff.json> is `repl-parity.mjs diff <before> <after>`'s output. Prints the judgement; exits 1 unless it holds.
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {kernelExitFacts, normalizeHostDiagnostic} from '../repl-parity/diagnostics.mjs';

const EXIT_CASE = 'cells/lifecycle/child-exit-settles', EXIT_CELL = 'interrupted';
const BEFORE = {kernel_status: 'exited(code=137)', kernelIsStderrNode: false}, AFTER = {kernel_status: 'exited(signal=9)', kernelIsStderrNode: true};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// -> {ok, incomplete: [side...], undeclared: [difference...], exitStatus: 'equal' | 'declared' | 'absent'}
export function judgeBeforeAfter({diff, before, after}) {
  const incomplete = [['before', before], ['after', after]].filter(([, run]) => run.meta.complete !== true).map(([side]) => side);
  const exitRow = run => run.rows.filter(r => r.case === EXIT_CASE && r.cell === EXIT_CELL).map(normalizeHostDiagnostic);
  const [b, a] = [exitRow(before), exitRow(after)];
  const declared = b.length === 1 && a.length === 1 && same(kernelExitFacts(b[0]), BEFORE) && same(kernelExitFacts(a[0]), AFTER);
  const differences = diff.differences ?? [];
  const undeclared = differences.filter(d => !(declared && d.case === EXIT_CASE && d.cell === EXIT_CELL));
  const exitStatus = differences.some(d => d.case === EXIT_CASE && d.cell === EXIT_CELL) ? (declared ? 'declared' : 'undeclared') : 'equal';
  return {ok: !incomplete.length && !undeclared.length, incomplete, undeclared, exitStatus};
}

const load = dir => ({meta: JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')),
  rows: readFileSync(join(dir, 'results.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, diffFile, beforeDir, afterDir] = process.argv.slice(2);
  if (command !== 'before-after' || !afterDir) { console.error('usage: m1-judge.mjs before-after <diff.json> <before-run-dir> <after-run-dir>'); process.exit(2); }
  const judgement = judgeBeforeAfter({diff: JSON.parse(readFileSync(diffFile, 'utf8')), before: load(beforeDir), after: load(afterDir)});
  process.stdout.write(`${JSON.stringify(judgement, null, 2)}\n`);
  if (!judgement.ok) process.exitCode = 1;
}
