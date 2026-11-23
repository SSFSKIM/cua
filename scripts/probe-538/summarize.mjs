#!/usr/bin/env node
// #538's probe of S: per lane, scene and action, the counts the probe's rows (./probe.mjs rows.json) carry.
//   node scripts/probe-538/summarize.mjs <lane-dir>...     (each holding meta.json and rows.json)
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const lines = [];
for (const dir of process.argv.slice(2)) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')), rows = JSON.parse(readFileSync(join(dir, 'rows.json'), 'utf8'));
  lines.push(`## ${meta.lane} (${meta.commit.slice(0, 9)}, dirty native/src files ${meta.dirty}, run ${meta.run}, engine ${meta.engine?.version ?? '?'} ${String(meta.engine?.build ?? '').slice(0, 12)})`, '');
  if (meta.error) lines.push(`Stopped: ${meta.error.split('\n')[0]}`, '');
  lines.push('| scene | action | n | S held | acted | refused keyFocusOnly | carried by element route | ok | posted | order changed | raised over user | front changed | errors |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.scene}|${row.action}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, group] of groups) {
    const [scene, action] = key.split('|');
    const acted = group.filter(r => r.act);
    const count = f => acted.filter(f).length;
    const errors = [...new Set(acted.filter(r => !r.act.ok).map(r => r.judged?.errorName ?? String(r.act.error).slice(0, 40)))].join('; ');
    const skipped = group.filter(r => r.skipped || r.error).length;
    lines.push(`| ${scene} | ${action} | ${group.length}${skipped ? ` (${skipped} unsent)` : ''} | ${group.filter(r => r.s).length} | ${acted.length} | ${count(r => r.judged.refusedKeyFocusOnly)} | ${count(r => r.judged.carriedByElementRoute)} | ${count(r => r.act.ok)} | ${count(r => r.judged.posted)} | ${count(r => r.judged.orderChanged)} | ${count(r => r.judged.mainRaisedOverUser)} | ${count(r => r.judged.frontChanged)} | ${errors} |`);
  }
  lines.push('');
}
process.stdout.write(lines.join('\n') + '\n');
