// Ruling 823's samples made through the real paths, display-free: each premise case's own read (device.mjs
// `dropStatus`, through drag.mjs's parser) of a page tree carrying the drag page's status lines as pages/drag.html
// writes them, the case's own check (its reads through a scripted engine), and its evidence record, on its row and in
// the run's `premise-evidence.jsonl`.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEVICE_OPS, dndCancelledSentence, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence } from '../../scripts/linux-engine-diff/device.mjs';

export const APP = 'Google-chrome';
export const SCENE = 'device-chrome-dnd';
export const WINDOW = 25165890;
export const cancelled = dndCancelledSentence(APP);

/** A scratch directory of the test's own. */
const made = [];
export const scratch = (name) => {
  // a short root, wherever TMPDIR is long (macOS's runner): a scratch path stays well inside a socket path's bytes
  const dir = mkdtempSync(join(tmpdir().length <= 32 ? tmpdir() : '/tmp', `p-${name.replace(/\W+/g, '-').slice(0, 12)}-`));
  made.push(dir);
  return dir;
};
/** Every scratch directory the file's tests made, removed (`after`): the suite's cleanup check finds none left. */
export const removeScratch = () => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
};

/** A stand-in engine binary, its bytes the run's "engine". */
export function engineBin(dir, bytes = 'cua-engine 0.4.1 stand-in') {
  const bin = join(dir, `engine-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`);
  writeFileSync(bin, bytes);
  return bin;
}

/** A run's fixture label as scenes.mjs `label` gives one: the run's name, its Desktop's nonce, then the parts. */
export const labelOf = (run, nonce) => `cua171-diff-${run}-${nonce}-device_cua`;
const newNonce = () => randomBytes(4).toString('hex');

// the page's status lines, as pages/drag.html writes them (`showDnd`, `showLog`)
const dndLine = (c) => `dnd starts ${c.starts} drops ${c.drops} downs ${c.downs} detail 1 gap -1 selects 0 ends ${c.ends} effect -1 lat -1 dur -1 ups ${c.ups} at ${c.at}`;
const at = (t) => `${t.toFixed(1)}/${(t + 0.4).toFixed(1)}`;
const movesLine = (seq, { start = -1, up = -1, cancel = -1, end = -1, moves = [[0, 0, 0, 1, 1], [95, 194, 12, 1, 1]] } = {}) =>
  `moves seq ${seq} n ${moves.length} start ${start === -1 ? -1 : at(start)} up ${up === -1 ? -1 : at(up)} cancel ${cancel === -1 ? -1 : at(cancel)} end ${end === -1 ? -1 : at(end)} m${moves.map(([t, dx, dy, b, c]) => ` ${at(t)}/${dx}/${dy}/${b}/${c}`).join('')}`;

/**
 * The page after a sample, from the page before it (`{starts, drops, downs, ends, ups}`) and the press time: `plain` a
 * press the page saw released (no drag session), `took` a press Chrome turned into a drag and drop, `landed` one that
 * dropped on the zone, or a function of `(before, at)` answering the lines itself.
 */
export const PAGES = {
  plain: (b, t) => ({ counts: { ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }, moves: movesLine(b.downs + 1, { up: 158 }) }),
  took: (b, t) => ({ counts: { ...b, starts: b.starts + 1, ends: b.ends + 1, downs: b.downs + 1, at: t }, moves: movesLine(b.downs + 1, { start: 0, cancel: 95, end: 165 }) }),
  landed: (b, t) => ({ counts: { ...b, starts: b.starts + 1, ends: b.ends + 1, drops: b.drops + 1, downs: b.downs + 1, at: t }, moves: movesLine(b.downs + 1, { start: 0, cancel: 95, end: 165 }) }),
};
export { dndLine, movesLine };

/** A page tree as cua reads it: Chrome's frame titled with the scene's label, the page's status paragraphs. */
const tree = (label, lines) => ({ role: 'frame', name: `${label} - Google Chrome`, children: lines.map((name) => ({ role: 'paragraph', name })) });

/** An engine stand-in: its binary, and the answers its scripted reads give (by command), each with its request id. */
export function scriptedEngine(bin, answers = {}) {
  let next = 1000;
  return {
    bin,
    nextId: () => next++,
    async request(command) {
      const id = next++;
      const response = { id, ok: true, ...(answers[command] ?? {}) };
      return { id, response, stats: null };
    },
  };
}

/**
 * One sample of a premise case through its own read and check: the page before (`base` counts), the request answered
 * (`reply`), the page after (`page`, a PAGES key or a function, or `lines` to give the status lines outright), and the
 * row as run.mjs keeps it. `engine` is the sample's engine (one per series or audit lifecycle); `label` the run's fixture.
 */
