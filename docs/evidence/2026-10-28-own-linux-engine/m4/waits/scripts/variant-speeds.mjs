// The desktop speed verdicts of an events run's variant lane, judged as the run judges cua's.
// usage: node variant-speeds.mjs <results.jsonl> <harness events.mjs> <lane label, e.g. cua:path8>
import { readFileSync } from 'node:fs';

const [file, events, lane] = process.argv.slice(2);
const { eventSpeeds } = await import(events);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const blocks = rows.filter((r) => r.kind === 'events-blocks').map((b) => ({ route: 'desktop', records: b.records, mismatches: b.mismatches }));
for (const s of eventSpeeds([], { blocks, candidate: lane, mismatches: blocks.flatMap((b) => b.mismatches) })) {
  if (s.route === 'desktop' && ['move', 'click', 'scroll', 'drag', 'drag_handle'].includes(s.command)) console.log(`| ${s.command} | ${s.series} | ${s.n} | ${s.medians.pinned} | ${s.medians.newest} | ${s.medians[lane]} | [${s.interval}] | ${s.verdict} |`);
}
