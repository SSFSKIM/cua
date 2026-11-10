#!/usr/bin/env node
// T14's live counts for the release at the accept (the design session's rulings, 2026-11-09 and 2026-11-10), from the
// drop-signals runs' rows (plan `t14`): per run and cell, the drags, those whose drag and drop started, those that
// landed, those released at Chrome's accept cursor, the false releases (released at the accept, not landed), and the
// drags answered ok with no drop and nothing pending (a drop that did not land, its drag answered ok, and no notice on
// the read after the watch's lifetime). The bars: the second source (`plain-long`) 300 or more drops with 0 false
// releases; the accepted-then-left (`left`) and press-inside (`inzone-out`) controls 30 or more, with none answered ok
// without a drop. Prints a Markdown table and exits 1 when a bar fails.
// usage: node counts.mjs <run dir>...   (each a private run's directory, with run/results.jsonl or its .gz)
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename, join } from 'node:path';

const rowsOf = (dir) => {
  const plain = join(dir, 'run/results.jsonl');
  const text = existsSync(plain) ? readFileSync(plain, 'utf8') : gunzipSync(readFileSync(`${plain}.gz`)).toString('utf8');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (v) => (v === null ? '–' : (Math.round(v * 10) / 10).toFixed(1));

const UNCONFIRMED = /^Pending from your last drag, an unconfirmed drop: /;
const BARS = { 'plain-long': { n: 300, falseReleases: 0 }, left: { n: 30, okWithoutDrop: 0 }, 'inzone-out': { n: 30, okWithoutDrop: 0 } };

let failed = false;
const out = ['| run | load | cell | drags | started | landed | released at the accept | false releases | ok with no drop and nothing pending | unconfirmed notices | answer median, accept / floor (ms) | bar |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|'];
for (const dir of process.argv.slice(2)) {
  const rows = rowsOf(dir).filter((r) => r.kind === 'drop-signal' && BARS[r.cell]);
  const loads = [...new Set(rows.map((r) => r.load))];
  for (const cell of Object.keys(BARS)) {
    const at = rows.filter((r) => r.cell === cell);
    if (!at.length) continue;
    const started = at.filter((r) => r.outcome?.started);
    const landed = at.filter((r) => r.outcome?.landed);
    const accepted = at.filter((r) => r.accept?.accepted === true);
    const falseReleases = accepted.filter((r) => !r.outcome?.landed);
    const okWithoutDrop = at.filter((r) => r.ok && r.outcome?.started && !r.outcome?.landed && r.notice === null);
    const unconfirmed = at.filter((r) => UNCONFIRMED.test(r.notice ?? ''));
    const bar = BARS[cell];
    const reasons = [];
    if (at.length < bar.n) reasons.push(`${at.length} drags, under ${bar.n}`);
    if (bar.falseReleases !== undefined && falseReleases.length > bar.falseReleases) reasons.push(`${falseReleases.length} false releases`);
    if (bar.okWithoutDrop !== undefined && okWithoutDrop.length > bar.okWithoutDrop) reasons.push(`${okWithoutDrop.length} answered ok with no drop`);
    // a drop answered ok with nothing pending must have landed, on every cell (Chrome's confirmation, ruling 1)
    if (bar.falseReleases !== undefined && okWithoutDrop.length) reasons.push(`${okWithoutDrop.length} answered ok with no drop`);
    if (reasons.length) failed = true;
    const ms = (list) => r1(median(list.filter((r) => r.ok).map((r) => r.ms)));
    out.push(`| ${basename(dir)} | ${loads.join(', ')} | ${cell} | ${at.length} | ${started.length} | ${landed.length} | ${accepted.length} | ${falseReleases.length} | ${okWithoutDrop.length} | ${unconfirmed.length} | ${ms(accepted)} / ${ms(at.filter((r) => r.accept?.accepted !== true))} | ${reasons.length ? `FAIL: ${reasons.join('; ')}` : 'met'} |`);
  }
}
if (out.length > 2) console.log(out.join('\n'));

// #264's real late takes (plan `t14-late`, task 68's freeze cell): a take after the release (the judge's `late_take`)
// is reported when the read after the watch's lifetime carried the late notice and the acting request after it (a
// preflight) was refused with it. The bar, on T14's engine: at least one late take, every one reported. An engine
// before T14 fails it, which is its failing first.
const LATE_NOTICE = /^Pending from your last drag, a late drag and drop: .*Read the window before sending input again: your next input request will not be run$/;
const LATE_REFUSAL = /^Pending from your last drag, a late drag and drop: .*; this preflight request was not run, so read the window before sending it again$/;
const late = ['', '| run | load | drags | took | late takes | answered ok | landed | the read carried the notice | the preflight refused with it | Escape sent (`late_dnd`) | nothing pending on another drag | bar |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
let lateRuns = 0;
for (const dir of process.argv.slice(2)) {
  const all = rowsOf(dir);
  const rows = all.filter((r) => r.kind === 'drop-signal' && /^freeze-/.test(r.cell));
  if (!rows.length) continue;
  lateRuns++;
  const lates = rows.filter((r) => r.signals?.late_take === true);
  const reported = lates.filter((r) => LATE_NOTICE.test(r.notice ?? '') && r.next?.ok === false && LATE_REFUSAL.test(r.next?.error ?? ''));
  const escaped = lates.filter((r) => r.next?.late_dnd?.escaped === true);
  const others = rows.filter((r) => r.signals?.late_take !== true);
  // a drag with no late take leaves nothing pending, or an unconfirmed drop where its drop did not land (or its
  // confirmation came after the drop's window, the browser stopped)
  const quiet = others.filter((r) => r.notice === null || UNCONFIRMED.test(r.notice));
  const reasons = [];
  if (!lates.length) reasons.push('no late take came');
  if (reported.length < lates.length) reasons.push(`${lates.length - reported.length} late takes not reported`);
  if (quiet.length < others.length) reasons.push(`${others.length - quiet.length} other drags left a late notice`);
  if (reasons.length) failed = true;
  late.push(`| ${basename(dir)} | ${[...new Set(rows.map((r) => r.load))].join(', ')} | ${rows.length} | ${rows.filter((r) => r.signals?.take_after_press_ms != null).length} | ${lates.length} | ${lates.filter((r) => r.ok).length} | ${lates.filter((r) => r.outcome?.landed).length} | ${lates.filter((r) => LATE_NOTICE.test(r.notice ?? '')).length} | ${reported.length} | ${escaped.length} | ${quiet.length} of ${others.length} | ${reasons.length ? `FAIL: ${reasons.join('; ')}` : 'met'} |`);
}
if (lateRuns) console.log(late.join('\n'));
process.exit(failed ? 1 : 0);
