// EngineInstall (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces "EngineInstall"; "Install,
// signing and permissions"; the Decision Log's "M1b pre-flight"): the one approved engine per Mac and the commands
// around it, `cua engine build|approve|status|stop`.
//
// The approved location is fixed, inside the default home and moved by no CUA_HOME: ~/Library/Application Support/cua/
// engine/, holding `cua Engine.app` with engine.sock, engine.lock, usage.json, pending.json and approved.json beside it,
// the pending slot `pending/cua Engine.app`, promoting.json (the approve lock), and the build's scratch,
// staging and previous bundle. Every session and harness serves the bundle at the approved path in place. A build
// never takes away a working engine (design ruling 1118): buildEngine puts its bundle in the pending slot, leaving the
// approved bundle, approved.json and the running engine alone, and only approveEngine (with the owner at the console
// when a grant or a capture confirmation needs answering) promotes it into the approved path, puts the previous bundle
// back if the approval does not complete, and writes approved.json. A bundle whose build or signature differs from
// approved.json's is not installed.
//
// Nothing here ever signals the engine: it is stopped only by the `shutdown` request, which it refuses while another
// connection is open. The signing identity is never printed (pre-flight item 2): pending.json and approved.json hold
// it as device state, and everything returned or logged carries only the signature's kind and whether it matches the
// configured identity.
import {createConnection} from 'node:net';
import {chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {CuaError, fail} from './errors.mjs';
import {ENGINE_DIRECTORY_IN_HOME} from './layout.mjs';
import {BUNDLE_ID, BUNDLE_NAME, ENGINE_SOURCE, EXECUTABLE, assembleBundle, engineBuild, engineVersion} from './engine-bundle.mjs';
import {configuredIdentity, identityMatches, lastLines, readEngineSettings, readSignature, recordedIdentity, resolveSigningIdentity, runCommand, signatureReport, signBundle, sleepFor} from './engine-sign.mjs';
import {FrameDecoder, encodeFrame} from '../services/engine/protocol.mjs';
import {bundleIdentity, plistString} from '../services/engine/client.mjs';

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
    // The pending slot (design ruling 1118): a build waiting beside the approved bundle for `cua engine approve`.
    pendingDir: join(dir, 'pending'),
    pendingBundle: join(dir, 'pending', BUNDLE_NAME),
    // The approve lock, {pid} (takeApproveLock): one naming a process that is gone is an approve killed mid-way.
    promoting: join(dir, 'promoting.json'),
    approved: join(dir, 'approved.json'),
    staging: join(dir, 'staging'),
    previous: join(dir, 'previous'),
    scratch: join(dir, 'build'),
  };
}

// The other connections a status or a busy refusal counts, named by the holders the engine gives (#237): `pid 42091
// (MAWS)` each, the session's cursor label in brackets; an engine from before #237 gives none, and the count stands alone.
export function holdersText(holders) {
  if (!Array.isArray(holders) || !holders.length) return '';
  return holders.map(holder => {
    const pid = Number.isSafeInteger(holder?.pid) ? `pid ${holder.pid}` : 'a client of unknown pid';
    return typeof holder?.label === 'string' && holder.label ? `${pid} (${holder.label})` : pid;
  }).join(', ');
}
const others = (n, holders) => {
  const named = holdersText(holders);
  return `${n} other connection${n === 1 ? '' : 's'} open${named ? `: ${named}` : ''}`;
};
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

const busy = (pid, n, holders) => fail('engine_busy', `the engine (pid ${pid}) has ${others(n, holders)}`, {hint: 'it is serving a session; run this again once nothing uses it (the approved bundle and the running engine are untouched)'});

