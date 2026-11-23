// The runner's setup before a sitting's steps (#117 M5, T10b′), in H0's order (the M5 wave's Decision Log, "H0's
// result"): the system-database TCC rows of both bundles before either launches, a relaunch, then the cells.
//   loopback            the runner reaches itself as the harnesses' device `hosted-macos` (./loopback.sh, a user-mode
//                       sshd on 127.0.0.1:2222 with the job's PATH, as scripts/repl-parity/hosted/hosted.sh sets it up)
//   harness checkout    the device's parity clone made from the job's checkout (a pull request's merge commit is on no
//                       ref), its origin pointed back at GitHub, then native-baseline's prepare at the tested commit
//   install             the run's install: the pinned runtime in the default CUA_HOME, the home the engine's fixed
//                       directory lives in, so --approved-runtime and --approved-engine name one install
//   engine              the run's engine build, unpacked from the macos-latest build job's archive (until #504 lets
//                       xcode-27 build it) or built here; its signature verified
//   vendor helper       not running yet, so its first launch is after its rows (a running helper keeps the old answer;
//                       nothing here kills one)
//   vendor rows         the vendor's helper's rows (./tcc.mjs, the one guarded writer)
//   approve             cua's engine's rows, the relaunch and the two-pass approve (./approve.mjs)
//   engine stop         `cua engine stop` on the engine the approve left running, so every sitting starts from a known
//                       engine state and no stray engine feeds a measured run or reads as a user of the approved home
//                       (pilot A, run 45218179501); whether it was running and that it stopped are kept (`engineStop`)
//   record              the runner's record, which every harness's preflight reads and attests (./runner.mjs)
// Each step gates the next. It refuses off a GitHub-hosted macOS runner before running anything.
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {BUNDLE_NAME} from '../../src/runtime/engine-bundle.mjs';
import {stopEngine as stopApprovedEngine} from '../../src/runtime/engine.mjs';
import {ENGINE_DIRECTORY_IN_HOME} from '../../src/runtime/layout.mjs';
import {locateRuntime} from '../../src/runtime/manifest.mjs';
import {bundleIdentity} from '../../src/services/engine/client.mjs';
import {engineToApprove, hostedApprove} from './approve.mjs';
import {loopbackSshArgs} from '../repl-parity/loopback-ssh.mjs';
import {DEVICE} from './plan.mjs';
import {assertGithubHosted, runnerRecord, runnerRecordPath, vmIdentity} from './runner.mjs';
import {CLIENTS, grantRows} from './tcc.mjs';

export const PARITY_CLONE_IN_HOME = 'Developer/GitHub/cua-parity';
const ORIGIN = 'https://github.com/SSFSKIM/cua';

class StepFailed extends Error {}
const failIf = (condition, detail) => { if (condition) throw new StepFailed(detail); };

