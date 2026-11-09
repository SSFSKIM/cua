// #298: the proposed relabel rule replayed over #296's false-positive spike (scripts/probe-296/live.mjs results.json):
// every cell where #296's emulated guard found the recorded node by its own handle and passed it, the node's label as
// recorded and as read at click time, and whether the rule would now refuse it.
//   node scripts/probe-298/replay-296.mjs <results.json>…
import {readFileSync} from 'node:fs';

const nonEmpty = s => (typeof s === 'string' && s.length ? s : null);
const label = n => nonEmpty(n?.title) ?? nonEmpty(n?.desc) ?? (n?.role === 'AXStaticText' ? nonEmpty(n?.value) : null) ?? '';
const tokens = s => (s.toLowerCase().match(/\d+(?:[.,:]\d+)*|\p{L}+|[^\s\p{L}\d]/gu) ?? []);
const besideNumbers = s => {
  const out = [];
  let skip = false;
  for (const t of tokens(s)) {
    if (/^\d/.test(t)) { skip = true; continue; }
    if (/^\p{L}/u.test(t)) { if (!skip) out.push(t); continue; }
    skip = false;
  }
  return out.join(' ');
};
const DOCUMENT = new Set(['AXWindow', 'AXWebArea']);
const tally = new Map();
for (const f of process.argv.slice(2)) {
  for (const c of JSON.parse(readFileSync(f, 'utf8')).cells) {
    const rec = c.record?.node, now = c.check?.node;
    if (!rec || !now || c.check.identity !== 'cfequal' || c.check.verdict !== 'pass') continue;
    const refuse = !DOCUMENT.has(rec.role) && besideNumbers(label(rec)) !== besideNumbers(label(now));
    const key = c.label.replace(/\/\d+s$/, '');
    const t = tally.get(key) ?? {n: 0, refused: 0, outcomes: new Set(), labels: new Set()};
    t.n += 1; if (refuse) t.refused += 1; t.outcomes.add(c.outcome); t.labels.add(`${label(rec)} -> ${label(now)}`);
    tally.set(key, t);
  }
}
for (const [k, t] of [...tally].sort()) console.log(`${k}: ${t.refused}/${t.n} refused by the rule; #296 outcome ${[...t.outcomes].join(',')}; e.g. ${[...t.labels].slice(0, 2).join(' | ')}`);
