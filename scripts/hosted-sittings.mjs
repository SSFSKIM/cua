#!/usr/bin/env node
// M5's hosted sittings (#117 M5, T10b′; docs/evidence/2026-11-23-own-native-engine/hosted.md): each sitting, A to F, is
// one job on a GitHub-hosted macOS runner (.github/workflows/m5-sittings.yml), both engines on one machine with their
// lanes alternating. Everything that changes the machine refuses unless RUNNER_ENVIRONMENT=github-hosted on macOS; the
// plan and counts read only.
//
//   node scripts/hosted-sittings.mjs setup [--engine-archive <tgz>] [--report <file>]
//       The runner's setup in H0's order (scripts/hosted-sittings/setup.mjs): the loopback device, the harness checkout,
//       the run's install and engine, the system-database TCC rows, the relaunch and the two-pass approve, each copy's
//       warm-up capture, the record. Exit 0 ready, 1 a step failed, 2 refused.
//   node scripts/hosted-sittings.mjs pin-decision [--commit <full SHA>] [--env-file <file>]
//       The O0 source pinned for the TCC writer (scripts/hosted-sittings/pin.mjs): the design spec at the commit (the
//       entry's own by default) written to a run-owned file; prints CUA_HOSTED_DECISION_FILE and _SHA, and appends them
//       to --env-file ($GITHUB_ENV in the workflow). Exit 0, 1 on a failed fetch, 2 refused.
//   node scripts/hosted-sittings.mjs approve
//       The hosted approval alone, under HOME (CUA_HOSTED_APPROVE, which sitting E's approved lane waits on). Prints its
//       report. Exit 0 approved by the second pass, 3 not approved, 2 refused.
//   node scripts/hosted-sittings.mjs run <a..f> --out <dir> [--pilot] [--flipped]
//       The sitting's steps (scripts/hosted-sittings/plan.mjs) on this runner, each read by its own check
//       (scripts/hosted-sittings/checks.mjs), then its report: sitting.json, sitting.md (the step table, and for C the
//       per-cell counts, and in the pilot what it read; C's judge keeps its own summary.md). --flipped: this commit
//       selects cua's engine by default (sitting E's lanes are then expected to pass). Exit 0 PASS, 1 a step failed,
//       4 NO VERDICT, 5 a full sitting holds a step not built yet, 3 OWNER, 2 usage or refused.
//   node scripts/hosted-sittings.mjs run c --out <dir> --split-run <n> [--only <cell>,…] [--speed-extra]
//   node scripts/hosted-sittings.mjs run c --out <dir> --split-judge --jobs <dir>,… [--base <dir>]
//       Sitting C split into jobs (ruling 1228, scripts/hosted-sittings/split.mjs): run job n (its own pair, its run's
//       save-sheet steps; --only the cells a filtered rerun needs, textedit/intervention.saveSheet for #212's), and the
//       judging job over the run jobs' sitting dirs (a full run's beneath filtered reruns): jobs-check, combine, judge,
//       key-route. --speed-extra (off by default): the run job also re-times the three speed ops full sitting C missed,
//       ten samples each on both lanes, judged on those samples alone, with three controls reported beside them (ruling
//       1232). `plan` takes the same options.
//   node scripts/hosted-sittings.mjs source-run --jobs <dir>,… --source <dir> --run-id <id> --attempt <n> --commit <sha>
//       --repo <owner/name> --runs <n>,… --only <filter> [--speed-extra] --out <file>
//       A judge-only dispatch's source run (ruling 1234): the API's run, jobs and artifacts (run.json, jobs.json and
//       artifacts.json in <dir>, gh api's pages) and the run jobs' records against the pinned run, attempt and drawing
//       commit and this dispatch's inputs; exit 2 when anything differs, 0 otherwise; `run` lists it in sitting.md.
//   node scripts/hosted-sittings.mjs jobs-check --jobs <dir>,… [--base <dir>,… --base-run-id <id>,…] --out <file>
//       The run jobs' records, each with the hardware.json beside its dir: exit 2 when they are not one harness commit
//       and one pair of engine versions (or two jobs ran one run), 0 otherwise; `run` lists the jobs in sitting.md.
//       A layered base (ruling 1239): the full run's evidence directory, then each judged rerun's, each with its run id;
//       every layer is checked by its digests and README, each rerun layer's jobs against the full run's engines.
//   node scripts/hosted-sittings.mjs rejudge-base --base <dir>,… --out <file>
//       The base re-judged (rulings 1230, 1234, 1239): its records judged by this commit's judge against the judge of the
//       base's judging commit; a layered base is combined from its layers' raw records by each commit's own combine.
//   node scripts/hosted-sittings.mjs plan <a..f> --out <dir> [--pilot] [--flipped]     the steps, as JSON; runs nothing
//   node scripts/hosted-sittings.mjs counts <dir>...                                   per-cell counts of result dirs
//   node scripts/hosted-sittings.mjs focus-timing --approved-engine <bundle> --out <file>   the focus probe's cost
//   node scripts/hosted-sittings.mjs textedit up --file <path> [--record <file>] | down   sitting D's scratch document, placed clear of the alerts
//   node scripts/hosted-sittings.mjs onboarding --out <file>
//       T3b's staged onboarding, sitting D's last step (scripts/hosted-sittings/onboarding.mjs): cua's engine's TCC rows
//       set stage by stage, a relaunch at each, the product's answers recorded to <file>, which the sitting's check judges
//       (scripts/hosted-sittings/onboarding-judge.mjs). Exit 0 every stage ran, 1 the run stopped (recorded), 2 refused.
//   node scripts/hosted-sittings.mjs key-route --approved-runtime <home> --approved-engine <bundle> --sitting <id> --out <dir>
//       Sitting C's key-route diagnostic, its last step (scripts/hosted-sittings/key-route.mjs, ruling 1198): where each
//       engine's Escape lands while TextEdit's Open panel is focused; key-route.json and key-route.md in <dir>, which
//       `run` appends to sitting.md. Exit 0 recorded, 1 a cleanup failure (named in the record), 2 refused.
//   node scripts/hosted-sittings.mjs witness-tap --out <file>
//       Sitting C's step before its matrix runs (scripts/hosted-sittings/witness-tap.mjs, ruling 1225): R3's witness tap
//       app built and granted Input Monitoring alone, the engines' TCC rows read around it, recorded to <file>. Exit 0
//       recorded (a tap not ready included: its cells stay NO VERDICT), 1 the engines' rows changed or unread, 2 refused.
import {spawnSync} from 'node:child_process';
import {appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {firstLaneSplitOf, judge, readResults, renderFirstLaneSplit, renderNotJudged} from './native-matrix/summary.mjs';
import {hostedApprove} from './hosted-sittings/approve.mjs';
import {cellCounts, guardTally, renderCounts, renderGuardTally, renderKeyWindowObserved} from './hosted-sittings/counts.mjs';
import {timeFocusProbe} from './hosted-sittings/focus-timing.mjs';
import {pilotReads, renderPilotReads} from './hosted-sittings/pilot-reads.mjs';
import {SITTINGS, sittingContext, sittingPlan} from './hosted-sittings/plan.mjs';
import {baseCheck, baseLayersOf, baseRejudge, HARNESS_PATHS, jobsCheck, lastJudgedOf, renderBaseRejudge, renderJobs, reportFactsOf, reportMoves, renderSourceRun, runJobStops, saveSheetVerdict, sourceRunCheck} from './hosted-sittings/split.mjs';
import {filteredPlan, scenesOf} from './native-matrix/run.mjs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {assertGithubHosted, readRunnerRecord} from './hosted-sittings/runner.mjs';
import {execStep, jobStartedOf, renderSitting, runSitting} from './hosted-sittings/run.mjs';
import {hostedSetup} from './hosted-sittings/setup.mjs';
import {runOnboarding} from './hosted-sittings/onboarding.mjs';
import {keyRouteIo, runKeyRoute} from './hosted-sittings/key-route.mjs';
import {runWitnessTap, witnessTapIo} from './hosted-sittings/witness-tap.mjs';
import {stepSections} from './hosted-sittings/key-route-report.mjs';
import {pinDecision} from './hosted-sittings/pin.mjs';
import {readScreenAtEnd} from './hosted-sittings/display-mode.mjs';
import {textEditGuard} from './hosted-sittings/textedit-guard.mjs';
import {readBackRows, renderReadBack, renderVenue} from './hosted-sittings/venue.mjs';

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
class Usage extends Error {}
const usage = message => { throw new Usage(message); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (path, value) => { mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, json(value)); };

// Sitting E's older Node: the newest Node 22 in the runner's tool cache, as macos-default-selection-hosted.sh finds it.
function olderNode(toolCache = process.env.RUNNER_TOOL_CACHE) {
  const root = toolCache && join(toolCache, 'node');
  if (!root || !existsSync(root)) return null;
  const found = readdirSync(root).filter(v => v.startsWith('22.')).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}))
    .flatMap(v => readdirSync(join(root, v)).map(arch => join(root, v, arch, 'bin', 'node'))).filter(existsSync);
  return found.at(-1) ?? null;
}
const commitOf = () => spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).stdout.trim();

