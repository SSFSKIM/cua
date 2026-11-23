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
//                    this connection, which owes one relaunch at the next observation (src/services/engine/client.mjs).
//                    TextEdit is activated first; then the engine's pid and connections are read as the baseline (as
//                    accept-native item 14 reads them, scripts/accept/onboarding.mjs 'pre-relaunch'), then, after only
//                    the status socket's allowance, the engine's processes are listed (no socket) just before the retry
//                    is sent, and the engine's pid and connections read right after it: the judge compares the
//                    replacement with the engine that refused, and an engine or a client arriving in between is seen
//   full             Input Monitoring and post events added last, so the run ends with H0's row set, the setup's;
//                    `cua engine stop`, a fresh session
// At each: a bind of TextEdit (an observation, which checks Accessibility first) and a bind then a capture (the capture
// needs Screen Recording; in a stage without the grants it fails at the bind), the engine's status read after each (the
// capabilities and the pid that tells a relaunch), then doctor. Recorded per call: the answer's allowlisted facts
// (scripts/accept/onboarding.mjs replyFacts), its cua/permission, its cua/nativeEngine attestation, whether a refusal
// carries the grant's steps and the approved bundle's path (permissionGuidance), and the error's text (a runner holds no
// owner content).
//
// Rulings 1136 and 1141 around every cell (replayd's capture alert may stay up on a runner, and a window capture can
// succeed behind it): TextEdit is activated and must take front and key first, or the cell is not sent; front and key
// are read before and after it (`frontKey`, with scripts/probe/approval-cycles.mjs screenState's reading of a system
// prompt), and the judge makes a failed activation, an alert or an unread sample NO VERDICT.
//
// It never writes an operator's confirmation: it runs no `cua engine approve`, every CLI it runs has its input closed (a
// product that waits for an operator reads end of input), and it declines every elicitation but the bound app's
// approval, which a client answers (the hosted harnesses' rule, pre-flight item 2). A call the product holds is a wait,
// in either form: the own host's deadline reply (TIMEOUT_SENTENCE: the execution timed out and the kernel was reset, so
// the session is still sound) or no answer at the transport, after which the session is uncertain and nothing more is
// sent on it; the run goes on to the next stage. A stage whose rows, relaunch or session cannot be set stops the run,
// recorded. The record is saved (`save`) after every stage and before cleanup, and every close is bounded and ends in the
// session's disposal (disposeSession), so a cleanup that never ends loses nothing and leaves no child behind; every
// subprocess it starts has its own timeout. Refuses off a GitHub-hosted macOS runner before anything else.
import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {TIMEOUT_SENTENCE} from '../../src/repl-host/supervisor.mjs';
import {FRONT_WINDOW_SCRIPT, localFrontmost} from '../accept/key-guard.mjs';
import {TEXTEDIT_BUNDLE} from '../accept/lib.mjs';
import {openSession, resultText} from '../accept/mcp-session.mjs';
import {doctorFacts, permissionGuidance, replyFacts} from '../accept/onboarding.mjs';
import {ALERT_APPS, screenState} from '../probe/approval-cycles.mjs';
import {isAppApproval, lsappinfoPid} from '../probe/lib.mjs';
import {pinLane, selectLane} from '../probe/pinned-engine.mjs';
import {assertGithubHosted} from './runner.mjs';
import {CLIENTS, grantRows, revokeRows, SERVICES} from './tcc.mjs';

const CUA = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
export const CALL_MS = 60_000;
// `cua engine stop` refused while a closed session's connection is still counted: retried this often, a second apart.
const STOP_ATTEMPTS = 5;
const STOP_RETRY_MS = 1_000;
// Before the product's own relaunch: the stage before's status and doctor connections closed at the engine, which
// refuses the relaunch's shutdown while another client is connected (client.mjs: the observation then fails with no
// relaunch). SOCKET_CLOSE_MS: the one allowance after the baseline's own status read, for its socket to close.
const SETTLE_MS = 1_000;
const SOCKET_CLOSE_MS = 1_000;
// A session's close (end_task, then the server's exit) bounded; past it, or after it, the session is disposed (SIGKILL,
// its pipes destroyed), and the kill's own wait for the exit bounded too: a teardown that never ends is recorded and left.
const CLOSE_MS = 30_000;
const KILL_WAIT_MS = 5_000;
// The activate step's own check: re-read this often, half a second apart, until TextEdit is front and key.
const ACTIVATE_READS = 6;
const ACTIVATE_RETRY_MS = 500;

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