// deps: {env, platform, home (the account's), checkout (the job's), commit (the tested one), engineArchive (the build
// job's, or null to build here), exec(command, args, options) -> {status, stdout, stderr}, runtimeOf(cuaHome),
// engineOf(home), identityOf(bundle), vmOf() (./runner.mjs vmIdentity), newId() (the setup's own VM id), realpath,
// exists, vendorRunning(app), grant, approve, stopEngine() (src/runtime/engine.mjs stopEngine), write(path, record), log}.
// -> {ok, steps: [{step, ok, detail}], approve, engineStop: {wasRunning, pid?, stopped}, record, approved: {runtime, engine}}.
export async function hostedSetup({env = process.env, platform = process.platform, home = env.HOME, checkout = process.cwd(), commit, engineArchive = null,
  exec = (command, args, options) => spawnSync(command, args, {encoding: 'utf8', cwd: checkout, ...options}),
  runtimeOf = cuaHome => locateRuntime({home: cuaHome}), engineOf = engineToApprove, identityOf = bundleIdentity, vmOf = vmIdentity, newId = randomUUID, realpath = realpathSync, exists = existsSync,
  vendorRunning = app => spawnSync('pgrep', ['-f', `${app}/Contents/MacOS/`]).status === 0, grant = grantRows,
  approve = deps => hostedApprove(deps), stopEngine = () => stopApprovedEngine(), write = (path, record) => { mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`); },
  log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the hosted setup');
  const report = {ok: false, steps: [], approve: null, engineStop: null, record: null, approved: null};
  const run = (command, args, extra = {}) => {
    const result = exec(command, args, {env, ...extra});
    failIf(result.status !== 0, `${[command, ...args].join(' ')}: exit ${result.status}${result.stderr ? `: ${String(result.stderr).trim().split('\n').at(-1)}` : ''}`);
    return result;
  };
  const cuaHome = join(home, 'Library', 'Application Support', 'cua');
  const clone = join(home, PARITY_CLONE_IN_HOME);
  let runtime = null, bundle = null;
  const steps = [
    ['loopback', () => {
      run('sh', ['scripts/hosted-sittings/loopback.sh']);
      const remote = String(run('ssh', [...loopbackSshArgs(DEVICE, home), DEVICE, 'node -v']).stdout).trim();
      failIf(remote !== process.version, `the device's node (${remote}) is not the job's (${process.version})`);
      return `${DEVICE} reaches this runner with node ${remote}`;
    }],
    ['harness checkout', () => {
      if (!exists(join(clone, '.git'))) { run('mkdir', ['-p', dirname(clone)]); run('git', ['clone', '-q', checkout, clone]); }
      run('git', ['-C', clone, 'fetch', '-q', checkout, 'HEAD']);
      run('git', ['-C', clone, 'remote', 'set-url', 'origin', ORIGIN]);
      run('git', ['-C', clone, 'cat-file', '-e', `${commit}^{commit}`]);
      return `${clone} holds ${commit}`;
    }],
    ['prepare', () => { run('node', ['scripts/native-baseline.mjs', 'prepare', '--device', DEVICE, '--commit', commit]); return `prepared at ${commit}`; }],
    ['install', () => {
      const {CUA_HOME: _ignored, ...rest} = env;
      run('node', ['bin/cua.mjs', 'install', '--json'], {env: {...rest, CUA_NATIVE_ENGINE: 'vendor'}});
      runtime = runtimeOf(cuaHome);
      return `${runtime.release} at ${cuaHome}`;
    }],
    ['engine', () => {
      if (engineArchive) { run('mkdir', ['-p', cuaHome]); run('tar', ['-C', cuaHome, '-xzf', engineArchive]); }
      else run('node', ['bin/cua.mjs', 'engine', 'build', '--sign', 'adhoc', '--json']);
      bundle = engineOf(home);
      failIf(!bundle, `no engine build under ${join(home, ENGINE_DIRECTORY_IN_HOME)}`);
      run('codesign', ['--verify', '--strict', bundle]);
      return `${bundle} (${engineArchive ? 'the build job\'s, unpacked' : 'built here'}), signature verified`;
    }],
    ['vendor helper not running', () => {
      failIf(vendorRunning(runtime.paths.skyServiceApp), `the vendor's helper is already running (${runtime.paths.skyServiceApp}): it would keep the answer it read before its rows; this runner is not fresh`);
      return 'not running';
    }],
    ['vendor rows', () => {
      const rows = grant([{client: CLIENTS.vendor, bundle: runtime.paths.skyServiceApp}], {env, platform, log});
      failIf(rows.missing.length, `rows missing: ${rows.missing.join(', ')}`);
      return `${CLIENTS.vendor}: written`;
    }],
    ['approve', async () => {
      report.approve = await approve({env, platform, home, log});
      failIf(!report.approve.approved, report.approve.summary);
      return report.approve.summary;
    }],
    ['engine stop', async () => {
      const stopped = await stopEngine();
      report.engineStop = {...stopped, stopped: true};
      return stopped.wasRunning ? `was running (pid ${stopped.pid}), stopped` : 'not running';
    }],
    ['record', () => {
      const engine = realpath(join(home, ENGINE_DIRECTORY_IN_HOME, BUNDLE_NAME));
      const machine = vmOf();
      failIf(!machine, 'this VM could not be read (its platform UUID and boot time): the record would attest no machine');
      report.record = runnerRecord(env, {install: {home: realpath(cuaHome), release: runtime.release}, engine: {bundle: engine, ...identityOf(engine)}, vm: {id: newId(), ...machine}});
      write(runnerRecordPath(home), report.record);
      report.approved = {runtime: report.record.install.home, engine};
      return runnerRecordPath(home);
    }],
  ];
  for (const [step, body] of steps) {
    try {
      const detail = await body();
      report.steps.push({step, ok: true, detail});
      log(`hosted-sittings: setup ${step}: PASS (${detail})`);
    } catch (error) {
      report.steps.push({step, ok: false, detail: error.message});
      log(`hosted-sittings: setup ${step}: FAIL (${error.message})`);
      return report;
    }
  }
  report.ok = true;
  return report;
}
