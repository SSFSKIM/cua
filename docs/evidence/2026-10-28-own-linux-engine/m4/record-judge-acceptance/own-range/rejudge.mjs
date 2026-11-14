// Task 51: task 49's whole-run record judged again offline, by the judge before and after the own-range rule (the
// design session's ruling, sminos 336: a request naming a window in the sending connection's own resource-id range,
// while that connection lives, is never foreign).
//
//   node rejudge.mjs <record.jsonl.gz> <foreign.mjs before> <foreign.mjs after>
//
// The run's registered windows and operation spans are not in the evidence, so both judges get none: every window of
// the scenes' applications then reads as foreign to both alike. The rule only removes findings, and only those naming
// a window in the sender's own range, which no registration changes (an id in a connection's range is that
// connection's, never a scene application's), so the findings the rule removes here are exactly the ones it removes
// from the run's own verdict. The record predates xprobe's `mask`: its ready line gets the server's, 0x1fffff (Xvfb's
// default, and every one of the record's 12,467 client bases is a multiple of 0x200000).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, beforePath, afterPath] = process.argv.slice(2);
const before = await import(beforePath);
const after = await import(afterPath);
const MASK = 0x1fffff;
const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean);
const withMask = lines.map((line) => (line.startsWith('{"kind":"ready"') ? line.replace(/}$/, `,"mask":${MASK}}`) : line));
const root = JSON.parse(lines.find((l) => l.startsWith('{"kind":"ready"'))).root;
const judge = (module, text) => module.auditRecord(text, { registered: new Map(), root, spans: [] });

const old = judge(before, lines.join('\n'));
const now = judge(after, withMask.join('\n'));
const key = (f) => `${f.conn}|${f.seq}|${f.what}|${f.window}`;
const kept = new Set(now.foreign.map(key));
const oldKeys = new Set(old.foreign.map(key));
const cleared = old.foreign.filter((f) => !kept.has(key(f)));
const inOwnRange = (f) => typeof f.window === 'number' && ((f.window & ~MASK) >>> 0) === f.conn >>> 0;
const tally = (list) => Object.fromEntries([...list.reduce((m, f) => m.set(f.what, (m.get(f.what) ?? 0) + 1), new Map())].sort());
const ownBefore = old.foreign.filter(inOwnRange);
console.log(JSON.stringify({
  requests: { before: old.requests, after: now.requests },
  mutating: { before: old.mutating, after: now.mutating },
  findings: { before: old.foreign.length, after: now.foreign.length },
  // the findings before that name a window in the sender's own range: what the rule is for
  own_range_before: { count: ownBefore.length, kinds: tally(ownBefore), senders: [...new Set(ownBefore.map((f) => f.client?.replace(/ pid \d+$/, '')))] },
  cleared: { count: cleared.length, kinds: tally(cleared), all_in_own_range: cleared.every(inOwnRange) },
  own_range_after: now.foreign.filter(inOwnRange).length,
  // the rule adds nothing: every finding after was one before
  after_subset_of_before: now.foreign.every((f) => oldKeys.has(key(f))),
  sky_stops_after: now.foreign.filter((f) => f.what === 'SKY_CLIPBOARD_STOP ClientMessage').length,
}, null, 2));
