// The settle counter of every step (#171 M5, task 103; ruling 827's condition, rulings 832 and 834). linux-engine
// 0.4.1 prints `drop_settles` on every `--stats` line: `{entered, second_rest, skipped, unsettled}`, the engine
// process's counts over its life (drop_settle.rs `SettleCounts`), all zeros while the settle's branch has never run.
// A class-B step's next run must show that counter; one whose counter shows the branch taken reruns as class A.
//
// The record is the harness's out directory's `settle-counts.json`: for each harness process that wrote there, every
// engine it started (engine.mjs `recordEngines`), by lane and pid, with the last `drop_settles` it printed, from the
// stats lines the run already reads (a runner's own `stats: true`, the wire-mode verdict runs) or, in a development run
// that took `--engine-stats`, from the `--stats` given to every cua lane. A lane with no stats is recorded as not
// recorded, never as zero. Nothing a judge, a report or a parser reads comes from here: the record and the stats files
// (`engine-stats/`) are written beside the run's records, and read only by settle-check.mjs.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The record's file name, in the harness's out directory. */
export const SETTLE_COUNTS = 'settle-counts.json';
/** The directory of the opt-in run's stats files, one per engine process, in the harness's out directory. */
export const ENGINE_STATS_DIR = 'engine-stats';

const COUNTS = ['entered', 'second_rest', 'skipped', 'unsettled'];

/** Why an engine's counter is not in the record, or `recorded`. */
export const RECORDED = 'recorded';
export const NO_STATS = 'no stats: not recorded';
export const NO_COUNTER = 'stats without drop_settles: not recorded';
export const NO_LINE = 'no stats line: not recorded';

/**
 * A `drop_settles` record as the engine prints it, whole (0.4.1 adds `settle_failed_activation_confirmed`), or null for
 * anything without the four counts.
 */
export function settleCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!COUNTS.every((k) => Number.isInteger(value[k]) && value[k] >= 0)) return null;
  return { ...value };
}

/**
 * An engine's entry: its build as identified at its launch (engine.mjs: `vendor`, a build the run named as the
 * vendor's; `cua`, one that took cua's `--stats`; `unidentified`, any other, held to the counter as a cua lane), and its
 * counter or why there is none.
 */
export function engineEntry(engine) {
  const build = engine.build ?? 'unidentified';
  const recorded = engine.dropSettles ? RECORDED : !engine.stats ? NO_STATS : engine.lines > 0 ? NO_COUNTER : NO_LINE;
  return {
    lane: engine.label,
    pid: engine.pid ?? null,
    build,
    bin: engine.bin,
    argv: engine.argv,
    stats: engine.stats,
    stats_file: engine.statsFile?.path ?? null,
    lines: engine.lines,
    unparsable: engine.unparsable,
    ended: engine.ended,
    final: engine.final,
    sent: engine.sent,
    drop_settles: engine.dropSettles,
    recorded,
  };
}

/** Adds one harness process's record to the out directory's file, every earlier process's kept. */
export function writeSettleCounts(out, processRecord) {
  const path = join(out, SETTLE_COUNTS);
  const record = readSettleCounts(path) ?? { kind: 'settle-counts', processes: [] };
  record.processes.push(processRecord);
  writeFileSync(path, `${JSON.stringify(record, null, 1)}\n`);
}

/** The record at `path`, or null when there is none or it does not parse. */
export function readSettleCounts(path) {
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(record?.processes) ? record : null;
  } catch {
    return null;
  }
}

/**
 * The requests inside which the settle runs (0.4.1: engine.rs's dispatch to `drag` and `drag_handle`; pointer.rs and
 * handle.rs start the cursor watch the settle needs there alone, and a handle's later release settles only a handle one
 * of them pressed).
 */
export const SETTLE_REQUESTS = ['drag', 'drag_handle'];
/** Whether an engine may have run the settle by what it was sent: any drag, or a record that does not say. */
const mayDrag = (e) => !e.sent || SETTLE_REQUESTS.some((c) => e.sent[c] > 0);

/** Each count summed over the engines, every field of the snapshot that is a count. */
const sum = (records) => {
  const keys = [...new Set(records.flatMap((r) => Object.keys(r).filter((k) => Number.isInteger(r[k]))))];
  return Object.fromEntries(keys.map((k) => [k, records.reduce((n, r) => n + (Number.isInteger(r[k]) ? r[k] : 0), 0)]));
};
const taken = (c) => c.entered > 0 || c.second_rest > 0;

