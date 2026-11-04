#!/usr/bin/env node
// Task 58 (#171 M4, T7's idle sitting on the person's display): the focus-timer experiment's Chromium burst and A-B-A
// scenarios on `:0`, the question being M0.4's `:0` result (a FocusOut sent at 0 ms cuts Chromium's keys), which the
// private Xvfb did not show (task 56: a 0 ms FocusOut alone cut nothing there). Two lanes:
//   - `timer`: the engine as it ships (the 100 ms FocusOut timer, session retention);
//   - `control-0ms`: the plain 0 ms control, `--teardown-ms 0` alone (each request's FocusOut sent as its input ends,
//     the window's redirect kept until the engine exits): M0.4's control, not the experiment's per-request recipe.
// The experiment's own code where it is exported (focus-timer.mjs: the scenarios, the clean start, the settled read, the
// exact-text judge, the series verdict, the raw count); its unexported series, run, audit and window functions copied here
// with the lanes above as their one change, since the module runs only on a private server it starts itself and knows
// no plain control. No stop runs: the exit case goes through the production stop (engine58.mjs).
//
// Where it runs: `--display person` (the sitting): a declared live run on the display it inherits (`:0` under
// run58.sh's guard), its own windows, Chrome and Electron, the person's Openbox, nothing of the person's acted on;
// `--display private` (the driver's own smoke): a private Xvfb with Openbox, the live-run declaration withdrawn first, as
// focus-timer.mjs does.
// usage: focus58.mjs --display person|private --cua <bin> --out <dir> --run <name> [--families chrome,electron]
//        [--scenarios burst,aba] [--trials N]
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const HARNESS = process.env.CUA171_HARNESS ?? join(homedir(), '.local/share/cua-171/live-43');
const lib = (name) => import(join(HARNESS, 'scripts/linux-engine-diff', name));
const ft = await lib('focus-timer.mjs');
const { attributeFocusOuts, auditRequests, parseXtrace, startProxy } = await lib('audit.mjs');
const { Engine } = await lib('engine.mjs');
const { openFamily } = await lib('families.mjs');
const { preorder } = await lib('normalize.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Desktop, desktopEnding } = await lib('scenes.mjs');
const { median } = await lib('stats.mjs');
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, declareLiveRun, xExecFileSync } = await lib('xspawn.mjs');

const { values: opts } = parseArgs({ options: { display: { type: 'string' }, cua: { type: 'string' }, out: { type: 'string' }, run: { type: 'string' }, families: { type: 'string', default: 'chrome,electron' }, scenarios: { type: 'string', default: 'burst,aba' }, trials: { type: 'string' } } });
if (!['person', 'private'].includes(opts.display) || !opts.cua || !opts.out || !opts.run) throw new Error('usage: focus58.mjs --display person|private --cua <bin> --out <dir> --run <name> [--families …] [--scenarios …] [--trials N]');