function planOf(sitting, values) {
  if (!SITTINGS.includes(sitting)) usage(`a sitting is one of ${SITTINGS.join(', ')}`);
  if (!values.out) usage('--out <dir> names the sitting\'s output directory (outside this checkout)');
  const out = resolve(values.out);
  const scratch = join(process.env.RUNNER_TEMP ?? dirname(out), 'hosted-sittings-scratch');
  const split = splitOf(sitting, values);
  return sittingPlan(sitting, {...sittingContext(sitting, {record: readRunnerRecord(homedir()), commit: commitOf(), out, scratch, olderNode: olderNode(),
    pilot: values.pilot, flipped: values.flipped}), ...split});
}
// Sitting C split into jobs (ruling 1228, ./hosted-sittings/split.mjs): --split-run <n> [--only <cell>,…] is run job n,
// --split-judge --jobs <dir>,… [--only <cell>,…] [--base <evidence dir> --base-run-id <id>] the judging job (--only: the
// filter its run jobs ran, so it asks for the save-sheet verdict only when they ran that cell). -> {split} or {}.
function splitOf(sitting, values) {
  if (values['split-run'] === undefined && !values['split-judge']) {
    if (values.only !== undefined || values.jobs !== undefined || values.base !== undefined || values['base-run-id'] !== undefined || values['speed-extra']) usage('--only, --speed-extra, --jobs, --base and --base-run-id belong to a split sitting C');
    return {};
  }
  if (sitting !== 'c') usage('only sitting C is split into jobs');
  if (values['split-judge']) {
    if (values['split-run'] !== undefined || values['speed-extra'] || !values.jobs || !/^\d+(,\d+)*$/.test(values.runs ?? '') || Boolean(values.base) !== Boolean(values['base-run-id'])) {
      usage('--split-judge --jobs <dir>,… --runs <n>,… [--only <cell>,…] [--base <evidence dir> --base-run-id <id>]');
    }
    const bases = basesOf(values);
    return {split: {judge: true, jobs: values.jobs.split(',').filter(Boolean).map(d => resolve(d)), runs: values.runs.split(',').map(Number), base: bases ? bases.dirs.join(',') : null,
      ...(bases ? {baseRunId: bases.ids.join(','), ...(bases.dirs.length > 1 ? {baseRecords: bases.layers.flatMap(l => l.records)} : {})} : {}),
      ...(values.only !== undefined ? {only: values.only.split(',').filter(Boolean)} : {})}};
  }
  if (!/^\d+$/.test(values['split-run'])) usage('--split-run <run number>');
  return {split: {run: Number(values['split-run']), ...(values.only !== undefined ? {only: values.only.split(',').filter(Boolean)} : {}), ...(values['speed-extra'] ? {speedExtra: true} : {})}};
}
// The base's layers (ruling 1239, ./hosted-sittings/split.mjs baseLayersOf): --base <dir>,… and --base-run-id <id>,…, one id
// a directory, the full run first. -> {dirs, ids, layers} | null without --base.
function basesOf(values) {
  if (!values.base) return null;
  const dirs = values.base.split(',').filter(Boolean).map(d => resolve(d)), ids = String(values['base-run-id'] ?? '').split(',').filter(Boolean);
  if (dirs.length !== ids.length || !ids.every(id => /^\d+$/.test(id))) usage('--base <dir>,… takes one --base-run-id <id>,… a directory, in the same order');
  let layers;
  try { layers = baseLayersOf(dirs, {list: dir => (existsSync(dir) ? readdirSync(dir) : null)}); } catch (error) { usage(error.message); }
  return {dirs, ids, layers};
}
// Ruling 1248 A(1): the last judged sitting C, as its committed evidence holds it (./hosted-sittings/split.mjs
// lastJudgedOf): every cell record under each docs/evidence/<date>-m5-sitting-c-* directory, whatever its layout.
// Information only: a comparator that cannot be read is said so, never thrown.
const lastJudgedC = () => lastJudgedOf({list: () => readdirSync(join(REPO, 'docs', 'evidence')), resultsOf: name => readResults([join(REPO, 'docs', 'evidence', name)]).results});
// A job's directory as the judge reads it: its matrix records and the hardware the workflow wrote beside its sitting.
// Every record under it (its matrix lanes, save-sheet and speed-extra cells) and its sitting report (sitting.json: the
// run job's save-sheet verdicts, I3).
function jobDir(dir) {
  const {results} = readResults([dir]);
  const readJsonFile = file => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; } };
  return {dir, results, hardware: readJsonFile(join(dirname(dir), 'hardware.json')), report: readJsonFile(join(dir, 'sitting.json'))};
}
// Every result.json under `dir`, relative to it, in path order.
function resultFiles(dir, rel = '') {
  if (!existsSync(join(dir, rel))) return [];
  return readdirSync(join(dir, rel), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => (e.isDirectory() ? resultFiles(dir, rel ? `${rel}/${e.name}` : e.name) : e.name === 'result.json' ? [rel ? `${rel}/${e.name}` : e.name] : []));
}
// H1: the base's committed directory checked against its digests.sha256 and README before anything of it is read.
function baseDirCheck(root, runId) {
  const read = file => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);
  return baseCheck({digests: read('digests.sha256'), readme: read('README.md'), results: resultFiles(root),
    sha: path => (existsSync(join(root, path)) ? createHash('sha256').update(readFileSync(join(root, path))).digest('hex') : null)}, {runId});
}
// R1 (ruling 1230): the base's records judged by this commit's judge and by the judge of the commit that ran them (the
// tree of that commit, extracted from this checkout's history), cell by cell. -> exit 0, or 2 when a cell reads
// differently that no declaration of this commit explains (ruling 1234, ./hosted-sittings/split.mjs baseRejudge), or the
// base names no one commit.
// Ruling 1239: a layered base (the full run's directory, then each judged rerun's) is rebuilt from its layers' raw
// records, on each side by that side's own combine (`native-matrix.mjs combine` of the base's judging commit, and of this
// one), never read from the combined result a judge left; its judging commit is its last layer's (that judge-only
// dispatch's source-run.json `judging`, else the one commit its run jobs' records name).
const matrixCommits = results => [...new Set(results.filter(r => r.result.cell === 'matrix').map(r => r.result.meta?.commit).filter(Boolean))];
function judgingCommitOf(layer) {
  const file = join(layer.dir, 'sitting', 'source-run.json');
  if (existsSync(file)) { const judging = JSON.parse(readFileSync(file, 'utf8')).judging; if (typeof judging === 'string' && judging) return [judging]; }
  return matrixCommits(readResults(layer.records).results);
}
// The cells of `root`'s judge over the base: its records as they are, or for a layered base the combine of `root` over
// the layers' records first, its problems the judge's missing proof as the matrix CLI's judges take them. -> [cell].
// One tree's judgment of the base: its cells, and its report-level facts (ruling 1248 C) read with that tree's own
// composing-retries renderer. -> {cells, facts}.
async function judgedBase(root, records, layered) {
  const {judge: judgeOf, readResults: readOf} = await import(pathToFileURL(join(root, 'scripts', 'native-matrix', 'summary.mjs')).href);
  const {renderComposingRetries} = await import(pathToFileURL(join(root, 'scripts', 'native-matrix', 'composing-retries.mjs')).href);
  const judged = j => ({cells: j.cells, facts: reportFactsOf(j, {renderComposingRetries})});
  if (!layered) { const read = readOf(records); return judged(judgeOf(read.results, read.problems)); }
  const out = mkdtempSync(join(tmpdir(), 'cua-base-combined-'));
  try {
    const combined = spawnSync(process.execPath, ['scripts/native-matrix.mjs', 'combine', ...records, '--out', out], {cwd: root, encoding: 'utf8'});
    if (![0, 4].includes(combined.status)) throw new Error(`combine at ${root} failed (exit ${combined.status}): ${(combined.stderr || combined.stdout).trim().slice(-300)}`);
    const read = readOf([out]), account = JSON.parse(readFileSync(join(out, 'combined.json'), 'utf8'));
    return judged(judgeOf(read.results, [...read.problems, ...(account.problems ?? []).map(p => `combine: ${p}`)]));
  } finally { rmSync(out, {recursive: true, force: true}); }
}
async function rejudgeBase(roots, outFile) {
  const layers = baseLayersOf(roots, {list: dir => (existsSync(dir) ? readdirSync(dir) : null)}), layered = layers.length > 1, records = layers.flatMap(l => l.records);
  const commits = layered ? judgingCommitOf(layers.at(-1)) : matrixCommits(readResults(records).results);
  const names = layers.map(l => l.dir);
  let report;
  if (commits.length !== 1) report = {at: null, layers: names, differences: [], refused: [`the base's ${layered ? 'last layer names' : 'matrix records name'} ${commits.length ? `more than one commit (${commits.join(', ')})` : 'no commit'}: it has no one judge of its own`]};
  else {
    const tree = mkdtempSync(join(tmpdir(), 'cua-base-judge-')), tar = join(tree, 'tree.tar');
    try {
      const archived = spawnSync('git', ['archive', '--format=tar', '-o', tar, commits[0]], {cwd: REPO, encoding: 'utf8'});
      if (archived.status !== 0) throw new Error(`git archive ${commits[0]} failed: ${archived.stderr.trim()}`);
      const extracted = spawnSync('tar', ['-xf', tar, '-C', tree], {encoding: 'utf8'});
      if (extracted.status !== 0) throw new Error(`tar failed: ${extracted.stderr.trim()}`);
      rmSync(tar);
      if (existsSync(join(REPO, 'node_modules'))) symlinkSync(join(REPO, 'node_modules'), join(tree, 'node_modules'));
      const was = await judgedBase(tree, records, layered), now = await judgedBase(REPO, records, layered);
      report = {at: commits[0], ...(layered ? {layers: names} : {}), ...baseRejudge(was.cells, now.cells), reportMoves: reportMoves(was.facts, now.facts)};
    } finally { rmSync(tree, {recursive: true, force: true}); }
  }
  writeJson(outFile, report);
  process.stdout.write(renderBaseRejudge(report).join('\n'));
  return report.refused.length ? 2 : 0;
}

