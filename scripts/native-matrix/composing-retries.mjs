// The composing groups' retries (ruling 1229, item G3; ./unicode-run.mjs composingRows): per lane and per group, how
// many runs' groups needed more than one attempt to compose, how many retries that took, and how many groups never
// composed. The setup each attempt redoes emptied the field through the lane's engine (emptyField's setValue("")) until
// ruling 1229(b) moved it to the harness's own write, the engine's kept only where that write did not read back empty;
// each attempt records its path (`emptiedBy`), counted here per lane and group. A lopsided pattern, one lane retrying
// in two or more groups while the other retries in none, is a finding for the owner, not noise. Recorded, never judged:
// a group confirmed on a retry counts as any other.
const LANES = ['vendor', 'cua'];
// A run's composition readings by group: its attempts, and whether one composed. A reading recorded before ruling 1229
// (no group, no attempt) is its run's one attempt of the group its `when` names.
function groupsOf(readings) {
  const out = new Map();
  for (const r of readings ?? []) {
    if (typeof r?.when !== 'string' || !r.when.startsWith('composing@') || !('composed' in r || 'setup' in r)) continue;
    const group = r.group ?? r.when.slice('composing@'.length);
    const g = out.get(group) ?? {attempts: 0, composed: false};
    g.attempts = Math.max(g.attempts, Number.isSafeInteger(r.attempt) ? r.attempt : 1);
    g.composed ||= r.composed === true;
    out.set(group, g);
  }
  return out;
}

// Ruling 1230, R2: the marked range read around emptyField is what settles the mechanism, and an app whose read came
// back unread (open: null; a web view may not answer it) is unsettled, whatever another app read. Per user window
// scene, the attempts that read there and how many of them had either side unread.
const unread = side => !side?.marked || side.marked.open === null;
function unsettledOf(full) {
  const scenes = new Map();
  for (const {result} of full) {
    for (const r of result.meta?.unicode?.readings ?? []) {
      if (typeof r?.group !== 'string' || !r.markedAtEmpty) continue;
      const scene = r.group.split('@')[1];
      const s = scenes.get(scene) ?? {scene, unread: 0, attempts: 0};
      s.attempts += 1;
      if (unread(r.markedAtEmpty.before) || unread(r.markedAtEmpty.after)) s.unread += 1;
      scenes.set(scene, s);
    }
  }
  return [...scenes.values()].filter(s => s.unread > 0).sort((a, b) => a.scene.localeCompare(b.scene));
}
const APP_NAMES = Object.freeze({textedit: 'TextEdit', finder: 'Finder', chrome: 'Chrome', electron: 'the Electron fixture'});

// The attempts by the path that emptied their field (ruling 1229(b)): those recording one, per path.
const PATHS = ['harness', 'engine'];
const noPaths = () => ({harness: 0, engine: 0});
function pathsOf(readings) {
  const out = new Map();
  for (const r of readings ?? []) {
    if (typeof r?.group !== 'string' || !PATHS.includes(r.emptiedBy)) continue;
    const p = out.get(r.group) ?? noPaths();
    p[r.emptiedBy] += 1;
    out.set(r.group, p);
  }
  return out;
}

