// Task 125: which steps' blocks differ between two launch-plan.mjs outputs.  node steps-differ.mjs <a.txt> <b.txt>
import { readFileSync } from 'node:fs';
const blocks = (f) => new Map(readFileSync(f, 'utf8').split(/^## /m).filter(Boolean).map((b) => [b.split('\n')[0], b]));
const [a, b] = process.argv.slice(2).map(blocks);
const names = [...new Set([...a.keys(), ...b.keys()])];
const differ = names.filter((n) => a.get(n) !== b.get(n));
console.log(`${names.length} steps; differ: ${differ.join(', ') || 'none'}`);
