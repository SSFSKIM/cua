// The hosted staged onboarding (#117 M5, T3b; the M4/M5 pre-flight's R5 and §4 item 8): on a GitHub-hosted runner the
// onboarding stages a new Mac passes through are set by cua's engine's own TCC rows, and what the product does at each
// is recorded, as sitting D's last step (./plan.mjs). It drives the run's approved engine through `cua serve` with an
// explicit CUA_NATIVE_ENGINE=cua, binding sitting D's scratch TextEdit document. It judges nothing: ./onboarding-judge.mjs
// reads its record (checks.mjs `onboarding`).
//
// The stages (STAGES), each setting its rows through the one guarded writer (./tcc.mjs; O0, ruling 1111) and then
// relaunching the engine, since a runner's row is honoured only at the engine's next launch (H0, the M5 wave's Decision
// Log "H0's result"):
//   none             every row of cua's engine removed; `cua engine stop`, then a fresh session launches it
//   accessibility    Accessibility granted; `cua engine stop`, a fresh session
//   screenRecording  Screen Recording added; the product's own relaunch: the stage before refused Screen Recording on
//                    this connection, which owes one relaunch at the next observation (src/services/engine/client.mjs)
//   full             Input Monitoring and post events added last, so the run ends with H0's row set, the setup's;
//                    `cua engine stop`, a fresh session
// At each: a bind of TextEdit (an observation, which checks Accessibility first) and a capture (which needs Screen
// Recording), the engine's status read after each (the capabilities and the pid that tells a relaunch), then doctor.
// Recorded per call: the answer's allowlisted facts (scripts/accept/onboarding.mjs replyFacts), its cua/permission, its
// cua/nativeEngine attestation, whether a refusal carries the grant's steps and the approved bundle's path
// (permissionGuidance), and the error's text (a runner holds no owner content).
//
// It never writes an operator's confirmation: it runs no `cua engine approve`, every CLI it runs has its input closed (a
// product that waits for an operator reads end of input), and it declines every elicitation but the bound app's
// approval, which a client answers (the hosted harnesses' rule, pre-flight item 2). A call the product holds past its
// bound is recorded as a wait, and the run goes on to the next stage. A stage whose rows, relaunch or session cannot be
// set stops the run, recorded. Refuses off a GitHub-hosted macOS runner before anything else.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {TEXTEDIT_BUNDLE} from '../accept/lib.mjs';
import {openSession, resultText} from '../accept/mcp-session.mjs';
import {doctorFacts, permissionGuidance, replyFacts} from '../accept/onboarding.mjs';
import {isAppApproval} from '../probe/lib.mjs';
import {pinLane, selectLane} from '../probe/pinned-engine.mjs';
import {assertGithubHosted} from './runner.mjs';
import {CLIENTS, grantRows, revokeRows, SERVICES} from './tcc.mjs';

const CUA = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
export const CALL_MS = 60_000;
// `cua engine stop` refused while a closed session's connection is still counted: retried this often, a second apart.
const STOP_ATTEMPTS = 5;
const STOP_RETRY_MS = 1_000;
// Before the product's own relaunch: the status and doctor connections closed at the engine, which refuses the
// relaunch's shutdown while another client is connected (client.mjs: the observation then fails with no relaunch).
const SETTLE_MS = 1_000;

const ALL = Object.keys(SERVICES);
export const STAGES = Object.freeze([
  {id: 'none', rows: [], relaunch: 'engine stop'},
  {id: 'accessibility', rows: ['accessibility'], relaunch: 'engine stop'},
  {id: 'screenRecording', rows: ['accessibility', 'screenRecording'], relaunch: 'product'},
  {id: 'full', rows: ALL, relaunch: 'engine stop'},
].map(Object.freeze));

const BIND = `globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)});`;
export const CALLS = Object.freeze([
  {id: 'accessibility', code: `${BIND}\nnodeRepl.write(JSON.stringify({onboarding: true, bound: true}));`},
  {id: 'screenRecording', code: `${BIND}\nnodeRepl.write(JSON.stringify({onboarding: true, bytes: (await app.getScreenshot({emit: false})).length}));`},
]);

// `cua <args> --json` as the driver runs it: the given environment, its input closed. -> (args) -> {status, stdout, stderr}.
export function cuaCli(env, {spawn = spawnSync} = {}) {
  return args => {
    if (args[0] === 'engine' && args[1] === 'approve') throw new Error('the staged onboarding never runs cua engine approve: an approval is the operator\'s');
    return spawn(process.execPath, [CUA, ...args, '--json'], {encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000});
  };
}

