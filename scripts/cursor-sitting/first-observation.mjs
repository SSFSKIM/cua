// #244's live check: does the engine's first observation of a fresh Electron app hold the page, after one write of the
// enablement attribute? (SSFSKIM/cua#244; the cause, read offline in ~/.local/share/244/phase1-report.md: Electron
// debounces complete mode 2 s past the last AXManualAccessibility write and restarts that countdown at every write; the
// engine wrote at every observation, and nothing gave the process Chromium's Basic mode, which a read of the
// application element's role does. The fix writes once per owned process and reads the role before enabling.)
// Each variant runs on its own fresh fixture process and its own session:
//   plain   the fixture as the scenes bring it up
//   sonoma  the fixture launched with SonomaAccessibilityActivationRefinements on, where the role read gives Chromium
//           only its native APIs and the page waits for complete mode (the case the fallback, a longer web-area wait, would cover: #246)
// The steps:
// 1. The fixture brought down and up again (#200's `fixture-relaunch`, ./raise.mjs), its accessibility record off since
//    its start line; the variant's switch on its process's command line, and no other variant's (`ps`).
// 2. A session opened with the fixture as its scene but not bound: binding observes (getApp, then BIND's screenshot),
//    so a bound session has observed the app twice before any cell could look.
// 3. The first cell is the session's first engine observation of the fixture: one `cua.computer.get_app_state` (the
//    observation getApp makes, without the bind), its text inspected in the cell: the button found by its index, the
//    text's line and character counts, whether the page's web area (its URL line) is there, and the call's start and
//    end on the Unix-ms clock the fixture's record uses. The reply's `cua/observation` meta is kept (./session.mjs).
// 4. WARM more observations, one call a cell, so each keeps its own meta: the role read's warm cost and the later priors
//    ("owned" once the engine owns the attribute).
// 5. Held until complete mode is on (a line of the record, of any source, saying enabled true), at most COMPLETE_WAIT_MS.
// 6. The session closed; the record read until the mode it ends in is off (its latest line, of any source) and at least
//    RELEASE_MS past the close, at most RELEASE_WAIT_MS.
// 7. From the record (this launch's lines: from its last start line), the write events ("event": Electron fires
//    accessibility-support-changed at every set) before the open, inside the session (from the mark before the open to
//    the one before the close) and after the close (the release's write).
// Pass, for cua's engine on the plain variant: the button in the first observation; exactly one write in the session;
// complete mode on before the close; off within RELEASE_MS of the session's close (from when close returned: the
// engine releases when the connection ends) and still off at the end of the release window, with no write after the
// close but the release's own. Every warm observation must have answered with its role read, or the run is incomplete.
// The sonoma variant and the vendor's engine are recorded, not judged: the fallback, a longer web-area wait, is #246,
// and sonoma's row is its evidence.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {cell} from '../native-baseline/cells.mjs';
import {FIXTURE_ACCESSIBILITY_FILE} from '../native-matrix/fixtures/electron-fixture.mjs';
import {prelude} from '../native-matrix/matrix-cells.mjs';
import {readState} from '../repl-parity/scenes-mac.mjs';
import {orderLines, spread} from './raise.mjs';
import {SCENE_MARKER} from './target-guard.mjs';

export const SONOMA_SWITCH = '--enable-features=SonomaAccessibilityActivationRefinements';
export const VARIANTS = Object.freeze({
  plain: {what: 'the fixture relaunched fresh', launchArgs: []},
  sonoma: {what: `the fixture relaunched fresh with ${SONOMA_SWITCH}`, launchArgs: [SONOMA_SWITCH]},
});
// Every switch a variant may add: a variant's process must carry its own and none of the others.
const VARIANT_SWITCHES = [...new Set(Object.values(VARIANTS).flatMap(v => v.launchArgs))];
export const ENGINES = Object.freeze(['cua', 'vendor']);
export const WARM = 5;
// Electron's complete mode lands about 2 s after the last write; the hold is bounded past that.
export const COMPLETE_WAIT_MS = 4000;
// The judged bound from the session's close to complete mode off, and how long the record is read for it.
export const RELEASE_MS = 2500;
export const RELEASE_WAIT_MS = 5000;
export const BUTTON = 'Fixture button';
export const itemOf = (variant, engine) => `244-${variant}-${engine}`;
// Where the relaunch keeps the fixture's app path for the cells.
export const APP_KEY = '244 app';
export const LABELS = Object.freeze({
  first: '244: the session\'s first observation of the fixture (get_app_state, its text inspected)',
  warm: i => `244: warm observation ${i + 1}`,
});

