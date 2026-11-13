// Negative controls for rejudge-speed-gap.mjs (task 76): V3's stored rows edited one way at a time, re-judged; every
// control but the stored rows must FAIL. usage: node rejudge-gap-controls.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate';
const SCRIPT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts/rejudge-speed-gap.mjs';
const SRC = '/Users/new/.local/share/cua-171/gate/out/V3.release-gate/run/results.jsonl';
const rows = () => readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const at = (r, kind, engine) => r.filter((x) => x.kind === kind && x.scene === 'chrome-input' && x.op === 'activate_window' && x.engine === engine);
const judge = (edit) => {
  const r = rows();
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rjgap-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try { execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' }); return 'PASS'; } catch (e) { return `FAIL (${(e.stdout.match(/\| chrome-input activate_window cua \| \w+ \| fail \| ([^|]*) \|/) || e.stdout.match(/VERDICT[^\n]*/) || ['?'])[1] ?? (e.stdout.match(/VERDICT[^\n]*/) || ['?'])[0]})`; }
};
const controls = {
  'as stored (must PASS)': () => {},
  'a missed effect': (r) => { at(r, 'sample', 'cua')[3].effect = false; },
  'a failed answer': (r) => { at(r, 'sample', 'cua')[7].ok = false; },
  "a witness field the vendors' never changed": (r) => { at(r, 'sample', 'cua')[0].witness_changes.push({ field: 'mapped', t_ms: 3 }); },
  'an audit request the vendors do not send': (r) => { at(r, 'audit', 'cua')[0].forbidden.push({ what: 'XTEST FakeInput' }); },
  'a foreign change in the audit': (r) => { at(r, 'audit', 'cua')[0].foreign = [{ window: 1 }]; },
  'an audit that did not answer ok': (r) => { at(r, 'audit', 'cua')[0].ok = false; },
  'another row failing (stands)': (r) => { const v = r.find((x) => x.kind === 'verdict' && x.op === 'move' && x.candidate === 'cua'); v.verdict = 'fail'; v.pass = false; },
};
for (const [name, edit] of Object.entries(controls)) console.log(`${name}: ${judge(edit)}`);
