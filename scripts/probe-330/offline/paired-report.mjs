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
      new Set(config.scenes.map(s => s.id)).size !== config.scenes.length || config.warmupsPerVisit !== 2 ||
      heads.some(head => config.engines?.filter(e => e.head === head).length !== 1)) throw new Error('invalid paired manifest');
  const issues = [], slots = new Map(), indexed = new Map(), warmSlots = new Map(), warmIndexed = new Map();
  const warmKey = row => `${key(row)}|${row.warm}`;
  for (const scene of config.scenes) for (const head of heads) for (let round = 1; round <= config.rounds; round++) {
    const slot = {scene: scene.id, app: scene.app, head, round, phase: 'measured'};
    slots.set(key(slot), slot);
    for (const warm of [1, 2]) {const w = {...slot, phase: 'warm', warm}; warmSlots.set(warmKey(w), w);}
  }
  function index(rows, plan, index, idOf, phase) {
    for (const row of rows) {
      const id = idOf(row);
      if (!plan.has(id)) {issues.push({...row, phase, reason: 'unplanned observation'}); continue;}
      const list = index.get(id) ?? []; list.push(row); index.set(id, list);
    }
  }
  index(results, slots, indexed, key, 'measured');
  index(warmups, warmSlots, warmIndexed, warmKey, 'warm');
  function problem(rows, slot) {
    const row = rows[0], engine = config.engines.find(e => e.head === slot.head);
    return !rows.length ? 'missing' : rows.length !== 1 ? 'duplicate slot' :
      row.status !== 'ok' ? row.status ?? 'missing status' : !finiteCost(row) ? 'missing/invalid walkMs' :
      row.ref !== engine.ref ? 'engine ref mismatch' : row.app !== slot.app ? 'app mismatch' :
      row.phase !== slot.phase ? `not ${slot.phase}` : slot.phase === 'warm' && row.requestSent !== true ? 'warm request not sent' : null;
  }
  const usableWarm = new Map(), usable = new Map();
  for (const [id, slot] of warmSlots) {
    const rows = warmIndexed.get(id) ?? [], reason = problem(rows, slot);
    if (reason) issues.push({...slot, reason, observations: rows});
    else usableWarm.set(id, rows[0]);
  }
  for (const [id, slot] of slots) {
    const rows = indexed.get(id) ?? [];
    const badWarm = [1, 2].filter(warm => !usableWarm.has(warmKey({...slot, warm})));
    const reason = problem(rows, slot) ?? (badWarm.length ? 'invalid/missing warm-ups for measured visit' : null);
    if (reason) issues.push({...slot, reason, ...(badWarm.length ? {invalidWarmSlots: badWarm} : {}), observations: rows});
    else usable.set(id, rows[0]);
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
  // The binding threshold is per APP. Scene flags and quantiles remain diagnostics, not extra rejection criteria.
  const apps = [...new Set(config.scenes.map(s => s.app))].map(app => group(config.scenes.filter(s => s.app === app), {app}));
  const warmGroups = config.scenes.flatMap(scene => heads.map(head => {
    const rows = warmups.filter(r => r.scene === scene.id && r.head === head);
    const planned = [...warmSlots].filter(([, s]) => s.scene === scene.id && s.head === head);
    const valid = planned.map(([id]) => usableWarm.get(id)).filter(Boolean);
    const missing = planned.filter(([id]) => !warmIndexed.has(id)).length;
    return {scene: scene.id, app: scene.app, head, expected: planned.length, total: rows.length,
      valid: valid.length, failed: planned.length - missing - valid.length, missing,
      duplicateSlots: planned.filter(([id]) => warmIndexed.get(id)?.length > 1).length,
      requestsSent: rows.filter(r => r.requestSent === true).length, ok: rows.filter(r => r.status === 'ok').length,
      statuses: Object.fromEntries([...new Set(rows.map(r => r.status))].map(status => [status, rows.filter(r => r.status === status).length])),
      ...quantiles(valid.map(r => r.timings.walkMs))};
  }));
  const runComplete = config.completed === true && !config.exception && !config.cleanupException && !config.signal &&
    config.scenes.every(s => !s.exception && !s.cleanupException);
  const acceptance = Object.fromEntries(['branch', 'candidate'].map(head => {
    // A diagnostic head's failures must not reject the other head. Unknown attribution is a dataset-wide error.
    const relevantIssues = issues.filter(i => !heads.includes(i.head) || i.head === 'control' || i.head === head);
    const complete = runComplete && relevantIssues.length === 0 && apps.every(a => a.comparisons[head].complete);
    return [head, {complete, passed: complete && apps.every(a => a.comparisons[head].within10PctP50 === true),
      issueCount: relevantIssues.length, appFlags: Object.fromEntries(apps.map(a => [a.app, a.comparisons[head].within10PctP50]))}];
  }));
  return {schema: 2, config, quantiles: 'p50: sample median; p95: nearest rank ceil(.95*n)',
    gate: 'Complete measured visits with both valid, correctly attributed warm-ups; each APP p50 <= 1.10 * control. Scene limits are diagnostic only; faster passes; null means unjudgeable.',
    scenes, apps, warmups: {total: warmups.length, groups: warmGroups}, issues, acceptance,
    passed: Object.values(acceptance).every(a => a.passed)};
}
