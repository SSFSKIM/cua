// The design session's ruling 823: a V5 Chrome drag-and-drop sample whose premise was unmet. A cell that measures what cua
// does once Chrome turns a drag into a drag and drop (device.mjs: the cancel, late and late-take cases) proves nothing on
// a drag Chrome never took. Such a sample is one where both hold:
//
// - (i) cua's reply claims no drop effect: a plain-drag ok, with no notice on it;
// - (ii) the run's own records show that Chrome never started a drag session for that sample.
//
// The evidence for (ii) is the drag page's own record of the sample's press (pages/drag.html): Chrome's renderer fires
// dragstart before its browser process starts the X drag session (takes XdndSelection, grabs the pointer), and once a
// drag starts the press ends in Chrome's pointercancel and a dragend, never a pointerup. So a press of the sample's own
// (the source's press count up by one, the pointer log numbered with it) that ended in a pointerup, with no dragstart,
// pointercancel or dragend in its log and the page's drag-start, drag-end and drop counts unmoved when read after the
// answer, is a press Chrome never started a drag session for. That is an order of events, not a timing, and a missing
// or unread record never shows it: a sample whose records cannot show (ii) either way, or that any record contradicts
// (the engine's take or its late-take record, a pending notice, a drop, a changed desktop), is judged as before.
//
// Such a sample is excluded from its cell's judgment, counted and reported as a rate, and refilled within its pass (the
// timed blocks, or the audit) up to as many extra samples as the pass planned; past that bound the cell fails closed as
// incomplete. A reply that claims or implies a drop is never excluded.

/** The start of every refusal or notice a drag's after-release watch leaves pending (dnd.rs `pending_notice`). */
const PENDING = 'Pending from your last drag';
const pending = (text) => typeof text === 'string' && text.startsWith(PENDING);

const COUNTS = ['downs', 'starts', 'ends', 'drops'];
const counted = (page) => page != null && COUNTS.every((k) => typeof page[k] === 'number');
const at = (event) => event !== null && typeof event?.t === 'number';
/** Whether the page's log read after the sample is the log of the sample's own press, and of no other. */
const ownPress = ({ before, after } = {}) => counted(before) && counted(after) && after.downs === before.downs + 1 && after.log?.seq === after.downs;

/**
 * (ii), from the drag page's record of the sample (`drop_status`, device.mjs): the sample's own press, ended in a
 * pointerup with nothing of a drag in its log, and no drag start, end or drop counted on the page.
 */
export function noDragSession(dropStatus) {
  if (!ownPress(dropStatus)) return false;
  const { before, after } = dropStatus;
  const { log } = after;
  return at(log.up) && log.start === null && log.cancel === null && log.end === null && after.starts === before.starts && after.ends === before.ends && after.drops === before.drops;
}

/** Whether the page shows a drag session: a drag start, end or drop counted, or one in the sample's own press's log. */
function pageStarted(dropStatus) {
  const { before, after } = dropStatus ?? {};
  if (counted(before) && counted(after) && (after.starts > before.starts || after.ends > before.ends || after.drops > before.drops)) return true;
  return ownPress(dropStatus) && [after.log.start, after.log.cancel, after.log.end].some(at);
}

/** Whether the engine recorded a take for the drag (its `--stats` dnd and press records), where it kept them. */
function engineTook(r) {
  const took = (dnd) => dnd != null && (dnd.started === true || (dnd.outcome !== undefined && dnd.outcome !== 'no_start'));
  return took(r.dnd) || took(r.engine_stats?.dnd) || r.press?.taken === true || r.engine_stats?.press?.taken === true;
}

/**
 * Whether anything the drag left pending was read: the late case's read and the late-take case's read and next acting
 * request (device.mjs), and the next request on the same engine, refused for it or carrying the late take's record.
 */
function leftPending(r, next) {
  if (r.state_notice != null || r.read_notice === true) return true;
  if (r.next_ok === false && pending(r.next_error)) return true;
  return next != null && ((next.ok === false && pending(next.error)) || next.engine_stats?.late_dnd != null);
}

/**
 * A sample's class under ruling 823, `next` the next request on the same engine (the next sample of its series, or the
 * next audited request): `unmet` (excluded), or why not: `not-plain-ok` (a refusal or another answer), `claims` (an ok
 * whose reply carried a notice), `started` (a record shows Chrome started a drag session), `changed` (something dropped
 * or the desktop changed) or `unshown` (the records cannot show it either way).
 */
export function classifyPremise(r, next = null) {
  if (r.ok !== true || r.error != null) return 'not-plain-ok';
  if (pageStarted(r.drop_status) || engineTook(r) || leftPending(r, next)) return 'started';
  if (r.dropped === true || r.witness === false) return 'changed';
  // the reply's notice as cua answered it: a stored row from before this ruling did not keep it
  if (!('reply_notice' in r)) return 'unshown';
  if (r.reply_notice !== null) return 'claims';
  return noDragSession(r.drop_status) ? 'unmet' : 'unshown';
}

