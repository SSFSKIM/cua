// The composing groups' retries (ruling 1229, item G3; ./unicode-run.mjs composingRows): per lane and per group, how
// many runs' groups needed more than one attempt to compose, how many retries that took, and how many groups never
// composed. The setup each attempt redoes runs through the lane's engine (emptyField's setValue("")), so a lopsided
// pattern, one lane retrying in two or more groups while the other retries in none, is a finding for the owner, not
// noise. Recorded, never judged: a group confirmed on a retry counts as any other.
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

// `full`: [{result}] of the full runs. -> {lanes: {vendor, cua: {groups, retries, unconfirmed}}, groups: [{group,
// engine, runs, retried, retries, unconfirmed}], findings: [text], unsettled: [{scene, unread, attempts}]}.
export function composingRetriesOf(full) {
  const groups = new Map();
  for (const {result} of full) {
    const engine = result.lanes?.[0]?.engine;
    if (!LANES.includes(engine)) continue;
    for (const [group, g] of groupsOf(result.meta?.unicode?.readings)) {
      const k = `${group}\u0000${engine}`;
      const c = groups.get(k) ?? {group, engine, runs: 0, retried: 0, retries: 0, unconfirmed: 0};
      c.runs += 1;
      if (g.attempts > 1) { c.retried += 1; c.retries += g.attempts - 1; }
      if (!g.composed) c.unconfirmed += 1;
      groups.set(k, c);
    }
  }
  const list = [...groups.values()].sort((a, b) => a.group.localeCompare(b.group) || a.engine.localeCompare(b.engine));
  const retriedIn = engine => list.filter(c => c.engine === engine && c.retried > 0);
  const lanes = Object.fromEntries(LANES.map(engine => [engine, {groups: retriedIn(engine).length, retries: retriedIn(engine).reduce((n, c) => n + c.retries, 0),
    unconfirmed: list.filter(c => c.engine === engine).reduce((n, c) => n + c.unconfirmed, 0)}]));
  const findings = LANES.flatMap(engine => {
    const other = LANES.find(e => e !== engine);
    const mine = retriedIn(engine);
    if (mine.length < 2 || lanes[other].groups > 0) return [];
    return [`composing retries are lopsided: the ${engine} lane needed a retry in ${mine.length} groups (${mine.map(c => c.group).join(', ')}) and ${other} in none; `
      + `each attempt's setup empties the user window's field through the lane's own engine, so read the attempts' records (meta.unicode.readings: marked text around emptyField) before taking it for the venue's`];
  });
  return {lanes, groups: list, findings, unsettled: unsettledOf(full)};
}

// The retries as a report section, nothing when no run recorded a composing group. -> [line].
export function renderComposingRetries(c) {
  if (!c?.groups.length) return [];
  const lane = e => `${e} ${c.lanes[e].retries} retr${c.lanes[e].retries === 1 ? 'y' : 'ies'} in ${c.lanes[e].groups} group(s), ${c.lanes[e].unconfirmed} never composed`;
  return ['## Composing retries (ruling 1229)', '',
    `A composing group whose check did not read the jamo redid its setup and re-posted, up to three attempts. By lane: ${LANES.map(lane).join('; ')}. Recorded, never judged.`, '',
    ...c.findings.map(f => `- **For the owner**: ${f}.`),
    ...(c.unsettled ?? []).map(s => `- The mechanism is unsettled for ${APP_NAMES[s.scene] ?? s.scene}: the marked range around emptyField read back unread in ${s.unread} of ${s.attempts} attempt(s); `
      + `${s.scene === 'textedit' ? 'no other app\'s reading stands in for it' : 'no inference is drawn from TextEdit\'s reading'}.`),
    ...(c.findings.length || c.unsettled?.length ? [''] : []),
    '| group | engine | runs | runs retried | retries | never composed |', '|---|---|---|---|---|---|',
    ...c.groups.map(g => `| ${g.group} | ${g.engine} | ${g.runs} | ${g.retried} | ${g.retries} | ${g.unconfirmed} |`), ''];
}
