// T8's citation check, against commits only (fix wave 1: nothing is read from the working tree). Every relative Markdown
// link target in the m6b README, and every `path` in backticks that starts with docs/, scripts/, src/, test/, native/ or
// runtime/, must exist in the evidence commit's tree. Each one is also marked by whether it exists at H already or
// was added by the evidence. The README itself is read from the evidence commit.
//   node cites.mjs <checkout> <H> <evidence commit> <readme path inside the checkout>
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
const [checkout, H, commit, readme] = process.argv.slice(2);
const git = (args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
const exists = (rev, path) => { try { execFileSync('git', ['-C', checkout, 'cat-file', '-e', `${rev}:${path}`], { stdio: 'ignore' }); return true; } catch { return false; } };
const text = git(['show', `${commit}:${readme}`]);
const base = dirname(readme);
const targets = new Set();
for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
  const t = m[1];
  if (/^(https?:|#|mailto:)/.test(t)) continue;
  targets.add(normalize(join(base, t.replace(/#.*$/, ''))).replace(/\/$/, ''));
}
for (const m of text.matchAll(/`((?:docs|scripts|src|test|native|runtime)\/[^`\s*{}<>…]+)`/g)) targets.add(normalize(m[1]).replace(/\/$/, ''));
// Not paths: repl-parity's case ids. Elsewhere by design: arm64's FB is task 165's run on branch m6b-fb-arm64 (N9).
const CASE_IDS = /^native\/app\//;
const ELSEWHERE = { 'docs/evidence/2026-10-28-own-linux-engine/m6b/fb-arm64-main': 'f18235d8e33b9971fe1934468ce93a62dd416818' };
console.log(`# README ${readme} at ${commit}; H ${H}`);
let missing = 0;
for (const t of [...targets].sort()) {
  if (CASE_IDS.test(t)) { console.log(`case    ${t}`); continue; }
  if (ELSEWHERE[t]) {
    const there = exists(ELSEWHERE[t], t);
    if (!there) missing++;
    console.log(`${there ? `at ${ELSEWHERE[t].slice(0, 9)}` : 'MISSING'} ${t}`);
    continue;
  }
  const inCommit = exists(commit, t);
  if (!inCommit) missing++;
  console.log(`${!inCommit ? 'MISSING' : exists(H, t) ? 'at H   ' : 'added  '} ${t}`);
}
console.log(`${targets.size} targets, ${missing} missing from ${commit.slice(0, 9)}`);
process.exit(missing ? 1 : 0);
