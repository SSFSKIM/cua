// The design session's ruling 823: a V5 Chrome drag-and-drop sample whose premise was unmet. A cell that measures what cua
// does once Chrome turns a drag into a drag and drop (device.mjs `PREMISE_OPS`: the cancel, late and late-take cases)
// proves nothing on a drag Chrome never took. Such a sample is one where both hold:
//
// - (i) cua's reply claims no drop effect: a plain-drag ok, with no notice on it;
// - (ii) the run's own records show that Chrome never started a drag session for that sample.
//
// The evidence for (ii) is the drag page's own status lines (pages/drag.html), read before and after the sample and kept
// as the page wrote them (device.mjs `premiseEvidence`). Chrome's renderer fires dragstart before its browser process
// starts the X drag session (takes XdndSelection, grabs the pointer), and once a drag starts the press ends in Chrome's
// pointercancel and a dragend, never a pointerup. So a press of the sample's own (the source's press count up by one,
// the pointer log numbered with it, its time inside the sample's attempt) whose log carries an explicit pointerup time
// and explicit `-1` for dragstart, pointercancel and dragend, with the page's drag-start, drag-end and drop counts
// unmoved, is a press Chrome never started a drag session for. Only explicit tokens prove it: a missing token, a line
// not of the page's exact form, a line that is not the one status line of its kind, or a tree that does not carry the
// scene's own page title proves nothing, and the sample is judged as before (ruling 825's terms: fail closed, never
// exclude on it).
//
// The engine's own records of a take (its drag and press records, and its record of a late take) contradict the proof, so a sample they disagree with
// is judged as before. A reply or a notice that claims or implies a drop (a pending notice on the reply, the may-have-
// dropped answer, the drag's own reads carrying a notice, the next request refused for something pending) is a claim of
// cua's: where the page proves Chrome never started a drag session, it is a false claim and fails its cell.
//
// Such a sample is excluded from its cell's judgment and counted. A cell short of its planned count, of its cold or warm
// quota or of its audit's, is refilled by premise-refill.mjs from whole reruns of V5, at most `MAX_REFILL_RUNS` of them
// (the controller's route B', on rulings 823 and 825); one still short after them fails closed as incomplete. A
// separate failure of the excluded sample's own reads still fails its cell.
//
// Each rerun of V5 carries the main run's name, so a refill run's samples are tagged with their run (`origin`,
// premise-refill.mjs's `r1`, `r2`), and every evidence line is bound to its run's own fixture label, which carries the
// harness's per-run nonce (scenes.mjs `label`), as well as to its window's XID.

/** The start of every refusal or notice a drag's after-release watch leaves pending (dnd.rs `pending_notice`). */
const PENDING = 'Pending from your last drag';
const pending = (text) => typeof text === 'string' && text.startsWith(PENDING);
/** The may-have-dropped answer's mark (dnd.rs): the drop may have happened. */
const mayHaveDropped = (text) => typeof text === 'string' && text.includes('the drop may have happened');

// ---------------------------------------------------------------------------------------------------------------
// the page's status lines, parsed strictly

const TIME = '(-1|-?\\d+(?:\\.\\d+)?/-?\\d+(?:\\.\\d+)?)';
const NUM = '-?\\d+(?:\\.\\d+)?';
const DND_LINE = /^dnd starts (\d+) drops (\d+) downs (\d+) detail (-?\d+) gap (-?\d+) selects (\d+) ends (\d+) effect (-?\d+) lat (-?\d+) dur (-?\d+) ups (\d+) at (\d+)$/;
const MOVES_LINE = new RegExp(`^moves seq (\\d+) n (\\d+) start ${TIME} up ${TIME} cancel ${TIME} end ${TIME} m((?: \\S+)*)$`);
const MOVE_TOKEN = new RegExp(`^${NUM}/${NUM}/${NUM}/${NUM}/\\d+/\\d+$`);

/**
 * One read of the page as device.mjs keeps it (`{dnd: [lines], moves: [lines], titled}`): its counts and its pointer
 * log, each from the one status line of its kind, in the page's exact form, the log's moves as many as it says; null
 * where anything is missing, doubled, malformed or truncated, or where the tree did not carry the scene's page title.
 */
