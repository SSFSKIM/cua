#!/usr/bin/env node
// Task 123: each late take of a banded drop-signals run (C1, L4c), from its stored rows, judged in full: the take after
// the release, the answer's notice, the read's notice, the next request's refusal and its late_dnd record, the
// engine's Escape, the drop, and the hold's way. Then the band counts as the judge's verdict row gives them.
// Read-only. usage: node late-takes.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const cut = (s, n = 90) => (s == null ? null : String(s).replace(/\s+/g, ' ').slice(0, n));
for (const f of process.argv.slice(2)) {
  const raw = readFileSync(f);
  const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const drags = rows.filter((r) => r.kind === 'drop-signal');
  console.log(`== ${f}: ${drags.length} drags`);
  const late = drags.filter((r) => r.signals?.late_take);
  for (const r of late) {
    const ld = r.next?.late_dnd ?? null;
    console.log(JSON.stringify({
      cell: r.cell, i: r.i,
      take_after_release_ms: r.signals.take_after_release_ms,
      hold_way: r.hold?.adaptive?.way ?? null, engine_saw_take: r.hold?.taken ?? null,
      answer_ok: r.ok, answer_notice: cut(r.reply_notice),
      read_notice: cut(r.notice),
      next_ok: r.next?.ok ?? null, next_error: cut(r.next?.error),
      late_dnd: ld && Object.fromEntries(Object.entries(ld).filter(([, v]) => typeof v !== 'object' || v === null)),
      escaped: r.escaped, landed: r.outcome?.landed ?? null, started: r.outcome?.started ?? null,
    }));
  }
  console.log(`late takes: ${late.length}`);
  const v = rows.find((r) => r.kind === 'chrome-drop-verdict');
  if (v) console.log(`verdict row: ${cut(JSON.stringify(v), 1500)}`);
}