/**
 * A step's settle, from its record: `{state, counts, engines, undragged, noDrag, unknown}`, over every engine that is no
 * vendor build the run named (a cua lane, or an unidentified one that may be). `state` is `taken` when any engine's
 * last counter shows the branch run (entered, or a second rest taken), whatever else is missing. It is `not taken` only
 * when every such engine either recorded a zero counter in its own post-shutdown snapshot (its last stats line, `"id":
 * null`, after the exit that can end a held handle and settle it), read whole, or was sent no request the settle runs
 * in (`noDrag`: proved by the harness's record of what it sent, listed apart, never a measured zero). Anything else is
 * `unknown`: no record, no counter, a zero read before the exit, an engine still running when its harness ended (a
 * line may be unread), or a stats line that did not parse (it may have been the last). Each counter is its own
 * process's, cumulative, so the step's counts are the sum of each engine's last value, every count of the snapshot.
 */
export function settleVerdict(record) {
  if (!record) return { state: 'unknown', counts: null, engines: 0, undragged: 0, noDrag: [], unknown: [`no ${SETTLE_COUNTS}`] };
  // every engine that is not a vendor build the run named: a cua lane, or one that may be
  const engines = record.processes.flatMap((p) => p.engines ?? []).filter((e) => e.build !== 'vendor');
  if (!engines.length) return { state: 'unknown', counts: null, engines: 0, undragged: 0, noDrag: [], unknown: ['no cua engine recorded'] };
  const unknown = [];
  const read = [];
  const noDrag = [];
  for (const e of engines) {
    const c = settleCounts(e.drop_settles);
    // no counter, and no request the settle runs in: proved by what the harness sent it, never a measured zero
    if (!c && !mayDrag(e)) {
      noDrag.push(`${e.lane} ${e.pid}: no counter; sent no drag or drag_handle (not a measured zero)`);
      continue;
    }
    const why = !c
      ? e.recorded ?? NO_STATS
      : !e.ended
        ? 'still running when its harness ended: a line may be unread'
        : e.unparsable > 0
          ? `${e.unparsable} stats line(s) did not parse`
          : !e.final
            ? 'no post-shutdown snapshot carried its counter: the zero was read before its exit, which can end a held handle and settle it'
            : null;
    if (c) read.push(c);
    if (why) unknown.push(`${e.lane} ${e.pid}: ${why}`);
  }
  const counts = read.length ? sum(read) : null;
  const undragged = noDrag.length;
  const unidentified = engines.filter((e) => e.build !== 'cua').length;
  if (!counts) return { state: 'unknown', counts: null, engines: engines.length, unidentified, undragged, noDrag, unknown: unknown.length ? unknown : ['no cua engine recorded its counter'] };
  const state = taken(counts) ? 'taken' : unknown.length ? 'unknown' : 'not taken';
  return { state, counts, engines: engines.length, unidentified, undragged, noDrag, unknown };
}

/** A step directory's record: its own `settle-counts.json`, or its harness out's (`run/`, gate.mjs). */
export function stepRecord(dir) {
  for (const path of [join(dir, SETTLE_COUNTS), join(dir, 'run', SETTLE_COUNTS)]) {
    if (existsSync(path)) return readSettleCounts(path);
  }
  return null;
}

const countsText = (c) => [...COUNTS, ...Object.keys(c).filter((k) => !COUNTS.includes(k))].map((k) => `${k} ${c[k]}`).join(', ');

/** settle-check.mjs: one line per step (and its unknown engines), and the exit code: 0 only when none was taken or unknown. */
export function checkSteps(dirs) {
  const lines = [];
  let code = 0;
  for (const dir of dirs) {
    const v = settleVerdict(stepRecord(dir));
    const of = `${v.engines} cua engine${v.engines === 1 ? '' : 's'}${v.unidentified ? ` (${v.unidentified} unidentified, held to the counter as cua lanes)` : ''}`;
    const undragged = v.undragged ? `; ${v.undragged} of them with no counter were sent no drag or drag_handle` : '';
    if (v.state === 'not taken') lines.push(`${dir}: not taken (${countsText(v.counts)}; ${of}${undragged})`);
    else if (v.state === 'taken') lines.push(`${dir}: TAKEN (${countsText(v.counts)}; ${of}${undragged}): reruns as class A`);
    else if (!v.engines) lines.push(`${dir}: unknown: ${v.unknown[0]}`);
    else lines.push(`${dir}: unknown: ${v.unknown.length} of ${of} not recorded${undragged}${v.counts ? `; the recorded: ${countsText(v.counts)}` : ''}`);
    for (const u of v.engines ? [...v.unknown, ...v.noDrag] : []) lines.push(`  ${u}`);
    if (v.state !== 'not taken') code = 1;
  }
  return { lines, code };
}
