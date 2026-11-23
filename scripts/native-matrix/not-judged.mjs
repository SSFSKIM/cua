// The rows a ruling put out of the native matrix's judged matrix (ruling 1119, #185): they run and are reported, and no
// verdict counts them. One rule, read by the cell-result shape (./cell-result.mjs), the Unicode plan and run
// (./unicode-plan.mjs, ./unicode-run.mjs) and the judge (./summary.mjs). The row's section and its condition decide; a
// row's own `excluded` mark is the run's record of that decision, never a source of it.

// The Unicode conditions out of every verdict, each with its cause.
export const NOT_JUDGED = Object.freeze({
  perContext: 'out of M5\'s judged matrix (ruling 1119, #185): a stored per-context preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference forbids',
});

// A Unicode row's condition from its id (`<field>/<condition>[@<user>]/<method>.<string>`), or null.
export const unicodeConditionOf = id => (typeof id === 'string' ? id.split('/')[1]?.split('@')[0] ?? null : null);

// The cause that puts `row` out of every verdict, or null.
export function exclusionOf(row) {
  const condition = row?.section === 'unicode' ? unicodeConditionOf(row.id) : null;
  return condition !== null && Object.hasOwn(NOT_JUDGED, condition) ? NOT_JUDGED[condition] : null;
}
