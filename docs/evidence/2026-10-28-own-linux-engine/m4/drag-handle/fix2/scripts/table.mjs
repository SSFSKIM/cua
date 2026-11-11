#!/usr/bin/env node
// The fix wave's tallies from drop-signals results (the design session's rulings on task 73's review, 2026-11-11):
// per sitting, lane and cell, how many drags; how many the zone took (landed) and how many dropped anywhere (the page's
// last dragend dropEffect not none); how they answered (ok with nothing pending, or the unconfirmed notice); the false
// ok, an ok with nothing pending on a drag that dropped nowhere, which every bar forbids; the landed but unconfirmed;
// (a block's first drag, on a fresh engine, is cold); and the drag loop's cursor at the release as the engine read it:
// the accept, another cursor, or not told.
// usage: node table.mjs <name>=<results.jsonl>...   (markdown on stdout)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = (file) => (file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8'));

const rows = [];
for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.includes('=') ? arg.split('=') : [arg, arg];
  for (const line of read(file).split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.kind === 'drop-signal') rows.push({ name, ...r });
  }
}
const groups = new Map();
for (const r of rows) {
  const key = `${r.name}|${r.load}|${r.lane}|${r.cell}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const pendingOf = (r) => (r.notice ? (/unconfirmed drop/.test(r.notice) ? 'unconfirmed' : 'other') : null);
console.log('| sitting | load | lane | cell | drags | zone took | dropped | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (cold / warm) | cursor at release: accept / other / not told |');
console.log('|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
for (const [key, list] of groups) {
  const [name, load, lane, cell] = key.split('|');
  const n = list.length;
  const count = (f) => list.filter(f).length;
  const okClean = (r) => r.ok === true && pendingOf(r) === null;
  const dropped = (r) => (r.after?.last?.effect ?? 0) > 0;
  const accepted = (v) => count((r) => r.drop_cursor?.accepted === v);
  console.log(
    `| ${name} | ${load} | ${lane} | ${cell} | ${n} | ${count((r) => r.outcome?.landed)} | ${count(dropped)} | ${count(okClean)} | ${count((r) => pendingOf(r) === 'unconfirmed')} | ${count((r) => pendingOf(r) === 'other')} | ${count((r) => r.ok !== true)} | ${count((r) => okClean(r) && !dropped(r))} | ${count((r) => r.outcome?.landed && pendingOf(r) === 'unconfirmed')} (${count((r) => r.cold && r.outcome?.landed && pendingOf(r) === 'unconfirmed')} / ${count((r) => !r.cold && r.outcome?.landed && pendingOf(r) === 'unconfirmed')}) | ${accepted(true)} / ${accepted(false)} / ${n - accepted(true) - accepted(false)} |`,
  );
}
