#!/usr/bin/env node
// Task 122: each late take of a drop-signals run (C1, L4c), judged in full from its row: the answer and its notice, the
// take against the release, the drop, the read's late notice, the next request refused with it, and the engine's
// Escape. Every other drag of the edge band is counted by what it did. Read-only.
//   node late-takes.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const HOLD_NOTICE = 'the page may have started a drag that did not complete';
const f1 = (x) => (x == null ? '–' : Number(x).toFixed(1));
for (const file of process.argv.slice(2)) {
  const raw = readFileSync(file);
  const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
  const edge = rows.filter((r) => /^freeze-6(46|48|50|52)$/.test(r.cell));
  const late = rows.filter((r) => r.signals?.late_take === true);
  const took = (r) => r.hold?.taken === true || r.signals?.take_after_press_ms != null;
  console.log(`# ${file}: ${rows.length} drags; edge band ${edge.length}: took inside the hold and landed ${edge.filter((r) => r.hold?.taken === true && r.outcome?.landed === true && !r.signals?.late_take).length}, late takes ${edge.filter((r) => r.signals?.late_take).length}, refused with the hold notice ${edge.filter((r) => !took(r) && r.reply_notice === HOLD_NOTICE).length}, other ${edge.filter((r) => !(r.hold?.taken === true && r.outcome?.landed === true && !r.signals?.late_take) && !r.signals?.late_take && !(!took(r) && r.reply_notice === HOLD_NOTICE)).length}`);
  console.log('| cell | # | answer | reply notice | hold way | engine saw a take by its release | take after the release (ms) | landed | read carries the late notice | next request refused with it | Escape after the release (ms) | judged |');
  console.log('|---|---:|---|---|---|---|---:|---|---|---|---:|---|');
  for (const r of late) {
    const lateNotice = /late drag and drop/.test(r.notice ?? '');
    const refused = r.next?.ok === false && /late drag and drop/.test(r.next?.error ?? '');
    const escaped = r.next?.late_dnd?.escaped === true;
    const ok = lateNotice && refused && escaped;
    console.log(`| ${r.cell} | ${r.i} | ${r.ok ? 'ok' : 'error'} | ${r.reply_notice === HOLD_NOTICE ? 'the hold notice' : (r.reply_notice ?? 'none')} | ${r.hold?.adaptive?.way ?? '–'} | ${r.hold?.taken === true ? 'yes' : 'no'} | ${f1(r.signals?.take_after_release_ms)} | ${r.outcome?.landed === true ? 'yes' : 'no'} | ${lateNotice ? 'yes' : 'no'} | ${refused ? 'yes' : 'no'} | ${f1(r.next?.late_dnd?.escape_after_release_ms)} | ${ok ? 'reported' : 'NOT REPORTED'} |`);
  }
  console.log('');
}
