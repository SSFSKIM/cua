#!/usr/bin/env node
// #384 diagnosis only (branch diag/384-cdp-latency, never merged): reads the timing rows the instrumented service, host,
// extension, cua supervisor and the sampler wrote (diag384.mjs in src/browser-service and src/chrome, diag384-sample.mjs)
// and prints, per lane, where each CDP command's time went. Every printed string is a label (lane, role, case id,
// command name) through public.mjs's label(); the rest are numbers.
//   node scripts/repl-parity/hosted/diag384.mjs <dir>        the public lines
//   node scripts/repl-parity/hosted/diag384.mjs <dir> --json  the joined commands, one JSON line each (local use)
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {label} from './public.mjs';

const P = 'diag384:';
const dir = process.argv[2];
const asJson = process.argv.includes('--json');
const rows = [];
for (const name of readdirSync(dir).filter(n => n.endsWith('.jsonl'))) {
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (!line) continue;
    try { rows.push(JSON.parse(line)); } catch {}
  }
}
const windows = rows.filter(r => r.k === 'win');
// The lanes' windows: [{lane, from, to}], from the start/end marks hosted.sh writes around each api run.
const spans = [];
for (const start of windows.filter(w => w.phase === 'start')) {
  const end = windows.find(w => w.phase === 'end' && w.lane === start.lane && w.suite === start.suite && w.t >= start.t);
  spans.push({lane: start.lane, suite: start.suite, from: start.t, to: end?.t ?? Infinity});
}
const laneAt = t => spans.find(s => t >= s.from && t <= s.to)?.lane ?? 'none';

const svc = new Map();
for (const r of rows.filter(r => r.k === 'svc')) {
  const prev = svc.get(r.key) ?? {};
  svc.set(r.key, {...prev, ...r, ...(prev.expired !== undefined ? {expired: prev.expired} : {})});
}
const supOut = new Map(), supIn = new Map();
for (const r of rows.filter(r => r.k === 'sup')) (r.dir === 'out' ? supOut : supIn).set(`${r.wpid}:${r.id}`, r);

const cmds = [];
for (const c of rows.filter(r => r.k === 'cdp')) {
  const s = svc.get(c.key) ?? {};
  const end = s.sRecv ?? null;
  const so = supOut.get(`${s.pid}:${s.id}`), si = supIn.get(`${s.pid}:${s.id}`);
  const d = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.round((b - a) * 10) / 10 : null);
  cmds.push({
    key: c.key, tabId: c.tabId, awaitPromise: c.awaitPromise, probe: c.probe, end: c.hDone, lane: c.lane ?? s.lane ?? laneAt(c.s0), window: laneAt(c.s0), case: c.case, m: c.m, ok: c.ok, timedOut: c.timedOut === true,
    expired: s.expired !== undefined, late: s.late === true, limit: c.limit, s0: c.s0,
    total: d(c.s0, end ?? c.hDone), svcWait: s.expired !== undefined ? d(c.s0, s.expired) : null,
    // Free of clock skew between processes: each is a difference of one process's own times.
    pipeRound: end != null && typeof c.hRx === 'number' && typeof c.hDone === 'number' ? Math.round((end - c.s0 - (c.hDone - c.hRx)) * 10) / 10 : null,
    hostOwn: typeof c.hOut === 'number' && typeof c.hBack === 'number' ? Math.round(((c.hOut - c.hRx) + (c.hDone - c.hBack)) * 10) / 10 : null,
    extRound: d(c.hOut, c.hBack),
    nmRound: typeof c.hBack === 'number' && typeof c.e1 === 'number' ? Math.round(((c.hBack - c.hOut) - (c.e1 - c.eIn)) * 10) / 10 : null,
    pipeOut: d(c.s0, c.hRx), wToSup: so ? d(c.s0, so.t) : null, supToHost: so ? d(so.t, c.hRx) : null,
    hostDecode: d(c.hRx, c.hDec), hostQueue: d(c.hDec, c.hIn), hostPre: d(c.hIn, c.hOut),
    nmOut: d(c.hOut, c.eIn), extPre: d(c.eIn, c.e0), chrome: d(c.e0, c.e1), nmBack: d(c.e1, c.hBack), hostPost: d(c.hBack, c.hDone),
    pipeBack: d(c.hDone, end), hostToSup: si ? d(c.hDone, si.t) : null, supToW: si ? d(si.t, end) : null,
  });
}
if (asJson) { for (const c of cmds) console.log(JSON.stringify(c)); process.exit(0); }

