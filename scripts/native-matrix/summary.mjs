// The native matrix's judgment and report (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system parts 4 and 5, Acceptance 7): every CellResult under one or more directories (./cell-result.mjs; the matrix's
// own runs and any cell implemented elsewhere, M2a's residue on the live harness, M2b.3's probe cells), pooled by
// engine, judged and written as the method table, the per-scene speed table and the three-point section.
// `native-matrix.mjs summary <dir>` writes summary.md; `compare <vendor-dir> <cua-dir>` prints the verdict; both judge
// alike (judge).
//
// The rules:
// - Method rows (section 'method', id `<target>/<regime>/<method>.<case>`). Frontmost: the vendor's outcome is the
//   reference, sample for sample (the run number): cua is worse on a sample where the vendor passed and cua did not;
//   better where cua passed and the vendor did not. Background: the fixture's ground truth is the reference, so every
//   valid cua sample passes. A row with no valid cua sample has no verdict, which blocks as a failure does.
// - Speed rows (section 'speed', id `<scene>/<op>`, ok meaning measured): the in-cell medians and p95s, the beat being
//   cua's median at most 90% of the vendor's with its p95 not worse; a missed beat is the owner's fork at M5, not a failure.
// - Finding rows (section 'finding', ok meaning measured): per scene the targets resolved (in every valid sample), the
//   titled share and the ID count (medians); cua not lower on any measure and its resolved sum higher passes; not lower
//   with the sum equal is parity, the owner's call; lower on any measure fails.
// - Interference (the `interference` of background method rows and launch rows): cua at 100%, a row with a declared
//   cause (a self-activating family, an accepted route 4) listed for the owner rather than passed; the vendor's score
//   recorded beside it.
// - Any other section (concurrent use, intervention, Unicode, settle, residue): each cell's verdict per engine as its
//   rows give it (./cell-result.mjs verdictOf), listed.
import {stats} from '../native-baseline/summary.mjs';
import {readCellResults} from './cell-result.mjs';
import {ENGINE_METHOD, METHODS, NOT_APPLICABLE, TARGETS} from './plan.mjs';

export const BEAT = 0.9;
export const RUNS_PER_SIDE = 3;
export const SPEED_OPS = Object.freeze(['getAXState', 'getScreenshot', 'listApps']);
const SCENE_IDS = ['textedit', 'finder', 'chrome', 'electron'];
const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

// Every CellResult under `dirs`, with what keeps any of them from being read. -> {results: [{path, result}], problems}.
export function readResults(dirs) {
  const results = [], problems = [];
  for (const dir of dirs) for (const {path, result, problems: own} of readCellResults(dir)) {
    if (own.length) problems.push(`${dir}/${path}: ${own.join('; ')}`);
    else results.push({path: `${dir}/${path}`, result});
  }
  return {results, problems};
}

const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };

// One method row's verdict from both engines' samples. -> {verdict: 'equal'|'better'|'worse'|'no-verdict', vendor, cua, routes}.
export function judgeMethod(regime, vendorRows, cuaRows) {
  const valid = rows => rows.filter(r => !r.invalid);
  const v = valid(vendorRows), c = valid(cuaRows);
  const count = rows => ({ok: rows.filter(r => r.ok).length, valid: rows.length, invalid: 0});
  const vendor = {...count(v), invalid: vendorRows.length - v.length}, cua = {...count(c), invalid: cuaRows.length - c.length};
  const routes = {vendor: [...new Set(v.map(r => r.inputRoute ?? null))], cua: [...new Set(c.map(r => r.inputRoute ?? null))]};
  if (!c.length) return {verdict: 'no-verdict', vendor, cua, routes};
  if (regime === 'background') return {verdict: c.every(r => r.ok) ? (v.length && v.some(r => !r.ok) ? 'better' : 'equal') : 'worse', vendor, cua, routes};
  const bySample = new Map(v.map(r => [r.sample ?? 1, r]));
  let worse = false, better = false;
  for (const row of c) {
    const reference = bySample.get(row.sample ?? 1);
    if (!reference) { if (!row.ok) worse = true; continue; }
    if (reference.ok && !row.ok) worse = true;
    if (!reference.ok && row.ok) better = true;
  }
  return {verdict: worse ? 'worse' : better ? 'better' : 'equal', vendor, cua, routes};
}

// One speed op's comparison. -> {vendor: stats, cua: stats, deltaPct, beat: true|false|null}.
export function judgeSpeed(vendorRows, cuaRows) {
  const times = rows => rows.filter(r => r.ok && !r.invalid).map(r => r.inCellMs);
  const vendor = stats(times(vendorRows)), cua = stats(times(cuaRows));
  if (!vendor || !cua) return {vendor, cua, deltaPct: null, beat: null};
  return {vendor, cua, deltaPct: round(((cua.median - vendor.median) / vendor.median) * 100), beat: cua.median <= BEAT * vendor.median && cua.p95 <= vendor.p95};
}

