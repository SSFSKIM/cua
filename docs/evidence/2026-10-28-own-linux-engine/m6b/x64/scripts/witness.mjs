// T8's projection of one leg's runtime.json: every traced run's process-path witness beside its counts.
//   node witness.mjs <runtime.json>
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const short = (p) => p.replace(/^.*\/(user|upgraded|copies|outdated|scratch)\//, '<run>/$1/').replace(/^.*\/(bin\/cua\.mjs|src\/repl-host\/[^/]+)$/, '<checkout>/$1');
console.log(`# ${r.leg} (${r.arch}) at ${r.head}, older ${r.older?.commit}: every traced run's process-path witness (each program a successful exec ran, by path, with its count) beside its counts`);
console.log('# (from runtime.json; <run> is the run directory, raw strace files stay in its scratch)\n');
for (const c of r.cells) {
  for (const run of c.runs ?? []) {
    const t = run.trace;
    if (!t) continue;
    console.log(`## ${c.cell}: ${run.what ?? run.fixture ?? run.label} (${run.label ?? ''})`);
    console.log(`  whole: ${t.whole?.complete ? 'complete' : 'INCOMPLETE'}; processes ${t.processes}; unread lines ${t.whole?.unreadLines ?? '-'}, orphans ${t.whole?.orphans ?? '-'}`);
    console.log(`  calls under runtimes/ by kind: ${(t.files ?? []).map((f) => `${f.kind} ${f.count}`).join(', ') || 'none'}`);
    console.log(`  serve's tree under runtimes/: ${t.runtimes ? `${t.runtimes.calls} calls, ${t.runtimes.complete ? 'complete' : 'incomplete'}` : '-'}`);
    console.log('  programs:');
    for (const p of t.programs ?? []) console.log(`    ${String(p.count).padStart(4)}  ${short(p.path)}`);
    console.log('');
  }
}