const pct = (values, p) => {
  const v = values.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return '-';
  return String(Math.round(v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))]));
};
const stats = values => `n ${values.filter(x => typeof x === 'number').length} p50 ${pct(values, 50)} p95 ${pct(values, 95)} p99 ${pct(values, 99)} max ${pct(values, 100)}`;
const SEGMENTS = ['total', 'pipeRound', 'hostOwn', 'extRound', 'nmRound', 'pipeOut', 'wToSup', 'supToHost', 'hostDecode', 'hostQueue', 'hostPre', 'nmOut', 'extPre', 'chrome', 'nmBack', 'hostPost', 'pipeBack', 'hostToSup', 'supToW'];
const lanes = [...new Set(cmds.map(c => c.lane))].sort();

console.log(`${P} rows ${rows.length} commands ${cmds.length} windows ${spans.map(s => `${label(s.lane)}/${label(s.suite)} ${Math.round((s.to - s.from) / 1000)}s`).join(', ')}`);
for (const lane of lanes) {
  const mine = cmds.filter(c => c.lane === lane);
  console.log(`${P} lane ${label(lane)}: commands ${mine.length}, outside its window ${mine.filter(c => c.window !== lane).length}, timed out at the host ${mine.filter(c => c.timedOut).length}, expired at the service ${mine.filter(c => c.expired).length}, over 1s ${mine.filter(c => (c.total ?? 0) > 1000).length}, over 3s ${mine.filter(c => (c.total ?? 0) > 3000).length}`);
  for (const seg of SEGMENTS) console.log(`${P}   ${label(lane)} segment ${seg}: ${stats(mine.map(c => c[seg]))}`);
  const byMethod = new Map();
  for (const c of mine) byMethod.set(c.m, [...(byMethod.get(c.m) ?? []), c]);
  const methods = [...byMethod.keys()].sort((a, b) => byMethod.get(b).length - byMethod.get(a).length).slice(0, 12);
  for (const m of methods) {
    const list = byMethod.get(m);
    const q = seg => `${seg} p50 ${pct(list.map(c => c[seg]), 50)} p95 ${pct(list.map(c => c[seg]), 95)}`;
    console.log(`${P}   ${label(lane)} method ${label(m)}: total ${stats(list.map(c => c.total))}; ${['pipeRound', 'hostOwn', 'nmRound', 'chrome'].map(q).join('; ')}; chrome max ${pct(list.map(c => c.chrome), 100)}`);
  }
}
// The cell each command ran in, from the harness's cell rows (scripts/repl-parity.mjs diagCell: end time and ms).
const cells = rows.filter(r => r.k === 'cell' && r.cell != null && typeof r.ms === 'number').map(r => ({...r, from: r.t - r.ms}));
const cellAt = (lane, t) => cells.find(r => r.lane === lane && t >= r.from && t <= r.t);
const lateOf = new Map(rows.filter(r => r.k === 'cdpLate').map(r => [r.key, r]));
for (const c of cmds) {
  const cell = cellAt(c.lane, c.s0);
  c.cellCase = cell?.case; c.cellLabel = cell?.cell;
  const late = lateOf.get(c.key);
  if (late) c.lateAfter = Math.round(late.hBack - late.hOut), c.lateChrome = typeof late.e1 === 'number' ? Math.round(late.e1 - late.e0) : null;
}
// The agent command each CDP command served: the lane's service rpc in flight at its start (the latest begun).
const rpcRows = rows.filter(r => r.k === 'rpc');
for (const c of cmds) c.rpc = rpcRows.filter(r => r.lane === c.lane && r.t0 <= c.s0 && r.t1 >= c.s0).sort((a, b) => b.t0 - a.t0)[0]?.type;
// The slow commands, each with every segment.
// Commands answered in the lane while `c` waited: on its own tab, or on others.
const others = (c, same) => cmds.filter(o => o !== c && o.lane === c.lane && o.ok && o.s0 > c.s0 && typeof o.end === 'number' && o.end < c.s0 + (c.total ?? 0)
  && (same ? o.tabId === c.tabId : o.tabId !== c.tabId)).length;
