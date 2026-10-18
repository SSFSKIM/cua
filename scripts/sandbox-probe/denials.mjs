#!/usr/bin/env node
// #115 M1's cfprefsd measurement (spec, Design "Policy" and M1 "Decisions here"): the sandbox denials a run of the #116
// `cells` and `services` suites raises on the mini, under today's kernel profile (the Codex CLI's full-read profile,
// which carries the preferences policy) and under cua's (the kernel's deny list makes it a readable-roots profile
// without it). `log stream --style ndjson --predicate 'sender == "Sandbox"'` records the denials; this reduces them to
// what the decision needs and compares the two sides.
//
//   node scripts/sandbox-probe/denials.mjs summarize <before.ndjson> <after.ndjson> [--out <summary.json>]
//
// Only denials by processes named `node` (the own host's kernels and workers) are kept, as {operation, target} with
// counts: a mach-lookup's service name and a preference domain are kept as they are (they are what the decision is
// about), a filesystem target only as its class (cua's home, the run directory, the home directory, system, other), so
// no path of the account's files leaves the mini's log. The verdict: `new` lists what only the after side denies; the
// preferences policy goes back into the kernel profile only if a run's results also show a new failure (repl-parity's
// own diff decides that), so this summary carries counts, not a verdict on its own.
import {readFileSync, writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const LINE = /Sandbox: (node)\((\d+)\) deny\(\d+\) (\S+)(?: (.*))?$/;

// A filesystem target's class: never the path itself.
export function targetClass(operation, target = '') {
  if (!operation.startsWith('file-')) return target.trim();
  const path = target.trim();
  if (/\/cua\/run\/[^/]+(\/|$)|\/cua-115\/home\/run\/|\/run\/[0-9a-f-]{36}(\/|$)/.test(path)) return '<run directory>';
  if (/\/(Library\/Application Support\/cua|cua-115\/home)(\/|$)/.test(path)) return '<cua home>';
  if (/^\/(System|usr|bin|sbin|private\/etc|Library\/Preferences|Library\/Apple)(\/|$)/.test(path)) return `<system>${path.startsWith('/Library/Preferences') ? ' preferences' : ''}`;
  if (/^\/Users\/[^/]+\/Library\/Preferences(\/|$)/.test(path)) return '<home> preferences';
  if (/^\/Users\/[^/]+(\/|$)/.test(path)) return '<home>';
  return '<other>';
}

// ndjson text (log stream --style ndjson) -> [{operation, target, count}] sorted.
export function summarize(text) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const match = LINE.exec(String(event.eventMessage ?? ''));
    if (!match) continue;
    const [, , , operation, target] = match;
    const key = JSON.stringify([operation, targetClass(operation, target)]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => { const [operation, target] = JSON.parse(key); return {operation, target, count}; })
    .sort((a, b) => (a.operation + a.target < b.operation + b.target ? -1 : 1));
}

export function compareDenials(before, after) {
  const keys = list => new Set(list.map(d => `${d.operation} ${d.target}`));
  const b = keys(before), a = keys(after);
  return {new: after.filter(d => !b.has(`${d.operation} ${d.target}`)), gone: before.filter(d => !a.has(`${d.operation} ${d.target}`)),
    preferences: after.filter(d => /cfprefsd|user-preference/.test(`${d.operation} ${d.target}`))};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values, positionals: [command, before, after]} = parseArgs({allowPositionals: true, options: {out: {type: 'string'}}});
  if (command !== 'summarize' || !before || !after) { console.error('usage: denials.mjs summarize <before.ndjson> <after.ndjson> [--out <file>]'); process.exit(2); }
  const result = {before: summarize(readFileSync(before, 'utf8')), after: summarize(readFileSync(after, 'utf8'))};
  result.comparison = compareDenials(result.before, result.after);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (values.out) writeFileSync(values.out, text);
  process.stdout.write(text);
}
