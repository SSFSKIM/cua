// EngineInstall (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces "EngineInstall"; "Install,
// signing and permissions"; the Decision Log's "M1b pre-flight"): the one approved engine per Mac and the commands
// around it, `cua engine build|approve|status|stop`.
//
// The approved location is fixed, inside the default home and moved by no CUA_HOME: ~/Library/Application Support/cua/
// engine/, holding `cua Engine.app` with engine.sock, engine.lock, usage.json, pending.json and approved.json beside it,
// and the build's scratch, staging and previous bundle. Every session and harness serves the approved bundle in place;
// only buildEngine replaces it, and only approveEngine (with the owner at the console when a grant or a capture
// confirmation needs answering) writes approved.json. A bundle whose build or signature differs from approved.json's
// is pending, not installed.
//
// Nothing here ever signals the engine: it is stopped only by the `shutdown` request, which it refuses while another
// connection is open. The signing identity is never printed (pre-flight item 2): pending.json and approved.json hold
// it as device state, and everything returned or logged carries only the signature's kind and whether it matches the
// configured identity.
import {createConnection} from 'node:net';
import {chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fail} from './errors.mjs';
import {ENGINE_DIRECTORY_IN_HOME} from './layout.mjs';
import {BUNDLE_NAME, ENGINE_SOURCE, EXECUTABLE, assembleBundle, engineBuild, engineVersion} from './engine-bundle.mjs';
import {configuredIdentity, identityMatches, lastLines, readSignature, recordedIdentity, resolveSigningIdentity, runCommand, signBundle, sleepFor} from './engine-sign.mjs';
import {FrameDecoder, encodeFrame} from '../services/engine/protocol.mjs';
import {bundleIdentity} from '../services/engine/client.mjs';

const OPEN = '/usr/bin/open';
const BUILD_TIMEOUT_MS = 30 * 60_000;
const STOP_WAIT_MS = 10_000;
const LAUNCH_WAIT_MS = 15_000;
const GRANT_WAIT_MS = 15 * 60_000;
const POLL_MS = 250;
const CAPTURE_ALERT_GRACE_MS = 2_000;
const RPC_TIMEOUT_MS = {approve: 120_000, shutdown: 10_000};

export const engineDirectory = (userHome = homedir()) => join(userHome, ENGINE_DIRECTORY_IN_HOME);

export function enginePaths(dir = engineDirectory()) {
  return {
    dir,
    bundle: join(dir, BUNDLE_NAME),
    socket: join(dir, 'engine.sock'),
    pending: join(dir, 'pending.json'),
    approved: join(dir, 'approved.json'),
    staging: join(dir, 'staging'),
    previous: join(dir, 'previous'),
    scratch: join(dir, 'build'),
  };
}

const others = n => `${n} other connection${n === 1 ? '' : 's'}`;
export const shortBuild = build => String(build ?? 'none').slice(0, 12);
// An operator's answer that aborts ("n" or "no"); any other line, Enter included, confirms.
const isAbort = line => /^\s*no?\s*$/i.test(line);

// ---- the engine's wire ----

// One request on a connection of its own. -> {ok: true, result} | {ok: false, error} | {ok: false, unreachable: code}.
export function rpc(socket, method, params = {}, {timeoutMs = RPC_TIMEOUT_MS[method] ?? 5_000} = {}) {
  return new Promise(resolve => {
    const decoder = new FrameDecoder();
    let settled = false;
    let connected = false;
    const connection = createConnection(socket);
    const done = value => { if (settled) return; settled = true; clearTimeout(timer); connection.destroy(); resolve(value); };
    const timer = setTimeout(() => done({ok: false, error: {errorName: 'timeout', message: `no answer to ${method} within ${timeoutMs} ms`}}), timeoutMs);
    connection.on('connect', () => { connected = true; connection.write(encodeFrame({jsonrpc: '2.0', id: 1, method, params})); });
    connection.on('data', chunk => {
      let messages;
      try { messages = decoder.push(chunk); } catch (error) { done({ok: false, error: {errorName: 'transport', message: error.message}}); return; }
      const answer = messages.find(message => message?.id === 1);
      if (answer) done(answer.error ? {ok: false, error: answer.error} : {ok: true, result: answer.result});
    });
    connection.on('error', error => done(connected ? {ok: false, error: {errorName: 'transport', message: error.code ?? error.message}} : {ok: false, unreachable: error.code ?? 'error'}));
    connection.on('close', () => done(connected ? {ok: false, error: {errorName: 'transport', message: 'the engine closed the connection without answering'}} : {ok: false, unreachable: 'closed'}));
  });
}

