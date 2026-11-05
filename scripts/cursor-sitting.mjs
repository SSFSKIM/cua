#!/usr/bin/env node
// The agent cursor's attended sitting on the MacBook (#235; docs/doperpowers/specs/2026-10-30-macos-agent-cursor-
// design.md, M3 and Acceptance 1–13). The runbook, docs/evidence/2026-10-30-macos-agent-cursor/README.md, says when each
// command runs, what the owner watches or does meanwhile, and what is kept.
//
//   cursor-sitting.mjs prepare
//       Compiles the target guard's window probe (scripts/accept/front-window.swift) into the harness cache, once, so the
//       sitting's first cell does not wait for it (./cursor-sitting/target-guard.mjs), and item 1's window-list probe
//       (./cursor-sitting/window-list.swift; `drive 1 --no-clip` also compiles it before it positions the cursor), and
//       #200's order watcher, window mover and element-frame reader.
//   cursor-sitting.mjs save --home <dir> --to <new dir>
//       Before the sitting: `cua engine status --json`, a copy of <home>'s whole engine directory (its socket, lock,
//       build scratch and staging left out) and of ~/.config/cua/engine.json, checked against a manifest of the tree
//       (./cursor-sitting/engine-copy.mjs). --home is always given: this script never defaults to this account's.
//   cursor-sitting.mjs restore --home <dir> --from <saved dir> --aside <new dir>
//       After the sitting: `cua engine stop`, the current engine directory and engine.json moved to --aside, the saved
//       ones put back and checked, `cua engine status` read for the saved build, approved. Exit 1 says what follows.
//   cursor-sitting.mjs drive <1|1-check|2|3|4|5|6|7|9|10|11> --run <scenes run dir> --out <evidence dir> [--engine vendor|cua]
//                     [--other-session <Claude Code session id>] [--clip <new .mov outside the repository>] [--quiet]
//                     [--dry-run]
//       One item's scripted steps (./cursor-sitting/plans.mjs) on the harness scenes the run directory holds
//       (scripts/repl-parity/scenes-mac.mjs up <scene> --run <dir>), recorded in <out>/item-<n>.jsonl. Owner cues are
//       spoken (`say`; --quiet prints them only); an instruction the owner confirms waits for <out>/go, which the
//       operator creates (`touch`) once the owner says done. --engine is item 11's (the side-by-side: vendor, then cua);
//       --other-session gives item 2's second session another Claude Code session's sminos name; --clip is item 1's
//       screen recording of the TextEdit and Chrome for Testing windows (./cursor-sitting/recording.mjs), and
//       1-check's: a few seconds of the same rectangle, nothing driven, which proves the recorder before item 1.
//   cursor-sitting.mjs timing typing|clicks --run <dir> --out <dir> [--series <id>,…] [--samples <n>]
//                     [--arm <arm> | --owner-source | --source <input source id> | --still | --control] [--quiet] [--dry-run]
//       Acceptance 12 (typing) or 13 (clicks): interleaved cursor-on and cursor-off samples (./cursor-sitting/timing.mjs),
//       recorded in <out>/item-12.jsonl or item-13.jsonl, then judged as `judge` does. Each series has its own count a
//       side: a judged run starts coordinate click and drag at 40, element click, type_text and press_key at 20; an arm
//       or the owner's source, 20 each. --series picks series (coordinate-click, element-click, drag; type-text,
//       press-key) and --samples sets them all: the rerun of an undetermined series is `--series <id> --samples 40`.
//       With the owner's yes recorded (`source consent`), the source is selected first (ABC; the owner's own for
//       --owner-source; the named one for --source, a typing series recorded as item-12-source-<name>.jsonl, never
//       judged, the owner's source selected again after it) and read back, or the run stops. --still records press_key
//       alone with the cursor visible but still after its glide (item-12-still.jsonl, never judged; ABC, the owner's
//       source after it): is the press_key cost confined to the cursor moving? --control runs the default arm's series
//       again under its own item (item-12-control.jsonl, item-13-control.jsonl), never judged: a same-session control
//       beside an arm or --still that never replaces the judged item's last attempt. Before every series, a window of
//       TextEdit's own over its run window is dismissed by a click through a cursor-off session, and its absence
//       required. Refused, before any session opens, unless the input source is a
//       Latin keyboard layout with TextEdit in front. --arm runs the series with
//       engine.json's `cursorDebug` set to one of the engine's cursor arms (panelOut, noBackdrop, noRock,
//       legacyLayers, uncapped), engine.json put back and the engine stopped after; --owner-source runs it under whatever source
//       the owner has, the reading kept. Either is recorded in item-<n>-<arm>.jsonl or item-<n>-owner-source.jsonl and
//       never judged: `judge` lists it in <out>/timing-recorded.md. The engine's timing signposts over the series are
//       read into <out>/signposts-<item>.ndjson in chunks while it runs (`log show` every 20 s; ./cursor-sitting/
//       signposts.mjs) and checked against every sample (<out>/coverage-<item>.json: a series they do not cover reads
//       incomplete). The uncapped arm (the cursor's animations at their own rates, as before the default's 60 Hz cap)
//       first proves the default's cap with the cursor probe's glides, with the arm and without it, their frames counted
//       from a FrameUpdate stream that runs only then, before any session opens (./cursor-sitting/frames.mjs); its
//       verdict is kept in the item's rows.
//   cursor-sitting.mjs source consent yes|no --out <dir>
//   cursor-sitting.mjs source restore --out <dir>
//       The input source (./cursor-sitting/input-source.mjs): `consent` records the owner's answer to the kit switching
//       their source, with the source they are on now (kept as theirs), in <out>/input-source.json; `restore` selects
//       that source again at the end and reads it back. Exit 1 when the read-back is not the one selected.
//   cursor-sitting.mjs judge --out <dir>
//       The timing items' verdicts by #171's noise rule (./cursor-sitting/stats.mjs), written to <out>/timing.md; the
//       recorded, unjudged series the same way to <out>/timing-recorded.md.
//   cursor-sitting.mjs verdict <item> <watch id> pass|fail [note…] --out <dir>
//       The owner's verdict on what an item asked them to watch, appended to <out>/verdicts.jsonl.
//   cursor-sitting.mjs summary --out <dir>
//       Every item's cells, tasks, watches and verdicts, and the timing verdicts, in <out>/summary.md.
//   cursor-sitting.mjs drive 1 --no-clip …, then cursor-sitting.mjs order-meta --out <evidence dir>
//       Item 1 without a clip (the ruling at the second sitting): no owner, no placement; the order from the engine's
//       numbers (./cursor-sitting/glide.mjs): each click's engineMs plus one frame against the earliest arrival the
//       engine could plan for the second click's glide, from a known start (a scroll at TextEdit's point farthest from
//       Chrome's window). Writes <out>/item-1-order-meta.json and .md and appends both order verdicts (the first target,
//       which fades in with no glide, undetermined). Exit 1 unless the second target passes.
//   cursor-sitting.mjs clip frames --out <evidence dir> --frames <new dir outside the repository>
//   cursor-sitting.mjs clip order --frames <dir> --out <evidence dir> first-target <change> <arrival>
//                     second-target <change> <arrival>
//       Item 1's order from its recording (./cursor-sitting/clip.mjs), after the sitting (ffmpeg and ffprobe): `frames`
//       writes every frame around each click, cropped to the target scene's window and named by its index in the clip,
//       with frames.json; `order` takes the judged frames by index (the first where the control changes, the first where
//       the arrow's tip reaches it; the first target's arrival is the cursor's first frame) and writes
//       <out>/item-1-order.json and .md, copies those frames and the one before each into <out>/item-1-frames/, and
//       appends the verdicts order-first-target and order-second-target. Exit 1 when either control changed after.
//   cursor-sitting.mjs clip routes --out <evidence dir>
//   cursor-sitting.mjs clip lag --frames <dir> --out <evidence dir> <target> <change> <start> […]
//       Item 13's route-3-lag from item 1's clip: `routes`, right after item 1, says which of its clicks went by route 3
//       (their lag comes from the clip) or that none did (the fallback: the owner watches item 13's first minute);
//       `lag` takes, for each route-3 click, the control's first changed frame and the cursor's first moving frame (its
//       first visible frame for the first target), bounds the lag by those frames' times, writes
//       <out>/item-1-route3-lag.json and .md, copies the frames, and appends item 13's route-3-lag verdict when the
//       bound decides it against 100 ms. Exit 1 unless it passes.
//   cursor-sitting.mjs raise drive --engine cua|vendor --run <dir> --out <dir> [--case a,b,c,d,e,f] [--samples <n>] [--quiet]
//                     [--dry-run]
//   cursor-sitting.mjs raise judge --out <dir>
//       #200's live check (./cursor-sitting/raise.mjs): the harness windows placed (TextEdit at the left, Chrome for
//       Testing over its right half and activated; Finder's and the fixture's windows where TextEdit's is, when their
//       cases run), then each case on its own session of the engine, recorded in <out>/item-200-<case>-<engine>.jsonl,
//       the 5 ms window-order watcher's changes in item-200-<case>-<engine>-order.jsonl. A case whose scene breaks (the
//       driven window left above Chrome's, a window gone) stops it and the cases after it. `drive` then judges the
//       engine's cases; `judge` writes every case on both engines to <out>/item-200.md and prints it. --samples sets
//       every case's count (a's is twice it, half under Chrome). Exit 1 unless every cua case run passes.
//   cursor-sitting.mjs first-observation drive --engine cua|vendor --run <dir> --out <dir> [--variant plain,sonoma] [--quiet]
//                     [--dry-run]
//   cursor-sitting.mjs first-observation judge --out <dir>
//       #244's live check (./cursor-sitting/first-observation.mjs): per variant (plain; sonoma, the fixture launched with
//       SonomaAccessibilityActivationRefinements on), the Electron fixture relaunched fresh, a session that binds nothing,
//       its first cell the session's first engine observation of the fixture (its text inspected), warm observations,
//       a hold for complete mode, the close and the release, from the fixture's accessibility record; recorded in
//       <out>/item-244-<variant>-<engine>.jsonl. `drive` then judges the engine's variants; `judge` writes every variant
//       on both engines to <out>/item-244.md and prints it. Exit 1 unless cua's plain variant passes (judge), or unless
//       nothing stopped and every judged variant run passes (drive).
//   cursor-sitting.mjs paste-187 drive --run <dir> --out <dir> [--part reslot|premise|before|cell|composing|controls|259|188|188-vendor-click | --vendor]
//                                    [--saved <dir>] [--quiet] [--dry-run]
//   cursor-sitting.mjs paste-187 judge --out <dir> [--addendum]
//       #187's re-slot (./cursor-sitting/item-187.mjs; the runbook's "Item 187"): pastes into Chrome for Testing's
//       counters page behind a Hangul composition in TextEdit's run window, on the shipping build. `drive` (the default
//       part, reslot) checks the preconditions (the owner's yes to the source switch recorded, every scene up, Chrome on
//       the counters page), places the harness windows, runs the confirming cell's AFTER half (three background-paste
//       repetitions: Chrome relaunched by the scenes tool and placed, one background paste with TextEdit in front,
//       Chrome activated by `open -a`, the key read, one frontmost paste; then the AXPress repetition, when the premise
//       part opened it), places the windows again, runs chrome/composing@textedit as 2 blocks of 9, the three controls
//       once each and #259's diagnostic cell (recorded only), each item recorded in <out>/item-<name>.jsonl, and selects
//       the owner's source again; a person-touched repetition is replaced once, and more than three person-touched items
//       in the out directory stop the drive. `--part premise` (the preflight) times AXPress on freshly relaunched
//       Chromes; `--part before --saved <the save's directory>` runs the cell's BEFORE half once the owner's engine is put
//       back (the put-back read against the save); `--part cell`, `composing`, `controls` rerun that part alone, `259`
//       the #259 cell alone; `--part 188` runs #188's items alone, `188-vendor-click` only its cell 3 on the vendor's
//       engine; `--vendor` the vendor's lanes (recorded only). `judge` writes <out>/item-187.md; with `--addendum` it
//       writes the re-judgment by the amended predicates to <out>/item-187-rejudge.md and never touches item-187.md.
//       Exit 1 unless the bar holds (the item's header).
//   cursor-sitting.mjs control-build --home <dir> --scratch <new dir> [--sign-wait <ms>] [--dry-run]
//       #187's control build (./cursor-sitting/control-build.mjs): native/engine copied whole into <scratch>/engine, the
//       copy's Package.swift given CUA_CONTROL_NO_INERT_CLICK on its Engine target alone, checked (only that line
//       differs; its build id is not the shipping one), recorded in <scratch>/control.json, then built into <home>'s
//       engine directory, pending approval, by the CLI's own `engine build` with the copy as its source. --dry-run makes
//       and checks the copy and prints both build ids; nothing is built.
//   cursor-sitting.mjs isolate-187 drive --run <dir> --out <dir> --home <dir> --halves <dir> [--blocks <list>] [--no-tail]
//                                      [--quiet] [--dry-run]
//   cursor-sitting.mjs isolate-187 judge --out <dir>
//   cursor-sitting.mjs isolate-187 replay [--from <records dir>] [--to <file>]
//       Section D (./cursor-sitting/isolate-replay.mjs): the judge's pure pieces over the second re-slot's records
//       (item-187-reslot2/, or --from) as recorded and under named mutations, and C2's and C3's over synthetic fixtures;
//       writes item-187-isolate-replay.md (or --to), a table per predicate. Exit 1 when any outcome is not its expected one.
//       #187's isolating slot (./cursor-sitting/item-187-isolate.mjs; the runbook's "Item 187: the isolating slot"):
//       the placement, six blocks A B B A A B (each a swap to its half's save under --halves, engine-after/ or
//       engine-control/, approved with no terminal and attested from the running engine's ping; 2 background-paste
//       repetitions; 3 chrome/composing@textedit rows), the AFTER-only block (a swap to AFTER, #188's `--part 188`, C2's
//       and C3's repetitions, ./cursor-sitting/item-187-join.mjs), the tail (C4 (b), (c)), and the owner's source. --blocks runs some blocks only (1-7, 3,
//       2,5; 7 is the AFTER-only block) and --no-tail leaves the tail out (the slot running long); the placement and the
//       end always run. The out directory is the slot's own, never
//       a re-slot's (one holding item-187.md is refused). `judge` writes <out>/item-187-isolate.md, the pre-registered
//       verdict: LANDS, DOES NOT LAND or INCONCLUSIVE; exit 1 unless LANDS. The dry run prints each block's steps.
//   cursor-sitting.mjs remote prepare|enroll|run --kit <dir> [--port n] [--run <dir> --out <dir>] [--quiet] [--dry-run]
//       Acceptance 8's loopback device (./cursor-sitting/remote.mjs): prepare the kit (and print what it still needs),
//       enrol it on a loopback relay, then run: the relay and the agent started, three client sessions driven
//       (recorded as item 8), both stopped.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ORDER_TARGETS, route3Plan, writeFrames, writeLag, writeOrder} from './cursor-sitting/clip.mjs';
import {keepSeriesSignposts, signpostCoverage} from './cursor-sitting/signposts.mjs';
import {liveSourceSwitch, switchSource, writeConsent} from './cursor-sitting/input-source.mjs';
import {windowListProbe, writeOrderFromMeta} from './cursor-sitting/glide.mjs';
import {buildControl, prepareControlSource} from './cursor-sitting/control-build.mjs';
import {engineDirOf, restoreEngine, saveEngine} from './cursor-sitting/engine-copy.mjs';
import {GOES_ON_ISO, isolateMarkdown, isolatePlan, isolateTasks, judgeIsolate, parseBlocks, SAVED as SAVED_ISO, stepCounts, VERDICT_FILE} from './cursor-sitting/item-187-isolate.mjs';
import {PLANS} from './cursor-sitting/plans.mjs';
import {CASES, elementFrameTool, ENGINES, itemOf, judgeCase, moveWindowTool, orderFileOf, orderLines, orderWatchProbe, placeSteps, raiseMarkdown,
  raiseSteps} from './cursor-sitting/raise.mjs';