// One call's record: the allowlisted facts, the attestation, the refusal's guidance for the grant it names, the error's
// text. A wait in either form (the own host's deadline reply, or no answer at the transport) is `waited`, never a refusal.
function callFacts(id, reply, bundlePath) {
  const facts = replyFacts(reply);
  const meta = reply?.result?._meta ?? {};
  const attested = meta['cua/nativeEngine'];
  const data = payloadOf(reply);
  const deadline = facts.isError === true && resultText(reply).includes(TIMEOUT_SENTENCE);
  const waitedBy = reply?.timedOut === true ? 'transport' : deadline ? 'product deadline' : null;
  const permission = facts.metadata.permission;
  return {id, sent: true, skipped: null, ...facts, ...(waitedBy ? {completion: 'timeout'} : {}), waited: waitedBy !== null, waitedBy,
    bound: data?.bound === true ? true : null,
    nativeEngine: attested && typeof attested === 'object' ? {engine: text(attested.engine), version: text(attested.version), build: text(attested.build)} : null,
    errorName: text(meta['cua/errorName']),
    guidance: !waitedBy && (permission === 'accessibility' || permission === 'screenRecording') ? permissionGuidance(reply, {permission, bundlePath}) : null,
    errorText: facts.isError ? resultText(reply).slice(0, 600) : reply?.error ? String(reply.error.message ?? '').slice(0, 600) : null};
}
// A cell not sent (its activation did not take, or its session is uncertain): the same fields, nothing answered.
const unsent = (id, skipped) => ({...callFacts(id, {}, null), sent: false, skipped, completion: 'not sent', resultPresent: false});

// The screen as one sample, for the activate check and the readings around a cell: the frontmost app, the owner of the
// top on-screen window (the key's proxy, as #216's witness reads it, scripts/approval-cycles.mjs), the system prompts'
// pids, TextEdit's pid. The FrontWindowProbe is compiled once (interpreted when swiftc fails). -> {activate(), sample()}.
function localScreen() {
  let probe = null;
  const front = () => {
    if (probe === null) {
      const binary = join(mkdtempSync(join(tmpdir(), 'cua-onboarding-')), 'front-window');
      probe = spawnSync('/usr/bin/swiftc', ['-O', '-o', binary, FRONT_WINDOW_SCRIPT], {encoding: 'utf8', timeout: 300_000}).status === 0 ? [binary, []] : ['/usr/bin/swift', [FRONT_WINDOW_SCRIPT]];
    }
    try { return JSON.parse(spawnSync(probe[0], [...probe[1], 'front'], {encoding: 'utf8', timeout: 120_000}).stdout); } catch { return null; }
  };
  const pidOf = bundle => lsappinfoPid(spawnSync('/usr/bin/lsappinfo', ['info', '-only', 'pid', '-app', bundle], {encoding: 'utf8', timeout: 5_000}).stdout ?? '');
  return {
    activate: () => { spawnSync('/usr/bin/open', ['-b', TEXTEDIT_BUNDLE], {timeout: 15_000}); },
    sample: () => ({front: localFrontmost(), keyOwnerPid: integer(front()?.topWindow?.ownerPid), appPid: pidOf(TEXTEDIT_BUNDLE), alertPids: ALERT_APPS.map(pidOf).filter(pid => pid !== null)}),
  };
}
// A sample as the record keeps it: front, the key's owner and screenState's reading ('clear', 'alert' or 'unread').
const reading = sample => ({front: text(sample?.front), keyOwnerPid: integer(sample?.keyOwnerPid), state: screenState(sample)});
const tookFrontKey = sample => ({front: sample?.front === TEXTEDIT_BUNDLE, key: integer(sample?.keyOwnerPid) !== null && sample.keyOwnerPid === sample.appPid});

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

// The running processes of the approved engine's bundle, listed without a socket to it (pgrep). -> [pid], or null unread.
function enginePidsOf(bundlePath) {
  const listed = spawnSync('/usr/bin/pgrep', ['-f', `${bundlePath}/Contents/MacOS/`], {encoding: 'utf8', timeout: 5_000});
  if (listed.error || (listed.status !== 0 && listed.status !== 1)) return null;
  return listed.stdout.split('\n').filter(line => line.trim()).map(Number).filter(Number.isSafeInteger);
}