// `pid`, when given, is the engine the caller means: another one answering at the socket is left alone (engine_mismatch).
async function stop(ctx, {pid} = {}) {
  const status = await statusOf(ctx);
  if (!status) return {wasRunning: false};
  if (pid !== undefined && status.pid !== pid)
    fail('engine_mismatch', `another engine (pid ${status.pid}) answers at ${ctx.paths.socket} now, not pid ${pid}; it was left alone`);
  if (status.connections > 0) busy(status.pid, status.connections, status.holders);
  const answer = await ctx.rpc('shutdown');
  if (!answer.ok && !answer.unreachable) {
    if (answer.error?.errorName === 'busy') busy(status.pid, answer.error.connections ?? 1, answer.error.holders);
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

// Whether the bundle on disk is the one approved.json approves: true, false, or null (unknown) when the build is
// approved.json's and the answer turns on a signature codesign could not read. Gating takes only true (approvedMatches).
function approval(onDisk, approved) {
  if (!onDisk.exists || !approved || onDisk.build !== approved.build) return false;
  if (onDisk.signature?.kind === 'unreadable') return null;
  return recordedIdentity(onDisk.signature) === approved.identity;
}
const approvedMatches = (onDisk, approved) => approval(onDisk, approved) === true;

// The approved bundle, or null: the bundle at the approved location whose build and signature are approved.json's.
// Never throws: anything unreadable is "not installed".
export function installedEngine({dir = engineDirectory(), runSync} = {}) {
  const paths = enginePaths(dir);
  const approved = readRecord(paths.approved);
  if (!approved) return null;
  let onDisk;
  try { onDisk = bundleOnDisk(paths.bundle, runSync); } catch { return null; }
  return installedFrom({dir, onDisk, approved});
}

// The build in the pending slot, from its Info.plist alone (no codesign): {build, builtAt, bundlePath}, builtAt
// pending.json's when it names this build, else null; null when the slot holds no bundle.
function pendingSlot(paths) {
  let identity;
  try { identity = bundleIdentity(paths.pendingBundle); } catch { return null; }
  const record = readRecord(paths.pending);
  return {build: identity.build ?? null, builtAt: record?.build === identity.build ? record.builtAt ?? null : null, bundlePath: paths.pendingBundle};
}

// The approved location read once (the bundle on disk with its signature, which carries the SHA-1 and the subject and
// is never printed; approved.json's record; the pending slot's build), for a caller that needs both installedFrom's
// answer and inspectEngine's read with one codesign (doctor).
export function readApprovedLocation({dir = engineDirectory(), runSync} = {}) {
  const paths = enginePaths(dir);
  return {dir, onDisk: bundleOnDisk(paths.bundle, runSync), approved: readRecord(paths.approved), pending: pendingSlot(paths)};
}

// installedEngine's answer from a location already read.
export function installedFrom({dir, onDisk, approved}) {
  if (!approvedMatches(onDisk, approved)) return null;
  return {bundlePath: enginePaths(dir).bundle, engineVersion: onDisk.engineVersion, build: onDisk.build, approvedAt: approved.approvedAt};
}

// The bundle on disk with its signature, approved.json's record and the pending slot's build: `ctx.location` when the
// caller read it already (readApprovedLocation, for this same directory), else read here.
function bundleFacts(ctx) {
  if (ctx.location) return ctx.location;
  const {paths} = ctx;
  return {onDisk: bundleOnDisk(paths.bundle, ctx.runSync), approved: readRecord(paths.approved), pending: pendingSlot(paths)};
}

// The bundle, approved.json's state, the build pending beside it, and the running engine's status answer (null when
// none runs).
export async function engineStatus(deps) {
  const ctx = context(deps);
  return statusReport(ctx, bundleFacts(ctx), await statusOf(ctx));
}

function statusReport(ctx, {onDisk, approved, pending}, status) {
  const {paths} = ctx;
  return {
    bundlePath: paths.bundle,
    exists: onDisk.exists,
    engineVersion: onDisk.engineVersion ?? null,
    build: onDisk.build ?? null,
    signature: signatureReport(onDisk.signature, configuredIdentity({env: ctx.env})),
    approved: approval(onDisk, approved),
    approvedBuild: approved?.build ?? null,
    approvedAt: approved?.approvedAt ?? null,
    pending,
    running: Boolean(status),
    status,
    cursor: cursorSwitch(ctx, status),
  };
}

// The agent cursor's device switch (#235): the running engine's ('on' | 'off', null for an engine that has no cursor),
// else engine.json's as the engine would read it at its next launch (null when it could not start with the file).
function cursorSwitch(ctx, status) {
  if (status) return status.cursor === 'on' || status.cursor === 'off' ? status.cursor : null;
  let settings;
  try { settings = readEngineSettings({env: ctx.env}); } catch (error) { if (error instanceof CuaError) return null; throw error; }
  if (settings.cursor === undefined) return 'on';
  return typeof settings.cursor === 'boolean' ? (settings.cursor ? 'on' : 'off') : null;
}

// What `cua doctor`'s engine row reads (the Decision Log's "M3 pre-flight" item 1). An engine already answering at the
// socket is read and left alone. With none answering and the approved bundle installed (its build and signature
// approved.json's, and its bundle id cua's engine's), the bundle is launched as the launcher launches it (open -n -g -a),
// read, and sent `shutdown`; a session that connects in between makes the stop busy, and the engine is left running for
// it. A pending or unapproved bundle, one whose signature cannot be read, and any other app at the approved location
// (the harnesses' fixture approved engine, scripts/probe/fixture-engine.mjs) are never launched. Nothing here prompts or
// captures: the engine's start and its `status` do neither. Never throws for what it finds: a status read that fails
// is `statusError`, a launch or stop that fails is `launch.error`. `mayLaunch: false` reads without launching (doctor,
// when sessions would not use cua's engine).
// Only the instance launched here is ever stopped: `open` names no pid, so the engine that answers after the launch is
// taken as this launch's only when it runs this bundle at this build, and the stop is sent only while that same pid
// still answers. Anything else that took the socket (another copy, another build, another engine racing in) is reported
// as `launch.mismatch` or `launch.replaced` and left alone.
// -> engineStatus's report with `running` meaning an engine answered before this read, `status` the answer read (from
// that engine, or from the one launched here), `bundleId`, `statusError` (string | null), and `launch`: null when nothing
// was launched, else {pid, stopped: true} | {pid, stopped: false, leftRunning: true, detail} |
// {pid, stopped: false, mismatch: {bundlePath, build}} | {pid, stopped: false, replaced: true, detail} | {pid?, error}.
export async function inspectEngine({mayLaunch = true, ...deps} = {}) {
  const ctx = context(deps);
  const facts = bundleFacts(ctx);
  const read = async () => {
    try { return {status: await statusOf(ctx)}; } catch (error) {
      if (error?.code !== 'engine_unreadable') throw error;
      return {status: null, error: error.message};
    }
  };
  const before = await read();
  let {status} = before;
  let launched = null;
  const bundleId = bundleIdOf(ctx.paths.bundle);
  if (mayLaunch && !status && !before.error && bundleId === BUNDLE_ID && approval(facts.onDisk, facts.approved) === true) {
    launched = {};
    try { status = await launch(ctx); launched.pid = status.pid; } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      launched.error = error.message;
    }
    if (status && !runsBundle(status, ctx.paths.bundle, facts.onDisk.build)) {
      Object.assign(launched, {stopped: false, mismatch: {bundlePath: status.bundlePath ?? null, build: status.build ?? null}});
    } else if (status) {
      try { await stop(ctx, {pid: status.pid}); launched.stopped = true; } catch (error) {
        if (!(error instanceof CuaError)) throw error;
        launched.stopped = false;
        if (error.code === 'engine_busy') Object.assign(launched, {leftRunning: true, detail: error.message});
        else if (error.code === 'engine_mismatch') Object.assign(launched, {replaced: true, detail: error.message});
        else launched.error = error.message;
      }
    }
  }
  return {...statusReport(ctx, facts, status), running: Boolean(before.status), bundleId, statusError: before.error ?? null, launch: launched};
}

// Whether a status answer is the engine of `bundle` at `build` (its own report of where it runs from, as sameEngine).
function runsBundle(status, bundle, build) {
  const real = path => { try { return realpathSync(path); } catch { return path; } };
  return typeof status.bundlePath === 'string' && real(status.bundlePath) === real(bundle) && status.build === build;
}

function bundleIdOf(bundle) {
  try { return plistString(readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8'), 'CFBundleIdentifier'); } catch { return null; }
}

// The approved location's records as files only, with no codesign and no connection: whether a bundle is there,
// approved.json's build and time (never its identity), and the build pending beside it. What doctor says about an
// engine that is not selected.
export function engineRecords({dir = engineDirectory()} = {}) {
  const paths = enginePaths(dir);
  const approved = readRecord(paths.approved);
  return {
    bundlePath: paths.bundle,
    exists: existsSync(paths.bundle),
    approved: approved ? {build: approved.build ?? null, approvedAt: approved.approvedAt ?? null} : null,
    pending: pendingSlot(paths),
  };
}

// ---- buildEngine ----

const tail = text => lastLines(text, {count: 12, separator: '\n'});

// A failed build's detail: the first error block (20 lines from the first line naming an error or a failed assertion)
// and the last 12 lines, as one run when they meet and with the gap counted when they do not, each line cut at 300
// characters. A compiler crash prints its assertion before a long stack dump, which the tail alone lost.
const ERROR_LINE = /\berror:|fatal error|assertion\b.*\bfailed/i;
export function buildFailureDetail(text) {
  const lines = String(text ?? '').trim().split('\n').map(line => line.length > 300 ? `${line.slice(0, 299)}…` : line);
  const tailStart = Math.max(0, lines.length - 12);
  const first = lines.findIndex(line => ERROR_LINE.test(line));
  const blockEnd = first + 20;
  const kept = first === -1 || first >= tailStart ? lines.slice(tailStart)
    : blockEnd >= tailStart ? lines.slice(first)
    : [...lines.slice(first, blockEnd), `… (${tailStart - blockEnd} lines omitted)`, ...lines.slice(tailStart)];
  return kept.join('\n') || 'no detail';
}

// Builds, assembles and signs the engine in staging, then moves it into the pending slot beside the approved bundle
// (one rename, replacing an older pending build) and writes pending.json (design ruling 1118). The bundle at the
// approved path, approved.json and the running engine are never touched: no status, no shutdown, no swap, so a working
// engine keeps serving, a busy one does not block a build, and `cua engine approve` promotes the build when the owner
// is at the console. Nothing to do when the bundle at the approved path already is this build signed as asked (a copy
// of it pending beside it, same build and identity, is redundant and discarded; a different pending build is kept), or
// the pending slot already holds it. A promote cut short is recovered first (recoverInterruptedPromote). `identity`:
// 'adhoc', or undefined for the configured identity (an identity string is taken as given); `signOptions` reaches
// signBundle (its GUI-session job's uid, node, temp directory and bound).
// -> {bundlePath (where the build is), engineVersion, build, signature: {kind, identityMatches}, changed, pending}:
// `pending` true when the build waits in the slot for `cua engine approve`.
export async function buildEngine({identity, scratchPath, sourceRoot = ENGINE_SOURCE, signOptions = {}, ...deps} = {}) {
  const ctx = context(deps);
  const {paths, log} = ctx;
  const adhoc = identity === 'adhoc';
  const wanted = adhoc ? null : identity ?? resolveSigningIdentity({env: ctx.env}).identity;
  const configured = adhoc ? configuredIdentity({env: ctx.env}) : wanted;
  const build = engineBuild({sourceRoot});
  const version = engineVersion(sourceRoot);
  recoverInterruptedPromote(ctx);

  const signedAsAsked = signature => (adhoc ? signature?.kind === 'adhoc' : identityMatches(signature, wanted) === true);
  const current = bundleOnDisk(paths.bundle, ctx.runSync);
  if (current.exists && current.build === build && signedAsAsked(current.signature)) {
    const slot = pendingSlot(paths);
    if (slot) {
      const redundant = slot.build === build && recordedIdentity(bundleOnDisk(paths.pendingBundle, ctx.runSync).signature) === recordedIdentity(current.signature);
      if (redundant) {
        discardPending(paths);
        log('discarded the copy of this build pending beside it: the bundle at the approved path already is this build');
      } else log(`build ${shortBuild(slot.build)} is still pending beside it (cua engine approve to use it)`);
    }
    log(`cua's engine build ${shortBuild(build)} is already at ${paths.bundle}; nothing to do`);
    return {bundlePath: paths.bundle, engineVersion: current.engineVersion, build, signature: signatureReport(current.signature, configured), changed: false, pending: false};
  }
  const waiting = bundleOnDisk(paths.pendingBundle, ctx.runSync);
  if (waiting.exists && waiting.build === build && signedAsAsked(waiting.signature)) {
    log(`cua's engine build ${shortBuild(build)} is already pending at ${paths.pendingBundle}; nothing to do (cua engine approve to use it)`);
    return {bundlePath: paths.pendingBundle, engineVersion: waiting.engineVersion, build, signature: signatureReport(waiting.signature, configured), changed: false, pending: true};
  }

  mkdirSync(paths.dir, {recursive: true, mode: 0o700});
  chmodSync(paths.dir, 0o700);
  const scratch = scratchPath ?? paths.scratch;
  log(`building cua's engine ${shortBuild(build)} (swift build -c release; the first build takes a few minutes)`);
  const compiled = await ctx.run('swift', ['build', '-c', 'release', '--package-path', sourceRoot, '--scratch-path', scratch], {timeout: BUILD_TIMEOUT_MS});
  if (compiled.code !== 0) {
    if (compiled.error === 'ENOENT') fail('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built', {hint: 'install Xcode (or its command line tools: xcode-select --install), then run cua engine build again'});
    fail('engine_build_failed', `swift build failed (exit ${compiled.code}):\n${buildFailureDetail(`${compiled.stdout}\n${compiled.stderr}`)}`, {hint: 'the approved bundle is unchanged'});
  }

  rmSync(paths.staging, {recursive: true, force: true});
  mkdirSync(paths.staging, {recursive: true, mode: 0o700});
  const staged = assembleBundle({executable: join(scratch, 'release', EXECUTABLE), out: paths.staging, version, build});
  let signature;
  try {
    log(adhoc ? 'signing ad hoc' : 'signing with the configured identity');
    await signBundle(staged, {identity: adhoc ? 'adhoc' : identity, env: ctx.env, run: ctx.run, sleep: ctx.sleep, now: ctx.now, ...signOptions});
    signature = readSignature(staged, ctx.runSync ? {runSync: ctx.runSync} : {});
    if (!recordedIdentity(signature))
      fail('engine_sign_failed', signature ? `the staged bundle's signature could not be read after signing (${signature.reason})` : 'the staged bundle reads as unsigned after signing');
    discardPending(paths);
    mkdirSync(paths.pendingDir, {recursive: true, mode: 0o700});
    renameSync(staged, paths.pendingBundle);
  } finally {
    rmSync(paths.staging, {recursive: true, force: true});
  }
  writeRecord(paths.pending, {build, identity: recordedIdentity(signature), builtAt: new Date(ctx.now()).toISOString()});
  log(`built cua's engine ${shortBuild(build)} at ${paths.pendingBundle}, beside the approved bundle, which is unchanged: a new build is pending; cua engine approve to use it`);
  return {bundlePath: paths.pendingBundle, engineVersion: version, build, signature: signatureReport(signature, configured), changed: true, pending: true};
}

// The pending slot emptied: its bundle and pending.json.
function discardPending(paths) {
  rmSync(paths.pendingDir, {recursive: true, force: true});
  rmSync(paths.pending, {force: true});
}

// ---- approveEngine ----

const GRANTS = [
  {key: 'accessibility', pane: 'Accessibility'},
  {key: 'screenRecording', pane: 'Screen & System Audio Recording'},
  {key: 'inputMonitoring', pane: 'Input Monitoring', note: 'the intervention tap\'s grant: without it the engine runs with intervention detection off and says so'},
];

const steps = (grant, bundle) => `cua Engine needs ${grant.pane}: at the console, open System Settings → Privacy & Security → ${grant.pane}, `
  + `click "+", press ⌘⇧G and enter ${bundle}, then switch it on${grant.note ? ` (${grant.note})` : ''}`;
// The three grants and their by-hand steps, for doctor's engine row; the engine's permissionsPending sentences say the
// same words (native/engine Permissions.swift).
export {GRANTS as ENGINE_GRANTS, steps as grantSteps};

function sameEngine(status, bundle, onDisk) {
  const real = path => { try { return realpathSync(path); } catch { return path; } };
  if (real(status.bundlePath) !== real(bundle))
    fail('engine_mismatch', `the engine answering beside ${bundle} runs from another copy (${status.bundlePath})`, {hint: 'stop it with cua engine stop, then approve again'});
  if (status.build !== onDisk.build)
    fail('engine_mismatch', `the running engine's build ${shortBuild(status.build)} is not the bundle's ${shortBuild(onDisk.build)}`, {hint: 'stop it with cua engine stop, then approve again'});
}

// `foreground`: without -g, for the foreground approve alone (approveEngine's).
async function launch(ctx, {notPid = null, foreground = false} = {}) {
  const args = ['-n', ...(foreground ? [] : ['-g']), '-a', ctx.paths.bundle];
  const opened = await ctx.run(OPEN, args);
  if (opened.code !== 0) fail('engine_launch_failed', `open ${args.join(' ')} failed (exit ${opened.code}): ${tail(opened.stderr)}`);
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
    interrupted(ctx);
    const status = await statusOf(ctx);
    if (status && missing.every(grant => status[grant.key] === true)) return 'status';
    if (answered) return answer === null ? pending() : isAbort(answer) ? 'aborted' : 'operator';
    if (ctx.now() - started >= GRANT_WAIT_MS) pending();
    await Promise.race([ctx.sleep(POLL_MS), asked, ctx.whenInterrupted]);
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
// With every grant true and no confirmation it needs no one at the Mac. `foreground: true` (`cua engine approve
// --foreground`) is M4's opt-in lead for an owner at the console: the first approve, whose requests may prompt, goes to an
// engine launched in the foreground (`open -n -a`), replacing an idle matching engine already running, since a
// background LSUIElement launch has no window the prompt can attach to (the Design's U7). It promises no prompt, so the
// by-hand steps still lead; the post-grant relaunch and every other launch stay background.
// With a build pending beside the approved bundle (design ruling 1118), approve first promotes it: the running engine
// is stopped (refused while another connection is open), the approved bundle moved aside to `previous` and the pending
// one into the approved path; then the loop above runs on it. If that approval does not complete (it fails, the
// operator aborts, `signal` aborts it (Ctrl-C), or the relaunched engine captures nothing), the promote is rolled back
// (restore): approved.json unchanged, the previous bundle back at the approved path, the build pending again unless a
// newer build took the slot meanwhile. Once approved, only what this approve promoted is cleared: the slot's emptied
// directory, and pending.json while it still names this build. With no pending build, the loop runs on the bundle at
// the approved path, as before. Approval is exclusive (takeApproveLock, before the slot is read), and a promote an
// earlier approve left cut short is recovered first.
// -> {approved, reason?, grants, build, approvedAt?, captureConfirmation, rollback?: restore's answer}.
// `promote: false` approves only the bundle already at the approved path: a pending build, read under the lock, is
// refused (engine_pending_build) rather than promoted. `expectedBuild` refuses (engine_unexpected_build) a bundle at
// the approved path of another build, before anything is launched or prompted. Both are for a caller that must
// approve exactly the build it tested (acceptance item 14, scripts/accept/onboarding.mjs).
export async function approveEngine({foreground = false, signal, promote = true, expectedBuild = null, ...deps} = {}) {
  const ctx = context({operator: {next: () => Promise.resolve(null)}, watchCaptureAlerts, ...deps});
  ctx.signal = signal;
  ctx.whenInterrupted = new Promise(resolve => {
    if (!signal) return;
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', resolve, {once: true});
  });
  takeApproveLock(ctx);
  try { return await approveExclusively(ctx, {foreground, promotes: promote, expectedBuild}); } finally { rmSync(ctx.paths.promoting, {force: true}); }
}

// One approve holds promoting.json {pid}, created exclusively (O_EXCL), from before it reads the pending slot until it
// returns, so a second `cua engine approve` can neither approve a promoted bundle in place nor promote over the first's
// `previous`: it is refused, naming the first. A marker whose pid is gone is an approve killed mid-way: taken over
// (its promote, if cut short, is recovered next). Builds never take it.
function takeApproveLock(ctx) {
  const {paths, log} = ctx;
  mkdirSync(paths.dir, {recursive: true, mode: 0o700});
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(paths.promoting, JSON.stringify({pid: process.pid}) + '\n', {flag: 'wx', mode: 0o600});
      return;
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const holder = readRecord(paths.promoting)?.pid ?? null;
    if (attempt > 0 || alive(holder))
      fail('engine_approve_in_progress', `another cua engine approve (pid ${holder ?? 'unknown'}) is in progress on this Mac`,
        {hint: 'finish that one, or press Ctrl-C at its terminal (that puts the previous engine back), then run cua engine approve again'});
    log(`a cua engine approve (pid ${holder ?? 'unknown'}) ended without finishing; taking over from it`);
    rmSync(paths.promoting, {force: true});
  }
}

// approveEngine's body, under its lock.
async function approveExclusively(ctx, {foreground, promotes, expectedBuild}) {
  const {paths} = ctx;
  recoverInterruptedPromote(ctx, {lockHeld: true});
  const waiting = bundleOnDisk(paths.pendingBundle, ctx.runSync);
  if (waiting.exists && !promotes)
    fail('engine_pending_build', `build ${shortBuild(waiting.build)} is pending beside the approved engine, and this approve does not promote`,
      {hint: 'run cua engine approve to promote it, or remove it, then run this again'});
  if (!waiting.exists) return approveAtPath(ctx, {foreground, expectedBuild});
  signedIdentity(waiting, paths.pendingBundle);
  const promoted = await promote(ctx, waiting);
  let result;
  try { result = await approveAtPath(ctx, {foreground, expectedBuild}); } catch (error) {
    await restore(ctx, promoted);
    throw error;
  }
  if (!result.approved) return {...result, rollback: await restore(ctx, promoted)};
  try { rmdirSync(paths.pendingDir); } catch { /* a build published meanwhile is in it, or it is gone */ }
  if (readRecord(paths.pending)?.build === waiting.build) rmSync(paths.pending, {force: true});
  return result;
}

// Throws once `cua engine approve` is interrupted (its signal aborted): the promote's rollback runs as for any failure.
function interrupted(ctx) {
  if (ctx.signal?.aborted) fail('engine_approve_interrupted', 'cua engine approve was interrupted; approved.json was not written',
    {hint: 'run cua engine approve again, with the owner at the console'});
}

// The identity a bundle's signature records; refuses one whose signature cannot be read, or that is unsigned.
function signedIdentity(onDisk, bundle) {
  if (onDisk.signature?.kind === 'unreadable')
    fail('engine_signature_unreadable', `the signature of the bundle at ${bundle} could not be read (${onDisk.signature.reason}), so approve cannot tell which build and identity it would approve`,
      {hint: 'codesign may be blocked behind a prompt at the console: see to it there, then run cua engine approve again'});
  const identity = recordedIdentity(onDisk.signature);
  if (!identity) fail('engine_not_built', `the bundle at ${bundle} is not signed`, {hint: 'rebuild it: cua install --engine (or cua engine build)'});
  return identity;
}

// The pending build into the approved path: the running engine stopped first (busy refuses, nothing moved), the
// approved bundle to `previous`, the pending one into its place. -> {hadBundle, previousBuild, build}.
async function promote(ctx, waiting) {
  const {paths, log} = ctx;
  const stopped = await stop(ctx);
  if (stopped.wasRunning) log(`stopped the running engine (pid ${stopped.pid}) to put the pending build in place`);
  let previousBuild = null;
  try { previousBuild = bundleIdentity(paths.bundle).build ?? null; } catch { /* no bundle at the approved path */ }
  rmSync(paths.previous, {recursive: true, force: true});
  const hadBundle = existsSync(paths.bundle);
  if (hadBundle) renameSync(paths.bundle, paths.previous);
  try { renameSync(paths.pendingBundle, paths.bundle); } catch (error) {
    if (hadBundle) renameSync(paths.previous, paths.bundle);
    throw error;
  }
  log(`promoted the pending build ${shortBuild(waiting.build)} into ${paths.bundle}${hadBundle ? ` (build ${shortBuild(previousBuild)} kept aside until this approval completes)` : ''}`);
  return {hadBundle, previousBuild, build: waiting.build};
}

// The bundles of a promote put back, the approved one first whatever else fails: the bundle at the approved path is
// moved out of the way to a name of this process's, `previous` back into the approved path, and only then the moved
// bundle into the pending slot if the slot is free; a build published there meanwhile keeps it, and the moved one is
// dropped. Files only. -> {previousRestored, pendingAgain: true | false (dropped) | null (nothing was at the path)}.
function putBack(paths, {hadPrevious}) {
  const moved = join(paths.dir, `promoted.${process.pid}`);
  const hadCandidate = existsSync(paths.bundle);
  if (hadCandidate) {
    rmSync(moved, {recursive: true, force: true});
    renameSync(paths.bundle, moved);
  }
  if (hadPrevious) renameSync(paths.previous, paths.bundle);
  if (!hadCandidate) return {previousRestored: hadPrevious, pendingAgain: null};
  let pendingAgain = false;
  if (!existsSync(paths.pendingBundle)) {
    try {
      mkdirSync(paths.pendingDir, {recursive: true, mode: 0o700});
      renameSync(moved, paths.pendingBundle);
      pendingAgain = true;
    } catch { /* the slot taken meanwhile */ }
  }
  if (!pendingAgain) rmSync(moved, {recursive: true, force: true});
  return {previousRestored: hadPrevious, pendingAgain};
}

// Whether a process with this pid is alive (one of another user's counts).
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// A promote cut short (the process killed between its renames, or during the approval after it): `previous` is the
// approved bundle while the approved path holds another bundle or none, judged by build and signature as approval()
// judges (a re-signed copy of the same build is another bundle), and no live approve holds the lock (promoting.json
// absent, or naming a pid that is gone; `lockHeld` when the caller holds it). The approved bundle is put back
// (putBack), so a kill -9 never leaves the Mac without its approved engine past the next approve or build. Files only:
// an engine still running from the moved bundle is left alone (approve's promote stops it; a session refuses its
// build). The build-only check comes first, so the usual case reads no signature. -> whether there was one to recover.
function recoverInterruptedPromote(ctx, {lockHeld = false} = {}) {
  const {paths, log} = ctx;
  const approved = readRecord(paths.approved);
  const buildAt = path => { try { return bundleIdentity(path).build ?? null; } catch { return null; } };
  if (!approved?.build || buildAt(paths.previous) !== approved.build) return false;
  if (!lockHeld && alive(readRecord(paths.promoting)?.pid)) return false;
  if (approval(bundleOnDisk(paths.previous, ctx.runSync), approved) !== true) return false;
  if (approval(bundleOnDisk(paths.bundle, ctx.runSync), approved) !== false) return false;
  const candidate = buildAt(paths.bundle);
  const {pendingAgain} = putBack(paths, {hadPrevious: true});
  log(`recovered an interrupted promote: the approved build ${shortBuild(approved.build)} is back at ${paths.bundle}`
    + (candidate === null ? '' : pendingAgain ? `, and build ${shortBuild(candidate)} is pending again` : `; build ${shortBuild(candidate)} was dropped, since a newer build holds the pending slot`));
  return true;
}

// promote undone: the promoted engine stopped if it runs, then the bundles put back (putBack) either way.
// A promoted engine that refuses the stop (a session connected to it) still runs from the moved bundle and holds the
// engine's socket, so sessions refuse its build and launch nothing until it stops: that is reported, not hidden.
// -> {previousRestored, pendingAgain, candidateRunning: {pid} | null}.
async function restore(ctx, {hadBundle, previousBuild, build}) {
  const {paths, log} = ctx;
  let candidateRunning = null;
  try { await stop(ctx); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    let pid = null;
    try { pid = (await statusOf(ctx))?.pid ?? null; } catch { /* unreadable: the pid stays unknown */ }
    candidateRunning = {pid};
    log(`could not stop the promoted engine: ${error.message}`);
  }
  const {previousRestored, pendingAgain} = putBack(paths, {hadPrevious: hadBundle});
  const where = previousRestored ? `the approved build ${shortBuild(previousBuild)} is back at ${paths.bundle}` : 'no approved engine was in place before it';
  const slot = pendingAgain === null ? null : pendingAgain ? `build ${shortBuild(build)} is pending again (cua engine approve to retry)`
    : `build ${shortBuild(build)} was dropped, since a build published meanwhile holds the pending slot`;
  log(`rolled the promote back: ${where}${slot ? `; ${slot}` : ''}`);
  if (candidateRunning) log(candidateRunningText(candidateRunning));
  return {previousRestored, pendingAgain, candidateRunning};
}

// The promoted engine still running after the rollback, in the owner's words.
export const candidateRunningText = ({pid}) => `the promoted build's engine (${pid === null ? 'pid unknown' : `pid ${pid}`}) still runs and holds the engine's socket, `
  + 'so sessions refuse its build until it stops: run cua engine stop once it is idle, and the next session launches the bundle now at the approved path';

// The approve loop on the bundle at the approved path.
async function approveAtPath(ctx, {foreground, expectedBuild = null}) {
  const {paths, log} = ctx;
  const onDisk = bundleOnDisk(paths.bundle, ctx.runSync);
  if (!onDisk.exists) fail('engine_not_built', `no engine bundle at ${paths.bundle}`, {hint: 'build it first: cua install --engine (or cua engine build)'});
  if (expectedBuild && onDisk.build !== expectedBuild)
    fail('engine_unexpected_build', `the bundle at ${paths.bundle} is build ${shortBuild(onDisk.build)}, not the expected ${shortBuild(expectedBuild)}`, {hint: 'approve the expected build, or build it first'});
  const identity = signedIdentity(onDisk, paths.bundle);

  let status = await statusOf(ctx);
  if (status && foreground) {
    sameEngine(status, paths.bundle, onDisk);
    const stopped = await stop(ctx, {pid: status.pid});
    log('foreground approve: relaunching the idle engine in the foreground (open -n -a)');
    status = await launch(ctx, {notPid: stopped.pid ?? null, foreground: true});
  } else if (!status) {
    log(`the engine is not running: launching it (open -n ${foreground ? '' : '-g '}-a)`);
    status = await launch(ctx, {foreground});
  }
  interrupted(ctx);
  sameEngine(status, paths.bundle, onDisk);
  if (status.connections > 0) fail('engine_busy', `the engine (pid ${status.pid}) has ${others(status.connections, status.holders)}; approve runs with no other client`, {hint: 'run it again once no session uses the engine'});

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

  interrupted(ctx);
  const stopped = await stop(ctx);
  log('relaunching the engine so it takes its grants (open -n -g -a)');
  const relaunched = await launch(ctx, {notPid: stopped.pid ?? null});
  interrupted(ctx);
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
    const line = await Promise.race([ctx.operator.next(), ctx.whenInterrupted]);
    interrupted(ctx);
    if (line === null) fail('engine_capture_confirmation', 'a screen capture confirmation for cua Engine may be waiting on this Mac\'s console, and no one at this terminal confirmed it was answered',
      {hint: 'with the owner at the console, run cua engine approve again from a terminal; approved.json was not written'});
    if (isAbort(line)) return {approved: false, reason: 'aborted at the terminal', grants: final, build: onDisk.build, captureConfirmation};
  }
  interrupted(ctx);
  const approvedAt = new Date(ctx.now()).toISOString();
  writeRecord(paths.approved, {build: onDisk.build, identity, approvedAt});
  log(`approved cua's engine ${shortBuild(onDisk.build)} (approved.json written)`);
  return {approved: true, grants: final, build: onDisk.build, approvedAt, captureConfirmation};
}

// ---- the operator and replayd's log ----

// Lines typed at `input` (stdin), one per question; null once it has ended (no terminal, or EOF). Each question
// discards lines typed before it and replaces a question left unanswered, so a stray Enter never answers a question
// no one has seen yet. `onInterrupt` hears the reader's own SIGINT (Ctrl-C read from the input itself).
export function lineReader(input = process.stdin, {onInterrupt} = {}) {
  let ended = false;
  let waiting = null;
  const reader = createInterface({input, terminal: false});
  if (onInterrupt) reader.on('SIGINT', onInterrupt);
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