// The deps every operation shares, with their defaults. `run` is async (swift, codesign's signing, launchctl, open);
// `runSync` is spawnSync-shaped (codesign's reading, which installedEngine needs synchronously).
function context({dir = engineDirectory(), env = process.env, run = runCommand, runSync, request = rpc, sleep = sleepFor, now = Date.now, log = () => {}, ...rest} = {}) {
  const paths = enginePaths(dir);
  return {...rest, paths, env, run, runSync, sleep, now, log, rpc: (method, params) => request(paths.socket, method, params)};
}

async function statusOf(ctx) {
  const answer = await ctx.rpc('status');
  if (answer.unreachable) return null;
  if (!answer.ok) fail('engine_unreadable', `the engine at ${ctx.paths.socket} did not answer status: ${answer.error?.message ?? 'no answer'}`);
  return answer.result;
}

async function poll(ctx, probe, timeoutMs) {
  for (const started = ctx.now(); ;) {
    const value = await probe();
    if (value) return value;
    if (ctx.now() - started >= timeoutMs) return null;
    await ctx.sleep(POLL_MS);
  }
}

const busy = (pid, n) => fail('engine_busy', `the engine (pid ${pid}) has ${others(n)} open`, {hint: 'it is serving a session; run this again once nothing uses it (the approved bundle and the running engine are untouched)'});

async function stop(ctx) {
  const status = await statusOf(ctx);
  if (!status) return {wasRunning: false};
  if (status.connections > 0) busy(status.pid, status.connections);
  const answer = await ctx.rpc('shutdown');
  if (!answer.ok && !answer.unreachable) {
    if (answer.error?.errorName === 'busy') busy(status.pid, answer.error.connections ?? 1);
    fail('engine_stop_failed', `the engine (pid ${status.pid}) refused shutdown: ${answer.error?.message ?? 'no answer'}`);
  }
  if (!await poll(ctx, async () => !(await statusOf(ctx)), STOP_WAIT_MS))
    fail('engine_stop_failed', `the engine (pid ${status.pid}) accepted shutdown but still answers after ${STOP_WAIT_MS / 1000} s`);
  return {wasRunning: true, pid: status.pid};
}

// Sends `shutdown` to the approved engine and waits for it to go; refuses, naming the count, while another connection
// is open. -> {wasRunning: false} | {wasRunning: true, pid}.
export async function stopEngine(deps) {
  return stop(context(deps));
}

// ---- the bundle and its records ----

const readJson = path => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const readRecord = path => {
  try { const value = readJson(path); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
};

function writeRecord(path, record) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', {mode: 0o600});
  renameSync(temporary, path);
}

// The bundle on disk: {exists, engineVersion, build, signature} (signature as readSignature's, internal: it carries the
// SHA-1 and the subject, which no caller prints).
function bundleOnDisk(bundle, runSync) {
  let identity;
  try { identity = bundleIdentity(bundle); } catch { return {exists: false}; }
  return {exists: true, ...identity, signature: readSignature(bundle, runSync ? {runSync} : {})};
}

const publicSignature = (signature, configured) => ({kind: signature?.kind ?? null, identityMatches: signature ? identityMatches(signature, configured) : null});
const approvedMatches = (onDisk, approved) => Boolean(onDisk.exists && approved && onDisk.build === approved.build && recordedIdentity(onDisk.signature) === approved.identity);

// The approved bundle, or null: the bundle at the approved location whose build and signature are approved.json's.
// Never throws: anything unreadable is "not installed".
export function installedEngine({dir = engineDirectory(), runSync} = {}) {
  const paths = enginePaths(dir);
  const approved = readRecord(paths.approved);
  if (!approved) return null;
  let onDisk;
  try { onDisk = bundleOnDisk(paths.bundle, runSync); } catch { return null; }
  if (!approvedMatches(onDisk, approved)) return null;
  return {bundlePath: paths.bundle, engineVersion: onDisk.engineVersion, build: onDisk.build, approvedAt: approved.approvedAt};
}

