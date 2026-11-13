// Negative controls for rejudge-dnd-fisher.mjs (task 76): P6's stored rows edited one way at a time, re-judged; every
// control but the stored rows must FAIL. usage: node rejudge-dnd-controls.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate';
const SCRIPT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts/rejudge-dnd-fisher.mjs';
const SRC = '/Users/new/.local/share/cua-171/gate/out/P6.release-gate/run/results.jsonl';
const CASE = 'firefox dnd visible pointer-in';
const rows = () => readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const cuaRuns = (r) => r.filter((x) => x.kind === 'pointer-route-run' && x.case === CASE && x.engine === 'cua');
const missRun = (run) => Object.assign(run, { ok: false, error: 'firefox may not have taken the drag: the desktop pointer left its window during the drag', took: false });
const judge = (edit) => {
  const r = rows();
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rjdnd-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try { execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' }); return 'PASS'; } catch (e) { return `FAIL (${(e.stdout.match(/\| FAIL \| ([^|]*) \|/) || [, '?'])[1].trim()})`; }
};
const controls = {
  'as stored (must PASS)': () => {},
  'the honest miss answered ok instead (ok with no effect)': (r) => { const m = cuaRuns(r).find((x) => !x.took); Object.assign(m, { ok: true }); delete m.error; },
  'a clear loss: 7 more honest misses (22 of 30 against 30 of 30)': (r) => cuaRuns(r).filter((x) => x.took).slice(0, 7).forEach(missRun),
  'an error that took effect': (r) => Object.assign(cuaRuns(r).find((x) => x.took), { ok: false, error: 'some error' }),
  'a refused case that took effect': (r) => { const x = r.find((y) => y.kind === 'pointer-route-run' && y.case === 'firefox dnd visible pointer-out' && y.engine === 'cua'); x.took = true; },
  'the witness changed': (r) => { cuaRuns(r)[0].witness = false; },
};
for (const [name, edit] of Object.entries(controls)) console.log(`${name}: ${judge(edit)}`);
