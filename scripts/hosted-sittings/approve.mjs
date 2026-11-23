// The hosted approval (#117 M5, T10b′): on a GitHub-hosted runner, the run's own cua engine approved with nobody at the
// console, in H0's order (the M5 wave's Decision Log, "H0's result"): the bundle's system-database TCC rows
// (./tcc.mjs, the one guarded writer), a relaunch so the next launch reads them (`cua engine stop`; a row reaches only a
// process launched after it is written), then `cua engine approve` twice. The first approve's own capture is the copy's
// first and raises replayd's confirmation, which nobody answers, so it fails engine_capture_confirmation (with M4's
// pending layout the promote is rolled back); the second capture by the same copy raises none and approves. Both passes
// always run and the report lists both: a first pass that approved (the copy had captured before) is not a reason to
// skip the second, which must approve too.
//
// Never on a Mac of the owner's: it refuses before any row, relaunch or approve unless RUNNER_ENVIRONMENT=github-hosted on
// macOS. Nothing here writes replayd's store or answers its alert (ruling 1141).
//
// The CLI form (scripts/hosted-sittings.mjs approve) is CUA_HOSTED_APPROVE, the step sitting E's approved lane waits on
// (scripts/accept/macos-default-selection-hosted.sh runs it with HOME set to its disposable home), and the setup's own.
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUNDLE_NAME} from '../../src/runtime/engine-bundle.mjs';
import {pendingEngine} from '../../src/runtime/engine-minimum.mjs';
import {ENGINE_DIRECTORY_IN_HOME} from '../../src/runtime/layout.mjs';
import {bundleIdentity} from '../../src/services/engine/client.mjs';
import {assertGithubHosted} from './runner.mjs';
import {CLIENTS, grantRows} from './tcc.mjs';

const CUA = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
export const PASSES = 2;

// The bundle `cua engine approve` approves under `home`: the build pending beside the approved engine (ruling 1118's
// slot, or pending.json's bundle at the approved path before it), else the bundle at the approved path. -> path | null.
export function engineToApprove(home = homedir()) {
  const dir = join(home, ENGINE_DIRECTORY_IN_HOME);
  const pending = pendingEngine({dir});
  if (pending?.bundlePath) return pending.bundlePath;
  const approved = join(dir, BUNDLE_NAME);
  try { bundleIdentity(approved); return approved; } catch { return null; }
}

// `cua <args> --json` under `home`, its stdin closed so an approve that would wait for an operator gets none.
const cliUnder = (home, env) => args => spawnSync(process.execPath, [CUA, ...args, '--json'], {encoding: 'utf8', env: {...env, HOME: home}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000});
// The JSON the CLI printed (whole, as it prints it indented), else its last line's.
function answerOf(stdout) {
  const text = String(stdout ?? '').trim();
  for (const candidate of [text, text.split('\n').at(-1)]) { try { return JSON.parse(candidate); } catch { /* the next form */ } }
  return null;
}
const passWord = p => (p.approved ? 'approved' : p.code ?? `exit ${p.exit}`);

// deps: {env, platform, home, cli(args) -> {status, stdout}, grant (./tcc.mjs grantRows), bundleOf(home), now, log}.
// -> {bundle, rows, relaunch, passes: [{pass, exit, approved, code, message, captureConfirmation, build, ms}], approved,
// build, summary}.
export async function hostedApprove({env = process.env, platform = process.platform, home = env.HOME ?? homedir(), cli, grant = grantRows, bundleOf = engineToApprove, now = Date.now,
  log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the hosted approval');
  const bundle = bundleOf(home);
  if (!bundle) throw new Error(`no engine build to approve under ${home}: build it first (cua install --engine, or cua engine build --sign adhoc)`);
  const run = cli ?? cliUnder(home, env);
  const rows = grant([{client: CLIENTS.engine, bundle}], {env, platform, log});
  const report = {bundle, rows, relaunch: null, passes: [], approved: false, build: null, summary: null};
  if (rows.missing.length) {
    report.summary = `not approved: TCC rows missing: ${rows.missing.join(', ')}`;
    return report;
  }
  const stop = run(['engine', 'stop']);
  const stopped = answerOf(stop.stdout);
  report.relaunch = {stopped: stop.status === 0 && stopped?.ok === true, wasRunning: stopped?.wasRunning ?? null};
  if (!report.relaunch.stopped) {
    report.summary = `not approved: the engine could not be stopped for its relaunch (${stopped?.error?.code ?? `exit ${stop.status}`})`;
    return report;
  }
  for (let pass = 1; pass <= PASSES; pass++) {
    const started = now();
    const result = run(['engine', 'approve']);
    const answer = answerOf(result.stdout) ?? {};
    const entry = {pass, exit: result.status, approved: result.status === 0 && answer.approved === true, code: answer.error?.code ?? null, message: answer.error?.message ?? answer.reason ?? null,
      captureConfirmation: answer.captureConfirmation ?? null, build: answer.build ?? null, ms: now() - started};
    report.passes.push(entry);
    log(`hosted-sittings: approve pass ${pass} of ${PASSES}: ${passWord(entry)}`);
  }
  const last = report.passes.at(-1);
  report.approved = last.approved;
  report.build = last.approved ? last.build : null;
  report.summary = `${report.approved ? 'approved in two passes' : 'not approved'}: ${report.passes.map(p => `pass ${p.pass} ${passWord(p)}`).join(', ')}`;
  return report;
}