// The bundle, approved.json's and pending.json's state, and the running engine's status answer (null when none runs).
export async function engineStatus(deps) {
  const ctx = context(deps);
  const {paths} = ctx;
  const onDisk = bundleOnDisk(paths.bundle, ctx.runSync);
  const approved = readRecord(paths.approved);
  const pending = readRecord(paths.pending);
  const status = await statusOf(ctx);
  return {
    bundlePath: paths.bundle,
    exists: onDisk.exists,
    engineVersion: onDisk.engineVersion ?? null,
    build: onDisk.build ?? null,
    signature: publicSignature(onDisk.signature, configuredIdentity({env: ctx.env})),
    approved: approvedMatches(onDisk, approved),
    approvedBuild: approved?.build ?? null,
    approvedAt: approved?.approvedAt ?? null,
    pending: pending ? {build: pending.build ?? null, builtAt: pending.builtAt ?? null} : null,
    running: Boolean(status),
    status,
  };
}

// ---- buildEngine ----

const tail = text => lastLines(text, {count: 12, separator: '\n'});

// Builds, assembles and signs the engine in staging, then replaces the approved bundle: the running engine is stopped
// with `shutdown` first (a `busy` answer fails the build with the bundle, approved.json and the engine untouched and the
// staged bundle discarded), then the old bundle is moved aside and the staged one into place (two renames), and
// pending.json is written. A bundle whose build already matches and whose signature is the one asked for is left as it
// is. `identity`: 'adhoc', or undefined for the configured identity (an identity string is taken as given);
// `signOptions` reaches signBundle (its GUI-session job's uid, node, temp directory and bound).
// -> {bundlePath, engineVersion, build, signature: {kind, identityMatches}, changed, stopped: {pid} | null}.
export async function buildEngine({identity, scratchPath, sourceRoot = ENGINE_SOURCE, signOptions = {}, ...deps} = {}) {
  const ctx = context(deps);
  const {paths, log} = ctx;
  const adhoc = identity === 'adhoc';
  const wanted = adhoc ? null : identity ?? resolveSigningIdentity({env: ctx.env}).identity;
  const configured = adhoc ? configuredIdentity({env: ctx.env}) : wanted;
  const build = engineBuild({sourceRoot});
  const version = engineVersion(sourceRoot);

  const current = bundleOnDisk(paths.bundle, ctx.runSync);
  const signedAsAsked = signature => (adhoc ? signature?.kind === 'adhoc' : identityMatches(signature, wanted) === true);
  if (current.exists && current.build === build && signedAsAsked(current.signature)) {
    log(`cua's engine build ${shortBuild(build)} is already at ${paths.bundle}; nothing to do`);
    return {bundlePath: paths.bundle, engineVersion: current.engineVersion, build, signature: publicSignature(current.signature, configured), changed: false, stopped: null};
  }

  mkdirSync(paths.dir, {recursive: true, mode: 0o700});
  chmodSync(paths.dir, 0o700);
  const scratch = scratchPath ?? paths.scratch;
  log(`building cua's engine ${shortBuild(build)} (swift build -c release; the first build takes a few minutes)`);
  const compiled = await ctx.run('swift', ['build', '-c', 'release', '--package-path', sourceRoot, '--scratch-path', scratch], {timeout: BUILD_TIMEOUT_MS});
  if (compiled.code !== 0) {
    if (compiled.error === 'ENOENT') fail('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built', {hint: 'install Xcode (or its command line tools: xcode-select --install), then run cua engine build again'});
    fail('engine_build_failed', `swift build failed (exit ${compiled.code}):\n${tail(`${compiled.stdout}\n${compiled.stderr}`)}`, {hint: 'the approved bundle is unchanged'});
  }

  rmSync(paths.staging, {recursive: true, force: true});
  mkdirSync(paths.staging, {recursive: true, mode: 0o700});
  const staged = assembleBundle({executable: join(scratch, 'release', EXECUTABLE), out: paths.staging, version, build});
  let signature;
  let stopped;
  try {
    log(adhoc ? 'signing ad hoc' : 'signing with the configured identity');
    await signBundle(staged, {identity: adhoc ? 'adhoc' : identity, env: ctx.env, run: ctx.run, sleep: ctx.sleep, now: ctx.now, ...signOptions});
    signature = readSignature(staged, ctx.runSync ? {runSync: ctx.runSync} : {});
    if (!signature) fail('engine_sign_failed', 'the staged bundle reads as unsigned after signing');
    stopped = await stop(ctx);
    if (stopped.wasRunning) log(`stopped the running engine (pid ${stopped.pid})`);
  } catch (error) {
    rmSync(paths.staging, {recursive: true, force: true});
    throw error;
  }

  rmSync(paths.previous, {recursive: true, force: true});
  const hadBundle = existsSync(paths.bundle);
  if (hadBundle) renameSync(paths.bundle, paths.previous);
  try { renameSync(staged, paths.bundle); } catch (error) {
    if (hadBundle) renameSync(paths.previous, paths.bundle);
    throw error;
  }
  rmSync(paths.staging, {recursive: true, force: true});
  writeRecord(paths.pending, {build, identity: recordedIdentity(signature), builtAt: new Date(ctx.now()).toISOString()});
  log(`installed cua's engine ${shortBuild(build)} at ${paths.bundle}, pending approval (cua engine approve)`);
  return {bundlePath: paths.bundle, engineVersion: version, build, signature: publicSignature(signature, configured), changed: true, stopped: stopped.wasRunning ? {pid: stopped.pid} : null};
}

