// Negative controls for rejudge-dnd-fisher.mjs (task 76): P6's stored rows edited one way at a time, re-judged; every
// control but the stored rows must FAIL. Ruling 697's are the last five: the lanes' valid runs unequal (the review's
// case, and one where only Fisher refuses), the pinned build's reference under a full side, a foreign change at the
// run's cleanup, and a case of the step the run never measured. usage: node rejudge-dnd-controls.mjs
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
const pinnedRuns = (r) => r.filter((x) => x.kind === 'pointer-route-run' && x.case === CASE && x.engine === 'pinned');
const parkMissed = (run) => Object.assign(run, { pointer: { ...run.pointer, held: false } });
const summary = (r) => r.find((x) => x.kind === 'experiment-summary');
const missRun = (run) => Object.assign(run, { ok: false, error: 'firefox may not have taken the drag: the desktop pointer left its window during the drag', took: false });
const judge = (edit) => {
  const r = rows();
  edit(r);
  const dir = mkdtempSync(join(tmpdir(), 'rjdnd-'));
  writeFileSync(join(dir, 'results.jsonl'), r.map((x) => JSON.stringify(x)).join('\n') + '\n');
  try { execFileSync(process.execPath, [SCRIPT, H, join(dir, 'results.jsonl')], { encoding: 'utf8' }); return 'PASS'; } catch (e) { return `FAIL (${(e.stdout.match(/\| FAIL \| ([^|]*) \|/) || e.stdout.match(/run problems: ([^\n]*)/) || [, '?'])[1].trim()})`; }
};
const controls = {
  'as stored (must PASS)': () => {},
  'the honest miss answered ok instead (ok with no effect)': (r) => { const m = cuaRuns(r).find((x) => !x.took); Object.assign(m, { ok: true }); delete m.error; },
  'a clear loss: 7 more honest misses (22 of 30 against 30 of 30)': (r) => cuaRuns(r).filter((x) => x.took).slice(0, 7).forEach(missRun),
  'an error that took effect': (r) => Object.assign(cuaRuns(r).find((x) => x.took), { ok: false, error: 'some error' }),
  'a refused case that took effect': (r) => { const x = r.find((y) => y.kind === 'pointer-route-run' && y.case === 'firefox dnd visible pointer-out' && y.engine === 'cua'); x.took = true; },
  'the witness changed': (r) => { cuaRuns(r)[0].witness = false; },
  "unequal valid runs, the review's case: cua 22 of 30 against the pinned build's 20 of 20 (p = 0.0109)": (r) => { cuaRuns(r).filter((x) => x.took).slice(0, 7).forEach(missRun); pinnedRuns(r).slice(0, 10).forEach(parkMissed); },
  "unequal valid runs, the reference full: cua 31 of 40 against the pinned build's 30 of 30 (p = 0.0042)": (r) => {
    const taken = cuaRuns(r).filter((x) => x.took);
    const extra = taken.slice(0, 10).map((x, i) => ({ ...structuredClone(x), i: 100 + i }));
    r.push(...extra);
    taken.slice(0, 8).forEach(missRun);
  },
  "the pinned build's reference short: cua 29 of 30 against 20 of 20 (p = 0.6)": (r) => { pinnedRuns(r).slice(0, 10).forEach(parkMissed); },
  "a change to a window the harness did not open, at the run's cleanup": (r) => { const s = summary(r); s.failed.push('a window the harness did not open was changed: the harness: 0x00a00003 ConfigureWindow (raised)'); s.complete = false; },
  'a case of the step the run never measured (its runs and rows gone)': (r) => {
    const key = 'firefox dnd covered pointer-out';
    const isIt = (x) => (x.kind === 'pointer-route-run' && x.case === key) || (['dnd', 'predicate-verdict'].includes(x.kind) && x.occlusion === 'covered' && x.park === 'out');
    for (let i = r.length - 1; i >= 0; i--) if (isIt(r[i])) r.splice(i, 1);
  },
};
for (const [name, edit] of Object.entries(controls)) console.log(`${name}: ${judge(edit)}`);
