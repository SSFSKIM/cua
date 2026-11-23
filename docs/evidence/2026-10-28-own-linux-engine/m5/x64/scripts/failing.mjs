// Task 89 (ruling 743): the failing tests of an `npm test` log (node --test's spec reporter's "failing tests" section),
// one per line as "<file> :: <test name>", sorted; with two logs, also the names in the first that the second lacks.
// usage: node failing.mjs <log> [<baseline log>]
import { readFileSync } from 'node:fs';

function failing(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('✖ failing tests:'));
  if (start < 0) return [];
  const out = [];
  let file = null;
  for (const l of lines.slice(start + 1)) {
    const at = /^test at (\S+?):\d+:\d+$/.exec(l);
    if (at) { file = at[1]; continue; }
    const name = /^✖ (.*?)(?: \(\d+(?:\.\d+)?ms\))?$/.exec(l);
    if (name && file) { out.push(`${file} :: ${name[1]}`); file = null; }
  }
  return [...new Set(out)].sort();
}

const [a, b] = process.argv.slice(2);
const fa = failing(a);
console.log(`${a}: ${fa.length} failing`);
for (const t of fa) console.log(`  ${t}`);
if (b) {
  const fb = new Set(failing(b));
  console.log(`${b}: ${fb.size} failing`);
  for (const t of [...fb].sort()) console.log(`  ${t}`);
  const extra = fa.filter((t) => !fb.has(t));
  console.log(`failing in the first and not in the second: ${extra.length}`);
  for (const t of extra) console.log(`  ${t}`);
  const fixed = [...fb].filter((t) => !fa.includes(t));
  console.log(`failing in the second and not in the first: ${fixed.length}`);
  for (const t of fixed) console.log(`  ${t}`);
}