// ---- approveEngine ----

const GRANTS = [
  {key: 'accessibility', pane: 'Accessibility'},
  {key: 'screenRecording', pane: 'Screen & System Audio Recording'},
  {key: 'inputMonitoring', pane: 'Input Monitoring', note: 'the intervention tap\'s grant: without it the engine runs with intervention detection off and says so'},
];

const steps = (grant, bundle) => `cua Engine needs ${grant.pane}: at the console, open System Settings → Privacy & Security → ${grant.pane}, `
  + `click "+", press ⌘⇧G and enter ${bundle}, then switch it on${grant.note ? ` (${grant.note})` : ''}`;

function sameEngine(status, bundle, onDisk) {
  const real = path => { try { return realpathSync(path); } catch { return path; } };
  if (real(status.bundlePath) !== real(bundle))
    fail('engine_mismatch', `the engine answering beside ${bundle} runs from another copy (${status.bundlePath})`, {hint: 'stop it with cua engine stop, then approve again'});
  if (status.build !== onDisk.build)
    fail('engine_mismatch', `the running engine's build ${shortBuild(status.build)} is not the bundle's ${shortBuild(onDisk.build)}`, {hint: 'stop it with cua engine stop, then approve again'});
}

async function launch(ctx, {notPid = null} = {}) {
  const opened = await ctx.run(OPEN, ['-n', '-g', '-a', ctx.paths.bundle]);
  if (opened.code !== 0) fail('engine_launch_failed', `open -n -g -a ${ctx.paths.bundle} failed (exit ${opened.code}): ${tail(opened.stderr)}`);
  const status = await poll(ctx, async () => { const s = await statusOf(ctx); return s && s.pid !== notPid ? s : null; }, LAUNCH_WAIT_MS);
  if (!status) fail('engine_launch_failed', `the engine launched from ${ctx.paths.bundle} did not answer within ${LAUNCH_WAIT_MS / 1000} s`,
    {hint: 'it logs why it stopped: log show --last 10m --info --predicate \'subsystem == "io.github.ssfskim.cua.engine"\''});
  return status;
}

// Waits until every grant in `missing` reads true in the engine's status, or the operator answers at the terminal
// (Enter confirms, "n" aborts); bounded. With no terminal (end of input) no one can confirm, so it fails at once.
// -> 'status' | 'operator' | 'aborted'.
async function awaitGrants(ctx, missing) {
  let answer;
  let answered = false;
  const asked = ctx.operator.next().then(line => { answered = true; answer = line; });
  const pending = () => fail('engine_grant_pending', `${missing.map(grant => grant.pane).join(', ')} still reads false for cua Engine, and no one at this terminal confirmed it`,
    {hint: 'with the owner at the console, grant it by hand as the steps above say, then run cua engine approve again from a terminal'});
  for (const started = ctx.now(); ;) {
    const status = await statusOf(ctx);
    if (status && missing.every(grant => status[grant.key] === true)) return 'status';
    if (answered) return answer === null ? pending() : isAbort(answer) ? 'aborted' : 'operator';
    if (ctx.now() - started >= GRANT_WAIT_MS) pending();
    await Promise.race([ctx.sleep(POLL_MS), asked]);
  }
}