// The JSON the CLI printed (whole, as it prints it indented), else its last line's.
function answerOf(stdout) {
  const text = String(stdout ?? '').trim();
  for (const candidate of [text, text.split('\n').at(-1)]) { try { return JSON.parse(candidate); } catch { /* the next form */ } }
  return null;
}
const bool = value => (typeof value === 'boolean' ? value : null);
const integer = value => (Number.isSafeInteger(value) ? value : null);
const text = value => (typeof value === 'string' ? value : null);
const payloadOf = reply => {
  const line = resultText(reply ?? {}).split('\n').findLast(s => s.startsWith('{"onboarding":'));
  try { return JSON.parse(line); } catch { return null; }
};

// The engine's status as `cua engine status --json` reports it: the capabilities and the pid, nothing else.
function statusFacts(result) {
  const report = result?.status === 0 ? answerOf(result.stdout) : null;
  if (!report || typeof report !== 'object') return {read: false, problem: `cua engine status: exit ${result?.status ?? 'none'}`};
  const s = report.status;
  return {read: true, running: report.running === true, pid: integer(s?.pid), connections: integer(s?.connections), build: text(s?.build),
    accessibility: bool(s?.accessibility), screenRecording: bool(s?.screenRecording), inputMonitoring: bool(s?.inputMonitoring), canPostHid: bool(s?.canPostHid)};
}

// One call's record: the allowlisted facts, the attestation, the refusal's guidance for the grant it names, the error's text.
function callFacts(id, reply, bundlePath) {
  const facts = replyFacts(reply);
  const meta = reply?.result?._meta ?? {};
  const attested = meta['cua/nativeEngine'];
  const data = payloadOf(reply);
  const permission = facts.metadata.permission;
  return {id, ...facts, waited: reply?.timedOut === true, bound: data?.bound === true ? true : null,
    nativeEngine: attested && typeof attested === 'object' ? {engine: text(attested.engine), version: text(attested.version), build: text(attested.build)} : null,
    errorName: text(meta['cua/errorName']),
    guidance: permission === 'accessibility' || permission === 'screenRecording' ? permissionGuidance(reply, {permission, bundlePath}) : null,
    errorText: facts.isError ? resultText(reply).slice(0, 600) : reply?.error ? String(reply.error.message ?? '').slice(0, 600) : null};
}