/**
 * A pass's samples (`entries`, its fill samples marked `fill`) split under the ruling, `nextOf(entry, index)` the next
 * request on the same engine: which are excluded (`unmet`, by index), those judged, and the counts.
 */
export function splitPremise(entries, nextOf) {
  const unmet = entries.map((e, i) => classifyPremise(e, nextOf(e, i) ?? null) === 'unmet');
  return {
    unmet,
    excluded: unmet.filter(Boolean).length,
    judged: entries.filter((_, i) => !unmet[i]),
    samples: entries.length,
    planned: entries.filter((e) => !e.fill).length,
    refilled: entries.filter((e) => e.fill).length,
  };
}

/** How many more samples a pass needs to judge its planned count again, and how many its bound still allows. */
export function fillNeed({ judged, planned, refilled }) {
  const room = Math.max(0, planned - refilled);
  return { need: Math.min(Math.max(0, planned - judged.length), room), room };
}

/**
 * Refill a pass (`entries`, grown in place by `runMore`) until it judges its planned count, or its bound is spent.
 * `runMore({need, room})` runs more samples of the pass, each marked `fill`, and answers how many it asked for (`need`
 * where it answers nothing): what it asks for is spent from the bound whether or not every sample was taken, so a round
 * whose samples are not taken never loops.
 */
export async function refill(entries, nextOf, runMore) {
  let room = fillNeed(splitPremise(entries, nextOf)).room;
  for (;;) {
    const { need } = fillNeed(splitPremise(entries, nextOf));
    const ask = Math.min(need, room);
    if (ask <= 0) return;
    room -= Math.min(room, Math.max(1, (await runMore({ need: ask, room })) ?? ask));
  }
}

const rate = (n, of) => Math.round((n / of) * 1000) / 1000;
const was = (n) => (n === 1 ? 'was' : 'were');

/**
 * A pass's judgment under the ruling: the entries to judge, its record (absent where nothing was excluded or refilled),
 * and its reasons, where it judged fewer than it planned (incomplete, failing closed) or refilled past its bound.
 * `name(entry, index)` names a sample, `what` the pass's samples in a reason, `prefix` the pass in it.
 */
export function judgePremise(entries, nextOf, { name, what = 'samples', prefix = 'incomplete' }) {
  const { unmet, excluded, judged, samples, planned, refilled } = splitPremise(entries, nextOf);
  const reasons = [];
  if (excluded && judged.length < planned) {
    reasons.push(`${prefix}: Chrome never started a drag and drop on ${excluded} of ${samples} ${what} (the premise unmet, ruling 823), so ${judged.length} ${was(judged.length)} judged of the ${planned} planned, with ${refilled} refilled of a bound of ${planned}`);
  }
  if (refilled > planned) reasons.push(`${refilled} ${what} refilled past the bound of ${planned}`);
  const record = excluded || refilled ? { samples, unmet: excluded, rate: rate(excluded, samples), planned, refilled, judged: judged.length, unmet_samples: entries.flatMap((e, i) => (unmet[i] ? [name(e, i)] : [])) } : null;
  return { judged, record, reasons };
}

/**
 * What an audited request keeps for the ruling (run.mjs's audit pass), from its sample's row: the reply's notice, the
 * page's record and the case's reads, those the row has.
 */
export function premiseFields(row) {
  const keys = ['reply_notice', 'drop_status', 'dropped', 'state_notice', 'next_ok', 'next_error', 'read_ok', 'read_notice'];
  return Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
}

/**
 * A run's summary lines for the ruling: each cell's unmet premise as a rate, its timed pass and its audit apart, with
 * what it refilled against its bound and what it judged against what it planned (bold where it judged fewer, the cell's
 * incomplete). None where no cell excluded or refilled anything.
 */
export function premiseMarkdown(verdicts) {
  const rows = verdicts.flatMap((v) => ['timed', 'audit'].filter((pass) => v.premise_unmet?.[pass]).map((pass) => ({ v, pass, r: v.premise_unmet[pass] })));
  if (!rows.length) return [];
  const percent = (r) => `${Math.round(r * 1000) / 10}%`;
  return [
    '',
    "Samples whose premise was unmet (ruling 823): cua answered a plain drag and the page's record shows Chrome never started a drag and drop. Each is excluded, counted here, and refilled within its pass up to as many as it planned; a cell that judged fewer than it planned fails as incomplete. No cell not listed excluded anything:",
    '',
    '| scene | op | pass | unmet | refilled of the bound | judged of planned | unmet samples |',
    '|---|---|---|---:|---:|---:|---|',
    ...rows.map(({ v, pass, r }) => `| ${v.scene} | ${v.op} | ${pass} | ${r.unmet} of ${r.samples} (${percent(r.rate)}) | ${r.refilled} of ${r.planned} | ${r.judged < r.planned ? `**${r.judged} of ${r.planned}**` : `${r.judged} of ${r.planned}`} | ${r.unmet_samples.join(', ')} |`),
  ];
}
