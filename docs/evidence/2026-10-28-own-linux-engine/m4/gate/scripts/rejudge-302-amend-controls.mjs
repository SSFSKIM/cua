#!/usr/bin/env node
// Negative controls for rejudge-302.mjs's amended desktop condition (task 77): `desktop_clean === true && front_active
// !== false`, where it had required front_active === true (a desktop-route cell has no front window, so front_active is
// null there). The stored rows as they are, and each edited one way the amended condition must still refuse, written to a
// scratch file and re-judged. usage: node rejudge-302-amend-controls.mjs <harness checkout> <L3b results> <S1 c2 results> <S1 c1 results> [<c1 harness checkout>]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [H, L3B, S1C2, S1C1, H1 = H] = process.argv.slice(2);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'rejudge-302.mjs');
const rows = (f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// the first #302 run of a cell: a failing settle-run the stored verdict counted late
const first302 = (r, cell) => r.find((x) => x.kind === 'settle-run' && x.cell === cell && !x.ok && x.late_ms != null);
const judge = (harness, file, edit) => {
  const r = rows(file);
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rj302a-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try {
    execFileSync(process.execPath, [SCRIPT, harness, join(dir, 'results.jsonl')], { encoding: 'utf8' });
    return 'PASS';
  } catch (e) {
    return `FAIL (${(String(e.stdout).match(/trial \d+: fail: .*/) || ['?'])[0]})`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const DESK = 'electron-input press_key desktop';
const BG = 'electron-input press_key background';
const controls = [
  ['L3b as stored (must PASS)', H, L3B, () => {}, 'PASS'],
  ['L3b: a desktop-route #302 run whose desktop changed (desktop_clean false)', H, L3B, (r) => { first302(r, DESK).desktop_clean = false; }, 'FAIL'],
  ['S1 on candidate 2 as stored (must PASS, unchanged)', H, S1C2, () => {}, 'PASS'],
  ['S1 on candidate 2: a background #302 run with its front window not active (front_active false)', H, S1C2, (r) => { first302(r, BG).front_active = false; }, 'FAIL'],
  ['S1 on candidate 1 as stored (must PASS, unchanged)', H1, S1C1, () => {}, 'PASS'],
];
let ok = true;
for (const [name, harness, file, edit, want] of controls) {
  const got = judge(harness, file, edit);
  const as = got.startsWith(want);
  ok &&= as;
  console.log(`${as ? 'ok  ' : 'BAD '} ${name}: ${got}`);
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
