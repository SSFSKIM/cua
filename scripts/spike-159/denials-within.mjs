#!/usr/bin/env node
// #159 cfprefs, hosted form: the Codex CLI's "before" profile is gone after #115, so the hosted check is one side only.
// The denials cua's own host raises over the cells and services suites (log stream ndjson), reduced by denials.mjs
// (node processes only, filesystem targets as classes), must hold no preferences (cfprefs) entry and stay within a
// declared set. Prints the reduction (operation, class, count) and the verdict; exit 1 when it does not hold.
//   node scripts/spike-159/denials-within.mjs <denials.ndjson> <declared.json>
import {readFileSync} from 'node:fs';
import {summarize, compareDenials} from '../sandbox-probe/denials.mjs';
const [log, declaredFile] = process.argv.slice(2);
const normal = d => `${d.operation} ${d.target.replace(/:\d+$/, ':<port>')}`;
const declared = new Set(JSON.parse(readFileSync(declaredFile, 'utf8')).declared.map(normal));
const after = summarize(readFileSync(log, 'utf8'));
const preferences = compareDenials([], after).preferences;
const outside = after.filter(d => !declared.has(normal(d)));
for (const d of after) console.log(`  denial: ${normal(d)} x${d.count}${declared.has(normal(d)) ? '' : '  (undeclared)'}`);
console.log(`  denials ${after.length} kinds, preferences ${preferences.length}, undeclared ${outside.length}`);
process.exitCode = preferences.length || outside.length ? 1 : 0;