// A session's teardown, owning its deadline through the escalation: the close (end_task, then EOF and SIGTERM) raced
// against `closeMs`, then, whichever won, the session disposed (scripts/accept/mcp-session.mjs dispose: SIGKILL if it
// still runs, every pending request settled, its pipes destroyed, the child unreferenced) and its exit awaited for
// `killWaitMs` at most. -> the close's result, `stuck` with its detail when it did not end in time, `disposed`, and
// whether the child was seen to exit.
export async function disposeSession(session, {closeMs = CLOSE_MS, killWaitMs = KILL_WAIT_MS} = {}) {
  const within = async (work, ms, late) => {
    let timer;
    const bound = new Promise(resolve => { timer = setTimeout(() => resolve(late), ms); });
    try { return await Promise.race([Promise.resolve().then(work), bound]); } finally { clearTimeout(timer); }
  };
  let closed;
  try { closed = await within(() => session.close(), closeMs, {stuck: true, detail: `no close within ${closeMs} ms`}); } catch (error) { closed = {error: error.message}; }
  if (typeof session.dispose !== 'function') return closed;
  let exit = null;
  try { exit = await within(() => session.dispose(), killWaitMs, null); } catch { /* recorded as not seen to exit */ }
  return {...closed, disposed: true, exited: isObject(exit)};
}
const isObject = value => value !== null && typeof value === 'object';

const ABANDONED = 'the session was abandoned after a call with no answer';

