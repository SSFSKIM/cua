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
//   node scripts/hosted-sittings.mjs run c --out <dir> --split-run <n> [--only <cell>,…]
//   node scripts/hosted-sittings.mjs run c --out <dir> --split-judge --jobs <dir>,… [--base <dir>]
//       Sitting C split into jobs (ruling 1228, scripts/hosted-sittings/split.mjs): run job n (its own pair, its run's
//       save-sheet steps; --only the cells a filtered rerun needs, textedit/intervention.saveSheet for #212's), and the
//       judging job over the run jobs' sitting dirs (a full run's beneath filtered reruns): jobs-check, combine, judge,
//       key-route. `plan` takes the same options.
//   node scripts/hosted-sittings.mjs jobs-check --jobs <dir>,… [--base <dir>] --out <file>
//       The run jobs' records, each with the hardware.json beside its dir: exit 2 when they are not one harness commit
//       and one pair of engine versions (or two jobs ran one run), 0 otherwise; `run` lists the jobs in sitting.md.
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
import {appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {firstLaneSplitOf, judge, readResults, renderFirstLaneSplit, renderNotJudged} from './native-matrix/summary.mjs';
import {hostedApprove} from './hosted-sittings/approve.mjs';
import {cellCounts, guardTally, renderCounts, renderGuardTally, renderKeyWindowObserved} from './hosted-sittings/counts.mjs';
import {timeFocusProbe} from './hosted-sittings/focus-timing.mjs';
import {pilotReads, renderPilotReads} from './hosted-sittings/pilot-reads.mjs';
import {SITTINGS, sittingContext, sittingPlan} from './hosted-sittings/plan.mjs';
import {jobsCheck, renderJobs} from './hosted-sittings/split.mjs';
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
// --split-judge --jobs <dir>,… [--base <dir>] the judging job. -> {split} or {}.
function splitOf(sitting, values) {
  if (values['split-run'] === undefined && !values['split-judge']) {
    if (values.only !== undefined || values.jobs !== undefined || values.base !== undefined) usage('--only, --jobs and --base belong to a split sitting C');
    return {};
  }
  if (sitting !== 'c') usage('only sitting C is split into jobs');
  if (values['split-judge']) {
    if (values['split-run'] !== undefined || values.only !== undefined || !values.jobs) usage('--split-judge --jobs <dir>,… [--base <dir>]');
    return {split: {judge: true, jobs: values.jobs.split(',').filter(Boolean).map(d => resolve(d)), base: values.base ? resolve(values.base) : null}};
  }
  if (!/^\d+$/.test(values['split-run'])) usage('--split-run <run number>');
  return {split: {run: Number(values['split-run']), ...(values.only !== undefined ? {only: values.only.split(',').filter(Boolean)} : {})}};
}
// A job's directory as the judge reads it: its matrix records and the hardware the workflow wrote beside its sitting.
function jobDir(dir) {
  const {results} = readResults(['vendor', 'cua'].map(d => join(dir, d)).filter(existsSync));
  const file = join(dirname(dir), 'hardware.json');
  let hardware = null;
  try { hardware = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { hardware = null; }
  return {dir, results, hardware};
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
  // The judging job's run jobs (ruling 1228): each one's runner and hardware, and the refusal, when there was one.
  const jobsFile = join(out, 'jobs.json');
  if (existsSync(jobsFile)) { try { parts.push(...renderJobs(JSON.parse(readFileSync(jobsFile, 'utf8')))); } catch {} }
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
  writeJson(join(out, 'sitting.json'), {...report, screenAtEnd, venue});
  writeFileSync(join(out, 'sitting.md'), parts.join('\n'));
  process.stdout.write(parts.join('\n'));
  return report.exit;
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
    report: {type: 'string'}, 'split-run': {type: 'string'}, 'split-judge': {type: 'boolean', default: false}, only: {type: 'string'}, jobs: {type: 'string'}, base: {type: 'string'},
    'approved-engine': {type: 'string'}, 'approved-runtime': {type: 'string'}, sitting: {type: 'string'}, file: {type: 'string'}, samples: {type: 'string'}, commit: {type: 'string'}, 'env-file': {type: 'string'}, record: {type: 'string'}}});
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
    case 'jobs-check': {
      // Ruling 1228: the run jobs' records, refused when they are not one harness and one pair of engines (exit 2).
      if (!values.jobs || !values.out) usage('jobs-check --jobs <dir>,… [--base <dir>] --out <file>');
      const check = jobsCheck(values.jobs.split(',').filter(Boolean).map(d => jobDir(resolve(d))), {base: values.base ? jobDir(resolve(values.base)) : null});
      writeJson(resolve(values.out), check);
      process.stdout.write(json(check));
      return check.refused.length ? 2 : 0;
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