export function parsePageRead(read) {
  if (!read || read.titled !== true || !Array.isArray(read.dnd) || !Array.isArray(read.moves) || read.dnd.length !== 1 || read.moves.length !== 1) return null;
  const d = read.dnd[0].match(DND_LINE);
  const m = read.moves[0].match(MOVES_LINE);
  if (!d || !m) return null;
  const tokens = m[7].split(' ').filter(Boolean);
  if (tokens.length !== Number(m[2]) || !tokens.every((t) => MOVE_TOKEN.test(t))) return null;
  const [, starts, drops, downs, , , , ends, , , , ups, at] = d.map(Number);
  return { starts, drops, downs, ends, ups, at, log: { seq: Number(m[1]), n: Number(m[2]), start: m[3], up: m[4], cancel: m[5], end: m[6] } };
}

/** Whether the press time the page counted (epoch ms modulo 1e9) lies inside the attempt `[from, to]` (epoch ms). */
function inAttempt(at, { from, to } = {}) {
  if (![at, from, to].every(Number.isFinite) || to < from) return false;
  return (at - (from % 1e9) + 1e9) % 1e9 <= to - from;
}

/** The sample's two reads parsed, with the press its own: up by one, the log numbered with it, inside its attempt. */
function ownPress(evidence) {
  const before = parsePageRead(evidence?.page?.before);
  const after = parsePageRead(evidence?.page?.after);
  if (!before || !after) return null;
  if (after.downs !== before.downs + 1 || after.log.seq !== after.downs || !inAttempt(after.at, evidence.attempt)) return null;
  return { before, after };
}

/**
 * (ii), from a sample's evidence (device.mjs `premiseEvidence`): the sample's own press, its log carrying an explicit
 * pointerup time and an explicit `-1` for dragstart, pointercancel and dragend, and no drag start, end or drop counted,
 * bound to its request, its engine's lifecycle and its window.
 */
export function noDragSession(evidence) {
  const press = ownPress(evidence);
  if (!press || !Number.isInteger(evidence.request) || typeof evidence.lifecycle !== 'string' || !Number.isInteger(evidence.window)) return false;
  const { before, after } = press;
  const { log } = after;
  return log.up !== '-1' && log.start === '-1' && log.cancel === '-1' && log.end === '-1' && after.starts === before.starts && after.ends === before.ends && after.drops === before.drops;
}

/** Whether the page shows a drag session: from the evidence's lines, or a stored row's parsed counts (before 823's fix). */
function pageStarted(r) {
  const before = parsePageRead(r.premise_evidence?.page?.before);
  const after = parsePageRead(r.premise_evidence?.page?.after);
  if (before && after && (after.starts > before.starts || after.ends > before.ends || after.drops > before.drops)) return true;
  const own = ownPress(r.premise_evidence);
  if (own && [own.after.log.start, own.after.log.cancel, own.after.log.end].some((t) => t !== '-1')) return true;
  const { before: b, after: a } = r.drop_status ?? {};
  const n = (p, k) => typeof p?.[k] === 'number';
  return ['starts', 'ends', 'drops'].some((k) => n(b, k) && n(a, k) && a[k] > b[k]);
}

// ---------------------------------------------------------------------------------------------------------------
// a sample's class

/**
 * Whether the engine recorded a take for the drag, where it kept its records: its `--stats` dnd and press records, and
 * its after-release watch's record of a late take (`late_dnd`), on the drag's own reads or on the next request.
 */
function engineTook(r, next) {
  const took = (dnd) => dnd != null && (dnd.started === true || (dnd.outcome !== undefined && dnd.outcome !== 'no_start'));
  if (took(r.dnd) || took(r.engine_stats?.dnd) || r.press?.taken === true || r.engine_stats?.press?.taken === true) return true;
  return r.late_dnd != null || r.late_watch?.next?.late_dnd != null || next?.engine_stats?.late_dnd != null;
}

/** cua's claims of a drop around the sample: on its reply, its own reads (device.mjs's), and the next request's answer. */
function claimsDrop(r, next) {
  if (r.ok === true && r.reply_notice != null) return true;
  if (mayHaveDropped(r.error)) return true;
  if (r.state_notice != null || r.read_notice === true || r.read_notice_text != null || (r.next_ok === false && pending(r.next_error))) return true;
  return next != null && next.ok === false && pending(next.error);
}

/**
 * Whether a row's own page record (`drop_status`, where it keeps one) is the page its evidence holds: a row whose record
 * is null or another page's proves nothing. An audit's entry keeps no record of its own.
 */