const word = v => (v === null || v === undefined ? '-' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : label(v));
const probeText = p => (!p ? '' : p.failed ? ` probe at ${p.at} failed` : ` probe at ${p.at} took ${p.took} tab active ${word(p.tab?.active)} status ${word(p.tab?.status)} frozen ${word(p.tab?.frozen)} discarded ${word(p.tab?.discarded)}`
  + ` window focused ${word(p.window?.focused)} state ${word(p.window?.state)} target attached ${word(p.target?.attached)} eval1 ${word(p.evalMs)} ${word(p.evalOk)} navHistory ${word(p.navHistoryMs)} ${word(p.navHistoryOk)}`);
const slow = cmds.filter(c => (c.total ?? 0) > 1000 || c.expired || c.timedOut).sort((a, b) => a.s0 - b.s0);
console.log(`${P} slow commands (over 1s, expired or timed out): ${slow.length}`);
const t0 = Math.min(...spans.map(s => s.from).filter(Number.isFinite), ...cmds.map(c => c.s0));
for (const c of slow.slice(0, 80)) {
  console.log(`${P}   +${Math.round((c.s0 - t0) / 1000)}s ${label(c.lane)} ${label(c.cellCase)} ${label(c.cellLabel)} rpc ${label(c.rpc)} ${label(c.m)} ok ${c.ok} timedOut ${c.timedOut} expired ${c.expired} limit ${c.limit}`
    + `${c.lateAfter !== undefined ? ` lateAnswer ${c.lateAfter} lateChrome ${c.lateChrome}` : ' noLateAnswer'}${c.awaitPromise !== undefined ? ` awaitPromise ${c.awaitPromise}` : ''}`
    + ` | meanwhile same tab ${others(c, true)} other tabs ${others(c, false)}${probeText(c.probe)} | `
    + SEGMENTS.filter(s => c[s] !== null && c[s] !== undefined).map(s => `${s} ${Math.round(c[s])}`).join(' '));
}
// Slow commands by lane and case.
const byCase = new Map();
for (const c of slow) { const k = `${c.lane} ${c.cellCase}`; byCase.set(k, (byCase.get(k) ?? 0) + 1); }
for (const [k, n] of [...byCase.entries()].sort()) { const [lane, kase] = k.split(' '); console.log(`${P} slow by case ${label(lane)} ${label(kase)}: ${n}`); }
// Every cell of the lanes that took over 3 s, with its case, for the side-by-side.
for (const r of cells.filter(r => r.ms > 3000).sort((a, b) => a.case < b.case ? -1 : a.case > b.case ? 1 : a.lane < b.lane ? -1 : 1))
  console.log(`${P} slow cell ${label(r.lane)} ${label(r.case)} ${label(r.cell)} ms ${Math.round(r.ms)} ok ${r.ok}`);
