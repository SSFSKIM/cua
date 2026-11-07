// stalecmp.mjs <run-dir>: #296's stale suite, per cell and rep, the main (A) and branch (B) answers side by side; prints
// every cell whose answer (verdict/reason, error name) differs between the heads, and whether each stale cell (expect
// refused) was refused on both.
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
const dir = process.argv[2];
const cells = [];
for (const d of readdirSync(dir).sort()) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const c of j.cells ?? []) cells.push({...c, rep: j.config.rep, job: d});
}
const base = c => c.label.replace(/\/(branch|main)$/, '');
const ans = c => !c ? 'missing' : c.exception || c.problem ? `PROBLEM ${(c.problem ?? c.exception).split('\n')[0].slice(0, 60)}` :
  `${c.stalePoint ? `${c.stalePoint.verdict}/${c.stalePoint.reason}` : 'no stalePoint'}${c.errorName ? ` +${c.errorName}` : ''}`;
const refused = c => Boolean(c && (c.stalePoint?.verdict === 'refused' || (c.errorName && c.errorName !== 'screenChangedSinceScreenshot' && !c.effect?.hit?.length)));
let n = 0, differ = 0, staleCells = 0, staleBoth = 0;
const keys = [...new Set(cells.map(c => `${c.job}|${base(c)}`))];
for (const k of keys) {
  const [job, b] = k.split('|');
  const of = eng => cells.find(c => c.job === job && base(c) === b && c.label.endsWith(`/${eng}`));
  const [m, br] = [of('main'), of('branch')];
  n += 1;
  const expect = (br ?? m)?.spec?.expect ?? '';
  if (expect.startsWith('refused')) { staleCells += 1; if (refused(m) && refused(br)) staleBoth += 1; else console.log(`STALE NOT REFUSED ${job} ${b}: A ${ans(m)}; B ${ans(br)}`); }
  if (ans(m) !== ans(br)) { differ += 1; console.log(`DIFFER ${job} ${b} (expect ${expect}): A ${ans(m)}; B ${ans(br)}`); }
}
console.log(`cells ${n} (cell x rep x group); answers differing between the heads ${differ}; stale cells ${staleCells}, refused on both heads ${staleBoth}`);