function samePage(r) {
  if (!('drop_status' in r)) return true;
  const raw = (side) => JSON.stringify(r.drop_status?.[side]?.raw ?? null);
  return r.drop_status != null && raw('before') === JSON.stringify(r.premise_evidence?.page?.before ?? null) && raw('after') === JSON.stringify(r.premise_evidence?.page?.after ?? null);
}

/**
 * A sample's class under the ruling, `next` the next request on its engine (`adjacency`): `unmet` (excluded),
 * `false-claim` (the page proves no session and cua claimed or implied a drop: a failure), or why it is judged as
 * before: `started` (the engine recorded a take, or the page shows a session), `changed` (something dropped, or the
 * desktop changed), `not-plain-ok` (a refusal or another answer with no claim of a drop) or `unshown` (the records
 * cannot show it either way).
 */
export function classifyPremise(r, next = null) {
  if (engineTook(r, next) || pageStarted(r)) return 'started';
  if (r.dropped === true || r.witness === false) return 'changed';
  const proven = 'reply_notice' in r && samePage(r) && noDragSession(r.premise_evidence);
  const plain = r.ok === true && r.error == null;
  if (!proven) return plain ? 'unshown' : 'not-plain-ok';
  if (claimsDrop(r, next)) return 'false-claim';
  return plain ? 'unmet' : 'not-plain-ok';
}

/**
 * A separate failure of an excluded sample's own reads (device.mjs's late and late-take reads), which its exclusion does
 * not excuse: the read after the drag that did not run, and the next acting request refused for anything but what the
 * drag left pending. A clean read with no notice is no failure.
 */
