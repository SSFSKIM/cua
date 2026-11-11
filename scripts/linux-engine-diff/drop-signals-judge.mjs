// The drop-signals experiment's judgements (#171 M4, T13: Chromium drop signals, measured only), pure: the drop-signals
// page's status (pages/drop-signals.html), each drag's outcome and its signals from `xprobe drop-watch`, the never-take
// rules read at the start point, and the count tables the experiment reports (drop-signals.mjs). T13 adopts nothing:
// every table counts, and none of them passes or fails the run.

/** The freeze cells' browser stops end this many ms after the drag is sent (drop-signals.mjs `freezeOf`). */
export const FREEZE_ENDS = [230, 240, 250, 255, 260, 280, 330];

/** The page's drag sources (`data-src`), in its status line's order. */
export const SOURCES = ['plain', 'nested', 'nested-late', 'slider', 'dragstart-150', 'press-150', 'dragstart-400', 'press-400', 'link', 'image', 'seltext', 'canvas-drag'];

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
  const d = find(/^dnd (.*) last (\S+) effect (-?\d+) lat (-?\d+) dur (-?\d+)$/);
  if (d) {
    out.dnd = {};
    for (const [, src, starts, drops] of d[1].matchAll(/(\S+) (\d+)\/(\d+)/g)) out.dnd[src] = { starts: Number(starts), drops: Number(drops) };
    out.last = { src: d[2], effect: Number(d[3]), lat: Number(d[4]), dur: Number(d[5]) };
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
export const CELL_SOURCE = { 'freeze-230': 'press-150', 'freeze-240': 'press-150', 'freeze-250': 'press-150', 'freeze-255': 'press-150', 'freeze-260': 'press-150', 'freeze-280': 'press-150', 'freeze-330': 'press-150', plain: 'plain', nozone: 'plain', nested: 'nested', 'nested-late': 'nested-late', slider: 'slider', 'dragstart-150': 'dragstart-150', 'press-150': 'press-150', 'dragstart-400': 'dragstart-400', 'press-400': 'press-400', link: 'link', image: 'image', seltext: 'seltext', 'plain-long': 'plain', 'canvas-drag': 'canvas-drag', move: 'move' };
export const ZONE_CELLS = ['freeze-230', 'freeze-240', 'freeze-250', 'freeze-255', 'freeze-260', 'freeze-280', 'freeze-330', 'plain', 'nested', 'nested-late', 'slider', 'dragstart-150', 'press-150', 'dragstart-400', 'press-400', 'link', 'image', 'plain-long', 'canvas-drag', 'move'];

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
