#!/usr/bin/env node
// #159: the public lines scripts/repl-parity/hosted/hosted.sh prints from cua's and repl-parity's JSON reports. The
// repository is public and so is the runner's log: each line carries only labels (outcome and reason codes, case, cell
// and field ids), booleans and counts. A string field shows only when it is label-shaped, otherwise `<withheld>`; free
// text (an error message, a run's meta.error, a stderr excerpt) is never printed, only whether it is present. A failed
// case also gets why, in fixture data only (reasonLine, cellLine): the kind of its assertion's reason, each cell's
// outcome and time, its value or its error's code and whether it timed out, and what the fixture recorded, every string
// in them a fixture word or withheld.
//
//   node scripts/repl-parity/hosted/public.mjs live <bind-dry.json>         exit 0 when a backend is live
//   node scripts/repl-parity/hosted/public.mjs bind <bind.json>             the outcome; exit 0 when bound
//   node scripts/repl-parity/hosted/public.mjs only-backend <bind.json>     the one live backend's id on stdout (never logged)
//   node scripts/repl-parity/hosted/public.mjs ready <list.json> <key>      the profile's readiness; exit 0 when ready and bound
//   node scripts/repl-parity/hosted/public.mjs run <run.out> <run-dir> <title>   the run's counts and, of a failed run, its
//                                                       failed cases and why; exit 0 only for a complete run whose assertions passed
//   node scripts/repl-parity/hosted/public.mjs diff <diff.json>             the diff's counts and undeclared differences; exit 0 when ok
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../browser-parity/runner.mjs';

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
// Why a case failed, in fixture data only (#168, ruling 719): what the cells answered and what the fixture recorded,
// each string a fixture word or withheld, so no path, address, environment or stderr leaves the runner.
const TIMEOUT = /timed out|timeout|deadline exceeded/i;
const FIXTURE_DATA_CHARS = 400;
// A fixture's own words ('pointer', 'ended', 'dragStart'): narrower than a label, with no path or address in it.
const FIXTURE_WORD = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,80}$/;
const word = value => (FIXTURE_WORD.test(value) ? value : '<withheld>');
const project = value => typeof value === 'string' ? word(value)
  : Array.isArray(value) ? value.map(project)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [word(k), project(v)]))
  : value;
export function fixtureData(value) {
  const text = JSON.stringify(project(value)) ?? '-';
  return text.length > FIXTURE_DATA_CHARS ? `${text.slice(0, FIXTURE_DATA_CHARS)}...` : text;
}
const parsedJSON = text => { try { return fixtureData(JSON.parse(text)); } catch { return '<withheld>'; } };
// The reasons support/assertions.mjs's expectValues gives, by kind; any other reason is only named `other`.
export function reasonLine(reason, cellLabels) {
  const text = typeof reason === 'string' ? reason : '';
  let m = text.match(/^fixture side effects differ: (.*)$/s);
  if (m) return `    reason side-effects: ${parsedJSON(m[1])}`;
  m = text.match(/^([A-Za-z0-9_-]+): (.*)$/s);
  if (m && cellLabels.includes(m[1])) {
    const result = m[2].match(/^unexpected fixture result (.*)$/s);
    if (result) return `    reason unexpected-result cell ${label(m[1])}: ${parsedJSON(result[1])}`;
    return `    reason cell-error cell ${label(m[1])} timeout ${TIMEOUT.test(m[2])}`;
  }
  if (text === 'unexpected cell count') return '    reason cell-count';
  return '    reason other';
}
// One cell's outcome: ok, its time and its value labelled, or its error's code and whether it was a timeout.
export function cellLine(row) {
  const ms = typeof row.ms === 'number' ? ` ms ${Math.round(row.ms)}` : '';
  let result;
  try { result = parseCell(row); } catch { return `    cell ${label(row.cell)}: no result marker${ms}`; }
  if (result.ok) return `    cell ${label(row.cell)}: ok true${ms} value ${fixtureData(result.value)}`;
  const message = typeof result.error?.message === 'string' ? result.error.message : '';
  return `    cell ${label(row.cell)}: ok false${ms} error ${label(result.error?.code)} timeout ${TIMEOUT.test(message)}`;
}
// A run passes when its summary (repl-parity.mjs run's last stdout line) shows a complete run of at least one case whose
// assertions passed (a declared vendor defect recorded counts as passed; the diff judges it).
export const runPassed = summary => summary?.complete === true && count(summary.cases) > 0 && ['PASS', 'RECORDED_VENDOR_DEFECT'].includes(summary.assertions);
// The run's summary line and, when the run did not pass, what its run directory says.
export function runLines(stdout, dir, title) {
  let summary = null;
  try { summary = JSON.parse(stdout.trim().split('\n').at(-1)); } catch {}
  const lines = [`${PREFIX} run ${label(title)}: ` + (summary
    ? `cases ${count(summary.cases)} complete ${summary.complete === true} assertions ${label(summary.assertions)} covered ${count(summary.coveredCases)} pending ${count(summary.pending)} vendorDefects ${count(summary.recordedVendorDefects)}`
    : 'no summary')];
  if (runPassed(summary)) return {lines, ok: true};
  try {
    const meta = json(join(dir, 'meta.json'));
    lines.push(`  meta: complete ${meta.complete === true} error ${meta.error ? 'present (withheld)' : 'none'}`);
  } catch { lines.push('  meta: unreadable'); }
  try {
    const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    const failed = rows.filter(row => row.assertion?.ok === false && !row.vendorDefect);
    for (const row of failed.slice(0, 30)) {
      lines.push(`  failed assertion: ${label(row.case)} ${label(row.cell)}`);
      const cells = rows.filter(r => r.case === row.case && r.assertion === undefined && r.cell !== undefined);
      lines.push(reasonLine(row.assertion.reason, cells.map(r => r.cell)), ...cells.map(cellLine));
    }
    lines.push(`  rows ${rows.length}, failed assertions ${failed.length}`);
  } catch { lines.push('  results: unreadable'); }
  return {lines, ok: false};
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
    else if (command === 'run') { let stdout = ''; try { stdout = readFileSync(file, 'utf8'); } catch {} const {lines, ok} = runLines(stdout, extra, title); for (const line of lines) console.log(line); process.exitCode = ok ? 0 : 1; }
    else if (command === 'diff') { const {lines, ok} = diffLines(json(file), extra); for (const line of lines) console.log(line); process.exitCode = ok ? 0 : 1; }
    else { console.error('usage: public.mjs live|bind|only-backend|ready|run|diff <file> [arg]'); process.exitCode = 2; }
  } catch {
    console.log(`${PREFIX} ${label(command)}: report unreadable`);
    process.exitCode = 1;
  }
}
