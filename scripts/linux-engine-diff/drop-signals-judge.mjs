// The drop-signals experiment's judgements (#171 M4, T13: Chromium drop signals, measured only), pure: the drop-signals
// page's status (pages/drop-signals.html), each drag's outcome and its signals from `xprobe drop-watch`, the never-take
// rules read at the start point, and the count tables the experiment reports (drop-signals.mjs). T13 adopts nothing:
// every table counts, and none of them passes or fails the run.

/** The freeze cells' browser stops end this many ms after the drag is sent (drop-signals.mjs `freezeOf`). */
export const FREEZE_ENDS = [230, 240, 250, 255, 260, 280, 330];
/**
 * The same cells' stop ends against 0.4.2's hold (task 121; the design session's ruling 929.1): a late take needs the
 * browser's thaw to fall just before the engine's release, so its drag start is read after the release went out but
 * before the browser reads the release (T13: thawed 20 ms early the hold takes it, thawed after the release Chrome refuses
 * the drag). 0.4.2 releases a frozen, identified Chrome's drag at press + 650 (its pings unanswered: the extended hold),
 * and an Electron or unidentified source's at press + 450, so the sweep brackets both.
 */
export const LATE_FREEZE_ENDS = [440, 450, 600, 620, 630, 640, 645, 650, 655, 660, 670, 700];
/** The same, millisecond by millisecond around 650, where the idle sweep's late takes came (task 121). */
export const LATE_FREEZE_FINE = [646, 647, 648, 649, 651, 652, 653, 654];
/** Earlier thaws for the inside band, swept on arm64 at twice the load (ruling 954: task 122, `freeze-042-inside`). */
export const LATE_FREEZE_INSIDE = [500, 550];

/**
 * The ends of V5's lost-motion stops, ms after the drag's send (`prefreeze-<to>`): on the guarded route, inside the
 * path's end rest (30, 40) and past its release; on the held route, before the hold's refresh stops (150, 200), after
 * its last refresh (215, 230: a rest before the bound) and past the release (260, 300).
 */
export const PREFREEZE_ENDS = [30, 40, 150, 200, 215, 230, 260, 300];

/** The page's drag sources (`data-src`), in its status line's order. */
export const SOURCES = ['plain', 'nested', 'nested-late', 'slider', 'dragstart-150', 'press-150', 'dragstart-400', 'press-400', 'dragstart-500', 'dragstart-600', 'link', 'image', 'seltext', 'canvas-drag'];

/** The drags a load needs before any count of it can stand for an adoption (the design session's 300, M4 pre-flight). */
export const MIN_DRAGS = 300;

/** How long after the release a drop's signal may come and still count: the late-take watch's lifetime (`dnd::SETTLE`). */
export const AFTER_RELEASE_WINDOW_MS = 300;

/**
 * How long before the engine's release stamp the release itself may have gone. The engine stamps after sending it, and
 * on the server's clock Chrome's return to its drag loop's cursor at the release came up to 4.8 ms before the stamp, and
 * the release event's own time (Chrome's activation request carries it) up to 6.5 ms before it (task 68's load2).
 */
export const RELEASE_STAMP_MARGIN_MS = 10;

/** The server's clock counts whole milliseconds: a change's server time reads up to this much early. */
const SERVER_TICK_MS = 1;

/** The X server's resource-id mask on the harness's servers (Xvfb and Xorg): a client's windows share the bits above. */
export const RESOURCE_ID_MASK = 0x1fffff;

const sameClient = (a, b, mask = RESOURCE_ID_MASK) => typeof a === 'number' && typeof b === 'number' && a !== 0 && (a & ~mask) >>> 0 === (b & ~mask) >>> 0;
const round1 = (v) => Math.round(v * 10) / 10;

/** Nearest-rank percentiles of a list: `{p50, p95, max}`, null for none. */
export function percentiles(values) {
  const s = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  const at = (p) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return { p50: at(50), p95: at(95), max: s.at(-1) };
}

/** The page's status lines (every accessible name and text the tree read gave), parsed. A line not found is null. */
export function parseDropStatus(texts) {
  const find = (re) => texts.map((t) => String(t).match(re)).find(Boolean) ?? null;
  const out = { dnd: null, last: null, select: null, range: null, scroll: null, canvas: null, press: null };
  // the last record's `seq`, the press its dragstart followed, since the harness-fix wave (a sitting before has none)
  const d = find(/^dnd (.*) last (\S+)(?: seq (\d+))? effect (-?\d+) lat (-?\d+) dur (-?\d+)$/);
  if (d) {
    out.dnd = {};
    for (const [, src, starts, drops] of d[1].matchAll(/(\S+) (\d+)\/(\d+)/g)) out.dnd[src] = { starts: Number(starts), drops: Number(drops) };
    out.last = { src: d[2], ...(d[3] === undefined ? {} : { seq: Number(d[3]) }), effect: Number(d[4]), lat: Number(d[5]), dur: Number(d[6]) };
  }
  const sel = find(/^select seq (\d+) text (.*)$/);
  if (sel) out.select = { seq: Number(sel[1]), text: sel[2] === 'none' ? '' : sel[2] };
  const r = find(/^range seq (\d+) inputs (\d+) value (\d+)$/);
  if (r) out.range = { seq: Number(r[1]), inputs: Number(r[2]), value: Number(r[3]) };
  const sc = find(/^scroll seq (\d+) max (\d+)$/);
  if (sc) out.scroll = { seq: Number(sc[1]), max: Number(sc[2]) };
  const c = find(/^canvas seq (\d+) moves (\d+)$/);
  if (c) out.canvas = { seq: Number(c[1]), moves: Number(c[2]) };
  const p = find(/^press seq (\d+) at (\d+)$/);
  if (p) out.press = { seq: Number(p[1]), at: Number(p[2]) };
  return out;
}

/**
 * The page cells (drop-signals.mjs `CELLS`): a cell either drags from a source (`src`, a drop counted when `zone`) or
 * is a kind with an effect of its own.
 */
export const CELL_SOURCE = { 'freeze-230': 'press-150', 'freeze-240': 'press-150', 'freeze-250': 'press-150', 'freeze-255': 'press-150', 'freeze-260': 'press-150', 'freeze-280': 'press-150', 'freeze-330': 'press-150', ...Object.fromEntries([...LATE_FREEZE_ENDS, ...LATE_FREEZE_FINE, ...LATE_FREEZE_INSIDE].map((to) => [`freeze-${to}`, 'press-150'])), plain: 'plain', nozone: 'plain', nested: 'nested', 'nested-late': 'nested-late', slider: 'slider', 'dragstart-150': 'dragstart-150', 'press-150': 'press-150', 'dragstart-400': 'dragstart-400', 'press-400': 'press-400', 'dragstart-500': 'dragstart-500', 'dragstart-600': 'dragstart-600', link: 'link', image: 'image', seltext: 'seltext', 'plain-long': 'plain', 'canvas-drag': 'canvas-drag', move: 'move' };
/** T14's and T17's cells' sources (drop-signals.mjs `CELLS`): each a drop the zone never counts. */
export const T14_SOURCE = { stall: 'plain', left: 'plain', 'inzone-out': 'inzone', 'long-left': 'plain', root: 'plain', xterm: 'plain', other: 'plain', slow: 'plain', moved: 'plain', 'prefreeze-linger-150': 'plain', ...Object.fromEntries(PREFREEZE_ENDS.map((to) => [`prefreeze-${to}`, 'plain'])) };

/**
 * The dropEffect code of the dragend this trial's own drag made (the page's `last` record), or null when the record is
 * not this trial's: the page keeps its last record until the next dragstart, and the runner carries the page across
 * trials and blocks. The record is this trial's when its source's drag and drop started between the reads before and
 * after the trial (its start count grew), the page counted this trial's press, the record is that source's, and its
 * dragend has come. Since the harness-fix wave the page stamps the record with the press its dragstart followed, which
 * must be this trial's (`seq`). A stored record from before the stamp is bound by the start count alone: its residue is
 * an earlier trial's dragstart first counted in this one, more than the runner's second after that trial's answer.
 */
export function ownDragend(r) {
  const cell = r.base ?? r.cell;
  const src = T14_SOURCE[cell] ?? CELL_SOURCE[cell];
  const { before, after } = r;
  const [b, a, last] = [before?.dnd?.[src], after?.dnd?.[src], after?.last];
  if (!src || !b || !a || !last || !(a.starts > b.starts) || last.src !== src || !(last.dur >= 0)) return null;
  const press = after.press?.seq;
  if (typeof press !== 'number' || press === before.press?.seq) return null;
  if (typeof last.seq === 'number' && last.seq !== press) return null;
  return last.effect;
}

/**
 * `ownDragend` on stamped evidence only, for the classifiers that excuse or list an answer by it (L4a's residue,
 * ruling 830's mismatch; task 102's re-review): the page's press stamp read before and after the drag, and the dragend
 * stamped with the after-press. A record with any stamp missing is null here, whatever the legacy verdict makes of it.
 */
export function stampedDragend(r) {
  const [before, after] = [r.before?.press?.seq, r.after?.press?.seq];
  if (!Number.isInteger(before) || !Number.isInteger(after) || r.after?.last?.seq !== after) return null;
  return ownDragend(r);
}

export const ZONE_CELLS = ['freeze-230', 'freeze-240', 'freeze-250', 'freeze-255', 'freeze-260', 'freeze-280', 'freeze-330', ...[...LATE_FREEZE_ENDS, ...LATE_FREEZE_FINE, ...LATE_FREEZE_INSIDE].map((to) => `freeze-${to}`), 'plain', 'nested', 'nested-late', 'slider', 'dragstart-150', 'press-150', 'dragstart-400', 'press-400', 'dragstart-500', 'dragstart-600', 'link', 'image', 'plain-long', 'canvas-drag', 'move'];

// ---------------------------------------------------------------------------------------------------------------
// where the path ended against the zone (the design session's rulings 957 and 961, task 128): a drop counts as landed
// only where the path ended. The page counts drops by source and records no drop position, so the judge places each
// cell's own path end against the zone's geometry; the pages are unchanged

/** pages/drop-signals.html `#zone`, in page pixels: its left and top edges, and its right and bottom ones (exclusive). */
export const ZONE = { left: 560, top: 100, right: 960, bottom: 620 };

/**
 * The border margin (ruling 961): a path that ends this close to the zone's border, inside or out, cannot be told apart
 * by geometry. 3 px: the drag's last step (the engine samples each segment about 1 px apart, at most √2 px on a
 * diagonal, `pointer.rs` `drag_samples`, so a browser one sample behind sits within 1.42 px of the end), rounded up to
 * 2, and 1 px for the page's origin, read from the accessible frame's whole-pixel extents. The zone's border is a CSS
 * edge with no border width, and the device scale is 1 (a row's end is the window, the page's origin and the cell's
 * page point summed, pixel for pixel), so neither adds to it. Every planned cell ends 8 px or more from the border.
 */
export const STALE_MARGIN_PX = 3;

/**
 * Each drop cell's path end in the window, in page pixels: the last point of its path (drop-signals.mjs `CELLS`, the
 * same for every run). The cells that end off the window (`OFF_WINDOW_CELLS`) have none: they end outside the zone.
 */
