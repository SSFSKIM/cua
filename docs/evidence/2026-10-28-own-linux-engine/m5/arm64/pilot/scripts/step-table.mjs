// Task 96: the pilot's step table from each step's own record (step.json and README.md), read only, as Markdown rows:
// the out root, step, started..finished (UTC), minutes, exit, unjudged count, the end, the :0 all-clear.
// usage: node step-table.mjs <out root>...
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
const rows = [];
for (const root of process.argv.slice(2)) {
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || !d.name.includes('.development-run')) continue;
    const dir = join(root, d.name);
    const readme = existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '';
    const started = readme.match(/^- started (\S+)/m)?.[1] ?? null;
    const fin = readme.match(/^- finished (\S+); exit (\d+)/m);
    const unj = readme.match(/^- unjudged[^:]*: (.*)$/m)?.[1] ?? '–';
    const end = readme.match(/^- end: (.*)$/m)?.[1]?.replace(/\(.*$/, '').trim() ?? '–';
    const clear = existsSync(join(dir, 'all-clear.txt')) ? readFileSync(join(dir, 'all-clear.txt'), 'utf8').split('\n')[0].replace(/^all-clear: /, '') : '–';
    const min = started && fin ? ((Date.parse(fin[1]) - Date.parse(started)) / 60000).toFixed(1) : '–';
    rows.push({ root: basename(root), step: d.name.split('.')[0], started, finished: fin?.[1] ?? null, min, exit: fin?.[2] ?? '–', unj, end, clear });
  }
}
rows.sort((a, b) => String(a.started).localeCompare(String(b.started)));
console.log('| out root | step | UTC | min | exit | unjudged | end | :0 all-clear |');
console.log('|---|---|---|---:|---:|---|---|---|');
for (const r of rows) console.log(`| ${r.root} | ${r.step} | ${r.started?.slice(11, 19) ?? '–'}–${r.finished?.slice(11, 19) ?? '–'} | ${r.min} | ${r.exit} | ${r.unj} | ${r.end} | ${r.clear.slice(0, 40)} |`);
