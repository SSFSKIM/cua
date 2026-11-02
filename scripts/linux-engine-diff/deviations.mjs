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

/**
 * The refusal while the display's unconfirmed-paste window is open (Decision Log, M2.1; M2 whole-branch review: the
 * window is display-wide, a root-window record every cua engine reads).
 */
export const PREVIOUS_UNCONFIRMED = /^a previous paste could not be confirmed and may still be read; nothing was sent; retry after \d+ s$/;

const previousUnconfirmed = (op) => ({
  op,
  field: 'error',
  answer: (c) => c.ok === false && PREVIOUS_UNCONFIRMED.test(String(c.error)),
  reason:
    "for 10 s after a paste that could not be confirmed and whose target was not served in full, any cua engine on the display (the one that pasted, another, or one started after it exited) refuses type_text, clipboard_write and a clipboard_read whose route makes the application Copy, before dispatch with nothing sent, so the earlier paste's target is never served another text by a late conversion; the vendor never refuses here",
  section: 'Decision Log, M2.1 (serving generations across pastes); M2 whole-branch review (the display-wide window)',
});

/** The counts of cua's `truncated` (Interfaces: `{nodes: u32, depth: u32, failed: u32}`). */
const TRUNCATION_KEYS = ['nodes', 'depth', 'failed'];

/** The vendor's admission limits, which cua's read keeps (Design, The tree read): 5,000 nodes, depths 0–63. */
export const NODE_LIMIT = 5000;
export const DEPTH_LIMIT = 63;

const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/**
 * A `truncated` as the wire carries it: exactly the three counts, each an unsigned 32-bit integer, and at least one of
 * them above 0, since the engine reports no field for a read that cut nothing.
 */
export function wellFormedTruncation(truncated) {
  if (truncated === null || typeof truncated !== 'object' || Array.isArray(truncated)) return false;
  const keys = Object.keys(truncated);
  return keys.length === TRUNCATION_KEYS.length && TRUNCATION_KEYS.every((k) => isCount(truncated[k])) && TRUNCATION_KEYS.some((k) => truncated[k] > 0);
}