import {ENGINES as FIRST_ENGINES, firstMarkdown, firstSteps, itemOf as firstItemOf, judgeFirst, VARIANTS} from './cursor-sitting/first-observation.mjs';
import {ADDENDUM_FILE, axStateTool, driveItems, GOES_ON, item187Addendum, item187Markdown, judge187, judgedOk, menuTool, PARTS as PARTS_187, plan187, slotTouches} from './cursor-sitting/item-187.mjs';
import {agentConnected, enrollKit, kitPaths, prepareKit, remoteSteps, startLoopback, DEFAULT_PORT} from './cursor-sitting/remote.mjs';
import {liveIo, runSteps} from './cursor-sitting/runner.mjs';
import {clipPathProblem, REPO_ROOT} from './cursor-sitting/recording.mjs';
import {judgeTiming} from './cursor-sitting/stats.mjs';
import {liveTargetGuard} from './cursor-sitting/target-guard.mjs';
import {CURSOR_ARMS, sampleCounts, SERIES, seriesRuns, timingItem, timingSteps} from './cursor-sitting/timing.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const OPTIONS = {home: {type: 'string'}, to: {type: 'string'}, from: {type: 'string'}, aside: {type: 'string'}, run: {type: 'string'}, out: {type: 'string'},
  engine: {type: 'string'}, 'other-session': {type: 'string'}, samples: {type: 'string'}, kit: {type: 'string'}, port: {type: 'string'},
  arm: {type: 'string'}, 'owner-source': {type: 'boolean', default: false}, clip: {type: 'string'}, frames: {type: 'string'}, series: {type: 'string'}, source: {type: 'string'}, 'no-clip': {type: 'boolean', default: false}, still: {type: 'boolean', default: false}, control: {type: 'boolean', default: false},
  case: {type: 'string'}, variant: {type: 'string'}, part: {type: 'string'}, vendor: {type: 'boolean', default: false}, saved: {type: 'string'}, quiet: {type: 'boolean', default: false}, 'dry-run': {type: 'boolean', default: false}, addendum: {type: 'boolean', default: false},
  scratch: {type: 'string'}, 'sign-wait': {type: 'string'}, halves: {type: 'string'}, blocks: {type: 'string'}, 'no-tail': {type: 'boolean', default: false}};