// One `approve` with replayd's log watched from before the request until a grace after its answer, since any approve
// whose grants read true takes the discarded capture (the first one too, after a same-identity rebuild). The watch never
// outlives this. -> {answer, alerts, unwatched}: unwatched when the request captured and the watch was not up for all of it.
async function watchedApprove(ctx) {
  const watch = ctx.watchCaptureAlerts();
  let ready = false;
  let answer;
  let stopped = {alerts: 0, intact: false};
  try {
    ready = await watch.ready;
    answer = await ctx.rpc('approve');
    if (ready) await ctx.sleep(CAPTURE_ALERT_GRACE_MS);
  } finally { stopped = await watch.stop(); }
  const captured = answer.ok && answer.result?.captured === true;
  return {answer, alerts: stopped.alerts, unwatched: captured && !(ready && stopped.intact)};
}

// The approve loop: refuses while another connection is open; `approve` (the grant requests, whose prompts may not
// appear for this engine); for each grant that reads false, the by-hand steps, then status polled until it reads true
// or the operator confirms at the terminal; `shutdown`, a relaunch with `open -n -g -a`, and `approve` again for the
// capture. Each approve whose grants read true takes one discarded capture, which raises a capture confirmation on a copy
// macOS has not seen, so replayd's log is watched around both (an SCAlert line, or a capture the watch missed, means the
// console may hold a confirmation: approved.json waits for the operator's word, and with no terminal the approve fails
// naming the console); on the relaunched engine's `captured: true`, approved.json {build, identity, approvedAt}.
// With every grant true and no confirmation it needs no one at the Mac. -> {approved, reason?, grants, build, approvedAt?, captureConfirmation}.
export async function approveEngine(deps) {
  const ctx = context({operator: {next: () => Promise.resolve(null)}, watchCaptureAlerts, ...deps});
  const {paths, log} = ctx;
  const onDisk = bundleOnDisk(paths.bundle, ctx.runSync);
  if (!onDisk.exists) fail('engine_not_built', `no engine bundle at ${paths.bundle}`, {hint: 'build it first: cua engine build'});
  const identity = recordedIdentity(onDisk.signature);
  if (!identity) fail('engine_not_built', `the bundle at ${paths.bundle} is not signed`, {hint: 'rebuild it: cua engine build'});

  let status = await statusOf(ctx);
  if (!status) {
    log('the engine is not running: launching it (open -n -g -a)');
    status = await launch(ctx);
  }
  sameEngine(status, paths.bundle, onDisk);
  if (status.connections > 0) fail('engine_busy', `the engine (pid ${status.pid}) has ${others(status.connections)} open; approve runs with no other client`, {hint: 'run it again once no session uses the engine'});

  const watched = [await watchedApprove(ctx)];
  const first = watched[0].answer;
  if (!first.ok) fail('engine_approve_failed', `approve failed: ${first.error?.message ?? first.unreachable}`);
  const afterRequest = await statusOf(ctx) ?? {};
  const grants = {accessibility: first.result.accessibility === true, screenRecording: first.result.screenRecording === true, inputMonitoring: afterRequest.inputMonitoring === true};
  const missing = GRANTS.filter(grant => !grants[grant.key]);
  if (missing.length) {
    for (const grant of missing) log(steps(grant, paths.bundle));
    log('Press Enter here once the owner has granted them (n to abort); the engine\'s status is polled meanwhile.');
    const outcome = await awaitGrants(ctx, missing);
    if (outcome === 'aborted') return {approved: false, reason: 'aborted at the terminal', grants, build: onDisk.build};
  }

  const stopped = await stop(ctx);
  log('relaunching the engine so it takes its grants (open -n -g -a)');
  const relaunched = await launch(ctx, {notPid: stopped.pid ?? null});
  sameEngine(relaunched, paths.bundle, onDisk);

  watched.push(await watchedApprove(ctx));
  const second = watched[1].answer;
  if (!second.ok) fail('engine_approve_failed', `approve after the relaunch failed: ${second.error?.message ?? second.unreachable}`);
  const final = {accessibility: second.result.accessibility === true, screenRecording: second.result.screenRecording === true, inputMonitoring: relaunched.inputMonitoring === true};
  if (second.result.captured !== true) {
    for (const grant of GRANTS.slice(0, 2).filter(grant => !final[grant.key])) log(steps(grant, paths.bundle));
    return {approved: false, reason: 'the relaunched engine did not report captured: true (a grant still reads false after the relaunch)', grants: final, build: onDisk.build};
  }

  const alerts = watched.reduce((sum, w) => sum + w.alerts, 0);
  const unwatched = watched.some(w => w.unwatched);
  let captureConfirmation = 'none';
  if (alerts > 0 || unwatched) {
    captureConfirmation = alerts > 0 ? 'answered' : 'unwatched';
    log(alerts > 0 ? 'replayd shows a screen capture confirmation for cua Engine on the console: the owner answers it (Allow).'
      : 'replayd\'s log could not be watched through a capture, so a screen capture confirmation may be on the console: the owner checks and answers it (Allow).');
    log('Press Enter here once it is answered (n to abort).');
    const line = await ctx.operator.next();
    if (line === null) fail('engine_capture_confirmation', 'a screen capture confirmation for cua Engine may be waiting on this Mac\'s console, and no one at this terminal confirmed it was answered',
      {hint: 'with the owner at the console, run cua engine approve again from a terminal; approved.json was not written'});
    if (isAbort(line)) return {approved: false, reason: 'aborted at the terminal', grants: final, build: onDisk.build, captureConfirmation};
  }
  const approvedAt = new Date(ctx.now()).toISOString();
  writeRecord(paths.approved, {build: onDisk.build, identity, approvedAt});
  log(`approved cua's engine ${shortBuild(onDisk.build)} (approved.json written)`);
  return {approved: true, grants: final, build: onDisk.build, approvedAt, captureConfirmation};
}

