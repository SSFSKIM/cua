// proof.mjs <results.jsonl>: the undisturbed drags of the hold engine: answers, effects, the press watch's strays by
// kind (and on the drags with keepalives apart), the stray answers, the keepalives and the held drags, per case.
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'sample' && /chrome_dnd/.test(r.op));
const STRAY = /may not have started the drag/;
const tally = (xs) => xs.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
const out = { drags: rows.length, ok: 0, landed: 0, stray_answers: 0, with_strays: 0, stray_kinds: {}, with_keepalives: 0, strays_on_keepalive_drags: {}, held: 0, held_taken: 0, held_landed: 0, take_after_press_max: 0, by_op: {} };
for (const r of rows) {
  const op = (out.by_op[r.op] ??= { drags: 0, landed: 0, keepalives: 0, held: 0, routes: {} });
  op.drags++;
  op.routes[r.route] = (op.routes[r.route] ?? 0) + 1;
  if (r.ok) out.ok++;
  if (r.effect === true) {
    out.landed++;
    op.landed++;
  }
  if (!r.ok && STRAY.test(r.error ?? '')) out.stray_answers++;
  const strays = r.press?.strays;
  const kinds = strays?.first ?? [];
  if (strays?.count > 0) {
    out.with_strays++;
    for (const k of kinds) out.stray_kinds[k] = (out.stray_kinds[k] ?? 0) + 1;
  }
  const keep = r.hold?.keepalives ?? 0;
  if (keep > 0) {
    out.with_keepalives++;
    op.keepalives++;
    for (const k of kinds) out.strays_on_keepalive_drags[k] = (out.strays_on_keepalive_drags[k] ?? 0) + 1;
  }
  if (r.hold && r.hold.waited_ms !== undefined) {
    out.held++;
    op.held++;
    if (r.hold.taken) out.held_taken++;
    if (r.hold.taken && r.effect === true) out.held_landed++;
  }
  if (typeof r.hold?.take_after_press_ms === 'number') out.take_after_press_max = Math.max(out.take_after_press_max, r.hold.take_after_press_ms);
}
out.errors = tally(rows.filter((r) => !r.ok).map((r) => String(r.error).slice(0, 80)));
console.log(JSON.stringify(out, null, 1));
