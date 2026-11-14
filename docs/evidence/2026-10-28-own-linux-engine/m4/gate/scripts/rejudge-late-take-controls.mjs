#!/usr/bin/env node
// M4's gate (T18, task 77): negative controls for rejudge-late-take-window.mjs. V5's stored rows pass; each control
// edits them one way and must fail: the span-limited sample's notice missing, its next acting request not refused, its
// drop early (a clean witness on a drop that ended inside the span), and no drop in the case the witness recorded.
// usage: node rejudge-late-take-controls.mjs <harness checkout> <results.jsonl>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [harness, file] = process.argv.slice(2);
const script = join(dirname(fileURLToPath(import.meta.url)), 'rejudge-late-take-window.mjs');
const OP = 'chrome_dnd_late_take_shared';
const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const isCase = (r) => r.kind === 'sample' && r.op === OP && r.engine === 'cua';
const limited = (r) => isCase(r) && r.dropped && r.witness !== false;

const judge = (rows) => {
  const dir = mkdtempSync(join(tmpdir(), 'rejudge-late-take-'));
  const path = join(dir, 'results.jsonl');
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  try {
    execFileSync('node', [script, harness, path], { stdio: 'pipe' });
    return { got: 'PASS', why: '' };
  } catch (e) {
    const row = String(e.stdout ?? '').split('\n').find((l) => l.includes(OP)) ?? '';
    return { got: 'FAIL', why: row.split('|').at(-2)?.trim() ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const edit = (fn) => lines.map((r) => fn(structuredClone(r)) ?? r);

const controls = [
  ['the stored rows', lines, 'PASS'],
  ['the notice missing on the span-limited sample', edit((r) => limited(r) ? ((r.read_notice = false), r) : r), 'FAIL'],
  ['its next acting request not refused', edit((r) => limited(r) ? ((r.next_ok = true), (r.next_error = null), r) : r), 'FAIL'],
  ['its drop early: a clean witness on a drop that ended inside the span', edit((r) => limited(r) ? ((r.drop_status.after.dur = Math.floor(r.ms)), r) : r), 'FAIL'],
  // every drop of the case unrecorded and late, so each would count as the span's limit: no drop is left that the witness recorded
  ['no drop in the case the witness recorded', edit((r) => isCase(r) && r.dropped ? ((r.witness = true), (r.witness_fields = undefined), (r.witness_changes = undefined), (r.drop_status.after.dur = Math.ceil(r.ms + 20)), r) : r), 'FAIL'],
];
let ok = true;
for (const [what, rows, want] of controls) {
  const { got, why } = judge(rows);
  ok &&= got === want;
  console.log(`${got === want ? 'ok  ' : 'BAD '} ${what}: ${got} (expected ${want})${why ? `: ${why}` : ''}`);
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
