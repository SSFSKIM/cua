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

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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

/** A `drop_settles` record as the engine prints it, or null for anything else. */
export function settleCounts(value) {
  if (!value || typeof value !== 'object') return null;
  if (!COUNTS.every((k) => Number.isInteger(value[k]) && value[k] >= 0)) return null;
  return Object.fromEntries(COUNTS.map((k) => [k, value[k]]));
}

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * An engine's entry: which build it is (`vendor`, a build the run named as the vendor's; `cua`, one started with
 * `--stats` or, unprobed, any other engine build; `other`, a stand-in that is no engine build or a build the opt-in's
 * probe found not cua's), and its counter or why there is none.
 */
export function engineEntry(engine, { vendors, isEngineFile }) {
  const vendor = new Set(vendors.filter(Boolean).map(real)).has(real(engine.bin));
  const build = vendor ? 'vendor' : engine.stats ? 'cua' : engine.probed === false ? 'other' : isEngineFile(engine.bin) ? 'cua' : 'other';
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

const sum = (records) => Object.fromEntries(COUNTS.map((k) => [k, records.reduce((n, r) => n + r[k], 0)]));
const taken = (c) => c.entered > 0 || c.second_rest > 0;

/**
 * A step's settle, from its record: `{state, counts, engines, undragged, unknown}`. `state` is `taken` when any cua
 * engine's last counter shows the branch run (entered, or a second rest taken), `not taken` only when every cua engine
 * recorded its counter, read whole, at zeros, or was sent no request the settle runs in (`undragged`, the harness's own
 * record of what it sent), and `unknown` otherwise: no record, no counter in it, or any cua engine sent a drag whose
 * counter is missing, that was still running when its harness ended (a line may be unread), or that wrote a stats
 * line that did not parse (it may have been the last). Each engine's counter is its own process's, cumulative, so the
 * step's counts are the sum of each engine's last value.
 */
export function settleVerdict(record) {
  if (!record) return { state: 'unknown', counts: null, engines: 0, undragged: 0, unknown: [`no ${SETTLE_COUNTS}`] };
  const engines = record.processes.flatMap((p) => p.engines ?? []).filter((e) => e.build === 'cua');
  if (!engines.length) return { state: 'unknown', counts: null, engines: 0, undragged: 0, unknown: ['no cua engine recorded'] };
  const unknown = [];
  const read = [];
  let undragged = 0;
  for (const e of engines) {
    const c = settleCounts(e.drop_settles);
    if (!c && !mayDrag(e)) {
      undragged += 1;
      continue;
    }
    const why = !c ? e.recorded ?? NO_STATS : !e.ended ? 'still running when its harness ended: a line may be unread' : e.unparsable > 0 ? `${e.unparsable} stats line(s) did not parse` : null;
    if (c) read.push(c);
    if (why) unknown.push(`${e.lane} ${e.pid}: ${why}`);
  }
  const counts = read.length ? sum(read) : null;
  if (!counts) return { state: 'unknown', counts: null, engines: engines.length, undragged, unknown: unknown.length ? unknown : ['no cua engine recorded its counter'] };
  const state = taken(counts) ? 'taken' : unknown.length ? 'unknown' : 'not taken';
  return { state, counts, engines: engines.length, undragged, unknown };
}

/** A step directory's record: its own `settle-counts.json`, or its harness out's (`run/`, gate.mjs). */
export function stepRecord(dir) {
  for (const path of [join(dir, SETTLE_COUNTS), join(dir, 'run', SETTLE_COUNTS)]) {
    if (existsSync(path)) return readSettleCounts(path);
  }
  return null;
}

const countsText = (c) => COUNTS.map((k) => `${k} ${c[k]}`).join(', ');

/** settle-check.mjs: one line per step (and its unknown engines), and the exit code: 0 only when none was taken or unknown. */
export function checkSteps(dirs) {
  const lines = [];
  let code = 0;
  for (const dir of dirs) {
    const v = settleVerdict(stepRecord(dir));
    const of = `${v.engines} cua engine${v.engines === 1 ? '' : 's'}${v.undragged ? `, ${v.undragged} of them with no counter and sent no drag or drag_handle` : ''}`;
    if (v.state === 'not taken') lines.push(`${dir}: not taken (${countsText(v.counts)}; ${of})`);
    else if (v.state === 'taken') lines.push(`${dir}: TAKEN (${countsText(v.counts)}; ${of}): reruns as class A`);
    else lines.push(`${dir}: unknown: ${v.unknown.length === 1 && !v.engines ? v.unknown[0] : `${v.unknown.length} of ${of} not recorded${v.counts ? ` (the others: ${countsText(v.counts)})` : ''}`}`);
    for (const u of v.engines ? v.unknown : []) lines.push(`  ${u}`);
    if (v.state !== 'not taken') code = 1;
  }
  return { lines, code };
}
