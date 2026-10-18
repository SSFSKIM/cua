#!/usr/bin/env node
// #159: the public lines scripts/repl-parity/hosted/hosted.sh prints from cua's and repl-parity's JSON reports. The
// repository is public and so is the runner's log: each line carries only labels (outcome and reason codes, case, cell
// and field ids), booleans and counts. A string field shows only when it is label-shaped, otherwise `<withheld>`; free
// text (an error message, a run's meta.error, a stderr excerpt) is never printed, only whether it is present.
//
//   node scripts/repl-parity/hosted/public.mjs live <bind-dry.json>         exit 0 when a backend is live
//   node scripts/repl-parity/hosted/public.mjs bind <bind.json>             the outcome; exit 0 when bound
//   node scripts/repl-parity/hosted/public.mjs only-backend <bind.json>     the one live backend's id on stdout (never logged)
//   node scripts/repl-parity/hosted/public.mjs ready <list.json> <key>      the profile's readiness; exit 0 when ready and bound
//   node scripts/repl-parity/hosted/public.mjs run <run.out> <run-dir> <title>   the run's counts and, of a failed run, its failed cases
//   node scripts/repl-parity/hosted/public.mjs diff <diff.json>             the diff's counts and undeclared differences; exit 0 when ok
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PREFIX = 'hosted-parity:';
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,160}$/;
export const label = value => value === undefined || value === null ? '-'
  : typeof value === 'number' || typeof value === 'boolean' ? String(value)
  : typeof value === 'string' && LABEL.test(value) ? value : '<withheld>';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const count = value => Array.isArray(value) ? value.length : typeof value === 'number' ? value : 0;

export function bindLine(r) {
  return `${PREFIX} bind: ok ${r.ok === true} outcome ${label(r.outcome)} how ${label(r.how)} by ${label(r.by ?? r.reason)} backends ${count(r.backends)}`;
}
export function onlyBackend(r) {
  const backends = r.backends ?? [];
  return backends.length === 1 && typeof backends[0].instanceId === 'string' ? backends[0].instanceId : null;
}
export function readyLines(r, key) {
  const lines = (r.profiles ?? []).map(p => `${PREFIX} profile ${label(p.key)}: ready ${p.ready === true} reason ${label(p.reason)} bound ${Boolean(p.extensionInstanceId)}`);
  if (r.listingError) lines.push(`${PREFIX} profiles listing error ${label(r.listingError)}`);
  const profile = (r.profiles ?? []).find(p => p.key === key);
  return {lines, ok: profile?.ready === true && Boolean(profile.extensionInstanceId)};
}
// The run's last stdout line (repl-parity.mjs run's summary) and, when the run did not pass, its run directory.
export function runLines(stdout, dir, title) {
  let summary = null;
  try { summary = JSON.parse(stdout.trim().split('\n').at(-1)); } catch {}
  const lines = [`${PREFIX} run ${label(title)}: ` + (summary
    ? `cases ${count(summary.cases)} complete ${summary.complete === true} assertions ${label(summary.assertions)} covered ${count(summary.coveredCases)} pending ${count(summary.pending)} vendorDefects ${count(summary.recordedVendorDefects)}`
    : 'no summary')];
  if (summary?.complete === true && summary.assertions === 'PASS') return lines;
  try {
    const meta = json(join(dir, 'meta.json'));
    lines.push(`  meta: complete ${meta.complete === true} error ${meta.error ? 'present (withheld)' : 'none'}`);
  } catch { lines.push('  meta: unreadable'); }
  try {
    const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const failed = rows.filter(row => row.assertion?.ok === false && !row.vendorDefect);
    for (const row of failed.slice(0, 30)) lines.push(`  failed assertion: ${label(row.case)} ${label(row.cell)}`);
    lines.push(`  rows ${rows.length}, failed assertions ${failed.length}`);
  } catch { lines.push('  results: unreadable'); }
  return lines;
}
export function diffLines(r, suite) {
  const undeclared = r.differences ?? [];
  const lines = [`${PREFIX} diff ${label(suite)}: ok ${r.ok === true} undeclared ${undeclared.length} expected ${count(r.expected)}`];
  for (const d of undeclared.slice(0, 30)) lines.push(`  undeclared: ${label(d.kind)} side ${label(d.side)} case ${label(d.case)} cell ${label(d.cell)} field ${label(d.field)}`);
  return {lines, ok: r.ok === true && undeclared.length === 0};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file, extra, title] = process.argv.slice(2);
  // Any unreadable input fails with a fixed line: the parser's message can quote the input.
  try {
    if (command === 'live') process.exitCode = count(json(file).backends) > 0 ? 0 : 1;
    else if (command === 'bind') { const r = json(file); console.log(bindLine(r)); process.exitCode = r.ok === true ? 0 : 1; }
    else if (command === 'only-backend') { const id = onlyBackend(json(file)); if (id) console.log(id); else process.exitCode = 1; }
    else if (command === 'ready') { const {lines, ok} = readyLines(json(file), extra); for (const line of lines) console.log(line); process.exitCode = ok ? 0 : 1; }
    else if (command === 'run') { let stdout = ''; try { stdout = readFileSync(file, 'utf8'); } catch {} for (const line of runLines(stdout, extra, title)) console.log(line); }
    else if (command === 'diff') { const {lines, ok} = diffLines(json(file), extra); for (const line of lines) console.log(line); process.exitCode = ok ? 0 : 1; }
    else { console.error('usage: public.mjs live|bind|only-backend|ready|run|diff <file> [arg]'); process.exitCode = 2; }
  } catch {
    console.log(`${PREFIX} ${label(command)}: report unreadable`);
    process.exitCode = 1;
  }
}
