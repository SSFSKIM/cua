#!/usr/bin/env node
// #216's hosted witness (docs/evidence/2026-11-23-own-native-engine/gates/216.md): an app approval kept across another
// app's decline and the connection's lifecycle, on cua's engine and cua's own host, with both surfaces, through the
// actual `cua serve` on the installed runtime. A GitHub-hosted macOS runner only: it binds the approved app (its window
// is observed, so the kit opens a scratch document in it first) and is refused anywhere else.
//
// Connection one binds the approved app, the declined app and the approved app again in one task, then for --cycles
// cycles (20 by default) ends the task and binds both in the new one; cycle 5 runs js_reset first and cycle 10 waits out
// the idle stop (CUA_RUNTIME_IDLE_MS is --idle-ms), so the runtime under the connection is replaced. Connection two, a
// new cua serve, binds each app once. The client answers like verify.mjs --bind: it accepts only the policy's approval
// for --approve and declines the one for --decline (scripts/probe/lib.mjs isAppApproval), with session persistence
// pinned, and declines and counts anything else.
//
// The approved app's fixture: the script waits for its window (FrontWindowProbe, never an observation) before the
// first bind and checks before every bind that the same process still has that window on screen (bindRefusal): a bind
// without it would make the engine reopen the app (TextEdit answers with its Open panel), so a lost fixture stops the
// run as NO VERDICT. Around every bind, by rulings 1136 and 1141 (replayd's capture alert stays up on a runner): the
// approved app is activated and must take front and key first, or the bind is not sent at all (NO VERDICT); front and
// key are sampled after it, and a system prompt in front or key there, or a sample that could not be read, makes the
// bind NO VERDICT, never a pass.
//
// Each bind records what the client was asked while it ran, its refusal class (scripts/probe/approval-cycles.mjs
// refusalOf, from the policy's #216 sentence), its `cua/approval` result meta (who answered, the connection's opaque id,
// the runtime generation), a non-approval failure's first line, whether its result opened with the restart notice, its
// task id and the samples' verdicts; never the app's text. Each end_task (status ended) and js_reset is checked. Every
// bind's result must attest cua's engine on cua's host: another host stops the run as a fail; another engine, or none,
// stops it NO VERDICT (ruling 1149: the vendor's engine on this side is state 1, which measures nothing of cua's;
// attestationStop). A run stopped by a lost fixture or an attestation is judged on what it recorded, the steps it never
// reached NO VERDICT (stoppedVerdict). The judge is judgeApprovalCycles. Nothing here reads replayd's state or writes a
// TCC row.
//
//   CUA_SHIM_SURFACES=computer,browser node scripts/approval-cycles.mjs --engine cua \
//     --approve com.apple.TextEdit --decline com.apple.calculator [--cycles 20] [--idle-ms 8000]
// The report on stdout, then `VERDICT: PASS|FAIL|NO VERDICT` on stderr (the hosted sitting's verdict check reads it).
// Exit 0 on a pass, 1 on a fail or NO VERDICT, 2 on a usage error or off a hosted runner.
import {execFile, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs, promisify} from 'node:util';
import {defaultHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {REPL_HOST_META_KEY} from '../src/repl-host/identity.mjs';
import {bindRefusal, boundedError, isAppApproval, isLifecycleRejection, lsappinfoPid} from './probe/lib.mjs';
import {LaneUsageError, pinLane, selectLane} from './probe/pinned-engine.mjs';
import {openSession, resultText} from './accept/mcp-session.mjs';
import {FRONT_WINDOW_SCRIPT, localFrontmost} from './accept/key-guard.mjs';
import {readWindows} from './accept/window-close.mjs';
import {ALERT_APPS, approvalCyclesPlan, attestationStop, judgeApprovalCycles, refusalOf, screenState, stoppedVerdict, verdictLine} from './probe/approval-cycles.mjs';

const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const RESTART_NOTICE = 'cua: the runtime was stopped after ';
const IDLE_AT = 10;
const usage = message => { console.error(`approval-cycles: ${message}`); process.exit(2); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = promisify(execFile);

let options;
try {
  ({values: options} = parseArgs({options: {engine: {type: 'string'}, approve: {type: 'string'}, decline: {type: 'string'},
    cycles: {type: 'string', default: '20'}, 'idle-ms': {type: 'string', default: '8000'}}, strict: true}));
} catch (error) { usage(error.message); }
if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') usage('runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted): it observes the approved app\'s window');
if (process.platform !== 'darwin') usage('macOS only');
const {surfaces} = settingsFrom(process.env);
if (!surfaces.includes('computer') || !surfaces.includes('browser')) usage('set CUA_SHIM_SURFACES=computer,browser: the witness is a session with both surfaces');
for (const flag of ['approve', 'decline']) if (!BUNDLE_ID.test(options[flag] ?? '')) usage(`--${flag} takes a bundle id`);
if (options.approve === options.decline) usage('--approve and --decline name two apps');
const cycles = Number(options.cycles);
const idleMs = Number(options['idle-ms']);
if (!Number.isInteger(cycles) || cycles < IDLE_AT) usage(`--cycles is a whole number of at least ${IDLE_AT} (cycle 5 resets, cycle ${IDLE_AT} waits out the idle stop)`);
if (!Number.isInteger(idleMs) || idleMs < 2000) usage('--idle-ms is a whole number of milliseconds, at least 2000');

