// #324's timer re-measure reader: per variant (P324_MODE), each logged hold classified by what released it, its real
// freeze against its deadline. Times from the SLS log (patch-log.py): the hold, SLSReenableUpdate's call and return.
//   pointer hold (one holding dlv.post): due by its timer when the deadline, min(events + 200, start + 300), came before
//     the guard's end (dlv.end), the ceiling's when the events went past 100 ms into the hold; else due by the guard
//   activation hold with no delivery (main's 100 ms path, set_value's held activation): due by its timer when start + 100
//     came before the activation guard's end (act.end)
//   node scripts/probe-324/offline/timers.mjs <dir>...
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const q = (a, p) => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : '-'; };
const d3 = a => `${q(a, .5)}/${q(a, .95)}/${q(a, 1)}`;
const by = {};
const add = (mode, kind, v) => { ((by[mode] ??= {})[kind] ??= []).push(v); };
for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) for (const s of r.steps ?? []) {
  const ev = [...s.events].sort((a, b) => a.t - b.t);
  // Pair each hold with the first call and return after it (holds do not overlap within one step here).
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].ev !== 'hold') continue;
    const start = ev[i].t;
    const call = ev.slice(i + 1).find(e => e.ev === 'release.call'), ret = ev.slice(i + 1).find(e => e.ev === 'release');
    if (!call) continue;
    const inside = ev.filter(e => e.t >= start && e.t <= call.t + 400);
    // The hold's pointer events, before the step's next hold (they may go after a ceiling's release: events past 300 ms).
    const next = ev.slice(i + 1).find(e => e.ev === 'hold');
    const post = ev.find(e => e.ev === 'dlv.post' && e.t >= start && (!next || e.t < next.t));
    const late = post && post.t > call.t;
    const rec = s.record.delivery;
    if (post) {
      const end = ev.find(e => e.ev === 'dlv.end' && e.t >= post.t);
      const eventsIn = post.t - start;
      const ceiling = eventsIn + 200 > 300;
      const deadline = Math.min(eventsIn + 200, 300);
      // Due by whichever came first: the timer's deadline or the guard's end (a late timer can fire after the guard).
      const timer = !end || start + deadline < end.t;
      const row = {freezeCall: call.t - start, freezeReturn: ret ? ret.t - start : null, over: call.t - start - deadline, frozenMs: rec?.frozenMs ?? null,
        visible: s.read.raisedAfterByCall ?? s.read.raisedAfter, guardLag: end && !timer ? call.t - end.t : null};
      add(r.mode, late ? 'ceiling (events after the release)' : timer ? (ceiling ? 'ceiling' : 'cap') : 'guard', row);
    } else {
      const actEnd = inside.find(e => e.ev === 'act.end');
      if (!actEnd) continue;
      const timer = start + 100 < actEnd.t;
      add(r.mode, timer ? 'act100-timer' : 'act100-guard', {freezeCall: call.t - start, freezeReturn: ret ? ret.t - start : null, over: call.t - start - 100,
        guardLag: !timer ? call.t - actEnd.t : null});
    }
  }
}
const visible = {};
for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) for (const s of r.steps ?? []) {
  const k = `${r.mode} ${r.block}${JSON.parse(readFileSync(f, 'utf8')).config.delay ? '/delay' : ''}`;
  visible[k] ??= [0, 0]; visible[k][0] += 1; if (s.read.raisedAfterByCall ?? s.read.raisedAfter) visible[k][1] += 1;
}
console.log('variant | release | n | real freeze to the call p50/p95/max | to the return p50/p95/max | overrun past the deadline p50/p95/max | frozenMs - call (max |d|) | guard-ended lag p50/max');
for (const [mode, kinds] of Object.entries(by)) for (const [kind, v] of Object.entries(kinds).sort()) {
  const fd = v.filter(x => x.frozenMs != null).map(x => Math.abs(x.frozenMs - x.freezeCall));
  console.log(`${mode} | ${kind} | ${v.length} | ${d3(v.map(x => x.freezeCall))} | ${d3(v.map(x => x.freezeReturn))} | ${d3(v.map(x => x.over))} | ${q(fd, 1)} | ${q(v.map(x => x.guardLag), .5)}/${q(v.map(x => x.guardLag), 1)}`);
}
console.log('\nvisible raises after the hold (by the call), steps');
for (const [k, [n, v]] of Object.entries(visible).sort()) console.log(`${k}: ${v}/${n}`);
