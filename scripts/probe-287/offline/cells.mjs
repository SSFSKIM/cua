// #287 offline: one line per kit cell, per browser and repetition, from a run's downloaded artifacts
// (~/.local/share/probe-287/run-<id>/probe-287-<group>-rep<n>/<browser>/<kit>/results.json).
//   node scripts/probe-287/offline/cells.mjs <run dir> <kit: 282|283|288p|288live|294|296-chrome|296-final|296|305|304|electron|recon>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const [dir, kit] = process.argv.slice(2);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
const meta = c => c?.error ? c.error.meta ?? c.error.data?.meta : c?.result?.meta ?? c?.meta;
const answer = c => !c ? '-' : c.error ? `ERR ${c.error.errorName ?? c.error.data?.errorName ?? c.error.data?.name ?? c.error.code}` : 'ok';
const ec = m => m?.elementClick ? [m.elementClick.reason, m.elementClick.pressedRole, m.elementClick.pressed, m.elementClick.caret, m.elementClick.walkStopped].filter(Boolean).join('/') : '';

const LINES = {
  '282': r => {
    if (r.timeline) return `AXPress@${r.axPressAfterObservationMs}ms obs=${JSON.stringify(r.observation)}`;
    if (r.buttonTimeline) { const t = r.buttonTimeline.timeline ?? []; const f = t.find(e => e.button); return `button AXPress@${f?.t ?? '-'} hitIsButton=${r.buttonTimeline.hitIsButton}`; }
    if (r.geometry) return `frameEqual=${r.geometry.frameEqual} apEqual=${r.geometry.activationPointEqual} ap=${JSON.stringify(r.geometry.before?.activationPoint)} frame=${JSON.stringify(r.geometry.before?.frame)} actions=${JSON.stringify(r.actions?.afterActivation2s)}`;
    if (!r.click) return `PROBLEM ${JSON.stringify(r.problem ?? r.exception ?? '').slice(0, 200)}`;
    const m = meta(r.click);
    const d = r.delta ?? {};
    return `${answer(r.click)} ${r.clickMs}ms +${r.clickAfterObservationMs ?? '-'} route=${m?.inputRoute} ec=${ec(m)} act=${JSON.stringify(m?.activationClickKind ?? null)} ptr=${d.pointerdown}/${d.mousedown}/${d.mouseup}/${d.click} focus=${d.textFocus} opt=${d.optionChange} apply=${d.applyClick} loads=${d.loads} front=${r.frontAfter} active=${r.after?.active} obs=${r.observation?.enablementWrite ?? '-'}/${r.observation?.enablementWriteError ?? '-'}`;
  },
  '283': r => {
    if (!r.verdict) return `PROBLEM ${JSON.stringify(r.problem ?? r.exception ?? '').slice(0, 200)}`;
    const v = r.verdict;
    return `+${r.clickAfterObservationMs} ${v.answer} ${r.clickMs}ms reason=${v.reason} caret=${v.caretClaim} stop=${v.walkStopped ?? '-'} | active=${r.afterClick?.active} pageCaret=${JSON.stringify(v.pageCaret)} exp=${r.expected?.offset} typed=${JSON.stringify(v.typedAt)} ptr=${r.pointerTotal} front=${r.frontAfterClick} ${v.problems.length ? 'PROBLEMS ' + JSON.stringify(v.problems) : 'ok'}`;
  },
  '288p': r => {
    const f = w => w && `basic@${w.firstCheckboxHit} press@${w.firstPress} boxes@${w.firstBoxes} steps=${JSON.stringify((w.steps ?? []).map(s => [s.do, s.at, typeof s.result === 'object' ? '…' : s.result]))} eui ${JSON.stringify(w.before?.eui)}->${JSON.stringify(w.after?.eui)} manual ${JSON.stringify(w.before?.manual)}->${JSON.stringify(w.after?.manual)} listsManual=${w.before?.listsManual} listsEUI=${w.before?.listsEUI}`;
    if (r.result) return f(r.result);
    if (r.geom) return JSON.stringify(r.geom.phases?.map(p => [p.label, p.app?.eui, p.app?.manual, ...['move', 'resize'].map(k => p[k] && `${p[k].distinctFrames}f/${p[k].settledMs}ms`)]));
    if (r.click) { const m = meta(r.click); return `${answer(r.click)} ${r.clickMs}ms route=${m?.inputRoute} ec=${ec(m)} delta=${JSON.stringify(r.delta ?? r.clickDelta)}`; }
    return JSON.stringify(pick(r, ['problem', 'exception'])).slice(0, 300);
  },
  '288live': r => {
    if (r.exception || r.problem) return `PROBLEM ${r.problem ?? ''} ${(r.exception ?? '').slice(0, 200)}`;
    const o = r.observation ? `obs=${r.observation.enablementWrite}/${r.observation.enablementWriteError}` : '';
    if (r.watchAfter) return `${o} end=${JSON.stringify(r.endTask?.result ?? r.endTask ?? r.engineExit)} pressLost@${r.releasedPressLostMs} euiFalse@${r.releasedEuiFalseMs} boxesLost@${r.boxesLostMs} final=${JSON.stringify(r.final)}`;
    if (r.watch && r.observedAt) return `${o} press@${r.pressFirstMs} released@${r.releasedMs} afterReobs=${r.releasedAfterReobsMs} eui@release=${r.euiAtRelease} final=${JSON.stringify(r.final)}`;
    const m = r.click?.meta ?? r.click?.error?.meta;
    return `${o} released@${r.releasedMs ?? '-'} click ${r.click?.error ? 'ERR ' + (r.click.error.errorName ?? r.click.error.data?.errorName ?? r.click.error.code) : 'ok'} ${r.clickMs}ms route=${m?.inputRoute} ec=${ec(m)} est=${JSON.stringify(m?.pointerEstablish ?? null)} delta=${JSON.stringify(r.clickDelta)} loads+${r.loadsDelta}`;
  },
  '294': r => r.layout ? `layout ${JSON.stringify((r.layout ?? []).filter((e, i, a) => i === 0 || JSON.stringify(e.controls) !== JSON.stringify(a[i - 1].controls)).map(e => [e.at, e.controls?.find(c => /reload/i.test(c))]))}` : JSON.stringify(Object.keys(r)),
  '296': r => {
    if (r.exception || r.problem) return `PROBLEM ${r.problem ?? ''} ${(r.exception ?? '').slice(0, 160)}`;
    const sp = r.stalePoint;
    return `${sp ? `${sp.verdict}/${sp.reason}${sp.recordedHitBy ? '(' + sp.recordedHitBy + ')' : ''}` : 'noStale'} ${r.errorName ?? 'ok'} route=${r.route} el=${r.elementClick?.reason ?? '-'} intended=${r.intended} effect=${JSON.stringify(r.effect?.hit)} expect=${r.spec?.expect ?? '-'} click@${r.clickAfterObservationMs}(launch+${r.clickSinceLaunchMs}) ${r.clickMs}ms`;
  },
};

function* artifacts() {
  for (const a of readdirSync(dir).filter(n => n.startsWith('probe-287-')).sort()) yield [a, join(dir, a)];
}
for (const [a, adir] of artifacts()) {
  for (const browser of readdirSync(adir).filter(n => existsSync(join(adir, n, kit)))) {
    const f = join(adir, browser, kit, 'results.json');
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    console.log(`### ${a} ${browser} ${kit} ${res.config?.browserVersion ?? res.config?.chrome ?? ''}`);
    const cells = res.cells ?? res.results ?? [];
    const fn = LINES[kit.replace(/-(chrome|final)$/, '')] ?? (r => JSON.stringify(r).slice(0, 300));
    for (const r of cells) console.log(`  ${r.label ?? r.spot}: ${fn(r)}`);
  }
}
