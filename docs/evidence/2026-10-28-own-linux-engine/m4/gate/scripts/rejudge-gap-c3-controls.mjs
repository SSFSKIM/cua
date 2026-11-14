#!/usr/bin/env node
// Negative controls for rejudge-speed-gap.mjs as amended for candidate 3 (task 79): a V3 run's stored rows edited one way
// at a time and re-judged. The rows as stored must PASS, with chrome-input's two declared unconfirmed cells listed apart;
// every edit must FAIL: task 76's controls of the gap itself (rejudge-gap-controls.mjs), and the amendment's own, a
// declared unconfirmed cell whose stored verdict is not that verdict, and a harness without the declared-loss list,
// under which "declared unconfirmed" stands no more than any other failing verdict.
// usage: node rejudge-gap-c3-controls.mjs <harness checkout> <V3 results.jsonl>
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [H, SRC] = process.argv.slice(2);
if (!H || !SRC) {
  console.error('usage: node rejudge-gap-c3-controls.mjs <harness checkout> <V3 results.jsonl>');
  process.exit(2);
}
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'rejudge-speed-gap.mjs');
const rows = () => readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const at = (r, kind, engine, op = 'activate_window') => r.filter((x) => x.kind === kind && x.scene === 'chrome-input' && x.op === op && x.engine === engine);
const verdictRow = (r, op) => r.find((x) => x.kind === 'verdict' && x.scene === 'chrome-input' && x.op === op && x.candidate === 'cua' && !x.device);
// a copy of the harness's linux-engine-diff modules whose stats.mjs has no DECLARED_LOSSES (candidate 1 and 2's form)
const withoutDeclaredList = () => {
  const dir = mkdtempSync(join(tmpdir(), 'rjgap3-h-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(join(H, 'scripts/linux-engine-diff'), join(dir, 'scripts/linux-engine-diff'), { recursive: true, filter: (p) => !p.includes('/xprobe/target') && !p.includes('node_modules') });
  const stats = join(dir, 'scripts/linux-engine-diff/stats.mjs');
  writeFileSync(stats, readFileSync(stats, 'utf8').replace('export const DECLARED_LOSSES', 'const DECLARED_LOSSES'));
  return dir;
};
const judge = (edit, harness = H) => {
  const r = rows();
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rjgap3-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try {
    const out = execFileSync(process.execPath, [SCRIPT, harness, join(dir, 'results.jsonl')], { encoding: 'utf8' });
    return `PASS (${(out.match(/declared unconfirmed, as the harness judged it[^\n]*/) || ['no declared unconfirmed line'])[0]})`;
  } catch (e) {
    return `FAIL (${(String(e.stdout).match(/VERDICT[^\n]*/) || ['?'])[0]})`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const failing = (v) => Object.assign(v, { verdict: 'fail', pass: false });
const controls = [
  ['as stored (must PASS, the two cells listed apart)', () => {}, 'PASS'],
  ['a missed effect', (r) => { at(r, 'sample', 'cua')[3].effect = false; }, 'FAIL'],
  ['a failed answer', (r) => { at(r, 'sample', 'cua')[7].ok = false; }, 'FAIL'],
  ["a witness field the vendors' never changed", (r) => { at(r, 'sample', 'cua')[0].witness_changes = [...(at(r, 'sample', 'cua')[0].witness_changes ?? []), { field: 'mapped', t_ms: 3 }]; }, 'FAIL'],
  ['an audit request the vendors do not send', (r) => { at(r, 'audit', 'cua')[0].forbidden.push({ what: 'XTEST FakeInput' }); }, 'FAIL'],
  ['a foreign change in the audit', (r) => { at(r, 'audit', 'cua')[0].foreign = [{ window: 1 }]; }, 'FAIL'],
  ['an audit that did not answer ok', (r) => { at(r, 'audit', 'cua')[0].ok = false; }, 'FAIL'],
  ['another row failing (stands)', (r) => { failing(verdictRow(r, 'move')); }, 'FAIL'],
  ['right_click_fallback stored as fail, not declared unconfirmed', (r) => { failing(verdictRow(r, 'right_click_fallback')); }, 'FAIL'],
  ['secondary_action stored as fail, not declared unconfirmed', (r) => { failing(verdictRow(r, 'secondary_action')); }, 'FAIL'],
];
let ok = true;
for (const [name, edit, want] of controls) {
  const got = judge(edit);
  const as = got.startsWith(want);
  ok &&= as;
  console.log(`${as ? 'ok  ' : 'BAD '} ${name}: ${got}`);
}
const bare = withoutDeclaredList();
try {
  const got = judge(() => {}, bare);
  const as = got.startsWith('FAIL');
  ok &&= as;
  console.log(`${as ? 'ok  ' : 'BAD '} the stored rows under a harness without DECLARED_LOSSES (must FAIL): ${got}`);
} finally {
  rmSync(bare, { recursive: true, force: true });
}
console.log(ok ? 'controls: every one as expected' : 'controls: NOT as expected');
process.exit(ok ? 0 : 1);