export const PATH_ENDS = {
  ...Object.fromEntries([...FREEZE_ENDS, ...LATE_FREEZE_ENDS, ...LATE_FREEZE_FINE, ...LATE_FREEZE_INSIDE].map((to) => [`freeze-${to}`, [570, 312]])),
  ...Object.fromEntries(PREFREEZE_ENDS.map((to) => [`prefreeze-${to}`, [570, 128]])),
  'prefreeze-linger-150': [575, 128],
  plain: [570, 128],
  'plain-long': [900, 300],
  nozone: [490, 128],
  nested: [570, 174],
  'nested-late': [570, 542],
  slider: [570, 220],
  'dragstart-150': [570, 266],
  'press-150': [570, 312],
  stall: [570, 128],
  'dragstart-400': [570, 358],
  'press-400': [570, 404],
  'dragstart-500': [570, 468],
  'dragstart-600': [570, 518],
  link: [570, 450],
  image: [570, 496],
  'canvas-drag': [570, 588],
  seltext: [100, 612],
  left: [500, 128],
  'inzone-out': [725, 632],
  'long-left': [500, 500],
  move: [725, 108],
};

/**
 * A point (page pixels) against a rectangle (`ZONE` by default): `inside`, `outside`, or `ambiguous` within `margin` of
 * its border on either side (by the distance to the nearest edge inside, to the rectangle outside).
 */
export function endAgainstZone([x, y], zone = ZONE, margin = STALE_MARGIN_PX) {
  const inside = x >= zone.left && x < zone.right && y >= zone.top && y < zone.bottom;
  const distance = inside
    ? Math.min(x - zone.left, zone.right - x, y - zone.top, zone.bottom - y)
    : Math.hypot(Math.max(zone.left - x, 0, x - zone.right), Math.max(zone.top - y, 0, y - zone.bottom));
  if (distance <= margin) return 'ambiguous';
  return inside ? 'inside' : 'outside';
}

/**
 * Where a drag's path ended against the zone: `outside` for a cell that ends off the window (the `moved` cell's release
 * too, put on the bare root before it), else its end (`ends`, `PATH_ENDS` by default) against the zone, or `unknown`
 * for a cell with none.
 */
export function pathEndOf(r, ends = PATH_ENDS) {
  const cell = r.base ?? r.cell;
  if (OFF_WINDOW_CELLS.includes(cell)) return 'outside';
  return ends[cell] ? endAgainstZone(ends[cell]) : 'unknown';
}

/**
 * A drag's landing as the gate counts it (ruling 957): null when the zone counted no drop; `landed` when it did and the
 * path ended inside the zone; `stale` when it did and the path ended outside the zone, "a drop at a stale position", a
 * wrong outcome; `ambiguous` when the path ended within the border margin (ruling 961), neither; `unknown` when the
 * judge cannot place the path's end. The measurement lane's accept proves nothing of where the path ended: the engine
 * sends every sample of the path before it reads the cursor (the review of 2dd2b0d8, finding 1).
 */
export function landingOf(r, ends = PATH_ENDS) {
  if (r.outcome?.landed !== true) return null;
  return { inside: 'landed', outside: 'stale', ambiguous: 'ambiguous', unknown: 'unknown' }[pathEndOf(r, ends)];
}

/** The fail a cell's drops at a stale position name (ruling 957), with the drags', and an unplaced landing's. */
function landingFails(name, list, stale, unknown, failed) {
  const which = (rs) => rs.slice(0, 3).map((r) => `#${r.i}`).join(', ');
  if (stale.length) failed.push(`${name}: a drop at a stale position (the path ended outside the zone, the drop landed in it) on ${stale.length} of ${list.length} (${which(stale)})`);
  if (unknown.length) failed.push(`${name}: a drop landed in a cell whose path end the judge cannot place against the zone, on ${unknown.length} of ${list.length} (${which(unknown)})`);
}

/** The ambiguous landings' finding (ruling 961): each named, counted, neither landed nor wrong. */
const ambiguousFinding = (rows) => `${rows.length} drop${rows.length === 1 ? '' : 's'} whose path ended within ${STALE_MARGIN_PX} px of the zone's border (${rows.slice(0, 5).map((r) => `${r.lane} ${r.cell} #${r.i}`).join(', ')}${rows.length > 5 ? ', …' : ''}): ambiguous, neither landed nor at a stale position (ruling 961)`;

/** The range runs' end values: even runs drag up to about 10, odd runs back to 0 (drop-signals.mjs `CELLS.range`). */
export const RANGE_END = (i) => (i % 2 === 0 ? 10 : 0);

/**
 * One drag's outcome from the page's status before and after it: whether its source's drag and drop started and
 * whether the zone counted its drop, or, for a kind with no source, whether its own line shows the effect on the press
 * the drag made (the page's press count moved on, and the line is that press's). A range's drag took when its value
 * ends within 3 of `rangeEnd` (its path's end; the short cells' by default).
 */
export function dragOutcome(cell, before, after, { i = 0, rangeEnd = RANGE_END(i) } = {}) {
  const src = CELL_SOURCE[cell];
  if (src) {
    const b = before?.dnd?.[src];
    const a = after?.dnd?.[src];
    if (!a || !b) return { started: false, landed: false, effect: null };
    return { started: a.starts > b.starts, landed: a.drops > b.drops, effect: null };
  }
  const seq = after?.press?.seq;
  const own = (line) => line && typeof seq === 'number' && line.seq === seq && seq !== before?.press?.seq;
  const started = Boolean(after?.dnd && before?.dnd && SOURCES.some((s) => after.dnd[s]?.starts > before.dnd[s]?.starts));
  let effect = null;
  if (cell === 'select') effect = Boolean(own(after.select) && after.select.text.length > 0);
  else if (cell === 'range') effect = Boolean(own(after.range) && after.range.inputs > 0 && Math.abs(after.range.value - rangeEnd) <= 3);
  else if (cell === 'scroller') effect = Boolean(own(after.scroll) && after.scroll.max > 0);
  else if (cell === 'canvas') effect = Boolean(own(after.canvas) && after.canvas.moves > 0);
  return { started, landed: false, effect };
}

/**
 * The index of the accept rule's change (accept.rs `accept_index`) in a sequence of cursor changes (in order), or -1:
 * the second change to an unnamed cursor strictly after the take's server time `take`, a serial repeated back to back
 * counted once (the drag loop's own cursor comes in the take's millisecond or before it), and only while it is the
 * cursor shown: a later change to another unnamed cursor withdraws it, and it counts again, at its last showing, when
 * shown again.
 */
function acceptIndex(cursors, take) {
  let counted = 0;
  let last = null;
  let accept = null;
  let shown = -1;
  for (const [k, c] of cursors.entries()) {
    if (c.named || !(((c.server_time - take) >>> 0) > 0 && ((c.server_time - take) >>> 0) < 2 ** 31) || c.serial === last) continue;
    last = c.serial;
    counted += 1;
    if (counted === 2) accept = c.serial;
    if (counted >= 2) shown = c.serial === accept ? k : -1;
  }
  return shown;
}

/**
 * The least offset from the server's clock to the watch's wall clock over lines that carry a server time, or null: the
 * read with the least lag. Over a run's lines it maps a change's server time to the wall clock the engine stamps with,
 * free of the watch's read lag (up to 17 ms at twice the load, task 68).
 */
export function serverOffset(lines) {
  let least = null;
  for (const l of lines) if (typeof l.server_time === 'number' && l.server_time > 0 && typeof l.wall_ms === 'number') least = least === null ? l.wall_ms - l.server_time : Math.min(least, l.wall_ms - l.server_time);
  return least;
}

/**
 * The engine's server-time probe after the release, the one boundary of the release the X server orders in the watch's
 * lines: the engine creates a 1×1 window at (0, 0) to read the server's time (input.rs `server_time`) once before the
 * press (the route's anchor) and once after the drag (pointer.rs, the event-time check), so the CreateNotify read at or
 * after the release stamp follows the release in the server's order. Its index in `lines`, or -1.
 */
export function releaseProbeIndex(lines, releaseMs) {
  return lines.findIndex((l) => l.kind === 'create' && l.x === 0 && l.y === 0 && l.w === 1 && l.h === 1 && l.override_redirect === false && l.wall_ms >= releaseMs);
}

/**
 * Whether the accept rule's cursor was shown at the release, from the watch's lines (in the server's order) and the
 * engine's release stamp: `{shown, indeterminate}`. A cursor change is after the release only when it follows the
 * engine's probe after the release (`releaseProbeIndex`), the server's own order. It is before the release when the
 * server's clock (mapped by `offset`) puts it more than `RELEASE_STAMP_MARGIN_MS` before the stamp: the offset can only
 * read late (the least read lag and the clock's whole milliseconds are in it), so that side is a bound. The clock never
 * places a change after the release, since there the offset's error is unbounded (the re-review of task 68's fix wave).
 * The release falls somewhere among the changes between, so the reading is indeterminate when any split of them would
 * read otherwise; with no probe in the lines, every change not before the release is among them.
 */
function acceptAtRelease(lines, cursors, take, releaseMs, offset) {
  const at = (c) => c.server_time + offset;
  const probe = releaseProbeIndex(lines, releaseMs);
  const after = (c) => probe >= 0 && lines.indexOf(c) > probe;
  const before = cursors.filter((c) => !after(c) && at(c) + SERVER_TICK_MS <= releaseMs - RELEASE_STAMP_MARGIN_MS);
  const open = cursors.filter((c) => !after(c) && !before.includes(c));
  const readings = open.map((_, k) => acceptIndex([...before, ...open.slice(0, k + 1)], take) >= 0);
  const shown = acceptIndex(before, take) >= 0;
  return { shown, indeterminate: readings.some((r) => r !== shown) };
}

/**
 * A drag's signals from the drop watch's lines (`xprobe drop-watch`, each with `wall_ms`), against the engine's press
 * and release wall clock (`--stats` `wall`): the target's client's take of `XdndSelection` (after the press), whether it
 * came only after the release (with `engineTook`, the engine's own record of a take by its release decides), Chrome's
 * `_NET_ACTIVE_WINDOW` request for its window after the take (source 1, an application's; its latency from the engine's
 * release stamp, which can be slightly negative), every cursor change from the press on, and whether the accept rule's
 * cursor was shown at the release (`accept_shown`), or the records cannot say (`accept_indeterminate`). The server's
 * clock is mapped to the wall clock by `serverOffsetMs`, the run's least offset (`serverOffset`) where the caller has
 * the run's lines, by default the drag's own.
 */
