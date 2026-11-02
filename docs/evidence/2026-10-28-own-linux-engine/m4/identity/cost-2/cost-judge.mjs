// Item 3 of T5's second fix round: each warm series of the cost run judged by Acceptance 3's interval rule against the
// T4 build, which ran in both vendor lanes: against each lane alone, and against both lanes pooled (the harness's own
// bar, the faster lane's median, is biased low when both lanes are one binary). usage: node cost-judge.mjs <results>
import { readFileSync } from 'node:fs';
import { median, noiseVerdict, speedLabel, timedMs } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/stats.mjs';
import { medianDifferenceInterval } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/events.mjs';

const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.kind === 'sample' && r.series === 'warm');
const keys = [...new Set(rows.map((r) => `${r.scene} ${r.op}`))];
for (const key of keys) {
  const of = (engine) => timedMs(rows.filter((r) => `${r.scene} ${r.op}` === key && r.engine === engine));
  const cua = of('cua');
  const lanes = { pinned: of('pinned'), newest: of('newest') };
  lanes['T4 pooled'] = [...lanes.pinned, ...lanes.newest];
  for (const [name, t4] of Object.entries(lanes)) {
    const interval = medianDifferenceInterval(cua, t4);
    const bar = median(t4);
    const verdict = noiseVerdict(interval, bar);
    const label = verdict === 'same' ? speedLabel(interval) : verdict === 'loss' ? 'LOSS' : 'undetermined';
    console.log(`${key} | cua ${median(cua).toFixed(1)} ms (n ${cua.length}) | ${name} ${bar.toFixed(1)} ms (n ${t4.length}) | [${interval.join(', ')}] | bound ${Math.max(0.05 * bar, 1).toFixed(2)} | ${label}`);
  }
}
