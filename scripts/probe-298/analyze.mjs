// #298: the candidate rules' verdicts over scripts/probe-298/measure.mjs's readings (one or more results.json).
//   node scripts/probe-298/analyze.mjs <results.json>… > table.md
// Each cell's observation reading (O) and click-time reading (C) are of one held handle. The label is what #296's record
// holds: the title, else the description. Every rule answers refuse or pass for a cell; a rule that needs an attribute
// one side lacks passes (it cannot see).
import {readFileSync} from 'node:fs';

const files = process.argv.slice(2);
const nonEmpty = s => (typeof s === 'string' && s.length ? s : null);
// A text node's words are its value (it carries no title or description).
const label = n => nonEmpty(n?.AXTitle) ?? nonEmpty(n?.AXDescription) ?? (n?.AXRole === 'AXStaticText' ? nonEmpty(n?.AXValue) : null) ?? '';
const words = s => (s.toLowerCase().match(/\p{L}+/gu) ?? []);
// The label's words with every number taken out, and with it the words that follow the number: one word (`one`), or up to
// the next punctuation mark (`run`): a count's or a time's unit and its inflection ("1 item", "59 seconds", "3 new").
const tokens = s => (s.toLowerCase().match(/\d+(?:[.,:]\d+)*|\p{L}+|[^\s\p{L}\d]/gu) ?? []);
const besideNumbers = (s, mode) => {
  const out = [];
  let skip = 0;
  for (const t of tokens(s)) {
    if (/^\d/.test(t)) { skip = mode === 'one' ? 1 : Infinity; continue; }
    if (/^\p{L}/u.test(t)) { if (skip > 0) { skip -= 1; continue; } out.push(t); continue; }
    skip = 0;  // punctuation ends a number's words
  }
  return out.join(' ');
};
const DOCUMENT = new Set(['AXWindow', 'AXWebArea']);
const digitMask = s => s.replace(/\d+(?:[.,:]\d+)*/g, '#');
const covered = (w, list) => list.some(x => x.startsWith(w));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sorted = a => (Array.isArray(a) ? [...a].sort() : a);
const INTERACTIVE = new Set(['AXButton', 'AXCheckBox', 'AXRadioButton', 'AXLink', 'AXPopUpButton', 'AXMenuButton', 'AXMenuItem', 'AXTextField',
  'AXTextArea', 'AXComboBox', 'AXSearchField', 'AXSecureTextField', 'AXSlider', 'AXIncrementor', 'AXDisclosureTriangle', 'AXTab', 'AXSwitch',
  'AXColorWell', 'AXSegmentedControl']);

// The rules: each (O, C) -> true when it refuses.
const RULES = {
  anyLabel: (o, c) => label(o) !== label(c),
  digitsOnly: (o, c) => digitMask(label(o)) !== digitMask(label(c)),
  lettersSame: (o, c) => words(label(o)).join(' ') !== words(label(c)).join(' '),
  wordsKept: (o, c) => words(label(o)).some(w => !covered(w, words(label(c)))),
  wordsKeptInteractive: (o, c) => INTERACTIVE.has(o.AXRole) && words(label(o)).some(w => !covered(w, words(label(c)))),
  besideNumbersOne: (o, c) => besideNumbers(label(o), 'one') !== besideNumbers(label(c), 'one'),
  besideNumbersRun: (o, c) => besideNumbers(label(o), 'run') !== besideNumbers(label(c), 'run'),
  proposed: (o, c) => !DOCUMENT.has(o.AXRole) && besideNumbers(label(o), 'run') !== besideNumbers(label(c), 'run'),
  domId: (o, c) => o.AXDOMIdentifier != null && !same(o.AXDOMIdentifier, c.AXDOMIdentifier),
  axIdentifier: (o, c) => o.AXIdentifier != null && !same(o.AXIdentifier, c.AXIdentifier),
  classList: (o, c) => o.AXDOMClassList != null && !same(sorted(o.AXDOMClassList), sorted(c.AXDOMClassList)),
  roleOrActions: (o, c) => !same(o.AXRole, c.AXRole) || !same(o.AXSubrole, c.AXSubrole) || !same(o.AXRoleDescription, c.AXRoleDescription) || !same(sorted(o.actions), sorted(c.actions)),
  value: (o, c) => !same(o.AXValue, c.AXValue),
  help: (o, c) => !same(o.AXHelp, c.AXHelp),
};
const ATTRS = ['AXRole', 'AXSubrole', 'AXRoleDescription', 'AXTitle', 'AXDescription', 'AXValue', 'AXValueDescription', 'AXHelp', 'AXIdentifier',
  'AXDOMIdentifier', 'AXDOMClassList', 'AXEnabled', 'AXSelected', 'AXExpanded', 'actions', 'childCount'];