export function signalsOf(lines, { target, pressMs, releaseMs, engineTook = null, mask = RESOURCE_ID_MASK, serverOffsetMs = null }) {
  const takeLine = lines.find((l) => l.kind === 'take' && sameClient(l.owner, target, mask) && l.wall_ms >= pressMs - 5) ?? null;
  const take = takeLine ? takeLine.wall_ms : null;
  const lateByWall = take !== null && typeof releaseMs === 'number' && take > releaseMs;
  // the drop's activation: Chrome's own request after the take (the engine stamps its release only after sending it, so
  // the request can read up to a few ms before the stamp; no activation precedes a release in the server's order)
  const act = typeof releaseMs === 'number' && take !== null ? lines.find((l) => l.kind === 'activate' && l.source === 1 && sameClient(l.window, target, mask) && l.wall_ms >= take) : null;
  const cursors = lines.filter((l) => l.kind === 'cursor' && l.wall_ms >= pressMs);
  const offset = serverOffsetMs ?? serverOffset(lines);
  const accept = takeLine !== null && typeof releaseMs === 'number' && offset !== null ? acceptAtRelease(lines, cursors, takeLine.server_time, releaseMs, offset) : { shown: false, indeterminate: false };
  return {
    take_after_press_ms: take === null ? null : round1(take - pressMs),
    take_after_release_ms: take === null || typeof releaseMs !== 'number' ? null : round1(take - releaseMs),
    late_take: take !== null && (typeof engineTook === 'boolean' ? !engineTook : lateByWall),
    activation_after_release_ms: act ? round1(act.wall_ms - releaseMs) : null,
    cursors: cursors.map((c) => ({ serial: c.serial, image: c.image, named: c.named, t_ms: round1(c.wall_ms - pressMs) })),
    accept_shown: accept.shown,
    accept_indeterminate: accept.indeterminate,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// the never-take rules, read at the start point before the press (the role probe, role-probe.mjs)

/** Roles whose drag moves a value and can hold no drag source of their own (a range, a scroll bar). */
export const RANGE_ROLES = ['slider', 'scroll bar', 'spin button'];
/** Roles that carry text a drag selects, unless the press is inside a selection, which it then drags. */
export const TEXT_ROLES = ['paragraph', 'heading', 'static', 'label', 'text', 'caption', 'block quote'];

/** Roles HTML makes draggable by default (a link, an image). */
export const DRAGGABLE_ROLES = ['link', 'image'];

const roleOf = (p) => p?.deepest?.role ?? null;
/**
 * Each candidate rule: whether it predicts that a drag from the start point never starts a drag and drop. A rule an
 * engine adopted would skip the hold for the drags it predicts; a prediction that took is its false negative.
 */
export const NEVER_TAKE_RULES = {
  'role:range': (p) => RANGE_ROLES.includes(roleOf(p)),
  'role:text': (p) => TEXT_ROLES.includes(roleOf(p)) && p?.in_selection !== true,
  'role:canvas': (p) => roleOf(p) === 'canvas',
  'role:any': (p) => NEVER_TAKE_RULES['role:range'](p) || NEVER_TAKE_RULES['role:text'](p) || NEVER_TAKE_RULES['role:canvas'](p),
  // the same, unless an accessible on the hit-test chain above the deepest is draggable by default (a link's text, an
  // image's). Measured on hit-test results only: `GetAccessibleAtPoint` can go from the frame straight to the deepest
  // (a link's text read as one `static`), so the chain holds no ancestors and this is no measurement of an ancestor
  // check (task 68's review; the rule was `role:any-chain`)
  'role:any-hit-chain': (p) => NEVER_TAKE_RULES['role:any'](p) && !(p?.chain ?? []).some((n) => DRAGGABLE_ROLES.includes(n.role)),
  // a window that does not accept drops at all: Chrome's always does, so this rule predicts nothing there
  'xdnd-aware': (p) => p?.xdnd_aware === false,
};

/** Whether a drag's source took `XdndSelection`: the watch saw it, or the engine's hold did. */
const tookOf = (r) => r.signals?.take_after_press_ms != null || r.hold?.taken === true;
/** Whether the take came after the path's end, so only the hold caught it: the drags a skipped hold would lose. */
const afterPath = (r) => {
  const t = r.hold?.take_after_press_ms ?? r.signals?.take_after_press_ms;
  return typeof t === 'number' && typeof r.hold?.path_ms === 'number' && t > r.hold.path_ms;
};
const groups = (rows, key) => {
  const out = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
};
const loads = (rows) => [...new Set(rows.map((r) => r.load))];

/** Every never-take rule per load: its predictions, its false negatives (and those after the path), its true negatives. */
export function neverTakeTable(rows) {
  const judged = rows.filter((r) => r.kind === 'drop-signal' && r.ok !== undefined && r.probe !== undefined && !r.cover);
  const counts = [];
  const md = [
    `Never-take rules, read at the start point before the press: a rule predicts that the drag never takes, and a prediction whose drag took (\`XdndSelection\`) is a false negative; "after the path" are the false negatives whose take came after the path's end, the drags a skipped hold would lose. A load's counts stand for an adoption only from ${MIN_DRAGS} drags.`,
    '',
    '| load | rule | drags | predicted never | false negatives | of them after the path | true negatives | cells of the false negatives |',
    '|---|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const load of loads(judged)) {
    const at = judged.filter((r) => r.load === load);
    for (const [rule, predicts] of Object.entries(NEVER_TAKE_RULES)) {
      const predicted = at.filter((r) => predicts({ ...(r.probe ?? {}), xdnd_aware: r.xdnd_aware }));
      const fn = predicted.filter(tookOf);
      const cells = [...groups(fn, (r) => r.cell)].map(([c, rs]) => `${c} ${rs.length}`).join(', ') || '–';
      const c = { load, rule, n: at.length, predicted: predicted.length, false_negatives: fn.length, false_negatives_after_path: fn.filter(afterPath).length, true_negatives: predicted.length - fn.length, enough: at.length >= MIN_DRAGS, cells };
      counts.push(c);
      md.push(`| ${load} | ${rule} | ${c.n}${c.enough ? '' : ' (under ' + MIN_DRAGS + ')'} | ${c.predicted} | ${c.false_negatives} | ${c.false_negatives_after_path} | ${c.true_negatives} | ${cells} |`);
    }
  }
  return { counts, md };
}

/**
 * The after-release signals per load, for drags whose take came by the release (a late take is the late-take table's):
 * Chrome's activation request within `windowMs` of the release, and the accept rule's cursor shown before it, each
 * against the drop's landing: true and false positives and negatives, and the drops' activation latency.
 */
export function afterReleaseTable(rows, { windowMs = AFTER_RELEASE_WINDOW_MS } = {}) {
  const judged = rows.filter((r) => r.kind === 'drop-signal' && !r.cover && r.signals?.take_after_press_ms != null && r.signals.late_take !== true && CELL_SOURCE[r.cell]);
  const counts = [];
  const md = [
    `After the release, for drags whose source took by the release: a signal says the drop landed (positive) or not. Activation: Chrome's own \`_NET_ACTIVE_WINDOW\` request for its window within ${windowMs} ms of the release. Accept cursor: the accept rule's cursor (accept.rs) shown at the release, indeterminate where a change the records cannot order against the release would decide it (\`acceptAtRelease\`). A false negative calls a landed drop lost; a false positive calls a lost drop landed, the one that would let a drag answer success wrongly. The counts of true and false are of the determinate drags; "false positives, indeterminates counted" counts every indeterminate leave as a false positive, which is the count that stands against a bar.`,
    '',
    '| load | signal | drags | drops | leaves | true positives | false negatives | false positives | true negatives | indeterminate drops / leaves | false positives, indeterminates counted | drop latency p50 / p95 / max (ms) |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|',
  ];
  const signals = {
    activation: { says: (r) => typeof r.signals.activation_after_release_ms === 'number' && r.signals.activation_after_release_ms <= windowMs, open: () => false },
    'accept cursor at the release': { says: (r) => r.signals.accept_shown === true, open: (r) => r.signals.accept_indeterminate === true },
  };
  for (const load of loads(judged)) {
    const at = judged.filter((r) => r.load === load);
    for (const [signal, { says, open }] of Object.entries(signals)) {
      const landed = (r) => r.outcome?.landed === true;
      const drops = at.filter(landed);
      const leaves = at.filter((r) => !landed(r));
      const shut = (rs) => rs.filter((r) => !open(r));
      const c = { load, signal, n: at.length, drops: drops.length, leaves: leaves.length, tp: shut(drops).filter(says).length, fn: shut(drops).filter((r) => !says(r)).length, fp: shut(leaves).filter(says).length, tn: shut(leaves).filter((r) => !says(r)).length, indeterminate_drops: drops.filter(open).length, indeterminate_leaves: leaves.filter(open).length };
      c.fp_counting_indeterminate = c.fp + c.indeterminate_leaves;
      c.clean_leaves = c.leaves - c.indeterminate_leaves;
      c.latency_ms = signal === 'activation' ? percentiles(drops.filter(says).map((r) => r.signals.activation_after_release_ms)) : null;
      counts.push(c);
      const lat = c.latency_ms ? `${c.latency_ms.p50} / ${c.latency_ms.p95} / ${c.latency_ms.max}` : '–';
      md.push(`| ${load} | ${signal} | ${c.n} | ${c.drops} | ${c.leaves} | ${c.tp} | ${c.fn} | ${c.fp} | ${c.tn} | ${c.indeterminate_drops} / ${c.indeterminate_leaves} | ${c.fp_counting_indeterminate} | ${lat} |`);
    }
  }
  return { counts, md };
}

/** The release at the accept (`--drag-dnd-release-at-accept`) per load and cell: released at the accept or at the ceiling, and which of each did not land. */
export function acceptTable(rows) {
  const judged = rows.filter((r) => r.kind === 'drop-signal' && String(r.lane).startsWith('cua:accept') && CELL_SOURCE[r.cell]);
  const counts = [];
  const md = [
    `The release at the accept (measurement only, \`--drag-dnd-release-at-accept\`): after a take the path keeps its own pacing and the release comes at the accept rule's cursor change, the 350 ms floor its ceiling. A false release is a drag released at the accept whose drop did not land into the zone; on \`nozone\`, a drag bound to leave, any accept read is a false accept.`,
    '',
    '| load | lane | cell | drags | released at the accept | false releases | at the ceiling | of them not landed | accept after the take p50 / p95 / max (ms) | answer median (ms) |',
    '|---|---|---|---:|---:|---:|---:|---:|---|---:|',
  ];
  for (const [key, at] of groups(judged, (r) => [r.load, r.lane, r.cell].join('\u0000'))) {
    const [load, lane, cell] = key.split('\u0000');
    const accepted = at.filter((r) => r.accept?.accepted === true);
    const landed = (r) => r.outcome?.landed === true;
    const zone = ZONE_CELLS.includes(cell);
    const c = { load, lane, cell, n: at.length, accepted: accepted.length, false_releases: zone ? accepted.filter((r) => !landed(r)).length : null, ceiling: at.length - accepted.length, ceiling_missed: zone ? at.filter((r) => r.accept?.accepted !== true && !landed(r)).length : null, accept_after_take_ms: percentiles(accepted.map((r) => r.accept.accept_after_take_ms)), ms_median: percentiles(at.map((r) => r.ms))?.p50 ?? null };
    counts.push(c);
    const p = c.accept_after_take_ms;
    md.push(`| ${load} | ${lane} | ${cell} | ${c.n} | ${c.accepted} | ${c.false_releases ?? '–'} | ${c.ceiling} | ${c.ceiling_missed ?? '–'} | ${p ? `${p.p50} / ${p.p95} / ${p.max}` : '–'} | ${c.ms_median ?? '–'} |`);
  }
  return { counts, md };
}

/** Takes after the release (#264), per load, lane and cell: how many, whether the drag still answered ok, whether it landed. */
export function lateTakeTable(rows) {
  const judged = rows.filter((r) => r.kind === 'drop-signal' && !r.cover && CELL_SOURCE[r.cell]);
  const counts = [];
  const md = [
    'Late takes (#264): the source took `XdndSelection` only after the release, which no engine of today watches for in front. "Answered ok": the drag answered success all the same; "landed": its drop counted anyway.',
    '',
    '| load | lane | cell | drags | took | late takes | answered ok | landed | take after the release p50 / max (ms) |',
    '|---|---|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const [key, at] of groups(judged, (r) => [r.load, r.lane, r.cell].join('\u0000'))) {
    const [load, lane, cell] = key.split('\u0000');
    const late = at.filter((r) => r.signals?.late_take === true);
    const c = { load, lane, cell, n: at.length, took: at.filter(tookOf).length, late: late.length, late_ok: late.filter((r) => r.ok === true).length, late_landed: late.filter((r) => r.outcome?.landed === true).length, after_release_ms: percentiles(late.map((r) => r.signals.take_after_release_ms)) };
    counts.push(c);
    md.push(`| ${load} | ${lane} | ${cell} | ${c.n} | ${c.took} | ${c.late} | ${c.late_ok} | ${c.late_landed} | ${c.after_release_ms ? `${c.after_release_ms.p50} / ${c.after_release_ms.max}` : '–'} |`);
  }
  return { counts, md };
}

/** Covered paths on the background route: per kind and covered part, how many survived, with the start role beside them. */
export function coverTable(rows) {
  const judged = rows.filter((r) => r.kind === 'drop-signal' && r.cover);
  const counts = [];
  const md = [
    "Covered paths on the background route (measurement only, `--drag-ignore-cover`), shared mode, Chrome raised but not active: a window over a part of the path, either an override-redirect window of the harness's (`cua:cover`) or the harness's managed front window, its frame and title bar included (`cua:cover-managed`). A kind survived when its effect showed (a drop source: when Chrome took `XdndSelection`; the engine then cancels the drop, since Chrome is not in front). The start role is the role probe's at the path's first point.",
    '',
    '| cell | covered part | cover | drags | survived | start role |',
    '|---|---|---|---:|---:|---|',
  ];
  const coverBy = (r) => (r.lane === 'cua:cover-managed' ? 'managed' : 'override-redirect');
  for (const [key, at] of groups(judged, (r) => [r.base ?? r.cell.split('@')[0], r.cover, coverBy(r)].join('\u0000'))) {
    const [cell, cover, by] = key.split('\u0000');
    const survived = at.filter((r) => (CELL_SOURCE[cell] ? r.outcome?.started === true || r.signals?.take_after_press_ms != null : r.outcome?.effect === true)).length;
    const roles = [...groups(at, (r) => r.probe?.deepest?.role ?? 'none')].map(([role, rs]) => `${role} ${rs.length}`).join(', ');
    counts.push({ cell, cover, by, n: at.length, survived, roles });
    md.push(`| ${cell} | ${cover} | ${by} | ${at.length} | ${survived} | ${roles} |`);
  }
  return { counts, md };
}

/**
 * The order of a sitting's drags: each (lane, cell) spec cut into blocks of `size` (each block on a fresh engine), the
 * specs taking turns, their order rotating every round, so drift in load or browser state spreads over lanes and cells.
 * Each block carries the index of its first run within its spec.
 */
export function blockPlan(specs, { size = 10 } = {}) {
  for (const s of specs) if (!(s.n >= 1)) throw new Error(`${s.lane} ${s.cell}: a spec needs at least one drag`);
  const done = specs.map(() => 0);
  const plan = [];
  for (let round = 0; done.some((d, k) => d < specs[k].n); round++) {
    for (let j = 0; j < specs.length; j++) {
      const k = (j + round) % specs.length;
      const left = specs[k].n - done[k];
      if (left <= 0) continue;
      const n = Math.min(size, left);
      plan.push({ ...specs[k], n, start: done[k] });
      done[k] += n;
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------
// T17's Electron cells in the gate (#364; the T18 executor's ruling on the design session's T14 gate rule, 2026-11-12)

/** The drop-signals plans whose Electron cells the gate judges (drop-signals.mjs PLANS); `t17-moved` needs a live build's hook. */
export const ELECTRON_JUDGED_PLANS = ['t17-floor', 't17-handle', 't17-fix2', 't17-fix3', 't17-slow-cold', 't17-long'];

/** Whether a drop-signals run's rows are T17's Electron cells, judged by `electronDropVerdict`. */
export const judgedElectronPlan = (args) => args.families?.[0] === 'electron' && ELECTRON_JUDGED_PLANS.includes(args.plan);

/** The cells whose drag must land in the page's zone: the short drop, the drop that only moves, the long drop. */
export const LANDING_CELLS = ['plain', 'move', 'plain-long'];

/** The cells that end off the window (drop-signals.mjs `OFF_WINDOW`): nothing there takes a drop. */
export const OFF_WINDOW_CELLS = ['root', 'xterm', 'other', 'slow', 'moved'];

/**
 * The hung sink's cell (`slow`): a false ok there is #365's race (a target that stalls before its first XdndStatus, an
 * accept from the window left put up after the entry), a stated limit. `'declared-race'` (the design session,
 * 2026-11-12): its false oks are #365's finding, counted per load, and fail nothing; `'hard'`: they fail as any other
 * cell's do. A false ok in every other cell is always hard.
 */
export const SLOW_CELL_MODE = 'declared-race';
const RACE_CELL = 'slow';

/**
 * L4a's residue (the design session's ruling 827, 3b, 2026-11-18). In L4a's plain cell (plan `t17-fix3`, opted in by
 * the dispatcher, with the row's load `load2`, `--load-factor 2`), an honest unconfirmed non-landing (`honestNonLanding`)
 * is allowed at most `allowed` times per `per` plain drops; one more fails. A cell of n drops other than 100 is allowed
 * floor(allowed × n / per), never rounded up. Each lane's plain cell carries its own bound. A false ok is never residue,
 * and no other plan, load or cell has one.
 */
export const RESIDUE = { plan: 't17-fix3', load: 'load2', cell: 'plain', allowed: 2, per: 100 };

/** The residue's bound for a plain cell of `n` drops: floor(2 × n / 100). */
export const residueBound = (n) => Math.floor((RESIDUE.allowed * n) / RESIDUE.per);

/** The page's dragend `dropEffect` codes (pages/drop-signals.html `EFFECTS`) of a drop whose accept breeze_cursors cannot show. */
const MOVE_OR_LINK = [2, 3];

// what a drag left pending, in the engine's words (dnd.rs `pending_notice`, `pending_refusal`): the read's notice and
// the refusal of the acting request after it (the runner's `preflight`) name the same cause
const NOTICE = /^Pending from your last drag, (.+)\. Read the window before sending input again: your next input request will not be run$/s;
const REFUSAL = /^Pending from your last drag, (.+); this preflight request was not run, so read the window before sending it again$/s;
const CAUSE_KINDS = [
  ['late', /^a late drag and drop: /],
  ['unconfirmed', /^an unconfirmed drop: /],
  ['failed', /^a failed watch: /],
  ['idle-handle', /^a drag handle released by timeout: /],
];

/**
 * What a drag left pending past its watch, held to T14's contract: the read after the watch carries the notice, and the
 * next acting request is refused once with the same cause. `{kind, notice, refused, kept}`: `kind` the notice's cause
 * (`late`, `unconfirmed`, `failed`, `idle-handle`, `other`) or null for none; `kept` whether the notice and the refusal
 * agree (both absent, or both present with one cause). Only a kept notice excuses an answer.
 */
export function pendingOf(r) {
  const notice = typeof r.notice === 'string' ? (r.notice.match(NOTICE)?.[1] ?? r.notice) : null;
  const refusal = r.next && r.next.ok === false ? (String(r.next.error ?? '').match(REFUSAL)?.[1] ?? '') : null;
  const kind = notice === null ? null : (CAUSE_KINDS.find(([, re]) => re.test(notice))?.[0] ?? 'other');
  return { kind, notice: notice !== null, refused: refusal !== null, kept: notice === null ? refusal === null : refusal === notice };
}

/** What a drag honestly left pending: its notice's kind when the next acting request was refused with it, else null. */
const honest = (r) => {
  const p = pendingOf(r);
  return p.kept ? p.kind : null;
};

/** Where T14's pending contract broke: a notice the next acting request was not refused with, or a refusal with no notice. */
function pendingBreaks(list, name, failed) {
  const unrefused = list.filter((r) => pendingOf(r).notice && !pendingOf(r).kept);
  const unannounced = list.filter((r) => !pendingOf(r).notice && pendingOf(r).refused);
  const which = (rs) => rs.slice(0, 3).map((r) => `#${r.i}`).join(', ');
  if (unrefused.length) failed.push(`${name}: the read carried a notice, and the next acting request was not refused with it, on ${unrefused.length} of ${list.length} (${which(unrefused)})`);
  if (unannounced.length) failed.push(`${name}: the next acting request was refused for something pending, and the read carried no notice, on ${unannounced.length} of ${list.length} (${which(unannounced)})`);
  return unrefused.length + unannounced.length;
}

/**
 * A run's drags by (lane, cell), each with the drags its plan names (`n`, null for a cell the plan does not name): a plan
 * may name a cell in several specs (t17-slow-cold: one cold drag each), and its drags are their sum. A cell the plan
 * does not name, or one with fewer drags than its plan, is pushed to `failed` (a missing case fails, as a missing
 * operation does).
 */
function planCells(rows, specs, failed) {
  const cells = new Map();
  for (const s of specs) {
    const key = `${s.lane}|${s.cell}`;
    if (cells.has(key)) cells.get(key).n += s.n;
    else cells.set(key, { lane: s.lane, cell: s.cell, n: s.n, rows: [] });
  }
  for (const r of rows) {
    const key = `${r.lane}|${r.cell}`;
    if (!cells.has(key)) cells.set(key, { lane: r.lane, cell: r.cell, n: null, rows: [] });
    cells.get(key).rows.push(r);
  }
  for (const c of cells.values()) {
    const name = `${c.lane} ${c.cell}`;
    if (c.n === null) failed.push(`${name}: ${c.rows.length} drags the plan does not name`);
    else if (c.rows.length < c.n) failed.push(`${name}: ${c.rows.length} of the plan's ${c.n} drags ran (a missing case)`);
  }
  return cells;
}

/**
 * Whether a drag dropped anywhere: the zone took it, or (a cell in the window) this trial's own dragend says it dropped
 * (`ownDragend`; never a record an earlier trial left on the page).
 */
const droppedOf = (r) => Boolean(r.outcome?.landed) || (!OFF_WINDOW_CELLS.includes(r.base ?? r.cell) && (ownDragend(r) ?? 0) > 0);

/**
 * A non-landing L4a's residue may hold, on its whole evidence (task 102's review): the dispatch answered ok, no handle
 * step failed before its end and the harness did not end the drag and drop with its own Escape; the unconfirmed notice
 * was on the read, kept by the next acting request's refusal; the zone's drop counter was read before and after and did
 * not move; and this trial's own completed dragend, stamped with its press, reports no drop (`stampedDragend` 0, never
 * a missing, unstamped, stale, foreign or unfinished record). Anything less is not residue, and is judged as any
 * non-landing is.
 */
export function honestNonLanding(r) {
  if (r.ok !== true || r.error != null || r.handle?.end !== undefined || r.escaped === true) return false;
  if (honest(r) !== 'unconfirmed') return false;
  const src = CELL_SOURCE[r.base ?? r.cell];
  const [b, a] = [r.before?.dnd?.[src], r.after?.dnd?.[src]];
  if (!src || !Number.isInteger(b?.drops) || !Number.isInteger(a?.drops) || a.drops !== b.drops) return false;
  return stampedDragend(r) === 0;
}

/** The settle outcome the engine's `--stats` reports for an Electron drop confirmed by Chrome's activation (ruling 835, task 101). */
const SETTLE_OUTCOME = 'settle_failed_activation_confirmed';

/**
 * A drag's settle outcome (`SETTLE_OUTCOME`) where its row carries the engine's stats for it: the row itself, its drop
 * cursor record and that record's settle (the drag's and the handle's), or its handle record; `'unknown'` where none
 * does (every engine before 0.4.1, and any stats that do not carry it).
 */
export function settleOutcomeOf(r) {
  for (const o of [r, r.drop_cursor, r.drop_cursor?.settle, r.handle, r.handle?.drop_cursor?.settle]) if (typeof o?.[SETTLE_OUTCOME] === 'boolean') return o[SETTLE_OUTCOME];
  return 'unknown';
}

/** The page's dragend `dropEffect` code for copy (pages/drop-signals.html `EFFECTS`). */
const COPY = 1;

/**
 * A zone-truth mismatch (the design session's ruling 830, 2026-11-18): an ok answer, nothing honestly pending, in a cell
 * in the window, whose own completed dragend, stamped with its press (`stampedDragend`), reported copy while the zone's
 * drop counter, read before and after, did not move. Electron's own word agrees with the ok, so the dragend rule stands
 * (`droppedOf`): never a fail by itself, never a false ok, but a declared app-level limit every run of the judge lists apart (task 101's candidate on arm64 at twice the
 * load: 2 of 30 plain-left drags dropped 50 px outside the zone). Off the window the dragend rule excuses nothing, so
 * there such an ok is a false ok, never a mismatch.
 */
export function zoneMismatch(r) {
  const cell = r.base ?? r.cell;
  if (r.ok !== true || honest(r) !== null || OFF_WINDOW_CELLS.includes(cell)) return false;
  const src = T14_SOURCE[cell] ?? CELL_SOURCE[cell];
  const [b, a] = [r.before?.dnd?.[src], r.after?.dnd?.[src]];
  if (!src || !Number.isInteger(b?.drops) || !Number.isInteger(a?.drops) || a.drops !== b.drops) return false;
  return stampedDragend(r) === COPY;
}

/**
 * Why a landed drop answered unconfirmed, as the gate counts it (Decision Log, T17 as built: none fails the gate):
 * `move-link`, a drop that only moves or links (this trial's own dragend), whose accept breeze_cursors draws as no drop
 * (or does not have); `cold-load`, a block's cold handle drop at load, whose cursor can still show no drop (#364, about
 * 6%); `other`.
 */
export function unconfirmedClass(r) {
  if (MOVE_OR_LINK.includes(ownDragend(r))) return 'move-link';
  if (r.lane === 'cua:handle' && r.cold && r.load !== 'idle') return 'cold-load';
  return 'other';
}

/**
 * T17's Electron cells judged for the gate, from one run's `drop-signal` rows (one load) and its plan's `specs`
 * (`{lane, cell, n}`). Fails, each named: a false ok (answered ok on a drag that dropped nowhere, with nothing honestly
 * pending: a notice counts only with the next acting request refused with it, `pendingOf`); T14's pending contract
 * broken (a notice without its refusal, or a refusal without its notice);
 * a missing landing in a cell that expects one (honesty excuses an unconfirmed answer, not a missing effect), save L4a's
 * residue: in L4a's plain cell (plan `t17-fix3`, `plan`) at twice the load, up to floor(2 × n / 100) honest unconfirmed
 * non-landings (`honestNonLanding`) in its n drops,
 * reported with the count and the bound, and one more fails (`RESIDUE`, ruling 827 3b); an error
 * answered for a drop that landed (T17's proof: no false error undisturbed); a cell with fewer drags than its plan, or
 * drags the plan does not name (a missing case fails, as a missing operation does). Findings, counted and never a fail:
 * landed drops answered unconfirmed (by `unconfirmedClass`); T14's share of them against 5% of the landed drops; a cell
 * whose every end was not verified (the bare root under the gate's ballast: unmeasured). An off-window drag whose end
 * was not verified is left out of its cell and counted apart; and, per lane and cell in the window, at every load and in
 * every plan, the zone-truth mismatches (`zoneMismatch`, ruling 830), a declared app-level limit; and a root cell's
 * unverified ends by their answer (ruling 838: at the gate's window load the release lands on the Chrome ballast), the
 * oks listed with their settle outcome (`settleOutcomeOf`), a finding for the design session, never a fail. Answers
 * `{md, failed, findings, counts}`.
 */
export function electronDropVerdict(rows, { specs = [], share = 0.05, slowMode = SLOW_CELL_MODE, plan = null, ends = PATH_ENDS } = {}) {
  if (!['hard', 'declared-race'].includes(slowMode)) throw new Error(`the slow cell's mode is hard or declared-race, not ${slowMode}`);
  const failed = [];
  // #365's declared race: the hung sink's false oks per lane, and its drags
  const race = { lanes: [], false_ok: 0, drags: 0 };
  // L4a's residue: each plain cell at twice the load, with its count and bound
  const residue = [];
  // ruling 830's zone-truth mismatches: each cell in the window, with its count
  const mismatches = [];
  // ruling 838: each root cell with unverified ends, those ends counted by their answer
  const rootUnverified = [];
  const findings = [];
  const cells = planCells(rows, specs, failed);
  const load = [...new Set(rows.map((r) => r.load))].join(', ') || 'none';
  const md = [
    `T17's Electron cells (drop-signals-judge.mjs \`electronDropVerdict\`), load ${load}:`,
    '',
    '| lane | cell | drags | end not verified | landed | ok, nothing pending | unconfirmed | other notice | error | false ok | landed, unconfirmed (move or link / cold handle at load / other) | stale-position drops | ambiguous |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|',
  ];
  const ambiguousRows = [];
  const total = { drags: 0, landed: 0, stale_drops: 0, ambiguous: 0, false_ok: 0, race_false_ok: 0, race_drags: 0, missing_landing: 0, false_error: 0, pending_broken: 0, unconfirmed_landed: 0, by_class: { 'move-link': 0, 'cold-load': 0, other: 0 }, unverified: 0 };
  for (const c of cells.values()) {
    const name = `${c.lane} ${c.cell}`;
    const base = c.rows[0]?.base ?? c.cell.split('@')[0];
    const unverified = c.rows.filter((r) => r.end_park && r.end_park.verified === false);
    const list = c.rows.filter((r) => !unverified.includes(r));
    const count = (f) => list.filter(f).length;
    // a drop counts as landed only where the path ended (ruling 957): a landing in the zone from a path that ended
    // outside it is a drop at a stale position; one within the border margin is ambiguous (ruling 961). The zone's
    // counter is judged on every drag of the cell, an unverified end's too: that exception qualifies the off-window
    // checks below, never the zone's own evidence (the review of 2dd2b0d8, finding 2)
    const landed = (r) => landingOf(r, ends) === 'landed';
    const stale = c.rows.filter((r) => landingOf(r, ends) === 'stale');
    const ambiguous = c.rows.filter((r) => landingOf(r, ends) === 'ambiguous');
    const unplaced = c.rows.filter((r) => landingOf(r, ends) === 'unknown');
    const falseOk = list.filter((r) => r.ok === true && honest(r) === null && !droppedOf(r));
    const landing = LANDING_CELLS.includes(base);
    const nonLanding = landing ? list.filter((r) => !r.outcome?.landed) : [];
    // L4a's residue (ruling 827 3b, `RESIDUE`): L4a's plan's plain cell at twice the load only; its honest non-landings are
    // counted against the cell's bound, and every other non-landing is still a missing landing
    const residueApplies = plan === RESIDUE.plan && base === RESIDUE.cell && list.length > 0 && list.every((r) => r.load === RESIDUE.load);
    const residual = residueApplies ? nonLanding.filter(honestNonLanding) : [];
    const missing = nonLanding.filter((r) => !residual.includes(r));
    const falseError = landing ? list.filter((r) => landed(r) && r.ok !== true) : [];
    const landedUnconfirmed = list.filter((r) => landed(r) && honest(r) === 'unconfirmed');
    const byClass = { 'move-link': 0, 'cold-load': 0, other: 0 };
    for (const r of landedUnconfirmed) byClass[unconfirmedClass(r)] += 1;
    const which = (rs) => rs.slice(0, 3).map((r) => `#${r.i}`).join(', ');
    if (residueApplies) {
      const bound = residueBound(list.length);
      residue.push({ lane: c.lane, cell: c.cell, drags: list.length, count: residual.length, bound, over: residual.length > bound });
      if (residual.length > bound) failed.push(`${name}: ${residual.length} honest unconfirmed non-landings of ${list.length}, over L4a's residue of ${bound} (ruling 827 3b: floor(${RESIDUE.allowed} × ${list.length} / ${RESIDUE.per}), never rounded up) (${which(residual)})`);
    }
    // ruling 830's zone-truth mismatches, every cell in the window, whatever the plan or load: listed, never a fail
    if (!OFF_WINDOW_CELLS.includes(base)) mismatches.push({ lane: c.lane, cell: c.cell, drags: list.length, count: count(zoneMismatch) });
    // ruling 838: a root cell's unverified ends (released over another window: at the gate's window load, the Chrome
    // ballast) stay out of its verdict, and are counted by their answer
    if (base === 'root' && unverified.length) {
      const oks = unverified.filter((r) => r.ok === true && honest(r) === null);
      rootUnverified.push({ lane: c.lane, cell: c.cell, unverified: unverified.length, ok: oks.length, unconfirmed: unverified.filter((r) => honest(r) === 'unconfirmed').length, oks: oks.map((r) => ({ i: r.i, [SETTLE_OUTCOME]: settleOutcomeOf(r) })) });
    }
    const raced = slowMode === 'declared-race' && base === RACE_CELL;
    if (raced) {
      race.lanes.push(`${c.lane} ${falseOk.length} of ${list.length}`);
      race.false_ok += falseOk.length;
      race.drags += list.length;
    } else if (falseOk.length) failed.push(`${name}: answered ok with no drop and nothing pending on ${falseOk.length} of ${list.length} (${which(falseOk)})`);
    if (missing.length) failed.push(`${name}: the drop did not land on ${missing.length} of ${list.length}, in a cell that expects it (${which(missing)})`);
    if (falseError.length) failed.push(`${name}: answered an error for a drop that landed on ${falseError.length} of ${list.length} (${which(falseError)})`);
    landingFails(name, c.rows, stale, unplaced, failed);
    ambiguousRows.push(...ambiguous);
    total.pending_broken += pendingBreaks(list, name, failed);
    if (c.rows.length && !list.length) findings.push(`${name} unmeasured: every end (${unverified.length}) was not verified where the drag left the pointer`);
    total.drags += list.length;
    total.landed += count(landed);
    total.stale_drops += stale.length;
    total.ambiguous += ambiguous.length;
    if (!raced) total.false_ok += falseOk.length;
    total.missing_landing += missing.length;
    total.false_error += falseError.length;
    total.unconfirmed_landed += landedUnconfirmed.length;
    total.unverified += unverified.length;
    for (const k of Object.keys(byClass)) total.by_class[k] += byClass[k];
    md.push(`| ${c.lane} | ${c.cell} | ${list.length} | ${unverified.length} | ${count(landed)} | ${count((r) => r.ok === true && honest(r) === null)} | ${count((r) => honest(r) === 'unconfirmed')} | ${count((r) => ![null, 'unconfirmed'].includes(honest(r)))} | ${count((r) => r.ok !== true)} | ${falseOk.length} | ${landedUnconfirmed.length} (${byClass['move-link']} / ${byClass['cold-load']} / ${byClass.other}) | ${stale.length} | ${ambiguous.length} |`);
  }
  if (ambiguousRows.length) findings.push(ambiguousFinding(ambiguousRows));
  total.race_false_ok = race.false_ok;
  total.race_drags = race.drags;
  if (race.drags) findings.push(`#365's declared race, load ${load}: the hung sink answered ok with no drop and nothing pending on ${race.false_ok} of ${race.drags} drags (${race.lanes.join(', ')}), a finding, not a fail`);
  const within = residue.filter((x) => !x.over);
  if (within.length) findings.push(`L4a's residue (ruling 827 3b), load ${load}: ${within.map((x, k) => `${x.lane} ${x.cell} ${x.count} of ${x.drags}${k ? '' : ' honest unconfirmed non-landings'}, bound ${x.bound}`).join('; ')} (floor(${RESIDUE.allowed} × n / ${RESIDUE.per}), never rounded up), not a fail`);
  if (rootUnverified.length) {
    const each = (x) => `${x.lane} ${x.cell} ${x.ok} ok${x.ok ? ` (${x.oks.map((o) => `#${o.i} settle failed, activation confirmed: ${o[SETTLE_OUTCOME]}`).join('; ')})` : ''} and ${x.unconfirmed} unconfirmed of ${x.unverified}`;
    findings.push(`the root cells' unverified ends by answer (ruling 838: released over another window, at the gate's window load the Chrome ballast; their position unmeasured), load ${load}: ${rootUnverified.map(each).join('; ')}`);
  }
  if (mismatches.length) {
    const seen = mismatches.filter((x) => x.count > 0);
    const what = "zone-truth mismatches (ruling 830, a declared app-level limit: an ok answer whose own dragend reported copy while the zone's drop counter did not move)";
    findings.push(seen.length ? `${what}, load ${load}: ${seen.map((x) => `${x.lane} ${x.cell} ${x.count} of ${x.drags}`).join('; ')}; not a fail and no false ok` : `${what}, load ${load}: none in ${mismatches.reduce((s, x) => s + x.drags, 0)} drags of the window's cells`);
  }
  if (total.by_class['move-link']) findings.push(`${total.by_class['move-link']} landed move or link drops answered unconfirmed: under breeze_cursors their accept is drawn as no drop, or not at all (#364)`);
  if (total.by_class['cold-load']) findings.push(`${total.by_class['cold-load']} cold handle drops at load landed while Electron's cursor still showed no drop, answered unconfirmed (#364)`);
  if (total.by_class.other) findings.push(`${total.by_class.other} other landed drops answered unconfirmed`);
  const over = total.landed > 0 && total.unconfirmed_landed > share * total.landed;
  findings.push(`T14's share, reported and not a fail for these cells: ${total.unconfirmed_landed} of ${total.landed} landed drops answered unconfirmed, ${over ? 'over' : 'within'} ${share * 100}%`);
  const residual = residue.some((x) => x.count > 0) ? " beyond L4a's residue" : '';
  const rootOks = rootUnverified.filter((x) => x.ok > 0);
  const rootOkLine = rootOks.length ? ` ${rootOks.reduce((n, x) => n + x.ok, 0)} ok answers on the root cells' unverified ends (${rootOks.map((x) => `${x.lane} ${x.cell} ${x.ok}`).join(', ')}): a finding for the design session (ruling 838), not a fail.` : '';
  md.push('', `${failed.length ? `**Fails:** ${failed.join('; ')}.` : `No false ok, no drop at a stale position, no missing landing${residual}, no false error, every notice refused once; every cell of the plan ran.`}${rootOkLine}`, '', `Findings (counted, not fails): ${findings.join('; ')}.`, '');
  return { md, failed, findings, counts: { load, ...total, over_share: over, residue, zone_mismatch: mismatches, root_unverified: rootUnverified } };
}

// ---------------------------------------------------------------------------------------------------------------
// Chrome's cells in the gate (the harness-fix wave: the whole-branch review's P1, 2026-11-12): T14's contract

/**
 * The drop-signals plans whose Chrome cells the gate judges (drop-signals.mjs PLANS): T14's real late takes
 * (`t14-late`, steps C1 and L4c), the release at the accept with its controls (`t14`, L4b), and the same drags and the
 * long control on the engine as it ships (`t14-floor`, `t14-long`, `t14-long-gate`). T13's surveys measure and judge
 * nothing, and no gate step runs them.
 */
export const CHROME_JUDGED_PLANS = ['t14', 't14-floor', 't14-late', 't14-late-edge', 't14-long', 't14-long-gate'];

/** Whether a drop-signals run's rows are T14's Chrome cells (Chrome is the experiment's default family), judged by `chromeDropVerdict`. */
export const judgedChromePlan = (args) => (args.families?.[0] ?? 'chrome') === 'chrome' && CHROME_JUDGED_PLANS.includes(args.plan);

/**
 * The Chrome plans whose sitting exists to make real late takes (#264): one with none proves nothing. Since 0.4.2 that is
 * the knife-edge ride-along alone (`t14-late-edge`, a development plan no gate step runs; ruling 931.5).
 */
const LATE_TAKE_PLANS = ['t14-late-edge'];

/**
 * What 0.4.2's hold answers beside the ok of a drag whose identified Chrome source read slow and never took by the
 * extended hold's end (cua-engine `adaptive_hold::NOTICE`; premise.mjs `HOLD_NOTICE`), word for word.
 */
export const HOLD_NOTICE = 'the page may have started a drag that did not complete';

/**
 * C1's and L4c's freeze bands (`t14-late`; the design session's ruling 931, from task 121's sweeps on the pinned 0.4.2,
 * x64, Chrome 156, the browser stopped from 60 ms after the send). 0.4.2 holds a frozen, identified Chrome's drag to
 * press + 650, so a thaw inside the hold lets the take come there and the drop land; a thaw past the release finds the
 * button up, Chrome refuses the drag, and the reply carries the hold notice; a late take came only from a thaw within
 * a few ms of the release (idle 647 and 649-653, twice the load 640-660). Each band with an outcome expected
 * needs `min` of it per series, or it is unexercised:
 * - inside (freeze-600): every drag landed in the sweeps, 30 of 30 at freeze-600 to -630 at idle and 30 of 30 at twice
 *   the load (and 60 of 60 from 620 to 648 at idle, bar one late take);
 * - edge: the late takes, counted and each judged in full, never required (idle 18 in 90 from 646 to 654, twice the load
 *   17 in 90);
 * - past (freeze-700): the hold notice with no drop and nothing sent after it, 10 of 10 at idle and 10 of 10 at twice
 *   the load (670 and 700, 40 of 40).
 * A minimum of 7 of 10 leaves a band whose outcome held 30 of 30 or more a chance under 0.2% of failing by chance.
 */
export const LATE_BANDS = [
  // the same freeze on both architectures: task 122's sweep at the race fix (ruling 956) landed arm64 10 of 10 at twice the
  // load at 500, 550 and 600, so the per-architecture value of ruling 954 was removed again
  { band: 'inside', cells: ['freeze-600'], expects: 'landed', min: 7 },
  { band: 'edge', cells: ['freeze-646', 'freeze-648', 'freeze-650', 'freeze-652'], expects: null, min: 0 },
  { band: 'past', cells: ['freeze-700'], expects: 'refused', min: 7 },
];
/** The plans judged by bands, and theirs. */
const BANDED_PLANS = { 't14-late': LATE_BANDS };
/**
 * Whether the page was read before and after the drag with the drag's source's counters both there, its drop count
 * unchanged: positive evidence of no drop (the review of H6, blocker 3). `dragOutcome` reads a missing counter as
 * `landed: false`, which is no evidence at all.
 */
function noDropRead(r) {
  const src = T14_SOURCE[r.base ?? r.cell] ?? CELL_SOURCE[r.base ?? r.cell];
  const [b, a] = [r.before?.dnd?.[src], r.after?.dnd?.[src]];
  return Boolean(src) && Number.isInteger(b?.drops) && Number.isInteger(a?.drops) && a.drops === b.drops;
}

/**
 * Whether the page was read before and after the drag with the drag's source's start and drop counters both there:
 * without them, whether the drag started or dropped is unknown (`dragOutcome` reads both as false), never "no".
 */
function countersRead(r) {
  const src = T14_SOURCE[r.base ?? r.cell] ?? CELL_SOURCE[r.base ?? r.cell];
  const read = (c) => Number.isInteger(c?.starts) && Number.isInteger(c?.drops);
  return Boolean(src) && read(r.before?.dnd?.[src]) && read(r.after?.dnd?.[src]);
}

/** Whether the engine identified the drag's source as a Chrome browser, by its own hold record (ruling 954). */
const sourceIdentified = (r) => r.hold?.adaptive?.source?.identified === true;

/** A freeze cell's thaw, ms after the send (drop-signals.mjs `freezeOf`), or NaN for any other cell. */
const thawOf = (cell) => Number(/^freeze-(\d+)$/.exec(cell)?.[1] ?? NaN);

/**
 * Whether the row's own record shows its browser stop begun before its cell's thaw and then continued: positive evidence
 * the band's freeze happened (the review of cf1ef10f, finding 1). An explicit skip decides, whatever else the record
 * holds (the re-review of 0e43238b, finding 2); else the stop (`freeze.stopped_ms`, read just before the signal) must be
 * a finite, nonnegative time before the thaw, and the continue (`continued_ms`) a finite time after the stop. The
 * continue comes at the thaw by design, within the timer's 1 ms tick either side (the stored rows: 1 ms before it at
 * the earliest), so it is not held to the thaw. A record with no skip says nothing by itself: a timer that woke past the
 * thaw stopped nothing that mattered. H6's rows carry both times without H7's press fields, and are judged by them alike.
 */
const stoppedBeforeThaw = (r) => {
  const f = r.freeze;
  if (!f || typeof f.skipped === 'string') return false;
  return Number.isFinite(f.stopped_ms) && f.stopped_ms >= 0 && f.stopped_ms < thawOf(r.base ?? r.cell) && Number.isFinite(f.continued_ms) && f.continued_ms > f.stopped_ms;
};

const BAND_OUTCOMES = {
  // the drop landed after a take the engine saw inside its hold (the review of H6, blocker 2: a late take that landed
  // before its cancel is no in-hold landing)
  landed: { what: 'landed after a take inside the hold', holds: (r, ends) => landingOf(r, ends) === 'landed' && r.hold?.taken === true && r.signals?.late_take !== true },
  // Chrome refused the drag: the reply's hold notice, the page read showing no drop, no take, and nothing sent after it
  // (no notice on the read, the next acting request run, no Escape of the engine's or the harness's)
  refused: {
    what: 'answered the hold notice with no drop and nothing sent after it',
    holds: (r) => r.ok === true && r.reply_notice === HOLD_NOTICE && noDropRead(r) && r.signals?.late_take !== true && !r.notice && r.next?.ok === true && !r.next?.late_dnd && r.escaped !== true,
  },
};

/**
 * On a banded plan, the pending causes that account for a drag that did not land (the review of H6, blocker 4): a drag
 * that took, a late take (when one came), an unconfirmed drop or a failed watch; a drag that never took, a failed watch
 * only (its drop may have gone unseen). Any other kept pair (an `other` cause, a handle's idle release) excuses nothing.
 */
const accountedFor = (r, took) => {
  const kind = honest(r);
  if (kind === 'failed') return true;
  if (!took) return false;
  return kind === 'unconfirmed' || (kind === 'late' && r.signals?.late_take === true);
};

/** T14's controls: a drag and drop that leaves the zone (the accepted-then-left path, the press inside it, the long path). */
const CONTROL_CELLS = ['left', 'inzone-out', 'long-left'];

/** The lane of the release at the accept (`--drag-dnd-release-at-accept`): a measurement flag, not what ships (T14's ruling 2, reverted). */
const ACCEPT_LANE = 'cua:accept';

/** A drag the measurement lane released at Chrome's accept cursor: its outcome is the measurement, not the shipped floor's. */
const releasedAtAccept = (r) => r.lane === ACCEPT_LANE && r.accept?.accepted === true;

/** A late take reported as T14 built it: the late notice on the read, the next acting request refused with it, its Escape sent. */
const lateReported = (r) => honest(r) === 'late' && r.next?.late_dnd?.escaped === true;

/**
 * T14's Chrome cells judged for the gate, from one run's `drop-signal` rows (one load), its plan's `specs` and its
 * `plan`. Fails, each named: a late take (the source's take after the release) not reported, by its notice on the read,
 * the refusal of the next acting request with it and its Escape; a late drag and drop reported on a drag with no late
 * take (a normal drop leaves no late notice and sends no Escape); a false ok (answered ok on a drop that did not land,
 * with nothing honestly pending); a long drop that did not land, whatever its answer; T14's pending contract broken (a
 * notice without its refusal, or a refusal without its notice); a missing case; for a plan that exists to make them
 * (`t14-late-edge`), a sitting with no late take; and for a banded plan (`bands`, `t14-late`'s `LATE_BANDS` by
 * default; ruling 931) a plain ok on a drag its page started that did not land, and a band short of its own outcome's
 * minimum (unexercised), its hold notices on drops that landed counted as false alarms. On the measurement lane (`cua:accept`) a drag released at the accept that
 * did not land is a false release, counted with its answer: that lane's early release does not ship, and its ok is
 * the stated limit of Chrome's confirmation (it confirms Chrome's drop, not the page's); its drags that fell to the
 * floor are judged as shipped. Findings, counted: the late takes; landed drops answered unconfirmed (T14's share against
 * 5%); the false releases; drags whose drag and drop the harness had to end with its own Escape. Answers
 * `{md, failed, findings, counts}`.
 */
export function chromeDropVerdict(rows, { specs = [], plan = null, capped = false, share = 0.05, bands = BANDED_PLANS[plan] ?? null, ends = PATH_ENDS } = {}) {
  const failed = [];
  const findings = [];
  const cells = planCells(rows, specs, failed);
  const load = [...new Set(rows.map((r) => r.load))].join(', ') || 'none';
  const md = [
    `T14's Chrome cells (drop-signals-judge.mjs \`chromeDropVerdict\`), plan ${plan ?? 'none'}, load ${load}:`,
    '',
    '| lane | cell | drags | never took | landed | ok, nothing pending | unconfirmed | late takes | reported | false ok | false releases (answered ok) | harness Escapes | stale-position drops | ambiguous |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|',
  ];
  const ambiguousRows = [];
  const total = { drags: 0, untaken: 0, landed: 0, stale_drops: 0, ambiguous: 0, late: 0, late_reported: 0, late_notice_without_take: 0, false_ok: 0, missing_landing: 0, pending_broken: 0, unconfirmed_landed: 0, false_releases: 0, false_release_ok: 0, harness_escapes: 0, ...(bands ? { false_alarms: 0, unjudged: 0 } : {}) };
  for (const c of cells.values()) {
    const name = `${c.lane} ${c.cell}`;
    const list = c.rows;
    const base = list[0]?.base ?? c.cell;
    const count = (f) => list.filter(f).length;
    const which = (rs) => rs.slice(0, 3).map((r) => `#${r.i}`).join(', ');
    // a drop counts as landed only where the path ended (ruling 957); `dropped`, the zone's counter alone, is what the
    // no-drop rules read: a drop at a stale position is its own wrong outcome, never a false ok as well
    const landed = (r) => landingOf(r, ends) === 'landed';
    const dropped = (r) => r.outcome?.landed === true;
    const stale = list.filter((r) => landingOf(r, ends) === 'stale');
    const ambiguous = list.filter((r) => landingOf(r, ends) === 'ambiguous');
    const unplaced = list.filter((r) => landingOf(r, ends) === 'unknown');
    const late = list.filter((r) => r.signals?.late_take === true);
    const unreported = late.filter((r) => !lateReported(r));
    const lateWithoutTake = list.filter((r) => r.signals?.late_take !== true && pendingOf(r).kind === 'late');
    const falseReleases = list.filter((r) => releasedAtAccept(r) && !dropped(r));
    // a drag whose drag and drop never took (no XdndSelection take, the watch's or the hold's) answers as a plain drag:
    // its ok claims no drop. A control needs drags that took, or it proved nothing
    const untaken = list.filter((r) => !tookOf(r));
    // on a banded plan only a cause that accounts for the outcome excuses it; elsewhere T14's kept pair does
    const excused = (r) => (bands ? accountedFor(r, tookOf(r)) : honest(r) !== null);
    const falseOk = list.filter((r) => r.ok === true && !excused(r) && !dropped(r) && tookOf(r) && !releasedAtAccept(r));
    const missing = base === 'plain-long' ? list.filter((r) => !dropped(r) && !releasedAtAccept(r)) : [];
    if (CONTROL_CELLS.includes(base) && list.length && untaken.length === list.length) failed.push(`${name}: no drag and drop took on any of ${list.length}: the control proved nothing`);
    const landedUnconfirmed = list.filter((r) => landed(r) && honest(r) === 'unconfirmed');
    if (unreported.length) failed.push(`${name}: a late take not reported (its notice on the read, the next acting request refused with it, its Escape) on ${unreported.length} of ${list.length} (${which(unreported)})`);
    if (lateWithoutTake.length) failed.push(`${name}: a late drag and drop reported, and its Escape sent, on a drag with no late take, on ${lateWithoutTake.length} of ${list.length} (${which(lateWithoutTake)})`);
    if (falseOk.length) failed.push(`${name}: answered ok with no drop and nothing pending on ${falseOk.length} of ${list.length} (${which(falseOk)})`);
    landingFails(name, list, stale, unplaced, failed);
    ambiguousRows.push(...ambiguous);
    // a banded plan judges every answer (ruling 931): a drag its page started that Chrome refused must say so (0.4.2's
    // hold notice); a plain ok there is a false ok, though no take came. A notice on a drop that landed is a false alarm
    const plainRefused = bands ? list.filter((r) => r.ok === true && !excused(r) && r.reply_notice !== HOLD_NOTICE && r.outcome?.started === true && !dropped(r) && !tookOf(r)) : [];
    if (plainRefused.length) failed.push(`${name}: answered ok with no notice and nothing pending on a drag its page started that did not land, on ${plainRefused.length} of ${list.length} (${which(plainRefused)})`);
    // the re-review of 9a8f32a5: a plain ok with no take seen and nothing that accounts for it, whose page was not read
    // before or after, cannot be judged honest or not (Chrome may have started the drag): unjudged, and a counted step
    // fails on it; missing evidence never counts as "no drop" or "did not start"
    const unjudged = bands ? list.filter((r) => r.ok === true && !excused(r) && r.reply_notice !== HOLD_NOTICE && !tookOf(r) && !countersRead(r)) : [];
    if (unjudged.length) failed.push(`${name}: answered a plain ok with no take seen and the page's drop counters unread before or after, on ${unjudged.length} of ${list.length} (${which(unjudged)}): unjudged`);
    if (bands) total.unjudged += unjudged.length;
    if (bands) total.false_alarms += count((r) => r.reply_notice === HOLD_NOTICE && landed(r));
    if (missing.length) failed.push(`${name}: the drop did not land on ${missing.length} of ${list.length}, in a cell that expects it (${which(missing)})`);
    total.pending_broken += pendingBreaks(list, name, failed);
    total.drags += list.length;
    total.untaken += untaken.length;
    total.landed += count(landed);
    total.stale_drops += stale.length;
    total.ambiguous += ambiguous.length;
    total.late += late.length;
    total.late_reported += late.length - unreported.length;
    total.late_notice_without_take += lateWithoutTake.length;
    total.false_ok += falseOk.length + plainRefused.length;
    total.missing_landing += missing.length;
    total.unconfirmed_landed += landedUnconfirmed.length;
    total.false_releases += falseReleases.length;
    total.false_release_ok += falseReleases.filter((r) => r.ok === true && honest(r) === null).length;
    total.harness_escapes += count((r) => r.escaped === true);
    md.push(`| ${c.lane} | ${c.cell} | ${list.length} | ${untaken.length} | ${count(landed)} | ${count((r) => r.ok === true && honest(r) === null)} | ${count((r) => honest(r) === 'unconfirmed')} | ${late.length} | ${late.length - unreported.length} | ${falseOk.length + plainRefused.length} | ${falseReleases.length} (${falseReleases.filter((r) => r.ok === true && honest(r) === null).length}) | ${count((r) => r.escaped === true)} | ${stale.length} | ${ambiguous.length} |`);
  }
  if (ambiguousRows.length) findings.push(ambiguousFinding(ambiguousRows));
  // a sitting capped by --trials (a pilot; a gate step runs its plan whole, `runExperiment`) may well make none
  if (LATE_TAKE_PLANS.includes(plan) && total.late === 0) {
    if (capped) findings.push('no late take came in a sitting capped by --trials: #264 unjudged here');
    else failed.push('no late take came: the sitting proves nothing of #264');
  }
  // each band's own outcome, a minimum of it per series, or the band is unexercised (ruling 931.2)
  if (bands) {
    total.bands = {};
    for (const b of bands) {
      const list = rows.filter((r) => b.cells.includes(r.cell));
      const outcome = b.expects ? BAND_OUTCOMES[b.expects] : null;
      // a row that did not exercise the band it ran in is never its outcome (rulings 954 and 955): its source ended
      // unidentified, its stop was skipped, or its record shows no stop begun before the thaw (the review of cf1ef10f,
      // finding 1). Counted and shown; it can only fail the band, never pass it
      const unidentified = list.filter((r) => !sourceIdentified(r));
      const skipped = list.filter((r) => typeof r.freeze?.skipped === 'string');
      const unstopped = list.filter((r) => typeof r.freeze?.skipped !== 'string' && !stoppedBeforeThaw(r));
      // and a landing whose path ended within the border margin (ruling 961): never the outcome
      const unplaced = list.filter((r) => landingOf(r, ends) === 'ambiguous');
      const unexercised = list.filter((r) => !sourceIdentified(r) || !stoppedBeforeThaw(r) || unplaced.includes(r));
      const exercised = list.filter((r) => !unexercised.includes(r));
      const expected = outcome ? exercised.filter((r) => outcome.holds(r, ends)).length : null;
      // the band's late takes are its exercised rows' (finding 3); every late take is judged and reported above, whichever row
      total.bands[b.band] = { drags: list.length, expected, late: exercised.filter((r) => r.signals?.late_take === true).length, unexercised: unexercised.length };
      if (outcome && expected < b.min) failed.push(`the ${b.band} band (${b.cells.join(', ')}): ${expected} of ${list.length} drags ${outcome.what}, fewer than its ${b.min}: the band is unexercised`);
      if (unexercised.length) findings.push(`the ${b.band} band: ${unexercised.length} of ${list.length} drags unexercised (the source not identified on ${unidentified.length}, the stop skipped on ${skipped.length}, the stop not begun before the thaw on ${unstopped.length}${unplaced.length ? `, the path's end ambiguous on ${unplaced.length}` : ''})`);
      if (!outcome && !total.bands[b.band].late) findings.push(`the ${b.band} band made no late take (not required, ruling 931)`);
    }
    md.push('', '| band | cells | drags | its outcome | minimum | late takes | unexercised |', '|---|---|---:|---:|---:|---:|---:|', ...bands.map((b) => `| ${b.band} | ${b.cells.join(', ')} | ${total.bands[b.band].drags} | ${b.expects ? `${total.bands[b.band].expected} ${BAND_OUTCOMES[b.expects].what}` : '–'} | ${b.min || '–'} | ${total.bands[b.band].late} | ${total.bands[b.band].unexercised} |`));
    if (total.false_alarms) findings.push(`${total.false_alarms} hold notice${total.false_alarms === 1 ? '' : 's'} on a drop that landed (a false alarm, counted, ruling 898.2)`);
  }
  if (total.late) findings.push(`${total.late} late takes, ${total.late_reported} reported`);
  if (total.untaken) findings.push(`${total.untaken} drags whose drag and drop never took, answered as plain drags`);
  const over = total.landed > 0 && total.unconfirmed_landed > share * total.landed;
  findings.push(`T14's share, reported and not a fail: ${total.unconfirmed_landed} of ${total.landed} landed drops answered unconfirmed, ${over ? 'over' : 'within'} ${share * 100}%`);
  if (total.false_releases) findings.push(`${total.false_releases} false releases at the accept (measurement lane \`${ACCEPT_LANE}\`, not shipped), ${total.false_release_ok} of them answered ok with nothing pending`);
  if (total.harness_escapes) findings.push(`${total.harness_escapes} drags whose drag and drop was still open a second after the answer, ended by the harness's Escape`);
  md.push('', failed.length ? `**Fails:** ${failed.join('; ')}.` : 'Every late take reported, no false ok, no drop at a stale position, no missing landing, every notice refused once; every cell of the plan ran.', '', `Findings (counted, not fails): ${findings.join('; ')}.`, '');
  return { md, failed, findings, counts: { load, ...total, over_share: over } };
}

/**
 * A drop-signals run's gate verdict from its rows (the run's own, every kind), by its family and plan (`args`, as the
 * CLI parses them): T17's Electron cells (`electronDropVerdict`), T14's Chrome cells (`chromeDropVerdict`), or null for
 * a plan no gate judge holds. Answers the verdict with `judge`, the judge's name.
 */
/** The hold's regression plan (drop-signals.mjs PLANS `hold-regression`; task 117, the design session's ruling 900). */
export const HOLD_REGRESSION_PLAN = 'hold-regression';

/**
 * The hold's regression cells and their counts, the plan's own (drop-signals.mjs PLANS takes them from here) and what
 * the judge requires whatever a run's rows say (the re-review of wave 4, I2: judged from the run's manifest alone, a
 * run with none, or one missing a cell, passed).
 */
export const HOLD_REGRESSION_CELLS = [['cua', 'dragstart-150', 10], ['cua', 'dragstart-400', 10]];

/**
 * The hold's regression cells (ruling 900): drops whose page starts them late from a busy handler (`dragstart-150`,
 * `dragstart-400`, Chrome's own browser idle and fast) must land inside B, as the fixed 450 ms lands them and an early
 * release on fast pings did not (task 117: 24 of 24 lost). Fails, each named: a drag that did not land, whose page did
 * not start it, or whose engine saw no take; a hold that was not the fixed one (no release before B, no extension on
 * fast pings); a source the engine did not identify as Chrome; a required cell (`required`, HOLD_REGRESSION_CELLS by
 * default) short of its count, or missing from the run's manifest (`specs`, the scene row's; null when the run wrote
 * none), and a run with no manifest at all.
 */
export function holdRegressionVerdict(rows, { specs = null, required = HOLD_REGRESSION_CELLS.map(([lane, cell, n]) => ({ lane, cell, n })), ends = PATH_ENDS } = {}) {
  const failed = [];
  const counts = {};
  if (!Array.isArray(specs)) failed.push("the run's manifest (its drop-signal-scene row) is missing: which cells ran is unknown");
  for (const spec of required) {
    if (Array.isArray(specs) && !specs.some((s) => s.cell === spec.cell && s.lane === spec.lane && s.n >= spec.n)) failed.push(`${spec.cell}: not in the run's manifest with its ${spec.n} drags`);
    const list = rows.filter((r) => r.cell === spec.cell && r.lane === spec.lane);
    const bad = (what, pred) => {
      const misses = list.filter((r) => !pred(r));
      if (misses.length) failed.push(`${spec.cell}: ${what} on ${misses.length} of ${list.length} (${misses.slice(0, 3).map((r) => `${r.block ?? 0}/${r.i}`).join(', ')})`);
    };
    if (list.length < spec.n) failed.push(`${spec.cell}: ${list.length} of its ${spec.n} drags ran`);
    bad('not landed', (r) => r.outcome?.started === true && landingOf(r, ends) === 'landed');
    bad('no take seen inside the hold', (r) => r.hold?.taken === true);
    bad('a hold other than the fixed one', (r) => r.hold?.adaptive?.way === 'fixed');
    bad('Chrome not identified as a browser', (r) => r.hold?.adaptive?.source?.identified === true);
    counts[spec.cell] = { drags: list.length, landed: list.filter((r) => r.outcome?.landed === true).length };
  }
  const md = ['', `The hold's regression cells (drop-signals-judge.mjs \`holdRegressionVerdict\`, ruling 900): ${failed.length ? `**fails:** ${failed.join('; ')}` : 'every drop whose page started it late landed inside B'}.`, '', ...Object.entries(counts).map(([cell, c]) => `- ${cell}: ${c.landed} of ${c.drags} landed`)];
  return { failed, findings: [], counts, md };
}

export function dropSignalsVerdict(args, rows) {
  if (PART_PLANS[args.plan]) return partsVerdict(args, rows);
  const drags = rows.filter((r) => r.kind === 'drop-signal');
  const manifest = rows.find((r) => r.kind === 'drop-signal-scene')?.specs ?? null;
  const specs = manifest ?? [];
  if ((args.families?.[0] ?? 'chrome') === 'chrome' && args.plan === HOLD_REGRESSION_PLAN) return { judge: 'holdRegressionVerdict', ...holdRegressionVerdict(drags, { specs: manifest }) };
  if (judgedElectronPlan(args)) return { judge: 'electronDropVerdict', ...electronDropVerdict(drags, { specs, plan: args.plan }) };
  if (judgedChromePlan(args)) return { judge: 'chromeDropVerdict', ...chromeDropVerdict(drags, { specs, plan: args.plan, capped: args.samplesTrials != null }) };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// a plan of parts (the design session's ruling 962: step L4d)

/**
 * The plans of parts: each part a family and a plan of its own, sat in turn in one run (drop-signals.mjs
 * `runDropSignals`), each in a scene of its own, its rows marked with its index (`part`), and each judged by its own
 * plan's judge (`dropSignalsVerdict`). `t14-stale` is L4d's (ruling 962): Chrome's long control and the floor's cells,
 * each the plan of its name, on the shipped lane, and Electron's long path that crosses the zone and ends outside it
 * (`t17-long`).
 */
export const PART_PLANS = {
  't14-stale': [
    { family: 'chrome', plan: 't14-long' },
    { family: 'chrome', plan: 't14-floor' },
    { family: 'electron', plan: 't17-long' },
  ],
};

/** The families a plan of parts sits, in order, each once: the run's `--family` must name them. */
export const partFamilies = (plan) => [...new Set(PART_PLANS[plan].map((p) => p.family))];

/** Whether a drop-signals run is a plan of parts every part of which a gate judge holds. */
export const judgedPartsPlan = (args) => Boolean(PART_PLANS[args.plan]) && PART_PLANS[args.plan].every((p) => judgedChromePlan({ families: [p.family], plan: p.plan }) || judgedElectronPlan({ families: [p.family], plan: p.plan }));

/**
 * A plan of parts judged (`PART_PLANS`): each part's rows (`part`) by its own plan's judge, as a run of that plan alone
 * would be, under its own scene row's manifest. Fails each part's fails, named by the part, and a part whose scene row is
 * missing (which cells ran unknown) or that no judge holds. Answers `{judge, md, failed, findings, counts}`, the counts
 * each part's.
 */
export function partsVerdict(args, rows) {
  const failed = [];
  const findings = [];
  const md = [`A plan of parts, ${args.plan} (drop-signals-judge.mjs \`partsVerdict\`): each part judged by its own plan's judge.`, ''];
  const parts = [];
  for (const [k, part] of PART_PLANS[args.plan].entries()) {
    const name = `part ${k + 1} (${part.family} ${part.plan})`;
    const own = rows.filter((r) => r.part === k);
    if (!own.some((r) => r.kind === 'drop-signal-scene')) failed.push(`${name}: its scene row is missing: which cells ran is unknown`);
    const v = dropSignalsVerdict({ ...args, families: [part.family], plan: part.plan }, own);
    if (!v) {
      failed.push(`${name}: no gate judge holds it`);
      continue;
    }
    failed.push(...v.failed.map((f) => `${name}: ${f}`));
    findings.push(...v.findings.map((f) => `${name}: ${f}`));
    md.push(`### ${name}`, '', ...v.md);
    parts.push({ part: k, family: part.family, plan: part.plan, judge: v.judge, pass: v.failed.length === 0, counts: v.counts });
  }
  return { judge: 'partsVerdict', md, failed, findings, counts: { parts } };
}