const TIMING_ITEM = {typing: 12, clicks: 13};

const absolute = (values, name) => {
  const value = values[name];
  if (!value || !isAbsolute(value)) throw new Error(`--${name} <absolute path> is required`);
  return resolve(value);
};
const print = value => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);

// `cua <args> --json` with HOME set to `home`. -> its JSON, or {ok: false, detail} when it failed.
function cuaJson(home, args) {
  try { return JSON.parse(execFileSync(process.execPath, [CLI, ...args, '--json'], {encoding: 'utf8', env: {...process.env, HOME: home}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000})); } catch (error) {
    return {ok: false, detail: String(error.stderr || error.stdout || error.message).trim().split('\n').at(-1)};
  }
}

// The engine's stop and status for engine-copy's restore, as `restore` runs them.
const engineDeps = home => ({stop: async () => { const r = cuaJson(home, ['engine', 'stop']); return r.ok === false ? r : {ok: true, ...r}; },
  status: async () => cuaJson(home, ['engine', 'status'])});
// `cua engine approve --json` with no terminal (stdin closed), so a missing grant or a capture confirmation fails it at
// once instead of waiting for someone. -> its JSON (also when it exits 1), or {ok: false, detail}.
function approveHeadless(home) {
  try { return JSON.parse(execFileSync(process.execPath, [CLI, 'engine', 'approve', '--json'], {encoding: 'utf8', env: {...process.env, HOME: home}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000})); } catch (error) {
    try { return JSON.parse(String(error.stdout ?? '').trim().split('\n').at(-1)); } catch { return {ok: false, detail: String(error.stderr || error.message).trim().split('\n').at(-1)}; }
  }
}
// This checkout's commit, for a report's header. -> 12 hex digits, or null.
function kitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {cwd: dirname(SCRIPT), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null; } catch { return null; }
}

const readJsonl = file => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []);
// An item's last attempt: its rows from the last `start` on.
const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));