const rows = [];
for (const f of files) {
  const {config, rows: reps} = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of reps) {
    if (!r.cells) continue;
    for (const spec of r.cells) {
      const o = r.observation?.cells?.[spec.key], p = r.pre?.cells?.[spec.key], c = r.click?.cells?.[spec.key];
      const row = {runner: config.runner, group: r.group, rep: r.rep, key: spec.key, truth: spec.truth};
      if (!o?.found || !c?.node) { row.problem = o?.found ? 'no click read' : 'not found'; rows.push(row); continue; }
      const O = o.node, C = c.node, P = p?.node;
      Object.assign(row, {
        role: O.AXRole, labelO: label(O), labelPre: P && label(P), labelC: label(C), alive: C.alive, refoundSame: c.refoundSame ?? null,
        hitO: o.hit?.role ?? null, hitIsHandleO: o.hitIsHandle ?? null, hitInsideO: o.hitInsideHandle ?? null,
        hitC: c.hit?.role ?? null, hitIsHandleC: c.hitIsHandle ?? null, hitSameAsFirst: c.hitSameAsFirst ?? null,
        changed: ATTRS.filter(a => !same(Array.isArray(O[a]) ? sorted(O[a]) : O[a],Array.isArray(C[a]) ? sorted(C[a]) : C[a]))
          .map(a => `${a}: ${JSON.stringify(O[a] ?? null)} -> ${JSON.stringify(C[a] ?? null)}`),
        driftPre: P ? ATTRS.filter(a => !same(O[a], P[a])) : null,
        readMs: C.readMs,
        deepO: o.hitInsideHandle ? o.deep : null, deepC: o.hitInsideHandle ? c.deep : null, deepRecreated: c.deepRecreated ?? null,
        verdicts: Object.fromEntries(Object.entries(RULES).map(([k, rule]) => [k, C.alive ? (rule(O, C) ? 'refuse' : 'pass') : 'gone'])),
      });
      rows.push(row);
    }
  }
}

