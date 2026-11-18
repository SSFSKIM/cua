// Ruling 823's re-judge, every verdict (task 100): the stored V5 rows' device verdicts by this checkout's judge and by
// the base judge (a device.mjs of feat/171-m5 at dec76845, given as the first argument and placed beside device.mjs, as
// rejudge-device.mjs's --old is), each compared, so a verdict the diff moved shows whether or not it fails. Read-only.
//
//   node docs/evidence/2026-10-28-own-linux-engine/m5/v5-823/agree-823.mjs <base device.mjs> <step dir>...
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { rejudgeDevice } from '../../../../../scripts/linux-engine-diff/rejudge-device.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [basePath, ...dirs] = process.argv.slice(2);
const old = (await import(pathToFileURL(resolve(basePath)).href)).judgeDevice;
const rowsOf = (dir) => {
  const file = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, p)).find(existsSync);
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
for (const dir of dirs) {
  for (const run of rejudgeDevice(rowsOf(dir), { old })) {
    const differ = run.verdicts.filter((v) => v.then.verdict !== v.now.verdict || JSON.stringify(v.then.reasons) !== JSON.stringify(v.now.reasons)).map((v) => v.name);
    console.log(JSON.stringify({ dir, run: run.run, device_verdicts: run.verdicts.length, base_vs_823_differ: differ }));
  }
}
