// Task 108 fix wave 1 (ruling 870.1): every stored run with Chrome drag-and-drop device cells, the late-take verdicts by
// the base judge and by this checkout's, and every sample whose `dropped` an unread counter set (the runner's inferred
// bit). Read-only.  node scan.mjs <checkout> <base checkout> <file listing results paths>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [checkout, base, list] = process.argv.slice(2);
const files = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const { judgeDevice } = await import(pathToFileURL(`${checkout}/scripts/linux-engine-diff/device.mjs`).href);
const { judgeDevice: baseJudge } = await import(pathToFileURL(`${base}/scripts/linux-engine-diff/device.mjs`).href);
const auditOf = (a) => a && { clean: a.clean, kind: a.audit, oks: a.oks, answered: a.answered, forbidden: (a.forbidden ?? []).map((f) => f?.what ?? f), lifecycles: a.lifecycles ?? 1 };
const counted = (r) => typeof r.drop_status?.before?.drops === 'number' && typeof r.drop_status?.after?.drops === 'number';
const seen = new Set();
let runs = 0;
let cells = 0;
let differing = 0;
let inferred = 0;
for (const f of files) {
  let buf;
  try {
    buf = readFileSync(f);
    if (f.endsWith('.gz')) buf = gunzipSync(buf);
  } catch {
    continue;
  }
  const text = buf.toString('utf8');
  if (!text.includes('"device-chrome-dnd"')) continue;
  const h = createHash('sha256').update(buf).digest('hex');
  if (seen.has(h)) continue;
  seen.add(h);
  const rows = text.split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  for (const run of new Set(rows.map((r) => r.run))) {
    const own = rows.filter((r) => r.run === run);
    runs++;
    for (const v of own.filter((r) => r.kind === 'verdict' && r.scene === 'device-chrome-dnd' && r.candidate === 'cua')) {
      const samples = own.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.scene === v.scene && r.op === v.op);
      const inf = samples.filter((r) => r.dropped === true && !counted(r));
      if (inf.length) {
        inferred += inf.length;
        console.log(`INFERRED ${f} ${run} ${v.op} (stored ${v.verdict ?? v.pass}): ${inf.map((r) => `${r.block}/${r.i}`).join(',')}`);
      }
      if (v.op !== 'chrome_dnd_late_take_shared') continue;
      cells++;
      const audit = auditOf(own.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.scene === v.scene && r.op === v.op));
      const a = baseJudge(v.op, samples, audit);
      const b = judgeDevice(v.op, samples, audit);
      const tag = a.pass !== b.pass ? 'MOVED' : JSON.stringify(a.reasons) !== JSON.stringify(b.reasons) ? 'REASONS' : 'same';
      if (tag !== 'same') differing++;
      console.log(`${tag} ${f} ${run}: stored ${v.verdict ?? v.pass}, base ${a.pass ? 'pass' : 'fail'}, encoded ${b.pass ? 'pass' : 'fail'}${tag === 'same' ? '' : ` | base ${JSON.stringify(a.reasons)} | encoded ${JSON.stringify(b.reasons)} span_limited ${JSON.stringify(b.span_limited ?? null)}`}`);
    }
  }
}
console.log(`distinct files with device-chrome-dnd ${seen.size}; runs ${runs}; late-take cells ${cells}; differing ${differing}; device-chrome-dnd samples with dropped set on an unread counter ${inferred}`);