// One scene's finding measures for one engine. -> {resolved, found, share, ids, targets} or null without a sample.
export function findingMeasures(rows) {
  const valid = rows.filter(r => !r.invalid);
  const targets = groupBy(valid.filter(r => /\/target\./.test(r.id)), r => r.id);
  if (!targets.size) return null;
  const all = (list, key) => list.every(r => r.outcome?.[key] === true);
  const resolved = [...targets.values()].filter(list => all(list, 'resolved')).length;
  const found = [...targets.values()].filter(list => all(list, 'found')).length;
  const lines = valid.filter(r => r.id.endsWith('/lines')).map(r => (r.outcome?.lines ? r.outcome.named / r.outcome.lines : null));
  const ids = valid.filter(r => r.id.endsWith('/ids')).map(r => r.outcome?.ids);
  return {resolved, found, share: round((stats(lines)?.median ?? 0) * 1000) / 1000, ids: stats(ids)?.median ?? 0, targets: targets.size};
}

// The judgment of everything pooled. -> {problems, runs, methods, speed, finding, interference, others, verdict}.
export function judge(results, problems = []) {
  const rows = results.flatMap(({result}) => result.rows.map(row => ({...row, cell: result.cell})));
  const by = engine => rows.filter(r => r.engine === engine);
  const runs = {vendor: 0, cua: 0};
  const hosts = {vendor: new Set(), cua: new Set()};
  for (const {result, path} of results) {
    if (result.cell === 'matrix') for (const lane of result.lanes) { runs[lane.engine]++; hosts[lane.engine].add(lane.host); }
    if (!result.complete) problems.push(`${path}: ${result.cell} is ${result.verdict === 'refused' ? 'refused' : 'incomplete'}${result.problems.length ? ` (${result.problems.join('; ')})` : ''}`);
  }
  for (const engine of ['vendor', 'cua']) if (hosts[engine].size > 1) problems.push(`the ${engine} engine's matrix runs come from more than one host (${[...hosts[engine]].join(', ')}): one lane per engine is judged`);

  // Methods.
  const methodRows = rows.filter(r => r.section === 'method');
  const methods = [];
  for (const [id, list] of groupBy(methodRows, r => r.id)) {
    const [target, regime] = id.split('/');
    methods.push({id, target, regime, method: list[0].method, case: list[0].case, ...judgeMethod(regime, list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
  }
  methods.sort((a, b) => a.id.localeCompare(b.id));

  // Speed.
  const speedRows = rows.filter(r => r.section === 'speed');
  const speed = [];
  for (const [id, list] of groupBy(speedRows, r => r.id)) {
    const [scene, op] = [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)];
    speed.push({id, scene, op, ...judgeSpeed(list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
  }
  speed.sort((a, b) => a.id.localeCompare(b.id));

  // Finding.
  const finding = SCENE_IDS.map(scene => {
    const of = engine => findingMeasures(rows.filter(r => r.section === 'finding' && r.engine === engine && r.id.startsWith(`${scene}/`)));
    return {scene, vendor: of('vendor'), cua: of('cua')};
  }).filter(f => f.vendor || f.cua);
  const measured = finding.filter(f => f.vendor && f.cua);
  const lower = measured.filter(f => ['resolved', 'share', 'ids'].some(k => f.cua[k] < f.vendor[k]));
  const sum = engine => measured.reduce((n, f) => n + f[engine].resolved, 0);
  const findingVerdict = !measured.length || measured.length < finding.length ? 'no-verdict' : lower.length ? 'fail' : sum('cua') > sum('vendor') ? 'pass' : 'parity';

  // Interference: background method rows and launch rows.
  const judged = engine => rows.filter(r => r.engine === engine && !r.invalid && r.interference && ((r.section === 'method' && r.regime === 'background') || r.section === 'launch'));
  const interference = Object.fromEntries(['vendor', 'cua'].map(engine => {
    const list = judged(engine);
    return [engine, {rows: list.length, ok: list.filter(r => r.interference.ok).length, route4: list.filter(r => r.interference.route4 && r.declared?.kind !== 'route4-accepted').length,
      declared: list.filter(r => !r.interference.ok && r.declared).map(r => ({id: r.id, ...r.declared})),
      failed: list.filter(r => !r.interference.ok && !r.declared).map(r => ({id: r.id, frontmost: r.interference.frontmost, topWindow: r.interference.topWindow, activations: r.interference.activations, route4: r.interference.route4}))}];
  }));
  const launches = rows.filter(r => r.section === 'launch');

  // Other cells, by cell and engine.
  const others = [];
  for (const {result, path} of results) {
    if (['matrix'].includes(result.cell)) continue;
    for (const [engine, list] of groupBy(result.rows, r => r.engine)) {
      const valid = list.filter(r => !r.invalid);
      others.push({cell: result.cell, path, engine, sections: [...new Set(list.map(r => r.section))], verdict: result.verdict, ok: valid.filter(r => r.ok).length, valid: valid.length, invalid: list.length - valid.length});
    }
  }

  const methodFails = methods.filter(m => m.verdict === 'worse' || m.verdict === 'no-verdict');
  const interferencePass = interference.cua.rows > 0 && interference.cua.failed.length === 0 && interference.cua.declared.length === 0;
  const speedMisses = speed.filter(s => s.beat === false);
  const speedUnmeasured = speed.filter(s => s.beat === null);
  const owner = [
    ...speedMisses.map(s => `speed: ${s.id} missed the 10% beat (cua ${round(s.cua.median)} ms against ${round(s.vendor.median)} ms, p95 ${round(s.cua.p95)} against ${round(s.vendor.p95)})`),
    ...(findingVerdict === 'parity' ? ['finding elements: parity on the resolved sum (the owner decides)'] : []),
    ...interference.cua.declared.map(d => `not interfering: ${d.id}: ${d.cause}`),
    ...(runs.vendor < RUNS_PER_SIDE || runs.cua < RUNS_PER_SIDE ? [`runs: ${runs.vendor} vendor and ${runs.cua} cua matrix runs, ${RUNS_PER_SIDE} per side are the rule`] : []),
  ];
  const blocking = [
    ...problems,
    ...methodFails.map(m => `method: ${m.id} is ${m.verdict === 'worse' ? 'worse on cua' : 'without a valid cua sample'}`),
    ...(findingVerdict === 'fail' ? lower.map(f => `finding elements: ${f.scene} is lower on cua`) : findingVerdict === 'no-verdict' ? ['finding elements: a scene has no measure on one engine'] : []),
    ...interference.cua.failed.map(f => `not interfering: ${f.id} failed on cua`),
    ...(interference.cua.rows === 0 ? ['not interfering: no background row was judged on cua'] : []),
    ...speedUnmeasured.map(s => `speed: ${s.id} has no measure on one engine`),
    ...others.filter(o => o.engine === 'cua' && o.verdict !== 'pass').map(o => `${o.cell}: ${o.verdict} on cua`),
  ];
  const verdict = blocking.length ? 'FAIL' : owner.length ? 'OWNER' : 'PASS';
  return {problems, runs, methods, speed, finding, findingVerdict, interference, interferencePass, launches: launches.length, others, owner, blocking, verdict};
}

// ---- the report ---------------------------------------------------------------------------------------------------------

const MARK = {equal: 'equal', better: 'better', worse: '**worse**', 'no-verdict': '**no verdict**'};
const ms = n => (n === null || n === undefined ? '-' : (Math.round(n * 10) / 10).toFixed(1));
const counts = c => `${c.ok}/${c.valid}${c.invalid ? ` (+${c.invalid} invalid)` : ''}`;
const routeText = list => list.map(r => (r === null ? '-' : String(r))).join(', ');

// The method table: the 11 methods against the four scenes and the Open panel, each cell the worst verdict of its cases
// per regime (front/back), n/a with the plan's reason in a note.
export function methodTable(methods) {
  const rank = ['equal', 'better', 'no-verdict', 'worse'];
  const worst = list => list.reduce((a, m) => (rank.indexOf(m.verdict) > rank.indexOf(a) ? m.verdict : a), 'better');
  const cell = (target, method) => {
    if (NOT_APPLICABLE[target]?.[method]) return 'n/a';
    const parts = ['frontmost', 'background'].map(regime => {
      const list = methods.filter(m => m.target === target && m.regime === regime && m.method === method);
      return list.length ? `${regime === 'frontmost' ? 'F' : 'B'} ${MARK[worst(list)].replace(/\*/g, '')}` : null;
    }).filter(Boolean);
    return parts.length ? parts.join(' / ') : 'not run';
  };
  const lines = [`| method | ${TARGETS.join(' | ')} |`, `|---|${TARGETS.map(() => '---').join('|')}|`];
  for (const method of METHODS) lines.push(`| ${ENGINE_METHOD[method]} | ${TARGETS.map(t => cell(t, method)).join(' | ')} |`);
  return lines.join('\n');
}

export function renderSummary(j, {title = 'Native matrix summary'} = {}) {
  const out = [`# ${title}`, '', `Verdict: **${j.verdict}**${j.verdict === 'OWNER' ? ' (nothing failed; the owner\'s calls below remain)' : ''}`, '',
    `Matrix runs: ${j.runs.vendor} vendor, ${j.runs.cua} cua (${RUNS_PER_SIDE} per side are the rule).`, ''];
  if (j.blocking.length) out.push('## Blocking', '', ...j.blocking.map(b => `- ${b}`), '');
  if (j.owner.length) out.push('## For the owner', '', ...j.owner.map(o => `- ${o}`), '');

  out.push('## The three points', '');
  const beats = j.speed.filter(s => s.beat === true).length;
  out.push(`- **Speed**: ${beats} of ${j.speed.length} measured ops beat the vendor by at least 10% with p95 not worse; ${j.speed.filter(s => s.beat === false).length} missed (the owner's fork), ${j.speed.filter(s => s.beat === null).length} unmeasured.`);
  const sum = engine => j.finding.reduce((n, f) => n + (f[engine]?.resolved ?? 0), 0);
  out.push(`- **Finding elements**: ${j.findingVerdict}; resolved targets vendor ${sum('vendor')}, cua ${sum('cua')} of ${j.finding.reduce((n, f) => n + (f.vendor?.targets ?? f.cua?.targets ?? 0), 0)}.`);
  const share = engine => (j.interference[engine].rows ? `${Math.round((j.interference[engine].ok / j.interference[engine].rows) * 1000) / 10}% (${j.interference[engine].ok}/${j.interference[engine].rows})` : 'no rows');
  out.push(`- **Not interfering**: cua ${share('cua')}, vendor ${share('vendor')}; cua route-4 actions outside accepted families: ${j.interference.cua.route4}; declared for the owner: ${j.interference.cua.declared.length}.`, '');

  out.push('## Methods', '', methodTable(j.methods), '', 'F: frontmost regime (the vendor\'s outcome is the reference, sample for sample); B: background regime (the fixture\'s ground truth). n/a: no meaningful target on that scene, on both engines:', '');
  for (const target of TARGETS) for (const [method, reason] of Object.entries(NOT_APPLICABLE[target] ?? {})) out.push(`- ${target} ${ENGINE_METHOD[method]}: ${reason}`);
  out.push('', '| row | verdict | vendor ok | cua ok | vendor route | cua route |', '|---|---|---|---|---|---|');
  for (const m of j.methods) out.push(`| ${m.id} | ${MARK[m.verdict]} | ${counts(m.vendor)} | ${counts(m.cua)} | ${routeText(m.routes.vendor)} | ${routeText(m.routes.cua)} |`);
  out.push('');

  out.push('## Speed (in-cell ms)', '');
  for (const scene of SCENE_IDS) {
    const list = j.speed.filter(s => s.scene === scene);
    if (!list.length) continue;
    out.push(`### ${scene}`, '', '| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |', '|---|---|---|---|---|---|---|');
    for (const s of list) out.push(`| ${s.op} | ${ms(s.vendor?.median)} | ${ms(s.vendor?.p95)} | ${ms(s.cua?.median)} | ${ms(s.cua?.p95)} | ${s.deltaPct === null ? '-' : `${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}%`} | ${s.beat === null ? 'unmeasured' : s.beat ? 'yes' : '**no**'} |`);
    out.push('');
  }

  out.push('## Finding elements', '', '| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |', '|---|---|---|---|---|---|---|');
  for (const f of j.finding) out.push(`| ${f.scene} | ${f.vendor?.resolved ?? '-'}/${f.vendor?.targets ?? '-'} | ${f.cua?.resolved ?? '-'}/${f.cua?.targets ?? '-'} | ${f.vendor?.share ?? '-'} | ${f.cua?.share ?? '-'} | ${f.vendor?.ids ?? '-'} | ${f.cua?.ids ?? '-'} |`);
  out.push('');

  out.push('## Not interfering', '');
  for (const engine of ['cua', 'vendor']) {
    const i = j.interference[engine];
    out.push(`- ${engine}: ${share(engine)}${i.failed.length ? `; failed: ${i.failed.map(f => `${f.id} (${[!f.frontmost && 'frontmost changed', !f.topWindow && 'top window changed', f.activations && `${f.activations} activation(s)`, f.route4 && 'route 4'].filter(Boolean).join(', ')})`).join('; ')}` : ''}${i.declared.length ? `; declared: ${i.declared.map(d => `${d.id} (${d.kind})`).join('; ')}` : ''}`);
  }
  out.push('');
  if (j.others.length) {
    out.push('## Other cells', '', '| cell | engine | sections | verdict | ok |', '|---|---|---|---|---|');
    for (const o of j.others) out.push(`| ${o.cell} | ${o.engine} | ${o.sections.join(', ')} | ${o.verdict} | ${o.ok}/${o.valid}${o.invalid ? ` (+${o.invalid} invalid)` : ''} |`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
