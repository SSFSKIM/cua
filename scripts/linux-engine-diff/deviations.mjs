// The declared deviations (Design, Verification system: "its output equals the vendor's, or differs only as a
// declared deviation listed in scripts/linux-engine-diff/deviations.mjs, each naming this spec's section"; Interfaces:
// `[{op, scene?, field, reason, section}]`). A deviation excuses a difference from the reference build (the pinned
// build; for a text command, a build whose route applied it in that block, text.mjs) only in its own
// operation (and scene, when it names one) and its own field, and only when cua's answer is the one declared
// (`answer`), so a declared difference never covers an undeclared one beside it.
//
// Not listed, because the runs show no difference: the element scroll on an element with no visible point (M1a.2
// expected cua's own sentence; the pinned and newest builds answer the same `element has no visible bounds in this
// window`), and the private screenshot directory (file paths are not compared).

/**
 * A text command that cua applies where no vendor build's route does (the bar is the union of what either build
 * succeeds at, so with no vendor success there is no answer to equal): only cua's success is declared, and its effect
 * is still judged on every sample.
 */
const appliedWhereNoVendorDoes = (op, scene, why) => ({
  op,
  scene,
  field: 'answer',
  answer: (c) => c.ok === true,
  reason: `cua's paste route applies the text here and neither vendor build does: ${why}`,
  section: 'Purpose ("Text arrives"); Design, Text and clipboard',
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
  appliedWhereNoVendorDoes('type_text', 'gnome-text-editor', 'GTK 4 ignores the background route, where both builds send their text, and cua takes the foreground route in dedicated mode (M0.4 matrix; Decision Log, M2 pre-flight)'),
  appliedWhereNoVendorDoes('clipboard_write', 'gedit', "both builds paste a snapshot with EditableText.PasteText, which inserts nothing in gedit and fails after 10 s (R/F §7); cua pastes it with the family's chord"),
  {
    op: 'clipboard_write',
    field: 'clipboard',
    answer: (c) => c.clipboard_kept === true,
    reason:
      "cua's cleanup leaves the clipboard as it found it (or as a competing owner set it meanwhile), where both vendor builds leave the written snapshot on CLIPBOARD; the difference shows only when something changed the clipboard between the clipboard_read and the clipboard_write",
    section: 'Decision Log, M0.1 folded (clipboard_write restores the clipboard)',
  },
  {
    op: 'type_characters',
    scene: 'events',
    field: 'answer',
    answer: (c) => c.ok === false && /^Character '.+' is not on the keyboard layout$/su.test(String(c.error)),
    reason:
      "a character the layout cannot produce at level 1 or 2 is refused in one sentence of cua's, naming it; the newest build refuses the same text with `resolve_keys failed …`, `cannot type control character …` or `cannot type literal keysym …`, and the events are the same (nothing typed)",
    section: 'Design, Keys; Decision Log, M2.2',
  },
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

/**
 * The declared parity list (Acceptance 3's parity rule): an operation whose work is identical by construction in every
 * engine and cannot be made faster. Above the bar, its verdict is **parity** (listed apart, never a pass, not a
 * failure) only while cua's median lies within the spread of the bar build's own samples of that series in that run,
 * which is how M1a.4 checked its verdict run (stats.mjs); otherwise it still fails. `[{op, scene, series, reason,
 * section}]`.
 */
export const PARITY = [
  {
    // m2-wire: cold 36.44 ms against the pinned build's 33.58, whose cold samples spread over 32.22-40.05
    op: 'get_screenshot',
    scene: 'desktop',
    series: 'cold',
    reason:
      "the first desktop capture is the vendor's own plain GetImage of the root (cua makes its MIT-SHM segment after the first answer), the same X work in every engine",
    section: 'Decision Log, M1a.4 (MIT-SHM: the cold first desktop capture is parity)',
  },
];

/** The parity that declares this verdict's series, or null. */
export function declaredParity({ op, scene, series }, list = PARITY) {
  return list.find((p) => p.op === op && p.scene === scene && p.series === series) ?? null;
}

/** A deviation as recorded in results.jsonl and summary.md (without its matcher). */
export const describe = ({ answer, ...rest }) => rest;