const j = JSON.stringify;
// One observation of the fixture by its app path, the only call of its cell (the reply's meta is that call's). The text
// stays in the cell. -> {found, index, lines, chars, page, startedAt, endedAt, ms}.
export const OBSERVATION = app => cell(`${SCENE_MARKER('electron')}
${prelude(null)}
const startedAt = Date.now(), t0 = performance.now();
const state = await cua.computer.get_app_state({app: ${j(app)}, disableDiff: true});
const ms = performance.now() - t0, endedAt = Date.now();
const ax = String(state?.text ?? "");
const index = indexOfTarget(ax, ${j(BUTTON)});
return {found: index !== null, index, lines: ax.split("\\n").length, chars: ax.length, page: /URL: file:\\/\\//.test(ax), startedAt, endedAt, ms};`);

// ---- the record ----------------------------------------------------------------------------------------------------

// The fixture's record is appended across launches: this launch's lines are those from its last start line on.
export function launchSlice(lines) {
  const k = lines.findLastIndex(l => l.source === 'start');
  return k < 0 ? [] : lines.slice(k);
}

const isEvent = l => l.source === 'event';
// The mode (Chromium's complete accessibility mode, on or off) at any time is the `enabled` of the record's latest line
// of any source: the fixture's event line carries the mode as it stands after the set, and its poll writes a line only
// when the mode differs from the last line written, so an off the release's own event line already says is never
// followed by a "poll" one (the live slot of 2026-11-01).
const hasMode = l => typeof l?.enabled === 'boolean';
// What a launch's record says of one session: `openedAt` the mark before the open, `closingAt` the mark before the
// close, `closedAt` the one after it (Unix ms). Writes are event lines; the mode is read from every line. -> {start,
// writes: {beforeOpen, inSession, afterClose}, onBeforeOpen (a line saying on before the open), completeOn (the first
// line saying on), onAfterWriteMs (from the last write before it), completeOff (the first line at or after the closing
// mark that turns the mode from on to off), offAfterCloseMs (from `closedAt`), offAfterReleaseWriteMs, reOn (a line
// saying on after that off: the release did not hold), finalOn (the mode the record ends in)}.
export function recordFacts({record, openedAt, closingAt, closedAt}) {
  const lines = launchSlice(record ?? []), events = lines.filter(isEvent), modes = lines.filter(hasMode);
  const beforeOpen = events.filter(l => l.at < openedAt), inSession = events.filter(l => l.at >= openedAt && l.at < closingAt);
  const afterClose = events.filter(l => l.at >= closingAt);
  const completeOn = modes.find(l => l.enabled === true) ?? null;
  const writeBefore = completeOn ? events.filter(l => l !== completeOn && l.at <= completeOn.at).at(-1) : null;
  const offAt = modes.findIndex((l, k) => l.enabled === false && l.at >= closingAt && modes[k - 1]?.enabled === true);
  const completeOff = offAt < 0 ? null : modes[offAt];
  const releaseWrite = afterClose[0] ?? null;
  const reOn = offAt < 0 ? null : modes.slice(offAt + 1).find(l => l.enabled === true) ?? null;
  return {reOn, finalOn: modes.at(-1)?.enabled ?? null, start: lines[0] ?? null, writes: {beforeOpen, inSession, afterClose},
    onBeforeOpen: modes.find(l => l.enabled === true && l.at < openedAt) ?? null,
    completeOn, onAfterWriteMs: completeOn && writeBefore ? completeOn.at - writeBefore.at : null,
    completeOff, offAfterCloseMs: completeOff && Number.isFinite(closedAt) ? completeOff.at - closedAt : null,
    offAfterReleaseWriteMs: completeOff && releaseWrite && releaseWrite.at <= completeOff.at ? completeOff.at - releaseWrite.at : null};
}

