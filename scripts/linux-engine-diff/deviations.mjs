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

export const DEVIATIONS = [
  ...['type_text', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release'].map(refused),
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

/** A deviation as recorded in results.jsonl and summary.md (without its matcher). */
export const describe = ({ answer, ...rest }) => rest;
