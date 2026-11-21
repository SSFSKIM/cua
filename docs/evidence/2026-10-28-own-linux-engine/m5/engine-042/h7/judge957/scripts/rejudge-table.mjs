// task 128: the re-judge's table (rejudge957.mjs's lines) as Markdown.  node rejudge-table.mjs <rejudge-drops.jsonl>
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const where = (f) => f
  .replace('/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/', 'm5/')
  .replace('/Users/new/.local/share/cua-171/task128/vm-rows/', 'VM ~/.local/share/cua-171/m5/')
  .replace('/Users/new/.local/share/cua-171/m5/', 'x64 ~/.local/share/cua-171/m5/')
  .replace(/\/run\/results\.jsonl(\.gz)?$/, '');
const yn = (v) => (v === null ? '–' : v ? 'pass' : 'FAIL');
const out = [
  '| stored at | run | family | plan | load | drags | H7 judge | this judge | moved | drops at a stale position | ambiguous | path ends in the margin |',
  '|---|---|---|---|---|---:|---|---|---|---|---:|---:|',
];
let drags = 0;
let margin = 0;
for (const r of rows) {
  drags += r.drags;
  margin += r.in_margin;
  out.push(`| ${where(r.file)} | ${r.run} | ${r.family} | ${r.plan} | ${r.load} | ${r.drags} | ${r.judge ? yn(r.old_pass) : 'no judge'} | ${r.judge ? yn(r.new_pass) : 'no judge'} | ${r.moved ? '**moved**' : ''} | ${r.stale ? `${r.stale} (${r.stale_rows.map((x) => x.replace('cua long-left ', '')).join(', ')})` : '0'} | ${r.ambiguous ?? 0} | ${r.in_margin} |`);
}
out.push('', `${rows.length} stored run copies, ${drags} drags; path ends within the 3 px margin: ${margin}.`);
console.log(out.join('\n'));
