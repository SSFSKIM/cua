// measure.mjs summary (the own native engine spec, M0 "Promote or discard"; Concrete Steps "M0 spike on the mini"):
// pools <dir>/vendor/run-*/ and <dir>/cua/run-*/ and writes <dir>/summary.md with the promote/discard table against
// the vendor lane of the same sitting, the per-scene tree costs, the engine's fetch routes, valueMarkdown's cost, the
// settle notification rate at rest, probe (c), and every row that did not run with its reason. Medians are of the
// successful samples' in-cell times (performance.now() inside the kernel), as the baseline's are.
import * as fs from 'node:fs';
import {join} from 'node:path';
import {LANES, SCENE_ORDER} from './lane.mjs';

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function readLane(dir, lane) {
  const root = join(dir, lane);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(name => /^run-\d+$/.test(name)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))).map(name => {
    const read = file => { try { return fs.readFileSync(join(root, name, file), 'utf8'); } catch { return null; } };
    const rows = (read('results.jsonl') ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line));
    return {name, meta: JSON.parse(read('meta.json') ?? 'null'), rows};
  });
}

const rowsOf = (runs, op, scene) => runs.flatMap(run => run.rows).filter(r => r.op === op && (scene === undefined || r.scene === scene));
const okRows = (runs, op, scene) => rowsOf(runs, op, scene).filter(r => r.ok && !r.invalid && !r.notRun);
const med = (rows, get) => median(rows.map(get));
const fmt = value => (value === null || value === undefined ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1));

// One promote row: the cua median at or below the vendor's.
function speedRow(label, vendor, cua) {
  const v = med(vendor, r => r.inCellMs), c = med(cua, r => r.inCellMs);
  const verdict = v === null || c === null ? 'NO VERDICT (no samples)' : c <= v ? 'at or below' : 'above';
  return {label, vendor: v, cua: c, n: [vendor.length, cua.length], verdict};
}

// Input to TextEdit and Finder through route 1, 2 or 3 with the front application and top window unchanged.
function inputRow(label, runs, action) {
  const rows = ['textedit', 'finder'].flatMap(scene => [...rowsOf(runs, `probe.a.${action}`, scene), ...rowsOf(runs, `probe.b.${action}`, scene)]);
  if (!rows.length) return {label, verdict: 'NO VERDICT (no rows)'};
  if (rows.some(r => r.notRun)) return {label, verdict: `not run: ${rows.find(r => r.notRun).notRun}`};
  const a = rows.filter(r => r.op.startsWith('probe.a.')), b = rows.filter(r => r.op.startsWith('probe.b.'));
  const pass = a.every(r => r.ok && r.frontmostUnchanged && r.topWindowUnchanged) && b.every(r => [1, 2, 3].includes(r.route));
  return {label, verdict: pass ? 'carried, front unchanged' : 'failed', routes: [...new Set(b.map(r => r.route))]};
}