// The run's lane: cua's engine pinned explicitly, the launcher's selection and the attestation its results must carry.
function prepareLane(env) {
  const home = defaultHome();
  const ambient = {...env, CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_SURFACES: 'computer'};
  const {surfaces} = settingsFrom(ambient);
  const {pin, serveEnv} = pinLane({flag: 'cua', env: ambient, home, surfaces});
  const {selection, expected} = selectLane({pin, serveEnv, home, runtime: resolveRuntime({home}), surfaces});
  if (selection.host !== 'cua' || !expected || expected.engine !== 'cua') throw new Error(`the launcher selects the ${selection.host} host (${selection.reason}), not cua's engine on cua's host`);
  return {serveEnv: {...serveEnv, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'}, expected, bundlePath: selection.engine.app.bundlePath, selection: {host: selection.host, reason: selection.reason}};
}

// deps: {env, platform, prepare() -> {serveEnv, expected, bundlePath, selection}, grant (./tcc.mjs grantRows), revoke
// (revokeRows), cli(args) (cuaCli's, over the lane's serveEnv by default), connect(onServerRequest) -> {initialize, js(code,
// ms), close}, sleep(ms), now, log}. -> the record: {kind, hosted, startedAt, finishedAt, complete, problem, app, expected,
// bundlePath, selection, decision, elicitations: {accepted, declined}, stages: [{id, rows, relaunch, relaunched, calls,
// status, doctor, problem}]}.
export async function runOnboarding({env = process.env, platform = process.platform, prepare = async () => prepareLane(env), grant = grantRows, revoke = revokeRows,
  cli = null, connect = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the staged onboarding');
  const record = {kind: 'hosted-onboarding', hosted: true, startedAt: new Date(now()).toISOString(), finishedAt: null, complete: false, problem: null,
    app: TEXTEDIT_BUNDLE, expected: null, bundlePath: null, selection: null, decision: null, elicitations: {accepted: 0, declined: 0}, stages: []};
  const answer = msg => {
    if (isAppApproval(msg, TEXTEDIT_BUNDLE)) { record.elicitations.accepted++; return {action: 'accept', content: {}}; }
    record.elicitations.declined++;
    return {action: 'decline'};
  };
  let session = null;
  const closeSession = async () => {
    const closing = session;
    session = null;
    try { return await closing.close(); } catch (error) { return {error: error.message}; }
  };
  try {
    const lane = await prepare();
    Object.assign(record, {expected: lane.expected, bundlePath: lane.bundlePath, selection: lane.selection});
    const run = cli ?? cuaCli(lane.serveEnv);
    const open = connect ?? (onServerRequest => openSession({args: [CUA, 'serve'], env: lane.serveEnv, clientName: 'cua-hosted-onboarding', onServerRequest}));
    const readStatus = () => { try { return statusFacts(run(['engine', 'status'])); } catch (error) { return {read: false, problem: error.message}; } };
    const readDoctor = () => {
      let result;
      try { result = run(['doctor']); } catch (error) { return {received: false, problem: error.message}; }
      const doctor = answerOf(result.stdout);
      return doctor && typeof doctor === 'object' ? {received: true, ...doctorFacts(doctor)} : {received: false, problem: `exit ${result.status}`};
    };
    // The rows before the first stage: the setup's (H0's set, every service).
    let previous = ALL, lastStatus = null;
    for (const stage of STAGES) {
      const entry = {id: stage.id, rows: {set: stage.rows, removed: null, granted: null, problem: null}, relaunch: {method: stage.relaunch}, relaunched: null, calls: [], status: null, doctor: null, problem: null, closed: null};
      record.stages.push(entry);
      const stop = why => { entry.problem = why; throw Object.assign(new Error(`${stage.id}: ${why}`), {recorded: true}); };
      log(`hosted-sittings: onboarding ${stage.id}: rows ${stage.rows.join(', ') || 'none'}, relaunch by ${stage.relaunch}`);
      if (stage.relaunch !== 'product' && session) entry.closed = await closeSession();
      // The rows first, then the relaunch (H0's order): removed where the stage has fewer than the setup's, added where it has more.
      try {
        const removing = previous.filter(key => !stage.rows.includes(key));
        const adding = stage.rows.filter(key => !previous.includes(key));
        if (removing.length) {
          const {decision, ...removed} = revoke({client: CLIENTS.engine, services: removing}, {env, platform, log});
          record.decision ??= decision;
          entry.rows.removed = removed;
          if (removed.remaining.length) entry.rows.problem = `rows still read back: ${removed.remaining.join(', ')}`;
        }
        if (adding.length) {
          const {decision, ...granted} = grant([{client: CLIENTS.engine, bundle: lane.bundlePath, services: adding}], {env, platform, log});
          record.decision ??= decision;
          entry.rows.granted = granted;
          if (granted.missing.length) entry.rows.problem = `rows not read back: ${granted.missing.join(', ')}`;
        }
      } catch (error) { entry.rows.problem = error.message; }
      if (entry.rows.problem) stop(entry.rows.problem);
      previous = stage.rows;
      if (stage.relaunch === 'engine stop') {
        const stopped = {ok: false, wasRunning: null, pid: null, code: null, attempts: 0};
        entry.relaunch.stop = stopped;
        while (stopped.attempts < STOP_ATTEMPTS) {
          stopped.attempts++;
          let answered;
          try { const result = run(['engine', 'stop']); answered = result.status === 0 ? answerOf(result.stdout) : answerOf(result.stdout) ?? {error: {code: `exit ${result.status}`}}; } catch (error) { answered = {error: {code: error.message}}; }
          if (answered?.ok === true) { Object.assign(stopped, {ok: true, wasRunning: answered.wasRunning === true, pid: integer(answered.pid)}); break; }
          stopped.code = answered?.error?.code ?? 'no answer';
          if (stopped.code !== 'engine_busy') break;
          if (stopped.attempts < STOP_ATTEMPTS) await sleep(STOP_RETRY_MS);
        }
        if (!stopped.ok) stop(`the engine could not be stopped for the stage's relaunch (${stopped.code})`);
        try {
          session = open(answer);
          await session.initialize();
        } catch (error) { stop(`the session could not be opened (${error.message})`); }
      } else {
        entry.relaunch.before = {pid: lastStatus?.pid ?? null, connections: lastStatus?.connections ?? null};
        await sleep(SETTLE_MS);
      }
      for (const call of CALLS) {
        const reply = await session.js(call.code, CALL_MS);
        const facts = callFacts(call.id, reply, lane.bundlePath);
        facts.statusAfter = readStatus();
        entry.calls.push(facts);
        log(`hosted-sittings: onboarding ${stage.id} ${call.id}: ${facts.waited ? 'no answer (a wait)' : facts.isError ? `refused (${facts.metadata.permission ?? facts.errorName ?? 'error'})` : 'answered'}`);
      }
      entry.status = entry.calls.at(-1).statusAfter;
      lastStatus = entry.status;
      const first = entry.calls[0].statusAfter.pid ?? null;
      const was = stage.relaunch === 'product' ? entry.relaunch.before.pid : entry.relaunch.stop.pid;
      entry.relaunched = first === null ? null : first !== was;
      entry.doctor = readDoctor();
    }
    record.complete = true;
  } catch (error) {
    record.problem = error.recorded ? error.message : `the driver stopped: ${error.message}`;
  } finally {
    if (session) await closeSession();
    record.finishedAt = new Date(now()).toISOString();
  }
  return record;
}