// The table: one line per (group, key), the verdict of each rule with its count over the repetitions when they disagree.
const groups = new Map();
for (const r of rows) { const k = `${r.group}/${r.key}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const ruleNames = Object.keys(RULES);
const short = v => ({refuse: 'R', pass: '·', gone: 'G'}[v] ?? '?');
const out = [];
out.push(`| cell | truth | role | label at observation -> at click | same handle | attributes changed (besides the label) | ${ruleNames.join(' | ')} |`);
out.push(`|${'---|'.repeat(5 + ruleNames.length + 1)}`);
const tally = Object.fromEntries(ruleNames.map(k => [k, {fp: [], miss: [], flipRefused: [], flipPassed: []}]));
for (const [k, list] of groups) {
  const ok = list.filter(r => !r.problem);
  if (!ok.length) { out.push(`| ${k} | ${list[0].truth} | ${list.map(r => r.problem).join(', ')} |`); continue; }
  const a = ok[0];
  const labels = [...new Set(ok.map(r => `${JSON.stringify(r.labelO)} -> ${JSON.stringify(r.labelC)}`))];
  const labelText = labels.length > 2 ? `${labels[0]} (and ${labels.length - 1} more like it)` : labels.join('; ');
  const sameHandle = `${ok.filter(r => r.alive && r.refoundSame !== false).length}/${ok.length}`;
  const other = [...new Set(ok.flatMap(r => r.changed.filter(c => !/^AX(Title|Description): /.test(c) && !(a.key === 'tick' && /^childCount/.test(c)))))];
  const cells = ruleNames.map(rule => {
    const vs = ok.map(r => r.verdicts[rule]);
    const refuse = vs.filter(v => v === 'refuse').length;
    const content = /content|same-meaning/.test(a.truth), meaning = /meaning/.test(a.truth) && a.truth !== 'same-meaning';
    if (content && refuse) tally[rule].fp.push(`${k}${refuse < vs.length ? ` (${refuse}/${vs.length})` : ''}`);
    if (meaning && refuse < vs.length) tally[rule].miss.push(`${k}${refuse ? ` (${vs.length - refuse}/${vs.length})` : ''}`);
    if (a.truth === 'flip') (refuse ? tally[rule].flipRefused : tally[rule].flipPassed).push(k);
    return new Set(vs).size === 1 ? short(vs[0]) : `${short('refuse')}${refuse}/${vs.length}`;
  });
  out.push(`| ${k} | ${a.truth} | ${a.role} | ${labelText.replace(/\|/g, '\\|')} | ${sameHandle} | ${other.slice(0, 4).join('; ').replace(/\|/g, '\\|') || '-'} | ${cells.join(' | ')} |`);
}
out.push('', 'R refuse, · pass, G handle gone (no rule reads); Rk/n when the repetitions disagree.', '');
for (const rule of ruleNames) {
  const t = tally[rule];
  out.push(`- **${rule}**: false positives ${t.fp.length ? t.fp.join(', ') : 'none'}; misses ${t.miss.length ? t.miss.join(', ') : 'none'}; state flips refused ${t.flipRefused.join(', ') || 'none'}, passed ${t.flipPassed.join(', ') || 'none'}`);
}
out.push('', '<details><summary>hit-test and drift per cell</summary>', '');
for (const [k, list] of groups) {
  const ok = list.filter(r => !r.problem);
  if (!ok.length) continue;
  const hits = [...new Set(ok.map(r => `O:${r.hitO}${r.hitIsHandleO ? '=handle' : r.hitInsideO ? '<handle' : ''} C:${r.hitC}${r.hitIsHandleC ? '=handle' : ''}${r.hitSameAsFirst === false ? ' (another element)' : ''}`))];
  const drift = [...new Set(ok.flatMap(r => r.driftPre ?? []))];
  out.push(`- ${k}: hit ${hits.join('; ')}; drift with nothing changed: ${drift.join(', ') || 'none'}; click-time read ${Math.max(...ok.map(r => r.readMs))} ms max`);
}
out.push('', '</details>');

// The deepest node at the point, where it lies inside the control (the text of a link, of a clickable div): what #296's
// record takes at the point. Alive: its handle and the proposed rule on its words. Gone: #296's re-created search, with
// the proposed rule run on what it matched.
const deepRows = [...groups].filter(([, list]) => list.some(r => r.deepO) && !list[0].truth.startsWith('container'));
if (deepRows.length) {
  out.push('', '| cell | truth | deepest node | its words at observation -> at click | its handle | #296 today | proposed |', '|---|---|---|---|---|---|---|');
  for (const [k, list] of deepRows) {
    const ok = list.filter(r => r.deepO);
    const read = r => {
      if (r.deepC?.alive) return {words: label(r.deepC), handle: 'kept', today: 'kept (handle)', proposed: RULES.proposed(r.deepO, r.deepC) ? 'refuse' : 'pass'};
      const m = r.deepRecreated?.match;
      if (m) return {words: label(m), handle: 'gone', today: 'kept (re-created)', proposed: RULES.proposed(r.deepO, m) ? 'refuse' : 'pass'};
      return {words: label(r.deepRecreated?.nearest) || '?', handle: 'gone', today: `refused (nodeGone; nearest ${r.deepRecreated?.nearestDistance} pt)`, proposed: 'refuse (nodeGone)'};
    };
    const seen = [...new Set(ok.map(r => { const x = read(r); return `${JSON.stringify(label(r.deepO))} -> ${JSON.stringify(x.words)} | ${x.handle} | ${x.today} | ${x.proposed}`; }))];
    out.push(`| ${k} | ${ok[0].truth} | ${ok[0].deepO.AXRole} | ${seen.map(s => s.split(' | ')[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join('; ')} | ${[...new Set(seen.map(s => s.split(' | ')[1]))].join(', ')} (${ok.length}) | ${[...new Set(seen.map(s => s.split(' | ')[2]))].join('; ')} | ${[...new Set(seen.map(s => s.split(' | ')[3]))].join('; ')} |`);
  }
}

// The corpus: label pairs beyond the live cells, judged by the label rules alone (the live cells showed every browser and
// AppKit delivering the label verbatim on the kept handle, so a rule's verdict on a pair is a property of the strings).
const CORPUS = [
  ['content', 'Elapsed 9.9 s', 'Elapsed 10.0 s'], ['content', '3:21', '3:20'], ['content', 'Like (12)', 'Like (13)'],
  ['content', '1 item', '2 items'], ['content', '1 reply', '2 replies'], ['content', '1 child', '2 children'],
  ['content', '1 new message', '2 new messages'], ['content', 'Show 3 more replies', 'Show 4 more replies'],
  ['content', '1 minute ago', '2 minutes ago'], ['content', 'Starts in 1 minute', 'Starts in 59 seconds'], ['content', '1 hour left', '59 minutes left'],
  ['content', 'just now', '1 minute ago'], ['content', 'Today', 'Yesterday'], ['content', 'No notifications', '3 notifications'],
  ['content', 'Inbox', 'Inbox (3)'], ['content', 'Cart', 'Cart (1)'], ['content', 'Notifications', 'Notifications, 3 new'],
  ['content', 'Uploading 45%', 'Uploading 46%'], ['content', 'Download (2.1 MB)', 'Download (12 MB)'],
  ['content', '1 Kommentar', '2 Kommentare'], ['content', '2 комментария', '5 комментариев'], ['content', '3件', '4件'],
  ['content', 'Inbox - Gmail', 'Inbox (3) - Gmail'], ['content', 'Slack', '* Slack'],
  ['content (document title)', 'Gmail', 'Ann messaged you'], ['content (document title)', 'Video - Google Chrome', 'Video - Audio playing - Google Chrome'],
  ['same-meaning', 'Save', 'Guardar'],
  ['flip', 'Follow', 'Following'], ['flip', 'Following', 'Follow'], ['flip', 'Save', 'Saved'], ['flip', 'Add to cart', 'Added to cart'],
  ['flip', 'Play', 'Pause'], ['flip', 'Mute', 'Unmute'], ['flip', 'Show more', 'Show less'], ['flip', 'Expand', 'Collapse'],
  ['meaning', 'Save', 'Delete'], ['meaning', 'Archive', 'Delete'], ['meaning', 'OK', 'Cancel'], ['meaning', 'Next', 'Submit'],
  ['meaning', 'Enable', 'Disable'], ['meaning', 'Delete', 'Delete all'], ['meaning', 'Reply', 'Reply all'],
  ['meaning', 'Allow', "Don't Allow"], ['meaning', 'Continue', 'Continue and pay $9.99'], ['meaning', 'Save draft', 'Discard draft'],
  ['meaning', 'Invoice from Acme', 'Invoice from Bolt'], ['meaning', 'Order #1234', 'Order #1235'], ['meaning', 'Nov 8 standup', 'Nov 9 standup'],
  ['meaning', 'Delete 1 file', 'Delete 3 files'],
];
const LABEL_RULES = ['anyLabel', 'digitsOnly', 'lettersSame', 'wordsKept', 'besideNumbersOne', 'besideNumbersRun'];
out.push('', `| truth | at observation -> at click | ${LABEL_RULES.join(' | ')} |`, `|${'---|'.repeat(LABEL_RULES.length + 2)}`);
const corpusTally = Object.fromEntries(LABEL_RULES.map(k => [k, {fp: [], miss: []}]));
for (const [truth, a, b] of CORPUS) {
  const vs = LABEL_RULES.map(k => RULES[k]({AXTitle: a}, {AXTitle: b}));
  LABEL_RULES.forEach((k, i) => { if (truth.startsWith('content') || truth === 'same-meaning') { if (vs[i]) corpusTally[k].fp.push(`${a} -> ${b}`); } else if (truth === 'meaning' && !vs[i]) corpusTally[k].miss.push(`${a} -> ${b}`); });
  out.push(`| ${truth} | ${JSON.stringify(a)} -> ${JSON.stringify(b)} | ${vs.map(v => (v ? 'R' : '·')).join(' | ')} |`);
}
out.push('');
for (const k of LABEL_RULES) out.push(`- corpus **${k}**: false positives ${corpusTally[k].fp.length} (${corpusTally[k].fp.join('; ') || '-'}); misses ${corpusTally[k].miss.length} (${corpusTally[k].miss.join('; ') || '-'})`);
console.log(out.join('\n'));
