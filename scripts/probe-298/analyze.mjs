// #298: the candidate rules' verdicts over scripts/probe-298/measure.mjs's readings (one or more results.json).
//   node scripts/probe-298/analyze.mjs <results.json>… > table.md
// Each cell's observation reading (O) and click-time reading (C) are of one held handle. The label is what #296's record
// holds: the title, else the description. Every rule answers refuse or pass for a cell; a rule that needs an attribute
// one side lacks passes (it cannot see).
import {readFileSync} from 'node:fs';

const files = process.argv.slice(2);
const nonEmpty = s => (typeof s === 'string' && s.length ? s : null);
const label = n => nonEmpty(n?.AXTitle) ?? nonEmpty(n?.AXDescription) ?? '';
const words = s => (s.toLowerCase().match(/\p{L}+/gu) ?? []);
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
console.log(out.join('\n'));