// The timing items' judgements from their recorded rows: the judged items (12, 13), or with `recorded` every arm and
// owner-source series beside them (item-12-<name>.jsonl), by the same rule but never a verdict on the item. Each series
// comes from the last run that covers it (./cursor-sitting/timing.mjs seriesRuns): a rerun of one series replaces that
// series' verdict only. -> [{item, kind, pass, series, runs, routes?, source}].
function judgeAll(out, {recorded = false} = {}) {
  const items = Object.entries(TIMING_ITEM).flatMap(([kind, item]) => (recorded
    ? readdirSync(out).map(f => f.match(new RegExp(`^item-(${item}-[\\w-]+)\\.jsonl$`))?.[1]).filter(Boolean).sort().map(name => [kind, name])
    : [[kind, String(item)]]));
  return items.flatMap(([kind, item]) => {
    const all = readJsonl(join(out, `item-${item}.jsonl`));
    if (!all.length) return [];
    const runs = seriesRuns(all, kind);
    const timed = SERIES[kind].flatMap(name => runs[name]?.rows ?? []);
    const judged = judgeTiming(timed, {series: SERIES[kind]});
    const routes = kind === 'clicks' ? Object.entries(timed.filter(r => r.series === 'element click').reduce((m, r) => ({...m, [r.route ?? 'none']: (m[r.route ?? 'none'] ?? 0) + 1}), {})) : null;
    const source = all.findLast(r => r.kind === 'task' && r.task === 'input-source')?.result ?? null;
    const attempt = all.findLast(r => r.kind === 'start')?.at ?? null;
    const coverage = coverageOf(join(out, `coverage-${item}.json`), attempt);
    const capCheck = all.findLast(r => r.kind === 'task' && r.task === 'glide-frames')?.result ?? null;
    return [{item, kind, ...judged, runs: Object.fromEntries(Object.entries(runs).map(([name, r]) => [name, r.startedAt])), ...(routes ? {routes: Object.fromEntries(routes)} : {}), source, capCheck, coverage}];
  });
}

// Whether the series' signposts cover it (./cursor-sitting/signposts.mjs signpostCoverage), with how their chunked reads
// went, in <out>/coverage-<item>.json, tied to the item's last attempt (its `start` row's time). -> the coverage.
export function keepCoverage(out, item, {reads = null} = {}) {
  const rows = lastAttempt(readJsonl(join(out, `item-${item}.jsonl`))), attempt = rows.find(r => r.kind === 'start')?.at ?? null;
  const signposts = join(out, `signposts-${item}.ndjson`);
  const coverage = signpostCoverage(existsSync(signposts) ? readFileSync(signposts, 'utf8') : '', rows);
  // A read that failed is said beside the samples; the samples decide: the next read covers a failed one's span.
  const record = {item, attempt, ...coverage, reads};
  writeFileSync(join(out, `coverage-${item}.json`), `${JSON.stringify(record, null, 2)}\n`);
  print(`the series' signposts: ${coverageLine(record)}`);
  return record;
}
function coverageOf(file, attempt) {
  if (!existsSync(file)) return null;
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  if ((kept.attempt ?? null) !== attempt) return {complete: false, why: `the coverage file is another attempt's (started ${kept.attempt ?? 'unknown'})`};
  return kept;
}
const coverageLine = c => (c.complete ? `complete, every one of ${c.samples} samples has engine signposts` : `**incomplete**: ${c.why}`);

