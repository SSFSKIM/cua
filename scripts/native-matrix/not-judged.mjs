// The rows a ruling put out of the native matrix's judged matrix (ruling 1119, #185; ruling 1222): they run and are
// reported, and no verdict counts them. One rule set, read by the cell-result shape (./cell-result.mjs), the manifest
// (./manifest.mjs), the Unicode plan and run (./unicode-plan.mjs, ./unicode-run.mjs) and the judge (./summary.mjs). The
// row's section and id decide; a row's own `excluded` mark is the run's record of that decision, never a source of it.
// Ruling 1222: every not-judged entry carries its reason and a ticket or a recorded evidence reference (row and field);
// the judge refuses one with neither into missing proof (notJudgedRefusal).

// The Unicode conditions out of every verdict, each with its cause.
export const NOT_JUDGED = Object.freeze({
  perContext: 'out of M5\'s judged matrix (ruling 1119, #185): a stored per-context preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference forbids',
});

// A Unicode row's condition from its id (`<field>/<condition>[@<user>]/<method>.<string>`), or null.
export const unicodeConditionOf = id => (typeof id === 'string' ? id.split('/')[1]?.split('@')[0] ?? null : null);

// Every rule that puts rows out of the judged matrix: its section, the ids it covers, its condition (the report's group),
// its reason and its ticket.
export const OPEN_PANEL_SEARCH = 'openPanel/frontmost/typeText.search';
// The Save sheet name case's own timing (./plan.mjs methodTimingId).
export const SAVE_PANEL_NAME_TIMING = 'textedit/method.savePanel.typeText.name';
export const NOT_JUDGED_RULES = Object.freeze([
  Object.freeze({section: 'unicode', condition: 'perContext', matches: id => unicodeConditionOf(id) === 'perContext', cause: NOT_JUDGED.perContext, ticket: '#577'}),
  Object.freeze({section: 'method', condition: 'openPanelSearch', matches: id => id === OPEN_PANEL_SEARCH,
    cause: 'out of M5\'s judged matrix (ruling 1222): typeText into the Open panel\'s search field is a known product defect, #588, run and reported until it is fixed', ticket: '#588'}),
  Object.freeze({section: 'speed', condition: 'savePanelNameTiming', matches: id => id === SAVE_PANEL_NAME_TIMING,
    cause: 'out of M5\'s judged matrix (ruling 1231): the Save sheet name case\'s timing stays unmeasured: filtered reruns record no timing; the vendor\'s prepare failed in the base', ticket: '#592', ruling: '1231'}),
]);
// The rule that puts `row` out of every verdict, or null.
export const notJudgedRuleOf = (row, rules = NOT_JUDGED_RULES) => (typeof row?.id === 'string' ? rules.find(r => r.section === row.section && r.matches(row.id)) ?? null : null);
// The cause that puts `row` out of every verdict, or null.
export const exclusionOf = (row, rules = NOT_JUDGED_RULES) => notJudgedRuleOf(row, rules)?.cause ?? null;

// Ruling 1222's condition on a not-judged entry ({section, id, condition, cause, ticket?, evidence?: [{row, field, …}]}):
// its reason, and a ticket or at least one recorded evidence reference. -> null, or why it is refused.
export function notJudgedRefusal(entry) {
  const evidence = Array.isArray(entry?.evidence) && entry.evidence.some(e => typeof e?.row === 'string' && typeof e?.field === 'string');
  if (typeof entry?.cause !== 'string' || !entry.cause) return 'no reason';
  if (!(typeof entry.ticket === 'string' && entry.ticket) && !evidence) return 'no ticket and no recorded evidence';
  return null;
}
