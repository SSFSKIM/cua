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
// One line per normalised kind (two loopback connections differ only in their ephemeral port).
const kinds = new Map();
for (const d of after) kinds.set(normal(d), (kinds.get(normal(d)) ?? 0) + d.count);
const preferences = compareDenials([], after).preferences;
const outside = [...kinds.keys()].filter(kind => !declared.has(kind));
for (const [kind, count] of kinds) console.log(`  denial: ${kind} x${count}${declared.has(kind) ? '' : '  (undeclared)'}`);
console.log(`  denials ${kinds.size} kinds, preferences ${preferences.length}, undeclared ${outside.length}`);
process.exitCode = preferences.length || outside.length ? 1 : 0;
