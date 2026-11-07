// #287 offline: #305's sweep and #304's coverage per browser and repetition, from a run's downloaded artifacts.
//   node scripts/probe-287/offline/sweep.mjs <run dir> <305|304>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const [dir, kit] = process.argv.slice(2);
for (const a of readdirSync(dir).filter(n => n.startsWith('probe-287-')).sort()) {
  for (const browser of readdirSync(join(dir, a))) {
    const f = join(dir, a, browser, kit, 'results.json');
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    console.log(`### ${a} ${browser} ${res.config?.browserVersion ?? ''} ${res.config?.exception ? 'EXCEPTION ' + res.config.exception.slice(0, 200) : ''}`);
    if (kit === '305') {
      for (const r of res.results) {
        const posted = r.clicks.filter(c => !c.skipped && !c.exception);
        const refused = posted.filter(c => c.refused);
        const errs = {};
        for (const c of posted) if (!c.refused && c.result?.error) errs[c.result.error] = (errs[c.result.error] ?? 0) + 1;
        const verdicts = {};
        for (const c of posted) { const k = c.stalePoint ? `${c.stalePoint.verdict}/${c.stalePoint.reason}` : 'none'; verdicts[k] = (verdicts[k] ?? 0) + 1; }
        console.log(`  ${r.part} ${r.spot} ${r.engine}: picked ${r.picked?.length ?? '-'} posted ${posted.length} refused ${refused.length} skipped ${r.clicks.filter(c => c.skipped).length} exc ${r.clicks.filter(c => c.exception).length} errors ${JSON.stringify(errs)} verdicts ${JSON.stringify(verdicts)} ${r.exception ? 'EXCEPTION ' + r.exception.slice(0, 160) : ''}`);
        for (const c of refused) console.log(`     REFUSED ${c.bucket}:${c.role} "${c.title}" ${c.where}${c.edge ? '(' + c.edge + ')' : ''} ${c.stalePoint?.reason} rec=${c.stalePoint?.recordedRole} hit=${c.stalePoint?.hitRole}`);
        for (const c of r.clicks.filter(c => c.landedOn)) console.log(`     popover ${c.variant}: ${c.refused ? 'REFUSED' : c.result?.ok ? 'kept' : c.result?.error} ${c.stalePoint?.verdict}/${c.stalePoint?.reason} landed=${JSON.stringify(c.landedOn)}`);
      }
    } else {
      for (const r of res.results) {
        if (r.skipped) { console.log(`  ${r.label}: skipped ${r.skipped}`); continue; }
        if (r.exception) { console.log(`  ${r.label}: EXCEPTION ${r.exception.slice(0, 160)}`); continue; }
        const s = (r.slots ?? []).filter(x => x.obs);
        const pct = x => x.obs.guard ? (100 * x.obs.guard.checked / x.obs.guard.n).toFixed(1) : '-';
        console.log(`  ${r.label}: checked% ${s.map(pct).join('/')} nodes ${s.map(x => x.obs.nodes).join('/')} walk ${s.map(x => Math.round(x.obs.walkMs)).join('/')}ms stops ${JSON.stringify(s.map(x => x.obs.stops))} grid ${r.grid?.points} scroll ${JSON.stringify(r.pageInfo?.scroll?.after ?? r.pageInfo?.scrollTop ?? null)}${r.pageInfo?.scrollMissed ? ' MISSED' : ''} errors ${(r.slots ?? []).filter(x => x.error).length}`);
      }
    }
  }
}