export async function sample({ out, run, op, block, i, engine, reply = { ok: true }, page = 'plain', lines = null, base, label, row = {}, window = WINDOW, titled = true }) {
  let current = [dndLine({ ...base, at: 0 }), movesLine(base.downs, { start: 0, cancel: 90, end: 160 })];
  const desktop = { run, logs: join(out, 'apps'), state: async () => ({ ax_tree: tree(titled ? label : 'another page', current) }) };
  const scene = { id: window, label, app: APP, dndAt: { page: true }, lastRequest: { op, block, i } };
  const ctx = { desktop, scene, sceneName: SCENE, engine, i, dispose: () => {} };
  ctx.before = await DEVICE_OPS[op].read(ctx);
  // the request: the press lands now
  await new Promise((r) => setTimeout(r, 2));
  const pressed = Date.now() % 1e9;
  if (lines) current = lines(base, pressed);
  else {
    const after = (typeof page === 'function' ? page : PAGES[page])(base, pressed);
    current = [dndLine(after.counts), after.moves];
  }
  const response = { id: engine.nextId(), ok: reply.ok, ...(reply.ok ? {} : { error: reply.error }), ...(reply.notice ? { notice: reply.notice } : {}) };
  const checked = await DEVICE_OPS[op].check(ctx, response);
  return { run, kind: 'sample', engine: 'cua', scene: SCENE, op, block, i, series: i === 0 ? 'cold' : 'warm', ok: response.ok, ...(response.ok ? {} : { error: response.error }), witness: true, ...checked, ...row };
}

/** Counts far apart per sample, so no two samples' pages are alike. */
export const baseFor = (k) => ({ starts: 10 * k, drops: 0, downs: 10 * k, ends: 10 * k, ups: 0 });

/**
 * A run's samples of one case: `blocks` of `[spec, ...]` (each spec a sample's fields), every block on its own engine;
 * and its audit's `[spec, ...]` on one more, all on the run's one fixture (`nonce`, the run's Desktop's). Made in
 * parallel (each check waits its quiet time). Answers the timed rows, the audit row's answered entries, and the label.
 */
export async function caseSamples({ out, run, op, bin, blocks, audit = [], offset = 0, answers = {}, nonce = newNonce() }) {
  const label = labelOf(run, nonce);
  let k = offset;
  const jobs = [];
  blocks.forEach((specs, b) => {
    const engine = scriptedEngine(bin, answers);
    specs.forEach((spec, i) => jobs.push(sample({ out, run, op, block: b, i, engine, base: baseFor(k++), label, ...spec })));
  });
  const auditEngine = scriptedEngine(bin, answers);
  const auditJobs = audit.map((spec, i) => sample({ out, run, op, block: 'audit', i, engine: auditEngine, base: baseFor(k++), label, ...spec }));
  const rows = await Promise.all(jobs);
  const audited = await Promise.all(auditJobs);
  return { rows, label, answered: audited.map((r) => ({ ok: r.ok, error: r.error ?? null, expected_error: r.expected_error ?? null, late_error: r.late_error ?? null })) };
}

const took = (dnd) => ({ dnd: { outcome: 'in_time', started: true, in_front: false, held_at_start: false, ...dnd } });
/** A cancelled sample, as Chrome took the drag in time: the cancel's sentence. */
export const CANCEL = { reply: { ok: false, error: cancelled }, page: 'took', row: took() };
/** The obscured cancel case's: the engine watched the drag with the signature already held, not in front. */
export const HELD_CANCEL = { ...CANCEL, row: took({ held_at_start: true }) };
/** A late cancel, honestly answered that the drop may have happened. */
export const LATE = { reply: { ok: false, error: dndMayHaveDroppedSentence(APP) }, page: 'took', row: took() };
export const HELD_LATE = { ...LATE, row: took({ held_at_start: true }) };
/** The late take: a plain drag at the release whose drop landed, the witness showing it. */
export const LANDED = { reply: { ok: true }, page: 'landed', row: { witness: false, dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false } } };
/** The late take's reads: the read carries the late notice, the next acting request is refused with it. */
export const LATE_TAKE_ANSWERS = { list_windows: { notice: dndLateNotice(APP) }, move: { ok: false, error: dndLateRefusal(APP, 'move') } };
/** A plain-drag ok Chrome never started a drag session for: the unmet premise. */
export const UNMET = { reply: { ok: true }, page: 'plain', row: { dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false }, press: { taken: false } } };
/** The obscured cases' unmet premise, the engine's guard held as it should be. */
export const HELD_UNMET = { ...UNMET, row: { ...UNMET.row, dnd: { ...UNMET.row.dnd, held_at_start: true } } };
export { dndLateRefusal };
