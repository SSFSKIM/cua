#!/usr/bin/env node
// The fix wave's drop-signals rows, one line each: lane, cell, the answer, whether the zone took the drop, what was
// left pending (and the page's last dragend dropEffect: 0 none, 1 copy, 2 move), and the drag loop's cursor at the release as the engine read it (accepted, and the image shown).
// usage: node rows.mjs <results.jsonl>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = (file) => (file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8'));

for (const file of process.argv.slice(2)) {
  for (const line of read(file).split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.kind !== 'drop-signal') continue;
    const pending = r.notice ? (/unconfirmed drop/.test(r.notice) ? 'unconfirmed' : /late drag/.test(r.notice) ? 'late' : /failed watch/.test(r.notice) ? 'failed' : 'other') : '-';
    const c = r.drop_cursor;
    const cursor = c ? `accepted=${c.accepted} shown=${c.shown?.image ?? '-'} history=${c.history?.length ?? '-'} read_ms=${c.read_ms?.toFixed?.(2) ?? '-'}${c.error ? ` error=${c.error}` : ''}` : 'no cursor read';
    const by = r.handle?.confirmed_by ?? r.after_release?.by_cursor ?? '-';
    console.log([r.load, r.lane, r.cell, r.i, r.ok ? 'ok' : `err:${String(r.error).slice(0, 60)}`, `landed=${r.outcome?.landed}`, `effect=${r.after?.last?.effect}`, `started=${r.outcome?.started}`, `pending=${pending}`, `by=${by}`, cursor].join(' | '));
  }
}
