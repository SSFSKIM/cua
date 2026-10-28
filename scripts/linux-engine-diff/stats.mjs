// Medians, block rotation and the per-operation verdict of the differential harness (Design, Verification system).

export function median(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** The engine order of block `index`: rotated, so every engine takes every position across the sitting. */
export function blockOrder(engines, index) {
  const k = ((index % engines.length) + engines.length) % engines.length;
  return [...engines.slice(k), ...engines.slice(0, k)];
}

const round = (v) => (v === null ? null : Math.round(v * 10) / 10);

/** One engine's samples summarized: medians per series, and whether every sample held each property. */
export function summarizeEngine(rows) {
  const all = (key) => {
    const known = rows.filter((r) => typeof r[key] === 'boolean');
    return known.length === 0 ? null : known.every((r) => r[key]);
  };
  const cold = rows.filter((r) => r.series === 'cold');
  const warm = rows.filter((r) => r.series === 'warm');
  return {
    cold: round(median(cold.filter((r) => r.ok).map((r) => r.ms))),
    warm: round(median(warm.filter((r) => r.ok).map((r) => r.ms))),
    n_cold: cold.length,
    n_warm: warm.length,
    ok: rows.length > 0 && rows.every((r) => r.ok),
    witness: all('witness'),
    effect: all('effect'),
    equal: all('equal'),
  };
}

/**
 * The verdict for one operation and scene: the candidate's medians at or below the bar (the faster vendor build,
 * cold against cold, warm against warm), every request answered, its output equal, its witness clean wherever a
 * vendor build's is, and its effect verified wherever a vendor build's is.
 */
export function judgeOperation(rows, { vendors, candidate }) {
  const engines = {};
  for (const label of new Set(rows.map((r) => r.engine))) {
    engines[label] = summarizeEngine(rows.filter((r) => r.engine === label));
  }
  const vendorRows = vendors.map((v) => engines[v]).filter(Boolean);
  const best = (series) => {
    const values = vendorRows.map((e) => e[series]).filter((v) => v !== null);
    return values.length ? Math.min(...values) : null;
  };
  const bar = { cold: best('cold'), warm: best('warm') };
  const c = engines[candidate];
  const reasons = [];
  if (!c) return { engines, bar, speed: false, pass: false, reasons: [`no samples from ${candidate}`] };
  if (!c.ok) reasons.push(`${candidate}: a request failed`);
  let speed = true;
  for (const series of ['cold', 'warm']) {
    if (bar[series] === null || c[series] === null) continue;
    if (c[series] > bar[series]) {
      speed = false;
      reasons.push(`${candidate}: ${series} ${c[series]} ms > bar ${bar[series]} ms`);
    }
  }
  if (vendorRows.some((e) => e.witness === true) && c.witness !== true) reasons.push(`${candidate}: the witness changed`);
  if (vendorRows.some((e) => e.effect === true) && c.effect !== true) reasons.push(`${candidate}: the effect was not verified`);
  if (c.equal === false) reasons.push(`${candidate}: the output differs from the vendor's`);
  return { engines, bar, speed, pass: reasons.length === 0, reasons };
}
