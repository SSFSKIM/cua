#!/usr/bin/env node
// M5's hosted sittings (#117 M5, T10b′; docs/evidence/2026-11-23-own-native-engine/hosted.md): each sitting, A to F, is
// one job on a GitHub-hosted macOS runner (.github/workflows/m5-sittings.yml), both engines on one machine with their
// lanes alternating. Everything that changes the machine refuses unless RUNNER_ENVIRONMENT=github-hosted on macOS; the
// plan and counts read only.
//
//   node scripts/hosted-sittings.mjs setup [--engine-archive <tgz>] [--report <file>]
//       The runner's setup in H0's order (scripts/hosted-sittings/setup.mjs): the loopback device, the harness checkout,
//       the run's install and engine, the system-database TCC rows, the relaunch and the two-pass approve, the record.
//       Exit 0 ready, 1 a step failed, 2 refused.
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
//   node scripts/hosted-sittings.mjs plan <a..f> --out <dir> [--pilot] [--flipped]     the steps, as JSON; runs nothing
//   node scripts/hosted-sittings.mjs counts <dir>...                                   per-cell counts of result dirs
//   node scripts/hosted-sittings.mjs focus-timing --approved-engine <bundle> --out <file>   the focus probe's cost
//   node scripts/hosted-sittings.mjs textedit up --file <path> | down                  sitting D's scratch document
//   node scripts/hosted-sittings.mjs onboarding --out <file>
//       T3b's staged onboarding, sitting D's last step (scripts/hosted-sittings/onboarding.mjs): cua's engine's TCC rows
//       set stage by stage, a relaunch at each, the product's answers recorded to <file>, which the sitting's check judges
//       (scripts/hosted-sittings/onboarding-judge.mjs). Exit 0 every stage ran, 1 the run stopped (recorded), 2 refused.
import {spawnSync} from 'node:child_process';
import {appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {readResults} from './native-matrix/summary.mjs';
import {hostedApprove} from './hosted-sittings/approve.mjs';
import {cellCounts, renderCounts} from './hosted-sittings/counts.mjs';
import {timeFocusProbe} from './hosted-sittings/focus-timing.mjs';
import {pilotReads, renderPilotReads} from './hosted-sittings/pilot-reads.mjs';
import {SITTINGS, sittingContext, sittingPlan} from './hosted-sittings/plan.mjs';
import {assertGithubHosted, readRunnerRecord} from './hosted-sittings/runner.mjs';
import {execStep, renderSitting, runSitting} from './hosted-sittings/run.mjs';
import {hostedSetup} from './hosted-sittings/setup.mjs';
import {runOnboarding} from './hosted-sittings/onboarding.mjs';
import {pinDecision} from './hosted-sittings/pin.mjs';

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
  return sittingPlan(sitting, sittingContext(sitting, {record: readRunnerRecord(homedir()), commit: commitOf(), out, scratch, olderNode: olderNode(),
    pilot: values.pilot, flipped: values.flipped}));
}

async function runCommand(sitting, values) {
  assertGithubHosted(process.env, process.platform, `sitting ${sitting}`);
  const plan = planOf(sitting, values);
  const out = resolve(values.out);
  for (const dir of [join(process.env.RUNNER_TEMP, 'hosted-sittings-scratch'), ...plan.scratchDirs]) mkdirSync(dir, {recursive: true});
  const report = await runSitting(plan, {out, exec: (step, {logPath}) => execStep(step, {logPath, cwd: REPO}),
    keep: (from, to) => { mkdirSync(dirname(to), {recursive: true}); copyFileSync(resolve(REPO, from), to); }, exists: path => existsSync(resolve(REPO, path)),
    readJson: path => { try { return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')); } catch { return null; } }, remove: path => rmSync(resolve(REPO, path), {force: true})});
  const parts = [renderSitting(report)];
  if (plan.counts.length) {
    const {results, problems} = readResults(plan.counts.filter(existsSync));
    const counts = renderCounts(cellCounts(results));
    writeFileSync(join(out, 'counts.md'), counts);
    parts.push('## Per-cell counts', '', counts, ...(problems.length ? ['Unread results: ' + problems.join('; '), ''] : []));
    if (plan.pilotReads) {
      const timingFile = join(out, 'focus-timing.json');
      const reads = renderPilotReads(pilotReads(results, {focusTiming: existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, 'utf8')) : null}));
      writeFileSync(join(out, 'pilot-reads.md'), reads);
      parts.push(reads);
    }
  }
  writeJson(join(out, 'sitting.json'), report);
  writeFileSync(join(out, 'sitting.md'), parts.join('\n'));
  process.stdout.write(parts.join('\n'));
  return report.exit;
}

function textedit(action, values) {
  assertGithubHosted(process.env, process.platform, 'the scratch TextEdit document');
  if (action === 'down') { spawnSync('pkill', ['-x', 'TextEdit']); return 0; }
  if (action !== 'up' || !values.file) usage('textedit up --file <path> | textedit down');
  mkdirSync(dirname(values.file), {recursive: true});
  if (!existsSync(values.file)) writeFileSync(values.file, 'cua hosted sitting: scratch document\n');
  if (spawnSync('open', ['-a', 'TextEdit', values.file]).status !== 0) return 1;
  for (let i = 0; i < 30; i++) {
    if (spawnSync('pgrep', ['-x', 'TextEdit']).status === 0) { spawnSync('sleep', ['2']); return 0; }
    spawnSync('sleep', ['1']);
  }
  return 1;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {
    out: {type: 'string'}, pilot: {type: 'boolean', default: false}, flipped: {type: 'boolean', default: false}, 'engine-archive': {type: 'string'},
    report: {type: 'string'}, 'approved-engine': {type: 'string'}, file: {type: 'string'}, samples: {type: 'string'}, commit: {type: 'string'}, 'env-file': {type: 'string'}}});
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
    case 'onboarding': {
      if (!values.out) usage('onboarding --out <file>');
      // Saved after every stage and before cleanup (the driver's `save`), so a cleanup that never ends loses nothing.
      const out = resolve(values.out);
      const record = await runOnboarding({save: partial => writeJson(out, partial)});
      writeJson(out, record);
      await new Promise(done => process.stdout.write(json({complete: record.complete, problem: record.problem, cleanup: record.cleanup, stages: record.stages.map(stage => stage.id)}), done));
      // A session whose close was abandoned may keep its child, and so this process, alive: exit with the record written.
      if (record.cleanup?.stuck) process.exit(record.complete ? 0 : 1);
      return record.complete ? 0 : 1;
    }
    default: usage('setup | pin-decision | approve | run <sitting> | plan <sitting> | counts <dir>... | focus-timing | textedit up|down | onboarding (see this file\'s header)');
  }
  return 2;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  process.stderr.write(`hosted-sittings: ${error.message}\n`);
  process.exitCode = error instanceof Usage || /refused/.test(error.message) ? 2 : 1;
});
