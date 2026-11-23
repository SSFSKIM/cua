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
// pinned, and declines and counts anything else. Each bind records what the client was asked while it ran, its refusal
// class (scripts/probe/approval-cycles.mjs refusalOf, from the policy's #216 sentence), whether it failed otherwise (a
// bounded first line), whether its result opened with the restart notice, and its task id; never the app's text.
// The judge is judgeApprovalCycles. Every js result must attest cua's engine on cua's host; a mismatch stops the run.
// Nothing here reads replayd's state or writes a TCC row: the approval is asked before the engine observes, so a capture
// alert in front, or a capture that fails, changes no approval verdict (such a bind counts as "failed otherwise").
//
//   CUA_SHIM_SURFACES=computer,browser node scripts/approval-cycles.mjs --engine cua \
//     --approve com.apple.TextEdit --decline com.apple.calculator [--cycles 20] [--idle-ms 8000]
// Exit 0 when the judge passes, 1 when it fails or the run stops, 2 on a usage error or off a hosted runner.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {REPL_HOST_META_KEY} from '../src/repl-host/identity.mjs';
import {attestationProblem, boundedError, isAppApproval, isLifecycleRejection, lsappinfoPid} from './probe/lib.mjs';
import {LaneUsageError, pinLane, selectLane} from './probe/pinned-engine.mjs';
import {openSession, resultText} from './accept/mcp-session.mjs';
import {approvalCyclesPlan, judgeApprovalCycles, refusalOf} from './probe/approval-cycles.mjs';

const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const RESTART_NOTICE = 'cua: the runtime was stopped after ';
const usage = message => { console.error(`approval-cycles: ${message}`); process.exit(2); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
if (!Number.isInteger(cycles) || cycles < 10) usage('--cycles is a whole number of at least 10 (cycle 5 resets, cycle 10 waits out the idle stop)');
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
const {selection, expected} = selectLane({pin: pinned.pin, serveEnv, home, runtime, surfaces});
if (selection.host !== 'cua') usage(`the launcher selects the ${selection.host} host (${selection.reason}); the witness is cua's engine on cua's own host`);
const pid = lsappinfoPid(spawnSync('/usr/bin/lsappinfo', ['info', '-only', 'pid', '-app', options.approve], {encoding: 'utf8'}).stdout ?? '');
if (pid === null) usage(`${options.approve} is not running: open a scratch document in it first, so the engine never launches it`);

const bundles = {approve: options.approve, decline: options.decline};
const report = {witness: '#216', release: runtime.release, engine: expected, cycles, idleMs, apps: bundles, connections: []};

// One connection running `plan`; resolves its record. A timed-out call, a protocol error or a wrong attestation throws.
async function runConnection(name, plan) {
  let bind = null;   // the bind in flight
  const record = {name, pid: null, binds: [], other: 0, resets: 0};
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
      if (step.step === 'end_task') await tool(session.call('end_task'), 'end_task');
      else if (step.step === 'js_reset') { await tool(session.call('js_reset', {}, 60_000), 'js_reset'); record.resets++; }
      else if (step.step === 'idle') await sleep(idleMs + 4000);
      else {
        bind = {app: step.app, asked: 0, refusal: null, failed: false, restarted: false, taskId: null};
        try {
          const code = `await cua.getApp(${JSON.stringify(bundles[step.app])}); nodeRepl.write("bound")`;
          const result = await tool(session.js(code, 120_000), `the bind of ${bundles[step.app]}`);
          if (isLifecycleRejection(result)) throw new Error(`${name}: the bind of ${bundles[step.app]} was rejected before dispatch`);
          const problem = attestationProblem(result._meta, expected);
          if (problem) throw new Error(`${name}: refused on the attestation: ${problem}`);
          const host = result._meta?.[REPL_HOST_META_KEY]?.host;
          if (host !== 'cua') throw new Error(`${name}: the bind ran on the ${host ?? 'vendor'} host`);
          const text = resultText({result});
          bind.restarted = text.startsWith(RESTART_NOTICE);
          bind.taskId = result._meta?.['cua/taskId'] ?? null;
          if (result.isError) {
            bind.refusal = refusalOf(text);
            if (bind.refusal === null) Object.assign(bind, {failed: true, failure: boundedError(text.startsWith(RESTART_NOTICE) ? text.split('\n').slice(1).join('\n') : text)});
          }
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
  await runConnection('first', approvalCyclesPlan(cycles));
  await runConnection('second', [{step: 'bind', app: 'approve'}, {step: 'bind', app: 'decline'}]);
} catch (error) {
  stopped = error.message;
}
const verdict = judgeApprovalCycles({cycles, connections: report.connections});
report.verdict = stopped ? {ok: false, problems: [`the run stopped: ${stopped}`, ...verdict.problems], detail: verdict.detail} : verdict;
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.verdict.ok ? 0 : 1;