export function followUpFailure(r) {
  if (r.read_ok === false) return `the read after the drag failed${r.read_error ? ` (${String(r.read_error).slice(0, 80)})` : ''}`;
  if (r.state_ok === false) return 'the window read after the drag failed';
  if (r.next_ok === false && !pending(r.next_error)) return `the next acting request failed (${String(r.next_error).slice(0, 80)})`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// adjacency, and the audit's entries bound to their evidence

/**
 * A sample's engine lifecycle: its evidence's, else (a stored row from before the fix) its run's block for a timed row,
 * and its run's audit where the audit ran in one lifecycle. Null where it cannot be told.
 */
export function lifecycleOf(r) {
  if (typeof r.premise_evidence?.lifecycle === 'string') return r.premise_evidence.lifecycle;
  if (r.lifecycle !== undefined) return r.lifecycle;
  return r.block === 'audit' ? null : `${r.origin ?? r.run ?? ''}|${r.block}`;
}

/** The one adjacency rule, for the verdict, the refill and the replay: the next request on the same engine lifecycle. */
export const adjacency = (entries) => (e) => {
  const life = lifecycleOf(e);
  return life == null ? null : (entries.find((x) => x !== e && lifecycleOf(x) === life && x.i === e.i + 1) ?? null);
};

/**
 * An audit's requests (`audit.answered`, in order, as run.mjs records them) bound to the evidence its samples recorded
 * (`lines`, device.mjs's records of block `audit`), as entries the judge reads like samples (`i`, `lifecycle`, the reads,
 * `premise_evidence`). Every request must have exactly one line of this run, scene and operation, answering as the
 * request did, on the audited window; any line missing, doubled or foreign is a problem, and its entries keep no
 * evidence (judged as before). With no lines at all (a run from before the fix) the entries keep none.
 */
export function bindAudit(audit, lines, { run, scene, op, window = null, label = null, origin = undefined } = {}) {
  const answered = audit?.answered ?? [];
  const lifecycles = audit?.lifecycles ?? 1;
  const tag = origin === undefined ? {} : { origin };
  const bare = answered.map((a, i) => ({ ...a, i, run, ...tag, block: 'audit', lifecycle: lifecycles === 1 ? `${origin ?? run}|audit` : null }));
  if (lines == null) return { entries: bare, problems: [] };
  const problems = [];
  // what the lines are bound to: the audited window (its XID) and the run's own fixture, whose label carries the run's
  // name and its Desktop's nonce, so a line of a prior run of the same name, even on a reused XID, never binds
  if (!Number.isInteger(window)) problems.push('no audited window to bind the lines to');
  if (!ownLabel(label, run)) problems.push(`no fixture label of run ${run} to bind the lines to`);
  const mine = lines.filter((l) => l.block === 'audit' && l.scene === scene && l.op === op);
  for (const l of mine.filter((x) => x.run !== run)) problems.push(`a line of another run (${l.run}) at audit/${l.i}`);
  const own = mine.filter((l) => l.run === run);
  for (const l of own.filter((x) => x.fixture?.label !== label)) problems.push(`audit/${l.i}'s line is of another fixture (${l.fixture?.label ?? 'none'})`);
  // the reply as recorded, every field present: an absent notice is never read as none
  for (const l of own.filter((x) => !hasReply(x))) problems.push(`audit/${l.i}'s line does not record the reply's ok, error and notice`);
  const at = (i) => own.filter((l) => l.i === i);
  answered.forEach((a, i) => {
    const found = at(i);
    if (found.length === 0) problems.push(`no line for audit/${i}`);
    else if (found.length > 1) problems.push(`${found.length} lines for audit/${i}`);
    else if (found[0].reply?.ok !== a.ok || (found[0].reply?.error ?? null) !== (a.error ?? null)) problems.push(`audit/${i}'s line answered otherwise than the audit recorded`);
  });
  for (const l of own.filter((x) => !(Number.isInteger(x.i) && x.i >= 0 && x.i < answered.length))) problems.push(`a line for a request the audit did not record (audit/${l.i})`);
  const lifes = new Set(own.map((l) => l.lifecycle));
  if (lifes.size !== lifecycles) problems.push(`${lifes.size} engine lifecycles in the lines, ${lifecycles} in the audit`);
  const requests = own.map((l) => `${l.lifecycle}|${l.request}`);
  if (new Set(requests).size !== requests.length) problems.push('a request id twice in one lifecycle');
  if (Number.isInteger(window) && own.some((l) => l.window !== window)) problems.push(`a line on another window than the audited ${window}`);
  if (problems.length) return { entries: bare, problems };
  return {
    entries: answered.map((a, i) => {
      const l = at(i)[0];
      return { ...a, i, run, ...tag, block: 'audit', lifecycle: l.lifecycle, reply_notice: l.reply.notice, dropped: l.dropped, witness: null, ...l.reads, premise_evidence: l };
    }),
    problems: [],
  };
}

/** Whether an evidence line records cua's reply whole: its ok, its error and its notice, each present (null or not). */
export const hasReply = (l) => l?.reply != null && typeof l.reply === 'object' && ['ok', 'error', 'notice'].every((k) => k in l.reply);

/** Whether `label` is a fixture label of run `run`'s own (scenes.mjs `label`: `cua171-diff-<run>-<nonce>-...`). */
export const ownLabel = (label, run) => typeof label === 'string' && typeof run === 'string' && run !== '' && label.startsWith(`cua171-diff-${run}-`) && label.length > `cua171-diff-${run}-`.length;

/** The one fixture label a case's timed rows' evidence names, or null where they name none or more than one. */
export function evidenceLabel(rows) {
  const labels = new Set(rows.filter((r) => r.premise_evidence).map((r) => r.premise_evidence.fixture?.label ?? null));
  return labels.size === 1 ? [...labels][0] : null;
}

/**
 * A run's timed rows bound to their evidence: each row's evidence must name the row's own run, scene, operation, block
 * and request number, and every row of a scene the same window and page. Answers the problems; a row whose evidence does
 * not fit keeps none (judged as before).
 */
export function bindTimed(rows) {
  const problems = [];
  const bound = rows.map((r) => {
    const e = r.premise_evidence;
    if (e == null) return r;
    // a refill's row keeps its own run's block (`fill_block`, premise-refill.mjs) under the name it is combined by
    const wrong = e.run !== r.run || e.scene !== r.scene || e.op !== r.op || e.block !== (r.fill_block ?? r.block) || e.i !== r.i;
    if (wrong) problems.push(`${r.block}/${r.i}'s evidence names another sample (${e.run} ${e.scene} ${e.op} ${e.block}/${e.i})`);
    else if (!ownLabel(e.fixture?.label, r.run)) problems.push(`${r.block}/${r.i}'s evidence names a fixture not of run ${r.run} (${e.fixture?.label ?? 'none'})`);
    else if (!hasReply(e)) problems.push(`${r.block}/${r.i}'s evidence does not record the reply's ok, error and notice`);
    else return r;
    const { premise_evidence, ...rest } = r;
    return rest;
  });
  // one window and page for a scene in each run (a refill run opens its own; every rerun of V5 carries the main run's
  // name, so a run is told by its origin, premise-refill.mjs's)
  for (const run of new Set(bound.map((r) => r.origin ?? r.run))) {
    const windows = new Set(bound.filter((r) => (r.origin ?? r.run) === run && r.premise_evidence).map((r) => `${r.premise_evidence.window}|${r.premise_evidence.fixture?.label}`));
    if (windows.size > 1) problems.push(`the evidence names ${windows.size} windows or pages for one scene in run ${run}`);
  }
  return { rows: problems.length ? rows.map(({ premise_evidence, ...rest }) => rest) : bound, problems };
}

// ---------------------------------------------------------------------------------------------------------------
// a pass under the ruling

/**
 * The whole reruns of V5 a short cell may be refilled from (the controller's route B'): each brings the pass's planned
 * samples again, so a pass's bound is this many times its planned count.
 */
export const MAX_REFILL_RUNS = 2;

const rate = (n, of) => (of ? Math.round((n / of) * 1000) / 1000 : 0);
const was = (n) => (n === 1 ? 'was' : 'were');
const QUOTAS = { cold: (e) => e.series === 'cold', warm: (e) => e.series !== 'cold' };

/**
 * A pass's samples (`entries`, refill samples marked `fill`) under the ruling: the entries judged (the excluded taken
 * out), its record, its reasons, and what it still needs. `quotas`: the timed pass keeps its cold and warm quotas apart;
 * the audit is one quota. `name(entry)` names a sample, `what` the pass's samples, `prefix` the pass in a reason.
 * A pass with nothing excluded and nothing refilled keeps no record.
 */
export function judgePremise(entries, { name, what = 'samples', prefix = 'incomplete', quotas = { all: () => true } } = {}) {
  const next = adjacency(entries);
  const classes = entries.map((e) => classifyPremise(e, next(e)));
  const unmet = classes.map((c) => c === 'unmet');
  const judged = entries.filter((_, i) => !unmet[i]);
  const reasons = [];
  const names = (pred) => entries.flatMap((e, i) => (pred(e, i) ? [name(e, i)] : []));
  const falseClaims = names((e, i) => classes[i] === 'false-claim');
  if (falseClaims.length) reasons.push(`answered as if it dropped where the page shows Chrome never started a drag and drop (ruling 823) on ${falseClaims.length} of ${entries.length} ${what} (${falseClaims.slice(0, 3).join(', ')})`);
  const failed = entries.flatMap((e, i) => (unmet[i] && followUpFailure(e) ? [`${name(e, i)}: ${followUpFailure(e)}`] : []));
  if (failed.length) reasons.push(`a sample excluded for its unmet premise failed its own reads on ${failed.length} of ${entries.length} ${what} (${failed.slice(0, 3).join('; ')})`);
  const planned = entries.filter((e) => !e.fill);
  const refilled = entries.length - planned.length;
  const bound = MAX_REFILL_RUNS * planned.length;
  const excluded = unmet.filter(Boolean).length;
  const need = {};
  for (const [q, inQuota] of Object.entries(quotas)) {
    const want = planned.filter(inQuota).length;
    const have = judged.filter(inQuota).length;
    need[q] = Math.max(0, want - have);
    if (excluded && have < want) {
      const which = Object.keys(quotas).length > 1 ? ` ${q}` : '';
      reasons.push(`${prefix}: Chrome never started a drag and drop on ${excluded} of ${entries.length} ${what} (the premise unmet, ruling 823), so ${have}${which} ${was(have)} judged of the ${want} planned, with ${refilled} refilled of a bound of ${bound}`);
    }
  }
  if (refilled > bound) reasons.push(`${refilled} ${what} refilled past the bound of ${bound}`);
  const record = excluded || refilled || falseClaims.length ? { samples: entries.length, unmet: excluded, rate: rate(excluded, entries.length), planned: planned.length, refilled, judged: judged.length, unmet_samples: names((e, i) => unmet[i]), ...(falseClaims.length ? { false_claims: falseClaims } : {}), need } : null;
  return { judged, record, reasons, need, excluded, classes };
}

/** The timed pass's quotas: its cold samples and its warm ones, each kept apart (the gate's cold-sample requirement). */
export const TIMED_QUOTAS = QUOTAS;
