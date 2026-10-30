// The declared deviations (Design, Verification system: "its output equals the vendor's, or differs only as a
// declared deviation listed in scripts/linux-engine-diff/deviations.mjs, each naming this spec's section"; Interfaces:
// `[{op, scene?, field, reason, section}]`). A deviation excuses a difference from the pinned build only in its own
// operation (and scene, when it names one) and its own field, and only when cua's answer is the one declared
// (`answer`), so a declared difference never covers an undeclared one beside it.
//
// Not listed, because the runs show no difference: the element scroll on an element with no visible point (M1a.2
// expected cua's own sentence; the pinned and newest builds answer the same `element has no visible bounds in this
// window`), and the private screenshot directory (file paths are not compared).

/** The sentence an engine-build refusal answers (Plan of Work, M1a, Decisions). */
export const refusalSentence = (command) => `${command} is not available in this engine build`;

const refused = (op) => ({
  op,
  scene: 'refusals',
  field: 'error',
  answer: (c) => c.ok === false && c.error === refusalSentence(op),
  reason: `refused in this engine build rather than reproduce the vendor's text and clipboard failures; M2 brings the one verified paste route`,
  section: 'Plan of Work, M1a, Decisions; M2',
});

/** The paste route's refusal while an earlier unconfirmed paste's `CurrentTime` refusal runs (Decision Log, M2.1). */
export const PREVIOUS_UNCONFIRMED = /^a previous paste could not be confirmed and may still be read; nothing was sent; retry after \d+ s$/;

const previousUnconfirmed = (op) => ({
  op,
  field: 'error',
  answer: (c) => c.ok === false && PREVIOUS_UNCONFIRMED.test(String(c.error)),
  reason:
    "for 10 s after a paste that could not be confirmed and whose target was not served in full, a new paste is refused with nothing sent, so a late conversion of the earlier paste is never served the new one's text; the vendor never refuses here",
  section: 'Decision Log, M2.1 (serving generations across pastes)',
});

export const DEVIATIONS = [
  ...['type_text', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release'].map(refused),
  ...['type_text', 'clipboard_write'].map(previousUnconfirmed),
  {
    op: 'interrupted_hold',
    scene: 'events',
    field: 'answer',
    answer: (c) => c.ok === false && /error_kind: Window\b/.test(String(c.error)),
    reason: 'input interrupted by the target window being destroyed answers the X error; the pinned build answers success, which invites a caller to build on input that did not complete',
    section: 'Decision Log, M0.2 (interrupted input never answers success)',
  },
];

/**
 * The deviation that declares this difference, or null: `field` is where the candidate's answer differs from the
 * reference, `candidate` the candidate's answer `{ok, output?, error?}`.
 */
export function declaredDeviation({ op, scene, field, candidate }, list = DEVIATIONS) {
  return list.find((d) => d.op === op && (d.scene === undefined || d.scene === scene) && d.field === field && d.answer(candidate)) ?? null;
}

/**
 * The declared speed gaps: a request time slower than the faster vendor build's that is known, explained and owned by
 * the milestone its `section` names. A gap turns only its own operation's, route's and series' failing speed verdict
 * into "declared gap", which the summary lists apart and never counts as a pass; any other loss still fails.
 * `[{op, route, series, reason, section}]`.
 */
export const SPEED_GAPS = [
  {
    // m1a4-events-gate: desktop `move` later steps 8.45 ms against the newest build's 6.05, interval [2.27, 2.59]
    op: 'move',
    route: 'desktop',
    series: 'later',
    reason:
      "cua sends the pinned build's motions, the first at the pointer's own position, with the vendor's 8 ms path wait after each; the newest build leaves that first motion out, so a short move waits 8 ms less. M4 shortens the wait",
    section: 'M4',
  },
];

/** The speed gap that declares this verdict's loss, or null. */
export function declaredSpeedGap({ op, route, series }, list = SPEED_GAPS) {
  return list.find((g) => g.op === op && g.route === route && g.series === series) ?? null;
}

/** A deviation as recorded in results.jsonl and summary.md (without its matcher). */
export const describe = ({ answer, ...rest }) => rest;
