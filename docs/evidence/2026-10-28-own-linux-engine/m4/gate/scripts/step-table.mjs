// Task 76: every gate step's window, minutes, exit and lock lines (acquire/release load and render host), from
// host-lock.log's t18-gate lines and the steps' step.json, as a Markdown table. usage: node step-table.mjs
import { readFileSync, existsSync } from 'node:fs';
const D = '/Users/new/.local/share/cua-171';
const lock = readFileSync(`${D}/host-lock.log`, 'utf8').split('\n').filter((l) => / (acquire|release) t18-gate /.test(l) && / run (\S+) |run71\.sh/.test(l));
const stepOf = (l) => (l.match(/gate\.mjs run (\S+) .*--out (\S+)/) || l.match(/gate\/(out(?:-rerun1)?)\/(\w+)\.release-gate/));
const rows = [];
let open = null;
for (const l of lock) {
  const m = l.match(/^(\S+) (acquire|release) t18-gate (?:status=(\d+) )?load=([\d.]+ [\d.]+ [\d.]+) (render-host=\S+)/);
  if (!m) continue;
  let step, out;
  const r = l.match(/gate\.mjs run (\S+) .*--out (\S+)/);
  if (r) { step = r[1]; out = r[2].split('/').pop(); } else { const z = l.match(/gate\/(out(?:-rerun1)?)\/(\w+)\.release-gate/); if (!z) continue; out = z[1]; step = z[2]; }
  if (m[2] === 'acquire') open = { step, out, t0: m[1], load0: m[4], rh0: m[5] };
  else if (open && open.step === step) {
    const min = ((Date.parse(m[1]) - Date.parse(open.t0)) / 60000).toFixed(1);
    rows.push({ ...open, t1: m[1], status: m[3], load1: m[4], rh1: m[5], min });
    open = null;
  }
}
console.log('| step | out | acquire (UTC) | release | min | exit | load at acquire | load at release | render host |');
console.log('|---|---|---|---|---:|---:|---|---|---|');
for (const r of rows) console.log(`| ${r.step} | ${r.out} | ${r.t0.slice(11, 19)} | ${r.t1.slice(11, 19)} | ${r.min} | ${r.status} | ${r.load0} | ${r.load1} | ${r.rh0 === r.rh1 ? r.rh0.replace('render-host=', '') : `${r.rh0} / ${r.rh1}`} |`);
