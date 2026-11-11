#!/usr/bin/env node
// Task 73's tables, one per sitting (one family a sitting): per kind and lane, the runs, the answers, the runs that took
// (a selection or a range only when its value changed to the pinned build's, a drop when the page counted one more),
// the false errors (a run that took and answered an error; in an undisturbed lane any error at all), what every miss
// answered, and what the handles left pending (disturb.mjs's read after the end: a late drag and drop, an unconfirmed
// drop, landed or not). For the drop page, whether the page saw the press and any buttonless move in its log. With
// `check` disturbances, the pre-press try's statuses and crossings.
// usage: node table.mjs <run dir>...
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const pendingOf = (notice) => (notice == null ? null : /a late drag and drop/.test(notice) ? 'late' : /an unconfirmed drop/.test(notice) ? 'unconfirmed' : /a failed watch/.test(notice) ? 'failed watch' : 'other');
const short = (error) => {
  if (error == null) return 'ok';
  if (/drag handle is held/.test(error)) return 'held refusal';
  if (/another application holds the pointer/.test(error)) return 'refused at start: pointer held elsewhere';
  if (/another application took the pointer/.test(error)) return 'end: hold cut';
  if (/desktop pointer was moved/.test(error)) return 'end: pointer moved';
  if (/pointer watch on your drag handle/.test(error)) return 'end: watch failed';
  if (/^Pending from your last drag/.test(error)) return 'refused: pending';
  return error.slice(0, 80);
};

for (const dir of process.argv.slice(2)) {
  const rows = lines(join(dir, 'run/results.jsonl')).filter((r) => r.kind === 'drag-run');
  const steps = lines(join(dir, 'handles.jsonl'));
  const key = (lane, kind, i) => `${lane}|${kind}|${i}`;
  const answers = new Map();
  const after = new Map();
  const checks = [];
  for (const s of steps) {
    if (s.phase === 'answer' && !s.ok && !answers.has(key(s.lane, s.kind, s.i))) answers.set(key(s.lane, s.kind, s.i), s.error);
    if (s.phase === 'after') after.set(key(s.lane, s.kind, s.i), s);
    if (s.phase === 'checked') checks.push(s);
  }
  const family = rows[0]?.family ?? '?';
  console.log(`\n${dir.split('/').pop()} (${family}; disturbed lanes: newest, cua:d)\n`);
  console.log('| kind | lane | runs | answered ok | took | false errors | misses: what they answered | pending: late / unconfirmed (landed) | press seen (dnd) | buttonless moves (dnd) |');
  console.log('|---|---|---:|---:|---:|---:|---|---|---:|---:|');
  const kinds = [...new Set(rows.map((r) => r.drag))];
  for (const kind of kinds) {
    for (const lane of ['pinned', 'newest', 'cua', 'cua:d', 'control']) {
      const rs = rows.filter((r) => r.drag === kind && r.engine === lane);
      if (!rs.length) continue;
      const dnd = kind === 'handle-dnd';
      const took = (r) => r.took && (dnd || !same(r.after, r.before));
      const answer = (r) => answers.get(key(lane, kind, r.i)) ?? (r.ok ? null : r.error);
      const disturbed = ['newest', 'cua:d'].includes(lane);
      const falseErrors = rs.filter((r) => answer(r) != null && (took(r) || !disturbed)).length;
      const misses = rs.filter((r) => !took(r));
      const missAnswers = Object.entries(misses.reduce((acc, r) => ({ ...acc, [short(answer(r))]: (acc[short(answer(r))] ?? 0) + 1 }), {}))
        .map(([a, n]) => `${a} ${n}`)
        .join('; ');
      const pend = rs.map((r) => ({ r, p: pendingOf(after.get(key(lane, kind, r.i))?.notice) }));
      const late = pend.filter((x) => x.p === 'late');
      const unconfirmed = pend.filter((x) => x.p === 'unconfirmed');
      const pendCell = `${late.length} (${late.filter((x) => took(x.r)).length}) / ${unconfirmed.length} (${unconfirmed.filter((x) => took(x.r)).length})`;
      const seen = dnd ? rs.filter((r) => r.after && r.before && r.after.downs === r.before.downs + 1).length : '–';
      const buttonless = dnd ? rs.filter((r) => r.after && r.before && r.after.downs === r.before.downs + 1 && (r.after.log?.moves ?? []).some((m) => m.buttons === 0)).length : '–';
      console.log(`| ${kind} | ${lane} | ${rs.length} | ${rs.filter((r) => answer(r) == null).length} | ${rs.filter(took).length} | ${falseErrors} | ${missAnswers || '–'} | ${pendCell} | ${seen} | ${buttonless} |`);
    }
  }
  if (checks.length) {
    const statuses = checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
    const crossings = checks.reduce((n, c) => n + (c.crossings?.length ?? 0), 0);
    console.log(`\nThe pre-press try (xgrab check, the engine's own try) before ${checks.length} starts: ${Object.entries(statuses).map(([s, n]) => `${s} ${n}`).join(', ')}; ${crossings} crossings in the pointer's window chain; chain depths ${[...new Set(checks.map((c) => c.chain))].join(', ')}.`);
  }
}
