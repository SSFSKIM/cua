// Task 108 (rulings 867 and 870, fix waves 1 to 3): a diagnostic scan, never a verdict. Every stored run listed that has
// Chrome drag-and-drop device cells: each such cell both judges know (device-chrome-dnd, its case in both judges'
// DEVICE_OPS) re-judged by a base judge and by this checkout's, each bound the way rejudge-device.mjs and compare.mjs
// bind it (`rejudgeDevice`: the run's rows, its premise sidecar beside the results, its recorded plan from the meta, and
// its audit's `--no-audit` from step.json); and every device-chrome-dnd sample whose `dropped` an unread counter set
// (the runner's inferred bit). A premise cell's replayed pass is diagnostic only (wave 8), as everywhere. Read-only.
//   node scan-stored.mjs <checkout> <base checkout> <file listing results paths>
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [checkout, base, list] = process.argv.slice(2);
const files = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const load = (root, file) => import(pathToFileURL(join(root, 'scripts/linux-engine-diff', file)).href);
const { evidenceOf, judgedVerdict, rejudgeDevice } = await load(checkout, 'rejudge-device.mjs');
const { DEVICE_OPS, judgeDevice } = await load(checkout, 'device.mjs');
const { DEVICE_OPS: BASE_OPS, judgeDevice: baseJudge } = await load(base, 'device.mjs');
const known = (op) => op in DEVICE_OPS && op in BASE_OPS;
const counted = (r) => typeof r.drop_status?.before?.drops === 'number' && typeof r.drop_status?.after?.drops === 'number';

/** Whether the step's own record shows its audit disabled, its step.json beside the results or one level up. */
function noAuditOf(file) {
  const step = [join(dirname(file), 'step.json'), join(dirname(dirname(file)), 'step.json')].find(existsSync);
  return step ? String(JSON.parse(readFileSync(step, 'utf8')).command ?? '').split(' ').includes('--no-audit') : false;
}

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
  for (const r of rows.filter((x) => x.kind === 'sample' && x.engine === 'cua' && x.scene === 'device-chrome-dnd' && x.dropped === true && !counted(x))) {
    inferred++;
    console.log(`INFERRED ${f} ${r.run} ${r.op} ${r.block}/${r.i}`);
  }
  const args = { lines: evidenceOf(f), noAudit: noAuditOf(f) };
  // the drag-and-drop cells' rows and the run's own (its meta, its end): an old run's other cells may name cases since renamed
  const cell = rows.filter((r) => !['verdict', 'sample', 'audit'].includes(r.kind) || (r.scene === 'device-chrome-dnd' && known(r.op)));
  const now = rejudgeDevice(cell, { ...args, judge: judgeDevice });
  const then = rejudgeDevice(cell, { ...args, judge: baseJudge });
  for (const run of now) {
    runs++;
    const before = new Map(then.find((x) => x.run === run.run).verdicts.map((v) => [v.name, v]));
    for (const v of run.verdicts) {
      cells++;
      const b = before.get(v.name).now;
      const tag = judgedVerdict(b) !== judgedVerdict(v.now) ? 'MOVED' : JSON.stringify(b.reasons) !== JSON.stringify(v.now.reasons) ? 'REASONS' : 'same';
      if (tag !== 'same') differing++;
      const plan = v.now.plan_unverified ? 'no recorded plan' : 'plan bound';
      console.log(`${tag} ${f} ${run.run} (${plan}): stored ${v.stored.verdict}, base ${judgedVerdict(b)}, encoded ${judgedVerdict(v.now)}${tag === 'same' ? '' : ` | base ${JSON.stringify(b.reasons)} | encoded ${JSON.stringify(v.now.reasons)}`}`);
    }
  }
}
console.log(`diagnostic scan, bound as rejudge-device binds: distinct files with device-chrome-dnd ${seen.size}; runs ${runs}; device-chrome-dnd cells judged ${cells}; differing ${differing}; device-chrome-dnd samples with dropped set on an unread counter ${inferred}`);
