// The hosted runner's attestation (#117 M5, T10b′; the M4/M5 pre-flight §9 "Three attested runs per side, same
// machine"): on a GitHub-hosted runner "the same machine" is one job's virtual machine and "the approved engine" is the
// run's own ad hoc build, so the facts that named the mini's hardware and the owner's approved runtime are, here, the
// image, the run and its attempt, the run's install and its engine build.
//
// The runner's setup (scripts/hosted-sittings.mjs setup) writes this record on the device, the runner itself reached as
// `hosted-macos` over loopback, once the run's install is approved: RUNNER_RECORD_IN_HOME under the account's home. The
// harnesses' preflight reads it on the device (scripts/native-baseline/remote.mjs preflightScript `runner`), and
// hostedRunOf decides meta.hosted from the device's record and the controller's environment together, refusing
// whenever they disagree, so a run is never marked hosted by one side alone.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const RUNNER_RECORD_IN_HOME = '.local/share/cua-hosted/runner.json';
export const runnerRecordPath = (home = homedir()) => join(home, RUNNER_RECORD_IN_HOME);
// The device's record as the preflight reads it: null when there is none (a Mac that is not a hosted runner), the
// parsed record, or {error} when one is there but unreadable (which hostedRunOf refuses, never reads as "not hosted").
export function readRunnerRecord(home = homedir()) {
  let text;
  try { text = readFileSync(runnerRecordPath(home), 'utf8'); } catch (error) { return error.code === 'ENOENT' ? null : {error: `unreadable (${error.code ?? error.message})`}; }
  try { return JSON.parse(text); } catch { return {error: 'not JSON'}; }
}

// Whether this process runs on a GitHub-hosted macOS runner, the only place the hosted kit may change anything.
export const isGithubHosted = (env = process.env, platform = process.platform) => env.RUNNER_ENVIRONMENT === 'github-hosted' && platform === 'darwin';
export function assertGithubHosted(env = process.env, platform = process.platform, what = 'the hosted kit') {
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error(`${what}: refused: it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner's`);
  if (platform !== 'darwin') throw new Error(`${what}: refused: it runs only on a GitHub-hosted macOS runner`);
}

const text = value => typeof value === 'string' && value.length > 0;
const digits = value => typeof value === 'string' && /^\d+$/.test(value);
const absolute = value => typeof value === 'string' && /^\/[^\0\n]*$/.test(value);
// What keeps `record` from being a hosted runner's record. -> [field: problem].
export function runnerProblems(record) {
  const r = record && typeof record === 'object' ? record : {};
  return [
    r.kind === 'github-hosted' ? null : 'kind: not github-hosted',
    text(r.image?.name) ? null : 'image.name: missing',
    text(r.image?.version) ? null : 'image.version: missing',
    digits(r.run?.id) ? null : 'run.id: not a run id',
    digits(r.run?.attempt) ? null : 'run.attempt: not an attempt number',
    absolute(r.install?.home) ? null : 'install.home: not an absolute path',
    text(r.install?.release) ? null : 'install.release: missing',
    absolute(r.engine?.bundle) ? null : 'engine.bundle: not an absolute path',
    text(r.engine?.build) ? null : 'engine.build: missing',
    text(r.engine?.engineVersion) ? null : 'engine.engineVersion: missing',
  ].filter(Boolean);
}

// The record of this job, from its own environment and the run's install (CUA_HOME, its runtime release) and approved
// engine (the bundle, its build and version). -> record; throws on a field it cannot fill.
export function runnerRecord(env, {install, engine, now = Date.now}) {
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('a hosted-runner record is written only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted)');
  const record = {kind: 'github-hosted', image: {name: env.ImageOS ?? null, version: env.ImageVersion ?? null}, run: {id: env.GITHUB_RUN_ID ?? null, attempt: env.GITHUB_RUN_ATTEMPT ?? null},
    install: {home: install?.home ?? null, release: install?.release ?? null},
    engine: {bundle: engine?.bundle ?? null, build: engine?.build ?? null, engineVersion: engine?.engineVersion ?? null}, writtenAt: new Date(now()).toISOString()};
  const problems = runnerProblems(record);
  if (problems.length) throw new Error(`the hosted-runner record cannot be written: ${problems.join('; ')}`);
  return record;
}

// The run a record names: what makes two runs one machine (one job's VM, one image).
export const runnerKey = r => `${r.image.name} ${r.image.version}, run ${r.run.id} attempt ${r.run.attempt}`;
// The attestation line a summary prints and compares (null off a hosted runner).
export const runnerText = r => (r ? `GitHub-hosted ${runnerKey(r)}; the run's install ${r.install.release} at ${r.install.home}; its engine build ${String(r.engine.build).slice(0, 12)} (cua ${r.engine.engineVersion})` : null);

// meta.hosted and meta.runner, from the device's record (preflight's `runner`, null when it has none) and the
// controller's environment; with the approved paths the harness was given, those must be the run's own install.
// A controller on a GitHub-hosted runner drives the runner itself (no remote device is reachable from one), so its run
// is hosted whatever the device says: with no record it is hosted and unattested (runner null), which the judges report
// as missing proof, never as a run off a runner. -> {hosted, runner}; throws when the device attests a run and the
// controller is not on a runner, the record is not one, it names another job's run, or the approved paths are not its.
export function hostedRunOf(record, env = process.env, {approvedRuntime, approvedEngine} = {}) {
  const controller = env?.RUNNER_ENVIRONMENT === 'github-hosted';
  if (record === null || record === undefined) return {hosted: controller, runner: null};
  const problems = runnerProblems(record);
  if (problems.length) throw new Error(`the device's hosted-runner record is not one: ${problems.join('; ')}`);
  if (!controller) throw new Error('the device attests a GitHub-hosted run, but this controller is not on one: a hosted run is driven from the runner itself');
  const job = {id: env.GITHUB_RUN_ID ?? record.run.id, attempt: env.GITHUB_RUN_ATTEMPT ?? record.run.attempt};
  if (job.id !== record.run.id || job.attempt !== record.run.attempt)
    throw new Error(`the device's record names run ${record.run.id} attempt ${record.run.attempt}, not this job's run ${job.id} attempt ${job.attempt}: a stale record`);
  if (approvedRuntime !== undefined && approvedRuntime !== record.install.home) throw new Error(`--approved-runtime ${approvedRuntime} is not the run's install (${record.install.home})`);
  if (approvedEngine !== undefined && approvedEngine !== record.engine.bundle) throw new Error(`--approved-engine ${approvedEngine} is not the run's engine (${record.engine.bundle})`);
  return {hosted: true, runner: record};
}
