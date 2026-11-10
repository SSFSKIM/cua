// Pure reader for paired.mjs. p50 is the ordinary sample median (mean of the middle two for even n);
// p95 is nearest-rank (ceil(.95*n)). A pair is the SAME scene and round, never adjacent rows in a file.
const heads = ['control', 'branch', 'candidate'];
const finiteCost = row => Number.isFinite(row?.timings?.walkMs) && row.timings.walkMs >= 0;
const key = row => `${row.scene}|${row.head}|${row.round}`;
export function quantiles(values) {
  const xs = values.toSorted((a, b) => a - b), n = xs.length;
  return {p50: n ? (xs[Math.floor((n - 1) / 2)] + xs[Math.floor(n / 2)]) / 2 : null,
    p95: n ? xs[Math.ceil(.95 * n) - 1] : null};
}

export function summarizePaired(data) {
  const {config, results = [], warmups = []} = data;
  if (config?.group !== 'paired' || !Number.isInteger(config.rounds) || config.rounds < 1 || !config.scenes?.length ||
      new Set(config.scenes.map(s => s.id)).size !== config.scenes.length ||
      heads.some(head => config.engines?.filter(e => e.head === head).length !== 1)) throw new Error('invalid paired manifest');
  const issues = [], slots = new Map(), indexed = new Map();
  for (const scene of config.scenes) for (const head of heads) for (let round = 1; round <= config.rounds; round++) {
    slots.set(key({scene: scene.id, head, round}), {scene: scene.id, app: scene.app, head, round});
  }
  for (const row of results) {
    if (!slots.has(key(row))) {issues.push({...row, reason: 'unplanned observation'}); continue;}
    const list = indexed.get(key(row)) ?? []; list.push(row); indexed.set(key(row), list);
  }
  const usable = new Map();
  for (const [id, slot] of slots) {
    const rows = indexed.get(id) ?? [], row = rows[0];
    const engine = config.engines.find(e => e.head === slot.head);
    const reason = !rows.length ? 'missing' : rows.length !== 1 ? 'duplicate slot' :
      row.status !== 'ok' ? row.status ?? 'missing status' : !finiteCost(row) ? 'missing/invalid walkMs' :
      row.ref !== engine.ref ? 'engine ref mismatch' : row.app !== slot.app ? 'app mismatch' :
      row.phase !== 'measured' ? 'not measured' : null;
    if (reason) issues.push({...slot, reason, observations: rows});
    else usable.set(id, row);
  }
  function group(scenes, identity) {
    const ids = new Set(scenes.map(s => s.id)), expected = scenes.length * config.rounds;
    const engines = Object.fromEntries(heads.map(head => {
      const planned = [...slots].filter(([, s]) => ids.has(s.scene) && s.head === head);
      const valid = planned.map(([id]) => usable.get(id)).filter(Boolean);
      const missing = planned.filter(([id]) => !indexed.has(id)).length;
      return [head, {expected, present: planned.reduce((n, [id]) => n + (indexed.get(id)?.length ?? 0), 0),
        valid: valid.length, failed: expected - missing - valid.length, missing,
        duplicateSlots: planned.filter(([id]) => indexed.get(id)?.length > 1).length,
        ...quantiles(valid.map(row => row.timings.walkMs))}];
    }));
    const comparisons = Object.fromEntries(['branch', 'candidate'].map(head => {
      const control = engines.control, other = engines[head], byRound = [];
      for (const scene of scenes) for (let round = 1; round <= config.rounds; round++) {
        const c = usable.get(key({scene: scene.id, head: 'control', round}));
        const b = usable.get(key({scene: scene.id, head, round}));
        const controlMs = c?.timings.walkMs ?? null, otherMs = b?.timings.walkMs ?? null;
        byRound.push({scene: scene.id, round, status: c && b ? 'paired' : 'unpaired', controlMs, otherMs,
          differenceMs: c && b ? otherMs - controlMs : null,
          differencePct: c && b && controlMs > 0 ? (otherMs / controlMs - 1) * 100 : null});
      }
      const pairs = byRound.filter(r => r.status === 'paired');
      const delta = quantiles(pairs.map(r => r.differenceMs));
      const pct = quantiles(pairs.map(r => r.differencePct).filter(Number.isFinite));
      const complete = control.valid === expected && other.valid === expected;
      return [head, {complete,
        p50DifferenceMs: control.p50 != null && other.p50 != null ? other.p50 - control.p50 : null,
        p95DifferenceMs: control.p95 != null && other.p95 != null ? other.p95 - control.p95 : null,
        p50DifferencePct: control.p50 > 0 && other.p50 != null ? (other.p50 / control.p50 - 1) * 100 : null,
        // A faster engine passes; this is a maximum 10% slowdown, not an absolute +/-10% band.
        within10PctP50: complete && control.p50 > 0 ? other.p50 <= control.p50 * 1.1 : null,
        paired: {expected, valid: pairs.length, missing: expected - pairs.length,
          p50DifferenceMs: delta.p50, p95DifferenceMs: delta.p95,
          p50DifferencePct: pct.p50, p95DifferencePct: pct.p95, byRound}}];
    }));
    return {...identity, engines, comparisons};
  }
  const scenes = config.scenes.map(scene => group([scene], {scene: scene.id, app: scene.app}));
  // App summaries pool equally sampled scene/rounds. Per-scene flags remain independently binding.
  const apps = [...new Set(config.scenes.map(s => s.app))].map(app => group(config.scenes.filter(s => s.app === app), {app}));
  const warmGroups = config.scenes.flatMap(scene => heads.map(head => {
    const rows = warmups.filter(r => r.scene === scene.id && r.head === head);
    const expected = Number.isInteger(config.warmupsPerVisit) ? config.rounds * config.warmupsPerVisit : null;
    return {scene: scene.id, app: scene.app, head, expected, total: rows.length,
      missing: expected == null ? null : Math.max(0, expected - rows.length), requestsSent: rows.filter(r => r.requestSent === true).length,
      ok: rows.filter(r => r.status === 'ok').length,
      statuses: Object.fromEntries([...new Set(rows.map(r => r.status))].map(status => [status, rows.filter(r => r.status === status).length])),
      ...quantiles(rows.filter(r => r.status === 'ok' && finiteCost(r)).map(r => r.timings.walkMs))};
  }));
  return {schema: 1, config, quantiles: 'p50: sample median; p95: nearest rank ceil(.95*n)',
    gate: 'Complete measured slots; each scene AND each app p50 <= 1.10 * control; faster passes; null means unjudgeable.',
    scenes, apps, warmups: {total: warmups.length, groups: warmGroups}, issues,
    passed: config.completed === true && !config.exception && !config.signal && issues.length === 0 &&
      [...scenes, ...apps].every(g => Object.values(g.comparisons).every(c => c.within10PctP50 === true))};
}
