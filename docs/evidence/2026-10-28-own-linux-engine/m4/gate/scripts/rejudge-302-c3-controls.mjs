#!/usr/bin/env node
// Negative controls for rejudge-302.mjs on candidate 3 (task 79): task 76's controls of #302's criteria
// (rejudge-controls.mjs) and task 77's of the amended desktop condition (rejudge-302-amend-controls.mjs), applied to a
// stored step's own #302 runs rather than fixed trials. Each step's rows as stored must PASS; every edit, made to the
// cell's first #302 run (and the run after it, for the third criterion), must FAIL. usage:
//   node rejudge-302-c3-controls.mjs <harness checkout> <step results.jsonl>...
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [H, ...files] = process.argv.slice(2);
if (!H || !files.length) {
  console.error('usage: node rejudge-302-c3-controls.mjs <harness checkout> <step results.jsonl>...');
  process.exit(2);
}
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'rejudge-302.mjs');
const rows = (f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const CELLS = ['electron-input press_key background', 'electron-input press_key desktop'];
// a cell's first #302 run: a failing settle-run the stored verdict counted late; and the run after it
const first302 = (r, cell) => r.find((x) => x.kind === 'settle-run' && x.cell === cell && !x.ok && x.late_ms != null);
const nextRun = (r, run) => r.find((x) => x.kind === 'settle-run' && x.cell === run.cell && x.lane === run.lane && x.trial === run.trial + 1);
const judge = (file, edit) => {
  const r = rows(file);
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rj302c3-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try {
    execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' });
    return 'PASS';
  } catch (e) {
    return `FAIL (${(String(e.stdout).match(/trial \d+: fail: .*/) || String(e.stdout).match(/VERDICT[^\n]*/) || ['?'])[0]})`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const edits = {
  'a lost key: no late reading': (run) => Object.assign(run, { late_ms: null }),
  'criterion 1: no key-down in the settle': (run) => { run.after.key_downs = run.before.key_downs; },
  'criterion 2: the key-up already counted, yet not ok': (run) => { run.after.key_ups = run.before.key_ups + 1; },
  'criterion 3: the next before-read still one release short': (run, r) => { const n = nextRun(r, run); n.before.key_ups = n.before.key_downs - 1; },
  'a refusal': (run) => { run.answers = [{ ok: false }]; },
  'the desktop changed (desktop_clean false)': (run) => { run.desktop_clean = false; },
  'its front window not active (front_active false)': (run) => { run.front_active = false; },
};
let ok = true;
const report = (name, got, want) => {
  const as = got.startsWith(want);
  ok &&= as;
  console.log(`${as ? 'ok  ' : 'BAD '} ${name}: ${got}`);
};
for (const file of files) {
  const step = (rows(file).find((x) => x.kind === 'meta')?.run) ?? file;
  report(`${step} as stored (must PASS)`, judge(file, () => {}), 'PASS');
  for (const cell of CELLS) {
    const first = first302(rows(file), cell);
    if (!first) { console.log(`     ${step} ${cell}: no #302 run, no control`); continue; }
    for (const [name, edit] of Object.entries(edits)) {
      if (name.startsWith('criterion 3') && !nextRun(rows(file), first)) continue;
      report(`${step} ${cell}, trial ${first.trial}: ${name}`, judge(file, (r) => edit(first302(r, cell), r)), 'FAIL');
    }
  }
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