export function summarize(dir) {
  const lanes = Object.fromEntries(LANES.map(lane => [lane, readLane(dir, lane)]));
  const {vendor, cua} = lanes;
  const speed = [
    speedRow('getAXState, TextEdit (tree + render), in-cell', okRows(vendor, 'warm.getAXState', 'textedit'), okRows(cua, 'warm.getAXState', 'textedit')),
    speedRow('getScreenshot, TextEdit, in-cell', okRows(vendor, 'warm.getScreenshot', 'textedit'), okRows(cua, 'warm.getScreenshot', 'textedit')),
  ];
  const input = [inputRow('click to TextEdit and Finder', cua, 'click'), inputRow('pressKey to TextEdit and Finder', cua, 'key')];
  const listApps = speedRow('listApps, in-cell (not judged)', okRows(vendor, 'warm.listApps'), okRows(cua, 'warm.listApps'));
  let verdict;
  if (speed.some(r => r.verdict === 'above')) verdict = 'DISCARD FORK: a speed row is above the vendor\'s (three tuning iterations, then the owner\'s call)';
  else if (speed.some(r => r.verdict.startsWith('NO VERDICT'))) verdict = 'NO VERDICT: a speed row has no samples on one lane';
  else if (input.every(r => r.verdict === 'carried, front unchanged')) verdict = 'PROMOTE';
  else if (input.some(r => r.verdict.startsWith('not run') || r.verdict.startsWith('NO VERDICT'))) verdict = 'NO VERDICT: speed at or below the vendor\'s; the input rows did not run';
  else verdict = 'ROUTE 4 FORK: speed at or below the vendor\'s, but no route carried background input to a family (the owner\'s call per family)';

  const scenes = SCENE_ORDER.map(scene => {
    const tree = lane => okRows(lanes[lane], 'tree.getAXState', scene);
    const v = tree('vendor'), c = tree('cua');
    const timing = key => med(c, r => r.engine?.timings?.[key]);
    const shot = lane => okRows(lanes[lane], 'warm.getScreenshot', scene);
    return {scene, vendorMs: med(v, r => r.inCellMs), cuaMs: med(c, r => r.inCellMs), vendorShotMs: med(shot('vendor'), r => r.inCellMs), cuaShotMs: med(shot('cua'), r => r.inCellMs), vendorElements: med(v, r => r.elements), cuaElements: med(c, r => r.elements),
      vendorTextBytes: med(v, r => r.textBytes), cuaTextBytes: med(c, r => r.textBytes), skyshotBytes: med(c, r => r.engine?.skyshotBytes), nodes: med(c, r => r.engine?.nodes),
      engineTotalMs: timing('totalMs'), walkMs: timing('walkMs'), screenshotMs: med(c, r => ['screenshotContentMs', 'screenshotCaptureMs', 'screenshotEncodeMs', 'screenshotWriteMs', 'screenshotWindowListMs', 'screenshotWindowNumberMs'].reduce((t, k) => t + (r.engine?.timings?.[k] ?? 0), 0) || null),
      enabled: c.map(r => r.engine?.timings?.enabled).find(Boolean) ?? null, webAreaFound: c.map(r => r.engine?.timings?.webAreaFound).find(x => x !== undefined) ?? null};
  }).filter(s => [s.vendorMs, s.cuaMs, s.vendorShotMs, s.cuaShotMs].some(v => v !== null));

  const forwardedRows = op => okRows(cua, op).filter(r => r.forwarded);
  // A switch's series that did not run: the runs whose preflight found it unforwarded or undetermined, and the samples
  // whose own timings disagreed with it.
  const switchNotRun = name => rowsOf(cua, `switch.${name}`).filter(r => r.notRun).length;
  const disagreed = (op, scene) => rowsOf(cua, op, scene).filter(r => r.ok && !r.forwarded).length;
  const routes = SCENE_ORDER.map(scene => {
    const of = route => forwardedRows(`probe.c'.route.${route}`).filter(r => r.scene === scene);
    const p = of('public'), h = of('hierarchy');
    return {scene, publicMs: med(p, r => r.observeMs), hierarchyMs: med(h, r => r.observeMs), publicWalkMs: med(p, r => r.timings?.walkMs), hierarchyWalkMs: med(h, r => r.timings?.walkMs),
      publicNodes: med(p, r => r.nodes), hierarchyNodes: med(h, r => r.nodes), n: [p.length, h.length], dropped: disagreed("probe.c'.route.public", scene) + disagreed("probe.c'.route.hierarchy", scene)};
  }).filter(r => r.n[0] + r.n[1] + r.dropped > 0);
  // The on/off switches: the observation's in-cell time either way and the engine's own cost of the switched phase.
  const COSTS = {valueMarkdown: t => t?.markdownMs, focusableSelectable: t => (t?.focusableMs ?? 0) + (t?.selectableMs ?? 0) || null, webAreaWait: t => t?.webAreaWaitMs};
  const switches = Object.entries(COSTS).flatMap(([name, cost]) => SCENE_ORDER.map(scene => {
    const on = forwardedRows(`${name}.on`).filter(r => r.scene === scene), off = forwardedRows(`${name}.off`).filter(r => r.scene === scene);
    return {name, scene, onMs: med(on, r => r.observeMs), offMs: med(off, r => r.observeMs), phaseMs: med(on, r => cost(r.timings)), n: [on.length, off.length], dropped: disagreed(`${name}.on`, scene) + disagreed(`${name}.off`, scene)};
  }).filter(r => r.n[0] + r.n[1] + r.dropped > 0));
  const settle = SCENE_ORDER.map(scene => {
    const rows = forwardedRows('probe.c\'.settle.rest').filter(r => r.scene === scene);
    const rate = rows.map(r => (r.timings?.settleMs > 0 ? (r.timings.settleNotifications ?? 0) / (r.timings.settleMs / 1000) : null));
    return {scene, notifications: med(rows, r => r.timings?.settleNotifications), settleMs: med(rows, r => r.timings?.settleMs), perSecond: median(rate), capped: rows.filter(r => r.timings?.settle === 'capped').length, n: rows.length,
      dropped: disagreed('probe.c\'.settle.rest', scene)};
  }).filter(r => r.n + r.dropped > 0);
  // Rendering equivalence of the read sets: per scene, over the samples whose read sets the engine applied, equal when
  // any sample at rest was equal (drift is not a difference), different only when every one differed.
  const equivalence = SCENE_ORDER.map(scene => {
    const all = rowsOf(cua, 'equivalence.readSet', scene), rows = all.filter(r => r.ok && r.applied);
    const verdict = !rows.length ? 'NO VERDICT' : rows.some(r => r.equal) ? 'equal' : 'different';
    return {scene, verdict, n: rows.length, notApplied: all.filter(r => r.ok && !r.applied).length, failed: all.filter(r => !r.ok && !r.notRun).length,
      fullMs: med(rows, r => r.fullMs), reducedMs: med(rows, r => r.reducedMs), differingLines: rows.every(r => r.equal) ? 0 : median(rows.filter(r => !r.equal).map(r => r.differingLines))};
  }).filter(r => r.n + r.notApplied + r.failed > 0);
  const preflight = Object.fromEntries(['prefetch', 'valueMarkdown', 'focusableSelectable', 'webAreaWait', 'settle', 'readSet'].map(name => [name, {
    forwarded: rowsOf(cua, 'preflight.switch').filter(r => r.switch === name && r.forwarded === true).length, notRun: switchNotRun(name)}]));
  const probeC = ['probe.c.plainOpen', 'probe.c.twoCopies'].map(op => ({op, rows: rowsOf(cua, op)})).filter(p => p.rows.length);

  // Not-run rows, one line per (lane, op, scene, source, reason), with the runs that recorded it.
  const notRun = new Map();
  for (const [lane, runs] of Object.entries(lanes)) for (const run of runs) for (const r of run.rows.filter(r => r.notRun)) {
    const key = [lane, r.op, r.scene ?? '', r.source ?? '', r.notRun].join('\u0000');
    const entry = notRun.get(key) ?? {lane, op: r.op, scene: r.scene ?? null, source: r.source ?? null, reason: r.notRun, runs: 0};
    entry.runs++; notRun.set(key, entry);
  }
  const problems = Object.entries(lanes).flatMap(([lane, runs]) => [
    ...(runs.length ? [] : [`${lane}: no runs under ${join(dir, lane)}`]),
    ...runs.filter(run => !run.meta?.complete).map(run => `${lane}/${run.name}: incomplete (${run.meta?.stopped ?? run.meta?.error ?? run.meta?.problems?.join('; ') ?? 'no meta.json'})`),
  ]);
  return {verdict, speed, input, listApps, scenes, routes, switches, settle, equivalence, preflight, probeC, notRun: [...notRun.values()], problems,
    runs: Object.fromEntries(Object.entries(lanes).map(([lane, runs]) => [lane, runs.length]))};
}

