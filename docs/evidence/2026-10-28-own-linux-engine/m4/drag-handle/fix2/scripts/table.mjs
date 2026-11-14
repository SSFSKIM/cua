#!/usr/bin/env node
// The second fix wave's tallies from drop-signals results (the design session's rulings, 2026-11-11): per sitting,
// lane and cell, how many drags; how many the zone took (landed) and how many dropped anywhere; how they answered (ok
// with nothing pending, or the unconfirmed notice); the false ok, an ok with nothing pending on a drag that dropped
// nowhere, which every bar forbids; the landed but unconfirmed (a block's first drag, on a fresh engine, is cold); and
// the drag loop's cursor at the release as the engine read it: the accept, another cursor, or not told.
//
// "Dropped" is the page's last dragend dropEffect (not none), except for the cells that end off the window (the bare
// root, the xterm, another browser window's scroller): nothing there takes a drop, and Chromium ends such a drag with
// its last accepted operation (the wave's pilot), so those never count as dropped. An off-window drag whose end was not
// verified before it (`end_park`: its window was not under the end) is left out of its row and counted apart.
// usage: node table.mjs <name>=<results.jsonl>...   (markdown on stdout)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const OFF_WINDOW = ['root', 'xterm', 'other'];
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
console.log('| sitting | load | lane | cell | drags | end not verified | zone took | dropped | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (cold / warm) | cursor at release: accept / other / not told |');
console.log('|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
for (const [key, all] of groups) {
  const [name, load, lane, cell] = key.split('|');
  const unverified = all.filter((r) => r.end_park && r.end_park.verified === false).length;
  const list = all.filter((r) => !(r.end_park && r.end_park.verified === false));
  const n = list.length;
  const count = (f) => list.filter(f).length;
  const okClean = (r) => r.ok === true && pendingOf(r) === null;
  const dropped = (r) => !OFF_WINDOW.includes(r.base ?? r.cell) && (r.after?.last?.effect ?? 0) > 0;
  const accepted = (v) => count((r) => r.drop_cursor?.accepted === v);
  console.log(
    `| ${name} | ${load} | ${lane} | ${cell} | ${n} | ${unverified} | ${count((r) => r.outcome?.landed)} | ${count(dropped)} | ${count(okClean)} | ${count((r) => pendingOf(r) === 'unconfirmed')} | ${count((r) => pendingOf(r) === 'other')} | ${count((r) => r.ok !== true)} | ${count((r) => okClean(r) && !dropped(r))} | ${count((r) => r.outcome?.landed && pendingOf(r) === 'unconfirmed')} (${count((r) => r.cold && r.outcome?.landed && pendingOf(r) === 'unconfirmed')} / ${count((r) => !r.cold && r.outcome?.landed && pendingOf(r) === 'unconfirmed')}) | ${accepted(true)} / ${accepted(false)} / ${n - accepted(true) - accepted(false)} |`,
  );
}