// Event-loop delay by process, per lane window.
const lag = rows.filter(r => r.k === 'lag');
for (const span of spans) {
  for (const p of [...new Set(lag.map(r => r.p))].sort()) {
    const mine = lag.filter(r => r.p === p && r.t >= span.from && r.t <= span.to && (p !== 'svc' || r.lane === span.lane));
    if (!mine.length) continue;
    const maxes = mine.map(r => r.max);
    console.log(`${P} lag ${label(span.lane)}/${label(span.suite)} ${label(p)}: seconds ${mine.length} p50 ${pct(maxes, 50)} p95 ${pct(maxes, 95)} max ${pct(maxes, 100)} over250 ${maxes.filter(x => x > 250).length} over1000 ${maxes.filter(x => x > 1000).length}`
      + (mine[0].inN !== undefined ? ` inMB ${(mine.reduce((a, r) => a + r.inB, 0) / 1e6).toFixed(1)} outMB ${(mine.reduce((a, r) => a + r.outB, 0) / 1e6).toFixed(1)} inFrames ${mine.reduce((a, r) => a + r.inN, 0)} outFrames ${mine.reduce((a, r) => a + r.outN, 0)}` : ''));
  }
}
// The machine, per lane window.
const ps = rows.filter(r => r.k === 'ps');
for (const span of spans) {
  const mine = ps.filter(r => r.t >= span.from && r.t <= span.to);
  if (!mine.length) continue;
  const mean = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : '-');
  const max = xs => (xs.length ? Math.round(Math.max(...xs)) : '-');
  const roles = [...new Set(mine.flatMap(r => Object.keys(r.roles)))].sort();
  console.log(`${P} machine ${label(span.lane)}/${label(span.suite)}: samples ${mine.length} load1 mean ${mean(mine.map(r => r.load1))} max ${max(mine.map(r => r.load1))} swapUsedMB max ${max(mine.map(r => r.swapUsedMB ?? 0))} compressedPages max ${max(mine.map(r => r.compressedPages))} freePages min ${Math.min(...mine.map(r => r.freePages))} swapins +${mine.at(-1).swapins - mine[0].swapins} pageins +${mine.at(-1).pageins - mine[0].pageins}`);
  for (const role of roles) {
    const cpu = mine.map(r => r.roles[role]?.cpu ?? 0), rss = mine.map(r => r.roles[role]?.rssMB ?? 0), n = mine.map(r => r.roles[role]?.n ?? 0);
    console.log(`${P}   ${label(span.lane)}/${label(span.suite)} role ${label(role)}: cpu mean ${mean(cpu)} max ${max(cpu)} rssMB max ${max(rss)} processes max ${max(n)} busiest max ${max(mine.map(r => r.roles[role]?.top ?? 0))}`);
  }
}
// Around each of the 12 worst commands: the delay each process saw and what the machine was doing.
for (const c of [...slow].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 12)) {
  const end = c.s0 + (c.total ?? 0);
  const during = p => { const m = lag.filter(r => r.p === p && r.t >= c.s0 && r.t <= end + 1000).map(r => r.max); return m.length ? Math.round(Math.max(...m)) : '-'; };
  const near = ps.filter(r => r.t >= c.s0 - 2000 && r.t <= end + 2000);
  const top = near.length ? Object.entries(near.reduce((acc, r) => { for (const [k, v] of Object.entries(r.roles)) acc[k] = Math.max(acc[k] ?? 0, v.cpu); return acc; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${label(k)} ${Math.round(v)}`).join(' ') : '-';
  console.log(`${P} around ${label(c.lane)} ${label(c.case)} ${label(c.m)} total ${Math.round(c.total ?? 0)}: lag svc ${during('svc')} host ${during('host')} ext ${during('ext')} sup ${during('sup')}; cpu ${top}; renderers ${near.length ? Math.max(...near.map(r => r.roles['chrome-renderer']?.n ?? 0)) : '-'} busiest renderer ${near.length ? Math.round(Math.max(...near.map(r => r.roles['chrome-renderer']?.top ?? 0))) : '-'}; cell ${label(c.cellCase)} ${label(c.cellLabel)}`);
}
// The service's agent commands.
const rpc = rows.filter(r => r.k === 'rpc');
for (const lane of [...new Set(rpc.map(r => r.lane))].sort()) {
  const mine = rpc.filter(r => r.lane === lane);
  const byType = new Map();
  for (const r of mine) byType.set(r.type, [...(byType.get(r.type) ?? []), r.t1 - r.t0]);
  const worst = [...byType.entries()].sort((a, b) => Number(pct(b[1], 95)) - Number(pct(a[1], 95))).slice(0, 15);
  console.log(`${P} rpc ${label(lane)}: commands ${mine.length}, over 3s ${mine.filter(r => r.t1 - r.t0 > 3000).length}`);
  for (const [type, ms] of worst) console.log(`${P}   rpc ${label(lane)} ${label(type)}: ${stats(ms)}`);
}