// The mode the record ends in, when it is off and was recorded at or after `since`: the latest line, of any source,
// else null. A past off that a later line contradicts is not the state the record ends in.
export const offSince = (lines, since) => {
  const latest = lines.filter(hasMode).at(-1);
  return latest?.enabled === false && latest.at >= since ? latest : null;
};

// Reads the record (`read()`: its text) every `pollMs` until `done(lines)` (this launch's) answers a line and `minMs`
// have passed, or `boundMs` have. -> {lines, hit (the line, or null), waitedMs}.
export async function awaitRecord({read, done, boundMs, minMs = 0, pollMs = 100, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const t0 = now();
  for (;;) {
    const lines = launchSlice(orderLines(read())), hit = done(lines) ?? null, waitedMs = now() - t0;
    if ((hit && waitedMs >= minMs) || waitedMs >= boundMs) return {lines, hit, waitedMs};
    await sleep(pollMs);
  }
}

// ---- the judge -----------------------------------------------------------------------------------------------------

const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
const tally = values => values.reduce((m, v) => ({...m, [v ?? 'none']: (m[v ?? 'none'] ?? 0) + 1}), {});

// One variant on one engine from its rows (the item's jsonl). -> the numbers the report prints and the verdict, with
// `why`.
export function judgeFirst({variant, engine, rows}) {
  const last = lastAttempt(rows);
  const task = name => last.findLast(r => r.kind === 'task' && r.task === name)?.result ?? null;
  const mark = name => last.findLast(r => r.kind === 'task' && r.task === 'first-mark' && r.args?.[0] === name)?.result?.at ?? null;
  const cellOf = label => last.findLast(r => r.kind === 'cell' && r.label === label) ?? null;
  const relaunch = task('first-relaunch'), release = task('first-release'), complete = task('first-complete');
  const openedAt = mark('open'), closingAt = mark('close'), closedAt = mark('closed');
  const first = cellOf(LABELS.first);
  const warmCount = last.find(r => r.kind === 'series')?.counts?.warm ?? WARM;
  const warmCells = Array.from({length: warmCount}, (_, i) => cellOf(LABELS.warm(i))), warm = warmCells.filter(Boolean);
  const facts = recordFacts({record: release?.record ?? [], openedAt, closingAt, closedAt});
  const obs = first?.meta?.observation ?? null, warmObs = warm.map(w => w.meta?.observation ?? null);
  // Every warm observation must have answered, and on cua's engine carried its role read: they are what exercise
  // write-once across later observations, and what the warm cost comes from.
  const warmProblem = warmCells.map((w, i) => (!w ? `warm observation ${i + 1} was not made`
    : !w.ok ? `warm observation ${i + 1} failed: ${w.error}`
      : engine === 'cua' && !Number.isFinite(w.meta?.observation?.appRoleReadMs) ? `warm observation ${i + 1} reported no role read (cua/observation appRoleReadMs)` : null)).find(Boolean) ?? null;
  const firstValue = first?.ok ? first.value : null;
  const base = {variant, engine, launchArgs: relaunch?.launchArgs ?? VARIANTS[variant].launchArgs, pid: relaunch?.pid ?? null,
    first: firstValue && {found: firstValue.found, index: firstValue.index, lines: firstValue.lines, chars: firstValue.chars, page: firstValue.page,
      startedAt: firstValue.startedAt, ms: firstValue.ms, observation: obs},
    firstError: first && !first.ok ? first.error : null,
    warm: {n: warm.length, ok: warm.filter(w => w.ok).length, found: warm.filter(w => w.ok && w.value?.found).length,
      appRoleReadMs: spread(warmObs.map(o => o?.appRoleReadMs)), priors: tally(warmObs.map(o => o?.enablementPrior ?? null)),
      each: warmCells.map(w => ({ok: w?.ok ?? false, appRoleReadMs: w?.meta?.observation?.appRoleReadMs ?? null, enablementPrior: w?.meta?.observation?.enablementPrior ?? null}))},
    writes: {beforeOpen: facts.writes.beforeOpen.length, inSession: facts.writes.inSession.length, afterClose: facts.writes.afterClose.length},
    firstWriteAfterStartMs: firstValue && facts.writes.inSession[0] ? facts.writes.inSession[0].at - firstValue.startedAt : null,
    completeOn: facts.completeOn && {at: facts.completeOn.at, afterWriteMs: facts.onAfterWriteMs, beforeClose: Number.isFinite(closingAt) && facts.completeOn.at < closingAt},
    completeOff: facts.completeOff && {at: facts.completeOff.at, afterCloseMs: facts.offAfterCloseMs, afterReleaseWriteMs: facts.offAfterReleaseWriteMs},
    closeMs: Number.isFinite(closingAt) && Number.isFinite(closedAt) ? closedAt - closingAt : null, heldMs: complete?.waitedMs ?? null};
  const stopped = last.findLast(r => r.kind === 'stopped')?.error ?? null;
  // Evidence the verdict needs; without it the run says nothing either way.
  const short = stopped ? `stopped: ${stopped}`
    : !relaunch?.ok ? `the fixture was not relaunched fresh: ${relaunch?.problem ?? 'no record'}`
      : !first ? 'no first observation was made'
        : !first.ok ? `the first observation failed: ${first.error}`
          : engine === 'cua' && !Number.isFinite(obs?.appRoleReadMs) ? 'the first observation reported no role read (cua/observation appRoleReadMs): the approved engine is not a build with #244\'s fix'
            : warmProblem ? warmProblem
            : !last.some(r => r.kind === 'close') || !Number.isFinite(closingAt) || !Number.isFinite(openedAt) ? 'the session did not close after its marks'
              : !release ? 'the record was not read after the close'
                : facts.start === null ? 'the record has no start line for this launch'
                  : facts.onBeforeOpen ? `the record says accessibility was on (${facts.onBeforeOpen.source} at ${facts.onBeforeOpen.at}) before the session opened`
                    : facts.writes.beforeOpen.length ? `${facts.writes.beforeOpen.length} write event(s) before the session opened: not the session's` : null;
  const failed = short ? [] : [
    !firstValue.found && `the button is not in the first observation (${firstValue.lines} lines, ${firstValue.chars} characters${firstValue.page ? '' : ', no page'})`,
    facts.writes.inSession.length !== 1 && `${facts.writes.inSession.length} write events in the session, not 1`,
    !base.completeOn?.beforeClose && 'complete mode did not come on before the close',
    !(Number.isFinite(facts.offAfterCloseMs) && facts.offAfterCloseMs <= RELEASE_MS)
      && (facts.completeOff ? `complete mode went off ${facts.offAfterCloseMs} ms after the close, past ${RELEASE_MS}` : `complete mode did not go off within ${RELEASE_WAIT_MS} ms of the close`),
    facts.writes.afterClose.length > 1 && `${facts.writes.afterClose.length} write events after the close, not the release's alone`,
    facts.reOn && `complete mode came on again ${Number.isFinite(closedAt) ? facts.reOn.at - closedAt : '?'} ms after the close, after going off`,
    facts.completeOff && !facts.reOn && facts.finalOn !== false && 'complete mode was not off at the end of the release window',
  ].filter(Boolean);
  const judged = short ? 'INCOMPLETE' : failed.length ? 'FAIL' : 'PASS';
  const why = short ?? (failed.length ? failed.join('; ') : null);
  const recorded = engine !== 'cua' || variant !== 'plain';
  return {...base, verdict: recorded ? 'recorded' : judged, why, ...(recorded ? {wouldBe: judged} : {})};
}

const v = x => (x === null || x === undefined ? '–' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : String(x));
const spreadText = s => (s.n ? `${v(s.min)} / ${v(s.median)} / ${v(s.max)} (${s.n})` : '–');
// The judgements as Markdown: the record's table, the engine's diagnostics, then each variant's notes.
export function firstMarkdown(judged) {
  const lines = ['# #244: the first observation of a fresh Electron app (scripts/cursor-sitting/first-observation.mjs)', '',
    `Each variant ran on a freshly launched fixture (its accessibility record off) and a session that bound nothing, so its first cell made the session's first engine observation of the fixture (one \`get_app_state\`, its text inspected in the cell). Writes are the fixture's \`accessibility-support-changed\` events, one per enablement-attribute write; complete mode (Chromium's own accessibility mode, on or off) is the \`enabled\` of the record's latest line of any source, since the event line carries the mode after its set and the fixture's poll writes only a change from the last line. In the session counts from the mark before the open to the mark before the close; after the close is the release's write. Off is the first line after the close, of any source, that turns the mode from on to off (the release's own event line can carry it), measured from when the session's close returned (negative: the release wrote before the close returned). The role read's \`appRoleReadMs\` was recorded under ordinary load: #244 sets no timing bar for it. Pass, for cua's engine on the plain variant: the button in the first observation, exactly 1 write in the session, complete mode on before the close, and off within ${RELEASE_MS} ms of the close and still off when the record was last read, with no write after the close but the release's; every warm observation answered with its role read, or the run is incomplete. The sonoma variant (${SONOMA_SWITCH}) and the vendor's engine are recorded, not judged; sonoma's row is the evidence for the fallback, a longer web-area wait, which is #246.`, '',
    '| variant | engine | button in the first observation (index) | its text: lines / chars, page | writes: before the open / in the session / after the close | complete mode on (ms after the last write) | off (ms after the close; after the release\'s write) | verdict |',
    '|---|---|---|---|---|---|---|---|'];
  for (const r of judged) {
    const f = r.first, verdict = r.verdict === 'recorded' ? `recorded (would be ${r.wouldBe})` : `**${r.verdict}**`;
    lines.push(`| ${r.variant} | ${r.engine} | ${f ? (f.found ? `yes (${f.index})` : 'no') : '–'} | ${f ? `${f.lines} / ${f.chars}, ${f.page ? 'page' : 'no page'}` : '–'} | ${r.writes.beforeOpen} / ${r.writes.inSession} / ${r.writes.afterClose} | ${r.completeOn ? `${r.completeOn.beforeClose ? '' : 'after the close, '}${v(r.completeOn.afterWriteMs)}` : 'no'} | ${r.completeOff ? `${v(r.completeOff.afterCloseMs)}; ${v(r.completeOff.afterReleaseWriteMs)}` : 'no'} | ${verdict} |`);
  }
  lines.push('', '| variant | engine | first: prior | enabled | role read, ms | web area found | web-area wait, ms | chromium | warm: role read, ms (min / median / max, n) | warm priors, in order | warm: button found |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of judged) {
    const o = r.first?.observation ?? {};
    lines.push(`| ${r.variant} | ${r.engine} | ${v(o.enablementPrior)} | ${v(o.enabled)} | ${v(o.appRoleReadMs)} | ${v(o.webAreaFound)} | ${v(o.webAreaWaitMs)} | ${v(o.chromium)} | ${spreadText(r.warm.appRoleReadMs)} | ${r.warm.each.map(w => v(w.enablementPrior)).join(', ') || '–'} | ${r.warm.found} of ${r.warm.n} |`);
  }
  for (const r of judged) {
    const notes = [
      `the fixture's process ${v(r.pid)}${r.launchArgs.length ? `, launched with ${r.launchArgs.join(' ')}` : ''}`,
      ...(r.first ? [`the first observation took ${v(r.first.ms)} ms${r.firstWriteAfterStartMs !== null ? `; the session's first write came ${r.firstWriteAfterStartMs} ms after it began` : ''}`] : []),
      ...(r.firstError ? [`the first observation failed: ${r.firstError}`] : []),
      ...(r.heldMs !== null ? [`held ${r.heldMs} ms for complete mode after the warm observations`] : []),
      ...(r.closeMs !== null ? [`the close took ${r.closeMs} ms`] : []),
      ...(r.why ? [`verdict: ${r.why}`] : []),
    ];
    lines.push('', `## ${r.variant} on ${r.engine}`, '', ...notes.map(n => `- ${n}`));
  }
  return `${lines.join('\n')}\n`;
}

// ---- the steps -----------------------------------------------------------------------------------------------------

const S = 's';
// One variant's steps on `engine`.
export function firstSteps(variant, {engine, warm = WARM}) {
  return [
    {say: `#244 ${variant} on the ${engine} engine: ${VARIANTS[variant].what}, the session's first observation, ${warm} warm`},
    {series: [itemOf(variant, engine)], counts: {warm}},
    {task: 'first-relaunch', args: [variant], required: true},
    {task: 'first-mark', args: ['open']},
    {open: S, engine, scenes: ['electron'], bind: false},
    {run: S, cell: results => OBSERVATION(results[APP_KEY]), label: LABELS.first, required: true},
    ...Array.from({length: warm}, (_, i) => ({run: S, cell: results => OBSERVATION(results[APP_KEY]), label: LABELS.warm(i)})),
    {task: 'first-complete'},
    {task: 'first-mark', args: ['close']},
    {close: S},
    {task: 'first-mark', args: ['closed']},
    {task: 'first-release'},
  ];
}

// ---- the live tasks ------------------------------------------------------------------------------------------------

// A process's command line as `ps` prints it, or null.
export function liveProcessArgs(pid) {
  try { return execFileSync('/bin/ps', ['-ww', '-o', 'args=', '-p', String(pid)], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000}).trim() || null; } catch { return null; }
}

// Why the process's command line `line` does not fit `launchArgs`, or null: each of them on it, and no other variant's.
export function launchArgsProblem(line, launchArgs) {
  if (line === null) return 'its command line could not be read';
  const words = line.split(/\s+/), want = new Set(launchArgs);
  const wrong = VARIANT_SWITCHES.filter(a => want.has(a) !== words.includes(a));
  return wrong.length ? wrong.map(a => (want.has(a) ? `${a} is missing from its command line` : `its command line carries ${a}`)).join('; ') : null;
}

// The tasks the steps name, for ./runner.mjs liveIo. `run`: the scenes' run directory; the relaunch is #200's
// (`fixture-relaunch` on the same io, ./raise.mjs).
export function firstTasks({run, processArgs = liveProcessArgs, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const recordText = () => {
    const dir = readState(run).scenes?.electron?.userDataDir, file = dir ? join(dir, FIXTURE_ACCESSIBILITY_FILE) : null;
    return file && existsSync(file) ? readFileSync(file, 'utf8') : '';
  };
  const marks = ctx => (ctx.first ??= {marks: {}}).marks;
  return {
    'first-relaunch': async ([variant], ctx) => {
      ctx.first = {marks: {}};
      const {launchArgs} = VARIANTS[variant];
      const relaunch = await ctx.io.tasks['fixture-relaunch'](launchArgs, ctx);
      if (!relaunch?.ok) return {...relaunch, ok: false, variant, launchArgs, problem: relaunch?.problem ?? 'the fixture was not relaunched'};
      const commandLine = processArgs(relaunch.pid), problem = launchArgsProblem(commandLine, launchArgs);
      ctx.results[APP_KEY] = ctx.io.scene('electron').app;
      return {...relaunch, ok: problem === null, variant, launchArgs, ...(problem ? {problem: `the fixture's process ${relaunch.pid}: ${problem}`} : {})};
    },
    'first-mark': async ([name], ctx) => { const at = now(); marks(ctx)[name] = at; return {ok: true, name, at}; },
    // Held until the record says complete mode is on (since the open; a line of any source).
    'first-complete': async (_args, ctx) => {
      const opened = marks(ctx).open ?? 0;
      const r = await awaitRecord({read: recordText, done: lines => lines.find(l => l.enabled === true && l.at >= opened), boundMs: COMPLETE_WAIT_MS, now, sleep});
      return {ok: r.hit !== null, on: r.hit, waitedMs: r.waitedMs, ...(r.hit ? {} : {problem: `complete mode did not come on within ${COMPLETE_WAIT_MS} ms`})};
    },
    // After the close: the record read until its latest mode is off (offSince) and RELEASE_MS have passed since the close,
    // at most RELEASE_WAIT_MS; this launch's lines kept for the judge.
    'first-release': async (_args, ctx) => {
      const {close: closing = 0, closed = now()} = marks(ctx), t0 = now();
      const r = await awaitRecord({read: recordText, done: lines => offSince(lines, closing),
        minMs: closed + RELEASE_MS - t0, boundMs: closed + RELEASE_WAIT_MS - t0, now, sleep});
      return {ok: r.hit !== null, off: r.hit, offAfterCloseMs: r.hit ? r.hit.at - closed : null, waitedMs: r.waitedMs, record: r.lines,
        ...(r.hit ? {} : {problem: `complete mode was not off at the end of the release window (${RELEASE_WAIT_MS} ms after the close)`})};
    },
  };
}
