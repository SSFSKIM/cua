// #469's reader: the closed buttons' attributes (measure.mjs --signal). One line per button (app, role, label), each
// field with its distinct values across the rows (a field with one value in every row is stable), then the attribute
// names that some buttons have and others lack, and the problems.
//   node scripts/probe-463/signal-reader.mjs <results.json>...
import {readFileSync} from 'node:fs';
const FIELDS = ['AXHasPopup', 'AXPopupValue', 'AXSubrole', 'AXRoleDescription', 'AXDOMClassList', 'AXIdentifier', 'AXDOMIdentifier', 'AXExpanded', 'AXValue', 'AXEnabled'];
const text = v => typeof v === 'object' && v !== null ? JSON.stringify(v.items ?? v) : String(v);
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.engineLabel ?? ''} engine ${config.engineRef} (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min)\n`);
  const buttons = new Map();
  for (const r of results) for (const e of r.dump?.elements ?? []) {
    const name = [e.extras.AXTitle, e.extras.AXDescription].filter(x => typeof x === 'string' && x).join(' | ') || '(unlabelled)';
    const key = `${r.app} ${e.role} "${name}"${e.inWebArea ? ' [web]' : ''}`;
    if (!buttons.has(key)) buttons.set(key, []);
    buttons.get(key).push({row: r.label, e});
  }
  console.log('| button | rows | ' + FIELDS.join(' | ') + ' | children | toolbar / web area in chain | actions |');
  console.log('|' + '---|'.repeat(FIELDS.length + 5));
  for (const [key, xs] of buttons) {
    const distinct = f => [...new Set(xs.map(f))].join(' / ');
    const cells = FIELDS.map(f => distinct(x => text(x.e.extras[f])));
    const kids = distinct(x => x.e.children.join(','));
    const chain = distinct(x => `${x.e.chain.some(c => c.startsWith('AXToolbar')) ? 'toolbar' : '-'} ${x.e.chain.some(c => c.startsWith('AXWebArea')) ? 'web' : '-'}`);
    console.log(`| ${key} | ${xs.length} | ${cells.join(' | ')} | ${kids || '-'} | ${chain} | ${distinct(x => x.e.actions.join(','))} |`);
  }
  console.log('\nattribute names per button (union over rows):');
  for (const [key, xs] of buttons) console.log(`  ${key}: ${[...new Set(xs.flatMap(x => x.e.names))].sort().join(',')}; parameterized ${[...new Set(xs.flatMap(x => x.e.parameterized))].sort().join(',') || '-'}`);
  console.log('\nopen windows above layer 0 at the dump (should be none):', JSON.stringify(results.map(r => [r.label, r.openAbove, r.front, r.layoutBuilt?.ok])));
  console.log('\nother apps:', Object.entries(config.otherDumps ?? {}).map(([k, d]) => `${k} ${d.elements?.length ?? d.error}`).join('; '));
  console.log('\nproblems:', JSON.stringify(results.filter(r => r.exception).map(r => [r.label, r.exception.split('\n')[0]])));
}