const home = defaultHome();
let pinned;
try { pinned = pinLane({flag: options.engine, env: process.env, home, surfaces}); } catch (error) {
  if (error instanceof LaneUsageError) usage(error.message);
  throw error;
}
if (pinned.pin?.engine !== 'cua') usage('the witness drives cua\'s engine: --engine cua');
const serveEnv = {...pinned.serveEnv, CUA_SHIM_PERSIST: 'session', CUA_RUNTIME_IDLE_MS: String(idleMs)};
const runtime = resolveRuntime({home});
let lane;
try { lane = selectLane({pin: pinned.pin, serveEnv, home, runtime, surfaces}); } catch (error) { usage(`the launcher refuses this selection: [${error.code ?? 'error'}] ${error.message}`); }
const {selection, expected} = lane;
if (selection.host !== 'cua') usage(`the launcher selects the ${selection.host} host (${selection.reason}); the witness is cua's engine on cua's own host`);

const bundles = {approve: options.approve, decline: options.decline};
const report = {witness: '#216', release: runtime.release, engine: expected, cycles, idleMs, apps: bundles, connections: []};

// FrontWindowProbe, compiled once (interpreted when swiftc fails): `front` and `windows <pid>`, one JSON line each.
const probeDir = mkdtempSync(join(tmpdir(), 'cua-216-'));
const compiled = spawnSync('/usr/bin/swiftc', ['-O', '-o', join(probeDir, 'front-window'), FRONT_WINDOW_SCRIPT], {encoding: 'utf8'}).status === 0;
const probe = async args => JSON.parse((compiled ? await run(join(probeDir, 'front-window'), args, {timeout: 60_000})
  : await run('/usr/bin/swift', [FRONT_WINDOW_SCRIPT, ...args], {timeout: 120_000})).stdout);
const pidOf = bundle => lsappinfoPid(spawnSync('/usr/bin/lsappinfo', ['info', '-only', 'pid', '-app', bundle], {encoding: 'utf8'}).stdout ?? '');
const windowsOf = pid => readWindows([pid], {probe: p => probe(['windows', String(p)])});

// The screen now: the frontmost app, the owner of the top on-screen window, and the alert processes running; a part
// that could not be read is null (screenState reads it as unread).
async function sample() {
  let keyOwnerPid = null;
  try { keyOwnerPid = (await probe(['front'])).topWindow?.ownerPid ?? null; } catch { /* unread: null */ }
  return {front: localFrontmost(), keyOwnerPid, alertPids: ALERT_APPS.map(pidOf).filter(pid => pid !== null)};
}

// The fixture: the approved app's process and its windows, read once it has a window on screen.
async function awaitFixture() {
  for (let i = 0; i < 60; i++) {
    const pid = pidOf(bundles.approve);
    const windows = pid === null ? null : await windowsOf(pid);
    if (!bindRefusal({app: bundles.approve, pid, windows})) return {pid, windows};
    await sleep(1000);
  }
  const pid = pidOf(bundles.approve);
  throw Object.assign(new Error(bindRefusal({app: bundles.approve, pid, windows: pid === null ? null : await windowsOf(pid)})), {noVerdict: true});
}

// Before a bind: the fixture is still there, then the approved app is activated and must take front and key.
// -> null when it did, else why the bind is not sent: 'alert' (a system prompt in front or key) or 'activation'.
async function prepareBind(fixture) {
  const pid = pidOf(bundles.approve);
  const refusal = bindRefusal({app: bundles.approve, pid, windows: pid === null ? null : await windowsOf(pid), first: fixture});
  if (refusal) throw Object.assign(new Error(`the fixture was lost: ${refusal}`), {noVerdict: true});
  spawnSync('/usr/bin/open', ['-b', bundles.approve]);
  let now;
  for (let i = 0; i < 6; i++) {
    now = await sample();
    if (now.front === bundles.approve && now.keyOwnerPid === fixture.pid) return null;
    await sleep(500);
  }
  return screenState(now) === 'alert' ? 'alert' : 'activation';
}

