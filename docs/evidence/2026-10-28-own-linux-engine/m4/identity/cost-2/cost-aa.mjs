// The A/A control for item 3: the two vendor lanes are one binary (T4's head), so the interval of one lane's median
// minus the other's, judged by the same rule, is what noise alone gives. usage: node cost-aa.mjs <results>...
import { readFileSync } from 'node:fs';
import { median, noiseVerdict, speedLabel, timedMs } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/stats.mjs';
import { medianDifferenceInterval } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/events.mjs';

for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.kind === 'sample' && r.series === 'warm');
  for (const key of [...new Set(rows.map((r) => `${r.scene} ${r.op}`))]) {
    const of = (engine) => timedMs(rows.filter((r) => `${r.scene} ${r.op}` === key && r.engine === engine));
    const [a, b] = [of('newest'), of('pinned')];
    const interval = medianDifferenceInterval(a, b);
    const verdict = noiseVerdict(interval, median(b));
    const label = verdict === 'same' ? speedLabel(interval) : verdict === 'loss' ? 'LOSS' : 'undetermined';
    console.log(`${file.split('/').slice(-2, -1)} ${key} | T4 newest-lane ${median(a).toFixed(1)} − T4 pinned-lane ${median(b).toFixed(1)} (n ${a.length}) | [${interval.join(', ')}] | ${label}`);
  }
}
