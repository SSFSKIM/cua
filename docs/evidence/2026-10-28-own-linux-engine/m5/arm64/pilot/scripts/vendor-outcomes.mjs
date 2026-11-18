// Task 96: R1's three arm64 vendor outcomes in a vendor lane's results.jsonl, with the run's case order (each case's
// position among the run's cases), the exercise cell's answer text and the case assertion. Read only.
// usage: node vendor-outcomes.mjs <results.jsonl>...
import { readFileSync } from 'node:fs';
const CASES = ['native/app/typetext', 'native/app/paste', 'native/target-app-decorated-tab/getaxstate/minimized'];
for (const f of process.argv.slice(2)) {
  const rows = readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const order = [...new Set(rows.map((r) => r.case))];
  console.log(`## ${f}`);
  console.log(`   case order: ${CASES.map((c) => `${c.split('/').pop()}#${order.indexOf(c) + 1}`).join(', ')} of ${order.length}; neighbours of typetext: ${order.slice(Math.max(0, order.indexOf('native/app/typetext') - 1), order.indexOf('native/app/typetext') + 3).join(' > ')}`);
  for (const c of CASES) {
    const ex = rows.find((r) => r.case === c && r.cell === 'exercise');
    const as = rows.find((r) => r.case === c && r.assertion);
    const text = ex?.content?.map((x) => x.text).join('') ?? '(no exercise row)';
    console.log(`   ${c}: ${ex ? `ok ${ex.ok} isError ${ex.isError} ms ${ex.ms}` : ''} ${text}`);
    console.log(`     assertion ${JSON.stringify(as?.assertion)}`);
  }
}
