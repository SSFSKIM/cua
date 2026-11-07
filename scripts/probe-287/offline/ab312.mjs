// #312 offline: A (main) against B (the fix) per repetition: #282's Firefox page cells and the recon's observations.
//   node scripts/probe-287/offline/ab312.mjs <run dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const fr = f => f ? `${f.x},${f.y},${f.width}x${f.height}` : '-';
const keys = o => o ? `clipReread=${o.clipReread ?? '-'} unplaced=${o.unplacedClips ?? '-'} rereadMs=${o.clipRereadMs ?? '-'} reads=${o.clipRereadReads ?? '-'}` : '-';
for (const a of readdirSync(dir).filter(n => n.startsWith('probe-287-ab312')).sort()) {
  for (const h of ['a', 'b']) {
    const f = join(dir, a, h, 'firefox', '282', 'results.json');
    if (existsSync(f)) {
      const r = JSON.parse(readFileSync(f, 'utf8'));
      console.log(`### ${a} ${h} 282 ${r.config.browserVersion} ${r.config.macOS}`);
      for (const c of r.cells) {
        const k = c.click, m = k?.error ? k.error.meta : k?.result?.meta, sp = m?.stalePoint;
        const ans = !k ? `PROBLEM ${JSON.stringify(c.problem ?? c.exception ?? '').slice(0, 120)}` : k.error ? `ERR ${k.error.errorName ?? k.error.code}` : 'ok';
        const d = c.delta ?? {};
        console.log(`  ${c.label.padEnd(28)} ${ans.padEnd(34)} sp=${sp ? `${sp.verdict}/${sp.reason}` : '-'} ptr=${d.pointerdown ?? '-'}/${d.click ?? '-'} opt=${d.optionChange ?? '-'} apply=${d.applyClick ?? '-'} focus=${c.focusedAfter?.role ?? '-'} | obs1 ${keys(c.observation)} total=${Math.round(c.observation?.totalMs ?? NaN)} wa=${fr(c.observation?.webAreaFrame)} | later ${keys(c.laterObservation)} wa=${fr(c.laterObservation?.webAreaFrame)}`);
      }
    }
    const g = join(dir, a, h, 'recon', 'results.json');
    if (existsSync(g)) {
      const r = JSON.parse(readFileSync(g, 'utf8'));
      console.log(`### ${a} ${h} recon ${r.config.firefoxVersion} ${r.config.macOS}`);
      for (const x of r.results) {
        const t1 = x.obs1?.timings ?? {}, t2 = x.obs2?.timings ?? {};
        console.log(`  ${x.name.padEnd(12)} obs1 ${keys(t1)} total=${Math.round(t1.totalMs ?? NaN)} nodes=${x.obs1?.nodes} wa=${fr(x.obs1WebAreaFrame)} | obs2 ${keys(t2)} total=${Math.round(t2.totalMs ?? NaN)} nodes=${x.obs2?.nodes} wa=${fr(x.obs2WebAreaFrame)} ${x.exception ? 'EXC ' + x.exception.slice(0, 100) : ''}`);
      }
    }
  }
}
