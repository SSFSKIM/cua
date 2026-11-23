#!/usr/bin/env node
// Negative controls for compare-settle.mjs (the design session's ruling 697): a settle cross-check's later summary edited
// one way at a time and compared again. The summaries as stored must be the SAME; every edit must DIFFER: a run-wide
// failure the cell tables do not show (a change to a window the experiment did not open, the display's watchdog), a
// cell gone from the later run, and an audit that failed.
// usage: node compare-settle-controls.mjs <earlier summary.md> <later summary.md>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [earlier, later] = process.argv.slice(2);
if (!earlier || !later) {
  console.error('usage: node compare-settle-controls.mjs <earlier summary.md> <later summary.md>');
  process.exit(2);
}
const script = join(dirname(fileURLToPath(import.meta.url)), 'compare-settle.mjs');
const text = readFileSync(later, 'utf8');
const compare = (edited) => {
  const dir = mkdtempSync(join(tmpdir(), 'compare-settle-'));
  const path = join(dir, 'summary.md');
  writeFileSync(path, edited);
  try {
    execFileSync(process.execPath, [script, earlier, path], { encoding: 'utf8' });
    return 'SAME';
  } catch (e) {
    const out = String(e.stdout);
    const failures = out.match(/the runs' own failures: [^\n]*/)?.[0] ?? '';
    return `DIFFERS (${failures.includes('differing:') ? failures : (out.match(/cells: [^\n]*/) || ['?'])[0]})`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
// the run's own failure line, as runSettle writes it: one line, its entries joined by '; ', after the tables
const failing = (f) => `${text.trimEnd()}\n\n**Incomplete or failed:** ${f}.\n`;
const lines = text.split('\n');
const firstCell = lines.findIndex((l) => /^\| \S.* \| \S+ \| \d+ \|/.test(l));
const firstAudit = lines.findIndex((l) => /^\| \S.* \| clean \| \d+ \|/.test(l));
const controls = [
  ['the summaries as stored', text, 'SAME'],
  ['a change to a window the experiment did not open, at the later run\'s cleanup', failing('a window the experiment did not open was changed: the harness: 0x00a00003 ConfigureWindow (raised)'), 'DIFFERS'],
  ["the later run's private display's watchdog failed", failing("the private display's watchdog: it stalled for 2.1 s"), 'DIFFERS'],
  ['a cell gone from the later run', lines.filter((_, i) => i !== firstCell).join('\n'), 'DIFFERS'],
  ['an audit of the later run failed', lines.map((l, i) => (i === firstAudit ? l.replace('| clean |', '| **a request the route does not send** |') : l)).join('\n'), 'DIFFERS'],
];
let ok = true;
for (const [what, edited, want] of controls) {
  const got = compare(edited);
  ok &&= got.startsWith(want);
  console.log(`${got.startsWith(want) ? 'ok  ' : 'BAD '} ${what}: ${got}`);
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