// One connection running `plan`; resolves its record. A timed-out call, a protocol error or a wrong attestation throws.
async function runConnection(name, plan, fixture) {
  let bind = null;   // the bind in flight
  let opened = false;   // whether a call since the last end_task could have opened a task
  const record = {name, pid: null, binds: [], steps: [], other: 0, planned: plan.length, ran: 0};
  const session = openSession({args: [CLI, 'serve'], env: serveEnv, clientName: 'cua-approval-216', onServerRequest: msg => {
    if (bind && isAppApproval(msg, bundles[bind.app])) {
      bind.asked++;
      return bind.app === 'approve' ? {action: 'accept', content: {}} : {action: 'decline'};
    }
    record.other++;
    return {action: 'decline'};
  }});
  record.pid = session.pid;
  report.connections.push(record);
  const tool = async (call, label) => {
    const reply = await call;
    if (reply.timedOut) throw new Error(`${name}: ${label} got no answer`);
    if (reply.error) throw new Error(`${name}: ${label} failed: ${reply.error.code} ${boundedError(reply.error.message)}`);
    return reply.result;
  };
  try {
    await session.initialize();
    for (const step of plan) {
      record.ran++;
      if (step.step === 'end_task') {
        const result = await tool(session.call('end_task'), 'end_task');
        const status = result.structuredContent?.status ?? null;
        // Every bind of the cycle not sent (blocked) and no js_reset: no task was opened, so a noop proves nothing.
        const noTask = !opened && !result.isError && status === 'noop';
        record.steps.push({step: 'end_task', cycle: step.cycle, ok: !result.isError && status === 'ended', ...(result.isError || status !== 'ended' ? {detail: `status ${status}${result.isError ? ', isError' : ''}`} : {}), ...(noTask ? {noTask} : {})});
        opened = false;
      } else if (step.step === 'js_reset') {
        opened = true;
        const result = await tool(session.call('js_reset', {}, 60_000), 'js_reset');
        record.steps.push({step: 'js_reset', cycle: step.cycle, ok: !result.isError, ...(result.isError ? {detail: boundedError(resultText({result}))} : {})});
      } else if (step.step === 'idle') await sleep(idleMs + 4000);
      else {
        const blocked = await prepareBind(fixture);
        bind = {app: step.app, cycle: step.cycle, dispatched: !blocked, blocked, after: null, asked: 0, refusal: null, failed: false, restarted: false, taskId: null, approval: null};
        if (blocked) { record.binds.push(bind); bind = null; continue; }
        opened = true;
        try {
          const code = `await cua.getApp(${JSON.stringify(bundles[step.app])}); nodeRepl.write("bound")`;
          const result = await tool(session.js(code, 120_000), `the bind of ${bundles[step.app]}`);
          if (isLifecycleRejection(result)) throw new Error(`${name}: the bind of ${bundles[step.app]} was rejected before dispatch`);
          const stop = attestationStop(result._meta, expected);
          if (stop) throw Object.assign(stop, {message: `${name}: ${stop.message}`});
          const host = result._meta?.[REPL_HOST_META_KEY]?.host;
          if (host !== 'cua') throw new Error(`${name}: the bind ran on the ${host ?? 'vendor'} host`);
          const text = resultText({result});
          bind.restarted = text.startsWith(RESTART_NOTICE);
          bind.taskId = result._meta?.['cua/taskId'] ?? null;
          bind.approval = result._meta?.['cua/approval'] ?? null;
          if (result.isError) {
            bind.refusal = refusalOf(text);
            if (bind.refusal === null) Object.assign(bind, {failed: true, failure: boundedError(text.startsWith(RESTART_NOTICE) ? text.split('\n').slice(1).join('\n') : text)});
          }
          bind.after = screenState(await sample());
        } finally { record.binds.push(bind); bind = null; }
      }
    }
  } finally {
    const closed = await session.close();
    record.closed = {code: closed.code, signal: closed.signal, ...(closed.forced ? {forced: true} : {})};
  }
  return record;
}

let stopped = null;
try {
  const fixture = await awaitFixture();
  report.fixture = {pid: fixture.pid, windows: fixture.windows.length, probe: compiled ? 'compiled' : 'interpreted'};
  await runConnection('first', approvalCyclesPlan(cycles, {idleAt: IDLE_AT}), fixture);
  await runConnection('second', [{step: 'bind', app: 'approve', cycle: 0}, {step: 'bind', app: 'decline', cycle: 0}], fixture);
} catch (error) {
  stopped = {message: error.message, noVerdict: error.noVerdict === true};
} finally {
  rmSync(probeDir, {recursive: true, force: true});
}
// A lost fixture or an attestation of another engine stops the run with steps unexecuted: the judge reads those as NO
// VERDICT and fails only what it saw. Any other stop (no answer, a protocol error, another host) is a failed run.
report.verdict = stoppedVerdict(judgeApprovalCycles({cycles, idleAt: IDLE_AT, connections: report.connections, complete: !stopped}), stopped);
console.log(JSON.stringify(report, null, 1));
process.stderr.write(`${verdictLine(report.verdict.verdict)}\n`);
process.exitCode = report.verdict.ok ? 0 : 1;
