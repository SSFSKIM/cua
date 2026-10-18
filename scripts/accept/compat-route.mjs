// #115 acceptance 6 and the vendor host's share of 2 to 5 (spec docs/doperpowers/specs/2026-10-17-own-sandbox-design.md):
// a macOS computer session runs through cua's compat executable. One experiment.mjs run with no CLI slot (the launch's
// own CODEX_CLI_PATH), the six read-only native calls and the confinement cell (scripts/sandbox-probe/experiment.mjs
// --native), judged here: the native calls succeed, so the helper's policy read was answered; the launch named the
// compat executable and the run's own helper (by its session temp) carries the same CODEX_CLI_PATH, the file it runs
// `app-server` from; the kernel's TMPDIR is its session's own, its script directory is not writable, a link of a file
// it cannot write is refused, cells reach no TCP or Unix socket and cua's home stays unlisted; no codex process runs
// under the session; and the run's helper quit or was quit by its pid. Counts and error codes only.
//
//   node scripts/accept/compat-route.mjs --home <CUA_HOME> --user-home <HOME> --config-home <XDG_CONFIG_HOME> --out <file>
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {COMPAT_EXECUTABLE} from '../../src/runtime/launch.mjs';

const EXPERIMENT = fileURLToPath(new URL('../sandbox-probe/experiment.mjs', import.meta.url));
const NATIVE = ['listApps#1', 'Finder getApp+getAXState#1', 'listApps#2', 'Finder getAXState#2'];
const DENIED = ['EPERM', 'EACCES'];

// experiment.mjs's result -> [{label, pass, detail?}].
export function compatRouteChecks(result, {compat = COMPAT_EXECUTABLE} = {}) {
  const checks = [];
  const add = (label, pass, detail) => checks.push({label, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});
  const r = result?.results ?? {};
  add('the session started (banner cell)', r.banner?.ok === true, r.banner?.error);
  for (const name of NATIVE) add(`native call ${name} succeeds through the compat executable's app-server`, r[name]?.ok === true, r[name]?.error);
  add('the launch names cua\'s compat executable as CODEX_CLI_PATH', result?.launcher?.codexCliPath === compat, result?.launcher?.codexCliPath ?? 'none');
  const helpers = result?.launcher?.helpers ?? [];
  add('the run\'s own helper runs app-server from the compat executable (its CODEX_CLI_PATH)', helpers.length > 0 && helpers.every(h => h.launcherIsTheLaunch === true), `${helpers.length} helper(s)`);
  const c = r.confinement?.ok ? r.confinement.value : null;
  add('the confinement cell ran', c !== null, r.confinement?.error);
  if (c) {
    add('the kernel\'s TMPDIR is its session\'s own', c.tmpdirIsSession === true);
    add('the kernel writes its run directory and session temp', c.cwdWrite === 'ok' && c.tmpdirWrite === 'ok', `${c.cwdWrite}/${c.tmpdirWrite}`);
    add('node_repl\'s script directory lies in the session temp and the kernel cannot write into it', c.scriptDirs === 1 && DENIED.includes(c.scriptDirWrite), `${c.scriptDirs} dir(s), ${c.scriptDirWrite}`);
    add('writes outside the session fail', DENIED.includes(c.outsideWrite) && DENIED.includes(c.trustedWrite) && DENIED.includes(c.slashTmpWrite), `${c.outsideWrite}/${c.trustedWrite}/${c.slashTmpWrite}`);
    add('the kernel cannot list cua\'s home', DENIED.includes(c.listCuaHome), c.listCuaHome);
    add('a hard link into the session fails', DENIED.includes(c.hardLink), c.hardLink);
    add('TCP and AF_UNIX connects fail', DENIED.includes(c.tcp) && DENIED.includes(c.unix) && DENIED.includes(c.mDNSResponder), `${c.tcp}/${c.unix}/${c.mDNSResponder}`);
  }
  add('no process named codex runs under the session', result?.codexDescendants === 0, result?.codexDescendants);
  add('the run\'s helper quit by itself or was quit by its pid; no other was signalled', result?.helpers?.started >= 1 && result.helpers.started === result.helpers.quitByThemselves + result.helpers.quitByHarness,
    result?.helpers ? JSON.stringify(result.helpers) : 'no helper record');
  add('the run completed without a driver error', !result?.driverError && !result?.refused, result?.driverError ?? result?.refused);
  return checks;
}

// Whether `result` proves the run's teardown: the experiment exited on its own and accounted for every helper it
// started (each quit by itself or was quit by its pid).
const teardownProven = (exit, result) => exit.signal !== 'SIGKILL' && result?.helpers && Number.isInteger(result.helpers.started)
  && result.helpers.started === result.helpers.quitByThemselves + result.helpers.quitByHarness;

// Runs the experiment and judges it -> {ok, checks, kept}. Past `timeoutMs` it is cancelled cooperatively (SIGTERM: the
// experiment closes its serve, stops its own helpers by pid and writes its result) and given `graceMs` to finish; only
// then is it killed. The scratch directory (the experiment's result, its launch log naming each session temp, the
// helpers' ownership witness) is removed only when the teardown is proven, else kept and named (`kept`).
// `experiment` and `node` are injectable for tests.
export async function compatRouteAcceptance({home, userHome, configHome, node = process.execPath, experiment = EXPERIMENT, timeoutMs = 600_000, graceMs = 90_000}) {
  const scratch = mkdtempSync(join(tmpdir(), 'cua-compat-route-'));
  const out = join(scratch, 'result.json');
  const child = spawn(node, [experiment, '--native', '--home', home, '--user-home', userHome, '--config-home', configHome, '--scratch', scratch,
    '--host', 'vendor', '--mode', 'scoped', '--label', 'compat-route', '--out', out], {stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  let timedOut = false;
  const exit = await new Promise(done => {
    let grace;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); grace = setTimeout(() => child.kill('SIGKILL'), graceMs); }, timeoutMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); clearTimeout(grace); done({code, signal}); });
  });
  let result = null;
  try { result = JSON.parse(readFileSync(out, 'utf8')); } catch { /* judged below */ }
  const checks = result ? compatRouteChecks(result) : [{label: 'the experiment wrote its result', pass: false, detail: `exit ${exit.code ?? exit.signal}: ${stderr.trim().split('\n').at(-1) ?? ''}`.slice(0, 300)}];
  if (timedOut) checks.push({label: `the experiment finished within ${timeoutMs} ms`, pass: false, detail: exit.signal === 'SIGKILL' ? `killed after a ${graceMs} ms grace` : 'cancelled; it tore down on its own'});
  const proven = teardownProven(exit, result);
  if (!proven) checks.push({label: 'the run\'s teardown is proven (its helpers accounted for); the evidence is kept', pass: false, detail: scratch});
  else rmSync(scratch, {recursive: true, force: true});
  return {ok: checks.every(c => c.pass), checks, kept: proven ? null : scratch};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {home: {type: 'string'}, 'user-home': {type: 'string'}, 'config-home': {type: 'string'}, out: {type: 'string'}}});
  if (!values.home || !values['user-home'] || !values['config-home']) { console.error('usage: compat-route.mjs --home <CUA_HOME> --user-home <HOME> --config-home <XDG_CONFIG_HOME> [--out <file>]'); process.exit(2); }
  const report = await compatRouteAcceptance({home: values.home, userHome: values['user-home'], configHome: values['config-home']});
  if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ok: report.ok, failed: report.checks.filter(c => !c.pass).map(c => c.label)}));
  process.exitCode = report.ok ? 0 : 1;
}