async function runCommand(sitting, values) {
  assertGithubHosted(process.env, process.platform, `sitting ${sitting}`);
  const plan = planOf(sitting, values);
  const out = resolve(values.out);
  for (const dir of [join(process.env.RUNNER_TEMP, 'hosted-sittings-scratch'), ...plan.scratchDirs]) mkdirSync(dir, {recursive: true});
  mkdirSync(out, {recursive: true});
  const finished = [];
  const report = await runSitting(plan, {out, exec: (step, {logPath}) => execStep(step, {logPath, cwd: REPO}),
    keep: (from, to) => { mkdirSync(dirname(to), {recursive: true}); copyFileSync(resolve(REPO, from), to); }, exists: path => existsSync(resolve(REPO, path)),
    readJson: path => { try { return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')); } catch { return null; } }, remove: path => rmSync(resolve(REPO, path), {force: true}),
    // The job's start (the workflow's M5_JOB_STARTED, epoch seconds), and after each step a partial sitting.md, so a
    // sitting the job's limit cuts short still leaves each finished step's wall time in the uploaded artifact.
    jobStartedMs: jobStartedOf(process.env), onStep: entry => {
      finished.push(entry);
      // Written whole, then renamed over the last, so the artifact never holds a half-written report.
      const partial = join(out, '.sitting.md.partial');
      writeFileSync(partial, renderSitting({...plan, steps: finished, verdict: 'IN PROGRESS', exit: '-', wall: entry.wall}));
      renameSync(partial, join(out, 'sitting.md'));
    }});
  const parts = [renderSitting(report)];
  // I3 of the split review: a run job fails only on a harness or infrastructure stop; its verdicts ride in sitting.md
  // and sitting.json to the judging job.
  const stops = plan.split && !plan.split.judge ? runJobStops(report) : null;
  if (stops) parts.push('## The run job (ruling 1228)', '', stops.length ? `Stopped: ${stops.map(s => `${s.id} ${s.status}${s.reason ? ` (${s.reason})` : ''}`).join('; ')}: re-run this job.`
    : 'No harness or infrastructure stop: the job passes; its verdicts above go to the judging job.', '');
  if (plan.counts.length) {
    const {results, problems} = readResults(plan.counts.filter(existsSync));
    const counts = renderCounts(cellCounts(results));
    writeFileSync(join(out, 'counts.md'), counts);
    parts.push('## Per-cell counts', '', counts, ...(problems.length ? ['Unread results: ' + problems.join('; '), ''] : []));
    // What the judge leaves out of the verdict, each with its reason and its ticket or evidence (ruling 1222).
    parts.push(...renderNotJudged(judge(results, problems)));
    // Every failed and no-verdict sample of every run, the save-sheet's included, by the lane that ran first (ruling 1226).
    parts.push(...renderFirstLaneSplit(firstLaneSplitOf(results)));
    if (plan.pilotReads) {
      const timingFile = join(out, 'focus-timing.json');
      const reads = renderPilotReads(pilotReads(results, {focusTiming: existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, 'utf8')) : null}));
      writeFileSync(join(out, 'pilot-reads.md'), reads);
      parts.push(reads);
    }
  }
  // The judging job's run jobs (ruling 1228): each one's runner, hardware and scenes, every attempt the workflow found,
  // the base re-judged (ruling 1230), and the refusal, when there was one. A record that cannot be read is said.
  for (const [file, render] of [['attempts.md', null], ['source-run.json', renderSourceRun], ['jobs.json', renderJobs], ['base-rejudge.json', renderBaseRejudge]]) {
    const path = join(out, file);
    if (!existsSync(path)) continue;
    try { parts.push(...(render ? render(JSON.parse(readFileSync(path, 'utf8'))) : [readFileSync(path, 'utf8'), ''])); } catch (error) { parts.push(`${file} could not be read: ${error.message}`, ''); }
  }
  // The alert guard's tally (rulings 1154, 1160, 1164): per step and cell, its refusals and the key cells sent with
  // their key reading not taken, from every record the plan names.
  const readRecord = path => { try { return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')); } catch { return null; } };
  const records = plan.steps.flatMap(step => [step.record, ...(step.records ?? [])].filter(Boolean).map(path => ({step: step.id, record: readRecord(path)})));
  const tally = guardTally(records);
  parts.push('## The alert guard', '', renderGuardTally(tally));
  // The venue setup wrote into the runner's record (ruling 1169): its key-window reader's grant, read over the loopback
  // ssh, says with the tally whether the key-window requirement was observed or vacuous (recorded check 3); TextEdit's
  // and the Open panel's read-backs say where they actually stood (recorded checks 1 and 2).
  const venue = readRunnerRecord(homedir())?.venue ?? null;
  parts.push(renderKeyWindowObserved(venue?.keyWindowTrust ?? null, tally), renderReadBack(readBackRows(records, venue)));
  // The cleanup's record (rulings 1160, 1164): the alert windows (number, layer, bounds) and the display's mode as they
  // stand once every step ran, so the alerts' survival and the mode's hold through the sitting are shown.
  const screenAtEnd = readScreenAtEnd();
  parts.push('## The screen at the end', '', `${screenAtEnd.alerts ? `${screenAtEnd.alerts.length} alert window${screenAtEnd.alerts.length === 1 ? '' : 's'}` : 'the window list unread'}; `
    + `the display ${screenAtEnd.mode ? `${screenAtEnd.mode.width}x${screenAtEnd.mode.height} (mode ${screenAtEnd.mode.modeId})` : 'unread'}${screenAtEnd.modeHeld === false ? ', NOT the mode setup set' : ''}.`, '');
  // The venue (ruling 1169): every scene frame on this runner that differs from the mini's, why, and the cells resting on it,
  // as setup wrote it into the runner's record (the same block each lane's meta keeps).
  parts.push(renderVenue(venue));
  // A diagnostic's own section (C's key-route, ruling 1198), as it wrote it; one it did not write is named.
  parts.push(...stepSections(plan.steps, report, {read: path => (existsSync(path) ? readFileSync(path, 'utf8') : null)}));
  writeJson(join(out, 'sitting.json'), {...report, screenAtEnd, venue, ...(stops ? {runJobStops: stops} : {})});
  writeFileSync(join(out, 'sitting.md'), parts.join('\n'));
  process.stdout.write(parts.join('\n'));
  return stops ? (stops.length ? 1 : 0) : report.exit;
}

// The scratch document up, its windows then placed clear of replayd's alerts from a fresh reading (rulings 1160, 1164;
// scripts/hosted-sittings/textedit-guard.mjs), the placement printed and kept at --record. A placement that could not
// be read or made is recorded, and nothing here refuses. What guards each later step that binds this document: verify
// --bind, only its own checks (the app running with a window on screen, the approvals asked; no alert reading);
// #216's approval cycles, TextEdit activated and front and key before each bind and a system prompt in front or key
// around it NO VERDICT (rulings 1136, 1141; scripts/approval-cycles.mjs); T3b's onboarding, the same around each cell
// and its capture cell under the shared capture rule (scripts/hosted-sittings/onboarding.mjs captureRefusal).
// accept-native's own fixture document is placed and guarded by accept-native (scripts/accept/textedit.mjs).
async function textedit(action, values) {
  assertGithubHosted(process.env, process.platform, 'the scratch TextEdit document');
  if (action === 'down') { spawnSync('pkill', ['-x', 'TextEdit']); return 0; }
  if (action !== 'up' || !values.file) usage('textedit up --file <path> [--record <file>] | textedit down');
  mkdirSync(dirname(values.file), {recursive: true});
  if (!existsSync(values.file)) writeFileSync(values.file, 'cua hosted sitting: scratch document\n');
  if (spawnSync('open', ['-a', 'TextEdit', values.file]).status !== 0) return 1;
  for (let i = 0; i < 30; i++) {
    if (spawnSync('pgrep', ['-x', 'TextEdit']).status === 0) {
      spawnSync('sleep', ['2']);
      let placement;
      try { placement = await textEditGuard().place(); } catch (error) { placement = {error: error.message}; }
      // The venue its frames were read against (ruling 1169): TextEdit sized by its own preferences, setup's.
      const venue = readRunnerRecord(homedir())?.venue ?? null;
      process.stdout.write(json({placement}));
      if (values.record) writeJson(values.record, {placement, venue});
      return 0;
    }
    spawnSync('sleep', ['1']);
  }
  return 1;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {
    out: {type: 'string'}, pilot: {type: 'boolean', default: false}, flipped: {type: 'boolean', default: false}, 'engine-archive': {type: 'string'},
    report: {type: 'string'}, 'split-run': {type: 'string'}, 'split-judge': {type: 'boolean', default: false}, 'speed-extra': {type: 'boolean', default: false}, 'base-run-id': {type: 'string'}, 'jobs-file': {type: 'string'}, runs: {type: 'string'}, only: {type: 'string'}, jobs: {type: 'string'}, base: {type: 'string'},
    'approved-engine': {type: 'string'}, 'approved-runtime': {type: 'string'}, sitting: {type: 'string'}, file: {type: 'string'}, samples: {type: 'string'}, commit: {type: 'string'}, 'env-file': {type: 'string'}, record: {type: 'string'},
    source: {type: 'string'}, 'run-id': {type: 'string'}, attempt: {type: 'string'}, repo: {type: 'string'}}});
  switch (command) {
    case 'setup': {
      const report = await hostedSetup({checkout: REPO, commit: commitOf(), engineArchive: values['engine-archive'] ? resolve(values['engine-archive']) : null, home: homedir(),
        exec: (cmd, args, options) => spawnSync(cmd, args, {encoding: 'utf8', cwd: REPO, ...options})});
      if (values.report) writeJson(resolve(values.report), report);
      process.stdout.write(json({ok: report.ok, steps: report.steps, approved: report.approved, approve: report.approve?.summary ?? null}));
      return report.ok ? 0 : 1;
    }
    case 'pin-decision': {
      const pin = pinDecision(values.commit ? {commit: values.commit} : {});
      const lines = Object.entries(pin.env).map(([key, value]) => `${key}=${value}\n`).join('');
      if (values['env-file']) appendFileSync(values['env-file'], lines);
      process.stdout.write(lines);
      return 0;
    }
    case 'approve': {
      // Never exit 1 here: sitting E's approved lane expects its judge's FAIL (exit 1) before the flip, and its script
      // passes this command's status through; an approval that could not happen is 3 (2 refused), never that FAIL.
      let report;
      try { report = await hostedApprove({env: process.env, home: process.env.HOME ?? homedir()}); } catch (error) {
        if (/refused/.test(error.message)) throw error;
        process.stderr.write(`hosted-sittings: not approved: ${error.message}\n`);
        return 3;
      }
      process.stdout.write(json(report));
      return report.approved ? 0 : 3;
    }
    case 'run': return runCommand(positionals[0], values);
    case 'plan': process.stdout.write(json(planOf(positionals[0], values))); return 0;
    case 'counts': {
      if (!positionals.length) usage('counts <result dir>...');
      const {results, problems} = readResults(positionals.map(p => resolve(p)));
      process.stdout.write(renderCounts(cellCounts(results)));
      for (const problem of problems) process.stderr.write(`hosted-sittings: unread: ${problem}\n`);
      return 0;
    }
    case 'focus-timing': {
      assertGithubHosted(process.env, process.platform, 'the focus probe\'s timing');
      if (!values['approved-engine'] || !values.out) usage('focus-timing --approved-engine <bundle> --out <file>');
      const timing = timeFocusProbe({bundle: values['approved-engine'], samples: Number(values.samples ?? 5)});
      writeJson(resolve(values.out), timing);
      process.stdout.write(json(timing));
      return timing.answered ? 0 : 1;
    }
    case 'textedit': return textedit(positionals[0], values);
    case 'source-run': {
      // Ruling 1234: a judge-only dispatch's source run, checked before anything of it is judged (exit 2 refuses).
      if (!values.jobs || !values.source || !/^\d+$/.test(values['run-id'] ?? '') || !/^\d+$/.test(values.attempt ?? '') || !/^[0-9a-f]{40}$/.test(values.commit ?? '') || !values.repo
        || !/^\d+(,\d+)*$/.test(values.runs ?? '') || values.only === undefined || !values.out) {
        usage('source-run --jobs <dir>,… --source <dir> --run-id <id> --attempt <n> --commit <full sha> --repo <owner/name> --runs <n>,… --only <filter> [--speed-extra] --out <file>');
      }
      const read = file => JSON.parse(readFileSync(join(resolve(values.source), file), 'utf8'));
      const pages = (file, key) => [read(file)].flat().flatMap(page => page[key] ?? []);
      const diffed = spawnSync('git', ['diff', '--quiet', values.commit, 'HEAD', '--', ...HARNESS_PATHS], {cwd: REPO, encoding: 'utf8'});
      const diff = {clean: diffed.status === 0, ...(diffed.status !== 0 && diffed.status !== 1 ? {error: (diffed.stderr || diffed.error?.message || 'git diff failed').trim()} : {})};
      const picked = values.jobs.split(',').filter(Boolean).map(d => ({name: basename(dirname(resolve(d))), results: jobDir(resolve(d)).results}));
      const check = sourceRunCheck({run: read('run.json'), jobs: pages('jobs.json', 'jobs'), artifacts: pages('artifacts.json', 'artifacts'), picked,
        pin: {runId: values['run-id'], attempt: values.attempt, commit: values.commit, repo: values.repo},
        inputs: {runs: values.runs.split(',').map(Number), only: values.only.split(',').filter(Boolean), speedExtra: values['speed-extra']},
        resolveFilter: ids => filteredPlan(ids).only, diff, judging: commitOf()});
      writeJson(resolve(values.out), check);
      process.stdout.write(renderSourceRun(check).join('\n'));
      return check.refused.length ? 2 : 0;
    }
    case 'jobs-check': {
      // Ruling 1228: the run jobs' records, refused when they are not one harness and one pair of engines (exit 2). The
      // base (H1) is its committed evidence directory, read only once its digests and README check.
      if (!values.jobs || !values.out || Boolean(values.base) !== Boolean(values['base-run-id'])) usage('jobs-check --jobs <dir>,… [--base <evidence dir>,… --base-run-id <id>,…] --out <file>');
      const bases = basesOf(values), unfit = bases ? bases.dirs.flatMap((dir, i) => baseDirCheck(dir, bases.ids[i])) : [];
      const jobs = values.jobs.split(',').filter(Boolean).map(d => jobDir(resolve(d)));
      const full = bases ? jobDir(bases.layers[0].records[0]) : null;
      let check = unfit.length ? {refused: unfit, jobs: [], base: null} : jobsCheck(jobs, {base: full, scenesOf, ...(bases ? {} : {lastJudged: lastJudgedC()})});
      // Ruling 1239: each rerun layer's run jobs, checked against the full run beneath them as their own judge checked them.
      if (!unfit.length && bases?.layers.length > 1) {
        const layers = bases.layers.slice(1).map((layer, i) => ({dir: layer.dir, runId: bases.ids[i + 1], ...jobsCheck(layer.records.map(jobDir), {base: full, scenesOf})}));
        check = {...check, refused: [...check.refused, ...layers.flatMap(l => l.refused.map(why => `the base layer ${l.dir} (run ${l.runId}): ${why}`))],
          layers: layers.map(({dir, runId, jobs: layerJobs}) => ({dir, runId, jobs: layerJobs}))};
      }
      writeJson(resolve(values.out), {...check, ...(bases ? {baseDir: bases.dirs.join(','), baseRunId: bases.ids.join(',')} : {})});
      process.stdout.write(json(check));
      return check.refused.length ? 2 : 0;
    }
    case 'save-sheet-verdicts': {
      // I3: the run jobs' save-sheet verdicts, as jobs-check read them from each job's sitting report, for every run asked.
      if (!values['jobs-file'] || !/^\d+(,\d+)*$/.test(values.runs ?? '')) usage('save-sheet-verdicts --jobs-file <jobs.json> --runs <n>,…');
      const {verdict, lines} = saveSheetVerdict(JSON.parse(readFileSync(resolve(values['jobs-file']), 'utf8')), {runs: values.runs.split(',').map(Number)});
      process.stdout.write(`${lines.join('\n')}\nVERDICT: ${verdict}\n`);
      return {PASS: 0, FAIL: 1, OWNER: 3, 'NO VERDICT': 4}[verdict];
    }
    case 'rejudge-base': {
      if (!values.base || !values.out) usage('rejudge-base --base <evidence dir>,… --out <file>');
      return rejudgeBase(values.base.split(',').filter(Boolean).map(d => resolve(d)), resolve(values.out));
    }
    case 'key-route': {
      // Refused off a GitHub-hosted runner inside, before anything is read, built, written or opened.
      if (!values['approved-runtime'] || !values['approved-engine'] || !values.sitting || !values.out) usage('key-route --approved-runtime <home> --approved-engine <bundle> --sitting <id> --out <dir>');
      const options = {approvedRuntime: resolve(values['approved-runtime']), approvedEngine: resolve(values['approved-engine']), sitting: values.sitting, out: resolve(values.out)};
      return runKeyRoute(options, keyRouteIo(options));
    }
    case 'witness-tap': {
      // Refused off a GitHub-hosted runner inside, before anything is read, built or granted.
      if (!values.out) usage('witness-tap --out <file>');
      return runWitnessTap({out: resolve(values.out)}, witnessTapIo({write: (path, text) => { mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, text); }}));
    }
    case 'onboarding': {
      if (!values.out) usage('onboarding --out <file>');
      // Saved after every stage and before cleanup (the driver's `save`), so a cleanup that never ends loses nothing.
      const out = resolve(values.out);
      const record = await runOnboarding({save: partial => writeJson(out, partial)});
      writeJson(out, record);
      await new Promise(done => process.stdout.write(json({complete: record.complete, problem: record.problem, cleanup: record.cleanup, stages: record.stages.map(stage => stage.id)}), done));
      return record.complete ? 0 : 1;
    }
    default: usage('setup | pin-decision | approve | run <sitting> | plan <sitting> | counts <dir>... | focus-timing | textedit up|down | onboarding | key-route | witness-tap (see this file\'s header)');
  }
  return 2;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  process.stderr.write(`hosted-sittings: ${error.message}\n`);
  process.exitCode = error instanceof Usage || /refused/.test(error.message) ? 2 : 1;
});