const fmt = v => (v === null || v === undefined ? '–' : Number(v).toFixed(2));
function timingMarkdown(judged, {recorded = false} = {}) {
  const lines = recorded
    ? ['# Acceptance 12 and 13: the recorded series (arms, the owner\'s input source), not judged', '',
      'The same rule\'s numbers for each series, for the design session; no verdict on the acceptance item comes from them.', '']
    : ['# Acceptance 12 and 13: timing, cursor on against cursor off', '',
      'Judged by #171\'s noise rule (scripts/cursor-sitting/stats.mjs): the bootstrap 95 % interval of median(on) − median(off) must include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians.', ''];
  for (const j of judged) {
    const verdict = recorded ? `recorded (the rule would say ${j.pass ? 'pass' : 'fail'})` : j.pass ? 'PASS' : 'FAIL';
    const reading = j.source?.reading;
    lines.push(`## Acceptance ${j.item} (${j.kind}): ${verdict}`, '',
      `Input source: ${reading ? `${reading.name ?? reading.id} (${reading.id}; keys translated with ${reading.layout})` : 'not checked (a run before the kit checked it)'}.`, '',
      '| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |', '|---|---|---|---|---|---|---|');
    for (const s of j.series) lines.push(`| ${s.series} | ${s.n.on} / ${s.n.off} | ${fmt(s.medians.on)} | ${fmt(s.medians.off)} | ${s.interval ? `[${fmt(s.interval[0])}, ${fmt(s.interval[1])}]` : '–'} | ${fmt(s.bound)} | ${s.verdict} |`);
    const started = Object.entries(j.runs ?? {}).filter(([, at]) => Number.isFinite(at));
    if (new Set(started.map(([, at]) => at)).size > 1) lines.push('', `Each series is taken from the last run that covers it: ${started.map(([name, at]) => `${name} from the run started ${new Date(at).toISOString()}`).join('; ')}.`);
    if (j.errors) lines.push('', `${j.errors} timed call(s) failed and are not in the samples (item-${j.item}.jsonl has their errors).`);
    if (j.routes) lines.push('', `The element clicks' routes: ${Object.entries(j.routes).map(([r, n]) => `route ${r} × ${n}`).join(', ')}.`);
    if (j.coverage) lines.push('', `Signposts (coverage-${j.item}.json): ${coverageLine(j.coverage)}.`);
    if (j.capCheck) {
      const {base, capped} = j.capCheck, rock = base?.rock && capped?.rock ? `; rock ${base.rock.hz} against ${capped.rock.hz} Hz` : '';
      // A run before the cap became the default (2026-10-31) capped under the fps60 arm against the default.
      const [uncappedSide, cappedSide] = j.capCheck.arm === 'fps60' ? ['the default then', 'the fps60 arm'] : [`the ${j.capCheck.arm} arm`, 'the default'];
      lines.push('', `The 60 Hz cap, from the cursor probe's glides before the series: uncapped (${uncappedSide}) ${base?.hz ?? '–'} Hz (a frame every ${base?.intervalMs ?? '–'} ms), capped (${cappedSide}) ${capped?.hz ?? '–'} Hz (every ${capped?.intervalMs ?? '–'} ms)${rock}: **${j.capCheck.verdict}** (${j.capCheck.why}).`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function summaryMarkdown(out) {
  const verdicts = readJsonl(join(out, 'verdicts.jsonl'));
  // #200's watcher files (item-200-<case>-<engine>-order.jsonl) are its judge's, not items.
  const files = readdirSync(out).filter(f => /^item-[\w-]+\.jsonl$/.test(f) && !f.endsWith('-order.jsonl')).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
  const lines = ['# The agent cursor\'s sitting: what each item recorded', ''];
  for (const f of files) {
    const rows = lastAttempt(readJsonl(join(out, f))), item = f.slice(5, -6);
    const cells = rows.filter(r => r.kind === 'cell'), tasks = rows.filter(r => r.kind === 'task');
    lines.push(`## Item ${item}`, '', `${cells.length} cell(s), ${cells.filter(c => !c.ok).length} failed; ${tasks.length} task(s), ${tasks.filter(t => t.result?.ok === false).length} failed.`, '');
    for (const t of tasks.filter(x => x.result?.ok === false)) lines.push(`- task ${t.task} failed: ${JSON.stringify(t.result)}`);
    for (const c of cells.filter(x => !x.ok)) lines.push(`- ${c.session}: ${c.label} failed: ${c.error}`);
    for (const w of rows.filter(r => r.kind === 'watch')) {
      const said = verdicts.filter(v => String(v.item) === item.split('-')[0] && v.id === w.id).at(-1);
      lines.push(`- watch \`${w.id}\`: ${w.text} — ${said ? `**${said.verdict}**${said.note ? ` (${said.note})` : ''}` : '**no verdict recorded**'}`);
    }
    lines.push('');
  }
  const judged = judgeAll(out);
  if (judged.length) lines.push(timingMarkdown(judged));
  return lines.join('\n');
}

// #200's judgements from the evidence: every case recorded on each engine (or only `engine`), in case order. -> [judged].
export function judgeRaise(out, {engine = null} = {}) {
  return Object.keys(CASES).flatMap(kase => ENGINES.filter(e => !engine || e === engine).flatMap(e => {
    const rows = readJsonl(join(out, `item-${itemOf(kase, e)}.jsonl`));
    if (!rows.length) return [];
    const order = existsSync(join(out, orderFileOf(kase, e))) ? orderLines(readFileSync(join(out, orderFileOf(kase, e)), 'utf8')) : [];
    return [judgeCase({kase, engine: e, rows, order})];
  }));
}

// #200's drive: the placement, then each case in order, each its own item; a case that throws (its scene broke, a session
// failed) is marked in its jsonl and stops the cases after it.
async function driveRaise(values) {
  const engine = values.engine;
  if (!ENGINES.includes(engine)) throw new Error('raise drive takes --engine cua or --engine vendor');
  const cases = (values.case ?? Object.keys(CASES).join(',')).split(',');
  if (!cases.length || cases.some(c => !CASES[c])) throw new Error(`--case takes cases of ${Object.keys(CASES).join(', ')}, comma-separated`);
  const samples = values.samples === undefined ? null : Number(values.samples);
  if (samples !== null && (!Number.isInteger(samples) || samples < 1)) throw new Error('--samples takes a positive whole number');
  const out = absolute(values, 'out'), dryRun = values['dry-run'];
  const run = dryRun ? values.run ?? '/nonexistent' : absolute(values, 'run');
  const io = liveIo({run, out, quiet: values.quiet});
  const extras = [...new Set(cases.map(c => CASES[c].back).filter(b => b !== 'textedit'))];
  const items = [[`200-place-${engine}`, placeSteps({extras})],
    ...cases.map(c => [itemOf(c, engine), raiseSteps(c, {engine, samples: samples === null ? undefined : c === 'a' ? 2 * samples : samples})])];
  let steps = 0, stopped = null;
  for (const [item, plan] of items) {
    steps += plan.length;
    try { await runSteps(plan, {item, out, io, engine, dryRun}); } catch (error) {
      stopped = `${item}: ${error.message}`;
      appendFileSync(join(out, `item-${item}.jsonl`), `${JSON.stringify({item, at: Date.now(), kind: 'stopped', error: error.message})}\n`);
      print(`stopped at ${stopped}; the cases after it were not run`);
      break;
    }
  }
  if (dryRun) { print(`dry run: ${steps} steps, nothing sent`); return 0; }
  const judged = judgeRaise(out, {engine});
  print(raiseMarkdown(judged));
  return !stopped && judged.every(j => j.engine === 'vendor' || j.verdict === 'PASS') ? 0 : 1;
}

// #244's judgements from the evidence: every variant recorded on each engine (or only `engine`). -> [judged].
export function judgeFirstObservation(out, {engine = null} = {}) {
  return Object.keys(VARIANTS).flatMap(variant => FIRST_ENGINES.filter(e => !engine || e === engine).flatMap(e => {
    const rows = readJsonl(join(out, `item-${firstItemOf(variant, e)}.jsonl`));
    return rows.length ? [judgeFirst({variant, engine: e, rows})] : [];
  }));
}
const firstPassed = judged => judged.some(j => j.engine === 'cua' && j.variant === 'plain' && j.verdict === 'PASS');

// #244's drive: each variant in order, each its own item; a variant that throws is marked in its jsonl and stops those
// after it.
async function driveFirstObservation(values) {
  const engine = values.engine;
  if (!FIRST_ENGINES.includes(engine)) throw new Error('first-observation drive takes --engine cua or --engine vendor');
  const variants = (values.variant ?? Object.keys(VARIANTS).join(',')).split(',');
  if (variants.some(v => !VARIANTS[v])) throw new Error(`--variant takes variants of ${Object.keys(VARIANTS).join(', ')}, comma-separated`);
  const out = absolute(values, 'out'), dryRun = values['dry-run'];
  const run = dryRun ? values.run ?? '/nonexistent' : absolute(values, 'run');
  const io = liveIo({run, out, quiet: values.quiet});
  let steps = 0, stopped = null;
  for (const variant of variants) {
    const item = firstItemOf(variant, engine), plan = firstSteps(variant, {engine});
    steps += plan.length;
    try { await runSteps(plan, {item, out, io, engine, dryRun}); } catch (error) {
      stopped = `${item}: ${error.message}`;
      appendFileSync(join(out, `item-${item}.jsonl`), `${JSON.stringify({item, at: Date.now(), kind: 'stopped', error: error.message})}\n`);
      print(`stopped at ${stopped}; the variants after it were not run`);
      break;
    }
  }
  if (dryRun) { print(`dry run: ${steps} steps, nothing sent`); return 0; }
  const judged = judgeFirstObservation(out, {engine}).filter(j => variants.includes(j.variant));
  print(firstMarkdown(judged));
  return !stopped && judged.every(j => j.verdict === 'recorded' || j.verdict === 'PASS') ? 0 : 1;
}

// #187's evidence: every item's rows, from <out>/item-187-<name>.jsonl and #188's and #259's <out>/item-18[8]|259-<name>.jsonl
// (the watchers' files left out). -> {item: rows}.
export function read187(out) {
  if (!existsSync(out)) return {};
  return Object.fromEntries(readdirSync(out).map(f => f.match(/^item-((?:18[78]|259)-[\w-]+)\.jsonl$/)?.[1]).filter(name => name && !name.endsWith('-order'))
    .map(name => [name, readJsonl(join(out, `item-${name}.jsonl`))]));
}

// #187's drive: the plan's items in order, each its own item (./cursor-sitting/item-187.mjs driveItems): an item that
// throws is marked in its jsonl and stops the items after it but the last, which selects the owner's source again; a
// cell repetition, #259's cell, a #188 item or an item the person touched that throws is marked and the drive goes on.
// A person-touched cell repetition is replaced once; more than three person-touched items in the slot (this out
// directory: every attempt of every item counts, so the BEFORE half carries the re-slot's and a re-run part keeps its
// earlier attempts' touches) stop the drive.
async function drive187(values) {
  const part = values.part ?? 'reslot';
  if (!PARTS_187.includes(part)) throw new Error(`--part takes ${PARTS_187.join(', ')}`);
  if (values.vendor && values.part) throw new Error('--vendor runs the vendor lane alone; it takes no --part');
  const out = absolute(values, 'out'), dryRun = values['dry-run'];
  const run = dryRun ? values.run ?? '/nonexistent' : absolute(values, 'run');
  if (part === 'before' && !dryRun && !values.saved) throw new Error('--part before takes --saved <the directory `save` wrote before the build>, read for the put-back');
  const saved = values.saved ? absolute(values, 'saved') : '<saved>';
  const io = liveIo({run, out, quiet: values.quiet});
  const {stopped, steps} = await drivePlan(plan187({part, vendor: values.vendor, saved}), {out, io, dryRun});
  if (dryRun) { print(`dry run: ${steps} steps, nothing sent`); return 0; }
  const judged = judge187(read187(out));
  writeFileSync(join(out, 'item-187.md'), item187Markdown(judged));
  print(item187Markdown(judged));
  return !stopped && judgedOk(judged) ? 0 : 1;
}

// A #187 plan's items driven into `out` (./cursor-sitting/item-187.mjs driveItems), seeded with the slot's count so far:
// every person-touched item the out directory records, in every attempt of every item (a part run again included), so
// no re-run resets the stop rule. `goesOn`: the stages whose stop lets the drive go on. -> {stopped, steps}.
async function drivePlan(plan, {out, io, dryRun, goesOn = GOES_ON}) {
  const lines = file => (existsSync(file) ? readJsonl(file) : []);
  const evidenceOf = item => ({rows: lines(join(out, `item-${item}.jsonl`)), activations: lines(join(out, `item-${item}-activations.ndjson`))});
  const seed = dryRun ? 0 : Object.keys(read187(out)).filter(item => item.startsWith('187-'))
    .reduce((n, item) => n + (({rows, activations}) => slotTouches(rows, activations))(evidenceOf(item)), 0);
  let steps = 0;
  const {stopped} = await driveItems(plan, {seed, print, goesOn,
    runItem: async ({item, steps: itemSteps}) => { steps += itemSteps.length; try { await runSteps(itemSteps, {item, out, io, dryRun}); return null; } catch (error) { return error; } },
    evidenceOf: item => (dryRun ? {rows: [], activations: []} : evidenceOf(item)),
    mark: (item, error, touched) => appendFileSync(join(out, `item-${item}.jsonl`), `${JSON.stringify({item, at: Date.now(), kind: 'stopped', error: error.message, ...(touched.count ? {personTouched: touched.foreign ?? true} : {})})}\n`)});
  return {stopped, steps};
}

// #187's isolating slot: the swaps' tasks over this Mac's engine (engine-copy's restore and a headless approve, both on
// --home) beside the kit's, then the plan driven, and the verdict file written at the end. Refused on a re-slot's out
// directory, so no slot's report is written over.
async function driveIsolate(values) {
  const plan = isolatePlan({blocks: parseBlocks(values.blocks), tail: !values['no-tail']});
  const out = absolute(values, 'out'), dryRun = values['dry-run'];
  if (existsSync(join(out, 'item-187.md'))) throw new Error(`${out} holds a re-slot's report (item-187.md): the isolating slot writes to its own new directory`);
  if (dryRun) {
    const {steps} = await drivePlan(plan, {out, io: liveIo({run: values.run ?? '/nonexistent', out, quiet: values.quiet}), dryRun, goesOn: GOES_ON_ISO});
    for (const b of stepCounts(plan)) print(`dry run: ${b.label}: ${b.steps} steps`);
    print(`dry run: ${steps} steps, nothing sent`);
    return 0;
  }
  const run = absolute(values, 'run'), home = absolute(values, 'home'), halves = absolute(values, 'halves');
  for (const dir of Object.values(SAVED_ISO)) if (!existsSync(join(halves, dir, 'saved.json'))) throw new Error(`${join(halves, dir)} holds no save (saved.json): save both halves before the slot (the runbook)`);
  const io = liveIo({run, out, quiet: values.quiet});
  Object.assign(io.tasks, isolateTasks({halves, now: Date.now, savedRecord: dir => JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8')),
    restore: ({from, aside}) => restoreEngine({home, from, aside, ...engineDeps(home)}), approve: async () => approveHeadless(home)}));
  const {stopped} = await drivePlan(plan, {out, io, dryRun, goesOn: GOES_ON_ISO});
  const judged = judgeIsolate(read187(out)), text = isolateMarkdown(judged, {commit: kitCommit()});
  writeFileSync(join(out, VERDICT_FILE), text);
  print(text);
  return !stopped && judged.ok ? 0 : 1;
}

async function drive(steps, {item, values, gap = null}) {
  const out = absolute(values, 'out');
  const run = values['dry-run'] ? values.run ?? '/nonexistent' : absolute(values, 'run');
  const io = liveIo({run, out, quiet: values.quiet, gap});
  const {failed} = await runSteps(steps, {item, out, io, dryRun: values['dry-run']});
  print(values['dry-run'] ? `dry run: ${steps.length} steps, nothing sent` : `${failed} cell(s) or task(s) failed; recorded in ${join(out, `item-${item}.jsonl`)}`);
  return failed ? 1 : 0;
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const {values, positionals} = parseArgs({args: rest, options: OPTIONS, allowPositionals: true});
  if (command === 'prepare') {
    print(`the target guard's window probe: ${liveTargetGuard().compile()}`);
    print(`item 1's window-list probe: ${windowListProbe()}`);
    print(`#200's order watcher: ${orderWatchProbe()}`);
    print(`#200's window mover: ${moveWindowTool()}`);
    print(`#200's element-frame reader: ${elementFrameTool()}`);
    print(`#187's menu reader: ${menuTool()}`);
    print(`#187's key-window and #259's geometry reader: ${axStateTool()}`);
    return 0;
  }
  if (command === 'save') {
    const home = absolute(values, 'home');
    const saved = await saveEngine({home, to: absolute(values, 'to'), status: async () => cuaJson(home, ['engine', 'status'])});
    print({ok: true, ...saved});
    return 0;
  }
  if (command === 'restore') {
    const home = absolute(values, 'home');
    const restored = await restoreEngine({home, from: absolute(values, 'from'), aside: absolute(values, 'aside'), ...engineDeps(home)});
    print(restored);
    return restored.ok ? 0 : 1;
  }
  if (command === 'drive') {
    const item = positionals[0];
    if (!PLANS[item]) throw new Error(`drive takes an item of ${Object.keys(PLANS).join(', ')} (8 is \`remote run\`, 12 and 13 are \`timing\`)`);
    if (item === '11' && !['vendor', 'cua'].includes(values.engine)) throw new Error('drive 11 takes --engine vendor or --engine cua');
    const noClip = item === '1' && values['no-clip'];
    if (noClip && values.clip) throw new Error('drive 1 takes --clip or --no-clip');
    if ((item === '1-check' || (item === '1' && !noClip)) && !values['dry-run']) { const problem = clipPathProblem(values.clip, REPO_ROOT); if (problem) throw new Error(`drive ${item} records a clip (or, for item 1, --no-clip): ${problem}`); }
    const steps = PLANS[item]({otherSession: values['other-session'] ?? null, engine: values.engine, clip: values.clip ?? null, noClip});
    return drive(steps, {item: item === '11' ? `11-${values.engine}` : item, values});
  }
  if (command === 'timing') {
    const kind = positionals[0], samples = values.samples === undefined ? null : Number(values.samples);
    if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
    if (samples !== null && (!Number.isInteger(samples) || samples < 1)) throw new Error('--samples takes a positive whole number');
    const series = {arm: values.arm ?? null, ownerSource: values['owner-source'], source: values.source ?? null, still: values.still, control: values.control};
    if (series.source !== null && !/^[A-Za-z0-9._-]+$/.test(series.source)) throw new Error('--source takes an input source id (com.apple.inputmethod.Korean.2SetKorean)');
    if (series.arm !== null && !CURSOR_ARMS.includes(series.arm)) throw new Error(`--arm takes one of ${CURSOR_ARMS.join(', ')}`);
    if (series.still && values.series) throw new Error('--still records press_key only');
    const counts = sampleCounts(kind, {samples, only: series.still ? ['press-key'] : values.series ? values.series.split(',') : null,
      recorded: series.arm !== null || series.ownerSource || series.source !== null || series.still || series.control});
    const item = timingItem(kind, series);
    const started = new Date();
    if (values['dry-run']) return drive(timingSteps(kind, counts, series), {item, values});
    const out = absolute(values, 'out');
    // The engine's signposts read in chunks from before the first step to after the last (./cursor-sitting/signposts.mjs):
    // no stream runs under the timed samples.
    mkdirSync(out, {recursive: true, mode: 0o700});
    const {result: code, signposts} = await keepSeriesSignposts({engineFile: join(out, `signposts-${item}.ndjson`), since: new Date(+started - 1000),
      run: ({gap}) => drive(timingSteps(kind, counts, series), {item, values, gap})});
    keepCoverage(out, item, {reads: signposts});
    if (item !== String(TIMING_ITEM[kind])) {
      const recorded = judgeAll(out, {recorded: true});
      writeFileSync(join(out, 'timing-recorded.md'), timingMarkdown(recorded, {recorded: true}));
      print(timingMarkdown(recorded.filter(j => j.item === item), {recorded: true}));
      return code;
    }
    const judged = judgeAll(out);
    writeFileSync(join(out, 'timing.md'), timingMarkdown(judged));
    print(timingMarkdown(judged.filter(j => j.kind === kind)));
    return judged.find(j => j.kind === kind)?.pass ? code : 1;
  }
  if (command === 'judge') {
    const out = absolute(values, 'out'), judged = judgeAll(out), recorded = judgeAll(out, {recorded: true});
    writeFileSync(join(out, 'timing.md'), timingMarkdown(judged));
    if (recorded.length) writeFileSync(join(out, 'timing-recorded.md'), timingMarkdown(recorded, {recorded: true}));
    print(timingMarkdown(judged));
    return judged.length && judged.every(j => j.pass) ? 0 : 1;
  }
  if (command === 'verdict') {
    const [item, id, verdict, ...note] = positionals;
    if (!item || !id || !['pass', 'fail'].includes(verdict)) throw new Error('verdict takes <item> <watch id> pass|fail [note…]');
    appendFileSync(join(absolute(values, 'out'), 'verdicts.jsonl'), JSON.stringify({item, id, verdict, note: note.join(' ') || null, at: new Date().toISOString()}) + '\n');
    return 0;
  }
  if (command === 'summary') {
    const out = absolute(values, 'out');
    writeFileSync(join(out, 'summary.md'), summaryMarkdown(out));
    print(`wrote ${join(out, 'summary.md')}`);
    return 0;
  }
  if (command === 'source') {
    const out = absolute(values, 'out'), sub = positionals[0], sources = liveSourceSwitch();
    if (sub === 'consent') {
      const answer = positionals[1];
      if (!['yes', 'no'].includes(answer)) throw new Error('source consent takes yes or no (the owner\'s answer)');
      print(writeConsent(out, {consent: answer === 'yes', reading: sources.current()}));
      return 0;
    }
    if (sub === 'restore') {
      const result = switchSource({out, which: 'owner', sources});
      print(result);
      return result.ok ? 0 : 1;
    }
    throw new Error('source takes consent or restore');
  }
  if (command === 'order-meta') {
    const out = absolute(values, 'out');
    const judged = writeOrderFromMeta({rows: readJsonl(join(out, 'item-1.jsonl')), out});
    print(readFileSync(join(out, 'item-1-order-meta.md'), 'utf8'));
    return judged.targets['second-target'].verdict === 'pass' ? 0 : 1;
  }
  if (command === 'clip') {
    const sub = positionals[0];
    if (sub === 'frames') {
      const out = absolute(values, 'out');
      const record = writeFrames({rows: lastAttempt(readJsonl(join(out, 'item-1.jsonl'))), dir: absolute(values, 'frames')});
      for (const [target, t] of Object.entries(record.targets)) print(`${target} (${t.scene}): frames ${t.frames[0].index}–${t.frames.at(-1).index} (${t.frames[0].pts.toFixed(3)}–${t.frames.at(-1).pts.toFixed(3)} s), ${t.frames[0].file} … ${t.frames.at(-1).file}`);
      print(`wrote ${join(values.frames, 'frames.json')}`);
      return 0;
    }
    if (sub === 'order') {
      const usage = 'clip order takes first-target <change> <arrival> second-target <change> <arrival> (frame indices, as frames.json numbers them)';
      const pairs = positionals.slice(1);
      if (pairs.length !== 6) throw new Error(usage);
      const judged = {};
      for (let k = 0; k < 6; k += 3) {
        const [target, change, arrival] = pairs.slice(k, k + 3);
        if (!ORDER_TARGETS[target] || !/^\d+$/.test(change) || !/^\d+$/.test(arrival)) throw new Error(usage);
        judged[target] = {change: Number(change), arrival: Number(arrival)};
      }
      if (Object.keys(judged).length !== 2) throw new Error(usage);
      const out = absolute(values, 'out');
      const judgement = writeOrder({dir: absolute(values, 'frames'), out, judged});
      print(readFileSync(join(out, 'item-1-order.md'), 'utf8'));
      return judgement.pass ? 0 : 1;
    }
    if (sub === 'routes') {
      const plan = route3Plan(lastAttempt(readJsonl(join(absolute(values, 'out'), 'item-1.jsonl'))));
      print(`item 1's routes: ${Object.entries(plan.routes).map(([target, route]) => `${target} route ${route}`).join(', ')}`);
      print(plan.fallback
        ? 'route-3-lag: no click of item 1 went by route 3, so the fallback applies: the owner stays and watches the first minute of item 13, then gives its verdict'
        : `route-3-lag: from item 1's clip, after the sitting (clip lag), for ${plan.fromClip.join(' and ')}; the owner may leave after item 5`);
      return 0;
    }
    if (sub === 'lag') {
      const usage = 'clip lag takes <target> <change> <start> for each route-3 click of item 1 (frame indices, as frames.json numbers them)';
      const args = positionals.slice(1);
      if (!args.length || args.length % 3) throw new Error(usage);
      const judged = {};
      for (let k = 0; k < args.length; k += 3) {
        const [target, change, start] = args.slice(k, k + 3);
        if (!ORDER_TARGETS[target] || !/^\d+$/.test(change) || !/^\d+$/.test(start)) throw new Error(usage);
        judged[target] = {change: Number(change), start: Number(start)};
      }
      const out = absolute(values, 'out');
      const judgement = writeLag({dir: absolute(values, 'frames'), out, judged});
      print(readFileSync(join(out, 'item-1-route3-lag.md'), 'utf8'));
      return judgement.verdict === 'pass' ? 0 : 1;
    }
    throw new Error('clip takes frames, order, routes or lag');
  }
  if (command === 'raise') {
    const sub = positionals[0];
    if (sub === 'drive') return driveRaise(values);
    if (sub === 'judge') {
      const out = absolute(values, 'out'), judged = judgeRaise(out);
      writeFileSync(join(out, 'item-200.md'), raiseMarkdown(judged));
      print(raiseMarkdown(judged));
      return judged.length && judged.every(j => j.engine === 'vendor' || j.verdict === 'PASS') ? 0 : 1;
    }
    throw new Error('raise takes drive or judge');
  }
  if (command === 'first-observation') {
    const sub = positionals[0];
    if (sub === 'drive') return driveFirstObservation(values);
    if (sub === 'judge') {
      const out = absolute(values, 'out'), judged = judgeFirstObservation(out);
      writeFileSync(join(out, 'item-244.md'), firstMarkdown(judged));
      print(firstMarkdown(judged));
      return firstPassed(judged) ? 0 : 1;
    }
    throw new Error('first-observation takes drive or judge');
  }
  if (command === 'paste-187') {
    const sub = positionals[0];
    if (sub === 'drive') return drive187(values);
    if (sub === 'judge') {
      const out = absolute(values, 'out'), judged = judge187(read187(out));
      // --addendum: the re-judgment by the amended predicates, beside the slot's report; item-187.md is never touched.
      if (values.addendum) {
        const text = item187Addendum(judged, {commit: kitCommit()});
        writeFileSync(join(out, ADDENDUM_FILE), `${text.replace(/\n+$/, '')}\n`);
        print(text);
        return judgedOk(judged) ? 0 : 1;
      }
      writeFileSync(join(out, 'item-187.md'), item187Markdown(judged));
      print(item187Markdown(judged));
      return judgedOk(judged) ? 0 : 1;
    }
    throw new Error('paste-187 takes drive or judge');
  }
  if (command === 'control-build') {
    const home = absolute(values, 'home'), scratch = absolute(values, 'scratch');
    if (values['dry-run']) {
      const {record} = prepareControlSource({scratch});
      print({ok: true, dryRun: true, ...record, next: 'nothing was built'});
      return 0;
    }
    const {main: cliMain} = await import('../src/cli.mjs');
    const built = await buildControl({home, scratch, cliMain, engineDir: engineDirOf(home), signWait: values['sign-wait'] ?? null});
    print({ok: built.code === 0, copy: built.copy, shippingBuild: built.shippingBuild, controlBuild: built.controlBuild,
      next: built.code === 0 ? 'cua engine approve, then save the engine directory as the BEFORE half (the runbook)' : 'the build failed: its error is above'});
    return built.code;
  }
  if (command === 'isolate-187') {
    const sub = positionals[0];
    if (sub === 'drive') return driveIsolate(values);
    if (sub === 'judge') {
      const out = absolute(values, 'out'), judged = judgeIsolate(read187(out)), text = isolateMarkdown(judged, {commit: kitCommit()});
      writeFileSync(join(out, VERDICT_FILE), text);
      print(text);
      return judged.ok ? 0 : 1;
    }
    if (sub === 'replay') {
      // Section D: the judge's pure pieces over 11-05's records and the C2/C3 fixtures (./cursor-sitting/isolate-replay.mjs).
      const {RECORDS, REPLAY_FILE, realRecords, replayMarkdown} = await import('./cursor-sitting/isolate-replay.mjs');
      const to = values.to ? absolute(values, 'to') : REPLAY_FILE;
      // No commit in the text: the replay is a function of the records and the kit, so the committed file stays checkable.
      const {text, cases, mismatches} = replayMarkdown(realRecords(values.from ? absolute(values, 'from') : RECORDS));
      writeFileSync(to, `${text.replace(/\n+$/, '')}\n`);
      print(`the replay: ${cases} cases, ${cases - mismatches.length} as expected; wrote ${to}`);
      for (const m of mismatches) print(`NOT as expected: ${m.name}: expected ${m.expected}, got ${m.outcome}`);
      return mismatches.length ? 1 : 0;
    }
    throw new Error('isolate-187 takes drive, judge or replay');
  }
  if (command === 'remote') {
    const kit = absolute(values, 'kit'), sub = positionals[0];
    if (sub === 'prepare') {
      const {needs} = prepareKit(kit);
      print(needs.length ? `the kit still needs, from the checkout's root:\n${needs.map(n => `  ${n}`).join('\n')}` : 'the kit is ready to enrol');
      return needs.length ? 1 : 0;
    }
    if (sub === 'enroll') {
      const record = await enrollKit(kit, {port: Number(values.port ?? DEFAULT_PORT)});
      print(`enrolled the kit's device ${record.deviceId} on the loopback relay ${record.relayUrl}; registered as \`loop\` for the kit's clients`);
      return 0;
    }
    if (sub === 'run') {
      const steps = remoteSteps(kit);
      if (values['dry-run']) return drive(steps, {item: '8', values});
      const loopback = startLoopback(kit);
      try {
        const {deviceHome} = kitPaths(kit);
        const deadline = Date.now() + 60_000;
        while (!agentConnected(deviceHome)) {
          if (Date.now() > deadline) throw new Error(`the agent did not report its relay link up within 60 s (see ${join(kit, 'agent.log')} and ${join(kit, 'relay.log')})`);
          await new Promise(r => setTimeout(r, 500));
        }
        return await drive(steps, {item: '8', values});
      } finally { await loopback.stop(); }
    }
    throw new Error('remote takes prepare, enroll or run');
  }
  throw new Error('usage: cursor-sitting.mjs prepare | save | restore | drive <item> | timing typing|clicks | judge | verdict | summary | source consent|restore | clip frames|order | raise drive|judge | first-observation drive|judge | paste-187 drive|judge | control-build | isolate-187 drive|judge | remote prepare|enroll|run (see the header)');
}

if (process.argv[1] && SCRIPT === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { process.stderr.write(`cursor-sitting: ${error.message}\n`); process.exitCode = 2; });
}
