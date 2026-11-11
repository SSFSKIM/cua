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

/**
 * The refusal of the first acting request while a drag's after-release watch left something pending (dnd.rs
 * `pending_refusal`, M4's T14): a late drag and drop, an unconfirmed drop or a failed watch, and the request not run.
 */
export const PENDING_REFUSAL = /^Pending from your last drag, (a late drag and drop|an unconfirmed drop|a failed watch|a drag handle released by timeout): .*; this \S+ request was not run, so read the window before sending it again$/s;

/** cua's answer for a window whose frame cannot be told apart from its duplicates' (identity.rs). */
export const DUPLICATES = /^Window \d+ matches several accessibility windows; close or retitle the duplicates$/;

/** The refusal of a point-based element action on LibreOffice whose VCL position cannot be corrected (M4's T16). */
export const VCL_UNTRUSTED = /^LibreOffice's reported position for this element can't be trusted until the pointer has moved over its window; nothing was sent$/;

/** The counts of cua's `truncated` (Interfaces: `{nodes: u32, depth: u32, failed: u32}`). */
const TRUNCATION_KEYS = ['nodes', 'depth', 'failed'];

/** The vendor's admission limits, which cua's read keeps (Design, The tree read): 5,000 nodes, depths 0–63. */
export const NODE_LIMIT = 5000;
export const DEPTH_LIMIT = 63;