// ---- the operator and replayd's log ----

// Lines typed at `input` (stdin), one per question; null once it has ended (no terminal, or EOF). Each question
// discards lines typed before it and replaces a question left unanswered, so a stray Enter never answers a question
// no one has seen yet.
export function lineReader(input = process.stdin) {
  let ended = false;
  let waiting = null;
  const reader = createInterface({input, terminal: false});
  reader.on('line', line => { if (waiting) { const w = waiting; waiting = null; w(line); } });
  reader.on('close', () => { ended = true; if (waiting) { const w = waiting; waiting = null; w(null); } });
  return {
    next() {
      if (ended) return Promise.resolve(null);
      return new Promise(resolve => { waiting = resolve; });
    },
    close() { reader.close(); },
  };
}

// The SCAlert class's own lines (`+[SCAlert userAcknowledgementAlertWithBundleID:]`, the capture confirmation being
// shown, U8), not SCAlertStatsManager's bookkeeping, which replayd logs at every capture stream's start whether or
// not an alert follows (M1b.5, 2026-10-20).
const CAPTURE_ALERT_MARK = '[SCAlert ';
export const CAPTURE_ALERT_PREDICATE = `process == "replayd" AND eventMessage CONTAINS "${CAPTURE_ALERT_MARK}"`;

// Streams replayd's unified log for the SCAlert class's lines (its user-acknowledgement alert, the capture
// confirmation's signal, U8). Only a count leaves this function, never a line, so no other app's alert text is kept. `ready` resolves false
// when the stream cannot start; stop() answers {alerts, intact}, intact false when the stream ended on its own before
// it was stopped (a gap in the watch).
export function watchCaptureAlerts({spawnLog = () => spawn('/usr/bin/log', ['stream', '--style', 'ndjson', '--level', 'info', '--predicate', CAPTURE_ALERT_PREDICATE], {stdio: ['ignore', 'pipe', 'ignore']}), readyMs = 5_000} = {}) {
  let child;
  try { child = spawnLog(); } catch { return {ready: Promise.resolve(false), stop: async () => ({alerts: 0, intact: false})}; }
  let alerts = 0;
  let rest = '';
  let stopping = false;
  let intact = true;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const timer = setTimeout(() => resolveReady(false), readyMs);
  child.on('error', () => { intact = false; clearTimeout(timer); resolveReady(false); });
  child.on('exit', () => { if (!stopping) intact = false; clearTimeout(timer); resolveReady(false); });
  child.stdout.setEncoding('utf8').on('data', chunk => {
    clearTimeout(timer);
    resolveReady(true);
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (typeof event?.eventMessage === 'string' && event.eventMessage.includes(CAPTURE_ALERT_MARK)) alerts++;
    }
  });
  return {
    ready,
    stop: () => new Promise(resolve => {
      clearTimeout(timer);
      stopping = true;
      if (child.exitCode !== null || child.signalCode !== null) { resolve({alerts, intact}); return; }
      child.once('exit', () => resolve({alerts, intact}));
      child.kill('SIGTERM');
    }),
  };
}