// deps: {env, platform, prepare() -> {serveEnv, expected, bundlePath, selection}, grant (./tcc.mjs grantRows), revoke
// (revokeRows), cli(args) (cuaCli's, over the lane's serveEnv by default), connect(onServerRequest) -> {initialize, js(code,
// ms), close, dispose?}, screen {activate(), sample()} (localScreen's), enginePids(bundlePath) (enginePidsOf), save(record)
// (after every stage, before cleanup and after it), closeMs, sleep(ms), now, log}. -> the record: {kind, hosted, startedAt,
// finishedAt, complete, problem, app, expected, bundlePath, selection, decision, elicitations: {accepted, declined},
// cleanup, stages: [{id, rows, relaunch, relaunched, calls, status, doctor, problem, closed}]}.
export async function runOnboarding({env = process.env, platform = process.platform, prepare = async () => prepareLane(env), grant = grantRows, revoke = revokeRows,
  cli = null, connect = null, screen = null, enginePids = enginePidsOf, save = () => {}, closeMs = CLOSE_MS, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the staged onboarding');
  const record = {kind: 'hosted-onboarding', hosted: true, startedAt: new Date(now()).toISOString(), finishedAt: null, complete: false, problem: null,
    app: TEXTEDIT_BUNDLE, expected: null, bundlePath: null, selection: null, decision: null, elicitations: {accepted: 0, declined: 0}, cleanup: null, stages: []};
  const keep = () => { try { save(record); } catch (error) { log(`hosted-sittings: onboarding: the record could not be saved (${error.message})`); } };
  const answer = msg => {
    if (isAppApproval(msg, TEXTEDIT_BUNDLE)) { record.elicitations.accepted++; return {action: 'accept', content: {}}; }
    record.elicitations.declined++;
    return {action: 'decline'};
  };
  // The session, and whether it may still be used (not after a call with no answer at the transport: it may still run).
  let session = null, uncertain = false;
  const closeSession = async () => {
    const closing = session;
    session = null;
    uncertain = false;
    return disposeSession(closing, {closeMs});
  };
  const sc = screen ?? localScreen();
  // The activate step and its own check (ruling 1141): TextEdit brought forward, then read until it is front and key.
  const activateApp = async () => {
    sc.activate();
    let sample;
    for (let i = 0; i < ACTIVATE_READS; i++) {
      sample = sc.sample();
      const took = tookFrontKey(sample);
      if (took.front && took.key) break;
      if (i < ACTIVATE_READS - 1) await sleep(ACTIVATE_RETRY_MS);
    }
    return {sample, activate: {app: TEXTEDIT_BUNDLE, ...tookFrontKey(sample)}};
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
    let previous = ALL, prior = null;
    for (const stage of STAGES) {
      const entry = {id: stage.id, rows: {set: stage.rows, removed: null, granted: null, problem: null}, relaunch: {method: stage.relaunch}, relaunched: null, calls: [], status: null, doctor: null, problem: null, closed: null};
      record.stages.push(entry);
      const stop = why => { entry.problem = why; throw Object.assign(new Error(`${stage.id}: ${why}`), {recorded: true}); };
      log(`hosted-sittings: onboarding ${stage.id}: rows ${stage.rows.join(', ') || 'none'}, relaunch by ${stage.relaunch}`);
      const abandoned = uncertain;
      if (stage.relaunch !== 'product' && session) entry.closed = await closeSession();
      // The rows first, then the relaunch (H0's order): removed where the stage has fewer than the stage before, added where it has more.
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
      } else if (!session || abandoned) {
        // The product's relaunch is owed on the stage before's connection only: without it this stage cannot be set. Its
        // rows stay written, so the stage after builds on them.
        entry.problem = `the session of the stage before was ${abandoned ? 'abandoned after a call with no answer' : 'closed'}`;
        log(`hosted-sittings: onboarding ${stage.id}: not set (${entry.problem})`);
        keep();
        continue;
      } else {
        // The engine that refused Screen Recording last on this connection; the stage before's status and doctor
        // connections given time to close. The baseline is read at the retry itself (the first cell, below).
        const refusing = prior?.calls?.filter(c => c.sent).at(-1);
        entry.relaunch.refusedBy = refusing?.isError === true && refusing.metadata?.permission === 'screenRecording' ? refusing.statusAfter?.pid ?? null : null;
        entry.relaunch.before = null;
        entry.relaunch.atDispatch = null;
        await sleep(SETTLE_MS);
      }
      for (const [index, call] of CALLS.entries()) {
        let facts;
        if (uncertain) facts = {...unsent(call.id, ABANDONED), frontKey: null};
        else {
          const {sample, activate} = await activateApp();
          if (!activate.front || !activate.key) facts = {...unsent(call.id, 'activation'), frontKey: {activate, before: reading(sample), after: null}};
          else {
            if (stage.relaunch === 'product' && index === 0) {
              // The retry bracketed: TextEdit already front and key, the baseline read, only its socket's allowance, the
              // engine's processes listed (no socket) as the cell is sent, its pid and connections read right after.
              const before = readStatus();
              entry.relaunch.before = {pid: before.pid ?? null, connections: before.connections ?? null};
              await sleep(SOCKET_CLOSE_MS);
              entry.relaunch.atDispatch = {pids: enginePids(lane.bundlePath)};
            }
            const reply = await session.js(call.code, CALL_MS);
            facts = {...callFacts(call.id, reply, lane.bundlePath), frontKey: {activate, before: reading(sample), after: reading(sc.sample())}};
            if (facts.waitedBy === 'transport') uncertain = true;
          }
        }
        facts.statusAfter = readStatus();
        entry.calls.push(facts);
        log(`hosted-sittings: onboarding ${stage.id} ${call.id}: ${!facts.sent ? `not sent (${facts.skipped})` : facts.waited ? `no answer (a wait: ${facts.waitedBy})` : facts.isError ? `refused (${facts.metadata.permission ?? facts.errorName ?? 'error'})` : 'answered'}`);
      }
      entry.status = entry.calls.at(-1).statusAfter;
      // The product's relaunch is told by the retry's own status, never the second cell's (unread is unread); a
      // `cua engine stop` relaunch by the stage's first pid read.
      const first = stage.relaunch === 'product' ? integer(entry.calls[0].statusAfter.pid) : entry.calls.map(c => c.statusAfter.pid).find(pid => Number.isSafeInteger(pid)) ?? null;
      const was = stage.relaunch === 'product' ? entry.relaunch.before?.pid ?? null : entry.relaunch.stop.pid;
      entry.relaunched = first === null || (stage.relaunch === 'product' && was === null) ? null : first !== was;
      entry.doctor = readDoctor();
      prior = entry;
      keep();
    }
    record.complete = true;
  } catch (error) {
    record.problem = error.recorded ? error.message : `the driver stopped: ${error.message}`;
  }
  // Saved before cleanup, so a cleanup that never ends loses nothing; then the cleanup, bounded, and saved again.
  keep();
  record.cleanup = session ? await closeSession() : {closed: 'no session open'};
  record.finishedAt = new Date(now()).toISOString();
  keep();
  return record;
}
