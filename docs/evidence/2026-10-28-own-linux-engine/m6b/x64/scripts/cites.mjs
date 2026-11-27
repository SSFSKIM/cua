// T8's citation check: every relative Markdown link target in the m6b README (and every `path` in backticks that starts
// with docs/, scripts/, src/, test/, native/ or runtime/) must exist at H. Prints each target and whether it exists.
//   node cites.mjs <checkout> <H> <readme path inside the checkout>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
const [checkout, H, readme] = process.argv.slice(2);
const text = readFileSync(join(checkout, readme), 'utf8');
const base = dirname(readme);
const targets = new Set();
for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
  const t = m[1];
  if (/^(https?:|#|mailto:)/.test(t)) continue;
  targets.add(normalize(join(base, t.replace(/#.*$/, ''))));
}
for (const m of text.matchAll(/`((?:docs|scripts|src|test|native|runtime)\/[^`\s*{}<>…]+)`/g)) targets.add(normalize(m[1].replace(/\/$/, '')));
let missing = 0;
// Not paths: repl-parity's case ids. Elsewhere by design: arm64's FB is task 165's run on branch m6b-fb-arm64 (N9).
const CASE_IDS = /^native\/app\//;
const ELSEWHERE = { 'docs/evidence/2026-10-28-own-linux-engine/m6b/fb-arm64-main': 'f18235d8e33b9971fe1934468ce93a62dd416818' };
for (const t of [...targets].sort()) {
  if (CASE_IDS.test(t)) { console.log(`case  ${t}`); continue; }
  if (ELSEWHERE[t]) {
    let there = true;
    try { execFileSync('git', ['-C', checkout, 'cat-file', '-e', `${ELSEWHERE[t]}:${t}`], { stdio: 'ignore' }); } catch { there = false; }
    if (!there) missing++;
    console.log(`${there ? `at ${ELSEWHERE[t].slice(0, 9)}` : 'MISSING'} ${t}`);
    continue;
  }
  let ok = true;
  try { execFileSync('git', ['-C', checkout, 'cat-file', '-e', `${H}:${t.replace(/\/$/, '')}`], { stdio: 'ignore' }); } catch { ok = false; }
  // evidence this README's own commit adds is not at H; it is checked in the working tree instead
  let here = false;
  if (!ok) { try { readFileSync(join(checkout, t)); here = true; } catch (e) { here = e.code === 'EISDIR'; } }
  if (!ok && !here) missing++;
  console.log(`${ok ? 'at H ' : here ? 'added' : 'MISSING'} ${t}`);
}
console.log(`${targets.size} targets, ${missing} missing`);
process.exit(missing ? 1 : 0);
