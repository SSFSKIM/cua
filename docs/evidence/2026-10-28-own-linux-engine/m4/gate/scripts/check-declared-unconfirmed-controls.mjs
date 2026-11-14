#!/usr/bin/env node
// Negative controls for check-declared-unconfirmed.mjs (task 79): a V3 run's stored rows edited one way at a time, one
// sample of one cell each, and checked again. The rows as stored must HOLD; every edit must not: a sample answered ok,
// one answered another error, one whose context counter did not rise, one whose witness changed, an audit with a
// foreign change, and the harness's stored verdict a plain fail. usage: node check-declared-unconfirmed-controls.mjs
// <harness checkout> <V3 results.jsonl>
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [H, SRC] = process.argv.slice(2);
if (!H || !SRC) {
  console.error('usage: node check-declared-unconfirmed-controls.mjs <harness checkout> <V3 results.jsonl>');
  process.exit(2);
}
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-declared-unconfirmed.mjs');
const rows = () => readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const sample = (r, op, i = 5) => r.filter((x) => x.kind === 'sample' && x.scene === 'chrome-input' && x.op === op && x.engine === 'cua')[i];
const check = (edit) => {
  const r = rows();
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'cdu-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try {
    execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' });
    return 'HOLDS';
  } catch (e) {
    return `DOES NOT HOLD (${(String(e.stdout).match(/VERDICT[^\n]*/) || ['?'])[0]})`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const controls = [
  ['as stored (must HOLD)', () => {}, 'HOLDS'],
  ['a right_click_fallback sample answered ok', (r) => { Object.assign(sample(r, 'right_click_fallback'), { ok: true, error: undefined }); }, 'DOES NOT'],
  ['a secondary_action sample answered another error', (r) => { sample(r, 'secondary_action').error = 'context menu did not open; no clipboard action was sent'; }, 'DOES NOT'],
  ["a secondary_action sample whose page's context counter did not rise", (r) => { sample(r, 'secondary_action').effect = false; }, 'DOES NOT'],
  ['a right_click_fallback sample whose witness changed', (r) => { sample(r, 'right_click_fallback').witness = false; }, 'DOES NOT'],
  ['a foreign change in the secondary_action audit', (r) => { r.find((x) => x.kind === 'audit' && x.scene === 'chrome-input' && x.op === 'secondary_action' && x.engine === 'cua').foreign = [{ window: 1 }]; }, 'DOES NOT'],
  ['the harness stored right_click_fallback as fail', (r) => { Object.assign(r.find((x) => x.kind === 'verdict' && x.scene === 'chrome-input' && x.op === 'right_click_fallback' && x.candidate === 'cua'), { verdict: 'fail', pass: false }); }, 'DOES NOT'],
];
let ok = true;
for (const [name, edit, want] of controls) {
  const got = check(edit);
  const as = got.startsWith(want);
  ok &&= as;
  console.log(`${as ? 'ok  ' : 'BAD '} ${name}: ${got}`);
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