// `full`: [{result}] of the full runs. -> {lanes: {vendor, cua: {groups, retries, unconfirmed, emptiedBy?}}, groups:
// [{group, engine, runs, retried, retries, unconfirmed, emptiedBy?}], findings: [text], unsettled: [{scene, unread,
// attempts}]}. `emptiedBy` ({harness, engine}: attempts) only where some attempt recorded its path.
export function composingRetriesOf(full) {
  const groups = new Map();
  let recorded = false;
  for (const {result} of full) {
    const engine = result.lanes?.[0]?.engine;
    if (!LANES.includes(engine)) continue;
    const paths = pathsOf(result.meta?.unicode?.readings);
    for (const [group, g] of groupsOf(result.meta?.unicode?.readings)) {
      const k = `${group}\u0000${engine}`;
      const c = groups.get(k) ?? {group, engine, runs: 0, retried: 0, retries: 0, unconfirmed: 0, emptiedBy: noPaths()};
      c.runs += 1;
      if (g.attempts > 1) { c.retried += 1; c.retries += g.attempts - 1; }
      if (!g.composed) c.unconfirmed += 1;
      const p = paths.get(group);
      if (p) { recorded = true; for (const path of PATHS) c.emptiedBy[path] += p[path]; }
      groups.set(k, c);
    }
  }
  const list = [...groups.values()].sort((a, b) => a.group.localeCompare(b.group) || a.engine.localeCompare(b.engine));
  if (!recorded) for (const c of list) delete c.emptiedBy;
  const retriedIn = engine => list.filter(c => c.engine === engine && c.retried > 0);
  const sumPaths = engine => Object.fromEntries(PATHS.map(path => [path, list.filter(c => c.engine === engine).reduce((n, c) => n + c.emptiedBy[path], 0)]));
  const lanes = Object.fromEntries(LANES.map(engine => [engine, {groups: retriedIn(engine).length, retries: retriedIn(engine).reduce((n, c) => n + c.retries, 0),
    unconfirmed: list.filter(c => c.engine === engine).reduce((n, c) => n + c.unconfirmed, 0), ...(recorded ? {emptiedBy: sumPaths(engine)} : {})}]));
  const findings = LANES.flatMap(engine => {
    const other = LANES.find(e => e !== engine);
    const mine = retriedIn(engine);
    if (mine.length < 2 || lanes[other].groups > 0) return [];
    return [`composing retries are lopsided: the ${engine} lane needed a retry in ${mine.length} groups (${mine.map(c => c.group).join(', ')}) and ${other} in none; `
      + (recorded ? `each attempt records which path emptied the user window's field (the harness's write, or the lane's own engine where that did not read back empty), so read the attempts' records (meta.unicode.readings: emptiedBy, and marked text around the emptying) before taking it for the venue's`
        : `each attempt's setup empties the user window's field through the lane's own engine, so read the attempts' records (meta.unicode.readings: marked text around emptyField) before taking it for the venue's`)];
  });
  return {lanes, groups: list, findings, unsettled: unsettledOf(full)};
}

// The retries as a report section, nothing when no run recorded a composing group. -> [line].
export function renderComposingRetries(c) {
  if (!c?.groups.length) return [];
  const paths = Boolean(c.lanes.vendor.emptiedBy);
  const lane = e => `${e} ${c.lanes[e].retries} retr${c.lanes[e].retries === 1 ? 'y' : 'ies'} in ${c.lanes[e].groups} group(s), ${c.lanes[e].unconfirmed} never composed`;
  return ['## Composing retries (ruling 1229)', '',
    `A composing group whose check did not read the jamo redid its setup and re-posted, up to three attempts. By lane: ${LANES.map(lane).join('; ')}. Recorded, never judged.`, '',
    ...c.findings.map(f => `- **For the owner**: ${f}.`),
    ...(c.unsettled ?? []).map(s => `- The mechanism is unsettled for ${APP_NAMES[s.scene] ?? s.scene}: the marked range around emptyField read back unread in ${s.unread} of ${s.attempts} attempt(s); `
      + `${s.scene === 'textedit' ? 'no other app\'s reading stands in for it' : 'no inference is drawn from TextEdit\'s reading'}.`),
    ...(c.findings.length || c.unsettled?.length ? [''] : []),
    ...(paths ? [`Each attempt's field was emptied by the harness's own Accessibility write (ruling 1229(b)), or by the lane's engine where that write did not read back empty: ${LANES.map(e => `${e} ${c.lanes[e].emptiedBy.harness} by the harness, ${c.lanes[e].emptiedBy.engine} by the engine`).join('; ')}.`, ''] : []),
    `| group | engine | runs | runs retried | retries | never composed |${paths ? ' attempts emptied by the harness | by the engine |' : ''}`, `|---|---|---|---|---|---|${paths ? '---|---|' : ''}`,
    ...c.groups.map(g => `| ${g.group} | ${g.engine} | ${g.runs} | ${g.retried} | ${g.retries} | ${g.unconfirmed} |${paths ? ` ${g.emptiedBy.harness} | ${g.emptiedBy.engine} |` : ''}`), ''];
}