const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** Exactly the three counts, each an unsigned 32-bit integer (the `--stats` record's cut points, zeros included). */
const wellFormedCounts = (truncated) =>
  truncated !== null &&
  typeof truncated === 'object' &&
  !Array.isArray(truncated) &&
  Object.keys(truncated).length === TRUNCATION_KEYS.length &&
  TRUNCATION_KEYS.every((k) => isCount(truncated[k]));

/** Whether counts name a cut point. */
const cutAt = (truncated) => TRUNCATION_KEYS.some((k) => truncated[k] > 0);

/**
 * A `truncated` as the wire carries it: exactly the three counts, each an unsigned 32-bit integer, and at least one of
 * them above 0, since the engine reports no field for a read that cut nothing.
 */
export function wellFormedTruncation(truncated) {
  return wellFormedCounts(truncated) && cutAt(truncated);
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
const FIXTURE_CUTS = { 'over-budget': { causes: 'the element limit and the depth limit', holds: (t) => t.nodes > 0 && t.depth > 0 } };

/**
 * The answer to a background Gecko click, scroll, move or drag the real pointer left the window during (T19,
 * engine/within.rs `pointer_left`).
 */
export const GECKO_POINTER_LEFT = /^\S.* may not have taken the (click|scroll|move|drag): the desktop pointer left its window during the \1, and \S.* takes background pointer input only while the pointer is in its window\. Read the window to see what happened before trying again$/;

/** device.mjs's Firefox cases refused by the real pointer's place (T19), each declared against the vendor. */
export const GECKO_POINTER_REFUSALS = ['firefox_click_pointer_out_shared', 'firefox_click_pointer_under_shared', 'firefox_right_click_pointer_out_shared', 'firefox_scroll_pointer_out_shared', 'firefox_move_pointer_out_shared', 'firefox_drag_pointer_out_shared'];

/**
 * `drag_handle`'s lifecycle answers (M4's T17, engine/handle.rs and stray.rs): the refusal of desktop pointer input
 * while a handle is held, of a start while another client holds the pointer, and the end's answers when another
 * client's grab cut the hold, when its watch failed, or when the person moved the pointer from the last move.
 */
export const HANDLE_HELD = /^a drag handle is held; end it before sending desktop pointer input \(a handle that gets no request for \d+(\.\d+)? s is released where it is\)$/;
export const HANDLE_POINTER_ELSEWHERE = /^another application holds the pointer \(an open menu, or a drag in progress\); nothing was pressed\. Close it or wait, then start the handle again$/;
export const HANDLE_END = new RegExp(
  [
    String.raw`\S.* may not have received your drag: another application took the pointer while the handle was held\. Read the window to see what happened before dragging again`,
    String.raw`the pointer watch on your drag handle into \S.* failed \(.*\), so whether \S.* received the drag cannot be told\. Read the window to see what happened before dragging again`,
    String.raw`\S.* may not have received your drag where you asked: the desktop pointer was moved while the handle was held, so it was released (at \(-?\d+, -?\d+\)|on another screen) instead of at \(-?\d+, -?\d+\)\. Read the window to see what happened before dragging again`,
  ]
    .map((s) => `^${s}$`)
    .join('|'),
  's',
);
const HANDLE_SECTION = 'Plan of Work, M4, T17; Decision Log, 2026-11-10 (T17: drag_handle\'s lifecycle, ruled before any code), and the design session\'s rulings on its review (2026-11-11)';

export const DEVIATIONS = [
  // M4's T17 (#250): drag_handle's lifecycle. The vendor presses into another client's grab and answers ok (the page
  // never sees the press: task 73's probe, 60 of 60 for the newest build and for cua 0.3.0), answers ok for a hold
  // another client's grab cut or a pointer the person moved, and lets desktop pointer input end a held handle
  ...['click', 'move', 'scroll', 'drag', 'move_relative', 'drag_handle'].map((op) => ({
    op,
    field: 'error',
    answer: (c) => c.ok === false && HANDLE_HELD.test(String(c.error)),
    reason:
      "while a drag_handle holds button 1, pointer input through XTEST (the desktop route, and the foreground route after its activation) would end the hold with its own button or move the held pointer, so cua refuses it, a second start included, naming the idle bound after which cua releases a handle that gets no request of its own (30 s); keys and the background route run. The vendor sends it",
    section: HANDLE_SECTION,
  })),
  {
    op: 'drag_handle',
    field: 'error',
    answer: (c) => c.ok === false && (HANDLE_POINTER_ELSEWHERE.test(String(c.error)) || HANDLE_END.test(String(c.error))),
    reason:
      "a handle's start tries a pointer grab, under a server grab and given up in the same request batch, and is refused with nothing pressed while another client holds the pointer, whose grab would take the press; its end, after its release, answers an error when another client's grab crossed the target before the release with no drag and drop begun, when its watch failed, or when the real pointer was not where the last request put it. The vendor presses into the grab and answers ok every time",
    section: HANDLE_SECTION,
  },
  // M4's T19 (#353): Gecko's pointer kinds by the real pointer. The vendor answers ok for a Gecko window's background
  // click, scroll, move and drag wherever the person's pointer is, and Gecko ignores them while it is outside the
  // window or under another window over it (0 of 10 in every such cell, the pinned build's included, on `:0` and on a
  // private display); cua refuses them in shared mode with the Device mode sentence, sending nothing, and takes the
  // foreground route in dedicated mode. A drag the pointer leaves the window during is sent and answered with an error
  // naming the pointer, never success.
  ...GECKO_POINTER_REFUSALS.map((op) => ({
    op,
    scene: 'device-firefox',
    field: 'answer',
    answer: (c) => c.ok === false && DEVICE_REFUSAL.test(String(c.error)),
    reason:
      "Firefox takes background pointer input only while the real pointer is in its window: with the pointer outside it or under another window over it, the vendor's request answers ok and Gecko takes nothing (m4/pointer-route/: 0 of 10 in every such cell, the pinned build's and cua's own events alike), so cua refuses it in shared mode with nothing sent, where the vendor answers a false success",
    section: 'Plan of Work, M4, T19; Decision Log, 2026-11-10 (T15 closed as superseded; T19 added)',
  })),
  {
    op: 'drag',
    field: 'error',
    answer: (c) => c.ok === false && GECKO_POINTER_LEFT.test(String(c.error)),
    reason:
      "a background click, scroll, move or drag into Firefox the real pointer leaves the window during is answered with an error naming the pointer, since Gecko stops taking the request's events once the pointer is out; the vendor answers ok",
    section: 'Plan of Work, M4, T19',
  },
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
    // no operation and no scene: every read that was cut, whatever reads it and wherever (truncationMismatch requires
    // the field exactly as the engine's record of the read's cut points calls for it, and refuses it elsewhere)
    field: 'truncated',
    answer: (c) => c.ok === true && wellFormedTruncation(c.output?.truncated) && cutShownByTree(c.output.truncated, c.output),
    reason:
      "cua's get_window_state adds `truncated: {nodes, depth, failed}` beside the tree wherever its read was cut, the points where it left out a node it had listed (the element limit, the depth limit, a failed GetRoleName), each hiding a subtree never read, so the facade can say the tree is cut; the vendor drops those nodes silently and its JavaScript ignores the field. The tree itself is still the vendor's exactly. Each count is a u32, one of them above 0, and each agrees with the limits its tree shows; a read that was not cut carries no field",
    section: 'Design, Observation (The tree read: truncated); Decision Log, M3.2 (the line says "at least") and M4 pre-flight (Observation)',
  },
  // M4's T4: minimized windows (Design, Minimized windows)
  ...['list_windows', 'list_apps'].map((op) => ({
    op,
    field: 'minimized',
    answer: (c) => c.ok === true && minimizedListed(op, c.output) > 0,
    reason:
      "cua lists an iconified window (WM_STATE Iconic, not viewable) with the additive field `minimized: true`, which the vendor leaves out, so a bound window the person minimizes stays readable through the policy and the facade instead of becoming `Window <id> is unavailable.`; with those windows set aside the list is the vendor's",
    section: 'Design, Observation (Minimized windows); Decision Log, review round 1 (minimized listing)',
  })),
  {
    op: 'activate_window',
    scene: 'minimized',
    field: 'answer',
    answer: (c) => c.ok === true,
    reason:
      "activate_window on a minimized window succeeds once the window manager has mapped it: the vendor builds, like cua 0.3.0, send SetInputFocus behind the activation request while the window is still unmapped and answer BadMatch for an activation that happened (Openbox maps and activates it within 50 ms). cua waits for the map, at most 1 s, and sets the focus again; a window still unmapped then answers the same error",
    section: 'Decision Log, M4 pre-flight (C22); M4 T4',
  },
  // M4's T5: identity (Design, Window association), against the vendor's one-node X11 tree (behaviour §4)
  ...['identity', 'identity-gtk3', 'identity-gtk4'].map((scene) => ({
    op: 'get_window_state',
    scene,
    field: 'identity',
    answer: (c) => (c.ok === true && c.output?.ax_tree_source === 'at_spi') || (c.ok === false && DUPLICATES.test(String(c.error))),
    reason:
      "windows of one process with one title and one size: where the vendor builds answer every read with a one-node X11 tree that looks like an empty window, cua tells their frames apart by each frame's screen extents against the window's place (its client's or its window manager frame's rectangle), then by the frame's `active` state against _NET_ACTIVE_WINDOW, and reads the window's own tree; what still leaves several, and GTK 4 (window-relative extents), answers `Window <id> matches several accessibility windows; close or retitle the duplicates`, on reads and on every request that associates, never the X11 fallback",
    section: 'Design, Observation (Window association); Decision Log, M4 pre-flight (F5, C14, C15); M4 T5',
  })),
  {
    op: 'get_window_state',
    scene: 'identity-kate',
    field: 'identity',
    answer: (c) => c.ok === true && c.output?.ax_tree_source === 'at_spi',
    reason:
      "kate titles its window `<file>  — Kate` and names its frame `<file> `, which no engine's title match finds, so every vendor build answers kate's X11 tree; cua reads the frame whose trimmed Name is the title's caption (the text before its last ` — `), when it is the only such frame of the process and its extents put it at the window",
    section: 'Plan of Work, M4 (an association rule for kate\'s frame Name); Decision Log, M4 pre-flight (F5); M4 T5',
  },
  {
    // no operation and no scene: whatever acts first after a Chromium drag whose after-release watch left something
    // pending (M4's T14)
    field: 'error',
    answer: (c) => c.ok === false && PENDING_REFUSAL.test(String(c.error)),
    reason:
      "after a Chromium drag the engine let drop, or a Chromium drag_handle's end (M4's T17), cua watches the release off the request path: a drag and drop that started only after the release (cancelled at once with an Escape on the drag's route), a Chrome drop that Chrome did not confirm with its own activation request within 150 ms of the release, a Chrome drag's or handle's drop over a window Chrome's request cannot confirm, an Electron drop whose drag loop did not show an accepting drag cursor at the release (known by its own image in the installed cursor themes), the watch's own failure, or a drag_handle cua released after 30 s with no request of its own is pending; every reply then carries it as `notice` beside the vendor's keys, and the first acting request is refused with it, not run, naming what is pending and the request. The vendor answers the drag ok and runs the next request",
    section: 'Plan of Work, M4 T14 and T17; Decision Log, M4 pre-flight (the Chrome drop), the design session\'s rulings on task 68 (2026-11-09, 2026-11-10)',
  },
  // M4's T16: LibreOffice's VCL positions (engine vcl.rs; writer-drag.mjs `--plan element`)
  ...['click', 'type_text', 'scroll'].map((op) => ({
    op,
    scene: 'libreoffice-element',
    field: 'point',
    answer: (c) => c.ok === true || (c.ok === false && VCL_UNTRUSTED.test(String(c.error))),
    reason:
      "LibreOffice 24.2 on its gtk3 VCL plugin reports what VCL draws (a document's paragraphs, a sheet's cells, a slide's shapes) 27 px too high, the native menu bar's height, after a ConfigureNotify and until the next pointer event (its frame's position set to the client's origin by the configure, to VCL's widget by each pointer event, `vcl/unx/gtk3/gtkframe.cxx` `UpdateGeometryFromEvent`); the pinned build right-clicks there, above the element, and answers ok. cua moves a LibreOffice element's VCL extents by the GTK host panel's offset from VCL's root pane wherever the two disagree in the menu bar's shape, so an element right click, a paste's focusing click and an element scroll land on the element, and refuses them, nothing sent, wherever the structure is another one. Left element clicks are DoAction and take no point. Measured on LibreOffice 24.2.7 (vcl gtk3); another version or VCL plugin may differ",
    section: 'Plan of Work, M4 T16; the design session\'s ruling (2026-11-10: B, the refusal for an unrecognized structure)',
  })),
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

/** The windows of a `list_windows` answer, or every application's windows of a `list_apps` answer. */
const windowsOf = (op, output) => (op === 'list_apps' ? output.flatMap((app) => app.windows ?? []) : output);

/** How many windows an answer lists as minimized (`minimized: true`). */
function minimizedListed(op, output) {
  if (!Array.isArray(output)) return 0;
  return windowsOf(op, output).filter((w) => w?.minimized === true).length;
}

/**
 * A listing as compared: its minimized windows (`minimized: true`) set aside, with the deviation that declares them,
 * where one does; otherwise the answer as it came. Only windows whose field is exactly `true` are set aside, so a
 * malformed field stays in the answer and differs from the vendor's; with them set aside the rest must equal the
 * vendor's list, which leaves minimized windows out (M4's T4).
 */
export function setAsideMinimized({ op, scene, response }, list = DEVIATIONS) {
  if (!['list_windows', 'list_apps'].includes(op) || !response.ok || minimizedListed(op, response.output) === 0) return { response, deviation: null };
  const deviation = declaredDeviation({ op, scene, field: 'minimized', candidate: response }, list);
  if (!deviation) return { response, deviation: null };
  const shown = (w) => w?.minimized !== true;
  const output = op === 'list_apps' ? response.output.map((app) => ({ ...app, windows: (app.windows ?? []).filter(shown) })) : response.output.filter(shown);
  return { response: { ...response, output }, deviation };
}

const show = (truncated) => (truncated === undefined ? 'none' : JSON.stringify(truncated));

/**
 * Where a cua read's `truncated` is not what the engine's own record of its cut points calls for; null where it is.
 * `stats` is the engine's `--stats` line for that very request (engine.mjs): its `tree` record names the source the
 * answer took and counts the read's cut points, zeros included, from the counters the field is built from
 * (engine.rs `get_window_state`). Exact both ways: a record with a cut point on an accessibility read requires the
 * field with the same counts, and a record without one requires no field (the X11 fallback publishes nothing, whatever
 * its record counts: no accessibility read made that tree). A missing, unparseable or malformed record fails, since no
 * record of the cut points is not a record of none. On a harness page built to be cut (`FIXTURE_CUTS`), the record
 * must also count each cut the page is built with, so an engine whose record and field agree on nothing still fails
 * there. The record's own counts are exact by the engine's fake-bus tests (tree/tests.rs).
 */
export function truncationMismatch({ scene, state, stats }) {
  if (stats === undefined || stats === null) return 'no --stats line for the read, so nothing records where it was cut';
  const { tree } = stats;
  if (tree === undefined) return 'its --stats line has no tree record';
  if (tree === null || typeof tree !== 'object' || typeof tree.source !== 'string' || !wellFormedCounts(tree.truncated)) {
    return 'its --stats tree record is malformed: it needs the source and the cut points as three u32 counts';
  }
  if (tree.source !== state.ax_tree_source) return `its --stats tree record names the source ${tree.source} where the answer has ${state.ax_tree_source}`;
  const recorded = tree.source === 'at_spi' && cutAt(tree.truncated) ? tree.truncated : undefined;
  const fixture = FIXTURE_CUTS[scene];
  if (fixture && !(recorded && fixture.holds(recorded))) return `the ${scene} page is built to be cut by ${fixture.causes}; the record has ${show(tree.truncated)}`;
  if (recorded === undefined) return state.truncated === undefined ? null : `the answer has truncated ${show(state.truncated)} where the record has no cut point`;
  if (state.truncated === undefined) return `the record has cut points ${show(recorded)} and the answer no truncated`;
  if (!wellFormedCounts(state.truncated) || TRUNCATION_KEYS.some((k) => state.truncated[k] !== recorded[k])) {
    return `the answer's truncated ${show(state.truncated)} differs from the record's ${show(recorded)}`;
  }
  return null;
}

/** Half of each limit: a read no larger and no deeper cannot have reached either. */
const WELL_BELOW = { nodes: NODE_LIMIT / 2, depth: Math.floor(DEPTH_LIMIT / 2) };

/**
 * Where a cua read's `truncated` disagrees with what the harness's own page is known to hold, for a path with no
 * `--stats` record (the two-services instrument, whose engines cua's service spawns); null where it agrees. `state` is
 * the read's answer; `whole`, for a read filtered by a query (the engine filters after its read, so the cut is the
 * read's), the same window's whole read.
 * - A page built to be cut (`FIXTURE_CUTS`) carries a well-formed field counting each cut it is built with, on every
 *   read, filtered or not; a whole read's field also agrees with its tree (the declaration).
 * - Any other page carries no field, and its window's whole read is well below both limits (`WELL_BELOW`), so neither
 *   limit can have cut it. Without the record that is all this path can tell: a failed GetRoleName there, or a read
 *   near a limit, is judged only where the record is (`truncationMismatch`).
 */
export function fixtureTruncationMismatch({ scene, state, whole = state }, list = DEVIATIONS) {
  const fixture = FIXTURE_CUTS[scene];
  if (fixture) {
    const counted = wellFormedTruncation(state.truncated) && fixture.holds(state.truncated);
    const agrees = state !== whole || declaredDeviation({ scene, field: 'truncated', candidate: { ok: true, output: state } }, list) !== null;
    return counted && agrees ? null : `the ${scene} page is built to be cut by ${fixture.causes}; the read has truncated ${show(state.truncated)}`;
  }
  if (state.truncated !== undefined) return `the ${scene} page is not built to be cut, and the read has truncated ${show(state.truncated)}`;
  const { nodes, deepest } = extent(whole);
  if (nodes > WELL_BELOW.nodes || deepest > WELL_BELOW.depth) {
    return `with no record of its cut points, a read is judged uncut only well below the limits (${WELL_BELOW.nodes} nodes, depth ${WELL_BELOW.depth}); the ${scene} window's whole read has ${nodes} nodes, the deepest at depth ${deepest}`;
  }
  return null;
}
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
 * `[{op, route, series, reason, section}]`. None is declared: M1a's one, desktop `move`'s later requests, closed when
 * M4's T9 dropped the pause after a desktop path's leading motion, the one at the pointer's own position (Decision
 * Log, T9).
 */
export const SPEED_GAPS = [];

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
      "the scene's Chrome window is fully covered, where Chromium ignores background text-selection, scrollbar-thumb and drag-and-drop drags in every engine (m31-drag-covered: 0/10 in the pinned build and cua); cua refuses a drag into Chromium unless every point of its path is visible in the window, because it cannot tell before sending a drag that would land from one that would not. So a covered drag that lands in the vendor is refused: this pad's, and a range's (9/10 in the pinned build) and a canvas's (10/10). On a private display M4's T13 saw every covered path survive (M3.1's covered misses did not reproduce there), so no part of a path decided and no start role predicted anything: nothing was adopted and the rule stands (T15)",
    section: 'Decision Log, M3.1 (Chromium Drag unless_path_unobscured); m3/kinds/ runs m31-drag-covered, m31-drag-partial, m31-drag-partial-top; m4/drop-signals/ (T13), m4/drag-predicates/ (T15)',
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