export function renderSummary(s) {
  const lines = ['# Own native engine spike: promote or discard', '',
    `Runs: vendor ${s.runs.vendor}, cua ${s.runs.cua}. In-cell medians in ms over the successful samples of every run of a lane.`, '',
    `**Verdict: ${s.verdict}**`, '',
    '| Promote row | vendor | cua | samples (v/c) | cua against vendor |', '|---|---|---|---|---|',
    ...s.speed.map(r => `| ${r.label} | ${fmt(r.vendor)} | ${fmt(r.cua)} | ${r.n.join('/')} | ${r.verdict} |`),
    ...s.input.map(r => `| ${r.label} | — | ${r.routes ? `routes ${r.routes.join(', ')}` : '—'} | — | ${r.verdict} |`),
    `| ${s.listApps.label} | ${fmt(s.listApps.vendor)} | ${fmt(s.listApps.cua)} | ${s.listApps.n.join('/')} | ${s.listApps.verdict} |`, '',
    'Approvals: the cua lane answers a repeat approval for the same app inside the spike service (one elicitation per connection and app), not through a supervisor hop as M1a\'s approval memory will, while the vendor lane\'s per-call policy round trip is the vendor\'s own; both lanes\' in-cell times carry what their service does per call.', '',
    '## Tree cost per scene', '',
    '| scene | getAXState vendor ms | getAXState cua ms | getScreenshot vendor ms | getScreenshot cua ms | elements v/c | text bytes v/c | Skyshot bytes | nodes | engine total ms | walk ms | capture ms | enabled | web area |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...s.scenes.map(r => `| ${r.scene} | ${fmt(r.vendorMs)} | ${fmt(r.cuaMs)} | ${fmt(r.vendorShotMs)} | ${fmt(r.cuaShotMs)} | ${fmt(r.vendorElements)}/${fmt(r.cuaElements)} | ${fmt(r.vendorTextBytes)}/${fmt(r.cuaTextBytes)} | ${fmt(r.skyshotBytes)} | ${fmt(r.nodes)} | ${fmt(r.engineTotalMs)} | ${fmt(r.walkMs)} | ${fmt(r.screenshotMs)} | ${r.enabled ?? '—'} | ${r.webAreaFound ?? '—'} |`)];
  const runsNotRun = name => (s.preflight[name].notRun ? ` The ${name} switch did not run in ${s.preflight[name].notRun} run(s) (see Not run).` : '');
  const anyCua = s.runs.cua > 0;
  if (anyCua) lines.push('', '## Probe (c′): fetch routes (cua lane, alternated per sample)', '', `Preflight forwarded in ${s.preflight.prefetch.forwarded} run(s).${runsNotRun('prefetch')}`, '',
    '| scene | public ms | hierarchy ms | walk ms public/hierarchy | nodes public/hierarchy | samples | switch dropped |', '|---|---|---|---|---|---|---|',
    ...s.routes.map(r => `| ${r.scene} | ${fmt(r.publicMs)} | ${fmt(r.hierarchyMs)} | ${fmt(r.publicWalkMs)}/${fmt(r.hierarchyWalkMs)} | ${fmt(r.publicNodes)}/${fmt(r.hierarchyNodes)} | ${r.n.join('/')} | ${r.dropped} |`));
  if (anyCua) lines.push('', '## Switch costs (cua lane, on and off alternated per sample)', '',
    ...['valueMarkdown', 'focusableSelectable', 'webAreaWait'].map(name => `- ${name}: preflight forwarded in ${s.preflight[name].forwarded} run(s).${runsNotRun(name)}`), '',
    '| switch | scene | on ms | off ms | engine phase ms | samples on/off | switch dropped |', '|---|---|---|---|---|---|---|',
    ...s.switches.map(r => `| ${r.name} | ${r.scene} | ${fmt(r.onMs)} | ${fmt(r.offMs)} | ${fmt(r.phaseMs)} | ${r.n.join('/')} | ${r.dropped} |`));
  if (anyCua) lines.push('', '## Probe (c′): settle notifications at rest (cua lane)', '', `Preflight forwarded in ${s.preflight.settle.forwarded} run(s).${runsNotRun('settle')}`, '',
    '| scene | notifications | settle ms | per second | capped | samples | switch dropped |', '|---|---|---|---|---|---|---|',
    ...s.settle.map(r => `| ${r.scene} | ${fmt(r.notifications)} | ${fmt(r.settleMs)} | ${fmt(r.perSecond)} | ${r.capped} | ${r.n} | ${r.dropped} |`));
  if (anyCua) lines.push('', '## Rendering equivalence: reduced read set against full (cua lane)', '',
    `Preflight forwarded in ${s.preflight.readSet.forwarded} run(s).${runsNotRun('readSet')} A scene is equal when any sample at rest rendered the same text from both read sets, different only when every sample differed.`, '',
    '| scene | verdict | samples | full ms | reduced ms | saving ms | differing lines (median of mismatches) | not applied | failed |', '|---|---|---|---|---|---|---|---|---|',
    ...s.equivalence.map(r => `| ${r.scene} | ${r.verdict} | ${r.n} | ${fmt(r.fullMs)} | ${fmt(r.reducedMs)} | ${r.fullMs !== null && r.reducedMs !== null ? fmt(r.fullMs - r.reducedMs) : '—'} | ${fmt(r.differingLines)} | ${r.notApplied} | ${r.failed} |`));
  if (s.probeC.length) lines.push('', '## Probe (c)', '', ...s.probeC.flatMap(p => p.rows.map(r => `- ${p.op} (run ${r.run}): ${r.ok ? 'ok' : 'failed'}${r.activated !== undefined ? `, activated ${r.activated}, frontmost changed ${r.frontmostChanged}` : ''}${r.copy ? `, pids ${r.approved?.pid}/${r.copy?.pid}, own sockets ${r.approved?.socket !== r.copy?.socket}` : ''}${r.error ? `: ${r.error}` : ''}`)));
  lines.push('', '## Not run', '', ...(s.notRun.length ? ['| lane | row | scene | source | reason | runs |', '|---|---|---|---|---|---|',
    ...s.notRun.map(r => `| ${r.lane} | ${r.op} | ${r.scene ?? '—'} | ${r.source ?? '—'} | ${r.reason} | ${r.runs} |`)] : ['Every planned row ran.']));
  if (s.problems.length) lines.push('', '## Problems', '', ...s.problems.map(p => `- ${p}`));
  return lines.join('\n') + '\n';
}

export function writeSummary(dir) {
  const s = summarize(dir);
  fs.writeFileSync(join(dir, 'summary.md'), renderSummary(s));
  return s;
}