export const LANES = { timer: [], 'control-0ms': ['--teardown-ms', '0'] };
const timed = (lane) => lane === 'timer';
const FAMILIES = opts.families.split(',');
const SCENARIOS = opts.scenarios.split(',');
for (const f of FAMILIES) if (!ft.CHROMIUM.includes(f)) throw new Error(`${f} is not a Chromium family`);
for (const s of SCENARIOS) if (!['burst', 'aba'].includes(s)) throw new Error(`${s} is not burst or aba`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(opts.out, { recursive: true });
const results = join(opts.out, 'results.jsonl');
const emit = (row) => appendFileSync(results, `${JSON.stringify({ run: opts.run, ...row })}\n`);

const grown = (before, text) => (typeof before.text === 'string' ? before.text.length : 0) + [...text].length;

/** focus-timer.mjs `oneRun`, copied (no paste scenario here). */
async function oneRun(ctx, engine, name, windows) {
  const { desktop, oracle } = ctx;
  const { requests, expected } = ft.scenario(name, { a: windows.a.id, b: windows.b?.id });
  const keys = Object.keys(expected);
  let tail = false;
  for (const k of keys) tail = (await ft.cleanStart(ctx, windows[k], () => ft.textAndCaret(desktop, oracle, windows[k]))).tail || tail;
  const before = {};
  for (const k of keys) before[k] = await ft.settledRead(() => ft.textAndCaret(desktop, oracle, windows[k]));
  const started = performance.now();
  const { responses, ms } = await engine.pipeline(requests);
  const answered = performance.now() - started;
  const after = {};
  for (const k of keys) after[k] = await ft.settledRead(() => ft.textAndCaret(desktop, oracle, windows[k]), { want: grown(before[k], expected[k]) });
  const texts = Object.fromEntries(keys.map((k) => [k, ft.insertedAt(before[k].text, before[k].caret, expected[k], after[k].text)]));
  const errors = responses.filter((r) => r.ok !== true).map((r) => String(r.error).slice(0, 300));
  const got = Object.fromEntries(keys.map((k) => [k, typeof after[k].text === 'string' && typeof before[k].text === 'string' ? after[k].text.slice(before[k].caret ?? 0, (before[k].caret ?? 0) + after[k].text.length - before[k].text.length) : null]));
  return { ok: ft.runPasses({ family: windows.a.family, errors, exact: texts }), tail_at_start: tail, answered_ok: errors.length === 0, errors, expected, got, exact: texts, caret_read: keys.every((k) => before[k].caret !== null), burst_ms: Math.round(ms * 10) / 10, answered_ms: Math.round(answered * 10) / 10 };
}

/** focus-timer.mjs `series`, copied with this sitting's lanes. */
async function series(ctx, family, lane, name, windows) {
  const { cua, need } = ctx;
  const oks = [];
  const rows = [];
  for (let run = 0; run < (timed(lane) ? need * (ft.MAX_RUNS / ft.CONSECUTIVE) : ft.CONTROL_RUNS); run++) {
    const engine = new Engine({ label: `cua-${lane}`, bin: cua, args: LANES[lane], stats: true }).start();
    const stderrClosed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
    let row;
    try {
      row = await oneRun(ctx, engine, name, windows);
    } finally {
      await engine.close();
    }
    await stderrClosed;
    row.miss = ft.missCause(row);
    oks.push(row.ok);
    rows.push(row);
    emit(ft.trialRow('focus-timer-run', { family, lane, scenario: name }, run, row));
    if (timed(lane) && ft.seriesVerdict(oks, need).reached) break;
  }
  const verdict = ft.seriesVerdict(oks, timed(lane) ? need : Infinity);
  const raw = ft.seriesVerdict(ft.rawOks(rows), timed(lane) ? need : Infinity);
  const wrongText = rows.filter((r) => !Object.values(r.exact).every(Boolean)).length;
  const missCauses = {};
  for (const r of rows) if (r.miss) missCauses[r.miss] = (missCauses[r.miss] ?? 0) + 1;
  const out = { family, lane, scenario: name, need, ...verdict, raw: { misses: raw.misses, streak: raw.streak, reached: raw.reached }, wrong_text: wrongText, tails_at_start: rows.filter((r) => r.tail_at_start).length, miss_causes: missCauses, burst_ms_median: ft.tenth(median(rows.map((r) => r.burst_ms))), first_miss: rows.find((r) => !r.ok) ?? null };
  emit({ kind: 'focus-timer-series', ...out });
  return out;
}

/** The engine's `--stats` FocusOut records (focus-timer.mjs `collectFocusOuts`, copied). */
function collectFocusOuts(engine) {
  const records = [];
  const closed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
  createInterface({ input: engine.child.stderr }).on('line', (line) => {
    let read;
    try {
      read = ft.readStatsLine(line);
    } catch {
      records.push({ unparsable: line.slice(0, 200) });
      return;
    }
    if (read) records.push(...read.focusOuts);
  });
  return { records, closed };
}

/** focus-timer.mjs `auditPass`, copied with this sitting's lanes: the plain control's sessions are one per request. */
async function auditPass(ctx, family, lane, windows) {
  const { cua } = ctx;
  const proxy = await startProxy();
  const engine = new Engine({ label: `cua-${lane}-audit`, bin: cua, args: LANES[lane], stats: true, env: proxy.env }).start();
  const { records, closed } = collectFocusOuts(engine);
  const runs = [];
  let text;
  try {
    for (const name of ctx.scenarios) {
      const row = await oneRun(ctx, engine, name, windows);
      runs.push({ scenario: name, ok: row.ok, errors: row.errors, got: row.got, tail_at_start: row.tail_at_start });
    }
  } finally {
    await engine.close();
    await closed;
    await proxy.mark('end');
    text = await proxy.stop();
  }
  const trace = parseXtrace(text);
  const forbidden = auditRequests(trace);
  const attributed = attributeFocusOuts(trace, records, { delayMs: timed(lane) ? ft.DELAY_MS : 0 });
  const ids = { a: windows.a.id, b: windows.b.id };
  const want = ctx.scenarios.flatMap((name) => ft.expectedSessions(name, timed(lane) ? 'timer' : 'control', ids));
  const seen = attributed.sessions.map((s) => s.destination);
  const sessionsOk = JSON.stringify(seen) === JSON.stringify(want);
  const clean = forbidden.clean && attributed.clean && sessionsOk && (!timed(lane) || runs.every((r) => r.ok));
  const row = { kind: 'focus-timer-audit', family, lane, clean, runs, requests: forbidden.requests, forbidden: forbidden.forbidden.slice(0, 10), problems: attributed.problems.slice(0, 10), sessions: { expected: want, seen }, attributed: attributed.attributed, deferred: attributed.attributed.filter((a) => a.deferred).length };
  emit(row);
  return row;
}

/** focus-timer.mjs `openWindows`, copied (Chromium's keys page only). */
async function openWindows(ctx, family) {
  const { desktop, oracle } = ctx;
  const open = async (role) => {
    const scene = await openFamily(desktop, oracle, family, role, { page: ft.KEYS_PAGE });
    if (!scene.field) scene.field = preorder((await desktop.state(scene)).ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
    if (!scene.field) throw new Error(`${family}'s window has no text field the harness can read`);
    return scene;
  };
  const a = await open('focus-a');
  const b = await open('focus-b');
  desktop.arrangeFront('covered');
  await sleep(500);
  return { a, b };
}

/** The sitting's verdict: the timer series reached 30 consecutive; and whether the plain control cut. */
function verdict({ series: all, audits, skipped }) {
  const failed = [];
  const md = ['| family | lane | scenario | runs | misses (independent) | wrong text | tails met at the start | streak at the end | verdict | raw misses | raw streak | median burst ms |', '|---|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|'];
  for (const s of all) {
    let v;
    if (timed(s.lane)) {
      v = s.reached ? `${s.need} consecutive` : '**not reached**';
      if (!s.reached) failed.push(`${s.family} ${s.scenario}: no ${s.need} consecutive passing runs in ${s.runs}`);
      if (s.need < ft.CONSECUTIVE) failed.push(`${s.family} ${s.scenario}: a development series of ${s.need}`);
    } else v = s.misses > 0 ? `cuts (${s.misses}/${s.runs}; the text wrong in ${s.wrong_text})` : '**cuts nothing**';
    md.push(`| ${s.family} | ${s.lane} | ${s.scenario} | ${s.runs} | ${s.misses} | ${s.wrong_text} | ${s.tails_at_start} | ${s.streak} | ${v} | ${s.raw.misses} | ${s.raw.streak} | ${s.burst_ms_median ?? '–'} |`);
  }
  md.push('', '| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |', '|---|---|---|---:|---|---|');
  for (const a of audits) {
    md.push(`| ${a.family} | ${a.lane} | ${a.clean ? 'clean' : '**not clean**'} | ${a.attributed.length} (${a.deferred}) | ${JSON.stringify(a.sessions.seen) === JSON.stringify(a.sessions.expected) ? 'yes' : '**no**'} | ${[...a.problems, ...a.forbidden.map((f) => f.what)].join('; ') || '–'} |`);
    if (!a.clean) failed.push(`${a.family} ${a.lane}: the audit is not clean`);
  }
  for (const s of skipped) failed.push(`${s.family} could not be opened: ${s.why}`);
  const controls = all.filter((s) => !timed(s.lane));
  const cut = controls.filter((s) => s.wrong_text > 0);
  const answer = !controls.length ? 'not measured' : cut.length ? `the plain 0 ms control cut: ${cut.map((s) => `${s.family} ${s.scenario} ${s.wrong_text}/${s.runs}`).join(', ')}` : 'the plain 0 ms control cut nothing';
  md.push('', `**The question:** ${answer}.`);
  return { md, failed, controlCut: cut.length > 0 };
}

let server = null;
if (opts.display === 'private') {
  // the driver's smoke: a display of its own, as focus-timer.mjs runs
  delete process.env[LIVE_RUN];
  assertReachable('task 58 focus driver', [], { DISPLAY: ':cua171-task58' });
  process.env.DISPLAY = ':cua171-task58';
  server = await startPrivateServer({ out: opts.out });
  assertReachable('task 58 focus driver', [], { DISPLAY: server.display });
  process.env.DISPLAY = server.display;
} else {
  declareLiveRun('task 58: the focus-timer sitting on the person display');
}
const need = opts.trials ? Number(opts.trials) : ft.CONSECUTIVE;
emit({ kind: 'meta', experiment: 'focus-timer (task 58 driver)', display_mode: opts.display, display: process.env.DISPLAY, cua_version: xExecFileSync(opts.cua, ['--version'], { encoding: 'utf8' }).trim(), lanes: LANES, families: FAMILIES, scenarios: SCENARIOS, need, load: false, started: new Date().toISOString() });
const desktop = new Desktop({ cua: opts.cua, run: opts.run, logs: opts.out });
const out = { series: [], audits: [], skipped: [] };
let wm = null;
let watched = null;
try {
  await desktop.begin({ startRecord: async () => null });
  if (server) {
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
  }
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const ctx = { desktop, oracle, cua: opts.cua, need, scenarios: SCENARIOS };
  for (const family of FAMILIES) {
    let windows;
    try {
      windows = await openWindows(ctx, family);
    } catch (error) {
      out.skipped.push({ family, why: String(error.message).slice(0, 300) });
      emit({ kind: 'focus-timer-skipped', family, why: String(error.message).slice(0, 300) });
      continue;
    }
    try {
      // the experiment's order: the timer lane first, the control (whose cuts reach the window only with a later
      // FocusIn) after it
      for (const name of SCENARIOS) out.series.push(await series(ctx, family, 'timer', name, windows));
      out.audits.push(await auditPass(ctx, family, 'timer', windows));
      for (const name of SCENARIOS) out.series.push(await series(ctx, family, 'control-0ms', name, windows));
      out.audits.push(await auditPass(ctx, family, 'control-0ms', windows));
    } finally {
      await desktop.close([windows.a, windows.b]);
    }
  }
} finally {
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  if (server) watched = await server.stop();
}
const ending = desktopEnding(desktop.ending);
const { md, failed, controlCut } = verdict(out);
for (const f of ending.foreign) failed.push(`a window the run did not open was changed, or the run went unwatched: ${f}`);
if (watched && !watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
emit({ kind: 'experiment-summary', markdown: md, complete: failed.length === 0, failed, control_cut: controlCut, desktop: ending.record, finished: new Date().toISOString() });
process.stdout.write(`${md.join('\n')}\n`);
process.exit(failed.length ? 1 : 0);
