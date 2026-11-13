// Negative controls for rejudge-302.mjs (task 76): S1's stored rows, each edited one way the criterion must refuse, written
// to a scratch file and re-judged; every control must FAIL. usage: node rejudge-controls.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate';
const SCRIPT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts/rejudge-302.mjs';
const SRC = '/Users/new/.local/share/cua-171/gate/out/S1.release-gate/run/results.jsonl';
const CELL = 'electron-input press_key background';
const rows = () => readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const run = (edit) => {
  const r = rows();
  edit(r, (t) => r.find((x) => x.kind === 'settle-run' && x.cell === CELL && x.trial === t));
  const dir = mkdtempSync(join(tmpdir(), 'rj302-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try { execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' }); return 'PASS'; } catch (e) { return `FAIL (${(e.stdout.match(/trial \d+: fail: .*/) || ['?'])[0]})`; }
};
const controls = {
  'as stored (must PASS)': () => {},
  'a lost key: trial 2 never landed, no late reading': (r, at) => Object.assign(at(2), { late_ms: null }),
  'criterion 1: no key-down in the settle': (r, at) => { at(2).after.key_downs = at(2).before.key_downs; },
  'criterion 2: the key-up already counted, yet not ok': (r, at) => { at(2).after.key_ups = at(2).before.key_ups + 1; },
  'criterion 3: the next before-read still one release short': (r, at) => { at(3).before.key_ups = at(3).before.key_downs - 1; },
  'a refusal': (r, at) => { at(2).answers = [{ ok: false }]; },
  'the desktop changed': (r, at) => { at(2).desktop_clean = false; },
  'an audit failed': (r) => { r.find((x) => x.kind === 'settle-audit' && x.cell === CELL).pass = false; },
};
for (const [name, edit] of Object.entries(controls)) console.log(`${name}: ${run(edit)}`);