/** A read's tree as its limits see it: its node count and the depth of its deepest node (the root at 0). */
function extent(state) {
  let nodes = 0;
  let deepest = -1;
  const visit = (node, depth) => {
    nodes += 1;
    deepest = Math.max(deepest, depth);
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  if (state.ax_tree) visit(state.ax_tree, 0);
  return { nodes, deepest };
}

/**
 * Whether a well-formed `truncated` agrees with the whole read it came with, from what that tree shows of its limits:
 * a node the element limit refused means 5,000 nodes were admitted (those whose `GetRoleName` failed are admitted and
 * dropped, so they count with the tree's); a child the depth limit refused hangs under a node at depth 63; and only an
 * accessibility read is cut (the X11 fallback carries nothing). A failed `GetRoleName` leaves nothing in the tree to
 * see, so `failed` stands on the engine's word, which its fake-bus tests check.
 */
function cutShownByTree(truncated, state) {
  if (state.ax_tree_source !== 'at_spi') return false;
  const { nodes, deepest } = extent(state);
  if (truncated.nodes > 0 && nodes + truncated.failed !== NODE_LIMIT) return false;
  if (truncated.depth > 0 && deepest !== DEPTH_LIMIT) return false;
  return true;
}

/**
 * What the harness's own pages are built to cut, which their reads must count: a fixture's proof, not a declaration.
 * The over-budget page (pages/over-budget.html) nests a branch past depth 63 before far more than 5,000 elements.
 */
const FIXTURE_CUTS = { 'over-budget': (t) => t.nodes > 0 && t.depth > 0 };

export const DEVIATIONS = [
  appliedWhereNoVendorDoes('type_text', 'gnome-text-editor', 'GTK 4 ignores the background route, where both builds send their text, and cua takes the foreground route in dedicated mode (M0.4 matrix; Decision Log, M2 pre-flight)'),
  appliedWhereNoVendorDoes('clipboard_write', 'gedit', "both builds paste a snapshot with EditableText.PasteText after taking CLIPBOARD themselves; GTK 3's text-view PasteText hands its clipboard request a stack pointer, so whenever another process owns CLIPBOARD its callback reads freed stack and inserts nothing (gedit's criticals; arm64 crashed), and the builds fail after 10 s (R/F §7; #268); cua pastes it with the family's chord"),
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
  ...['type_text', 'clipboard_write', 'clipboard_read'].map(previousUnconfirmed),
  {
    // no operation and no scene: every read that was cut, whatever reads it and wherever (truncationAsDeclared
    // requires the field there and refuses it on a read that was not)
    field: 'truncated',
    answer: (c) => c.ok === true && wellFormedTruncation(c.output?.truncated) && cutShownByTree(c.output.truncated, c.output),
    reason:
      "cua's get_window_state adds `truncated: {nodes, depth, failed}` beside the tree wherever its read was cut, the points where it left out a node it had listed (the element limit, the depth limit, a failed GetRoleName), each hiding a subtree never read, so the facade can say the tree is cut; the vendor drops those nodes silently and its JavaScript ignores the field. The tree itself is still the vendor's exactly. Each count is a u32, one of them above 0, and each agrees with the limits its tree shows; a read that was not cut carries no field",
    section: 'Design, Observation (The tree read: truncated); Decision Log, M3.2 (the line says "at least") and M4 pre-flight (Observation)',
  },
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
  return list.find((d) => (d.op === undefined || d.op === op) && (d.scene === undefined || d.scene === scene) && d.field === field && d.answer(candidate)) ?? null;
}

/**
 * A state answer as compared: its `truncated` set aside, with the deviation that declares it, where one does for this
 * operation and scene; otherwise the answer as it came, so an undeclared `truncated` stays in the state and differs
 * from every vendor build's (normalize.mjs).
 */
export function setAsideTruncation({ op, scene, response }, list = DEVIATIONS) {
  if (!response.ok || response.output?.truncated === undefined) return { response, deviation: null };
  const deviation = declaredDeviation({ op, scene, field: 'truncated', candidate: response }, list);
  if (!deviation) return { response, deviation: null };
  const { truncated, ...output } = response.output;
  return { response: { ...response, output }, deviation };
}

/**
 * Whether a cua read carries `truncated` exactly when it was cut. `state` is the read's answer; `whole`, for a read
 * filtered by a query (the engine filters after its read, so the cut is the read's), the same window's whole read.
 * - A whole read: present, the field is the declared answer, its counts shown by its tree; absent, nothing shows a cut,
 *   so its tree is under the element limit or is the X11 fallback. A tree at exactly 5,000 nodes with nothing more to
 *   list would be a false failure here; the limits leave no other sign of the element cut.
 * - A filtered read: the field where the whole read had one, well formed, and none where it had none.
 * - On a harness page built to be cut (`FIXTURE_CUTS`), the field also counts each cut the page is built with.
 */
export function truncationAsDeclared({ scene, state, whole = state }, list = DEVIATIONS) {
  const { truncated } = state;
  const fixture = FIXTURE_CUTS[scene];
  if (fixture && !(wellFormedTruncation(truncated) && fixture(truncated))) return false;
  if (whole !== state) return (truncated === undefined) === (whole.truncated === undefined && !limitReached(whole)) && (truncated === undefined || wellFormedTruncation(truncated));
  if (truncated === undefined) return !limitReached(state);
  return declaredDeviation({ scene, field: 'truncated', candidate: { ok: true, output: state } }, list) !== null;
}

/** A whole accessibility read that admitted as many nodes as the element limit allows. */
const limitReached = (state) => state.ax_tree_source === 'at_spi' && extent(state).nodes >= NODE_LIMIT;

/**
 * Whether the count a rendered state's truncation line shows (`splitTruncationLine`, null for no line) is the one its
 * read's `truncated` calls for: the sum of the counts, and no line when the read reported none or cut nothing.
 */
export function lineAsReported(shown, truncated) {
  const total = truncated ? TRUNCATION_KEYS.reduce((sum, k) => sum + truncated[k], 0) : 0;
  return total > 0 ? shown === total : shown === null;
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

/** The Device mode sentence (Design, Device mode and the foreground route), whatever the application. */
export const DEVICE_REFUSAL = / does not accept background input; use a dedicated desktop or activate the window first$/;

/** The drag-and-drop cancel's answer (dnd.rs): a drag Chrome turned into a drag and drop, refused before the drop. */
export const DND_REFUSAL = /^\S.* began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped\. Use a dedicated desktop, or activate the window first$/;

/**
 * The declared refusals (M3.1): an operation of the differential run that the vendor builds send and that lands, which
 * cua refuses in shared mode because the scene's window is in a condition its family lists (families.rs), so its
 * input would be ignored in other cases of the same kind. A loss against the vendor, recorded plainly: its verdict is
 * **declared refusal**, listed apart and never a pass, and holds only while every cua sample answers the Device mode
 * sentence with the witness unchanged; anything else fails. `[{op, scene, reason, section}]`.
 */
export const REFUSALS = [
  {
    op: 'drag',
    scene: 'chrome-input',
    reason:
      "the scene's Chrome window is fully covered, where Chromium ignores background text-selection, scrollbar-thumb and drag-and-drop drags in every engine (m31-drag-covered: 0/10 in the pinned build and cua); cua refuses a drag into Chromium unless every point of its path is visible in the window, because it cannot tell before sending a drag that would land from one that would not. So a covered drag that lands in the vendor is refused: this pad's, and a range's (9/10 in the pinned build) and a canvas's (10/10). An M4 candidate decides by the AT-SPI role at the path's start",
    section: 'Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top',
  },
  {
    // the drag-and-drop experiment's Chrome cell (dnd.mjs), whose cua lane answers the cancel
    op: 'drag',
    scene: 'dnd:chrome',
    answer: DND_REFUSAL,
    reason:
      "in shared mode, Chrome's HTML5 drops are refused unless Chrome is already the active window, holds the focus and is fully unobscured: the vendor lands them (m31-dnd-visible: 9/10 in the pinned build) while its drop activates, focuses and raises Chrome's window, which nothing puts back. cua cancels the drag and drop before the drop (Escape on the background route) and says so; in dedicated mode, or with Chrome already in front, the drop goes ahead",
    section: 'Decision Log, M3.1 (Chrome drag and drop); m3/kinds/ runs m31-dnd-visible, m31-dnd-candidate',
  },
];

/** The declared refusal of an operation on a scene, or null. */
export function declaredRefusal({ op, scene }, list = REFUSALS) {
  return list.find((r) => r.op === op && r.scene === scene) ?? null;
}

/** A deviation as recorded in results.jsonl and summary.md (without its matcher). */
export const describe = ({ answer, ...rest }) => rest;
